# Scouting System Redesign: 3-Tier Funnel

## Overview

Replace the current scouting system (1 big "Scout" button + 3 small add-ons that each cost 1pt and reveal minor details) with a **3-tier progressive scouting funnel** where each tier costs more, has stricter caps, and reveals qualitatively different information. The existing scouting report content (strengths/weaknesses text, NFL comparisons, overview paragraphs, scout's take quotes, etc.) is excellent and should be preserved — it just needs to be parceled out across tiers instead of dumped all at once.

**IMPORTANT: Preserve ALL existing scouting report generation logic in `scoutingReport.ts`.** The `generateScoutingReport()` function and all its templates, comparisons, overview text, etc. should remain intact. We're just changing *when* each piece gets shown to the user.

---

## The Three Tiers

### Tier 1 — Film Review
- **Cost:** 1 scout point
- **Cap:** ~15-20 per draft (limited only by total scout points)
- **Purpose:** Broad survey. "Is this player worth my time?"
- **What it reveals:**
  - OVR estimate as a **range** (true OVR ±6, so e.g. "68–80"). Use the player's actual OVR and add ±6 to create the range, clamped to 30-99.
  - **Top strength** (one line, e.g. "Elite arm talent") — use the existing `STRENGTH_NOTES` logic from `sendScoutTrip` that finds the player's best primary rating key
  - **Top weakness** (one line, e.g. "Accuracy concerns") — same approach, worst rating key
  - **Projection tier** label: "Starter" (OVR ≥ 75), "Rotational" (OVR ≥ 65), "Backup" (OVR ≥ 55), "Project" (OVR < 55)
  - **Potential hint**: 'high' / 'medium' / 'low' (same logic as current: potential ≥ 80 = high, ≥ 65 = medium, else low)

### Tier 2 — In-Person Evaluation
- **Cost:** 3 scout points
- **Cap:** 8 per draft (hard cap, tracked in state)
- **Prerequisite:** Must have Film Review (Tier 1) on this player first
- **Purpose:** Focused evaluation. "Is this player worth my draft pick?"
- **What it reveals (in addition to Tier 1):**
  - OVR estimate **tightens** to ±3 (update the range shown)
  - **Physical Traits** section (Speed, Strength, Agility, Stamina bars) — from the existing `generateScoutingReport().physicalTraits`
  - **Scouted Ratings**: reveal the top 2-3 position-specific ratings (not all of them). Use the `POSITION_KEY_RATINGS` map and show the first 3 entries for the player's position.
  - **Character read**: personality type ('high_character', 'confident', 'reserved', 'red_flag') + the character notes string. Use existing interview logic for generating these.
  - **Partial boom/bust signal**: 50% chance to reveal the player's `draftProfile` (bust/boom/normal). Use the same detection logic as the current `interviewProspect` function.
  - **Combine Measurables** section (height, weight, 40-yard, etc.) — from `generateScoutingReport().combineMeasurables`
  - **Scout's Take** quote — the 1-2 sentence italic quote from `generateScoutingReport().scoutsTake`

### Tier 3 — Full Evaluation
- **Cost:** 5 scout points
- **Cap:** 3 per draft (hard cap, tracked in state)
- **Prerequisite:** Must have In-Person Eval (Tier 2) on this player first
- **Purpose:** Complete deep dive. "Is this player worth building around?"
- **What it reveals (in addition to Tier 1 + Tier 2):**
  - **Exact OVR** (±1, essentially the true rating) — replaces the range with a near-exact number
  - **All position-specific ratings** revealed (all entries from `POSITION_KEY_RATINGS`, not just top 3)
  - **Full boom/bust reveal**: 100% chance to know the player's `draftProfile`
  - **Strengths & Weaknesses** bullet lists — from `generateScoutingReport().strengths` and `.weaknesses`
  - **NFL Player Comparison** — from `generateScoutingReport().nflComparison`
  - **Draft Grade** card (A+ through D, with Floor/Ceiling/Confidence/Risk) — from `generateScoutingReport().draftGrade`
  - **Development Projection** (trajectory + year-by-year OVR curve) — from `generateScoutingReport().developmentCurve`
  - **Full Character & Intangibles** card (Work Ethic, Leadership, Coachability, Competitiveness) — from `generateScoutingReport().characterReport`
  - **Scout's Overview** (the 2-3 paragraph writeup) — from `generateScoutingReport().overview`
  - **Potential** label shown precisely (instead of just high/medium/low hint)

---

## Data Model Changes

### Replace `scoutingState` type in `src/types/index.ts` (lines ~691-702)

Remove the old `scoutTrips`, `interviews`, `proDays`, `proDayCount` fields. Replace with:

```typescript
scoutingState?: {
  scoutPoints: number;
  maxScoutPoints: number;
  /** Tier 1 — Film Review results, keyed by player ID */
  filmReviews: Record<string, {
    ovrRange: { low: number; high: number };
    strength: string;
    weakness: string;
    projectionTier: 'Starter' | 'Rotational' | 'Backup' | 'Project';
    potentialHint: 'high' | 'medium' | 'low';
  }>;
  /** Tier 2 — In-Person Evaluation results, keyed by player ID */
  inPersonEvals: Record<string, {
    ovrRange: { low: number; high: number };  // tighter range, ±3
    personality: string;
    characterNotes: string;
    revealedBustBoom: boolean;
    bustBoomResult?: 'bust' | 'boom' | 'normal';
    revealedRatingKeys: string[];  // which position rating keys were revealed (first 3)
  }>;
  /** Tier 2 count used this draft */
  inPersonEvalCount: number;
  /** Tier 3 — Full Evaluation results, keyed by player ID */
  fullEvals: Record<string, {
    exactOvr: number;           // ±1 of true OVR
    bustBoomResult: 'bust' | 'boom' | 'normal';
  }>;
  /** Tier 3 count used this draft */
  fullEvalCount: number;
};
```

### Remove `deepScouted` from `draftScoutingData`

The `draftScoutingData` record (`Record<string, { scoutedOvr, error, deepScouted }>`) should no longer need the `deepScouted` boolean. The tiered scouting state replaces that concept. You can keep `draftScoutingData` for the background noise/estimate system that runs on all prospects, but the `deepScouted` flag and the `deepScoutPlayer` action should be removed.

---

## Store Changes (`src/lib/engine/store.ts`)

### Remove these actions:
- `deepScoutPlayer` (lines ~5257-5279)
- `sendScoutTrip` (lines ~6293-6325)
- `interviewProspect` (lines ~6327-6365)
- `visitProDay` (lines ~6367-6393)

### Add three new actions:

#### `filmReviewPlayer(playerId: string)`
- Costs 1 scout point
- Cannot re-review a player already in `filmReviews`
- Computes: OVR range (true OVR ±6, clamped 30-99), strength/weakness (reuse `STRENGTH_NOTES`/`WEAKNESS_NOTES` + best/worst key logic from old `sendScoutTrip`), projection tier, potential hint
- Saves to `scoutingState.filmReviews[playerId]`

#### `inPersonEvalPlayer(playerId: string)`
- Costs 3 scout points
- Requires `filmReviews[playerId]` to exist (must do Tier 1 first)
- Cannot re-eval; hard cap of 8 (`inPersonEvalCount`)
- Computes: tighter OVR range (true OVR ±3, clamped 30-99), personality + character notes (reuse logic from old `interviewProspect`), 50% bust/boom detection, which rating keys are revealed (first 3 from `POSITION_KEY_RATINGS[position]`)
- Saves to `scoutingState.inPersonEvals[playerId]`, increments `inPersonEvalCount`

#### `fullEvalPlayer(playerId: string)`
- Costs 5 scout points
- Requires `inPersonEvals[playerId]` to exist (must do Tier 2 first)
- Cannot re-eval; hard cap of 3 (`fullEvalCount`)
- Computes: exact OVR (true OVR ±1 with deterministic noise, same approach as old `deepScoutPlayer`), guaranteed bust/boom result
- Saves to `scoutingState.fullEvals[playerId]`, increments `fullEvalCount`

### Update scouting point initialization

In the offseason/draft-setup code (~line 3528-3534), update the scoutingState initialization:

```typescript
scoutingState: {
  scoutPoints: 10 + (state.scoutingLevel || 0) * 5,  // keep as-is: 10/15/20 based on scouting level
  maxScoutPoints: 20,
  filmReviews: {},
  inPersonEvals: {},
  inPersonEvalCount: 0,
  fullEvals: {},
  fullEvalCount: 0,
},
```

---

## UI Changes

### ScoutingReportModal (`src/components/draft/ScoutingReportModal.tsx`)

This is the biggest change. Instead of binary "unscouted vs scouted" with `isScouted`, the modal should now accept a **scouting tier** for this player and progressively reveal sections.

**New props (replace `isScouted`, `onScout`, `scoutsRemaining`):**

```typescript
interface ScoutingReportModalProps {
  player: Player;
  scoutTier: 0 | 1 | 2 | 3;  // 0 = unscouted, 1 = film review, 2 = in-person, 3 = full eval
  onClose: () => void;
  onDraft?: () => void;
  onFilmReview?: () => void;      // action for Tier 1
  onInPersonEval?: () => void;     // action for Tier 2
  onFullEval?: () => void;         // action for Tier 3
  isUserPick: boolean;
  scoutPoints: number;             // current points remaining
  inPersonEvalsRemaining: number;  // 8 - count
  fullEvalsRemaining: number;      // 3 - count
  teamNeeds?: { position: Position; needScore: number; count: number; starterOvr: number }[];
  userTeamAbbr?: string;
  // Tier-specific data to display:
  filmReview?: typeof scoutingState.filmReviews[string];
  inPersonEval?: typeof scoutingState.inPersonEvals[string];
  fullEval?: typeof scoutingState.fullEvals[string];
}
```

**Display logic by tier:**

**Tier 0 (Unscouted):**
- Show "?" for OVR
- Show combine measurables if available (these are public info)
- Show scouting label badge if present (public info)
- Show the "next action" button: **"Film Review (1 pt)"**

**Tier 1 (Film Review done):**
- Show OVR as a **range** (e.g. "68–80") instead of a single number
- Show strength (green) and weakness (red/amber) one-liners
- Show projection tier badge ("Starter", "Rotational", etc.)
- Show potential hint ("High / Medium / Low Potential")
- The rest of the report sections should show as **locked/blurred placeholder cards** (like the current dashed-border preview) to hint at what deeper scouting would reveal
- Show "next action" button: **"In-Person Eval (3 pts)"** with remaining count shown, e.g. "(6 of 8 remaining)"

**Tier 2 (In-Person Eval done):**
- Show OVR as a **tighter range** (e.g. "72–78")
- Show everything from Tier 1, plus:
  - Physical Traits bars (Speed, Strength, Agility, Stamina)
  - Combine Measurables card
  - Top 3 position-specific scouted ratings (bars)
  - Character snippet: personality badge + notes text
  - If bust/boom was detected, show it
  - Scout's Take quote
- Remaining sections (Strengths/Weaknesses bullets, NFL Comparison, Draft Grade, Development Projection, full Character card, Scout's Overview) should show as **locked placeholders**
- Show "next action" button: **"Full Evaluation (5 pts)"** with remaining count, e.g. "(2 of 3 remaining)"

**Tier 3 (Full Eval done):**
- Show **exact OVR** as a single number (no range)
- Show **exact Potential** label (not just hint)
- Show ALL sections unlocked: everything from the existing `generateScoutingReport()` output
- No more "next action" — this player is fully scouted

**Visual design for the "next action" buttons:**
- Make these prominent — they should feel like the primary action in the modal at each tier
- Show the cost clearly and the remaining budget/cap
- Disable with clear messaging if the user can't afford it or has hit the cap

### Draft Page (`src/app/draft/page.tsx`)

**In the prospect list (where the old Scout Trip/Interview/Pro Day buttons were, ~lines 1130-1196):**

Remove the old three-button row and the old result cards (Scout Trip card, Interview card, Pro Day card). Replace with:

- A **scouting tier indicator** for each prospect in the list. Something like small badges or icons showing which tier has been completed:
  - No badge = unscouted
  - One filled circle or "📋" = Film Review done
  - Two filled circles or "👁" = In-Person Eval done
  - Three filled circles or "✅" = Full Eval done
- When a prospect row is expanded, show a **compact summary** of what's been learned at their current tier (similar to how the old Scout Trip/Interview/Pro Day cards displayed inline results)

**For the inline "Scout" button on each prospect row (~line 1067-1076):**

Currently there's a small "Scout" button that calls `deepScoutPlayer`. Replace this with a button that triggers the **next available tier** for that player:
- If unscouted → "Film Review (1pt)"
- If Tier 1 → "In-Person (3pts)"
- If Tier 2 → "Full Eval (5pts)"
- If Tier 3 → no button (fully scouted)

**Update the scouts remaining display** (~line 1139) to show current scout points and tier caps:
- "Scout Points: 12 | In-Person: 6/8 | Full Eval: 2/3"

**The `UnscoutedPanel` component (~line 392-433):**

Update this to also serve as the Tier 1 and Tier 2 "partial scout" view. Or create new panel components for each tier. The existing "Spend 1 Scout Point to unlock full evaluation" button should become the Film Review button for unscouted prospects.

### Scouting Level Settings

The `SCOUTING_LEVELS` in `subscription.ts` and the scouting level selector on the draft page should still work. The scouting level (Entry/Pro/Elite) still affects:
- How many total scout points you get per draft (10/15/20)
- The background noise on ALL prospects' `draftScoutingData` (the `SCOUTING_LEVEL_MULT` system)

This means at Elite level you naturally have better baseline estimates AND more points to spend on the funnel. That's a good dual benefit.

---

## Scout Point Economy

Quick sanity check on the economy:

| Scouting Level | Points | Can do (example allocation) |
|---|---|---|
| Entry (0) | 10 pts | 7 Film Reviews + 1 In-Person = 10 pts |
| Pro (1) | 15 pts | 8 Film Reviews + 2 In-Person + 0 Full = 14 pts |
| Elite (2) | 20 pts | 10 Film Reviews + 2 In-Person + 1 Full = 21 pts (would need to trim slightly) |

This feels right — you have to make real tradeoffs. A typical Elite user might do something like: 8 Film Reviews (8pts) + 2 In-Person (6pts) + 1 Full Eval (5pts) = 19 pts, leaving 1 point for one more Film Review. Entry level users are doing mostly Film Reviews with maybe one In-Person eval on their top target.

---

## Migration

If there are existing save games with the old `scoutingState` shape (scoutTrips/interviews/proDays), you'll need to handle migration. The simplest approach: if the old shape is detected, reset `scoutingState` to the new empty shape with the same `scoutPoints` and `maxScoutPoints`. Since scouting data resets each draft season anyway, this shouldn't be disruptive.

---

## Summary of Files to Change

1. **`src/types/index.ts`** — Update `scoutingState` type
2. **`src/lib/engine/store.ts`** — Remove old 4 actions, add 3 new ones, update initialization
3. **`src/components/draft/ScoutingReportModal.tsx`** — Major rework: tier-based progressive reveal
4. **`src/app/draft/page.tsx`** — Update prospect list UI, remove old buttons, add tier indicators
5. **`src/lib/engine/scoutingReport.ts`** — **NO CHANGES NEEDED** (keep all the great report content)
6. **`src/lib/subscription.ts`** — No changes needed (scouting levels still work the same way)
