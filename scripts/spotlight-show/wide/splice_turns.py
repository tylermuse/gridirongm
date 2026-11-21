"""Swap the head turns in an already-composed two-shot for rebuilt ones, for a
clip whose per-segment renders are gone and so can't be recomposed with
compose_shots.py (`buysell_open_1`, `buysell_open_3`).

compose_shots.py cuts a turn in as the 25-frame turn clip, crossfaded over XF
(3 frames) with the lip-sync on either side. Where the turn's frames sit is
read off the picture: around each cut, the frames that are one frame of the
old turn clip and nothing else (they match it to > 40 dB), plus the two frames
of crossfade before and after, which hold 1/3 and 2/3 of the neighbouring turn
frame. Each of those becomes

    new = old + weight * (new turn frame - old turn frame)

which leaves the lip-sync under the crossfades as it was. (A composed clip
shows turn frames 0-19 whole and fades out on 20-21: the next line's render
comes in 3 frames before the turn's second is up.) Everything else is passed
through; the audio is copied.

Usage (in show-assets/wide2):
  python3 splice_turns.py <in.mp4> <out.mp4> <cut, s> <old turn.mp4> <new turn.mp4> [<cut> <old> <new> …]
A cut is the turn's cut in <key>.timing.json plus 1 s for every turn before it.
<in.mp4> must be the clip as composed with <old turn.mp4> — for the two above,
their first version in git and the turns in show-assets/wide2/turn_bak_zoomed.
"""
import subprocess, sys, numpy as np
from make_turns import W, H, FPS

XF = 3          # compose_shots.XF, in frames
PURE = 40.0     # dB: a frame that is one old turn frame and nothing else

def frames(path, first=0, count=None):
    sel = [] if count is None else ['-vf', f"select='between(n,{first},{first + count - 1})'", '-fps_mode', 'vfr']
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, *sel, '-s', f'{W}x{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)

def psnr(a, b):
    d = a[::2, ::2].astype(np.float32) - b[::2, ::2].astype(np.float32)
    return 10 * np.log10(255 ** 2 / max(1e-9, float((d ** 2).mean())))

def layout(src, cut, old):
    """{frame: (weight, turn frame)} for the turn cut in at `cut` s."""
    f0 = round(cut * FPS) - 2; win = frames(src, f0, FPS + 12)
    pure = {}       # frame -> old turn frame it is
    for k, fr in enumerate(win):
        i = max(range(FPS), key=lambda i: psnr(fr, old[i]))
        if psnr(fr, old[i]) >= PURE: pure[f0 + k] = i
    if not pure: raise SystemExit(f'no frames of the old turn found near {cut}s in {src}')
    a, b = min(pure), max(pure)
    assert sorted(pure) == list(range(a, b + 1)) and all(pure[n + 1] - pure[n] in (0, 1) for n in range(a, b)), f'turn at {cut}s is not one run: {pure}'
    out = {n: (1.0, i) for n, i in pure.items()}
    for k in range(1, XF):
        out[a - k] = ((XF - k) / XF, pure[a])                              # fading in on the first turn frame, held
        out[b + k] = ((XF - k) / XF, min(FPS - 1, pure[b] + k))            # fading out as the turn runs on
    return out

def main(src, dst, *args):
    plan = {}       # frame -> (weight, old turn frame, new turn frame)
    for cut, old, new in zip(args[0::3], args[1::3], args[2::3]):
        o, n = frames(old), frames(new)
        assert len(o) == FPS and len(n) == FPS, 'a turn is 25 frames'
        lay = layout(src, float(cut), o)
        for f, (w, i) in lay.items(): plan[f] = (w, o[i].astype(np.float32), n[i].astype(np.float32))
        whole = sorted(f for f, (w, _) in lay.items() if w == 1)
        print(f'  turn at {cut}s: frames {min(lay)}-{max(lay)}, turn frames {lay[whole[0]][1]}-{lay[whole[-1]][1]} whole on {whole[0]}-{whole[-1]}')
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', src,
        '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
    n = 0
    while True:
        buf = dec.stdout.read(W * H * 3)
        if len(buf) < W * H * 3: break
        if n in plan:
            w, o, new = plan[n]
            buf = np.clip(np.frombuffer(buf, np.uint8).reshape(H, W, 3) + w * (new - o), 0, 255).astype(np.uint8).tobytes()
        enc.stdin.write(buf); n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
    print(dst, 'frames', n, 'spliced', len(plan))

if __name__ == '__main__':
    main(*sys.argv[1:])
