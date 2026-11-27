/**
 * Letting an expiring player walk during re-signing must never lower cap space.
 *
 * The re-sign window shows NEXT season's cap space: the user's totalPayroll
 * leaves out every player still waiting on a decision, because his deal ended
 * with the season just played. The bugs:
 *  - "Let Walk" subtracted his salary from that payroll a second time, so the
 *    top bar's cap space rose with every walk and then fell back down (by the
 *    sum of every walked salary) when Free Agency recalculated payroll.
 *  - advanceToResigning also took practice-squad and IR players' salaries out
 *    of a payroll that had never held them, and the Re-signing page added them
 *    back on top of its own cap space, so walking one of them LOWERED the
 *    page's "Projected Cap Space" by his salary.
 *  - Releasing a queued player (e.g. from his player card opened on the
 *    Re-signing page) went through the mid-contract cut path and charged dead
 *    money for a contract that had already ended.
 *
 * What must hold: walking (single, "Let All Walk", or releasing a queued
 * player) leaves next-season cap space unchanged, writes no dead cap, and the
 * number carries into Free Agency as-is. Re-signing and tagging count the full
 * new salary. A real cut (years left on the deal) still charges dead money.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { useGameStore, recalculateTeamPayroll, resigningPhasePayroll } from '@/lib/engine/store';
import { defaultApproval } from '@/lib/engine/approval';
import { calculateDeadCapV2, generateGuaranteed, getCapHit, type Player, type Team } from '@/types';

const g = () => useGameStore.getState();
const r1 = (n: number) => Math.round(n * 10) / 10;

function userTeam(): Team {
  const s = g();
  return s.teams.find(t => t.id === s.userTeamId)!;
}
/** The top bar's number (cap − stored payroll). */
function topBarCapSpace(): number {
  const t = userTeam();
  return r1(t.salaryCap - t.totalPayroll);
}
/** The Re-signing page's "Projected Cap Space" (recomputed from contracts). */
function resignPageCapSpace(): number {
  const s = g();
  const t = userTeam();
  return r1(t.salaryCap - resigningPhasePayroll(t, s.players, s.resigningPlayers.map(e => e.playerId)));
}
/** Cap space against the full current payroll, pending deals included. */
function fullPayrollCapSpace(): number {
  return r1(userTeam().salaryCap - recalculateTeamPayroll(userTeam(), g().players));
}
const deadCap = () => userTeam().deadCap ?? [];
const player = (id: string) => g().players.find(p => p.id === id)!;

interface Cast {
  walker: Player;   // active roster, expiring, $10M
  second: Player;   // active roster, expiring, $6M
  psGuy: Player;    // practice squad, expiring, $0.9M
  irGuy: Player;    // injured reserve, expiring, $1.6M
  vet: Player;      // active roster, $12M with 3 years left
}

/**
 * A generated league at the end of the season with a known cast on the user
 * team, then advanced into the re-signing window. Everyone else on the user
 * team has 3 years left (so only the cast's expiring deals are queued) and is
 * young enough not to retire.
 */
async function reSignWindow(): Promise<Cast> {
  await g().newLeague('');
  const s = g();
  const uid = s.userTeamId;
  const ut = s.teams.find(t => t.id === uid)!;
  const rosterPlayers = ut.roster.map(id => s.players.find(p => p.id === id)!).filter(p => !p.retired);
  const [walker, second, psGuy, irGuy, vet] = rosterPlayers;

  const deal = (salary: number, yearsLeft: number) => ({
    salary, yearsLeft, totalYears: yearsLeft, guaranteed: generateGuaranteed(salary, yearsLeft),
  });
  const contracts = new Map([
    [walker.id, deal(10, 1)],
    [second.id, deal(6, 1)],
    [psGuy.id, deal(0.9, 1)],
    [irGuy.id, deal(1.6, 1)],
    [vet.id, deal(12, 3)],
  ]);

  const players = s.players.map(p => {
    if (p.teamId !== uid) return p;
    return {
      ...p,
      age: 26,
      retired: false,
      onIR: p.id === irGuy.id,
      contract: contracts.get(p.id) ?? deal(p.contract.salary, 3),
    };
  });
  const teams = s.teams.map(t => {
    if (t.id !== uid) return t;
    const moved = new Set([psGuy.id, irGuy.id]);
    const team: Team = {
      ...t,
      roster: t.roster.filter(id => !moved.has(id)),
      depthChart: Object.fromEntries(
        Object.entries(t.depthChart).map(([pos, ids]) => [pos, ids.filter(id => !moved.has(id))]),
      ) as Team['depthChart'],
      practiceSquad: [...(t.practiceSquad ?? []).filter(id => id !== psGuy.id), psGuy.id],
      injuredReserve: [...(t.injuredReserve ?? []).filter(id => id !== irGuy.id), irGuy.id],
      deadCap: [],
      franchiseTagUsed: false,
      approval: { ...defaultApproval(), ownerApproval: 80 },
    };
    return { ...team, totalPayroll: recalculateTeamPayroll(team, players) };
  });
  useGameStore.setState({ players, teams, phase: 'playoffs', seasonHistory: [], firedState: null });

  g().advanceToResigning();
  expect(g().phase).toBe('resigning');
  const queued = g().resigningPlayers.map(e => e.playerId).sort();
  expect(queued).toEqual([walker.id, second.id, psGuy.id, irGuy.id].sort());
  return { walker: player(walker.id), second: player(second.id), psGuy: player(psGuy.id), irGuy: player(irGuy.id), vet: player(vet.id) };
}

