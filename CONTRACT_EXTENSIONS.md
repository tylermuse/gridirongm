# Contract Extensions — Implementation Spec

## Overview

Add the ability to proactively extend a player's contract before it expires. Right now, the only way to renegotiate is during the re-signing phase (when `yearsLeft === 1`) or via the holdout system (which is reactive — the player demands it). This feature lets the user initiate an extension at any time, mirroring how real NFL teams lock up their guys early.

**The core scenario:** Your QB just won the Super Bowl on a $2.7M rookie deal with 2 years left. He's outplaying his contract massively and his mood is dropping. You want to reward him with a new deal NOW, not wait until he hits free agency or holds out.

---

## When Extensions Are Available

An "Extend" button should be available on any rostered player on the user's team who meets ALL of these criteria:

- Has **2+ years remaining** on their current contract (if they have 1 year left, they'll hit the re-signing phase naturally)
- Has NOT been restructured or extended in the current season (`lastRestructuredSeason !== season`)
- Is NOT currently holding out (holdouts have their own resolution flow)
- Is NOT on IR

Available during **any phase** — offseason OR regular season. Real teams do extensions mid-season all the time (Mahomes signed his extension in July, Lamar signed his in April).

---

## Extension Pricing — The Premium

This is the key design decision. Extensions should cost MORE than what the player would get in free agency, because:

1. **You're buying certainty.** You're locking him up before he can test the market. That certainty has a price.
2. **The player knows you need him.** If you're coming to him proactively, he has leverage.
3. **You're removing his free agency upside.** He's giving up the chance to see what 32 teams would pay.

But the premium should be LESS if:
- The player is happy (high mood) — he likes being here
- The player's priority is loyalty — he values stability
- The team is winning — the situation is good

### Extension Salary Formula

```typescript
function computeExtensionAskingSalary(
  player: Player,
  userTeam: Team,
  ci: number,  // cap inflation factor
): { salary: number; years: number; premium: number } {
  const marketSalary = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
  const mood = player.mood ?? 70;

  // Base premium: 8-15% above market value
  let premium = 1.10;  // 10% default premium

  // Underpaid players demand more (they KNOW they're underpaid)
  const underpaidRatio = marketSalary / Math.max(player.contract.salary, 0.75);
  if (underpaidRatio >= 2.0) premium += 0.05;     // massively underpaid: +5% more
  else if (underpaidRatio >= 1.5) premium += 0.03; // significantly underpaid: +3% more

  // Mood adjustments
  if (mood >= 80) premium -= 0.05;       // very happy: willing to take less
  else if (mood >= 60) premium -= 0.02;  // happy: slight discount
  else if (mood < 40) premium += 0.05;   // unhappy: wants more to stay
  else if (mood < 25) premium += 0.08;   // very unhappy: big premium or leave

  // Team situation
  const totalGames = userTeam.record.wins + userTeam.record.losses + userTeam.record.ties;
  const winPct = totalGames > 0 ? (userTeam.record.wins + userTeam.record.ties * 0.5) / totalGames : 0.5;
  if (winPct >= 0.65) premium -= 0.03;   // winning team: player wants to stay
  else if (winPct < 0.35) premium += 0.04; // losing team: player wants out

  // Elite players have more leverage
  if (player.ratings.overall >= 85) premium += 0.03;

  // Young players with high potential have more leverage (more FA upside to give up)
  if (player.age <= 26 && player.potential >= 80) premium += 0.03;

  // Clamp premium to 5-20% range
  premium = Math.max(1.05, Math.min(1.20, premium));

  const askingSalary = Math.round(marketSalary * premium * 10) / 10;

  // Years: standard contract length based on age
  const askingYears = player.age >= 32 ? 2
    : player.age >= 29 ? 3
    : player.age >= 26 ? 4
    : 5;  // young stars want long-term security

  return { salary: askingSalary, years: askingYears, premium };
}
```

### The Contract Replaces the Old One

When an extension is signed:
- The old contract is **voided entirely**
- A new contract starts with the negotiated salary and years
- Guaranteed money is computed fresh via `generateGuaranteed()`
- The team's payroll is updated: remove old salary, add new salary
- Dead cap from the old contract does NOT apply (this is a voluntary extension, not a release)
- However, any unamortized bonus from prior restructures DOES carry forward into the new deal (this prevents gaming — restructure to push money out, then extend to wipe the slate)

```typescript
// When extension is signed:
const oldCapHit = getCapHit(player.contract);
const unamortized = getUnamortizedBonus(player.contract);
const newSalary = negotiatedSalary;
const newYears = negotiatedYears;
const newGuaranteed = generateGuaranteed(newSalary, newYears, player.ratings.overall);

const newContract = {
  salary: newSalary,
  yearsLeft: newYears,
  guaranteed: newGuaranteed,
  totalYears: newYears,
  // Carry forward unamortized bonus as dead cap or prorate into new deal
  // Simplest approach: add unamortized to year-1 cap hit
};

// Payroll adjustment
const capDelta = newSalary - oldCapHit;
// Update team.totalPayroll += capDelta
```

---

## Extension Negotiation

Use the existing `initNegotiation` / `processOffer` system from `negotiation.ts`. Add a new context:

```typescript
export function initNegotiation(
  player: { ... },
  estimatedSalary: number,
  context: 'resigning' | 'freeAgency' | 'extension' = 'freeAgency',
  ...
): NegotiationState {
```

### Extension-specific negotiation behavior:

**Opening messages** (new, for `context === 'extension'`):

```typescript
if (context === 'extension') {
  if (mood >= 70) {
    openingText = pick([
      `I love it here and I'd like to stay long-term. But I know what I'm worth — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
      `I appreciate you coming to me early. Let's get this done — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
      `This means a lot. I want to be here. ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)} and I'm locked in.`,
    ]);
  } else if (mood >= 40) {
    openingText = pick([
      `I'm glad you're recognizing my value. I think ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)} is fair for what I bring.`,
      `It's about time. I've been outplaying this contract and we both know it. ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    ]);
  } else {
    openingText = pick([
      `Honestly, I've been frustrated. If you want me to stay, it's going to cost you. ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}, minimum.`,
      `I've been thinking about requesting a trade. But if you're serious about keeping me, let's talk — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    ]);
  }
}
```

**Patience and rounds:** Extensions should generally have good patience (the player isn't going anywhere — he's under contract). But unhappy players have less patience:

```typescript
if (context === 'extension') {
  // More patience than FA negotiations since player is under contract
  basePat = mood >= 60 ? 100 : mood >= 40 ? 80 : 50;
  baseRounds = mood >= 60 ? 4 : mood >= 40 ? 3 : 2;
}
```

**Walkaway behavior:** In an extension, the player doesn't "test free agency" — he just says "I'll play out my current deal." This is a rejection but it's softer:

```typescript
if (context === 'extension') {
  // Replace "test free agency" walkaway with "play out my deal"
  rejectText = pick([
    `You know what, I'll just play out my current contract and see what happens.`,
    `We're too far apart. I'll bet on myself and hit free agency when the time comes.`,
    `I appreciate the effort, but I think I can do better on the open market. Let's revisit this later.`,
  ]);
}
```

---

## Mood Impact

**When extension is offered:** Even opening the negotiation (regardless of outcome) gives a small mood boost:
```typescript
// +3 mood for being approached about an extension (player feels valued)
player.mood = Math.min(100, player.mood + 3);
```

**When extension is signed:**
```typescript
// Significant mood boost — player feels valued and committed
player.mood = Math.min(100, player.mood + 15);
```

**When extension negotiation fails (player rejects):**
```typescript
// Small mood hit — player is disappointed the deal didn't get done
player.mood = Math.max(0, player.mood - 3);
```

---

## Limits

- **Max 3 extensions per season.** Prevents the user from just extending everyone. Tracked as `extensionsUsedThisSeason` on the team or in LeagueState.
- **Cannot extend the same player more than once per 2 seasons.** Use `lastRestructuredSeason` to track this (rename or add `lastExtensionSeason`).
- **Cannot extend a player with 1 year left.** They'll hit the re-signing phase — use that instead.
- **Cannot extend players on other teams.** User team only.

---

## Store Action

### `extendPlayer(playerId: string, salary: number, years: number): boolean`

```typescript
extendPlayer: (playerId: string, salary: number, years: number) => {
  const state = get();
  const player = state.players.find(p => p.id === playerId);
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!player || !userTeam) return false;
  if (player.teamId !== state.userTeamId) return false;
  if (player.contract.yearsLeft < 2) return false;
  if (player.holdout) return false;

  // Check extension limit (3 per season)
  const extensionsUsed = state.extensionsUsedThisSeason ?? 0;
  if (extensionsUsed >= 3) return false;

  // Calculate contract change
  const oldCapHit = getCapHit(player.contract);
  const unamortized = getUnamortizedBonus(player.contract);
  const newGuaranteed = generateGuaranteed(salary, years, player.ratings.overall);

  const newContract = {
    salary,
    yearsLeft: years,
    guaranteed: newGuaranteed,
    totalYears: years,
    // Reset restructure history on extension
    contractYears: undefined,
    restructureHistory: undefined,
    voidYears: 0,
  };

  // Payroll: remove old cap hit, add new salary
  // If there's unamortized bonus from prior restructures, it accelerates as dead cap
  const payrollDelta = salary - oldCapHit;
  const deadCapFromUnamortized = unamortized > 0 ? {
    playerName: `${player.firstName} ${player.lastName}`,
    amount: Math.round(unamortized * 10) / 10,
    yearsLeft: 1,
    source: 'extension' as const,
  } : null;

  const newPayroll = Math.round((userTeam.totalPayroll + payrollDelta + (unamortized || 0)) * 10) / 10;

  set({
    players: state.players.map(p =>
      p.id === playerId
        ? {
            ...p,
            contract: newContract,
            mood: Math.min(100, (p.mood ?? 70) + 15),
            lastRestructuredSeason: state.season,
          }
        : p,
    ),
    teams: state.teams.map(t =>
      t.id === state.userTeamId
        ? {
            ...t,
            totalPayroll: newPayroll,
            deadCap: deadCapFromUnamortized
              ? [...(t.deadCap ?? []), deadCapFromUnamortized]
              : t.deadCap,
          }
        : t,
    ),
    extensionsUsedThisSeason: extensionsUsed + 1,
    holdoutDemands: state.holdoutDemands.map(h =>
      h.playerId === playerId ? { ...h, resolved: true } : h,
    ),
    newsItems: [
      ...state.newsItems,
      makeNews({
        season: state.season,
        week: state.week,
        type: 'signing',
        teamId: state.userTeamId,
        playerIds: [playerId],
        headline: `${player.firstName} ${player.lastName} signs extension with ${userTeam.city} ${userTeam.name}`,
        body: `${player.position} ${player.firstName} ${player.lastName} has agreed to a ${years}-year, $${(salary * years).toFixed(1)}M extension ($${salary}M/yr). The deal replaces his previous contract.`,
        isUserTeam: true,
      }),
    ],
  });

  return true;
},
```

---

## UI — Where Extensions Live

### Player Modal / Roster Page

Add an **"Extend Contract"** button alongside the existing **"Restructure"** button in the player's contract section. The button should:

- Show the player's current deal: "$2.7M/yr, 2 years left"
- Show what an extension might look like: "Market value: ~$32M/yr (+10% extension premium)"
- Be disabled with a reason if the player can't be extended (1 year left, already extended this season, holdout, extension cap reached, etc.)

### Extension Negotiation Flow

When the user clicks "Extend Contract":

1. Compute the extension asking price via `computeExtensionAskingSalary()`
2. Open the same negotiation modal used for re-signing and FA — `initNegotiation(player, askingSalary, 'extension')`
3. User negotiates salary and years as normal
4. On acceptance: call `extendPlayer(playerId, salary, years)`
5. Show confirmation with mood boost indicator: "EXTENDED! +15 mood"

### Visual Indicators

On the roster page, players who are significantly underpaid should show a subtle indicator suggesting an extension might be wise:

- If `marketSalary / currentSalary >= 1.5` AND `mood < 60`: show a small "📋 Extension candidate" tag
- If `marketSalary / currentSalary >= 2.0`: show "⚠️ Significantly underpaid" tag regardless of mood

This helps the user identify who needs an extension before they become unhappy or hold out.

---

## Interaction with Existing Systems

### Holdouts

If a player is holding out and the user initiates an extension (via `resolveHoldout('extend')`), the extension flow should use the same negotiation system but with the holdout premium baked in. The holdout demand salary becomes the asking price (the player already stated what he wants).

### Restructures

Extensions and restructures are different tools:
- **Restructure** = convert salary to bonus, add void years. Same total value, different cap distribution. No negotiation needed.
- **Extension** = brand new contract replacing the old one. Higher total value, longer term. Requires negotiation.

They share the `lastRestructuredSeason` cooldown — you can't restructure AND extend the same player in one season.

### Re-signing Phase

Players with 1 year left are NOT eligible for extensions — they go through the normal re-signing phase. This prevents the user from circumventing the re-signing system. If a player has 2+ years left and you extend them, they won't show up in re-signing until the new deal expires.

### AI Teams

AI teams should also do extensions occasionally. In `startNewSeason` or the offseason transition, have AI teams extend 1-2 of their most underpaid stars:

```typescript
// For each AI team, find most underpaid player with 2+ years left
// If underpaidRatio >= 1.8 and mood < 60, extend at market value + 8%
// This prevents AI stars from always becoming unhappy and holding out
```

---

## State Changes

### New fields in `LeagueState` (`src/types/index.ts`):

```typescript
/** Number of extensions the user has done this season (cap: 3) */
extensionsUsedThisSeason?: number;
```

### Modified `DeadCapEntry` source type:

Add `'extension'` as a valid source alongside `'release'`, `'trade'`, `'void'`.

---

## Summary of Files to Change

1. **`src/types/index.ts`** — Add `extensionsUsedThisSeason` to LeagueState, add `'extension'` to DeadCapEntry source
2. **`src/lib/engine/store.ts`** — Add `extendPlayer` action, add `computeExtensionAskingSalary` helper, modify season reset to clear `extensionsUsedThisSeason`
3. **`src/lib/engine/negotiation.ts`** — Add `'extension'` context with extension-specific opening messages, patience, and walkaway text
4. **`src/app/roster/page.tsx`** (or wherever the player contract UI lives) — Add "Extend Contract" button, extension negotiation flow, underpaid indicators
5. **`src/lib/engine/store.ts`** (AI logic) — Add AI extension behavior in offseason transition
