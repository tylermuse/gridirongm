/**
 * NBA-style lineup model.
 *
 * Basketball lineups are a rotation: 5 starters (one per position) + a bench
 * ordered by rotation priority. Each starting position also has a designated
 * backup so injury substitutions are deterministic.
 *
 * The core stores lineups as opaque TLineup blobs and hands them to the
 * adapter for sim and rendering. This module supplies:
 *   - buildDefault(roster): auto-build a sensible lineup from a roster
 *   - validate(lineup, roster): check internal consistency
 *
 * v1 simplifications:
 *   - buildDefault picks top-OVR player at each position. No "starting
 *     two PFs because we don't have a real C" heuristic — if you don't
 *     have a C, you get a null starter at C and a violation from validate.
 *   - Bench is sorted by OVR descending after starters are picked.
 *   - No minutes distribution — sim engine has its own simple 4:2 starter:bench
 *     pattern. v2 lineup model could carry explicit minutes targets.
 */

import type {
  PlayerId,
  ValidationResult,
  ValidationViolation,
  BasePlayer,
} from '@bs/core/adapter';
import type {
  BasketballPlayer,
  BasketballPosition,
  BasketballLineup,
} from '../types';

// Re-export the canonical lineup type so callers can import from this module.
export type { BasketballLineup } from '../types';

// ===========================================================================
// Starter slot order
// ===========================================================================

const STARTER_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// ===========================================================================
// Position groups (FEAT-21: flexible G/F/C slots)
// ===========================================================================
//
// Lineups are built from position GROUPS rather than the five exact positions:
// two guards, two forwards, one center. So the best two guards start (even if
// both are SGs) instead of forcing a weak natural-PG into the lineup over a
// better SG. A start within your own group is "in position"; only a start
// outside it (e.g. a center at guard) is flagged.

type PositionGroup = 'G' | 'F' | 'C';

const POSITION_GROUP: Record<BasketballPosition, PositionGroup> = {
  PG: 'G', SG: 'G', SF: 'F', PF: 'F', C: 'C',
};

/** The group each starter slot belongs to, aligned with STARTER_POSITIONS. */
const SLOT_GROUPS: readonly PositionGroup[] = ['G', 'G', 'F', 'F', 'C'];

/** How many starters each group fields. */
const GROUP_QUOTA: Record<PositionGroup, number> = { G: 2, F: 2, C: 1 };

export function basketballPositionGroup(pos: BasketballPosition): PositionGroup {
  return POSITION_GROUP[pos];
}

/** True if a player of `pos` is "in position" at starter slot `slotIndex`
 *  (0..4) — i.e. their group matches the slot's group. */
export function isInPositionAtSlot(pos: BasketballPosition, slotIndex: number): boolean {
  return POSITION_GROUP[pos] === SLOT_GROUPS[slotIndex];
}

// ===========================================================================
// buildDefault
// ===========================================================================

/**
 * Build a sensible default lineup from a roster:
 *   - Highest-OVR player at each position starts
 *   - Next-best player at each position becomes the backup
 *   - Remaining players form the bench, sorted by OVR descending
 *
 * Returns a partial lineup (with null IDs as placeholders) if the roster
 * is short at a position; callers should re-run validate() to catch it.
 */
export function buildDefaultBasketballLineup(
  roster: BasketballPlayer[],
): BasketballLineup {
  const byOvr = [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall);
  const used = new Set<PlayerId>();

  // Fill each group (2 guards, 2 forwards, 1 center) with its best natural
  // players first — so the two best GUARDS start, not the best natural-PG plus a
  // worse natural-SG. Short groups (e.g. only one true center) borrow the best
  // remaining player, position-adjacent before anything.
  const picked: Record<PositionGroup, PlayerId[]> = { G: [], F: [], C: [] };
  for (const p of byOvr) {
    const g = POSITION_GROUP[p.sportData.position];
    if (picked[g].length < GROUP_QUOTA[g]) {
      picked[g].push(p.id);
      used.add(p.id);
    }
  }
  const adjacency: Record<PositionGroup, PositionGroup[]> = {
    G: ['F', 'C'], // a guard slot, if short, prefers a forward, then a center
    F: ['C', 'G'], // a forward slot prefers a big, then a guard
    C: ['F', 'G'], // a center slot prefers a forward, then a guard
  };
  for (const g of ['G', 'F', 'C'] as PositionGroup[]) {
    while (picked[g].length < GROUP_QUOTA[g]) {
      const next =
        adjacency[g]
          .map(adj => byOvr.find(p => !used.has(p.id) && POSITION_GROUP[p.sportData.position] === adj))
          .find(Boolean) ?? byOvr.find(p => !used.has(p.id));
      if (!next) break; // fewer than 5 players total
      picked[g].push(next.id);
      used.add(next.id);
    }
  }

  // Place the picks into the five named slots in group order [G, G, F, F, C].
  // Within a group, prefer each player's NATURAL slot when a clean assignment
  // exists — so two guards land as PG+SG rather than a needlessly cross-assigned
  // SG-at-PG / PG-at-SG (BUG-16). Only same-position pairs stay in OVR order.
  const posOf = new Map(roster.map(p => [p.id, p.sportData.position] as const));
  const order2 = (ids: PlayerId[], slotA: BasketballPosition, slotB: BasketballPosition): [PlayerId, PlayerId] => {
    const a = ids[0] ?? ('' as PlayerId);
    const b = ids[1] ?? ('' as PlayerId);
    // Swap only when doing so gives BOTH players their natural slot.
    if (posOf.get(a) === slotB && posOf.get(b) === slotA) return [b, a];
    return [a, b];
  };
  const [pg, sg] = order2(picked.G, 'PG', 'SG');
  const [sf, pf] = order2(picked.F, 'SF', 'PF');
  const starterIds: PlayerId[] = [pg, sg, sf, pf, picked.C[0] ?? ('' as PlayerId)];

  // Bench = everyone else, by OVR (rotation priority). Backups are vestigial now
  // that resolveLineup repairs stale lineups via the bench order — leave null.
  const bench = byOvr.filter(p => !used.has(p.id)).map(p => p.id);

  return {
    starters: starterIds as BasketballLineup['starters'],
    bench,
    backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null },
    pace: 'medium',
  };
}

