"""Show music and effects from ElevenLabs (Music + Sound Effects APIs).
Writes 3 variants per cue (sfx_<id>_<n>.mp3 / mus_<id>_<n>.mp3); the picks
were trimmed, faded and loudness-normalized (-16 LUFS) into public/show/sfx:
whoosh=2 pop=1 stamp=stamp2_0 meter=2 alarm=2 slam=1 open=0 outro=0
panic=0 buysell=0 contender=2.  Needs ELEVENLABS_API_KEY.
"""
import json, os, sys, urllib.request, concurrent.futures as cf
K=os.environ['ELEVENLABS_API_KEY']
def post(url, body, out):
    if os.path.exists(out): return out, 'cached'
    r=urllib.request.Request(url, json.dumps(body).encode(), {'xi-api-key':K,'content-type':'application/json'})
    try:
        d=urllib.request.urlopen(r, timeout=300).read(); open(out,'wb').write(d); return out, len(d)
    except urllib.error.HTTPError as e: return out, e.read()[:300]
SFX={
 'whoosh':('Clean modern sports TV graphics transition whoosh, quick airy swoosh with a soft low thump at the end, no music',1.0),
 'pop':('Crisp short UI pop click for an on-screen graphic chip appearing, sports broadcast, bright and clean',0.5),
 'stamp':('Heavy rubber stamp slam onto a wooden desk, punchy single hit with short room tail',0.8),
 'meter':('Rising electronic meter fill sound, quick ascending digital ticks building tension, sports TV graphic',1.2),
 'alarm':('Short sports TV panic alarm sting, two quick klaxon blasts, punchy, not too long',1.2),
 'slam':('Big cinematic sports title slam hit, deep boom with metallic impact and whoosh tail, broadcast graphic',1.5),
}
MUS={
 'open':('Instrumental sports talk show opening theme, punchy and modern, driving drums, bold brass stabs, gritty electric guitar, energetic NFL broadcast feel, starts immediately with a hit, ends on a big final hit, no vocals',7000),
 'outro':('Instrumental sports talk show closing theme, upbeat confident groove, drums brass and guitar, NFL broadcast feel, resolves with a clean final ending hit, no vocals',8000),
 'panic':('Instrumental tense sports TV stinger, urgent staccato strings and pounding drums with alarm-like synth, short dramatic hit ending, no vocals',3500),
 'buysell':('Instrumental sports TV stinger, upbeat funky stock-market energy, ticking hi-hats, brass stab, short ending hit, no vocals',3500),
 'contender':('Instrumental sports TV stinger, triumphant heroic brass and big drums, championship feel, short ending hit, no vocals',3500),
}
jobs=[]
with cf.ThreadPoolExecutor(3) as ex:
    for k,(t,d) in SFX.items():
        for v in range(3): jobs.append(ex.submit(post,'https://api.elevenlabs.io/v1/sound-generation',{'text':t,'duration_seconds':d,'prompt_influence':0.6},f'sfx_{k}_{v}.mp3'))
    for k,(t,ms) in MUS.items():
        for v in range(3): jobs.append(ex.submit(post,'https://api.elevenlabs.io/v1/music',{'prompt':t,'music_length_ms':ms,'force_instrumental':True},f'mus_{k}_{v}.mp3'))
    for j in jobs: print(*j.result())
