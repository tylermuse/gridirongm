/**
 * Coaching money never counts against the salary cap.
 *
 * Like the real NFL, coach salaries and coach buyouts are owner-budget
 * expenses. Firing a coach mid-contract writes a dead-cap entry tagged
 * isCoaching=true; recalculateTeamPayroll (the cap total) must skip it while
 * still counting player dead cap.
 */
import { describe, it, expect } from 'vitest';
import { recalculateTeamPayroll } from '@/lib/engine/store';
import type { Team } from '@/types';

function teamWith(deadCap: NonNullable<Team['deadCap']>): Team {
  return { id: 't1', roster: [], deadCap } as unknown as Team;
}

describe('coach buyouts stay off the cap', () => {
  it('ignores coaching dead cap in the payroll total', () => {
    const team = teamWith([
      { playerName: 'Fired HC (HC)', amount: 12, yearsLeft: 2, source: 'coach-fire', season: 2026, isCoaching: true },
    ]);
    expect(recalculateTeamPayroll(team, [])).toBe(0);
  });

  it('still counts player dead cap', () => {
    const team = teamWith([
      { playerName: 'Cut WR', amount: 5, yearsLeft: 1, source: 'release', season: 2026 },
      { playerName: 'Fired OC (OC)', amount: 3, yearsLeft: 1, source: 'coach-fire', season: 2026, isCoaching: true },
    ]);
    expect(recalculateTeamPayroll(team, [])).toBe(5);
  });
});
