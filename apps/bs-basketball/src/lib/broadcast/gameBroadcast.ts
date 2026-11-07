/**
 * Live game broadcast script — the Hoops port of BS Football's gameBroadcast.
 *
 * Turns the live viewer's LiveEvent[] into per-event commentary clips: Marcus
 * Cole on play-by-play, Tony Blaze on color. Football calls every snap; a
 * basketball game has ~400 feed events, so only the ones a real broadcast
 * would call get a clip — made baskets, steals, blocks, live-ball turnovers,
 * quarter breaks, and anything crunch-time. Misses, boards, fouls and subs
 * reveal on a short silent beat between calls.
 *
 * Basketball beats replace football's drives and downs: lead changes, ties,
 * unanswered runs, heat-checks (the live viewer's moment chips), buzzer
 * beaters and end-of-quarter scores, with halftime at the end of Q2. Tony's
 * read on the whole game (who's hot, what the trailing team needs) lives in
 * gameRead.ts.
 *
 * DETERMINISTIC: no Math.random. Variety comes from rotating through wordings
 * in play order, so the same game always produces the same lines — which is
 * what makes the server audio cache hit on a re-watch (same lines → same md5 →
 * same mp3).
 * Pure + client-safe: no React, no Node APIs.
 */

import type { LiveEvent } from '../live/playByPlay';
import type { EventBeat } from '../live/beats';
import type { Moment } from '../live/moments';
import { applyEvent, gameSeed, newGameState, newMemory, nextFrom, periodRead, readForEvent, type GameState, type Memory } from './gameRead';

export type BroadcastSpeaker = 'marcus' | 'tony';
export interface BroadcastLine { speaker: BroadcastSpeaker; text: string }

export interface BroadcastContext {
  homeAbbr: string;
  awayAbbr: string;
  /** Spoken instead of the abbreviation ("Boston", not "BOS"). */
  homeName: string;
  awayName: string;
}

const TONY_THREE = [
  "From DOWNTOWN! He didn't even hesitate!",
  "Splash! You leave him open, that's what happens!",
  "Bang! Nothing but the bottom of the net!",
  "That's a big-time shot! Look at the confidence!",
  "Wet! You could see it the second it left his hand!",
];
const TONY_DUNK = [
  "Oh, he THREW it down! Somebody check on the rim!",
  "He flushed it! That's a grown man's dunk!",
  "Oh my goodness! You do NOT want to be under that!",
];
const TONY_BLOCK = [
  "REJECTED! Not in his house!",
  "Get that outta here! He sent it to the third row!",
  "Oh, that's a grown-man block right there!",
  "He got all of that! You'd better look before you go up!",
];
const TONY_STEAL = [
  "Pick-pocket! He read that the whole way!",
  "Those are free points! You can't be careless with it!",
  "Quick hands! That's how you change a game without scoring!",
  "He was waiting on that pass! You can't throw that lazy ball!",
];
const TONY_AND1 = [
  "AND ONE! He's strong with it!",
  "Through the contact! That's a three-point play!",
  "They hit him, and it didn't matter! Put him on the line!",
];
const TONY_RUN = [
  "Somebody call a timeout!",
  "They're rolling now, and the building's shaking!",
  "That's a momentum swing you can feel from up here!",
];
const TONY_LEAD = [
  "And just like that, we've got a new leader!",
  "Lead's flipped! This one's a fistfight!",
];
const tonyHeat = (name: string) => [
  `${name} is HEATING up! Somebody put a hand in his face!`,
  `Get ${name} the ball! He's feeling it!`,
];
const tonyFire = (name: string) => [
  `${name} is ON FIRE! The rim looks like an ocean to him!`,
  `You can't guard ${name} right now! Nobody can!`,
];
const TONY_BUZZER = [
  "At the BUZZER! Are you kidding me?!",
  "Beat the horn! What a way to end it!",
];

