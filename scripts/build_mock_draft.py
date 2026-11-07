#!/usr/bin/env python3
"""Build the data file for the standalone /mock-draft tool.

Reads public/rosters/FBGM_NFL_Roster_2026_Updated.json (never modifies it) and
writes public/mock/nfl-2027.json — small enough for the client to load,
unlike the 5,600-player roster file. Run from repo root; weekly_roster_update.py
calls it after the roster/standings refresh, so the draft order, pick owners
and team needs track the real season.

Contents:
  - prospects: the 2027 class (tid -2, draft.year 2027), ranked by value
  - teams: real record, strength of schedule so far, the roster context
    the shared draft AI needs (countByPosition, bestQbOvr, hasDevQB —
    see src/lib/engine/draftAI.ts), and starterOvr (display-only needs signal)
  - order: all 224 picks, "if the season ended today". Teams sorted by win %
    ascending, ties broken by lower strength of schedule (the NFL's first
    draft-order tiebreaker), then tid. Each slot carries its CURRENT owner, so
    traded picks show up correctly. No playoff-round ordering in-season.
"""
import datetime, json, os
from collections import defaultdict

ROSTER = "public/rosters/FBGM_NFL_Roster_2026_Updated.json"
OUT = "public/mock/nfl-2027.json"
SEASON, DRAFT_YEAR = 2026, 2027
POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"]
# Mirrors ROSTER_LIMITS max in src/types/index.ts. Real NFL rosters in the file
# carry 69-87 players (practice squad + IR), so raw counts read as "maxed" at
# nearly every position and the draft AI's max-roster penalty would wipe out
# top prospects at random. For the mock we count each team's 53 best healthy
# players and cap every position at max-1, so need only bites where a team is
# genuinely thin. Tunable here; the in-game draft is unaffected.
ROSTER_MAX = {"QB": 3, "RB": 4, "WR": 6, "TE": 3, "OL": 10, "DL": 10, "LB": 8, "CB": 6, "S": 5, "K": 1, "P": 1}
CORE_ROSTER = 53
REAL_QB_OVR = 65  # a QB below this doesn't count as "has a QB" for the QB-need logic
SEASON_ENDING = 50  # injury gamesRemaining at/above this = out for the year
# Starters per position for starterOvr, the "where is this team weak" signal on
# the team pages and the tool's needs strip. Display only: the draft AI doesn't read it.
STARTERS = {"QB": 1, "RB": 1, "WR": 3, "TE": 1, "OL": 5, "DL": 4, "LB": 3, "CB": 3, "S": 2, "K": 1, "P": 1}
EMPTY_SLOT_OVR = 40  # a starting slot the team can't fill counts as replacement level


def pct(w, l, t):
    g = w + l + t
    return (w + 0.5 * t) / g if g else 0.0


def starter_ovr(roster, pos):
    """Mean OVR of the team's best STARTERS[pos] players at pos, rounded to a tenth."""
    best = sorted((x[1] for x in roster if x[0] == pos), reverse=True)[: STARTERS[pos]]
    best += [EMPTY_SLOT_OVR] * (STARTERS[pos] - len(best))
    return round(sum(best) / len(best), 1)


