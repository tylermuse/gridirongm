"""Two-shot with shot changes: the hosts face each other (medium.png) on
some lines and the camera (medium_cam.png) on others, cutting at the pauses
between lines. Each host is lip-synced per shot: full-clip renders on the
facing-each-other crops (<key>.<host>.mp4) and per-segment renders on the
facing-camera crops (<key>__<n>.<host>.cam.mp4, made from audio slices with
a 0.6 s lead-in). HeyGen's lips run ahead of the voice, so every render is
delayed by SYNC. Both hosts are laid over the still through feathered masks.

Usage: python3 compose_shots.py <key>   (reads plan.json: segments per clip)
"""
import json, os, subprocess, sys
from compose_wide import CROPS, mask, W, H

SYNC = 0.16      # video delayed this much: lips were early
LEAD = 0.6       # silent lead-in in the segment slices

def layers(base, m, t, m_from, t_from, dur, out):
    (mx0, my0, mx1, my1), (tx0, ty0, tx1, ty1) = CROPS['marcus'], CROPS['tony']
    fc = (f"[0:v]scale={W}:{H},format=gbrp[base];"
          f"[1:v]tpad=start_mode=clone:start_duration={SYNC},trim=start={m_from:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=2,scale={mx1-mx0}:{my1-my0},format=gbrp,pad={W}:{H}:{mx0}:{my0}[m];"
          f"[2:v]tpad=start_mode=clone:start_duration={SYNC},trim=start={t_from:.3f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=2,scale={tx1-tx0}:{ty1-ty0},format=gbrp,pad={W}:{H}:{tx0}:{ty0}[t];"
          "[3:v]format=gray,format=gbrp[mm];[4:v]format=gray,format=gbrp[tm];"
          "[base][m][mm]maskedmerge[b1];[b1][t][tm]maskedmerge,format=yuv420p[o]")
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', base, '-i', m, '-i', t,
        '-loop', '1', '-i', 'mask_marcus.png', '-loop', '1', '-i', 'mask_tony.png',
        '-filter_complex', fc, '-map', '[o]', '-t', f'{dur:.3f}', '-r', '25', '-an',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', out])

def main(k):
    for h in CROPS:
        if not os.path.exists(f'mask_{h}.png'): mask(h, f'mask_{h}.png')
    plan = json.load(open('plan.json'))[k]
    dur = plan['dur']
    parts = []
    for n, sg in enumerate(plan['segs']):
        a, b, start = sg['a'], sg['b'], sg['start']  # start: timeline; a: where the slice's audio began
        if n == len(plan['segs']) - 1: b = dur + 0.3
        out = f'parts/{k}__{n}.mp4'; os.makedirs('parts', exist_ok=True)
        if sg['kind'] == 'c':
            # segment render: slice time = LEAD + (t - a); every layer is first padded by SYNC
            layers('medium_cam.png', f"{sg['id']}.marcus.cam.mp4", f"{sg['id']}.tony.cam.mp4", LEAD + start - a, LEAD + start - a, b - start, out)
        else:
            layers('medium.png', f'{k}.marcus.mp4', f'{k}.tony.mp4', start, start, b - start, out)
        parts.append(out)
    open(f'parts/{k}.txt', 'w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', f'parts/{k}.txt', '-i', f'{k}.mp3',
        '-map', '0:v', '-map', '1:a', '-af', 'apad', '-t', f'{dur + 0.3:.3f}', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', f'{k}.mp4'])
    print('wrote', f'{k}.mp4', 'segments', [s['kind'] for s in plan['segs']])

if __name__ == '__main__':
    main(sys.argv[1])
