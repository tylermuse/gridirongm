#!/usr/bin/env python3
"""Make the 2026 roster open at the CURRENT NFL week: real schedule loaded,
real W-L through the games already played baked into team records, and the
played games removed from the upcoming schedule. Idempotent — regenerates the
full real schedule from ESPN each run, so it's safe to re-run every week after
the roster/injury refresh. Run from repo root."""
import json, subprocess
ROSTER="public/rosters/FBGM_NFL_Roster_2026_Updated.json"
ABBR_TID={'ARI':0,'ATL':1,'BAL':2,'BUF':3,'CAR':4,'CHI':5,'CIN':6,'CLE':7,'DAL':8,'DEN':9,'DET':10,'GB':11,'HOU':12,'IND':13,'JAX':14,'KC':15,'LV':16,'LAC':17,'LAR':18,'MIA':19,'MIN':20,'NE':21,'NO':22,'NYG':23,'NYJ':24,'PHI':25,'PIT':26,'SF':27,'SEA':28,'TB':29,'TEN':30,'WSH':31}
def curl(u): return json.loads(subprocess.run(["curl","-s","--max-time","30",u],capture_output=True,text=True).stdout or "{}")

d=json.load(open(ROSTER))
CID={t['tid']:t.get('cid') for t in d['teams']}; DID={t['tid']:t.get('did') for t in d['teams']}
full=[]; completed=[]
for wk in range(1,19):
    sc=curl(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week={wk}&dates=2026")
    for e in sc.get('events',[]):
        comp=e.get('competitions',[{}])[0]; st=(comp.get('status') or {}).get('type',{})
        cs=comp.get('competitors',[])
        h=next((c for c in cs if c.get('homeAway')=='home'),None); a=next((c for c in cs if c.get('homeAway')=='away'),None)
        if not h or not a: continue
        ha,aa=h['team']['abbreviation'],a['team']['abbreviation']
        if ha not in ABBR_TID or aa not in ABBR_TID: continue
        ht,at=ABBR_TID[ha],ABBR_TID[aa]
        full.append((wk,ht,at))
        if st.get('completed'):
            completed.append((wk,ht,at,int(h.get('score') or 0),int(a.get('score') or 0)))
print("schedule games:",len(full),"completed:",len(completed))

# records (reset then tally)
FIELDS=['won','lost','tied','wonHome','lostHome','tiedHome','wonAway','lostAway','tiedAway','wonDiv','lostDiv','tiedDiv','wonConf','lostConf','tiedConf']
rec={t:{k:0 for k in FIELDS} for t in range(32)}
def bump(tid,opp,res,home):
    r=rec[tid]; r[res]+=1; r[res+('Home' if home else 'Away')]+=1
    if DID[tid]==DID[opp]: r[res+'Div']+=1
    if CID[tid]==CID[opp]: r[res+'Conf']+=1
for wk,ht,at,hs,as_ in completed:
    hr,ar=('won','lost') if hs>as_ else ('lost','won') if hs<as_ else ('tied','tied')
    bump(ht,at,hr,True); bump(at,ht,ar,False)
for t in d['teams']:
    for s in t.get('seasons',[]):
        if s.get('season')==2026:
            for k in FIELDS: s[k]=rec[t['tid']][k]
            s['gpHome']=rec[t['tid']]['wonHome']+rec[t['tid']]['lostHome']+rec[t['tid']]['tiedHome']
            s['lastTen']=[]; s['streak']=0

done=set((wk,ht,at) for wk,ht,at,_,_ in completed)
d['schedule']=[{'gid':i,'day':wk,'homeTid':ht,'awayTid':at} for i,(wk,ht,at) in enumerate(g for g in full if g not in done)]
d['games']=[]
d['gameAttributes']['phase']=1; d['gameAttributes']['season']=2026
json.dump(d, open(ROSTER,'w'), ensure_ascii=False, allow_nan=False)
d2=json.load(open(ROSTER))
recs={t['abbrev']:next(s for s in t['seasons'] if s['season']==2026) for t in d2['teams']}
print("remaining schedule:",len(d2['schedule']),"| sample records:",{ab:f"{recs[ab]['won']}-{recs[ab]['lost']}" for ab in ['BUF','KC','DAL','ARI','SEA']})
