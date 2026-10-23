import { describe, it, expect } from 'vitest';
import { snapLineCuts } from '@/lib/spotlight/loudness';

/** A fake decoded block: speech (noise) with pauses (silence) at the given times. */
function block(duration: number, pauses: [number, number][], sr = 16000) {
  const x = new Float32Array(Math.round(duration * sr));
  let seed = 7;
  for (let i = 0; i < x.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; x[i] = (seed / 0x7fffffff - 0.5) * 0.6; }
  for (const [a, b] of pauses) x.fill(0, Math.round(a * sr), Math.round(b * sr));
  return { sampleRate: sr, duration, getChannelData: () => x };
}

describe('dialogue line cuts', () => {
  it('moves a cut that lands mid-word to the pause between the lines', () => {
    const b = block(10, [[4.4, 4.7]]);
    const cuts = snapLineCuts(b, [{ start: 0, end: 4.1 }, { start: 4.1, end: 9.9 }]);
    expect(cuts[0].start).toBe(0);
    expect(cuts[0].end).toBeGreaterThan(4.35);
    expect(cuts[0].end).toBeLessThan(4.7);
    expect(cuts[1].start).toBe(cuts[0].end);
  });
  it('the last line runs to the end of the block (its audio stops on the last word)', () => {
    const cuts = snapLineCuts(block(10, [[4.4, 4.7]]), [{ start: 0, end: 4.5 }, { start: 4.5, end: 9.6 }]);
    expect(cuts[1].end).toBe(10);
  });
  it('picks the nearest pause and leaves a cut with no pause nearby alone', () => {
    const b = block(12, [[2.0, 2.2], [5.5, 5.6], [8.0, 8.3]]);
    const cuts = snapLineCuts(b, [{ start: 0, end: 5.3 }, { start: 5.3, end: 10 }, { start: 10, end: 12 }]);
    expect(cuts[0].end).toBeGreaterThan(5.45); // not the pause at 8.0
    expect(cuts[0].end).toBeLessThan(5.6);
    expect(cuts[1].end).toBe(10); // nothing within reach
    expect(cuts).toHaveLength(3);
  });
  it('a nearby pause between the lines beats a deeper one inside a line', () => {
    // A soft 80 ms gap right at the cut, and dead silence 0.5 s earlier (mid-line).
    const b = block(8, [[2.9, 3.4]]);
    const x = b.getChannelData(0);
    for (let i = Math.round(4.0 * 16000); i < Math.round(4.08 * 16000); i++) x[i] *= 0.01; // -40 dB
    const cuts = snapLineCuts(b, [{ start: 0, end: 4.05 }, { start: 4.05, end: 8 }]);
    expect(cuts[0].end).toBeGreaterThan(3.95);
    expect(cuts[0].end).toBeLessThan(4.12);
  });
  it('a cut already inside a pause stays in it', () => {
    const cuts = snapLineCuts(block(6, [[2.9, 3.3]]), [{ start: 0, end: 3.0 }, { start: 3.0, end: 6 }]);
    expect(cuts[0].end).toBeGreaterThan(2.9);
    expect(cuts[0].end).toBeLessThan(3.3);
  });
});
