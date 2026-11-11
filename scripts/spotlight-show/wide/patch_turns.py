"""Take the zoom out of the head turns in an already-composed two-shot, for a
clip whose per-segment renders are gone and so can't be recomposed with
compose_shots.py (the turns from make_turns.py are already right).

The old turn clips were ~2.1% larger than the stills (see make_turns.py), so
for the second a turn is on screen both hosts sit further apart. Here the
frames of each turn are scaled back about the frame centre and the hosts laid
over the still again through the masks — by how much of each frame is the turn (measured
off the picture: the turn fades in and out over a few frames), so the
lip-sync frames on either side are left alone.

Usage (in show-assets/wide2):
  python3 patch_turns.py <in.mp4> <out.mp4> <turn, s> [<turn> …]
A turn is at its cut in <key>.timing.json plus 1 s for every turn before it (to
within a few frames: the exact frames are found from the picture).
"""
import subprocess, sys, numpy as np
from PIL import Image
from make_turns import W, H, ZOOM, CX, CY, FPS

GAIN = np.array([0.968, 0.964, 0.968], np.float32)      # make_turns.colour_match on the raw generations
OFFSET = np.array([4.4, 5.3, 4.8], np.float32)
TORSO = (300, 520, 640, 690)             # Marcus, below the head: it doesn't move in a turn, only with the zoom
FULL = 9.8                               # px his torso sits left of its place while the old turn is fully on

def weights(src, cut):
    """{frame: how much of it is the old turn clip (0..1)}, measured: how far Marcus's torso sits from where it
    was before the cut. The turn is fully on between the first and last frame that shows most of the offset
    (mid-turn the matcher wanders), and fades over the frames either side."""
    n0 = round(cut * FPS) - 8
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', src, '-vf', f"select='between(n,{n0},{n0 + 46})'", '-fps_mode', 'vfr', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    v = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    x0, y0, x1, y1 = TORSO
    def dx(i):
        errs = {d: np.abs(v[0][y0:y1, x0:x1] - v[i][y0:y1, x0 + d:x1 + d]).mean() for d in range(-14, 15)}
        return -min(errs, key=errs.get)
    d = [dx(i) for i in range(len(v))]
    on = [i for i, x in enumerate(d) if x >= 0.7 * FULL]
    if not on: raise SystemExit(f'no zoomed turn found near {cut}s in {src}')
    return {n0 + i: (1.0 if on[0] <= i <= on[-1] else min(1.0, max(0.0, d[i] / FULL))) for i in range(on[0] - 3, on[-1] + 4)}

def main(src, dst, *cuts):
    w = {}
    for c in cuts: w.update(weights(src, float(c)))
    still = np.asarray(Image.open('medium_cam.png').convert('RGB').resize((W, H)), np.float32)
    m = np.maximum(np.asarray(Image.open('mask_marcus.png').convert('L'), np.float32), np.asarray(Image.open('mask_tony.png').convert('L'), np.float32))[..., None] / 255
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', src,
        '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
    n = fixed = 0
    while True:
        buf = dec.stdout.read(W * H * 3)
        if len(buf) < W * H * 3: break
        a = w.get(n, 0.0)
        if a > 0:
            z = 1 + (ZOOM - 1) * a
            fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
            un = np.asarray(Image.fromarray(fr).transform((W, H), Image.AFFINE, (z, 0, CX - CX * z, 0, z, CY - CY * z), resample=Image.BICUBIC), np.float32)
            un = un * (1 + (GAIN - 1) * a) + OFFSET * a
            buf = np.clip(fr * (1 - m) + un * m, 0, 255).astype(np.uint8).tobytes(); fixed += 1
        enc.stdin.write(buf); n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
    print(dst, 'frames', n, 'fixed', fixed, 'turn frames', [(min(k for k in w if abs(k - round(float(c) * FPS)) < 40), max(k for k in w if abs(k - round(float(c) * FPS)) < 40)) for c in cuts])

if __name__ == '__main__':
    main(*sys.argv[1:])
