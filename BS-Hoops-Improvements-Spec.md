# BS Basketball — Improvements Spec

Last updated: 2026-06-13
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

### ☑ BUG-19: 2026 draft order ignores the consensus big board (too random)
- **Where:** Draft sim — AI auto-pick (`packages/sport-basketball/src/draftSystem/aiPick.ts`), consensus data (`apps/bs-basketball/src/lib/data/draft2026.ts`), import (`apps/bs-basketball/src/lib/data/leagueImport.ts` ~line 584).
- **Repro:** Sim/auto-draft the 2026 class. AJ Dybantsa (consensus #1) frequently doesn't go #1; Caleb Wilson / Darryn Peterson slide while role players (Mikel Brown Jr., Labaron Philon) jump well ahead of their rank. Draft Recap shows wild ±9/±10 "reaches" and "steals" every time.
- **Root cause:** `aiBasketballDraftPick` scores prospects as `ovr*0.35 + pot*0.65 + needBonus(±4.5) + noise(±2.5)` and has **no knowledge of the consensus board**. The board only sets prospect *ratings* via `consensus2026Value(rank)`, which spaces adjacent ranks just ~0.7 OVR / ~0.55 POT apart — so the talent term separates consecutive ranks by **<1 pt**, which the ±2.5 noise + ±4.5 need bonus easily overwhelm. The board scrambles. Meanwhile the *displayed* Big Board (`DraftBoardCard.prospectScore`) pins consensus prospects in exact order (`10000 - rank`), so the board the user sees and the picks the AI makes disagree.
- **Decision (TYLER):** **Strict consensus** — the draft should follow the big board almost exactly top-to-bottom, with minimal randomness and essentially no reaches.
- **Suggested fix:**
  - Persist the consensus rank on each prospect: add `draftProjection?: number` to `BasketballPlayerData` (`packages/sport-basketball/src/types/index.ts`); set it where consensus value is applied in `leagueImport.ts`, and in `persistence/migrations.ts` for saves with a live pool.
  - In `aiBasketballDraftPick`, when `draftProjection` is present, score by a rank anchor with large per-rank separation (e.g. `anchor = 1000 - rank*10`) plus only a hairline tie-break (±~0.5) so need/noise can't cause reaches. Unranked prospects (generated future classes, undrafted imports) keep the existing talent-based scoring and naturally sort below the board.
  - Net result: Dybantsa #1 essentially always; board followed in order; near-zero reaches/steals in the recap.
- **Notes:** Only affects *future* drafts — an already-completed draft can't be reordered. Generated 2027+ classes have no real board, so they keep talent-based variance (acceptable). Re-check `bs-hoops-draft-exact-match-spec.md` for any board-display assumptions.
- **Priority:** P1

### ☑ BUG-20: Imported league's first (inaugural) draft skips Re-sign + Free Agency
- **Where:** Offseason flow for imported leagues — `src/lib/ui/nextAction.ts` (~line 71/86), `src/app/draft/page.tsx` (post-draft CTA), `src/lib/store/leagueStore.ts` (`finishInauguralDraft` ~line 516), `src/app/re-sign/page.tsx`, `src/lib/roster/resignProjection.ts`.
- **Repro:** Import a roster file, complete the inaugural 2026 draft. The only CTA (top bar + draft page) is "Start 2026 Season" — it tips straight into the season, skipping the Re-sign and Free-Agency steps that a normal post-draft offseason runs.
- **Root cause:** `nextAction` gates the Re-sign step on `!draft.inaugural`; the inaugural branch falls through to `Start ${draft.season} Season`. `draft/page.tsx` mirrors this. `finishInauguralDraft` sets phase to preseason **without rolling the year** (FA does surface in preseason, but Re-sign is never offered). This is the follow-up to BUG-1 / BUG-12, which only fixed the *non-inaugural* path.
- **Decision (TYLER):** **Full offseason flow** — the inaugural draft should route Draft → Re-sign → Free Agency → Start Season, same as a normal offseason. "Start Season" becomes the secondary "skip" option.
- **Suggested fix (watch the season math):**
  - The re-sign window targets `league.currentSeason + 1`, but the inaugural import tips into `currentSeason` itself (no roll; `draft.season === currentSeason`). Unify the target to `getDraft(league)?.season ?? currentSeason + 1` in `resignProjection.ts` and `re-sign/page.tsx` — this equals `currentSeason + 1` in the normal flow (unchanged) and `currentSeason` for inaugural.
  - Re-sign page "Start Season" calls `store.startNextSeason()`; for an inaugural draft it must call `store.finishInauguralDraft()` instead (no year roll), then route to `/free-agency`. Branch on `draft.inaugural`.
  - Remove the `!draft.inaugural` gate in `nextAction` so inaugural gets the Re-sign primary action; make the "Skip to season" secondary map to the inaugural finish path (check the TopBar handler for the `startNextSeason` action key).
  - Verify the 15-man trim gate and cap tiles read correctly with the unified target season.
- **Related:** Follow-up to BUG-1 / BUG-12.
- **Priority:** P1

### ☑ BUG-21: All-Rookie team has only 2 players (S2026)
- **Where:** `src/lib/awards/honors.ts` (`computeHonors`, All-Rookie selection ~line 123); root cause likely in AI rookie minutes (sim).
- **Repro:** Play the 2026 season in an imported league, open Awards. The All-Rookie team(s) list only ~2 players instead of up to 10.
- **Root cause analysis:** the All-Rookie pool filters `gamesPlayed >= MIN_ROOKIE_GAMES (20)` **and** `yearsInLeague === 0`, sorts by offense, and takes top-5 / next-5. Only ~2 rookies clear the bar because AI-team rookies are buried (few/no minutes → under 20 games or ~0 production), leaving essentially only the user's own rookies (user-controlled minutes). This is the unresolved tail of BUG-10 ("steep cliff beyond the top ~5 / AI rookie minutes"), showing up more severely on the imported-league path.
- **Investigate:**
  - Are AI-team rookies appearing in 20+ games at all? Check `gamesPlayed` accrual when a rookie's allocated minutes are ~0. The real fix is AI rookie minutes/depth (BUG-10), not the awards code.
  - Timing: honors are computed live from `league` on the awards page; confirm they're computed for the just-finished season **before** the rollover increments `yearsInLeague` (`development.ts` line ~120 does `yearsInLeague + 1`). If honors ever run after the roll, the rookie pool empties entirely.
  - Consider whether `MIN_ROOKIE_GAMES = 20` is too strict, but prioritize the minutes fix.
- **Expected:** both All-Rookie teams populate (up to 10 players), including AI-team rookies, in a realistic production range.
- **Related:** BUG-10, BUG-13 (AI rotation quality).
- **Priority:** P1

### ☑ BUG-22: GM firing is too strict (fired after 2 bad seasons)
- **Where:** `src/lib/approval/approval.ts` (`applySeasonApproval`, `FIRE_THRESHOLD`), default approval in `src/lib/league/createLeague.ts` (~line 179).
- **Repro:** Have two below-expectation seasons in a row → fired.
- **Root cause:** owner approval starts at **50**, `FIRE_THRESHOLD = 20`, and a bad season swings owner approval by `clamp(winsDelta*0.6 + playoffScore, -30, 30)`. A missed-playoffs season (`playoffScore = -12`) at ~25 wins (`winsDelta = -16 → -9.6`) is ≈ **−22**, so 50 → 28 → 6 fires you on the second miss. There's no grace period and no "consecutive bad seasons" requirement — it's pure accumulation.
- **Decision (TYLER):** **Grace period + two strikes.** Never fire within the first **3 seasons** of a tenure, AND only fire after **two consecutive** below-expectation (sub-threshold) seasons — i.e. one season below the line is a "final warning," not a firing. Track tenure start (reset when the user takes over a team) and a consecutive-bad-season counter (reset on any at/above-expectation season). A competent rebuild should get ~3–4 seasons of runway; only a sustained disaster gets you fired. Surface the "final warning" state in the UI (job-security indicator) so the user knows they're on the hot seat before the axe falls.
- **Related:** BUG-23 (firing/takeover flow), FEAT-20 (job openings screen).
- **Priority:** P1

### ☑ BUG-23: Taking a new job after being fired wipes the league and turns it fictional (DATA LOSS)
- **Where:** `src/app/page.tsx` — the fired-GM "pick your next job" openings (~line 171) and `handlePick` (~line 72).
- **Repro:** Get fired in an imported (custom-roster) league → on the home screen click "Take the job →" on one of the openings.
- **Actual:** The whole league becomes **fictional** — generated teams (e.g. "New Orleans Brass") and generated players replace the imported NBA rosters. The custom roster file the user uploaded is effectively gone; the new roster shows generic parody players, all "Acquired: Original," with no prior stats. (Screenshot: managing "New Orleans Brass," 0–0, fictional players.)
- **Root cause:** the opening buttons call `handlePick(t.abbreviation)`, and `handlePick` calls **`newLeague()`** — which generates a brand-new default league from `HOOPS_LEAGUE_TEAMS` (the parody team set in `src/lib/data/teams.ts`, where New Orleans = "Brass") — then matches the chosen abbreviation. So "taking the job" discards the current league and spins up a fresh fictional one. This is also the source of the user's "the offseason was already simulated / I'm stuck with picks & FAs I didn't make" feeling — they're actually dropped into a generated league's starting roster.
- **Fix:** the fired-flow openings must **take over within the current league** — call `store.pickUserTeam(t.id)` (which runs `clearGmFired` + sets `userTeamId` on the existing league), NOT `handlePick`/`newLeague`. Keep `handlePick`/`newLeague` only for the "start a brand-new league" team grid.
- **Desired end-to-end flow (TYLER):** firing should resolve at the **end of the playoffs**, then the user picks a new team and lands in **that team's offseason at the draft (phase 1)** — controlling their own picks, re-signs, and FA. Verify sequencing: firing happens in `enterOffseason` (`advanceSeason.ts` line ~121) which also sets up the draft (not auto-simmed), so a correct `pickUserTeam` takeover should drop the new GM straight onto the pending draft with picks unsimmed and AI free agency not yet run. Confirm the draft isn't auto-simmed and AI FA hasn't run before takeover; consider surfacing the firing/openings at playoff completion rather than only after the user clicks "Enter Offseason."
- **Related:** BUG-22, BUG-24, FEAT-20. Cross-check `BS-HOOPS-MULTISEASON-BUGS.md`.
- **Priority:** **P0 (data loss)**

### ☑ BUG-24: No roster context when taking over a team (last-season stats + acquisition)
- **Where:** `src/app/roster/page.tsx` — roster table (GP / PPG-RPG-APG columns ~line 460, `Acquired` column `acquiredLabel` ~line 618).
- **Repro:** Take over a team (or view any roster at the start of a season). The GP and PPG/RPG/APG columns show "—" and every player reads "Acquired: Original."
- **Root cause:** the table pulls **current-season** stats via `regularSeasonStatsByPlayer(league)`; on day 1 (0–0) `gamesPlayed === 0`, so the stat line renders "—" with no fallback to last season. The `Acquired` column maps `acquiredVia: 'initial'` → "Original," so an inherited/generated roster reads "Original" for everyone.
- **What:** when the current season has no games yet, fall back to the player's **last-season stat line** (from `sportData.seasonLog` / `careerStats`) so a new GM can evaluate the inherited roster; label it (e.g. "'25: 18.4/5.1/4.0"). Ensure acquisition shows something meaningful for inherited players. (Note: much of the "everyone is Original / no stats" symptom is a side effect of BUG-23 regenerating the league — fix BUG-23 first, then this is the genuine remaining gap.)
- **Related:** BUG-23, FEAT-8 (prev-season stats for FAs), FEAT-23 (stats in re-sign), FEAT-15 (modal stats).
- **Priority:** P1

### ☑ BUG-25: "Sign a free agent" on the Roster page does nothing
- **Where:** `src/app/roster/page.tsx` — the roster-size badge (`sizeBadge`, ~line 237; rendered as a `<span>` ~line 308). Free-agency flow in `src/app/free-agency/page.tsx` + `src/lib/freeAgency`.
- **Repro:** Mid-season with a short roster (screenshot: Lakers 17–41, **Roster 12/15**, Day 117). The header shows an orange "Sign a free agent" pill; clicking it does nothing.
- **Root cause (two layers):**
  1. The pill is a **non-interactive `<span>`** — it's just a status badge (shown when `roster.length < MIN_ROSTER` (13)). It has no `onClick` and isn't a link, so it can never do anything. It only *looks* clickable.
  2. Even if it linked to `/free-agency`, **free agency is offseason-gated** — `isSeasonUnderway(league)` / games-played / `day >= FA_DAYS` close the window once the season starts (see `freeAgency` + the FA page's `faClosed`). So mid-season there's currently no way to sign a free agent at all, which is why a team can get stuck at 12/15.
- **Decision (TYLER):** **Remove it.** In-season free agency isn't supported, so the "Sign a free agent" pill is pointless — delete it. Drop the `roster.length < MIN_ROSTER` → "Sign a free agent" branch from `sizeBadge` so the badge only ever shows the roster count (or "Cut to 15" when over). Don't replace it with a link or a new flow. (If a short roster mid-season ever needs surfacing, do it as plain, non-clickable text — but per Tyler, simplest is to just remove the prompt entirely.)
- **Expected:** no misleading clickable-looking "Sign a free agent" pill on the Roster page; the size badge just reflects roster count / over-limit state.
- **Related:** BUG-6 (AI FA competition), FEAT-5 (FA roster needs).
- **Priority:** P2

### ☑ BUG-26: Free agency opens already at "Day 30 of 30 · window closed" in 2027+
- **Where:** `src/lib/season/advanceSeason.ts` — `enterOffseason` (~line 118) vs `startNextSeason` (resets at lines 460–461); FA day read in `src/lib/freeAgency/freeAgency.ts` (`getFaDay`, `FA_DAYS = 30`).
- **Repro:** Play a full season, reach the offseason, go Draft → Re-sign, then open "3. Free Agency" from the stepper. The window shows **Day 30 of 30 · prices at 60% · window closed** — the whole FA window is already spent. Only happens in **2027 and later** (the inaugural 2026 looks fine).
- **Root cause:** `faDay` and `seasonStarted` are stored on `sportData` and are only reset in **`startNextSeason`** (the preseason tip-in: `faDay = 0`, `seasonStarted = false`). But the FA page is reachable **during the offseason via the stepper**, *before* `startNextSeason` runs. `enterOffseason` does **not** reset them, so they still hold the prior season's end-state (`faDay = 30` from last season's `beginRegularSeason`, which set `faDay = FA_DAYS`). In 2026 it's masked because `faDay` was 0 from import; every later season inherits 30 → "window closed."
- **Fix:** reset `faDay = 0` and `seasonStarted = false` in **`enterOffseason`** (when the new offseason begins), not only in `startNextSeason`. That way the FA window is fresh throughout the offseason regardless of when the user opens it. (Leaving the reset in `startNextSeason` too is harmless/idempotent.) Add a regression test that rolls 2026→2027→2028 and asserts `getFaDay === 0` at the start of each offseason's FA view.
- **Related:** BUG-1/BUG-20 (offseason flow), BUG-7 (season tip-off). Cross-check `BS-HOOPS-MULTISEASON-BUGS.md`.
- **Priority:** P0

### ☑ BUG-27: Free agents show no prior-season stats (LAST column is "—")
- **Where:** `src/components/freeAgency/FreeAgentTable.tsx` — `lastLine()` (~line 24, reads `player.sportData.seasonLog`); season-log population in `src/lib/season/advanceSeason.ts` (`enterOffseason`, seasonLog append ~line 150, guarded by `stats.gamesPlayed > 0`).
- **Repro:** Open Free Agency in 2027+. Every free agent's **LAST** column shows "—," even recognizable players (Jaden Ivey, Lonzo Ball, etc.).
- **Root cause:** `lastLine()` pulls the most recent `seasonLog` entry, but `seasonLog` only gets an entry for a season the player **actually played** (`gamesPlayed > 0`). Free agents who sat unsigned all year accrue no entry → "—". As Tyler suspected, this is largely downstream of **AI teams not signing free agents** (BUG-6): the pool stagnates with players who never played, so they never build a stat history. Imported free agents also start with no in-sim history at all.
- **Fix (layered):**
  1. Primary: ensure AI free agency actually turns the pool over (BUG-6 follow-up) so quality FAs get signed and play, and the leftover pool reflects real role players — verify `runAiFreeAgency` is signing enough across a full offseason.
  2. Fallback display: when `seasonLog` is empty, fall back to per-game `careerStats` (or the imported real prior-season line) so a recognizable vet still shows *some* production instead of "—".
  3. For imported leagues, seed free agents with their real prior-season stat line so the first season's FA board isn't blank.
- **Related:** BUG-6 (AI FA inactivity — likely root), FEAT-8 (prev-season stats for FAs, already shipped — this is the multi-season/empty-log gap), BUG-13.
- **Priority:** P1

### ☑ BUG-28: `startNextSeason` silently auto-re-signs the user's expiring players (slashes cap space)
- **Where:** `src/lib/season/advanceSeason.ts` — `startNextSeason`, the "re-sign any still-rostered player whose deal expired" loop (~lines 417–427, `marketContract(p, season)`).
- **Repro:** In the Re-sign window, re-sign/walk your expiring players; the cap tile reads e.g. **$31.4M cap space to spend (2028)**. Click "Start 2028 Season" → on Free Agency the cap space is roughly **halved**, with no signing you made.
- **Root cause:** after the re-sign window, `startNextSeason` loops over **every still-rostered player without a contract for the upcoming season and auto-signs them to a `marketContract`** — for the user's team too. This silently adds salary the GM never agreed to and can push the team over the cap. It also **directly contradicts the documented flow** ("Anything left un-re-signed walks to free agency at season start," per `nextAction.ts`) — the code does the opposite and auto-keeps them.
- **Fix:** scope the auto-re-sign to **AI teams only** (`t.id !== league.userTeamId`). For the user's team, players without a next-season contract who weren't explicitly re-signed should **walk to free agency** (be released), matching the re-sign window's stated behavior and its cap projection. (The loop exists so AI rosters don't bleed salary to $0 — keep that for AI.)
- **Related:** BUG-2/BUG-3 (Let Walk), BUG-29 (cap inconsistency), BUG-1/BUG-20 (offseason flow).
- **Priority:** P0

