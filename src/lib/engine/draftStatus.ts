/**
 * When is the draft over?
 *
 * Two ways: every pick has been made, or nobody is left to pick. The second
 * happens whenever a league has more picks than prospects: an imported league
 * with more than 32 teams (a college file has 130+, so 900+ picks), an
 * expansion team (231 picks against 224 generated prospects), or an imported
 * class that is simply short.
 *
 * Everything that asks the question goes through here (the store's draft
 * actions, the top bar, the draft page) so they cannot disagree. They used to:
 * the draft page treated an empty class as "Draft Complete!" while the top bar
 * looked only at the pick order, kept offering "Auto-Draft All" and never
 * showed "Start New Season".
 */
import type { Player } from '@/types';

/**
 * True while at least one draft prospect is still available. During the draft
 * `freeAgents` holds the class, plus anyone released since it started; only
 * the rookies (experience 0) count.
 */
export function hasDraftableProspect(freeAgents: readonly string[], players: readonly Player[]): boolean {
  if (freeAgents.length === 0) return false;
  const pool = new Set(freeAgents);
  return players.some(p => p.experience === 0 && pool.has(p.id));
}

/** True once no further pick can be made. Only meaningful in the draft phase. */
export function isDraftOver(state: {
  draftOrder: readonly string[];
  freeAgents: readonly string[];
  players: readonly Player[];
}): boolean {
  return state.draftOrder.length === 0 || !hasDraftableProspect(state.freeAgents, state.players);
}
