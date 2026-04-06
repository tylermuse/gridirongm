# Scouting UI Revamp

The 3-tier scouting system (Film Review → In-Person Eval → Full Eval) is implemented and the game logic is working. But the UI needs significant improvement. The current issues:

1. **The inline tier result cards (Film Review/In-Person/Full Eval) are tiny rectangles with minimal info** — they should show rich, detailed content at each tier
2. **The scouting action buttons are hidden little rectangles next to the player's name** — unintuitive
3. **The OVR range in the prospect list table doesn't narrow as you scout deeper** — it should visually reflect the tighter range at each tier
4. **The modal shows content per-tier but could be better organized** — needs a clear progression UI

Here's what to change:

---

## 1. Scouting Progress Bar + Tab Navigation in the Modal

**Replace the current small tier badge in the modal header** (the tiny "Film Review" / "In-Person" / "Full Eval" pill at line ~425-432) with a prominent **scouting depth progress bar and tab row** at the top of the modal, right below the header.

### Progress Bar

A horizontal progress bar showing scouting depth from None → Full:

```
Scouting Depth                          8 / 8 points spent  ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
None (2pts) ──── Interview (4pts) ──── Pro Day (6pts) ──── Full (8pts)
```

Wait — use the ACTUAL tier names, not the old ones. And rethink the cost display. The bar should show:

```
Scouting Depth                          5 / 9 points spent
[████████████████████░░░░░░░░░░░░░░░░░░]
 None    Film Review(1pt)    In-Person(3pts)    Full Eval(5pts)
```

Design this as a segmented progress bar:
- The bar fills proportionally: None=0%, Film Review=~33%, In-Person=~66%, Full=100%
- The current tier is highlighted/active
- Future tiers are grayed out
- Show cumulative points spent on this player (1 → 4 → 9) vs total available

### Tab Row

Below the progress bar, add a tab row for navigating the report sections. The tabs should correspond to CONTENT SECTIONS, not scouting tiers. Tabs become enabled as scouting progresses:

```
[Overview]  [Scout Evaluation]  [Measurables]  [Projection]
```

**Tab content mapping:**

- **Overview** (always visible, content expands with scouting):
  - Tier 0: Just the "Unscouted Prospect" prompt with Film Review button
  - Tier 1: Fit Score + badge, projection tier, strength/weakness, Scout's Take quote placeholder ("Unlock In-Person Eval for scout's analysis")
  - Tier 2: Fit Score + badge, Scout's Take quote, Roster Comparison, character snippet
  - Tier 3: Fit Score + badge, Scout's Take quote, Roster Comparison, Scout's Overview (full paragraphs), Player Comparison

- **Scout Evaluation** (unlocks at Tier 1, content expands):
  - Tier 1: OVR range (wide), strength one-liner, weakness one-liner, projection tier badge
  - Tier 2: OVR range (tighter), top 3 position ratings bars, character assessment (personality + notes), boom/bust signal if detected
  - Tier 3: Exact OVR, ALL position ratings bars, confirmed boom/bust, Strengths bullets, Weaknesses bullets, Draft Grade card (A+ through D with Floor/Ceiling/Confidence/Risk)

- **Measurables** (unlocks at Tier 2):
  - Tier 2+: Physical Traits bars (Speed, Strength, Agility, Stamina) + Combine Measurables card (height, weight, 40-yard, etc.)

- **Projection** (unlocks at Tier 3):
  - Tier 3: Development Projection curve (trajectory + year-by-year OVR), Character & Intangibles card (Work Ethic, Leadership, Coachability, Competitiveness), full potential label

**Locked tabs**: Tabs that aren't unlocked yet should be visible but grayed out/disabled, with a small lock icon. Clicking them shows a tooltip: "Unlock with In-Person Eval" or "Unlock with Full Evaluation". This creates anticipation and makes the user want to invest more.

### Next Action Button

The "next scouting tier" button should be **prominently placed right below the progress bar**, not buried at the bottom of the modal. Make it a clear call-to-action:

```
┌─────────────────────────────────────────────────┐
│  ▶ In-Person Evaluation (3 pts)                 │
│    6 of 8 remaining  •  12 scout points left    │
└─────────────────────────────────────────────────┘
```

When the player is fully scouted (Tier 3), replace this with a "✅ Fully Scouted" indicator.

---

## 2. Rich Content at Each Tier (Not Tiny Cards)

The biggest problem right now: when you scout a player, the inline expanded view in the draft page shows tiny colored rectangles with 3-4 lines of text each. That's not rewarding. Each tier should feel like a meaningful unlock.

### Inline Expanded View (draft page, the `<td colSpan={7}>` section at ~line 1149-1217)

**Remove the current approach** of showing Film Review / In-Person / Full Eval as side-by-side colored cards. Instead, show a **single, rich panel** whose content grows with each tier. The expanded row should look like a mini scouting report, not a collection of metadata badges.

