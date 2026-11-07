/**
 * Live game broadcast script.
 *
 * Turns a live-game PlayEvent into the two-voice call for that play — Marcus
 * Cole on play-by-play, Tony Blaze on color — that /api/game-audio feeds to
 * ElevenLabs. Works for both event sources: the pre-computed sim (descriptions
 * tag players "S. Barkley RB") and the Live Coach engine (plain "S. Barkley",
 * with an optional "HB Dive — " call prefix).
 *
 * The on-screen feed text is written to be read, not heard, so calls are built
 * from the event's structured data: who has it, the down and distance, whether
 * it moved the chains, and the score after anything that changes it. Tony's read
 * on the whole game (who's rolling, what the trailing team needs) is in gameRead.ts.
 *
 * DETERMINISTIC: no Math.random. Variety is keyed off event.id so the same
 * game always produces the same script — which is what makes the server-side
 * audio cache hit on a re-watch (same lines → same md5 → same mp3).
 */

import type { PlayEvent } from './playByPlay';
import {
  applyPlay, breakRead, extractPlayers, gameSeed, isNonPlayRun, isScrimmage, isTouchdown, newGameState, newMemory,
  nextFrom, PLAYER_RE, readForPlay, type GameState, type Memory,
} from './gameRead';

export interface BroadcastLine {
  speaker: 'marcus' | 'tony';
  text: string;
}

const TONY_TD = [
  "Are you KIDDING me?! That's what I'm talking about!",
  "SIX POINTS! Put it on the board!",
  "That's six! You love to see a drive finished off like that!",
  "Get it in the end zone! THAT is how you finish a drive!",
];
const TONY_TURNOVER = [
  "You can't do that! You just CAN'T do that in this spot!",
  "He gave it away! Momentum just flipped on its head!",
  "Oh, that's a back-breaker. That one's gonna sting.",
];
const TONY_FUMBLE_KEPT = [
  "Whew! Ball's on the ground and they get it back. Lucky, lucky.",
  "Hold onto that thing! They dodged one there.",
];
const TONY_SACK = [
  "BURIED him! The pocket collapsed and he had nowhere to go!",
  "Get him DOWN! That's a drive-killer right there.",
  "He never had a chance! That's a great rush off the edge!",
  "Oh, that hurts! That puts them way behind the sticks!",
];
const TONY_FG = [
  "Three points on the board. Take what they give you, I get it.",
  "Not flashy, but it counts.",
];
const TONY_BIG_PLAY = [
  "Oh, somebody blew that coverage! That's a chunk!",
  "THAT is a big-time play right there!",
  "Now we're talking! That flips the whole field!",
];
const TONY_FOURTH_CONVERT = [
  "Guts! You gotta love the guts on that call!",
  "They went for it and they GOT it! Huge!",
  "That's a coach who trusts his guys! Big-time conversion!",
];
const TONY_FOURTH_STOP = [
  "Stuffed! You roll the dice, sometimes you pay for it!",
  "What a stop! The defense answers the bell!",
  "They left it all out there, and they came up empty!",
];
const TONY_LEAD_CHANGE = [
  "And just like that, we have got a new leader!",
  "Lead's flipped! Buckle up, folks!",
];

/** Deterministic pick from a list keyed off an event id (no RNG). Hashed, since
 *  plain ids would alternate in step with a run-pass-run-pass drive. */
function pick(list: string[], seed: number): string {
  return list[(Math.abs(seed) * 2654435761 >>> 0) % list.length];
}