def main():
    d = json.load(open(ROSTER))
    players, teams = d["players"], d["teams"]

    # --- records + strength of schedule (opponents faced so far) ---
    rec = {}
    for t in teams:
        s = next((s for s in t["seasons"] if s["season"] == SEASON), {})
        rec[t["tid"]] = (s.get("won", 0), s.get("lost", 0), s.get("tied", 0))
    real = d.get("bsRealSeason") or {}
    opps = defaultdict(list)
    pf, pa = defaultdict(int), defaultdict(int)
    for g in real.get("games", []):
        h, a = g["homeTid"], g["awayTid"]
        opps[h].append(a); opps[a].append(h)
        pf[h] += g["homeScore"]; pa[h] += g["awayScore"]
        pf[a] += g["awayScore"]; pa[a] += g["homeScore"]

    def sos(tid):
        w = l = t_ = 0
        for o in opps[tid]:
            ow, ol, ot = rec[o]; w += ow; l += ol; t_ += ot
        return pct(w, l, t_)

    # --- roster context for the draft AI ---
    by_team = defaultdict(list)
    for p in players:
        inj = p.get("injury") or {}
        out_for_year = inj.get("type", "Healthy") != "Healthy" and inj.get("gamesRemaining", 0) >= SEASON_ENDING
        if p["tid"] >= 0 and not out_for_year:
            r = p["ratings"][-1]
            exp = max(0, SEASON - (p.get("draft", {}).get("year") or SEASON))
            by_team[p["tid"]].append((r["pos"], r["ovr"], r["pot"], exp))

    team_out = []
    for t in teams:
        roster = sorted(by_team[t["tid"]], key=lambda x: -x[1])[:CORE_ROSTER]
        w, l, ti = rec[t["tid"]]
        qbs = [x for x in roster if x[0] == "QB"]
        counts = {pos: min(sum(1 for x in roster if x[0] == pos), max(0, ROSTER_MAX[pos] - 1)) for pos in POSITIONS}
        counts["QB"] = min(sum(1 for x in qbs if x[1] >= REAL_QB_OVR) or (1 if qbs else 0), ROSTER_MAX["QB"] - 1)
        team_out.append({
            "tid": t["tid"], "abbrev": t["abbrev"], "region": t["region"], "name": t["name"],
            "colors": t.get("colors"), "imgURL": t.get("imgURL", ""), "cid": t.get("cid"), "did": t.get("did"),
            "won": w, "lost": l, "tied": ti, "pf": pf[t["tid"]], "pa": pa[t["tid"]],
            "sos": round(sos(t["tid"]), 4),
            "countByPosition": counts,
            "bestQbOvr": max((x[1] for x in qbs), default=0),
            "hasDevQB": any(x[3] <= 1 and x[2] >= 80 for x in qbs),
            "starterOvr": {pos: starter_ovr(roster, pos) for pos in POSITIONS},
        })

    # --- draft order, if the season ended today ---
    slot_order = sorted(team_out, key=lambda t: (pct(t["won"], t["lost"], t["tied"]), t["sos"], t["tid"]))
    picks = {(p["round"], p["originalTid"]): p for p in d["draftPicks"] if p["season"] == DRAFT_YEAR}
    order, n = [], len(slot_order)
    for rnd in range(1, 8):
        for i, t in enumerate(slot_order):
            pk = picks.get((rnd, t["tid"]))
            if not pk:
                raise SystemExit(f"missing {DRAFT_YEAR} round {rnd} pick for {t['abbrev']}")
            order.append({"pick": (rnd - 1) * n + i + 1, "round": rnd, "pickInRound": i + 1,
                          "tid": pk["tid"], "originalTid": pk["originalTid"], "dpid": pk["dpid"]})

    # --- the class ---
    cls = [p for p in players if p["tid"] == -2 and p.get("draft", {}).get("year") == DRAFT_YEAR]
    cls.sort(key=lambda p: -p.get("value", 0))
    prospects = []
    for rank, p in enumerate(cls, 1):
        r = p["ratings"][-1]
        prospects.append({
            "pid": p["pid"], "rank": rank, "firstName": p["firstName"], "lastName": p["lastName"],
            "pos": r["pos"], "college": p.get("college", ""), "ovr": r["ovr"], "pot": r["pot"],
            "value": round(p.get("value", 0), 1), "age": DRAFT_YEAR - p["born"]["year"],
            "hgt": p.get("hgt"), "weight": p.get("weight"), "imgURL": p.get("imgURL", ""),
        })

    out = {"draftYear": DRAFT_YEAR, "season": SEASON, "asOf": real.get("asOf") or str(datetime.date.today()),
           "currentWeek": real.get("currentWeek"), "numRounds": 7, "teams": team_out,
           "order": order, "prospects": prospects}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    traded = sum(1 for o in order if o["tid"] != o["originalTid"])
    print(json.dumps({"mockDraft": OUT, "prospects": len(prospects), "picks": len(order),
                      "tradedPicks": traded, "week": out["currentWeek"],
                      "top3Order": [next(t["abbrev"] for t in team_out if t["tid"] == o["tid"]) for o in order[:3]]}))


if __name__ == "__main__":
    main()
