/**
 * Team Spotlight after a playoff win must be told WHO was beaten and the
 * score. Before, the payload only carried playoffStage.roundJustWon ("Wild
 * Card"), so the model invented the opponent (named the Raiders after a win
 * over the Bills).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAiSpotlight } from '@/lib/engine/aiSpotlight';
import type { Player, PlayoffMatchup, Team } from '@/types';

function team(id: string, city: string, name: string): Team {
  return {
    id, city, name, abbreviation: id, conference: 'AC', division: 'South',
    record: { wins: 11, losses: 6, ties: 0, pointsFor: 400, pointsAgainst: 330, streak: 2 },
    depthChart: {}, salaryCap: 255, totalPayroll: 240, roster: [], draftPicks: [], deadCap: [],
  } as unknown as Team;
}
function player(id: string, teamId: string): Player {
  return {
    id, firstName: 'P', lastName: id, position: 'QB', teamId, age: 27, potential: 80, retired: false, injury: null,
    ratings: { overall: 80 }, contract: { salary: 10, yearsLeft: 2 },
    stats: { passYards: 3000, passTDs: 20, rushYards: 0, rushTDs: 0, receivingYards: 0, receivingTDs: 0, tackles: 0, sacks: 0, interceptions: 5 },
  } as unknown as Player;
}

afterEach(() => vi.unstubAllGlobals());

describe('spotlight playoff payload', () => {
  it('includes the opponent and score of the playoff game just won', async () => {
    const ten = team('TEN', 'Tennessee', 'Titans');
    const buf = team('BUF', 'Buffalo', 'Bills');
    const ind = team('IND', 'Indianapolis', 'Colts');
    const bracket: PlayoffMatchup[] = [
      { id: 'wc1', round: 1, conference: 'AC', homeTeamId: 'BUF', awayTeamId: 'TEN', homeSeed: 3, awaySeed: 6, homeScore: 20, awayScore: 27, winnerId: 'TEN' },
      { id: 'div1', round: 2, conference: 'AC', homeTeamId: 'IND', awayTeamId: 'TEN', homeSeed: 1, awaySeed: 6, homeScore: null, awayScore: null, winnerId: null },
    ];
    let body: { teamData?: Record<string, unknown> } = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      throw new Error('stop after capture');
    }));
    const roster = [player('q1', 'TEN')];
    await fetchAiSpotlight({
      team: ten, roster, allTeams: [ten, buf, ind], allPlayers: roster,
      season: 2026, week: 18, phase: 'playoffs', narrative: 'playoffsStart',
      playoffBracket: bracket, nextOpponentId: 'IND',
    }).catch(() => {});
    expect(body.teamData?.lastPlayoffWin).toEqual({
      round: 'Wild Card', opponent: 'Buffalo Bills', score: 'Tennessee 27, Buffalo 20',
    });
    expect((body.teamData?.nextPlayoffOpponent as { name: string }).name).toBe('Indianapolis Colts');
  });
});
