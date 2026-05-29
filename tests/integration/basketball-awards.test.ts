/**
 * Awards engine tests.
 *
 * Constructs synthetic players with stat lines that should clearly win
 * each award, then verifies the awards engine picks them correctly.
 *
 * The point is to validate the award logic + eligibility rules, not to
 * benchmark stat tuning. Stat distributions are tested separately in
 * basketball-sim.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBasketballAwards,
  generateBasketballPlayer,
  type TeamSeasonRecord,
} from '@bs/sport-basketball';
import type { BasketballPlayer, BasketballStats } from '@bs/sport-basketball/types';
import type { PlayerId, TeamId, CoachId, RosterSlotRef } from '@bs/core/adapter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a player with controlled stat line + roster + bio fields. */
function makeStatPlayer(opts: {
  id: string;
  teamId: string;
  yearsInLeague?: number;
  gamesPlayed?: number;
  gamesStarted?: number;
  pointsPerGame?: number;
  assistsPerGame?: number;
  reboundsPerGame?: number;
  defReboundsPerGame?: number;
  stealsPerGame?: number;
  blocksPerGame?: number;
  plusMinusPerGame?: number;
  fgPct?: number;
  interiorDefense?: number;
  perimeterDefense?: number;
  blockRating?: number;
}): BasketballPlayer {
  const games = opts.gamesPlayed ?? 70;
  const stats: BasketballStats = {
    gamesPlayed: games,
    gamesStarted: opts.gamesStarted ?? games,
    minutes: games * 32,
    points: Math.round((opts.pointsPerGame ?? 15) * games),
    fieldGoalsMade: Math.round((opts.pointsPerGame ?? 15) / 2 * games),
    fieldGoalsAttempted: Math.round((opts.pointsPerGame ?? 15) / 2 / (opts.fgPct ?? 0.47) * games),
    threePointsMade: 0,
    threePointsAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    assists: Math.round((opts.assistsPerGame ?? 3) * games),
    turnovers: 0,
    offensiveRebounds: 0,
    defensiveRebounds: Math.round((opts.defReboundsPerGame ?? opts.reboundsPerGame ?? 4) * games),
    totalRebounds: Math.round((opts.reboundsPerGame ?? 4) * games),
    steals: Math.round((opts.stealsPerGame ?? 1) * games),
    blocks: Math.round((opts.blocksPerGame ?? 0.5) * games),
    personalFouls: 0,
    plusMinus: Math.round((opts.plusMinusPerGame ?? 0) * games),
    trueShootingAttempts: 0,
  };

  // Build a baseline player and then override the bits we care about
  const base = generateBasketballPlayer({
    targetOverall: 75,
    age: 19 + (opts.yearsInLeague ?? 5),
    idOverride: opts.id,
  });

  return {
    ...base,
    seasonStats: stats,
    rosterSlot: {
      teamId: opts.teamId as TeamId,
      bucket: 'active',
    } satisfies RosterSlotRef,
    sportData: {
      ...base.sportData,
      yearsInLeague: opts.yearsInLeague ?? 5,
    },
    ratings: {
      ...base.ratings,
      interiorDefense: opts.interiorDefense ?? base.ratings.interiorDefense,
      perimeterDefense: opts.perimeterDefense ?? base.ratings.perimeterDefense,
      block: opts.blockRating ?? base.ratings.block,
    },
  };
}

function makeTeam(opts: {
  teamId: string;
  wins: number;
  losses?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  headCoachId?: string;
}): TeamSeasonRecord {
  const losses = opts.losses ?? 82 - opts.wins;
  return {
    teamId: opts.teamId as TeamId,
    wins: opts.wins,
    losses,
    pointsFor: opts.pointsFor ?? opts.wins * 115 + losses * 105,
    pointsAgainst: opts.pointsAgainst ?? opts.wins * 100 + losses * 115,
    headCoachId: opts.headCoachId ? (opts.headCoachId as CoachId) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MVP', () => {
  it('picks the high-stats player on the winning team', () => {
    const winningStar = makeStatPlayer({
      id: 'mvp-winner',
      teamId: 'team-a',
      pointsPerGame: 30,
      assistsPerGame: 8,
      reboundsPerGame: 7,
      plusMinusPerGame: 9,
    });
    const losingStar = makeStatPlayer({
      id: 'losing-star',
      teamId: 'team-b',
      pointsPerGame: 28,
      assistsPerGame: 6,
      reboundsPerGame: 6,
      plusMinusPerGame: -3,
    });
    const roleGuy = makeStatPlayer({
      id: 'role-guy',
      teamId: 'team-a',
      pointsPerGame: 10,
    });
    const players = [winningStar, losingStar, roleGuy];
    const teams = [
      makeTeam({ teamId: 'team-a', wins: 60 }),
      makeTeam({ teamId: 'team-b', wins: 25 }),
    ];
    const awards = computeBasketballAwards(players, teams);
    expect(awards.mvp).not.toBeNull();
    expect(awards.mvp!.winnerId).toBe('mvp-winner');
  });

  it('returns null when no eligible players', () => {
    const awards = computeBasketballAwards([], [makeTeam({ teamId: 'a', wins: 50 })]);
    expect(awards.mvp).toBeNull();
  });
});

