# Free Agency Pursuit System — Full Implementation Spec

## Overview

Add an **Intel Report** action to free agency. One button, one cost, one unlock — just like scouting a draft prospect. When you spend a pursuit point on a free agent, you get a rich, detailed **Pursuit Report** covering everything: what the player really wants, his true asking price, who else is after him, how his agent negotiates, whether there's a realistic path to a deal, and the exact offer that would close it.

The unlock also gives you a **mechanical negotiation advantage** — lower asking price, more patience, and override on refusals.

---

## Player Priorities (Hidden Attribute)

Every free agent gets a hidden `faPriority` attribute generated when free agency begins.

### Type Definition

Add to `src/types/index.ts` on the `Player` interface:

```typescript
faPriority?: 'money' | 'winning' | 'role' | 'loyalty';
```

### Generation Logic

Generate deterministically in `advanceToFreeAgency()` in `store.ts` using `seedFromId`. Assign based on player profile:

```
age >= 31 OR (age >= 28 AND potential < 60):   50% money, 20% winning, 20% role, 10% loyalty
OVR >= 78 AND team missed playoffs:             15% money, 55% winning, 15% role, 15% loyalty
age <= 26 AND OVR < 70:                         15% money, 15% winning, 55% role, 15% loyalty
experience >= 4 AND mood >= 60:                 15% money, 15% winning, 15% role, 55% loyalty
default:                                        35% money, 25% winning, 25% role, 15% loyalty
```

Use the deterministic seed to pick one based on these weights. The user should NOT see this attribute directly — it's only revealed through the Intel Report.

### Priority Effects on Negotiation (Hidden — applies even without Intel Report)

Priorities subtly affect negotiation in `initNegotiation`, whether or not the user has unlocked the Intel Report:

```typescript
if (player.faPriority === 'winning' && userTeamWinPct >= 0.55) adjustedSalary *= 0.95;
else if (player.faPriority === 'winning' && userTeamWinPct < 0.40) adjustedSalary *= 1.08;
if (player.faPriority === 'role' && wouldBeStarter) adjustedSalary *= 0.95;
else if (player.faPriority === 'role' && !wouldBeStarter) adjustedSalary *= 1.05;
if (player.faPriority === 'loyalty' && wasOnUserTeam) adjustedSalary *= 0.90;
// money: no modifier — they just want the best offer
```

The Intel Report lets you SEE and EXPLOIT these hidden dynamics. Without it, they still happen — you just don't know why a player is asking for more or less than expected.

---

## Pursuit State

### Type Definition

Add to `LeagueState` in `src/types/index.ts`:

```typescript
pursuitState?: {
  pursuitPoints: number;
  maxPursuitPoints: number;
  /** Intel Reports — keyed by player ID */
  intelReports: Record<string, IntelReportData>;
};
```

### Intel Report Data

```typescript
interface IntelReportData {
  // ── What the player really wants ──
  priority: 'money' | 'winning' | 'role' | 'loyalty';
  priorityLabel: string;          // "Wants to Get Paid", "Chasing a Ring", etc.
  priorityDetail: string;         // 1-2 sentence explanation

  // ── True asking price + closing offer ──
  trueAskingSalary: number;       // what initNegotiation would compute
  trueAskingYears: number;
  closingOffer: { salary: number; years: number };  // exact offer that guarantees acceptance
  closingOfferDetail: string;     // "His camp would accept $24.5M/yr for 3 years."

  // ── Willingness to negotiate ──
  willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
  willingnessReason: string;      // "Impressed by your 12-5 record" etc.

  // ── Market intel ──
  competingTeams: string[];       // 1-3 team abbreviations
  marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
  marketHeatDetail: string;       // "Only one team has shown serious interest. You have leverage."

  // ── Agent style ──
  agentStyle: 'hardball' | 'collaborative' | 'impatient' | 'relationship';
  agentStyleDetail: string;       // "His agent is a maximizer — expect firm counters."
  agentTip: string;               // "Tip: Start at ~95% of asking."

  // ── Priority fit with your team ──
  priorityAligned: boolean;
  fitAssessment: string;          // "He values winning — your 12-5 record makes you attractive."

  // ── Path to a deal ──
  dealPath: 'strong' | 'possible' | 'uphill' | 'unlikely';
  dealPathDetail: string;         // "Real mutual interest here. If the money is close, this gets done."

  // ── Concerns (0-2) ──
  concerns: string[];             // "Whispers about a nagging shoulder issue"

  // ── Front office blurb ──
  intelBlurb: string;             // 1-2 sentence FO take

  // ── Negotiation bonuses (mechanical) ──
  salaryDiscount: number;         // multiplier, e.g. 0.88 (12% discount)
  patienceBonus: number;          // extra rounds, e.g. +1
  overridesRefusal: boolean;      // true = removes from faRefusals
}
```

