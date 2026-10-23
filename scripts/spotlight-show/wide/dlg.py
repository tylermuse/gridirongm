import json, os, sys, base64, urllib.request
V={'marcus':'NKI4WPSf2OjKR4G4fadW','tony':'aGw6gMq5DRXPll7WVlNn'}
lines=json.load(open(sys.argv[1])); out=sys.argv[2]
req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128',
  data=json.dumps({'model_id':'eleven_v3','inputs':[{'text':t,'voice_id':V[s]} for s,t in lines]}).encode(),
  headers={'xi-api-key':os.environ['ELEVENLABS_API_KEY'],'Content-Type':'application/json'})
j=json.load(urllib.request.urlopen(req, timeout=170))
open(out,'wb').write(base64.b64decode(j['audio_base64']))
spans={}
for s in j['voice_segments']:
    i=s['dialogue_input_index']; a,b=spans.get(i,(1e9,0)); spans[i]=(min(a,s['start_time_seconds']),max(b,s['end_time_seconds']))
json.dump([spans[i] for i in sorted(spans)], open(out+'.spans.json','w'))
print([ (lines[i][0], round(spans[i][0],2), round(spans[i][1],2)) for i in sorted(spans)])
