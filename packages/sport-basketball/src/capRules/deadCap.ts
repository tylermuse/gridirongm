/**
 * Dead cap from released players.
 *
 * Two paths:
 *   - Straight release ("waive"): all remaining guaranteed money hits as
 *     dead cap in the year it was originally owed. No spreading.
 *   - Waive-and-stretch: spread total remaining guaranteed across
 *     (2 × remaining years) + 1 years. Reduces year-to-year dead cap
 *     bite but extends the term. NBA rule: only available before Sept 1
 *     of the league year; v1 ignores the date gate.
 *
 * v1 simplifications:
 *   - No "set-off rights" (when waived player signs elsewhere, the
 *     original team's dead cap reduces by their new salary above the
 *     minimum). Adds bookkeeping; defer.
 *   - No buy-out negotiation (player accepts less to be released early).
 *     Real NBA: players can accept buyouts that reduce the dead cap.
 *   - No "stretch-provision cap blocker" — in real NBA you can't
 *     stretch if the stretched amount would push prior-year dead cap
 *     above 15% of cap. v1 ignores.
 */

import type { BaseContract } from '@bs/core/adapter';
import type { BasketballPlayer } from '../types';

export type ReleaseMode = 'waive' | 'stretch';

export interface DeadCapEntry {
  /** Year (season) this dead cap charge applies to. */
  season: number;
  /** Amount counting against the cap that season. */
  amount: number;
  /** Why this charge exists (always 'release' + a sub-reason in v1). */
  reason: string;
}

export interface DeadCapForReleaseOptions {
  /** Season the release occurs in (and from which dead cap is computed). */
  releaseSeason: number;
  /** 'waive' (default) or 'stretch'. */
  mode?: ReleaseMode;
}

/**
 * Compute dead cap entries from releasing a player.
 *
 * Returns an array of DeadCapEntry, one per season the dead cap hits.
 * Returns empty if the player has no contract or no remaining
 * guaranteed money.
 */
export function basketballDeadCapForRelease(
  player: BasketballPlayer,
  opts: DeadCapForReleaseOptions,
): DeadCapEntry[] {
  if (!player.contract) return [];
  const mode = opts.mode ?? 'waive';
  const remaining = remainingGuaranteedYears(player.contract, opts.releaseSeason);
  if (remaining.length === 0) return [];

  if (mode === 'waive') {
    // Straight release: each guaranteed year hits as dead cap in its
    // originally-owed season.
    return remaining.map(y => ({
      season: y.season,
      amount: y.amount,
      reason: 'release:waive',
    }));
  }

  // Waive-and-stretch: spread total over (2 × remaining years) + 1
  const totalRemaining = remaining.reduce((s, y) => s + y.amount, 0);
  const yearsRemaining = remaining.length;
  const stretchYears = (2 * yearsRemaining) + 1;
  const perYear = Math.round(totalRemaining / stretchYears);
  const entries: DeadCapEntry[] = [];
  for (let i = 0; i < stretchYears; i++) {
    // Final year absorbs any rounding remainder
    const amount = i === stretchYears - 1
      ? totalRemaining - (perYear * (stretchYears - 1))
      : perYear;
    entries.push({
      season: opts.releaseSeason + i,
      amount,
      reason: 'release:stretch',
    });
  }
  return entries;
}

/** Filter contract years for "guaranteed money from a given season forward."
 *  Used by both straight release + stretch math. */
function remainingGuaranteedYears(
  contract: BaseContract,
  fromSeason: number,
): { season: number; amount: number }[] {
  const out: { season: number; amount: number }[] = [];
  for (const y of contract.years) {
    if (y.season < fromSeason) continue;
    if (!y.guaranteed) continue;
    out.push({
      season: y.season,
      amount: y.baseSalary + y.proratedBonus,
    });
  }
  return out;
}

/**
 * Compare both release modes for a player. Returns the year-1 dead cap
 * difference — useful for UI that wants to show "stretch saves $X this
 * year but extends Y years."
 */
export function basketballStretchPreview(
  player: BasketballPlayer,
  releaseSeason: number,
): {
  waiveEntries: DeadCapEntry[];
  stretchEntries: DeadCapEntry[];
  yearOneSavings: number;
  termExtensionYears: number;
} | null {
  if (!player.contract) return null;
  const waiveEntries = basketballDeadCapForRelease(player, { releaseSeason, mode: 'waive' });
  const stretchEntries = basketballDeadCapForRelease(player, { releaseSeason, mode: 'stretch' });
  if (waiveEntries.length === 0) return null;

  const waiveYearOne = waiveEntries.find(e => e.season === releaseSeason)?.amount ?? 0;
  const stretchYearOne = stretchEntries.find(e => e.season === releaseSeason)?.amount ?? 0;
  const termExtensionYears = stretchEntries.length - waiveEntries.length;

  return {
    waiveEntries,
    stretchEntries,
    yearOneSavings: waiveYearOne - stretchYearOne,
    termExtensionYears,
  };
}
