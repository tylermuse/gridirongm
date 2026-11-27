/**
 * Re-sign window "Let Walk" must cost $0 (BS Hoops).
 *
 * Let Walk / Let All Walk used to go through the mid-contract cut path
 * (applyRelease), which charges dead cap for every guaranteed year from the
 * current season on. An expiring player's final year IS the current season, so
 * walking him wrote a dead-cap entry for a contract that was ending:
 *   - normal offseason: dead money for the season he'd just played out (shown
 *     on Finances), even though not re-signing him at all walks him for free;
 * Walking now leaves at $0 and never lowers projected cap space; real cuts
 * (years past the current season, in-season, or a one-year player in an
 * inaugural import's first offseason, whose deal still covers the season being
 * priced) still charge dead money.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { upcomingSeason } from '@/../apps/bs-basketball/src/lib/draft';
import { capRoom } from '@/../apps/bs-basketball/src/lib/freeAgency';
import { resignProjection } from '@/../apps/bs-basketball/src/lib/roster/resignProjection';
import { applyRelease, applyWalk, releasePreview } from '@/../apps/bs-basketball/src/lib/roster/release';
import { teamDeadCapEntries } from '@/../apps/bs-basketball/src/lib/roster/deadCap';
import { teamFinances } from '@/../apps/bs-basketball/src/lib/finances/finances';
import { useLeagueStore } from '@/../apps/bs-basketball/src/lib/store/leagueStore';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

type L = ReturnType<typeof createNewBasketballLeague>;
const userTeam = (l: L) => l.teams.find(t => t.id === l.userTeamId) as BasketballTeam;
const player = (l: L, id: string) => l.players[id as keyof typeof l.players] as BasketballPlayer;
const deadCap = (l: L) => teamDeadCapEntries(userTeam(l));
const space = (l: L) => resignProjection(l, userTeam(l), {}).projectedSpace;
const salaryIn = (p: BasketballPlayer, season: number) =>
  (p.contract?.years ?? []).filter(y => y.season === season).reduce((s, y) => s + y.baseSalary + y.proratedBonus, 0);

function completeSeason(seed: string): L {
  let l = createNewBasketballLeague({ rngSeed: seed });
  l = { ...l, userTeamId: l.teams[0].id };
  let g = 0;
  while (!isRegularSeasonComplete(l) && g++ < 400) { const r = simNextDay(l); if (!r) break; l = r.league; }
  l = initializePlayoffs(l); g = 0;
  while (!getBracket(l)!.complete && g++ < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; }
  return l;
}

/** Walked to FA: off the roster, in the pool. */
function expectWalked(l: L, id: string) {
  expect(userTeam(l).playerIds).not.toContain(id);
  expect(player(l, id).rosterSlot).toBeNull();
  expect(l.freeAgentIds).toContain(id);
}

describe('Let Walk in a normal offseason re-sign window', () => {
  let off: L;
  let pending: string[];

  beforeAll(() => {
    off = enterOffseason(completeSeason('resign-walk-cap'));
    pending = (off.sportData as { pendingResign?: string[] }).pendingResign ?? [];
    // Re-sign window: cap figures are next season's.
    expect(upcomingSeason(off)).toBe(off.currentSeason + 1);
    expect(pending.length).toBeGreaterThan(0);
    expect(deadCap(off)).toEqual([]);
  }, 60_000);

  it('a walked expiring player leaves no dead cap and never lowers cap space', () => {
    const id = pending[0];
    const p = player(off, id);
    // His deal ends this season and is guaranteed, so a cut WOULD charge it.
    expect(p.contract!.years.every(y => y.season <= off.currentSeason)).toBe(true);
    expect(releasePreview(p, off.currentSeason).remainingGuaranteed).toBeGreaterThan(0);

    const after = applyWalk(off, id);
    expectWalked(after, id);
    expect(deadCap(after)).toEqual([]);
    expect(teamFinances(after, userTeam(after)).expenses.deadCap).toBe(0);
    expect(space(after)).toBeGreaterThanOrEqual(space(off));
    expect(capRoom(after, after.userTeamId!)).toBeGreaterThanOrEqual(capRoom(off, off.userTeamId!));
  });

  it('store walkPlayer + releasePlayersBulk (Let Walk / Let All Walk) write no dead cap', async () => {
    const store = () => useLeagueStore.getState();
    const live = () => store().league as unknown as L;

    useLeagueStore.setState({ league: off as unknown as BasketballLeagueState });
    expect(await store().walkPlayer(pending[0])).toBe(true);
    expectWalked(live(), pending[0]);
    expect(deadCap(live())).toEqual([]);

    useLeagueStore.setState({ league: off as unknown as BasketballLeagueState });
    expect(await store().releasePlayersBulk(pending)).toBe(pending.length);
    for (const id of pending) expectWalked(live(), id);
    expect(deadCap(live())).toEqual([]);
    expect(space(live())).toBeGreaterThanOrEqual(space(off));
  });

  it('a mid-contract cut still charges every remaining guaranteed year (walk path too)', () => {
    const season = off.currentSeason;
    const id = userTeam(off).playerIds.find(pid =>
      (player(off, pid).contract?.years ?? []).some(y => y.season > season && y.guaranteed))!;
    expect(id).toBeTruthy();
    const p = player(off, id);
    const owed = p.contract!.years
      .filter(y => y.season >= season && y.guaranteed)
      .map(y => ({ season: y.season, amount: y.baseSalary + y.proratedBonus }));

    const cut = applyRelease(off, id, false);
    expect(deadCap(cut)).toEqual(owed);
    // His next-season money stays on the books as dead cap, so cutting him frees nothing.
    expect(space(cut)).toBe(space(off));

    // Routing a non-expiring player through the walk path is still a real cut.
    expect(deadCap(applyWalk(off, id))).toEqual(owed);
  });
});

