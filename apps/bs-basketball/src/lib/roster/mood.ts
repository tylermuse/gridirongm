/**
 * Derived player mood (basketball has no morale model, so this is computed live
 * from role-vs-talent + contract — no persistence, works on every save). Mirrors
 * football's 6-band roster "Mood" chip: from Thrilled down to Angry, so the
 * column carries real color and range rather than mostly Content/Restless.
 */

import type { BasketballPlayer } from '@bs/sport-basketball';

export interface Mood { label: string; color: string; emoji: string; reason: string }

export function playerMood(opts: {
  player: BasketballPlayer;
  /** 0-based OVR rank on the team (0 = best player). */
  talentRank: number;
  isStarter: boolean;
  yearsLeft: number;
}): Mood {
  const { player, talentRank, isStarter, yearsLeft } = opts;
  const ovr = player.ratings.overall;
  const age = player.age;
  const potential = player.development.potential;
  const expectsStart = talentRank < 5;
  const upside = potential - ovr;

  // Angry — a clear star riding the bench (holdout risk).
  if (ovr >= 80 && !isStarter) {
    return { label: 'Angry', color: '#dc2626', emoji: '😠', reason: 'A star stuck on the bench — trade demand brewing' };
  }
  // Unhappy — a rotation-caliber player who expects to start but doesn't.
  if (expectsStart && !isStarter) {
    return { label: 'Unhappy', color: '#f97316', emoji: '😟', reason: 'Expects to be starting' };
  }
  // Restless — good player in a contract year wanting an extension.
  if (yearsLeft <= 1 && ovr >= 72) {
    return { label: 'Restless', color: '#f59e0b', emoji: '😒', reason: 'Contract expiring — wants an extension' };
  }
  // Thrilled — young ascending talent in the starting five.
  if (age <= 23 && upside >= 8 && isStarter) {
    return { label: 'Thrilled', color: '#16a34a', emoji: '😀', reason: 'Young star ascending with a featured role' };
  }
  // Happy — developing, or punching above his expected role.
  if ((age <= 23 && upside >= 6) || (!expectsStart && isStarter)) {
    return { label: 'Happy', color: '#3b82f6', emoji: '🙂', reason: age <= 23 && upside >= 6 ? 'Young and developing' : 'Starting above expectations' };
  }
  return { label: 'Content', color: 'var(--text-sec)', emoji: '😐', reason: 'Role fits his level' };
}
