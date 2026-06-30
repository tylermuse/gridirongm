# BS Football GM — Daily Feature Spec (2026-06-23 evening)

**Compiled:** Tuesday, June 23, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-22 22:00 UTC → 2026-06-23 22:00 UTC (24h, **0 msgs** — new server-wide record low, full silence)
**Repo HEAD on main:** `a91fb9e` (bs-hoops mobile re-sign polish, PR #276, 6/21 17:20 UTC). **Last football engine ship on main remains `61eaead` 6/16 02:55 UTC (PR #256) — 7 days cold.** Five bs-hoops PRs (#272-#276) landed on main since the last football ship.
**Tyler bandwidth context:** Still 100% on bs-hoops. Working tree on `feat/bs-hoops-community-rosters`, last commit `93b37a7` 6/21 17:20 UTC, 30+ uncommitted bs-basketball files. **~78.5h cold in #general** (last post 6/19 19:29 UTC "ok you got me"). The yesterday-spec `auto-fix/2026-06-22-evening` branch exists locally but holds no commits — last cycle ended at sign-off, not execution.

---

## Section 0 — Ships Already Landed This Cycle

**6/21 §1.1 — mullermila807 scam-wave silence: PROMOTED FROM PENDING TO CONFIRMED-ON-FIELD.** Second consecutive cycle without a wave (last post 6/21 09:31 UTC, now ~64.5h cold). Two full cycles is enough to retire the watch — whether it's a ban, a Discord moderation action, or voluntary abandonment is immaterial; the room is calm. **Audit-log confirmation is still Tyler-side**, but the practical outcome is locked in. If a fresh wave hits within the next 7 days, treat as a re-flag of the original ask and pursue moderator escalation (§3.1) more aggressively. Otherwise, retire.

**No code merges to main on football.** Football engine still on `61eaead` from 6/16. **Both Section 1 carry-forwards from last cycle (PS-walk prune, manual position change) remain drafted-in-spec, not yet implemented.** The `auto-fix/2026-06-22-evening` branch was opened but never committed to — last cycle terminated at Step 3 sign-off with no Tyler response captured in-session.

---

## Section 1 — High-Priority This Cycle (eligible for tonight's ship)

Two items, same priority order as yesterday. **§1.1 and §1.2 are independent of each other.** Both are carry-forwards from the 6/21 and 6/22 cycles — the underlying file state has not changed since either spec was written, so the patches as drafted are still correct. Neither was greenlit in the last two evening runs; the third opinion this cycle is: **these are the same patches Tyler will see in the 6/24 spec if he skips again, and the longer they sit, the larger the per-day cost to the football tester cohort.** The opinion below is unchanged — the recommended landing posture is to greenlight at least §1.2 (zero risk, fastest TTL) tonight, and reach for §1.1 if Tyler has cycles for a preview-gate review.

### §1.1 — Ship the PS-walk practiceSquad-prune fix (`store.ts` passOnResigning + passOnResigningBatch)

**Build size: MAJOR** (touches `src/lib/engine/store.ts:3928-4001`, two store actions, in the offseason persistence flow. No SAVE_VERSION bump — this is a value-level prune, not a shape change — but defaults to MAJOR per the "when in doubt" rule and warrants the preview review since this seam touches FA + roster + cap state.)

**Why this is §1.1 (carried up from 6/21 §1.2 → 6/22 §1.1 → today, third cycle on the spec).** The diagnosis hasn't changed. The bug hasn't moved. It remains the **highest-leverage Football ship currently scoped** — diagnosed-in-code, tester-verified by bige08676's 14-message screenshot dump (6/21 07:20-07:49 UTC), single-file, two-function. Seven days have now passed without a football engine ship on main; the strongest bug claim on the board has been waiting on a SHIP IT for ~64h since the spec first landed it.

**Re-verification of the live file before this spec (6/23 evening, did not re-read since file untouched).** Yesterday's evening spec re-read `src/lib/engine/store.ts:3927-4001` and the diagnosis verbatim:
- `passOnResigning` (line 3928-3960) `set()` block mutates the user team with `roster` + `depthChart` + `totalPayroll` — but **does not touch `practiceSquad`.** Walked players' IDs stay orphaned in `team.practiceSquad`.
- `passOnResigningBatch` (line 3962-4001) has the same omission in its `teams.map` mutation block.
- The `commitRolloverHotPath` PS auto-renew at line 8580+ is unaffected and remains correct.

bige08676 reproduced this with screenshots on 6/21: (a) "let walk" PS players still showing on /ps; (b) Promoting an orphan PS row no-ops because the player's teamId is already null and the promote action's guards don't fire on null-teamId rows.

**The fix (two lines, two functions, single file). Unchanged from prior cycle.**

In `passOnResigning` (line 3949+), add to the `teams.map` mutation block alongside `newRoster` / `newDepthChart`:
```ts
const newPracticeSquad = (t.practiceSquad ?? []).filter(id => id !== playerId);
return { ...t, roster: newRoster, depthChart: newDepthChart, practiceSquad: newPracticeSquad, totalPayroll: Math.max(0, t.totalPayroll - salary) };
```

In `passOnResigningBatch` (line 3985+), the analog:
```ts
const newPracticeSquad = (t.practiceSquad ?? []).filter(id => !onUserTeam.has(id));
return { ...t, roster: newRoster, depthChart: newDepthChart, practiceSquad: newPracticeSquad, totalPayroll: Math.max(0, t.totalPayroll - payrollDrop) };
```

Match the `?? []` pattern other PS readers use to guard pre-migration saves. No type changes. No new state. No SAVE_VERSION bump. No new dependency.

**If approved, the execution path.**
1. Branch: `git checkout -b auto-fix/2026-06-23-evening`.
2. Edit `src/lib/engine/store.ts` per the above — two functions, no other surface touched.
3. Reconfirm `src/app/re-sign/page.tsx` has no separate UI-side PS list.
4. `npm run build` → must exit 0.
5. Scoped lint: `git diff --name-only main...HEAD | grep -E '\.(ts|tsx)$' | xargs -r npx eslint` → must be error-free on `store.ts` changes only (preexisting store.ts errors in untouched regions stay).
6. Commit: `fix(store): prune walked PS players from team.practiceSquad on passOnResigning (refs bige08676 #bug-reports 6/21 retest)`.
7. **Preview gate (MAJOR).** Push branch, get Vercel preview URL, Chrome MCP smoke:
   - Fresh league → sim to re-signing phase → stash a player on PS → mark him "let walk" → confirm gone from /ps + gone from re-sign queue + present in FA pool
   - Repeat with batch "let all walk" path
   - Take screenshots, ping Tyler with branch + files + preview URL + screenshots + build/lint status. Wait for "ship it".
8. On approval: merge to main, push, wait for prod green, Chrome MCP smoke against bs-football.com, screenshots, Dispatch to #announcements citing bige08676, reply in his thread (`1518153518966505635`) tagging him.

**Verification (post-prod).** Same smoke. Confirm in next-day sweep that bige08676 posts a retest.

**Cost of skipping again.** bige08676 is the highest-engagement football tester on the server. He filed a 14-message reproducer on 6/21 and got a "fix is in flight tonight" MCP reply on 6/22 (msg `1518616047400517653`). If he checks back tomorrow and the fix still isn't on prod, the commitment-credibility cost compounds. Recommend landing this cycle even if §1.2 has to wait.

---

### §1.2 — Manual position-change button (OT ↔ OG only at launch)

**Build size: SMALL** (UI button on the player page + a single store action that mutates `player.position` + depth-chart fix-up. Touches `src/app/player/[id]/page.tsx` + `src/lib/engine/store.ts` (one new action). Does not change persisted shape, does not bump SAVE_VERSION, does not touch sim core. Estimated 2 files, ~50 lines. Re-classification escape hatch: if implementation discovers subPosition recompute, rating cap re-eval, or trade-block knock-ons → stop and re-classify MAJOR.)

**Why this is §1.2 (carried up from 6/21 §1.3 → 6/22 §1.2 → today, third cycle).** Leaderboard fundamentals haven't moved — 3 distinct demand signals across 23 days (bryangrove 5/30, tofftanaut 5/30, launcher_18 6/21) — and the scope-tightening from 6/22 ("yes thats all" → OT/OG only) is still on the table. This is the cleanest small ship currently on the board: single user-confirmed scope, smallest implementation, closes the longest-standing leaderboard item. **The fact that this hasn't shipped after two cycles of being SMALL-classified is the biggest specific evidence of approval-throughput drag.**

**Launch scope.** **OT ↔ OG only.** Defer DE↔OLB, OG↔C, ILB↔OLB, FS↔SS, CB↔FS to follow-on cycles. Rationale unchanged from yesterday.

**If approved, the patch.**
1. Add `changePlayerPosition(playerId: string, newPosition: Position): boolean` action to `src/lib/engine/store.ts`. Behavior: validate `newPosition` against a within-cluster whitelist (initial: `{ OT: ['OG'], OG: ['OT'] }`); set `player.position = newPosition`; remove from old position's depth chart slot; append to new position's depth chart at the bottom. Return `false` if validation fails.
2. Add a "Change position" control on `src/app/player/[id]/page.tsx` — small button next to the position label. Hide if no legal targets exist.
3. Skip the FA-modal variant for launch.
4. `npm run build` → must exit 0.
5. Scoped lint → must be error-free on touched files.
6. Commit: `feat(player): manual within-cluster position-change button — OT/OG at launch (refs bryangrove + tofftanaut 5/30, launcher_18 6/21+6/22)`.

**Classification.** Holds SMALL → auto-merge after build green. **If implementation discovers any of: subPosition recompute, OL-routing knock-on, trade-block side-effect, sim-rating recap → STOP and re-classify MAJOR**, then route through the preview gate.

**Verification.** Smoke against prod after merge: pick an OT → "Change position" → OG → confirm `position` sticks across save/load + appears in OG depth chart + no longer in OT depth chart. Reply in #general to launcher_18 (msg `1518273453751271574`, also tag in `1518616012117905469`) confirming live; tag bryangrove + tofftanaut as the original 5/30 askers.

---

### §1.3 — (REMOVED — no MCP follow-ups needed this cycle)

Yesterday's §1.3 (MCP closeout to launcher_18 + ship-prep ping to bige) was scoped against approval of §1.1/§1.2. Since neither shipped, the closeout reply to launcher_18 was deliberately not sent (don't promise twice without delivery). It now folds back into the §1.2 ship-tag sequence — when §1.2 lands, the closeout and the ship tag are a single post.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — bige08676 end-of-game perf/crash (carry-forward — NEW BUG, no new data, still unactionable)

