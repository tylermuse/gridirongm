import { describe, it, expect } from 'vitest';
import { pickJerseyFor } from '@/lib/engine/store';
import type { Player, Team } from '@/types';

const pl = (id: string, teamId: string, jerseyNumber?: number) => ({ id, teamId, position: 'WR', jerseyNumber } as unknown as Player);
const tm = (id: string, retired: number[] = []) => ({ id, retiredNumbers: retired.map(number => ({ number })) } as unknown as Team);

describe('pickJerseyFor keeps a moved player\'s number when it is free', () => {
  it('a WR #88 traded to a team without an 88 keeps 88', () => {
    const players = [pl('lamb', 'dal', 88), pl('a', 'nyg', 10), pl('b', 'nyg', 11)];
    expect(pickJerseyFor('WR', 'nyg', players, [tm('dal'), tm('nyg')], 88)).toBe(88);
  });
  it('falls back to a new number when 88 is taken or retired', () => {
    const players = [pl('lamb', 'dal', 88), pl('x', 'nyg', 88)];
    expect(pickJerseyFor('WR', 'nyg', players, [tm('dal'), tm('nyg')], 88)).not.toBe(88);
    expect(pickJerseyFor('WR', 'nyg', [pl('lamb', 'dal', 88)], [tm('dal'), tm('nyg', [88])], 88)).not.toBe(88);
  });
});
