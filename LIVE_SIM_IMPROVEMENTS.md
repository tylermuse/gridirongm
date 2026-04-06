# Live Game Simulation — Bug Report & Improvement Instructions

## Context

The app has **two separate game simulation engines** that have diverged significantly:

1. **`src/lib/engine/simulate.ts` → `simulateGame()`** — Used for background/bulk simulation (non-live games). This engine is more mature, with realistic player-weighted play outcomes, red zone logic, scoring fatigue, and proper stat tracking per play.

2. **`src/lib/engine/playByPlay.ts` → `simulatePlayByPlay()`** — Used for the live game viewer (the interactive play-by-play experience). This engine generates `PlayEvent[]` for the UI but has numerous bugs and missing features compared to `simulateGame()`.

The live sim is the one users actually watch and interact with, so it needs to be the *best* engine, not the worst. Right now it produces unrealistic games.

---

## Simulation Test Results (200 games)

These numbers come from running the playByPlay logic through a test harness. NFL averages are listed for comparison.

| Metric | Live Sim Result | NFL Average | Verdict |
|---|---|---|---|
| Avg total score | **22.6** | 43-46 | **~50% too low** |
| Avg team score | **11.3** | 21-23 | **~50% too low** |
| Avg TDs/game | **2.2** | 4.5-5.5 | **Way too few TDs** |
| Completion % | **55.5%** | 64-66% | **Too low** |
| Yards/pass attempt | **4.47** | 6.5-7.5 | **Way too low** |
| Scoring drive % | **20.2%** | 33-38% | **Way too few scoring drives** |
| Sacks/game | **6.9** | 5-6 | Slightly high |
| Ties | **8.5%** | <1% | **Absurdly high** |
| Games under 20 total pts | **46.5%** | ~5-8% | **Nearly half are unwatchable** |
| Plays/game | **143** | 120-130 | Slightly high |

**Bottom line**: Games are boring. Not enough scoring, too many stalled drives, too many ties. The fundamental issue is that the passing game is broken — yards per attempt is nearly half the NFL average.

---

## Bugs (Fix These First)

### Bug 1: OL Blocking Proxy Uses WR1's Blocking Rating

**File**: `src/lib/engine/playByPlay.ts`, line ~844

```typescript
const olBlocking = rating(ok.wr1, 'blocking', 60); // proxy (no dedicated OL in keyPlayers)
```

The sack chance formula uses WR1's blocking rating as a proxy for the offensive line. This is completely wrong — WR blocking ratings are typically very low, making sack rates inflated and disconnected from actual OL quality.

**Fix**: Add OL players to the `KeyPlayers` interface and `extractKeyPlayers()`. Calculate average OL blocking from the actual offensive linemen on the roster, just like `simulate.ts` does:
```typescript
// In KeyPlayers interface, add:
ols: Player[];  // all healthy OL

// In extractKeyPlayers, add:
ols: byPos('OL'),

// In the sack calculation, use:
const olBlocking = ok.ols.length > 0
  ? ok.ols.reduce((s, p) => s + p.ratings.blocking * 1.2 + p.ratings.strength, 0) / ok.ols.length
  : 50;
```

### Bug 2: Flat Interception Rate (Not Responsive to Player Ratings)

**File**: `src/lib/engine/playByPlay.ts`, line ~848

```typescript
const intChance = 0.025; // hardcoded
```

INT rate is 2.5% regardless of QB throwing ability or CB coverage. In `simulate.ts`, this scales from 1.0% to 3.2% based on the coverage-vs-throwing matchup.

**Fix**: Port the formula from `simulate.ts`:
```typescript
const intChance = clamp(
  (cbCoverage - qbThrowing) / 700 + 0.020,
  0.010, 0.032,
);
```
Where `cbCoverage` is the actual coverage rating of the defending CB and `qbThrowing` is the QB's throwing rating. This means elite QBs throw fewer picks and strong secondaries force more.

### Bug 3: Fumble Rate Too High and Not Skill-Based

**File**: `src/lib/engine/playByPlay.ts`, line ~831

```typescript
if (Math.random() < 0.03) { // 3% flat
```

