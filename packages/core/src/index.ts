/**
 * @bs/core — sport-agnostic GM platform core.
 *
 * Re-exports the SportAdapter contract from ./adapter so that simple
 * `import { SportAdapter } from '@bs/core'` works for consumers that don't
 * care about the deeper module structure. Consumers that want only the
 * adapter contracts can import from '@bs/core/adapter' to avoid pulling in
 * runtime modules once those exist.
 *
 * Future additions to this re-export list (Phase 1D+):
 *   - ./storage  (IndexedDB save/load)
 *   - ./supabase (auth clients)
 *   - ./billing  (Stripe wrappers + subscription state)
 *   - ./podcast  (audio generation)
 *   - ./gm       (GM profile sync + leaderboard)
 *   - ./achievements
 *   - ./analytics
 */

export type * from './adapter';
