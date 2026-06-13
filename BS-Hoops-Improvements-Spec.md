# BS Basketball — Improvements Spec

Last updated: 2026-06-12
Status legend: ☐ open · ◐ in progress · ☑ shipped

## Bugs

### ☑ BUG-1: Wonky offseason order of operations after draft completes
- **Where:** Draft page, post-draft state / offseason flow
- **Repro:** Complete the draft. Page offers "Start 2026 Season" (top bar) and "Sign Free Agents →".
- **Expected:** The next logical step after the draft is re-signing your own players, then free agency, then season start. The primary CTA should guide you through that order.
- **Actual:** Re-sign step is skipped/not offered; both "Start 2026 Season" and "Sign Free Agents" are presented simultaneously, making the intended sequence unclear.
- **Priority:** P0

### ☑ BUG-2: "Let Walk" doesn't free cap space
- **Where:** Re-sign window (Re-signing Window page)
- **Repro:** In the re-sign window, click "Let Walk" on players with large salaries (e.g. Khris Middleton + Klay Thompson, ~$40–50M combined).
- **Expected:** Walked players come off the roster and their salary comes off the books — cap space increases accordingly.
- **Actual:** Cap space doesn't increase. In one observed session, after letting several players walk, projected cap space actually *dropped* ($20.3M → $11.1M) and committed payroll *rose* ($129.5M → $138.7M).
- **Priority:** P0

### ☑ BUG-3: Players who were "Let Walk" reappear in the Cuts stage
- **Where:** Offseason flow — Cuts stage (Final Cuts list), immediately after Re-sign
- **Repro:** Let players walk in the Re-sign window (e.g. Khris Middleton, Dwight Powell, Brandon Williams, John Poulakidas, Tyler Smith), then continue to Roster Cuts.
- **Expected:** Walked players are already off the roster and don't appear in Final Cuts.
- **Actual:** The same players show up in the cut list and must be cut a second time.
- **Note:** Likely shares a root cause with BUG-2 — "Let Walk" doesn't actually remove the player from the roster/books.
- **Priority:** P0

### ☑ BUG-4: 15-man roster limit not actually enforced
- **Where:** Cuts stage / season start validation
- **Repro:** Carry more than 15 players into a new season.
- **Expected:** Final Cuts says "Trim to 15 before the season" — this should be a hard requirement to start the season.
- **Actual:** Seasons can be played with 15+ players; the cut requirement is soft/ignorable.
- **Design question (resolve with TYLER):** Does Cuts need to be its own stage at all? Alternative: fold it into a hard validation gate on "Start Season" (block until roster ≤ 15), rather than a separate step in the flow.
- **Priority:** P1

### ☑ BUG-5: Lineup warning shows raw player ID instead of name
- **Where:** Roster & Lineup page, lineup validation warning below the table
- **Repro:** Start a player out of position (e.g. a PG in the SG slot).
- **Expected:** Warning uses the player's name, e.g. "Fred VanVleet is a PG starting at SG."
- **Actual:** Shows internal ID: "⚠ player-105 listed as PG starting at SG."
- **Priority:** P2

### ☑ BUG-6: AI teams make no offseason moves
- **Where:** Offseason sim — AI team logic (free agency, re-signs, trades)
- **Repro:** Go through the offseason and advance free agency days; check League News > Transactions.
- **Expected:** AI teams re-sign their players, sign free agents (competing with the user for them), and make trades. The transaction log should be full of league-wide moves.
- **Actual:** The user's team is the only one making moves. Free agents never get signed away by AI teams. (Consistent with FA player cards always showing "Competition: No competing interest.")
- **Priority:** P0

### ☑ BUG-7: "Start the Season" auto-simulates the first game
- **Where:** Free Agency phase → "Start the Season →" button
- **Repro:** Click "Start the Season" from the Free Agency page.
- **Expected:** Land on Day 1 with the first game unplayed, so you can set your lineup/game plan and play or sim it yourself.
- **Actual:** Game 1 is simulated automatically (arrived at home screen already 0–1, L 116–123 @ IND, without ever seeing Day 1).
- **Priority:** P0

