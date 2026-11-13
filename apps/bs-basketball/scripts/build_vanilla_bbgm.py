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
  - the BS-only `bsRealResults` and `bsCoaches` blocks dropped
  - the trade deadline and All-Star Game markers BBGM expects in the schedule
    (see add_special_days). Stock BBGM only inserts these when IT generates a
    schedule; a league file that brings its own schedule gets neither, so the
    deadline never closes trades and there's no All-Star Game.

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


# Real 2026-27 dates (NBA key dates): deadline Thu Feb 11 2027 (3pm ET, before
# that night's games), All-Star Game Sun Feb 21 2027 in Phoenix.
TRADE_DEADLINE_DATE = '2027-02-11'
ALL_STAR_DATE = '2027-02-21'
# BBGM's placeholder tids (zengm src/common/specialGames.ts): each marker is a
# schedule "game" on a day of its own.
TRADE_DEADLINE_TIDS = (-3, -3)
ALL_STAR_GAME_TIDS = (-1, -2)


def add_special_days(schedule, date_of):
    """Insert the trade-deadline and All-Star markers on days of their own.

    `schedule` is a dense day-numbered list of {gid, day, homeTid, awayTid};
    `date_of(game)` returns its real 'YYYY-MM-DD' date. The deadline goes on a
    new day right before the first game day on/after the deadline date; the
    All-Star Game on a new day right before the first game day after the ASG
    date (i.e. in the real All-Star break). Later days shift +1 each.
    Idempotent: a schedule that already has the markers is returned as-is.
    """
    def is_special(g):
        return g['homeTid'] < 0 or g['awayTid'] < 0
    if any(is_special(g) for g in schedule):
        return schedule
    first_day_on_or_after = {}
    for g in schedule:
        dt = date_of(g)
        if dt is None:
            continue
        for key, cutoff, strict in (('deadline', TRADE_DEADLINE_DATE, False), ('asg', ALL_STAR_DATE, True)):
            if (dt > cutoff) if strict else (dt >= cutoff):
                cur = first_day_on_or_after.get(key)
                if cur is None or g['day'] < cur:
                    first_day_on_or_after[key] = g['day']
    if 'deadline' not in first_day_on_or_after or 'asg' not in first_day_on_or_after:
        raise SystemExit('add_special_days: could not place the deadline/All-Star days (missing dates?)')
    nxt = max(g['gid'] for g in schedule) + 1
    out = [dict(g) for g in schedule]
    # Insert the later marker first so the earlier day number stays valid.
    for key, tids in sorted((('deadline', TRADE_DEADLINE_TIDS), ('asg', ALL_STAR_GAME_TIDS)),
                            key=lambda kt: -first_day_on_or_after[kt[0]]):
        day = first_day_on_or_after[key]
        for g in out:
            if g['day'] >= day:
                g['day'] += 1
        out.append({'gid': nxt, 'day': day, 'homeTid': tids[0], 'awayTid': tids[1]})
        nxt += 1
    out.sort(key=lambda g: (g['day'], g['gid']))
    return out


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    d = json.load(open(SRC))
    d.pop('bsCoaches', None)
    played = d.pop('bsRealResults', []) or []
    d.pop('bsCoaches', None)  # BS-only real head coaches; stock BBGM has no coaches
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
    full = [{'gid': g['gid'], 'day': g['day'], 'homeTid': g['teams'][0]['tid'], 'awayTid': g['teams'][1]['tid'],
             'date': g.get('date')}
            for g in played if g.get('teams') and len(g['teams']) == 2]
    used = {g['gid'] for g in full}
    nxt = (max(used) + 1) if used else 0
    for g in remaining:
        gid = g.get('gid')
        if gid is None or gid in used:
            gid = nxt; nxt += 1
        used.add(gid)
        full.append({'gid': gid, 'day': g['day'], 'homeTid': g['homeTid'], 'awayTid': g['awayTid'],
                     'date': g.get('date')})
    full.sort(key=lambda g: (g['day'], g['gid']))
    # Renumber days densely from 1 so BBGM's "day" counter is contiguous.
    day_map = {}
    for g in full:
        day_map.setdefault(g['day'], len(day_map) + 1)
    for g in full:
        g['day'] = day_map[g['day']]
    full = add_special_days(full, lambda g: g.get('date'))
    for g in full:
        g.pop('date', None)
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


def patch_special_days(path):
    """One-off: add the deadline/All-Star markers to an already-built file
    (the frozen opening-night variant, which is never rebuilt). Its schedule has
    no dates, so each game's date is looked up from the main file by matchup
    (home, away, nth meeting) — the real slate is the same in both."""
    main_d = json.load(open(SRC))
    dated = [(g['teams'][0]['tid'], g['teams'][1]['tid'], g.get('date'), g['day'])
             for g in (main_d.get('bsRealResults') or []) if len(g.get('teams', [])) == 2]
    dated += [(g['homeTid'], g['awayTid'], g.get('date'), 1000 + g['day']) for g in main_d.get('schedule', [])]
    dated.sort(key=lambda x: (x[2] or '', x[3]))
    by_pair = {}
    for h, a, dt, _ in dated:
        by_pair.setdefault((h, a), []).append(dt)
    d = json.load(open(path))
    seen = {}
    dates = {}
    for g in sorted(d['schedule'], key=lambda g: (g['day'], g['gid'])):
        k = (g['homeTid'], g['awayTid'])
        i = seen.get(k, 0)
        seen[k] = i + 1
        lst = by_pair.get(k, [])
        dates[g['gid']] = lst[i] if i < len(lst) else None
    before = len(d['schedule'])
    d['schedule'] = add_special_days(d['schedule'], lambda g: dates.get(g['gid']))
    json.dump(d, open(path, 'w'), ensure_ascii=False, allow_nan=False)
    print(f'Patched {path}: {before} -> {len(d["schedule"])} schedule entries')


if __name__ == '__main__':
    if '--patch-special-days' in sys.argv:
        patch_special_days(sys.argv[sys.argv.index('--patch-special-days') + 1])
    else:
        main()
