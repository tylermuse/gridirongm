import { describe, it, expect } from 'vitest';
import { POSITIONS, PRACTICE_SQUAD_LIMIT, type Player, type Position, type Team } from '@/types';
import { settleRosterTiers, describeRosterSettle, type RealRosterStatus } from '@/lib/engine/rosterTiers';

let seq = 0;
const mk = (position: Position, overall: number, extra: Partial<Player> = {}): Player => ({
  id: `p${String(++seq).padStart(3, '0')}`,
  position,
  ratings: { overall },
  experience: 1,
  retired: false,
  onIR: false,
  injury: null,
  teamId: 'T',
  contract: { salary: 1, yearsLeft: 1, guaranteed: 0, totalYears: 1 },
  ...extra,
} as unknown as Player);

const teamOf = (players: Player[], extra: Partial<Team> = {}): Team => ({
  id: 'T',
  roster: players.map(p => p.id),
  practiceSquad: [],
  injuredReserve: [],
  totalPayroll: players.reduce((s, p) => s + p.contract.salary, 0),
  depthChart: POSITIONS.reduce((acc, pos) => {
    acc[pos] = players.filter(p => p.position === pos).map(p => p.id);
    return acc;
  }, {} as Record<Position, string[]>),
  ...extra,
} as unknown as Team);

/** A legal 53: QB3 RB4 WR6 TE3 OL9 DL9 LB7 CB5 S5 K1 P1, all rated 70+. */
const base53 = (): Player[] => {
  const shape: Array<[Position, number]> = [
    ['QB', 3], ['RB', 4], ['WR', 6], ['TE', 3], ['OL', 9], ['DL', 9], ['LB', 7], ['CB', 5], ['S', 5], ['K', 1], ['P', 1],
  ];
  return shape.flatMap(([pos, n]) => Array.from({ length: n }, (_, i) => mk(pos, 70 + i)));
};