function clockSecs(clock: string): number {
  const [m, s] = clock.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

function periodName(q: number): string {
  if (q <= 4) return ['first', 'second', 'third', 'fourth'][q - 1];
  return q === 5 ? 'overtime' : `${ordinal(q - 4)} overtime`;
}
function ordinal(n: number): string {
  return n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`;
}

/**
 * Feed text names players "J. Tatum" and appends "(B. Smart assists)"; read
 * literally that's "J Tatum" — robotic. Drop the initials, turn the assist
 * into a natural tag, and strip emoji/score noise. The on-screen feed is
 * untouched.
 */
export function speakable(text: string): string {
  return text
    .replace(/\b[A-Z]\.\s+(?=[A-ZÀ-Þ])/g, '')
    .replace(/\bJ\b(?!\.)/g, 'jumper') // "nails the baseline J"
    .replace(/\(([^()]+?) assists\)/, '— $1 with the assist')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+—\s+turnover$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Whether an event gets a spoken call (others reveal on a silent beat). */
export function isCalled(e: LiveEvent, moment?: Moment): boolean {
  if (e.quiet || e.kind === 'sub' || e.kind === 'foul') return false;
  if (e.kind === 'period') return true;
  if (e.kind === 'make2' || e.kind === 'make3' || e.kind === 'steal' || e.kind === 'block') return true;
  if (e.kind === 'turnover') return true;
  // Free throws, misses and boards only matter when the game's on the line.
  if (moment?.crunch && (e.kind === 'ft' || e.kind === 'miss')) return true;
  return false;
}

function scoreLine(e: LiveEvent, ctx: BroadcastContext): string {
  if (e.home === e.away) return `All tied at ${e.home}.`;
  const lead = e.home > e.away ? ctx.homeName : ctx.awayName;
  const hi = Math.max(e.home, e.away), lo = Math.min(e.home, e.away);
  return `${lead} ${hi}-${lo}.`;
}

/** Plays between generic shouts, so Tony's analysis isn't drowned out by "Splash!". */
const MIN_CALLS_BETWEEN_SHOUTS = 4;

/** Runs get called once each at these sizes, not on every bucket. */
const RUN_TIERS = [8, 14, 20];

interface Mic { lastTony: number; runTier: number }

/** What Tony says on this called play, if anything. */
function colorFor(
  e: LiveEvent, beat: EventBeat | undefined, moment: Moment | undefined,
  state: GameState, memory: Memory, mic: Mic, ctx: BroadcastContext,
): string | null {
  const chip = moment?.chip?.text ?? '';
  const name = /^[A-Z]\. (\S+)/.exec(e.text)?.[1] ?? 'He';
  const late = moment?.crunch || (e.quarter >= 4 && clockSecs(e.clock) <= 300);

  if (/BUZZER/.test(chip)) return nextFrom(TONY_BUZZER, 'buzzer', memory);
  if (/ON FIRE/.test(chip)) return nextFrom(tonyFire(name), 'fire', memory);

  // The scoring side's run, once per tier. A bucket that isn't part of one resets it.
  if (e.scoring) {
    const runPts = Number(/(\d+)-0/.exec(beat?.runText ?? '')?.[1] ?? 0);
    if (!runPts) mic.runTier = 0;
    const tier = RUN_TIERS.filter(t => runPts >= t).at(-1) ?? 0;
    if (tier > mic.runTier) {
      mic.runTier = tier;
      const team = e.side === 'home' ? ctx.homeName : ctx.awayName;
      return `${team} is on ${runPts === 8 || runPts === 11 || runPts === 18 ? 'an' : 'a'} ${runPts}-0 run! ${nextFrom(TONY_RUN, 'run', memory)}`;
    }
  }
  if (beat?.leadChange && late) return nextFrom(TONY_LEAD, 'lead', memory);

  const read = readForEvent(state, e, ctx, memory);
  if (read) return read;

  if (memory.called - mic.lastTony < MIN_CALLS_BETWEEN_SHOUTS) return null;
  const dunk = e.kind === 'make2' && /throws it down|flushes|dunk/i.test(e.text);
  if (e.and1) return nextFrom(TONY_AND1, 'and1', memory);
  if (/heating up/.test(chip)) return nextFrom(tonyHeat(name), 'heat', memory);
  if (e.kind === 'block') return nextFrom(TONY_BLOCK, 'block', memory);
  if (e.kind === 'steal') return nextFrom(TONY_STEAL, 'steal', memory);
  if (e.kind === 'make3') return nextFrom(TONY_THREE, 'three', memory);
  if (dunk) return nextFrom(TONY_DUNK, 'dunk', memory);
  return null;
}

/**
 * Replays the game up to `index`: the running numbers, plus what Tony says on
 * this event. Replaying from the top (rather than from where the listener
 * joined) keeps a play's lines the same however the broadcast got there.
 */
function replayTo(
  events: LiveEvent[], beats: EventBeat[], moments: Moment[], index: number, ctx: BroadcastContext,
): { state: GameState; color: string | null } {
  const state = newGameState();
  const memory = newMemory(gameSeed(events));
  const mic: Mic = { lastTony: -100, runTier: 0 };
  let color: string | null = null;
  for (let i = 0; i <= index; i++) {
    const e = events[i];
    applyEvent(state, e);
    if (e.kind === 'period' || !isCalled(e, moments[i])) continue;
    memory.called++;
    const said = colorFor(e, beats[i], moments[i], state, memory, mic, ctx);
    if (said) mic.lastTony = memory.called;
    if (i === index) color = said;
  }
  return { state, color };
}

/** The lines for the event at `index` ([] when it isn't called). */
export function broadcastClipLines(
  events: LiveEvent[],
  beats: EventBeat[],
  moments: Moment[],
  index: number,
  fromIndex: number,
  ctx: BroadcastContext,
): BroadcastLine[] {
  const e = events[index];
  if (!e) return [];
  const beat = beats[index];
  const moment = moments[index];
  const lines: BroadcastLine[] = [];

  // Show open, folded into whichever clip is first.
  if (index === fromIndex) {
    lines.push({
      speaker: 'marcus',
      text: fromIndex === 0
        ? `Welcome in, everybody — Marcus Cole alongside Tony Blaze for ${ctx.awayName} at ${ctx.homeName}. We're set for the tip.`
        : `Marcus Cole and Tony Blaze joining you here in the ${periodName(e.quarter)}. ${scoreLine(events[Math.max(0, index - 1)] ?? e, ctx)}`,
    });
    lines.push({ speaker: 'tony', text: fromIndex === 0 ? `Let's GO! I've been waiting on this one all day!` : `Let's get into it!` });
  }

  if (e.kind === 'period') {
    const { state } = replayTo(events, beats, moments, index, ctx);
    if (/overtime!?$/i.test(e.text) && !/^End/i.test(e.text)) {
      lines.push({ speaker: 'marcus', text: `Tied at the end of regulation — we are going to overtime!` });
      lines.push({ speaker: 'tony', text: `FREE BASKETBALL! I love it!` });
    } else if (/^Final/i.test(e.text)) {
      lines.push({ speaker: 'marcus', text: `And that's the ballgame. Final from here: ${ctx.awayName} ${e.away}, ${ctx.homeName} ${e.home}. Thanks for listening.` });
      const wrap = periodRead(state, e, ctx, true);
      if (wrap) lines.push({ speaker: 'tony', text: wrap });
    } else if (e.quarter === 2) {
      lines.push({ speaker: 'marcus', text: `That's the half. ${ctx.awayName} ${e.away}, ${ctx.homeName} ${e.home}.` });
      const read = periodRead(state, e, ctx, false);
      if (read) lines.push({ speaker: 'tony', text: read });
    } else {
      lines.push({ speaker: 'marcus', text: `That'll end the ${periodName(e.quarter)}. ${ctx.awayName} ${e.away}, ${ctx.homeName} ${e.home}.` });
      const read = periodRead(state, e, ctx, false);
      if (read) lines.push({ speaker: 'tony', text: read });
    }
    return lines.map(l => ({ ...l, text: sayNames(l.text, ctx) }));
  }

  if (!isCalled(e, moment)) return lines.map(l => ({ ...l, text: sayNames(l.text, ctx) }));

  // Marcus calls the play, with the score whenever it matters.
  let call = sentence(speakable(e.text));
  const late = moment?.crunch || (e.quarter >= 4 && clockSecs(e.clock) <= 300);
  if (e.scoring && (beat?.leadChange || beat?.tie || beat?.runText || late || index % 4 === 0)) {
    call += ` ${scoreLine(e, ctx)}`;
  }
  if (e.kind === 'ft' && !e.scoring && moment?.crunch) call += ' Big misses at the line.';
  lines.push({ speaker: 'marcus', text: call });

  const { color } = replayTo(events, beats, moments, index, ctx);
  if (color) lines.push({ speaker: 'tony', text: color });

  return lines.map(l => ({ ...l, text: sayNames(l.text, ctx) }));
}