### ☑ BUG-29: Cap space figure is inconsistent and jumps across Re-sign → Free Agency → Start Season
- **Where:** `src/lib/roster/resignProjection.ts` (`resignProjection`, season = `getDraft(league)?.season ?? currentSeason+1`), `src/lib/freeAgency/freeAgency.ts` (`capRoom`/`signingBudget`, season = `league.currentSeason`), `src/app/free-agency/page.tsx` (header uses `capRoom`).
- **Repro:** Same roster, no signings — the cap-space number lurches: **$31.4M** (Re-sign) → **$15.2M** (FA opened via stepper) → **$268K** → **$12.9M** (after "Start the Season"). 
- **Root cause (two compounding):**
  1. **Different season targets.** Re-sign computes cap for the *upcoming* season via `draft.season` (e.g. 2028). The FA page's `capRoom`/`signingBudget` compute for **`league.currentSeason`**, which is still the *old* season (2027) when FA is reached **before** `startNextSeason` rolls the year (possible because the stepper exposes "3. Free Agency" during the offseason — see BUG-26). So the two pages are pricing different seasons.
  2. **Salary mutates mid-flow.** `startNextSeason` auto-re-signs players (BUG-28) and `beginRegularSeason` runs AI FA, so payroll changes between views.
- **Fix:** establish a single source of truth for "cap space for the upcoming season" and use it on every offseason surface (Re-sign, Free Agency, Roster). Cap math should always target the upcoming season (`draft.season` until the roll, then `currentSeason`), never the stale current season. Combined with gating FA until the season actually rolls (BUG-26) and BUG-28, the number should stay stable from Re-sign through the FA window.
- **Related:** BUG-26 (FA reachable pre-roll), BUG-28 (auto-re-sign), BUG-2.
- **Priority:** P1

