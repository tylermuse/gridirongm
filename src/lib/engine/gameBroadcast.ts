/**
 * Game Broadcast script generator (Phase 1 spike, feature-flagged).
 *
 * Turns a pre-generated live-game PlayEvent[] into a two-voice commentary
 * script — Marcus Cole on play-by-play, Tony Blaze on color — that the
 * /api/game-audio route feeds to ElevenLabs (same voices as the podcast).
 *
 * DETERMINISTIC: no Math.random. Variety is keyed off event.id so the same
 * seeded game always produces the same script — which is what makes the
 * server-side audio cache hit on a re-watch (same lines → same md5 → same mp3).
 */

import type { PlayEvent } from './playByPlay';

export interface BroadcastLine {
  speaker: 'marcus' | 'tony';
  text: string;
}

const TONY_TD = [
  "TOUCHDOWN! Are you KIDDING me?! That's what I'm talking about!",
  "SIX POINTS! He walked in there like he owned the place!",
  "Get it in the end zone! THAT is how you finish a drive!",
];
const TONY_TURNOVER = [
  "TURNOVER! You can't do that! You just CAN'T do that in this spot!",
  "He gave it away! Momentum just flipped on its head!",
  "Oh, that's a back-breaker. That one's gonna sting.",
];
const TONY_SACK = [
  "BURIED him! The pocket collapsed and he had nowhere to go!",
  "Get him DOWN! That's a drive-killer right there.",
];
const TONY_FG = [
  "Three points on the board. Take what they give you, I get it.",
  "Splits the uprights. Not flashy, but it counts.",
];

/** Deterministic pick from a list keyed off an event id (no RNG). */
function pick(list: string[], seed: number): string {
  return list[seed % list.length];
}

/** Color reaction for a notable play, or null for a routine one. */
function tonyReaction(ev: PlayEvent): string | null {
  const d = ev.description.toUpperCase();
  if (ev.type === 'touchdown' || d.includes('TOUCHDOWN')) return pick(TONY_TD, ev.id);
  if (d.includes('INTERCEPT') || d.includes('FUMBLE')) return pick(TONY_TURNOVER, ev.id);
  if (d.includes('SACK')) return pick(TONY_SACK, ev.id);
  if (ev.type === 'field_goal_good') return pick(TONY_FG, ev.id);
  return null;
}

/** Events that carry no useful play-by-play text on their own. */
function isSkippable(ev: PlayEvent): boolean {
  return !ev.description || ev.description.trim().length === 0;
}

/**
 * Build the full broadcast script for a game. `fromIndex` lets the caller
 * start mid-game (e.g. from the currently-revealed play) so a spike listener
 * doesn't pay to generate audio for a half they already watched.
 */
export function buildBroadcastLines(
  events: PlayEvent[],
  homeAbbr: string,
  awayAbbr: string,
  fromIndex = 0,
): BroadcastLine[] {
  const lines: BroadcastLine[] = [];

  if (fromIndex === 0) {
    lines.push({
      speaker: 'marcus',
      text: `Welcome in, everybody — Marcus Cole here alongside Tony Blaze for ${awayAbbr} at ${homeAbbr}. Let's get to the action.`,
    });
    lines.push({ speaker: 'tony', text: `Let's GO! I've been waiting all week for this one!` });
  }

  for (let i = fromIndex; i < events.length; i++) {
    const ev = events[i];
    if (isSkippable(ev)) continue;

    if (ev.type === 'halftime') {
      lines.push({ speaker: 'marcus', text: `And that's the halftime whistle. ${awayAbbr} ${ev.awayScore}, ${homeAbbr} ${ev.homeScore}.` });
      continue;
    }
    if (ev.type === 'final') {
      lines.push({ speaker: 'marcus', text: `That'll do it — final from here. ${awayAbbr} ${ev.awayScore}, ${homeAbbr} ${ev.homeScore}. Thanks for listening.` });
      lines.push({ speaker: 'tony', text: `What a game! We'll see you next week — stay loud!` });
      continue;
    }

    // Play-by-play: Marcus reads the play, Tony reacts to the big ones.
    lines.push({ speaker: 'marcus', text: ev.description });
    const color = tonyReaction(ev);
    if (color) lines.push({ speaker: 'tony', text: color });
  }

  return lines;
}

/** Split a script into fixed-size segments for generate-ahead streaming. */
export function segmentBroadcast(lines: BroadcastLine[], size = 6): BroadcastLine[][] {
  const out: BroadcastLine[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    out.push(lines.slice(i, i + size));
  }
  return out;
}
