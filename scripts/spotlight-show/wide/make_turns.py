"""The 1 s head turns cut in at a shot change (compose_shots.py), from the raw
generations in show-assets/wide2:

  turn_pc_raw.mp4    grinning pair -> camera -> smile fades to neutral
  turn_pc_n_raw.mp4  straight-faced pair -> camera

The generations come back ZOOM x larger than the stills they were made from
(about the frame centre), so each frame is scaled back down before the hosts
are laid over the still through the same feathered masks as the lip-sync
renders — otherwise both hosts sit ~9 px further apart for the second the
turn is on screen, and jump back when it ends.

Retimed to exactly 1 s (25 frames; compose_shots.TURN), each host on his own
clock. In the grinning generation both hosts lean as they settle (hands still,
shoulders ~6 px one way then ~10 px the other, over about a second each).
Played through at the speed a 1 s turn needs, a lean is on and off in 2-3
frames: a jolt of the whole torso. So each host plays his head turn at twice
the generated speed up to the frame his lean starts, then dissolves over a few
frames to the frames after it — same pose, the grin part faded — and runs out
to the camera still. The straight-faced generation doesn't lean.
`turn_cp*` is `turn_pc*` reversed.

Usage (in show-assets/wide2):  python3 make_turns.py [outdir]
"""
import subprocess, sys, numpy as np
from PIL import Image

W, H = 1920, 1080
ZOOM = 1.021            # measured: raw vs medium_cam / medium / medium_smile, both ends of both raws
CX, CY = 960.0, 539.5
FPS = 25
HOSTS = ('marcus', 'tony')

def ramp(*knots):
    """Raw frame (fractional) for each of the 25 output frames: straight lines between (output frame, raw frame)
    knots, held at the first / last knot outside them."""
    out = []
    for n in range(FPS):
        if n <= knots[0][0]: out.append(float(knots[0][1])); continue
        if n >= knots[-1][0]: out.append(float(knots[-1][1])); continue
        for (n0, r0), (n1, r1) in zip(knots, knots[1:]):
            if n0 <= n <= n1:
                out.append(r0 + (r1 - r0) * (n - n0) / (n1 - n0)); break
    return out

def cut(turn, rest, fade):
    """One host's 25 frames as (raw frame a, raw frame b, how much of b): the `turn` ramp, dissolving to the `rest`
    ramp over the output frames strictly between fade[0] and fade[1]."""
    a, b = ramp(*turn), ramp(*rest); f0, f1 = fade
    return [(round(a[n]), round(b[n]), min(1.0, max(0.0, (n - f0) / (f1 - f0)))) for n in range(FPS)]

def straight(*knots):
    return [(round(r), round(r), 0.0) for r in ramp(*knots)]

# pair -> camera. All start on raw frame 0 (the pair still) and end where the generation has settled on the camera
# still (the grinning one by ~70, the straight-faced one by ~80); the heads turn at twice the generated speed.
# Grinning: Marcus faces the lens by raw 36 and leans over 38-58; Tony faces it by 28 and leans over 30-62.
MAPS = {
    'turn_pc':   ('turn_pc_raw.mp4',   'medium_smile.png', {
        'marcus': cut(((0, 0), (18, 36), (19, 37)), ((19, 58), (24, 72)), (18, 22)),
        'tony':   cut(((0, 0), (14, 28), (15, 29)), ((15, 64), (24, 72)), (14, 19)),
    }),
    'turn_pc_n': ('turn_pc_n_raw.mp4', 'medium.png',       {h: straight((0, 0), (18, 36), (24, 80)) for h in HOSTS}),
}

def frames(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)

def unzoom(a):
    """Scale the frame down by ZOOM about (CX, CY): output (x, y) samples raw (CX + (x - CX) * ZOOM, …)."""
    im = Image.fromarray(a)
    return np.asarray(im.transform((W, H), Image.AFFINE, (ZOOM, 0, CX - CX * ZOOM, 0, ZOOM, CY - CY * ZOOM), resample=Image.BICUBIC), np.float32)

def write(name, frs, outdir):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', f'{outdir}/{name}.mp4'], stdin=subprocess.PIPE)
    for f in frs: p.stdin.write(f.tobytes())
    p.stdin.close(); p.wait()

def colour_match(raw_ends, stills, m):
    """Per-channel gain + offset taking the generation's levels to the stills' (it comes back a little darker),
    fitted where the hosts are, on the two end frames — the same poses as the stills."""
    sel = m[..., 0] > 0.98
    fit = []
    for c in range(3):
        x = np.concatenate([r[..., c][sel][::7] for r in raw_ends]); y = np.concatenate([s[..., c][sel][::7] for s in stills])
        fit.append(np.polyfit(x, y, 1))
    return np.array([f[0] for f in fit], np.float32), np.array([f[1] for f in fit], np.float32)

def main(outdir='.'):
    load = lambda f: np.asarray(Image.open(f).convert('RGB').resize((W, H)), np.float32)
    cam = load('medium_cam.png')        # the stills are identical outside the masks
    masks = {h: np.asarray(Image.open(f'mask_{h}.png').convert('L'), np.float32)[..., None] / 255 for h in HOSTS}
    both = np.maximum(*masks.values())
    for name, (src, pair, maps) in MAPS.items():
        raw = frames(src)
        gain, offset = colour_match([unzoom(raw[0]), unzoom(raw[-1])], [load(pair), cam], both)
        cache = {}
        def fr(i):
            if i not in cache: cache[i] = unzoom(raw[i]) * gain + offset
            return cache[i]
        out = []
        for n in range(FPS):
            o = cam
            for h in HOSTS:
                a, b, w = maps[h][n]
                o = o * (1 - masks[h]) + (fr(a) if w <= 0 else fr(b) if w >= 1 else fr(a) * (1 - w) + fr(b) * w) * masks[h]
            out.append(np.clip(o, 0, 255).astype(np.uint8))
        write(name, out, outdir)
        write(name.replace('_pc', '_cp'), out[::-1], outdir)
        print(name, {h: [(a if w <= 0 else b if w >= 1 else f'{a}>{b}@{w:.2f}') for a, b, w in maps[h]] for h in HOSTS}, 'gain', gain.round(3), 'offset', offset.round(1))

if __name__ == '__main__':
    main(*sys.argv[1:2])
