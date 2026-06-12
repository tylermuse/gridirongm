# BS Basketball — Improvements Spec

Last updated: 2026-06-12
Status legend: ☐ open · ◐ in progress / partial · ☑ shipped

## Bugs

### ☑ BUG-1: Wonky offseason order of operations after draft completes
> **Shipped** (branch `fix/bs-hoops-mobile-resign-and-fa`). Draft-complete now shows a single ordered CTA (Re-sign → Free Agency → Start Season) via `OffseasonStepper` + `nextAction.ts`.
- **Where:** Draft page, post-draft state / offseason flow
- **Repro:** Complete the draft. Page offers "Start 2026 Season" (top bar) and "Sign Free Agents →".
- **Expected:** The next logical step after the draft is re-signing your own players, then free agency, then season start. The primary CTA should guide you through that order.
- **Actual:** Re-sign step is skipped/not offered; both "Start 2026 Season" and "Sign Free Agents" are presented simultaneously, making the intended sequence unclear.
- **Priority:** P0

### ☑ BUG-2: "Let Walk" doesn't free cap space
> **Shipped.** `letWalk()` → `releasePlayer()` removes the player from the roster; `resignProjection()` recomputes cap live, so walking frees space.
- **Where:** Re-sign window (Re-signing Window page)
- **Repro:** In the re-sign window, click "Let Walk" on players with large salaries (e.g. Khris Middleton + Klay Thompson, ~$40–50M combined).
- **Expected:** Walked players come off the roster and their salary comes off the books — cap space increases accordingly.
- **Actual:** Cap space doesn't increase. In one observed session, after letting several players walk, projected cap space actually *dropped* ($20.3M → $11.1M) and committed payroll *rose* ($129.5M → $138.7M).
- **Priority:** P0

### ☑ BUG-3: Players who were "Let Walk" reappear in the Cuts stage
> **Shipped.** Separate post-draft-cuts page removed; cuts folded into the Re-sign window's "Finalize Roster" trim list, which reads from `playerIds`, so walked players are already gone.
- **Where:** Offseason flow — Cuts stage (Final Cuts list), immediately after Re-sign
- **Repro:** Let players walk in the Re-sign window (e.g. Khris Middleton, Dwight Powell, Brandon Williams, John Poulakidas, Tyler Smith), then continue to Roster Cuts.
- **Expected:** Walked players are already off the roster and don't appear in Final Cuts.
- **Actual:** The same players show up in the cut list and must be cut a second time.
- **Note:** Likely shares a root cause with BUG-2 — "Let Walk" doesn't actually remove the player from the roster/books.
- **Priority:** P0

### ☑ BUG-4: 15-man roster limit not actually enforced
> **Shipped** (resolved via the design alternative below). Cuts is no longer a separate stage — `startNextSeason()` hard-blocks with a "Trim your roster to 15" error and the Re-sign "Start Season" button is disabled while `over > 0`. **Design question resolved:** folded into a hard gate, not a separate stage. _(Confirm with TYLER this is the desired model.)_
- **Where:** Cuts stage / season start validation
- **Repro:** Carry more than 15 players into a new season.
- **Expected:** Final Cuts says "Trim to 15 before the season" — this should be a hard requirement to start the season.
- **Actual:** Seasons can be played with 15+ players; the cut requirement is soft/ignorable.
- **Design question (resolve with TYLER):** Does Cuts need to be its own stage at all? Alternative: fold it into a hard validation gate on "Start Season" (block until roster ≤ 15), rather than a separate step in the flow.
- **Priority:** P1

### ☑ BUG-5: Lineup warning shows raw player ID instead of name
> **Fixed (display).** Added a `humanizeWarning` helper in the roster page that resolves the warning's player id to "First Last" (and scrubs any other embedded ids) before display, so the warning now reads "Fred VanVleet is a PG starting at SG." Engine untouched.
- **Where:** Roster & Lineup page, lineup validation warning below the table
- **Repro:** Start a player out of position (e.g. a PG in the SG slot).
- **Expected:** Warning uses the player's name, e.g. "Fred VanVleet is a PG starting at SG."
- **Actual:** Shows internal ID: "⚠ player-105 listed as PG starting at SG."
- **Priority:** P2

