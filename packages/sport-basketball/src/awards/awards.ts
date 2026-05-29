/**
 * NBA awards engine.
 *
 * Computes individual season-end awards from final season stats. v1 covers
 * the seven core individual awards:
 *   - MVP (Most Valuable Player)
 *   - DPOY (Defensive Player of the Year)
 *   - ROY (Rookie of the Year)
 *   - 6MOY (Sixth Man of the Year)
 *   - MIP (Most Improved Player) — requires prior-season stats
 *   - COY (Coach of the Year) — winner is the top-coach-of-the-best-team
 *   - Finals MVP — requires championship + Finals stats context
 *
 * v2 enhancements not in v1:
 *   - All-NBA teams (1st, 2nd, 3rd)
 *   - All-Defensive teams
 *   - All-Rookie teams
 *   - Vote shares simulated (top 5-10 finalists with realistic vote splits)
 *   - Eligibility rules: minimum games (65 in real NBA), minimum minutes
 */

import type { PlayerId, TeamId, CoachId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats } from '../types';
import { perGame } from '../types';

// ===========================================================================
// Public types
// ===========================================================================

export interface AwardResult {
  /** Winner ID. PlayerId for player awards, CoachId for COY. */
  winnerId: PlayerId | CoachId;
  /** Their team ID at the time of winning. */
  teamId?: TeamId;
  /** Top 3-5 runners-up (PlayerId for player awards). */
  finalists: (PlayerId | CoachId)[];
  /** Human-readable explanation of why they won. Used by the recap engine
   *  and the news feed. */
  reasoning: string;
  /** Score used in the calculation. Useful for ties + tests. */
  score: number;
}

export interface BasketballAwardWinners {
  mvp: AwardResult | null;
  dpoy: AwardResult | null;
  roy: AwardResult | null;
  sixthMan: AwardResult | null;
  mip: AwardResult | null;
  coy: AwardResult | null;
  finalsMvp: AwardResult | null;
}

export interface TeamSeasonRecord {
  teamId: TeamId;
  wins: number;
  losses: number;
  /** Points scored by the team across the season. */
  pointsFor: number;
  /** Points allowed by the team. */
  pointsAgainst: number;
  /** Head coach ID, used for COY. */
  headCoachId?: CoachId;
}

export interface ComputeAwardsOptions {
  /** Prior-season player stats (keyed by playerId). Needed to compute MIP. */
  priorSeasonPlayers?: BasketballPlayer[];
  /** ID of the team that won the championship. Used for Finals MVP. */
  championshipTeamId?: TeamId;
  /** Per-player Finals stats (for Finals MVP scoring). Keyed by playerId. */
  finalsStats?: Record<PlayerId, BasketballStats>;
  /** Minimum games played to be MVP/DPOY/etc. eligible. Default 50 (a bit
   *  looser than real NBA's 65 to accommodate shorter test scenarios). */
  minGamesPlayed?: number;
}

// ===========================================================================
// Main entry
// ===========================================================================

export function computeBasketballAwards(
  players: BasketballPlayer[],
  teams: TeamSeasonRecord[],
  opts: ComputeAwardsOptions = {},
): BasketballAwardWinners {
  const minGames = opts.minGamesPlayed ?? 50;
  const eligible = players.filter(
    p => (p.seasonStats.gamesPlayed ?? 0) >= minGames,
  );

  // Quick lookup: which team is each player on (use team season records)
  const teamByTeamId = new Map(teams.map(t => [t.teamId, t]));
  const teamForPlayer = (p: BasketballPlayer): TeamSeasonRecord | undefined => {
    if (!p.rosterSlot) return undefined;
    return teamByTeamId.get(p.rosterSlot.teamId);
  };

  return {
    mvp: pickMvp(eligible, teamForPlayer),
    dpoy: pickDpoy(eligible, teamForPlayer),
    roy: pickRoy(eligible, teamForPlayer),
    sixthMan: pickSixthMan(eligible, teamForPlayer),
    mip: pickMip(eligible, opts.priorSeasonPlayers ?? [], teamForPlayer),
    coy: pickCoy(teams),
    finalsMvp: pickFinalsMvp(players, opts),
  };
}

// ===========================================================================
// MVP — high stats on a winning team
// ===========================================================================

