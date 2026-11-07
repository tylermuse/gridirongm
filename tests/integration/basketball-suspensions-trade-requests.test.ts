/**
 * Regressions from a player report: two starters "suspended 56 games", backups
 * playing starter minutes while Angry about riding the bench, and a Thrilled
 * player with an open trade request.
 */
import { describe, it, expect } from 'vitest';
import {
  activeSuspension, applyDisciplineRolls, dropStaleDiscipline, getDiscipline, isSuspendedOn,
  type DisciplineRecord,
} from '@/../apps/bs-basketball/src/lib/discipline';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { migrateSave } from '@/../apps/bs-basketball/src/lib/persistence/migrations';
import { resolveLineup, setTeamLineup, buildDefaultBasketballLineup } from '@/../apps/bs-basketball/src/lib/lineup';
import { playerMood } from '@/../apps/bs-basketball/src/lib/roster/mood';
import { refreshTradeRequests, tradeRequestBadge } from '@/../apps/bs-basketball/src/lib/roster/tradeRequests';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type League = ReturnType<typeof createNewBasketballLeague>;
type GameResult = BaseGameResult<BasketballStats>;

const dayOf = (g: { sportData?: unknown }) => (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;

function suspension(playerId: string, occurredDay: number, returnDay: number): DisciplineRecord {
  return {
    playerId: playerId as never, kind: 'suspension', reason: 'test', games: 2, fine: 0, occurredDay, returnDay,
  };
}

const withDiscipline = (league: League, discipline: Record<string, DisciplineRecord>): League =>
  ({ ...league, sportData: { ...(league.sportData as object), discipline } }) as League;

const firstTeam = (league: League) => league.teams[0] as BasketballTeam;

function rosterOf(league: League, team: BasketballTeam): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  return team.playerIds.map(id => players[id]);
}

/** Roll foul-outs for a whole roster, varying the game, until someone is suspended. */
function suspendSomeone(league: League, team: BasketballTeam, day: number): { league: League; record: DisciplineRecord } {
  const boxScores = Object.fromEntries(team.playerIds.map(id => [id, { minutes: 30, personalFouls: 6 }]));
  for (let i = 0; i < 500; i++) {
    const game = { id: `foul-out-${i}`, boxScores } as unknown as GameResult;
    const next = applyDisciplineRolls(league, [game], day, league.currentSeason) as League;
    const record = Object.values(getDiscipline(next)).find(d => d.kind === 'suspension');
    if (record) return { league: next, record };
  }
  throw new Error('no suspension rolled');
}

describe('leftover suspensions', () => {
  it('frees a player stuck on a suspension from an earlier season', () => {
    const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'stale-susp' }), 30).league as League;
    const id = firstTeam(league).playerIds[0];
    const stuck = withDiscipline(league, { [id]: suspension(id, 170, 172) });
    expect(isSuspendedOn(getDiscipline(stuck), id, league.currentTick)).toBe(true);

    const { state, migrated } = migrateSave(stuck);
    expect(migrated).toBe(true);
    expect(getDiscipline(state)[id]).toBeUndefined();
  });

  it('keeps a suspension handed out this season, even if the calendar has not caught up', () => {
    const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'live-susp' }), 30).league as League;
    const id = firstTeam(league).playerIds[0];
    const playedDay = Math.max(...league.games.filter(g => g.status === 'played').map(dayOf));
    // "Next game" plays one game without advancing currentTick, so a genuine
    // record can sit ahead of the tick.
    const live = withDiscipline({ ...league, currentTick: playedDay - 3 } as League, {
      [id]: suspension(id, playedDay, playedDay + 2),
    });
    expect(dropStaleDiscipline(live)).toBe(live);
  });
});

describe('suspension length', () => {
  it('runs for real team games, not calendar days', () => {
    const league = createNewBasketballLeague({ rngSeed: 'susp-games' });
    const team = firstTeam(league);
    const { league: next, record } = suspendSomeone(league, team, 0);

    const teamDays = league.games
      .filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id)
      .map(dayOf)
      .sort((a, b) => a - b);
    expect(record.returnDay).toBe(teamDays[record.games - 1] + 1);

    // Out for each of those games, back for the one after.
    for (const d of teamDays.slice(0, record.games)) {
      expect(isSuspendedOn(getDiscipline(next), record.playerId, d)).toBe(true);
    }
    expect(isSuspendedOn(getDiscipline(next), record.playerId, teamDays[record.games])).toBe(false);
    expect(activeSuspension(next, record.playerId)?.gamesLeft).toBe(record.games);
  });

  it('counts down as games are played and has nothing to serve after the last one', () => {
    const league = createNewBasketballLeague({ rngSeed: 'susp-countdown' });
    const team = firstTeam(league);
    const { league: next, record } = suspendSomeone(league, team, 0);

    const games = next.games.map(g => ({ ...g, status: 'played' as const }));
    expect(activeSuspension({ ...next, games } as League, record.playerId)).toBeNull();

    const lastDay = Math.max(...next.games.map(dayOf));
    const end = suspendSomeone({ ...league, games } as League, team, lastDay);
    expect(end.record.returnDay).toBe(lastDay + 1);
  });
});

