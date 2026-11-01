#!/usr/bin/env python3
"""Build the stock-Basketball-GM download variant of the NBA 2026-27 roster.

The main file (BBGM_NBA_Roster_2026_Updated.json) is a mid-season save: real
W-L baked into team.seasons, the completed results in the BS-only
`bsRealResults` block, and only the remaining schedule. BS Hoops reads all of
that. Stock BBGM (play.basketball-gm.com) reads the records and the remaining
schedule but has no box scores or season stats for the played games, so a
league opens 5-0 with every player at 0.0 ppg — which reads as broken.

This variant starts the 2026-27 season from opening night instead:
  - every team's 2027 record reset to 0-0 (all split fields too)
  - the FULL real schedule (played games re-added in front of the remaining
    ones, days renumbered from 1) so the sim replays the actual slate
  - the current injury report kept as-is (a player out 10 games is out the
    first 10 games of the replay)
  - ratings nudged by how each team has actually played so far: per-team
    average margin from the real results, shrunk toward 0 by n/(n+SHRINK)
    games, scaled by MARGIN_TO_RATING and capped at ±MAX_NUDGE rating points,
    applied to every skill rating (never height) of every rostered player's
    current-season row. 5 games at +10 → +3; 5 games at -4 → -1.
  - the BS-only `bsRealResults` block dropped

Served by the rosters-page "Download JSON" button (used for BBGM). The in-app
"Start a league with this roster" button keeps the untouched main file.
Run after weekly_roster_update.py so it derives from the final roster.
"""
import json, os, sys

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(APP, 'public', 'rosters', 'BBGM_NBA_Roster_2026_Updated.json')
DST = os.path.join(APP, 'public', 'rosters', 'BBGM_NBA_Roster_2026_Vanilla.json')

# --opening-night SRC DST: the frozen "clean re-sim" variant. Same opening-night
# start and full schedule, but NO performance nudge and ALL injuries cleared, so
# the season replays from a neutral baseline. Built once from the first in-season
# snapshot (Oct 25, 2026 — ESPN rosters/contracts four days after opening night)
# and never rebuilt by the weekly refresh.
OPENING_NIGHT = '--opening-night' in sys.argv
if OPENING_NIGHT:
    i = sys.argv.index('--opening-night')
    SRC, DST = sys.argv[i + 1], sys.argv[i + 2]

SEASON = 2027
SHRINK = 10            # games of regression: weight = n / (n + SHRINK)
MARGIN_TO_RATING = 1.0 # rating points per (shrunk) point of margin
MAX_NUDGE = 3
SKILLS = ['stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp', 'oiq', 'diq', 'drb', 'pss', 'reb']
RECORD_FIELDS = ['won', 'lost', 'wonHome', 'lostHome', 'wonAway', 'lostAway', 'wonDiv', 'lostDiv', 'wonConf', 'lostConf']


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    d = json.load(open(SRC))
    d.pop('bsCoaches', None)
    played = d.pop('bsRealResults', []) or []
    active = {t['tid'] for t in d['teams'] if not t.get('disabled') and 0 <= t['tid'] < 30}

    # 1. Records back to 0-0.
    for t in d['teams']:
        for s in t.get('seasons', []):
            if s.get('season') == SEASON:
                for f in RECORD_FIELDS:
                    if f in s:
                        s[f] = 0

    # 2. Full schedule: played games first (their original day numbers start
    #    at 1), then the remaining games the main file already carries.
    remaining = d.get('schedule', []) or []
    full = [{'gid': g['gid'], 'day': g['day'], 'homeTid': g['teams'][0]['tid'], 'awayTid': g['teams'][1]['tid']}
            for g in played if g.get('teams') and len(g['teams']) == 2]
    used = {g['gid'] for g in full}
    nxt = (max(used) + 1) if used else 0
    for g in remaining:
        gid = g.get('gid')
        if gid is None or gid in used:
            gid = nxt; nxt += 1
        used.add(gid)
        full.append({'gid': gid, 'day': g['day'], 'homeTid': g['homeTid'], 'awayTid': g['awayTid']})
    full.sort(key=lambda g: (g['day'], g['gid']))
    # Renumber days densely from 1 so BBGM's "day" counter is contiguous.
    day_map = {}
    for g in full:
        day_map.setdefault(g['day'], len(day_map) + 1)
    for g in full:
        g['day'] = day_map[g['day']]
    d['schedule'] = full

    # 3. Performance nudge from the real results so far (skipped for the
    #    opening-night variant, which also clears the injury report).
    if OPENING_NIGHT:
        for p in d['players']:
            if p.get('injury'):
                p['injury'] = {'type': 'Healthy', 'gamesRemaining': 0}
    margin = {tid: [] for tid in active}
    for g in (played if not OPENING_NIGHT else []):
        a, b = g['teams'][0], g['teams'][1]
        if a['tid'] in margin: margin[a['tid']].append(a['pts'] - b['pts'])
        if b['tid'] in margin: margin[b['tid']].append(b['pts'] - a['pts'])
    nudge = {}
    for tid, ms in margin.items():
        n = len(ms)
        avg = sum(ms) / n if n else 0.0
        shrunk = avg * n / (n + SHRINK)
        nudge[tid] = int(clamp(round(shrunk * MARGIN_TO_RATING), -MAX_NUDGE, MAX_NUDGE))
    touched = 0
    for p in d['players']:
        k = nudge.get(p.get('tid'), 0)
        if not k:
            continue
        for r in p.get('ratings', []):
            if r.get('season') == SEASON:
                for s in SKILLS:
                    if isinstance(r.get(s), (int, float)):
                        r[s] = int(clamp(round(r[s] + k), 0, 100))
                touched += 1

    abbrev = {t['tid']: t['abbrev'] for t in d['teams']}
    if OPENING_NIGHT:
        d.setdefault('meta', {})['openingNight'] = (
            'Frozen clean opening-night variant for re-simming 2026-27 in stock BBGM: full real schedule, records reset, '
            'no performance nudge, injury report cleared. Rosters/contracts as of the first in-season refresh (2026-10-25).')
        d['meta'].pop('vanilla', None)
    else:
      d.setdefault('meta', {})['vanilla'] = (
          'Stock-BBGM download variant: season starts at opening night with the full real 2026-27 schedule; '
          f'records reset; current injuries kept; ratings nudged by real results so far (avg margin shrunk by n/(n+{SHRINK}), '
          f'capped ±{MAX_NUDGE}). Nudges: ' + ', '.join(f'{abbrev[t]} {k:+d}' for t, k in sorted(nudge.items(), key=lambda x: -x[1]) if k)
      )
    json.dump(d, open(DST, 'w'), ensure_ascii=False, allow_nan=False)
    print(f'Wrote {DST}: schedule {len(full)} games over {len(day_map)} days ({len(played)} replayed), '
          f'{touched} player rating rows nudged; team nudges: ' +
          ', '.join(f'{abbrev[t]} {k:+d}' for t, k in sorted(nudge.items(), key=lambda x: -x[1]) if k))


if __name__ == '__main__':
    main()
