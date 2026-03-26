# The BS Setting — Implementation Spec

**Feature:** A single toggle in League Settings called **"BS Mode"** (Bill Simmons Mode). Off by default. When enabled, it activates 6 interrelated mechanics that add drama, variance, and strategic depth to the simulation.

---

## 1. Types & Settings Changes

### `src/types/index.ts`

Add `bsMode` to `LeagueSettings`:

```typescript
export interface LeagueSettings {
  // ... existing fields ...
  /** Bill Simmons Mode — enables Entertaining Tournament, Draft Lottery, etc. */
  bsMode: boolean;
}
```

Update `DEFAULT_LEAGUE_SETTINGS`:
```typescript
export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  // ... existing defaults ...
  bsMode: false,
};
```

Add a new `PlayerPersonality` type and add personality fields to `Player`:

```typescript
/** BS Mode personality traits */
export type PersonalityTrait = 'irrational_confidence' | 'steady' | 'pressure_fold' | 'clutch';

// Add to the Player interface:
export interface Player {
  // ... existing fields ...
  /** BS Mode: personality trait affecting performance variance */
  personality?: PersonalityTrait;
}
```

Add a new `QBTier` type:
```typescript
export type QBTier = 'Elite' | 'Franchise' | 'Bridge' | 'Game Manager' | 'Backup' | 'Camp Arm';
```

---

## 2. Settings UI

### `src/app/settings/page.tsx`

Add a new Card section for BS Mode ABOVE the "Current League Status" card at the bottom. Use a toggle/checkbox rather than a slider since it's a boolean.

```tsx
{/* BS Mode */}
<Card className="mb-4">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      BS Mode
      <span className="text-xs font-normal text-[var(--text-sec)] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Experimental</span>
    </CardTitle>
  </CardHeader>
  <div className="py-2">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="font-semibold text-sm">Enable BS Mode</div>
        <div className="text-xs text-[var(--text-sec)] max-w-md">
          Activates the Entertaining as Hell Tournament, Draft Lottery, Top Seed Picks Opponent,
          QB Tier Pyramid, Ewing Theory, and Irrational Confidence Guys. Adds more drama and variance.
        </div>
      </div>
      <button
        onClick={() => setDraft(d => ({ ...d, bsMode: !d.bsMode }))}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          draft.bsMode ? 'bg-amber-500' : 'bg-[var(--border)]'
        }`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          draft.bsMode ? 'translate-x-6' : ''
        }`} />
      </button>
    </div>
  </div>
</Card>
```

The `draft` state, `handleSave`, and `handleReset` already handle the full `LeagueSettings` object, so adding `bsMode` requires no extra wiring — it flows through `updateLeagueSettings(draft)` automatically.

---

## 3. Feature 1: Entertaining As Hell Tournament

### What it does
Instead of 7 playoff seeds per conference with a standard bracket, seeds 5-8 play a **mini single-elimination tournament** (the "Entertaining as Hell Tournament" or EHT) during Wild Card weekend to determine which 2 teams advance to the Divisional round. Seeds 1-4 get byes during the EHT round.

### Where to modify: `src/lib/engine/store.ts`

**`computePlayoffSeeds()`** — Change from 7 seeds to **8 seeds** per conference when BS mode is on:
```typescript
function computePlayoffSeeds(teams: Team[], bsMode: boolean): { AC: string[]; NC: string[] } {
  // ... existing division winner logic stays the same ...

  const wildCards = confTeams
    .filter(t => !divWinnerIds.has(t.id))
    .sort(teamCompareFn)
    .slice(0, bsMode ? 4 : 3);  // 4 wild cards in BS mode, 3 normally

  result[conf] = [...divWinners, ...wildCards].map(t => t.id);
}
```

**`buildBracket()`** — When BS mode is on, generate an EHT round (round 0) plus modified later rounds:

```
BS Mode bracket structure per conference:
  Round 0 (EHT): 5v8, 6v7  (2 games, higher seed hosts)
  Round 1 (Divisional): 1 vs lowest surviving EHT seed, 2 vs other EHT winner, 3 vs 4
  Round 2 (Conference Championship): re-seeded, best seed hosts
  Round 3: Championship game
```

Wait — actually simpler approach that preserves existing bracket structure:

```
BS Mode bracket (per conference):
  Round 1 (EHT / Wild Card): 5v8, 6v7, 3v4  (3 games)
  Round 2 (Divisional): #1 seed vs lowest remaining, #2 seed vs next lowest
  Round 3 (Conference Championship): winners play, higher seed hosts
  Round 4: Championship
```