The fumble rate is hardcoded at 3% of all rushes, which is roughly double the NFL average. In `simulate.ts`, this is properly skill-based: `clamp(0.015 - (rusher.ratings.carrying / 100) * 0.008, 0.003, 0.02)`.

**Fix**: Make it skill-based like `simulate.ts`:
```typescript
const fumbleChance = clamp(0.015 - (rbCarrying / 100) * 0.008, 0.003, 0.02);
if (Math.random() < fumbleChance) {
```

### Bug 4: Pass Completions Can Lose Yardage

**File**: `src/lib/engine/playByPlay.ts`, line ~884

```typescript
const rawYards = Math.round(gaussian(8, 7) + (qbThrowing - cbCoverage) / 80 * 3);
const yardsGained = clamp(rawYards, -2, 45);
```

`gaussian(8, 7)` with a standard deviation of 7 means about 15% of completions can generate negative values before the bonus, and the clamp allows -2. Completed passes almost never lose yardage in real football (screens that get tackled behind the line are extremely rare). More critically, the std dev of 7 is too wide — it makes pass yardage feel random.

**Fix**: Raise the floor and tighten the distribution:
```typescript
// More realistic: avg 11-12 yards per completion with tighter spread
const baseYards = 3 + Math.random() * 10; // 3-13 base (matches simulate.ts)
const bonusYards = (qbThrowing / 100) * 2.5 + (wr1Speed / 100) * 1.5;
let yardsGained = Math.round(baseYards + bonusYards * Math.random());

// Big play chance (~3-4% of completions)
if (Math.random() < 0.015 + (wr1Speed / 100) * 0.02) {
  yardsGained += 10 + Math.floor(Math.random() * 15);
}
yardsGained = clamp(yardsGained, 1, 50); // completions never lose yards
```

---

## Major Missing Features (Add These After Fixing Bugs)

### Missing 1: Red Zone & Goal-Line Logic

`simulate.ts` has detailed red zone mechanics that dramatically affect scoring rates:
- Inside 20: +6% completion rate boost
- Inside 10: short-yardage rushing is more effective (+1-4 yard floor)
- Inside 5: 55% chance of rushing TD, 45% chance of rushing TD on goal-line carries
- Goal line: 55% chance pass reaches end zone on completion

The live sim has **none of this**. Drives that reach the red zone often fizzle because there's no increased scoring probability near the goal line.

**Fix**: After computing `yardsGained` for both run and pass plays, add goal-line and red-zone boosts that mirror `simulate.ts`:
```typescript
// Red zone pass boost
if (state.fieldPos >= 80) {
  yardsGained = Math.max(yardsGained, Math.round(3 + Math.random() * 8));
}
if (state.fieldPos >= 95 && Math.random() < 0.55) {
  yardsGained = 100 - state.fieldPos; // score!
}

// Goal line rush boost
if (state.fieldPos >= 95 && Math.random() < 0.45) {
  yardsGained = 100 - state.fieldPos;
}
```

### Missing 2: Full Roster Utilization

The live sim only uses 1 player per position group via the `KeyPlayers` struct (QB, RB, WR1, WR2, TE, DL1, LB1, CB1, K). This means:
- No WR3 targets
- No backup RB touches
- No multiple pass rushers creating pressure
- Only 1 CB covering every receiver
- Defensive stats concentrate on single players unrealistically

**Fix**: Expand `KeyPlayers` or pass the full roster arrays to `runPlay()`. The receiver selection should mirror `simulate.ts`'s weighted target share system:
```
WR1: 28%, WR2: 21%, WR3: 14%, TE1: 18%, RB1: 12%, WR4: 5%, TE2: 6%, RB2: 3%
```
Similarly, sack attribution should spread across DL and LB players, and coverage should use multiple CBs and safeties.

### Missing 3: Scoring Fatigue / Mercy Rule

`simulate.ts` has scoring fatigue to prevent blowouts:
- At 42+ points: 70% chance drive stalls
- At 35+ points: 35% chance drive stalls
- At 28+ points with 21+ point lead: 20% chance drive stalls

