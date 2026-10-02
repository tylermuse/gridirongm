import { describe, expect, it } from 'vitest';
import { clipCatalog, exchangesFor } from '@/lib/spotlight/showWriter';

const statLine = (record: string) => ({ record, stats: [] }) as never;

describe('pre-recorded exchanges', () => {
  it('offers the buyer exchange to a winning team, in order, alternating hosts', () => {
    const [x] = exchangesFor(statLine('8-3'));
    expect(x.id).toBe('buyer');
    expect(x.lines.map(p => p.host)).toEqual(['tony', 'marcus', 'tony', 'marcus', 'tony']);
    expect(x.lines.every(p => p.angle === 'side')).toBe(true);
  });
  it('is not offered to a .500 or losing team', () => {
    expect(exchangesFor(statLine('5-6'))).toEqual([]);
    expect(exchangesFor(statLine('5-5'))).toEqual([]);
  });
  it('keeps exchange lines out of the single-clip catalog', () => {
    expect(clipCatalog(statLine('8-3')).some(c => c.phrase.kind === 'exchange')).toBe(false);
  });
});