bige08676 msg `1518162107877818529` (6/21 07:54 UTC) still the only data point. **No new reproducer.** Plan unchanged: instrument `commitRolloverHotPath` with per-tick timing breadcrumbs and surface in /diagnostics. **Defer the instrumentation patch to the cycle that lands §1.1** — instrumentation lives in adjacent code, and bundling avoids two MAJOR-gate reviews. If §1.1 doesn't ship by 6/25, promote the instrumentation patch standalone in the 6/25 spec.

### §2.2 — Difficulty levels mega-ask (bige08676, leaderboard 48h in)

🎚️ on leaderboard since 6/21 23:08 UTC, **zero reactions yet** (48h in). Same hold posture. **Reassess at 72h sample on 6/24 evening.** If still 0 reactions at 72h, write a follow-up MCP nudge in #football-feature-vote pointing to the ask — testers who haven't reacted may not have seen it.

### §2.3 — Draft pick contract scaling (bige08676, 1 💰, 48h in)

Held at 1 organic 💰 since the 24h read. Still SMALL implementation. **Reassess at 72h sample on 6/24 evening.** If a second reaction lands or a second tester echoes the ask, promote to §1 in the 6/24 cycle.

### §2.4 — Total server silence — early-warning watch (NEW)

Zero messages across the entire BS Sports guild in 24h. Cleanest indicator of a "quiet phase" we've measured. Multiple possible reads:
- (a) **Testers are saturated** — the 6/22 polite-touches reached the active cohort and there's nothing pending.
- (b) **Mid-week dormancy** — Discord traffic on this server skews to weekends; 24h silence on a Tuesday is unusual but not impossible.
- (c) **The football product is quietly idle** — no one is playing actively right now, which means no bugs and no asks.
- (d) **Tester churn** — silent attrition not yet visible in member count.