### ☑ BUG-8: Trade value model badly undervalues productive veteran stars
- **Where:** Trade > Propose Trade — player value points (PTS column)
- **Example:** Kyrie Irving (81 OVR, ~21 PPG, age 34, $39.5M × 2y) valued at ~324 pts — *less* than a 69 OVR teenager (Keaton Wagler, ~392) and less than Minnesota's own '27 R1 (434). A win-now team like MIN should realistically give up a 1st-rounder for a productive star vet.
- **Likely causes:** age/salary penalties swamp everything; current production (PPG etc.) appears to have little or no weight; the *receiving team's* timeline (Win Now vs. rebuilding) doesn't adjust how they value vets.
- **Expected behavior:** value = blend of OVR, current production, age, and contract — then adjusted by the trade partner's competitive window (win-now teams pay premiums for proven vets, rebuilders discount them).
- **Priority:** P1

### ☑ BUG-9: Draft pick protections not honored
- **Where:** Draft lottery / pick ownership resolution
- **Repro:** Dallas traded its 2027 R1 to Charlotte, top-2 protected. In the lottery Dallas landed at pick 5 — outside the protection.
- **Expected:** Pick conveys to Charlotte (protection only applies if it lands top-2). Charlotte picks 5th with Dallas's pick.
- **Actual:** The pick stays with Dallas — protection logic isn't being applied at conveyance time.
- **Also check:** what happens when the protection *does* hit (pick stays + obligation rolls to next year or converts per terms), and that pick ownership shown in Trade/Draft UIs reflects protections.
- **Priority:** P0

### ☑ BUG-10: Rookies have unrealistically low impact in their rookie season
- **Where:** Game sim — rookie minutes/production
- **Observed:** The Rookie of the Year is averaging ~5–8 PPG (e.g. ROY AJ Dybantsa at 5.6 PPG / 1.8 RPG / 1.6 APG). In a realistic league, the ROY typically averages ~15–20+ PPG, and several rookies are meaningful contributors.
- **Likely causes:** rookies enter with low OVR relative to the league and/or AI lineups give them too few minutes; possibly rookie OVRs at draft (60s–70s) are fine but minutes allocation buries them.
- **Additional evidence (S2026 All-Rookie First Team):** AI-team rookies averaged 5.2 / 4.7 / 4.9 PPG, while the user's two rookies (user-controlled minutes) averaged 11.7 and 9.0 — strongly suggests AI minutes allocation for rookies is the root cause, not rookie ratings.
- **Update after fix:** Much improved — All-Rookie First Team now 9.7–14.4 PPG including AI rookies. Remaining issue: steep cliff to the Second Team (all ~6 PPG; realistically ~9–12). One more tuning pass on rookie depth beyond the top ~5.
- **Expected:** Top-5 picks land in the realistic range — meaningful minutes, ROY around 15–20 PPG in a normal year.
- **Related:** FEAT-14 (scouting/potential model) — rookie ratings and development curves probably need tuning together.
- **Priority:** P1

### ☑ BUG-11: After a starter/bench swap, both players get starting minutes
- **Where:** Roster & Lineup — minutes allocation after lineup changes
- **Repro:** Swap a bench player into the starting lineup (e.g. Collin Sexton in for Darryn Peterson at SG), save, sim games.
- **Expected:** The new starter gets starter minutes; the benched player gets bench minutes.
- **Actual:** Both play starter-level minutes (observed: Sexton 35.2 MP while listed on bench, Peterson 31.2 MP as starter).
- **Priority:** P0

### ☑ BUG-12: Post-draft CTA still says "Start 2026 Season" instead of "Re-sign Players"
- **Where:** Draft page after completion + top bar
- **Repro:** Complete the draft (draft recap now shows correctly).
- **Expected:** Primary CTA leads to the next offseason step: "Re-sign Players →" (per the Draft → Re-sign → Cuts → Free Agency flow).
- **Actual:** Buttons say "Start 2026 Season", skipping ahead in the flow.
- **Related:** Follow-up to BUG-1 — the recap (FEAT-3) shipped but the CTA sequencing didn't fully change.
- **Priority:** P1

### ☑ BUG-13: League is too easy — user reaches 65+ wins in most saves
- **Where:** Sim engine / AI team management (league balance)
- **Observed:** Across most saves, the user's team easily becomes a 65+ win juggernaut. A well-run team should contend, but 65+ wins should be rare, not routine.
- **Investigate (likely compounding causes):**
  - AI offseason activity (BUG-6 follow-up): verify AI teams are actually competing for free agents now — it's still unclear in-game whether they sign anyone. If the user gets first pick of every FA, dominance follows.
  - AI lineup/rotation quality (see BUG-10 evidence — AI misallocates minutes).
  - Trade AI accepting lopsided deals (BUG-8).
  - User team development/morale bonuses outpacing AI teams.
