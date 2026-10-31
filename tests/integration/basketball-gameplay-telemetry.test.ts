/**
 * WI-3 — BS Hoops gameplay telemetry (league_created / team_picked /
 * day_simmed / season_completed / gm_fired) emitted from the league store.
 *
 * Drives the real Zustand store (Dexie on fake-indexeddb) through a full
 * season with the tracker mocked, and asserts every event fires exactly once
 * per real occurrence — including double-clicked sims and repeated / concurrent
 * Enter Offseason calls. `app` + `device_id` are stamped server-side by
 * createTrackHandler('bs-hoops'), so they're not asserted here.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn(), flushEvents: vi.fn() }));

import { trackEvent } from '@bs/core/analytics/track';
import { useLeagueStore } from '@/../apps/bs-basketball/src/lib/store/leagueStore';
import { getBracket } from '@/../apps/bs-basketball/src/lib/playoffs';
import {
  seasonCompletedProps,
  telemetryPlayoffResult,
} from '@/../apps/bs-basketball/src/lib/telemetry/gameplay';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

const tracked = vi.mocked(trackEvent);
const eventsNamed = (name: string) =>
  tracked.mock.calls.filter(c => c[0] === name).map(c => c[1] as Record<string, unknown>);
const store = () => useLeagueStore.getState();
const live = () => store().league as BasketballLeagueState;

const ROSTER_FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

// Enter Offseason fire-and-forgets the GM-board sync (POST /api/gm/sync);
// answer it locally instead of letting happy-dom hit localhost:3000.
const okFetch = vi.fn(async () => new Response('{}', { status: 200 }));

describe('BS Hoops gameplay telemetry', () => {
  /** The finished season (bracket complete) right before Enter Offseason. */
  let seasonDone: BasketballLeagueState;
  let userTeamId: TeamId;

  beforeAll(() => { vi.stubGlobal('fetch', okFetch); });
  afterAll(() => { vi.unstubAllGlobals(); });

  describe('league_created', () => {
    let rosterJson: string;
    beforeAll(() => { rosterJson = readFileSync(ROSTER_FILE, 'utf8'); });

    it('fires for a URL import with the roster file name (no cache-bust)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(rosterJson, { status: 200 })));
      try {
        expect(await store().importLeagueFromUrl('/rosters/BBGM_NBA_Roster_2026_Updated.json?v=20261029')).toBe(true);
      } finally {
        vi.stubGlobal('fetch', okFetch);
      }
      const created = eventsNamed('league_created');
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        source: 'import',
        roster_file: 'BBGM_NBA_Roster_2026_Updated.json',
        upload: false,
        season: live().currentSeason,
      });
      expect(['regular', 'preseason', 'offseason']).toContain(created[0].start_mode);
      expect(created[0]).not.toHaveProperty('app'); // stamped server-side
    });

    it('fires for a file upload', async () => {
      expect(await store().importLeagueFromData(JSON.parse(rosterJson))).toBe(true);
      const created = eventsNamed('league_created');
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ source: 'import', roster_file: null, upload: true });
    });

    it('fires once per generated league', async () => {
      await store().newLeague({ rngSeed: 'wi3-telemetry' });
      const created = eventsNamed('league_created');
      expect(created).toEqual([{ source: 'generated', roster_file: null, start_mode: 'preseason', season: 2026 }]);
    });
  });

  describe('team_picked', () => {
    it('fires on the pick, not on re-picking the same team', async () => {
      const team = live().teams[0] as BasketballTeam;
      userTeamId = team.id;
      await store().pickUserTeam(team.id);
      await store().pickUserTeam(team.id);
      expect(eventsNamed('team_picked')).toEqual([
        { team: team.abbreviation, season: 2026, phase: 'preseason', fired_takeover: false },
      ]);
    });
  });

  describe('day_simmed', () => {
    it('Sim Day → mode day, 1 day', async () => {
      const r = await store().simDay();
      expect(r).not.toBeNull();
      expect(eventsNamed('day_simmed')).toEqual([
        { mode: 'day', days: 1, games: r!.gamesSimmed, season: 2026, seasons_completed: 0, spectator: false },
      ]);
    });

    it('a double-clicked Sim Day (concurrent calls, one snapshot) reports once', async () => {
      const [a, b] = await Promise.all([store().simDay(), store().simDay()]);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(eventsNamed('day_simmed')).toHaveLength(1);
    });

    it('Sim Next Game → mode next_game', async () => {
      expect(await store().simNextUserGame()).not.toBeNull();
      expect(eventsNamed('day_simmed')).toEqual([expect.objectContaining({ mode: 'next_game', days: 1, games: 1 })]);
    });

    it('Watch Live → mode watch_game with the days it simmed', async () => {
      expect(await store().watchNextUserGame()).not.toBeNull();
      const ev = eventsNamed('day_simmed');
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ mode: 'watch_game', spectator: false });
      expect(ev[0].days as number).toBeGreaterThanOrEqual(1);
    });

    it('Sim Week → mode week with the real day count', async () => {
      const r = await store().simRange('week');
      expect(r).not.toBeNull();
      expect(eventsNamed('day_simmed')).toEqual([
        expect.objectContaining({ mode: 'week', days: r!.daysSimmed, games: r!.gamesSimmed }),
      ]);
    });

    it('Sim Season → mode season; playoff sims send no day_simmed / season_completed', async () => {
      const r = await store().simRange('season');
      expect(r).not.toBeNull();
      expect(eventsNamed('day_simmed')).toEqual([
        expect.objectContaining({ mode: 'season', days: r!.daysSimmed }),
      ]);

      tracked.mockClear();
      expect(await store().startPlayoffs()).toBe(true);
      expect(await store().simPlayoffRound()).not.toBeNull();
      expect(await store().simAllPlayoffs()).not.toBeNull();
      expect(getBracket(live())?.complete).toBe(true);
      expect(eventsNamed('day_simmed')).toHaveLength(0);
      expect(eventsNamed('season_completed')).toHaveLength(0);
      seasonDone = live();
    });
  });

  describe('playoff_result vocabulary', () => {
    it('maps the bracket depth of every team onto the shared vocabulary', () => {
      const counts: Record<string, number> = {};
      for (const t of seasonDone.teams) {
        const r = telemetryPlayoffResult(seasonDone, t.id);
        counts[r] = (counts[r] ?? 0) + 1;
      }
      expect(counts).toEqual({
        champion: 1, runnerup: 1, conference: 2, semis: 4, firstround: 8,
        missed: seasonDone.teams.length - 16, // incl. the 4 play-in losers
      });
    });
  });

  describe('season_completed (choke point: enterOffseason)', () => {
    it('fires once across concurrent + repeated Enter Offseason calls', async () => {
      const team = seasonDone.teams.find(t => t.id === userTeamId)!;
      const expected = {
        season: 2026,
        seasons_completed: 1,
        wins: team.record.wins,
        losses: team.record.losses,
        playoff_result: telemetryPlayoffResult(seasonDone, userTeamId),
        play_in: expect.any(Boolean),
        spectator: false,
      };

      const [a, b] = await Promise.all([store().enterOffseason(), store().enterOffseason()]);
      expect(a && b).toBe(true);
      expect(await store().enterOffseason()).toBe(true); // already in the offseason → early return
      expect(await store().simAllPlayoffs()).toBeNull(); // bracket's done; nothing to sim
      expect(eventsNamed('season_completed')).toEqual([expected]);
      // A GM in their first season is inside the firing grace window.
      expect(eventsNamed('gm_fired')).toHaveLength(0);
    });

    it('is null once the season is in history (never re-reported)', () => {
      expect(seasonCompletedProps(live())).toBeNull();
    });

    it('reports a spectator season as spectator with no record', () => {
      const props = seasonCompletedProps({ ...seasonDone, userTeamId: null });
      expect(props).toMatchObject({ spectator: true, wins: null, losses: null, playoff_result: null, seasons_completed: 1 });
    });
  });

  describe('gm_fired', () => {
    it('fires once per firing, even when Enter Offseason is hit again', async () => {
      // Hand the GM the worst team, past the grace window, already on a final
      // warning with zero owner approval → this season's swing fires them.
      const worst = [...seasonDone.teams].sort((a, b) => a.record.wins - b.record.wins)[0];
      const doomed: BasketballLeagueState = {
        ...seasonDone,
        userTeamId: worst.id,
        teams: seasonDone.teams.map(t => (t.id === worst.id ? { ...t, approval: { ...t.approval, ownerApproval: 0 } } : t)),
        sportData: {
          ...(seasonDone.sportData as Record<string, unknown>),
          gmTenureStartSeason: seasonDone.currentSeason - 10,
          gmConsecutiveBadSeasons: 5,
        },
      };
      useLeagueStore.setState({ league: doomed });

      const [a, b] = await Promise.all([store().enterOffseason(), store().enterOffseason()]);
      expect(a && b).toBe(true);
      expect(await store().enterOffseason()).toBe(true);
      expect(live().userTeamId).toBeNull();

      expect(eventsNamed('gm_fired')).toEqual([
        { season: 2026, seasons_completed: 1, team: worst.abbreviation },
      ]);
      expect(eventsNamed('season_completed')).toEqual([
        expect.objectContaining({ season: 2026, seasons_completed: 1, playoff_result: 'missed', spectator: false }),
      ]);
    });

    it('taking the next job is a fired_takeover pick', async () => {
      const firedBy = (live().sportData as { gmFired?: { teamId: TeamId } }).gmFired?.teamId;
      expect(firedBy).toBeDefined();
      const next = live().teams.find(t => t.id !== firedBy)!;
      await store().pickUserTeam(next.id);
      expect(eventsNamed('team_picked')).toEqual([
        expect.objectContaining({ team: next.abbreviation, fired_takeover: true }),
      ]);
    });
  });
});
