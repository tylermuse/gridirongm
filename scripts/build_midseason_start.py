#!/usr/bin/env python3
"""Sync the 2026 roster to the real NFL season so far, so a new league opens at
the CURRENT NFL week. Run from repo root; idempotent, safe to re-run weekly
after the roster/injury refresh (weekly_roster_update.py calls it).

Bakes into public/rosters/FBGM_NFL_Roster_2026_Updated.json:
  - schedule: the real remaining slate. Played games are removed, so the
    league opens at the first unplayed week (read by FBGM and BS Football).
  - team records: real W-L with home/away/div/conf splits in each team's 2026
    season row.
  - player stats: one FBGM 2026 stats row per player per team, from nflverse
    weekly stats + snap counts (ESPN box score fallback for any final nflverse
    hasn't published yet).
  - bsRealSeason: BS Football-only block with every completed game's final
    score and per-player box line, so the in-app league starts with real
    standings, box scores and season stats. build_vanilla_fbgm.py strips it
    from the stock-FBGM download.
  - performance-adjusted ratings: players clearly out- or under-performing
    their OVR, relative to qualified peers at their position, move up or down
    (scaled by sample size, capped per position). Applied deltas are logged to
    ADJ_LOG and reverted at the start of each run, so re-runs never compound.
"""
import csv, datetime, io, json, os, re, subprocess
from collections import defaultdict

ROSTER = "public/rosters/FBGM_NFL_Roster_2026_Updated.json"
ADJ_LOG = "scripts/data/nfl2026_perf_adjustments.json"
SEASON = 2026
NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
ABBR_TID = {'ARI':0,'ATL':1,'BAL':2,'BUF':3,'CAR':4,'CHI':5,'CIN':6,'CLE':7,'DAL':8,'DEN':9,'DET':10,'GB':11,'HOU':12,'IND':13,'JAX':14,'KC':15,'LV':16,'LAC':17,'LAR':18,'MIA':19,'MIN':20,'NE':21,'NO':22,'NYG':23,'NYJ':24,'PHI':25,'PIT':26,'SF':27,'SEA':28,'TB':29,'TEN':30,'WSH':31}
ESPN_TO_NFLV = {'LAR': 'LA', 'WSH': 'WAS'}  # every other team code is shared
NFLV_TID = {ESPN_TO_NFLV.get(ab, ab): tid for ab, tid in ABBR_TID.items()}


