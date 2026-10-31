#!/usr/bin/env python3
"""
Weekly NBA roster refresh for BBGM_NBA_Roster_2026_Updated.json (BS Hoops).

Run from the repo root:  python3 apps/bs-basketball/scripts/weekly_roster_update.py
                         (add --dry-run to print the changelog without writing)

The Hoops counterpart of scripts/weekly_roster_update.py + build_midseason_start.py
(BS Football). Pulls current ESPN data and updates the roster file in place:
  - rolls a post-draft offseason file (BBGM season 2026, phase 7) into the
    2026-27 regular season (BBGM season 2027, phase 1) — once; later runs skip it
  - reconciles every team's roster against ESPN (trades, signings, waivers,
    two-ways, un-retirements); players ESPN doesn't list become free agents and
    ESPN players missing from the file are created at replacement level
  - trims each team to the 15-man limit (lowest-rated extras → free agency;
    in practice the two-way players)
  - sets 2026-27 contracts from ESPN (salary + years remaining)
  - resets injuries, then applies ESPN's injury report (games out from the
    listed return date when there is one)
  - bakes real W-L into team.seasons, loads the real remaining schedule
    (`schedule`) and the completed results (`games`, scores only — no box
    scores), so the league opens on the next real game day
  - refreshes the rosters-page card (LAST_UPDATED, CACHE_BUST)
  - writes a dated changelog to apps/bs-basketball/roster-updates/

Re-running against the same ESPN state yields the same file. Season days are
the rank of each real game date (opening night = day 1), which keeps the
~165 NBA game dates inside BS Hoops' 170-day regular season.

Name matching is normalised (accents, punctuation, Jr./III dropped). When ESPN
spells a player differently from the file, add the pair to NAME_ALIASES.
"""
import datetime, json, os, re, subprocess, sys, time, unicodedata
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
APP = os.path.join(ROOT, 'apps', 'bs-basketball')
ROSTER = os.path.join(APP, 'public', 'rosters', 'BBGM_NBA_Roster_2026_Updated.json')
PAGE = os.path.join(APP, 'src', 'app', 'rosters', 'page.tsx')
LOG_DIR = os.path.join(APP, 'roster-updates')

SEASON = 2027              # BBGM names a season by the year it ends: 2026-27
START_YEAR = 2026
MAX_ROSTER = 15
MIN_CONTRACT = 1300        # $K — BBGM minContract in the file
GAMES_PER_TEAM = 82
DRY = '--dry-run' in sys.argv

ESPN_ABBREV = {'GS': 'GSW', 'NY': 'NYK', 'SA': 'SAS', 'NO': 'NOP', 'UTAH': 'UTA', 'WSH': 'WAS'}
ESPN_SLUG = {'GSW': 'gs', 'NYK': 'ny', 'SAS': 'sa', 'NOP': 'no', 'UTA': 'utah', 'WAS': 'wsh'}

# ESPN spelling (normalised) -> file spelling (normalised). Extend as runs report misses.
NAME_ALIASES = {
    'nicolas claxton': 'nic claxton',
    'cameron johnson': 'cam johnson',
    'herbert jones': 'herb jones',
    'alexandre sarr': 'alex sarr',
    'carlton carrington': 'bub carrington',
    'ronald holland': 'ron holland',
    'yang hansen': 'hansen yang',
    'svi mykhailiuk': 'sviatoslav mykhailiuk',
}


# ---------- helpers ----------
def curl(url):
    for _ in range(4):
        r = subprocess.run(['curl', '-s', '--compressed', '--max-time', '30', url], capture_output=True, text=True)
        if r.stdout.strip():
            try:
                return json.loads(r.stdout)
            except json.JSONDecodeError:
                pass
        time.sleep(1.5)
    return {}


def norm(name):
    s = unicodedata.normalize('NFKD', name or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'[^a-z ]', '', s.replace('-', ' '))
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return NAME_ALIASES.get(s, s)


def et_date(iso):
    """ESPN event time (UTC) -> calendar date in US Eastern (late tips roll back a day)."""
    t = datetime.datetime.strptime(iso[:16], '%Y-%m-%dT%H:%M')
    return (t - datetime.timedelta(hours=5)).date()