Key difference from normal: **Seeds 1 AND 2 get first-round byes** (currently only seed 1 does). This rewards top-2 regular season performance.

Modify `buildBracket()`:
- When `bsMode` is true, the Wild Card round matchups become: `3v(seeded by pick, see Feature 3)`, `5v8`, `6v7`
  - Actually wait — if "Top Seed Picks Opponent" is also active, the #1 and #2 seeds pick their divisional opponents from the WC winners. So the WC round is just: 5v8, 6v7, 3v4 (three games).
  - Then in Divisional: #1 picks opponent, #2 gets the other.
- When `bsMode` is false, keep current bracket logic unchanged.

**Important:** Pass `bsMode` from `leagueSettings` to `computePlayoffSeeds()` and `buildBracket()` at all call sites. There are 4 call sites in store.ts where `computePlayoffSeeds` is called (around lines 2161, 2219, 2229). Pass `state.leagueSettings?.bsMode ?? false` to each.

### Playoff seeding news

When BS mode is active and the EHT bracket is set, generate a news item: **"The Entertaining as Hell Tournament bracket is set! [5] vs [8] and [6] vs [7] will battle for the right to face the top seeds."**

---

## 4. Feature 2: Anti-Tanking Draft Lottery

### What it does
Instead of worst-record-picks-first, the bottom 6 non-playoff teams enter a **weighted draft lottery** for the first 6 picks. Teams 7+ pick in standard reverse-record order.

Lottery odds (weighted by inverse record, but NOT guaranteed):
- Worst record: 25% chance at #1
- 2nd worst: 20%
- 3rd worst: 17%
- 4th worst: 15%
- 5th worst: 13%
- 6th worst: 10%

Each slot is drawn without replacement — if the worst team doesn't get #1, they drop to #2 pool (with adjusted weights), etc.

### Where to modify: `src/lib/engine/store.ts`

In `advanceToDraft` action (around line 3130-3250), after computing `sortedTeams` (worst to best), add lottery logic:

```typescript
// Inside advanceToDraft, after sortedTeams is computed:
const bsMode = state.leagueSettings?.bsMode ?? false;

if (bsMode) {
  // Identify non-playoff teams (bottom ~18 teams)
  const playoffTeamIds = new Set(
    state.playoffSeeds ? [...state.playoffSeeds.AC, ...state.playoffSeeds.NC] : []
  );
  const nonPlayoffTeams = sortedTeams.filter(t => !playoffTeamIds.has(t.id));
  const playoffTeams = sortedTeams.filter(t => playoffTeamIds.has(t.id));

  // Lottery for bottom 6 non-playoff teams
  const lotteryPool = nonPlayoffTeams.slice(0, 6);
  const restNonPlayoff = nonPlayoffTeams.slice(6);

  const weights = [25, 20, 17, 15, 13, 10];
  const lotteryResult: typeof lotteryPool = [];
  const remaining = [...lotteryPool];
  const remainingWeights = [...weights];

  for (let pick = 0; pick < lotteryPool.length; pick++) {
    const totalWeight = remainingWeights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    let winner = 0;
    for (let i = 0; i < remainingWeights.length; i++) {
      roll -= remainingWeights[i];
      if (roll <= 0) { winner = i; break; }
    }
    lotteryResult.push(remaining[winner]);
    remaining.splice(winner, 1);
    remainingWeights.splice(winner, 1);
  }

  // Final order: lottery winners + rest of non-playoff (reverse record) + playoff teams (reverse record)
  sortedTeams = [...lotteryResult, ...restNonPlayoff, ...playoffTeams];
}
```

### Lottery Results News

Generate a news item announcing the lottery results:
**"DRAFT LOTTERY RESULTS: [Team] wins the #1 overall pick! Full lottery order: 1. [Team], 2. [Team], ..."**

This should be a high-priority news item generated during `advanceToDraft`.

### Lottery Results UI

On the Draft page (`src/app/draft/page.tsx`), if BS mode is on, show a small "Lottery Results" banner above the draft board showing the lottery order with indicators for which teams moved up/down from their expected position. This is cosmetic but important for the drama factor.

---

## 5. Feature 3: Top Seed Picks Their Opponent

