/**
 * Phase 2D-7 — Lineup management integration tests.
 *
 * A saved lineup persists and is used by the sim; a stale lineup (a starter no
 * longer on the roster) silently falls back to the auto-built default.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { generateBasketballPlayer } from '@bs/sport-basketball';
import { simNextGameForTeam } from '@/../apps/bs-basketball/src/lib/sim/runNextGame';
import {
  setTeamLineup,
  resolveLineup,
  repairLineup,
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

/** A lineup that deliberately benches the team's highest-OVR starter and starts
 *  the lowest-OVR bench player in that slot. */
function benchTheStar(roster: BasketballPlayer[]) {
  const def = buildDefaultBasketballLineup(roster);
  const starterPlayers = def.starters.map(id => roster.find(p => p.id === id)!);
  const benchStar = [...starterPlayers].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  const slot = def.starters.indexOf(benchStar.id);
  const benchPlayers = def.bench.map(id => roster.find(p => p.id === id)!);
  const promote = [...benchPlayers].sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
  const starters = [...def.starters];
  starters[slot] = promote.id;
  const bench = [benchStar.id, ...def.bench.filter(id => id !== promote.id)];
  const lineup: BasketballLineup = {
    starters: starters as BasketballLineup['starters'],
    bench,
    backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null },
    pace: 'medium',
  };
  return { lineup, benchStar, promote, otherStarter: starters.find(id => id !== promote.id)! };
}

describe('BUG-11: minutes follow the user-set lineup, not OVR', () => {
  it('a deliberately-benched high-OVR player gets bench minutes, not starter minutes', () => {
    const { league, team, roster } = setup();
    const { lineup, benchStar, promote } = benchTheStar(roster);
    const withLineup = setTeamLineup(league, team.id, lineup);

    const result = simNextGameForTeam(withLineup, team.id)!;
    const game = result.league.games.find(g => g.id === result.gameId)!;
    const starterMin = game.boxScores[promote.id]?.minutes ?? 0;
    const benchedMin = game.boxScores[benchStar.id]?.minutes ?? 0;

    // The user's chosen starter started; the benched star did not.
    expect(game.boxScores[promote.id]?.gamesStarted).toBe(1);
    expect(game.boxScores[benchStar.id]?.gamesStarted).toBe(0);
    // The benched star plays bench-level minutes, not starter-level — i.e. clearly
    // below the team's real starters (compare to the MAX starter, not the
    // deliberately-weak low-OVR starter we promoted, whose minutes can dip into
    // the top reserve's range). The old bug had him at ~35 (full starter load).
    const maxStarterMin = Math.max(...lineup.starters.map(id => game.boxScores[id]?.minutes ?? 0));
    expect(starterMin).toBeGreaterThan(0); // the promoted starter logged real minutes
    expect(benchedMin).toBeLessThan(maxStarterMin);
    expect(benchedMin).toBeLessThan(30);
  });

  it('repairs a stale lineup instead of reverting to "highest OVR starts"', () => {
    const { league, team, roster } = setup();
    const { lineup, benchStar, promote, otherStarter } = benchTheStar(roster);
    const savedTeam = setTeamLineup(league, team.id, lineup).teams.find(t => t.id === team.id) as BasketballTeam;

    // A DIFFERENT starter becomes unavailable (injury/trade) → lineup is stale.
    const available = roster.filter(p => p.id !== otherStarter);
    const resolved = resolveLineup(savedTeam, available);

    // The user's deliberate starter is KEPT (old behavior demoted him via OVR-default).
    expect(resolved.starters).toContain(promote.id);
    // The injured starter is gone, and the result is a valid 5-man lineup.
    expect(resolved.starters).not.toContain(otherStarter);
    expect(validateBasketballLineup(resolved, available).valid).toBe(true);
    // The benched star isn't force-promoted just for being high-OVR (a position-
    // matched bench player fills the hole per the user's bench order).
    expect(repairLineup(lineup, available).starters).toContain(promote.id);
  });
});

describe('FEAT-21: flexible G/F/C starter slots', () => {
  const mk = (position: 'PG' | 'SG' | 'SF' | 'PF' | 'C', targetOverall: number) => {
    const p = generateBasketballPlayer({ position, targetOverall, age: 25 }) as BasketballPlayer;
    return { ...p, ratings: { ...p.ratings, overall: targetOverall } }; // pin OVR for a deterministic test
  };

  // Roster with TWO strong SGs and only a weak natural PG. The two best guards
  // (both SGs) should start; the weak PG should not be forced in over them.
  function flexRoster() {
    const weakPg = mk('PG', 64);
    const sgA = mk('SG', 82);
    const sgB = mk('SG', 79);
    const roster: BasketballPlayer[] = [
      weakPg, sgA, sgB,
      mk('SF', 77), mk('PF', 76), mk('C', 78),
      mk('SG', 60), mk('SF', 61), mk('PF', 60), mk('C', 59), // bench depth
    ];
    return { roster, weakPg, sgA, sgB };
  }

  it('starts the two best guards even when both are SGs', () => {
    const { roster, weakPg, sgA, sgB } = flexRoster();
    const def = buildDefaultBasketballLineup(roster);
    // Both strong SGs start; the weak PG is benched (old exact-position build started him).
    expect(def.starters).toContain(sgA.id);
    expect(def.starters).toContain(sgB.id);
    expect(def.starters).not.toContain(weakPg.id);
  });

  it('does not warn about a within-group flex (an SG at the PG slot)', () => {
    const { roster } = flexRoster();
    const def = buildDefaultBasketballLineup(roster);
    const warnings = validateBasketballLineup(def, roster).warnings;
    // No position-mismatch warnings for guards filling guard slots.
    expect(warnings.filter(w => w.code === 'LINEUP_POSITION_MISMATCH')).toHaveLength(0);
  });
});