---

## Pursuit Point Budget

Initialize in `advanceToFreeAgency()`:

```typescript
pursuitState: {
  pursuitPoints: 5 + (state.scoutingLevel || 0) * 3,  // Entry: 5, Pro: 8, Elite: 11
  maxPursuitPoints: 11,
  intelReports: {},
},
```

Each Intel Report costs **1 pursuit point**. So at Entry level you can scout 5 free agents, at Elite you can scout 11. This forces prioritization — you can't report on everyone.

---

## Store Action (`src/lib/engine/store.ts`)

### `intelReportFA(playerId: string): boolean`

**Cost:** 1 pursuit point. One report per player.

This single action generates ALL the Intel Report data. Here's the generation logic for each field:

#### Priority label and detail

```typescript
const PRIORITY_LABELS: Record<FAPriority, string> = {
  money: 'Wants to Get Paid',
  winning: 'Chasing a Ring',
  role: 'Wants a Starting Role',
  loyalty: 'Values Stability',
};

const PRIORITY_DETAILS: Record<FAPriority, string[]> = {
  money: [
    'His camp has been clear — this is about getting market value. He feels he\'s earned a big payday and won\'t leave money on the table.',
    'Financial security is the top priority. His agent is pricing him at the top of the market and expects teams to compete on dollars.',
    'Coming off a strong season, he believes this is his window to maximize earnings. Don\'t expect a hometown discount.',
  ],
  winning: [
    'He\'s tired of losing. Our sources say he\'d take less money to play for a legitimate contender with a clear path to the playoffs.',
    'Multiple people in his circle say he\'s obsessed with getting a ring. Legacy matters more than money at this point.',
    'He watched the playoffs from home again and it ate at him. A winning culture matters more than an extra few million.',
  ],
  role: [
    'He\'s been a backup and he\'s done with it. He wants a guaranteed starting job and a coaching staff that believes in him.',
    'His biggest frustration is playing time. He believes he\'s a starter in this league and wants a team that gives him the keys.',
    'He turned down more money last time to chase a starting role. Playing time is non-negotiable for him.',
  ],
  loyalty: [
    'He\'s not looking to bounce around. Stability, a good locker room, and a coaching staff he trusts matter more than the highest bidder.',
    'Family is settled, kids are in school. He\'d prefer to find a long-term home rather than chase a short-term deal.',
    'He was genuinely hurt by getting released. He wants to find a team that values him and commit long-term.',
  ],
};
```

#### Willingness

```typescript
const isRefused = faRefusals.includes(playerId);
const mood = player.mood ?? 70;

if (isRefused && player.ratings.overall >= 85 && isBadTeam) {
  willingness = 'not_interested';
  willingnessReason = 'A player of his caliber isn\'t considering a rebuilding team. You\'d need a massive overpay to change his mind.';
} else if (isRefused) {
  willingness = 'reluctant';
  willingnessReason = mood < 40
    ? 'Still bitter about how things ended. Not eager to engage, but a strong offer could change that.'
    : 'Only entertaining contenders right now. You\'re not on his short list.';
} else if (mood >= 60 && winPct >= 0.55) {
  willingness = 'eager';
  willingnessReason = 'He likes what your team is building. His camp has been responsive and engaged.';
} else if (mood >= 60) {
  willingness = 'eager';
  willingnessReason = 'Open to all opportunities. Your pitch could move the needle.';
} else {
  willingness = 'open';
  willingnessReason = 'He\'ll listen but won\'t make it easy. Come prepared with a strong pitch.';
}
```

#### True asking price

Compute the same way `initNegotiation` does:
```typescript
const askingYears = player.age >= 32 ? 1 : player.age >= 28 ? 2 : 3;
const moodSalaryMult = mood < 30 ? 1.15 : mood < 50 ? 1.08 : mood < 60 ? 1.03 : mood >= 85 ? 0.95 : 1.0;
const baseSal = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci) * decay;
const trueAskingSalary = Math.round(baseSal * moodSalaryMult * 10) / 10;
```

#### Closing offer (the big reveal)

The exact salary and years that would guarantee acceptance. Calculated as the true asking price with the Intel Report discount + priority alignment bonus:

```typescript
const intelDiscount = 0.88;  // 12% discount from rapport
const priorityBonus = priorityAligned ? 0.95 : 1.0;  // extra 5% if team fits priority
const closingSalary = Math.round(trueAskingSalary * intelDiscount * priorityBonus * 10) / 10;
const closingYears = askingYears;
```