describe('settleRosterTiers', () => {
  it('leaves a roster that already fits untouched, even with tags', () => {
    const players = base53();
    const team = teamOf(players);
    const r = settleRosterTiers(team, players, { week: 10, realStatus: { [players[0].id]: 'ps' }, release: true });
    expect(r.team).toBe(team);
    expect(r.playerPatches.size).toBe(0);
    expect(describeRosterSettle(r)).toBe('');
  });

  it('seats a real-season roster: real IR to IR, real practice squad to the PS, nobody released', () => {
    const core = base53();
    const ir = [mk('WR', 88, { injury: { type: 'Knee', weeksLeft: 13 } }), mk('LB', 60, { injury: { type: 'Ankle', weeksLeft: 2 } })];
    // Real practice squads carry more veterans than the in-game demotion rule allows.
    const ps = Array.from({ length: 14 }, (_, i) => mk(POSITIONS[i % 9], 50 + i, { experience: 5 }));
    const players = [...core, ...ir, ...ps];
    const realStatus: Record<string, RealRosterStatus> = {};
    for (const p of ir) realStatus[p.id] = 'ir';
    for (const p of ps) realStatus[p.id] = 'ps';
    const team = teamOf(players);

    const r = settleRosterTiers(team, players, { week: 10, realStatus, release: true });

    expect(r.team.roster).toHaveLength(53);
    expect(new Set(r.team.injuredReserve)).toEqual(new Set(ir.map(p => p.id)));
    expect(new Set(r.team.practiceSquad)).toEqual(new Set(ps.map(p => p.id)));
    expect(r.released).toEqual([]);
    // PS and IR come off the payroll, like the manual moves.
    expect(r.team.totalPayroll).toBe(53);
    // Off the depth chart.
    const charted = new Set(Object.values(r.team.depthChart).flat());
    for (const p of [...ir, ...ps]) expect(charted.has(p.id)).toBe(false);
    // Real IR stints predate the league: the 3-week return clock is served.
    expect(r.playerPatches.get(ir[0].id)).toEqual({ onIR: true, irPlacedWeek: 7 });
    expect(describeRosterSettle(r)).toBe('2 to injured reserve and 14 to the practice squad');
  });

  it('keeps a real-IR player the file lists as healthy on the active roster', () => {
    const players = [...base53(), mk('S', 90), mk('CB', 40)];
    const healthyIr = players[53];
    const r = settleRosterTiers(teamOf(players), players, { week: 5, realStatus: { [healthyIr.id]: 'ir' }, release: true });
    expect(r.toIR).toEqual([]);
    expect(r.team.roster).toContain(healthyIr.id);
    expect(r.team.roster).toHaveLength(53);
  });

  it('with no tags: long-term injured to IR, then the bottom of the roster to the PS, then releases', () => {
    const core = base53();
    const hurt = mk('DL', 85, { injury: { type: 'ACL', weeksLeft: 12 } });
    const shortTerm = mk('DL', 84, { injury: { type: 'Hamstring', weeksLeft: 2 } });
    const young = Array.from({ length: 18 }, (_, i) => mk('LB', 40 + i));
    const tooGood = mk('WR', 95);
    const players = [...core, hurt, shortTerm, ...young, tooGood];
    const r = settleRosterTiers(teamOf(players), players, { week: 3, release: true });

    expect(r.toIR).toEqual([hurt.id]);
    expect(r.playerPatches.get(hurt.id)).toEqual({ onIR: true, irPlacedWeek: 3 });
    expect(r.toPracticeSquad).toHaveLength(PRACTICE_SQUAD_LIMIT);
    // The 16 lowest-rated went down; the next lowest were released.
    expect(new Set(r.toPracticeSquad)).toEqual(new Set(young.slice(0, 16).map(p => p.id)));
    // 74 on the team - 1 IR - 16 PS = 57: four releases, lowest-rated first.
    expect(r.released).toHaveLength(4);
    expect(r.released.slice(0, 2)).toEqual([young[16].id, young[17].id]);
    expect(r.team.roster).toHaveLength(53);
    expect(r.team.roster).toContain(shortTerm.id);
    expect(r.team.roster).toContain(tooGood.id);
    for (const id of r.released) expect(r.playerPatches.get(id)).toEqual({ teamId: null, onIR: false });
  });

  it('stops as soon as the roster is at 53 and never drops a position below its minimum', () => {
    const core = base53();
    // Two long-term injuries but only one man over: one IR move, the other stays.
    const a = mk('CB', 80, { injury: { type: 'Achilles', weeksLeft: 14 } });
    const players = [...core, a];
    players[0] = { ...players[0], injury: { type: 'Back', weeksLeft: 6 } };
    const r = settleRosterTiers(teamOf(players), players, { week: 2, release: true });
    expect(r.toIR).toEqual([a.id]);
    expect(r.team.roster).toHaveLength(53);

    // Lone kicker rated 1 is never the cut even though he is the lowest-rated.
    const withBadKicker = base53().map(p => (p.position === 'K' ? { ...p, ratings: { overall: 1 } } as Player : p));
    const extra = mk('WR', 99);
    const r2 = settleRosterTiers(teamOf([...withBadKicker, extra]), [...withBadKicker, extra], { week: 2, release: true });
    const kicker = withBadKicker.find(p => p.position === 'K')!;
    expect(r2.team.roster).toContain(kicker.id);
    expect(r2.team.roster).toHaveLength(53);
  });

  it('without release, leaves the overflow for the user', () => {
    const players = [...base53(), ...Array.from({ length: 20 }, (_, i) => mk('OL', 40 + i))];
    const r = settleRosterTiers(teamOf(players), players, { week: 1 });
    expect(r.toPracticeSquad).toHaveLength(16);
    expect(r.released).toEqual([]);
    expect(r.team.roster).toHaveLength(57);
  });
});
