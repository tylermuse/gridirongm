"""Per-host audio tracks for a dialogue: the other host's turns silenced."""
import json, subprocess, sys
k = sys.argv[1]
lines = json.load(open(f'{k}.json')); spans = json.load(open(f'{k}.mp3.spans.json'))
for host in ('marcus', 'tony'):
    mute = [f"between(t,{a:.3f},{b:.3f})" for (s, _), (a, b) in zip(lines, spans) if s != host]
    af = f"volume=enable='{'+'.join(mute)}':volume=0" if mute else 'anull'
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', f'{k}.mp3', '-af', af, '-c:a', 'libmp3lame', '-b:a', '128k', f'{k}.{host}.mp3'])
print(k, 'ok')
