"""Measure the speech loudness of every show clip so the player can level them.

  python3 measure_levels.py <worktree>

Writes src/lib/spotlight/clipLevels.json: { "/show/...mp4": dBFS }, the RMS of
the speech-active 20ms frames (above -45 dBFS) inside the clip's speech span.
The player turns each into a gain toward one target (TARGET_DB in
SpotlightShowPlayer.tsx); generated lines are measured the same way at
runtime. Rerun after adding or re-cutting clips.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np

def rms_db(f, s0=None, s1=None):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'])
    a = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if s0 is not None:
        a = a[int(s0 * 16000):int(s1 * 16000)]
    n = len(a) // 320
    e = np.sqrt((a[:n * 320].reshape(n, 320) ** 2).mean(1))
    act = e[e > 10 ** (-45 / 20)]
    return round(float(20 * np.log10(np.sqrt((act ** 2).mean()))), 1) if len(act) else None

def main(wt):
    jobs = []
    for p in json.load(open(os.path.join(wt, 'src/lib/spotlight/phraseManifest.json'))):
        sp = p.get('speech') or {}
        jobs.append((p['src'], sp.get('start'), sp.get('end')))
    show = os.path.join(wt, 'public/show')
    for f in sorted(os.listdir(show)):
        if f.endswith('.mp4'):
            jobs.append(('/show/' + f, None, None))
    # Two-shots (theme openers, banter): both hosts in one clip.
    wide = os.path.join(show, 'wide')
    if os.path.isdir(wide):
        for f in sorted(os.listdir(wide)):
            if f.endswith('.mp4'):
                jobs.append(('/show/wide/' + f, None, None))
    with ThreadPoolExecutor(6) as ex:
        vals = list(ex.map(lambda j: rms_db(os.path.join(wt, 'public' + j[0]), j[1], j[2]), jobs))
    out = {j[0]: v for j, v in zip(jobs, vals) if v is not None}
    json.dump(out, open(os.path.join(wt, 'src/lib/spotlight/clipLevels.json'), 'w'), indent=0, sort_keys=True)
    print(len(out), 'clips measured')

if __name__ == '__main__':
    main(sys.argv[1])
