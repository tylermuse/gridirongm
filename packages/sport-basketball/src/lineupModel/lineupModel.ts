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
  // Group roster by position, each group sorted by OVR descending
  const byPos: Record<BasketballPosition, BasketballPlayer[]> = {
    PG: [], SG: [], SF: [], PF: [], C: [],
  };
  for (const p of roster) {
    byPos[p.sportData.position].push(p);
  }
  for (const pos of STARTER_POSITIONS) {
    byPos[pos].sort((a, b) => b.ratings.overall - a.ratings.overall);
  }

  // Pick starters (top of each pile). If a position is empty, fall back to the
  // best unused player from ANY position rather than emitting an empty-string
  // sentinel — the sim engine assumes all five starters are real PlayerIds, and
  // a '' there dereferences to undefined and crashes the possession loop. A
  // cross-position start (e.g. a backup PF at C) is a `validate` warning, not a
  // crash. Only when the roster has fewer than five players total does a
  // sentinel remain — a genuinely unfillable lineup the caller must handle.
  const starterIds: PlayerId[] = [];
  const used = new Set<PlayerId>();
  for (const pos of STARTER_POSITIONS) {
    const top = byPos[pos].find(p => !used.has(p.id));
    if (top) {
      starterIds.push(top.id);
      used.add(top.id);
      continue;
    }
    const fallback = roster
      .filter(p => !used.has(p.id))
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    if (fallback) {
      starterIds.push(fallback.id);
      used.add(fallback.id);
    } else {
      // Truly empty — fewer than 5 players on the roster.
      starterIds.push('' as PlayerId);
    }
  }

  // Pick backups (second-best at each position; fall back to next-best
  // unused player who can plausibly play the position)
  const backupsByPosition: Record<BasketballPosition, PlayerId | null> = {
    PG: null, SG: null, SF: null, PF: null, C: null,
  };
  for (const pos of STARTER_POSITIONS) {
    const candidate = byPos[pos].find(p => !used.has(p.id));
    if (candidate) {
      backupsByPosition[pos] = candidate.id;
      used.add(candidate.id);
    }
  }

  // Bench = everyone else, sorted by OVR descending (rotation priority)
  const bench = roster
    .filter(p => !used.has(p.id))
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .map(p => p.id);

  return {
    starters: starterIds as BasketballLineup['starters'],
    bench,
    backupsByPosition,
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
    if (player.sportData.position !== expectedPos) {
      // Warning rather than violation — small-ball / position-less can be
      // legitimate, but UI should flag the mismatch.
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