Closing offer detail (pick deterministically):
```typescript
[
  `Our read: $${closingSalary}M/yr for ${closingYears} years gets this done. His agent would take it.`,
  `After talking to people around him, the magic number is $${closingSalary}M/yr, ${closingYears} years. Hit that and he signs.`,
  `The intel says $${closingSalary}M/yr for ${closingYears} years closes it. Below that, you're gambling.`,
]
```

#### Competing teams

Scan AI teams — find those with a roster need at this position AND enough cap space. Pick 1-3 deterministically:

```typescript
const competingTeams = aiTeams
  .filter(t => hasNeedAtPosition(t, player.position) && canAfford(t, marketSalary))
  .sort((a, b) => needScore(b, player.position) - needScore(a, player.position))
  .slice(0, 1 + (seed % 3))  // 1-3 teams
  .map(t => t.abbr);
```

#### Market heat

```typescript
const totalInterest = competingTeams.length + (player.ratings.overall >= 75 ? 2 : player.ratings.overall >= 65 ? 1 : 0);
if (player.ratings.overall >= 80 && totalInterest >= 5) marketHeat = 'bidding_war';
else if (totalInterest >= 4) marketHeat = 'hot';
else if (totalInterest >= 2) marketHeat = 'moderate';
else marketHeat = 'cold';
```

Market heat detail templates:
```typescript
const HEAT_DETAILS = {
  cold: [
    'The phone isn\'t ringing for him. You have real leverage — no need to rush or overpay.',
    'Quiet market. Wait a few days and the price drops further.',
  ],
  moderate: [
    'A few teams are interested but nobody\'s been aggressive. Move decisively and you control the terms.',
    'Moderate interest around the league. You won\'t bid against yourself, but it\'s not a feeding frenzy.',
  ],
  hot: [
    'Multiple teams are pursuing him hard. Act fast and come strong if you want him.',
    'His agent has leverage — several teams with cap space and a need. Don\'t expect a discount.',
  ],
  bidding_war: [
    'At least 5 teams are in. His agent is orchestrating a bidding war. Be prepared to overpay or walk.',
    'One of the most sought-after players on the market. This is going to be expensive.',
  ],
};
```

#### Agent style

Generate deterministically from player seed:

```typescript
const AGENT_STYLES: AgentStyle[] = ['hardball', 'collaborative', 'impatient', 'relationship'];
const agentStyle = AGENT_STYLES[seed % 4];

const AGENT_STYLE_DETAILS: Record<AgentStyle, string[]> = {
  hardball: [
    'His agent is a classic maximizer. Expect firm counters, minimal flexibility, and he\'ll shop your offer to other teams.',
    'Tough negotiator. He\'ll push for every dollar and won\'t budge easily. Be prepared to walk away — that\'s your only leverage.',
  ],
  collaborative: [
    'Good agent to work with. Looking for the right fit, not just the highest dollar. A fair offer gets a fair response.',
    'Straightforward negotiator — make a fair offer and you\'ll get a fair response. No games.',
  ],
  impatient: [
    'Wants this done fast. Your first offer better be close or he\'ll move on to the next team.',
    'Quick decision-maker. Lowball and he won\'t counter — he\'ll just hang up.',
  ],
  relationship: [
    'Values relationships over raw dollars. The personal touch matters. If you show genuine interest, it pays dividends.',
    'The type of agent who remembers how you treated his last client. Invest in the relationship.',
  ],
};

const AGENT_TIPS: Record<AgentStyle, string> = {
  hardball: 'Tip: Start at ~95% of asking. He won\'t counter low offers — he\'ll just walk.',
  collaborative: 'Tip: A fair offer gets a fair response. Don\'t lowball but don\'t overpay.',
  impatient: 'Tip: Make your best offer first. You may not get a second chance.',
  relationship: 'Tip: The fact that you ran an Intel Report already shows investment. Lean into that.',
};
```

#### Deal path

```typescript
if (willingness === 'eager' && (marketHeat === 'cold' || marketHeat === 'moderate')) dealPath = 'strong';
else if (willingness !== 'not_interested' && marketHeat !== 'bidding_war') dealPath = 'possible';
else if (willingness === 'reluctant' || marketHeat === 'hot') dealPath = 'uphill';
else dealPath = 'unlikely';