The live sim has no such mechanic. While the current issue is *too little* scoring, once you fix the pass game bugs, you'll need this to prevent 60+ point games.

**Fix**: Add a stall check at the start of each drive in the main game loop.

### Missing 4: Stat Tracking Matches Play Events

The live sim tracks stats in aggregate "buckets" then distributes them artificially at the end:
```typescript
// WR1 gets 40%, WR2 gets 30%, TE gets 30% — regardless of actual plays
playerStats[keyPlayers.wr1.id] = {
  targets: Math.round(totalTgts * 0.40),
  receivingYards: Math.round(totalRecYards * 0.40),
  ...
};
```

This means the stats shown in the box score don't match what the user watched happen. If TE scored 3 TDs in the play-by-play, the box score might show WR1 with the most TDs.

**Fix**: `simulate.ts` already has proper per-play stat attribution (the `addPlayStats()` function starting at line ~682). The live sim's `applyBucketToStats()` function should be deleted and replaced with per-play stat tracking. Since the live sim already generates detailed `PlayEvent[]`, each event should directly update the relevant player's stats as it's created. Build player stats from the events themselves rather than from aggregate buckets.

### Missing 5: Completion Percentage Is Too Low

The current formula produces ~55.5% completion rate vs NFL average of 64-66%. The base formula:
```typescript
const compBase = clamp(0.62 + (qbThrowing - 70) / 100 * 0.08 + tierMod, 0.50, 0.75);
```

The coefficient on QB throwing (0.08) is too small. A QB with 90 throwing only gets +1.6% over the 0.62 base, which is barely noticeable.

**Fix**: Increase the QB throwing coefficient and add a receiver catching bonus (like `simulate.ts` does):
```typescript
const compBase = clamp(
  0.52 + (qbThrowing / 100) * 0.18 + (receiverCatching / 100) * 0.10 - (cbCoverage / 100) * 0.12,
  0.42, 0.72
);
```

This makes QB quality, receiver quality, AND coverage quality all matter for completions.

---

## Lower Priority Improvements

### Clock Management
- Incomplete passes should stop the game clock (currently drain 5 seconds; should drain 0 in many situations)
- Add timeout usage (3 per half per team)
- Add hurry-up offense when trailing in Q4 (currently only handled in `advanceClock` with a 0.5x modifier, but there's no increased pass rate or clock-stop awareness)

### Two-Point Conversions
- Neither engine has 2-point conversion attempts. Should be attempted when trailing by 2, 5, or in other strategic situations late in games

### Safeties
- Safety scoring (2 points) is not implemented. If `fieldPos` goes to 0, the play just ends with no consequence

### Defensive/Special Teams TDs
- Pick-sixes, fumble return TDs, punt/kick return TDs are not in the live sim (McAfee mode has kick return TDs but that's it)

### Home Field Advantage
- `simulate.ts`'s `generateBettingLine` adds 3 points of home field advantage, but the actual live simulation has no home field modifier on play outcomes

---

## Recommended Implementation Order

1. **Fix Bug 1** (OL blocking proxy) — biggest impact on sack rate realism
2. **Fix Bug 4** (pass yards) — fixes yards/attempt, the #1 driver of low scoring
3. **Add Missing 1** (red zone logic) — will dramatically increase TD rate
4. **Add Missing 5** (completion % fix) — more completions = more sustained drives = more scoring
5. **Fix Bug 2** (flat INT rate) — makes QB quality matter
6. **Fix Bug 3** (fumble rate) — fewer drives killed by random fumbles
7. **Add Missing 2** (full roster) — better stat realism and roster depth matters
8. **Add Missing 4** (stat tracking) — box score matches what users watched
9. **Add Missing 3** (scoring fatigue) — add AFTER scoring is fixed to prevent overcorrection
10. Lower priority items as desired

## Files to Modify

- `src/lib/engine/playByPlay.ts` — all of the above changes
- `src/types/index.ts` — no changes needed (PlayEvent type is fine)
- `src/components/game/` — no changes needed (UI consumes PlayEvent[] already)

The goal is to make the live sim produce games that look and feel like `simulate.ts` output while maintaining the play-by-play event generation that powers the interactive viewer.
