"""Two-shot with shot changes. shots.json has one letter per line:
  c  both face the camera (medium_cam.png, per-segment .cam renders)
  p  they face each other, straight-faced (medium.png, the whole-clip renders)
  P  they face each other grinning (medium_smile.png, per-segment .pair
     renders) — only the jabs and the reactions to them.
Between c and p/P the hosts turn their heads: a 1 s generated clip of the
turn (turn_pc / turn_cp smiling, turn_pc_n / turn_cp_n straight-faced) is cut
in at the pause, with the same silence added to the audio. Between p and P
the framing is the same, so it is just a slower crossfade over the pause.
HeyGen's lips run ahead of the voice, so every render is delayed by SYNC.
Both hosts are laid over the still through feathered masks.

The per-segment renders were made for runs.json (the old c/p runs); a P
segment is cut out of the pair render of the run it lies in.

Usage: python3 compose_shots.py <key>   (reads plan.json + runs.json; writes
<key>.mp4 and <key>.timing.json with the lines' new time spans)
"""
import json, os, subprocess, sys
from compose_wide import CROPS, mask, W, H

SYNC = 0.16      # video delayed this much: lips were early
LEAD = 0.6       # silent lead-in in the segment slices
XF = 0.12        # crossfade at a turn
XF_SOFT = 0.35   # crossfade between straight face and grin (same framing)
TURN = 1.0       # how long a head turn takes on screen
STILL = {'c': 'medium_cam.png', 'p': 'medium.png', 'P': 'medium_smile.png'}

def dur_of(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def layers(base, m, t, m_from, t_from, dur, out):
    (mx0, my0, mx1, my1), (tx0, ty0, tx1, ty1) = CROPS['marcus'], CROPS['tony']
    fc = (f"[0:v]scale={W}:{H},format=gbrp[base];"
          f"[1:v]tpad=start_mode=clone:start_duration={SYNC},trim=start={m_from:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3,scale={mx1-mx0}:{my1-my0},format=gbrp,pad={W}:{H}:{mx0}:{my0}[m];"
          f"[2:v]tpad=start_mode=clone:start_duration={SYNC},trim=start={t_from:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3,scale={tx1-tx0}:{ty1-ty0},format=gbrp,pad={W}:{H}:{tx0}:{ty0}[t];"
          "[3:v]format=gray,format=gbrp[mm];[4:v]format=gray,format=gbrp[tm];"
          "[base][m][mm]maskedmerge[b1];[b1][t][tm]maskedmerge,format=yuv420p[o]")
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', base, '-i', m, '-i', t,
        '-loop', '1', '-i', 'mask_marcus.png', '-loop', '1', '-i', 'mask_tony.png',
        '-filter_complex', fc, '-map', '[o]', '-t', f'{dur:.3f}', '-r', '25', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])

def turn_piece(kind_from, kind_to, out):
    """The head turn, held XF at both ends for the crossfades."""
    face = kind_from if kind_from != 'c' else kind_to          # p or P: which face turns
    a, b = ('p' if kind_from != 'c' else 'c'), ('p' if kind_to != 'c' else 'c')
    src = f'turn_{a}{b}{"_n" if face == "p" else ""}.mp4'
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf',
        f'tpad=start_mode=clone:start_duration={XF},tpad=stop_mode=clone:stop_duration={XF},scale={W}:{H},fps=25,format=yuv420p',
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])

def sources(k, kind, run, t0):
    """(still, marcus render, tony render, source time of timeline t0)."""
    if kind == 'p':
        return STILL[kind], f'{k}.marcus.mp4', f'{k}.tony.mp4', t0
    suf = 'cam' if kind == 'c' else 'pair'
    m, t = f"{run['id']}.marcus.{suf}.mp4", f"{run['id']}.tony.{suf}.mp4"
    if os.path.exists(m) and os.path.exists(t):
        return STILL[kind], m, t, LEAD + t0 - run['a']
    return 'medium.png', f'{k}.marcus.mp4', f'{k}.tony.mp4', t0