### What it does
After the Wild Card / EHT round, instead of a fixed bracket, the **#1 seed in each conference picks which Wild Card winner they want to play** in the Divisional round. The #2 seed gets the remaining opponent (in BS mode) or in normal mode: the standard re-seeding logic.

### Where to modify: `src/lib/engine/store.ts`

**For AI teams (not user-controlled):** The AI always picks the lowest-seeded surviving team (the "weakest" opponent based on original seed).

**For user's team:** If the user's team is the #1 or #2 seed in BS mode, show a **selection modal** before Divisional round games can be simulated. This requires:

1. A new state field: `bsPickOpponent?: { conference: 'AC' | 'NC'; seed: 1 | 2; options: string[] } | null` in `LeagueState`
2. A new action: `pickPlayoffOpponent(opponentTeamId: string)` that fills in the Divisional bracket slot

**`propagateWinner()`** — After all Wild Card games in a conference are decided, instead of auto-filling Divisional slots, check if BS mode is on:
- If BS mode OFF: use current re-seeding logic (unchanged)
- If BS mode ON:
  - Collect the 3 WC winners (from 3v4, 5v8, 6v7 matchups... actually in EHT mode with 1+2 byes there are 3 WC winners)
  - If the #1 or #2 seed belongs to the user's team, set `bsPickOpponent` state and pause
  - Otherwise, AI picks: #1 seed takes the lowest-original-seed winner, #2 seed takes the next lowest, and the remaining winner plays the other

### UI for opponent selection

**`src/app/playoffs/page.tsx`** (or wherever the playoff bracket is rendered):

When `bsPickOpponent` is set and the user's team is involved, show a modal:
```
┌─────────────────────────────────────────┐
│  PICK YOUR OPPONENT                      │
│                                          │
│  As the #1 seed, you get to choose who   │
│  you face in the Divisional round.       │
│                                          │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ [Team Logo]  │  │ [Team Logo]  │     │
│  │ Team A (5)   │  │ Team B (7)   │     │
│  │ 10-7 record  │  │ 9-8 record   │     │
│  │ [SELECT]     │  │ [SELECT]     │     │
│  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────┘
```

---

## 6. Feature 4: QB Tier Pyramid

### What it does
At the start of each season (during the preseason phase), all starting QBs are evaluated and assigned a **tier label** that persists for the season. The tier affects:
- **Trade value**: higher-tier QBs have inflated trade value
- **Free agency demand**: tier affects asking price multiplier
- **News/media flavor**: news items reference QB tiers
- **Game simulation**: small performance modifier based on tier

### Tier definitions (based on starter's overall rating + age + recent stats):

| Tier | Criteria | Game Modifier | Trade Value Mult |
|------|----------|--------------|-----------------|
| Elite | OVR >= 88 AND age <= 33 | +2 to teamPower offense | 1.5x |
| Franchise | OVR >= 80 AND age <= 35 | +1 to teamPower offense | 1.25x |
| Bridge | OVR >= 72 OR (age >= 33 AND OVR >= 68) | 0 | 1.0x |
| Game Manager | OVR >= 62 | 0 | 0.85x |
| Backup | OVR >= 50 | -1 to teamPower offense | 0.7x |
| Camp Arm | OVR < 50 | -2 to teamPower offense | 0.5x |

### Where to implement

**New file: `src/lib/engine/qbTierPyramid.ts`**

```typescript
import type { Player, Team, QBTier } from '@/types';

export function computeQBTier(qb: Player): QBTier {
  const ovr = qb.ratings.overall;
  const age = qb.age;
  if (ovr >= 88 && age <= 33) return 'Elite';
  if (ovr >= 80 && age <= 35) return 'Franchise';
  if (ovr >= 72 || (age >= 33 && ovr >= 68)) return 'Bridge';
  if (ovr >= 62) return 'Game Manager';
  if (ovr >= 50) return 'Backup';
  return 'Camp Arm';
}

export function getQBTierModifier(tier: QBTier): number {
  switch (tier) {
    case 'Elite': return 2;
    case 'Franchise': return 1;
    case 'Bridge': return 0;
    case 'Game Manager': return 0;
    case 'Backup': return -1;
    case 'Camp Arm': return -2;
  }
}

/** Compute all teams' starting QB tiers. Returns map of teamId -> { qb, tier } */
export function computeLeagueQBTiers(
  teams: Team[],
  players: Player[]
): Map<string, { playerId: string; tier: QBTier }> {
  const result = new Map();
  for (const team of teams) {
    const qbIds = team.depthChart.QB;
    const starter = qbIds.length > 0 ? players.find(p => p.id === qbIds[0]) : null;
    if (starter) {
      result.set(team.id, { playerId: starter.id, tier: computeQBTier(starter) });
    }
  }
  return result;
}
```