### ☑ BUG-6: AI teams make no offseason moves
> **Fixed.** Root cause: the bid/competition gate required real cap room, but almost every roster is over the cap, so no one ever qualified → "No competing interest" for everyone. Added `signingBudget()` granting over-cap teams an MLE-style exception (scaled past the tax/apron, hard-stopped at the second apron, minimum floor for all). `bestCompetingOffer` + `runAiFreeAgency` now use it, and `bestCompetingOffer` also models full-roster contenders waiving their weakest player for a clear upgrade — so the displayed Competition matches who would actually sign. Each user signing now advances the FA day and runs a rival round, so the market visibly moves and players get signed away (AI signings already log to League News). Regression tests added (budget + competing-interest); full FA/season/draft suites green.
- **Where:** Offseason sim — AI team logic (free agency, re-signs, trades)
- **Repro:** Go through the offseason and advance free agency days; check League News > Transactions.
- **Expected:** AI teams re-sign their players, sign free agents (competing with the user for them), and make trades. The transaction log should be full of league-wide moves.
- **Actual:** The user's team is the only one making moves. Free agents never get signed away by AI teams. (Consistent with FA player cards always showing "Competition: No competing interest.")
- **Priority:** P0

### ☑ BUG-7: "Start the Season" auto-simulates the first game
> **Fixed.** Added a `seasonStarted` flag + `beginRegularSeason()` store action. "Start the Season" now closes the FA window and marks the season underway **without** simming Day 1; `nextAction` then surfaces Day 1 (unplayed) with a Sim Day CTA. The button no longer calls `simDay()`. Typecheck + lint clean.
- **Where:** Free Agency phase → "Start the Season →" button
- **Repro:** Click "Start the Season" from the Free Agency page.
- **Expected:** Land on Day 1 with the first game unplayed, so you can set your lineup/game plan and play or sim it yourself.
- **Actual:** Game 1 is simulated automatically (arrived at home screen already 0–1, L 116–123 @ IND, without ever seeing Day 1).
- **Priority:** P0

### ☑ BUG-8: Trade value model badly undervalues productive veteran stars
> **Fixed (engine).** Added a **production floor** to `basketballTradeValue`: a player's value can't fall below what his recent box output (PPG/RPG/APG from `seasonLog`, convex) is worth to a contender — age-neutral, so a 21-PPG 34-yo is no longer crushed by the age curve. Result: a Kyrie-like vet now values ~840 (was ~324) — above a raw teenager and a real first-round pick. Also added a **Win-Now vet premium**: the evaluator tracks `vetValue` (age ≥ 28) and win-now teams tolerate paying more for proven vets. Regression tests added; fixed the stale `basketball-tradeeval` "Cap violation" assertion to match the engine's actual (better) wording. Typecheck + trade suites green.
- **Where:** Trade > Propose Trade — player value points (PTS column)
- **Example:** Kyrie Irving (81 OVR, ~21 PPG, age 34, $39.5M × 2y) valued at ~324 pts — *less* than a 69 OVR teenager (Keaton Wagler, ~392) and less than Minnesota's own '27 R1 (434). A win-now team like MIN should realistically give up a 1st-rounder for a productive star vet.
- **Likely causes:** age/salary penalties swamp everything; current production (PPG etc.) appears to have little or no weight; the *receiving team's* timeline (Win Now vs. rebuilding) doesn't adjust how they value vets.
- **Expected behavior:** value = blend of OVR, current production, age, and contract — then adjusted by the trade partner's competitive window (win-now teams pay premiums for proven vets, rebuilders discount them).
- **Priority:** P1