- **Goal:** League where AI contenders also win 55–65 games and the FA market is genuinely competitive.
- **Priority:** P0

### ◐ BUG-14: Redundant double-click to start a league from a roster file
> **Investigated — needs live repro.** The `/rosters` flow is already single-click to Pick Your Team in code (`startFromUrl` → import → team picker); the perceived double is the home→catalog navigation, which is intentional (the catalog lets you choose a roster source / upload a file). The reported second "Start a league" click may be a transient roster-fetch/cache miss (see the `CACHE_BUST` mechanism). Deferred pending a reproducible case.
- **Where:** Rosters page → new league flow
- **Repro:** On /rosters, click "Start a league with this roster."
- **Expected:** Go straight to "Pick your team."
- **Actual:** Lands on an intermediate page where you must click "Start a league with this roster" a second time before reaching team selection.
- **Fix:** Remove the middle step — first click goes directly to Pick Your Team.
- **Priority:** P2

### ☑ BUG-15: Player development outcomes are identical across saves (Keaton Wagler always busts)
> **Fixed.** Two root causes: (1) **determinism** — development RNG was seeded by `player.id + season` only, so the same player replayed an identical boom/bust every save; now seeded with the save (`league.id`, a fresh uuid per save) so a 90-POT pick can hit in one save and bust in another. (2) **POT/OVR collapse** — `updatePotential` snapped a prospect's ceiling to `overall+~10` on the first tick (nuking 90-POT picks to ~80); now the ceiling erodes slowly and never below the current overall. Added a **potential-pull** so young talent below its ceiling trends toward it instead of stalling/sliding. (The "whole 2026 class craters to 45-53" was the imported prospects *entering* at ~50 raw OVR — fixed in #246; generated classes already develop healthily, verified 0/30 crater over 4 seasons.) Regression tests added.
- **Where:** Sim engine — player development / boom-bust rolls
- **Observed:** Across several saves of the same league, Keaton Wagler (drafted #9, 90 POT as a rookie) busts every single time (e.g. 45 OVR ▼-24, POT crashed to 56).
- **Suspected cause:** Development outcomes appear deterministic — seeded by player identity rather than rolled per save. Whatever a player's boom/bust fate is, it replays identically in every league.
- **Bigger finding — the entire 2026 draft class busts:** A few seasons in, the top of the 2026 class sits at 45–53 OVR across the board: A. Dybantsa 53, N. Ament 51, B. Smith 51, M. Brown Jr. 50, K. Peat 49, L. Philon 49, K. Wagler 45. This isn't one unlucky player — generated draft classes appear to systematically crater after entering the league (development model collapses their OVR/POT instead of growing them). Check how development treats game-generated rookies vs. roster-file players.
- **Expected:** Development outcomes vary across saves. A 90-POT pick might boom in one save and bust in another. (Per-save RNG seed for development rolls.)
- **Related:** FEAT-14 (scouting/hidden potential) — if fates are predetermined and repeat across saves, scouting is also moot for replayers.
- **Priority:** P1

### ☑ BUG-16: Lineup needlessly cross-assigns players (SG at PG, PG at SG)
> **Fixed.** `buildDefaultBasketballLineup` now assigns within a position group to natural slots when a clean assignment exists — two guards land PG+SG instead of a needlessly cross-assigned SG-at-PG / PG-at-SG. Only same-position pairs stay in OVR order.
- **Where:** Roster & Lineup — starting slot assignment
- **Observed:** Jaden Ivey (SG) is in the PG slot while Cole Anthony (PG) is in the SG slot — both flagged with out-of-position dots even though simply swapping them gives everyone their natural position.
- **Expected:** When assigning lineup slots (especially via Auto-fill), align players to natural positions whenever a clean assignment exists; only cross-assign when there's no alternative.
- **Related:** FEAT-21 (flexible G/F/C slots) — under that model G↔G swaps shouldn't be penalized or flagged at all.
- **Priority:** P2

### ☑ FEAT-25: Draft picks on the Trading Block and in Trade Finder
> **Shipped.** Draft picks are now tradeable assets in both the Trading Block (put owned picks up, field AI offers, picks as sweeteners) and the Trade Finder (offer picks to complete/sweeten a deal, ask for the opponent's picks, pick-for-pick), valued on the same PTS scale via the existing engine gate.
- **Where:** Trade > Trading Block and Trade > Trade Finder
- **What:** Both tools are players-only today. Allow draft picks as assets in both directions:
  - **Trading Block:** put owned picks on the block (alongside players) and field AI offers for them.
  - **Trade Finder:** include picks in what you can offer and what you can ask for.
- **Related:** FEAT-1 (current-year picks tradeable, with pick number shown), FEAT-12 ("seeking in return" includes picks).
- **Priority:** P1

### ☑ FEAT-26: Team switcher dropdown on the Roster view
> **Shipped.** A team-switcher dropdown on the Roster page renders any team's roster read-only (same table — OVR/POT trends, contract, stats, mood) with all edit-only controls hidden when viewing a non-user team.
- **Where:** Roster & Lineup page header
- **What:** Add a dropdown next to the team name to switch the roster view to any team in the league. Other teams render read-only (no lineup editing, no Start/Bench/drag) but show the same table: players, OVR/POT trends, contracts, stats, mood.
- **Related:** FEAT-17 (team pages should show rosters) — this could be the same component; the dropdown is just a faster path during trade prep.
- **Priority:** P1

### ☑ BUG-17: Can't sign anyone when over the cap — minimum contracts should always be available
> **Fixed.** Free-agency affordability now keys off `signingBudget` (cap room OR an MLE/minimum exception) instead of raw cap room, so over-cap teams see signable players and an "available at vet minimum" badge appears for cheap targets when over the cap. Signing was never cap-blocked, so minimums always go through with an open roster spot.
- **Where:** Free Agency — affordability/signing rules
- **Repro:** Be over the cap (or near $0 room) and open Free Agency.
- **Expected:** Like the real NBA, over-cap teams can still sign players to minimum contracts as long as a roster spot is open. FA list should show minimum-salary-willing players as signable, with an indicator (e.g. "available at vet minimum").
- **Actual:** No players are available to sign at all.
- **Optional depth:** a simple mid-level exception (one ~$5–12M signing per offseason for over-cap teams) would add realistic team-building texture, but minimums are the must-have.
- **Priority:** P1

### ☑ TUNE-1: Cooper Flagg rated too low
> **Addressed.** The development potential-pull (BUG-15) makes young blue-chippers trend UP toward their ceiling instead of declining, and the youngest imported players (≤20) now get extra potential headroom (+12) so a 19-20-yo projects as a budding star, not a finished rotation piece. (Per-player baseline OVR remains import-data-driven; the trajectory now trends sharply up.)
- **Where:** NBA 2025-26 roster import data / young-star development
- **Observed:** Flagg sits around 77–80 OVR (and trended *down*, 77 ▼-3, in one save) — he plays like a mid rotation guy instead of a budding superstar.
- **What:** Raise his baseline OVR and ensure his development trajectory trends sharply up (potential 88+ should mean he's pushing mid-80s OVR by years 2–3, not declining at age 20).
- **Related:** BUG-15 — a 20-year-old #1 pick losing OVR may be the same broken development model; also audit other young stars in the import for the same issue.
- **Priority:** P2

### ☑ BUG-18: Free agents accept any offer
> **Fixed.** Replaced the flat "70% of market" gate with a real `acceptanceThreshold` (tier + team appeal + Bird loyalty, never below a competing offer): lowballs now reject or lose the player to a rival, and the displayed "Accepts %" maps honestly to that threshold. Regression test added (lowball never lands the player; market+ signs).
- **Where:** Free Agency — offer acceptance logic
- **Observed:** Essentially every free agent says yes regardless of the offer. The "Accepts at Market %" stat exists on player cards but doesn't seem to gate anything.
- **Expected:** Acceptance should depend on offer vs. market ask (lowball → reject/counter), competing offers from AI teams, team appeal (contender status, role/minutes available, morale), and player personality (e.g. "Wants to test FA").
- **Related:** BUG-6 / BUG-13 — with no AI competition and universal acceptance, the user can assemble any roster, which feeds "league too easy."
- **Priority:** P0

### ☑ FEAT-27: Clicking a player's mood explains why they feel that way
> **Shipped.** The mood badge is now clickable, opening a popover that lists the contributing factors (role vs talent, contract year, dev trajectory, recent team form) with +/− signs, via a shared `moodFactors` helper.
- **Where:** Roster & Lineup — Mood column (and anywhere mood badges appear)
- **What:** Make the mood badge clickable (or hoverable) to show the contributing factors, e.g. "Unhappy: benched despite strong play (−), team losing streak (−), contract year (−)" or "Thrilled: starting role (+), team winning (+), recently extended (+)".
- **Why:** Mood presumably drives re-sign willingness and morale effects — without the "why," the player can't act on it.
- **Priority:** P1

## Features

### ☑ FEAT-1: Trade current-year (2026) draft picks in the Trade section
- **Where:** Trade > Propose Trade — Draft Picks list (both sides of the offer)
- **Current:** Pick assets start at '27 R1/R2. The only way to trade current-year picks is the "Trade Pick" button inside the Draft view, and only when a team is on the clock.
- **What:** Include 2026 picks as tradeable assets in the Trade section, alongside the future picks.
- **Details:**
  - Show the actual pick number for current-year picks once draft order is known (e.g. "'26 R1 — Pick #3").
  - Current-year picks are tradeable year-round, including before draft order is set.
  - Once a pick has been made, it's no longer tradeable as a pick — it converts to the drafted player.
- **Priority:** P1

### ☑ FEAT-2: "Go to Draft" button in top bar during draft phase
- **Where:** Top bar (where Sim to My Pick / Sim One Pick / Auto Draft All live)
- **What:** During the draft phase, add a "Go to Draft" button so you can quickly navigate back to the draft page after navigating elsewhere (e.g. checking roster or trades mid-draft).
- **Priority:** P2

### ☑ FEAT-3: Show draft recap content on draft completion
- **Where:** Draft page, "Draft Complete!" state
- **What:** When the draft finishes, surface the Draft Recap content (Team Grades, Biggest Steals, etc.) at the top of the page instead of just a "Draft Complete!" banner with a separate Draft Recap link.
- **Priority:** P1

### ☑ FEAT-4: Live cap space tracker in the re-sign window
- **Where:** Re-sign window, header stat cards
- **What:** Show total *current* available cap space before any re-sign decisions, and update it live as each player is re-signed or let walk. Current cards (Projected 2027 Cap Space, Committed Payroll, Room If All Re-signed) don't clearly show "here's what I have to spend right now" or react per-decision.
- **Depends on:** BUG-2 — cap math must be correct for the live tracker to be trustworthy.
- **Priority:** P1

### ☑ FEAT-5: Roster needs / recommendations in Free Agency
- **Where:** Free Agency page, header area
- **What:** Show what the team needs at the top of Free Agency so you don't have to flip back to Roster & Lineup. Two kinds of needs:
  - **Count gaps:** positions where you're thin (e.g. only 1 SF).
  - **Quality gaps:** positions with enough bodies but low ratings (e.g. 4 PGs, all sub-72 OVR — flag as "needs upgrade").
- **Notes:** The Re-sign window already has a "Roster After Decisions" position-count bar, and the draft view shows a per-team "NEEDS" chip — reuse/extend that logic here. Could also drive a "fits your needs" badge or filter on the FA list.
- **Priority:** P1

### ☑ FEAT-6: Show roster count vs. 15-man max on the Roster page
- **Where:** Roster & Lineup page, header (next to payroll/cap room)
- **What:** Display total roster count against the max, e.g. "Roster 11/15". The header shows position counts (PG 3 · SG 2 · ...) and payroll, but no total vs. limit — you have to count manually. Free Agency already shows "roster 12/15"; use the same treatment here.
- **Related:** BUG-4 (15-man limit enforcement).
- **Priority:** P2

### ☑ FEAT-7: Scheme-fit dots on roster are unclear/inconsistent
- **Where:** Roster & Lineup page, dot next to player names
- **What:** Some players have a colored dot, some have none. These appear to be the scheme-fit indicators (legend: great/good/neutral/poor), but it's not obvious — "neutral" seems to render as no dot at all, which reads as a glitch rather than a rating.
- **Fix:**
  - Render a dot for every player (including neutral) so the column is consistent.
  - Add a tooltip on hover ("Scheme fit: great") and/or put the dot in its own labeled column.
- **Priority:** P2

### ☑ FEAT-8: Show previous-season stats for free agents
- **Where:** Free Agency page — expanded player row (clicking a player's name)
- **What:** There's no way to see a free agent's stats from the previous season. The expanded card shows OVR/POT/age/ask, and the "LAST" column is just "—" for everyone. Add last-season stat line (PPG/RPG/APG, GP) to the expanded card, and/or link the player name to their full profile page.
- **Priority:** P1

### ☑ FEAT-9: Explain "Bird Rights" (and verify it does anything)
- **Where:** Free Agency — expanded player card, "Bird Rights" field
- **What:** "Bird Rights: None" is shown with no explanation of what it means or what the player should do with the information.
- **Fix:**
  - Add a tooltip/info icon: e.g. "Bird rights let a team exceed the cap to re-sign its own player (3+ seasons on roster)."
  - **Verify:** does the game actually simulate this (cap exception on re-signs)? If not, either implement it or remove the field — showing a dead stat is worse than not showing it.
- **Priority:** P2

### ☑ FEAT-10: Signing a free agent advances the offseason one day
- **Where:** Free Agency page (Day X of 30)
- **What:** Completing a free-agent signing should advance the offseason clock by one day, instead of only advancing via Skip Day / Skip Week.
- **Why:** Makes signings feel like they take time and prevents signing unlimited players on Day 0 with no market progression.
- **Priority:** P1

### ☑ FEAT-11: Show roster scheme fit for coaching candidates before hiring
- **Where:** Staff page — Coaching market list
- **What:** Candidates show their scheme (Five-Out, Triangle, Flow, Princeton) and OFF/DEF/DEV ratings, but there's no way to see how that scheme aligns with your current players before hiring.
- **Fix:** Show a projected roster-fit summary per candidate — same format as the current coach's card (e.g. "4 great · 1 good · 4 neutral · 5 poor"), computed against your roster for *their* scheme. A hover/expand is fine.
- **Priority:** P1

### ☑ FEAT-12: Richer "Seeking in Return" options on the Trading Block
- **Where:** Trade > Trading Block — "Seeking in Return" selector
- **What:** Currently only the 5 positions (PG/SG/SF/PF/C). Expand to match what GMs actually seek in trades:
  - **Assets:** draft picks (1sts/2nds), young prospects, expiring contracts / cap relief
  - **Archetypes:** shooter, rebounder, interior defender, perimeter defender, playmaker, rim protector, scorer
- **Notes:** Selections should shape the AI proposals that come back from "Ask for Proposals." Multi-select.
- **Priority:** P1

### ☑ FEAT-13: Condense the Awards page cards
- **Where:** Awards page (Season Awards grid)
- **What:** Award cards are too tall and eat vertical space. Condense the height — e.g. winner name/team/position and stat line on one or two rows, smaller avatar, finalists inline. Goal: all awards visible with little or no scrolling.
- **Priority:** P2

### ☑ FEAT-14: Scouting should uncover gems and busts, not just confirm rankings
- **Where:** Draft Board — scouting system (Scout pts / Auto-scout)
- **Current:** Scouting a player basically verifies a potential that already lines up with their draft ranking. No surprises, so scouting feels pointless.
- **What:** Make scouting reveal *deviations* from public consensus:
  - Each prospect has a hidden true potential; the public board shows a noisy estimate with a wide range (e.g. 68–84).
  - Scouting narrows the range toward the true value — sometimes revealing a gem (true POT well above ranking) or a bust (well below).
  - Scout quality (staff DEV/scouting rating) could affect accuracy/how much noise remains.
- **Why:** Creates the payoff loop scouting exists for — finding steals late and avoiding busts early.
- **Priority:** P1

### ☑ FEAT-15: Player quick-view modal should lead with stats, not just attributes
- **Where:** Player quick-view modal (clicking a player's name anywhere)
- **Current:** Modal shows only attribute bars (Shooting/Playmaking/Defense/Athletic/Mental). No stats at all.
- **What:** Add the player's stats to the modal, above or alongside attributes: current-season line (PPG/RPG/APG, FG%/3P%, GP/MPG) and last-season line for comparison. Stats are what's top of mind when clicking a player.
- **Related:** FEAT-8 (same gap in Free Agency).
- **Priority:** P1

### ☑ FEAT-16: Show OVR/POT progression over time
- **Where:** Player modal / full player page; optionally Roster list
- **Current:** No indication anywhere of whether a player's OVR or POT is rising or falling.
- **What:**
  - Track OVR/POT history (e.g. monthly or season snapshots).
  - Show a trend indicator next to OVR (e.g. "72 ▲ +3 this season") in the modal and roster.
  - Show a small development graph on the full player page.
  - The "PLATEAU" tag exists, suggesting a development state is already modeled — surface the underlying trajectory.
- **Priority:** P1

### ☑ FEAT-17: Team pages should show the full roster with stats
- **Where:** Team page (clicking any team name)
- **Current:** Shows team stats, recent activity, and recent games — but not the roster.
- **What:** Show the same roster table you get on your own Roster & Lineup page (players, POS, AGE, OVR, contract, season stats), read-only. That's the main thing you want when looking at another team — who they have and how they're playing.
- **Priority:** P1

### ☑ FEAT-18: Player pages are missing trade-relevant info (stats, health, contract)
- **Where:** Full player page (e.g. Desmond Bane, Orlando)
- **Current:** When evaluating a player on another team you can't answer the basic trade questions: What is he putting up this year? Is he healthy? What's his contract (salary, years left)?
- **Fix:** Add to the player page header area: contract details (salary × years), health/injury status, and current-season stat line.
- **Possible bug to verify:** The Statistics section showed "No season stats yet — sim some games" for a starter at Day 116 of the season (Orlando was 15–41). Either other teams' player stats aren't being logged, or the page can't find them — investigate while in there.
- **Priority:** P1

### ☑ FEAT-19: "Trade for this player" button on player profiles
- **Where:** Full player page + quick-view modal, for any player not on the user's roster
- **What:** Add a "Trade for this player" button that jumps to Trade > Propose Trade with that player's team selected and the player pre-checked on the receive side.
- **Priority:** P1

### ☑ FEAT-20: Show what each team offers on the "pick your next job" screen
- **Where:** Fired / front-office vacancy screen (after being fired, choosing a new team)
- **Current:** Each open job shows only team name and record — nothing to base the decision on.
- **What:** Add a summary per team so you can compare the situations: top players (e.g. "A. Edwards 85 · R. Gobert 88"), young talent/prospects, owned future draft picks (especially extra 1sts), cap space, and average roster age. Enough to tell a rebuild from a retool at a glance.
- **Priority:** P2

### ☑ FEAT-21: Flexible lineup positions (G/F/C instead of rigid PG/SG/SF/PF/C)
- **Where:** Roster & Lineup — starting slot position requirements
- **Current:** Each starting slot demands the exact position (an SF slot wants an SF), forcing worse players into the lineup over better ones at an adjacent position.
- **What:** Allow lineups built from any reasonable combination of guards, forwards, and centers — if a PF is the best forward, he can take either forward spot. Keep some sanity constraint (e.g. ~2 G / 2 F / 1 big or position-adjacent assignments with a small out-of-position penalty) rather than exact-position matching.
- **Related:** BUG-5 (out-of-position warning) — its logic would need updating to match.
- **Priority:** P1

### ☑ FEAT-22: Bench order controls minutes distribution
- **Where:** Roster & Lineup — bench section (drag handles already exist)
- **What:** Let the user drag bench players into a priority order, and have the sim allocate bench minutes by that order (higher = more minutes). Right now there's no apparent way to influence who soaks up bench minutes.
- **Related:** BUG-11 — minutes allocation logic is being touched anyway.
- **Priority:** P1

### ☑ FEAT-23: Show player stats in the Re-sign window
- **Where:** Re-signing Window — expiring player rows
- **Current:** Rows show position/age/OVR and the ask, but no production — can't judge whether a player is worth the money.
- **What:** Add last-season stat line to each row (PPG/RPG/APG, GP, MPG), and ideally make the row expandable or the name clickable to the player quick-view (which per FEAT-15 should also show stats).
- **Related:** FEAT-8 (same gap in Free Agency), FEAT-15 (modal stats).
- **Priority:** P1

### ☑ FEAT-24: Richer game detail page (quarter-by-quarter, team totals, game info)
- **Where:** Game detail page (clicking any played game)
- **Current:** Shows final score, game leaders, and per-player box score tables.
- **What:** Round out the game page:
  - **Quarter-by-quarter line score** (Q1–Q4 + OT) for both teams at the top.
  - **Team totals row** under each box score (FG%, 3P%, FT%, REB, AST, TOV, etc.).
  - **Other game details:** lead changes, biggest lead/run, attendance/arena flavor — whatever the sim already tracks.
  - **Prev/next navigation:** chevrons on the left/right of the page to flip to the previous/next simulated game without going back to the schedule.
- **Priority:** P2

## Needs clarification

<!-- Items I couldn't fully structure from the brain-dump -->
