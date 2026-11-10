"""Real NFL coaching staffs (coordinators + position coaches) from Wikipedia.

ESPN only publishes head coaches, so the weekly pipeline reads each club's
"Template:<Team> staff" navbox on Wikipedia (kept current by WikiProject NFL and
linked to the team's own coaches page) and maps it onto BS Football's staff
roles: OC, DC, QB, RB, WR, OL, DL, DB.
"""
import json, re, time, urllib.parse, urllib.request

TEAM_FULL = {
 'ARI':'Arizona Cardinals','ATL':'Atlanta Falcons','BAL':'Baltimore Ravens','BUF':'Buffalo Bills',
 'CAR':'Carolina Panthers','CHI':'Chicago Bears','CIN':'Cincinnati Bengals','CLE':'Cleveland Browns',
 'DAL':'Dallas Cowboys','DEN':'Denver Broncos','DET':'Detroit Lions','GB':'Green Bay Packers',
 'HOU':'Houston Texans','IND':'Indianapolis Colts','JAX':'Jacksonville Jaguars','KC':'Kansas City Chiefs',
 'LV':'Las Vegas Raiders','LAC':'Los Angeles Chargers','LAR':'Los Angeles Rams','MIA':'Miami Dolphins',
 'MIN':'Minnesota Vikings','NE':'New England Patriots','NO':'New Orleans Saints','NYG':'New York Giants',
 'NYJ':'New York Jets','PHI':'Philadelphia Eagles','PIT':'Pittsburgh Steelers','SF':'San Francisco 49ers',
 'SEA':'Seattle Seahawks','TB':'Tampa Bay Buccaneers','TEN':'Tennessee Titans','WSH':'Washington Commanders',
}
UA = {'User-Agent': 'BSFootballRosterBot/1.0 (bs-football.com; weekly roster refresh)'}

# role -> ordered list of title regexes (first matching non-assistant line wins)
ROLE_PATTERNS = {
 'OC': [r'^(interim )?offensive coordinator'],
 'DC': [r'^(interim )?defensive coordinator'],
 'QB': [r'quarterbacks?\b'],
 'RB': [r'running ?backs?\b'],
 'WR': [r'wide receivers?\b'],
 'OL': [r'offensive line\b'],
 'DL': [r'defensive line\b'],
 'DB': [r'defensive backs?\b|secondary\b', r'cornerbacks?\b', r'safet(y|ies)\b'],
}

def _wikitexts(titles):
    """{title: wikitext} for up to 50 pages in ONE API request (Wikipedia rate-limits per-page bursts)."""
    q = urllib.parse.urlencode({'action':'query','prop':'revisions','rvprop':'content','rvslots':'main',
                                'titles':'|'.join(titles),'redirects':1,'format':'json','formatversion':2})
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(f'https://en.wikipedia.org/w/api.php?{q}', headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            break
        except Exception as e:
            last = e; time.sleep(5 * (attempt + 1))
    else:
        raise last
    q = data.get('query', {})
    back = {r['to']: r['from'] for r in q.get('redirects', [])}
    out = {}
    for pg in q.get('pages', []):
        revs = pg.get('revisions') or []
        if revs:
            out[back.get(pg['title'], pg['title'])] = revs[0]['slots']['main']['content']
    return out

def _clean_name(s):
    s = re.sub(r'<ref[^>]*/>|<ref.*?</ref>|<[^>]+>', '', s)
    s = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', s)
    s = re.sub(r"'{2,}", '', s)
    s = re.sub(r'\{\{[^}]*\}\}', '', s)
    s = re.sub(r'\(.*?\)', '', s)
    return ' '.join(s.split()).strip(' ,;')

def parse_staff(text):
    """[(title, name)] for every '*Title – Name' bullet in a staff navbox, coaching sections only."""
    out, section = [], ''
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(';'):
            section = line[1:].lower(); continue
        if not line.startswith('*') or 'front office' in section or 'strength' in section:
            continue
        m = re.match(r"^\*+\s*(.+?)\s*[–—-]\s*(.+)$", line)
        if not m: continue
        title, name = _clean_name(m.group(1)).lower(), _clean_name(m.group(2))
        if not name or 'vacant' in name.lower(): continue
        out.append((title, name))
    return out

def map_roles(rows, head_coach=None):
    """{role: name} for OC/DC/QB/RB/WR/OL/DL/DB. A person holds at most one role;
    when the main coach for a role already holds a bigger one (e.g. OC/QBs), the
    role falls to that position's assistant."""
    used = {head_coach} if head_coach else set()
    staff = {}
    for role in ['OC','DC','QB','RB','WR','OL','DL','DB']:
        pick = None
        for pat in ROLE_PATTERNS[role]:
            for allow_asst in (False, True):
                for title, name in rows:
                    asst = 'assistant' in title or 'quality control' in title
                    if asst != allow_asst or name in used: continue
                    if not re.search(pat, title): continue
                    if role not in ('OC','DC') and re.search(r'(offensive|defensive) coordinator|special teams', title) and not title.startswith('assistant'):
                        continue
                    pick = name; break
                if pick: break
            if pick: break
        if pick:
            staff[role] = pick; used.add(pick)
    return staff

def fetch_staffs(head_coaches=None):
    """{abbrev: {role: name}}; teams whose page can't be read are omitted."""
    head_coaches = head_coaches or {}
    out = {}
    try:
        texts = _wikitexts([f'Template:{full} staff' for full in TEAM_FULL.values()])
    except Exception:
        return out
    for ab, full in TEAM_FULL.items():
        rows = parse_staff(texts.get(f'Template:{full} staff', ''))
        hc = (head_coaches.get(ab) or {}).get('name')
        staff = map_roles(rows, hc)
        if len(staff) >= 6: out[ab] = staff
    return out

if __name__ == '__main__':
    s = fetch_staffs()
    print(json.dumps(s, indent=1)); print(len(s), 'teams;', sum(len(v) for v in s.values()), 'coaches')