### ☑ BUG-30: Can't sign any free agent when over the cap / window shows closed (and pool reads "Available 0")
- **Where:** `src/components/freeAgency/FreeAgentTable.tsx` (min-deal gate `minDeal = room <= 0 && marketSalary <= LEAGUE_MINIMUM_SALARY*1.5`, ~line 142), FA window-closed gating (`faClosed`), pool source `freeAgentPool`.
- **Repro:** Reach Free Agency short-handed (roster 11/15) with little/no cap space. Window reads **Day 30 of 30 · window closed**, **Available (0) / "No free agents match,"** and there's no way to add anyone.
- **Root cause / gaps:**
  1. **Window closed (BUG-26)** blocks FA entirely the moment you arrive (Skip Day/Week disabled, signings gated).
  2. **Over-the-cap signing is too restrictive** — BUG-17 added vet-minimum deals, but only when `marketSalary <= 1.5× minimum`, so an over-cap team with open spots still can't fill out the roster with the available pool. With an **open roster spot**, vet-minimum signings should always be possible (NBA rules), regardless of the player's market value.
  3. **Empty pool** — "Available (0)" suggests AI free agency consumed the whole pool (BUG-6/BUG-13 over-signing) or the closed-window state hides everyone; a short-handed team is then stuck below a legal roster with no recourse.
