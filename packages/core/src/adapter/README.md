# @bs/core/adapter — SportAdapter Spec

> **Status:** Draft v0.1. The interface that every BS sport adapter must satisfy.
>
> **Location:** `packages/core/src/adapter/` (promoted from the original `adapter-spec/` during Sub-phase 1C of the Phase 1 monorepo refactor).
>
> **Context:** see `/PHASE-1-PLAN.md` and `/MULTI-SPORT-ADAPTER-PLAN.md` at the repo root.

## What this is

The contract that lets `@bs/core` (a sport-agnostic GM platform) work with any sport (`@bs/sport-football`, `@bs/sport-basketball`, `@bs/sport-hockey`) without knowing the sport's specifics.

**Sports in scope:** football (built), basketball (next), hockey (later). Baseball and soccer deferred — see DECISIONS.md.

**Note on the interface's headroom:** the contract was originally designed against a fourth sport (soccer) as a pressure-test. Soccer was subsequently dropped from scope, but the interface generalizations it forced (`tieFormat`, `empty(kind?)`, optional `capRules`, the `Competition[]` array) were kept because they're either actively used by the remaining sports or cost ~nothing to keep. The architecture is therefore intentionally a bit broader than the active sports require — that's deliberate future-proofing, not over-engineering.

If you're a future Claude Code session reading this for the first time, **read in this order**:

1. **`README.md`** (this file) — orientation, glossary, file map.
2. **`../../docs/DECISIONS.md`** — the *why* behind everything. Read before touching any types.
3. **`BaseTypes.ts`** — the sport-agnostic core types every adapter consumes.
4. **`SportAdapter.ts`** — the actual interface every sport implements.
5. **`sketches/football.adapter.ts`** — concrete reference. Maps the abstract interface to the real code in `apps/web/src/lib/engine/` (or `src/lib/engine/` pre-Sub-phase-1E).
6. **`sketches/basketball.adapter.sketch.ts`** — second concrete sport, validates the interface generalizes.
7. **`sketches/hockey.adapter.sketch.ts`** — third concrete sport, validates skater/goalie discriminated kinds + line-based lineups.

## Design philosophy

Four principles. If a change you're making violates one of these, stop and reconsider.

**1. The adapter owns sport-specific shape. The core owns flow.**
The core knows "a season has phases" and "trades involve players + picks." The adapter knows what a phase looks like for this sport and how to value those players + picks. Anything that's the same across sports (the *flow*) lives in the core. Anything that differs (the *shape*) lives in the adapter.

**2. Generics for sport-specific data shapes. Discriminated unions for sport-specific variants.**
`Player<TRatings, TStats>` is generic over rating/stat shape — that varies per sport. But within hockey, `kind: 'skater' | 'goalie'` is a discriminated union — that varies *within* a sport. Use the right tool for the right kind of variance.

**3. Capabilities are optional, not least-common-denominator.**
Soccer has no salary cap. Football has no transfer fees. Baseball (if it ever comes back) has minor leagues. Don't force every sport to stub out features it doesn't have. The core checks for capability presence and gracefully degrades behavior.

**4. Adapters are pure logic. No mutable state.**
Adapters are functions in, data out. The store lives in the core. This is what makes adapters swappable per-subdomain and what makes parallel multi-sport development tractable.

## Glossary

These terms recur throughout the spec. They mean specific things.

- **Adapter** — A typed module implementing `SportAdapter<...>` for a specific sport. Lives in `@bs/sport-<name>`.
- **Capability** — An optional sub-system an adapter may or may not implement. `CapRules` is a capability; soccer doesn't implement it. `LiveSim` is a capability; basketball/hockey/soccer don't implement it yet. Core checks `if (adapter.capRules) {...}` rather than assuming.
- **Kind** — A discriminator inside a sport for player archetypes that share the same adapter but have different rating/stat shapes. Examples: `'skater' | 'goalie'` for hockey, `'outfield' | 'keeper'` for soccer. Football and basketball use only `'standard'`.
- **Lineup model** — How the sport organizes who plays. Football uses a positional depth chart. Basketball uses a starter/rotation/bench rotation. Hockey uses forward lines + defense pairs + goalie rotation. Soccer uses a formation + starting XI + bench. Each is structurally different; the adapter declares which it uses and the UI renders accordingly.
- **Player movement** — Generalized "trade." Covers US-style player-for-player swaps *and* soccer transfer fees *and* loans *and* free agency signings *and* releases. The core knows about player movement; the adapter knows what kinds its sport supports.
- **Phase** — A segment of the season calendar: `preseason`, `regular`, `playoffs`, `offseason`, plus sport-specific phases like soccer's `winter_transfer_window` or hockey's `expansion_draft_window`. The core advances through phases; the adapter declares its phase machine.
- **Competition** — A standalone tournament/league a team participates in. Football and basketball have one (regular season → playoffs). Soccer teams play in 2–4 simultaneously (league + domestic cups + continental cup). Each competition has its own phase machine.
- **Roster bucket** — A named container of players within a team. Football's `active` + `practice_squad` + `injured_reserve` are roster buckets. Soccer adds `loaned_out` and `loaned_in` with ownership vs. registration semantics.

## File map

```
packages/core/
├── docs/
│   └── DECISIONS.md                ← why we did things this way
└── src/
    ├── index.ts                    ← @bs/core entrypoint
    └── adapter/
        ├── README.md               ← you are here
        ├── index.ts                ← @bs/core/adapter public exports
        ├── BaseTypes.ts            ← sport-agnostic types
        ├── SportAdapter.ts         ← the contract
        └── sketches/               ← reference adapter sketches (not exported)
            ├── football.adapter.ts
            ├── basketball.adapter.sketch.ts
            └── hockey.adapter.sketch.ts
```

## How to extend

Adding a new sport (e.g., if soccer or baseball comes back):
1. Read `DECISIONS.md` end to end. No exceptions.
2. Read the closest existing adapter sketches to your sport (for soccer: basketball + hockey are closest in roster shape, but the interface was originally designed against soccer so a lot of generalization is already there).
3. Create `<sport>.adapter.sketch.ts` and try to fill it in *without* modifying `SportAdapter.ts` or `BaseTypes.ts`.
4. If you have to modify the interface: document why in `DECISIONS.md`'s "Interface change log," then re-validate all existing adapters still compile.
5. Only after the sketch is complete and the interface accommodates it: move to a real `@bs/sport-<name>` package and implement.

## What this spec does NOT cover

- Monorepo setup (Phase 1 of the broader refactor)
- Migration of existing football code into `@bs/sport-football` (Phase 2)
- The shared `@bs/core` package implementation (Phase 2)
- Database schema for multi-sport user accounts
- Subdomain routing in Next.js
- Save format migration

Those are downstream of this contract being approved. Don't try to design them until the contract is locked.
