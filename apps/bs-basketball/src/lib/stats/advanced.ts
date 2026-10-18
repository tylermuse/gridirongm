/**
 * Advanced stats — pure formulas over BasketballStats totals.
 *
 * All inputs are season (or career) TOTALS, never per-game lines. Every
 * function returns 0 when its denominator is 0 so callers never see NaN.
 *
 * Formulas
 * --------
 *   TS%   = PTS / (2 · (FGA + 0.44·FTA))
 *   eFG%  = (FGM + 0.5·3PM) / FGA
 *   +/-   = sum of on-court point differential (tracked by the sim in box
 *           scores as `plusMinus`); we expose total and per-game.
 *   Poss  ≈ FGA + 0.44·FTA − ORB + TOV           (basic possession estimate)
 *   USG%  = 100 · (FGA + 0.44·FTA + TOV) · (TmMIN / 5)
 *                 / (MIN · (TmFGA + 0.44·TmFTA + TmTOV))
 *           (Basketball-Reference's usage formula; the team totals are the
 *           player's current team's season totals.)
 *   Game Score (Hollinger)
 *         = PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA − FTM) + 0.7·ORB + 0.3·DRB
 *           + STL + 0.7·AST + 0.7·BLK − 0.4·PF − TOV
 *   PER (Hollinger-lite)
 *         = 15 · (GmSc per minute) / (league GmSc per minute)
 *     i.e. Game Score per minute, normalized so the league-average player is
 *     exactly 15 — the same anchor real PER uses. It skips real PER's team
 *     pace / assist-rate adjustments; good enough to rank players in-sim.
 *
 * Team ratings (per 100 possessions):
 *   Team Poss = ½ · (Poss_off + Poss_def)   (averaging both sides' estimates
 *               smooths out rebounding noise)
 *   ORtg = 100 · PTS / Poss,  DRtg = 100 · OppPTS / Poss,  Net = ORtg − DRtg
 *   Pace = 48 · Poss / (TmMIN / 5)   (possessions per 48 minutes; falls back
 *          to Poss / GP when minutes aren't tracked)
 */

import type { BasketballStats } from '@bs/sport-basketball';

type S = Pick<BasketballStats,
  'points' | 'fieldGoalsMade' | 'fieldGoalsAttempted' | 'threePointsMade' |
  'freeThrowsMade' | 'freeThrowsAttempted' | 'offensiveRebounds' |
  'defensiveRebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' |
  'personalFouls' | 'minutes' | 'gamesPlayed' | 'plusMinus'>;

const safe = (n: number, d: number) => (d > 0 ? n / d : 0);

export function tsPct(s: S): number {
  return safe(s.points, 2 * (s.fieldGoalsAttempted + 0.44 * s.freeThrowsAttempted));
}

export function efgPct(s: S): number {
  return safe(s.fieldGoalsMade + 0.5 * s.threePointsMade, s.fieldGoalsAttempted);
}

export function plusMinusPerGame(s: S): number {
  return safe(s.plusMinus, s.gamesPlayed);
}

/** Basic possession estimate used for both player-usage and team ratings. */
export function possessions(s: S): number {
  return s.fieldGoalsAttempted + 0.44 * s.freeThrowsAttempted - s.offensiveRebounds + s.turnovers;
}

/** Usage rate (0-100). `team` = the player's team season totals. */
export function usgPct(s: S, team: S): number {
  const playerUse = s.fieldGoalsAttempted + 0.44 * s.freeThrowsAttempted + s.turnovers;
  const teamUse = team.fieldGoalsAttempted + 0.44 * team.freeThrowsAttempted + team.turnovers;
  return 100 * safe(playerUse * (team.minutes / 5), s.minutes * teamUse);
}

/** Hollinger Game Score over a stat total (sum of per-game Game Scores). */
export function gameScore(s: S): number {
  return s.points
    + 0.4 * s.fieldGoalsMade
    - 0.7 * s.fieldGoalsAttempted
    - 0.4 * (s.freeThrowsAttempted - s.freeThrowsMade)
    + 0.7 * s.offensiveRebounds
    + 0.3 * s.defensiveRebounds
    + s.steals
    + 0.7 * s.assists
    + 0.7 * s.blocks
    - 0.4 * s.personalFouls
    - s.turnovers;
}

/** League Game-Score-per-minute baseline from all players' totals. */
export function leagueGameScorePerMinute(all: Iterable<S>): number {
  let gs = 0, min = 0;
  for (const s of all) { gs += gameScore(s); min += s.minutes; }
  return safe(gs, min);
}

/** Hollinger-lite PER: league average = 15. */
export function perLite(s: S, leagueGsPerMin: number): number {
  if (s.minutes <= 0 || leagueGsPerMin <= 0) return 0;
  return 15 * (gameScore(s) / s.minutes) / leagueGsPerMin;
}

export interface TeamRatings {
  possessions: number;
  ortg: number;
  drtg: number;
  net: number;
  pace: number;
}

/** Team ORtg / DRtg / Net / Pace from offense + defense totals. */
export function teamRatings(off: S, def: S, gp: number): TeamRatings {
  const poss = 0.5 * (possessions(off) + possessions(def));
  const ortg = 100 * safe(off.points, poss);
  const drtg = 100 * safe(def.points, poss);
  const gameMinutes = off.minutes / 5;
  const pace = gameMinutes > 0 ? 48 * poss / gameMinutes : safe(poss, gp);
  return { possessions: poss, ortg, drtg, net: ortg - drtg, pace };
}
