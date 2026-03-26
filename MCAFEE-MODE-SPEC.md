# McAfee Mode — Implementation Spec

**Feature:** A setting in League Settings called **"McAfee Mode"** that transforms special teams from an afterthought into a game-deciding dimension. Off by default. Named after Pat McAfee, who has spent a decade arguing that punters, kickers, and special teams units are criminally undervalued.

**Current state of special teams in the game:** Punter rating affects nothing (punt distance is a fixed random distribution). Kicker rating only affects FG accuracy. Extra points are a fixed 95% regardless of kicker. Kickoffs always go to the 25. No kick/punt returns, no fake punts, no onside kicks, no return TDs. This mode fixes all of that.

---

## 1. Types & Settings

### `src/types/index.ts`

Add `mcafeeMode` to `LeagueSettings`:

```typescript
export interface LeagueSettings {
  // ... existing fields ...
  bsMode: boolean;
  /** McAfee Mode — special teams matter */
  mcafeeMode: boolean;
}
```

Update `DEFAULT_LEAGUE_SETTINGS`:
```typescript
export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  // ... existing defaults ...
  bsMode: false,
  mcafeeMode: false,
};
```

Add new stats to `PlayerStats`:
```typescript
export interface PlayerStats {
  // ... existing fields ...
  // Kick/Punt Returns (NEW)
  kickReturns: number;
  kickReturnYards: number;
  kickReturnTDs: number;
  puntReturns: number;
  puntReturnYards: number;
  puntReturnTDs: number;
  // Punting additions (NEW)
  puntsInside20: number;    // Punts downed inside opponent's 20
  touchbacks: number;       // Punts into endzone
}
```

Add a `specialTeams` rating concept. In `PlayerRatings`, the existing `kicking` field is used for K and P. For return ability, re-use `speed + agility` from existing skill players (WR, RB, CB). No new rating fields needed — just new logic that reads existing ratings.

---

## 2. Settings UI

### `src/app/settings/page.tsx`

Add a McAfee Mode card next to or below the BS Mode card. Same toggle pattern:

```tsx
{/* McAfee Mode */}
<Card className="mb-4">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      McAfee Mode
      <span className="text-xs font-normal text-[var(--text-sec)] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Special Teams</span>
    </CardTitle>
  </CardHeader>
  <div className="py-2">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="font-semibold text-sm">Enable McAfee Mode</div>
        <div className="text-xs text-[var(--text-sec)] max-w-md">
          Special teams actually matter. Punter ratings affect distance, kicker ratings affect PATs,
          kick/punt returns can break for TDs, fake punts and onside kicks happen, and elite
          special teams units swing games. For the brand.
        </div>
      </div>
      <button
        onClick={() => setDraft(d => ({ ...d, mcafeeMode: !d.mcafeeMode }))}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          draft.mcafeeMode ? 'bg-blue-500' : 'bg-[var(--border)]'
        }`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          draft.mcafeeMode ? 'translate-x-6' : ''
        }`} />
      </button>
    </div>
  </div>
</Card>
```

---

## 3. Feature 1: Punter Rating Actually Matters

### Current problem
In `playByPlay.ts` line ~504, `doPunt()` uses `gaussian(43, 7)` for punt distance — completely ignoring the punter's `kicking` rating. In `simulate.ts` line ~459, it's `35 + random() * 20`. The punter position is cosmetic.

### Fix in `playByPlay.ts` — `doPunt()`

When McAfee Mode is ON, replace the fixed distribution with a punter-influenced one:

