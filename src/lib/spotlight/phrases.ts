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
  | 'riff' | 'reply_agree' | 'reply_push' | 'button' | 'open' | 'answer'
  // Subject lines (the draft, trades, coaching, injuries…) and
  // conversational reactions, placed by the writer or by topic keywords.
  | 'topical';
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
  /** Topical lines: subjects the line is about (see TOPIC_TAGS). */
  tags?: string[];
  /** Makes a specific claim (about a player, a coach, a contract) that only
   *  the writer, who knows the facts, may use. */
  writerOnly?: boolean;
}

export const PHRASES = manifest as Phrase[];

export function ordinalSrc(host: PhraseHost, rank: number): string {
  return `/show/ordinals/${host}/${rank}.mp3`;
}

/** Subjects a topical line can be about, and how a line of commentary
 *  signals that subject. 'reaction' lines have no keywords (writer only). */
export const TOPIC_TAGS: Record<string, RegExp> = {
  draft: /\bdraft|\bprospects?\b|\bdraft pick|\bfirst[- ]round/i,
  trade: /\btrad(e|ed|es|ing)\b|\bdeadline\b|\bacquir/i,
  free_agency: /\bfree agen|\bcap space\b/i,
  coaching: /\bcoach|\bplay[- ]?call|\bscheme\b|\bcoordinator/i,
  injury: /\binjur|\bhurt\b|\bsidelined\b|\binjured reserve\b/i,
  playoffs: /\bplayoffs?\b|\bpostseason\b|\bwild ?card\b|\bseed(ing)?\b|\bdivision (race|lead|title)/i,
  contract: /\bcontract|\bextension\b|\bsalary\b|\bper year\b|\bmillion\b/i,
  rebuild: /\brebuild|\btank(ing)?\b|\bthe future\b|\byoung core\b/i,
  qb: /\bquarterback|\bQB\b|\bpasser\b/i,
  defense: /\bdefen[cs]e\b|\bsecondary\b|\bpass rush\b/i,
  offense: /\boffen[cs]e\b|\bred zone\b/i,
  oline: /\boffensive line\b|\bo-?line\b|\bpass protection\b|\bsacks? allowed\b/i,
  young: /\brookies?\b|\bsecond[- ]year\b|\bfirst[- ]year\b|\byoung (guys|players|team)\b/i,
  veteran: /\bveterans?\b|\bexperience\b/i,
  streak_win: /\bwin(ning)? streak|\bwon (\w+ )?(straight|in a row)|\bhot streak/i,
  streak_loss: /\blos(ing)? streak|\blost (\w+ )?(straight|in a row)|\bskid\b|\bslump\b/i,
};

/** Subjects a piece of commentary touches. */
export function topicTagsIn(text: string): string[] {
  return Object.entries(TOPIC_TAGS).filter(([, re]) => re.test(text)).map(([t]) => t);
}
