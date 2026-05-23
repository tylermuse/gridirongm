# SportAdapter Interface — Plan

**Goal of this artifact:** Define the TypeScript contract that every BS sport (football, basketball, hockey) will implement. This is the foundational architectural decision for the multi-sport platform — get it right and adding a sport becomes "drop in an adapter"; get it wrong and you'll be refactoring the contract every time you add a sport.

**Sports in scope:** football (exists), basketball (next), hockey (later). Baseball and soccer deferred — see `adapter-spec/DECISIONS.md` for the reasoning. The interface was originally designed against soccer as a pressure-test before soccer was pulled from scope; the generalizations that pass forced were kept because they're either actively useful to the remaining sports or cost ~nothing to keep. If soccer or baseball returns, the architecture is set up to absorb them with little to no contract change.

**STATUS UPDATE:** This plan was written before baseball and soccer were dropped. Sections below referring to the soccer pressure-test describe work that *was done* and produced lasting interface improvements; the soccer adapter sketch file itself is now a tombstone (`adapter-spec/soccer.adapter.sketch.ts` — safe to delete).

**Scope of this work:** Draft the interface and validate it. **No** monorepo setup, **no** extraction of existing football code, **no** new sport implementations. Just the contract, plus enough skeleton implementations to prove the contract holds.

---

## Deliverables

I'll create the following files in a new `/Users/tylermuse_macmini/Projects/gridirongm/adapter-spec/` directory (kept separate from `src/` so it doesn't get mixed into the live app until we're ready):

1. **`README.md`** — Design philosophy, how to read the spec, glossary.
2. **`SportAdapter.ts`** — The core interface. Generic over `TRatings`, `TStats`, `TPosition`, `TLineup`. Includes all sub-interfaces (`RosterRules`, `CapRules`, `AwardDefinition`, etc.).
3. **`BaseTypes.ts`** — Sport-agnostic types the core reuses: `BasePlayer<T>`, `BaseTeam<T>`, `BaseContract`, `BaseDraftPick`, `BaseGameResult<T>`, `BaseLeagueState<T>`.
4. **`football.adapter.ts`** — Concrete football adapter, derived from what's actually in your `src/lib/engine/`. Types only — no real implementations, just function signatures with `// existing logic from <file>` comments pointing to the source.
5. **`basketball.adapter.sketch.ts`** — Basketball adapter, types-only sketch. Validates the contract handles 12-rating, 25-stat, 15-man-roster, possession-based sim, NBA soft cap + Bird rights + apron.
6. **`hockey.adapter.sketch.ts`** — Hockey adapter, types-only sketch. Validates contract handles skater/goalie discriminated player kinds, line combinations as a lineup model distinct from depth charts, NHL hard cap + LTIR mechanics.
7. **`soccer.adapter.sketch.ts`** — **Soccer stress-test.** Types-only sketch. This is the pressure-test that proves the interface generalizes beyond US major leagues. Soccer breaks more assumptions than baseball would have: no salary cap (FFP wage budgets instead), transfer fees as a primary player-movement mechanism, loan deals, parallel competitions (league + cups), promotion/relegation. If any of those can't be expressed, the interface gets redesigned and re-validated against football + basketball + hockey.
8. **`DECISIONS.md`** — A detailed log of the design decisions I made, the alternatives considered, and the reasoning. Written for future Claude Code sessions and contributors who weren't in this conversation — they need full context, not "you remember why we chose X" shorthand.

Total: ~8 files, mostly types and comments, no runtime logic. Expected size: ~1,500–2,200 lines across all files.

---

## Design philosophy

A few principles I'll stick to:

**The adapter owns sport-specific shape, the core owns flow.** The core knows "a season has a regular phase, a playoff phase, and an offseason"; the adapter knows what a regular season looks like in this sport. The core knows "trades involve players and picks"; the adapter knows how to value them.

**Generics for sport-specific data, discriminated unions for sport-specific variants.** A `Player<TRatings, TStats>` is generic over the rating/stat shape. But within a single sport, "pitcher" vs "hitter" is a discriminated union (`kind: 'pitcher' | 'hitter'`), not a generic. This keeps the type system tight while allowing one sport to have multiple player archetypes.

**Optional capabilities, not least-common-denominator.** If a sport doesn't have a feature (football doesn't have minor leagues; basketball doesn't have a 40-man), the adapter just doesn't implement that capability. The core checks for capability presence rather than forcing every sport to stub things out.

**No mutable state in the adapter.** Adapters are pure logic — functions in, data out. State lives in the core's store. This is what makes them swappable per request/per subdomain.