### ☑ BUG-9: Draft pick protections not honored
> **Fixed — full system built.** New `PickProtection` model + `pickProtections` registry. Authorable in the Trade builder per round-1 pick (top-1/3/5/10/lottery, roll length, then becomes-a-2nd / expires). `resolveProtectedPicks()` settles every obligation at draft setup against the known order: conveys outside protection, reverts + rolls forward inside it, expires/converts at the final year. Wired into `enterOffseason`, re-slots the draft, and logs each conveyance to League News (`pick` transaction kind). Protections surface on pick chips/labels in Trade/Draft UIs. Conveyance logic unit-tested (4 scenarios pass); typecheck + lint clean.
- **Where:** Draft lottery / pick ownership resolution
- **Repro:** Dallas traded its 2027 R1 to Charlotte, top-2 protected. In the lottery Dallas landed at pick 5 — outside the protection.
- **Expected:** Pick conveys to Charlotte (protection only applies if it lands top-2). Charlotte picks 5th with Dallas's pick.
- **Actual:** The pick stays with Dallas — protection logic isn't being applied at conveyance time.
- **Also check:** what happens when the protection *does* hit (pick stays + obligation rolls to next year or converts per terms), and that pick ownership shown in Trade/Draft UIs reflects protections.
- **Priority:** P0

### ☑ BUG-10: Rookies have unrealistically low impact in their rookie season
> **Fixed (engine).** Root cause: draft classes generated top picks at ~68 OVR — far below the 75+ veterans — so the OVR-driven rotation buried them. Retuned `generateBasketballDraftClass`: R1 now runs 75→63 (was 68→58), R2 62→50, cap raised to 80. Top picks now crack rotations. Verified end-to-end: simmed a full rookie season and the best rookie posts **~18 PPG** (was ~5-8). New regression test `basketball-rookie-impact.test.ts` (full season sim) + draft/dev suites green.
- **Where:** Game sim — rookie minutes/production
- **Observed:** The Rookie of the Year is averaging ~5–8 PPG (e.g. ROY AJ Dybantsa at 5.6 PPG / 1.8 RPG / 1.6 APG). In a realistic league, the ROY typically averages ~15–20+ PPG, and several rookies are meaningful contributors.
- **Likely causes:** rookies enter with low OVR relative to the league and/or AI lineups give them too few minutes; possibly rookie OVRs at draft (60s–70s) are fine but minutes allocation buries them.
- **Expected:** Top-5 picks land in the realistic range — meaningful minutes, ROY around 15–20 PPG in a normal year.
- **Related:** FEAT-14 (scouting/potential model) — rookie ratings and development curves probably need tuning together.
- **Priority:** P1

## Features

### ☑ FEAT-1: Trade current-year (2026) draft picks in the Trade section
> **Shipped.** `pickWindow()` now includes the in-progress draft season alongside future picks, so current-year picks are tradeable from the main Trade center.
- **Where:** Trade > Propose Trade — Draft Picks list (both sides of the offer)
- **Current:** Pick assets start at '27 R1/R2. The only way to trade current-year picks is the "Trade Pick" button inside the Draft view, and only when a team is on the clock.
- **What:** Include 2026 picks as tradeable assets in the Trade section, alongside the future picks.
- **Details:**
  - Show the actual pick number for current-year picks once draft order is known (e.g. "'26 R1 — Pick #3").
  - Current-year picks are tradeable year-round, including before draft order is set.
  - Once a pick has been made, it's no longer tradeable as a pick — it converts to the drafted player.
- **Priority:** P1

### ☑ FEAT-2: "Go to Draft" button in top bar during draft phase
> **Shipped.** `nextAction.ts` adds a "Go to Draft" secondary action during the draft phase (hidden when already on `/draft`).
- **Where:** Top bar (where Sim to My Pick / Sim One Pick / Auto Draft All live)
- **What:** During the draft phase, add a "Go to Draft" button so you can quickly navigate back to the draft page after navigating elsewhere (e.g. checking roster or trades mid-draft).
- **Priority:** P2

### ☑ FEAT-3: Show draft recap content on draft completion
> **Shipped.** `DraftRecapInline` now renders compact "Biggest Steals" / "Biggest Reaches" sections (top 3 each) above Team Grades on the draft-complete state, using the same `buildDraftRecap` accessors as the `/draft-recap` page.
- **Where:** Draft page, "Draft Complete!" state
- **What:** When the draft finishes, surface the Draft Recap content (Team Grades, Biggest Steals, etc.) at the top of the page instead of just a "Draft Complete!" banner with a separate Draft Recap link.
- **Priority:** P1

