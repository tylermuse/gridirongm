"""
BS Football hero-video capture.

Plays scripted beats on the live site as a guest and records each beat as a
sequence of JPEG frames (CDP screencast, with timestamps) into frames/<beat>/.
Rerun whenever the UI changes; then run cut.py to build the videos.

    python3 capture.py [--team Buffalo] [--base https://bs-football.com]
"""
import argparse, asyncio, base64, json, os, re, shutil, time
from playwright.async_api import async_playwright

VW, VH, DPR = 1280, 800, 3
OUT = "frames"

HIDE_JS = r"""() => {
  const promos = [/^Join the BS Football Community/, /^Enjoying BS Football\?/, /^\W*NEW EPISODE/,
                  /^Your franchise is only saved/, /THE BOOTH/, /^Feedback$/];
  for (const r of promos) {
    let best = null;
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent || el.offsetHeight > 330) continue;
      if (r.test((el.innerText || '').trim()) && (!best || el.offsetHeight > best.offsetHeight)) best = el;
    }
    if (best) best.style.visibility = 'hidden';
  }
  const kill = [/^Join the BS Football Community/, /^\W*NEW EPISODE/, /^Your franchise is only saved/,
                /Go Premium for a fully/];
  for (const el of document.querySelectorAll('div,section,aside')) {
    const t = (el.innerText || '').trim();
    if (el.offsetHeight < 320 && kill.some(r => r.test(t))) el.style.display = 'none';
  }
  for (const el of document.querySelectorAll('button,a')) {
    const t = (el.innerText || '').trim();
    if (t === 'Feedback' || /THE BOOTH/.test(t)) el.style.display = 'none';
  }
}"""


class Recorder:
    """Grabs clipped full-DPR JPEG screenshots in a tight loop (~12-15 fps).
    CDP screencast only delivers CSS-pixel frames, which are too soft to crop."""
    def __init__(self, page):
        self.page, self.task, self.frames, self.dir, self.on = page, None, [], None, False

    async def start(self, name, clip=None):
        self.dir = os.path.join(OUT, name)
        shutil.rmtree(self.dir, ignore_errors=True)
        os.makedirs(self.dir)
        self.frames, self.on = [], True
        self.clip = clip or {"x": 0, "y": 0, "width": VW, "height": VH}
        self.task = asyncio.create_task(self._loop())

    async def _loop(self):
        while self.on:
            t = time.time()
            path = os.path.join(self.dir, f"{len(self.frames):05d}.jpg")
            try:
                await self.page.screenshot(path=path, type="jpeg", quality=92, clip=self.clip)
            except Exception:
                await asyncio.sleep(0.05); continue
            self.frames.append({"file": os.path.basename(path), "t": t})

    async def stop(self):
        self.on = False
        await self.task
        with open(os.path.join(self.dir, "frames.json"), "w") as f:
            json.dump({"clip": self.clip, "dpr": DPR, "frames": self.frames}, f)
        d = self.frames[-1]["t"] - self.frames[0]["t"]
        print(f"  {self.dir}: {len(self.frames)} frames, {d:.1f}s, {len(self.frames)/max(d,0.1):.1f} fps")


async def clean(pg):
    await pg.evaluate(HIDE_JS)


async def nav(pg, label):
    await pg.locator("nav, aside").get_by_text(re.compile(rf"^\W*{re.escape(label)}$")).first.click()
    await pg.wait_for_timeout(2500)
    await clean(pg)


async def new_league(p, base, team):
    browser = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None,
                                      args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = await browser.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=DPR)
    await ctx.add_init_script("setInterval(" + HIDE_JS + ", 250);")
    pg = await ctx.new_page()
    await pg.goto(base, wait_until="networkidle", timeout=60000)
    await pg.get_by_text("Real 2026 NFL season", exact=True).first.click()
    await pg.wait_for_timeout(500)
    await pg.get_by_text(team, exact=True).first.click()
    await pg.wait_for_timeout(6000)
    await clean(pg)
    return browser, pg


GAME_CLIP = {"x": 215, "y": 118, "width": 775, "height": 445}

