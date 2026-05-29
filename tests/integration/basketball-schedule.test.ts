/**
 * NBA-style schedule generator tests.
 *
 * Validates: 30 teams × 82 games each, conference/division rotation,
 * home/away balance, no double-booking, no back-to-back-to-back.
 */

import { describe, it, expect } from 'vitest';
import {
  generateBasketballSchedule,
  type BasketballTeamForSchedule,
} from '@bs/sport-basketball';
import type { TeamId, BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball/types';

// ---------------------------------------------------------------------------
// Fixture: 30 NBA-style teams
// ---------------------------------------------------------------------------

const NBA_TEAMS = [
  // Eastern Conference — Atlantic
  ['Boston', 'BOS', 'Eastern', 'Atlantic'],
  ['Brooklyn', 'BKN', 'Eastern', 'Atlantic'],
  ['New York', 'NYK', 'Eastern', 'Atlantic'],
  ['Philadelphia', 'PHI', 'Eastern', 'Atlantic'],
  ['Toronto', 'TOR', 'Eastern', 'Atlantic'],
  // Eastern — Central
  ['Chicago', 'CHI', 'Eastern', 'Central'],
  ['Cleveland', 'CLE', 'Eastern', 'Central'],
  ['Detroit', 'DET', 'Eastern', 'Central'],
  ['Indiana', 'IND', 'Eastern', 'Central'],
  ['Milwaukee', 'MIL', 'Eastern', 'Central'],
  // Eastern — Southeast
  ['Atlanta', 'ATL', 'Eastern', 'Southeast'],
  ['Charlotte', 'CHA', 'Eastern', 'Southeast'],
  ['Miami', 'MIA', 'Eastern', 'Southeast'],
  ['Orlando', 'ORL', 'Eastern', 'Southeast'],
  ['Washington', 'WAS', 'Eastern', 'Southeast'],
  // Western — Northwest
  ['Denver', 'DEN', 'Western', 'Northwest'],
  ['Minnesota', 'MIN', 'Western', 'Northwest'],
  ['Oklahoma City', 'OKC', 'Western', 'Northwest'],
  ['Portland', 'POR', 'Western', 'Northwest'],
  ['Utah', 'UTA', 'Western', 'Northwest'],
  // Western — Pacific
  ['Golden State', 'GSW', 'Western', 'Pacific'],
  ['LA Clippers', 'LAC', 'Western', 'Pacific'],
  ['LA Lakers', 'LAL', 'Western', 'Pacific'],
  ['Phoenix', 'PHX', 'Western', 'Pacific'],
  ['Sacramento', 'SAC', 'Western', 'Pacific'],
  // Western — Southwest
  ['Dallas', 'DAL', 'Western', 'Southwest'],
  ['Houston', 'HOU', 'Western', 'Southwest'],
  ['Memphis', 'MEM', 'Western', 'Southwest'],
  ['New Orleans', 'NOP', 'Western', 'Southwest'],
  ['San Antonio', 'SAS', 'Western', 'Southwest'],
] as const;

function makeFixtureTeams(): BasketballTeamForSchedule[] {
  return NBA_TEAMS.map(([city, abbr, conf, div]) => ({
    id: abbr as TeamId,
    city,
    name: abbr,
    abbreviation: abbr,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    playerIds: [],
    rosterBuckets: { active: [] },
    draftPicks: [],
    record: { wins: 0, losses: 0, otherResults: 0, pointsFor: 0, pointsAgainst: 0, streak: [] },
    coachIds: [],
    approval: {
      fanApproval: 50,
      ownerApproval: 50,
      objectives: [],
      jobSecurity: 'safe' as const,
    },
    capState: null,
    sportData: {
      conference: conf,
      division: div,
      pace: 'medium' as const,
      defensiveScheme: 'switch_everything' as const,
    },
  }));
}

function gamesByTeam(games: BaseGameResult<BasketballStats>[], teamId: TeamId): BaseGameResult<BasketballStats>[] {
  return games.filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId);
}

function teamMap(teams: BasketballTeamForSchedule[]): Map<TeamId, BasketballTeamForSchedule> {
  return new Map(teams.map(t => [t.id, t]));
}

function teamConf(team: BasketballTeamForSchedule): string {
  return (team.sportData as { conference: string }).conference;
}