function pickMvp(
  eligible: BasketballPlayer[],
  teamFor: (p: BasketballPlayer) => TeamSeasonRecord | undefined,
): AwardResult | null {
  if (eligible.length === 0) return null;

  const scored = eligible.map(p => {
    const pg = perGame(p.seasonStats);
    const team = teamFor(p);
    const teamWins = team?.wins ?? 0;

    // Voters weight scoring + team success heavily
    const ppg = pg.points ?? 0;
    const apg = pg.assists ?? 0;
    const rpg = pg.totalRebounds ?? 0;
    const plusMinusPerGame = (p.seasonStats.plusMinus ?? 0) / Math.max(1, p.seasonStats.gamesPlayed);

    const score =
      ppg * 1.0 +
      apg * 0.8 +
      rpg * 0.6 +
      teamWins * 0.4 +
      plusMinusPerGame * 5 +
      // Small bonus for shooting efficiency
      ((p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted)) - 0.45) * 20;

    return { player: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  const reasoning = formatMvpReasoning(winner.player);
  return {
    winnerId: winner.player.id,
    teamId: winner.player.rosterSlot?.teamId,
    finalists: scored.slice(1, 5).map(s => s.player.id),
    reasoning,
    score: Math.round(winner.score * 10) / 10,
  };
}

function formatMvpReasoning(p: BasketballPlayer): string {
  const pg = perGame(p.seasonStats);
  return `${p.firstName} ${p.lastName} averaged ${(pg.points ?? 0).toFixed(1)} PPG, ${(pg.assists ?? 0).toFixed(1)} APG, and ${(pg.totalRebounds ?? 0).toFixed(1)} RPG`;
}

// ===========================================================================
// DPOY — high steals/blocks + interior presence + team defense
// ===========================================================================

function pickDpoy(
  eligible: BasketballPlayer[],
  teamFor: (p: BasketballPlayer) => TeamSeasonRecord | undefined,
): AwardResult | null {
  if (eligible.length === 0) return null;

  const scored = eligible.map(p => {
    const pg = perGame(p.seasonStats);
    const team = teamFor(p);
    const teamDefenseRating = team
      ? Math.max(0, 120 - (team.pointsAgainst / Math.max(1, team.wins + team.losses)))
      : 0;

    // Defensive contribution weighted by rating talent + actual stat output
    const stocksPerGame = (pg.steals ?? 0) + (pg.blocks ?? 0);
    const defRebPerGame = pg.defensiveRebounds ?? 0;
    const interior = (p.ratings.interiorDefense + p.ratings.block) / 2;
    const perimeter = p.ratings.perimeterDefense;

    const score =
      stocksPerGame * 8 +
      defRebPerGame * 2 +
      interior * 0.15 +
      perimeter * 0.1 +
      teamDefenseRating * 0.3;

    return { player: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  return {
    winnerId: winner.player.id,
    teamId: winner.player.rosterSlot?.teamId,
    finalists: scored.slice(1, 5).map(s => s.player.id),
    reasoning: formatDpoyReasoning(winner.player),
    score: Math.round(winner.score * 10) / 10,
  };
}

function formatDpoyReasoning(p: BasketballPlayer): string {
  const pg = perGame(p.seasonStats);
  return `${p.firstName} ${p.lastName} averaged ${(pg.blocks ?? 0).toFixed(1)} BPG and ${(pg.steals ?? 0).toFixed(1)} SPG as the league's premier defender`;
}

// ===========================================================================
// ROY — rookie only (yearsInLeague === 0)
// ===========================================================================

function pickRoy(
  eligible: BasketballPlayer[],
  teamFor: (p: BasketballPlayer) => TeamSeasonRecord | undefined,
): AwardResult | null {
  const rookies = eligible.filter(
    p => (p.sportData as { yearsInLeague?: number }).yearsInLeague === 0,
  );
  if (rookies.length === 0) return null;

  // Same scoring as MVP but applied to rookies only, team success weighted less
  const scored = rookies.map(p => {
    const pg = perGame(p.seasonStats);
    const team = teamFor(p);
    const teamWins = team?.wins ?? 0;
    const score =
      (pg.points ?? 0) * 1.2 +
      (pg.assists ?? 0) * 0.8 +
      (pg.totalRebounds ?? 0) * 0.6 +
      teamWins * 0.15 +
      ((p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted)) - 0.45) * 15;
    return { player: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  return {
    winnerId: winner.player.id,
    teamId: winner.player.rosterSlot?.teamId,
    finalists: scored.slice(1, 5).map(s => s.player.id),
    reasoning: `${winner.player.firstName} ${winner.player.lastName} is the top rookie of the season`,
    score: Math.round(winner.score * 10) / 10,
  };
}

// ===========================================================================
// 6MOY — bench role only
// ===========================================================================

function pickSixthMan(
  eligible: BasketballPlayer[],
  _teamFor: (p: BasketballPlayer) => TeamSeasonRecord | undefined,
): AwardResult | null {
  const bench = eligible.filter(p => {
    const gp = p.seasonStats.gamesPlayed ?? 0;
    const gs = p.seasonStats.gamesStarted ?? 0;
    // Real-NBA rule: more bench appearances than starts
    return gp > 0 && gs / gp < 0.5;
  });
  if (bench.length === 0) return null;

  const scored = bench.map(p => {
    const pg = perGame(p.seasonStats);
    const score =
      (pg.points ?? 0) * 1.0 +
      (pg.assists ?? 0) * 0.7 +
      (pg.totalRebounds ?? 0) * 0.4 +
      ((p.seasonStats.fieldGoalsMade / Math.max(1, p.seasonStats.fieldGoalsAttempted)) - 0.45) * 12;
    return { player: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  return {
    winnerId: winner.player.id,
    teamId: winner.player.rosterSlot?.teamId,
    finalists: scored.slice(1, 5).map(s => s.player.id),
    reasoning: `${winner.player.firstName} ${winner.player.lastName} was the league's premier bench contributor`,
    score: Math.round(winner.score * 10) / 10,
  };
}

// ===========================================================================
// MIP — most improved year over year (requires prior-season player data)
// ===========================================================================

function pickMip(
  eligible: BasketballPlayer[],
  priorSeasonPlayers: BasketballPlayer[],
  teamFor: (p: BasketballPlayer) => TeamSeasonRecord | undefined,
): AwardResult | null {
  if (priorSeasonPlayers.length === 0) return null;
  const priorById = new Map(priorSeasonPlayers.map(p => [p.id, p]));

  const candidates = eligible
    .map(p => {
      const prior = priorById.get(p.id);
      if (!prior || (prior.seasonStats.gamesPlayed ?? 0) < 20) return null;
      const thisPg = perGame(p.seasonStats);
      const priorPg = perGame(prior.seasonStats);
      const improvementPpg = (thisPg.points ?? 0) - (priorPg.points ?? 0);
      const improvementApg = (thisPg.assists ?? 0) - (priorPg.assists ?? 0);
      const improvementRpg = (thisPg.totalRebounds ?? 0) - (priorPg.totalRebounds ?? 0);
      // Bonus for moving from bench to starter
      const priorStartRate = (prior.seasonStats.gamesStarted ?? 0) / Math.max(1, prior.seasonStats.gamesPlayed);
      const thisStartRate = (p.seasonStats.gamesStarted ?? 0) / Math.max(1, p.seasonStats.gamesPlayed);
      const promotionBonus = (thisStartRate - priorStartRate) * 5;
      const score = improvementPpg * 1.5 + improvementApg * 1.0 + improvementRpg * 0.8 + promotionBonus;
      return { player: p, score };
    })
    .filter((x): x is { player: BasketballPlayer; score: number } => x !== null);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  if (winner.score <= 0) return null;
  return {
    winnerId: winner.player.id,
    teamId: winner.player.rosterSlot?.teamId,
    finalists: candidates.slice(1, 5).map(c => c.player.id),
    reasoning: `${winner.player.firstName} ${winner.player.lastName} made the biggest year-over-year leap in the league`,
    score: Math.round(winner.score * 10) / 10,
  };
}

// ===========================================================================
// COY — team-based
// ===========================================================================

function pickCoy(teams: TeamSeasonRecord[]): AwardResult | null {
  if (teams.length === 0) return null;
  // v1: simply pick the head coach of the team with the most wins.
  // v2 should compare to preseason expectations (Vegas O/U or similar).
  const sorted = teams.slice().sort((a, b) => b.wins - a.wins);
  const top = sorted[0];
  if (!top.headCoachId) return null;
  return {
    winnerId: top.headCoachId,
    teamId: top.teamId,
    finalists: sorted.slice(1, 5).map(t => t.headCoachId).filter((id): id is CoachId => !!id),
    reasoning: `Head coach of the ${top.wins}-${top.losses} top team`,
    score: top.wins,
  };
}

// ===========================================================================
// Finals MVP — best player on the championship team using Finals-only stats
// ===========================================================================

function pickFinalsMvp(
  players: BasketballPlayer[],
  opts: ComputeAwardsOptions,
): AwardResult | null {
  if (!opts.championshipTeamId || !opts.finalsStats) return null;

  const champPlayers = players.filter(
    p => p.rosterSlot?.teamId === opts.championshipTeamId,
  );
  if (champPlayers.length === 0) return null;

  const scored = champPlayers.map(p => {
    const stats = opts.finalsStats![p.id];
    if (!stats) return { player: p, score: 0 };
    const pg = perGame(stats);
    const score =
      (pg.points ?? 0) * 1.2 +
      (pg.assists ?? 0) * 0.7 +
      (pg.totalRebounds ?? 0) * 0.6 +
      (pg.steals ?? 0) * 1.5 +
      (pg.blocks ?? 0) * 1.5;
    return { player: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0];
  if (winner.score === 0) return null;
  return {
    winnerId: winner.player.id,
    teamId: opts.championshipTeamId,
    finalists: scored.slice(1, 5).map(s => s.player.id),
    reasoning: `${winner.player.firstName} ${winner.player.lastName} led the championship team in the Finals`,
    score: Math.round(winner.score * 10) / 10,
  };
}