### Store integration

**`src/lib/engine/store.ts`** — Add to `LeagueState`:
```typescript
/** BS Mode: QB tier assignments for the current season */
qbTiers?: Record<string, { playerId: string; tier: QBTier }>;
```

Compute tiers at the start of each season. In the `startNewSeason` or the beginning of the preseason/regular phase setup (wherever rosters are finalized), if `bsMode` is on:

```typescript
if (bsMode) {
  const tierMap = computeLeagueQBTiers(teams, players);
  set({ qbTiers: Object.fromEntries(tierMap) });

  // Generate QB Pyramid news item
  const elites = [...tierMap.entries()].filter(([, v]) => v.tier === 'Elite');
  const eliteNames = elites.map(([teamId, v]) => {
    const qb = players.find(p => p.id === v.playerId);
    return qb ? `${qb.firstName} ${qb.lastName}` : 'Unknown';
  });
  // Push news: "QB TIER PYRAMID: [names] headline the Elite tier this season..."
}
```

**`src/lib/engine/simulate.ts`** — In `simulateGame()`, accept an optional `qbTierModifier` param:
```typescript
export function simulateGame(
  game: GameResult,
  homeRoster: Player[],
  awayRoster: Player[],
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
  rivalryIntensity: number = 0,
  homeQBTierMod: number = 0,  // NEW
  awayQBTierMod: number = 0,  // NEW
): GameResult {
```

Apply the modifier wherever `teamPower` is used to compute drive outcomes. The simplest approach: add the modifier to the offense power calculation at the top of each drive loop.

All call sites for `simulateGame` in `store.ts` (lines ~1744, ~2264, ~2402, ~2510, ~4899) need to pass the QB tier modifier when bsMode is on. Look up the team's tier from `state.qbTiers` and call `getQBTierModifier()`.

### QB Pyramid UI

On the **League page** or a new sub-tab, show the QB Tier Pyramid as a visual:
```
        ┌─────────┐
        │  ELITE  │  Darius Webb, Marcus Cole
        ├─────────┤
      │ FRANCHISE │  Jake Lee, Tom Rivers, ...
      ├───────────┤
    │    BRIDGE    │  ...
    ├──────────────┤
  │  GAME MANAGER  │  ...
  ├────────────────┤
│     BACKUP / CAMP ARM     │
└───────────────────────────┘
```

This can be a simple component rendered on the Standings page or League Overview page when BS mode is on.

---

## 7. Feature 5: Ewing Theory

### What it does
When a team's best player (highest OVR on roster) gets injured for 3+ weeks, there is a **15% chance** the team enters "Ewing Theory" mode. While active:
- Team gets a **+3 boost to teamPower** (both offense and defense)
- Role players on that team get a **temporary +3 to their overall rating** for the duration
- A news item fires: **"EWING THEORY ALERT: [Team] is somehow playing BETTER without [Star Player]. Role players are stepping up in a big way."**
- The effect lasts until the star player returns from injury

### Where to implement

**`src/types/index.ts`** — Add to `Team`:
```typescript
export interface Team {
  // ... existing fields ...
  /** BS Mode: Ewing Theory active — team plays better without injured star */
  ewingTheory?: {
    injuredPlayerId: string;
    teamPowerBoost: number;  // typically +3
  };
}
```

**`src/lib/engine/store.ts`** — In the `simWeek` action, after injuries are processed but before games are simulated, check for Ewing Theory triggers:

```typescript
if (bsMode) {
  for (const team of teams) {
    // Skip if already has Ewing Theory active
    if (team.ewingTheory) continue;

    const teamRoster = players.filter(p => team.roster.includes(p.id));
    const bestPlayer = teamRoster.reduce((best, p) =>
      p.ratings.overall > (best?.ratings.overall ?? 0) ? p : best, null as Player | null);

    if (bestPlayer?.injury && bestPlayer.injury.weeksLeft >= 3) {
      // 15% chance of Ewing Theory triggering
      if (Math.random() < 0.15) {
        team.ewingTheory = {
          injuredPlayerId: bestPlayer.id,
          teamPowerBoost: 3,
        };
        // Generate news item
        news.push(makeNews({
          headline: `Ewing Theory Alert: ${team.city} ${team.name}`,
          body: `${team.city} is somehow playing BETTER without star ${bestPlayer.position} ${bestPlayer.firstName} ${bestPlayer.lastName}. Role players are stepping up in a big way.`,
          // ...
        }));
      }
    }

    // Clear Ewing Theory if star returns
    if (team.ewingTheory) {
      const star = players.find(p => p.id === team.ewingTheory!.injuredPlayerId);
      if (star && (!star.injury || star.injury.weeksLeft === 0)) {
        team.ewingTheory = undefined;
        // News: "Ewing Theory over — [Player] returns..."
      }
    }
  }
}
```

