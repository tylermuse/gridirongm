"""Writes public/chase-cam/clips-extra.js: the captured locomotion clips (cc_*) and the extra throws (football_throw_b..e) that
player-mh2.js carries and player-fp27.js does not, as plain keyframe data. The sim loads it for any player file without cc_jog
(the two models share one skeleton and rest rotations, so the tracks apply as they are; the hips' travel is scaled to the
other model's hip height at load). Run again after rebuilding player-mh2.js:  python3 scripts/playerlab/extract_clips.py"""
import sys, os, re, base64, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glb
import numpy as np
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src=open(os.path.join(ROOT,'public/chase-cam/player-mh2.js')).read()
j,acc,_=glb.read_glb(base64.b64decode(re.search(r'PLAYER_GLB_B64\s*=\s*"([^"]+)"',src).group(1)))
info=json.loads(re.search(r'PLAYER_INFO\s*=\s*(\{.*?\});',src,re.S).group(1))
b64=lambda a: base64.b64encode(np.ascontiguousarray(a,dtype='<f4').tobytes()).decode()
hips=next(n for n in j['nodes'] if n.get('name')=='mixamorig:Hips')
out={'from':'player-mh2.js','hipsY':hips['translation'][1],'clipSpeed':info.get('clipSpeed',{}),'clips':[]}
for an in j['animations']:
    if not (an['name'].startswith('cc_') or re.match(r'football_throw_[b-e]$',an['name'])): continue
    times=[]; tix={}; tracks=[]
    for ch in an['channels']:
        sm=an['samplers'][ch['sampler']]; path=ch['target']['path']
        if path not in ('rotation','translation') or sm.get('interpolation','LINEAR')!='LINEAR': sys.exit('extract_clips: unexpected channel in '+an['name'])
        if sm['input'] not in tix: tix[sm['input']]=len(times); times.append(b64(acc(sm['input'])))
        tracks.append([j['nodes'][ch['target']['node']]['name'], path, tix[sm['input']], b64(acc(sm['output']))])
    out['clips'].append({'name':an['name'],'times':times,'tracks':tracks})
dst=os.path.join(ROOT,'public/chase-cam/clips-extra.js')
open(dst,'w').write('/* Captured locomotion + extra throw clips, extracted from player-mh2.js by scripts/playerlab/extract_clips.py (same licensed sources; see scripts/playerlab/README.md). */\nwindow.PLAYER_CLIPS='+json.dumps(out,separators=(',',':'))+';\n')
print('wrote',dst,os.path.getsize(dst),'bytes,',len(out['clips']),'clips')
