/**
 * Subtle sound design (Tier 3.1).
 *
 * Synthesised on the fly with the Web Audio API — no audio files, no library,
 * nothing to ship. Three cues:
 *   - pop    : a soft blip when a sim batch finishes
 *   - chime  : a brighter two-note flourish when the user's team wins
 *   - buzzer  : the classic low buzzer when a championship is decided
 *
 * Off by default; the user opts in from /settings. The preference lives in
 * localStorage under `bshoops-sound` (mirrors the `bshoops-theme` convention).
 */

export type SoundKind = 'pop' | 'chime' | 'buzzer';

const STORAGE_KEY = 'bshoops-sound';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode / blocked storage — sound just stays off */
  }
}

// Lazily-created context, reused across cues. Created on first play (always
// inside a user gesture, since every sim is a click), so autoplay policies are
// satisfied.
let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  // A context can get suspended (tab backgrounded); nudge it back.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One short tone with an attack/decay envelope. */
function tone(
  ac: AudioContext,
  opts: { freq: number; start: number; duration: number; type: OscillatorType; peak: number },
): void {
  const { freq, start, duration, type, peak } = opts;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  // Fast attack, exponential decay — reads as "crafted", not a flat beep.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/**
 * Play a cue. No-op when sound is disabled, unsupported, or server-side.
 * Never throws — audio is a garnish, it must not break a sim.
 */
export function playSound(kind: SoundKind): void {
  if (!isSoundEnabled()) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    const t = ac.currentTime;
    switch (kind) {
      case 'pop':
        tone(ac, { freq: 620, start: t, duration: 0.09, type: 'sine', peak: 0.16 });
        break;
      case 'chime':
        // Rising perfect-fourth-ish flourish.
        tone(ac, { freq: 659, start: t, duration: 0.14, type: 'triangle', peak: 0.18 });
        tone(ac, { freq: 880, start: t + 0.1, duration: 0.22, type: 'triangle', peak: 0.16 });
        break;
      case 'buzzer':
        tone(ac, { freq: 180, start: t, duration: 0.55, type: 'sawtooth', peak: 0.2 });
        break;
    }
  } catch {
    /* audio failed — silently ignore */
  }
}