### ☑ FEAT-4: Live cap space tracker in the re-sign window
> **Shipped.** Re-sign header cap tiles recompute from `resignProjection()` on every render and recolor per decision.
- **Where:** Re-sign window, header stat cards
- **What:** Show total *current* available cap space before any re-sign decisions, and update it live as each player is re-signed or let walk. Current cards (Projected 2027 Cap Space, Committed Payroll, Room If All Re-signed) don't clearly show "here's what I have to spend right now" or react per-decision.
- **Depends on:** BUG-2 — cap math must be correct for the live tracker to be trustworthy.
- **Priority:** P1

### ☑ FEAT-5: Roster needs / recommendations in Free Agency
> **Shipped.** `RosterNeeds` component in the FA header flags count gaps (thin/shallow) and quality gaps (best OVR < 75).
- **Where:** Free Agency page, header area
- **What:** Show what the team needs at the top of Free Agency so you don't have to flip back to Roster & Lineup. Two kinds of needs:
  - **Count gaps:** positions where you're thin (e.g. only 1 SF).
  - **Quality gaps:** positions with enough bodies but low ratings (e.g. 4 PGs, all sub-72 OVR — flag as "needs upgrade").
- **Notes:** The Re-sign window already has a "Roster After Decisions" position-count bar, and the draft view shows a per-team "NEEDS" chip — reuse/extend that logic here. Could also drive a "fits your needs" badge or filter on the FA list.
- **Priority:** P1

### ☑ FEAT-6: Show roster count vs. 15-man max on the Roster page
> **Shipped.** Added a "Roster N/15" indicator to the roster-page header meta row, matching the Free Agency "roster X/15" treatment.
- **Where:** Roster & Lineup page, header (next to payroll/cap room)
- **What:** Display total roster count against the max, e.g. "Roster 11/15". The header shows position counts (PG 3 · SG 2 · ...) and payroll, but no total vs. limit — you have to count manually. Free Agency already shows "roster 12/15"; use the same treatment here.
- **Related:** BUG-4 (15-man limit enforcement).
- **Priority:** P2

### ☑ FEAT-7: Scheme-fit dots on roster are unclear/inconsistent
> **Shipped.** Every player now renders a dot including neutral (muted amber matching the legend); the `fit.delta !== 0` guard was removed and the tooltip preserved.
- **Where:** Roster & Lineup page, dot next to player names
- **What:** Some players have a colored dot, some have none. These appear to be the scheme-fit indicators (legend: great/good/neutral/poor), but it's not obvious — "neutral" seems to render as no dot at all, which reads as a glitch rather than a rating.
- **Fix:**
  - Render a dot for every player (including neutral) so the column is consistent.
  - Add a tooltip on hover ("Scheme fit: great") and/or put the dot in its own labeled column.
- **Priority:** P2

