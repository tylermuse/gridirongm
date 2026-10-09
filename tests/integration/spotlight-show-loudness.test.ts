import { describe, it, expect } from 'vitest';
import { levelGain, speechDb, clipLevel, TARGET_DB, MIN_GAIN, MAX_GAIN } from '@/lib/spotlight/loudness';
import CLIP_LEVELS from '@/lib/spotlight/clipLevels.json';
import MANIFEST from '@/lib/spotlight/phraseManifest.json';

/** A fake decoded buffer: a sine at `amp` for `secs`, with silence around it. */
function tone(amp: number, secs: number, pad = 0.5, sr = 16000) {
  const x = new Float32Array(Math.round((secs + 2 * pad) * sr));
  const a = Math.round(pad * sr);
  for (let i = 0; i < secs * sr; i++) x[a + i] = amp * Math.sin((2 * Math.PI * 220 * i) / sr);
  return { sampleRate: sr, getChannelData: () => x };
}

describe('show loudness leveling', () => {
  it('measures speech loudness and ignores the silence around it', () => {
    // A sine of amplitude A has RMS A/√2 → 20·log10(A/√2) dBFS.
    const b = tone(0.2, 2);
    const db = speechDb(b, 0, 3)!;
    expect(db).toBeCloseTo(20 * Math.log10(0.2 / Math.SQRT2), 0);
    expect(speechDb(tone(0, 2), 0, 3)).toBeNull();
  });

  it('turns a level into the gain that brings it to the target', () => {
    expect(levelGain(TARGET_DB)).toBeCloseTo(1, 5);
    expect(levelGain(TARGET_DB - 6)).toBeCloseTo(2, 1); // 6 dB quiet → ×2
    expect(levelGain(TARGET_DB + 6)).toBeCloseTo(0.5, 1);
    expect(levelGain(-60)).toBe(MAX_GAIN); // never boost a near-silent clip into noise
    expect(levelGain(0)).toBe(MIN_GAIN);
    expect(levelGain(null)).toBe(1);
  });

  it('has a measured level for every clip in the manifest', () => {
    const missing = (MANIFEST as { src: string }[]).filter(p => clipLevel(p.src) == null).map(p => p.src);
    expect(missing).toEqual([]);
  });

  it('after leveling, every clip lands within a few dB of the target', () => {
    const levels = Object.values(CLIP_LEVELS as Record<string, number>);
    for (const db of levels) {
      const after = db + 20 * Math.log10(levelGain(db));
      expect(Math.abs(after - TARGET_DB)).toBeLessThan(1.5);
    }
  });
});
