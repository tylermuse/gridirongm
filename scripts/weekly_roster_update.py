#!/usr/bin/env python3
"""
Weekly NFL roster refresh for FBGM_NFL_Roster_2026_Updated.json.

Run from the repo root:  python3 scripts/weekly_roster_update.py

Pulls current ESPN data and updates the 2026 roster in place:
  - reconciles each team's roster (signings / cuts / IR / practice squad / un-retirements)
    against ESPN active rosters (active + IR + practice squad kept on the team)
  - sets per-player injuries from the ESPN injury report (Out / Doubtful / IR)
  - refreshes the rosters-page card: title date, lastUpdated, cacheBust, and a
    "records through Week N" note with the division leaders
  - writes a dated changelog with full standings + a move/injury summary

Keeps the file a Week-1 season opener (does NOT bake W-L into team.seasons).
Idempotent-ish: re-running against the same ESPN state yields the same result.
"""
import json, re, sys, subprocess, datetime, os
from collections import defaultdict, Counter

ROSTER = "public/rosters/FBGM_NFL_Roster_2026_Updated.json"
PAGE   = "src/app/rosters/page.tsx"
TID_ABBR = {0:'ari',1:'atl',2:'bal',3:'buf',4:'car',5:'chi',6:'cin',7:'cle',8:'dal',9:'den',10:'det',11:'gb',12:'hou',13:'ind',14:'jax',15:'kc',16:'lv',17:'lac',18:'lar',19:'mia',20:'min',21:'ne',22:'no',23:'nyg',24:'nyj',25:'phi',26:'pit',27:'sf',28:'sea',29:'tb',30:'ten',31:'wsh'}
TEAM_NAME = {0:'Cardinals',1:'Falcons',2:'Ravens',3:'Bills',4:'Panthers',5:'Bears',6:'Bengals',7:'Browns',8:'Cowboys',9:'Broncos',10:'Lions',11:'Packers',12:'Texans',13:'Colts',14:'Jaguars',15:'Chiefs',16:'Raiders',17:'Chargers',18:'Rams',19:'Dolphins',20:'Vikings',21:'Patriots',22:'Saints',23:'Giants',24:'Jets',25:'Eagles',26:'Steelers',27:'49ers',28:'Seahawks',29:'Buccaneers',30:'Titans',31:'Commanders'}

import time
def curl(url):
    for _ in range(4):
        try:
            r = subprocess.run(["curl","-s","--max-time","30",url], capture_output=True, text=True)
            if r.stdout.strip():
                return json.loads(r.stdout)
        except Exception:
            pass
        time.sleep(1.5)
    return {}

