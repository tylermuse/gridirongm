# BS Football GM — Daily Feature Spec (2026-06-21 evening)

**Compiled:** Sunday, June 21, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-20 22:00 UTC → 2026-06-21 22:00 UTC (24h, **70 msgs** — highest-volume cycle in two weeks)
**Repo HEAD on main:** `a91fb9e` (bs-hoops mobile re-sign polish, PR #276). Last football engine ship on main remains `61eaead` 6/16 02:55 UTC (PR #256).
**Tyler bandwidth context:** Still 100% on bs-hoops, now 5 commits deep on `feat/bs-hoops-community-rosters`. ~50.5h cold in #general (last post 6/19 19:29 UTC "ok you got me"). Zero football engine changes on main in 5 days.

---

## Section 0 — Ships Already Landed This Cycle

Nothing. Zero MCP activity, zero Tyler posts, zero PR merges. Yesterday's MCP burst was the only activity of the week; this cycle reverted to silent.

---

## Section 1 — High-Priority This Cycle (eligible for tonight's ship)

Five items, in priority order. **The first three are independent of each other** — Tyler can greenlight any subset without ordering constraints. Items 1.4 and 1.5 are MCP-only follow-ups Tyler need not gate.

### §1.1 — Tyler-action: ban mullermila807 (CRITICAL ops/security)

**Build size: SMALL** (Tyler UI-only — human action, not engineering. Does not enter auto-merge path.)

**The ask.** Ban user `mullermila807` (Discord user ID `1514834501040078960`, aka "Amanbadness") via Discord server settings. Tyler must do this himself — MCP cannot ban.

**Why this is §1.1.** Same account, now **six total spam waves in 72h** (three more today: 00:39, 03:37, 09:31 UTC, each hitting 7 channels). Community uproar today is the worst yet:

- **Eight distinct users called for a ban in #general in 6 hours** (themainman3641, khigobrxzy, its_camare07, woahitsholly, lizardking3, bmoreoriolegm, f2clip_, and bryangrove from #football-rosters). Multiple direct Tyler-tags.
- lizardking3: "Im just trying to follow the development of a cool ass game, but **you're going to lose followers with this shit**" (msg `1518102770249498747`) — got an organic 👍.
- **Member count: 97.** Down from 100 (6/20), 103 (6/19), 105 (6/18). **Third consecutive net-negative cycle, loss rate accelerating.**
- bmoreoriolegm explicitly tied his "Add BSFootballClaw back and give him booting powers" ask to this (msg `1518057802348761242`). chiefali40 (NEW VOICE) also asked "can we get some mods to delete these bots".

The community has done its part — they've called it out, they've Tyler-tagged, they've reacted. The blocker is one click in Discord. If wave 7 hits without a ban, expect another -3 member cycle and the next wave of community asks shifts from "ban this guy" to "find me a different sim."

**Action.** Discord → BS Sports → Members → mullermila807 → Ban. Optionally delete his 21 spam messages from today first (#bug-reports msgs `1518052678855426139` + `1518097488358277191` + `1518186518466793482`; #feature-requests `1518052695846686893` + `1518097506553172009` + `1518186536829456474`; #football-strategy `1518052668373864588` + `1518097476844785666` + `1518186509692309615`; #screenshots `1518052725445628086` + `1518097533069561926` + `1518186563731853342`; #general `1518052716553965609` + `1518097524492337254` + `1518186555028668536`; #football-rosters `1518052687055290482` + `1518097497627689000` + `1518186526910054460`; #roadmap `1518052707271708713` + `1518097515323330570` + `1518186546111578223`).

**Verification.** Member count check at next sweep; confirm zero further mullermila807 posts.

---

### §1.2 — Ship the PS-walk practiceSquad-prune fix (`store.ts` passOnResigning + passOnResigningBatch)

**Build size: MAJOR** (touches `src/lib/engine/store.ts`, two store actions, in the offseason persistence flow. No SAVE_VERSION bump expected — this is a value-level prune, not a shape change — but defaults to MAJOR per the "when in doubt" rule and warrants the preview review since this seam touches FA + roster + cap state.)

**The ask.** Fix the bug bige08676 just reproduced with screenshots and three full /diagnostics captures (#bug-reports msgs `1518153518966505635` through `1518160942163169371`, 6/21 07:20-07:49 UTC). When the user clicks "let walk" on a PS-tier player in the re-signing queue:
- ✅ Currently: player.teamId → null; player removed from team.roster + depthChart; pushed to freeAgents; salary delta to totalPayroll. **All correct.**
- ❌ **Currently NOT happening: player ID is left orphaned in `team.practiceSquad`.** So the player still appears on the PS page after let-walk. If the user then clicks "Promote" on that orphan PS row, the promote action tries to add an already-detached player back to the roster — but because teamId is already null, the auto-renew guard at `store.ts:8613-8631` doesn't fire and the promotion silently no-ops.

**Diagnosis (verified in code 6/21).** `src/lib/engine/store.ts:3928-3960` `passOnResigning` (and `:3962+` `passOnResigningBatch`) currently filter `t.roster` and `t.depthChart` but do NOT filter `t.practiceSquad`. The single-line guard in `commitRolloverHotPath` at `:8613-8631` is **already landed and correct** — that fix prevents rollover from wiping multi-year PS contracts. Today's bug is a separate code path: it's the user-initiated walk action, not the season-rollover code path.

**The fix.** In both `passOnResigning` and `passOnResigningBatch`, add `practiceSquad: t.practiceSquad.filter(id => id !== playerId)` (or `.filter(id => !onUserTeam.has(id))` for the batch variant) to the team-mutation object alongside `roster` and `depthChart`. Two lines added across two functions. No type changes. No new state. No SAVE_VERSION bump.

**Why this is §1.2.** This is **the highest-leverage Football ship currently scoped** — fully diagnosed in 30 minutes from code + bige's screenshot dump, tester-verified, single-file, two-function. It closes:
- bige08676's "Both players are still showing up on my ps" symptom (msg `1518159178768846888`)
- bige08676's "And he's not showing up on the active roster" symptom (msg `1518160110650920961`) — same root cause via the orphan-teamId-null path
- The "roster count divergence" complaint thread from prior cycles

Crucially this is a **different fix** from yesterday's §1.4 (which referenced `commitRolloverHotPath` at 8613 — that code is already in main and correct). Yesterday's spec mis-scoped the surface; today's analysis from bige's screenshot dump pinpoints the real one.

**If approved, the patch.**
1. Re-read `src/lib/engine/store.ts:3927-4005` to confirm both functions' shape.
2. Add `practiceSquad: (t.practiceSquad ?? []).filter(id => id !== playerId)` to the team object in `passOnResigning`. (Match the `?? []` pattern other PS readers use to guard pre-migration saves.)
3. Add `practiceSquad: (t.practiceSquad ?? []).filter(id => !onUserTeam.has(id))` to the team object in `passOnResigningBatch`.
4. Re-read `src/app/re-sign/page.tsx` to confirm there's no separate UI-side PS list that would need an analog change. (Initial scan: no — PS is rendered off `team.practiceSquad` directly, so the store fix is sufficient.)
5. `npm run build` → must exit 0.
6. Scoped lint: `git diff --name-only main...HEAD | grep -E '\.(ts|tsx)$' | xargs -r npx eslint` → must be error-free on touched files.
7. Commit: `fix(store): prune walked PS players from team.practiceSquad on passOnResigning (refs bige08676 #bug-reports 6/21 retest)`.

**Preview gate (Tyler-required since this is MAJOR).** Push branch, get Vercel preview URL, Chrome MCP smoke-test:
- Fresh league → sim to re-signing phase → stash a player on PS → mark him "let walk" → confirm he disappears from PS page AND from re-sign queue AND appears in FA pool
- Repeat with batch "let all walk" path
- Take screenshots for the ship-it ping to Tyler.

**Verification (post-ship to prod).** Same smoke test against bs-football.com. Reply in bige08676's #bug-reports thread (`1518153518966505635`) with screenshots + retest ask, citing him by username.

---

### §1.3 — Manual position-change button (OT ↔ OG, etc.) — third demand signal

**Build size: SMALL** (UI button on the player page + a single store action that mutates `player.position`. Touches `src/app/player/[id]/page.tsx` + `src/lib/engine/store.ts` (one new action). Does not change persisted shape, does not bump SAVE_VERSION, does not touch sim core. Likely 2 files, ~40 lines. **Could go MAJOR if the position-change side-effects fan out wider than expected** — e.g., depth chart re-derivation or rating cap recalculation. Flag as SMALL with a re-classification escape hatch during implementation.)

**The ask.** Add a "Change position" UI control on the player page (and/or the FA modal) that lets the user re-label a player's position. Limit the scope at launch to **within-cluster** changes: OT ↔ OG, OG ↔ C, DE ↔ OLB, ILB ↔ OLB, FS ↔ SS, CB ↔ FS. Skip cross-cluster (no QB → WR). This matches the 5/30 leaderboard ask and answers launcher_18's specific question directly.

**Why this is §1.3.** Leaderboard demand just hit **3 distinct sources across 22 days**:
- bryangrove (5/30, original)
- tofftanaut (5/30, original)
- launcher_18 (6/21 15:16 UTC, fresh — "is there a way to change a ofensive tackle into a offensive guard")

Three sources × small build × user-asks-the-exact-question = the cleanest small ship on the board. Closes the leaderboard's longest-standing open item.

**If approved, the patch.**
1. Add `changePlayerPosition(playerId, newPosition)` action to `src/lib/engine/store.ts` after the existing position-related actions (search for `depthChart` mutators near line ~6300). Behavior: set `player.position = newPosition`; remove from old position's depth chart slot; append to new position's depth chart at the bottom (user can re-order via existing drag). Guard with a within-cluster whitelist.
2. Add a "Change position" button on `src/app/player/[id]/page.tsx` that opens a small picker with the legal targets for this player's current position.
3. Optional: same button on the FA-pool row for players still unsigned (per tofftanaut's 5/30 framing). Defer if it pushes scope past 3 files.
4. `npm run build` → must exit 0.
5. Scoped lint → must be error-free on touched files.
6. Commit: `feat(player): manual within-cluster position-change button (refs bryangrove + tofftanaut 5/30, launcher_18 6/21)`.

**If SMALL classification holds** (single store action + single UI button, no shape change) → auto-merge path after build green.
**If during implementation it expands** (e.g., needs `subPosition` recomputation, rating-cap re-eval, or trade-block side effects) → **stop and re-classify MAJOR**, then run preview gate.

**Verification.** Smoke against prod: change an OT to OG → confirm new position sticks across save/load → confirm he appears in the OG depth chart, no longer in OT.

---

### §1.4 — Diagnostics page copy fix: clarify "(not set)" for in-offseason advances

**Build size: SMALL** (pure copy change in `src/app/diagnostics/page.tsx`, ~5 lines added to the existing explainer at line 158-162. Zero engine impact, zero state change.)

**The ask.** Add one sentence to the diagnostics page header explaining that the breadcrumbs **only populate during full season rollover (playoffs → re-signing) and expansion takeover** — not during phase advances inside the offseason (re-signing → draft, draft → FA, etc.).

**Why this is §1.4.** bige08676 spent 4 messages today (msgs `1518155868200239134`, `1518157419551920220`, `1518158423169175562`, `1518160942163169371`) confused by all-(not-set) diagnostics output during his PS retest, because the surface he's testing is **inside the offseason**, not at season-rollover. The diagnostics page is doing exactly what it's coded to do — bige08676 just doesn't know its scope. A one-paragraph copy nudge prevents the next tester from filing a "diagnostics is broken" false alarm.

**If approved, the patch.**
1. Open `src/app/diagnostics/page.tsx`.
2. After the existing explainer paragraph at line 158-162, add: "**Note:** these breadcrumbs only fire during a full year-end rollover (playoffs → re-signing) or expansion takeover. If you're testing something inside the offseason (re-signing, draft, free agency), the page will correctly show '(not set)' — that's expected, not a bug."
3. `npm run build` → must exit 0.
4. Scoped lint → must be error-free.
5. Commit: `ui(diagnostics): clarify (not set) is expected for in-offseason advances (refs bige08676 6/21 confusion)`.

**Auto-merge after build green** — pure copy, SMALL with no ambiguity. No preview gate needed; just confirm on prod that the new sentence renders.

**Verification.** Read /diagnostics on prod, confirm sentence shows. Reply to bige08676 in #bug-reports thread with the link and the explanation.

---

### §1.5 — MCP follow-ups (parallel to engineering ships, no Tyler gate)

**Build size: SMALL** (three MCP Discord posts, no code change.)

**The ask.** Three MCP messages, parallelizable, no ordering. Send regardless of which engineering items Tyler approves.

**1.5a — Polite-touch to launcher_18 on his position-change ask.** Reply (or new tagged post) in #general to msg `1518273453751271574` (6/21 15:16 UTC). Acknowledge the question, link to the open leaderboard item, tell him a manual position-change button is in-flight pending tonight's sign-off, ask if he had any other positions in mind beyond OT→OG so we scope right. Keeps him engaged through two consecutive cycles.

**1.5b — Thank-you + commitment ping to bige08676 in #bug-reports.** Reply to msg `1518153518966505635` thanking him by username for the screenshot dump + structured A/B retest. Confirm root cause is pinpointed (the `passOnResigning` PS-prune omission), let him know either: (i) "fix is in flight tonight, will ping on retest" if §1.2 is approved, or (ii) "fix is scoped, awaiting bandwidth" if not. Also clarify that the diagnostics page "(not set)" he saw is expected behavior for in-offseason advances (see §1.4) — point him at /diagnostics after a full season-rollover next time. This is the **single highest-quality tester this month** — make him feel heard.

**1.5c — Polite-touch to f2clip_ in #general about his DM ask.** Reply to msg `1518136177037672540` (6/21 06:11 UTC: "check dms"). Acknowledge Tyler may not have seen yet given bs-hoops focus, ask if there's anything MCP can surface in-channel instead of via DM. f2clip_ posted twice today (this + "shut the fuck up" to the scam in #roadmap) — engaged user, worth keeping warm.

**Verification.** Confirm all 3 MCP messages posted, captured in next sweep.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — bige08676 end-of-game perf/crash (NEW BUG)

bige08676 msg `1518162107877818529` (6/21 07:54 UTC): "every little step has a noticeably longer load time… eventually leads to occasional crashes. Then frequent crashes, then eventually (around mid/late 2040s) a point where I can't complete my off-season because I can't put a trade through without a crash stopping me."

This is a memory leak, unbounded-array growth, or O(n²) algorithm somewhere in the simulation loop. **No reproducer beyond "play 20 seasons"** — unactionable until instrumented. Plan: add per-tick timing breadcrumbs in `commitRolloverHotPath` and surface them in /diagnostics (which already has `gg-rollover-tick-timings` keys per the page code) — bige can then paste the timings after running into the crash. Once we have data, scope the fix.

**Action this cycle:** None engineering-side. Surface to Tyler as the next-cycle's likely §1 candidate once instrumented data arrives. **Do not approve a fix until we have profiling data** — speculative perf fixes are how SAVE_VERSION bumps get smuggled in.

### §2.2 — Difficulty levels mega-ask (bige08676)

Three subsystems (trades / scouting / contracts), each is its own multi-week MAJOR. Promoted to #football-feature-vote leaderboard this cycle (🎚️). Reaction sampling for 72h then split into per-subsystem line items based on signal.

### §2.3 — Draft pick contract scaling (bige08676)

Promoted to leaderboard this cycle (💰). Likely SMALL — peg rookie-scale to live cap rather than frozen constant. Single engine constant + a multiplier. Hold for 72h reaction sampling; if it gets organic reactions OR appears in a second tester's commentary, promote to next cycle's §1.

### §2.4 — Practice/drill double-source signal (its_camare07 reaffirm)

its_camare07 in #roadmap 6/21 13:31 UTC: "For bs football traning to increse ovrs and stats" — reaffirms his own 6/19 Practice + Per-player-drill asks. **Same user repeating their own ask in 48h is a salience signal**, not a new source. Stays §2 until a second distinct user echoes.

### §2.5 — Member count trajectory (97, -3, -3, -5 — three net-neg cycles)

Same as yesterday's §2.4 — confounded with scam waves. If §1.1 ban lands tonight and member count stops bleeding by 6/22, scam-correlation hypothesis holds. If it keeps bleeding post-ban, look at onboarding friction / lack of football ships in 5 days / visible bs-hoops focus pulling football testers' patience.

### §2.6 — Five 6/20-promoted leaderboard items — reaction status hold

Team chemistry / Practice / Pre-season / Coach AI / Per-player drills — Pre-season + Coach AI held their 1-2 👍 from yesterday; other three still at 0. Today's two new promotions (🎚️ Difficulty levels, 💰 Draft pick scaling) start their 72h windows. Reassess sampling on 6/24 evening.

---

## Section 3 — Defer

### §3.1 — BSFootballClaw bot with booting powers (bmoreoriolegm + chiefali40)

Third-cycle community ask, now explicitly framed as "we need moderation". This is a **Discord-ops decision, not engineering** — building a moderation bot is real work that competes with football engine bandwidth, and the alternative (Tyler bans the scammer + assigns mod permissions to one trusted tester) is free. Defer until Tyler decides which lane. Note for him: if §1.1 ban lands tonight and spam stops, half the demand for this evaporates.

### §3.2 — chiefali40 UI complaint ("the ui is an eye sore")

Generic. No specifics. New voice, basketball crossover. **Don't promote to leaderboard** without a concrete ask. Optionally, MCP could reply asking him which screens specifically — but that risks looking defensive on a one-shot vague gripe. **Hold; if he posts again with specifics, scope then.**

### §3.3 — its_camare07 basketball asks (real-player pfps, G-League, OVRs, training, minutes)

Cross-domain. Belongs in bs-hoops backlog, not this football pipeline. Surface to Tyler as informational; he can decide whether to file them in the bs-hoops repo.

### §3.4 — All 5/27-5/30 standing leaderboard items

No new signal in window. Holding (except §1.3 which now has a 3rd source).

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| B1 | **PS-walk leaves orphan in team.practiceSquad** (`store.ts:3928 passOnResigning` + `:3962 passOnResigningBatch`) | bige08676 retest 6/21 07:20-07:49 UTC, 14 msgs + screenshots | **DIAGNOSED + FIX DRAFTED** (this spec) | **§1.2 if Tyler approves the MAJOR slot tonight** |
| B2 | **End-of-game perf degradation + crashes** in mid/late 2040s | bige08676 6/21 07:54 UTC | **NEW** — unactionable without instrumentation | §2.1 instrument first cycle |
| B3 | **Diagnostics page "(not set)" confusion** during in-offseason testing | bige08676 6/21 07:29-07:49 UTC | **DESIGN-INTENT** — page works correctly, copy is unclear | **§1.4 this cycle (copy fix)** |
| B4 | "2 isnt 5" (somedude4759 screenshot) | His 6/19 00:32 UTC | Clarifier sent 6/20 15:59. somedude posted in 2 channels today (replied to bige's feature post + "There are no mods") but no substantive answer. | Hold one more cycle; do not poke |
| B5 | "ai so dumb" (launcher_18) | His 6/20 11:33 UTC | No clarifier sent yet (skipped in 6/20 burst) | Bundled into §1.5a (combine with the position-change reply — same user, same channel) |
| B6 | Duplicate-Cross 3-Q disambig (tofftanaut) | Bot 6/18 01:09 UTC | Polite-touch 6/20 15:59. tofftanaut active in #general today on scam thread, no substantive answer. | Hold |
| B7 | PR #256 Reset by Position + height/weight retest (bryangrove) | Bot 6/16 02:54 UTC | Polite-touch 6/20 15:59. bryangrove posted "Boot that fool out" in #football-rosters today, no retest data. | Hold |

---

## Section 5 — Positive Signals

- **bige08676's "I love the game" preamble** to his difficulty-levels essay (msg `1518168696512712806`): *"So far I love the game (hence my cooperation in ironing out bugs). I understand I'm playing a work in progress type of thing, but the basic framework is great."* — strongest core-loop endorsement this month, from the most diligent tester. Tell-everyone-on-the-team material.
- **bige08676 delivered reference-quality QA today**: 14-message structured retest with 7 screenshots + a 3-subsystem feature essay + a new perf-bug report — all in one morning session. This is what we want every tester to look like. Cite by name in the next ship note.
- **Community immune system at full strength**: 8 distinct users called out the scammer in 6 hours, with one earning a 👍 reaction. bryangrove crossed over to anti-scam thread for the first time. The server is policing itself — Tyler just needs to close the loop with a ban.
- **First organic leaderboard reactions held** from 6/20: Pre-season exhibition games + Assistant coach AI still leading at 1 👍 each (Pre-season briefly hit 2 👍 then settled). The two-poll-item bet is paying off.
- **launcher_18 returning across two cycles** as a fresh voice with concrete asks is a healthy new-tester onboarding signal.

---

## Verification Plan

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 ban | n/a (Tyler UI) | Member count check at next sweep; confirm zero further mullermila807 posts; confirm community sentiment in #general shifts to positive within 24h |
| §1.2 PS-walk prune | `npm run build` green; scoped eslint green on store.ts; preview URL Chrome MCP smoke — fresh league → re-sign phase → stash PS player → let walk → confirm gone from PS + gone from re-sign + present in FA; repeat for batch path; screenshots | Prod URL same smoke; reply in bige08676 thread `1518153518966505635` with screenshots + retest ask, by username |
| §1.3 manual position change | `npm run build` green; scoped eslint green; if classification holds SMALL → auto-merge after build (no preview gate); spot-check on prod | Prod smoke: change an OT to OG → confirm sticks across save/load + appears in OG depth chart; reply in #general to launcher_18 (msg `1518273453751271574`) with the new UI explained, tag bryangrove + tofftanaut |
| §1.4 diagnostics copy | `npm run build` green | Read /diagnostics on prod, confirm new sentence renders; link in §1.5b reply to bige08676 |
| §1.5 MCP follow-ups | n/a | Next sweep — confirm all 3 posts present; track each recipient's reply time |

**If only §1.1 + §1.4 + §1.5 are approved** (Tyler skips both engineering items), the auto-merge path runs cleanly on §1.4 alone (pure copy, no preview gate), and §1.1 + §1.5 are Discord-only with no code path. **If §1.2 OR §1.3 is approved, the branch enters the preview gate** for Tyler-review of the affected surface before merging.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's compile, this evening)
- Prior log (carried-forward state): same file as of pre-overwrite — referenced §1 items 1.1-1.4 from yesterday's spec
- `src/lib/engine/store.ts:3927-3960` `passOnResigning` (root-cause site for B1)
- `src/lib/engine/store.ts:3962+` `passOnResigningBatch` (second root-cause site for B1)
- `src/lib/engine/store.ts:8580-8640` `commitRolloverHotPath` PS auto-renew (already-correct prior fix — referenced for contrast, not changed)
- `src/app/diagnostics/page.tsx:1-200` (B3 surface; §1.4 copy fix target)
- `src/app/re-sign/page.tsx` (verified no UI-side PS list needs analog change for §1.2)
- `CLAUDE.md` in repo root (conventions, red lines, build-size taxonomy)
- Discord anchor messages (all in BS Sports guild `1482879268424781826`):
  - bige08676 retest dump 6/21 07:20-07:49 UTC: msgs `1518153518966505635`, `1518153908365688913`, `1518154291313901569`, `1518154942160965642`, `1518155868200239134`, `1518156357218603038`, `1518157216048222289`, `1518157419551920220`, `1518158423169175562`, `1518158594938245291`, `1518159178768846888`, `1518159893465530518`, `1518160110650920961`, `1518160372660572292`, `1518160942163169371`
  - bige08676 perf/crash report: msg `1518162107877818529`
  - bige08676 difficulty-levels essay: msg `1518168696512712806`
  - bige08676 draft pick scaling: msg `1518168951346040852`
  - launcher_18 position-change ask: msg `1518273453751271574` (+ `1518273773416091648`)
  - chiefali40 UI complaint + mod ask: msgs `1518335386483425341`, `1518335641212157953`
  - bmoreoriolegm BSFootballClaw + booting powers: msg `1518057802348761242`
  - f2clip_ "check dms" to Tyler: msg `1518136177037672540`
  - lizardking3 "you're going to lose followers": msg `1518102770249498747`
  - Scam waves 4/5/6 (mullermila807, 6/21 00:39 / 03:37 / 09:31 UTC across 7 channels each): 21 anchor msgs in the log
  - 8 distinct community calls-for-ban in #general 6 hours: msgs `1518052883587792906`, `1518053188526411876`, `1518054222828933190`, `1518054657015156786`, `1518054730448765069`, `1518057727018930186`, `1518057802348761242`, `1518097614782988348`, `1518097705082163311`, `1518097784820207616`, `1518102638707867808`, `1518102770249498747`, `1518102966496792679`, `1518136177037672540`, `1518226996981661737`
  - MCP leaderboard promotions posted this cycle (§3 listing reminder for next compile): 🎚️ Difficulty levels + 💰 Draft pick scaling (msgs posted 6/21 23:0X UTC just now)