- **Expected:** a team below the roster minimum can always sign available free agents to at least vet-minimum deals to get legal, and the FA window isn't spuriously "closed" during the offseason (BUG-26).
- **Related:** BUG-17 (over-cap minimum deals), BUG-26 (window closed), BUG-6/BUG-13 (AI FA volume), BUG-25.
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

### ☑ FEAT-28: NBA prospect comparisons are too repetitive
- **Where:** `src/lib/scouting/scoutingReport.ts` — `NBA_COMPS` table + `nbaComparison` selection (~line 57 / ~line 183).
- **Current:** Almost every prospect at a position gets the same handful of comps — "a connector forward like Mikal Bridges," "a microwave scorer like Malik Monk," etc. There are only **4 comps per position**, and `nbaComparison = pick(NBA_COMPS[pos], seed >> 3)` selects purely by position + a name-hash seed, ignoring the prospect's tier and skill profile.
- **What:** Make comparisons robust and relevant:
  - Expand the pools substantially (≈8–12 each) and key them off the already-computed **archetype** (`archetypeFor` derives Floor general / 3-and-D wing / Stretch four / Rim protector, etc.) and/or the skill ratings, not just raw position.
  - **Tier** the comps by projected ceiling/OVR so an elite prospect maps to a star-level comp and a role prospect maps to a role-player comp (don't compare a 99-ceiling wing to a journeyman, or vice-versa).
  - Keep selection deterministic per prospect (seeded) so a given player's comp is stable, while ensuring real variety across a draft class.
- **Related:** FEAT-14 (scouting model), BUG-19 (draft realism) — same scouting surface.
- **Priority:** P2

## Needs clarification

<!-- Items I couldn't fully structure from the brain-dump -->
