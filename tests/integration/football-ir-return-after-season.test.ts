/**
 * Injured reserve ends with the season.
 *
 * Season rollover cleared every player's `onIR` flag but left his id in
 * `team.injuredReserve` and out of `team.roster`. From then on he was on the
 * team by `teamId` only: the Roster page listed him as a healthy active player,
 * while Free Agency's position breakdown, the roster count, the depth chart and
 * payroll (all read from `team.roster`) left him out. Reported 11/28: three
 * tight ends on the Roster page, "TE 2/3" in the Free Agency sidebar.
 *
 * What must hold: after a rollover nobody is left on IR, every player who was
 * on IR is back on the active roster and depth chart, and the two ways of
 * counting a team's players (by teamId, by team.roster + practice squad) agree.
 * Saves already in the broken state are repaired when they load.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { useGameStore } from '@/lib/engine/store';
import { getActiveRoster, returnInjuredReserveToRoster } from '@/lib/engine/roster';
import { getCapHit, type Player, type Team } from '@/types';

const g = () => useGameStore.getState();
const userTeam = (): Team => g().teams.find(t => t.id === g().userTeamId)!;

/** Put `ids` on the user team's IR the way placeOnIR leaves them. */
function parkOnIR(ids: string[], flag: boolean) {
  const s = g();
  const set = new Set(ids);
  const salary = s.players.filter(p => set.has(p.id)).reduce((sum, p) => sum + p.contract.salary, 0);
  useGameStore.setState({
    players: s.players.map(p => (set.has(p.id) ? { ...p, onIR: flag, contract: { ...p.contract, yearsLeft: 3 }, age: 25 } : p)),
    teams: s.teams.map(t => {
      if (t.id !== s.userTeamId) return t;
      return {
        ...t,
        roster: t.roster.filter(id => !set.has(id)),
        injuredReserve: [...(t.injuredReserve ?? []), ...ids],
        depthChart: Object.fromEntries(
          Object.entries(t.depthChart).map(([pos, list]) => [pos, list.filter(id => !set.has(id))]),
        ) as Team['depthChart'],
        totalPayroll: t.totalPayroll - salary,
      };
    }),
  });
}

describe('injured reserve after the season', () => {
  it('rollover returns IR players to the active roster and depth chart', async () => {
    await g().newLeague('');
    const te = userTeam().roster.map(id => g().players.find(p => p.id === id)!).filter(p => p.position === 'TE');
    expect(te.length).toBeGreaterThan(0);
    const ir = te[0];
    const teBefore = te.length;
    parkOnIR([ir.id], true);
    expect(getActiveRoster(userTeam(), g().players).filter(p => p.position === 'TE')).toHaveLength(teBefore - 1);

    g().advanceToFreeAgency();
    g().advanceToDraft();
    g().simToEndDraft({ skipAdvance: true });
    // Still parked on IR through the offseason, until the rollover.
    expect(userTeam().injuredReserve).toContain(ir.id);
    g().startNewSeason();

    const t = userTeam();
    const players = g().players;
    const back = players.find(p => p.id === ir.id)!;
    expect(back.onIR).toBe(false);
    expect(back.teamId).toBe(t.id);
    expect(t.injuredReserve ?? []).toEqual([]);
    expect(t.roster).toContain(ir.id);
    expect(t.depthChart.TE).toContain(ir.id);
    // The Free Agency sidebar count (team.roster) matches the Roster page (teamId).
    const ps = new Set(t.practiceSquad ?? []);
    const byTeamId = players.filter(p => p.teamId === t.id && !p.retired && !ps.has(p.id));
    expect(getActiveRoster(t, players).map(p => p.id).sort()).toEqual(byTeamId.map(p => p.id).sort());
  });

  it('repairs a save whose IR players were stranded by an earlier rollover', async () => {
    await g().newLeague('');
    const roster = userTeam().roster.map(id => g().players.find(p => p.id === id)!);
    const [stranded, realIR, traded, ...rest] = roster;
    parkOnIR([stranded.id], false);  // flag cleared by the old rollover, never moved back
    parkOnIR([realIR.id], true);     // really on IR this season
    parkOnIR([traded.id], false);    // went on IR, then left the team
    const other = g().teams.find(t => t.id !== g().userTeamId)!;
    useGameStore.setState({
      players: g().players.map(p => (p.id === traded.id ? { ...p, teamId: other.id } : p)),
    });
    const before = userTeam();

    const migrate = (useGameStore as unknown as {
      persist: { getOptions: () => { migrate: (s: unknown, v: number) => unknown } };
    }).persist.getOptions().migrate;
    const out = migrate({ teams: g().teams, players: g().players }, 37) as { teams: Team[]; players: Player[] };
    const t = out.teams.find(x => x.id === before.id)!;

    expect(t.roster).toContain(stranded.id);
    expect(t.depthChart[stranded.position]).toContain(stranded.id);
    expect(t.injuredReserve).toEqual([realIR.id]);
    expect(t.roster).not.toContain(realIR.id);
    expect(t.roster).not.toContain(traded.id);
    expect(t.roster).toHaveLength(rest.length + 1);
    expect(t.totalPayroll).toBeCloseTo(before.totalPayroll + getCapHit(stranded.contract), 1);
    // Teams with nothing on IR are untouched.
    expect(out.teams.find(x => x.id === other.id)).toBe(g().teams.find(x => x.id === other.id));
  });

  it('is a no-op for a team with no IR list, and never double-lists a player', () => {
    const p = { id: 'a', teamId: 't', position: 'TE', retired: false, onIR: false, ratings: { overall: 60 }, contract: { salary: 1, yearsLeft: 2 } } as unknown as Player;
    const base = { id: 't', roster: ['a'], practiceSquad: [], depthChart: { TE: ['a'] }, totalPayroll: 1 } as unknown as Team;
    expect(returnInjuredReserveToRoster(base, [p]).team).toBe(base);
    const dup = returnInjuredReserveToRoster({ ...base, injuredReserve: ['a'] }, [p]).team;
    expect(dup.roster).toEqual(['a']);
    expect(dup.injuredReserve).toEqual([]);
    expect(dup.totalPayroll).toBe(1);
  });
});
