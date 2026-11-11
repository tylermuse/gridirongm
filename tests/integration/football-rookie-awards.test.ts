// Rookie of the Year must find the rookies in every season, not just the first.
// Reported bug: "no player available" for OROY/DROY when there clearly are
// rookies. Cause: awards looked for experience === 0, but a rookie drafted
// in-game has been through the season rollover and plays his first year at 1.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '@/lib/engine/store';
import { computeSeasonAwards, computeAwardRaces } from '@/lib/engine/awards';
import { makeRookieTest, rookieClassYear } from '@/lib/engine/rookies';
import type { Player } from '@/types';

const root = path.resolve(__dirname, '../../public');
const st = () => useGameStore.getState();
const stubRosterFetch = () => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const file = path.join(root, String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]);
  return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
}));

const player = (over: Partial<Player>): Player =>
  ({ id: Math.random().toString(36), teamId: 'T', retired: false, experience: 1, draftYear: null, ...over }) as Player;
const classOf = (year: number, n: number, over: Partial<Player> = {}) =>
  Array.from({ length: n }, () => player({ draftYear: year, ...over }));

describe('rookie test', () => {
  it('counts experience-0 players and nobody else in a league with no draft years', () => {
    const rookie = player({ experience: 0 });
    const vet = player({ experience: 1 });
    const isRookie = makeRookieTest([rookie, vet], 2026);
    expect(isRookie(rookie)).toBe(true);
    expect(isRookie(vet)).toBe(false);
  });

  it('first season on an imported roster: this year\'s class, not last year\'s', () => {
    const players = [...classOf(2026, 200, { experience: 0 }), ...classOf(2025, 200, { experience: 1 })];
    expect(rookieClassYear(players, 2026)).toBe(2026);
    const isRookie = makeRookieTest(players, 2026);
    expect(players.filter(isRookie).every(p => p.draftYear === 2026)).toBe(true);
    expect(players.filter(isRookie)).toHaveLength(200);
  });

  it('later seasons: the class drafted for this season, already at experience 1', () => {
    const players = [
      ...classOf(2027, 150, { experience: 1, acquiredVia: 'draft', acquiredSeason: 2027 }),
      ...classOf(2026, 200, { experience: 2 }),
      player({ experience: 1, draftYear: 2026 }), // signed late last year, now in year two
    ];
    const isRookie = makeRookieTest(players, 2027);
    expect(players.filter(isRookie)).toHaveLength(150);
    expect(players.filter(isRookie).every(p => p.draftYear === 2027)).toBe(true);
  });

  it('offseason start: the class the league drafted before rolling into its first season', () => {
    const players = [
      ...classOf(2026, 150, { experience: 1, acquiredVia: 'draft', acquiredSeason: 2026 }),
      ...classOf(2025, 200, { experience: 2 }),
    ];
    expect(rookieClassYear(players, 2027)).toBe(2026);
    expect(players.filter(makeRookieTest(players, 2027))).toHaveLength(150);
  });

  it('a roster file with no rookies does not turn second-year players into rookies', () => {
    const players = classOf(2025, 200, { experience: 1 });
    expect(rookieClassYear(players, 2026)).toBeNull();
    expect(players.filter(makeRookieTest(players, 2026))).toHaveLength(0);
  });
});

describe('rookie awards across two real seasons', () => {
  beforeAll(async () => {
    stubRosterFetch();
    await st().newLeague('', '/rosters/FBGM_NFL_Roster_2026_Updated.json', 'regular', true);
  }, 600_000);

  const expectRookieAwards = (season: number) => {
    const s = st();
    expect(s.season).toBe(season);
    const awards = computeSeasonAwards(s);
    for (const key of ['Offensive ROY', 'Defensive ROY']) {
      const won = awards.find(a => a.award === key);
      expect(won, `${key} ${season}`).toBeTruthy();
      const winner = s.players.find(p => p.id === won!.playerId)!;
      expect(winner.draftYear === season || winner.experience === 0, `${key} ${season} winner is a rookie`).toBe(true);
    }
    const races = computeAwardRaces(s);
    expect(races.oroy.length).toBe(10);
    expect(races.droy.length).toBe(10);
    for (const e of [...races.oroy, ...races.droy]) {
      const p = s.players.find(x => x.id === e.playerId)!;
      expect(p.draftYear === season || p.experience === 0, `${p.firstName} ${p.lastName} is a rookie`).toBe(true);
    }
  };

  it('season one: the imported rookie class', () => {
    for (let g = 0; st().phase === 'regular' && g < 30; g++) st().simWeek();
    expectRookieAwards(2026);
  }, 600_000);

  it('season two: the class drafted in-game', () => {
    st().simAllPlayoffGames();
    st().advanceToResigning();
    st().advanceToFreeAgency();
    st().advanceToDraft();
    st().simToEndDraft({ skipAdvance: true });
    st().startNewSeason();
    for (let g = 0; st().phase === 'preseason' && g < 6; g++) st().simPreseasonWeek();
    for (let g = 0; st().phase === 'regular' && g < 30; g++) st().simWeek();
    expectRookieAwards(2027);
    // The season-one class is in year two now and must be out of the running.
    const s = st();
    const isRookie = makeRookieTest(s.players, s.season);
    const secondYear = s.players.filter(p => p.teamId && !p.retired && p.draftYear === 2026);
    expect(secondYear.length).toBeGreaterThan(100);
    expect(secondYear.some(isRookie)).toBe(false);
  }, 600_000);
});

describe('rookies in a league started in the offseason', () => {
  it('the class drafted before the first season counts, the class before it does not', async () => {
    stubRosterFetch();
    await st().newLeague('DAL', '/rosters/FBGM_NFL_Roster_2026_Updated.json', 'offseason', false);
    st().advanceToFreeAgency();
    st().advanceToDraft();
    st().simToEndDraft({ skipAdvance: true });
    st().startNewSeason();
    const s = st();
    const onTeam = s.players.filter(p => p.teamId && !p.retired);
    const isRookie = makeRookieTest(s.players, s.season);
    const firstYear = onTeam.filter(p => p.draftYear === s.season - 1);
    expect(firstYear.length).toBeGreaterThan(100);
    expect(firstYear.every(isRookie)).toBe(true);
    expect(onTeam.filter(p => p.draftYear === s.season - 2).some(isRookie)).toBe(false);
  }, 600_000);
});
