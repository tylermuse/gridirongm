/**
 * Pre-matchup team-rank card (yo46363 #3 board vote, 2026-09-25 ship).
 *
 * The Game Preview card was refined from a single combined "Yds/G" + point
 * differential into the four categories yo46363 asked for: PPG, passing yards
 * per game, rushing yards per game, and points allowed per game — each ranked
 * league-wide. These guard that:
 *  - passing and rushing are aggregated and ranked SEPARATELY (the point of the
 *    change: a great passing offense that can't run should rank high in Pass Y/G
 *    but not Rush Y/G),
 *  - Pts Allowed ranks a stingier defense higher (lowerIsBetter),
 *  - ranks divide per-team yards by that team's games played.
 */
import { describe, it, expect } from 'vitest';
import { buildMatchupMetrics, rankForMetric } from '@/lib/engine/matchupRanks';
import type { Player, Position, Team } from '@/types';

function makeTeam(id: string, wins: number, losses: number, pf: number, pa: number): Team {
  return { id, record: { wins, losses, ties: 0, pointsFor: pf, pointsAgainst: pa, streak: 0 } } as unknown as Team;
}

function makePlayer(id: string, teamId: string, position: Position, passYards: number, rushYards: number): Player {
  return {
    id, firstName: 'T', lastName: id, position, teamId,
    stats: { passYards, rushYards, passTDs: 0, rushTDs: 0, receivingYards: 0 },
  } as unknown as Player;
}

// 3-team league, everyone has played 2 games.
// A: pass-heavy (1000 pass, 100 rush), scores a lot, leaky D.
// B: run-heavy (200 pass, 900 rush), average scoring, best D.
// C: balanced-low (300 pass, 300 rush), fewest points, worst D.
const teams: Team[] = [
  makeTeam('A', 2, 0, 60, 40),
  makeTeam('B', 1, 1, 40, 20),
  makeTeam('C', 0, 2, 20, 70),
];
const players: Player[] = [
  makePlayer('a-qb', 'A', 'QB', 1000, 0), makePlayer('a-rb', 'A', 'RB', 0, 100),
  makePlayer('b-qb', 'B', 'QB', 200, 0),  makePlayer('b-rb', 'B', 'RB', 0, 900),
  makePlayer('c-qb', 'C', 'QB', 300, 0),  makePlayer('c-rb', 'C', 'RB', 0, 300),
];

const metrics = buildMatchupMetrics(players);
const m = (key: string) => metrics.find(x => x.key === key)!;

describe('buildMatchupMetrics', () => {
  it('produces exactly the four requested ranked categories in order', () => {
    expect(metrics.map(x => x.key)).toEqual(['ppg', 'passypg', 'rushypg', 'pa']);
    expect(metrics.map(x => x.label)).toEqual(['PPG', 'Pass Y/G', 'Rush Y/G', 'Pts Allowed']);
  });

  it('splits passing and rushing into separate per-game values', () => {
    expect(m('passypg').value(teams[0])).toBe(500); // 1000 pass / 2 GP
    expect(m('rushypg').value(teams[0])).toBe(50);  // 100 rush / 2 GP
    expect(m('passypg').value(teams[1])).toBe(100); // 200 / 2
    expect(m('rushypg').value(teams[1])).toBe(450); // 900 / 2
  });

  it('marks only points-allowed as lower-is-better', () => {
    expect(m('pa').lowerIsBetter).toBe(true);
    expect(m('passypg').lowerIsBetter).toBeUndefined();
  });
});

describe('rankForMetric', () => {
  it('ranks the pass-heavy team #1 in Pass Y/G but not Rush Y/G', () => {
    expect(rankForMetric(teams[0], m('passypg'), teams)).toBe(1); // A best passer
    expect(rankForMetric(teams[0], m('rushypg'), teams)).toBe(3); // A worst rusher
    expect(rankForMetric(teams[1], m('rushypg'), teams)).toBe(1); // B best rusher
  });

  it('ranks the stingiest defense #1 on points allowed (lower is better)', () => {
    expect(rankForMetric(teams[1], m('pa'), teams)).toBe(1); // B allows 20 -> 10/gm
    expect(rankForMetric(teams[2], m('pa'), teams)).toBe(3); // C allows 70 -> 35/gm
  });

  it('ranks the top scorer #1 on PPG', () => {
    expect(rankForMetric(teams[0], m('ppg'), teams)).toBe(1);
    expect(rankForMetric(teams[2], m('ppg'), teams)).toBe(3);
  });
});
