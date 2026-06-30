# BS Hoops — Round 2 Feedback (post-changes)

**Date:** June 20, 2026
**Method:** Re-tested the live site (bs-basketball.com) against the round-1 desktop + mobile critiques, then read the diffs in the repo.

---

## Verified shipped — these are working ✅

| Round-1 finding | Commit | Live result |
|---|---|---|
| First-run "Something went wrong" error for empty state | #271 (EPIC-A) | Gone. Clean load, errors clear on nav. |
| No feedback when you draft a pick | #272 (EPIC-F) | Toast fires: "🏀🎉 Drafted Bilal Fournier (C) · pick #1", results table updates instantly. |
| Stale / mismatched top-bar CTA ("Trim Roster to 15" everywhere; "Draft" vs "Pick your team") | #273 (EPIC-G) | CTA now reads "Re-sign 8 Players"; labels are contextual. |
| Standings: no clinch indicators; LA duplication | #274 (EPIC-H) | Added z/y/x/e clinch marks **with a legend**; LA teams now show distinct nicknames. |
| Stats leaderboard wasted horizontal space | #274 / #268 | Each row now shows a full line (PPG/RPG/APG · MP · GP) + avatar. |
| Re-sign hid cost & willingness on mobile | #276 (MOBILE-1b) | On phone the cost reflows under the name and the stance chip is always shown. Exactly the fix. |
| Roster didn't signal expiring players during re-sign | #275 (BUG-24) | Expiring players are tinted on /roster. |

Also nice since last time: the home dashboard is genuinely rich now — the "you were fired → pick your next job" market (core/cap/picks/young per opening), League News, and the Team Spotlight podcast. Dashboard Team Stats confirm the league-rank context (PPG · 25th, etc.). The standalone game box score is detailed and clean (Q-by-Q, game leaders, full MIN/PTS/FG/3P/FT/REB/AST, "biggest lead · possessions · pace").

---

## Still open / new — round 2

### 1. 🔴 Correcting my earlier "Re-sign All froze the page" — it's `window.confirm()`

My round-1 review called the Re-sign All freeze a performance bug. Reading the code, the real cause is `resignAll()` (`app/re-sign/page.tsx:106`) opening a native **`window.confirm()`** before its loop. That native dialog blocks the page thread — which is what "froze" my automated browser (it can't dismiss the OS dialog). A real user isn't hard-frozen; they get a clunky native prompt. Two things to fix:

- **Replace `window.confirm()` with your in-app Modal.** It's used in three spots — `resignAll`, `letAllWalk`, and `letWalk` for ≥78 OVR players (lines 101, 106, 113). Native confirms are un-styled, inconsistent with the rest of the app, and on some mobile browsers behave oddly. You already have a great `Modal` component — route these through it.
- **Batch the writes.** `resignAll` does `for (const p of active) await store.extendPlayer(...)` — N sequential awaits, each likely recomputing/persisting league state. With a full class that's a visible stall. Prefer one transaction that re-signs all, then a single state update + one toast ("Re-signed 8 players").

### 2. 🟠 Watch Live court is unchanged — still the top open visual item

Nothing in this batch touched `LiveViewer.tsx`, so the round-1 points stand: the `CourtCanvas` (viewBox 200×70) still reads as an abstract rink, not a basketball court (no arc, no real hoops, empty paint rectangles), and the backdrop is `rgba(8,12,20,0.96)` (bump to fully opaque to kill the last of the desktop bleed-through). This is still the highest-value visual upgrade left — either draw a real, marked half-court or drop the court and give that space to the (genuinely good) play-by-play.

### 3. 🟠 Home "you were fired" state has competing CTAs

After being fired, the home screen shows all of these at once: the five job-opening cards, a "2030 Draft is on the clock → Continue Draft" banner, and an "Enter League" button. If the user has no team, "continue the draft" and "enter league" are ambiguous — whose draft, which team? Sequence it: make taking a job the single required action first, *then* surface the draft/season CTAs once they have a team. Right now three different "primary" paths compete for the same click.

### 4. 🟡 League name vs season reads as a contradiction

The big title "**BS Hoops 2026**" (the league name, fixed at creation) sits directly above "Season 2029 · Draft" and next to a "2030 Draft" banner. The prominent "2026" looks like a season and contradicts "2029". Either restyle the league name so it doesn't read as a year, or lead with the current season/phase and demote the league name to a smaller label.

### 5. 🟡 Carry-over from the mobile pass (not in this batch)

Still worth doing when you get to mobile tables: the **Roster** table (`min-w-[52rem]`, 832px side-scroll, no sticky column) and the **FA pool** table (9 columns) are the two weakest mobile screens. The patterns to copy already exist in your codebase — Standings' dedicated mobile layout, Stats' progressive column hiding, and the FA offer **bottom sheet** (which is genuinely well done).

---

## Suggested next order

1. Swap `window.confirm()` → in-app Modal on the three re-sign/walk actions, and batch the re-sign writes. (small, removes the "freeze")
2. Watch Live court rebuild-or-remove + opaque backdrop. (highest visual payoff)
3. Resolve the fired-home competing-CTA sequencing + the league-name/season label.
4. Roster + FA mobile tables.

Strong progress — the onboarding, draft feedback, standings/stats, and re-sign mobile are all clearly better. The remaining items are smaller and more contained than round 1.
