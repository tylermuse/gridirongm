# Sim realism harness

Measures how players move in the 3D chase-cam sim (`public/chase-cam/index.html`) and compares it with real NFL movement. Run it after changing the sim's choreography, timing or playback speed to see which gaps closed.

## Run it

```bash
pip install -r scripts/sim-realism/requirements.txt
python3 -m playwright install chromium        # once

python3 scripts/sim-realism/run_sim.py        # 1,200 plays, about ten minutes
python3 scripts/sim-realism/compare.py        # prints the table, writes out/report.md
```

`run_sim.py --plays 200` gives a quick read in under two minutes. The same `--seed` replays the same plays, so before/after runs are comparable play for play.

## What it does

`run_sim.py` serves the sim page as it is in the repo and opens it in headless Chromium with the same query string the game uses (read from `SIM_URL` in `src/components/game/LiveSim3D.tsx`). It adds a small harness to the page in memory, which steps the sim's own play loop without rendering and logs every player's position 20 times per second of play time. Nothing in `public/` is modified.

`compare.py` resamples each play to 10 frames per second, the rate NFL tracking uses, and computes timing, speed, acceleration, cuts, pocket, pursuit and alignment. It reports each measure three ways:

- **Real:** the target from `benchmarks.json`.
- **On screen:** the sim at the playback speed the game uses (`G.speed`, currently 1.5x). This is what a player sees.
- **Sim clock:** the sim at 1x.

A row is marked `ok` when the on-screen value is within 15% of real.

## Results so far

Same 1,200 plays (seed 20261122) on each build. Measures within 15% of real on screen: 5 of 66 on b19c, 34 of 66 on b21a.

| Measure | Real | b19c (1.5x playback) | b21a (real time) |
| --- | --- | --- | --- |
| Throw, median (s after the snap) | 2.50 | 1.23 | 2.52 |
| Handoff under center (s) | 1.40 | 0.48 | 1.30 |
| Back reaches the line (s) | 2.50 | 0.90 | 2.20 |
| WR distance in the first second (yd) | 1.86 | 9.43 | 2.12 |
| WR top speed, median (yd/s) | 6.85 | 12.32 | 6.36 |
| Plays where anyone tops 11.5 yd/s | 0.7% | 93.9% | 0.0% |
| Sharp cuts per play, all 22 players | 0.01 | 11.12 | 0.83 |
| Nearest defender to the QB at the throw (yd) | 2.80 | 5.74 | 4.90 |
| Gap between neighboring linemen (yd) | 1.55 | 2.54 | 2.54 |

Still open after b21a: line and receiver spacing at the snap, the pocket closing on the quarterback, pursuit to the ball, and cuts by players other than receivers.

## Where the real numbers come from

`benchmarks.json` holds summary numbers only. No NFL tracking data is stored in this repo, and none is needed to run the harness.

- **2023 season:** 14,105 pass plays from the NFL Big Data Bowl 2026 Analytics files on Kaggle (quarterback, route runners and coverage defenders; no run plays, linemen or pass rushers).
- **2017 game:** 135 scrimmage plays with all 22 players, from the sample game the NFL posts at `github.com/nfl-football-ops/Big-Data-Bowl`. Run, pocket, line and pursuit targets rest on this one game, so read them as approximate.

## Definitions

- **Sharp cut:** heading swings more than 60 degrees within 0.2 s while moving faster than 4 yd/s before and after.
- **Acceleration:** change in velocity across 0.4 s, including changes of direction.
- **Snap to throw window:** route runners and coverage defenders only, to match the season data.
- A player stops being measured once his own fall or tackle animation starts, because the sim re-anchors him there.

## Keeping it working

The harness calls the sim's internals by name (`choreograph`, `stepActor`, `separate`, `updateBall`, `blowWhistle`, `setupFormation`, `rollCall`, `FORCED`, `G`, `O`, `D`, `ballPlan`) and mirrors the sub-step loop in `frame()`. If those are renamed or the loop changes, update `HARNESS` in `run_sim.py` to match. If the page's closing `})();</script>` moves, update `TAIL`.

It measures positions only. It says nothing about body animation.
