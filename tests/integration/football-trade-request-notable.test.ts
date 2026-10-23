import { describe, it, expect } from 'vitest';
import {
  refreshTradeRequests,
  notablePlayerIds,
  REQUEST_WEEKS,
  MAX_NEW_FILINGS_PER_WEEK,
} from '@/lib/engine/tradeRequests';
import type { Player, Team } from '@/types';

// Minimal shapes — refreshTradeRequests/deriveReason only read a few fields.
function mkTeam(id: string): Team {
  return {
    id,
    city: `City${id}`,
    abbreviation: id,
    depthChart: {},
    record: { wins: 2, losses: 8, ties: 0, pointsFor: 0, pointsAgainst: 0 },
  } as unknown as Team;
}
function mkPlayer(id: string, teamId: string, ovr: number, position = 'QB'): Player {
  return {
    id,
    teamId,
    firstName: 'P',
    lastName: id,
    position,
    retired: false,
    mood: 10,
    ratings: { overall: ovr },
    contract: { salary: 1, yearsLeft: 2 },
    stats: {},
    // Already on the unhappy clock long enough to file this week.
    tradeRequest: { stage: 'unhappy', since: 1, reason: 'Unhappy', season: 2026 },
  } as unknown as Player;
}

const teams = Array.from({ length: 32 }, (_, i) => mkTeam(`T${i}`));
const week = 1 + REQUEST_WEEKS;

describe('trade requests prioritize the league’s best players', () => {
  it('only notable (high-OVR, top-half starter) players are eligible', () => {
    const players = [mkPlayer('star', 'T1', 88), mkPlayer('scrub', 'T2', 56)];
    const ids = notablePlayerIds(players, teams.length);
    expect(ids.has('star')).toBe(true);
    expect(ids.has('scrub')).toBe(false);
  });

  it('low-OVR AI players never file; user-team players still can', () => {
    const players = [mkPlayer('scrub', 'T2', 56), mkPlayer('mine', 'T0', 55)];
    const { rumors } = refreshTradeRequests({ players, teams, season: 2026, week, userTeamId: 'T0' });
    expect(rumors.map(r => r.playerIds[0])).toEqual(['mine']);
  });

  it('caps new AI filings per week, highest OVR first', () => {
    const players = [70, 92, 85, 78].map((o, i) => mkPlayer(`p${o}`, `T${i + 1}`, o));
    const { rumors } = refreshTradeRequests({ players, teams, season: 2026, week, userTeamId: 'T0' });
    expect(rumors).toHaveLength(MAX_NEW_FILINGS_PER_WEEK);
    expect(rumors.map(r => r.playerIds[0])).toEqual(['p92', 'p85']);
  });
});
