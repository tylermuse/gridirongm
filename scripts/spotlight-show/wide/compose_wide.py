"""Two-shot banter: each host is lip-synced on his own crop of the medium
two-shot (HeyGen animates one face per render), then both crops are laid
back over the still two-shot through feathered masks around each person.

Usage: python3 compose_wide.py <key>   (needs <key>.marcus.mp4, <key>.tony.mp4, <key>.mp3)
"""
import subprocess, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080
CROPS = {'marcus': (180, 120, 780, 720), 'tony': (1000, 120, 1600, 720)}
# Person regions (head + torso) in two-shot coordinates.
PERSON = {
    # Upper body kept clear of the TV pictures (the renders animate them);
    # below the TVs the full shoulders/arms.
    'marcus': [(340, 190, 640, 455), (230, 455, 700, 720)],
    'tony': [(1100, 190, 1420, 445), (990, 445, 1500, 720)],
}

def mask(host, path):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    x0, y0, x1, y1 = CROPS[host]
    for bx0, by0, bx1, by1 in PERSON[host]:
        d.rounded_rectangle((max(bx0, x0 + 20), max(by0, y0 + 20), min(bx1, x1 - 20), min(by1, y1 - 4)), radius=40, fill=255)
    m.filter(ImageFilter.GaussianBlur(14)).save(path)

def main(k):
    import os
    for h in CROPS:
        if not os.path.exists(f'mask_{h}.png'): mask(h, f'mask_{h}.png')
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'{k}.mp3']))
    (mx0, my0, mx1, my1), (tx0, ty0, tx1, ty1) = CROPS['marcus'], CROPS['tony']
    fc = (
        # Composite in RGB with a 3-plane mask (a 1-plane gray mask leaves
        # the chroma planes unmasked: a tinted box around each crop).
        f"[0:v]scale={W}:{H},format=gbrp[base];"
        f"[1:v]scale={mx1-mx0}:{my1-my0},format=gbrp,pad={W}:{H}:{mx0}:{my0}[m];"
        f"[2:v]scale={tx1-tx0}:{ty1-ty0},format=gbrp,pad={W}:{H}:{tx0}:{ty0}[t];"
        "[3:v]format=gray,format=gbrp[mm];[4:v]format=gray,format=gbrp[tm];"
        "[base][m][mm]maskedmerge[b1];[b1][t][tm]maskedmerge,format=yuv420p[o]"
    )
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y',
        '-loop', '1', '-i', 'medium.png', '-i', f'{k}.marcus.mp4', '-i', f'{k}.tony.mp4',
        '-loop', '1', '-i', 'mask_marcus.png', '-loop', '1', '-i', 'mask_tony.png', '-i', f'{k}.mp3',
        '-filter_complex', fc, '-map', '[o]', '-map', '5:a', '-t', f'{dur + 0.3:.2f}', '-r', '25',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', f'{k}.mp4'])
    print('wrote', f'{k}.mp4')

if __name__ == '__main__':
    main(sys.argv[1])