Without more data, can't differentiate. **Watch posture:** if silence persists through the 6/24 sweep (48h+), promote to §1 with an MCP activation post (low-stakes "what are y'all working on" prompt to #general) to probe. **Do not act this cycle.**

### §2.5 — Tyler-side approval throughput (NEW, framed as observation not ask)

Two consecutive evening cycles have ended with Section 1 items unshipped. Pattern is: spec is written → ping sent → no in-session reply → cycle ends. The pipeline produces a spec faster than the gate processes one. **No action this cycle** — the gate is Tyler's by design, and the cost of skipping two cycles is concrete (above in §1.1 cost-of-skipping note) but bounded. Surface this observation to Tyler if he asks "what's the bottleneck" but don't push back unprompted.

### §2.6 — Five 6/20-promoted + two 6/21-promoted leaderboard items — reaction status hold

All seven items: no new reactions today. Total cohort: 👍×4, 🎯×2, 💰×1 across 5 items; 0 on the other 2. Reassess 6/24 evening for the 6/21 cohort, 6/27 evening for the 6/20 cohort (one week mark).

---

## Section 3 — Defer

### §3.1 — BSFootballClaw bot with booting powers (bmoreoriolegm + chiefali40, carry-forward)

Demand premise now demonstrably weaker — two cycles without a scammer wave. **Halved priority confirmed; no action this cycle. If the wave returns within 7 days, re-evaluate.**