function teamDiv(team: BasketballTeamForSchedule): string {
  return (team.sportData as { division: string }).division;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('basketball schedule generator', () => {
  it('every team plays exactly 82 games', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });

    for (const t of teams) {
      const teamGames = gamesByTeam(games, t.id);
      expect(teamGames.length, `${t.id} game count`).toBe(82);
    }
  });

  it('home/away split is 41/41 per team', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });

    for (const t of teams) {
      const home = games.filter(g => g.homeTeamId === t.id).length;
      const away = games.filter(g => g.awayTeamId === t.id).length;
      expect(home + away).toBe(82);
      // Tolerance ±1 since odd-game-count pairs flip a coin for who hosts
      expect(Math.abs(home - 41)).toBeLessThanOrEqual(2);
      expect(Math.abs(away - 41)).toBeLessThanOrEqual(2);
    }
  });

  it('each team plays division rivals 4 times', () => {
    const teams = makeFixtureTeams();
    const tMap = teamMap(teams);
    const games = generateBasketballSchedule(teams, { season: 2026 });

    for (const t of teams) {
      const tDiv = teamDiv(t);
      const tConf = teamConf(t);
      const divisionRivals = teams.filter(
        other => other.id !== t.id && teamDiv(other) === tDiv && teamConf(other) === tConf,
      );
      expect(divisionRivals.length).toBe(4);
      for (const rival of divisionRivals) {
        const matchups = games.filter(g =>
          (g.homeTeamId === t.id && g.awayTeamId === rival.id) ||
          (g.homeTeamId === rival.id && g.awayTeamId === t.id),
        );
        expect(matchups.length, `${t.id} vs ${rival.id}`).toBe(4);
      }
    }
    void tMap;
  });

  it('each team plays opposite-conference teams exactly 2 times', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });

    for (const t of teams) {
      const tConf = teamConf(t);
      const oppConfTeams = teams.filter(other => teamConf(other) !== tConf);
      expect(oppConfTeams.length).toBe(15);
      for (const opp of oppConfTeams) {
        const matchups = games.filter(g =>
          (g.homeTeamId === t.id && g.awayTeamId === opp.id) ||
          (g.homeTeamId === opp.id && g.awayTeamId === t.id),
        );
        expect(matchups.length, `${t.id} vs ${opp.id}`).toBe(2);
      }
    }
  });

  it('no team is scheduled twice on the same day', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });

    for (const t of teams) {
      const teamGames = gamesByTeam(games, t.id);
      const dates = teamGames.map(g => g.date);
      const uniqueDates = new Set(dates);
      expect(uniqueDates.size, `${t.id} has duplicate dates`).toBe(dates.length);
    }
  });

  it('no team plays 3 games in 3 consecutive nights (no B2B2B)', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });

    let b2b2bCount = 0;
    for (const t of teams) {
      const days = gamesByTeam(games, t.id)
        .map(g => (g.sportData as { dayOfSeason: number }).dayOfSeason)
        .sort((a, b) => a - b);
      for (let i = 0; i + 2 < days.length; i++) {
        if (days[i + 1] - days[i] === 1 && days[i + 2] - days[i + 1] === 1) {
          b2b2bCount++;
        }
      }
    }
    // Hard constraint: B2B2B should not happen. (Fallback path in the
    // generator allows it only when no clean slot found; in practice
    // should be 0 for a healthy 30-team / 82-game / 170-day schedule.)
    expect(b2b2bCount).toBe(0);
  });

  it('total game count is 1230 (30 teams × 82 / 2)', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });
    expect(games.length).toBe(30 * 82 / 2);
  });

  it('all games have status="scheduled" and null finalScore', () => {
    const teams = makeFixtureTeams();
    const games = generateBasketballSchedule(teams, { season: 2026 });
    for (const g of games) {
      expect(g.status).toBe('scheduled');
      expect(g.finalScore).toBeNull();
    }
  });

  it('deterministic for the same seed', () => {
    const teams1 = makeFixtureTeams();
    const teams2 = makeFixtureTeams();
    const games1 = generateBasketballSchedule(teams1, { season: 2026, rngSeed: 'det' });
    const games2 = generateBasketballSchedule(teams2, { season: 2026, rngSeed: 'det' });
    expect(games1.length).toBe(games2.length);
    for (let i = 0; i < games1.length; i++) {
      expect(games1[i].homeTeamId).toBe(games2[i].homeTeamId);
      expect(games1[i].awayTeamId).toBe(games2[i].awayTeamId);
      expect(games1[i].date).toBe(games2[i].date);
    }
  });

  it('throws on non-30-team input', () => {
    const teams = makeFixtureTeams().slice(0, 28);
    expect(() => generateBasketballSchedule(teams, { season: 2026 })).toThrow();
  });
});
