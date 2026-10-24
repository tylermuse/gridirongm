"""Voice a two-shot script with ElevenLabs v3 dialogue.
Usage: python3 dlg.py <key>.json <key>.mp3
Writes <key>.mp3 with a 0.6 s lead-in (HeyGen's lips start late when speech
begins at 0 s) and 0.4 s of room at the end, and <key>.mp3.spans.json: each
line's [start, end], moved to the real pauses between lines (snap_spans.py)."""
import json, os, sys, base64, urllib.request, subprocess
from snap_spans import snap, pcm
V={'marcus':'NKI4WPSf2OjKR4G4fadW','tony':'aGw6gMq5DRXPll7WVlNn'}
LEAD, TAIL = 0.6, 0.4
lines=json.load(open(sys.argv[1])); out=sys.argv[2]; raw=out+'.raw.mp3'
req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128',
  data=json.dumps({'model_id':'eleven_v3','inputs':[{'text':t,'voice_id':V[s]} for s,t in lines]}).encode(),
  headers={'xi-api-key':os.environ['ELEVENLABS_API_KEY'],'Content-Type':'application/json'})
j=json.load(urllib.request.urlopen(req, timeout=170))
open(raw,'wb').write(base64.b64decode(j['audio_base64']))
spans={}
for s in j['voice_segments']:
    i=s['dialogue_input_index']; a,b=spans.get(i,(1e9,0)); spans[i]=(min(a,s['start_time_seconds']),max(b,s['end_time_seconds']))
spans=snap(pcm(raw), 16000, [list(spans[i]) for i in sorted(spans)])
subprocess.check_call(['ffmpeg','-v','error','-y','-i',raw,'-af',f'adelay={int(LEAD*1000)}|{int(LEAD*1000)},apad=pad_dur={TAIL}','-c:a','libmp3lame','-b:a','128k',out])
spans=[[a+LEAD,b+LEAD] for a,b in spans]
json.dump(spans, open(out+'.spans.json','w'))
print([(lines[i][0], round(a,2), round(b,2)) for i,(a,b) in enumerate(spans)])
