/**
 * Mid-season roster import: the shipped NBA file (refreshed weekly by
 * apps/bs-basketball/scripts/weekly_roster_update.py) is a BBGM regular-season
 * snapshot with real results + the remaining real schedule. Importing it must
 * open Hoops season 2026 (= 2026-27) on the next real game day with real
 * records, and the rest of the season must sim through to the playoffs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { applySeasonInProgress } from '@/../apps/bs-basketball/src/lib/league/importSeason';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { computeExtendedStandings } from '@/../apps/bs-basketball/src/lib/standings/extendedStandings';
import { initializePlayoffs, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

function importMidSeason(): { league: LeagueState; file: BbgmLeagueFile & { bsRealResults: unknown[]; schedule: unknown[] } } {
  const file = JSON.parse(readFileSync(FILE, 'utf8'));
  const imported = convertBbgmLeague(file);
  expect(imported.seasonInProgress).not.toBeNull();
  const base = assembleLeague({ teams: imported.teams, players: imported.players, freeAgentIds: imported.freeAgentIds, season: imported.season });
  return { league: applySeasonInProgress(base, imported.seasonInProgress!), file };
}

describe('mid-season NBA roster import', () => {
  it('opens 2026-27 in the regular season with the real schedule and records', () => {
    const { league, file } = importMidSeason();
    expect(league.currentSeason).toBe(2026); // BBGM 2027 = 2026-27 = Hoops 2026
    expect(league.currentPhase).toBe('regular_season');
    expect((league.sportData as { seasonStarted?: boolean }).seasonStarted).toBe(true);

    const played = league.games.filter(g => g.status === 'played');
    const scheduled = league.games.filter(g => g.status === 'scheduled');
    expect(played.length).toBe(file.bsRealResults.length);
    expect(scheduled.length).toBe(file.schedule.length);
    expect(played.length + scheduled.length).toBe(30 * 82 / 2);

    // Every team: 82 games total, standings W-L match the team record.
    const standings = computeExtendedStandings(league);
    for (const t of league.teams) {
      const n = league.games.filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id).length;
      expect(n).toBe(82);
      const s = standings.get(t.id)!;
      expect([s.wins, s.losses]).toEqual([t.record.wins, t.record.losses]);
    }

    // Rosters within the 15-man limit; contracts cover the current season.
    for (const t of league.teams) {
      expect(t.playerIds.length).toBeLessThanOrEqual(15);
      expect(t.playerIds.length).toBeGreaterThanOrEqual(13);
      for (const id of t.playerIds) {
        const p = league.players[id];
        expect(p.contract?.years.some(y => y.season === 2026)).toBe(true);
      }
    }
  });

  it('sims the rest of the regular season and seeds the playoffs', () => {
    let { league } = importMidSeason();
    const firstOpen = Math.min(...league.games.filter(g => g.status === 'scheduled').map(g => (g.sportData as { dayOfSeason: number }).dayOfSeason));
    const step = simNextDay(league)!;
    expect(step.day).toBe(firstOpen);
    league = step.league;
    for (let i = 0; i < 400 && !isRegularSeasonComplete(league); i++) league = simNextDay(league)!.league;
    expect(isRegularSeasonComplete(league)).toBe(true);
    for (const t of league.teams) expect(t.record.wins + t.record.losses).toBe(82);
    const bracket = getBracket(initializePlayoffs(league));
    expect(bracket).not.toBeNull();
  }, 120_000);
});