describe('Let Walk in an inaugural (imported) re-sign window', () => {
  // Imported rosters are signed for the current season and the inaugural re-sign
  // window prices that season (upcomingSeason === currentSeason).
  const base = createNewBasketballLeague({ rngSeed: 'resign-walk-inaugural' });
  const t0 = base.teams[0];
  const walkerId = t0.playerIds[0];
  const walker = player(base, walkerId);
  const salary = walker.contract!.years[0].baseSalary;
  const league: L = {
    ...base,
    userTeamId: t0.id,
    currentPhase: 'offseason',
    players: {
      ...base.players,
      // An imported 1-year-left (expiring) deal.
      [walkerId]: {
        ...walker,
        contract: { ...walker.contract!, years: [{ season: base.currentSeason, baseSalary: salary, proratedBonus: 0, guaranteed: true }] },
      },
    },
    sportData: {
      ...(base.sportData as object),
      draft: { season: base.currentSeason, picks: [], poolIds: [], currentPick: 0, complete: true, lotteryRevealed: true, inaugural: true },
    },
  } as L;

  it('his deal still covers the season being priced, so walking him is a real cut: dead cap, cap space unchanged', () => {
    expect(upcomingSeason(league)).toBe(league.currentSeason);
    const after = applyWalk(league, walkerId);
    expectWalked(after, walkerId);
    expect(deadCap(after)).toEqual([{ season: league.currentSeason, amount: salary }]);
    expect(space(after)).toBe(space(league)); // never lower
  });

  it('a mid-contract cut still charges dead money', () => {
    const season = league.currentSeason;
    const id = userTeam(league).playerIds.find(pid =>
      (player(league, pid).contract?.years ?? []).some(y => y.season > season && y.guaranteed))!;
    expect(id).toBeTruthy();
    const after = applyWalk(league, id);
    expect(deadCap(after).length).toBeGreaterThan(0);
    expect(deadCap(after)).toContainEqual({ season, amount: salaryIn(player(league, id), season) });
    expect(space(after)).toBe(space(league)); // salary swapped for dead cap
  });
});

describe('walk path outside the offseason', () => {
  it('an expiring player cut in-season is still owed his final year', () => {
    const base = createNewBasketballLeague({ rngSeed: 'resign-walk-inseason' });
    const t0 = base.teams[0];
    const id = t0.playerIds.find(pid => (player(base, pid).contract?.years.length ?? 0) === 1)
      ?? t0.playerIds[0];
    const p = player(base, id);
    const sal = p.contract!.years[0].baseSalary;
    const league: L = {
      ...base,
      userTeamId: t0.id,
      currentPhase: 'regular_season',
      players: {
        ...base.players,
        [id]: { ...p, contract: { ...p.contract!, years: [{ season: base.currentSeason, baseSalary: sal, proratedBonus: 0, guaranteed: true }] } },
      },
    } as L;
    expect(deadCap(applyWalk(league, id))).toEqual([{ season: base.currentSeason, amount: sal }]);
  });
});
