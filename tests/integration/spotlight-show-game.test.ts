import { describe, it, expect } from 'vitest';
import { buildGameTopics } from '@/lib/spotlight/showGame';
import type { GameResult, Player, PlayoffMatchup, Team } from '@/types';

const team = (id: string, abbreviation: string, city: string, name: string) =>
  ({ id, abbreviation, city, name, record: { wins: 12, losses: 5, pointsFor: 400, pointsAgainst: 300 } }) as unknown as Team;
const ne = team('ne', 'NE', 'New England', 'Minutemen');
const buf = team('buf', 'BUF', 'Buffalo', 'Bison');
const kc = team('kc', 'KC', 'Kansas City', 'Monarchs');
const p = (id: string, teamId: string, position: string, firstName: string, lastName: string) => ({ id, teamId, position, firstName, lastName }) as unknown as Player;
const players = [
  p('qb', 'ne', 'QB', 'Drew', 'Callahan'), p('wr', 'ne', 'WR', 'Malik', 'Brooks'), p('de', 'ne', 'DL', 'Ray', 'Okafor'),
  p('bqb', 'buf', 'QB', 'Sam', 'Lowe'),
];
const game: GameResult = {
  id: 'wc-1', week: 99, season: 2026, homeTeamId: 'ne', awayTeamId: 'buf', homeScore: 27, awayScore: 24, played: true,
  playerStats: {
    qb: { passAttempts: 31, passCompletions: 24, passYards: 287, passTDs: 3, interceptions: 0 },
    wr: { receptions: 8, targets: 11, receivingYards: 131, receivingTDs: 2 },
    de: { tackles: 6, sacks: 2, tacklesForLoss: 3 },
    bqb: { passAttempts: 40, passCompletions: 25, passYards: 260, passTDs: 2, interceptions: 2 },
  },
  scoringPlays: [
    { quarter: 1, teamId: 'buf', points: 7, description: 'Lowe 20-yd pass', score: [7, 0] },
    { quarter: 2, teamId: 'buf', points: 7, description: 'Lowe 5-yd pass', score: [14, 0] },
    { quarter: 3, teamId: 'ne', points: 7, description: 'Brooks 40-yd catch', score: [14, 7] },
    { quarter: 4, teamId: 'buf', points: 10, description: 'field goal and TD', score: [24, 14] },
    { quarter: 4, teamId: 'ne', points: 7, description: 'Callahan 3-yd run', score: [24, 21] },
    { quarter: 4, teamId: 'ne', points: 6, timeLeft: '0:41', description: 'Brooks 12-yd TD catch', score: [24, 27] },
  ],
};
const bracket = [
  { id: 'wc-1', round: 1, conference: 'AC', homeTeamId: 'ne', awayTeamId: 'buf', homeSeed: 3, awaySeed: 6, homeScore: 27, awayScore: 24, winnerId: 'ne' },
  { id: 'div-1', round: 2, conference: 'AC', homeTeamId: 'kc', awayTeamId: 'ne', homeSeed: 1, awaySeed: 3, homeScore: null, awayScore: null, winnerId: null },
] as PlayoffMatchup[];

describe('postgame topics', () => {
  const topics = buildGameTopics({ team: ne, teams: [ne, buf, kc], players, schedule: [game], season: 2026, playoffBracket: bracket });

  it('breaks down the last playoff game first: result, flow, comeback, deciding score, box score', () => {
    expect(topics[0].headline).toBe('Wild Card: NE 27, BUF 24');
    expect(topics[0].depth).toBe('deep');
    const notes = topics[0].exchanges.map(e => e.text).join('\n');
    expect(notes).toMatch(/won 27-24 at home against the Buffalo Bison/);
    expect(notes).toMatch(/trailed by as many as 14/);
    expect(notes).toMatch(/deciding score: Brooks 12-yd TD catch/);
    expect(topics[0].gameTeam?.find(t => t.key === 'pts')).toMatchObject({ value: '27', note: 'BUF 24' });
  });

  it('gives the standouts with real stat lines, and that game\'s tiles', () => {
    const notes = topics[1].exchanges.map(e => e.text).join('\n');
    expect(notes).toContain('Drew Callahan (QB): 24 of 31 for 287 yards, 3 TD, 0 INT');
    expect(notes).toContain('Malik Brooks (WR): 8 catches for 131 yards, 2 TD');
    expect(topics[1].gameLines?.qb?.find(t => t.key === 'passYds')).toMatchObject({ value: '287', rank: 0 });
  });

  it('sets up the next round', () => {
    expect(topics[2].headline).toBe('Next: Divisional Round vs KC');
    expect(topics[2].exchanges[0].text).toMatch(/on the road at the Kansas City Monarchs/);
  });

  it('is empty before the first game', () => {
    expect(buildGameTopics({ team: ne, teams: [ne, buf], players, schedule: [], season: 2026 })).toEqual([]);
  });
});
