#!/usr/bin/env python3
"""Run the chase-cam 3D sim headlessly and log every player's position.

The sim page (public/chase-cam/index.html) is served as it is in the repo. A small measuring
harness is added to the page in memory only (nothing on disk changes): it steps the sim's own
play loop without rendering and records each actor's position 20 times per second of play time.

    python3 scripts/sim-realism/run_sim.py --plays 1200
    python3 scripts/sim-realism/compare.py

Needs: pip install -r scripts/sim-realism/requirements.txt && python3 -m playwright install chromium
"""
import argparse, asyncio, gzip, json, os, random, re, socket, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIM_DIR = ROOT / 'public' / 'chase-cam'
OUT_DIR = Path(__file__).resolve().parent / 'out'

# The harness lives inside the page's own closure, so it can call the sim's functions directly.
# Its loop mirrors the sub-step loop in frame() (index.html, "if(running){ ... }"). If that loop
# changes, change this to match, or the measurements drift away from what the game shows.
HARNESS = r'''
/* ---- measuring harness, added in memory by scripts/sim-realism/run_sim.py (not part of the game) ---- */
window.__H = {
  list: ()=>({forms:Object.keys(FORMS), looks:Object.keys(LOOKS), forced:Object.keys(FORCED), build:SIM_BUILD, speed:G.speed}),
  roll: (c)=>rollCall(c), forced: (k)=>FORCED[k](),
  simulate(res, cfg){
    cfg = cfg||{};
    G.fieldPos = cfg.fieldPos ?? 25; G.down = cfg.down ?? 1; G.toGo = cfg.toGo ?? 10; G.off = 0;
    G.formation = cfg.formation || 'shotgun'; G.look = cfg.look || null; G.busy=false; G.pat=false;
    const kind = (res.kind==='fg'||res.kind==='punt'||res.kind==='kickoff')? res.kind : null;
    PLAY_OVR = [];
    setupFormation(kind);
    const roles = new Map(); const tag=(a,n)=>roles.set(a,n);
    O.ol.forEach((a,i)=>tag(a,'ol'+i)); tag(O.te,'te'); tag(O.wrL,'wrL'); tag(O.slot,'slot'); tag(O.wrR,'wrR'); tag(O.qb,'qb'); tag(O.rb,'rb');
    D.dl.forEach((a,i)=>tag(a,'dl'+i)); D.lb.forEach((a,i)=>tag(a,'lb'+i)); tag(D.cbL,'cbL'); tag(D.cbR,'cbR'); tag(D.sL,'sL'); tag(D.sR,'sR');
    const acts = actors.filter(a=>roles.has(a));
    const z0 = G.fieldPos-50;
    preSnap=false; choreograph(res); playT=0; running=true;
    const frames=[]; const DT=.05;
    const r3=v=>Math.round(v*1000)/1000;
    const snapshot=()=>{ frames.push([r3(playT), r3(ball.position.x), r3(ball.position.y), r3(ball.position.z), acts.map(a=>[r3(a.x), r3(a.z), a.down!=null?1:0, a.carrying?1:0])]); };
    snapshot();
    while(running && playT < 40){
      playT += DT;
      events.forEach(e=>{ if(!e.done && playT>=e.t){ e.done=true; e.fn(); } });
      if(!play.whistled && playT >= (play.whistleT ?? play.tEnd)) blowWhistle();
      actors.forEach(a=>{ if(a.celebAt!=null && playT>=a.celebAt && (a.celebrate==null || a.celebrate===false)){ a.celebrate=playT; a.celebAt=null; a.behav={type:'coast', vx:(a.vx||0)*.5, vz:(a.vz||0)*.5, t0:playT}; } });
      actors.forEach(a=>stepActor(a, playT, DT)); refObjs.forEach(r=>r.update(playT, DT));
      separate(); updateBall(playT);
      snapshot();
      if(playT > play.tEnd + 1.0) running=false;
    }
    running=false; preSnap=false;
    const bp = ballPlan.map(s=>({t0:s.t0, t1:s.t1, held: s.held? (roles.get(s.held)||'other') : null,
      flight: s.flight? {x0:s.flight.x0, z0:s.flight.z0, x1:s.flight.x1, z1:s.flight.z1, h:s.flight.h} : null}));
    return {res, cfg, z0, roles: acts.map(a=>roles.get(a)), frames, ballPlan: bp, tEnd: play.tEnd, whistleT: play.whistleT ?? play.tEnd, td: !!play.td,
      carrier: play.carrier? (roles.get(play.carrier)||'other') : null, snap:.35, uc: !!(FORMS[G.formation]||{}).uc,
      rate: play.rate ?? 1, rateUntil: play.rateUntil ?? 0};   /* frame() plays the stretch before rateUntil this much faster (handoff runs) */
  }
};
'''
TAIL = '})();\n</script>'

# seeded Math.random, so a run can be repeated exactly
RNG_JS = "(seed)=>{ let a=seed>>>0; Math.random=function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }"


def patched_html():
    src = (SIM_DIR / 'index.html').read_text(encoding='utf-8')
    i = src.rstrip().rfind(TAIL)
    if i < 0:
        sys.exit('run_sim: could not find the end of the sim script in public/chase-cam/index.html. The page structure changed; update TAIL in run_sim.py.')
    return src[:i] + HARNESS + src[i:]


