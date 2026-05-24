# @bs/core

Sport-agnostic GM platform core for the BS sports family (BS Football, BS Hoops, BS Hockey, etc.).

## Status

**Skeleton.** Created during Sub-phase 1B of the Phase 1 multi-sport refactor. No real exports yet — populated incrementally:

| Sub-phase | What gets added |
|---|---|
| 1C | `./adapter` — the SportAdapter contract and base types, promoted from `../../adapter-spec/` |
| 1D | `./storage`, `./supabase`, `./billing`, `./podcast`, `./gm`, `./achievements`, `./analytics` — pure-utility modules extracted from `../../src/lib/` |
| Phase 2+ | sport-pluggable engine modules (negotiation, awards, recap, news, etc.) |

## Design

This package depends on **nothing sport-specific**. Sport variance comes in via the `SportAdapter` interface (see `./adapter`). Each sport (`@bs/sport-football`, `@bs/sport-basketball`, ...) implements that interface; `@bs/core` consumes it without knowing which sport is active.

See `../../adapter-spec/DECISIONS.md` for the full architectural reasoning.

## Consumers

- `apps/web` (the Next.js app — currently at `../../src/`, moves into `apps/web/` in Sub-phase 1E)
- Future apps that share the same core

## Conventions

- No runtime side effects at import time.
- No React imports (this is a pure data/logic package — UI lives in apps).
- No `window`, `document`, `localStorage` references outside of explicitly browser-targeted submodules (e.g., `./storage`, which is intentionally browser-only).
- All exports go through `./src/index.ts` for the package root, or a stable subpath (`./adapter`, `./storage`, etc.) declared in `package.json`'s `exports` field.
