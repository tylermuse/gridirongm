# @bs/sport-football

BS Football sport adapter. Implements the `SportAdapter` contract from `@bs/core/adapter` for American football.

## Status

**Skeleton.** Created during Sub-phase 1B. Empty until Phase 2, when the existing engine code in `../../src/lib/engine/` gets migrated here and reshaped to satisfy the adapter contract.

## What will live here (Phase 2)

| Source | Adapter capability |
|---|---|
| `src/lib/engine/playerGen.ts` | `playerGen` |
| `src/lib/engine/simulate.ts` | `simEngine.simGame` |
| `src/lib/engine/playByPlay.ts` + `liveCoachEngine.ts` | `liveSim` (optional capability) |
| `src/lib/engine/schedule.ts` | `scheduleGenerator` |
| `src/lib/engine/salary.ts` | `capRules` |
| `src/lib/engine/development.ts` | `developmentSystem` |
| `src/lib/engine/awards.ts` | `awards` |
| `src/lib/engine/coaching.ts` + helpers | `coachingSystem` |
| `src/lib/engine/draftScoutEval.ts`, `draftGrades.ts` | `draftSystem` |

See `../../adapter-spec/football.adapter.ts` for the full mapping table and the eventual export shape.

## What does NOT live here

Sport-agnostic engine modules (negotiation, approval, social, recap, debate, achievements) migrate into `@bs/core` instead. Only football-specific logic ends up in this package.
