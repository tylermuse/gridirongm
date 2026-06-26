# BS Football GM — Daily Feature Spec (2026-06-25 evening)

**Compiled:** Thursday, June 25, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-25 01:05 UTC → 2026-06-26 01:00 UTC (~24h, **0 msgs total** — zero tester, zero commish, zero MCP)
**Repo HEAD on origin/main:** `30a0e1f` — `feat(player): manual within-cluster sub-position pin — OT/OG at launch (#317)` (still). **No football merges since 6/24 02:42 UTC.** ~47h since the last football engine ship.
**Tyler bandwidth context:** No visible bs-hoops PRs landed today either. Working tree status unknown from this vantage but the football side has been completely quiet — no new branches, no draft commits, no MCP retest replies. **The full 6/24 spec was written but none of the three §1 items were executed.** This is the first cycle in the current pipeline run where the prior cycle's greenlight slot produced zero shipped items.

---

## Section 0 — Ships Already Landed This Cycle

**None.** No football merges since PR #317 on 6/24 02:42 UTC.

**The 6/24 evening spec's three Section 1 items are all still pending:**
- §1.1 (PR #317 Dispatch + tester tags + leaderboard checkmark) — **NOT POSTED.** 47h stale.
- §1.2 (bige08676 perf instrumentation, B2) — **NOT SHIPPED.** Third unmet promise pending to bige.
- §1.3 (difficulty-levels nudge) — **NOT POSTED.** 96h at 0 reactions.

**Why this matters for today's spec.** This is not a "what should we build" cycle — it's an "execute what was already scoped" cycle. The patches were written. The MCP posts were templated. The leaderboard update was drafted. None of it landed. Today's §1 is a roll-forward of yesterday's §1 with sharpened urgency on the §1.1 credibility item, plus a fresh §1.4 to address the now-systemic execution gap.

---

## Section 1 — High-Priority This Cycle (eligible for tomorrow morning's Dispatch)

Four items, in priority order. **§1.1 has now compounded into the highest-leverage item on any spec this week** — 47h of credibility debt to three named requesters. §1.2 carries forward unchanged (third promise to bige08676 is now 114h cold). §1.3 carries forward (nudge probe at 96h). **§1.4 is new** — codify a no-confirmation 1-minute fast-path so single-action Discord-ops items can't sit stale across cycles.

### §1.1 — Post the PR #317 (manual sub-position pin) Dispatch + tester tags + leaderboard checkmark

**Build size: SMALL** (Discord-ops only — four posts + one leaderboard update + zero code change. Cannot break the build by definition; not eligible for the build gate; not subject to the preview gate. Auto-merge eligible if greenlit.)

**Why this is §1.1 (again).** PR #317 shipped to prod 47h ago. The three named requesters who drove the longest-standing leaderboard item — bryangrove (5/30), tofftanaut (5/30), launcher_18 (6/21+6/22) — remain uninformed. The #feature-vote leaderboard still shows 🛠️ Manual position-change as open. launcher_18 was explicitly promised "Will tag you when it's live so you can swap that tackle to guard" in MCP msg `1518616012117905469` 6/22 13:57 UTC. **Two cycles have now passed with that tag unfulfilled.**

The credibility cost is no longer hypothetical — it compounds with each cycle. If a fourth cycle passes (6/26 morning) without the tag, the test of whether the 4-day silence is "exhausted asks" vs "active disengagement" gets confounded — testers may have noticed the absence of acknowledgment and concluded the pipeline is broken.

**The patch is unchanged from 6/24 §1.1.** Same five posts (Dispatch, three tester tags in their source threads, leaderboard update). Exact templates retained from yesterday's spec — see 6/24 §1.1 steps 1-5 for the canonical drafts; do not re-author.

**Adjustment for the 47h delay.** The #announcements Dispatch should open with an acknowledgment of the delay, not skip past it. Suggested lead line:

> ✨ **Shipped — Manual sub-position pin (OT ↔ OG) is live on prod** (https://bs-football.com, commit `30a0e1f`, PR #317)
>
> Shipped to prod 6/24; this Dispatch is two days late — apologies for the lag. Huge thanks to <@1029311251739840532> + <@771513009574379521> + <@1265007256550903871>...

(Rest of post unchanged from 6/24 §1.1 template.)

The tester-thread replies should NOT mention the delay — they should just tag the requester and ask for retest, matching the PR #316 retest-ping cadence. The Dispatch is the right place for the acknowledgment; the individual tags are the right place for the ask.

**No code, no branch, no build, no preview gate.** Pure Discord-ops. ~5 MCP tool calls.

**Verification.** Same as 6/24 §1.1. Re-read each channel after posting, confirm tags resolve, confirm no duplicate retest pings to bige (PR #316 already has one from 02:42 UTC 6/24).

**Risk of doing nothing for a third cycle.** High. At 71h debt the gap reads as a forgotten ship; at 95h it reads as a broken pipeline. We are currently at 47h.

---

### §1.2 — Ship the bige08676 perf/crash instrumentation patch (commitRolloverHotPath per-tick timing breadcrumbs)

**Build size: MAJOR** (touches `src/lib/engine/store.ts` rollover hot path; persistent breadcrumb shape gains fields. Same rationale as 6/24 §1.2 — defaults MAJOR per the "edits sim core / store.ts" + "additive persisted-shape gain" rules. Requires preview gate.)

**Why this is §1.2 (again).** Promised in MCP msg `1518616047400517653` (6/22 13:58 UTC: "We'll add per-tick timing instrumentation so when you hit the crash next time, /diagnostics will have real data") AND re-promised in MCP msg `1519170763381280818` (6/24 02:42 UTC: "Your perf/crash report... is queued for the next investigation cycle — we'll instrument `commitRolloverHotPath`"). **The "next investigation cycle" was 6/24 evening, then 6/25 morning, now 6/25 evening — none of which has shipped it.** Third unmet promise to bige08676.

bige08676 has been the most reliable diagnostic-screenshot tester on the server (14-message A/B reproducer drove PR #316). The cost of letting his B2 promise rot longer than necessary is the credibility cost of asking him for screenshots when his prior screenshots are still un-acted-on. **If a fourth cycle passes without this ship, expect bige's next /diagnostics capture to be markedly less detailed** — testers calibrate their reproducer effort to perceived responsiveness.

**Scope, instrumentation targets, branch flow, build gate, preview gate, post-prod Dispatch, lint guidance — all unchanged from 6/24 §1.2.** See yesterday's spec for the canonical implementation plan. Branch name should bump to `auto-fix/2026-06-25-evening-1.2`.

**One new specification clarification** for the implementation:
- The breadcrumb cap (N=200 most-recent entries) should use a circular buffer pattern, not a slice-on-overflow. Slice-on-overflow allocates O(N) per overflow which would itself perturb the timings being measured. Reuse a fixed-size array with a write index modulo N. This keeps the instrumentation cost O(1) per tick regardless of save age.

**Verification (post-prod).** Same as 6/24 §1.2 — bige retest in his perf-report thread `1518162107877818529` asking him to reproduce the mid-2040s crash and paste /diagnostics.

---

### §1.3 — Re-poll-nudge MCP post on bige's 🎚️ Difficulty levels ask (now 96h, 0 reactions)

**Build size: SMALL** (one Discord post in #football-feature-vote. No code.)

**Why this is §1.3 (again).** Yesterday's §1.3 spec was written but the nudge wasn't posted. Item is now at 96h with 0 reactions, having moved from the 72h sample window to the 96h sample window without intervention.

The reads narrow further: 96h with no organic reactions in a 100-member server is meaningful negative signal **only if the cohort has had a chance to see it.** With four days of zero scrolling in the feature-vote channel (no other posts to bring eyes to that channel), the visibility floor is unclear. The nudge remains the cheapest disambiguation.

**The post text is unchanged from 6/24 §1.3:**

> 🎚️ **Quick prompt** — the difficulty levels ask from <@1501793908320112712> (6/21) hasn't picked up reactions yet; want to make sure folks have seen it. Linked above. If you'd play differently with harder trades / shakier scouting / pickier extensions, react 🎚️ on the original line. If not, no action.

**Verification.** 48h re-sample (6/27 evening). If still 0 reactions post-nudge, defer hard in 6/27 spec.

**Bundling note.** This piggybacks on the §1.1 leaderboard-update post — they can be the same #football-feature-vote visit. No extra round-trip cost.

---

### §1.4 — Codify a "one-minute fast-path" for SMALL Discord-ops items (process item, not a ship)

**Build size: SMALL** (one paragraph appended to `CLAUDE.md` or `BUGFIX_INSTRUCTIONS.md` — copy edit only, no code change.)

**Why this is §1.4.** Yesterday's three §1 items required Tyler's sign-off per the Step 3 gate. The current convention treats §1.1 (zero-code Discord-ops post) and §1.2 (MAJOR store.ts instrumentation) as equally gated on the sign-off prompt. That's the right default for engineering work, but it forces a non-trivial latency on items that are pure announcement / leaderboard / tagging plumbing. **The result is that yesterday's §1.1 — which has zero code risk and is high-credibility-value — sat on the same gate as the MAJOR §1.2 and neither got executed.**

The minimum proposal: codify that pure Discord-ops items (no git operations, no build, no commit) classified as SMALL and consisting entirely of (a) Dispatch posts about already-shipped code, (b) tester-thread tag-and-ask retest pings, or (c) leaderboard checkmark updates — should be eligible for execution on the same cycle they're scoped, without a separate sign-off prompt. The trigger for this fast-path is narrow: the item references a commit already on `origin/main`; the post text is a templated retest ping or Dispatch summary; the call-set is bounded to discord MCP tool calls and Read.

**Why this is safe.** These items have no code risk by construction — they cannot break the build, cannot regress a save, cannot push to main. The downside of a bad post is editable. The downside of a missed post is what we're seeing now: 47h credibility debt that compounds.

**Why this is §1.4 not §1.1.** It's a process change, not a tester-facing ship. It only earns priority because the cost of NOT codifying it now is that next week's PR #318 / #319 / etc. will hit the same gate and the same delay.

**The patch (proposed text, append to BUGFIX_INSTRUCTIONS.md or wherever the standing pipeline rules live):**

> **Discord-ops fast-path (SMALL only).** A Section 1 item that consists entirely of: (a) one or more #announcements Dispatch posts about a commit already on origin/main, (b) tester-thread tag-and-retest replies for a shipped commit, OR (c) a #football-feature-vote leaderboard checkmark update — and that requires zero git/npm/build operations — is eligible for execution on the same cycle it appears in the spec, without a separate sign-off prompt. The spec post still goes to Tyler for visibility, but the Discord-ops sub-items can post immediately. If the spec also contains a SMALL-or-MAJOR code item, that code item still requires sign-off; only the Discord-ops items get fast-pathed. Red lines unchanged: never post to channels other than #announcements / source #bug-reports + #feature-requests threads / #feature-vote.

**Verification.** First test of the fast-path is whether §1.1 actually lands this cycle without a separate "approve §1.1?" round-trip. If §1.4 is approved, the §1.1 posts go up immediately on the same MCP session. Subsequent cycles either confirm or refute the throughput benefit.

**Why this is the right cycle to codify it.** Three consecutive cycles have shown the pattern — yesterday's failure is the most acute symptom, but the 6/22 evening spec also had a Discord-ops §1 item that took two cycles to land. The data is now sufficient to make a confident process change.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — Total server silence — now four cycles deep

The 6/24 §2.4 framing held that "if (a) most-active testers exhausted their queued asks is right, expect chatter to resume in 12-36h once testers notice PR #316 + #317." We are now 47h past PR #317 ship and 24h past the previous 36h budget. **Zero tester response.** The activation probe (§1.1 tags) was supposed to fire this cycle to disambiguate; it didn't. So we still don't know the answer.

Narrowing further:
- **(a) Exhausted queued asks** — partly falsified. Even if no new asks, we'd expect *some* reaction to the prod ship (PR #316 went out with a Dispatch and zero tester replies followed).
- **(b) Cohort calibrated to a slower pipeline cadence** — i.e. testers noticed the 6/16 → 6/24 cold streak and stopped checking daily. Plausible. Tested by the §1.1 tags this cycle.
- **(c) Genuine cohort cooling** — schedule-related (summer, finals week ending, etc.) or product-related (saturation, the open items left don't move people). Hardest to test from inside.

**The §1.1 tag-and-ping is now the only activation probe available.** If it ships and tagged users respond within 48h, (a) or (b). If they don't, (c) becomes the leading hypothesis and 6/27 spec needs a real engagement plan.

### §2.2 — Tyler-side execution throughput — re-opens

Yesterday's §2.5 closed this watchpoint as "partially resolved." Re-opens today because the spec → execution loop produced zero ships in a 24h window despite the spec being authored and presented. **This is not a Tyler-velocity question — it's a pipeline-handoff question.** The spec was complete; the greenlight or execution step is where it fell through. §1.4 above is the proposed fix.

### §2.3 — Draft pick contract scaling (bige08676, 1 💰, now 96h in)

96h sample window arrived; still 1 organic 💰. Single-reaction signal hasn't picked up a second. Hold for one more cycle (120h on 6/26 evening). If still 1, defer hard.

### §2.4 — 6/19 + 6/20 leaderboard reaction status (f2clip_ cohort)

Five items at 1-2 reactions, now 120h in. No movement. One-week sample is 6/26 evening — defer to next cycle for the formal call.

### §2.5 — bige08676 PS-walk retest (B1)

Pinged 6/24 02:42 UTC. Now 46h since ping. No 👍 yet. **Same risk profile as §2.1** — could be exhausted-asks (bige posted heavily 6/21 and likely isn't checking Discord), could be cohort-cooling. The §1.1 reply in his B2 thread (which we'd send anyway as part of §1.2's post-prod step, if §1.2 ships) is the natural re-touch. **Do not separately polite-touch him this cycle** — would be a third unrelated ping and dilutes the §1.2 retest ask.

---

## Section 3 — Defer

### §3.1 — BSFootballClaw bot with booting powers

**Fourth consecutive cycle without a scam post.** Formal retire date 6/30 not yet reached, but with 96h since the last `discord.gg/prettygirls` post (mullermila807 6/21 09:31 UTC), the practical risk is negligible. **Lift the watch effective today.** No code action; the watch was advisory in any case.

### §3.2 — chiefali40 UI complaint, §3.3 — its_camare07 basketball asks

Carry-forward, no new signal. Hold.

### §3.4 — 5/27-5/30 standing leaderboard items

Posture unchanged. FB support, Phase 2 sub-positions, FA-pool sub-position column, team relocation, halftime depth all hold at their prior reaction counts. No action this cycle.

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| ~~B1~~ | **PS-walk leaves orphan in team.practiceSquad** | bige08676 6/21 | **CLOSED** via PR #316 6/24. Awaiting bige retest 👍. | RETIRED. |
| B2 | **End-of-game perf degradation + crashes** in mid/late 2040s | bige08676 6/21 07:54 UTC | NEW; unactionable without instrumentation. Promised twice + still un-shipped. | **§1.2 — recommend greenlight this cycle, with elevated urgency vs 6/24.** |
| ~~B3~~ | Diagnostics "(not set)" confusion | bige08676 6/21 | RESOLVED via MCP explanation 6/22. | Retired. |
| B4 | "2 isnt 5" (somedude4759 screenshot) | His 6/19 00:32 UTC | Clarifier 6/20. Silent. | Hold. |
| B5 | "ai so dumb" (launcher_18) | His 6/20 11:33 UTC | Folded into §1.1 closeout. | Hold post-§1.1. |
| B6 | Duplicate-Cross 3-Q disambig (tofftanaut) | Bot 6/18 01:09 UTC | Polite-touch 6/20. Silent. | Hold. |
| B7 | PR #256 Reset by Position retest (bryangrove) | Bot 6/16 02:54 UTC | Folded into §1.1 closeout (tag in his 5/30 source thread covers both 5/30 ask + the 6/16 retest residual). | Hold post-§1.1. |

---

## Section 5 — Positive Signals

- **Scam wave silent for the fourth consecutive cycle.** §3.1 lifts today.
- **Code state on origin/main is clean.** PR #316 and PR #317 are both on main, no regressions reported, the SAVE_VERSION bump from 6/24 hasn't surfaced a single save-load complaint in 47h.
- **The 6/24 spec's tooling worked — the gap was execution.** The Section 1 items were correctly scoped, correctly classified, correctly templated. The pipeline produced a usable spec; what didn't happen was the post-spec execution. **This is a fixable handoff problem, not a writing problem.** §1.4 is the proposed fix.
- **No new bug reports today.** Zero P0/P1 escalations across the entire football category in 96h.
- **Tyler's MAJOR-gate approval on PR #317 (6/24 21:42 Central) demonstrated the system works when the context-switch window opens.** Throughput question is "when does the window open" not "does the gate work."

---

## Verification Plan

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 PR #317 Dispatch + tester tags + leaderboard update | n/a (Discord-ops only, no build). If §1.4 approved, posts go up immediately. | Re-read each channel after posting; confirm tags resolve + embeds render; on 6/26 morning sweep confirm no "did this ship?" repeats from any of the 3 tagged users (also serves as the §2.1 cohort-cooling probe) |
| §1.2 perf instrumentation | `npm run build` green; scoped eslint green on `store.ts`; Chrome MCP preview-URL smoke — fresh league rollover → /diagnostics shows new fields with non-zero timings; deep save (5+ seasons) → breadcrumb cap holds under O(1) circular-buffer | Prod URL same smoke; reply in bige's perf-report thread `1518162107877818529` asking him to reproduce + paste /diagnostics. **This reply doubles as the §2.5 polite-touch for B1** — confirm PR #316 status in the same post to avoid a separate ping. |
| §1.3 difficulty-levels nudge | n/a | 48h re-sample (6/27 evening) — if still 0 reactions, drop to §3 |
| §1.4 fast-path codification | n/a (text-edit) | First validation is whether §1.1 lands without a separate sign-off round-trip in this same cycle |
| §2.1 cohort-cooling diagnosis | n/a | Tag-and-retest replies in §1.1 are the activation probe; 48h response window |

**Branch posture if more than one §1 approved:**
- §1.1 (Discord-ops) and §1.4 (text edit) are independent of code work — execute first.
- §1.2 (code) is the only branch this cycle. Use `auto-fix/2026-06-25-evening-1.2` per convention.
- §1.3 piggybacks on §1.1's leaderboard-update post.

**Greenlight ladder (recommended priority):**
1. **§1.1 alone** — best-case minimum, closes the 47h credibility gap, zero code risk. Cost: §1.2 slides a third cycle.
2. **§1.1 + §1.4** — adds the process change that prevents future §1.1 stalls. Still zero code risk.
3. **§1.1 + §1.3 + §1.4** — adds the leaderboard probe; same risk profile.
4. **§1.1 + §1.2 + §1.3 + §1.4 (FULL)** — full closeout. Recommended if Tyler has the same window he had on 6/24 night for PR #317.

**Recommendation if Tyler's response is "all":** execute in order 1.4 → 1.1 → 1.3 → 1.2. §1.4 first because if approved it changes the gate posture for the others. §1.2 last because it's the only branch and has the longest execution tail.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's compile — 0 messages across all 10 football channels in the 24h sweep window)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-24-evening.md` (yesterday's spec — §1.1, §1.2, §1.3 all un-executed; §1.1 and §1.2 carry forward today with the same scope but elevated urgency)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-23-evening.md` (two-cycles-prior — origin of the shipped PR #316/#317 items; the 6/24 cycle was the high-water mark for execution velocity)
- Git state on `origin/main` (unchanged since 6/24):
  - `30a0e1f` `feat(player): manual within-cluster sub-position pin — OT/OG at launch (#317)` (6/23 21:42 -0500)
  - `bb4e160` `fix(store): prune walked PS players from team.practiceSquad on passOnResigning (#316)` (6/23 21:24 -0500)
- `src/lib/engine/store.ts` — §1.2 instrumentation target; rollover hot path region per 6/23 §2.1 anchor
- `CLAUDE.md` (conventions, red lines, build-size taxonomy); §1.4 proposes appending a fast-path clause here or in `BUGFIX_INSTRUCTIONS.md`
- Discord anchor messages (BS Sports guild `1482879268424781826`):
  - PR #316 #announcements Dispatch (already posted 6/24): `1519170703373369355`
  - PR #316 bige08676 retest ping (already posted 6/24): `1519170763381280818` — third unmet promise on B2 instrumentation is inside this message
  - bige08676 perf/crash report thread anchor (B2 / §1.2 target): `1518162107877818529`
  - bige08676 PS-walk reproducer thread (B1 origin, now closed): `1518153518966505635`
  - launcher_18 most recent post (will be re-pinged on §1.1): `1518676685833244893` 6/22 17:58 UTC
  - launcher_18 origin thread for OT→OG ask: `1518273453751271574` 6/21 15:16 UTC
  - 6/22 polite-touches (where the perf-instrumentation promise originated): `1518616012117905469` (launcher_18), `1518616047400517653` (bige08676), `1518616061690511380` (f2clip_)
  - Leaderboard 5/30 poll line for the now-shipped Manual position-change item: `1510419868585824479` (checkmark target for §1.1 step 5)
  - bige08676's 🎚️ difficulty-levels poll line (§1.3 nudge target): `1518392104513175755`
- `#football-feature-vote` leaderboard last update: `1516274938636668988` (6/15 23:55 UTC); §1.1 step 5 will be the next leaderboard post.