describe('fill-ins and trade requests', () => {
  /** A team with a saved lineup, one starter out, and the fill-in made an 85 on a long deal. */
  function setup(seed: string) {
    const base = createNewBasketballLeague({ rngSeed: seed });
    const baseTeam = firstTeam(base);
    const roster = rosterOf(base, baseTeam);
    const lineup = buildDefaultBasketballLineup(roster);
    const saved = setTeamLineup(base, baseTeam.id, lineup) as League;
    const team = firstTeam(saved);

    const starterId = lineup.starters[0] as string;
    const available = roster.filter(p => p.id !== starterId);
    const fillInId = resolveLineup(team, available).starters.find(id => id && !lineup.starters.includes(id)) as string;

    const season = saved.currentSeason;
    const players = saved.players as Record<string, BasketballPlayer>;
    const fillIn = players[fillInId];
    const year = { season, baseSalary: 5_000_000, proratedBonus: 0 };
    const star: BasketballPlayer = {
      ...fillIn,
      age: 30,
      ratings: { ...fillIn.ratings, overall: 85 },
      development: { ...fillIn.development, potential: 85 },
      contract: { ...fillIn.contract, years: [0, 1, 2].map(i => ({ ...year, season: season + i })) } as BasketballPlayer['contract'],
    };
    const league = { ...saved, players: { ...players, [fillInId]: star } } as League;
    return { league, starterId, fillInId };
  }

  it('does not count a fill-in for a suspended starter as benched', () => {
    const { league, starterId, fillInId } = setup('fill-in-susp');
    const day = league.currentTick;
    const out = withDiscipline(league, { [starterId]: suspension(starterId, day, day + 5) });
    const next = refreshTradeRequests(out).players as Record<string, BasketballPlayer>;
    expect(next[fillInId].sportData.tradeRequest).toBeUndefined();
  });

  it('still starts the clock on a star who really is benched', () => {
    const { league, fillInId } = setup('fill-in-control');
    const next = refreshTradeRequests(league).players as Record<string, BasketballPlayer>;
    expect(next[fillInId].sportData.tradeRequest?.stage).toBe('unhappy');
  });

  it('does not treat the suspended starter himself as benched', () => {
    const { league, starterId } = setup('suspended-starter');
    const day = league.currentTick;
    const players = league.players as Record<string, BasketballPlayer>;
    const starter = players[starterId];
    const season = league.currentSeason;
    const year = { season, baseSalary: 5_000_000, proratedBonus: 0 };
    const star: BasketballPlayer = {
      ...starter,
      age: 30,
      ratings: { ...starter.ratings, overall: 85 },
      contract: { ...starter.contract, years: [0, 1, 2].map(i => ({ ...year, season: season + i })) } as BasketballPlayer['contract'],
    };
    const out = withDiscipline(
      { ...league, players: { ...players, [starterId]: star } } as League,
      { [starterId]: suspension(starterId, day, day + 5) },
    );
    const next = refreshTradeRequests(out).players as Record<string, BasketballPlayer>;
    expect(next[starterId].sportData.tradeRequest).toBeUndefined();
  });
});

describe('trade-request badge', () => {
  it('hides once he is no longer discontent, without touching the stored request', () => {
    const league = createNewBasketballLeague({ rngSeed: 'badge' });
    const team = firstTeam(league);
    const season = league.currentSeason;
    const base = rosterOf(league, team)[0];
    const year = { season, baseSalary: 5_000_000, proratedBonus: 0 };
    const player: BasketballPlayer = {
      ...base,
      age: 22,
      ratings: { ...base.ratings, overall: 84 },
      development: { ...base.development, potential: 92 },
      contract: { ...base.contract, years: [0, 1, 2].map(i => ({ ...year, season: season + i })) } as BasketballPlayer['contract'],
      sportData: { ...base.sportData, tradeRequest: { stage: 'requested', since: 1, reason: 'x', season, requestedOn: 8 } },
    };
    const moodAs = (isStarter: boolean) => playerMood({ player, team, talentRank: 5, isStarter, yearsLeft: 3 });

    expect(moodAs(false).label).toBe('Angry');
    expect(tradeRequestBadge(player, season, moodAs(false))?.label).toBe('Trade request');

    expect(moodAs(true).label).toBe('Thrilled');
    expect(tradeRequestBadge(player, season, moodAs(true))).toBeNull();
    expect(player.sportData.tradeRequest?.stage).toBe('requested');
  });
});
