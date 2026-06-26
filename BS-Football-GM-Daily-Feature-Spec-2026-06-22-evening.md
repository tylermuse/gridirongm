# BS Football GM — Daily Feature Spec (2026-06-22 evening)

**Compiled:** Monday, June 22, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-21 22:00 UTC → 2026-06-22 22:00 UTC (24h, **3 msgs** — 14-day low, full digest cycle after yesterday's 70-msg burst)
**Repo HEAD on main:** `a91fb9e` (bs-hoops mobile re-sign polish, PR #276). **Last football engine ship on main remains `61eaead` 6/16 02:55 UTC (PR #256) — 6 days cold.**
**Tyler bandwidth context:** Still 100% on bs-hoops, no new commits visible since `a91fb9e` on 6/21. ~74.5h cold in #general (last post 6/19 19:29 UTC "ok you got me"). 30 uncommitted bs-basketball files on working tree.

---

## Section 0 — Ships Already Landed This Cycle

**Apparent §1.1 resolution (mullermila807 spam silenced — pending confirmation).** Zero spam waves in the 24h window. The user's last post is 6/21 09:31 UTC, ~37h ago — first time the three-times-daily cadence has broken since the streak started 6/18. Member count moved +2 (97 → 99) in the same cycle, exactly matching the 6/21 §2.5 hypothesis (the bleed is scam-driven). **Tyler likely banned over the weekend, but we can't read Discord's audit log via MCP — confirmation is a Tyler-side check.** If he didn't ban and the account simply stopped, the spam-resumption risk is non-zero; either way the practical outcome (silenced) is what mattered.

**MCP follow-ups from yesterday's §1.5 — all three sent on schedule.**
- §1.5a launcher_18 polite-touch + scope question (msg `1518616012117905469`, 13:57 UTC) — **CLOSED THE LOOP.** launcher_18 replied "yes thats all" 4h later (`1518676685833244893`, 17:58 UTC) confirming OT→OG is the only swap he needs. Minimum-viable launch is now scope-locked.
- §1.5b bige08676 thank-you + commit ping (msg `1518616047400517653`, 13:58 UTC) — sent. No reply yet, but bige is a burst-tester, not a steady-drip presence; 8h cold is normal for him.
- §1.5c f2clip_ DM-vs-channel polite-touch (msg `1518616061690511380`, 13:58 UTC) — sent. No reply yet (8h cold, inside band).

**No code merges to main.** Football engine still on `61eaead` from 6/16. The 6/21 §1.2 PS-walk-prune patch remains drafted-in-spec, not yet implemented.

---

## Section 1 — High-Priority This Cycle (eligible for tonight's ship)

Three items, in priority order. **§1.1 and §1.2 are independent of each other** — Tyler can greenlight either alone. §1.3 is the MCP-only follow-up tier and doesn't need a gate.

### §1.1 — Ship the PS-walk practiceSquad-prune fix (`store.ts` passOnResigning + passOnResigningBatch)

**Build size: MAJOR** (touches `src/lib/engine/store.ts:3928-4001`, two store actions, in the offseason persistence flow. No SAVE_VERSION bump — this is a value-level prune, not a shape change — but defaults to MAJOR per the "when in doubt" rule and warrants the preview review since this seam touches FA + roster + cap state.)

**Why this is §1.1 (carried up from yesterday's §1.2).** Tyler did not greenlight this last cycle, but the diagnosis hasn't changed and the bug hasn't moved. It remains the **highest-leverage Football ship currently scoped** — diagnosed-in-code, tester-verified by bige08676's 14-message screenshot dump (6/21 07:20-07:49 UTC), single-file, two-function. Six days have now passed without a football engine ship on main; the strongest bug claim on the board has been waiting on a SHIP IT for 24h.

**The bug (verified against the live file 6/22).** Re-read `src/lib/engine/store.ts:3927-4001` this evening — the diagnosis holds verbatim:
- `passOnResigning` (line 3928-3960) `set()` block mutates the user team with `roster` + `depthChart` + `totalPayroll` — but **does not touch `practiceSquad`.** Walked players' IDs stay orphaned in `team.practiceSquad`.
- `passOnResigningBatch` (line 3962-4001) has the same omission in its `teams.map` mutation block.
- The `commitRolloverHotPath` PS auto-renew at line 8580+ is unaffected and remains correct (this was yesterday's prior-art reference, not the fix target).

bige08676 reproduced this with screenshots on 6/21: (a) "let walk" PS players still showing on /ps; (b) Promoting an orphan PS row no-ops because the player's teamId is already null and the promote action's guards don't fire on null-teamId rows.

**The fix (two lines, two functions, single file).**

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
1. Branch: `git checkout -b auto-fix/2026-06-22-evening`.
2. Edit `src/lib/engine/store.ts` per the above — two functions, no other surface touched.
3. Verify `src/app/re-sign/page.tsx` has no separate UI-side PS list (yesterday's scan said no; reconfirm before committing).
4. `npm run build` → must exit 0.
5. Scoped lint: `git diff --name-only main...HEAD | grep -E '\.(ts|tsx)$' | xargs -r npx eslint` → must be error-free on `store.ts` changes only (preexisting store.ts errors in untouched regions stay).
6. Commit: `fix(store): prune walked PS players from team.practiceSquad on passOnResigning (refs bige08676 #bug-reports 6/21 retest)`.
7. **Preview gate (MAJOR).** Push branch, get Vercel preview URL, Chrome MCP smoke:
   - Fresh league → sim to re-signing phase → stash a player on PS → mark him "let walk" → confirm gone from /ps + gone from re-sign queue + present in FA pool
   - Repeat with batch "let all walk" path
   - Take screenshots, ping Tyler with branch + files + preview URL + screenshots + build/lint status. Wait for "ship it".
8. On approval: merge to main, push, wait for prod green, Chrome MCP smoke against bs-football.com, screenshots, Dispatch to #announcements citing bige08676, reply in his thread (`1518153518966505635`) tagging him.

**Verification (post-prod).** Same smoke. Confirm in next-day sweep that bige08676 posts a retest.

---

### §1.2 — Manual position-change button (OT ↔ OG only at launch)

**Build size: SMALL** (UI button on the player page + a single store action that mutates `player.position` + depth-chart fix-up. Touches `src/app/player/[id]/page.tsx` + `src/lib/engine/store.ts` (one new action). Does not change persisted shape, does not bump SAVE_VERSION, does not touch sim core. Estimated 2 files, ~50 lines. **Carries the same re-classification escape hatch as yesterday** — if implementation discovers side-effect fan-out (subPosition recompute, rating cap re-eval, trade-block knock-ons), stop and re-classify MAJOR.)

**Why this is §1.2.** Same leaderboard fundamentals as yesterday — 3 distinct demand signals across 22 days (bryangrove 5/30, tofftanaut 5/30, launcher_18 6/21) — plus a **new tightening of scope** this cycle:

launcher_18 replied to yesterday's MCP polite-touch at 17:58 UTC today with exactly two words: **"yes thats all"** — confirming OT→OG is the only swap on his roster. That collapses the launch scope from "all within-cluster swaps" to "ship just OT/OG, follow on with others if/when a tester asks." This is the cleanest small ship currently on the board: single user-confirmed scope, smallest implementation, closes the longest-standing leaderboard item.

**Recommended launch scope (narrower than yesterday's spec).** **OT ↔ OG only.** Defer DE↔OLB, OG↔C, ILB↔OLB, FS↔SS, CB↔FS to follow-on cycles unless they get demand signal. Rationale: shipping fewer position pairs lets us verify the depth-chart re-derivation and `position` mutation path on one well-tested pair before fanning out — if it breaks something subtle, the blast radius stays small. Easy to extend later with a single whitelist edit.

**If approved, the patch.**
1. Add `changePlayerPosition(playerId: string, newPosition: Position): boolean` action to `src/lib/engine/store.ts`. Behavior: validate `newPosition` against a within-cluster whitelist (initial: `{ OT: ['OG'], OG: ['OT'] }`); set `player.position = newPosition`; remove from old position's depth chart slot; append to new position's depth chart at the bottom (user can re-order via existing drag). Return `false` if validation fails so the UI can disable the button cleanly.
2. Add a "Change position" control on `src/app/player/[id]/page.tsx` — small button next to the position label, opens a single-action menu listing the legal targets for this player's current position. Hide the control entirely if no legal targets exist (defensive: avoids surfacing it on every QB/WR/etc. page until we extend the whitelist).
3. Skip the FA-modal variant for launch — defer to follow-on if tofftanaut or bryangrove asks for it.
4. `npm run build` → must exit 0.
5. Scoped lint → must be error-free on the touched files.
6. Commit: `feat(player): manual within-cluster position-change button — OT/OG at launch (refs bryangrove + tofftanaut 5/30, launcher_18 6/21+6/22)`.

**Classification.** Holds SMALL → auto-merge after build green. **If implementation discovers any of: subPosition recompute, OL-routing knock-on, trade-block side-effect, sim-rating recap → STOP and re-classify MAJOR**, then route through the preview gate.

**Verification.** Smoke against prod after merge: pick an OT → "Change position" → OG → confirm `position` sticks across save/load + appears in OG depth chart + no longer in OT depth chart. Reply in #general to launcher_18 (msg `1518273453751271574`, also tag in the existing reply thread `1518616012117905469`) confirming live; tag bryangrove + tofftanaut as the original 5/30 askers.

---

### §1.3 — MCP follow-ups (parallel to engineering ships, no Tyler gate)

**Build size: SMALL** (one or two MCP Discord posts, no code change.)

**1.3a — Closeout reply to launcher_18 confirming scope locked.** Reply (or new tagged post in #general) to msg `1518676685833244893` ("yes thats all"). Acknowledge, say OT/OG launches first and the broader within-cluster set is queued for later cycles. This buttons up the loop he opened today — costs one MCP call, leaves him feeling heard.

**1.3b — Post §1.1 ship-prep ping to bige08676 IF Tyler greenlights §1.1.** Reply to msg `1518153518966505635` once the branch is up and Tyler is in the preview-gate review — "the patch is up for review, will ping when prod is live." Skip if §1.1 isn't approved (don't promise twice without delivery).

**Verification.** Confirm posts present in next sweep.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — bige08676 end-of-game perf/crash (carry-forward — NEW BUG, no new data)

bige08676 msg `1518162107877818529` (6/21 07:54 UTC) still the only data point: long-load-time + crashes in mid/late 2040s. **No reproducer beyond "play 20 seasons"** — unactionable until instrumented. Plan from yesterday holds: add per-tick timing breadcrumbs in `commitRolloverHotPath` and surface them in /diagnostics so bige can paste timings after he hits the crash next time. **Defer the instrumentation patch to next cycle** — shipping §1.1 + §1.2 already saturates the engineering ask for tonight, and adding speculative perf work without data risks a SAVE_VERSION-bump-by-accident.

### §2.2 — Difficulty levels mega-ask (bige08676, leaderboard 24h in)

🎚️ on leaderboard since 6/21 23:08 UTC, **zero reactions yet** (24h in). The 💰 Draft pick scaling ask got 1 organic 💰 in the same window — small differential, but the difficulty-levels ask is bigger and more abstract, so slower reactions are expected. Reassess 72h sample on 6/24 evening.

### §2.3 — Draft pick contract scaling (bige08676, 1 💰)

💰 on leaderboard since 6/21 23:08 UTC, **1 organic 💰 reaction within 24h.** First reaction signal on any new leaderboard item this week. Still SMALL implementation per yesterday's scoping. Hold for full 72h sample; if it gets a second reaction or a second tester echoes the ask, promote to §1 next cycle.

### §2.4 — Member count trajectory hypothesis (now confirmed)

Yesterday's §2.5 hypothesis was: "If §1.1 ban lands tonight and member count stops bleeding by 6/22, scam-correlation hypothesis holds." Both happened (spam silent + member count +2). **Hypothesis confirmed.** Action: keep eyes on 6/23 to check the +2 isn't a one-cycle blip; if member count holds ≥99 or grows further, retire this watch.

### §2.5 — Five 6/20-promoted leaderboard items + two 6/21-promoted items — reaction status hold

All seven 👍/🎯/🤝/🏋️/🏟️/🤖/🎚️/💰 items held their previous reaction counts (no new reactions today on the older five; 💰 picked up its first 1, 🎚️ still at 0). Reassess 6/24 evening for the 6/21 cohort.

---

## Section 3 — Defer

### §3.1 — BSFootballClaw bot with booting powers (bmoreoriolegm + chiefali40, carry-forward)

Three-cycle community ask — but the demand premise (need someone to ban the scammer) appears to have evaporated this cycle since the scammer is silent. **Halve the priority.** If no fresh wave by 6/24 evening, this can stay parked indefinitely; if the scammer returns, demand will reignite and the ask should be re-evaluated. **No action this cycle.**

### §3.2 — chiefali40 UI complaint (carry-forward, no new signal)

Generic, basketball-crossover, no specifics. He hasn't posted again. **Hold as before; if he posts with specifics, scope then.**

### §3.3 — its_camare07 basketball asks (carry-forward, no new signal)

Out of scope for football pipeline. **Surface to Tyler if he asks about bs-hoops backlog; otherwise dormant.**

### §3.4 — All 5/27-5/30 standing leaderboard items

No new signal in window. Holding (except §1.2 which still has the multi-source case made yesterday + the launcher_18 scope confirm today).

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| B1 | **PS-walk leaves orphan in team.practiceSquad** (`store.ts:3928 passOnResigning` + `:3962 passOnResigningBatch`) | bige08676 retest 6/21 07:20-07:49 UTC, 14 msgs + screenshots | **DIAGNOSED + FIX SCOPED + LIVE-FILE-REVERIFIED 6/22** | **§1.1 if Tyler approves the MAJOR slot tonight** |
| B2 | **End-of-game perf degradation + crashes** in mid/late 2040s | bige08676 6/21 07:54 UTC | **NEW** — unactionable without instrumentation | §2.1 instrument next cycle |
| B3 | **Diagnostics page "(not set)" confusion** during in-offseason testing | bige08676 6/21 07:29-07:49 UTC | **DESIGN-INTENT** — explained in MCP reply 6/22 (msg `1518616047400517653`) | RESOLVED via copy-already-explained-in-channel. Yesterday's §1.4 standalone copy-fix is now lower priority since the inline explanation went out today. Re-promote to §1 only if a second tester gets confused. |
| B4 | "2 isnt 5" (somedude4759 screenshot) | His 6/19 00:32 UTC | Clarifier 6/20 15:59. somedude posted twice 6/21, no substantive answer. Silent today. | Hold; do not poke |
| B5 | "ai so dumb" (launcher_18) | His 6/20 11:33 UTC | Folded into §1.2 path (his position-change reply 6/22 was the polite-touch); standalone clarifier deferred indefinitely | Hold |
| B6 | Duplicate-Cross 3-Q disambig (tofftanaut) | Bot 6/18 01:09 UTC | Polite-touch 6/20 15:59. Silent today. | Hold |
| B7 | PR #256 Reset by Position + height/weight retest (bryangrove) | Bot 6/16 02:54 UTC | Polite-touch 6/20 15:59. Silent today. Will be re-pinged when §1.2 ships (tags him on the original 5/30 ask) | Hold; ship-tag-as-pinger |

---

## Section 5 — Positive Signals

- **MCP polite-touch loop closed cleanly** — launcher_18 replied within 4 hours on 6/22 ("yes thats all" `1518676685833244893`), confirming OT→OG-only scope. Tightest MCP → tester engagement we've measured. Validates the polite-touch tactic for future scope-questions.
- **Member count +2 in one cycle (97 → 99)** — first net-positive cycle in 4 days. Best single-day delta since 6/14. Spam-correlation hypothesis confirmed.
- **Scam wave streak broken** — first 24h without a mullermila807 wave in 4 cycles. Pending confirmation it's a ban vs. abandonment, but practically the room is calm.
- **First organic reaction on the 6/21 leaderboard cohort** — 💰 picked up a 💰 within its first 24h. Engagement loop is producing.
- **No new bugs filed in window** — three carry-forwards (B1/B2/B3) but zero fresh reports. Suggests the surfaces other than the 6/21-flagged ones are holding stable.

---

## Verification Plan

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 PS-walk prune | `npm run build` green; scoped eslint green on `store.ts`; preview URL Chrome MCP smoke — fresh league → re-sign phase → stash PS player → let walk → confirm gone from /ps + gone from re-sign + present in FA; repeat batch path; screenshots | Prod URL same smoke; reply in bige08676 thread `1518153518966505635` with screenshots + retest ask, by username |
| §1.2 manual position change (OT/OG) | `npm run build` green; scoped eslint green; if classification holds SMALL → auto-merge after build (no preview gate); spot-check on prod | Prod smoke: change an OT to OG → confirm sticks across save/load + appears in OG depth chart; reply in #general to launcher_18 (msg `1518273453751271574` + follow-on `1518616012117905469`), tag bryangrove + tofftanaut |
| §1.3 MCP follow-ups | n/a | Next sweep — confirm posts present |
| §0 ban confirmation | n/a — Tyler-side audit-log check | Sweep 6/23 evening; if no fresh wave, declare resolved |

**If only §1.2 + §1.3 are approved** (Tyler skips §1.1), the branch is purely SMALL and auto-merges after build green. **If §1.1 is in the approved set**, the branch enters the preview gate for Tyler-review before merging.

**If "all" approved (§1.1 + §1.2 + §1.3)**, ship §1.2 first as auto-merge (cleaner cycle), then §1.1 through preview gate on the same branch (or split branches — split is cleaner since §1.1 is a different file region). Recommend: one branch per item if both approved, to keep the §1.2 auto-merge from getting tangled in the §1.1 preview gate review window.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's compile, this evening)
- `BS-Football-GM-Daily-Feature-Spec-2026-06-21-evening.md` (yesterday's spec — §1.2 and §1.3 carried into this cycle's §1.1 and §1.2 respectively after Tyler did not greenlight)
- `src/lib/engine/store.ts:3927-3960` `passOnResigning` (re-read live 6/22 — fix target for B1, diagnosis verified)
- `src/lib/engine/store.ts:3962-4001` `passOnResigningBatch` (re-read live 6/22 — fix target for B1, diagnosis verified)
- `src/lib/engine/store.ts:8580+` `commitRolloverHotPath` PS auto-renew (already-correct prior fix — referenced for contrast, not changed)
- `src/app/diagnostics/page.tsx` (B3 surface; copy-fix from yesterday now lower priority since explanation went out in MCP reply today)
- `src/app/player/[id]/page.tsx` + `src/lib/engine/store.ts` (§1.2 fix targets — confirm shape before touching)
- `src/app/re-sign/page.tsx` (verified yesterday — no UI-side PS list; reconfirm during §1.1 execution)
- `CLAUDE.md` in repo root (conventions, red lines, build-size taxonomy)
- Discord anchor messages (all in BS Sports guild `1482879268424781826`):
  - launcher_18 scope-confirm reply 6/22 17:58 UTC: msg `1518676685833244893` (reply to MCP `1518616012117905469`)
  - MCP polite-touches sent today: msgs `1518616012117905469` (launcher_18), `1518616047400517653` (bige08676), `1518616061690511380` (f2clip_)
  - Carry-forward anchors from yesterday (B1 retest dump, perf/crash report, difficulty essay, draft scaling, position-change ask, BSFootballClaw, lizardking3 followers warning, scam-wave 21-msg list): see yesterday's spec Sources section — same IDs.
  - Leaderboard promotion msgs (6/21 23:08 UTC): `1518392104513175755` (🎚️) and `1518392112570302484` (💰); the 💰 has 1 organic 💰 reaction as of this sweep.