// ===========================================================================
// validate
// ===========================================================================

/**
 * Check internal lineup consistency:
 *   - Exactly 5 distinct starters
 *   - No starter ID appears in bench or backups
 *   - Each starter's position matches its slot (PG slot has a PG, etc.)
 *   - No duplicate IDs anywhere
 *   - All referenced IDs exist on the roster
 */
export function validateBasketballLineup(
  lineup: BasketballLineup,
  roster: BasketballPlayer[],
): ValidationResult {
  const violations: ValidationViolation[] = [];
  const warnings: ValidationViolation[] = [];

  const rosterById = new Map(roster.map(p => [p.id, p]));

  // Starters: exactly 5, all on roster, all non-empty
  if (lineup.starters.length !== 5) {
    violations.push({
      code: 'LINEUP_WRONG_STARTER_COUNT',
      message: `Lineup must have exactly 5 starters; got ${lineup.starters.length}.`,
    });
  }
  const starterSet = new Set<PlayerId>();
  for (let i = 0; i < lineup.starters.length; i++) {
    const id = lineup.starters[i];
    const expectedPos = STARTER_POSITIONS[i];
    if (!id) {
      violations.push({
        code: 'LINEUP_MISSING_STARTER',
        message: `No starter assigned at ${expectedPos}.`,
      });
      continue;
    }
    if (starterSet.has(id)) {
      violations.push({
        code: 'LINEUP_DUPLICATE_STARTER',
        message: `Player ${id} appears twice in starters.`,
        ref: { kind: 'player', id },
      });
    }
    starterSet.add(id);

    const player = rosterById.get(id);
    if (!player) {
      violations.push({
        code: 'LINEUP_STARTER_NOT_ON_ROSTER',
        message: `Starter ${id} is not on the roster.`,
        ref: { kind: 'player', id },
      });
      continue;
    }
    // FEAT-21: only flag a start that's OUTSIDE the slot's position group (e.g. a
    // center at guard) — a within-group flex (an SG at the PG slot, a PF at SF)
    // is legitimate and no longer warned.
    if (!isInPositionAtSlot(player.sportData.position, i)) {
      warnings.push({
        code: 'LINEUP_POSITION_MISMATCH',
        message: `${id} listed as ${player.sportData.position} starting at ${expectedPos}.`,
        ref: { kind: 'player', id },
      });
    }
  }

  // Bench: no overlap with starters, all on roster
  const benchSet = new Set<PlayerId>();
  for (const id of lineup.bench) {
    if (starterSet.has(id)) {
      violations.push({
        code: 'LINEUP_BENCH_OVERLAPS_STARTER',
        message: `${id} is both a starter and on the bench.`,
        ref: { kind: 'player', id },
      });
    }
    if (benchSet.has(id)) {
      violations.push({
        code: 'LINEUP_DUPLICATE_BENCH',
        message: `${id} listed twice on the bench.`,
        ref: { kind: 'player', id },
      });
    }
    benchSet.add(id);
    if (!rosterById.has(id)) {
      violations.push({
        code: 'LINEUP_BENCH_NOT_ON_ROSTER',
        message: `Bench player ${id} is not on the roster.`,
        ref: { kind: 'player', id },
      });
    }
  }

  // Backups: optional, but if set must be on roster & not the same as the starter
  for (const pos of STARTER_POSITIONS) {
    const backupId = lineup.backupsByPosition[pos];
    if (!backupId) continue;
    const starterId = lineup.starters[STARTER_POSITIONS.indexOf(pos)];
    if (backupId === starterId) {
      violations.push({
        code: 'LINEUP_BACKUP_IS_STARTER',
        message: `Backup ${pos} ${backupId} is also the starter.`,
        ref: { kind: 'player', id: backupId },
      });
    }
    if (!rosterById.has(backupId)) {
      violations.push({
        code: 'LINEUP_BACKUP_NOT_ON_ROSTER',
        message: `Backup ${pos} ${backupId} is not on the roster.`,
        ref: { kind: 'player', id: backupId },
      });
    }
  }

  return { valid: violations.length === 0, violations, warnings };
}

// ===========================================================================
// Adapter wrapper — typed against the generic BasePlayer signature so the
// LineupModelDescriptor type matches.
// ===========================================================================

/** buildDefault wrapper that accepts the generic BasePlayer[] type from the
 *  adapter contract and narrows internally. */
export function buildDefaultLineupAdapter(
  players: BasePlayer<unknown, unknown>[],
): BasketballLineup {
  return buildDefaultBasketballLineup(players as BasketballPlayer[]);
}

/** validate wrapper that accepts the generic BasePlayer[] type. */
export function validateLineupAdapter(
  lineup: BasketballLineup,
  players: BasePlayer<unknown, unknown>[],
): ValidationResult {
  return validateBasketballLineup(lineup, players as BasketballPlayer[]);
}

