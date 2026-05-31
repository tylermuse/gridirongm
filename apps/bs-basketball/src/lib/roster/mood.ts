/**
 * Derived player mood (basketball has no morale model, so this is computed live
 * from role-vs-talent + contract — no persistence, works on every save). Mirrors
 * football's roster "Mood" chip: Content by default, Happy when overachieving or
 * developing, Restless on an expiring deal, Unhappy when a clear starter sits.
 */

import type { BasketballPlayer } from '@bs/sport-basketball';

export interface Mood { label: string; color: string; reason: string }

export function playerMood(opts: {
  player: BasketballPlayer;
  /** 0-based OVR rank on the team (0 = best player). */
  talentRank: number;
  isStarter: boolean;
  yearsLeft: number;
}): Mood {
  const { player, talentRank, isStarter, yearsLeft } = opts;
  const ovr = player.ratings.overall;
  const { age, development } = { age: player.age, development: player.development };
  const expectsStart = talentRank < 5;

  if ((expectsStart || ovr >= 80) && !isStarter) {
    return {
      label: 'Unhappy',
      color: '#dc2626',
      reason: ovr >= 80 ? 'A star coming off the bench' : 'Expects to be starting',
    };
  }
  if (yearsLeft <= 1 && ovr >= 72) {
    return { label: 'Restless', color: '#f59e0b', reason: 'Contract expiring — wants an extension' };
  }
  if (age <= 23 && development.potential - ovr >= 6) {
    return { label: 'Happy', color: '#3b82f6', reason: 'Young and developing' };
  }
  if (!expectsStart && isStarter) {
    return { label: 'Happy', color: '#3b82f6', reason: 'Starting above expectations' };
  }
  return { label: 'Content', color: 'var(--text-sec)', reason: 'Role fits his level' };
}