---

## Key design decisions (your input wanted on these)

### 1. How to handle sports with multiple player archetypes

Football has positions but one rating/stat schema. Basketball is similar (all players use the same ratings). Hockey has *skaters* and *goalies* with very different stats. Soccer is mostly uniform but goalkeepers have distinct ratings (handling, reflexes, positioning) most other players don't need.

**My proposal:** Each sport defines a `PlayerKind` enum (usually just `'standard'`, but hockey uses `'skater' | 'goalie'` and soccer uses `'outfield' | 'keeper'`). The `Player` type carries a discriminated `kind` field, and the `TRatings` type is itself a discriminated union when needed:

```typescript
type HockeyRatings =
  | { kind: 'skater'; skating: number; shooting: number; checking: number; ... }
  | { kind: 'goalie'; reflexes: number; positioning: number; rebound_control: number; ... };
```

**Alternative:** One flat ratings object per sport with all fields, where goalies just have N/A skater ratings. Simpler typing, uglier semantics, breaks the "no junk fields" rule.

### 2. Multi-roster / multi-league support (the soccer problem)

Football has: active 53, practice squad 16, IR. Basketball has: active 15, two-ways, G-League stash. Hockey has: NHL roster + AHL affiliate (proposing AHL-only as optional, not required). Soccer has: first team squad, B-team / reserves, loans out (player on your books but playing elsewhere), loans in (someone else's player on your active lineup).

The soccer loan system is the unusual one: a single player can be *owned* by Team A, *registered with* Team B, *playing matches for* Team B, and *return to* Team A on a specific date. That's a different concept from US sports trades.

**My proposal:** A `Rosters` capability where each adapter declares N named rosters with explicit ownership vs. registration semantics:

```typescript
rosters: {
  primary: { name: 'first_team'; size: 25; eligibleFor: ['league', 'cups'] },
  secondary: [
    { name: 'b_team'; size: 25; eligibleFor: ['reserve_league'] },
    { name: 'loaned_out'; size: Infinity; ownedBy: 'self'; playingFor: 'other' },
    { name: 'loaned_in'; size: Infinity; ownedBy: 'other'; playingFor: 'self' },
  ],
}
```

For football and basketball, this collapses to the simple case (one primary roster + secondary rosters with ownership = self, playingFor = self). For soccer, the ownership/registration distinction becomes load-bearing. Hockey's AHL affiliate slots in as a `secondary` roster with optional `runsParallelSchedule: true`.

**This is what soccer breaks that baseball would also have broken.** Better to design for it now.

### 3. Cap rules: declarative or imperative?

NFL hard cap is ~3 rules. NBA cap is ~20 rules (Bird rights, MLE, BAE, apron, trade exception math, sign-and-trade BYC, etc.). NHL has hard cap + LTIR carve-outs. Soccer has *no cap at all in most leagues* — instead there are Financial Fair Play / Profit & Sustainability wage budgets that work very differently (annual P&L based, multi-year monitoring period). The cap subsystem has to be **optional** for soccer to fit.

**My proposal:** Imperative. The cap rules expose a `CapRulesEngine` with these methods:
- `isLegalContract(player, contract, team, league) → ValidationResult`
- `isLegalRoster(team, league) → ValidationResult`
- `deadCapForRelease(player, contract, league) → DeadCapEntry[]`
- `marketValue(player, league) → number`
- `availableCapActions(team, league) → CapAction[]` (e.g., "use mid-level exception", "match RFA offer")

This is more flexible than trying to declaratively describe all cap rules, and matches how you've already structured `salary.ts`. The tradeoff: less introspectable, harder to build a generic "cap UI" without each sport providing custom widgets.

**Alternative:** Hybrid — declare simple rules (hard cap, luxury tax threshold), use functions for complex ones (Bird rights). Probably what I'll actually do unless you object.

### 4. The sim contract

You said hold off on live game sim. So the adapter exposes only:

```typescript
simGame(home: TeamSnapshot, away: TeamSnapshot, ctx: GameContext) → GameResult<TStats>
```

A box-score sim. The core calls this once per scheduled game. Live sim becomes an *optional* capability the adapter can implement later:

```typescript
liveSim?: {
  startGame(home, away, ctx): LiveGameSession
  advance(session, steps): { events: PlayEvent[]; session: LiveGameSession }
  resolve(session): GameResult<TStats>
}
```

This means the football adapter implements both `simGame` and `liveSim` (you already have it), but basketball/hockey/baseball can ship with just `simGame` initially and add live sim later without touching the contract.

### 5. UI metadata vs UI components

The interface declares *what* to render (rating fields, stat columns, position groups, lineup structure), but **does not** ship components. The shared `/web` app reads the adapter's `uiMetadata` and renders sport-appropriate roster pages, depth charts, stat tables.

For lineup-style differences (depth chart vs. rotation vs. lines vs. batting order), the adapter exposes a `LineupModel` interface that the core understands abstractly, and per-sport UI components in `/apps/web/sports/<sport>/` render them concretely. The interface tells the core *what kind of lineup model* the sport uses; sport-specific UI tells the user what it looks like.

---

## Soccer pressure-test methodology

After drafting the football + basketball + hockey adapters, I'll attempt to write `soccer.adapter.sketch.ts`. The test is: **can I express soccer using the interface without modifying it?**

Things soccer will try to break:
- **No salary cap.** The `CapRules` interface needs to be optional (or have a "no cap" implementation) rather than required. (Decision #3.)
- **Transfer fees as primary player movement.** Trades in US sports are player-for-player + picks. Soccer player movement is dominated by transfer fees (cash to the selling club, signing bonus to the player, agent fees). The `PlayerMovement` abstraction has to handle both.
- **Loan deals.** A player ownership-vs-registration split that other sports don't have. (Decision #2.)
- **Multiple parallel competitions.** A Premier League team plays in the league, the FA Cup, the League Cup, and possibly Champions League — all simultaneously, all with their own schedules and standings. The core's "season has a regular phase and a playoff phase" model has to extend to "season has N competitions running in parallel, each with their own phase machine."
- **Promotion/relegation.** A team's *league membership itself can change* between seasons. The core has to support league composition mutation across seasons.
- **No playoffs in most leagues.** Champion = team with most points at end of regular season. Trivially handled if the `PlayoffStructure` is `null`-able.
- **Position fluidity within a match.** A player listed as MF can play LW, AM, or CM in any given match. The lineup model needs flexibility the depth-chart model doesn't.
- **Continuous transfer windows.** Two windows per year (summer + winter), not a single offseason FA period.
- **Squad number ownership.** More meaningful than US sports — players "own" their number for their tenure and it's part of their identity.
- **Wage-as-budget rather than wage-as-cap.** Even teams without FFP constraints have an annual wage budget they don't want to blow up.

If any of these can't be expressed, I'll modify the interface and confirm football + basketball + hockey still fit. **Expected outcome:** I'll find 2–4 interface tweaks soccer forces, mostly around (a) making cap rules optional, (b) generalizing "trade" to "player movement," (c) supporting multiple parallel competitions per season.

---

## Out of scope (explicitly)

- Monorepo setup (`pnpm workspaces`, package.json scaffolding)
- Moving any existing football code into a `@bs/sport-football` package
- Implementing the `@bs/core` package
- Database schema for multi-sport support
- Subdomain routing in Next.js
- Migration path for existing football saves
- Test suite
- Implementing basketball, hockey, or baseball for real

Those all come *after* the interface is locked. Trying to do any of them now would be premature optimization on an unproven contract.

---

## Resolved decisions

- **Baseball:** out of scope. Deferred indefinitely.
- **Naming:** `@bs/` scope (`@bs/core`, `@bs/sport-football`, `@bs/sport-basketball`, `@bs/sport-hockey`). Matches your domain portfolio. Soccer and baseball deferred — see DECISIONS.md.
- **`DECISIONS.md` audience:** written for future Claude Code sessions. Full context, no "you remember why" shorthand. This means every decision gets the problem, the alternatives, the choice, and the reasoning, plus pointers to the files where the decision is implemented.

## Remaining open question

- **Hockey scope:** include AHL affiliate league as a real first-class concept (parallel scheduled season with its own standings), or model it as a simple "minors stash" roster bucket (players exist there but no real AHL games are simulated)? **My default if you don't answer:** simple minors stash for v1, with the interface designed so a future "real AHL" implementation only requires extending the hockey adapter, not changing the core. If you'd want full AHL eventually, say so and I'll design the hooks now.

---

## What happens after you approve

1. You answer the one remaining open question (or accept my default).
2. I create the 8 files in `/Users/tylermuse_macmini/Projects/gridirongm/adapter-spec/`.
3. I do the soccer pressure-test pass and report back what (if anything) needed to change in the interface.
4. You review the interface and either approve or request changes.
5. Once approved, this becomes the source of truth for Phase 2 of the larger refactor.

**Expected time:** 4–6 hours of focused work for me to produce all 8 files. You'll have something concrete to react to in one sitting.