describe('DPOY', () => {
  it('picks the player with the most blocks + steals + interior defense', () => {
    const defender = makeStatPlayer({
      id: 'dpoy-winner',
      teamId: 'team-d',
      pointsPerGame: 12,
      blocksPerGame: 3.5,
      stealsPerGame: 2,
      defReboundsPerGame: 10,
      interiorDefense: 92,
      blockRating: 90,
    });
    const scorer = makeStatPlayer({
      id: 'pure-scorer',
      teamId: 'team-s',
      pointsPerGame: 30,
      blocksPerGame: 0.5,
      stealsPerGame: 0.8,
      interiorDefense: 55,
    });
    const teams = [
      makeTeam({ teamId: 'team-d', wins: 50, pointsAgainst: 105 * 82 }),
      makeTeam({ teamId: 'team-s', wins: 40, pointsAgainst: 115 * 82 }),
    ];
    const awards = computeBasketballAwards([defender, scorer], teams);
    expect(awards.dpoy).not.toBeNull();
    expect(awards.dpoy!.winnerId).toBe('dpoy-winner');
  });
});

describe('ROY', () => {
  it('only considers rookies (yearsInLeague === 0)', () => {
    const veteranSuperstar = makeStatPlayer({
      id: 'vet',
      teamId: 'team-x',
      pointsPerGame: 32,
      yearsInLeague: 8,
    });
    const goodRookie = makeStatPlayer({
      id: 'rookie-winner',
      teamId: 'team-y',
      pointsPerGame: 22,
      assistsPerGame: 6,
      yearsInLeague: 0,
    });
    const meddiocreRookie = makeStatPlayer({
      id: 'lesser-rookie',
      teamId: 'team-z',
      pointsPerGame: 9,
      yearsInLeague: 0,
    });
    const players = [veteranSuperstar, goodRookie, meddiocreRookie];
    const teams = [
      makeTeam({ teamId: 'team-x', wins: 50 }),
      makeTeam({ teamId: 'team-y', wins: 35 }),
      makeTeam({ teamId: 'team-z', wins: 25 }),
    ];
    const awards = computeBasketballAwards(players, teams);
    expect(awards.roy).not.toBeNull();
    expect(awards.roy!.winnerId).toBe('rookie-winner');
    expect(awards.roy!.winnerId).not.toBe('vet');
  });

  it('returns null when no rookies', () => {
    const vet = makeStatPlayer({ id: 'vet', teamId: 'a', yearsInLeague: 5 });
    const awards = computeBasketballAwards([vet], [makeTeam({ teamId: 'a', wins: 50 })]);
    expect(awards.roy).toBeNull();
  });
});

describe('6MOY', () => {
  it('picks a bench scorer (started <50% of games)', () => {
    const benchScorer = makeStatPlayer({
      id: 'sixthman-winner',
      teamId: 'team-bm',
      gamesPlayed: 80,
      gamesStarted: 5,
      pointsPerGame: 20,
      assistsPerGame: 4,
    });
    const starter = makeStatPlayer({
      id: 'full-starter',
      teamId: 'team-bm',
      gamesPlayed: 80,
      gamesStarted: 80,
      pointsPerGame: 25,
    });
    const teams = [makeTeam({ teamId: 'team-bm', wins: 50 })];
    const awards = computeBasketballAwards([benchScorer, starter], teams);
    expect(awards.sixthMan).not.toBeNull();
    expect(awards.sixthMan!.winnerId).toBe('sixthman-winner');
  });

  it('returns null when everyone is a starter', () => {
    const starter = makeStatPlayer({
      id: 'starter',
      teamId: 'a',
      gamesPlayed: 80,
      gamesStarted: 80,
      pointsPerGame: 20,
    });
    const awards = computeBasketballAwards([starter], [makeTeam({ teamId: 'a', wins: 50 })]);
    expect(awards.sixthMan).toBeNull();
  });
});

