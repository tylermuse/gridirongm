/**
 * Record book integration test: sim a full season + playoffs + offseason into
 * the next season, then read the archive back through the history drill-down,
 * franchise records, and league records.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import {
  getSeasonDrillDown, getFranchiseRecords, getLeagueRecords, getSeasonHistory,
  type SeasonHistoryEntry,
} from '@/../apps/bs-basketball/src/lib/history';

type League = ReturnType<typeof createNewBasketballLeague>;

function playSeason(league: League): League {
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('basketball record book', () => {
  let league: League;
  let completed: number;
  let finalSeasonLeague: League;

  beforeAll(() => {
    const start = createNewBasketballLeague({ rngSeed: 'history-records' });
    completed = start.currentSeason;
    finalSeasonLeague = playSeason(start);
    league = advanceToNextSeason(finalSeasonLeague);
  }, 120_000);

  it('archives the completed season and rolls into the next', () => {
    expect(league.currentSeason).toBe(completed + 1);
    expect(getSeasonHistory(league).map(e => e.season)).toContain(completed);
  });

  it('season drill-down has champion, Finals result, best record, awards, leaders', () => {
    const d = getSeasonDrillDown(league, completed)!;
    expect(d).not.toBeNull();
    expect(d.extended).toBe(true);
    const bracket = getBracket(finalSeasonLeague)!;
    expect(d.champion).toBe(bracket.championTeamId);
    expect(d.runnerUp).toBe(bracket.runnerUpTeamId);
    expect(d.finals!.championWins).toBe(4);
    expect(d.finals!.runnerUpWins).toBeLessThan(4);

    expect(d.standings).toHaveLength(league.teams.length);
    const maxWins = Math.max(...finalSeasonLeague.teams.map(t => t.record.wins));
    expect(d.bestRecord!.wins).toBe(maxWins);
    expect(d.bestByConference.Eastern).not.toBeNull();
    expect(d.bestByConference.Western).not.toBeNull();

    const keys = d.awards.map(a => a.key);
    expect(keys).toContain('mvp');
    expect(keys).toContain('finalsMvp');
    expect(keys).toContain('dpoy');
    for (const a of d.awards) expect(a.winner.name.length).toBeGreaterThan(0);
    // Finals MVP comes off the champion.
    expect(d.awards.find(a => a.key === 'finalsMvp')!.winner.teamId).toBe(d.champion);

    const cats = d.leaders.map(l => l.category);
    expect(cats).toEqual(expect.arrayContaining(['ppg', 'rpg', 'apg']));
    const ppg = d.leaders.find(l => l.category === 'ppg')!;
    expect(ppg.value).toBeGreaterThan(15);

    expect(d.allLeague.length).toBe(3);
    expect(d.allLeague[0].players.length).toBe(5);
    expect(d.allDefensive.length).toBe(2);
    expect(Array.isArray(d.retired)).toBe(true);
    // Retirees are gone from the active pool.
    for (const r of d.retired) expect(league.players[r.id as keyof typeof league.players]).toBeUndefined();
  });

  it('league records are consistent with the drill-down', () => {
    const d = getSeasonDrillDown(league, completed)!;
    const rec = getLeagueRecords(league);
    // With one archived season, single-season records equal that season's leaders.
    expect(rec.singleSeason.ppg!.playerId).toBe(d.leaders.find(l => l.category === 'ppg')!.playerId);
    expect(rec.singleSeason.rpg!.rpg).toBeCloseTo(d.leaders.find(l => l.category === 'rpg')!.value);
    expect(rec.mostTitles[0]).toMatchObject({ teamId: d.champion, titles: 1, seasons: [completed] });
    expect(rec.bestTeamSeason!.wins).toBe(d.bestRecord!.wins);
    expect(rec.mostMvps[0].count).toBe(1);
    expect(rec.careerPoints.length).toBeGreaterThan(0);
  });

  it('franchise records add up for the champion and every team', () => {
    const d = getSeasonDrillDown(league, completed)!;
    const champ = getFranchiseRecords(league, d.champion!);
    expect(champ.titles).toEqual([completed]);
    expect(champ.finalsAppearances).toEqual([completed]);
    expect(champ.playoffAppearances).toEqual([completed]);
    expect(champ.seasons).toHaveLength(1);
    expect(champ.seasons[0].playoffRound).toBe(4);
    expect(champ.careerLeaders.points.length).toBeGreaterThan(0);
    expect(champ.bestSeasons.ppg.length).toBeGreaterThan(0);
    expect(champ.seasonsWithoutSplits).toEqual([]);

    // Each franchise's archived record matches the standings; 16 teams made the bracket.
    let playoffTeams = 0;
    for (const t of league.teams) {
      const f = getFranchiseRecords(league, t.id);
      if (f.playoffAppearances.length) playoffTeams++;
      const rec = d.standings.find(r => r.teamId === t.id)!;
      expect(f.seasons[0]).toMatchObject({ wins: rec.wins, losses: rec.losses });
    }
    expect(playoffTeams).toBe(16);
  });

  it('degrades gracefully on a legacy (pre-extension) history entry', () => {
    const entry = getSeasonHistory(league).find(e => e.season === completed)!;
    const legacy: SeasonHistoryEntry = {
      season: entry.season, champion: entry.champion, runnerUp: entry.runnerUp,
      finalsMvp: entry.finalsMvp, mvp: entry.mvp, scoringLeader: entry.scoringLeader,
    };
    const old = { ...league, seasonHistory: { [completed]: legacy } } as League;
    const d = getSeasonDrillDown(old, completed)!;
    expect(d.extended).toBe(false);
    expect(d.champion).toBe(entry.champion);
    expect(d.awards.map(a => a.key)).toEqual(['mvp', 'finalsMvp']);
    expect(d.standings).toEqual([]);
    // Leaders fall back to surviving players' seasonLog.
    expect(d.leaders.find(l => l.category === 'ppg')).toBeDefined();
    const f = getFranchiseRecords(old, entry.champion!);
    expect(f.titles).toEqual([completed]);
    expect(f.seasonsWithoutSplits).toEqual([completed]);
    expect(getLeagueRecords(old).mostTitles[0].titles).toBe(1);
  });
});
