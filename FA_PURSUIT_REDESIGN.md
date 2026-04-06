# Free Agency Pursuit System

## Overview

Add a 3-tier pursuit system to free agency that gives users a way to strategically invest resources in specific free agent targets. Unlike draft scouting (which is about discovering talent), FA pursuit is about **understanding the market, building relationships, and gaining a competitive edge in signing players**.

This system adds a new resource ("pursuit points") and three escalating actions. Higher tiers give both information AND mechanical negotiation advantages. The existing negotiation system (`negotiation.ts`), FA evaluation system (`personnelReport.ts`), and AI signing logic stay mostly intact — the pursuit system layers on top of them.

---

## New Concept: Player Priorities

Every free agent gets a hidden **priority** attribute that represents what they value most. This is the core piece of hidden information the pursuit system reveals.

### Priority Types

```typescript
type FAPriority = 'money' | 'winning' | 'role' | 'loyalty';
```

- **Money** — "Wants to get paid." Most common for older players (30+), declining players, or players coming off a big season.
- **Winning** — "Wants a ring." Common for veterans on bad teams, players who've never made playoffs, or elite players entering their prime.
- **Role** — "Wants to start." Common for young players behind established starters, or players who were benched/rotational pieces.
- **Loyalty** — "Wants stability." Common for players who were on the same team for 3+ seasons, or players with high mood.

### Generation Logic

Assign deterministically based on player attributes (use `seedFromId` for stability). The weighting should be:

```
// Rough priority assignment logic:
if (player.age >= 31 || (player.age >= 28 && player.potential < 60))  → 50% money, 20% winning, 20% role, 10% loyalty
if (player.ratings.overall >= 78 && neverMadePlayoffs)                → 15% money, 55% winning, 15% role, 15% loyalty
if (player.age <= 26 && player.ratings.overall < 70)                  → 15% money, 15% winning, 55% role, 15% loyalty
if (player.experience >= 4 && player.mood >= 60)                      → 15% money, 15% winning, 15% role, 55% loyalty
default                                                                → 35% money, 25% winning, 25% role, 15% loyalty
```

Use the deterministic seed to pick one based on these weights. Store it as a field on the Player type: `faPriority?: FAPriority`. Generate it when transitioning to free agency (in `advanceToFreeAgency`), similar to how `draftProfile` is assigned during draft setup.

**Important**: The user should NOT see this attribute directly. It's only revealed through the pursuit system.

### Priority Effects on Negotiation

The priority should subtly affect the existing negotiation system. In `initNegotiation`, apply a modifier based on whether the user's team aligns with the player's priority:

- **Money priority**: No negotiation modifier (they just want the best offer).
- **Winning priority**: If user team had a winning record (>= .550 win%), reduce asking salary by 5%. If losing record (< .400), increase by 8%.
- **Role priority**: If the player would be the starter at his position on the user's roster, reduce asking salary by 5%. If he'd sit behind someone better, increase by 5%.
- **Loyalty priority**: If the player was previously on the user's team, reduce asking salary by 10%. Otherwise, no effect.

These modifiers should be applied BEFORE the pursuit system bonuses (they stack).

---

## The Three Pursuit Tiers

### Pursuit Point Budget

Add a new `pursuitPoints` field to `LeagueState`. Pursuit points are allocated at the start of free agency, based on scouting level:

| Scouting Level | Pursuit Points |
|---|---|
| Entry (0) | 8 |
| Pro (1) | 12 |
| Elite (2) | 16 |

### Tier 1 — Intel Report (1 pursuit point, no hard cap)

Your front office does background research before you engage with the player.

**What it reveals:**

1. **Player's priority** — displayed as a badge: "Wants to Get Paid 💰", "Chasing a Ring 🏆", "Wants a Starting Role 🎯", "Values Stability 🏠"

2. **Approximate asking price** — Show the player's expected asking salary (the value `initNegotiation` would compute) on the FA list card itself, BEFORE the user starts a negotiation. Currently, the user only sees the market salary estimate (`estimateSalary * decay`), but the actual asking price can be different based on mood. The Intel Report reveals the real asking price.

3. **Willingness indicator** — One of:
   - "Eager to talk" — player is not in `faRefusals` and mood >= 60
   - "Open to discussions" — player is not in `faRefusals` and mood 40-59
   - "Reluctant" — player is in `faRefusals` but would acquiesce after day 15
   - "Not interested" — player is in `faRefusals` and won't acquiesce soon

   This saves the user from wasting time clicking "Negotiate" only to get "Player refuses to negotiate."

**Mechanical effect:** None. Pure information.