**`src/lib/engine/simulate.ts`** — When calculating team power for a game, check if the team has `ewingTheory` active and add the boost:

```typescript
// In simWeek, when calling simulateGame:
const homeEwingBoost = homeTeam.ewingTheory ? homeTeam.ewingTheory.teamPowerBoost : 0;
const awayEwingBoost = awayTeam.ewingTheory ? awayTeam.ewingTheory.teamPowerBoost : 0;
// Add to coachBonus or create a separate param
```

### Ewing Theory UI indicator

On the **Team page / Roster page**, show a small badge next to the team name when Ewing Theory is active:
```
Chicago Bears 🔥 Ewing Theory Active
"Playing better without [Star Player] (IR, 4 weeks)"
```

---

## 8. Feature 6: Irrational Confidence Guys

### What it does
~8% of all players are randomly assigned the `irrational_confidence` personality trait at player generation time. These players:
- Have a **wider performance variance** in game simulation (+/- 8 OVR per game instead of the normal +/- 3)
- **20% chance per game of a "hero game"** where they play at OVR + 12 (temporary, single-game)
- **10% chance per game of a "disaster game"** where they play at OVR - 10
- Generate entertaining news when hero/disaster games happen
- Are labeled "Irrational Confidence Guy" in scouting reports

### Where to implement

**`src/lib/engine/playerGen.ts`** — When generating new players, assign personality:
```typescript
// After creating the player object:
if (bsMode) {
  const roll = Math.random();
  if (roll < 0.08) {
    player.personality = 'irrational_confidence';
  } else if (roll < 0.20) {
    player.personality = 'clutch';  // for future use
  } else if (roll < 0.30) {
    player.personality = 'pressure_fold';  // for future use
  } else {
    player.personality = 'steady';
  }
}
```

For existing players when BS mode is first enabled, assign personalities retroactively in `updateLeagueSettings` when `bsMode` flips from false to true. Use a seeded random based on `player.id` so it's deterministic:

```typescript
// In updateLeagueSettings action:
if (newSettings.bsMode && !oldSettings.bsMode) {
  // Assign personalities to all existing players
  const updatedPlayers = state.players.map(p => {
    if (p.personality) return p; // already has one
    const hash = simpleHash(p.id); // deterministic
    const roll = (hash % 100) / 100;
    let personality: PersonalityTrait = 'steady';
    if (roll < 0.08) personality = 'irrational_confidence';
    else if (roll < 0.20) personality = 'clutch';
    else if (roll < 0.30) personality = 'pressure_fold';
    return { ...p, personality };
  });
  set({ players: updatedPlayers });
}
```

**`src/lib/engine/simulate.ts`** — Before using a player's ratings in `simulatePlay()` or the drive simulation, apply the IC modifier:

```typescript
function applyICModifier(player: Player): number {
  if (player.personality !== 'irrational_confidence') return player.ratings.overall;

  const roll = Math.random();
  if (roll < 0.20) return Math.min(99, player.ratings.overall + 12); // hero game
  if (roll < 0.30) return Math.max(30, player.ratings.overall - 10); // disaster game
  // Normal but with wider variance
  const variance = (Math.random() - 0.5) * 16; // +/- 8
  return Math.max(30, Math.min(99, player.ratings.overall + variance));
}
```

Since the game sim uses `teamPower()` which aggregates all players, the IC modifier should be applied **per-game** at the roster level before passing rosters to `simulateGame`. Create modified roster copies:

```typescript
// In simWeek, before calling simulateGame:
if (bsMode) {
  homeRoster = homeRoster.map(p => {
    if (p.personality !== 'irrational_confidence') return p;
    const modifiedOvr = applyICModifier(p);
    return { ...p, ratings: { ...p.ratings, overall: modifiedOvr } };
  });
  // Same for awayRoster
}
```

