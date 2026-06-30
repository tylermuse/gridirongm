# BS Football GM — Daily Feature Spec (2026-06-24 evening)

**Compiled:** Wednesday, June 24, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-23 22:00 UTC → 2026-06-25 01:05 UTC (~27h, **2 msgs**, both autonomous MCP bot posts, 0 tester msgs)
**Repo HEAD on origin/main:** `30a0e1f` — `feat(player): manual within-cluster sub-position pin — OT/OG at launch (#317)` (6/23 21:42 Central / 6/24 02:42 UTC). **Two football engine ships landed in 18 minutes overnight:** PR #316 (`bb4e160`, PS-walk prune) and PR #317 (`30a0e1f`, manual OT/OG pin). **First multi-football-ship cycle since the 7-day cold streak began on 6/16.**
**Tyler bandwidth context:** Working tree still on `feat/bs-hoops-community-rosters` with 30+ uncommitted bs-basketball files; no new hoops PRs in the last 24h. **Tyler personally authored + co-signed both football merges last night between 21:24 and 21:42 Central** — first non-MCP-author football commits since 6/16. ~30h cold in #general (last post 6/19 19:29 UTC). Cycle-throughput drag from §2.5 of 6/23 is at least partially resolved by direct evidence.

---

## Section 0 — Ships Already Landed This Cycle

**6/23 §1.1 — PS-walk practiceSquad-prune fix: SHIPPED via PR #316 (`bb4e160`).** Two-line prune across `passOnResigning` + `passOnResigningBatch` in `store.ts` — exactly the patch the 6/21 → 6/22 → 6/23 specs scoped. +10/-2, no SAVE_VERSION bump, no migration. Dispatched to #announcements (msg `1519170703373369355`) and bige08676 was pinged for retest in #bug-reports (msg `1519170763381280818`). Three-cycle carry-forward closed. **B1 retires from the bug table.**

**6/23 §1.2 — Manual within-cluster sub-position pin (OT ↔ OG): SHIPPED via PR #317 (`30a0e1f`).** Re-classified MAJOR at execution time per the "stop and re-classify if subPosition recompute is discovered" escape hatch from the 6/23 spec — implementation added a new `Player.subPositionOverride` field that `classifyTeamSubPositions` + the per-rollover backfill honor, plus a `setSubPositionOverride` store action, plus a SAVE_VERSION 35→36 bump (additive/optional, no transform). Owner-only OL UI control on the player page. **The 5/30 leaderboard item — three named requesters, 23+ days old — is closed in code.** But see §1.1 below: **the Dispatch + tester tags + leaderboard checkmark were skipped at ship time.**

**SAVE_VERSION bump landed.** First SAVE_VERSION bump on football in this run of the pipeline. Additive-optional shape, so no migration risk to existing saves. Worth noting because it sets a precedent: PR #317 went through the MAJOR preview gate per the red-line rule and Tyler signed off in the same session — proof point that the gate works when the patch is genuinely well-scoped.

