#!/usr/bin/env python3
"""Compare a run_sim.py log against the real-football targets in benchmarks.json.

    python3 scripts/sim-realism/compare.py [path/to/sim_plays.jsonl.gz]

Prints one row per measure: the real value, the sim on screen (at the playback speed the game uses)
and the sim on its own clock. Also writes out/report.md and out/results.json next to this script.
A row is marked ok when the on-screen value is within 15% of real.
"""
import json, math, sys
from pathlib import Path
import metrics as m

HERE = Path(__file__).resolve().parent
OK_WITHIN = 0.15


def lookup(M, PW, key):
    """'pw.WR.vmax.p50' reads the pass-window results; anything else reads the whole-play results."""
    parts = key.split('.')
    node = PW if parts[0] == 'pw' else M
    if parts[0] == 'pw':
        parts = parts[1:]
        if parts[0] in ('WR', 'TE', 'RB', 'CB', 'S', 'LB'): node = node['groups']
    for p in parts:
        if not isinstance(node, dict) or p not in node: return float('nan')
        node = node[p]
    return float(node) if isinstance(node, (int, float)) else float('nan')


def fmt(v, kind=None):
    if v is None or (isinstance(v, float) and math.isnan(v)): return '-'
    if kind == 'pct': return f'{v * 100:.1f}%' if v >= 0.001 else f'{v * 100:.2f}%'
    if kind == 'rate': return f'{v:.2f}' if v >= 0.01 else f'{v:.5f}'
    return f'{v:.2f}'


def main():
    log = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'out' / 'sim_plays.jsonl.gz'
    if not log.exists(): sys.exit(f'compare: {log} not found. Run scripts/sim-realism/run_sim.py first.')
    meta = m.read_meta(log); speed = float(meta['meta'].get('speed', 1.5)); bench = json.loads((HERE / 'benchmarks.json').read_text())
    clock = m.load_sim(log, 1.0); screen = clock if abs(speed - 1.0) < 1e-6 else m.load_sim(log, speed)
    Mc, PWc = m.whole_play(clock), m.pass_window(clock); Ms, PWs = (Mc, PWc) if screen is clock else (m.whole_play(screen), m.pass_window(screen))
    head = f"Sim build {meta['meta'].get('build')} · {Mc['n_plays']} plays ({', '.join(f'{v} {k}' for k, v in sorted(Mc['kinds'].items(), key=lambda kv: -kv[1]))}) · playback {speed:g}x"
    lines = ['# Sim realism report', '', head, '', f'"On screen" is the sim at {speed:g}x, as the game plays it. "Sim clock" is the sim at 1x. A row is ok when the on-screen value is within {OK_WITHIN:.0%} of real.', '']
    rows_out = []; n_ok = n_all = 0
    print(head)
    for g in bench['groups']:
        print(f"\n== {g['title']}"); print(f"{'':48s} {'real':>9s} {'on screen':>10s} {'sim clock':>10s}")
        lines += [f"## {g['title']}", '', '| Measure | Real | On screen | Sim clock | |', '| --- | --- | --- | --- | --- |']
        for r in g['rows']:
            real = r['real']; s = lookup(Ms, PWs, r['key']); c = lookup(Mc, PWc, r['key']); k = r.get('fmt')
            ok = (not math.isnan(s)) and abs(s - real) <= OK_WITHIN * abs(real)
            n_all += 1; n_ok += ok; mark = 'ok' if ok else ''
            print(f"{r['label'][:48]:48s} {fmt(real, k):>9s} {fmt(s, k):>10s} {fmt(c, k):>10s}  {mark}")
            lines.append(f"| {r['label']} | {fmt(real, k)} | {fmt(s, k)} | {fmt(c, k)} | {mark} |")
            rows_out.append(dict(key=r['key'], label=r['label'], real=real, on_screen=s, sim_clock=c, ok=bool(ok), source=r['source']))
        lines.append('')
    tail = f'{n_ok} of {n_all} measures within {OK_WITHIN:.0%} of real on screen.'
    print('\n' + tail); lines += [tail, '', 'Real values and their sources are in benchmarks.json.']
    out = HERE / 'out'; out.mkdir(exist_ok=True)
    (out / 'report.md').write_text('\n'.join(lines) + '\n')
    (out / 'results.json').write_text(json.dumps(dict(meta=meta, speed=speed, ok=n_ok, total=n_all, rows=rows_out), indent=1, default=float))
    print(f'wrote {out / "report.md"} and {out / "results.json"}')


if __name__ == '__main__':
    main()