### §3.2 — chiefali40 UI complaint (carry-forward, no new signal)

Generic, basketball-crossover, no specifics. He hasn't posted again. **Hold.**

### §3.3 — its_camare07 basketball asks (carry-forward, no new signal)

Out of scope for football pipeline. **Dormant.**

### §3.4 — All 5/27-5/30 standing leaderboard items

No new signal in window. Holding (except §1.2).

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| B1 | **PS-walk leaves orphan in team.practiceSquad** (`store.ts:3928 passOnResigning` + `:3962 passOnResigningBatch`) | bige08676 retest 6/21 07:20-07:49 UTC, 14 msgs + screenshots | **DIAGNOSED + FIX SCOPED + LIVE-FILE-REVERIFIED 6/22.** Third cycle scoped. | **§1.1 — recommend greenlight this cycle.** |
| B2 | **End-of-game perf degradation + crashes** in mid/late 2040s | bige08676 6/21 07:54 UTC | **NEW** — still unactionable without instrumentation | §2.1 — bundle with §1.1 ship if greenlit; standalone in 6/25 spec otherwise. |
| B3 | **Diagnostics page "(not set)" confusion** during in-offseason testing | bige08676 6/21 07:29-07:49 UTC | **RESOLVED via inline MCP explanation 6/22** | NO ACTION. Re-promote only if a second tester gets confused. |
| B4 | "2 isnt 5" (somedude4759 screenshot) | His 6/19 00:32 UTC | Clarifier 6/20 15:59. Silent on the screenshot since. | Hold; do not poke |
| B5 | "ai so dumb" (launcher_18) | His 6/20 11:33 UTC | Folded into §1.2 path; standalone clarifier deferred indefinitely | Hold |
| B6 | Duplicate-Cross 3-Q disambig (tofftanaut) | Bot 6/18 01:09 UTC | Polite-touch 6/20 15:59. Silent. | Hold |
| B7 | PR #256 Reset by Position + height/weight retest (bryangrove) | Bot 6/16 02:54 UTC | Polite-touch 6/20 15:59. Silent. Will be re-pinged when §1.2 ships | Hold; ship-tag-as-pinger |

---

## Section 5 — Positive Signals