async def beat_game(pg, rec):
    await pg.get_by_role("button", name="Watch Live").first.click()
    await pg.wait_for_timeout(2500)
    await pg.get_by_role("button", name="Kick Off").click()
    await pg.wait_for_timeout(800)
    toggle = pg.get_by_role("button", name=re.compile("3D Sim"))
    if "ON" in (await toggle.first.inner_text()):   # 2D field records smoothly; 3D is too slow headless
        await toggle.first.click()
    # if the opponent got the ball first, fast-forward until it's our call
    await pg.get_by_role("button", name="5x", exact=True).first.click()
    await pg.get_by_role("button", name="Deep Shot").wait_for(timeout=150000)
    await pg.get_by_role("button", name="1x", exact=True).first.click()
    await pg.wait_for_timeout(1500)
    await clean(pg)
    await pg.evaluate("() => { window.scrollTo(0,0); document.querySelectorAll('main,*').forEach(e=>{ if(e.scrollTop) e.scrollTop=0 }) }")
    await pg.wait_for_timeout(500)
    hdr = await pg.get_by_text("Call the Play", exact=True).first.bounding_box()
    clip = dict(GAME_CLIP, y=max(0, hdr["y"] - 6))
    # 2D: call a deep shot and keep the take only if it hits (results are random).
    # Returns False so main() can retry with a fresh league.
    await rec.start("1_game", clip)
    await pg.wait_for_timeout(1000)
    await pg.get_by_role("button", name="Deep Shot").hover()
    await pg.wait_for_timeout(400)
    await pg.get_by_role("button", name="Deep Shot").click()
    hit = False
    for _ in range(26):
        await pg.wait_for_timeout(250)
        if await pg.get_by_text(re.compile(r"1ST DOWN \(\+\d+\)|TOUCHDOWN")).count():
            hit = True
    await rec.stop()
    print("   big play:", hit)
    if not hit:
        return False
    # 3D: a few stills of the stadium view (software GL renders ~1 frame / few s)
    await pg.get_by_role("button", name="Deep Shot").wait_for(timeout=45000)
    await toggle.first.click()
    for _ in range(40):
        await pg.wait_for_timeout(1500)
        if not await pg.get_by_text(re.compile("Loading 3D|LOADING PLAYERS")).count():
            break
    await pg.wait_for_timeout(3000)
    os.makedirs(os.path.join(OUT, "1b_3d"), exist_ok=True)
    await pg.get_by_role("button", name="Short Pass").click(timeout=45000)
    for i in range(5):
        await clean(pg)
        await pg.screenshot(path=os.path.join(OUT, "1b_3d", f"{i:05d}.jpg"), type="jpeg", quality=92, clip=clip)
    return True


async def beat_trade(pg, rec):
    await nav(pg, "Trades")
    await rec.start("2_trade")
    await pg.wait_for_timeout(600)
    await pg.get_by_role("button", name=re.compile("Trade Finder")).click()
    await pg.wait_for_timeout(2500)
    await clean(pg)
    btn = pg.get_by_role("button", name="Propose Trade").nth(1)
    await btn.hover()
    await pg.wait_for_timeout(500)
    await btn.click()
    await pg.wait_for_timeout(3500)
    await rec.stop()


async def beat_fa(pg, rec):
    await nav(pg, "Free Agency")
    await rec.start("3_fa")
    await pg.wait_for_timeout(800)
    await pg.get_by_role("button", name="Negotiate").first.click()
    await pg.wait_for_timeout(700)
    box = await pg.get_by_text(re.compile("^Negotiating with")).first.bounding_box()
    await pg.mouse.move(900, 500)
    dy = box["y"] - 175
    for _ in range(8):
        await pg.mouse.wheel(0, dy / 8)
        await pg.wait_for_timeout(60)
    await pg.wait_for_timeout(1500)
    for label in ["2yr", "3yr"]:
        await pg.get_by_role("button", name=label, exact=True).first.click()
        await pg.wait_for_timeout(700)
    await pg.wait_for_timeout(1200)
    await rec.stop()
    await pg.keyboard.press("Escape")


async def beat_scout(pg, rec):
    await nav(pg, "Draft Preview")
    await rec.start("4_scout")
    await pg.wait_for_timeout(800)
    await pg.wait_for_timeout(2500)
    await rec.stop()


async def beat_sim(pg, rec):
    await nav(pg, "Dashboard")
    await rec.start("5_sim")
    await pg.wait_for_timeout(800)
    await pg.get_by_role("button", name="Sim Season").first.click()
    await pg.get_by_role("button", name="Sim Remaining").first.wait_for(timeout=60000)
    await clean(pg)
    await pg.wait_for_timeout(1500)
    await pg.get_by_role("button", name="Sim Remaining").first.click()
    await pg.get_by_text(re.compile("Season \\d+ Champions$")).first.wait_for(timeout=60000)
    await clean(pg)
    await pg.wait_for_timeout(3500)
    champ = await pg.get_by_text(re.compile("are Season \\d+ Champions")).first.inner_text()
    await rec.stop()
    return champ


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--team", default="Buffalo")
    ap.add_argument("--base", default="https://bs-football.com")
    ap.add_argument("--only", default="")
    ap.add_argument("--title-tries", type=int, default=1,
                    help="re-sim with fresh leagues until your team wins the title")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        if not a.only or a.only != "sim":
            for name, fn in [("game", beat_game), ("trade", beat_trade), ("fa", beat_fa), ("scout", beat_scout)]:
                if a.only and a.only != name:
                    continue
                for t in range(8 if name == "game" else 1):
                    b, pg = await new_league(p, a.base, a.team)
                    try:
                        ok = await fn(pg, Recorder(pg))
                    except Exception as e:
                        ok = None; print(f"  beat {name} failed: {str(e)[:160]}")
                    await b.close()
                    if ok is not False:
                        break
        if not a.only or a.only == "sim":
            for t in range(a.title_tries):
                b, pg = await new_league(p, a.base, a.team)
                champ = await beat_sim(pg, Recorder(pg))
                await b.close()
                print(f"  try {t+1}: {champ}")
                if a.team.split()[0] in champ or champ.split(" are ")[0].endswith(a.team):
                    break


if __name__ == "__main__":
    asyncio.run(main())