describe('BUG-21: young high-upside players get development minutes in the rotation', () => {
  const mk = (
    position: 'PG' | 'SG' | 'SF' | 'PF' | 'C',
    overall: number,
    age: number,
    potential: number,
  ): BasketballPlayer => {
    const p = generateBasketballPlayer({ position, targetOverall: overall, age }) as BasketballPlayer;
    // Pin OVR / potential / age so the rotation math is deterministic.
    return { ...p, age, ratings: { ...p.ratings, overall }, development: { ...p.development, potential } };
  };

  it('slots a low-OVR but high-upside rookie into the 10-man rotation ahead of replacement vets', () => {
    // Five clear starters, five replacement-level veterans (no upside), and one
    // raw rookie whose current OVR is BELOW every veteran — under pure-OVR bench
    // ordering he'd sit at the very back (roster spot 11) and never play.
    const starters = [mk('PG', 80, 27, 80), mk('SG', 80, 27, 80), mk('SF', 80, 27, 80), mk('PF', 80, 27, 80), mk('C', 80, 27, 80)];
    const vets = [mk('PG', 70, 30, 70), mk('SG', 70, 30, 70), mk('SF', 70, 30, 70), mk('PF', 70, 30, 70), mk('C', 70, 30, 70)];
    const rookie = mk('SG', 66, 19, 92); // raw OVR 66 < vets, but big upside + youth
    const roster = [...starters, ...vets, rookie];

    const def = buildDefaultBasketballLineup(roster);

    // The rookie is a reserve (the bump is bench-only — it never forces a start)...
    expect(def.starters).not.toContain(rookie.id);
    // ...but his development bump lifts him into the first five bench (the players
    // the sim actually plays), ahead of the replacement-level veterans.
    expect(def.bench.slice(0, 5)).toContain(rookie.id);
    // A pure-OVR sort would have buried him dead last; the bump moved him up.
    expect(def.bench[def.bench.length - 1]).not.toBe(rookie.id);
  });

  it('does not bump an older replacement-level player (no youth, no upside)', () => {
    const starters = [mk('PG', 80, 27, 80), mk('SG', 80, 27, 80), mk('SF', 80, 27, 80), mk('PF', 80, 27, 80), mk('C', 80, 27, 80)];
    const vets = [mk('PG', 72, 30, 72), mk('SG', 72, 30, 72), mk('SF', 72, 30, 72), mk('PF', 72, 30, 72), mk('C', 72, 30, 72)];
    const oldScrub = mk('SG', 66, 31, 92); // same low OVR + "upside" but age 31 → no bump
    const roster = [...starters, ...vets, oldScrub];

    const def = buildDefaultBasketballLineup(roster);
    // With no youth multiplier he stays behind the better veterans, at the back.
    expect(def.bench.slice(0, 5)).not.toContain(oldScrub.id);
  });
});

describe('FEAT-22: bench order controls minutes', () => {
  it('a bench player dragged higher out-minutes a higher-OVR player below him', () => {
    const { league, team, roster } = setup();
    const def = buildDefaultBasketballLineup(roster);
    const benchPlayers = def.bench.map(id => roster.find(p => p.id === id)!);
    const byOvrAsc = [...benchPlayers].sort((a, b) => a.ratings.overall - b.ratings.overall);
    const low = byOvrAsc[0];
    const high = byOvrAsc[byOvrAsc.length - 1];
    // Put the LOWER-OVR player first in the bench order, the higher-OVR second.
    const bench = [low.id, high.id, ...def.bench.filter(id => id !== low.id && id !== high.id)];
    const lineup: BasketballLineup = { starters: def.starters, bench, backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null }, pace: 'medium' };

    const withLineup = setTeamLineup(league, team.id, lineup);
    const result = simNextGameForTeam(withLineup, team.id)!;
    const game = result.league.games.find(g => g.id === result.gameId)!;
    const lowMin = game.boxScores[low.id]?.minutes ?? 0;
    const highMin = game.boxScores[high.id]?.minutes ?? 0;

    // Order beats rating: the player dragged to the top of the bench plays more.
    expect(lowMin).toBeGreaterThan(highMin);
    // Bench minutes still sit below the starters.
    const starterMin = Math.min(...def.starters.map(id => game.boxScores[id]?.minutes ?? 0));
    expect(lowMin).toBeLessThanOrEqual(starterMin + 1);
  });
});
