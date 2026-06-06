/**
 * Positional needs for the draft On-The-Clock / Best Fit surfaces (parity §A).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { positionNeeds, needBonus, TARGET_DEPTH } from '@/../apps/bs-basketball/src/lib/draft/needs';
import type { BasketballTeam } from '@bs/sport-basketball';

describe('positionNeeds', () => {
  const league = createNewBasketballLeague({ rngSeed: 'needs' });
  const team = league.teams[0] as BasketballTeam;
  const players = league.players as Record<string, never>;

  it('returns all five positions, sorted by need (desc)', () => {
    const needs = positionNeeds(team, players);
    expect(needs.map(n => n.position).sort()).toEqual(['C', 'PF', 'PG', 'SF', 'SG']);
    for (let i = 1; i < needs.length; i++) {
      expect(needs[i - 1].needScore).toBeGreaterThanOrEqual(needs[i].needScore);
    }
  });

  it('scores an empty position as a max need and a stocked one as zero', () => {
    const empty = { ...team, playerIds: [] } as BasketballTeam;
    expect(positionNeeds(empty, players).every(n => n.needScore === 100)).toBe(true);

    // A position with >= target depth has zero need.
    const pgIds = team.playerIds.filter(id => league.players[id]?.sportData.position === 'PG');
    const stocked = { ...team, playerIds: [...pgIds, ...pgIds, ...pgIds].slice(0, TARGET_DEPTH + 2) } as BasketballTeam;
    const pgNeed = positionNeeds(stocked, players).find(n => n.position === 'PG')!;
    expect(pgNeed.needScore).toBe(0);
    expect(needBonus(positionNeeds(empty, players), 'C')).toBe(100);
  });
});