**Tier 0 (Unscouted) — expanded row:**
```
┌──────────────────────────────────────────────────────────┐
│  📋 UNSCOUTED                                            │
│  Start a Film Review to learn about this prospect.       │
│                                                          │
│  [Film Review (1 pt)]     Scout Pts: 12                  │
└──────────────────────────────────────────────────────────┘
```

**Tier 1 (Film Review) — expanded row:**
Show a proper summary with real substance:
```
┌──────────────────────────────────────────────────────────┐
│  📋 FILM REVIEW COMPLETE              Scout Pts: 11      │
│                                                          │
│  OVR Range: 68–80          Projection: Starter           │
│  Potential: High                                         │
│                                                          │
│  ✅ Lockdown coverage skills                             │
│  ⚠️ Accuracy concerns                                    │
│                                                          │
│  "Good tape against solid competition. Plays with a      │
│   high motor and fills his gaps consistently."           │
│   — Scout Staff                                          │
│                                                          │
│  [In-Person Eval (3 pts)]    6/8 remaining               │
│  [View Full Report]                                      │
└──────────────────────────────────────────────────────────┘
```

**Key change:** Generate a short scout blurb at Film Review tier. Currently the Scout's Take only shows at Tier 2+. Instead, generate a **brief 1-2 sentence film review blurb** at Tier 1. You can use the existing `scoutingReport.ts` overview templates but just take the opening sentence. Or add a new short-form blurb generator. The point is: even Film Review should give you a paragraph of analysis, not just two keywords.

**Tier 2 (In-Person) — expanded row:**
```
┌──────────────────────────────────────────────────────────┐
│  👁 IN-PERSON EVAL COMPLETE           Scout Pts: 8       │
│                                                          │
│  OVR Range: 74–80          Projection: Starter           │
│  Potential: High           Character: High Character      │
│                                                          │
│  SCOUTED RATINGS                                         │
│  Coverage  ████████████████████████░░  82 (A)            │
│  Tackling  ██████████████████████░░░░  76 (B+)           │
│  Range     ████████████████████░░░░░░  72 (B+)           │
│  +2 more at Full Eval                                    │
│                                                          │
│  ✅ Lockdown coverage skills                             │
│  ⚠️ Accuracy concerns                                    │
│  Profile: Normal development                             │
│                                                          │
│  "Good tape against solid competition. Plays with a      │
│   high motor and fills his gaps consistently."           │
│   — Scout Staff                                          │
│                                                          │
│  [Full Evaluation (5 pts)]   2/3 remaining               │
│  [View Full Report]                                      │
└──────────────────────────────────────────────────────────┘
```

**Tier 3 (Full Eval) — expanded row:**
This should be the most detailed inline view. Show the key highlights without needing to open the modal:
```
┌──────────────────────────────────────────────────────────┐
│  ✅ FULLY SCOUTED                                        │
│                                                          │
│  OVR: 77    Potential: High    Profile: Normal           │
│  Draft Grade: B+    Projection: Starter                  │
│                                                          │
│  SCOUTED RATINGS                                         │
│  Coverage  ████████████████████████░░  82 (A)            │
│  Tackling  ██████████████████████░░░░  76 (B+)           │
│  Range     ████████████████████░░░░░░  72 (B+)           │
│  Instincts ██████████████████░░░░░░░░  68 (B)            │
│                                                          │
│  Strengths: Lockdown coverage, ball hawk instincts       │
│  Weaknesses: Run defense liability, limited range        │
│  Comparison: Quinyon Mitchell (Lockdown)                  │
│  Development: Steady Climber — Peak at age 27            │
│                                                          │
│  "I've watched every snap of his tape. He's the real     │
│   deal — versatile playmaker potential."                  │
│   — Scout Staff                                          │
│                                                          │
│  [View Full Report]                                      │
└──────────────────────────────────────────────────────────┘
```

The **[View Full Report]** button opens the ScoutingReportModal for the detailed tabbed view.

---

## 3. OVR Range in Prospect List Should Narrow with Scouting

**Current behavior** (~lines 1054-1058 and 1120-1123): The OVR column shows `lo–hi` based on `draftScoutingData` error margin. This doesn't change when you do Film Review or In-Person Eval — it stays at the background scouting noise level.

**Fix:** The OVR range displayed in the table should use the TIGHTEST range available from scouting tiers:

```typescript
// In the prospect row rendering (~line 1054):
const tier = getScoutTier(player.id);
const film = ss?.filmReviews[player.id];
const inPerson = ss?.inPersonEvals[player.id];
const full = ss?.fullEvals[player.id];

let lo: number, hi: number;
if (full) {
  // Tier 3: exact OVR, show as single number or ±1
  lo = full.exactOvr;
  hi = full.exactOvr;
} else if (inPerson) {
  // Tier 2: ±3 range
  lo = inPerson.ovrRange.low;
  hi = inPerson.ovrRange.high;
} else if (film) {
  // Tier 1: ±6 range
  lo = film.ovrRange.low;
  hi = film.ovrRange.high;
} else {
  // Unscouted: use background scouting data
  lo = scout ? Math.max(20, scout.scoutedOvr - err) : Math.max(20, player.ratings.overall - err);
  hi = scout ? Math.min(99, scout.scoutedOvr + err) : Math.min(99, player.ratings.overall + err);
}
```

**In the OVR table cell**, when Tier 3 is reached, show a **single bold number** instead of a range:
```tsx
<td className={`py-2.5 text-center font-bold ${ratingColor(...)}`}>
  {full ? (
    <span className="font-black">{full.exactOvr}</span>
  ) : (
    <span>{lo}–{hi}</span>
  )}
</td>
```

Also update the **Scout column** (the "Scout OVR" estimate at ~lines 1124-1135) to reflect the tier-specific range. At Tier 3, this should just show the exact OVR. At lower tiers, show the tier-specific range.

---

## 4. Remove the Tiny Inline Scout Buttons Next to Player Names

**Current behavior** (~lines 1080-1103): There's a tiny `[Film (1pt)]` or `[In-Person (3pt)]` button crammed next to the player's name in the table row.

**Replace with:** A **scouting tier indicator** in a dedicated column or as part of the existing Scout column. Instead of a clickable button, show a **visual tier indicator**:

- Unscouted: empty circle or "—"
- Tier 1 (Film Review): one filled dot ● (blue)
- Tier 2 (In-Person): two filled dots ●● (purple)
- Tier 3 (Full): three filled dots ●●● (gold) or a checkmark ✓

The scouting ACTION should happen in two places:
1. **The expanded row** — the prominent button at the bottom of the expanded content
2. **The modal** — the button below the progress bar

Don't put scouting actions in the compact table row. It clutters the UI and the buttons are too small to be useful.

---

## 5. Generate a Film Review Blurb

Right now, Tier 1 (Film Review) only reveals a strength keyword, weakness keyword, projection tier, and potential hint. That's too thin. Add a **short scout blurb** to the Film Review data.

### In `store.ts`, `filmReviewPlayer` action:

After computing the existing fields, also generate a 1-2 sentence film review blurb. You can do this by calling a simplified version of the overview logic from `scoutingReport.ts`, or add a new function.

**Approach:** Add a `blurb: string` field to the `filmReviews` record. Generate it deterministically using the player's seed:

```typescript
// In filmReviewPlayer:
const blurb = generateFilmReviewBlurb(player);
```

Create a `generateFilmReviewBlurb(player: Player): string` function in `scoutingReport.ts` that produces a 1-2 sentence take based on position, OVR tier, and key ratings. Use the existing template structure but much shorter. Examples:

- Elite QB: "Commands the pocket with poise. Arm talent jumps off the tape and he processes reads at an advanced level."
- Solid RB: "Good tape against solid competition. Runs with power between the tackles and shows reliable hands out of the backfield."
- Raw CB: "Flashes intriguing athleticism but technique is inconsistent. Needs development time before contributing."

This makes the Film Review feel substantial — you get a real scout take, not just keywords.

### Update the Film Review data type:

In `src/types/index.ts`, add `blurb: string` to the `filmReviews` record type.

---

## 6. "View Full Report" Button

Both the expanded inline view AND the modal should have a clear way to navigate between them. The expanded inline view shows a summary; the modal shows the complete tabbed report.

Add a **"View Full Report"** link/button at the bottom of every expanded inline view (all tiers except Tier 0). Clicking it opens the `ScoutingReportModal`.

---

## Summary of Changes

### `src/components/draft/ScoutingReportModal.tsx`
- Add scouting depth progress bar at top of modal
- Add tab navigation (Overview / Scout Evaluation / Measurables / Projection)
- Move "next scouting action" button to be prominent below progress bar
- Show locked tabs with lock icon for future tiers
- Reorganize content into tab sections instead of one long scroll

### `src/app/draft/page.tsx`
- **Inline expanded row**: Replace tiny colored cards with rich, growing panel
- **OVR column**: Use tier-specific ranges instead of background scouting data
- **Scout column**: Update to reflect tier-specific OVR estimates
- **Remove** tiny inline scout buttons next to player names
- **Add** visual tier indicator (dots) in the table row
- **Add** "View Full Report" button in expanded rows
- Show Film Review blurb text in expanded row

### `src/lib/engine/scoutingReport.ts`
- Add `generateFilmReviewBlurb(player: Player): string` function

### `src/lib/engine/store.ts`
- Update `filmReviewPlayer` to generate and store a blurb

### `src/types/index.ts`
- Add `blurb: string` to the `filmReviews` record type