describe('re-signing: letting an expiring player walk', () => {
  let cast: Cast;
  beforeEach(async () => { cast = await reSignWindow(); });

  it('opens the window with only active-roster expiring deals left off the payroll', () => {
    // Practice squad and IR never counted toward the cap, so the top bar and
    // the Re-signing page agree with "every carried-over deal + dead cap".
    const t = userTeam();
    const pending = new Set(g().resigningPlayers.map(e => e.playerId));
    const committed = t.roster
      .filter(id => !pending.has(id))
      .reduce((sum, id) => sum + getCapHit(player(id).contract), 0);
    expect(t.totalPayroll).toBeCloseTo(committed, 1);
    expect(topBarCapSpace()).toBe(resignPageCapSpace());
  });

  it('a roster player walking leaves cap space unchanged, frees his cap hit from the full payroll, and writes no dead cap', () => {
    const before = { topBar: topBarCapSpace(), page: resignPageCapSpace(), full: fullPayrollCapSpace() };

    g().passOnResigning(cast.walker.id);

    expect(topBarCapSpace()).toBe(before.topBar);
    expect(resignPageCapSpace()).toBe(before.page);
    // Against the full current payroll his $10M comes off the books.
    expect(fullPayrollCapSpace()).toBe(r1(before.full + getCapHit(cast.walker.contract)));
    expect(deadCap()).toEqual([]);

    const walked = player(cast.walker.id);
    expect(walked.teamId).toBeNull();
    expect(g().freeAgents).toContain(walked.id);
    expect(userTeam().roster).not.toContain(walked.id);
    expect(g().resigningPlayers.some(e => e.playerId === walked.id)).toBe(false);
  });

  it('practice-squad and IR players walking do not lower cap space either', () => {
    const before = { topBar: topBarCapSpace(), page: resignPageCapSpace() };

    g().passOnResigning(cast.psGuy.id);
    expect(topBarCapSpace()).toBe(before.topBar);
    expect(resignPageCapSpace()).toBe(before.page);

    g().passOnResigning(cast.irGuy.id);
    expect(topBarCapSpace()).toBe(before.topBar);
    expect(resignPageCapSpace()).toBe(before.page);

    expect(deadCap()).toEqual([]);
    expect(userTeam().practiceSquad ?? []).not.toContain(cast.psGuy.id);
    expect(userTeam().injuredReserve ?? []).not.toContain(cast.irGuy.id);
    expect(player(cast.irGuy.id).onIR).toBe(false);
  });

  it('"Let All Walk" is cap-neutral, and the number carries into Free Agency unchanged', () => {
    const before = topBarCapSpace();

    g().passOnResigningBatch(g().resigningPlayers.map(e => e.playerId));
    expect(topBarCapSpace()).toBe(before);
    expect(resignPageCapSpace()).toBe(before);
    expect(deadCap()).toEqual([]);

    g().advanceToFreeAgency();
    expect(g().phase).toBe('freeAgency');
    expect(topBarCapSpace()).toBe(before);
  });

  it('a player left undecided (e.g. after a rejected offer) stays off next season and leaves at Free Agency at no cost', () => {
    const before = topBarCapSpace();
    g().passOnResigning(cast.walker.id);
    // cast.second, psGuy and irGuy stay queued: advancing releases them.
    g().advanceToFreeAgency();
    expect(topBarCapSpace()).toBe(before);
    expect(player(cast.second.id).teamId).toBeNull();
    expect(deadCap()).toEqual([]);
  });

  it('releasing a queued player (player card, Finances) is a walk: no dead money', () => {
    const before = topBarCapSpace();
    // Pre-fix this charged generateGuaranteed($10M, 1 yr) as dead cap.
    expect(calculateDeadCapV2(cast.walker.contract)).toBeGreaterThan(0);

    g().releasePlayer(cast.walker.id);

    expect(deadCap()).toEqual([]);
    expect(topBarCapSpace()).toBe(before);
    expect(player(cast.walker.id).teamId).toBeNull();
    expect(g().resigningPlayers.some(e => e.playerId === cast.walker.id)).toBe(false);

    g().advanceToFreeAgency();
    expect(topBarCapSpace()).toBe(before);
  });
});

