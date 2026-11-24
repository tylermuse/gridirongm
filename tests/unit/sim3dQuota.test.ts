import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SIM3D_WEEKLY_FREE_GAMES, countGame, countedGamesThisWeek, currentWeekKey, readSim3DQuota, sim3dCapArm,
} from '@/lib/sim3dQuota';

describe('sim3dQuota', () => {
  beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

  it('weeks start on Monday in local time', () => {
    expect(currentWeekKey(new Date(2026, 10, 23, 8))).toBe('2026-11-23');   // Monday
    expect(currentWeekKey(new Date(2026, 10, 29, 23, 59))).toBe('2026-11-23'); // Sunday night, same week
    expect(currentWeekKey(new Date(2026, 10, 30, 0, 1))).toBe('2026-11-30');   // next Monday
  });

  it('assigns an arm once and keeps it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(sim3dCapArm()).toBe('cap');
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(sim3dCapArm()).toBe('cap');
  });

  it('counts each game once per week and resets the next week', () => {
    const mon = new Date(2026, 10, 23, 12);
    expect(countGame('g1', mon)).toBe(1);
    expect(countGame('g1', mon)).toBe(1);
    expect(countGame('g2', mon)).toBe(2);
    expect(countedGamesThisWeek(new Date(2026, 10, 30, 12))).toEqual([]);
  });

  it('blocks a capped free device only once the week is used up, and never a counted game', () => {
    window.localStorage.setItem('bsgm.sim3dCap.arm', 'cap');
    for (let i = 0; i < SIM3D_WEEKLY_FREE_GAMES; i++) countGame(`g${i}`);
    const base = { isPremium: false, isExhibition: false, arm: 'cap' as const };
    expect(readSim3DQuota({ ...base, gameId: 'new' }).blocked).toBe(true);
    expect(readSim3DQuota({ ...base, gameId: 'g0' })).toMatchObject({ blocked: false, thisGameCounted: true, left: 0 });
  });

  it('never blocks Premium, exhibitions or the control arm', () => {
    for (let i = 0; i < SIM3D_WEEKLY_FREE_GAMES + 2; i++) countGame(`g${i}`);
    expect(readSim3DQuota({ gameId: 'x', isPremium: true, isExhibition: false, arm: 'cap' }).blocked).toBe(false);
    expect(readSim3DQuota({ gameId: 'x', isPremium: false, isExhibition: true, arm: 'cap' }).blocked).toBe(false);
    expect(readSim3DQuota({ gameId: 'x', isPremium: false, isExhibition: false, arm: 'control' }).blocked).toBe(false);
    expect(readSim3DQuota({ gameId: 'x', isPremium: false, isExhibition: false, arm: 'control' }).left).toBe(0);
  });

  it('shows the full allowance before any game is counted', () => {
    expect(readSim3DQuota({ gameId: 'x', isPremium: false, isExhibition: false, arm: 'cap' }))
      .toMatchObject({ capped: true, used: 0, left: SIM3D_WEEKLY_FREE_GAMES, blocked: false });
  });
});