def fetch(url):
    for _ in range(3):
        r = subprocess.run(["curl", "-sL", "--fail", "--max-time", "120", url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout
    raise SystemExit(f"fetch failed: {url}")


def espn(path):
    return json.loads(fetch(f"{ESPN}/{path}"))


def csv_rows(name):
    return list(csv.DictReader(io.StringIO(fetch(f"{NFLVERSE}/{name}").decode("utf-8"))))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def norm_name(s):
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", (s or "").lower())
    return re.sub(r"[^a-z]", "", s)


# ---------------------------------------------------------------- games
def fetch_games():
    games = []
    for wk in range(1, 19):
        sc = espn(f"scoreboard?seasontype=2&week={wk}&dates={SEASON}")
        for e in sc.get("events", []):
            comp = e.get("competitions", [{}])[0]
            cs = comp.get("competitors", [])
            h = next((c for c in cs if c.get("homeAway") == "home"), None)
            a = next((c for c in cs if c.get("homeAway") == "away"), None)
            if not h or not a:
                continue
            ha, aa = h["team"]["abbreviation"], a["team"]["abbreviation"]
            if ha not in ABBR_TID or aa not in ABBR_TID:
                continue
            games.append({
                "week": wk, "eid": e["id"], "home": ABBR_TID[ha], "away": ABBR_TID[aa],
                "nflv": f"{SEASON}_{wk:02d}_{ESPN_TO_NFLV.get(aa, aa)}_{ESPN_TO_NFLV.get(ha, ha)}",
                "done": bool((comp.get("status") or {}).get("type", {}).get("completed")),
                "hs": int(h.get("score") or 0), "as": int(a.get("score") or 0),
            })
    return games


# ---------------------------------------------------------------- player matching
class Matcher:
    """Resolves an nflverse/ESPN player to a roster pid: ESPN id (from the
    roster's ESPN headshot URL) first, then normalized name; ties prefer the
    team the player played for, then rostered over FA."""

    def __init__(self, players, id_rows):
        self.by_espn = defaultdict(list)
        self.by_name = defaultdict(list)
        for p in players:
            if p.get("tid", -3) < -1:  # skip draft prospects and retired
                continue
            m = re.search(r"/players/full/(\d+)\.png", p.get("imgURL") or "")
            if m:
                self.by_espn[m.group(1)].append(p)
            self.by_name[norm_name(f"{p.get('firstName', '')} {p.get('lastName', '')}")].append(p)
        self.gsis_espn = {r["gsis_id"]: r.get("espn_id") for r in id_rows if r.get("gsis_id")}
        self.pfr_espn = {r["pfr_id"]: r.get("espn_id") for r in id_rows if r.get("pfr_id")}
        self.cache = {}
        self.unmatched = set()

    def resolve(self, espn_id, name, tid, key):
        ck = (key, tid)
        if ck in self.cache:
            return self.cache[ck]
        cands = self.by_espn.get(espn_id or "", [])
        by_name = not cands
        if by_name:
            cands = self.by_name.get(norm_name(name), [])
        pick = None
        if cands:
            ranked = sorted(cands, key=lambda p: (p["tid"] != tid, p["tid"] < 0))
            # A bare name match is only trusted when unambiguous or on this team.
            if not by_name or len(cands) == 1 or ranked[0]["tid"] == tid:
                pick = ranked[0]["pid"]
        if pick is None:
            self.unmatched.add(name)
        self.cache[ck] = pick
        return pick


# ---------------------------------------------------------------- stat lines
# Canonical per-game line, keyed by nflverse column names (the ESPN fallback
# fills the same keys). FBGM rows, BS box lines and the ratings model read it.
SUM_KEYS = [
    "completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions",
    "sacks_suffered", "sack_yards_lost", "passing_epa", "carries", "rushing_yards",
    "rushing_tds", "rushing_epa", "receptions", "targets", "receiving_yards",
    "receiving_tds", "receiving_epa", "fumbles_total", "fumbles_lost_total",
    "def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks",
    "def_qb_hits", "def_interceptions", "def_interception_yards", "def_pass_defended",
    "def_fumbles_forced", "fumble_recovery_opp", "def_safeties", "kickoff_returns",
    "kickoff_return_yards", "punt_returns", "punt_return_yards", "fg_made", "fg_att",
    "pat_made", "pat_att", "pt_att", "pt_yards", "pt_inside_20", "pt_touchback",
    "pt_blocked", "pt_net_yards", "penalties", "penalty_yards",
]
MAX_KEYS = ["fg_long", "pt_long"]
FG_BUCKETS = [(0, 19, "0"), (20, 29, "20"), (30, 39, "30"), (40, 49, "40"), (50, 99, "50")]  # FBGM fg0..fg50


def fg_bucket(dist):
    return next(b for lo, hi, b in FG_BUCKETS if lo <= dist <= hi)


def line_from_nflverse(r):
    ln = {k: num(r.get(k)) for k in SUM_KEYS + MAX_KEYS}
    if not r.get("fumbles_total"):
        ln["fumbles_total"] = num(r.get("rushing_fumbles")) + num(r.get("receiving_fumbles")) + num(r.get("sack_fumbles"))
    for col, made in (("fg_made_list", True), ("fg_missed_list", False), ("fg_blocked_list", False)):
        for dist in filter(None, (r.get(col) or "").split(";")):
            b = fg_bucket(int(num(dist)))
            ln[f"fga{b}"] = ln.get(f"fga{b}", 0) + 1
            if made:
                ln[f"fg{b}"] = ln.get(f"fg{b}", 0) + 1
    return ln


ESPN_CATS = {
    "passing": {"completions/passingAttempts": ("completions", "attempts"), "passingYards": "passing_yards",
                "passingTouchdowns": "passing_tds", "interceptions": "passing_interceptions",
                "sacks-sackYardsLost": ("sacks_suffered", "sack_yards_lost")},
    "rushing": {"rushingAttempts": "carries", "rushingYards": "rushing_yards", "rushingTouchdowns": "rushing_tds"},
    "receiving": {"receptions": "receptions", "receivingYards": "receiving_yards",
                  "receivingTouchdowns": "receiving_tds", "receivingTargets": "targets"},
    "fumbles": {"fumbles": "fumbles_total", "fumblesLost": "fumbles_lost_total"},
    "defensive": {"soloTackles": "def_tackles_solo", "sacks": "def_sacks", "tacklesForLoss": "def_tackles_for_loss",
                  "passesDefended": "def_pass_defended", "QBHits": "def_qb_hits"},
    "interceptions": {"interceptions": "def_interceptions", "interceptionYards": "def_interception_yards"},
    "kickReturns": {"kickReturns": "kickoff_returns", "kickReturnYards": "kickoff_return_yards"},
    "puntReturns": {"puntReturns": "punt_returns", "puntReturnYards": "punt_return_yards"},
    "kicking": {"fieldGoalsMade/fieldGoalAttempts": ("fg_made", "fg_att"), "longFieldGoalMade": "fg_long",
                "extraPointsMade/extraPointAttempts": ("pat_made", "pat_att")},
    "punting": {"punts": "pt_att", "puntYards": "pt_yards", "touchbacks": "pt_touchback",
                "puntsInside20": "pt_inside_20", "longPunt": "pt_long"},
}


def lines_from_espn_box(g, matcher):
    """Fallback for a final nflverse hasn't published yet: ESPN box score lines."""
    box = espn(f"summary?event={g['eid']}").get("boxscore", {})
    out = {}
    for team in box.get("players", []):
        tid = ABBR_TID.get(team["team"]["abbreviation"])
        for cat in team.get("statistics", []):
            spec = ESPN_CATS.get(cat["name"])
            if not spec:
                continue
            for a in cat.get("athletes", []):
                ath = a["athlete"]
                pid = matcher.resolve(ath.get("id"), ath.get("displayName"), tid, f"espn:{ath.get('id')}")
                if pid is None:
                    continue
                ln = out.setdefault(pid, {"tid": tid, "line": {}})["line"]
                vals = dict(zip(cat.get("keys", []), a.get("stats", [])))
                for key, val in vals.items():
                    dst = spec.get(key)
                    if isinstance(dst, tuple):
                        for k, v in zip(dst, re.split(r"[/-]", val)):
                            ln[k] = ln.get(k, 0) + num(v)
                    elif dst:
                        ln[dst] = ln.get(dst, 0) + num(val)
                if cat["name"] == "defensive":
                    ln["def_tackle_assists"] = ln.get("def_tackle_assists", 0) + num(vals.get("totalTackles")) - num(vals.get("soloTackles"))
                if cat["name"] == "kicking":  # distances unknown; FBGM needs a bucket
                    ln["fga30"] = ln.get("fga30", 0) + ln.get("fg_att", 0)
                    ln["fg30"] = ln.get("fg30", 0) + ln.get("fg_made", 0)
    return out


def bs_line(ln):
    """Canonical line -> BS Football PlayerStats keys (zeros dropped)."""
    s = {
        "gamesPlayed": 1,
        "passAttempts": ln.get("attempts", 0), "passCompletions": ln.get("completions", 0),
        "passYards": ln.get("passing_yards", 0), "passTDs": ln.get("passing_tds", 0),
        "interceptions": ln.get("passing_interceptions", 0),
        "rushAttempts": ln.get("carries", 0), "rushYards": ln.get("rushing_yards", 0),
        "rushTDs": ln.get("rushing_tds", 0), "fumbles": ln.get("fumbles_total", 0),
        "targets": ln.get("targets", 0), "receptions": ln.get("receptions", 0),
        "receivingYards": ln.get("receiving_yards", 0), "receivingTDs": ln.get("receiving_tds", 0),
        "tackles": ln.get("def_tackles_solo", 0) + ln.get("def_tackle_assists", 0),
        "tacklesForLoss": ln.get("def_tackles_for_loss", 0), "sacks": ln.get("def_sacks", 0),
        "defensiveINTs": ln.get("def_interceptions", 0), "passDeflections": ln.get("def_pass_defended", 0),
        "forcedFumbles": ln.get("def_fumbles_forced", 0),
        "fieldGoalAttempts": ln.get("fg_att", 0), "fieldGoalsMade": ln.get("fg_made", 0),
        "extraPointAttempts": ln.get("pat_att", 0), "extraPointsMade": ln.get("pat_made", 0),
        "puntAttempts": ln.get("pt_att", 0), "puntYards": ln.get("pt_yards", 0),
        "puntsInside20": ln.get("pt_inside_20", 0), "touchbacks": ln.get("pt_touchback", 0),
        "kickReturns": ln.get("kickoff_returns", 0), "kickReturnYards": ln.get("kickoff_return_yards", 0),
        "puntReturns": ln.get("punt_returns", 0), "puntReturnYards": ln.get("punt_return_yards", 0),
        "snaps": ln.get("off_snaps", 0) + ln.get("def_snaps", 0),
    }
    return {k: (round(v, 1) if k == "sacks" else int(round(v))) for k, v in s.items() if v}


def collect_lines(games, matcher, weekly, snaps):
    """{game index: {pid: {"tid", "line"}}} for every completed game."""
    stats_by_game, snaps_by_game = defaultdict(list), defaultdict(list)
    for r in weekly:
        if r.get("season_type") == "REG":
            stats_by_game[r["game_id"]].append(r)
    for r in snaps:
        if r.get("game_type") == "REG":
            snaps_by_game[r["game_id"]].append(r)
    out, fallbacks = {}, []
    for gi, g in enumerate(games):
        if not g["done"]:
            continue
        rows = stats_by_game.get(g["nflv"], [])
        if rows:
            lines = {}
            for r in rows:
                tid = NFLV_TID.get(r["team"])
                pid = matcher.resolve(matcher.gsis_espn.get(r["player_id"]), r["player_display_name"], tid, r["player_id"])
                if pid is not None:
                    lines[pid] = {"tid": tid, "line": line_from_nflverse(r)}
        else:
            lines = lines_from_espn_box(g, matcher)
            fallbacks.append(g["nflv"])
        for r in snaps_by_game.get(g["nflv"], []):
            tid = NFLV_TID.get(r["team"])
            pid = matcher.resolve(matcher.pfr_espn.get(r["pfr_player_id"]), r["player"], tid, f"pfr:{r['pfr_player_id']}")
            if pid is None:
                continue
            ln = lines.setdefault(pid, {"tid": tid, "line": {}})["line"]
            ln["off_snaps"] = num(r["offense_snaps"])
            ln["def_snaps"] = num(r["defense_snaps"])
            ln["st_snaps"] = num(r["st_snaps"])
            ln["started"] = 1 if max(num(r["offense_pct"]), num(r["defense_pct"])) >= 0.5 else 0
        out[gi] = lines
    return out, fallbacks


# ---------------------------------------------------------------- FBGM stats rows
FBGM_MAP = {
    "pssCmp": "completions", "pss": "attempts", "pssYds": "passing_yards", "pssTD": "passing_tds",
    "pssInt": "passing_interceptions", "pssSk": "sacks_suffered", "pssSkYds": "sack_yards_lost",
    "rus": "carries", "rusYds": "rushing_yards", "rusTD": "rushing_tds", "tgt": "targets",
    "rec": "receptions", "recYds": "receiving_yards", "recTD": "receiving_tds",
    "fmb": "fumbles_total", "fmbLost": "fumbles_lost_total", "defTckSolo": "def_tackles_solo",
    "defTckAst": "def_tackle_assists", "defTckLoss": "def_tackles_for_loss", "defSk": "def_sacks",
    "defInt": "def_interceptions", "defIntYds": "def_interception_yards", "defPssDef": "def_pass_defended",
    "defFmbFrc": "def_fumbles_forced", "defFmbRec": "fumble_recovery_opp", "defSft": "def_safeties",
    "kr": "kickoff_returns", "krYds": "kickoff_return_yards", "pr": "punt_returns", "prYds": "punt_return_yards",
    "xp": "pat_made", "xpa": "pat_att", "pnt": "pt_att", "pntYds": "pt_yards", "pntTB": "pt_touchback",
    "pntIn20": "pt_inside_20", "pntBlk": "pt_blocked", "pen": "penalties", "penYds": "penalty_yards",
}
ROW_META = ("season", "tid", "playoffs", "yearsWithTeam", "jerseyNumber")


def write_fbgm_stats(d, games, lines_by_game):
    template = next(s for p in d["players"] for s in p.get("stats", []) if "pssCmp" in s)
    zero = {k: 0 for k, v in template.items()
            if k not in ROW_META and isinstance(v, (int, float)) and not isinstance(v, bool)}
    acc, first_week = {}, {}  # (pid, tid) -> row / first week played for that team
    for gi, lines in lines_by_game.items():
        g = games[gi]
        qb = {}  # each team's starting QB (most dropbacks) takes the W/L/T
        for pid, e in lines.items():
            db = e["line"].get("attempts", 0) + e["line"].get("sacks_suffered", 0)
            if db and db > qb.get(e["tid"], (None, 0))[1]:
                qb[e["tid"]] = (pid, db)
        for pid, e in lines.items():
            tid, ln = e["tid"], e["line"]
            row = acc.setdefault((pid, tid), dict(zero))
            first_week.setdefault((pid, tid), g["week"])
            row["gp"] += 1
            row["gs"] += ln.get("started", 0)
            for fk, ck in FBGM_MAP.items():
                if fk in row:
                    row[fk] += ln.get(ck, 0)
            row["fgLng"] = max(row["fgLng"], int(ln.get("fg_long", 0)))
            row["pntLng"] = max(row["pntLng"], int(ln.get("pt_long", 0)))
            for _, _, b in FG_BUCKETS:
                row[f"fg{b}"] += ln.get(f"fg{b}", 0)
                row[f"fga{b}"] += ln.get(f"fga{b}", 0)
            if qb.get(tid, (None,))[0] == pid:
                mine, theirs = (g["hs"], g["as"]) if tid == g["home"] else (g["as"], g["hs"])
                row["qbW" if mine > theirs else "qbL" if mine < theirs else "qbT"] += 1
    by_pid = {p["pid"]: p for p in d["players"]}
    for p in d["players"]:  # drop stale 2026 regular-season rows, then append fresh ones
        p["stats"] = [s for s in p.get("stats", []) if not (s.get("season") == SEASON and not s.get("playoffs"))]
    for (pid, tid) in sorted(acc, key=lambda k: first_week[k]):
        p = by_pid[pid]
        prev = p["stats"][-1] if p["stats"] else None
        row = {"playoffs": False, "season": SEASON, "tid": tid,
               "yearsWithTeam": (prev.get("yearsWithTeam", 0) + 1) if prev and prev.get("tid") == tid else 1}
        row.update({k: (round(v, 1) if v % 1 else int(v)) for k, v in acc[(pid, tid)].items()})
        if p.get("jerseyNumber") is not None:
            row["jerseyNumber"] = p["jerseyNumber"]
        p["stats"].append(row)
        p["statsTids"] = sorted(set(p.get("statsTids", [])) | {tid})
    return len(acc)


# ---------------------------------------------------------------- ratings
POS_SKILLS = {  # core FBGM ratings that move with performance (physicals don't)
    "QB": ["thv", "thp", "tha"], "RB": ["elu", "bsc", "hnd"], "WR": ["rtr", "hnd", "elu"],
    "TE": ["hnd", "rtr", "rbk"], "DL": ["prs", "rns", "tck"], "LB": ["tck", "rns", "pcv"],
    "CB": ["pcv"], "S": ["pcv", "tck", "rns"], "K": ["kac", "kpw"], "P": ["ppw", "pac"],
}
FG_EXPECTED = {"0": 0.99, "20": 0.97, "30": 0.92, "40": 0.80, "50": 0.65}  # NFL make rate by distance


def per(a, b):
    return a / b if b else 0.0


def def_snaps_pg(t):
    return per(t["def_snaps"], t["gp"])


def rec_comps():
    return [(lambda t: per(t["receiving_yards"], t["gp"]), 0.4), (lambda t: per(t["receiving_yards"], t["targets"]), 0.3),
            (lambda t: per(t["receiving_epa"], t["targets"]), 0.2), (lambda t: per(t["receiving_tds"], t["gp"]), 0.1)]


# pos -> (qualifies, sample size, sample size at half weight, max |delta|, [(component, weight)])
# Components are z-scored within the position's qualified pool. Snaps per game
# stands in for coaches' trust where the box score has little else (DB/DL/LB).
# OL is left alone: public box scores carry no individual line-play signal, and
# any position whose production doesn't track OVR this season (MIN_CORR) is too.
MODELS = {
    "QB": (lambda t: t["attempts"] + t["sacks_suffered"] >= 60,
           lambda t: t["attempts"] + t["sacks_suffered"] + t["carries"], 150, 8,
           [(lambda t: per(t["passing_epa"] + t["rushing_epa"], t["attempts"] + t["sacks_suffered"] + t["carries"]), 0.6),
            (lambda t: per(t["passing_yards"] + 20 * t["passing_tds"] - 45 * t["passing_interceptions"] - t["sack_yards_lost"],
                           t["attempts"] + t["sacks_suffered"]), 0.4)]),  # ANY/A
    "RB": (lambda t: t["carries"] + t["receptions"] >= 40,
           lambda t: t["carries"] + t["receptions"], 100, 7,
           [(lambda t: per(t["rushing_yards"], t["carries"]), 0.3),
            (lambda t: per(t["rushing_yards"] + t["receiving_yards"], t["gp"]), 0.35),
            (lambda t: per(t["rushing_epa"] + t["receiving_epa"], t["carries"] + t["targets"]), 0.2),
            (lambda t: per(t["rushing_tds"] + t["receiving_tds"], t["gp"]), 0.15)]),
    "WR": (lambda t: t["targets"] >= 20, lambda t: t["targets"], 50, 7, rec_comps()),
    "TE": (lambda t: t["targets"] >= 12, lambda t: t["targets"], 40, 6, rec_comps()),
    "DL": (lambda t: t["def_snaps"] >= 120, lambda t: t["def_snaps"], 300, 6,
           [(lambda t: per(t["def_sacks"] + 0.5 * t["def_qb_hits"], t["def_snaps"]), 0.5),
            (lambda t: per(t["def_tackles_for_loss"] + 0.15 * (t["def_tackles_solo"] + t["def_tackle_assists"]), t["def_snaps"]), 0.25),
            (def_snaps_pg, 0.25)]),
    "LB": (lambda t: t["def_snaps"] >= 120, lambda t: t["def_snaps"], 300, 6,
           [(lambda t: per(t["def_tackles_solo"] + t["def_tackle_assists"], t["def_snaps"]), 0.25),
            (lambda t: per(t["def_tackles_for_loss"] + t["def_sacks"] + 0.5 * t["def_qb_hits"] + t["def_pass_defended"]
                           + 2 * t["def_interceptions"] + t["def_fumbles_forced"], t["def_snaps"]), 0.45),
            (def_snaps_pg, 0.3)]),
    "CB": (lambda t: t["def_snaps"] >= 150, lambda t: t["def_snaps"], 400, 4,
           [(lambda t: per(t["def_pass_defended"] + 2 * t["def_interceptions"], t["def_snaps"]), 0.6), (def_snaps_pg, 0.4)]),
    "S": (lambda t: t["def_snaps"] >= 150, lambda t: t["def_snaps"], 400, 4,
          [(lambda t: per(t["def_pass_defended"] + 2 * t["def_interceptions"], t["def_snaps"]), 0.4),
           (lambda t: per(t["def_tackles_solo"] + t["def_tackle_assists"] + 2 * t["def_tackles_for_loss"], t["def_snaps"]), 0.25),
           (def_snaps_pg, 0.35)]),
    "K": (lambda t: t["fg_att"] >= 6, lambda t: t["fg_att"], 15, 6,
          [(lambda t: per(t["fg_made"] - sum(t[f"fga{b}"] * e for b, e in FG_EXPECTED.items()), t["fg_att"]), 0.75),
           (lambda t: per(t["pat_made"], t["pat_att"]), 0.25)]),
    "P": (lambda t: t["pt_att"] >= 12, lambda t: t["pt_att"], 25, 5,
          [(lambda t: per(t["pt_net_yards"], t["pt_att"]), 0.6), (lambda t: per(t["pt_inside_20"], t["pt_att"]), 0.4)]),
}
PTS_PER_SD = 5   # OVR points for production 1 SD above/below what the rating predicts (full sample)
MIN_CORR = 0.15  # production must track OVR at least this well for the metric to be trusted


def mean(vals):
    return sum(vals) / len(vals)


def sd(vals):
    m = mean(vals)
    return (sum((v - m) ** 2 for v in vals) / len(vals)) ** 0.5 or 1.0


def zscores(vals):
    m, s = mean(vals), sd(vals)
    return [(v - m) / s for v in vals]


def bump(r, key, delta):
    """Apply delta to r[key] within 0-100; return the delta actually applied."""
    before = r.get(key, 0)
    r[key] = max(0, min(100, before + delta))
    return r[key] - before


def revert_adjustments(d, log):
    by_pid = {p["pid"]: p for p in d["players"]}
    n = 0
    for pid, entry in log.get("players", {}).items():
        p = by_pid.get(int(pid))
        r = p["ratings"][-1] if p and p.get("ratings") else {}
        # Only undo what is still there (a regenerated file has nothing to undo).
        if r.get("season") != SEASON or r.get("ovr") != entry["ovrAfter"]:
            continue
        for key, delta in entry["applied"].items():
            if key.startswith("ovrs."):
                r["ovrs"][key[5:]] -= delta
            else:
                r[key] -= delta
        n += 1
    return n


def adjust_ratings(d, lines_by_game):
    totals = defaultdict(lambda: defaultdict(float))
    for lines in lines_by_game.values():
        for pid, e in lines.items():
            t = totals[pid]
            t["gp"] += 1
            for k, v in e["line"].items():
                t[k] += v
    by_pid = {p["pid"]: p for p in d["players"]}
    log, fits = {}, {}
    for pos, (qualifies, sample, half, cap, comps) in MODELS.items():
        pool = []
        for pid, t in totals.items():
            p = by_pid[pid]
            r = p["ratings"][-1]
            if r.get("pos") == pos and r.get("season") == SEASON and "ovr" in r and qualifies(t):
                pool.append((pid, t, r))
        if len(pool) < 12:
            continue
        cols = [zscores([fn(t) for _, t, _ in pool]) for fn, _ in comps]
        scores = [sum(w * col[i] for (_, w), col in zip(comps, cols)) for i in range(len(pool))]
        # Judge each player against what his OVR predicts (linear fit within the
        # pool), not against the league: an elite player producing like an
        # elite player stays put, and only the surprise moves the rating.
        ovrs = [r["ovr"] for _, _, r in pool]
        mo, ms = mean(ovrs), mean(scores)
        cov = mean([(o - mo) * (s - ms) for o, s in zip(ovrs, scores)])
        corr = cov / (sd(ovrs) * sd(scores))
        fits[pos] = {"pool": len(pool), "corr": round(corr, 2)}
        if corr < MIN_CORR:
            continue
        slope = cov / sd(ovrs) ** 2
        resid = [s - (ms + slope * (o - mo)) for o, s in zip(ovrs, scores)]
        resid_sd = sd(resid)
        for i, (pid, t, r) in enumerate(pool):
            rz = resid[i] / resid_sd
            n = sample(t)
            delta = round(max(-cap, min(cap, PTS_PER_SD * n / (n + half) * rz)))
            if delta == 0:
                continue
            p = by_pid[pid]
            ovr_before = r["ovr"]
            applied = {"ovr": bump(r, "ovr", delta)}
            if pos in r.get("ovrs", {}):
                applied["ovrs." + pos] = bump(r["ovrs"], pos, delta)
            for k in POS_SKILLS[pos]:
                applied[k] = bump(r, k, delta)
            # Potential tracks the change but never sits below the new OVR.
            applied["pot"] = bump(r, "pot", delta + max(0, r["ovr"] - (r.get("pot", 0) + delta)))
            log[str(pid)] = {
                "name": f"{p.get('firstName', '')} {p.get('lastName', '')}".strip(), "pos": pos, "tid": p.get("tid"),
                "ovrBefore": ovr_before, "ovrAfter": r["ovr"], "delta": delta, "residualZ": round(rz, 2),
                "sample": int(n), "applied": {k: v for k, v in applied.items() if v},
            }
    return log, fits


# ---------------------------------------------------------------- records + schedule
REC_FIELDS = ["won", "lost", "tied", "wonHome", "lostHome", "tiedHome", "wonAway", "lostAway", "tiedAway",
              "wonDiv", "lostDiv", "tiedDiv", "wonConf", "lostConf", "tiedConf"]


def write_records_and_schedule(d, games):
    cid = {t["tid"]: t.get("cid") for t in d["teams"]}
    did = {t["tid"]: t.get("did") for t in d["teams"]}
    rec = {t: {k: 0 for k in REC_FIELDS} for t in range(32)}

    def tally(tid, opp, res, home):
        r = rec[tid]
        r[res] += 1
        r[res + ("Home" if home else "Away")] += 1
        if did[tid] == did[opp]:
            r[res + "Div"] += 1
        if cid[tid] == cid[opp]:
            r[res + "Conf"] += 1

    for g in games:
        if not g["done"]:
            continue
        hr, ar = ("won", "lost") if g["hs"] > g["as"] else ("lost", "won") if g["hs"] < g["as"] else ("tied", "tied")
        tally(g["home"], g["away"], hr, True)
        tally(g["away"], g["home"], ar, False)
    for t in d["teams"]:
        for s in t.get("seasons", []):
            if s.get("season") == SEASON:
                r = rec[t["tid"]]
                s.update(r)
                s["gpHome"] = r["wonHome"] + r["lostHome"] + r["tiedHome"]
                s["lastTen"] = []
                s["streak"] = 0
    remaining = [g for g in games if not g["done"]]
    d["schedule"] = [{"gid": i, "day": g["week"], "homeTid": g["home"], "awayTid": g["away"]} for i, g in enumerate(remaining)]
    d["games"] = []
    d["gameAttributes"]["phase"] = 1
    d["gameAttributes"]["season"] = SEASON
    return rec, remaining


def main():
    games = fetch_games()
    weekly = csv_rows(f"stats_player/stats_player_week_{SEASON}.csv")
    snaps = csv_rows(f"snap_counts/snap_counts_{SEASON}.csv")
    id_rows = csv_rows("players/players.csv")
    d = json.load(open(ROSTER))

    old_log = json.load(open(ADJ_LOG)) if os.path.exists(ADJ_LOG) else {}
    reverted = revert_adjustments(d, old_log)

    matcher = Matcher(d["players"], id_rows)
    lines_by_game, fallbacks = collect_lines(games, matcher, weekly, snaps)
    nrows = write_fbgm_stats(d, games, lines_by_game)
    adj, fits = adjust_ratings(d, lines_by_game)
    rec, remaining = write_records_and_schedule(d, games)

    known = {p["pid"] for p in d["players"] if p.get("tid", -3) >= -1}
    current_week = min((g["week"] for g in remaining), default=19)
    d["bsRealSeason"] = {
        "season": SEASON,
        "asOf": datetime.date.today().isoformat(),
        "currentWeek": current_week,
        "games": [{
            "week": games[gi]["week"], "homeTid": games[gi]["home"], "awayTid": games[gi]["away"],
            "homeScore": games[gi]["hs"], "awayScore": games[gi]["as"],
            "playerStats": {str(pid): bs_line(e["line"]) for pid, e in sorted(lines.items()) if pid in known},
        } for gi, lines in sorted(lines_by_game.items(), key=lambda kv: (games[kv[0]]["week"], kv[0]))],
    }
    json.dump(d, open(ROSTER, "w"), ensure_ascii=False, allow_nan=False)
    os.makedirs(os.path.dirname(ADJ_LOG), exist_ok=True)
    json.dump({"season": SEASON, "asOf": d["bsRealSeason"]["asOf"], "fits": fits, "players": adj},
              open(ADJ_LOG, "w"), ensure_ascii=False, indent=1, sort_keys=True)

    ranked = sorted(adj.values(), key=lambda e: e["delta"])
    fmt = lambda e: f"{e['name']} ({e['pos']}) {e['ovrBefore']}->{e['ovrAfter']}"
    print(json.dumps({
        "games": len(games), "completed": len(lines_by_game), "remaining": len(remaining),
        "currentWeek": current_week, "espnFallbackGames": fallbacks, "fbgmStatRows": nrows,
        "unmatchedPlayers": len(matcher.unmatched), "ratingsReverted": reverted, "ratingsAdjusted": len(adj),
        "ratingFits": fits,
        "risers": [fmt(e) for e in ranked[::-1][:12]], "fallers": [fmt(e) for e in ranked[:12]],
        "records": {ab: "{won}-{lost}".format(**rec[tid]) + (f"-{rec[tid]['tied']}" if rec[tid]["tied"] else "")
                    for ab, tid in ABBR_TID.items()},
    }, indent=1))


if __name__ == "__main__":
    main()
