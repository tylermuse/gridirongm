# @bs/sport-basketball

BS Hoops sport adapter. Implements the `SportAdapter` contract from `@bs/core/adapter` for basketball.

## Status

**Phase 2A in progress.** The package was an empty skeleton; the sim engine is being built first because it's the highest-risk + most novel piece.

| Module | Status |
|---|---|
| `src/types/` | In progress — basketball ratings, stats, positions, sport-specific extension data |
| `src/sim/` | In progress — possession-based box-score sim |
| `src/adapter/` | Not started |
| `src/playerGen/` | Not started |
| `src/scheduleGenerator/` | Not started |
| `src/capRules/` | Not started |
| `src/draftSystem/` | Not started |
| `src/awards/` | Not started |
| `src/developmentSystem/` | Not started |

## Reference

- `packages/core/src/adapter/sketches/basketball.adapter.sketch.ts` — the types-only sketch from Phase 1 that proved the SportAdapter interface could express basketball. This package promotes that sketch into a runnable implementation.
- `packages/core/docs/DECISIONS.md` — design rationale for the SportAdapter contract.
- `PHASE-2-PLAN.md` (repo root) — what's being built and why.
- [Basketball GM](https://github.com/dumbmatter/bbgm) (external, MIT-licensed) — the gold-standard open-source basketball sim. Not a code source, but a calibration reference for "what does a good possession-based sim look like?"

## Design principles

- **Box-score sim only (v1)** — no live possession-by-possession UI. Match BS Football's v1 sim model. Live sim is a v2 feature.
- **Stats look NBA-realistic** — average PPG 105-115, FG% 45%, 3PT% 36%, FT% 77%, rebounds 42-46 per team. Tuning the sim to produce believable stat lines is the bar, not raw simulation accuracy.
- **No store mutations** — pure functions. The Next.js app's Zustand store calls into `simGame()` and applies the result.
- **Deterministic on seed** — pass an RNG seed to `simGame()` to get a reproducible game. Needed for save/load roundtrips and bug repro.
