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
- **On screen:** the sim at the playback speed the game uses (`G.speed`, currently 1.5x, plus the extra rate on handoff runs). This is what a player sees.
- **Sim clock:** the sim at 1x.

A row is marked `ok` when the on-screen value is within 15% of real.

## Results so far

Same 1,200 plays (seed 20261122) on each build. Measures within 15% of real on screen: 5 of 66 on b19c, 34 of 66 on b21a in real time.

| Measure | Real | b19c (1.5x playback) | b21a (real time) | b21a (1.5x playback) |
| --- | --- | --- | --- | --- |
| Throw, median (s after the snap) | 2.50 | 1.23 | 2.52 | 1.68 |
| Handoff under center (s) | 1.40 | 0.48 | 1.30 | 0.87 |
| Back reaches the line (s) | 2.50 | 0.90 | 2.20 | 1.50 |
| WR distance in the first second (yd) | 1.86 | 9.43 | 2.12 | 4.77 |
| WR top speed, median (yd/s) | 6.85 | 12.32 | 6.36 | 9.54 |
| Plays where anyone tops 11.5 yd/s | 0.7% | 93.9% | 0.0% | 60.6% |
| Sharp cuts per play, all 22 players | 0.01 | 11.12 | 0.83 | 8.10 |
| Nearest defender to the QB at the throw (yd) | 2.80 | 5.74 | 4.90 | 4.88 |
| Gap between neighboring linemen (yd) | 1.55 | 2.54 | 2.54 | 2.54 |

### Playback rate

Real time turned out too slow to watch a whole game at, so the game embeds b21a at 1.5x (`speed=1.5` in `SIM_URL`). The sim clock is unchanged, so the timing between players is still the real-time column; on screen everything runs 1.5x fast, which by itself puts every time and speed measure outside 15%. Seconds per play are the 3D portion in the game (play, post-play hold, re-form), averaged over the 1,200 plays.

| Playback | Seconds per play | Measures within 15% on screen |
| --- | --- | --- |
| b19c at 1.5x | 4.6 | 5 of 66 |
| b21a at 1x (real time) | 7.5 | 34 of 66 |
| b21a at 1.25x | 6.1 | 15 of 66 |
| b21a at 1.5x (the game) | 5.2 | 10 of 66 |
| b21a at 1.75x | 4.6 | 5 of 66 |

At 1.5x passes read fine but runs still looked slow: a real back needs 2.5 s to reach the line. Since b21b the game also passes `run=1.33`, which fast-forwards a handoff run by that much more (2x in all) from the snap until the back reaches the line, and until the tackle on a gain of 6 yards or less. Longer runs, the tackle and the post-play hold stay at 1.5x. `run_sim.py` logs each play's `rate` and `rateUntil`, and `compare.py` applies them to the on-screen column. Sim-clock numbers are the same as b21a.

| Handoff runs, on screen | Real | b19c at 1.5x | b21a at 1.5x | b21b (1.5x, run 1.33) |
| --- | --- | --- | --- | --- |
| Handoff from shotgun (s) | 1.10 | 0.41 | 0.70 | 0.53 |
| Back reaches the line (s) | 2.50 | 0.90 | 1.50 | 1.10 |
| Snap to tackle (s) | 4.40 | 1.40 | 2.13 | 1.66 |
| Runner's top speed (yd/s) | 6.20 | 12.09 | 7.77 | 10.12 |
| Seconds per run play in the game | - | 4.2 | 4.9 | 4.4 |

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
