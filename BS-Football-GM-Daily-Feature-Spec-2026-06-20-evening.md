# BS Football GM — Daily Feature Spec (2026-06-20 evening)

**Compiled:** Saturday, June 20, 2026 evening fire
**Pipeline:** daily-discord-spec autonomous
**Source log:** `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md`
**Sweep window:** 2026-06-19 22:00 UTC → 2026-06-20 22:00 UTC (24h, 24 msgs)
**Repo HEAD on main:** `3ada025` (bs-basketball CI commit, pre-window). Last football engine ship on main: `61eaead` 6/16 02:55 UTC (PR #256).
**Tyler bandwidth context:** Still 100% on bs-hoops. 27 uncommitted bs-basketball changes on working tree. Zero Tyler posts in window (~26.5h cold since 6/19 19:29 UTC "ok you got me").

---

## Section 0 — Ships Already Landed This Cycle

These shipped during the window via the prior cycle's approvals; documenting for the record. No action required.

- **§0.1 — BSFootballMCP polite-touch to bryangrove on PR #256 retest** (msg `1517921861416255570`, 6/20 15:59:33 UTC). Resolved the 133h-cold overdue from yesterday's spec.
- **§0.2 — BSFootballMCP polite-touch to tofftanaut on duplicate-Cross disambig** (msg `1517921874468798606`, 6/20 15:59:36 UTC). Resolved the 110h-cold overdue.
- **§0.3 — BSFootballMCP clarifier to somedude4759 on "2 isnt 5"** (msg `1517921885428383974`, 6/20 15:59:39 UTC). Ball in his court.
- **§0.4 — Five #football-feature-vote leaderboard promotions** (its_camare07's 6/19 backlog: Team chemistry, Practice, Pre-season, Coach AI, Per-player drills — msgs `1517921955758473307` through `1517922007608725566`, 6/20 15:59:55-16:00:08 UTC). **Organic 👍 already on Pre-season and Coach AI** — first reactions on a leaderboard promotion.

---

## Section 1 — High-Priority This Cycle (eligible for tonight's ship)

### §1.1 — Tyler-action: ban mullermila807 (CRITICAL ops/security)

**Build size: SMALL** (Tyler UI-only — not a code change; flagged SMALL for pipeline purposes but does not enter the auto-merge path. This is a HUMAN-ACTION item, not an engineering item.)

**The ask.** Ban user `mullermila807` (Discord user ID `1514834501040078960`, aka "Amanbadness") via the Discord server settings UI. Tyler must do this himself — MCP does not have ban permission.

**Why this is §1.1.** Same account just executed its **third spam wave** in 48 hours:
- Wave 1: 6/18 23:42 UTC (`@everyone` + attachments across 6 channels)
- Wave 2: 6/19 09:10 UTC (joe_biden5598 unprompted Tyler-tag)
- Wave 3: 6/20 17:28:05-17:28:15 UTC — **7 channels in 10 seconds** (#bug-reports, #feature-requests, #football-strategy, #screenshots, #football-rosters, #general, #roadmap)

The community has now reached **confused-new-user** stage: `icantletugoo` posted "Why do I keep getting pinged" at 17:56 UTC. Member count has dropped from 105 → 103 → 100 across the two cycles spam has been active. **Failing to ban tonight risks another net-negative cycle.**

its_camare07 has self-policed in two consecutive cycles ("@mullermila807 grow up" today, 17:29 UTC) — the community has done its part. The blocker is Tyler-action.

**Action.** Open Discord → BS Sports → Members → mullermila807 → Ban. Optionally delete the 7 spam messages first (msgs `1517944143639347211`, `1517944152162046065`, `1517944158214553804`, `1517944164132589618`, `1517944170163998760`, `1517944176338141205`, `1517944183376187722`).

**Verification.** Confirm member count drops 1 (100 → 99) post-ban; confirm no further mullermila807 posts in any channel by next sweep.

---

### §1.2 — MCP clarifier to launcher_18 on "ai so dumb"

**Build size: SMALL** (single MCP Discord reply, no code change.)

**The ask.** Send a polite, scoped clarifier from BSFootballMCP to `launcher_18 / JustAnotherPlayer` (user posting as "launcher_18") replying to msg `1517854893027758130` in #general (6/20 11:33 UTC: "bro why is the ai so dumb").

**Why this is §1.2.** Launcher_18 is a **brand-new voice** flagged MED-priority in yesterday's spec. The 15:59 UTC polite-touch burst covered bryangrove, tofftanaut, and somedude4759 but **skipped him.** He's now ~10.5h cold from his post and ~3h cold from a burst that he should have been in. Cheap to keep warm — new testers churn fast if their first post lands in silence.

**Reply scope.** Ambiguity-resolver, NOT a fix. The gripe "ai so dumb" could be any of:
- (a) Game-AI play-calling (run/pass mix, situational calls, clock management)
- (b) Opponent scheme selection / coverage / blitz choices
- (c) Trade AI (proposing or accepting trades)
- (d) Draft AI (CPU draft logic, weird picks)
- (e) Free-agent AI (signing wrong positions, ignoring needs)
- (f) CPU coach hire/fire / contract decisions

Ask him which of those 6 surfaces he meant + a screenshot if possible. Keep the reply under 8 lines. No promises on fix timing.

**Reply target.** #bug-reports thread reply via `replyToMessageId: "1517854893027758130"` — or post in #general as a tagged reply if cross-channel is messier.

**Verification.** Confirm MCP message posted, captured in next sweep's #general read; track launcher_18's response time (target inside 24-72h band).

---

### §1.3 — Investigate "in-server triage bot" intent (woahitsholly + bmoreoriolegm)

**Build size: SMALL** (one MCP question post, then read the reply; no code change.)

**The ask.** Send one BSFootballMCP message in #general (NOT a reply — fresh thread) asking the community whether they'd actually use an in-server triage/spam-detection bot, OR if "BSFootballClaw" callbacks are pure comedy. Tag woahitsholly + bmoreoriolegm in the question.

**Why this is §1.3.** Two consecutive cycles, two different users (bmoreoriolegm 6/19 "sentient bot that just offers random advice" + woahitsholly 6/20 "we need BSFootballClaw back because I can't tell if this is a scam"), both half-joke half-real. The 6/20 post specifically frames the want as **scam-triage help** — which is a real gap given Tyler hasn't banned mullermila807 in 36h+.

If this is a real ask, the build is **moderate** (Discord moderation bot, would compete with existing MCP for permissions). If it's pure comedy, drop it. Spending 1 MCP post + 24h to disambiguate is cheap.

**Reply scope.** "Curious — was the 'BSFootballClaw back' line just for the bit, or would y'all actually want an in-server scam/spam-flagger bot? If real, what surfaces (auto-react to scam patterns? clarifier-question helper? both?). Reply or 👍 if real ask."

**Verification.** Read 24h of reactions/replies before next cycle's spec; promote to a real #football-feature-vote line item if signal is positive (3+ 👍 or 2+ substantive replies). Otherwise close the question.

---

### §1.4 — Ship the PS-contract-wipe guard (`store.ts:8613`)

**Build size: MAJOR** (edits sim core — `store.ts` is the persisted-shape mutator AND this fix sits in `commitRolloverHotPath` which is invoked across season-rollover persistence. The scoping note at `notes/roster-count-divergence-scoping.md` flags this as a single-line guard, but per CLAUDE.md it's MAJOR because it touches store.ts. Per the red lines, defaults to MAJOR.)

**The ask.** Land the one-line guard in `src/lib/store.ts` line ~8613 inside `commitRolloverHotPath` that currently unconditionally wipes PS contracts during rollover. The scoping note (`notes/roster-count-divergence-scoping.md`) has the recommended fix already drafted. The bug surfaces as bige08676's "roster count divergence" report (A/B sign-one/walk-one test, three-moment /diagnostics).

**Why this is §1.4.** This is the **highest-leverage Football ship currently scoped.** Fully diagnosed (root cause IDENTIFIED in the 6/18 §1.2 scoping note revision), single-file, one-line guard, with a 4-number invariant we can assert against (`byTeamId - PS - IR === roster.length`). bige08676 has been waiting since the original report; the scoping note independently confirmed his hypothesis was correct in mechanism (just wrong on which line). Shipping this clears a real persistent-state bug AND lets the MCP A/B-confirmation thread close warmly.

**Why it's not §1.1.** Tyler is still 100% on bs-hoops with 27 uncommitted changes on the working tree. A MAJOR Football PR right now competes with his bs-hoops headspace AND requires a preview-review gate (Step 5) per the pipeline. The §1.1 scam ban is unblocking (10 seconds of Tyler-attention); §1.2/§1.3 are MCP-only and skip Tyler entirely. §1.4 sits behind those because it's the only one that costs Tyler real focus tonight.

**If approved, the patch.**
1. Read `notes/roster-count-divergence-scoping.md` end-to-end before touching code.
2. Read `src/lib/store.ts` around lines 8580-8640 to confirm `commitRolloverHotPath` shape and the unconditional wipe.
3. Apply the recommended single-line guard. NO SAVE_VERSION bump (this is a read-side guard against bad rollover behavior, not a persisted-shape change — verify by checking nothing in the diff alters the saved shape; if it does, STOP and re-classify).
4. Add a unit test or an inline invariant assertion (`byTeamId - PS - IR === roster.length`) at the seam if a test file exists for store.ts rollover; if not, document the manual verification in the commit body.
5. `npm run build` → must exit 0.
6. Scoped lint: `git diff --name-only main...HEAD | grep -E '\.(ts|tsx)$' | xargs -r npx eslint` → must be error-free on touched files.
7. Commit: `fix(store): guard commitRolloverHotPath against wiping PS contracts (refs bige08676 report; closes scoping note)`.

**Preview gate.** Push branch, get Vercel preview URL, drive Chrome MCP to smoke-test:
- Fresh league → sim 2 seasons → confirm PS contracts persist across rollover
- Run /diagnostics (or equivalent) → confirm invariant holds
- Take screenshots for the ship-it ping to Tyler.

**Verification (post-ship to prod).** Same smoke test against bs-football.com. Reply in bige08676's #bug-reports thread with screenshots + retest request.

---

## Section 2 — Investigate (defer hard call until more signal)

### §2.1 — somedude4759 "2 isnt 5" screenshot — substantive answer still owed
MCP clarifier shipped at 15:59 UTC (msg `1517921885428383974`). somedude posted "LMAO" at 18:19 in #bug-reports but that's a scam-thread reaction, not a substantive answer. Hold for one more cycle. Reassess at next sweep — if still no substantive reply by 6/22 evening, do NOT poke (he's a regular, won't churn).

### §2.2 — bige08676 A/B 44h cold (right at upper band edge)
Last MCP ping 6/19 19:06 UTC. Inside 24-72h band. The scoping note already independently diagnosed root cause so his A/B is now confirmatory not load-bearing. **Hold — do not poke.** If §1.4 ships tonight, his thread gets a much better signal (the fix itself + retest ask) than another polite-touch.

### §2.3 — Five newly-promoted leaderboard items — reaction sampling
Pre-season + Coach AI got 1 👍 each in first ~6h on the leaderboard. Other three (Team chemistry, Practice, Per-player drills) at 0. Hold a 72h sampling window before doing anything (re-prompt, deprioritize, or escalate). Promote to spec-priority if any single item hits 3+ 👍.

### §2.4 — Member count trajectory (100, -3, -5)
Two consecutive net-negative cycles. Plausibly correlated with scam waves + OpenClaw saga. Confounded — can't disentangle without more data. If §1.1 ban lands tonight AND member count stops bleeding by 6/22, the scam-correlation hypothesis holds. If member count keeps dropping post-ban, look elsewhere (onboarding friction? lack of feature ships? bs-hoops focus visible to football testers?).

---

## Section 3 — Defer

### §3.1 — All five its_camare07 leaderboard items as engineering work
Team chemistry, Practice, Pre-season, Coach AI, Per-player drills are all MAJOR multi-week builds. Not eligible for tonight's fire even if they get reaction signal — they need a real product-shaping cycle first. Park.

### §3.2 — launcher_18 fix (whichever AI surface he meant)
Until §1.2 clarifier comes back with an answer, can't scope a fix. Defer to next cycle.

### §3.3 — All 5/27-5/30 standing leaderboard items
No new signal in window. Holding.

---

## Section 4 — Bugs (consolidated triage)

| # | Bug | Source | Status | Recommended |
|---|-----|--------|--------|-------------|
| B1 | PS-contract-wipe in `commitRolloverHotPath` (`store.ts:8613`) | bige08676 6/16-ish report; root cause confirmed by scoping note 6/19 02:50 UTC | **DIAGNOSED, FIX DRAFTED** in scoping note | **§1.4 if Tyler approves the MAJOR slot tonight** |
| B2 | "2 isnt 5" (somedude4759 screenshot, msg `1517326293870444667`) | His 6/19 00:32 UTC report | **CLARIFIER SENT 6/20 15:59 UTC**, awaiting substantive reply | Hold one cycle |
| B3 | "ai so dumb" (launcher_18, msg `1517854893027758130`) | His 6/20 11:33 UTC report | **AMBIGUOUS — NO CLARIFIER SENT YET** | **§1.2 this cycle** |
| B4 | Duplicate-Cross three-question disambig (tofftanaut, multi-cycle) | Bot 6/18 01:09 UTC | Polite-touch shipped 6/20 15:59 UTC; clock reset | Hold |
| B5 | PR #256 Reset by Position + height/weight retest (bryangrove) | Bot 6/16 02:54 UTC | Polite-touch shipped 6/20 15:59 UTC; clock reset | Hold |

---

## Section 5 — Positive Signals

- **its_camare07 4-channel engagement burst** (4 posts in window: rebuild brag, two scam call-outs, one comedic reply). Continues to be the most-engaged tester week-over-week.
- **First organic leaderboard reactions** since the #football-feature-vote leaderboard was instituted: 👍 on Pre-season + Coach AI. Pre-season is a Madden-staple ask; Coach AI overlaps with 305mike's prior auto-FA ask — combined signal is the strongest engineering-cohesion bet across the new items.
- **Two-cycle community self-policing on scam** (its_camare07 today, joe_biden5598 yesterday). The community is doing the spam-recognition work without Tyler-tag prompts. Healthy server-immune signal.
- **MCP polite-touch burst landed clean**: 3 polite-touches + 5 leaderboard promotions, 35-second window, zero errors. Highest-leverage MCP burst since debut.

---

## Verification Plan

Per recommended §1 set (1.1 + 1.2 + 1.3 + 1.4 if approved):

| Item | Pre-ship | Post-ship |
|------|----------|-----------|
| §1.1 ban | n/a (Tyler UI) | Member count check at next sweep; confirm no mullermila807 posts |
| §1.2 launcher clarifier | n/a (MCP single post) | Next sweep — was the reply read? Did he respond? |
| §1.3 triage-bot intent | n/a (MCP single post) | 24h read of replies + reactions; tally |
| §1.4 PS-wipe guard | npm run build green; scoped eslint green; preview URL Chrome MCP smoke (fresh league → 2 seasons → PS contracts persist + invariant holds + screenshots) | Prod URL smoke same surfaces; reply in bige08676 thread with screenshots + retest ask; tag in #announcements |

If §1.4 is NOT in tonight's approved set, the auto-merge path runs purely on §1.1+§1.2+§1.3 (all SMALL/Tyler-action — no preview gate, no code changes). The Step 6 #announcements Dispatch is optional in that case (no code ships), and the pipeline ends after §1.1-1.3 actions are complete.

---

## Sources

- `/Users/tylermuse_macmini/Documents/gridirongm/discord-feature-log.md` (today's log, this evening's compile)
- Prior log (carried-forward state): same file as of pre-overwrite — referenced §1 items 1.1-1.5 from yesterday's spec
- `notes/roster-count-divergence-scoping.md` in repo (canonical scoping for §1.4)
- `BUGFIX_INSTRUCTIONS.md` in repo root
- `CLAUDE.md` in repo root (conventions, red lines, build-size taxonomy)
- Discord anchor messages (all in BS Sports guild `1482879268424781826`):
  - Scam wave 3: msgs `1517944143639347211`, `1517944152162046065`, `1517944158214553804`, `1517944164132589618`, `1517944170163998760`, `1517944176338141205`, `1517944183376187722` (mullermila807 6/20 17:28 UTC)
  - launcher_18 "ai so dumb": msg `1517854893027758130`
  - woahitsholly "BSFootballClaw back": msg `1517945319822856202`
  - bmoreoriolegm "sentient bot" (prior cycle): msg `1517644751757770855`
  - MCP polite-touches (this cycle §0.1-§0.3): msgs `1517921861416255570`, `1517921874468798606`, `1517921885428383974`
  - MCP leaderboard promotions (this cycle §0.4): msgs `1517921955758473307`, `1517921966042910830`, `1517921988088434831`, `1517922000222421004`, `1517922007608725566`
  - icantletugoo "Why do I keep getting pinged": msg `1517951366058742011`
  - its_camare07 scam call-out: msg `1517944387034808544`