const DEAL_PATH_DETAILS = {
  strong: [
    'Real mutual interest, low competition. If the money is close, this gets done.',
    'Everything lines up. Be aggressive — this is one you can win.',
  ],
  possible: [
    'There\'s a path but you\'re not the frontrunner. A strong offer could tip it.',
    'Doable, but you\'ll need to put together a competitive package.',
  ],
  uphill: [
    'Tough odds. He has better options and knows it. You\'d need to overpay significantly.',
    'Long shot unless you can offer something unique — a role, a winning team, loyalty.',
  ],
  unlikely: [
    'Honestly? Save your energy for a more realistic target. This one isn\'t happening.',
    'Not worth the pursuit. The market and the player\'s preferences are working against you.',
  ],
};
```

#### Concerns (0-2)

```typescript
const concerns: string[] = [];
if (player.ratings.stamina < 55)
  concerns.push('Whispers about a nagging soft-tissue issue not on the official report. Medical staff should take a close look.');
if (player.age >= 30 && player.potential < player.ratings.overall)
  concerns.push('He\'s past his peak and the tape shows it. You\'d be paying for what he was, not what he\'ll be.');
if (player.scoutingLabel === 'Character concerns')
  concerns.push('Off-field maturity questions came up. His agent got defensive when pressed — not a great sign.');
if (player.scoutingLabel === 'Injury history')
  concerns.push('Acknowledged injury history but insists he\'s healthy. Worth getting doctors involved before committing money.');
if (player.mood && player.mood < 40)
  concerns.push('Baggage from his last stop. Left unhappy and it\'s affecting how he views teams. Needs to feel wanted.');
if (seed % 5 === 0 && player.experience >= 6)
  concerns.push('Word is he\'s been coasting in practice lately. Work ethic may not match the talent.');
if (seed % 7 === 0 && player.age <= 26)
  concerns.push('Young player with some growing up to do. Needs veteran mentorship and structure.');
```

#### Intel blurb (front office summary)

Generate a 1-2 sentence summary based on the combination of priority, deal path, and market heat. Examples:

```typescript
// Strong path + aligned priority
'This is a real opportunity. He wants what we offer and the market isn\'t overwhelming. Be aggressive.'

// Possible path + hot market
'Talented player but the competition is stiff. We\'ll need to move fast and bring our A-game to close this.'

// Uphill + not aligned
'Uphill battle. His priorities don\'t match our situation and better teams are circling. Proceed with caution.'

