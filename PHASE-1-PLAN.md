# Phase 1 — Monorepo, Tests, and Pure-Utility Extraction

**Goal:** Set the foundation for the multi-sport architecture without breaking BS Football. Stand up the monorepo, build a test safety net, extract the obviously sport-agnostic code into `@bs/core`. End state: BS Football still works exactly as it does today, but its dependencies are now coming from a shared core package, and there's a test suite catching regressions.

**Why this matters:** Everything after Phase 1 (the football adapter extraction, basketball, hockey) depends on Phase 1 being solid. If the monorepo is wrong, every future PR fights it. If there are no tests, every refactor is a coin flip. Get this right and the rest gets easier; get it wrong and you'll regret it for months.

**Scope:** Infrastructure + safe extractions only. **No** sport adapter implementation, **no** core game-engine refactoring, **no** breaking changes to the existing app.

---

## Recommended approach

### The big architectural choice: hybrid extraction, not greenfield rebuild

In our earlier discussion I floated two options — refactor in-place vs. greenfield rebuild. After thinking through Phase 1 specifically, neither extreme is right. The right move is **hybrid**:

- Same repo, restructured to a monorepo at the end of Phase 1
- Extract *pure-utility* code (storage, Supabase wrappers, Stripe, podcast gen, analytics) into `@bs/core` in-place — these touch nothing sport-specific and can move safely
- Scaffold the new `@bs/core` adapter contracts (the work we just did in `adapter-spec/` becomes `@bs/core/adapter`) but don't yet wire them into the running app
- Leave the football game engine (simulate, playByPlay, store, etc.) completely untouched

This way: BS Football keeps working uninterrupted, you get a working monorepo + clean core utilities + the adapter spec promoted to a real package, and Phase 2 (the actual sport extraction) starts from a much better foundation.

### Tests come first

You have no tests. Before touching any code that the live app depends on, I want to spend the first week building integration tests for the existing football engine. Specifically: end-to-end tests that sim a full season, run a draft, execute trades, sign free agents, advance a save through 3-5 simulated seasons. These don't need to be exhaustive — they need to catch "did this refactor break the game."

This is non-negotiable in my opinion. Skipping it makes everything that comes after riskier and slower.

### Tool choices

