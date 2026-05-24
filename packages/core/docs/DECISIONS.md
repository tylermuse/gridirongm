# Decisions Log

> **Audience:** future Claude Code sessions, future contributors who weren't in the original architecture conversation. Every decision below is written full-context, no shorthand. If you find yourself wanting to change one of these, read the whole entry first — the reasoning is usually load-bearing.

> **Status:** Draft v0.1. This log covers the initial SportAdapter design + the three interface changes the soccer pressure-test forced. Future changes append to the "Interface change log" section at the bottom.

---

## Table of contents

1. [Why this spec exists](#why-this-spec-exists)
2. [The core/adapter split](#decision-1-the-coreadapter-split)
3. [Generics vs discriminated unions for sport variance](#decision-2-generics-vs-discriminated-unions-for-sport-variance)
4. [Capabilities are optional, not least-common-denominator](#decision-3-capabilities-are-optional-not-least-common-denominator)
5. [Adapters are pure logic](#decision-4-adapters-are-pure-logic)
6. [PlayerKind discriminator approach](#decision-5-playerkind-discriminator-approach)
7. [Roster buckets with ownership semantics](#decision-6-roster-buckets-with-ownership-semantics)
8. [Cap rules: imperative, not declarative](#decision-7-cap-rules-imperative-not-declarative)
9. [Generalizing "trade" → PlayerMovement union](#decision-8-generalizing-trade--playermovement-union)
10. [Multiple parallel competitions per league](#decision-9-multiple-parallel-competitions-per-league)
11. [Lineup model as a typed descriptor](#decision-10-lineup-model-as-a-typed-descriptor)
12. [Baseball deferred indefinitely](#decision-11-baseball-deferred-indefinitely)
13. [Hockey AHL: minors stash by default](#decision-12-hockey-ahl-minors-stash-by-default)
14. [Interface change log](#interface-change-log)

---

## Why this spec exists

**Problem:** Tyler owns multiple `bs-<sport>.com` domains and originally wanted to build GM games for football (existing), basketball, hockey, soccer, and baseball. The naive approach is to fork the BS Football codebase per sport. With multiple sports, that means N copies of the GM core (negotiation, awards, news, social, debate, podcast, leaderboards, Stripe, Supabase, etc.), N bug-fix cycles per change, and inevitable divergence over time.

**Current scope** (after scope reductions): football (built), basketball (next), hockey (later). Baseball and soccer are deferred — the architecture remains capable of supporting them without contract changes, but no adapters are being actively built.

**The alternative:** extract a sport-agnostic `@bs/core` package that knows about leagues, teams, players, contracts, and seasons in the abstract; let each sport plug in via an adapter that knows the sport-specific shape. One platform, four (or more) sport packages, single codebase to maintain.

**This spec is the contract** the adapter pattern depends on. If it's right, adding a sport is a focused project. If it's wrong, every sport will require core changes and the architecture won't pay off.

The spec lives in `adapter-spec/` (outside `src/`) deliberately — it's not wired into the live app. Phase 2 of the broader refactor will create `@bs/core` and `@bs/sport-football` packages that consume this contract; until then, the existing `src/` keeps working unchanged.

---

## Decision 1: The core/adapter split

**Problem:** Where do you draw the line between "the platform" and "the sport"?

**Alternatives considered:**

*Inheritance.* Have a `BaseSport` class that football, basketball, etc. extend, overriding methods. Rejected because TypeScript inheritance with deeply typed sport-specific data is awkward (generic constraints fight you), and OO inheritance makes capability checks (`does this sport have a cap?`) more verbose than capability flags.

*Code generation.* Define sports in YAML, generate TypeScript adapters. Rejected because the sport logic is too varied — generation would either be too restrictive (force every sport into one mold) or so flexible it'd be no easier than writing TS directly. Plus, debugging generated code is misery.

*Sport-aware core.* Let the core have `if (sport === 'football') { ... }` branches. Rejected outright — that's the fork pattern with extra steps and it scales horribly.

**Chosen:** Generic interface (`SportAdapter<TRatings, TStats, TPosition, TLineup>`) that each sport implements. The core consumes the interface; adapters provide it. Pure composition.

**Reasoning:** TypeScript's generic + discriminated union story is strong enough to express the variance cleanly. Pure interfaces are debuggable, tree-shakeable, and easy to test in isolation. The cost is some verbosity in adapter implementations, which is fine because each adapter is written once.

**Where it lives:** `SportAdapter.ts` (the contract), `football.adapter.ts` et al (the implementations).

---

## Decision 2: Generics vs discriminated unions for sport variance

**Problem:** Player ratings have different shapes per sport. Within a sport, sometimes ratings also have different shapes (hockey skater vs goalie). How do you type this?

**Alternatives considered:**

*One mega-interface with all fields, sports use what they need.* Rejected — terrible signal-to-noise ratio, every sport carries unused fields, hard to validate.

*All sport-specific data in `Record<string, unknown>`.* Rejected — gives up TypeScript's main value, every read needs a cast and runtime check.

*Generic over the rating type only, discriminated union when intra-sport variance exists.* Chosen.

**Chosen:**
- `BasePlayer<TRatings, TStats>` is generic over per-sport rating/stat shapes.
- When a sport has intra-sport variance (hockey goalies, soccer keepers), `TRatings` is itself a discriminated union: `SkaterRatings | GoalieRatings` with a `kind` field.
- `BasePlayer.kind: string` carries the discriminator value so the core can route correctly.

**Reasoning:** Generics handle the cross-sport variance cleanly (compile-time, no runtime cost). Discriminated unions handle within-sport variance and let TS narrow correctly in adapter code. The combination is more verbose than option 1 but provides actual type safety in places it matters (sim engines, stats engines, player generators).

**Where it lives:** `BaseTypes.ts` (`BasePlayer<TRatings, TStats>`), per-sport adapter files declare concrete narrowings.

---

## Decision 3: Capabilities are optional, not least-common-denominator

**Problem:** Football has a salary cap. Soccer doesn't. Soccer has loans. Football doesn't. How do you model features that some sports have and others don't?

**Alternatives considered:**

*Every adapter implements every capability, stubbed out for sports that don't have it.* Rejected — leads to footguns (calling `capRules.isLegalRoster` on soccer should not return a fake "always legal" result; it should signal "this sport doesn't use caps").

*Define the union of all capabilities, sport-specific subsystems live in the core, dispatched by sport ID.* Rejected — that's the fork pattern.

*Sub-systems on the adapter are individually optional. Core checks `if (adapter.capRules)`.* Chosen.

**Chosen:** `SportAdapter` has required and optional capabilities:
- Required: `rosterRules`, `seasonCalendar`, `playerGen`, `statsEngine`, `simEngine`, `scheduleGenerator`, `draftSystem` (rounds may be 0), `developmentSystem`, `tradeValuator`, `awards`, `ui`, `lineupModel`, `coachingSystem`, `competitions`.
- Optional: `capRules`, `liveSim`, `promotionRelegation`.

**Reasoning:** Forces the core to acknowledge sport differences explicitly via capability checks rather than letting bugs hide behind no-op stubs. Soccer has no cap, period — the system should know that, not pretend it does. Future sports can introduce new optional capabilities without touching existing adapters.

**Pitfall to avoid:** Adding a feature to a sport and quietly making it optional just because it'd be inconvenient to declare. If 3 of 4 sports have a feature, it should likely be required and the holdout sport implements a no-op explicitly. Optional capabilities are for "this concept genuinely doesn't apply to this sport" cases.

---

## Decision 4: Adapters are pure logic

**Problem:** Where does state live?

**Chosen:** Adapters are pure modules. No mutable state, no side effects, no I/O. Functions in, data out. All state lives in the core's store (which the core owns).

**Reasoning:**
- Lets multiple sports share one Next.js process if needed (subdomain routing).
- Makes adapters trivially testable.
- Lets us run adapter functions inside Web Workers for off-main-thread sim if perf demands it later.
- Save format is the core's concern, not each adapter's.

**Where it shows up:** No function in any adapter capability returns a mutated input. Everything is "given this snapshot, compute this result." The core then applies results to its mutable store.

---

## Decision 5: PlayerKind discriminator approach

**Problem:** Hockey has skaters and goalies with disjoint rating/stat shapes. Soccer has outfield players and keepers. Football and basketball have one shape for all players. How do you handle this uniformly?

**Alternatives considered:**

*Separate `Skater` and `Goalie` types that don't share a base.* Rejected — the core would need two parallel code paths for everything (lookup, lineup, sim, stats).

*A flat union of all possible ratings (skater + goalie fields), with goalies having N/A skater fields.* Rejected — pollutes data, breaks "no junk fields," makes generators ugly.

*Discriminated union via a `kind` field on the player.* Chosen.

**Chosen:**
- `BasePlayer<TRatings, TStats>` has `kind: string` as a universal field.
- For sports with one player archetype, kind is always `'standard'`.
- For sports with multiple archetypes, the adapter declares the kind enum (`'skater' | 'goalie'`), and the `TRatings`/`TStats` types are discriminated unions narrowed by `kind`.
- Adapter declares `playerKinds` array so the core can validate and the UI can build kind-aware filters.

**Reasoning:** Discriminated unions are TypeScript's strongest variance-handling tool. The `kind` field is on `BasePlayer` so core code can always check it without sport-specific knowledge. Adapter code narrows the union via `if (player.kind === 'goalie')` for typed access to the appropriate ratings.

**Where it lives:** `BaseTypes.ts` (`BasePlayer.kind`), per-sport adapters declare kind enums and discriminated union types.

**Pitfall surfaced:** `StatsEngine.empty()` originally took no params. With discriminated `TStats`, you can't return a typed empty without a hint. Forced interface change #3 (see below).

---

## Decision 6: Roster buckets with ownership semantics

**Problem:** Football has active 53 + practice squad 16 + IR. Basketball has 15 + 2-way + inactive. Hockey has 23 + minors + IR + LTIR. Soccer has 25 + U21 + loaned-out + loaned-in + injured. How do you model all of these uniformly?

**Alternatives considered:**

*Hardcode the buckets in the core.* Rejected — every sport adds a new one and core grows endlessly.

*Sport-specific roster shape via sportData.* Rejected — core couldn't write generic "which players are eligible for tonight's game" queries.

*Named buckets declared by the adapter, with universal metadata.* Chosen.

**Chosen:** `RosterRules.buckets: RosterBucketDefinition[]`. Each bucket declares:
- `name` (machine key into `team.rosterBuckets`)
- `label` (display)
- `capacity` (max players)
- `countsAsActive` (toward roster size limit)
- `countsAgainstCap` (toward salary cap)
- `eligibleForLineups` (can be selected for a game)
- `ownership: 'self' | 'other' | 'self_registered_elsewhere'` (for soccer loans)

**Reasoning:** Universal metadata lets the core ask sport-agnostic questions ("can this player be in tonight's lineup?") without knowing what specific buckets exist. Sports add buckets without core changes.

The `ownership` field is the key generalization. US sports always use `'self'`. Soccer loans need `'other'` (we're registering a player owned elsewhere) and `'self_registered_elsewhere'` (we own a player registered elsewhere). The core uses ownership to compute "who's actually available to play for this team this week."

**Where it lives:** `BaseTypes.ts` (`RosterSlotRef`, `RosterBucketDefinition`), per-sport adapters declare their buckets.

---

## Decision 7: Cap rules: imperative, not declarative

**Problem:** NFL has 3 cap rules. NBA has 20 (Bird rights, MLE, BAE, apron tiers, sign-and-trade BYC, traded player exception). NHL adds LTIR carve-outs and buyout math. Soccer has none. How do you model this without making the contract a horror show?

**Alternatives considered:**

*Declare the cap structure in data (rules as JSON-like schema).* Rejected — NBA's Bird rights and sign-and-trade math are not declaratively expressible without inventing a DSL that's harder than just writing TypeScript.

*A massive union type of "every possible cap rule across all sports."* Rejected — explodes combinatorially as sports are added.

*Imperative interface: cap is a function `(team, league) → ValidationResult`. Adapter implements the logic however it wants.* Chosen.

**Chosen:** `CapRules` interface exposes:
- `currentCap(season)` — league cap for this year
- `isLegalContract(contract, player, team, league)` — validation
- `isLegalRoster(team, league)` — validation
- `deadCapForRelease(player, league)` — released-player dead cap math
- `marketSalary(player, league)` — negotiation input
- `availableCapActions(team, league)` — what tools the user has access to ('Use MLE', 'Apply Franchise Tag', 'Place on LTIR')

The whole thing is also optional via `capRules?:` — soccer omits it.

**Reasoning:** Imperative interfaces handle arbitrary complexity inside the adapter without forcing the contract to grow with each sport's quirks. The contract guarantees the core can ask sport-agnostic questions ("is this trade legal?") and get useful answers. Each sport implements those questions however its rulebook demands.

**Cost:** Less introspectable than a declarative schema would be. Building a generic "cap calculator UI" requires each sport to provide custom widgets via `availableCapActions`. Acceptable cost.

**Where it lives:** `SportAdapter.ts` (`CapRules` interface), per-sport adapters implement.

---

## Decision 8: Generalizing "trade" → PlayerMovement union

**Problem:** US sports use trades (player-for-player + picks). Soccer uses transfer fees and loans. Free agency, releases, waivers all exist across sports with different rules. The core's "evaluate a player movement" abstraction has to handle all of these.

**Alternatives considered:**

*Multiple separate abstractions: TradeEngine, TransferEngine, LoanEngine, FreeAgencyEngine.* Rejected — most logic (player valuation, contract math, news generation) is shared; splitting forces duplication.

*A single Trade type that has cash and picks but no loans.* Rejected — soccer loans are a fundamentally different shape (ownership stays, registration moves) and the abstraction would leak.

*A discriminated union of every kind of player movement.* Chosen.

**Chosen:** `PlayerMovement` is a discriminated union over `type`:
- `'trade'` — US-style swap with players, picks, optional cash
- `'free_agency_sign'` — player + signing team + contract
- `'release'` — team waives a player
- `'waiver'` — release with claiming team (NFL/NHL waivers)
- `'transfer'` — soccer-specific, fee + new contract + sell-on %
- `'loan'` — soccer-specific, owner + borrower + wages split + optional buy
- `'loan_recall'` — soccer-specific, early return

Each adapter declares `tradeValuator.supportedMovementTypes` — the UI shows only the relevant affordances per sport.

**Reasoning:** One concept ("player movement") with typed variants is cleaner than N parallel concepts. The core gets a single news/social/awards/history machinery that handles all movement types via a single dispatch. Adding a movement type for a future sport is additive — existing sports just don't list it in their supportedMovementTypes.

**Where it lives:** `BaseTypes.ts` (`PlayerMovement` union and variants).

---

## Decision 9: Multiple parallel competitions per league

**Problem:** Football and basketball seasons are simple: regular season → playoffs, all part of one bracket. Soccer teams play in 2–4 simultaneous competitions: league + domestic cup + (sometimes) continental cup. The core's season abstraction can't assume one competition.

**Alternatives considered:**

*Have the soccer adapter run multiple "leagues" internally and surface a unified view.* Rejected — breaks the "one league = one user's GM career" framing and forces the core to be sport-aware.

*A single Competition object with a complex sub-phase machine.* Rejected — fights against the simple cases (US sports) for the benefit of one sport.

*An array of Competition definitions on the league state.* Chosen.

**Chosen:** `BaseLeagueState.competitions: Competition[]`. US sports have one (`'primary'`); soccer has 2–4. Each `Competition` has its own format, standings, and history. The core's schedule advance processes all competitions in parallel within a tick. The UI surfaces them as tabs or sections under one league view.

**Reasoning:** First-class multi-competition support is cheap if you build for it from the start, expensive to retrofit. The football/basketball/hockey cases collapse to the trivial "1 competition" case with zero overhead. Soccer gets real support for what it actually needs.

**Side effect:** Forced interface change #1 — schedule generators for draw-based competitions need a `generateNextRound()` method (because the bracket isn't known at season start).

**Where it lives:** `BaseTypes.ts` (`Competition`, `CompetitionFormat`, `PlayoffFormat`), `SportAdapter.ts` (`CompetitionDefinition`, `ScheduleGenerator.generateNextRound?`).

---

## Decision 10: Lineup model as a typed descriptor

**Problem:** Football uses a depth chart (position → ordered list of players). Basketball uses a rotation (starters + bench order). Hockey uses lines (forward lines + defense pairs + goalies). Soccer uses a formation + 11 starters + bench. These are structurally different. How does the core know how to display them?

**Alternatives considered:**

*Force every sport into a common "depth chart" shape.* Rejected — soccer's formation system doesn't fit, hockey's line dynamics get lost.

*Lineup is fully opaque to the core, every sport provides its own UI.* Mostly chosen, with one wrinkle.

*Lineup is typed per sport AND the adapter declares which "kind" of lineup it is, so the UI knows which renderer to use.* Chosen.

**Chosen:** `LineupModelDescriptor.kind: 'depth_chart' | 'rotation' | 'lines' | 'formation_xi'`. The adapter declares the kind; the core stores lineups as `TLineup` (opaque, generic); the UI looks up the kind to pick a renderer.

**Reasoning:** Pure opacity would force every sport to ship its own depth-chart-display component. The kind discriminator lets shared UI infrastructure pick the right renderer family. New lineup kinds can be added (e.g., baseball's batting order + defensive positions would be a new kind) without touching the contract.

**Where it lives:** `SportAdapter.ts` (`LineupModelDescriptor`).

---

## Decision 11: Baseball and soccer deferred

**Problem:** Both baseball and soccer were initially in scope. Both were subsequently pulled.

**Baseball reasoning:** The 7-tier minor league system is structurally unlike every other sport. Modeling it cleanly requires multi-league parallel sim (each affiliate runs its own season simultaneously with the majors, with constant player movement between tiers). Substantial architectural commitment for one sport.

**Soccer reasoning:** Pulled later in the design pass, after soccer had already served as the interface pressure-test. The interface generalizations soccer forced were *kept* (see "Effect on the interface" below) because they're cheap and several are actively useful to the remaining sports.

**Effect on the interface — what was kept after soccer was dropped:**
- **`tieFormat` discriminated union** on `PlayoffFormat.rounds[]` — replaced the original `bestOf: number`. Actively used by football (`single_match`), basketball (`best_of` and `single_match`), and hockey (`best_of`). Strictly cleaner than the original shape.
- **`StatsEngine.empty(kind?: string)`** — needed by hockey for skater vs goalie. Soccer was the second sport that forced the same need; the change stands on its own.
- **Optional `capRules?:`** — football, basketball, hockey all implement it. The optional-ness is what proved the design's flexibility; cost zero to keep.
- **`Competition[]` array on league state** — every current sport has length 1. Zero cost; mild future-proofing.
- **`PromotionRelegationSystem` capability** — currently no sport implements it. Inert.
- **`TransferFee`, `Loan`, `LoanRecall` `PlayerMovement` variants** in `BaseTypes.ts` — no current sport lists them in `supportedMovementTypes`. Inert.
- **`ownership: 'self' | 'other' | 'self_registered_elsewhere'`** on `RosterSlotRef` — current sports only use `'self'`. Inert until needed.
- **`ScheduleGenerator.generateNextRound?()`** — optional, no current sport implements it.

**Why we kept the inert pieces rather than stripping them:** removing them costs work now and re-adding costs work later. The inert bits don't show up in the UI, don't affect runtime, and don't add cognitive load for the active sports (adapter writers don't have to deal with capabilities they don't implement). The interface ends up slightly broader than the current sports require — a small price for the option value.

**If either sport comes back:**
- *Baseball:* add a `'pitcher' | 'hitter' | 'two_way'` PlayerKind; use multi-roster-bucket for 26/40-man/minor leagues. Will likely require 1-3 small interface changes — re-pressure-test when adding.
- *Soccer:* rewrite the tombstone file `soccer.adapter.sketch.ts` as a real adapter. The interface is already set up for it (that's why the generalizations exist) — should drop in with no contract changes.

---

## Decision 12: Hockey AHL: minors stash by default

**Problem:** NHL has a real parallel professional league (AHL) most teams have an affiliate in. AHL has its own schedule, standings, awards. Modeling it as a full parallel league is significant work; modeling it as a "minors bucket" is easy.

**Alternatives considered:**

*Full AHL parallel league with its own schedule + sim + awards.* Rejected for v1 — adds significant work for a feature most GM-game players don't engage with deeply. Re-evaluate after launch.

*No AHL representation at all.* Rejected — would prevent realistic prospect development.

*Simple "minors" roster bucket where prospects sit, not games simulated.* Chosen for v1.

**Chosen:** Hockey's roster rules include a `'minors'` bucket (capacity Infinity, doesn't count as active or against cap). Prospects develop there via the development system without actual AHL games being simulated. The team carries an `ahlAffiliateName` in sportData for cosmetic/news purposes.

**Future-proofing:** The hockey adapter could later add an `'ahl'` CompetitionDefinition entry and flip the `minors` bucket's `eligibleForLineups` to true within AHL game contexts. The core would handle this without changes because the multi-competition system is already first-class.

**Where it lives:** `hockey.adapter.sketch.ts` rosterRules.

---

## Interface change log

> Append-only. Every change to `SportAdapter.ts` or `BaseTypes.ts` after the initial draft gets an entry here.

### Change #1 — `ScheduleGenerator.generateNextRound?()` added

**Date:** Initial soccer pressure-test pass.

**Triggered by:** Soccer FA Cup, League Cup, and Champions League knockout rounds use draws — the next round's matchups depend on the previous round's results and can't be pre-scheduled at season start.

**Pre-change:** `ScheduleGenerator.generate()` returned the full season's games at preseason rollover.

**Post-change:** `generate()` now returns "everything pre-schedulable." Competitions with draw-based seeding get an additional `generateNextRound()` call from the core after each completed round.

**Impact on existing adapters:** Football, basketball, hockey all use round-robin + pre-bracketed playoffs. Their `generateNextRound` is `undefined` and never called. Zero impact.

**Pitfall for future Claude sessions:** If you add a sport with mid-season draws (e.g., a knockout tournament inside a US sport), remember to implement `generateNextRound()` AND ensure the `CompetitionFormat` has `seeding: 'draw'` so the core knows to call it.

### Change #2 — `PlayoffFormat.rounds[].bestOf` → `tieFormat`

**Date:** Initial soccer pressure-test pass.

**Triggered by:** European cup knockout ties are two-legged (home + away, aggregate score, optional away goals rule). `bestOf: number` only expresses US-style best-of-N series.

**Pre-change:** `{ name: string; bestOf: number }`.

**Post-change:** `{ name: string; tieFormat: TieFormat }` where `TieFormat` is a discriminated union:
- `{ type: 'single_match' }` — NFL playoffs, cup finals
- `{ type: 'best_of'; games: number }` — NBA/NHL/MLB playoffs
- `{ type: 'legs'; count: 1 | 2; awayGoalsRule?: boolean }` — European cup ties

**Impact on existing adapters:** Football, basketball, hockey playoff formats all migrated to `tieFormat` shape (mechanical change, all four adapter files updated in the same pass). New shape is strictly more expressive.

**Pitfall for future Claude sessions:** If you find yourself adding more `tieFormat` variants (group-stage with home + away, gauntlet rounds), discriminated union extension is fine. Don't add fields to existing variants without checking they're meaningful for the use case.

### Change #3 — `StatsEngine.empty()` → `empty(kind?: string)`

**Date:** Initial pressure-test pass (flagged by hockey, confirmed by soccer).

**Triggered by:** Sports whose `TStats` is a discriminated union (hockey SkaterStats | GoalieStats; soccer OutfieldStats | KeeperStats) cannot return a typed empty object without knowing which variant the caller wants.

**Pre-change:** `empty(): TStats`.

**Post-change:** `empty(kind?: string): TStats`. Sports with uniform stat shape (football, basketball) ignore the param.

**Impact on existing adapters:** Football and basketball ignore the new param. Hockey and soccer require it (their implementations should throw if called without a `kind` matching their `playerKinds`).

**Pitfall for future Claude sessions:** When calling `statsEngine.empty()` from the core, always pass the player's `kind` field. Even for sports where it's unused, passing it costs nothing and prevents future regressions if a sport adds kinds.

---

## Things explicitly NOT decided yet

These are downstream of the adapter contract being approved. Don't try to solve them in this spec.

1. **Monorepo tooling** — pnpm workspaces vs Turborepo vs Nx. Decide in Phase 1 of the broader refactor.
2. **Database schema for multi-sport users** — one shared Supabase project with `sport` columns, or separate per sport. Decide after the data model has settled.
3. **Subdomain routing in Next.js** — how `bs-football.com` vs `bs-basketball.com` resolve to the same Next.js app with different adapters loaded. Decide before Phase 2 starts.
4. **Save migration path** — how existing BS Football IndexedDB saves migrate into the new sport-pluggable architecture. Decide before deprecating the current `store.ts`.
5. **Cross-sport features** — shared GM profile across sports, unified premium subscription, cross-sport leaderboards. These are product decisions, not architecture decisions; capture user stories before designing.
6. **Live sim contract** — sketched as an optional capability but not yet pressure-tested with a non-football implementation. Re-validate when basketball or hockey live sim is built.