def main(k):
    for h in CROPS:
        if not os.path.exists(f'mask_{h}.png'): mask(h, f'mask_{h}.png')
    plan = json.load(open('plan.json'))[k]
    runs = json.load(open('runs.json'))[k]['segs']
    dur = plan['dur']; segs = plan['segs']
    os.makedirs('parts', exist_ok=True)
    # Joins: a turn (c <-> p/P) or a soft crossfade (p <-> P).
    joins = [('xf' if 'c' not in (s['kind'], n['kind']) else 'turn') for s, n in zip(segs, segs[1:])]
    pieces = []   # (file, nominal duration)
    cuts = []     # original-timeline time where a turn is inserted
    for n, sg in enumerate(segs):
        kind = sg['kind']
        t0 = sg['start']; t1 = sg['b']
        if n == len(segs) - 1: t1 = dur + 0.3
        if n and joins[n - 1] == 'xf': t0 -= XF_SOFT / 2       # the soft fade is centred on the pause
        tail = XF_SOFT if n < len(joins) and joins[n] == 'xf' else XF
        if n < len(joins) and joins[n] == 'xf': t1 -= XF_SOFT / 2
        run = next(r for r in runs if r['kind'] == ('p' if kind == 'P' else kind) and r['a'] - 1e-6 <= sg['a'] < r['b'] + 1e-6)
        still, m, t, src = sources(k, kind, run, t0)
        out = f'parts/{k}__{n}.mp4'
        layers(still, m, t, src, src, t1 - t0 + tail, out)
        pieces.append((out, t1 - t0, tail))
        if n < len(joins) and joins[n] == 'turn':
            tp = f'parts/{k}__turn{n}.mp4'
            turn_piece(kind, segs[n + 1]['kind'], tp)
            pieces.append((tp, dur_of(tp) - 2 * XF, XF))
            cuts.append(sg['b'])
    # Video: crossfade the pieces in a chain (each piece carries its fade of extra tail).
    inputs = []; fc = []; offset = 0.0
    for f, _, _ in pieces: inputs += ['-i', f]
    prev = '0:v'
    for i in range(1, len(pieces)):
        offset += pieces[i - 1][1]
        fc.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={pieces[i - 1][2]}:offset={offset:.3f}[x{i}]"); prev = f'x{i}'
    total = sum(d for _, d, _ in pieces) + pieces[-1][2]
    # Audio: the original, with TURN seconds of silence dropped in at every turn.
    af = []; last_t = 0.0; labels = []
    for i, c in enumerate(cuts):
        af.append(f"[{len(pieces)}:a]atrim={last_t:.3f}:{c:.3f},asetpts=PTS-STARTPTS[s{i}];aevalsrc=0:d={TURN}:s=44100:c=stereo[g{i}]")
        labels += [f'[s{i}]', f'[g{i}]']; last_t = c
    af.append(f"[{len(pieces)}:a]atrim=start={last_t:.3f},asetpts=PTS-STARTPTS,apad[s{len(cuts)}]"); labels.append(f'[s{len(cuts)}]')
    af.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[a]")
    vmap = f'[{prev}]' if len(pieces) > 1 else '[0:v]'
    if len(pieces) == 1: fc.append('[0:v]copy[v0]'); vmap = '[v0]'
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', *inputs, '-i', f'{k}.mp3',
        '-filter_complex', ';'.join(fc + af), '-map', vmap, '-map', '[a]', '-t', f'{total:.3f}',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', f'{k}.mp4'])
    # Where the lines ended up: every cut before a line pushes it back by TURN.
    spans = json.load(open(f'{k}.mp3.spans.json'))
    shifted = [[a + TURN * sum(1 for c in cuts if c <= a + 1e-6), b + TURN * sum(1 for c in cuts if c <= a + 1e-6)] for a, b in spans]
    json.dump({'cuts': cuts, 'turn': TURN, 'lines': shifted, 'duration': round(dur_of(f'{k}.mp4'), 2)}, open(f'{k}.timing.json', 'w'))
    print('wrote', f'{k}.mp4', ''.join(s['kind'] for s in segs), 'turns at', [round(c, 2) for c in cuts])

if __name__ == '__main__':
    main(sys.argv[1])