/** Say the city, not the abbreviation ("BOS brings the starters back"). */
function sayNames(s: string, ctx: BroadcastContext): string {
  return s
    .replace(new RegExp(`\\b${ctx.awayAbbr}\\b`, 'g'), ctx.awayName)
    .replace(new RegExp(`\\b${ctx.homeAbbr}\\b`, 'g'), ctx.homeName);
}

/**
 * Silent on-screen beat (ms) for an uncalled event at a given speed — mirrors
 * the viewer's own pacing (boards flash, period breaks linger) but quicker,
 * since the calls carry the rhythm.
 */
export function silentBeatMs(e: LiveEvent | undefined, speed: number): number {
  if (!e) return 0;
  let ms = 450 / speed;
  if (e.quiet || e.kind === 'sub') ms *= 0.2;
  else if (e.kind === 'rebound' || e.kind === 'foul') ms *= 0.6;
  return Math.round(ms);
}

/** Total clips a broadcast would request from `fromIndex` (for tests/costing). */
export function countCalls(events: LiveEvent[], beats: EventBeat[], moments: Moment[], fromIndex: number, ctx: BroadcastContext): number {
  let n = 0;
  for (let i = fromIndex; i < events.length; i++) if (broadcastClipLines(events, beats, moments, i, fromIndex, ctx).length) n++;
  return n;
}
