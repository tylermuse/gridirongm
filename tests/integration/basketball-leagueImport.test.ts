/**
 * League-file import: convert a BBGM/ZenGM NBA roster JSON into BS Hoops
 * domain objects, then prove the imported league is sim-ready (roster balance
 * is the known sim-day blocker — see basketball-roster-balance.test.ts).
 *
 * Uses a trimmed fixture (30 teams, ~14 players each, latest-season ratings
 * only) so the test stays small; the live 6.5 MB file lives in public/rosters/.
 */

import { describe, it, expect } from 'vitest';
import { computeOverall, type BasketballPlayer, type BasketballPosition } from '@bs/sport-basketball';
import {
  convertBbgmLeague,
  type BbgmLeagueFile,
} from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import fixtureJson from '../../apps/bs-basketball/tests/fixtures/bbgm-nba-trimmed.json';

const fixture = fixtureJson as unknown as BbgmLeagueFile;
const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

function posCounts(
  ids: readonly string[],
  players: Record<string, BasketballPlayer>,
): Record<BasketballPosition, number> {
  const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of ids) {
    const p = players[id];
    if (p?.sportData?.position) c[p.sportData.position]++;
  }
  return c;
}

describe('convertBbgmLeague', () => {
  it('produces 30 balanced, sim-legal teams from a BBGM file', () => {
    const imported = convertBbgmLeague(fixture);
    expect(imported.teams).toHaveLength(30);
    expect(imported.season).toBe(2026);

    const players = imported.players as Record<string, BasketballPlayer>;
    for (const team of imported.teams) {
      // Roster size in a sane NBA band.
      expect(team.playerIds.length).toBeGreaterThanOrEqual(12);
      expect(team.playerIds.length).toBeLessThanOrEqual(18);

      // Every position represented — the sim-day blocker.
      const counts = posCounts(team.playerIds, players);
      for (const pos of POSITIONS) {
        expect(counts[pos], `${team.abbreviation} has ${counts[pos]} ${pos}`).toBeGreaterThanOrEqual(1);
      }

      for (const id of team.playerIds) {
        const p = players[id];
        // Overall on the BS Hoops 40–99 scale (BBGM ovr is not carried).
        expect(p.ratings.overall).toBeGreaterThanOrEqual(40);
        expect(p.ratings.overall).toBeLessThanOrEqual(99);
        // Overall stays consistent with attributes (so it survives aging,
        // which recomputes overall from the same weighted formula).
        expect(p.ratings.overall).toBe(computeOverall(p.ratings, p.sportData.position));
        // Rostered players carry a real, current contract.
        expect(p.contract).not.toBeNull();
        expect(p.contract!.years.length).toBeGreaterThanOrEqual(1);
        expect(p.contract!.years[0].baseSalary).toBeGreaterThan(0);
      }
    }
  });

  it('calibrates overalls to an NBA-shaped distribution (real stars are stars)', () => {
    const imported = convertBbgmLeague(fixture);
    const players = imported.players as Record<string, BasketballPlayer>;
    const ovr = imported.teams
      .flatMap(t => t.playerIds)
      .map(id => players[id].ratings.overall)
      .sort((a, b) => b - a);

    // A real star tier exists (mapping raw computeOverall straight through caps
    // at ~78 — calibration lifts the elite into the high-80s/90s).
    expect(ovr[0]).toBeGreaterThanOrEqual(90);
    expect(ovr.filter(o => o >= 85).length).toBeGreaterThanOrEqual(8);
    // Rotation core sits in a believable band, not bunched at the floor.
    const median = ovr[Math.floor(ovr.length / 2)];
    expect(median).toBeGreaterThanOrEqual(68);
    expect(median).toBeLessThanOrEqual(80);
  });

  it('routes free agents to the FA pool and excludes retired/draft-pool players', () => {
    const imported = convertBbgmLeague(fixture);
    const players = imported.players as Record<string, BasketballPlayer>;

    // Every imported player is either on a team or a free agent — nothing else.
    const onTeam = new Set(imported.teams.flatMap(t => t.playerIds));
    const fa = new Set(imported.freeAgentIds);
    expect(fa.size).toBeGreaterThan(0);
    for (const id of Object.keys(players)) {
      expect(onTeam.has(id) || fa.has(id)).toBe(true);
    }
    // Free agents are unsigned and rosterless.
    for (const id of imported.freeAgentIds) {
      expect(players[id].contract).toBeNull();
      expect(players[id].rosterSlot).toBeNull();
    }

    // The fixture's -1 (FA) count is preserved; -2/-3 are dropped entirely.
    const expectedFA = fixture.players.filter(p => p.tid === -1).length;
    expect(imported.freeAgentIds.length).toBe(expectedFA);
    const totalConvertible = fixture.players.filter(p => p.tid >= -1).length;
    expect(Object.keys(players).length).toBe(totalConvertible);
  });

  it('is deterministic — same input maps to the same positions', () => {
    const a = convertBbgmLeague(fixture);
    const b = convertBbgmLeague(fixture);
    const posA = Object.fromEntries(Object.entries(a.players).map(([id, p]) => [id, p.sportData.position]));
    const posB = Object.fromEntries(Object.entries(b.players).map(([id, p]) => [id, p.sportData.position]));
    expect(posA).toEqual(posB);
  });
});

describe('imported league is sim-ready', () => {
  it('builds a league and sims a full season + playoffs without crashing', () => {
    const imported = convertBbgmLeague(fixture);
    let league = assembleLeague({
      teams: imported.teams,
      players: imported.players,
      freeAgentIds: imported.freeAgentIds,
      season: imported.season,
      displayName: 'Imported NBA',
      rngSeed: 'import-sim',
    });

    expect(league.teams).toHaveLength(30);
    expect(league.games.length).toBeGreaterThan(0);

    // One day sims cleanly.
    const first = simNextDay(league);
    expect(first).not.toBeNull();
    league = first!.league;

    // Full regular season.
    let guard = 0;
    while (!isRegularSeasonComplete(league) && guard < 400) {
      const r = simNextDay(league);
      if (!r) break;
      league = r.league;
      guard++;
    }
    expect(isRegularSeasonComplete(league)).toBe(true);

    // Full postseason.
    league = initializePlayoffs(league);
    guard = 0;
    while (!getBracket(league)!.complete && guard < 200) {
      const r = simPlayoffDay(league);
      if (!r) break;
      league = r.league;
      guard++;
    }
    expect(getBracket(league)!.complete).toBe(true);
  }, 120_000);
});
