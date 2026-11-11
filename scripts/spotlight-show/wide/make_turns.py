"""The 1 s head turns cut in at a shot change (compose_shots.py), from the raw
generations in show-assets/wide2:

  turn_pc_raw.mp4    grinning pair -> camera -> smile fades to neutral
  turn_pc_n_raw.mp4  straight-faced pair -> camera

The generations come back ZOOM x larger than the stills they were made from
(about the frame centre), so each frame is scaled back down before the hosts
are laid over the still through the same feathered masks as the lip-sync
renders — otherwise both hosts sit ~9 px further apart for the second the
turn is on screen, and jump back when it ends.

Retimed to exactly 1 s (25 frames; compose_shots.TURN): the head turn itself
at the speed it was generated, the smile coming on / fading quicker.
`turn_cp*` is `turn_pc*` reversed.

Usage (in show-assets/wide2):  python3 make_turns.py [outdir]
"""
import subprocess, sys, numpy as np
from PIL import Image

W, H = 1920, 1080
ZOOM = 1.021            # measured: raw vs medium_cam / medium / medium_smile, both ends of both raws
CX, CY = 960.0, 539.5
FPS = 25

def ramp(*knots):
    """Raw frame for each of the 25 output frames: straight lines between (output frame, raw frame) knots."""
    out = []
    for n in range(FPS):
        for (n0, r0), (n1, r1) in zip(knots, knots[1:]):
            if n0 <= n <= n1:
                out.append(round(r0 + (r1 - r0) * (n - n0) / (n1 - n0))); break
    return out

# pair -> camera, as (output frame, raw frame) knots. Both start on raw frame 0 (the pair still) and end where the
# generation has settled on the camera still (the grinning one by ~70, the straight-faced one by ~80): the heads turn
# at twice the generated speed, then the grin fades / the pose settles quickly.
MAPS = {
    'turn_pc':   ('turn_pc_raw.mp4',   'medium_smile.png', ramp((0, 0), (17, 34), (24, 72))),
    'turn_pc_n': ('turn_pc_n_raw.mp4', 'medium.png',       ramp((0, 0), (18, 36), (24, 80))),
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
    m = np.maximum(np.asarray(Image.open('mask_marcus.png').convert('L'), np.float32), np.asarray(Image.open('mask_tony.png').convert('L'), np.float32))[..., None] / 255
    for name, (src, pair, idx) in MAPS.items():
        raw = frames(src)
        gain, offset = colour_match([unzoom(raw[0]), unzoom(raw[-1])], [load(pair), cam], m)
        out = [np.clip(cam * (1 - m) + (unzoom(raw[i]) * gain + offset) * m, 0, 255).astype(np.uint8) for i in idx]
        write(name, out, outdir)
        write(name.replace('_pc', '_cp'), out[::-1], outdir)
        print(name, 'raw frames', idx, 'gain', gain.round(3), 'offset', offset.round(1))

if __name__ == '__main__':
    main(*sys.argv[1:2])
