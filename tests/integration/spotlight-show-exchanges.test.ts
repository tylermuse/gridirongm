import { describe, expect, it } from 'vitest';
import { clipCatalog, exchangesFor } from '@/lib/spotlight/showWriter';

const statLine = (record: string) => ({ record, stats: [] }) as never;
const ids = (record: string) => exchangesFor(statLine(record)).map(x => x.id);

describe('pre-recorded exchanges', () => {
  it('offers each exchange only to the teams it is true for', () => {
    const always = ['weak_link', 'trade_grade', 'close_game', 'defense_qb'];
    const sorted = (a: string[]) => [...a].sort();
    expect(sorted(ids('8-3'))).toEqual(sorted(['buyer', 'qb', 'hot', 'window', 'january', ...always]));
    expect(sorted(ids('5-5'))).toEqual(sorted(['qb', 'hot', ...always]));
    expect(sorted(ids('3-8'))).toEqual(sorted(['rebuild', 'qb', ...always]));
  });
  it('plays every exchange in order, alternating hosts, on the side angle', () => {
    for (const x of [...exchangesFor(statLine('8-3')), ...exchangesFor(statLine('3-8'))]) {
      expect(x.lines.length).toBeGreaterThanOrEqual(4);
      x.lines.slice(1).forEach((p, k) => expect(p.host).not.toBe(x.lines[k].host));
      expect(x.lines.every(p => p.angle === 'side')).toBe(true);
    }
  });
  it('every exchange has its lines recorded', () => {
    for (const x of exchangesFor(statLine('8-3'))) expect(x.lines.length, x.id).toBeGreaterThanOrEqual(4);
  });
  it('keeps exchange lines out of the single-clip catalog', () => {
    expect(clipCatalog(statLine('8-3')).some(c => c.phrase.kind === 'exchange')).toBe(false);
  });
});