describe('re-signing: committing money still lowers cap space by the full amount', () => {
  let cast: Cast;
  beforeEach(async () => { cast = await reSignWindow(); });

  it('re-signing counts the new salary, and Free Agency agrees', () => {
    const before = topBarCapSpace();
    expect(g().resignPlayer(cast.walker.id, 11, 3)).toBe(true);
    expect(topBarCapSpace()).toBe(r1(before - 11));
    expect(resignPageCapSpace()).toBe(r1(before - 11));

    g().passOnResigningBatch(g().resigningPlayers.map(e => e.playerId));
    expect(topBarCapSpace()).toBe(r1(before - 11));
    g().advanceToFreeAgency();
    expect(topBarCapSpace()).toBe(r1(before - 11));
  });

  it('the franchise tag counts the whole tag salary, not tag − old salary', () => {
    const before = topBarCapSpace();
    expect(g().franchiseTagPlayer(cast.walker.id)).toBe(true);
    const tag = player(cast.walker.id).contract.salary;
    expect(topBarCapSpace()).toBe(r1(before - tag));
    expect(resignPageCapSpace()).toBe(r1(before - tag));

    g().passOnResigningBatch(g().resigningPlayers.map(e => e.playerId));
    g().advanceToFreeAgency();
    // Pre-fix the top bar read $10M (his old salary) too high until here.
    expect(topBarCapSpace()).toBe(r1(before - tag));
  });
});

describe('real dead money still applies', () => {
  it('cutting a player with years left during re-signing charges dead cap', async () => {
    const { vet } = await reSignWindow();
    const before = topBarCapSpace();
    const expectedDead = r1(calculateDeadCapV2(vet.contract));
    expect(expectedDead).toBeGreaterThan(0);

    g().releasePlayer(vet.id);

    const entries = deadCap();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ amount: expectedDead, source: 'release' });
    expect(topBarCapSpace()).toBe(r1(before + getCapHit(vet.contract) - expectedDead));

    g().passOnResigningBatch(g().resigningPlayers.map(e => e.playerId));
    g().advanceToFreeAgency();
    expect(topBarCapSpace()).toBe(r1(before + getCapHit(vet.contract) - expectedDead));
  });

  it('cutting a player mid-contract in the regular season charges dead cap as before', async () => {
    await g().newLeague('');
    const s = g();
    const t = userTeam();
    const cutId = t.roster[0];
    const contract = { salary: 12, yearsLeft: 3, totalYears: 3, guaranteed: generateGuaranteed(12, 3) };
    const players = s.players.map(p => p.id === cutId ? { ...p, contract } : p);
    useGameStore.setState({
      players,
      phase: 'regular',
      week: 3,
      teams: s.teams.map(x => x.id === t.id
        ? { ...x, deadCap: [], totalPayroll: recalculateTeamPayroll({ ...x, deadCap: [] }, players) }
        : x),
    });
    const before = topBarCapSpace();
    const expectedDead = r1(calculateDeadCapV2(contract));

    g().releasePlayer(cutId);

    expect(deadCap()).toEqual([expect.objectContaining({ amount: expectedDead, source: 'release' })]);
    expect(topBarCapSpace()).toBe(r1(before + 12 - expectedDead));
  });
});