def game_query():
    """Use the same query string the game embeds the sim with (LiveSim3D.tsx), so the same model and settings are measured."""
    try:
        t = (ROOT / 'src' / 'components' / 'game' / 'LiveSim3D.tsx').read_text(encoding='utf-8')
        m = re.search(r"SIM_URL\s*=\s*`/chase-cam/index\.html\?([^`]*)`", t)
        if m:
            q = re.sub(r'&?v=\$\{[^}]*\}', '', m.group(1)).strip('&')
            if q: return q + '&sound=0'
    except OSError:
        pass
    return 'embed=1&model=mh2&motion=2&sound=0'


def plan(rng):
    """One play: roughly an NFL mix (about 42% runs and scrambles, 58% dropbacks), random formation, look and field position."""
    r = rng.random()
    if r < 0.38:   spec = ('roll', 'run')
    elif r < 0.42: spec = ('forced', 'scramble')
    elif r < 0.80: spec = ('roll', 'short')
    elif r < 0.90: spec = ('roll', 'deep')
    elif r < 0.95: spec = ('forced', 'playaction')
    else:          spec = ('forced', 'screen')
    forms = ['shotgun', 'spread', 'singleback', 'iform', 'heavy']
    fw = [0.25, 0.10, 0.35, 0.20, 0.10] if spec[1] == 'run' else [0.50, 0.25, 0.17, 0.06, 0.02]
    form = rng.choices(forms, fw)[0]
    look = rng.choices([None, 'blitz', 'stacked_box', 'two_high', 'man_press', 'soft_zone'], [0.5, 0.1, 0.1, 0.1, 0.1, 0.1])[0]
    return {'spec': spec, 'cfg': {'fieldPos': rng.randint(15, 70), 'down': rng.choice([1, 1, 2, 2, 3]), 'toGo': rng.choice([10, 10, 10, 7, 5, 3]), 'formation': form, 'look': look}}


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


async def main(args):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        sys.exit('run_sim: Playwright is not installed. Run: pip install -r scripts/sim-realism/requirements.txt && python3 -m playwright install chromium')
    html = patched_html(); query = args.query or game_query(); port = free_port()
    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(SIM_DIR)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.0)
    rng = random.Random(args.seed)
    flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--no-proxy-server']
    if hasattr(os, 'geteuid') and os.geteuid() == 0: flags.append('--no-sandbox')
    try:
        async with async_playwright() as p:
            launch = dict(headless=True, args=flags)
            if args.chrome: launch['executable_path'] = args.chrome
            br = await p.chromium.launch(**launch)
            page = await (await br.new_context(viewport={'width': 640, 'height': 360})).new_page()
            errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
            base = f'http://127.0.0.1:{port}/'

            async def route(r):
                u = r.request.url
                if u.startswith(base + 'index.html'): await r.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
                elif u.startswith(base): await r.continue_()
                else: await r.abort()   # fonts and anything else off this machine: not needed to measure movement
            await page.route('**/*', route)

            async def boot():
                await page.goto(f'{base}index.html?{query}', wait_until='domcontentloaded')
                await page.wait_for_function("window.__H && document.getElementById('hint') && /Pre-snap/.test(document.getElementById('hint').textContent)", timeout=180000)
                await page.evaluate('window.requestAnimationFrame = ()=>0')   # stop the render loop: only the sim steps are needed

            t0 = time.time(); await boot()
            info = await page.evaluate('window.__H.list()')
            print(f"sim build {info['build']}, playback speed {info['speed']}x, query ?{query}", flush=True)
            done = fails = 0
            with gzip.open(out, 'wt') as f:
                f.write(json.dumps({'meta': info, 'seed': args.seed, 'query': query, 'plays': args.plays}) + '\n')
                for i in range(args.plays):
                    if i and i % 150 == 0: await boot()   # a fresh page now and then: every snap clones 22 skinned models
                    pl = plan(rng); seed = rng.randrange(1, 2 ** 31)
                    try:
                        o = await page.evaluate("""([seed, spec, cfg, rngjs])=>{ (eval(rngjs))(seed);
                            const res = spec[0]==='roll'? window.__H.roll(spec[1]) : window.__H.forced(spec[1]);
                            const o = window.__H.simulate(res, cfg); o.call = spec[1]; o.seed = seed; return o; }""", [seed, list(pl['spec']), pl['cfg'], RNG_JS])
                        f.write(json.dumps(o, separators=(',', ':')) + '\n'); done += 1
                    except Exception as e:   # one bad play should not lose the run
                        fails += 1; print(f'play {i} failed: {str(e)[:300]}', flush=True); await boot()
                    if (i + 1) % 100 == 0: print(f'{i + 1}/{args.plays} plays, {time.time() - t0:.0f}s', flush=True)
            print(f'done: {done} plays logged to {out}, {fails} failed, {len(errs)} page errors' + (f' (first: {errs[0][:200]})' if errs else ''))
            await br.close()
            if fails or errs: sys.exit(1)
    finally:
        srv.terminate()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--plays', type=int, default=1200, help='number of plays to simulate (default 1200, about ten minutes)')
    ap.add_argument('--seed', type=int, default=20261122, help='seed for the play mix and for Math.random inside the sim')
    ap.add_argument('--out', default=str(OUT_DIR / 'sim_plays.jsonl.gz'))
    ap.add_argument('--query', default=None, help='query string for the sim page; default is the one the game uses')
    ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH'), help='path to a Chrome/Chromium binary (default: the one Playwright installed)')
    asyncio.run(main(ap.parse_args()))
