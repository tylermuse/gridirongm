#!/usr/bin/env python3
"""Build the stock-Football-GM download variant of the NFL 2026 roster.

Stock FBGM (play.football-gm.com) names each draft by the season it happens
in, so a league loaded mid-2026 runs the "2026" draft at season's end. Our
real prospect classes are keyed by NFL draft year (2027, 2028), which leaves
2026 empty -> FBGM generates a fake class and the real players sit a year
out behind it. dumbmatter confirmed FBGM won't change this. BS Football
handles the original file correctly, so the main file stays untouched; this
variant shifts every future draft class and draft pick down one year so the
first draft a vanilla-FBGM user reaches is the real one.

Served by the rosters-page "Download JSON" button (used almost exclusively
for FBGM). The in-app "Play in BS Football" link keeps the original file.
Run after build_midseason_start.py so it derives from the final roster.
"""
import json

SRC = "public/rosters/FBGM_NFL_Roster_2026_Updated.json"
DST = "public/rosters/FBGM_NFL_Roster_2026_Vanilla.json"


def main():
    d = json.load(open(SRC))
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
    # BS Football-only real-season block (box scores keyed for BS); stock FBGM
    # reads the real records, schedule and stats rows it needs elsewhere.
    d.pop("bsRealSeason", None)
    json.dump(d, open(DST, "w"), ensure_ascii=False, allow_nan=False)
    print(json.dumps({"vanilla": DST, "prospectsShifted": npros, "draftPicksShifted": ndp}))


if __name__ == "__main__":
    main()