### ☑ FEAT-8: Show previous-season stats for free agents
> **Shipped.** `FreeAgentTable` has a sortable "Last" column + expanded `FaIntel` panel reading `seasonLog` for PPG/RPG/APG.
- **Where:** Free Agency page — expanded player row (clicking a player's name)
- **What:** There's no way to see a free agent's stats from the previous season. The expanded card shows OVR/POT/age/ask, and the "LAST" column is just "—" for everyone. Add last-season stat line (PPG/RPG/APG, GP) to the expanded card, and/or link the player name to their full profile page.
- **Priority:** P1

### ☑ FEAT-9: Explain "Bird Rights" (and verify it does anything)
> **Shipped — implemented (not removed).** Added an explanatory tooltip on the Bird Rights field. Made it mechanically real: a free agent's former team (holding full/early Bird rights) now actively competes to re-sign him **even when capped out** (`bestCompetingOffer` gives the `lastTeamId` a strong re-sign edge + over-cap exception). So a Bird free agent is genuinely harder to pry away, and the "Competition" field reflects it.
- **Where:** Free Agency — expanded player card, "Bird Rights" field
- **What:** "Bird Rights: None" is shown with no explanation of what it means or what the player should do with the information.
- **Fix:**
  - Add a tooltip/info icon: e.g. "Bird rights let a team exceed the cap to re-sign its own player (3+ seasons on roster)."
  - **Verify:** does the game actually simulate this (cap exception on re-signs)? If not, either implement it or remove the field — showing a dead stat is worse than not showing it.
- **Priority:** P2

### ☑ FEAT-10: Signing a free agent advances the offseason one day
> **Shipped** (with BUG-6). `signFreeAgent`/`negotiateFreeAgent` now call `advanceMarketAfterSigning`: during the preseason window a successful signing bumps `faDay` by one and runs a CPU FA round (no-op once the season is underway). Prevents Day-0 unlimited signing and makes the market progress per move.
- **Where:** Free Agency page (Day X of 30)
- **What:** Completing a free-agent signing should advance the offseason clock by one day, instead of only advancing via Skip Day / Skip Week.
- **Why:** Makes signings feel like they take time and prevents signing unlimited players on Day 0 with no market progression.
- **Priority:** P1

### ☑ FEAT-11: Show roster scheme fit for coaching candidates before hiring
> **Shipped.** Each coaching-market candidate now shows a roster-fit summary (`N great · N good · N neutral · N poor`) computed with the same `schemeFit` reduction as the current-coach card, against the user's roster for that candidate's scheme.
- **Where:** Staff page — Coaching market list
- **What:** Candidates show their scheme (Five-Out, Triangle, Flow, Princeton) and OFF/DEF/DEV ratings, but there's no way to see how that scheme aligns with your current players before hiring.
- **Fix:** Show a projected roster-fit summary per candidate — same format as the current coach's card (e.g. "4 great · 1 good · 4 neutral · 5 poor"), computed against your roster for *their* scheme. A hover/expand is fine.
- **Priority:** P1

### ☑ FEAT-12: Richer "Seeking in Return" options on the Trading Block
> **Shipped.** The Trading Block "Seeking" selector now offers the 5 positions **plus** 10 asset/archetype tags (picks, young, expiring, shooter, rebounder, interior defender, perimeter defender, playmaker, rim protector, scorer), multi-select. A new `dealMatchesTag` predicate filters returned proposals against the incoming side using real rating fields, contract years (expiring), age (young), and pick presence — so selections visibly shape results.
- **Where:** Trade > Trading Block — "Seeking in Return" selector
- **What:** Currently only the 5 positions (PG/SG/SF/PF/C). Expand to match what GMs actually seek in trades:
  - **Assets:** draft picks (1sts/2nds), young prospects, expiring contracts / cap relief
  - **Archetypes:** shooter, rebounder, interior defender, perimeter defender, playmaker, rim protector, scorer
- **Notes:** Selections should shape the AI proposals that come back from "Ask for Proposals." Multi-select.
- **Priority:** P1

### ☑ FEAT-13: Condense the Awards page cards
> **Shipped.** Award cards densified — `Shell` padding `p-4→p-3`, smaller emoji/heading/avatar, winner name/team + stat line on one row, finalists on a single compact line. No data removed.
- **Where:** Awards page (Season Awards grid)
- **What:** Award cards are too tall and eat vertical space. Condense the height — e.g. winner name/team/position and stat line on one or two rows, smaller avatar, finalists inline. Goal: all awards visible with little or no scrolling.
- **Priority:** P2

### ☑ FEAT-14: Scouting should uncover gems and busts, not just confirm rankings
> **Shipped.** `perceivedPotential()` produces a noisy public estimate; true `development.potential` is hidden; `revealedPotential()` exposes the truth once scouted, so scouting surfaces gems/busts. Draft recap grades steals/reaches off true ceiling. _(If you want live in-draft "gem/bust revealed" feedback while scouting, that's a follow-up.)_
- **Where:** Draft Board — scouting system (Scout pts / Auto-scout)
- **Current:** Scouting a player basically verifies a potential that already lines up with their draft ranking. No surprises, so scouting feels pointless.
- **What:** Make scouting reveal *deviations* from public consensus:
  - Each prospect has a hidden true potential; the public board shows a noisy estimate with a wide range (e.g. 68–84).
  - Scouting narrows the range toward the true value — sometimes revealing a gem (true POT well above ranking) or a bust (well below).
  - Scout quality (staff DEV/scouting rating) could affect accuracy/how much noise remains.
- **Why:** Creates the payoff loop scouting exists for — finding steals late and avoiding busts early.
- **Priority:** P1

### ☑ FEAT-15: Player quick-view modal should lead with stats, not just attributes
> **Shipped.** PlayerModal now leads with a stats panel above the attribute bars: a "This season" line (PPG/RPG/APG, FG%/3P%, GP·MPG via `regularSeasonStatsByPlayer`) and a "Last season" comparison line from `seasonLog`.
- **Where:** Player quick-view modal (clicking a player's name anywhere)
- **Current:** Modal shows only attribute bars (Shooting/Playmaking/Defense/Athletic/Mental). No stats at all.
- **What:** Add the player's stats to the modal, above or alongside attributes: current-season line (PPG/RPG/APG, FG%/3P%, GP/MPG) and last-season line for comparison. Stats are what's top of mind when clicking a player.
- **Related:** FEAT-8 (same gap in Free Agency).
- **Priority:** P1

### ☑ FEAT-16: Show OVR/POT progression over time
> **Shipped.** Added an inline OVR trend indicator (`72 ▲ +3` green / `▼ -2` red, from `ratings.overall - prevRatings.overall`) in the PlayerModal, the player-page header, **and** the roster table. The player page also gains an OVR sparkline from `seasonLog`, and the dev-trajectory tag is surfaced. (POT history snapshots remain a future enhancement — noted, not blocking.)
- **Where:** Player modal / full player page; optionally Roster list
- **Current:** No indication anywhere of whether a player's OVR or POT is rising or falling.
- **What:**
  - Track OVR/POT history (e.g. monthly or season snapshots).
  - Show a trend indicator next to OVR (e.g. "72 ▲ +3 this season") in the modal and roster.
  - Show a small development graph on the full player page.
  - The "PLATEAU" tag exists, suggesting a development state is already modeled — surface the underlying trajectory.
- **Priority:** P1

### ☑ FEAT-17: Team pages should show the full roster with stats
> **Shipped.** The team-page roster table now adds sortable season **stat** columns (GP/PPG/RPG/APG via `regularSeasonStatsByPlayer`) alongside the existing ratings columns; 0-games shows `—`.
- **Where:** Team page (clicking any team name)
- **Current:** Shows team stats, recent activity, and recent games — but not the roster.
- **What:** Show the same roster table you get on your own Roster & Lineup page (players, POS, AGE, OVR, contract, season stats), read-only. That's the main thing you want when looking at another team — who they have and how they're playing.
- **Priority:** P1

### ☑ FEAT-18: Player pages are missing trade-relevant info (stats, health, contract)
> **Shipped.** Added a health/injury badge to the player-page header (green "Healthy" or red "Out: <part> · returns day N") via `getInjuries`; contract + current-season stat line were already present. **Stats-bug investigated:** `regularSeasonStatsByPlayer` iterates *all* teams' box scores with no user-team filter (seasonStats.ts:28-34) — so "No season stats yet" for an other-team starter is genuine (no played regular-season games yet, e.g. just-acquired/injured), not a filtering bug.
- **Where:** Full player page (e.g. Desmond Bane, Orlando)
- **Current:** When evaluating a player on another team you can't answer the basic trade questions: What is he putting up this year? Is he healthy? What's his contract (salary, years left)?
- **Fix:** Add to the player page header area: contract details (salary × years), health/injury status, and current-season stat line.
- **Possible bug to verify:** The Statistics section showed "No season stats yet — sim some games" for a starter at Day 116 of the season (Orlando was 15–41). Either other teams' player stats aren't being logged, or the page can't find them — investigate while in there.
- **Priority:** P1

### ☑ FEAT-19: "Trade for this player" button on player profiles
> **Shipped.** Added a "Trade for this player" button to both the player page and the PlayerModal (shown only for players not on the user's team). It routes to `/trade?target=<teamId>&getPlayer=<playerId>`; the Trade builder reads those query params on mount and pre-selects the target team with the player on the receive side.
- **Where:** Full player page + quick-view modal, for any player not on the user's roster
- **What:** Add a "Trade for this player" button that jumps to Trade > Propose Trade with that player's team selected and the player pre-checked on the receive side.
- **Priority:** P1

## Needs clarification

<!-- Items I couldn't fully structure from the brain-dump -->
