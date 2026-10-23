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

/**
 * ElevenLabs' per-line timestamps tile a dialogue's audio with no gaps, and
 * the cut between two lines often lands mid-word. Move each cut to the pause
 * the hosts actually leave between lines: the nearest stretch of near-silence
 * (at least 50 ms under -38 dB of the block's peak) within `reach` seconds.
 * A cut with no pause near it stays put. The first line starts where it did;
 * the last runs to the end of the block.
 */
export function snapLineCuts(
  buf: { sampleRate: number; duration: number; getChannelData(c: number): Float32Array },
  lines: { start: number; end: number }[],
  reach = 0.7,
): { start: number; end: number }[] {
  if (lines.length === 0) return [];
  const x = buf.getChannelData(0);
  const hop = Math.max(1, Math.round(buf.sampleRate / 100)); // 10ms
  const n = Math.floor(x.length / hop);
  const rms = new Float32Array(n);
  let max = 0;
  for (let k = 0; k < n; k++) {
    let acc = 0;
    for (let j = k * hop; j < (k + 1) * hop; j++) acc += x[j] * x[j];
    rms[k] = Math.sqrt(acc / hop);
    if (rms[k] > max) max = rms[k];
  }
  const thr = max * 0.0126; // -38 dB
  const MIN_RUN = 5; // 50ms
  const toSec = (k: number) => (k * hop) / buf.sampleRate;
  const cuts = lines.map(l => l.start);
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].start;
    const lo = Math.max(0, Math.floor((t - reach) / hop * buf.sampleRate));
    const hi = Math.min(n, Math.ceil((t + reach) / hop * buf.sampleRate));
    let best: { at: number; dist: number } | null = null;
    let run = -1;
    for (let k = lo; k <= hi; k++) {
      const quiet = k < hi && rms[k] < thr;
      if (quiet && run < 0) run = k;
      if (!quiet && run >= 0) {
        if (k - run >= MIN_RUN) {
          const a = toSec(run), b = toSec(k);
          const dist = t < a ? a - t : t > b ? t - b : 0;
          if (!best || dist < best.dist) best = { at: (a + b) / 2, dist };
        }
        run = -1;
      }
    }
    if (best) cuts[i] = best.at;
  }
  return lines.map((l, i) => ({ start: cuts[i], end: i + 1 < lines.length ? cuts[i + 1] : Math.max(l.end, buf.duration) }));
}
