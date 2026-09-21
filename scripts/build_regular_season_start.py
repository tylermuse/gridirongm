#!/usr/bin/env python3
"""Convert the 2026 roster file from a post-season free-agency state into a
Week-1 regular-season opener with the REAL 2026 NFL schedule loaded.

Run from repo root: python3 scripts/build_regular_season_start.py
"""
import json, subprocess
ROSTER="public/rosters/FBGM_NFL_Roster_2026_Updated.json"
ABBR_TID={'ARI':0,'ATL':1,'BAL':2,'BUF':3,'CAR':4,'CHI':5,'CIN':6,'CLE':7,'DAL':8,'DEN':9,'DET':10,'GB':11,'HOU':12,'IND':13,'JAX':14,'KC':15,'LV':16,'LAC':17,'LAR':18,'MIA':19,'MIN':20,'NE':21,'NO':22,'NYG':23,'NYJ':24,'PHI':25,'PIT':26,'SF':27,'SEA':28,'TB':29,'TEN':30,'WSH':31}
SEASON=2026
def curl(u): return json.loads(subprocess.run(["curl","-s","--max-time","30",u],capture_output=True,text=True).stdout or "{}")

def real_schedule():
    games=[]
    for wk in range(1,19):
        d=curl(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week={wk}&dates={SEASON}")
        for e in d.get('events',[]):
            comp=e.get('competitions',[{}])[0]; cs=comp.get('competitors',[])
            h=next((c for c in cs if c.get('homeAway')=='home'),None); a=next((c for c in cs if c.get('homeAway')=='away'),None)
            if not h or not a: continue
            ha=h['team']['abbreviation']; aa=a['team']['abbreviation']
            if ha in ABBR_TID and aa in ABBR_TID:
                games.append((wk, ABBR_TID[ha], ABBR_TID[aa]))
    return games

d=json.load(open(ROSTER)); P=d['players']; ga=d['gameAttributes']
assert isinstance(ga,dict)
# 1) phase -> regular season, week 1, nothing played
ga['phase']=1; ga['season']=SEASON; ga['nextPhase']=None
# 2) reset the simulated 2026 season on every team
ZERO=['won','lost','tied','otl','wonHome','lostHome','tiedHome','otlHome','wonAway','lostAway','tiedAway','otlAway','wonDiv','lostDiv','tiedDiv','otlDiv','wonConf','lostConf','tiedConf','otlConf','gpHome','att']
resetT=0
for t in d['teams']:
    t['seasons']=[s for s in t.get('seasons',[]) if s.get('season')!=SEASON] + [next((s for s in t.get('seasons',[]) if s.get('season')==SEASON),None)]
    t['seasons']=[s for s in t['seasons'] if s]
    for s in t['seasons']:
        if s.get('season')==SEASON:
            for k in ZERO:
                if k in s: s[k]=0
            s['lastTen']=[]; s['streak']=0; s['playoffRoundsWon']=-1
            s.pop('clinchedPlayoffs',None); s.pop('ownerMood',None)
            resetT+=1
    # team stats for 2026 -> drop (regenerated as games play)
    t['stats']=[st for st in t.get('stats',[]) if st.get('season')!=SEASON]
# 3) drop player 2026 stats so the season starts statless
resetP=0
for p in P:
    n0=len(p.get('stats') or [])
    if p.get('stats'): p['stats']=[s for s in p['stats'] if s.get('season')!=SEASON]
    resetP+= n0-len(p.get('stats') or [])
# 4) inject real schedule
sched=real_schedule()
d['schedule']=[{'gid':i,'day':wk,'homeTid':h,'awayTid':a} for i,(wk,h,a) in enumerate(sched)]
d['games']=[]
json.dump(d, open(ROSTER,'w'), ensure_ascii=False, allow_nan=False)
# verify
d2=json.load(open(ROSTER))
print(json.dumps({"phase":d2['gameAttributes']['phase'],"season":d2['gameAttributes']['season'],
 "teams_reset":resetT,"player_stat_rows_dropped":resetP,"schedule_games":len(d2['schedule']),
 "players":len(d2['players']),"weeks":sorted(set(g['day'] for g in d2['schedule']))}))