# ---------- ESPN fetch ----------
def fetch_espn():
    sb = curl("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
    week = sb.get("week",{}).get("number")
    def classify_group(g):
        return {'offense':'active','defense':'active','specialTeam':'active','injuredReserveOrOut':'ir','practiceSquad':'ps','suspended':'susp'}.get(g,'active')
    teams={}; ok=set()
    for tid,ab in TID_ABBR.items():
        d = curl(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{ab}/roster")
        players=[]
        if d.get('athletes'):
            for grp in d['athletes']:
                g=grp.get('position')
                for it in grp.get('items',[]):
                    st=it.get('status',{})
                    players.append({'name':it.get('fullName') or it.get('displayName'),'jersey':str(it.get('jersey') or '').lstrip('#'),'pos':(it.get('position') or {}).get('abbreviation'),'unit':classify_group(g),'status':st.get('name') if isinstance(st,dict) else st})
        else:  # ARI /roster 404s on a broken contract sub-fetch -> team?enable=roster fallback
            d2 = curl(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{ab}?enable=roster")
            for it in d2.get('team',{}).get('athletes',[]):
                st=it.get('status',{}); nm=(st.get('name') if isinstance(st,dict) else st) or ''
                unit='ir' if 'injured' in nm.lower() else ('ps' if 'practice' in nm.lower() else 'active')
                players.append({'name':it.get('fullName') or it.get('displayName'),'jersey':str(it.get('jersey') or '').lstrip('#'),'pos':(it.get('position') or {}).get('abbreviation'),'unit':unit,'status':nm})
        teams[tid]={'abbr':ab,'players':players}
        if players: ok.add(tid)
    # records (per-team; the teams-list endpoint returns 0-0 during the season)
    for tid,ab in TID_ABBR.items():
        rec='0-0'
        try:
            td=curl(f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{ab}")
            items=(td.get('team',{}).get('record') or {}).get('items',[])
            tot=next((i for i in items if i.get('type')=='total'), items[0] if items else None)
            if tot and tot.get('summary'): rec=tot['summary']
        except Exception: pass
        teams[tid]['record']=rec
    # injuries
    inj = curl("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries")
    injured=[]
    for t in inj.get('injuries',[]):
        for a in t.get('injuries',[]):
            ath=a.get('athlete',{})
            injured.append({'name':ath.get('displayName'),'pos':(ath.get('position') or {}).get('abbreviation'),
                            'status':a.get('status'),'type':(a.get('details') or {}).get('type') or a.get('type')})
    return week, teams, injured, ok

# ---------- name matching (ported from the reconciliation) ----------
SUF={'jr','sr','ii','iii','iv','v'}
def normtoks(n):
    if not n: return []
    n=n.lower().replace('’',"'").replace('‘',"'").replace('ʼ',"'")
    n=re.sub(r'"[^"]*"',' ',n).replace("'",'').replace('.','').replace('-',' ').replace(',',' ')
    t=[x for x in n.split() if x]
    while t and t[-1] in SUF: t.pop()
    return t
def keyset(name):
    t=normtoks(name); ks=set()
    if not t: return ks
    ks.add(' '.join(t))
    if len(t)>=2: ks.add(t[0]+' '+t[-1])
    return ks
def gkeys(first,last):
    raw=(first or '')+' '+(last or ''); ks=keyset(raw)
    m=re.search(r'"([^"]+)"',raw)
    if m:
        t=normtoks(raw); nk=normtoks(m.group(1))
        if t and nk: ks.add(' '.join(nk)+' '+t[-1])
    return ks
def lastn(first,last):
    t=normtoks((first or '')+' '+(last or '')); return t[-1] if t else ''
GRP={'QB':'QB','RB':'RB','FB':'RB','WR':'WR','TE':'TE','G':'OL','OG':'OL','T':'OL','OT':'OL','C':'OL','OL':'OL','LS':'OL','DE':'DL','DT':'DL','NT':'DL','DL':'DL','EDGE':'DL','LB':'LB','ILB':'LB','OLB':'LB','MLB':'LB','CB':'CB','DB':'CB','S':'S','FS':'S','SS':'S','K':'K','PK':'K','P':'P'}
def grp(p): return GRP.get((p or '').upper())
def latest_ovr(p):
    r=p.get('ratings') or []; return (r[-1].get('ovr') if r else 0) or 0
def gpos(p):
    if p.get('pos'): return p['pos']
    r=p.get('ratings') or []; return r[-1].get('pos') if r else None
NICK={('pat','patrick'),('mike','michael'),('rob','robert'),('chris','christopher'),('will','william'),('nate','nathaniel'),('joe','joseph'),('greg','gregory'),('cam','cameron'),('dax','daxton'),('kam','kamren'),('kenny','kenneth'),('josh','joshua'),('jake','jacob')}

def reconcile(d, espn, ok):
    P=d['players']; recs={}; gindex=defaultdict(list); by_last=defaultdict(list)
    for p in P:
        r={'pid':p['pid'],'tid':p.get('tid'),'pos':gpos(p),'ovr':latest_ovr(p),
           'jersey':str(p.get('jerseyNumber') or '').lstrip('#'),
           'first':(normtoks(p.get('firstName') or '') or [''])[0],'ln':lastn(p.get('firstName'),p.get('lastName'))}
        recs[p['pid']]=r
        for k in gkeys(p.get('firstName'),p.get('lastName')): gindex[k].append(r)
        by_last[lastn(p.get('firstName'),p.get('lastName'))].append(r)
    claimed=set(); assign={}
    order=['active','ir','ps','susp']
    def urank(u):
        try: return order.index(u)
        except: return 9
    for tid in range(32):
        for ep in sorted(espn[tid]['players'], key=lambda x: urank(x.get('unit'))):
            ej=ep.get('jersey') or ''; eg=grp(ep.get('pos'))
            pool={}; exact=set()
            for k in keyset(ep['name']):
                for c in gindex.get(k,[]): pool[c['pid']]=c; exact.add(c['pid'])
            eln=(normtoks(ep['name']) or [''])[-1]
            for c in by_last.get(eln,[]):
                if c['tid']==tid: pool.setdefault(c['pid'],c)
            elig=[c for c in pool.values() if c['pid'] not in claimed and (c['pid'] in exact or c['tid']==tid)]
            if not elig: continue
            def st(c): return (3 if ej and c['jersey']==ej else 0)+(2 if eg and grp(c['pos'])==eg else 0)+(2 if c['tid']==tid else 0)
            ch=max(elig,key=lambda c:(st(c),c['ovr'],1 if c['pid'] in exact else 0))
            claimed.add(ch['pid']); assign[ch['pid']]=tid
    # dedup-swap: keep higher-rated of same-person duplicates on a team
    def same(a,b):
        fa,fb=recs[a]['first'],recs[b]['first']
        return bool(fa and fb and (fa in fb or fb in fa)) or (fa,fb) in NICK or (fb,fa) in NICK
    abt=defaultdict(list)
    for pid,tid in list(assign.items()): abt[(tid,recs[pid]['ln'])].append(pid)
    for p in P:
        xp=p['pid']; xt=p.get('tid')
        if xp in assign or not(isinstance(xt,int) and 0<=xt<=31): continue
        ln=lastn(p.get('firstName'),p.get('lastName'))
        for yp in sorted(abt.get((xt,ln),[]),key=lambda q:recs[q]['ovr']):
            if yp!=xp and same(xp,yp) and recs[xp]['ovr']>recs[yp]['ovr']:
                assign[xp]=xt; del assign[yp]; abt[(xt,ln)].remove(yp); abt[(xt,ln)].append(xp); break
    # apply: assigned -> team (un-retire if needed); on-team-not-assigned & ovr<65 -> FA
    moves=0; unret=0; cuts=0
    for p in P:
        pid=p['pid']; cur=p.get('tid')
        if pid in assign:
            nt=assign[pid]
            if cur!=nt:
                if cur==-3: p['retiredYear']=None; unret+=1
                p['tid']=nt; moves+=1
        elif isinstance(cur,int) and 0<=cur<=31 and cur in ok and latest_ovr(p)<65:
            p['tid']=-1; cuts+=1
    return moves,unret,cuts

def lastn_by_pid(P,pid):
    for p in P:
        if p['pid']==pid: return lastn(p.get('firstName'),p.get('lastName'))
    return ''

# ---------- injuries ----------
def apply_injuries(d, injured):
    P=d['players']
    idx=defaultdict(list)
    for p in P:
        if isinstance(p.get('tid'),int) and 0<=p['tid']<=31:
            idx[' '.join(normtoks((p.get('firstName') or '')+' '+(p.get('lastName') or '')))].append(p)
    # reset
    for p in P: p['injury']={'type':'Healthy','gamesRemaining':0}
    def games(status):
        s=(status or '').lower()
        if any(w in s for w in ('injured reserve','ir','physically unable','pup','non-football','non football')): return 8
        if 'out' in s: return 2
        if 'doubtful' in s: return 1
        return 0  # Questionable / Day-To-Day / Suspension -> not marked injured
    n=0
    for a in injured:
        g=games(a.get('status'))
        if g<=0: continue
        cands=idx.get(' '.join(normtoks(a.get('name'))),[])
        if not cands: continue
        pick=cands[0]
        if len(cands)>1 and a.get('pos'):
            eg=grp(a['pos'])
            m=[c for c in cands if grp(gpos(c))==eg]
            if m: pick=m[0]
        pick['injury']={'type':a.get('type') or 'Injury','gamesRemaining':g}
        n+=1
    return n

# ---------- page + changelog ----------
def update_page(week, teams, today):
    s=open(PAGE,encoding='utf-8').read()
    a=s.index("id: 'nfl-2026-updated'"); b=s.index("id: 'nfl-1994-montana-era'"); seg=s[a:b]; orig=seg
    datestr=today.strftime('%B %-d, %Y')
    seg=re.sub(r"title: 'NFL 2026 Roster — Updated [^']*',", f"title: 'NFL 2026 Roster — Updated {datestr}',", seg, count=1)
    seg=re.sub(r"lastUpdated: '[^']*',", f"lastUpdated: '{datestr}',", seg, count=1)
    m=re.search(r'cacheBust: (\d+),', seg); cb=int(m.group(1))+1 if m else 16
    seg=re.sub(r'cacheBust: \d+,', f'cacheBust: {cb},', seg, count=1)
    # division leaders line
    def wl(rec):
        try: w,l=rec.split('-')[:2]; return int(w),int(l)
        except: return 0,0
    order=sorted(range(32), key=lambda t:(-wl(teams[t]['record'])[0], wl(teams[t]['record'])[1]))
    leaders=', '.join(f"{TEAM_NAME[t]} {teams[t]['record']}" for t in order[:5])
    note=f" Weekly refresh (through Week {week}): rosters + injuries updated; best records so far — {leaders}."
    seg=re.sub(r"(Starts at the 2026 regular season\.)(?: Weekly refresh \(through Week \d+\)[^']*?\.)?",
               r"\1"+note, seg, count=1)
    open(PAGE,'w',encoding='utf-8').write(s[:a]+seg+s[b:])
    return cb

def write_changelog(week, teams, today, moves, unret, cuts, ninj):
    def wl(rec):
        try: w,l=rec.split('-')[:2]; return int(w),int(l)
        except: return 0,0
    order=sorted(range(32), key=lambda t:(-wl(teams[t]['record'])[0], wl(teams[t]['record'])[1]))
    L=[f"# NFL 2026 Roster — Weekly Refresh (through Week {week})", f"_{today.strftime('%B %-d, %Y')}_", "",
       "## Changes", f"- {moves} roster moves (signings/cuts/IR/practice-squad/team changes)",
       f"- {unret} players un-retired to match active rosters", f"- {cuts} players released to free agency",
       f"- {ninj} players flagged injured (Out / Doubtful / IR) from the ESPN report", "",
       "## Standings through Week "+str(week)]
    for t in order: L.append(f"- {TEAM_NAME[t]}: {teams[t]['record']}")
    os.makedirs("roster-updates",exist_ok=True)
    fn=f"roster-updates/{today.strftime('%Y-%m-%d')}.md"
    open(fn,'w').write("\n".join(L)); return fn

def main():
    today=datetime.date.today()
    week, teams, injured, ok = fetch_espn()
    if len(ok)<30:
        print(json.dumps({"error":f"only {len(ok)}/32 team rosters fetched; aborting"})); sys.exit(1)
    d=json.load(open(ROSTER))
    n0=len(d['players'])
    moves,unret,cuts = reconcile(d, teams, ok)
    ninj = apply_injuries(d, injured)
    assert len(d['players'])==n0
    json.dump(d, open(ROSTER,'w'), ensure_ascii=False, allow_nan=False)
    cb = update_page(week, teams, today)
    fn = write_changelog(week, teams, today, moves, unret, cuts, ninj)
    print(json.dumps({"week":week,"moves":moves,"unretired":unret,"cuts":cuts,"injuries":ninj,"cacheBust":cb,"changelog":fn,"players":n0}))

if __name__=="__main__":
    main()