// Unlikely
'I\'d save our resources. The fit isn\'t there and the market is giving him better options.'
```

#### Mechanical effects

```typescript
salaryDiscount: 0.88,    // 12% reduction on asking price in negotiation
patienceBonus: 1,        // +1 max negotiation round
overridesRefusal: willingness !== 'not_interested',  // removes from faRefusals unless truly not interested
```

For `not_interested` players (elite + bad team), the Intel Report tells you it's not happening but does NOT override the refusal. The report's value there is saving you from wasting negotiation attempts.

---

## Negotiation Integration (`src/lib/engine/negotiation.ts`)

### Modify `initNegotiation` signature:

```typescript
export function initNegotiation(
  player: { id: string; firstName: string; lastName: string; position: string; age: number; ratings: { overall: number }; mood?: number; faPriority?: string },
  estimatedSalary: number,
  context: 'resigning' | 'freeAgency' = 'freeAgency',
  hasIntelReport?: boolean,
  userTeamContext?: { winPct: number; wouldStart: boolean; wasOnTeam: boolean },
): NegotiationState {
```

### Apply priority modifiers (always, even without Intel Report):

```typescript
if (context === 'freeAgency' && player.faPriority && userTeamContext) {
  if (player.faPriority === 'winning' && userTeamContext.winPct >= 0.55) adjustedSalary *= 0.95;
  else if (player.faPriority === 'winning' && userTeamContext.winPct < 0.40) adjustedSalary *= 1.08;
  if (player.faPriority === 'role' && userTeamContext.wouldStart) adjustedSalary *= 0.95;
  else if (player.faPriority === 'role' && !userTeamContext.wouldStart) adjustedSalary *= 1.05;
  if (player.faPriority === 'loyalty' && userTeamContext.wasOnTeam) adjustedSalary *= 0.90;
}
```

### Apply Intel Report bonuses:

```typescript
if (hasIntelReport) {
  adjustedSalary *= 0.88;  // 12% rapport discount
  baseRounds += 1;          // more patience

  // Warmer opening message
  openingText = pick([
    `I hear you guys have done your homework on me. I respect that. Let's talk — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    `My agent says your team is serious about making this work. I like that. ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
    `I appreciate the interest. Let's see if we can get this done — ${fmtSalary(adjustedSalary)} for ${fmtYears(askingYears)}.`,
  ]);
}
```

---

## Refusal Override

In `intelReportFA`, if `overridesRefusal` is true, remove the player from `faRefusals`:

```typescript
if (overridesRefusal) {
  const currentRefusals = state.faRefusals.filter(id => id !== playerId);
  set({ faRefusals: currentRefusals });
}
```

---

## UI — Pursuit Report Panel

### Expanded Row on FA Page

Currently, expanding a free agent row shows the `FAEvaluationPanel`. Keep that, but add the Pursuit Report below it.

**Without Intel Report:**

```
[Existing FA Evaluation Panel — recommendation, fit score, impact, etc.]

────────────────────────────────────────────────────────
INTEL REPORT
No intel gathered.
[Run Intel Report (1 pt)]     Pursuit Pts: 8
────────────────────────────────────────────────────────
```

**With Intel Report — full content:**

```
[Existing FA Evaluation Panel]

────────────────────────────────────────────────────────
INTEL REPORT ✅

🏆 PRIORITY: Chasing a Ring
"He's tired of losing. Our sources say he'd take less money
to play for a legitimate contender with a clear path to the
playoffs."

┌────────────────────────────────────────────────────┐
│  CLOSING OFFER                                     │
│  $24.5M/yr for 3 years                             │
│                                                    │
│  "The intel says $24.5M/yr for 3 years closes it.  │
│   Hit that and he signs."                          │
│                                                    │
│  [Sign at $24.5M/yr, 3 years]  ← gold button      │
│  [Negotiate]  ← standard button (start negotiation │
│                  with 12% discount + extra round)   │
└────────────────────────────────────────────────────┘

TRUE ASKING PRICE         WILLINGNESS
$28.5M/yr, 3 years       🟢 Eager to talk
                          "He likes what your team is building."

MARKET INTEL              ALSO INTERESTED
🔥 Hot Market              DAL, BUF, KC
"Multiple teams pursuing him hard. Act fast."

AGENT PROFILE: Hardball Negotiator
"His agent is a classic maximizer. Expect firm counters
and he'll shop your offer. Don't show your ceiling early."
💡 Start at ~95% of asking. He won't counter low offers.

FIT ASSESSMENT
"He values winning — your 12-5 record makes you attractive.
But Dallas and Buffalo are contenders too."

PATH TO A DEAL: Possible ⚡
"There's a path but you're not the frontrunner.
A strong offer could tip it."

⚠ CONCERNS
• Whispers about a nagging shoulder issue not on the
  official report. Medical staff should take a close look.

NEGOTIATION EDGE
✅ Asking price reduced 12% (intel rapport)
✅ +1 negotiation round
✅ Refusal overridden — will negotiate

"Talented player but the competition is stiff. Move fast
and bring your A-game."
— Front Office
────────────────────────────────────────────────────────
```

### "Sign at Closing Offer" Button

When clicked:
1. Call `signFreeAgent(playerId, closingOffer.salary, closingOffer.years)` directly — NO negotiation
2. Show confirmation: "SIGNED! Marcus Johnson signed for $24.5M/yr, 3 years"
3. This is the payoff — one click, done

### "Negotiate" Button (alternative)

The user can also choose to negotiate normally, which starts `initNegotiation` with the Intel Report bonuses applied (12% lower asking price, +1 round, warmer opening). This is for users who think they can beat the closing offer by negotiating down further.

---

## FA Page Header

Add pursuit points alongside cap space and FA day:

```
Free Agency       Day 8 of 30      $45.2M Cap Space      Intel: 8 pts
```

---

## FA Table Updates

In the player list, add indicators for reported players:

- No report: no change
- Has Intel Report: show 📋 icon next to name, replace Market column value with **true asking price** (highlighted to show it's insider info), and show the priority as a small badge: `💰` / `🏆` / `🎯` / `🏠`

For reported players, also show the **closing offer** in a subtle way in the table row — maybe as a second line under the market price: `$24.5M ⭐ closes it`

---

## Summary of Files to Change

1. **`src/types/index.ts`** — Add `faPriority` on Player, `pursuitState` on LeagueState, `IntelReportData` interface
2. **`src/lib/engine/store.ts`** — Add `intelReportFA` action with all generation logic, modify `advanceToFreeAgency` (init pursuitState + generate priorities), remove from faRefusals when appropriate
3. **`src/lib/engine/negotiation.ts`** — Add `hasIntelReport` + `userTeamContext` params to `initNegotiation`, apply priority modifiers + intel discount + warmer opening messages
4. **`src/app/free-agency/page.tsx`** — Add pursuit points header, Intel Report panel in expanded rows, "Sign at Closing Offer" button, "Run Intel Report" button, pursuit indicators in table, pass intel status to `startNegotiation`
5. **`src/lib/engine/personnelReport.ts`** — No changes needed