### Tier 2 — Agent Meeting (3 pursuit points, max 6 per FA period)

You contact the player's agent to express interest and gauge the market.

**Prerequisite:** Must have Intel Report (Tier 1) on this player.

**What it reveals:**

1. **Competing teams** — Show 1-3 AI team abbreviations that are likely to target this player. Generate this deterministically: look at AI teams that have a need at this position AND enough cap space, pick 1-3 of them. Display as: "Also interested: DAL, BUF, KC"

2. **Market heat** — A label based on how many AI teams would want this player:
   - "Cold Market" — 0-1 interested teams (player likely available late in FA)
   - "Moderate Interest" — 2-3 interested teams
   - "Hot Market" — 4+ interested teams
   - "Bidding War" — player is OVR 80+ with 5+ interested teams

3. **Priority fit assessment** — Based on the player's priority and your team's situation, a 1-sentence assessment: e.g. "He values winning — your 12-5 record last season makes you an attractive destination." or "He wants a starting role, but you already have a 82 OVR starter at CB. That could be a tough sell."

**Mechanical effects:**

- **Asking salary reduced by 8%.** In `initNegotiation`, if the player has been Agent-Met, multiply the `adjustedSalary` by 0.92. The agent knows you're serious, and the player is more open.
- **+1 max negotiation round.** Add 1 to `maxRounds` in `initNegotiation`. You've built enough rapport that the player gives you more time.
- **Override mood-based refusals.** If the player is in `faRefusals` due to low mood (mood < 40), the Agent Meeting removes them from `faRefusals` for this user. You've gone through the back channel. (Does NOT override the "bad team" refusal for elite players — that requires Full Courtship.)

### Tier 3 — Full Courtship (5 pursuit points, max 2 per FA period)

You fly the player in. Facility tour, dinner with the coaching staff, scheme presentation.

**Prerequisite:** Must have Agent Meeting (Tier 2) on this player.

**What it reveals:**

1. **Exact closing offer** — The precise salary and years that would guarantee acceptance. Display as: "Will sign for $24.5M/yr, 3 years." This is calculated as: the asking salary (after all pursuit discounts) at satisfaction >= 0.95 threshold. No more guessing or rounds of negotiation needed — the user can see exactly what it takes and decide if it's worth it.

2. **Priority-specific insight** — A richer, more specific version of the priority fit:
   - Money: "He'll take the best offer, period. Your cap space of $45M gives you room to outbid most teams."
   - Winning: "He's watched your playoff run closely. He told our staff he could see himself here for 3-4 years."
   - Role: "He lit up when Coach showed him the starting role we have planned. He's tired of sitting behind guys."
   - Loyalty: "He mentioned wanting to settle down. The stability of a long-term deal matters more to him than an extra $2M."

**Mechanical effects:**