# BBGM's basketball overall formula (ovr.basketball.ts), used only to rank
# players when a roster must be trimmed and to pick templates for new players.
W = dict(hgt=(0.159, 47.5), stre=(0.0777, 50.2), spd=(0.123, 50.8), jmp=(0.051, 48.7), endu=(0.0632, 39.9),
         ins=(0.0126, 42.4), dnk=(0.0286, 49.5), ft=(0.0202, 47.0), tp=(0.0726, 47.1), oiq=(0.133, 46.8),
         diq=(0.159, 46.7), drb=(0.059, 54.8), pss=(0.062, 51.3), fg=(0.01, 47.0), reb=(0.01, 51.4))


def ovr(p):
    r = p['ratings'][-1] if isinstance(p.get('ratings'), list) else p['ratings']
    return 48.5 + sum(w * (r.get(k, m) - m) for k, (w, m) in W.items())


def pname(p):
    return p.get('name') or f"{p.get('firstName', '')} {p.get('lastName', '')}".strip()


def ratings_list(p):
    if isinstance(p.get('ratings'), dict):
        p['ratings'] = [p['ratings']]
    return p['ratings']


def stats_list(p):
    if isinstance(p.get('stats'), dict):
        p['stats'] = [p['stats']]
    return p.setdefault('stats', [])


# ---------- ESPN ----------
def fetch_rosters(abbrevs):
    out = {}
    for ab in abbrevs:
        slug = ESPN_SLUG.get(ab, ab.lower())
        d = curl(f'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{slug}/roster')
        out[ab] = d.get('athletes') or []
        if not out[ab]:
            sys.exit(f'ESPN roster for {ab} came back empty — aborting so nobody gets released by mistake.')
    return out


def fetch_injuries():
    d = curl('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries')
    out = {}
    for team in d.get('injuries', []):
        for i in team.get('injuries', []):
            a = i.get('athlete') or {}
            det = i.get('details') or {}
            if det.get('type') == 'Rest':
                continue  # load management, not an injury
            parts = [x for x in [det.get('type'), det.get('detail')] if x and x != 'Not Specified']
            label = ' '.join(dict.fromkeys(parts)) or 'Injury'
            out[norm(a.get('displayName'))] = {'status': i.get('status'), 'type': label, 'returnDate': det.get('returnDate')}
    return out


def fetch_schedule():
    games = []
    months = [f'{START_YEAR if m >= 10 else START_YEAR + 1}{m:02d}' for m in (10, 11, 12, 1, 2, 3, 4)]
    for m in months:
        d = curl(f'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={m}&seasontype=2&limit=1000')
        for ev in d.get('events', []):
            c = ev['competitions'][0]
            if ev.get('season', {}).get('type') != 2 or (c.get('type') or {}).get('abbreviation') == 'CC':
                continue  # preseason / NBA Cup final (doesn't count in the standings)
            h = next(x for x in c['competitors'] if x['homeAway'] == 'home')
            a = next(x for x in c['competitors'] if x['homeAway'] == 'away')
            ab = lambda x: ESPN_ABBREV.get(x['team']['abbreviation'], x['team']['abbreviation'])
            games.append({'date': et_date(ev['date']), 'home': ab(h), 'away': ab(a), 'done': c['status']['type']['completed'],
                          'hp': int(h.get('score') or 0), 'ap': int(a.get('score') or 0), 'id': ev['id']})
    if len(games) < 1100:
        sys.exit(f'ESPN schedule returned only {len(games)} games — aborting.')
    return sorted(games, key=lambda g: (g['date'], g['id']))


# ---------- season roll (once) ----------
def roll_to_regular_season(d, log):
    ga = d['gameAttributes']
    if ga.get('season') == SEASON:
        return
    if ga.get('season') != SEASON - 1 or ga.get('phase', 0) < 7:
        sys.exit(f"Unexpected file state season={ga.get('season')} phase={ga.get('phase')} — expected a {SEASON - 1} offseason or {SEASON} file.")
    ga['season'] = SEASON
    ga['phase'] = 1
    ga['numGames'] = GAMES_PER_TEAM
    ga['maxRosterSize'] = MAX_ROSTER
    for p in d['players']:
        rs = ratings_list(p)
        if rs and rs[-1].get('season') != SEASON:
            rs.append({**rs[-1], 'season': SEASON})
        if p.get('tid') == -2 and (p.get('draft') or {}).get('year', 0) <= SEASON - 1:
            p['tid'] = -1  # undrafted 2026 prospects → free agency
    d['draftPicks'] = [dp for dp in d.get('draftPicks', []) if dp.get('season', 0) >= SEASON]
    for t in d['teams']:
        if t.get('disabled'):
            continue  # BBGM only keeps current-season rows for active teams (payroll check throws otherwise)
        prev = t['seasons'][-1]
        t['seasons'].append({**prev, 'season': SEASON, 'won': 0, 'lost': 0, 'playoffRoundsWon': -1, 'numPlayersTradedAway': 0})
    log.append(f'Rolled the file from the {SEASON - 1} offseason into the {START_YEAR}-{str(SEASON)[2:]} regular season.')


