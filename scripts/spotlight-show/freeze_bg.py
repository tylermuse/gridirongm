"""Freeze the studio TV screens behind the host (the generators animate the
football player on them). Replaces those regions of every frame with the
first frame, through a feathered mask that stays clear of the host."""
import subprocess, sys, os, numpy as np
from PIL import Image, ImageFilter

# Screen regions as fractions of the frame (x0, y0, x1, y1) — same framing
# for both hosts' portraits.
SCREENS = [(0.0, 0.0, 0.285, 0.50), (0.735, 0.0, 1.0, 0.49)]

def probe(f):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).decode().strip()
    w, h = map(int, out.split(','))
    return w, h

def make_mask(w, h, path):
    m = Image.new('L', (w, h), 0)
    px = np.zeros((h, w), np.uint8)
    for x0, y0, x1, y1 in SCREENS:
        px[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 255
    m = Image.fromarray(px).filter(ImageFilter.GaussianBlur(radius=max(2, w // 320)))
    m.save(path)

def freeze(src, dst, extra_vf=None, extra_args=()):
    w, h = probe(src)
    tmp = dst + '.parts'
    os.makedirs(tmp, exist_ok=True)
    plate, mask = os.path.join(tmp, 'plate.png'), os.path.join(tmp, 'mask.png')
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', src, '-frames:v', '1', plate])
    make_mask(w, h, mask)
    fc = ('[1:v]format=yuv444p[p];[2:v]format=gray,scale=%d:%d[m];[0:v]format=yuv444p[v];'
          '[v][p][m]maskedmerge,format=yuv420p' % (w, h))
    if extra_vf:
        fc += ',' + extra_vf
    fc += '[o]'
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', *extra_args, '-i', src, '-loop', '1', '-i', plate, '-loop', '1', '-i', mask,
                           '-filter_complex', fc, '-map', '[o]', '-map', '0:a?', '-shortest',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-c:a', 'copy', '-movflags', '+faststart', dst])
    for f in (plate, mask):
        os.remove(f)
    os.rmdir(tmp)

if __name__ == '__main__':
    freeze(sys.argv[1], sys.argv[2])
