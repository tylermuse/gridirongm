/**
 * Sound design for the Team Spotlight show: a theme under the open, a
 * stinger under each themed opener's title card, an outro after the last
 * line, and effects on the graphics (topic wipes, Buy/Sell chips, the
 * verdict board). Files live in public/show/sfx (ElevenLabs Music / Sound
 * Effects, trimmed and loudness-normalized: scripts/spotlight-show/sfx).
 */
import type { Calls, ShowThemeId, Verdict } from './showThemes';
import type { Host } from './showScript';

export type SfxId = 'whoosh' | 'pop' | 'stamp' | 'meter' | 'alarm' | 'slam';
export type MusicId = 'open' | 'outro' | ShowThemeId;

export const sfxSrc = (id: SfxId | MusicId) => `/show/sfx/${id}.mp3`;

/** Linear gains against speech at TARGET_DB (all files are ~-16 LUFS). */
export const SFX_GAIN: Record<SfxId, number> = { whoosh: 0.35, pop: 0.45, stamp: 0.7, meter: 0.35, alarm: 0.3, slam: 0.55 };

/** Music: starts at `start`, settles to `bed` under speech after `settle`
 *  seconds (the open's first hit plays out before the host's first word). */
export const MUSIC_LEVEL: Record<MusicId, { start: number; bed: number; settle: number }> = {
  open: { start: 0.6, bed: 0.16, settle: 0.7 },
  outro: { start: 0.7, bed: 0.7, settle: 0 },
  panic: { start: 0.3, bed: 0.16, settle: 0.5 },
  buysell: { start: 0.3, bed: 0.16, settle: 0.5 },
  contender: { start: 0.3, bed: 0.16, settle: 0.5 },
};

export const ALL_SFX: (SfxId | MusicId)[] = ['whoosh', 'pop', 'stamp', 'meter', 'alarm', 'slam', 'open', 'outro', 'panic', 'buysell', 'contender'];

export interface Cue { id: SfxId; at: number }

/** What the graphic currently on screen sounds like, in seconds from the
 *  topic's start (same clock as the graphics' `topicMs`). Each cue group
 *  fires once per topic: `fired` holds the groups already played. */
export function graphicCues(
  g: {
    topicIdx: number; visual: 'title' | 'graphic'; calls?: Calls; verdict?: Verdict;
    /** Verdict cards up so far, and when each went up (s from the topic's start). */
    revealed?: Host[]; revealAt?: Partial<Record<Host, number>>;
  },
  fired: Set<string>,
): Cue[] {
  if (g.visual !== 'graphic' || g.topicIdx < 0) return [];
  const cues: Cue[] = [];
  const once = (k: string) => (fired.has(k) ? false : (fired.add(k), true));
  if (once(`w:${g.topicIdx}`)) cues.push({ id: 'whoosh', at: 0 });
  // CallChip pops in at 300 / 650 ms.
  if (g.calls && once(`c:${g.topicIdx}`)) cues.push({ id: 'pop', at: 0.3 }, { id: 'pop', at: 0.65 });
  // VerdictBoard: each host's card lands at 250 + k·450 ms, or 250 ms after
  // he gives his verdict.
  if (g.verdict) {
    (['marcus', 'tony'] as const).forEach((h, k) => {
      if (g.revealed && !g.revealed.includes(h)) return;
      if (!once(`v:${g.topicIdx}:${h}`)) return;
      const v = g.verdict![h];
      const at = g.revealed ? (g.revealAt?.[h] ?? 0) + 0.25 : 0.25 + k * 0.45;
      if (typeof v === 'number') {
        cues.push({ id: 'meter', at });
        if (v >= 8) cues.push({ id: 'alarm', at: at + 0.45 });
      } else if (v === 'contender' || v === 'pretender') {
        cues.push({ id: 'stamp', at: at + 0.1 });
      } else {
        cues.push({ id: 'pop', at });
      }
    });
  }
  return cues;
}