# ---------- reconcile ----------
def new_player(d, ath, tid, template_pool):
    hgt_in = int(ath.get('height') or 78)
    similar = [p for p in template_pool if abs(p['hgt'] - hgt_in) <= 2] or template_pool
    keys = list(W.keys())
    r = {k: round(sum(ratings_list(p)[-1].get(k, 45) for p in similar) / len(similar)) for k in keys}
    r['season'] = SEASON
    born = int((ath.get('dateOfBirth') or f'{START_YEAR - 23}')[:4])
    pos = {'G': 'G', 'PG': 'PG', 'SG': 'SG', 'F': 'F', 'SF': 'SF', 'PF': 'PF', 'C': 'C'}.get((ath.get('position') or {}).get('abbreviation'), 'F')
    p = {
        'tid': tid, 'name': ath['fullName'], 'pos': pos, 'hgt': hgt_in, 'weight': int(ath.get('weight') or 215),
        'born': {'year': born, 'loc': ', '.join(x for x in [(ath.get('birthPlace') or {}).get('city'), (ath.get('birthPlace') or {}).get('state') or (ath.get('birthPlace') or {}).get('country')] if x)},
        'ratings': [r], 'stats': [], 'contract': {'amount': MIN_CONTRACT, 'exp': SEASON},
        'draft': {'round': 0, 'pick': 0, 'tid': -1, 'originalTid': -1, 'year': born + 22},
        'college': (ath.get('college') or {}).get('name') or '', 'injury': {'type': 'Healthy', 'gamesRemaining': 0},
        'transactions': [], 'awards': [],
    }
    d['players'].append(p)
    return p


def espn_contract(ath):
    c = ath.get('contract') or {}
    if c.get('salary') and c.get('yearsRemaining') and (c.get('season') or {}).get('year'):
        yr = c['season']['year']
        return round(c['salary'] / 1000), yr + c['yearsRemaining'] - 1
    for row in ath.get('contracts') or []:
        if (row.get('season') or {}).get('year') == SEASON and row.get('salary'):
            return round(row['salary'] / 1000), None
    return None, None


