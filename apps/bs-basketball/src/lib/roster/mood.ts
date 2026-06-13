/**
 * Derived player mood (basketball has no morale model, so this is computed live
 * from role-vs-talent + contract + team form — no persistence, works on every
 * save). Mirrors football's 6-band roster "Mood" chip: from Thrilled down to
 * Angry, so the column carries real color and range rather than mostly
 * Content/Restless.
 */

import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

export interface Mood { label: string; color: string; emoji: string; reason: string }

/** A single contributing factor behind a player's mood. */
export interface MoodFactor { label: string; positive: boolean }

/** Wins minus losses over the team's recent streak window (last 5-10 games). */
function recentForm(team: BasketballTeam): { wins: number; losses: number; net: number } {
  const streak = team.record.streak ?? [];
  let wins = 0, losses = 0;
  for (const r of streak) {
    if (r === 'W') wins++;
    else if (r === 'L') losses++;
  }
  return { wins, losses, net: wins - losses };
}

/**
 * The contributing factors behind a player's mood — pure, derived only from
 * data the player/team already carry. Drives both the popover explainer and
 * (via `playerMood`) the overall tone chip.
 */
export function moodFactors(opts: {
  player: BasketballPlayer;
  team: BasketballTeam;
  /** 0-based OVR rank on the team (0 = best player). */
  talentRank: number;
  isStarter: boolean;
  yearsLeft: number;
}): MoodFactor[] {
  const { player, team, talentRank, isStarter, yearsLeft } = opts;
  const ovr = player.ratings.overall;
  const age = player.age;
  const upside = player.development.potential - ovr;
  const expectsStart = talentRank < 5;
  const form = recentForm(team);
  const factors: MoodFactor[] = [];

  // --- Role vs. talent ---
  if (ovr >= 80 && !isStarter) {
    factors.push({ label: 'star riding the bench', positive: false });
  } else if (expectsStart && !isStarter) {
    factors.push({ label: 'expects a starting role', positive: false });
  } else if (isStarter && !expectsStart) {
    factors.push({ label: 'starting above expectations', positive: true });
  } else if (isStarter) {
    factors.push({ label: 'featured starting role', positive: true });
  }

  // --- Contract ---
  if (yearsLeft <= 1 && yearsLeft > 0) {
    factors.push({ label: 'contract year — wants an extension', positive: false });
  }

  // --- Development trajectory ---
  if (age <= 23 && upside >= 8) {
    factors.push({ label: 'young, ascending talent', positive: true });
  } else if (age <= 23 && upside >= 6) {
    factors.push({ label: 'young and developing', positive: true });
  } else if (age >= 33 && upside <= 0) {
    factors.push({ label: 'aging veteran past his prime', positive: false });
  }

  // --- Team form (recent streak) ---
  if (form.net >= 3) {
    factors.push({ label: `team on a hot streak (${form.wins}-${form.losses})`, positive: true });
  } else if (form.net <= -3) {
    factors.push({ label: `team on a losing streak (${form.wins}-${form.losses})`, positive: false });
  }

  return factors;
}

export function playerMood(opts: {
  player: BasketballPlayer;
  team?: BasketballTeam;
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