```typescript
function doPunt() {
  const ok = offKey();
  const punterRating = mcafeeMode ? rating(ok.p, 'kicking', 60) : 60;

  if (mcafeeMode) {
    // Punter rating affects: mean distance, consistency (std dev), and inside-20 accuracy
    const meanDist = 38 + (punterRating - 50) * 0.2;  // Range: 30-48 yard avg
    const stdDev = 9 - (punterRating - 50) * 0.04;     // Better punters = more consistent (5-9 std dev)
    const puntYards = clamp(Math.round(gaussian(meanDist, stdDev)), 20, 70);

    // Coffin corner / inside-20 logic
    const rawNewPos = 100 - state.fieldPos - puntYards;
    let returnTeamFieldPos: number;

    if (rawNewPos <= 0) {
      // Touchback — punter boomed it too far
      returnTeamFieldPos = 20; // touchback
      addEvent('punt', descPunt(puntYards) + ' — Touchback.', puntYards, false);
    } else if (rawNewPos <= 10) {
      // Near the endzone — elite punters pin it, bad punters touchback
      const pinProb = 0.3 + (punterRating - 50) * 0.008; // 30-70% pin chance
      if (Math.random() < pinProb) {
        returnTeamFieldPos = clamp(rawNewPos, 1, 10); // Pinned inside 10!
        addEvent('punt', descPunt(puntYards) + ` — Downed at the ${returnTeamFieldPos}!`, puntYards, false);
      } else {
        returnTeamFieldPos = 20; // touchback
        addEvent('punt', descPunt(puntYards) + ' — Touchback.', puntYards, false);
      }
    } else if (rawNewPos <= 20) {
      returnTeamFieldPos = rawNewPos; // Inside 20
      addEvent('punt', descPunt(puntYards) + ` — Downed inside the 20.`, puntYards, false);
    } else {
      returnTeamFieldPos = rawNewPos;
      addEvent('punt', descPunt(puntYards), puntYards, false);
    }

    switchPossession(returnTeamFieldPos);
  } else {
    // Original logic (unchanged)
    const puntYards = clamp(Math.round(gaussian(43, 7)), 25, 65);
    const returnTeamFieldPos = clamp(100 - state.fieldPos - puntYards, 5, 50);
    addEvent('punt', descPunt(puntYards), puntYards, false);
    switchPossession(returnTeamFieldPos);
  }
}
```

### Fix in `simulate.ts` — punt distance

Same concept: replace the flat `35 + random() * 20` with punter-influenced distance when McAfee Mode is on. Pass `mcafeeMode` as a parameter to `simulateDrive()`.

---

## 4. Feature 2: Kicker Rating Affects PATs

### Current problem
In `playByPlay.ts` lines 468-477, extra points have a fixed 95% success rate. The kicker's rating is ignored.

### Fix in `playByPlay.ts`

When McAfee Mode is ON:
```typescript
// Replace the fixed 0.95:
const kickerRating = mcafeeMode ? rating(ok.k, 'kicking', 70) : 70;
const epProb = mcafeeMode
  ? clamp(0.88 + (kickerRating - 50) * 0.002, 0.82, 0.995) // Range: 82% (bad) to 99.5% (elite)
  : 0.95; // Original fixed rate
const epGood = Math.random() < epProb;
```

This means a bad kicker (50 rating) hits PATs at ~88%, an average one at ~92%, and an elite one at ~98%. Enough to matter over a season but not game-breaking on any single play.

---

## 5. Feature 3: Kick & Punt Returns

### What it does
When McAfee Mode is on, kickoffs and punts can be returned for yardage instead of always going to a fixed field position. Explosive returners (fast WRs, RBs, or CBs) can break big returns and even score.

### Designating a returner
The return man is auto-selected from the roster: the player with the highest `(speed * 2 + agility) / 3` score among WR, RB, and CB who isn't injured. This avoids needing a new depth chart position.

### Kickoff returns — `playByPlay.ts` `doKickoff()`

Replace the hardcoded `switchPossession(25)`:

```typescript
function doKickoff() {
  if (mcafeeMode) {
    const receivingKey = state.possession === 'home' ? defKey() : offKey(); // defense receives kickoffs
    // Actually: after scoring, we switch possession then kickoff. Need to identify the RECEIVING team.
    // The receiving team's returner:
    const returner = getBestReturner(receivingRoster); // helper function
    const returnerSpeed = returner ? (returner.ratings.speed * 2 + returner.ratings.agility) / 3 : 60;

    // Base return: 15-30 yards from the endzone (so field position 15-30)
    const baseReturn = 15 + Math.floor(Math.random() * 15);

    // Speed bonus: up to 10 extra yards for elite returners
    const speedBonus = Math.max(0, (returnerSpeed - 65) * 0.3);

    // Big play chance: 3% chance of 50+ yard return, 1% chance of TD
    const bigPlayRoll = Math.random();
    let returnYards: number;
    let isTD = false;

    if (bigPlayRoll < 0.01) {
      // Kick return TD!
      returnYards = 100;
      isTD = true;
    } else if (bigPlayRoll < 0.04) {
      // Big return (50-75 yards from endzone)
      returnYards = 50 + Math.floor(Math.random() * 25);
    } else {
      returnYards = Math.round(baseReturn + speedBonus + gaussian(0, 5));
    }

    const fieldPos = clamp(returnYards, 10, 99);

    if (isTD) {
      addEvent('kickoff', `Kickoff return TOUCHDOWN! ${returner?.firstName} ${returner?.lastName} takes it to the house!`, returnYards, true, fieldPos);
      // Add 7 points (assume XP good for simplicity, or run XP logic after)
      if (state.possession === 'home') state.awayScore += 6; // receiving team scores
      else state.homeScore += 6;
      // Then do extra point for receiving team...
      // (This needs careful handling of possession state)
    } else {
      addEvent('kickoff', descKickoffReturn(returnYards, returner), 0, false, fieldPos);
      switchPossession(fieldPos);
    }
  } else {
    // Original logic
    addEvent('kickoff', descKickoff(), 0, false, 25);
    switchPossession(25);
  }
}
```

**Note on kick return TDs:** These are complex because they happen during a possession switch. The implementation needs to handle scoring + extra point + re-kickoff carefully. Consider adding a `kick_return_td` PlayType to handle the animation in GameFieldCanvas.tsx.

### Punt returns — in `doPunt()`

After the punt lands, if McAfee Mode is on and it wasn't a touchback:

```typescript
// After computing returnTeamFieldPos but before switchPossession:
if (mcafeeMode && returnTeamFieldPos > 1 && returnTeamFieldPos < 20) {
  // Fair catch likely when pinned deep — no return
} else if (mcafeeMode) {
  const returner = getBestReturner(receivingRoster);
  const returnerSpeed = returner ? (returner.ratings.speed * 2 + returner.ratings.agility) / 3 : 60;

  // Return yardage: 0-15 base + speed bonus
  const returnYds = clamp(Math.round(5 + Math.random() * 10 + (returnerSpeed - 65) * 0.2 + gaussian(0, 4)), -5, 40);

  // Muffed punt: 1.5% chance
  if (Math.random() < 0.015) {
    addEvent('fumble', `Muffed punt! ${returner?.firstName} ${returner?.lastName} can't handle it! Recovered by the punting team.`, 0, false);
    // Punting team gets ball at the spot
    // DON'T switch possession — keep current team's ball
    state.fieldPos = 100 - returnTeamFieldPos;
    return; // skip switchPossession
  }

  // Punt return TD: 0.8% chance (boosted by speed)
  const tdChance = 0.005 + (returnerSpeed - 65) * 0.0003;
  if (Math.random() < tdChance) {
    // Punt return TD!
    addEvent('punt', `Punt return TOUCHDOWN! ${returner?.firstName} ${returner?.lastName} takes it all the way back!`, 100 - returnTeamFieldPos, true);
    // Handle scoring...
  } else {
    returnTeamFieldPos = clamp(returnTeamFieldPos + returnYds, 1, 99);
  }
}
```

### New PlayTypes to add

Add to the `PlayType` union in `playByPlay.ts`:
```typescript
| 'kick_return_td'
| 'punt_return_td'
| 'muffed_punt'
```

And corresponding description template functions + animation handlers in `GameFieldCanvas.tsx`.

---

## 6. Feature 4: Fake Punts

### What it does
On 4th down, instead of always punting or going for it based on field position, there's a small chance of a fake punt. The chance increases when:
- The team is losing by 10+ points in the 2nd half
- It's 4th and short (1-3 yards)
- The punter has high `awareness` rating

### Where to implement — `playByPlay.ts`

In the 4th down decision logic (where the engine decides punt vs. field goal vs. go-for-it), add a fake punt branch when McAfee Mode is on:

```typescript
// In the 4th down decision section:
if (mcafeeMode && decision === 'punt') {
  const down4Yards = state.yardsToGo;
  const scoreDiff = (state.possession === 'home')
    ? state.homeScore - state.awayScore
    : state.awayScore - state.homeScore;
  const isLosing2ndHalf = scoreDiff < -7 && state.quarter >= 3;
  const punterAwareness = rating(offKey().p, 'awareness', 50);

  // Base fake punt chance: 2%
  let fakePuntChance = 0.02;
  if (down4Yards <= 3) fakePuntChance += 0.03;       // Short yardage
  if (down4Yards <= 1) fakePuntChance += 0.03;       // 4th and inches
  if (isLosing2ndHalf) fakePuntChance += 0.04;        // Desperate
  if (state.fieldPos >= 40 && state.fieldPos <= 55) fakePuntChance += 0.02; // No-man's land
  fakePuntChance += (punterAwareness - 50) * 0.001;   // Punter's awareness helps

  if (Math.random() < fakePuntChance) {
    // FAKE PUNT — punter runs or throws
    const isRun = Math.random() < 0.6; // 60% run, 40% pass
    const yardsNeeded = state.yardsToGo;

    if (isRun) {
      const punterSpeed = rating(offKey().p, 'speed', 45);
      const gained = Math.round(gaussian(3, 3) + (punterSpeed - 45) * 0.1);
      const success = gained >= yardsNeeded;
      addEvent(
        success ? 'rush' : 'rush',
        `FAKE PUNT! The punter keeps it and ${success ? 'picks up the first down!' : 'comes up short!'}`,
        gained, false
      );
      if (success) {
        state.fieldPos = clamp(state.fieldPos + gained, 1, 99);
        state.down = 1;
        state.yardsToGo = 10;
        // Continue drive!
        return; // don't punt
      } else {
        // Turnover on downs at the spot
        switchPossession(100 - clamp(state.fieldPos + gained, 1, 99));
        return;
      }
    } else {
      // Fake punt pass — higher risk, higher reward
      const success = Math.random() < 0.45; // 45% completion rate on trick plays
      if (success) {
        const gained = 10 + Math.floor(Math.random() * 20); // 10-30 yards
        addEvent('pass_complete', `FAKE PUNT PASS! The punter finds a man downfield for ${gained} yards!`, gained, false);
        state.fieldPos = clamp(state.fieldPos + gained, 1, 99);
        state.down = 1;
        state.yardsToGo = 10;
        return; // continue drive
      } else {
        addEvent('pass_incomplete', 'Fake punt pass... INCOMPLETE! Huge gamble doesn\'t pay off!', 0, false);
        switchPossession(100 - state.fieldPos);
        return;
      }
    }
  }
}
```

---

## 7. Feature 5: Onside Kicks

### What it does
Teams can attempt onside kicks. The AI does this when trailing by 1-16 points in the 4th quarter with < 5 minutes left (or any time trailing by 17+ in Q4). Recovery rate is ~10-15%.

### Where to implement — `playByPlay.ts` in `doKickoff()`

```typescript
if (mcafeeMode) {
  // Check if kicking team should attempt onside kick
  const kickingTeamScore = state.possession === 'home' ? state.homeScore : state.awayScore;
  const receivingTeamScore = state.possession === 'home' ? state.awayScore : state.homeScore;
  const deficit = receivingTeamScore - kickingTeamScore; // positive = kicking team is losing
  // (Note: after scoring, the scoring team kicks off. So "kicking team" just scored but may still trail.)

  const isLate4th = state.quarter === 4 && state.eventIndex > totalExpectedEvents * 0.7; // rough proxy
  const shouldOnside = (deficit > 0 && deficit <= 16 && isLate4th) || (deficit >= 17 && state.quarter >= 4);

  if (shouldOnside) {
    const kickerRating = rating(offKey().k, 'kicking', 60);
    const recoveryChance = 0.08 + (kickerRating - 60) * 0.001; // 8-12% base

    if (Math.random() < recoveryChance) {
      // Recovered!
      addEvent('kickoff', 'ONSIDE KICK — RECOVERED! The kicking team comes up with it!', 0, false, 50);
      // Kicking team keeps possession at ~midfield
      state.fieldPos = 45 + Math.floor(Math.random() * 10); // own 45-55
      state.down = 1;
      state.yardsToGo = 10;
      // DON'T switch possession
      return;
    } else {
      addEvent('kickoff', 'Onside kick attempt — receiving team recovers. Great field position.', 0, false);
      switchPossession(45); // Receiving team gets it at kicking team's 45
      return;
    }
  }

  // ... normal kickoff return logic from Feature 3 ...
}
```

---

## 8. Feature 6: "Punt God" Tier & Special Teams Impact Rating

### What it does
Inspired by Pat McAfee's advocacy, the game rates each team's overall special teams unit and shows it prominently. An elite punter gets the **"Punt God"** label (kicking >= 85). An elite kicker gets **"Money"** label (kicking >= 88).

### Team Special Teams Rating

New computed property for each team (not stored — calculated on the fly):

```typescript
// New utility function, can go in a new file src/lib/engine/specialTeams.ts
export function teamSpecialTeamsRating(roster: Player[]): {
  overall: number;  // 0-100
  kicker: { player: Player | null; rating: number; label: string };
  punter: { player: Player | null; rating: number; label: string };
  returner: { player: Player | null; rating: number };
} {
  const kicker = roster.find(p => p.position === 'K' && (!p.injury || p.injury.weeksLeft === 0));
  const punter = roster.find(p => p.position === 'P' && (!p.injury || p.injury.weeksLeft === 0));

  // Best returner: highest (speed*2 + agility)/3 among WR/RB/CB
  const returnerCandidates = roster.filter(p =>
    ['WR', 'RB', 'CB'].includes(p.position) && (!p.injury || p.injury.weeksLeft === 0)
  );
  const returner = returnerCandidates.sort((a, b) => {
    const aScore = (a.ratings.speed * 2 + a.ratings.agility) / 3;
    const bScore = (b.ratings.speed * 2 + b.ratings.agility) / 3;
    return bScore - aScore;
  })[0] ?? null;

  const kRating = kicker?.ratings.kicking ?? 40;
  const pRating = punter?.ratings.kicking ?? 40;
  const retRating = returner ? (returner.ratings.speed * 2 + returner.ratings.agility) / 3 : 40;

  // Kicker labels
  let kLabel = '';
  if (kRating >= 88) kLabel = 'Money';
  else if (kRating >= 78) kLabel = 'Reliable';
  else if (kRating >= 65) kLabel = 'Average';
  else kLabel = 'Liability';

  // Punter labels
  let pLabel = '';
  if (pRating >= 85) pLabel = 'Punt God';
  else if (pRating >= 75) pLabel = 'Weapon';
  else if (pRating >= 62) pLabel = 'Average';
  else pLabel = 'Liability';

  const overall = Math.round((kRating * 0.4 + pRating * 0.35 + retRating * 0.25));

  return {
    overall,
    kicker: { player: kicker ?? null, rating: kRating, label: kLabel },
    punter: { player: punter ?? null, rating: pRating, label: pLabel },
    returner: { player: returner ?? null, rating: retRating },
  };
}
```

### UI — Team Page

On the team roster / overview page, when McAfee Mode is on, show a **"Special Teams Unit"** card:

```
┌─────────────────────────────────────────────┐
│  SPECIAL TEAMS UNIT          Overall: 78/100 │
│─────────────────────────────────────────────│
│  K  Jake Morrison  (87 KCK)     💰 Money     │
│  P  Derek Sullivan (86 KCK)     🏈 Punt God  │
│  KR Tyrell Jackson (94 SPD)     ⚡ Explosive  │
└─────────────────────────────────────────────┘
```

### Punter salary cap adjustment

Currently punters are hard-capped at $2.5M (`playerGen.ts` line 173). When McAfee Mode is on, raise the cap:
```typescript
if (position === 'P') salary = Math.min(salary, mcafeeMode ? 8.0 : 2.5);
if (position === 'K') salary = Math.min(salary, mcafeeMode ? 7.0 : 4.0);
```

This makes elite punters actually expensive and creates real roster-building decisions around the position — do you pay $7M for a Punt God or save that money for a linebacker?

---

## 9. Feature 7: Special Teams Impact on Win Probability

### What it does
In McAfee Mode, the special teams rating feeds into the game simulation as a global modifier. A team with an elite special teams unit (overall 80+) gets a hidden +1.5 to their effective team power. A team with a bad unit (overall < 55) gets -1.5.

### Where to implement — `src/lib/engine/store.ts`

At every `simulateGame` call site, when McAfee Mode is on, compute special teams bonus:

```typescript
if (mcafeeMode) {
  const homeST = teamSpecialTeamsRating(homeRoster);
  const awayST = teamSpecialTeamsRating(awayRoster);
  const homeSTBonus = (homeST.overall - 65) * 0.05; // roughly -1.5 to +1.75
  const awaySTBonus = (awayST.overall - 65) * 0.05;
  homeCoachBonus += homeSTBonus;
  awayCoachBonus += awaySTBonus;
}
```

This piggybacks on the existing coach bonus system so it flows through the entire sim without needing to change `simulateGame`'s internals.

---

## 10. Passing McAfee Mode Through the Engine

The `mcafeeMode` boolean needs to be accessible inside `playByPlay.ts` and `simulate.ts`. Options:

**Option A (recommended):** Pass it as a parameter to `simulatePlayByPlay()` and `simulateGame()`:
```typescript
export function simulatePlayByPlay(
  // ... existing params ...
  mcafeeMode: boolean = false,
): LiveGameResult { ... }
```

Then thread it from store.ts at all call sites.

**Option B:** Read it from a module-level variable set at sim start. Simpler but less clean.

Go with Option A for maintainability.

---

## 11. New Play Type Animations — `GameFieldCanvas.tsx`

Add animation handlers for the new play types in the 2D game viewer:

- **`kick_return_td`**: Ball kicks off from the 35, returner catches at the 5, then sprints the full field. All 11 defenders collapse but miss. Crowd flash overlay (green).
- **`punt_return_td`**: Similar to kick return TD but starts from punt reception point.
- **`muffed_punt`**: Returner drops the ball, nearby players converge on the fumble spot. Turnover flash (red).
- **`fake_punt`**: Punt formation, then the "punter" player sprite runs or throws instead of punting. Other players shift from coverage to blocking.
- **`onside_kick`**: Ball goes short (10-15 yards), players from both teams converge on it.

These animations make special teams plays visually exciting in the game viewer, which is critical for the McAfee pitch — he needs to be able to SEE a Punt God doing his thing.

---

## 12. News & Narrative Integration

When McAfee Mode is on, special teams generates its own news items:

- **"PUNT GOD: [Punter] averaged [X] yards per punt with [Y] inside the 20 this week."**
- **"SPECIAL TEAMS DISASTER: [Team] allowed a kick return TD and muffed a punt in their loss to [Team]."**
- **"The [Team] onside kick was recovered! Incredible call by the coaching staff."**
- **Weekly special teams rankings** (top 5 and bottom 5 units across the league)

Also: during the draft, if McAfee Mode is on, punter and kicker prospects should have more detailed scouting reports that reference leg strength, accuracy, hangtime, etc. Make them feel like real prospects, not afterthoughts.

---

## 13. Implementation Order

1. **Types + Settings toggle** — Add `mcafeeMode` to `LeagueSettings`, new stats fields, settings UI toggle.
2. **Punter rating matters** — Fix `doPunt()` to use punter `kicking` rating. This is the core of the whole feature.
3. **Kicker PAT fix** — Make kicker rating affect extra points.
4. **Special teams rating utility** — New `specialTeams.ts` file with `teamSpecialTeamsRating()`.
5. **Kick/punt returns** — Modify `doKickoff()` and `doPunt()` to include return yardage and TDs.
6. **Fake punts** — Add to 4th down decision tree.
7. **Onside kicks** — Add to `doKickoff()` situational logic.
8. **Special teams power modifier** — Wire ST rating into game sim via coach bonus.
9. **Salary cap adjustments** — Raise K/P salary caps.
10. **GameFieldCanvas animations** — New play type animations for the 2D viewer.
11. **News generation** — Special teams news items and weekly rankings.
12. **Punt God / Money labels** — Team page UI card.

---

## 14. Testing Checklist

- [ ] McAfee Mode toggle appears in Settings and persists
- [ ] Punter rating visibly affects punt distance (sim 10 games with 90-rated vs 50-rated punter)
- [ ] Kicker rating affects PAT success rate
- [ ] Kick returns produce variable field position (not always the 25)
- [ ] Kick return TDs occur at ~1% rate
- [ ] Punt returns produce variable field position
- [ ] Muffed punts occur at ~1.5% rate
- [ ] Fake punts occur on 4th down (rare but observable over a full season)
- [ ] Onside kicks happen in late 4th quarter comeback situations
- [ ] Special teams rating displays on team page
- [ ] "Punt God" / "Money" labels appear for elite P/K
- [ ] Special teams modifier affects game outcomes
- [ ] K/P salary caps raised when mode is on
- [ ] New play types render correctly in GameFieldCanvas
- [ ] All features completely inactive when mode is off
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`

---

## 15. Key Files to Modify (Summary)

| File | Changes |
|------|---------|
| `src/types/index.ts` | `mcafeeMode` in LeagueSettings, return stats in PlayerStats |
| `src/app/settings/page.tsx` | McAfee Mode toggle card |
| `src/lib/engine/specialTeams.ts` | **NEW FILE** — team ST rating, Punt God labels |
| `src/lib/engine/playByPlay.ts` | Punter-influenced `doPunt()`, kickoff returns, punt returns, fake punts, onside kicks, new PlayTypes |
| `src/lib/engine/simulate.ts` | Punter rating in punt distance, pass `mcafeeMode` param |
| `src/lib/engine/store.ts` | ST power modifier at `simulateGame` call sites, thread `mcafeeMode` |
| `src/lib/engine/playerGen.ts` | Raise K/P salary caps when McAfee Mode on |
| `src/components/game/GameFieldCanvas.tsx` | Animations for kick_return_td, punt_return_td, muffed_punt, fake_punt, onside_kick |
| `src/app/team/[id]/page.tsx` (or roster page) | Special Teams Unit card |
| `src/lib/engine/scoutingReport.ts` | Enhanced K/P scouting text |