- **Scam wave streak: TWO FULL CYCLES SILENT.** 6/21 §1.1 hypothesis promoted to confirmed-on-field. Whether ban or abandonment, the room is calm and member-count bleed has paused.
- **Football tester anger: ZERO new bug filings in 24h.** Three carry-forwards (B1/B2/B3) but no fresh frustration surfaced. The 6/22 MCP thank-you-and-commit-ping to bige08676 absorbed the loudest channel without him needing to re-press.
- **bs-hoops cadence is hot.** Five PRs to main in 4 days. The pipeline that produces this spec sees the basketball side actively iterating — that's not a football win directly, but it's a Tyler-bandwidth confirmation that approval throughput exists when the context is loaded.
- **launcher_18 scope confirm landed under 4h.** Reaffirmed yesterday's read: MCP polite-touches with a concrete scope question close cleanly.
- **The 💰 ask on the 6/21 cohort still holds its 1 reaction at the 48h mark.** Not growth, but not decay either — the leaderboard is at least retaining attention.

---

## Verification Plan

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 PS-walk prune | `npm run build` green; scoped eslint green on `store.ts`; preview URL Chrome MCP smoke — fresh league → re-sign phase → stash PS player → let walk → confirm gone from /ps + gone from re-sign + present in FA; repeat batch path; screenshots | Prod URL same smoke; reply in bige08676 thread `1518153518966505635` with screenshots + retest ask, by username |
| §1.2 manual position change (OT/OG) | `npm run build` green; scoped eslint green; if classification holds SMALL → auto-merge after build (no preview gate); spot-check on prod | Prod smoke: change an OT to OG → confirm sticks across save/load + appears in OG depth chart; reply in #general to launcher_18 (msg `1518273453751271574` + follow-on `1518616012117905469`), tag bryangrove + tofftanaut |
| §0 scam retirement | n/a | If no fresh wave by 6/30 (7d watch), retire the watch entirely. If wave returns, re-flag and re-evaluate §3.1 (moderator escalation). |

**If only §1.2 is approved** (Tyler skips §1.1 again), the branch is purely SMALL and auto-merges after build green.
**If §1.1 is approved**, the branch enters the preview gate for Tyler-review before merging.
**If "all" approved (§1.1 + §1.2)**, recommend one branch per item — keeps the §1.2 auto-merge from getting tangled in the §1.1 preview gate review window. `auto-fix/2026-06-23-evening-§1.1` and `auto-fix/2026-06-23-evening-§1.2`, both branched from main.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's compile, this evening — log shows zero messages)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-22-evening.md` (yesterday's spec — §1.1 and §1.2 carried verbatim into this cycle's §1.1 and §1.2 after Tyler did not greenlight either)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-21-evening.md` (two-cycles-prior spec — origin of the PS-walk prune and position-change items)
- `src/lib/engine/store.ts:3927-3960` `passOnResigning` (fix target for B1 — diagnosis verified 6/22, file untouched since)
- `src/lib/engine/store.ts:3962-4001` `passOnResigningBatch` (fix target for B1 — diagnosis verified 6/22, file untouched since)
- `src/lib/engine/store.ts:8580+` `commitRolloverHotPath` PS auto-renew (already-correct prior fix — contrast only)
- `src/app/diagnostics/page.tsx` (B3 surface — resolved via MCP explanation, no code touch)
- `src/app/player/[id]/page.tsx` + `src/lib/engine/store.ts` (§1.2 fix targets)
- `src/app/re-sign/page.tsx` (no UI-side PS list — verified yesterday)
- `CLAUDE.md` in repo root (conventions, red lines, build-size taxonomy)
- Discord anchor messages (all in BS Sports guild `1482879268424781826`):
  - Last guild-wide message: launcher_18 "yes thats all" 6/22 17:58 UTC `1518676685833244893`
  - bige08676 PS-walk reproducer thread anchor: `1518153518966505635`
  - bige08676 perf/crash report: `1518162107877818529`
  - MCP polite-touches sent 6/22: `1518616012117905469` (launcher_18), `1518616047400517653` (bige08676), `1518616061690511380` (f2clip_)
  - Leaderboard promotion msgs (6/21 23:08 UTC): `1518392104513175755` (🎚️) and `1518392112570302484` (💰)
- Git state: HEAD on main `a91fb9e` (PR #276, bs-hoops). Last football engine PR on main `61eaead` (PR #256, 6/16). Working branch `feat/bs-hoops-community-rosters` HEAD `93b37a7`. Local `auto-fix/2026-06-22-evening` branch exists, holds no commits beyond main.