def reconcile(d, rosters, tid_by_abbrev, log):
    by_key = defaultdict(list)
    for i, p in enumerate(d['players']):
        by_key[norm(pname(p))].append(i)
    abbrev_by_tid = {v: k for k, v in tid_by_abbrev.items()}
    claimed, created = {}, []
    # Snapshot so moves/contract changes are reported as before→after diffs
    # (a two-way re-signed and then trimmed again is not a move).
    before = {i: (p.get('tid'), json.dumps(p.get('contract'), sort_keys=True)) for i, p in enumerate(d['players'])}
    template_pool = [p for p in d['players'] if p.get('tid') == -1 and ratings_list(p) and START_YEAR - p['born']['year'] <= 27]
    template_pool = sorted(template_pool, key=ovr)[len(template_pool) // 4: len(template_pool) // 2] or template_pool
    espn_salary_none = set()

    for ab, athletes in rosters.items():
        tid = tid_by_abbrev[ab]
        for ath in athletes:
            key = norm(ath['fullName'])
            cands = [i for i in by_key.get(key, []) if i not in claimed]
            if len(cands) > 1:  # same name twice: prefer this team, then any team, FA, prospect, retired
                rank = lambda i: (d['players'][i].get('tid') != tid, {True: 0}.get(d['players'][i].get('tid', -9) >= 0, 1), -len(ratings_list(d['players'][i])))
                cands.sort(key=rank)
            if cands:
                i = cands[0]
                p = d['players'][i]
            else:
                p = new_player(d, ath, tid, template_pool)
                i = len(d['players']) - 1
                by_key[key].append(i)
                created.append(f"{ath['fullName']} ({ab})")
            claimed[i] = ath
            old = p.get('tid')
            p['tid'] = tid
            amt, exp = espn_contract(ath)
            cur = p.get('contract') or {}
            if amt:
                exp = exp or max(cur.get('exp', SEASON), SEASON)
                p['contract'] = {**cur, 'amount': amt, 'exp': max(exp, SEASON)}
            else:
                espn_salary_none.add(i)
                if old != tid or cur.get('exp', 0) < SEASON:
                    p['contract'] = {**cur, 'amount': MIN_CONTRACT, 'exp': SEASON}

    released = []
    for i, p in enumerate(d['players']):
        if p.get('tid', -1) >= 0 and i not in claimed:
            released.append(f"{pname(p)} ({abbrev_by_tid.get(p['tid'])})")
            p['tid'] = -1
    # Free agents need a live contract (their asking price) — never an expired one.
    for p in d['players']:
        if p.get('tid') == -1:
            c = p.get('contract') or {'amount': MIN_CONTRACT}
            p['contract'] = {**c, 'exp': max(c.get('exp', SEASON), SEASON)}

    # 15-man limit: extras → free agency. Two-way players go first: ESPN lists
    # them without a standard salary and they're early-career (≤3 seasons), so
    # an unpriced veteran signing (e.g. a 19-year vet on a fresh minimum) or a
    # first-round rookie stays.
    def two_way(i):
        ath = claimed.get(i) or {}
        first_rounder = ((d['players'][i].get('draft') or {}).get('round') == 1)  # rookie-scale deals ESPN hasn't priced yet
        return i in espn_salary_none and (ath.get('experience') or {}).get('years', 0) <= 3 and not first_rounder
    trimmed = []
    for ab, tid in tid_by_abbrev.items():
        roster = [i for i, p in enumerate(d['players']) if p.get('tid') == tid]
        extra = len(roster) - MAX_ROSTER
        if extra <= 0:
            continue
        order = sorted(roster, key=lambda i: (not two_way(i), ovr(d['players'][i])))
        for i in order[:extra]:
            p = d['players'][i]
            p['tid'] = -1
            p['contract'] = {**p.get('contract', {}), 'amount': MIN_CONTRACT, 'exp': SEASON}
            trimmed.append(f"{pname(p)} ({ab})")

    where = lambda t: abbrev_by_tid.get(t, {-1: 'FA', -2: 'draft pool', -3: 'retired'}.get(t, str(t)))
    moves, contracts = [], 0
    for i, p in enumerate(d['players']):
        old_tid, old_c = before.get(i, (None, None))
        if p.get('tid', -1) >= 0 and old_tid != p['tid']:
            moves.append(f"{pname(p)}: {where(old_tid) if i in before else 'new'} → {where(p['tid'])}")
        if i in before and old_c != json.dumps(p.get('contract'), sort_keys=True):
            contracts += 1
    log.append(f'Roster moves: {len(moves)}; released to free agency: {len(released)}; new players: {len(created)}; '
               f'contracts updated: {contracts}; trimmed to {MAX_ROSTER} (two-way/extra → FA): {len(trimmed)}')
    return moves, released, created, trimmed


# ---------- injuries ----------
def apply_injuries(d, injuries, remaining_dates_by_tid, log):
    for p in d['players']:
        p['injury'] = {'type': 'Healthy', 'gamesRemaining': 0}
    by_key = {norm(pname(p)): p for p in d['players'] if p.get('tid', -1) >= 0}
    applied, missing = [], []
    for key, inj in injuries.items():
        p = by_key.get(key)
        if not p:
            missing.append(key)
            continue
        games = 1
        if inj['returnDate']:
            ret = datetime.date.fromisoformat(inj['returnDate'][:10])
            games = max(1, sum(1 for dt in remaining_dates_by_tid.get(p['tid'], []) if dt < ret))
        elif inj['status'] == 'Out':
            games = 5  # ESPN gives no timetable — assume a short absence
        p['injury'] = {'type': inj['type'] if inj['status'] == 'Out' else f"{inj['type']} (day-to-day)", 'gamesRemaining': games}
        applied.append((pname(p), p['injury']['type'], games))
    log.append(f'Injuries applied: {len(applied)} (ESPN report entries not on a roster: {len(missing)})')
    return sorted(applied, key=lambda x: -x[2])


# ---------- schedule + records ----------
def build_season(d, games, tid_by_abbrev, log):
    teams = {t['tid']: t for t in d['teams'] if not t.get('disabled') and t['tid'] in tid_by_abbrev.values()}
    known = [g for g in games if g['home'] in tid_by_abbrev and g['away'] in tid_by_abbrev]
    tbd_dates = sorted({g['date'] for g in games if g not in known})

    # NBA Cup knockout slots stay "TBD" until the group stage ends. Fill each
    # short team's missing games with same-conference pairings on those dates
    # (no team twice on one day) so everyone plays 82; real matchups replace
    # them once ESPN publishes them.
    count = Counter()
    for g in known:
        count[g['home']] += 1; count[g['away']] += 1
    need = {ab: GAMES_PER_TEAM - count[ab] for ab in tid_by_abbrev if count[ab] < GAMES_PER_TEAM}
    busy = defaultdict(set)
    for g in known:
        busy[g['date']].update([g['home'], g['away']])
    cid = {ab: teams[tid]['cid'] for ab, tid in tid_by_abbrev.items()}
    filler = []
    for dt in tbd_dates or [max(g['date'] for g in known)]:
        while True:
            free = sorted((ab for ab, n in need.items() if n > 0 and ab not in busy[dt]), key=lambda ab: (-need[ab], ab))
            pair = next(((a, b) for a in free for b in free if a < b and cid[a] == cid[b]), None) or (tuple(free[:2]) if len(free) >= 2 else None)
            if not pair:
                break
            a, b = pair
            home, away = (a, b) if (len(filler) % 2 == 0) else (b, a)
            filler.append({'date': dt, 'home': home, 'away': away, 'done': False, 'hp': 0, 'ap': 0, 'id': f'tbd-{len(filler)}'})
            busy[dt].update(pair); need[a] -= 1; need[b] -= 1
    short = {ab: n for ab, n in need.items() if n > 0}
    if short:
        log.append(f'WARNING: could not place every TBD game: {short}')
    all_games = sorted(known + filler, key=lambda g: (g['date'], g['id']))

    days = {dt: i + 1 for i, dt in enumerate(sorted({g['date'] for g in all_games}))}
    if max(days.values()) > 170:
        sys.exit(f'{max(days.values())} game dates exceed BS Hoops\' 170-day season.')

    fields = ['won', 'lost', 'wonHome', 'lostHome', 'wonAway', 'lostAway', 'wonDiv', 'lostDiv', 'wonConf', 'lostConf']
    rec = {tid: dict.fromkeys(fields, 0) for tid in teams}
    results = defaultdict(list)
    done_games, schedule = [], []
    for g in all_games:
        h, a = tid_by_abbrev[g['home']], tid_by_abbrev[g['away']]
        if g['done']:
            hw = g['hp'] > g['ap']
            for tid, opp, won, home in ((h, a, hw, True), (a, h, not hw, False)):
                r = rec[tid]; res = 'won' if won else 'lost'
                r[res] += 1; r[res + ('Home' if home else 'Away')] += 1
                if teams[tid]['did'] == teams[opp]['did']: r[res + 'Div'] += 1
                if teams[tid]['cid'] == teams[opp]['cid']: r[res + 'Conf'] += 1
                results[tid].append(won)
            win, lose = ((h, g['hp']), (a, g['ap'])) if hw else ((a, g['ap']), (h, g['hp']))
            done_games.append({'gid': len(done_games), 'season': SEASON, 'playoffs': False, 'day': days[g['date']], 'date': g['date'].isoformat(),
                               'att': 0, 'overtimes': 0, 'numPeriods': 4,
                               'teams': [{'tid': h, 'pts': g['hp']}, {'tid': a, 'pts': g['ap']}],
                               'won': {'tid': win[0], 'pts': win[1]}, 'lost': {'tid': lose[0], 'pts': lose[1]}})
        else:
            schedule.append({'gid': 100000 + len(schedule), 'day': days[g['date']], 'date': g['date'].isoformat(), 'homeTid': h, 'awayTid': a})

    for tid, t in teams.items():
        s = next(x for x in t['seasons'] if x['season'] == SEASON)
        s.update(rec[tid])
        s['gpHome'] = rec[tid]['wonHome'] + rec[tid]['lostHome']
        rs = results[tid]
        s['lastTen'] = [1 if w else 0 for w in rs[-10:]]
        streak = 0
        for w in reversed(rs):
            if streak == 0 or (streak > 0) == w:
                streak += 1 if w else -1
            else:
                break
        s['streak'] = streak
    d['schedule'] = schedule
    # Score-only results live under a BS-only key: Basketball GM would import
    # `games` as box scores and crash on them (no player lines). The W-L is
    # already in teams[].seasons, so vanilla BBGM loses nothing it can show.
    d.pop('games', None)
    d['bsRealResults'] = done_games
    remaining_dates = defaultdict(list)
    for g in all_games:
        if not g['done']:
            remaining_dates[tid_by_abbrev[g['home']]].append(g['date'])
            remaining_dates[tid_by_abbrev[g['away']]].append(g['date'])
    log.append(f'Schedule: {len(done_games)} games played, {len(schedule)} to go ({len(filler)} NBA Cup TBD slots filled), '
               f'{len(days)} game days; next game day {schedule[0]["day"] if schedule else "-"}')
    return rec, remaining_dates, (max(g['date'] for g in all_games if g['done']) if done_games else None)


# ---------- rosters page ----------
def update_page(today):
    src = open(PAGE).read()
    m = re.search(r'const CACHE_BUST = (\d+);', src)
    src = src.replace(m.group(0), f'const CACHE_BUST = {int(m.group(1)) + 1};')
    src = re.sub(r"const LAST_UPDATED = '[^']*';", f"const LAST_UPDATED = '{today:%B} {today.day}, {today.year}';", src)
    if not DRY:
        open(PAGE, 'w').write(src)
    return int(m.group(1)) + 1


def main():
    d = json.load(open(ROSTER))
    log = []
    roll_to_regular_season(d, log)
    tid_by_abbrev = {t['abbrev']: t['tid'] for t in d['teams'] if not t.get('disabled') and 0 <= t['tid'] < 30}
    assert len(tid_by_abbrev) == 30, tid_by_abbrev

    games = fetch_schedule()
    rosters = fetch_rosters(sorted(tid_by_abbrev))
    injuries = fetch_injuries()

    moves, released, created, trimmed = reconcile(d, rosters, tid_by_abbrev, log)
    rec, remaining_dates, through = build_season(d, games, tid_by_abbrev, log)
    hurt = apply_injuries(d, injuries, remaining_dates, log)

    today = datetime.date.today()
    standings = sorted(((rec[tid]['won'], rec[tid]['lost'], ab) for ab, tid in tid_by_abbrev.items()), key=lambda x: (-x[0], x[1]))
    lines = [f'# BS Hoops roster refresh — {today.isoformat()}', '', *[f'- {x}' for x in log],
             f'- Results through: {through}', '', '## Standings', '',
             ', '.join(f'{ab} {w}-{l}' for w, l, ab in standings), '',
             f'## Roster moves ({len(moves)})', '', *[f'- {m}' for m in moves], '',
             f'## Released to free agency ({len(released)})', '', *[f'- {m}' for m in released], '',
             f'## New players created at replacement level ({len(created)}) — review ratings', '', *[f'- {m}' for m in created], '',
             f'## Trimmed to {MAX_ROSTER} ({len(trimmed)})', '', *[f'- {m}' for m in trimmed], '',
             f'## Injuries ({len(hurt)})', '', *[f'- {n}: {t}, {g} games' for n, t, g in hurt], '']
    report = '\n'.join(lines)
    print(report if DRY else '\n'.join(lines[:12]))
    if DRY:
        return
    d.setdefault('meta', {})['lastRefresh'] = f'{today.isoformat()} — ESPN rosters, contracts, injuries, results through {through}'
    json.dump(d, open(ROSTER, 'w'), ensure_ascii=False, allow_nan=False)
    os.makedirs(LOG_DIR, exist_ok=True)
    open(os.path.join(LOG_DIR, f'{today.isoformat()}.md'), 'w').write(report)
    bust = update_page(today)
    print(f'\nWrote {ROSTER}\nCACHE_BUST → {bust}, LAST_UPDATED → {today:%B} {today.day}, {today.year}')
    # Stock-BBGM download variant (opening-night start, full schedule) — derives from the file just written.
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_vanilla_bbgm.py')], check=True)


if __name__ == '__main__':
    main()