- **Monorepo:** pnpm workspaces + Turborepo. pnpm for the workspace machinery (best disk usage, strictest dependency hygiene), Turborepo for build caching (so `pnpm build` in apps/web doesn't rebuild @bs/core when nothing changed there).
- **Test runner:** Vitest. Faster than Jest, native ESM, plays well with Next.js. Less config.
- **Type checker:** Existing TypeScript setup, but with stricter project references so the packages can be type-checked independently.

---

## Phase 1 broken into sub-phases

### Sub-phase 1A — Test scaffolding (4-7 days)

Goal: integration test harness for the existing engine, before anything else moves.

1. Install Vitest, set up `vitest.config.ts` at repo root.
2. Create `tests/integration/` with end-to-end tests:
   - **`season-loop.test.ts`** — load a fresh league, sim through preseason → regular season → playoffs → offseason → next year. Assert: standings exist, every team played 17 games, a champion was crowned, awards were assigned, draft happened, free agency happened, cap state is consistent.
   - **`draft.test.ts`** — execute a full draft for one team manually (user picks) and one team auto-picked. Assert: picks landed, contracts created, draft picks consumed, rookies on rosters.
   - **`trade.test.ts`** — propose and execute a 2-team trade, a 3-team trade, a pick-only trade, a trade with cash. Assert: cap legal, rosters updated, dead cap recorded if applicable.
   - **`free-agency.test.ts`** — open free agency, sign 3 players to one team, release 2. Assert: contracts created/voided, cap recomputed, news items generated.
   - **`save-load.test.ts`** — sim a season, serialize state, deserialize, sim another season. Assert: roundtrip-stable.
3. CI integration via GitHub Actions (file already exists in `.github/`).

Acceptance: `pnpm test` runs in under 60 seconds, all tests pass against current `main`.

### Sub-phase 1B — Monorepo setup (2-3 days)

Goal: restructure the repo without breaking the running app.

1. Add `pnpm-workspace.yaml` declaring `packages/*` and `apps/*`.
2. Add `turbo.json` with `build`, `dev`, `lint`, `test` pipelines.
3. Create empty package skeletons:
   - `packages/core/` — `@bs/core`, will receive extracted utilities
   - `packages/sport-football/` — `@bs/sport-football`, will receive the football adapter in Phase 2 (empty for now, just the package.json)
   - `apps/web/` — placeholder; the actual move happens at end of Phase 1
4. Move `node_modules`-resolution to pnpm.

Acceptance: `pnpm install` succeeds, `pnpm build` (running existing Next.js build) succeeds, dev server starts.

### Sub-phase 1C — Promote `adapter-spec/` to `@bs/core/adapter` (1 day)

Goal: take the work from the SportAdapter contract and turn it into the first real module of `@bs/core`.

1. Move `adapter-spec/SportAdapter.ts` → `packages/core/src/adapter/SportAdapter.ts`
2. Move `adapter-spec/BaseTypes.ts` → `packages/core/src/adapter/BaseTypes.ts`
3. Move `adapter-spec/DECISIONS.md` → `packages/core/src/adapter/DECISIONS.md` (or `packages/core/docs/`)
4. Move the three adapter sketches → `packages/core/src/adapter/sketches/` (kept as reference, not exported)
5. Delete the soccer tombstone
6. Update `@bs/core` package.json `exports` field to surface the adapter types
7. The existing `src/` app does NOT import these yet — Phase 2 work.

Acceptance: `@bs/core` exports the adapter types cleanly, `pnpm typecheck` passes.

### Sub-phase 1D — Extract pure-utility modules into `@bs/core` (5-7 days)

Goal: move sport-agnostic infrastructure out of `src/lib/` and into `@bs/core`, update imports in the running app.

Extraction order (safest first, tested as we go):

1. **`src/lib/analytics.ts`** → `@bs/core/analytics` — pure event tracking, no sport logic.
2. **`src/lib/storage.ts`** → `@bs/core/storage` — IndexedDB save/load primitives. Critical that tests pass after this move.
3. **`src/lib/supabase/`** → `@bs/core/supabase` — auth clients. Critical that login still works.
4. **`src/lib/stripe.ts`, `subscription.ts`, `subscriptionState.ts`** → `@bs/core/billing` — payment processing.
5. **`src/lib/podcastCredits.ts`** + `generate_podcast.py` references → `@bs/core/podcast`
6. **`src/lib/engine/gmSync.ts`** → `@bs/core/gm/sync` — GM profile syncing to Supabase, no sport logic.
7. **`src/lib/engine/achievements.ts`** → `@bs/core/achievements` — universal achievement framework.

After each extraction: re-run the integration tests + manually verify the dev server works. Stop extracting if anything breaks; debug before continuing.

NOT extracted in Phase 1 (these have sport coupling — Phase 2 work):
- `negotiation.ts`, `approval.ts`, `objectives.ts`, `social.ts`, `recap.ts`, `debate.ts`, `aiSpotlight.ts` — sport-agnostic conceptually but currently import football types
- The store, simulate, playByPlay, schedule, salary, etc. — squarely sport-specific
- **`gmSync.ts` and `achievements.ts`** — originally planned for Phase 1 but reclassified as sport-coupled when actually inspected. `gmSync.ts` imports `LeagueState` from `@/types` and depends on `draftScore.ts` (football-specific draft grading); `achievements.ts` hardcodes football concepts ("Super Bowl", "17 games", football team record shape). Both move in Phase 2.

Acceptance: integration tests still pass, dev server works, `apps/web` is now importing from `@bs/core` for the extracted utilities.

### Sub-phase 1E — Move `src/` into `apps/web/` (1-2 days)

Goal: complete the monorepo restructure by moving the existing Next.js app under `apps/web/`.

1. Move `src/`, `public/`, `next.config.ts`, `tsconfig.json`, `tailwind config` → `apps/web/`
2. Update Vercel project config (the `.vercel/` directory).
3. Update GitHub Actions paths.
4. Verify `pnpm dev` and `pnpm build` still work.
5. Verify production deploy still works (test on a Vercel preview).

Acceptance: production deployment succeeds, full integration test suite passes, dev server works.

---

## Concrete deliverables (Phase 1 end state)

```
gridirongm/
├── package.json                ← workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── vitest.config.ts
├── tests/
│   └── integration/            ← 5+ end-to-end test files
├── packages/
│   ├── core/                   ← @bs/core
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── adapter/        ← SportAdapter, BaseTypes (from adapter-spec/)
│   │   │   ├── analytics/
│   │   │   ├── storage/
│   │   │   ├── supabase/
│   │   │   ├── billing/
│   │   │   ├── podcast/
│   │   │   ├── gm/
│   │   │   └── achievements/
│   │   └── docs/
│   │       └── DECISIONS.md    ← (moved from adapter-spec/)
│   └── sport-football/         ← @bs/sport-football
│       ├── package.json        ← empty skeleton
│       └── src/                ← (Phase 2 work goes here)
└── apps/
    └── web/                    ← the existing Next.js app, moved
        ├── src/
        ├── public/
        ├── next.config.ts
        └── tsconfig.json
```

---

## Decisions you should make before I start

1. **Vercel deployment continuity.** The Sub-phase 1E move (`src/` → `apps/web/`) might require Vercel project config changes. Do you want me to (a) test on a Vercel preview before merging, (b) coordinate with you to redeploy manually after the move, or (c) hold off on 1E entirely and defer the move to Phase 2 (live with `src/` outside the apps/ structure for now)?

2. **Feature freeze during Phase 1.** Phase 1 will take 2-3 weeks. During that time, every change you make to the live app means I have to rebase tests + extractions against your work. Recommended: **feature freeze on the football game during Phase 1.** Bug fixes only, no new features. Hard to do if you're actively shipping, but the alternative is constant merge conflicts.

3. **Test coverage target.** My recommendation is "enough to catch breaking changes during extraction" — probably 5-7 integration tests covering the major flows, not unit tests for every function. Do you want broader coverage (unit tests of engine functions), or is that overkill for Phase 1 specifically?

4. **Supabase RLS / schema changes.** The existing app uses Supabase for auth + premium + GM sync. Extracting these shouldn't require schema changes, but the path from `apps/web` is different than from `src/` — env vars and the deployment pipeline need updates. Anything special about how your Supabase project is wired up that I should know before touching that code?

5. **Branching strategy.** Should I do Phase 1 on a single long-lived branch (`phase-1-monorepo`), or break it into per-sub-phase PRs against `main`? Long-lived branch is faster but riskier (big merge); per-PR is slower but each step is reviewable.

---

## Out of scope (explicitly)

- Anything in the football game engine (simulate, playByPlay, store, salary, schedule, draft, etc.) — Phase 2
- Building the basketball adapter — Phase 3
- Database schema changes — when needed, Phase 2 or later
- Multi-sport user accounts — product decision, not Phase 1
- Subdomain routing — Phase 2 prep work
- Migration of existing user saves — Phase 2

If you find yourself thinking "while we're at it, can we also..." for anything in the above list, the answer is no. Phase 1 stays narrow.

---

## Risks

**Highest risk: the IndexedDB storage extraction breaks existing user saves.**
Mitigation: round-trip test (`save-load.test.ts`) runs against the extracted code before merge. If it fails, we don't ship.

**Second-highest risk: Supabase client path changes break auth on production.**
Mitigation: deploy 1D to a Vercel preview, manually verify sign-in/sign-out works, only then merge to main.

**Third-highest risk: Turborepo cache pollution.**
Mitigation: configure cache keys carefully on day one. If we get this wrong it's a debugging headache later.

**Hidden risk: the `_fresh_clone` directory in your repo.**
I noticed it during the earlier code scan — looks like a partial git clone leftover. Worth cleaning up before the monorepo move so the move doesn't accidentally pick it up.

---

## Timeline

| Sub-phase | Estimated time |
|---|---|
| 1A — Test scaffolding | 4-7 days |
| 1B — Monorepo setup | 2-3 days |
| 1C — Promote adapter spec | 1 day |
| 1D — Extract utilities | 5-7 days |
| 1E — Move src/ → apps/web/ | 1-2 days |
| **Total** | **~2-3 weeks** |

With Claude Code driving most of the mechanical work, the bottleneck is review time, not coding time. Realistic calendar: ~3 weeks at a sustainable pace, ~2 weeks if you're available for fast review turnarounds.

---

## What happens after you approve

1. You answer the 5 open decisions above (or accept defaults).
2. I create a working branch (or PR sequence, per your branching choice).
3. I start with Sub-phase 1A — test scaffolding — because nothing else is safe until it's done.
4. After each sub-phase, I report what changed + what to verify before proceeding.
