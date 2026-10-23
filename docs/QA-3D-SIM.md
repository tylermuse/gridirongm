# 3D live sim — QA pass (builds b16m, b16n)

**Scope.** Every outcome the sim draws (inside run, chunk run, breakaway, stuffed run, short completion, deep ball, out route, incompletion, interception, sack, screen, QB scramble, rushing TD, passing TD), 6 seeds each = 84 plays, on the in-game Sketchfab player. Regression soaks on the licensed player too.

**Method.** An automated harness (`qa/qa.mjs`) plays each outcome headless, samples every player's skeleton 30×/s, and flags what reads as fake. Flagged plays were rendered from a side camera and checked by eye; fixes were re-measured on the same seeds.

| Check | What it catches |
|---|---|
| Inversion | head ≥ 20 cm below hips while hips are off the turf (somersaults, rolls, flips) |
| Hip peak | hips above 1.62 m (unrealistic leaps) |
| Pile distance | tackler's chest to runner's chest at the whistle |
| Contact | tackler's hands/chest never within 0.6 m of the runner's hips |
| Fall time | contact → runner's hips on the turf |
| Pass-through | runner's hips within 0.35 m of a defender who isn't tackling |
| Turf clip | any hand/foot/head below the turf |

## Findings and fixes

| # | Issue (as seen) | Measured cause | Fix | Before → after |
|---|---|---|---|---|
| 1 | Tackles look like two men falling separately | Tackler and runner played independent clips. The Mixamo tackler dive travels 3.4 m after contact, the runner's fall 1.7 m, so they ended up apart | Tackler's chest is glued to the runner's body every frame (back of the thighs from behind, belly head-on); he lies on top, not through him | pile 1.60–1.81 m on 26 of 57 tackles → **0.50 m mean, 0.72 max** (57 tackles) |
| 2 | Tackler rolls over onto his back, legs up | Mixamo "Running to Tackle" rolls face-up 0.15 s after landing | Capture frozen at the moment he lands face-down (clip 1.45 s) | rolls → none |
| 3 | Runner's legs kick up after landing ("limbs flail") | "Fall Flat" bounces, feet to 1.0 m | Frozen on first contact with the turf, legs settle flat | flail → none |
| 4 | Jump catch with a somersault | Purchased "jump catch and roll": 1.2 m leap (feet 1.9 m off the turf) then a forward roll | Removed. Contested deep balls use the Mixamo high catch (0.5 m leap); he lands on his feet with it and the DB who contested it wraps him from behind | inversions on catches → 0 |
| 5 | Receiver flipped onto his back on contested catches | Mixamo "catch while being tackled" flips him over | Disabled | — |
| 6 | Contested jumps too high | Procedural jump raised the body 0.55 m (hips 1.8 m) | 0.30 m | hips peak 1.8 m → 1.63 m |
| 7 | Runner hovering above the turf after a tackle | Ball-carry arm pose drove the forearm through the turf on a face-down fall; floor clamp lifted the whole body 17 cm | Lighter ball tuck on captured falls; floor lift capped at 6 cm | hips 0.44 m → 0.34 m (lying) |
| 8 | Head-on: runner floats up before falling | "Knocked Out" capture lifts 15 cm first | Entered past the lift | fall in 0.35 s |

Also shipped earlier in this round: real-time pace at low frame rates (slow-motion root cause), punter hands on the ball, holder timing, scramble/screen yardage variety, QB pivot-only capture.

## Runs (b16n)

`qa/runqa.mjs`: 8 run outcomes × 6 seeds = 48 plays. Per play: nearest defender when the back crosses the line, time spent within 0.8 m of a defender who isn't tackling, snap cuts, top speed, OL engagement.

| # | Issue (as seen) | Measured cause | Fix | Before → after |
|---|---|---|---|---|
| 9 | Back runs right past a linebacker standing in the hole, nothing happens | Nobody blocked the play-side backer: he scraped into the hole and the back passed him at arm's length | Center (inside runs) or tight end (outside right) climbs to the second level and blocks him off the lane; he sheds once the back is by and chases from behind | defender within 1 m at the line on 19 of 24 designed gains → **1 of 24** (lanes now 2.5–3.3 m) |
| 10 | 3-yard runs tackled by a backer from across the field | Tackler chosen from the whole back seven | Short gains: the backer nearest the gap makes the stop | — |

Unchanged and fine: OL engaged 80–94% of the first 2 s, top speeds 7.3–8.7 yd/s, no snap cuts. Left: chunk#4 (one seed) still has a defender at 0.9 m; stuffed runs brush the pile for up to 0.3 s (that's the pile).

## Remaining (known)

- Contested leaps at 1.63 m hips (0.5 m vertical) on 5 of 84 plays — left as is; believable for a high-point ball.
- Tackles are still built from one tackler clip (a diving tackle). Upright wrap-and-drive tackles need a capture we don't have.
- Hit-from-the-side tackles use the from-behind pair.

## Re-running

`node qa/qa.mjs [plays] [seeds] [model]` against the render harness on :8768. Prints one line per play, `ok` or the flagged issues; writes `qa/qa-<TAG>.json`.
