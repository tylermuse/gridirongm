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

// Play descriptions tag players as "S. Barkley RB" (playerTag in playByPlay).
// Read literally by TTS that's "S Barkley RB gets 6" — robotic. We pull the
// clean last name + position out of the flavor text and rebuild a natural
// call ("Barkley gets 6 yards on the run") from the event's structured data,
// leaving the on-screen feed untouched.
const PLAYER_TAG_RE = /([A-Z])\.\s+([A-Za-zÀ-ÿ'’.\-]+)\s+([A-Z]{1,3})\b/g;

interface TaggedPlayer { last: string; pos: string; }

function extractPlayers(desc: string): TaggedPlayer[] {
  const out: TaggedPlayer[] = [];
  let m: RegExpExecArray | null;
  PLAYER_TAG_RE.lastIndex = 0;
  while ((m = PLAYER_TAG_RE.exec(desc)) !== null) out.push({ last: m[2], pos: m[3] });
  return out;
}

/** Strip player-tag noise + emoji from a description as an audio fallback. */
function cleanForSpeech(desc: string): string {
  return desc
    .replace(PLAYER_TAG_RE, '$2')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const RUSH_POS = new Set(['RB', 'FB', 'QB', 'WR']);

/** Build a natural play-by-play line from the event's structured data. */
function playByPlayLine(ev: PlayEvent): string {
  const players = extractPlayers(ev.description);
  const y = ev.yardsGained;
  const yd = (n: number) => `${n} yard${n !== 1 ? 's' : ''}`;

  if (ev.type === 'run') {
    const name = (players.find(p => RUSH_POS.has(p.pos)) ?? players[0])?.last ?? 'The back';
    if (y <= 0) return `${name} is stopped for ${y === 0 ? 'no gain' : `a loss of ${yd(Math.abs(y))}`}.`;
    if (y >= 15) return `${name} breaks off a ${y}-yard run!`;
    if (y >= 8) return `${name} picks up ${yd(y)} on the ground.`;
    return `${name} gets ${yd(y)} on the run.`;
  }

  if (ev.type === 'pass_complete') {
    const qb = players.find(p => p.pos === 'QB')?.last;
    const rec = players.find(p => p.pos !== 'QB')?.last ?? (qb ? undefined : players[1]?.last);
    if (qb && rec) {
      if (y >= 25) return `${qb} goes deep to ${rec} for ${yd(y)}!`;
      if (y >= 12) return `${qb} finds ${rec} over the middle for ${yd(y)}.`;
      return `${qb} completes it to ${rec} for ${yd(y)}.`;
    }
    return cleanForSpeech(ev.description);
  }

  if (ev.type === 'pass_incomplete') {
    const qb = players.find(p => p.pos === 'QB')?.last ?? players[0]?.last ?? 'The quarterback';
    return `${qb}'s pass falls incomplete.`;
  }

  // Sacks, touchdowns, field goals, punts, INTs, kickoffs — the flavor text is
  // already dramatic and worth keeping; just strip the tag noise + emoji.
  return cleanForSpeech(ev.description);
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

    // Play-by-play: Marcus calls a natural line, Tony reacts to the big ones.
    lines.push({ speaker: 'marcus', text: playByPlayLine(ev) });
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

/**
 * The commentary lines for a SINGLE play (Phase 2 per-play sync). One clip per
 * event so the reveal can be gated on the audio. The show intro is folded into
 * the first play's clip. Returns [] for a play with nothing to say (the caller
 * still reveals it, just with a brief silent beat).
 */
export function broadcastClipLines(
  events: PlayEvent[],
  index: number,
  homeAbbr: string,
  awayAbbr: string,
  fromIndex: number,
  homeName: string,
  awayName: string,
): BroadcastLine[] {
  const ev = events[index];
  if (!ev) return [];
  const lines: BroadcastLine[] = [];

  if (index === fromIndex) {
    lines.push({
      speaker: 'marcus',
      text: `Welcome in — Marcus Cole with Tony Blaze for ${awayName} at ${homeName}. Let's get to it.`,
    });
    lines.push({ speaker: 'tony', text: `Let's GO!` });
  }

  if (ev.type === 'halftime') {
    lines.push({ speaker: 'marcus', text: `That's the half. ${awayName} ${ev.awayScore}, ${homeName} ${ev.homeScore}.` });
  } else if (ev.type === 'final') {
    lines.push({ speaker: 'marcus', text: `That's the ballgame. ${awayName} ${ev.awayScore}, ${homeName} ${ev.homeScore}. Thanks for listening.` });
  } else if (!isSkippable(ev)) {
    lines.push({ speaker: 'marcus', text: playByPlayLine(ev) });
    const color = tonyReaction(ev);
    if (color) lines.push({ speaker: 'tony', text: color });
  }

  // Say the city, not the abbreviation — descriptions (e.g. "DAL goes for two")
  // embed the tag, so swap whole-word abbreviations for the team name.
  const say = (s: string) => s
    .replace(new RegExp(`\\b${awayAbbr}\\b`, 'g'), awayName)
    .replace(new RegExp(`\\b${homeAbbr}\\b`, 'g'), homeName);
  return lines.map(l => ({ ...l, text: say(l.text) }));
}
