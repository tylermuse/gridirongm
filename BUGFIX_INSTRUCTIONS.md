# GridironGM Bugfix Instructions for Claude Code

These are plain-English instructions for fixing four gaps found during live playtesting. Each fix is independent — do them in any order. They're all in `src/lib/engine/store.ts` unless noted otherwise.

---

## Fix 1: Wire `updateApprovalForMove()` into Trades, Signings, and Releases

### Problem
`updateApprovalForMove` is imported at line 27 but never actually called anywhere in store.ts. This means trades, free agent signings, and player releases have zero effect on fan/owner approval — only game results move the needle.

### What to do

**In `executeTrade()` (around line 4840, right before the final `set()` call):**

Add approval logic for the user's team. Check if the user team is involved in the trade. If so, look at the players being traded:

- For each player the user is **sending away**: if the player's OVR is 70+, call `updateApprovalForMove(approval, 'trade_away_star')`. This docks 5 fan approval.
- For each player the user is **receiving**: if the player's OVR is 70+, call `updateApprovalForMove(approval, 'trade_for_star')`. This adds 5 fan approval.
- If the trade results in the user team going over 90% of the salary cap, also call `updateApprovalForMove(approval, 'over_cap')`. This docks 3 owner approval.

Store the updated approval back into the user team's `approval` field inside the `set()` call.

**In `signFreeAgent()` (around line 4390, right before the final `set()` call):**

If the signing team is the user's team and the player's OVR is 70+, call `updateApprovalForMove(approval, 'sign_star')`. This adds 4 fan approval. Store the result.

**In `releasePlayer()` (around line 4470, right before the final `set()` call):**

If the released player's OVR is 70+, call `updateApprovalForMove(approval, 'trade_away_star')`. This docks 5 fan approval (fans don't like losing good players). Store the result.

### How to call it

The function signature is:
```
updateApprovalForMove(currentApproval: ApprovalState, moveType: string) => ApprovalState
```

Get the current approval from `state.teams[userTeamIndex].approval` (fall back to `defaultApproval()` if undefined). After calling, write the returned object back to the team's approval in the `set()` call.

---

## Fix 2: Add Firing Consequence When Owner Approval Stays Critical

### Problem
The approval system tracks a `warningIssued` flag and sets `ownerApproval` to 0 on the second consecutive low season, but nothing actually happens when it hits 0. There's no "you're fired" screen, no game-over state, no consequence.

### What to do

**In `startNewSeason()` (around line 5900, where the new season setup happens):**

After calling `updateApprovalEndOfSeason`, check the returned approval. If `ownerApproval === 0`, the user has been fired. Do this:

1. Add a new field to `LeagueState` in `src/types/index.ts`:
```
firedState: {
  fired: boolean;
  season: number;
  reason: string;
} | null;
```

2. In store.ts, when approval comes back with `ownerApproval === 0`, set:
```
firedState: {
  fired: true,
  season: state.season,
  reason: 'Owner lost confidence after consecutive poor seasons'
}
```

3. Also add a news item:
```
{
  type: 'coaching',
  headline: `${userTeam.city} ${userTeam.name} fire head coach after disastrous tenure`,
  description: 'The front office has decided to move in a new direction after failing to meet expectations.',
  week: 'Offseason',
  season: state.season
}
```

4. Create a simple "Game Over" UI check. In `src/app/page.tsx` (the Dashboard), check if `state.firedState?.fired === true`. If so, render a game-over overlay with:
   - "You've Been Fired" heading
   - The reason text
   - A "Start New League" button that resets the game state
   - Optionally a "Continue as New GM" button that resets approval to 50/50, clears firedState, and lets the user keep going (forgiving mode)

---

## Fix 3: Reset Scout Points Between Drafts

### Problem
`scoutingState.scoutPoints` are spent during each draft but never replenished for the next season. The scout functions (lines 6209, 6243, 6283) use a fallback of `scoutPoints: 15` when `scoutingState` is undefined, but once it's defined and depleted, it stays depleted.

### What to do

**In `advanceToDraft()` (around line 3488–3499, inside the `set()` call):**

Add a `scoutingState` reset:

```
scoutingState: {
  scoutPoints: 10 + (state.teams[userTeamIndex]?.scoutingLevel || 0) * 5,
  maxScoutPoints: 20,
  scoutTrips: {},
  interviews: {},
  proDays: {},
  proDayCount: 0,
}
```

This gives:
- Entry-level scouts (level 0): 10 points
- Pro scouts (level 1): 15 points
- Elite scouts (level 2): 20 points

The trips, interviews, and pro days objects are cleared because they were for last year's draft class. Fresh slate each year.

---

## Fix 4: Tune Per-Game Approval Deltas (Quality of Life)

### Problem
During playtesting, a 49-14 blowout win didn't visibly move the approval gauges. The current per-game deltas are:
- Win: +2 fan, +1 owner
- Loss: -2 fan, -1 owner
- Blowout (21+ margin): additional ±2 fan

Over 17 games these add up, but game-to-game the movement feels invisible. A 35-point blowout should feel rewarding.

### What to do

**In `src/lib/engine/approval.ts`, in the `updateApprovalAfterGame` function (around lines 25–50):**

Increase the base deltas and add a scaling factor for margin of victory:

- Win: fanApproval **+3** (was +2), ownerApproval **+2** (was +1)
- Loss: fanApproval **-3** (was -2), ownerApproval **-2** (was -1)
- Rivalry win: additional **+3** fan (was +2 total for rivalry, make it +3 bonus on top)
- Rivalry loss: additional **-3** fan
- Blowout bonus: scale by margin instead of flat. If margin > 14, add `Math.floor(margin / 7)` to fanApproval (capped at +5). So a 35-point win adds +5 fan on top of the base +3. A 14-point win adds +2.
- Blowout loss penalty: same logic but negative.

This makes the gauges feel alive week-to-week. A dominant 49-14 win would give roughly +8 fan approval and +2 owner approval, which is visible on a 0-100 scale.

---

## Fix 5: Game Crash on "End Free Agency Early"

### Problem
During playtesting, clicking "End Free Agency Early" caused a client-side exception and crashed the app. The URL progressed from `/free-agency` to `/draft`, so the crash likely happens at the tail end of AI free agency processing or during the transition to draft state.

### What to do

This needs debugging. Open the browser console, reproduce the crash by starting a new league, advancing to free agency, and clicking "End Free Agency Early." The error will show in the console.

Common causes to check:
- A player reference that became undefined during AI free agency processing (a team trying to sign a player another team already signed)
- An array index out of bounds when processing 30 days of AI signings in one tick
- A missing null check when accessing `team.approval` for an AI team (AI teams may not have approval initialized)

Wrap the free agency fast-forward loop in a try-catch so even if one AI signing fails, the rest continue and the game doesn't crash. Log the error but don't let it kill the transition.

---

## Implementation Order

1. **Fix 3** (scout points reset) — smallest change, one line in `set()` call
2. **Fix 4** (approval tuning) — small change in approval.ts
3. **Fix 1** (wire updateApprovalForMove) — medium change across 3 functions
4. **Fix 2** (firing consequence) — needs new type + UI + store logic
5. **Fix 5** (free agency crash) — needs debugging first