/** Strip player-tag noise, emoji and parentheticals from a description. */
function cleanForSpeech(desc: string): string {
  return desc
    .replace(PLAYER_RE, '$1')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{23E9}-\u{23FA}]/gu, '')
    .replace(/\(([^()]*)\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Drop a Live Coach call prefix ("HB Dive — S. Barkley runs it in…"). */
function stripCallPrefix(s: string): string {
  return s.replace(/^[A-Z][A-Za-z0-9 '&/-]{0,28} — (?=[A-Z])/, '');
}

const yd = (n: number) => `${n} yard${n === 1 ? '' : 's'}`;
const DOWN_WORDS = ['', 'First', 'Second', 'Third', 'Fourth'];
const QUARTER_WORDS = ['', 'first', 'second', 'third', 'fourth'];

/** Spoken names for the two sides. */
interface Sides { home: string; away: string; }
const teamOf = (side: 'home' | 'away', s: Sides) => s[side];
const otherOf = (side: 'home' | 'away', s: Sides) => s[side === 'home' ? 'away' : 'home'];

/** "their own 30" / "midfield" / "the Dallas 40" — fieldPos is yards from own end zone. */
function spotPhrase(ev: PlayEvent, s: Sides): string {
  if (ev.fieldPos === 50) return 'midfield';
  if (ev.fieldPos < 50) return `their own ${ev.fieldPos}`;
  return `the ${otherOf(ev.possession, s)} ${100 - ev.fieldPos}`;
}

function scorePhrase(home: number, away: number, s: Sides): string {
  if (home === away) return home === 0 ? 'Still scoreless.' : `All tied up at ${home}.`;
  const [lead, hi, trail, lo] = home > away
    ? [s.home, home, s.away, away] as const
    : [s.away, away, s.home, home] as const;
  return `${lead} ${hi}, ${trail} ${lo === 0 ? 'nothing' : lo}.`;
}

/**
 * The score once this event's points count. Both sims stamp a field goal with
 * the score from BEFORE the kick (points land right after the event is pushed);
 * extra points and two-point tries already include theirs.
 */
function scoreAfter(ev: PlayEvent): { home: number; away: number } {
  const pts = ev.type === 'field_goal_good' ? 3 : 0;
  return {
    home: ev.homeScore + (ev.possession === 'home' ? pts : 0),
    away: ev.awayScore + (ev.possession === 'away' ? pts : 0),
  };
}

/** Who has it and what they need, said before the snap on the downs that matter. */
function situationLead(ev: PlayEvent, prev: PlayEvent | undefined, s: Sides): string {
  if (!isScrimmage(ev) || isNonPlayRun(ev) || ev.down < 1) return '';
  if (prev && prev.possession !== ev.possession) return `${teamOf(ev.possession, s)} takes over at ${spotPhrase(ev, s)}. `;
  if (ev.down >= 3) {
    const toGo = ev.fieldPos + ev.yardsToGo >= 100 ? 'goal' : ev.yardsToGo;
    return ev.down === 4
      ? `Fourth and ${toGo}, and they're going for it. `
      : `${DOWN_WORDS[ev.down]} and ${toGo}. `;
  }
  return '';
}

function runCall(ev: PlayEvent, name: string, isQb: boolean): string {
  const y = ev.yardsGained;
  if (y <= 0) {
    const result = y === 0 ? 'no gain' : `a loss of ${yd(-y)}`;
    return pick([`${name} is stopped for ${result}.`, `Nothing there for ${name}, ${result}.`], ev.id);
  }
  if (y >= 15) return pick([`${name} breaks free! A ${y}-yard run!`, `${name} is loose! He goes for ${y}!`], ev.id);
  if (y >= 8) return pick([`${name} picks up ${yd(y)} on the ground.`, `Nice run by ${name}, ${yd(y)}.`], ev.id);
  if (isQb) return pick([`${name} keeps it himself for ${yd(y)}.`, `${name} tucks it and runs, ${yd(y)}.`], ev.id);
  if (y >= 4) return pick([`${name} gets ${yd(y)} on the carry.`, `${name} finds a crease for ${y}.`, `Handoff to ${name}, ${yd(y)}.`], ev.id);
  return pick([`${name} for ${yd(y)}.`, `${name} hits the line, picks up ${y}.`, `Tough yards for ${name}, a gain of ${y}.`], ev.id);
}

function passCall(ev: PlayEvent, qb: string | undefined, rec: string | undefined): string {
  const y = ev.yardsGained;
  if (!rec) return stripCallPrefix(cleanForSpeech(ev.description));
  const gain = y === 0 ? 'no gain' : y < 0 ? `a loss of ${-y}` : yd(y);
  if (!qb) return pick([`Complete to ${rec}, ${gain}.`, `${rec} with the catch, ${gain}.`], ev.id);
  if (y <= 4) return pick([`${qb} dumps it off to ${rec}, ${gain}.`, `Quick throw to ${rec}, ${gain}.`], ev.id);
  if (y >= 25) return pick([`${qb} goes deep, and ${rec} has it! ${y} yards!`, `${qb} airs it out, ${rec} hauls it in! ${y} yards!`], ev.id);
  if (y >= 12) return pick([`${qb} finds ${rec} over the middle for ${yd(y)}.`, `${qb} fires to ${rec}, that's good for ${y}.`, `Big completion, ${qb} to ${rec} for ${y}.`], ev.id);
  return pick([`${qb} finds ${rec} for ${yd(y)}.`, `${qb} to ${rec}, ${yd(y)}.`, `${qb} hits ${rec}, a gain of ${y}.`], ev.id);
}

/** Move the sticks, or set up what's coming next. */
function situationTail(ev: PlayEvent, next: PlayEvent | undefined, s: Sides): string {
  if (!isScrimmage(ev) || isNonPlayRun(ev) || isTouchdown(ev)) return '';
  if (ev.type === 'interception' || ev.type === 'fumble' || ev.down < 1) return '';
  const y = ev.yardsGained;
  if (y >= ev.yardsToGo && ev.yardsToGo > 0) {
    return pick([` First down, ${teamOf(ev.possession, s)}.`, ' Moves the chains.', ' First down.'], ev.id);
  }
  // Not when they're about to go for it: that call says fourth and whatever itself.
  if (ev.down === 3 && !(next && next.down === 4 && isScrimmage(next))) return ` Fourth and ${ev.yardsToGo - y} coming up.`;
  return '';
}

/** Marcus's call for one play. */
function playByPlayLine(ev: PlayEvent, prev: PlayEvent | undefined, next: PlayEvent | undefined, s: Sides): string {
  const players = extractPlayers(ev.description);
  const bare = cleanForSpeech(ev.description);

  switch (ev.type) {
    case 'kickoff': {
      const rest = bare.replace(/^(Kicking team lines up — kickoff\.?|Kickoff to start the drive\.?|Ball put into play on the kickoff\.?)\s*/i, '');
      return `${pick(["Here's the kick.", 'The kick is away.', "Here's the kickoff."], ev.id)} ${rest}`.trim();
    }
    case 'punt': {
      if (/return/i.test(bare)) return bare.replace(/^Punt — /, 'Punt, ');
      const yards = bare.match(/(\d+)[- ]yard/)?.[1];
      return yards ? `${teamOf(ev.possession, s)} punts it away, ${yards} yards.` : bare;
    }
    case 'penalty':
      return `Flag on the play. ${bare.replace(/^(Penalty —|Flag on the play!)\s*/, '')}`;
    case 'quarter_end': {
      const name = ev.quarter > 4 ? 'overtime' : `${QUARTER_WORDS[ev.quarter]} quarter`;
      return `That's the end of the ${name}. ${scorePhrase(ev.homeScore, ev.awayScore, s)}`;
    }
    case 'two_minute_warning':
      return `Two-minute warning. ${scorePhrase(ev.homeScore, ev.awayScore, s)}`;
    case 'extra_point': {
      const missed = /no good|fails|wide|miss/i.test(bare);
      const call = /two-point/i.test(bare) ? bare : missed ? 'The extra point is no good!' : 'The extra point is good.';
      return `${call} ${scorePhrase(ev.homeScore, ev.awayScore, s)}`;
    }
    case 'field_goal_good': {
      const after = scoreAfter(ev);
      return `${bare} ${scorePhrase(after.home, after.away, s)}`;
    }
    default:
      break;
  }

  if (isTouchdown(ev) || ev.type === 'interception') return stripCallPrefix(bare);
  if (ev.type === 'run' && isNonPlayRun(ev)) return bare;

  const lead = situationLead(ev, prev, s);
  const tail = situationTail(ev, next, s);

  // Untagged names (Live Coach) are in reading order: passer, then target.
  const untagged = players.filter(p => !p.pos);
  const qb = players.find(p => p.pos === 'QB')?.last ?? (untagged.length >= 2 ? untagged[0].last : undefined);
  const rec = players.find(p => p.pos && p.pos !== 'QB')?.last ?? (untagged.length >= 2 ? untagged[1].last : untagged[0]?.last);

  if (ev.type === 'run') {
    const carrier = players[0];
    if (!carrier) return `${lead}${stripCallPrefix(bare)}`;
    return `${lead}${runCall(ev, carrier.last, carrier.pos === 'QB')}${tail}`;
  }
  if (ev.type === 'pass_complete') return `${lead}${passCall(ev, qb, rec)}${tail}`;
  if (ev.type === 'pass_incomplete') {
    const call = !rec
      ? `${qb ?? 'The quarterback'}'s pass falls incomplete.`
      : !qb
        ? `Incomplete, intended for ${rec}.`
        : pick([`${qb}'s pass for ${rec} falls incomplete.`, `${qb} looks for ${rec}, incomplete.`, `Incomplete, intended for ${rec}.`], ev.id);
    return `${lead}${call}${tail}`;
  }
  if (ev.type === 'sack') {
    const defender = players.find(p => p.pos && p.pos !== 'QB')?.last;
    const passer = players.find(p => p.pos === 'QB')?.last ?? untagged[0]?.last;
    const loss = `a loss of ${yd(Math.abs(ev.yardsGained))}`;
    const call = defender
      ? `${defender} gets to ${passer ?? 'the quarterback'}. Sack, ${loss}.`
      : `${passer ?? 'The quarterback'} is sacked, ${loss}.`;
    return `${lead}${call}${tail}`;
  }
  return `${lead}${stripCallPrefix(bare)}${tail}`;
}

/** Did this score flip who's ahead? (A tie on either side isn't a lead change.) */
function leadChanged(ev: PlayEvent, prev: PlayEvent | undefined): boolean {
  const before = ev.type === 'extra_point' ? prev : ev;
  if (!before) return false;
  const after = scoreAfter(ev);
  const was = Math.sign(before.homeScore - before.awayScore);
  const now = Math.sign(after.home - after.away);
  return was !== 0 && now !== 0 && was !== now;
}

/** The shout for a notable play, or null for a routine one. */
function tonyReaction(ev: PlayEvent, prev: PlayEvent | undefined, next: PlayEvent | undefined, mem: Memory): string | null {
  const d = ev.description.toUpperCase();
  const shout = (list: string[]) => nextFrom(list, list[0], mem);
  if (isTouchdown(ev)) return shout(TONY_TD);
  if (ev.type === 'interception' || d.includes('INTERCEPT')) return shout(TONY_TURNOVER);
  if (ev.type === 'fumble' || d.includes('FUMBLE')) {
    // The offense recovers some of these. Live Coach has no next event yet, so
    // it only hears the "gave it away" line when the feed says so outright.
    const kept = next ? next.possession === ev.possession : !d.includes('RECOVERED BY');
    return shout(kept ? TONY_FUMBLE_KEPT : TONY_TURNOVER);
  }
  if (ev.type === 'sack' || d.includes('SACK')) return shout(TONY_SACK);
  if ((ev.type === 'extra_point' || ev.type === 'field_goal_good') && ev.quarter >= 4 && leadChanged(ev, prev)) {
    return shout(TONY_LEAD_CHANGE);
  }
  if (ev.type === 'field_goal_good' && ev.id % 2 === 0) return shout(TONY_FG);
  if (!isScrimmage(ev) || isNonPlayRun(ev)) return null;
  if (ev.down === 4) return shout(ev.yardsGained >= ev.yardsToGo ? TONY_FOURTH_CONVERT : TONY_FOURTH_STOP);
  if (ev.yardsGained >= 25) return shout(TONY_BIG_PLAY);
  return null;
}

/** Plays worth Tony's read that the play-by-play doesn't otherwise have a beat for. */
const hasCall = (ev: PlayEvent) =>
  ev.type !== 'halftime' && ev.type !== 'final' && ev.type !== 'quarter_end' && ev.type !== 'two_minute_warning';

/**
 * Replays the game up to `index`: the running numbers, plus what Tony says on
 * this play. Replaying from the top (rather than from where the listener joined)
 * keeps a play's lines the same however the broadcast got there.
 */
function replayTo(events: PlayEvent[], index: number, names: Sides): { state: GameState; color: string | null } {
  const state: GameState = newGameState();
  const memory: Memory = newMemory(gameSeed(events));
  let color: string | null = null;
  for (let i = 0; i <= index; i++) {
    const ev = events[i];
    applyPlay(state, ev, events[i + 1]);
    if (!hasCall(ev)) continue;
    memory.plays++;
    // A read about this play beats a generic shout, which beats nothing.
    const said = readForPlay(state, ev, names, memory) ?? tonyReaction(ev, events[i - 1], events[i + 1], memory);
    if (i === index) color = said;
  }
  return { state, color };
}

/**
 * The commentary lines for a SINGLE play. One clip per event so the reveal can
 * be gated on the audio. The show open is folded into the first clip. Returns
 * [] for a play with nothing to say (the caller still reveals it, on a brief
 * silent beat). Pass fromIndex -1 for no show open (after a skip).
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
  const prev = events[index - 1];
  const next = events[index + 1];
  const sides: Sides = { home: homeName, away: awayName };
  const lines: BroadcastLine[] = [];

  // Say the city, not the abbreviation — feed text ("DAL goes for two") embeds the tag.
  const finish = () => lines.map(l => ({
    ...l,
    text: l.text
      .replace(new RegExp(`\\b${awayAbbr}\\b`, 'g'), awayName)
      .replace(new RegExp(`\\b${homeAbbr}\\b`, 'g'), homeName),
  }));

  // Joining mid-game, the current play has already been shown: catch the
  // listener up on the score rather than re-calling it.
  if (index === fromIndex && fromIndex > 0) {
    const name = ev.quarter > 4 ? 'overtime' : `the ${QUARTER_WORDS[ev.quarter]} quarter`;
    lines.push({ speaker: 'marcus', text: `Marcus Cole and Tony Blaze joining you in ${name}. ${scorePhrase(ev.homeScore, ev.awayScore, sides)}` });
    lines.push({ speaker: 'tony', text: `Let's get into it!` });
    return finish();
  }

  if (index === fromIndex) {
    lines.push({ speaker: 'marcus', text: `Welcome in, everybody. Marcus Cole with Tony Blaze for ${awayName} at ${homeName}. We're ready for the kick.` });
    lines.push({ speaker: 'tony', text: `Let's GO!` });
  }

  const { state, color } = replayTo(events, index, sides);
  const summary = (final: boolean) => breakRead(state, ev.homeScore, ev.awayScore, ev.quarter, sides, final);

  if (ev.type === 'halftime') {
    lines.push({ speaker: 'marcus', text: `That's the half. ${scorePhrase(ev.homeScore, ev.awayScore, sides)}` });
    const read = summary(false);
    if (read) lines.push({ speaker: 'tony', text: read });
  } else if (ev.type === 'final') {
    lines.push({ speaker: 'marcus', text: `That's the ballgame. Final score: ${scorePhrase(ev.homeScore, ev.awayScore, sides)} Thanks for listening.` });
    const read = summary(true);
    if (read) lines.push({ speaker: 'tony', text: read });
  } else if (ev.description?.trim()
    // The half and final calls carry the score, so don't say it twice in a row.
    && !(ev.type === 'quarter_end' && (next?.type === 'halftime' || next?.type === 'final'))) {
    lines.push({ speaker: 'marcus', text: playByPlayLine(ev, prev, next, sides) });
    if (ev.type === 'quarter_end') {
      const read = summary(false);
      if (read) lines.push({ speaker: 'tony', text: read });
    } else if (color) {
      lines.push({ speaker: 'tony', text: color });
    }
  }

  return finish();
}

/**
 * End (exclusive event index) of the free broadcast teaser that starts at `from`: one drive. A drive runs until
 * the other team has the ball, the next kickoff, or the half/game ends (the "that's the half" call is kept).
 * Kickoffs are logged on the kicking team's possession, so a teaser that starts on one follows the receiving team.
 * If that drive is very short (started right before a punt), the next drive is included too; never more than
 * `maxPlays` events, so the free taste stays a taste.
 */
export function teaserEndIndex(events: PlayEvent[], from: number, maxPlays = 18): number {
  const cap = Math.min(events.length, from + maxPlays);
  const driveEnd = (start: number): number => {
    const first = events[start];
    if (!first) return cap;
    const team = first.type === 'kickoff' ? (events[start + 1]?.possession ?? first.possession) : first.possession;
    for (let i = start + 1; i < cap; i++) {
      const ev = events[i];
      if (ev.type === 'halftime' || ev.type === 'final') return i + 1;
      if (ev.type === 'kickoff' || ev.possession !== team) return i;
    }
    return cap;
  };
  let end = driveEnd(from);
  if (end - from < 4 && end < cap && events[end - 1]?.type !== 'halftime' && events[end - 1]?.type !== 'final') end = driveEnd(end);
  return Math.max(end, Math.min(from + 1, cap));
}
