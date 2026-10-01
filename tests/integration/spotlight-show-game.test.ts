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

describe('game flow (key moments)', () => {
  const g2: GameResult = {
    ...game,
    scoringPlays: [
      { quarter: 1, timeLeft: '9:12', teamId: 'buf', points: 7, description: 'S. Lowe 20 yd pass to S. Lowe (XP good)', score: [7, 0] },
      { quarter: 2, timeLeft: '3:05', teamId: 'ne', points: 7, description: 'D. Callahan 34 yd pass to M. Brooks (XP good)', score: [7, 7] },
      { quarter: 3, timeLeft: '8:40', teamId: 'ne', points: 3, description: 'field goal', score: [7, 10] },
      { quarter: 4, timeLeft: '2:00', teamId: 'buf', points: 7, description: '12 yd touchdown (XP good)', score: [14, 10] },
      { quarter: 4, timeLeft: '0:41', teamId: 'ne', points: 7, description: 'D. Callahan 3 yd rush (XP good)', score: [14, 17] },
    ],
  };
  const [t] = buildGameTopics({ team: ne, teams: [ne, buf, kc], players, schedule: [g2], season: 2026, playoffBracket: bracket });
  const f = t.gameFlow!;

  it('puts every score on a timeline from the team\'s side', () => {
    expect(f.plays.map(p => [p.us, p.them])).toEqual([[0, 7], [7, 7], [10, 7], [10, 14], [17, 14]]);
    expect(f.plays.map(p => p.swing)).toEqual(['opens', 'ties', 'go-ahead', 'go-ahead', 'go-ahead']);
    expect(f.plays[1]).toMatchObject({ kind: 'td', title: 'Callahan to Brooks · 34-yd TD pass', playerIds: ['wr', 'qb'] });
    expect(f.plays[4].title).toBe('Callahan · 3-yd TD run');
    expect(f.plays[4].playerIds).toEqual(['qb']);
    expect(f.lowPoint).toBe(1); // first deficit of 7 (ties with the 4th: earliest)
    expect(f.plays.every((p, i) => i === 0 || p.at >= f.plays[i - 1].at)).toBe(true);
    expect(f.plays[4].at).toBeCloseTo(45 + 15 - 41 / 60, 3);
  });

  it('numbers the scores for the writer', () => {
    const notes = t.exchanges.map(e => e.text).join('\n');
    expect(notes).toMatch(/#2 Q2 3:05, NE: Callahan to Brooks · 34-yd TD pass \(NE 7-7\)/);
    expect(notes).toMatch(/#5 Q4 0:41, NE: Callahan · 3-yd TD run \(NE 17-14\)/);
  });

  it('reads the live feed\'s descriptions, and folds a separate extra point into its touchdown', () => {
    const live: GameResult = { ...game, scoringPlays: [
      { quarter: 2, timeLeft: '4:10', teamId: 'ne', points: 6, description: '🏈 TOUCHDOWN! D. Callahan QB hits M. Brooks WR for the 22-yard score!', score: [0, 6] },
      { quarter: 2, timeLeft: '4:10', teamId: 'ne', points: 1, description: 'Extra point is good.', score: [0, 7] },
    ] };
    const [lt] = buildGameTopics({ team: ne, teams: [ne, buf, kc], players, schedule: [live], season: 2026, playoffBracket: bracket });
    expect(lt.gameFlow!.plays).toHaveLength(1);
    expect(lt.gameFlow!.plays[0]).toMatchObject({ us: 7, them: 0, points: 7, kind: 'td', title: 'Callahan to Brooks · 22-yd TD pass', playerIds: ['wr', 'qb'] });
  });
});