describe('MIP', () => {
  it('picks the player who improved the most year-over-year', () => {
    const breakout = makeStatPlayer({
      id: 'mip-winner',
      teamId: 'a',
      pointsPerGame: 22,
      assistsPerGame: 5,
      reboundsPerGame: 6,
      gamesStarted: 70,
    });
    const breakoutPrior = makeStatPlayer({
      id: 'mip-winner',
      teamId: 'a',
      pointsPerGame: 9,
      assistsPerGame: 2,
      reboundsPerGame: 3,
      gamesStarted: 15,
    });
    const flatPlayer = makeStatPlayer({
      id: 'flat-pl',
      teamId: 'b',
      pointsPerGame: 28,
      assistsPerGame: 7,
    });
    const flatPlayerPrior = makeStatPlayer({
      id: 'flat-pl',
      teamId: 'b',
      pointsPerGame: 27,
      assistsPerGame: 7,
    });
    const awards = computeBasketballAwards(
      [breakout, flatPlayer],
      [makeTeam({ teamId: 'a', wins: 45 }), makeTeam({ teamId: 'b', wins: 50 })],
      { priorSeasonPlayers: [breakoutPrior, flatPlayerPrior] },
    );
    expect(awards.mip).not.toBeNull();
    expect(awards.mip!.winnerId).toBe('mip-winner');
  });

  it('returns null when no prior season data provided', () => {
    const p = makeStatPlayer({ id: 'p', teamId: 'a' });
    const awards = computeBasketballAwards([p], [makeTeam({ teamId: 'a', wins: 50 })]);
    expect(awards.mip).toBeNull();
  });
});

describe('COY', () => {
  it('picks the head coach of the team with the most wins', () => {
    const teams = [
      makeTeam({ teamId: 'best', wins: 65, headCoachId: 'coach-1' }),
      makeTeam({ teamId: 'good', wins: 50, headCoachId: 'coach-2' }),
      makeTeam({ teamId: 'mid', wins: 40, headCoachId: 'coach-3' }),
    ];
    const awards = computeBasketballAwards([], teams);
    expect(awards.coy).not.toBeNull();
    expect(awards.coy!.winnerId).toBe('coach-1');
  });

  it('returns null when no team has a head coach assigned', () => {
    const teams = [makeTeam({ teamId: 'a', wins: 50 })];
    const awards = computeBasketballAwards([], teams);
    expect(awards.coy).toBeNull();
  });
});

describe('Finals MVP', () => {
  it('picks the top performer on the championship team in the Finals', () => {
    const finalsStar = makeStatPlayer({
      id: 'fmvp-winner',
      teamId: 'champ',
      pointsPerGame: 28,
    });
    const finalsRunnerUp = makeStatPlayer({
      id: 'second-best',
      teamId: 'champ',
      pointsPerGame: 18,
    });
    const otherTeamPlayer = makeStatPlayer({
      id: 'loser',
      teamId: 'runner-up',
      pointsPerGame: 35,
    });
    const finalsStatsForWinner: BasketballStats = {
      ...finalsStar.seasonStats,
      gamesPlayed: 6,
      points: 168,
      assists: 36,
      totalRebounds: 50,
    };
    const finalsStatsForSecond: BasketballStats = {
      ...finalsRunnerUp.seasonStats,
      gamesPlayed: 6,
      points: 110,
      assists: 24,
      totalRebounds: 30,
    };
    const awards = computeBasketballAwards(
      [finalsStar, finalsRunnerUp, otherTeamPlayer],
      [makeTeam({ teamId: 'champ', wins: 60 }), makeTeam({ teamId: 'runner-up', wins: 55 })],
      {
        championshipTeamId: 'champ' as TeamId,
        finalsStats: {
          [finalsStar.id]: finalsStatsForWinner,
          [finalsRunnerUp.id]: finalsStatsForSecond,
        },
      },
    );
    expect(awards.finalsMvp).not.toBeNull();
    expect(awards.finalsMvp!.winnerId).toBe('fmvp-winner');
  });

  it('returns null when no championship team specified', () => {
    const p = makeStatPlayer({ id: 'p', teamId: 'a' });
    const awards = computeBasketballAwards([p], [makeTeam({ teamId: 'a', wins: 50 })]);
    expect(awards.finalsMvp).toBeNull();
  });
});

describe('eligibility', () => {
  it('honors minGamesPlayed threshold', () => {
    const lowGamesStar = makeStatPlayer({
      id: 'injured',
      teamId: 'a',
      gamesPlayed: 30,
      pointsPerGame: 40,
    });
    const fullSeasonGuy = makeStatPlayer({
      id: 'durable',
      teamId: 'b',
      gamesPlayed: 80,
      pointsPerGame: 20,
    });
    const awards = computeBasketballAwards(
      [lowGamesStar, fullSeasonGuy],
      [makeTeam({ teamId: 'a', wins: 50 }), makeTeam({ teamId: 'b', wins: 50 })],
      { minGamesPlayed: 50 },
    );
    expect(awards.mvp!.winnerId).toBe('durable');
  });
});
