/**
 * Phase 2D-3 — Season rollover integration tests.
 *
 * Drives a full season → playoffs → offseason rollover and asserts the next
 * season is legal and immediately playable: rosters refilled, players aged,
 * schedule regenerated, standings reset, bracket cleared, champion recorded.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import {
  advanceToNextSeason,
  canAdvanceSeason,
} from '@/../apps/bs-basketball/src/lib/season';
import type { BasketballPlayer } from '@bs/sport-basketball';

function playFullRegularSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let guard = 0;
  while (!isRegularSeasonComplete(league) && guard < 400) {
    const r = simNextDay(league);
    if (!r) break;
    league = r.league;
    guard++;
  }
  return league;
}

function completeSeason(seed: string) {
  let l = initializePlayoffs(playFullRegularSeason(seed));
  let guard = 0;
  while (!getBracket(l)!.complete && guard < 200) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
    guard++;
  }
  return l;
}

describe('season rollover', () => {
  it('is gated on a completed playoff', () => {
    const reg = playFullRegularSeason('rollover-gate');
    expect(canAdvanceSeason(reg)).toBe(false);
    const done = completeSeason('rollover-gate2');
    expect(canAdvanceSeason(done)).toBe(true);
  });

  it('rolls into a fresh, legal, playable next season', () => {
    const done = completeSeason('rollover-main');
    const championId = getBracket(done)!.championTeamId;
    const prevSeason = done.currentSeason;

    const next = advanceToNextSeason(done);

    // Calendar advanced and reset.
    expect(next.currentSeason).toBe(prevSeason + 1);
    expect(next.currentTick).toBe(1);
    expect(getBracket(next)).toBeNull();
    expect(next.seasonHistory[prevSeason]).toEqual({ champion: championId });

    // Standings wiped.
    for (const t of next.teams) {
      expect(t.record.wins).toBe(0);
      expect(t.record.losses).toBe(0);
      expect(t.record.pointsFor).toBe(0);
    }

    // Every team has a legal roster, and every rostered id resolves to a player.
    for (const t of next.teams) {
      expect(t.playerIds.length).toBeGreaterThanOrEqual(13);
      expect(t.playerIds.length).toBeLessThanOrEqual(15);
      for (const pid of t.playerIds) {
        expect(next.players[pid]).toBeTruthy();
        expect((next.players[pid] as BasketballPlayer).rosterSlot?.teamId).toBe(t.id);
      }
    }

    // Fresh full schedule, nothing played yet.
    expect(next.games.length).toBe(1230);
    expect(next.games.every(g => g.status === 'scheduled')).toBe(true);

    // Rookies were added (age-19 prospects from the new draft class).
    const rookies = Object.values(next.players).filter(p => (p as BasketballPlayer).age === 19);
    expect(rookies.length).toBeGreaterThan(0);

    // Free agents exist (unsigned prospects).
    expect(next.freeAgentIds.length).toBeGreaterThan(0);
    for (const id of next.freeAgentIds) {
      expect((next.players[id] as BasketballPlayer).rosterSlot).toBeNull();
    }
  });

  it('ages returning players by one year', () => {
    const done = completeSeason('rollover-age');
    // Pick a rostered player who should survive to next season.
    const survivor = done.teams[0].playerIds
      .map(id => done.players[id] as BasketballPlayer)
      .find(p => p.age < 30)!;
    const next = advanceToNextSeason(done);
    const after = next.players[survivor.id] as BasketballPlayer | undefined;
    // Survivor (young) should still exist and be exactly one year older.
    expect(after).toBeTruthy();
    expect(after!.age).toBe(survivor.age + 1);
  });

  it('produces a next season that can actually be simmed', () => {
    const next = advanceToNextSeason(completeSeason('rollover-playable'));
    const r = simNextDay(next);
    expect(r).not.toBeNull();
    expect(r!.gamesSimmed).toBeGreaterThan(0);
    // The very first scheduled day is day 1 (1-indexed schedule).
    expect(r!.day).toBe(1);
  });
});