### IC News items

After each week's games, scan for IC players who had hero or disaster games (track this during sim) and generate news:

- **Hero game:** "[Player] went NUCLEAR! The ultimate Irrational Confidence Guy put up a monster performance in [Team]'s [W/L]."
- **Disaster game:** "[Player]'s Irrational Confidence backfired spectacularly. [Team] couldn't overcome his [X]-rated performance."

### IC Scouting Report label

In `src/lib/engine/scoutingReport.ts` and `src/lib/engine/draftScoutEval.ts`, when generating scouting text for a player with `personality === 'irrational_confidence'`, append: **"Evaluators note: This player has irrational confidence — expect wild swings in performance. On his best day, he looks like a Pro Bowler. On his worst, you wonder if he belongs in the league."**

---

## 9. Implementation Order

Build these in this order to minimize merge conflicts and allow incremental testing:

1. **Types + Settings toggle** — Add `bsMode` to `LeagueSettings`, `PersonalityTrait` to types, toggle UI in settings page. This is the foundation everything else depends on.

2. **QB Tier Pyramid** — Self-contained new file + minor store integration. Easiest to test. Add the `qbTiers` state, compute at season start, pipe modifier to `simulateGame`.

3. **Irrational Confidence Guys** — Add `personality` to `Player`, generation logic, game sim modifier, news generation. Test by enabling BS mode and simming a few weeks.

4. **Ewing Theory** — Add `ewingTheory` to `Team`, injury-check logic in `simWeek`, power boost in sim. Depends on existing injury system.

5. **Anti-Tanking Draft Lottery** — Modify `advanceToDraft` draft order computation. Self-contained within the draft flow. Add lottery results news + UI banner.

6. **Entertaining As Hell Tournament + Top Seed Picks Opponent** — These are coupled. Modify `computePlayoffSeeds` (8 seeds), `buildBracket` (EHT round), `propagateWinner` (opponent selection logic), and add opponent-pick UI modal. This is the most complex change — do it last.

---

## 10. Testing Checklist

After implementation, verify:

- [ ] BS Mode toggle appears in Settings and persists across page navigations
- [ ] Turning BS Mode on assigns personalities to all existing players
- [ ] QB Tier Pyramid computes correctly at season start and generates news
- [ ] QB tier modifier affects game simulation outcomes
- [ ] IC players show wider variance over 10+ simulated weeks
- [ ] IC hero/disaster games generate news items
- [ ] Ewing Theory triggers when a star is injured (may need to manually injure a player to test)
- [ ] Ewing Theory clears when the star returns
- [ ] Draft lottery produces different order than standard reverse-record
- [ ] Draft lottery news item appears
- [ ] Playoff bracket has 8 seeds per conference when BS mode is on
- [ ] Seeds 1+2 have byes in BS mode
- [ ] Top seed opponent selection modal appears for user's team (if #1 or #2 seed)
- [ ] AI teams auto-pick opponents correctly
- [ ] All features are completely inactive when BS mode is off (no regressions)
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`

---

## 11. Key Files to Modify (Summary)

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `bsMode` to LeagueSettings, `PersonalityTrait`, `QBTier`, `personality?` to Player, `ewingTheory?` to Team, `bsPickOpponent?` + `qbTiers?` to LeagueState |
| `src/app/settings/page.tsx` | Add BS Mode toggle card |
| `src/lib/engine/qbTierPyramid.ts` | **NEW FILE** — QB tier computation + modifiers |
| `src/lib/engine/playerGen.ts` | Assign personality trait on player creation |
| `src/lib/engine/simulate.ts` | Accept QB tier + Ewing Theory modifiers, apply IC variance |
| `src/lib/engine/store.ts` | QB tier computation at season start, Ewing Theory check in simWeek, draft lottery in advanceToDraft, EHT bracket in buildBracket/computePlayoffSeeds/propagateWinner, opponent pick action + state |
| `src/lib/engine/scoutingReport.ts` | IC personality label in scouting text |
| `src/lib/engine/draftScoutEval.ts` | IC personality label in draft eval |
| `src/app/draft/page.tsx` | Lottery results banner UI |
| `src/app/playoffs/page.tsx` | Opponent selection modal, EHT bracket display |
| `src/app/standings/page.tsx` (or league page) | QB Tier Pyramid visualization |
| `src/components/game/` (team pages) | Ewing Theory badge |
