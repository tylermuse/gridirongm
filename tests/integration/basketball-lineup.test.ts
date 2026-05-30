/**
 * Phase 2D-7 — Lineup management integration tests.
 *
 * A saved lineup persists and is used by the sim; a stale lineup (a starter no
 * longer on the roster) silently falls back to the auto-built default.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextGameForTeam } from '@/../apps/bs-basketball/src/lib/sim/runNextGame';
import {
  setTeamLineup,
  resolveLineup,
  getTeamLineup,
  buildDefaultBasketballLineup,
  validateBasketballLineup,
} from '@/../apps/bs-basketball/src/lib/lineup';
import type { BasketballLineup, BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { PlayerId } from '@bs/core/adapter';

function setup() {
  const league = createNewBasketballLeague({ rngSeed: 'lineup-test' });
  const team = league.teams[0] as BasketballTeam;
  const roster = team.playerIds.map(id => league.players[id] as BasketballPlayer);
  return { league, team, roster };
}

/** A lineup that starts a normally-benched player in the PG slot. */
function customLineup(roster: BasketballPlayer[]): { lineup: BasketballLineup; promoted: PlayerId } {
  const def = buildDefaultBasketballLineup(roster);
  const promoted = roster.find(p => !def.starters.includes(p.id))!.id;
  const starters = [...def.starters];
  starters[0] = promoted; // PG slot
  const bench = roster.filter(p => !starters.includes(p.id)).map(p => p.id);
  return {
    lineup: { starters: starters as BasketballLineup['starters'], bench, backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null }, pace: 'medium' },
    promoted,
  };
}

describe('lineup persistence', () => {
  it('saves and resolves a valid lineup', () => {
    const { league, team, roster } = setup();
    const { lineup } = customLineup(roster);
    expect(validateBasketballLineup(lineup, roster).valid).toBe(true);

    const updated = setTeamLineup(league, team.id, lineup);
    const savedTeam = updated.teams.find(t => t.id === team.id) as BasketballTeam;
    expect(getTeamLineup(savedTeam)).toEqual(lineup);
    expect(resolveLineup(savedTeam, roster)).toEqual(lineup);
  });

  it('falls back to default when the saved lineup is stale', () => {
    const { league, team, roster } = setup();
    const { lineup, promoted } = customLineup(roster);
    const updated = setTeamLineup(league, team.id, lineup);
    const savedTeam = updated.teams.find(t => t.id === team.id) as BasketballTeam;

    // Simulate the promoted starter leaving (traded/released): drop from roster.
    const reduced = roster.filter(p => p.id !== promoted);
    const resolved = resolveLineup(savedTeam, reduced);

    expect(resolved.starters).not.toContain(promoted);
    expect(validateBasketballLineup(resolved, reduced).valid).toBe(true);
  });
});

describe('sim uses the saved lineup', () => {
  it('starts the player the user put in the lineup', () => {
    const { league, team, roster } = setup();
    const { lineup, promoted } = customLineup(roster);
    const withLineup = setTeamLineup(league, team.id, lineup);

    const result = simNextGameForTeam(withLineup, team.id)!;
    const game = result.league.games.find(g => g.id === result.gameId)!;
    const box = game.boxScores[promoted];

    // The promoted player started and logged minutes.
    expect(box).toBeTruthy();
    expect(box.gamesStarted).toBe(1);
    expect((box.minutes ?? 0)).toBeGreaterThan(0);
  });
});
