#!/usr/bin/env python3
"""Build the stock-Football-GM download variants of the NFL 2026 roster.

Two files come out of the main roster (FBGM_NFL_Roster_2026_Updated.json),
which BS Football keeps using untouched:

  FBGM_NFL_Roster_2026_Vanilla.json  -- "Current": the mid-season save as-is
      (real records, real 2026 stats, remaining real schedule), year-shifted.
  FBGM_NFL_Roster_2026_Week1.json    -- "Week 1 start": same rosters,
      contracts, injuries and performance-adjusted ratings as this week, but
      the 2026 season rewound to Week 1 with nothing played: every record
      0-0, no 2026 stat rows, and the FULL real 2026 schedule (the games
      already played put back in front of the remaining ones) so the sim
      replays the actual slate. Same shape as BS Hoops' opening-night file.

Year shift (both files): stock FBGM (play.football-gm.com) names each draft
by the season it happens in, so a league loaded in 2026 runs the "2026"
draft at season's end. Our real prospect classes are keyed by NFL draft year
(2027, 2028), which leaves 2026 empty -> FBGM generates a fake class and the
real players sit a year out behind it. dumbmatter confirmed FBGM won't
change this. BS Football handles the original file correctly, so the main
file stays untouched; these variants shift every future draft class and
draft pick down one year so the first draft a vanilla-FBGM user reaches is
the real one.

Served by the rosters-page download buttons (used almost exclusively for
FBGM). The in-app "Play in BS Football" link keeps the original file.
Run after build_midseason_start.py so both derive from the final roster.
"""
import copy, json
from collections import Counter

SRC = "public/rosters/FBGM_NFL_Roster_2026_Updated.json"
DST_VANILLA = "public/rosters/FBGM_NFL_Roster_2026_Vanilla.json"
DST_WEEK1 = "public/rosters/FBGM_NFL_Roster_2026_Week1.json"
SEASON = 2026
# Every counter build_midseason_start.py (and the original season-opener
# build) touches on a team's 2026 season row.
RECORD_FIELDS = ["won", "lost", "tied", "otl", "wonHome", "lostHome", "tiedHome", "otlHome",
                 "wonAway", "lostAway", "tiedAway", "otlAway", "wonDiv", "lostDiv", "tiedDiv", "otlDiv",
                 "wonConf", "lostConf", "tiedConf", "otlConf", "gpHome"]


def shift_drafts(d):
    """Move future draft classes / picks down one year (see module doc)."""
    npros = ndp = 0
    for p in d["players"]:
        if p.get("tid") == -2:  # undrafted / future draft prospect
            dr = p.get("draft") or {}
            if isinstance(dr.get("year"), int):
                dr["year"] -= 1
                npros += 1
            for r in p.get("ratings", []):
                if isinstance(r.get("season"), int):
                    r["season"] -= 1
    for dp in d.get("draftPicks", []):
        if isinstance(dp.get("season"), int):
            dp["season"] -= 1
            ndp += 1
    return npros, ndp


def strip_bs_blocks(d):
    # BS Football-only real-season block (box scores keyed for BS); stock FBGM
    # reads the real records, schedule and stats rows it needs elsewhere.
    d.pop("bsRealSeason", None)
    d.pop("bsCoaches", None)  # BS-only real head coaches; stock FBGM has no coaches


def rewind_to_week1(d):
    """Undo what build_midseason_start.py baked in: records, 2026 stat rows and
    the trimmed schedule. Rosters, contracts, injuries and ratings stay."""
    played = (d.get("bsRealSeason") or {}).get("games", [])
    # 1. Records back to 0-0.
    for t in d["teams"]:
        for s in t.get("seasons", []):
            if s.get("season") == SEASON:
                for f in RECORD_FIELDS:
                    if f in s:
                        s[f] = 0
                s["lastTen"] = []
                s["streak"] = 0
    # 2. No 2026 regular-season stats yet.
    nrows = 0
    for p in d["players"]:
        if p.get("stats"):
            before = len(p["stats"])
            p["stats"] = [s for s in p["stats"] if not (s.get("season") == SEASON and not s.get("playoffs"))]
            nrows += before - len(p["stats"])
    # 3. Full real schedule: played games (by real week) in front of the
    #    remaining ones the main file already carries. FBGM's `day` == week.
    full = [(g["week"], g["homeTid"], g["awayTid"]) for g in played] + \
           [(g["day"], g["homeTid"], g["awayTid"]) for g in d["schedule"]]
    full.sort(key=lambda g: g[0])
    d["schedule"] = [{"gid": i, "day": w, "homeTid": h, "awayTid": a} for i, (w, h, a) in enumerate(full)]
    d["games"] = []
    ga = d["gameAttributes"]
    ga["phase"] = 1
    ga["season"] = SEASON
    ga["daysLeft"] = 0
    # Sanity: 32 teams x 17 games, no team twice in a week.
    per_team = Counter()
    per_week = set()
    for w, h, a in full:
        per_team[h] += 1
        per_team[a] += 1
        for tid in (h, a):
            assert (w, tid) not in per_week, f"tid {tid} plays twice in week {w}"
            per_week.add((w, tid))
    assert len(full) == 272 and set(per_team.values()) == {17}, (len(full), per_team)
    assert {w for w, _, _ in full} == set(range(1, 19)), sorted({w for w, _, _ in full})
    injured = sum(1 for p in d["players"] if (p.get("injury") or {}).get("gamesRemaining", 0) > 0 and p.get("tid", -3) >= 0)
    d.setdefault("meta", {})["week1"] = (
        f"Week 1 start built from the {(d.get('bsRealSeason') or {}).get('asOf', '?')} roster: records reset, "
        f"{len(played)} already-played games put back into the full 272-game 2026 schedule, "
        f"{nrows} 2026 stat rows removed; this week's rosters, contracts, injuries ({injured} players) "
        f"and performance-adjusted ratings kept.")
    return {"playedRestored": len(played), "statRowsRemoved": nrows, "scheduleGames": len(full), "injuredKept": injured}


def main():
    d = json.load(open(SRC))

    week1 = copy.deepcopy(d)
    w1 = rewind_to_week1(week1)
    npros_w1, ndp_w1 = shift_drafts(week1)
    strip_bs_blocks(week1)
    json.dump(week1, open(DST_WEEK1, "w"), ensure_ascii=False, allow_nan=False)

    npros, ndp = shift_drafts(d)
    strip_bs_blocks(d)
    json.dump(d, open(DST_VANILLA, "w"), ensure_ascii=False, allow_nan=False)
    assert (npros, ndp) == (npros_w1, ndp_w1)
    print(json.dumps({"vanilla": DST_VANILLA, "week1": DST_WEEK1, "prospectsShifted": npros, "draftPicksShifted": ndp, **w1}))


if __name__ == "__main__":
    main()
