/**
 * Spotlight phrase bank — reusable, pre-rendered, lip-synced clips of each
 * host (see show-assets/phrases.json for the source script and
 * show-assets/*.py for the production pipeline).
 *
 * Slot phrases contain one spoken rank ("twenty-seventh") that the player
 * replaces at runtime: it mutes the clip's audio for [slot.start, slot.end]
 * and plays /show/ordinals/<host>/<n>.mp3 in that window.
 */
import manifest from './phraseManifest.json';
import type { ShowStatKey } from './teamStats';

export type PhraseHost = 'marcus' | 'tony';
export type PhraseKind =
  | 'stat' | 'record' | 'agree' | 'disagree' | 'skeptical' | 'pivot' | 'hype'
  // Longer on-camera dialogue: stat riffs (6–8s, rank slot), replies to the
  // other host, sign-offs, and a take/answer pair for stat-less topics.
  | 'riff' | 'reply_agree' | 'reply_push' | 'button' | 'open' | 'answer';
export type PhraseTone = 'good' | 'bad' | 'mid';

export interface Phrase {
  id: string;
  host: PhraseHost;
  kind: PhraseKind;
  stat?: ShowStatKey;
  tone?: PhraseTone;
  /** Display text; `{rank}` marks the slot. */
  text: string;
  src: string;
  duration: number;
  /** Seconds from clip start. */
  slot?: { start: number; end: number };
  /** Where the words are (s); the clip has ~0.35s lead-in and ~0.6s tail. */
  speech: { start: number; end: number };
}

export const PHRASES = manifest as Phrase[];

export function ordinalSrc(host: PhraseHost, rank: number): string {
  return `/show/ordinals/${host}/${rank}.mp3`;
}
