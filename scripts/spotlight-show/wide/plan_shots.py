"""Turn shots.json (per clip, one letter per line: c = camera, p = each other)
into plan.json (the clip's segments on the timeline) and, for every camera
segment, an audio slice per host in seg/ for HeyGen: the other host's lines
muted, 0.6 s of silence in front (HeyGen's lips start late otherwise) and
0.4 s after. Needs <key>.json, <key>.mp3, <key>.mp3.spans.json per clip.

Usage: python3 plan_shots.py [key ...]   (default: every clip in shots.json)
"""
import json, os, subprocess, sys

LEAD, TAIL = 0.6, 0.4

def main(keys):
    shots = json.load(open('shots.json'))
    plan = json.load(open('plan.json')) if os.path.exists('plan.json') else {}
    os.makedirs('seg', exist_ok=True)
    for k in keys or shots:
        sh = shots[k]
        lines = json.load(open(f'{k}.json')); sp = json.load(open(f'{k}.mp3.spans.json'))
        assert len(sh) == len(lines) == len(sp), k
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'{k}.mp3']))
        segs = []
        for i, ((a, b), c) in enumerate(zip(sp, sh)):
            if i == len(sp) - 1: b = dur
            if segs and segs[-1]['kind'] == c and abs(segs[-1]['b'] - a) < 1e-6: segs[-1]['b'] = b
            else: segs.append({'kind': c, 'a': a, 'b': b})
        for n, sg in enumerate(segs):
            sg['start'] = 0.0 if n == 0 else sg['a']  # timeline; 'a' is where the slice's audio begins
            if sg['kind'] != 'c': continue
            sg['id'] = f'{k}__{n}'
            for host in ('marcus', 'tony'):
                mute = [f"between(t,{x:.3f},{y:.3f})" for (s, _), (x, y) in zip(lines, sp) if s != host]
                fc = ("[0:a]" + (f"volume=enable='{'+'.join(mute)}':volume=0," if mute else '')
                      + f"atrim={sg['a']:.3f}:{sg['b']:.3f},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a];"
                      f"aevalsrc=0:d={LEAD}:s=44100:c=stereo[s0];aevalsrc=0:d={TAIL}:s=44100:c=stereo[s1];[s0][a][s1]concat=n=3:v=0:a=1[o]")
                subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', f'{k}.mp3', '-filter_complex', fc, '-map', '[o]',
                                       '-c:a', 'libmp3lame', '-b:a', '128k', f"seg/{sg['id']}.{host}.mp3"])
        plan[k] = {'dur': dur, 'segs': segs}
        print(k, ''.join(s['kind'] for s in segs), [round(s['b'] - s['start'], 2) for s in segs])
    json.dump(plan, open('plan.json', 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:])
