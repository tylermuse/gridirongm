/**
 * Team Spotlight show — loudness leveling.
 *
 * Every voice (pre-recorded clip or generated line) is leveled to one speech
 * loudness: the RMS of the speech-active 20ms frames (above -45 dBFS), in
 * dBFS. Clips are measured offline (scripts/spotlight-show/measure_levels.py
 * → clipLevels.json); generated lines are measured as they're decoded. The
 * player puts a limiter on its output so boosted lines never clip.
 */
import CLIP_LEVELS from './clipLevels.json';

export const TARGET_DB = -18;
/** Never cut a voice by more than ~9 dB or boost it by more than ~14 dB. */
export const MIN_GAIN = 0.35;
export const MAX_GAIN = 5;

export function levelGain(db: number | null | undefined): number {
  if (db == null || !Number.isFinite(db)) return 1;
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, Math.pow(10, (TARGET_DB - db) / 20)));
}

export const clipLevel = (src: string): number | undefined => (CLIP_LEVELS as Record<string, number>)[src];

/** Speech loudness (dBFS) of a decoded line between `start` and `end` seconds. */
export function speechDb(buf: { sampleRate: number; getChannelData(c: number): Float32Array }, start: number, end: number): number | null {
  const x = buf.getChannelData(0);
  const hop = Math.max(1, Math.round(buf.sampleRate / 50)); // 20ms
  const a = Math.max(0, Math.floor(start * buf.sampleRate));
  const b = Math.min(x.length, Math.ceil(end * buf.sampleRate));
  const gate = Math.pow(10, -45 / 20);
  let sum = 0, n = 0;
  for (let k = a; k + hop <= b; k += hop) {
    let acc = 0;
    for (let j = k; j < k + hop; j++) acc += x[j] * x[j];
    const ms = acc / hop;
    if (Math.sqrt(ms) > gate) { sum += ms; n++; }
  }
  return n ? 10 * Math.log10(sum / n) : null;
}