**The 7-day football-engine cold streak is broken.** Last main commit before last night was 6/16 (`61eaead`, PR #256). Two PRs in 18 minutes ended the gap.

---

## Section 1 — High-Priority This Cycle (eligible for tomorrow morning's Dispatch)

Three items. **§1.1 is the highest-leverage item on the board this cycle** — it costs nothing technically but closes a credibility gap from last night's silent ship. §1.2 is the most logical next code patch (instrumentation for B2 — promised twice in #bug-reports already). §1.3 is a low-cost leaderboard nudge.

### §1.1 — Post the PR #317 (manual sub-position pin) Dispatch that was skipped last night

**Build size: SMALL** (Discord-ops only — three new posts + one leaderboard update + zero code change. Cannot break the build by definition; not eligible for the build gate; not subject to the preview gate.)

**Why this is §1.1.** PR #317 shipped to prod ~22h ago. The three requesters who drove the 5/30 leaderboard line — bryangrove, tofftanaut, launcher_18 — were not tagged. The #feature-vote leaderboard still shows 🛠️ Manual position-change as an open item. The MCP convention every prior ship has followed (Dispatch + tester replies in their source threads + leaderboard checkmark) was broken on this one. The Dispatch for PR #316 went out fine; PR #317 was the second merge of the night and just got forgotten. **This is the lowest-cost, highest-credibility-recovery item available this cycle.** Letting the gap persist into a second day looks worse than the silent ship itself.

**The patch (four Discord posts, in order).**

1. **#announcements Dispatch.** New post matching the PR #316 announcement template:
   > ✨ **Shipped — Manual sub-position pin (OT ↔ OG) is live on prod** (https://bs-football.com, commit `30a0e1f`, PR #317)
   >
   > Huge thanks to <@1029311251739840532> + <@771513009574379521> + <@1265007256550903871> — your 5/30 → 6/6 → 6/21 → 6/22 thread is the demand signal that closed this.
   >
   > **What's new.** OL-only at launch: on the player page, owner-only "Set to OT/OG" controls + an Auto reset. The pin persists across save/load and survives the per-rollover sub-position backfill via a new `subPositionOverride` field on the player.
   >
   > **Scope.** Launch covers OT ↔ OG only. DL/LB/S/RB cluster swaps are deferred to follow-on cycles.
   >
   > **Save compat.** SAVE_VERSION 35 → 36, additive-optional shape — no migration, your existing saves load clean.
   >
   > **To try it:** load any save → /player/[id] for an OL → use the new pin control. Flag anything off in <#1482879420443394249>.
2. **#feature-requests reply** in launcher_18's source thread (msg `1518273453751271574` 5/30 — or his most recent re-press `1518676685833244893` 6/22), tagging him: "Shipped — your OT→OG swap is the launch scope. Please retest on https://bs-football.com and let me know if anything's still off."
3. **#feature-requests reply** in bryangrove's source thread, tagging him: same template, citing his 5/30 ask as origin.
4. **#feature-requests reply** in tofftanaut's source thread, tagging him: same template, citing his 5/30 ask + 6/6 demand-signal re-flag.
5. **#football-feature-vote leaderboard update.** New post:
   > 📋 **Leaderboard update — June 24 Evening Dispatch.**
   >
   > Two checkmarks today — caught up on last night's overnight ship.
   >
   > ✅ **PS-walk practice-squad cleanup** (<@1501793908320112712>, 6/21 retest origin) — already announced in <#1482879378076471459> last night; checkmark added for board parity.
   > ✅ **Manual sub-position pin (OT ↔ OG)** (<@1029311251739840532> + <@771513009574379521> + <@1265007256550903871>, 5/30 → 6/22 ask) — live on https://bs-football.com/player/[id]. ~25-day-old MAJOR ask closed.
   >
   > Both moved to the bottom of the open-items list. Open items still up for votes: [unchanged list from the 6/15 + 6/19 + 6/21 posts] — react to bump priority.

**No code, no branch, no build, no preview gate.** Pure Discord-ops via the discord MCP. Estimated 5 tool calls.

**Verification.** After posting, re-read each channel and confirm each post lands with the right tags + the right embed previews. Confirm no duplicate retest pings to bige (PR #316 has its own already from 02:42 UTC). On next morning's sweep, confirm no tester repeats the "did this ship?" question.

**Risk of doing nothing.** Two of the three tagged users (bryangrove, tofftanaut) haven't posted in weeks — they almost certainly will not notice the ship without being tagged. launcher_18 will notice if he opens the app and uses an OL, but his 6/22 "yes thats all" was the explicit close-the-loop ask. Skipping the tag means the next time he checks Discord he sees nothing happened, and the throughput-credibility cost we already paid down with last night's two-PR run partially undoes.

---

### §1.2 — Ship the bige08676 perf/crash instrumentation patch (commitRolloverHotPath per-tick timing breadcrumbs)

**Build size: MAJOR** (touches `src/lib/engine/store.ts` in the rollover hot path that the 6/22 + 6/24 MCP replies both named explicitly. No SAVE_VERSION bump — this is pure diagnostics, additive logging into the existing breadcrumb surface. Defaults to MAJOR per the "edits sim core / store.ts mutates persisted shape" rule even though shape doesn't change, because the diagnostic field will be persisted on the breadcrumb record that flows into `/diagnostics`.)

**Why this is §1.2.** The 6/22 polite-touch and the 6/24 retest ping to bige08676 both explicitly promised: "we'll instrument `commitRolloverHotPath` with per-tick timing breadcrumbs so when you hit the mid-2040s crash next time, /diagnostics will have real data to paste in." Two promises now hang on this patch. bige08676 is the most engaged football tester on the server (14-message reproducer drove PR #316) and is currently un-paid-back on this thread. With §1.1 now shipped, the natural next bundle for him is the instrumentation that makes his next crash repro actionable. **If this doesn't ship in the next 48h, the third tester touchpoint will be a fourth promise to instrument, with nothing to show.**

**What to instrument.** Per the 6/23 §2.1 plan:
- In `commitRolloverHotPath` (per the prior spec anchor at `src/lib/engine/store.ts:8580+`), wrap each per-team / per-substep block in a high-resolution timer (`performance.now()` differential).
- Add the timing + roster-size + the substep name to the existing breadcrumb record that gets surfaced on `/diagnostics`.
- Cap the breadcrumb payload to the most recent N=200 entries to avoid unbounded growth in saves that crash partway through a multi-season rollover.
- No new dependency. No new file. No persisted shape change to the team/player models — only the in-flight breadcrumb record gains fields.

**If approved, the execution path.**
1. Branch: `git checkout -b auto-fix/2026-06-24-evening-1.2`.
2. Edit `src/lib/engine/store.ts` only — instrument the rollover hot path; thread the timing fields into the breadcrumb record; verify the `/diagnostics` reader displays the new fields gracefully when present and silently when absent.
3. `npm run build` → must exit 0.
4. Scoped lint: `git diff --name-only main...HEAD | grep -E '\.(ts|tsx)$' | xargs -r npx eslint` → must be error-free on `store.ts` changes; pre-existing store.ts lint debt is out of scope.
5. Commit: `feat(diagnostics): per-tick timing + roster-size breadcrumbs in commitRolloverHotPath (refs bige08676 #bug-reports 6/21 perf report 1518162107877818529)`.
6. **Preview gate (MAJOR).** Push branch, get Vercel preview URL, Chrome MCP smoke:
   - Fresh league → sim through one full season-rollover → /diagnostics shows the new per-tick rows with non-zero timings + matching roster sizes.
   - Repeat on a save 5+ seasons deep (use an export from the dev test fixtures if needed) to confirm the breadcrumb cap holds.
   - Screenshot the /diagnostics rows. Ping Tyler with branch + files + preview URL + screenshots + build/lint status. Wait for "ship it".
7. On approval: merge to main, push, wait for prod green, Chrome MCP smoke against bs-football.com, screenshot, Dispatch to #announcements + reply in bige08676's perf-report thread (`1518162107877818529`) asking him to reproduce his mid-2040s crash and paste /diagnostics.

**Why MAJOR even though shape is unchanged.** The breadcrumb record is persisted in the user's local store between the start and end of a rollover, and the rollover hot path is sim-core-adjacent. The MAJOR default + the preview-gate review is the right posture per CLAUDE.md.

**Verification (post-prod).** bige08676 reproduces the crash → /diagnostics shows which substep + which team + cumulative-vs-spike timing → the next investigation cycle has actual data. The patch ships even if he doesn't crash again immediately; the value is the next time anyone hits perf trouble in a long save.

---

### §1.3 — Re-poll-nudge MCP post on bige's 🎚️ Difficulty levels ask (72h, 0 reactions)

**Build size: SMALL** (one Discord post in #football-feature-vote. No code.)

**Why this is §1.3.** Tagged this morning at the 72h sample window per 6/23 §2.2. Item still has 0 reactions, 72h in. Two reads — either the cohort hasn't seen it, or there's no demand. A single nudge post is the cheapest way to disambiguate. If still 0 after the nudge, defer hard.

**The post.**
> 🎚️ **Quick prompt** — the difficulty levels ask from <@1501793908320112712> (6/21) hasn't picked up reactions yet; want to make sure folks have seen it. Linked above. If you'd play differently with harder trades / shakier scouting / pickier extensions, react 🎚️ on the original line. If not, no action.

**Verification.** 48h after the nudge (6/26 evening), re-sample. If still 0 reactions, move 🎚️ to §3 deferrals in the 6/26 spec. If 1+ reactions, treat as live demand and re-evaluate priority.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — bige08676 end-of-game perf/crash — promoted to §1.2 this cycle

See §1.2. Was §2.1 yesterday; bundling-with-§1.1 condition is satisfied (PS-walk shipped without instrumentation along for the ride; carry instrumentation standalone now).

### §2.2 — Difficulty levels mega-ask (bige08676, 72h, 0 reactions) — promoted to §1.3 nudge

See §1.3. If the nudge doesn't move reactions, this drops to §3 next cycle.

### §2.3 — Draft pick contract scaling (bige08676, 1 💰, 72h in)

Held at 1 organic 💰. Still SMALL implementation (peg the rookie-scale table to the live cap). **Reassess at 96h sample on 6/25 evening.** If a second 💰 lands or a second tester echoes, promote to §1 in the 6/25 cycle. No nudge this cycle — one organic reaction is real interest, the nudge would muddy the signal.

### §2.4 — Total server silence — promoted from "watch" to "pattern"

Third consecutive cycle with zero tester messages. The 6/23 §2.4 "early-warning watch" graduates. Possible reads narrowing:
- (a) Most likely: **active testers exhausted their queued asks** — bige08676 + launcher_18 + bryangrove + tofftanaut all posted heavily in the 6/19-6/22 window and are now waiting on ships (two of which just landed last night).
- (b) **Mid-week-into-weekday dormancy** — but we're now into a Wednesday post-overnight-ship-window; if (a) is right, expect chatter to resume in 12-36h once testers notice PR #316 + #317.
- (c) **Tyler-side hoops focus is contagious** — the football tester pool senses the cadence drop and disengages.

**Test:** the §1.1 Dispatch + tester tags this cycle is itself the activation probe. If the three tagged requesters don't reply or react within 48h post-tag, that's evidence the football cohort is genuinely cooling. If they do reply, (a) is confirmed and we hold the line.

**Do not post a generic "what are y'all working on" prompt this cycle** — that would compete with the §1.1 Dispatch and dilute the signal.

### §2.5 — Tyler-side approval throughput — partially resolved

Tyler signed off + co-authored both football merges last night between 21:24 and 21:42 Central. Two MAJOR-class items processed in 18 minutes. **The throughput drag flagged in 6/23 §2.5 is at least partially false** — the gate ran fine when a Tyler context-switch window opened. Reframe for next cycle: not a throughput problem, a **batching problem** — football execution happens in bursts when Tyler pivots from hoops, rather than continuously. Build the spec to be greenlight-bursty-friendly.

### §2.6 — 6/19 + 6/20 leaderboard reaction status hold

All 6/19 cohort items (chemistry, practice mechanic, pre-season, assistant coach AI, drill system) still at 1-2 reactions, 96h in. No movement, no decay. Reassess on 6/26 evening (one-week mark for the 6/19 cohort).

---

## Section 3 — Defer

### §3.1 — BSFootballClaw bot with booting powers

**Third consecutive cycle without a scam post.** Retire pre-emptively if 6/25 is clean — formal retire date 6/30 (7-day mark) per yesterday's plan, but the practical watch can lift now. **No action this cycle.**

### §3.2 — chiefali40 UI complaint

Carry-forward, no new signal. **Hold.**

### §3.3 — its_camare07 basketball asks

Out of scope. **Dormant.**

### §3.4 — 5/27-5/30 standing leaderboard items (post-§1.2 ship)

§1.2 (manual position pin) has closed. Remaining 5/27-5/30 items (FB support, Phase 2 sub-positions, FA-pool sub-position column, team relocation, halftime depth) hold posture unchanged. **No action this cycle.**

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| ~~B1~~ | **PS-walk leaves orphan in team.practiceSquad** | bige08676 6/21 | **CLOSED** via PR #316 6/24. Awaiting bige retest 👍. | RETIRED FROM TABLE. |
| B2 | **End-of-game perf degradation + crashes** in mid/late 2040s | bige08676 6/21 07:54 UTC | NEW, unactionable without instrumentation. | **§1.2 — recommend greenlight this cycle.** |
| ~~B3~~ | Diagnostics "(not set)" confusion | bige08676 6/21 | RESOLVED via MCP explanation 6/22. | Already retired. |
| B4 | "2 isnt 5" (somedude4759 screenshot) | His 6/19 00:32 UTC | Clarifier 6/20 15:59. Silent. | Hold. |
| B5 | "ai so dumb" (launcher_18) | His 6/20 11:33 UTC | Effectively folded into §1.1 closeout (PR #317 ship-tag includes the loop he's been waiting on). | Hold post-§1.1. |
| B6 | Duplicate-Cross 3-Q disambig (tofftanaut) | Bot 6/18 01:09 UTC | Polite-touch 6/20. Silent. | Hold. |
| B7 | PR #256 Reset by Position retest (bryangrove) | Bot 6/16 02:54 UTC | Effectively folded into §1.1 closeout (PR #317 ship-tag = he's pinged). | Hold post-§1.1. |

---

## Section 5 — Positive Signals

- **TWO FOOTBALL ENGINE PRS LANDED IN 18 MINUTES OVERNIGHT.** First multi-football-ship cycle since pre-6/16. Both items had been on the spec for 2-3 consecutive cycles. The throughput pessimism from 6/23 §2.5 is at least partially falsified.
- **Tyler-co-authored both merges personally.** Not pipeline-only-author commits — Tyler was hands-on for the approval and merge step on both. Highest engagement-signal of the week from the project owner.
- **SAVE_VERSION bump landed cleanly through the MAJOR gate.** First production SAVE_VERSION bump in the current pipeline run, on a patch that explicitly invoked the "re-classify SMALL→MAJOR if you discover shape change" escape hatch. **Proof the red-line + escape-hatch system works in practice.**
- **bige08676 was retest-pinged inside the same MCP cycle as the ship.** ~22h turnaround from "fix scoped" to "live on prod, please retest" — the fastest single-tester closeout in the current run.
- **Scam wave silent for the third consecutive cycle.** §3.1 is functionally retired even before the formal 7-day mark.
- **The MAJOR-classified §1.2 escape-hatch was used correctly.** The 6/23 spec flagged "if implementation discovers subPosition recompute → STOP and re-classify MAJOR" and that's exactly what happened — execution discovered the recompute, stopped, re-classified, ran the preview gate, and shipped clean. The spec did its job as a guardrail.

---

## Verification Plan

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 PR #317 Dispatch + tester tags + leaderboard update | n/a (Discord-ops only, no build) | Re-read each posted channel, confirm tags resolve + embeds render; on next-morning sweep confirm no "did this ship?" repeats from any of the 3 tagged users |
| §1.2 perf instrumentation | `npm run build` green; scoped eslint green on `store.ts`; Chrome MCP preview-URL smoke — fresh league rollover → /diagnostics shows new fields with non-zero timings; deep save (5+ seasons) → breadcrumb cap holds | Prod URL same smoke; reply in bige's perf-report thread `1518162107877818529` asking him to reproduce + paste /diagnostics |
| §1.3 difficulty-levels nudge | n/a | 48h re-sample (6/26 evening) — if still 0 reactions, drop to §3 |
| §0 scam retirement | n/a | If 6/25 is also silent, lift the watch effective immediately |

**Branch posture if more than one §1 approved:**
- §1.1 (Discord-ops) and §1.2 (code) are independent — execute §1.1 first, then branch + ship §1.2. §1.1's outcome doesn't gate §1.2.
- §1.2 is the only branch this cycle. Use `auto-fix/2026-06-24-evening-1.2` per convention.
- §1.3 piggybacks on the §1.1 post sequence (one extra channel) — does not need its own branch or build.

**If only §1.1 is approved** — best-case-minimum: credibility gap from last night closes, tester pool gets the tag they're owed, no code risk. Cost: B2 instrumentation slides another cycle, fourth promise to bige looms.

**If §1.1 + §1.3 approved** — same as above, plus the difficulty-levels demand signal gets a clean disambiguation test.

**If §1.1 + §1.2 (+ §1.3) approved** — full closeout: credibility caught up, B2 actionable, and the leaderboard nudge probes demand. Recommended posture if Tyler has bandwidth, since §1.1 is zero-risk and §1.2's preview gate is no heavier than last night's PR #317 review.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's compile, this evening — log shows two MCP-bot posts and zero tester msgs in the sweep window)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-23-evening.md` (yesterday's spec — §1.1 + §1.2 both shipped per spec; §2.1 promoted to §1.2 today; §2.4 graduates from watch to pattern)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-22-evening.md` (two-cycles-prior — origin of both shipped items)
- Git state on `origin/main`:
  - `30a0e1f` `feat(player): manual within-cluster sub-position pin — OT/OG at launch (#317)` (6/23 21:42 -0500)
  - `bb4e160` `fix(store): prune walked PS players from team.practiceSquad on passOnResigning (#316)` (6/23 21:24 -0500)
  - `26f4bc0` and prior — all bs-hoops PRs (#315 → #271)
- `src/lib/engine/store.ts` — both shipped patches landed here; §1.2 instrumentation target is the same file (rollover hot path region anchored in 6/23 §2.1)
- `src/app/player/[id]/page.tsx` — owner-only OT/OG control surface added in PR #317
- `CLAUDE.md` (conventions, red lines, build-size taxonomy — MAJOR re-classification rule invoked correctly on PR #317)
- Discord anchor messages (BS Sports guild `1482879268424781826`):
  - PR #316 #announcements Dispatch (already posted): `1519170703373369355`
  - PR #316 bige08676 retest ping (already posted): `1519170763381280818`
  - bige08676 perf/crash report thread anchor (B2 / §1.2 target): `1518162107877818529`
  - bige08676 PS-walk reproducer thread (B1 origin, now closed): `1518153518966505635`
  - launcher_18 most recent post (will be re-pinged on §1.1): `1518676685833244893` 6/22 17:58 UTC
  - 6/22 polite-touches: `1518616012117905469` (launcher_18), `1518616047400517653` (bige08676), `1518616061690511380` (f2clip_)
  - Leaderboard 5/30 poll line for the now-shipped Manual position-change item: `1510419868585824479` (checkmark target for §1.1 step 5)
  - bige08676's 🎚️ difficulty-levels poll line (§1.3 nudge target): `1518392104513175755`
- `#football-feature-vote` leaderboard last update: `1516274938636668988` (6/15 23:55 UTC); §1.1 step 5 will be the next leaderboard post.
