/**
 * Preseason Spotlight payload — the offseason's moves must survive the season
 * rollover. startNewSeason() clears draftResults and replaces newsItems, and
 * FA/trade pickups are stamped with the season that just ended, so the old
 * payload told a GM who made a dozen moves he'd made none (Tyler 10/29).
 */
import { describe, it, expect } from 'vitest';
import { buildSpotlightTeamData } from '@/lib/engine/aiSpotlight';
import type { Player, Team } from '@/types';

function team(id: string): Team {
  return {
    id, city: id, name: id, abbreviation: id, conference: 'NC', division: 'North',
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streak: 0 },
    depthChart: {}, salaryCap: 255, totalPayroll: 240, roster: [], draftPicks: [], deadCap: [],
  } as unknown as Team;
}
function player(id: string, teamId: string, extra: Partial<Player> = {}): Player {
  return {
    id, firstName: 'P', lastName: id, position: 'WR', teamId, age: 25, potential: 80, retired: false, injury: null,
    ratings: { overall: 75 }, contract: { salary: 5, yearsLeft: 3 },
    stats: { passYards: 0, passTDs: 0, rushYards: 0, rushTDs: 0, receivingYards: 0, receivingTDs: 0, tackles: 0, sacks: 0, interceptions: 0 },
    ...extra,
  } as unknown as Player;
}

describe('preseason spotlight payload: offseason moves', () => {
  it('finds signings, trades and the draft class on the roster after the rollover cleared draftResults/news', () => {
    const min = team('MIN');
    const teams = Array.from({ length: 32 }, (_, i) => (i === 0 ? min : team(`T${i}`)));
    const roster = [
      // signed in free agency during the 2026 offseason → stamped 2026, season is now 2027
      player('fa1', 'MIN', { acquiredVia: 'free-agency', acquiredSeason: 2026 } as Partial<Player>),
      player('fa2', 'MIN', { acquiredVia: 'free-agency', acquiredSeason: 2026 } as Partial<Player>),
      player('tr1', 'MIN', { acquiredVia: 'trade', acquiredSeason: 2026 } as Partial<Player>),
      // 2027 draft class — the draft stamps draftYear/draftPick/acquiredVia only
      player('r1', 'MIN', { acquiredVia: 'draft', acquiredSeason: 2027, draftYear: 2027, draftPick: 12, age: 22 } as Partial<Player>),
      player('r2', 'MIN', { acquiredVia: 'draft', acquiredSeason: 2027, draftYear: 2027, draftPick: 44, age: 22 } as Partial<Player>),
      // an old pick and an original-roster vet must NOT count as offseason moves
      player('vet', 'MIN', { acquiredVia: 'draft', acquiredSeason: 2023, draftYear: 2023, draftPick: 5, age: 29 } as Partial<Player>),
      player('fa-old', 'MIN', { acquiredVia: 'free-agency', acquiredSeason: 2024 } as Partial<Player>),
    ];
    const data = buildSpotlightTeamData({
      team: min, roster, allTeams: teams, allPlayers: roster,
      season: 2027, week: 1, phase: 'regular', narrative: 'preseason',
      draftResults: [], newsItems: [],
    });
    expect((data.freeAgencySignings as unknown[]).map((p: any) => p.name)).toEqual(['P fa1', 'P fa2']);
    expect((data.tradeAcquisitions as unknown[]).map((p: any) => p.name)).toEqual(['P tr1']);
    expect(data.draftPicks).toEqual([
      { name: 'P r1', pos: 'WR', ovr: 75, potential: 80, round: 1, pick: 12 },
      { name: 'P r2', pos: 'WR', ovr: 75, potential: 80, round: 2, pick: 44 },
    ]);
    expect(data.offseasonMoveCount).toEqual({ signings: 2, trades: 1, draftPicks: 2 });
    expect((data.offseasonMoves as unknown[]).length).toBe(5);
  });

  it('prefers draftResults and transaction news when they are still present', () => {
    const min = team('MIN');
    const roster = [player('r1', 'MIN', { acquiredVia: 'draft', acquiredSeason: 2027, draftYear: 2027, draftPick: 12 } as Partial<Player>)];
    const data = buildSpotlightTeamData({
      team: min, roster, allTeams: [min], allPlayers: roster,
      season: 2027, week: 1, phase: 'regular', narrative: 'preseason',
      draftResults: [{ teamId: 'MIN', playerId: 'r1', round: 1, overallPick: 12 }] as any,
      newsItems: [{ isUserTeam: true, type: 'signing', headline: 'MIN signs X', week: 0 }] as any,
    });
    expect((data.draftPicks as any[])[0]).toMatchObject({ name: 'P r1', round: 1, pick: 12 });
    expect(data.offseasonMoves).toEqual([{ type: 'signing', headline: 'MIN signs X', week: 0 }]);
  });
});
