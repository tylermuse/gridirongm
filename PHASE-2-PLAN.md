# Phase 2 — BS Basketball (Greenfield)

**Goal:** Ship a working BS Basketball GM game at `bs-basketball.com`. Build it as a new Next.js app at `apps/bs-basketball/` that consumes `@bs/core` + a new `@bs/sport-basketball` adapter, *without touching the existing BS Football code in `src/lib/`*.

**Why greenfield, not full football extraction:** A real second-sport implementation will stress-test the SportAdapter contract in ways no amount of spec design can. We'll find gaps that need filling, abstractions that don't fit, and assumptions baked in from football. Better to discover those on a clean greenfield basketball than after a 6-week extraction of the live football game. Football stays unchanged in production; refactor happens in Phase 3 once basketball has proved out the contract.

**Strategic upside:** `bs-basketball.com` ships to users much sooner. That's the actual business outcome you want from this work.

**Scope:** Basketball-specific only. **No** changes to `src/lib/engine/`, **no** changes to BS Football, **no** store.ts refactor, **no** unification of shared code between the two sports (that's Phase 3).

---

## What success looks like (Phase 2 end state)

- `bs-basketball.com` resolves to a working BS Basketball GM game
- 30 teams, full 82-game season, lottery + 2-round draft, NBA-ish cap rules (soft cap + luxury tax + Bird rights for v1, not full apron complexity)
- Box-score sim only (no live possession-by-possession sim — that's a v2 feature, mirrors how BS Football shipped without live sim initially)
- Users can: draft, trade, sign free agents, sim seasons, win championships, see standings/stats/leaders
- Same auth + premium tier as BS Football (one account works for both via `@bs/core/supabase` + `@bs/core/billing`)
- BS Football continues working unchanged in production

---

## Sub-phase breakdown

### Sub-phase 2A — Basketball box-score sim engine (3-4 weeks)

The hardest single piece. Most of the rest of basketball is mechanical; the sim is genuinely new code that defines whether games feel real.

Approach: possession-based sim. Each game runs ~200 possessions. Per possession: who has the ball → shot quality model (driven by player ratings + defender + shot clock + game situation) → make/miss probability → rebound resolution → free throws if applicable → next possession. Stats accumulate per player per possession involvement.

**Reference implementation worth studying:** [Basketball GM](https://github.com/dumbmatter/bbgm) is open source and has 10+ years of refinement on this exact problem. We don't copy code (different design choices, different stack), but we read it as the answer key for "what does a good box-score sim look like?"

Deliverables:
- `packages/sport-basketball/src/sim/possession.ts` — single possession resolution
- `packages/sport-basketball/src/sim/game.ts` — game loop wrapping possessions
- `packages/sport-basketball/src/sim/shotModel.ts` — shot quality + make probability
- `packages/sport-basketball/src/sim/rebound.ts` — rebound resolution
- `packages/sport-basketball/src/sim/foul.ts` — foul + free throw logic
- Tests: sim 100 games, verify stat distributions look NBA-realistic (avg points per game in 100-120 range, shooting %s in 44-48%, 3pt rate in 35-40%, etc.)

This is the "if this doesn't work, basketball doesn't work" subsystem. Allocate the most time here.

### Sub-phase 2B — Rest of the basketball adapter (3-4 weeks)

Implement everything in `basketball.adapter.sketch.ts` that isn't the sim engine. Most are mechanical but cumulatively substantial.

- **Player gen** (`playerGen.ts`) — generate fictional basketball players with realistic rating distributions per position. Heights, wingspans, body types. Different archetypes (scoring guard, 3-and-D wing, stretch big, post threat).
- **Draft class generator** — 60 prospects per year, lottery-weighted talent distribution. Reference real NBA classes for shape: ~5 stars, ~10 starters, ~20 rotation, ~25 role.
- **Stats engine** — basketball stats accumulation + derived stats (TS%, eFG%, PER, USG%, plus/minus, WS, BPM, VORP).
- **Schedule generator** — 82 games per team, 30 teams, conference + division rotation, back-to-back limits, no 3-in-3 nights.
- **Cap rules** — NBA soft cap + luxury tax + Bird rights (v1 scope). Defer apron rules, BAE, sign-and-trade BYC to v2.
- **Draft system** — lottery for picks 1-14 (weighted odds), reverse standings for 15-30 + all of round 2. Rookie scale contracts.
- **Trade evaluator** — basketball value model + salary-matching validation (~125% within certain ranges).
- **Development system** — basketball-specific aging curves (peak 25-29, sharp decline after 33 except for shooters).
- **Awards** — MVP, DPOY, ROY, Sixth Man, MIP, COY, Finals MVP. Computation from season stats.
- **Coaching system** — head coach + asst + player dev + ATC. Tactical schemes (pace, defensive scheme).
- **Lineup model** — 5 starters + bench rotation order + backups by position.
- **UI metadata** — rating field grouping, stat column labels, position groups for UI rendering.

Tests: ~10-15 unit tests per major module, plus integration tests that sim full seasons and verify the GM loop works end-to-end (draft → train → trade → sim → playoff → free agency → draft).

### Sub-phase 2C — BS Basketball Next.js app shell (2 weeks)

New app at `apps/bs-basketball/`. Next.js 16, React 19, Tailwind, Supabase, Stripe. Copy patterns from BS Football where they make sense (auth provider, premium gating, sidebar layout) but build the basketball-specific pages fresh.

Pages needed for v1:
- `/` — dashboard (team overview, today's date, next game, news feed)
- `/standings` — conference + division standings
- `/roster` — your team's roster, depth chart, contracts
- `/draft` — draft board + your picks
- `/draft-recap` — post-draft grades + summaries
- `/free-agency` — FA board, sign players
- `/trades` — trade machine
- `/playoffs` — playoff bracket
- `/stats` — league leaders + box scores
- `/players` — player search
- `/player/[id]` — player detail page
- `/team/[id]` — team detail page
- `/history` — past champions, retired players, hall of fame
- `/settings`, `/pricing`, `/login` — reused from BS Football patterns

Shared from `@bs/core`:
- Auth (`@bs/core/supabase/{client,server}`)
- Premium gating (`@bs/core/billing`)
- Analytics (`@bs/core/analytics`)
- Storage (`@bs/core/storage`)
- Adapter contract (`@bs/core/adapter`)

The BS Basketball app imports `basketballAdapter` from `@bs/sport-basketball` and constructs a Zustand store that uses it. The store is basketball-specific for now — we don't try to build a generic store yet (that's Phase 3).

### Sub-phase 2D — UI design pass (1-2 weeks)

You said you want it to look like the NBA. This deserves real attention, not just copy-football-and-swap-colors. NBA visual identity:
- Bold, high-contrast typography (think NBA.com / ESPN NBA section)
- Team colors used prominently (every team page themed to that team's primary/secondary)
- Broadcast-style scoreboard treatments (live game indicators, time/score prominent)
- Dark mode polish (NBA fans skew night-game viewers)
- Player headshots prominent in roster/draft UI
- "Today in BS Hoops" style news feed treatment

Approach: spend a week with a design tool (Figma or similar) sketching key screens before committing to component decisions. Or hire a designer for a week if that's an option. Otherwise the app will look generic and won't have the "feels like the NBA" hook you want.

### Sub-phase 2E — Deploy to bs-basketball.com (3-5 days)

- New Vercel project (separate from gridirongm), or same project with subdomain routing
- Domain mapping (`bs-basketball.com` → Vercel)
- Env vars (Supabase, Stripe, OpenAI/Gemini if using AI features)
- GitHub → Vercel integration for `apps/bs-basketball/` directory
- Vercel preview for PR review (mirrors how BS Football works)
- Production deploy

Decision needed (see "Open questions" below): one Vercel project with subdomain routing or two separate Vercel projects?

### Sub-phase 2F — Beta + polish (2-3 weeks, ongoing)

Ship a beta to a small group (your Discord testers from BS Football probably), iterate on what feels wrong. Sim engine tuning, UI polish, missing features.

---

## What's intentionally NOT in Phase 2

- **Live possession-by-possession sim.** Box-score only for v1. Live sim is a v2 feature, same pattern as BS Football.
- **Refactor of BS Football engine.** Stays exactly as-is. Phase 3 work.
- **Refactor of `src/lib/engine/store.ts`.** Same — Phase 3.
- **Shared store between football and basketball.** Each sport has its own store. Phase 3 may unify if it makes sense.
- **AI commentary / podcast generation for basketball.** Defer to v2 — those are great BS Football features but adding them doubles the per-feature work.
- **Hockey, soccer, baseball.** Out of scope for Phase 2 entirely.
- **NBA cap apron, sign-and-trade BYC, full Bird/Early Bird/Non-Bird exception math.** Simplified cap for v1 (just soft cap + luxury tax). Full complexity can come later.

---

## Resolved decisions

1. **Vercel deployment model:** **Two separate Vercel projects.** `apps/bs-basketball/` will be its own Vercel project, pointed at that subdirectory in the same GitHub repo. Each project has its own env vars, deploy hooks, build settings. Simpler than subdomain routing in Next.js middleware.

2. **Shared user accounts:** **Yes — single Supabase project shared across sports.** Same `auth.users` table, same `subscriptions` table. The two sites have separate auth cookies (scoped per-domain) but the same underlying account. Premium status, profile, GM stats all flow through one backend.

3. **Premium subscription:** **One subscription covers all sports.** No `sport` column on the `subscriptions` table — a Premium row applies wherever the user logs in. Better economics + sticker price stays at $4.99 across the product family.

4. **Real names / logos:** **Same as football — parody names + roster editor in v1.** Community-made NBA packs are the upgrade path.

5. **AI features in basketball v1:** **Yes — ship with AI commentary + podcast generation from the start.** Adds ~2-3 weeks to Phase 2 (Sub-phase 2B grows), but maintains feature parity so BS Hoops doesn't feel like a lesser sibling. New `Sub-phase 2A.5` added below to scope this.

6. **Beta tester source:** **Existing BS Football Discord community for now.** Defer broader basketball-focused recruiting to post-launch.

---

## Timeline

| Sub-phase | Estimated time |
|---|---|
| 2A — Sim engine | 3-4 weeks |
| 2B — Rest of adapter | 3-4 weeks |
| 2B.5 — AI features (commentary + podcast for basketball) | 2-3 weeks |
| 2C — Next.js app shell | 2 weeks |
| 2D — UI design pass | 1-2 weeks |
| 2E — Deploy to bs-basketball.com | 3-5 days |
| 2F — Beta + polish | 2-3 weeks (ongoing) |
| **Total to public beta** | **~12-17 weeks** |

With Claude Code driving most of the mechanical work, 2A + 2B can compress somewhat (the adapter pieces in 2B are very pattern-matchable from football). 2D (design) is hardest to compress — taste takes time. 2F is open-ended.

---

## Risks

**Highest risk: the basketball box-score sim feels bad.** Possession-based simulation is genuinely hard to tune. If shot probabilities are off, stats will look wrong (everyone shoots 60% or 30%, scores in 50s or 150s). Mitigation: heavy use of stat distribution tests, reference ZenGM's calibration, start tuning early.

**Second-highest risk: the SportAdapter contract has gaps.** Soccer pressure-test caught some, but basketball will likely surface 1-3 more interface revisions. Mitigation: each interface change goes through DECISIONS.md, all adapters re-validated.

**Third-highest risk: UI looks generic.** If we just swap football's UI for basketball, the "feels like the NBA" hook disappears. Mitigation: dedicated design pass (Sub-phase 2D) before locking in components.

**Hidden risk: Supabase schema needs basketball additions.** Tables like `seasons`, `awards`, `gm_stats` may have football-shaped columns. Likely need additive columns or new tables for basketball. Plan to handle this during 2C when database queries are written.

---

## What happens after you approve

1. You answer the 6 open questions (or accept my recommendations as defaults).
2. I create `packages/sport-basketball/` skeleton + start Sub-phase 2A (the sim engine).
3. Reasonable cadence: I work in 1-2 day chunks per sub-phase, you review + push to your real machine + verify, we iterate.
4. Major checkpoints (after each sub-phase): commit + push, manual verification, decide whether to continue or pause.
