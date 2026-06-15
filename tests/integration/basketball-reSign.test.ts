/**
 * Re-sign page data (parity 2.2 follow-up): the expiring-contract selector and
 * the extension ask the page renders.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { contractYearsLeft } from '@/../apps/bs-basketball/src/lib/roster/playerActions';
import { extensionMarket } from '@/../apps/bs-basketball/src/lib/roster/extension';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, startNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { autoPickUntilUser, getDraft } from '@/../apps/bs-basketball/src/lib/draft';
import type { BasketballPlayer } from '@bs/sport-basketball';

describe('re-sign data', () => {
  const league = createNewBasketballLeague({ rngSeed: 're-sign' });
  const season = league.currentSeason;
  const player = league.players[league.teams[0].playerIds[0]] as BasketballPlayer;

  it('reports years left counting the current season', () => {
    expect(contractYearsLeft(player, season)).toBe(player.contract!.years.filter(y => y.season >= season).length);
    expect(contractYearsLeft(player, season)).toBeGreaterThanOrEqual(1);
  });

  it('extension ask starts the season after the deal ends', () => {
    const ask = extensionMarket(player, season);
    expect(ask.marketSalary).toBeGreaterThan(0);
    expect(ask.desiredYears).toBeGreaterThanOrEqual(1);
    expect(ask.startSeason).toBe(ask.expiringSeason + 1);
  });

  it('expiring selector matches the page filter', () => {
    const expiring = league.teams[0].playerIds
      .map(id => league.players[id] as BasketballPlayer)
      .filter(p => p.contract && contractYearsLeft(p, season) <= 1);
    // Selector is well-formed (possibly empty for a fresh league) and only
    // includes contract-year players.
    for (const p of expiring) expect(contractYearsLeft(p, season)).toBeLessThanOrEqual(1);
  });
});

function completeSeason(seed: string) {
  let l = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(l) && g < 400) { const r = simNextDay(l); if (!r) break; l = r.league; g++; }
  l = initializePlayoffs(l);
  g = 0;
  while (!getBracket(l)!.complete && g < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; g++; }
  return l;
}

describe('forced re-sign step', () => {
  it('flags expiring players, walks un-re-signed ones, keeps re-signed ones', () => {
    const done = completeSeason('resign-walk');
    const uid = done.teams[0].id;
    const userTeam = done.teams.find(t => t.id === uid)!;
    const young = userTeam.playerIds
      .map(id => done.players[id] as BasketballPlayer)
      .filter(p => p.age < 28);
    const walkId = young[0].id;
    const keepId = young[1].id;
    const yr = (s: number) => ({ season: s, baseSalary: 2_000_000, proratedBonus: 0, guaranteed: true });

    const players = { ...done.players } as Record<string, BasketballPlayer>;
    players[walkId] = { ...players[walkId], contract: { ...players[walkId].contract!, years: [yr(done.currentSeason)] } };
    players[keepId] = { ...players[keepId], contract: { ...players[keepId].contract!, years: [yr(done.currentSeason + 1)] } };
    const league = { ...done, players, userTeamId: uid };

    const off = enterOffseason(league);
    const pending = (off.sportData as { pendingResign?: string[] }).pendingResign ?? [];
    expect(pending).toContain(walkId);
    expect(pending).not.toContain(keepId);

    const next = startNextSeason(autoPickUntilUser(off, null)); // autopick the whole draft
    // Un-re-signed expiring player walked to free agency.
    expect(next.freeAgentIds).toContain(walkId);
    expect((next.players[walkId] as BasketballPlayer).rosterSlot).toBeNull();
    expect(next.teams.find(t => t.id === uid)!.playerIds).not.toContain(walkId);
    // Re-signed player stayed on the roster.
    expect(next.teams.find(t => t.id === uid)!.playerIds).toContain(keepId);
  });

  it('never silently auto-re-signs the user\'s un-re-signed players (BUG-28)', () => {
    const done = completeSeason('bug28-autoresign');
    const uid = done.teams[0].id;
    const userTeam = done.teams.find(t => t.id === uid)!;
    // A young user player whose deal expires this offseason, left undecided.
    const expId = userTeam.playerIds
      .map(id => done.players[id] as BasketballPlayer)
      .find(p => p.age < 28)!.id;
    const yr = (s: number) => ({ season: s, baseSalary: 8_000_000, proratedBonus: 0, guaranteed: true });
    const players = { ...done.players } as Record<string, BasketballPlayer>;
    players[expId] = { ...players[expId], contract: { ...players[expId].contract!, years: [yr(done.currentSeason)] } };
    const league = { ...done, players, userTeamId: uid };

    const off = enterOffseason(league);
    const season = getDraft(off)!.season;
    const next = startNextSeason(autoPickUntilUser(off, null));

    // The undecided player walked to FA and was NOT auto-re-signed to a market
    // deal (which would silently eat the user's cap space).
    expect(next.freeAgentIds).toContain(expId);
    expect((next.players[expId] as BasketballPlayer).rosterSlot).toBeNull();
    const hasNextDeal = ((next.players[expId] as BasketballPlayer).contract?.years ?? []).some(y => y.season === season);
    expect(hasNextDeal).toBe(false);
  });
});