- **Asking salary reduced by an additional 10%** (stacks with Tier 2's 8%, so total ~17% reduction from base). The player feels genuinely wanted.
- **+1 additional max negotiation round** (so +2 total from pursuit, stacking with Tier 2).
- **Exclusive negotiation window.** When `advanceFADay` runs AI signings, players with a Full Courtship from the user are **protected from AI signing for 2 FA days** after the courtship is applied. Implement this as a `protectedUntilDay` field in the courtship data. During `advanceFADay`, skip these players when AI teams are picking targets.
- **Override ALL refusals.** Even elite players who refuse bad teams will negotiate. The personal touch overcomes their reservations.
- **Priority alignment bonus.** If the player's priority aligns with what your team offers (winning priority + winning record, role priority + would start, loyalty priority + was on your team), add an ADDITIONAL 5% salary reduction. Total possible discount for a perfect-fit courtship: ~22%.

---

## Data Model

### New type in `src/types/index.ts`

Add to `LeagueState`:

```typescript
/** Free agent priority — what the player values most */
faPriority?: FAPriority;  // on Player type

/** FA pursuit state */
pursuitState?: {
  pursuitPoints: number;
  maxPursuitPoints: number;
  /** Tier 1 — Intel Reports */
  intelReports: Record<string, {
    priority: FAPriority;
    askingSalary: number;        // pre-computed true asking salary
    askingYears: number;
    willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
  }>;
  /** Tier 2 — Agent Meetings */
  agentMeetings: Record<string, {
    competingTeams: string[];     // team abbreviations
    marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
    fitAssessment: string;        // 1-sentence priority fit
  }>;
  agentMeetingCount: number;      // tracks usage toward cap of 6
  /** Tier 3 — Full Courtships */
  fullCourtships: Record<string, {
    closingOffer: { salary: number; years: number };
    insight: string;              // priority-specific rich insight
    protectedUntilDay: number;    // AI can't sign until this FA day
  }>;
  fullCourtshipCount: number;     // tracks usage toward cap of 2
};
```

Add `faPriority` to the `Player` type as an optional field:

```typescript
faPriority?: 'money' | 'winning' | 'role' | 'loyalty';
```

---

## Store Actions (`src/lib/engine/store.ts`)

### New actions to add:

#### `intelReportFA(playerId: string): boolean`
- Costs 1 pursuit point
- Cannot re-report a player
- Computes priority (already stored on player), asking salary (run the same calc as `initNegotiation` would but just extract the salary/years), willingness (check `faRefusals` and mood)
- Saves to `pursuitState.intelReports[playerId]`

#### `agentMeetingFA(playerId: string): boolean`
- Costs 3 pursuit points
- Requires `intelReports[playerId]`
- Hard cap: 6 (`agentMeetingCount`)
- Computes competing teams (scan AI teams for position need + cap space), market heat, fit assessment string
- If player was in `faRefusals` due to mood (not due to bad team + elite player), remove from `faRefusals`
- Saves to `pursuitState.agentMeetings[playerId]`, increments count

#### `fullCourtshipFA(playerId: string): boolean`
- Costs 5 pursuit points
- Requires `agentMeetings[playerId]`
- Hard cap: 2 (`fullCourtshipCount`)
- Computes closing offer (true asking salary * 0.83 for pursuit discounts, adjusted for priority alignment), insight string
- Remove from `faRefusals` regardless of reason
- Sets `protectedUntilDay: currentFADay + 2`
- Saves to `pursuitState.fullCourtships[playerId]`, increments count

### Modifications to existing code:

#### `initNegotiation` (in `negotiation.ts`)

Add an optional `pursuitTier` parameter:

```typescript
export function initNegotiation(
  player: { ... },
  estimatedSalary: number,
  context: 'resigning' | 'freeAgency' = 'freeAgency',
  pursuitTier?: 0 | 1 | 2 | 3,  // NEW
): NegotiationState {
```

Apply pursuit bonuses:
- Tier 2 (agentMeeting): `adjustedSalary *= 0.92`, `baseRounds += 1`
- Tier 3 (fullCourtship): `adjustedSalary *= 0.83` (0.92 * 0.90), `baseRounds += 2`

Also add priority-based salary modifier (see "Priority Effects on Negotiation" section above). The priority effect applies at ALL tiers (including tier 0 — it's a hidden modifier the user doesn't see). But the pursuit system lets you KNOW about it and exploit it.

For Tier 3, also modify the opening message to reflect the relationship:

```typescript
if (pursuitTier === 3) {
  openingText = pick([
    `I really enjoyed the visit to your facility. Let's make this happen — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    `Your coaching staff made a great impression. I'm ready to get a deal done — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    `I appreciate the personal touch. Let's talk numbers — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
  ]);
}
```

#### `advanceFADay` (in `store.ts`)

When AI teams are selecting targets to sign, add a filter:

```typescript
// Skip players protected by user's Full Courtship
const protectedIds = new Set(
  Object.entries(pursuitState?.fullCourtships ?? {})
    .filter(([_, c]) => nextDay <= c.protectedUntilDay)
    .map(([id]) => id)
);
// In the AI target selection loop, skip players in protectedIds
```

#### `advanceToFreeAgency` (in `store.ts`)

When transitioning to FA:
1. Generate `faPriority` for all free agents (deterministic based on player attributes)
2. Initialize `pursuitState`:

```typescript
pursuitState: {
  pursuitPoints: 8 + (state.scoutingLevel || 0) * 4,  // 8/12/16
  maxPursuitPoints: 16,
  intelReports: {},
  agentMeetings: {},
  agentMeetingCount: 0,
  fullCourtships: {},
  fullCourtshipCount: 0,
},
```

#### `computeFARefusals` — No changes needed

The pursuit system modifies `faRefusals` directly when Agent Meeting or Full Courtship is applied (removes the player from the refusals array).

---

## UI Changes

### Free Agency Page (`src/app/free-agency/page.tsx`)

#### Pursuit Points Header

Add a pursuit points display near the top of the page, alongside the existing cap space / FA day info. Something like:

```
Pursuit Points: 12 | Agent Meetings: 4/6 | Full Courtships: 1/2
```

#### Player List Cards

For each free agent in the list, show pursuit tier status:

- **No pursuit:** Show as current (name, pos, age, OVR, potential, stats, market salary estimate).
- **Intel Report done:** Add a small "📋" badge. Show the priority badge inline: e.g. "💰 Wants to Get Paid". Show true asking salary instead of market estimate. Show willingness indicator with color coding (green for eager, yellow for open, orange for reluctant, red for not interested).
- **Agent Meeting done:** Add "🤝" badge. Show competing teams + market heat tag. Show priority fit assessment as a subtle line below the card.
- **Full Courtship done:** Add "⭐" badge. Show the closing offer prominently: "Will sign for $24.5M/yr, 3yr". Show the insight text.

#### Pursuit Action Buttons

When a player card is expanded (currently shows the `FAEvaluationPanel`), add pursuit action buttons below the evaluation panel:

- Show the **next available tier** button:
  - If no pursuit: **"Intel Report (1 pt)"** — blue button
  - If Intel done: **"Agent Meeting (3 pts)"** — with "(X/6 remaining)" — purple button
  - If Agent Meeting done: **"Full Courtship (5 pts)"** — with "(X/2 remaining)" — gold button
  - If Fully Courted: No button, show "✅ Fully Courted" badge

- Disable buttons when:
  - Not enough pursuit points
  - Hit the tier cap
  - Show clear disabled state with reason: "Not enough pursuit points" or "Agent meeting cap reached (6/6)"

#### Negotiation Integration

When starting a negotiation (`startNegotiation` function), pass the pursuit tier to `initNegotiation`:

```typescript
function startNegotiation(player: typeof agents[0]) {
  // ... existing code ...
  const pursuitTier = pursuitState?.fullCourtships[player.id] ? 3
    : pursuitState?.agentMeetings[player.id] ? 2
    : pursuitState?.intelReports[player.id] ? 1
    : 0;
  const neg = initNegotiation(player, salary, 'freeAgency', pursuitTier);
  // ...
}
```

For Tier 3 (Full Courtship), also add a **"Sign at Closing Offer"** shortcut button that skips negotiation entirely and signs at the pre-computed closing offer. This is the payoff for the big investment — no haggling needed.

#### Pursuit Results Display

When a player card is expanded and has pursuit data, show it in a section ABOVE the existing `FAEvaluationPanel`:

**Intel Report section** (light blue background):
```
📋 INTEL REPORT
Priority: 💰 Wants to Get Paid
True Asking Price: $28.5M/yr, 3 years
Willingness: 🟢 Eager to talk
```

**Agent Meeting section** (light purple background, shown in addition to Intel):
```
🤝 AGENT MEETING
Competing Teams: DAL, BUF, KC
Market Heat: 🔥 Hot Market
"He values winning — your 12-5 record makes you attractive, but Dallas and Buffalo are contenders too."
```

**Full Courtship section** (light gold background, shown in addition to above):
```
⭐ FULL COURTSHIP
Closing Offer: $24.5M/yr, 3 years
Protected from AI signing for 2 days
"He lit up when Coach showed him the starting role we have planned."
[Sign at Closing Offer]  ← prominent button
```

---

## Regular Season Free Agency

During the regular season (`phase === 'regular'`), pursuit points should NOT be available. The pursuit system is specifically for the free agency period. During the regular season, the user signs free agents the same way they do now — browse, negotiate, sign. The pursuit system is an offseason competitive advantage.

If you want, a future enhancement could add a simplified version for in-season signings (e.g. 1 Intel Report per week, no Agent Meeting/Courtship), but for now keep it simple.

---

## Migration

If existing saves don't have `pursuitState` or `faPriority`, that's fine — the state is initialized when entering free agency each season. Old saves will get it next time they hit the FA phase. No migration needed.

---

## Summary of Files to Change

1. **`src/types/index.ts`** — Add `FAPriority` type, `faPriority` to Player, `pursuitState` to LeagueState
2. **`src/lib/engine/store.ts`** — Add 3 new actions (`intelReportFA`, `agentMeetingFA`, `fullCourtshipFA`), modify `advanceToFreeAgency` (init pursuitState + generate priorities), modify `advanceFADay` (AI protection window)
3. **`src/lib/engine/negotiation.ts`** — Add `pursuitTier` param to `initNegotiation`, apply salary/patience bonuses, add courtship opening messages
4. **`src/app/free-agency/page.tsx`** — Add pursuit points header, pursuit badges on player cards, pursuit action buttons, pursuit data display sections, "Sign at Closing Offer" shortcut
5. **`src/lib/engine/personnelReport.ts`** — No changes needed (FA evaluation stays as-is, pursuit info is shown separately)
