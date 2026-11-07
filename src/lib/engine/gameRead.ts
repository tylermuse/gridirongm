/**
 * Tony Blaze's read on the game: the color commentary that comes from watching
 * the whole game instead of the last play. Who's running wild and should keep
 * getting the ball, what the team getting beat has to change.
 *
 * Works from the events alone because Live Coach games have no bucket snapshots.
 * It replays them up to the current play, so Tony only knows what the listener
 * has seen, and it stays deterministic so a re-watch hits the audio cache.
 *
 * Pure + client-safe: no React, no Node APIs.
 */

import type { PlayEvent } from './playByPlay';

export type Side = 'home' | 'away';

const POSITIONS = 'QB|RB|FB|HB|WR|TE|OL|OT|OG|C|DL|DE|DT|LB|CB|S|FS|SS|K|P';
// "S. Barkley RB" (pre-computed sim) or "S. Barkley" (Live Coach engine). Read
// literally that's "S Barkley RB gets 6", so we keep just the last name.
export const PLAYER_RE = new RegExp(
  `\\b[A-Z]\\.\\s+((?:(?:St\\.|De|Van|Von|Mc)\\s+)?[A-ZÀ-Þ][A-Za-zÀ-ÿ'’\\-]+(?:\\s+(?:Jr\\.?|Sr\\.?|II|III|IV))?)(?:\\s+(${POSITIONS}))?(?![A-Za-z])`,
  'g',
);

export interface TaggedPlayer { last: string; pos: string | undefined; }

export function extractPlayers(desc: string): TaggedPlayer[] {
  const out: TaggedPlayer[] = [];
  // Live Coach writes "S. Barkley's pass to…": we add our own possessives.
  for (const m of desc.matchAll(PLAYER_RE)) out.push({ last: m[1].replace(/['’]s$/, ''), pos: m[2] });
  return out;
}

export const isScrimmage = (ev: PlayEvent) =>
  ev.type === 'run' || ev.type === 'pass_complete' || ev.type === 'pass_incomplete' ||
  ev.type === 'sack' || ev.type === 'interception' || ev.type === 'fumble';

/** Engine bookkeeping that arrives typed as a 'run' but isn't a carry. */
export const isNonPlayRun = (ev: PlayEvent) => /timeout|turnover on downs|takes a knee|stop the clock/i.test(ev.description);

export const isTouchdown = (ev: PlayEvent) => ev.type === 'touchdown' || /TOUCHDOWN/.test(ev.description);

/** The pre-computed sim's 'touchdown' events don't say run or pass except in the words. */
const RUSH_TD_RE = /punches it in|crosses the goal|yard rush|stretches across|Dive to the pylon/;

interface TeamLine {
  rushAtt: number; rushYds: number;
  passAtt: number; passComp: number; passYds: number; passTds: number;
  turnovers: number; sacksTaken: number; sacksMade: number;
  thirdAtt: number; thirdConv: number;
}
const emptyTeam = (): TeamLine => ({
  rushAtt: 0, rushYds: 0, passAtt: 0, passComp: 0, passYds: 0, passTds: 0,
  turnovers: 0, sacksTaken: 0, sacksMade: 0, thirdAtt: 0, thirdConv: 0,
});

interface SkillLine { name: string; side: Side; carries: number; rushYds: number; catches: number; recYds: number; tds: number; sacks: number }

export interface GameState {
  team: Record<Side, TeamLine>;
  players: Map<string, SkillLine>;
  /** Passers seen per side. Claims about "the QB" need exactly one. */
  passers: Record<Side, Set<string>>;
  maxDeficit: Record<Side, number>;
}

export function newGameState(): GameState {
  return {
    team: { home: emptyTeam(), away: emptyTeam() },
    players: new Map(),
    passers: { home: new Set(), away: new Set() },
    maxDeficit: { home: 0, away: 0 },
  };
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pct = (m: number, a: number) => (a > 0 ? m / a : 0);
const plural = (n: number, word: string) => `${n === 0 ? 'no' : n} ${word}${n === 1 ? '' : 's'}`;

function skill(g: GameState, side: Side, name: string): SkillLine {
  const key = `${side}:${name}`;
  let p = g.players.get(key);
  if (!p) { p = { name, side, carries: 0, rushYds: 0, catches: 0, recYds: 0, tds: 0, sacks: 0 }; g.players.set(key, p); }
  return p;
}

/** Fold one play into the running numbers. `next` settles who kept a fumble. */
export function applyPlay(g: GameState, ev: PlayEvent, next: PlayEvent | undefined): void {
  const side = ev.possession;
  const t = g.team[side];
  const players = extractPlayers(ev.description);
  const td = isTouchdown(ev);
  const untagged = players.filter(p => !p.pos);
  const qb = players.find(p => p.pos === 'QB')?.last ?? (untagged.length >= 2 ? untagged[0].last : undefined);
  const target = players.find(p => p.pos && p.pos !== 'QB')?.last ?? (untagged.length >= 2 ? untagged[1].last : untagged[0]?.last);

  const isRun = (ev.type === 'run' && !isNonPlayRun(ev)) || (ev.type === 'touchdown' && RUSH_TD_RE.test(ev.description));
  const isCatch = ev.type === 'pass_complete' || (ev.type === 'touchdown' && !isRun);

  if (isRun) {
    t.rushAtt++;
    t.rushYds += ev.yardsGained;
    const carrier = players[0];
    if (carrier) {
      const p = skill(g, side, carrier.last);
      p.carries++;
      p.rushYds += ev.yardsGained;
      if (td) p.tds++;
    }
  } else if (isCatch) {
    t.passAtt++;
    t.passComp++;
    t.passYds += ev.yardsGained;
    if (td) t.passTds++;
    if (qb) g.passers[side].add(qb);
    if (target) {
      const p = skill(g, side, target);
      p.catches++;
      p.recYds += ev.yardsGained;
      if (td) p.tds++;
    }
  } else if (ev.type === 'pass_incomplete') {
    t.passAtt++;
    if (qb) g.passers[side].add(qb);
  } else if (ev.type === 'interception') {
    t.passAtt++;
    t.turnovers++;
  } else if (ev.type === 'sack') {
    t.sacksTaken++;
    g.team[other(side)].sacksMade++;
    const defender = players.find(p => p.pos && p.pos !== 'QB');
    if (defender) skill(g, other(side), defender.last).sacks++;
  } else if (ev.type === 'fumble') {
    const lost = next ? next.possession !== side : /recovered by/i.test(ev.description);
    if (lost) t.turnovers++;
  }

  if (ev.down === 3 && ev.yardsToGo > 0 && (isScrimmage(ev) || ev.type === 'touchdown') && !isNonPlayRun(ev)) {
    t.thirdAtt++;
    if (td || (isRun || isCatch) && ev.yardsGained >= ev.yardsToGo) t.thirdConv++;
  }

  g.maxDeficit.home = Math.max(g.maxDeficit.home, ev.awayScore - ev.homeScore);
  g.maxDeficit.away = Math.max(g.maxDeficit.away, ev.homeScore - ev.awayScore);
}

// ─── The lines ────────────────────────────────────────────────────────────────

export interface Names { home: string; away: string }

export interface Memory {
  lastAt: Map<string, number>;
  count: Map<string, number>;
  /** Yards at the last mention, per player, so "he's rolling" needs new evidence. */
  mentioned: Map<string, number>;
  comebackFrom: Map<Side, number>;
  plays: number;
  lastRead: number;
  seed: number;
}

export function newMemory(seed = 0): Memory {
  return { seed, lastAt: new Map(), count: new Map(), mentioned: new Map(), comebackFrom: new Map(), plays: 0, lastRead: -100 };
}

/** A per-game offset for the wordings, so every game doesn't open with the same ones. */
export function gameSeed(events: PlayEvent[]): number {
  let h = 2166136261;
  for (const e of events.slice(0, 3)) for (let i = 0; i < e.description.length; i++) h = Math.imul(h ^ e.description.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Candidate { topic: string; cooldown: number; say: (turn: number) => string; onUse?: () => void }

const rotate = (list: string[], turn: number) => list[turn % list.length];

/** Yards that count as a big day so far. */
const bigRushing = (q: number) => (q <= 1 ? 40 : q === 2 ? 60 : q === 3 ? 80 : 100);
const bigReceiving = (q: number) => (q <= 1 ? 35 : q === 2 ? 55 : q === 3 ? 75 : 95);
const bigPassing = (q: number) => (q <= 1 ? 60 : q === 2 ? 110 : q === 3 ? 150 : 190);

/** The player who just touched the ball, if he's having a day. */
function hotPlayerRead(g: GameState, ev: PlayEvent, names: Names, mem: Memory): Candidate | null {
  const side = ev.possession;
  const team = names[side];
  const opp = names[other(side)];
  const players = extractPlayers(ev.description);
  const fresh = (key: string, value: number, step: number) => !mem.mentioned.has(key) || value - mem.mentioned.get(key)! >= step;

  if (ev.type === 'run' && !isNonPlayRun(ev) || (ev.type === 'touchdown' && RUSH_TD_RE.test(ev.description))) {
    const carrier = players[0];
    const p = carrier ? g.players.get(`${side}:${carrier.last}`) : undefined;
    if (!p || p.rushYds < bigRushing(ev.quarter) || pct(p.rushYds, p.carries) < 4.2) return null;
    const key = `rush:${side}:${p.name}`;
    if (!fresh(key, p.rushYds, 30)) return null;
    return {
      topic: 'hot-runner', cooldown: 10, onUse: () => { mem.mentioned.set(key, p.rushYds); }, say: n => rotate([
        `${p.name} has ${p.rushYds} yards on ${p.carries} carries. ${team} needs to keep feeding him until ${opp} proves they can stop it!`,
        `Give ${p.name} the rock! That's ${p.rushYds} on the ground, and ${opp} can't get him down.`,
        `${opp} has got to put another man in the box. ${p.name} is running wild, ${p.rushYds} yards!`,
      ], n),
    };
  }

  if (ev.type === 'pass_complete' || ev.type === 'touchdown') {
    const untagged = players.filter(x => !x.pos);
    const target = players.find(x => x.pos && x.pos !== 'QB')?.last ?? (untagged.length >= 2 ? untagged[1].last : untagged[0]?.last);
    const p = target ? g.players.get(`${side}:${target}`) : undefined;
    if (p && p.catches >= 3 && p.recYds >= bigReceiving(ev.quarter)) {
      const key = `rec:${side}:${p.name}`;
      if (fresh(key, p.recYds, 30)) {
        return {
          topic: 'hot-receiver', cooldown: 10, onUse: () => { mem.mentioned.set(key, p.recYds); }, say: n => rotate([
            `${p.name} has ${p.catches} catches for ${p.recYds} yards. ${opp} can't cover him. ${team}, keep going back to that well!`,
            `Get the ball to ${p.name}! ${p.recYds} yards, and nobody on ${opp} has an answer.`,
            `${opp} has to roll a safety over to ${p.name}. You can't leave him one-on-one, he's got ${p.recYds} yards!`,
          ], n),
        };
      }
    }
    const t = g.team[side];
    const qbName = g.passers[side].size === 1 ? [...g.passers[side]][0] : null;
    if (qbName && t.passAtt >= 8 && pct(t.passComp, t.passAtt) >= 0.65 && t.passYds >= bigPassing(ev.quarter)) {
      const key = `qb:${side}`;
      if (fresh(key, t.passYds, 60)) {
        return {
          topic: 'hot-qb', cooldown: 14, onUse: () => { mem.mentioned.set(key, t.passYds); }, say: n => rotate([
            `${qbName} is ${t.passComp} of ${t.passAtt} for ${t.passYds} yards. He's seeing everything out there. ${opp} has got to get him off his spot!`,
            `${t.passComp} of ${t.passAtt}! ${qbName} is dealing, and ${team} should keep putting it in his hands.`,
            `${t.passYds} yards passing for ${qbName}. Nobody's touching him back there, and when he's got time, he's picking you apart.`,
          ], n),
        };
      }
    }
  }
  return null;
}

/** What this play says about a problem that's been building. */
function trendRead(g: GameState, ev: PlayEvent, names: Names): Candidate | null {
  const side = ev.possession;
  const team = names[side];
  const opp = names[other(side)];
  const t = g.team[side];

  if ((ev.type === 'interception' || ev.type === 'fumble') && t.turnovers >= 2) {
    return {
      topic: `turnovers:${t.turnovers}`, cooldown: 0, say: () => rotate([
        `That's ${t.turnovers} turnovers for ${team}. You can't win giving ${opp} free possessions. It doesn't matter who you are!`,
        `${t.turnovers} giveaways now! ${team} is beating themselves out there.`,
      ], t.turnovers),
    };
  }
  if (ev.type === 'sack') {
    const defender = extractPlayers(ev.description).find(p => p.pos && p.pos !== 'QB');
    const d = defender ? g.players.get(`${other(side)}:${defender.last}`) : undefined;
    if (d && d.sacks >= 2) {
      return {
        topic: `sacker:${d.name}:${d.sacks}`, cooldown: 0,
        say: () => `That's ${d.sacks} sacks for ${d.name}! Who is blocking this guy? ${team} has got to slide some help his way.`,
      };
    }
    if (t.sacksTaken >= 3) {
      return {
        topic: `sacks:${t.sacksTaken}`, cooldown: 0, say: () => rotate([
          `That's ${t.sacksTaken} sacks on ${team}. Keep a back in, get the ball out quicker, do SOMETHING! You can't drop back like this.`,
          `${t.sacksTaken} sacks! That line is getting pushed around. ${team} has to run the ball or throw it quick.`,
        ], t.sacksTaken),
      };
    }
  }
  if (ev.type === 'pass_incomplete' && g.passers[side].size === 1 && t.passAtt >= 10 && pct(t.passComp, t.passAtt) <= 0.5) {
    const qb = [...g.passers[side]][0];
    return {
      topic: 'cold-qb', cooldown: 35, say: n => rotate([
        `${qb} is ${t.passComp} of ${t.passAtt}. He's off right now, so ${team} has to get him something easy. A screen, a quick slant, anything to get him going.`,
        `That drops ${qb} to ${t.passComp} of ${t.passAtt}. You've got to run the ball and take some of this off his plate.`,
      ], n),
    };
  }
  if (ev.down === 3 && ev.yardsToGo > 0 && t.thirdAtt >= 5) {
    const converted = isTouchdown(ev) || ((ev.type === 'run' || ev.type === 'pass_complete') && ev.yardsGained >= ev.yardsToGo);
    if (converted && pct(t.thirdConv, t.thirdAtt) >= 0.55) {
      return {
        topic: 'third-down-good', cooldown: 30,
        say: () => `${team} is ${t.thirdConv} of ${t.thirdAtt} on third down! ${opp} just can't get off the field, and that wears a defense out.`,
      };
    }
    if (!converted && pct(t.thirdConv, t.thirdAtt) <= 0.25 && (ev.type === 'pass_incomplete' || ev.type === 'run' || ev.type === 'pass_complete' || ev.type === 'sack')) {
      return {
        topic: 'third-down-bad', cooldown: 30,
        say: () => `${team} is ${t.thirdConv} of ${t.thirdAtt} on third down. You can't sustain anything like that. They have to stay out of those long-yardage spots.`,
      };
    }
  }
  return null;
}

/** What the team getting beat has to fix, said when the leader adds to it. */
function trailingNeedsRead(g: GameState, ev: PlayEvent, names: Names, mem: Memory): Candidate | null {
  const margin = ev.homeScore - ev.awayScore;
  const gap = Math.abs(margin);
  if (gap < 8) return null;
  const leadSide: Side = margin > 0 ? 'home' : 'away';
  const trailSide = other(leadSide);
  // The trailing team's own stalled drive, or the leader moving the ball.
  const fits = ev.type === 'extra_point' || ev.type === 'field_goal_good' || ev.type === 'punt'
    || (isScrimmage(ev) && !isNonPlayRun(ev) && ev.possession === leadSide && ev.yardsGained >= 8);
  if (!fits) return null;

  const ld = g.team[leadSide];
  const tr = g.team[trailSide];
  const lead = names[leadSide];
  const trail = names[trailSide];
  const leadQb = g.passers[leadSide].size === 1 ? [...g.passers[leadSide]][0] : null;
  const options: Candidate[] = [];

  if (ld.rushAtt >= 8 && ld.rushYds >= 60 && pct(ld.rushYds, ld.rushAtt) >= 4.2) {
    options.push({
      topic: 'needs-run-defense', cooldown: 40, say: n => rotate([
        `${lead} has ${ld.rushYds} yards on the ground. ${trail} has got to load the box and make them throw it. You can't get gashed like this!`,
        `They're just running right at ${trail}, ${ld.rushYds} rushing yards. Somebody has to fill a gap and get off a block!`,
      ], n),
    });
  }
  if (ld.passYds >= 80 && tr.sacksMade === 0) {
    options.push({
      topic: 'needs-pass-rush', cooldown: 40, say: n => rotate([
        `${trail} has no sacks, and ${leadQb ?? lead} has all day back there. You've got to send somebody! Make him move!`,
        `${ld.passYds} yards through the air, and nobody on ${trail} has touched the quarterback. Dial up a blitz!`,
      ], n),
    });
  } else if (ld.passYds >= 120 && pct(ld.passComp, ld.passAtt) >= 0.62) {
    options.push({
      topic: 'needs-coverage', cooldown: 40, say: n => rotate([
        `${lead} is ${ld.passComp} of ${ld.passAtt} through the air. ${trail}'s secondary has got to tighten up. Those receivers are running free!`,
        `${ld.passYds} passing yards. ${trail} is giving way too much cushion, so get up and challenge somebody!`,
      ], n),
    });
  }
  if (tr.rushAtt >= 7 && pct(tr.rushYds, tr.rushAtt) < 3) {
    options.push({
      topic: 'needs-run-game', cooldown: 40,
      say: () => `${trail} has ${plural(tr.rushYds, 'yard')} on ${tr.rushAtt} carries. No run game means that defense can just tee off on the pass.`,
    });
  }
  if (tr.turnovers >= ld.turnovers + 2) {
    options.push({
      topic: 'needs-ball-security', cooldown: 40,
      say: () => `${trail} has ${plural(tr.turnovers, 'turnover')} and ${lead} has ${ld.turnovers === 0 ? 'none' : ld.turnovers}. That's your ballgame right there. Hold on to the football!`,
    });
  }
  const leadYards = ld.rushYds + ld.passYds;
  const trailYards = tr.rushYds + tr.passYds;
  if (leadYards - trailYards >= 80) {
    options.push({
      topic: 'needs-yards', cooldown: 45,
      say: () => `${leadYards} total yards for ${lead}, ${trailYards} for ${trail}. That's not a fluke, that's getting beat at the line of scrimmage.`,
    });
  }
  if (ev.quarter >= 2 && gap >= 14) {
    options.push({
      topic: 'needs-turnover', cooldown: 45, say: n => rotate([
        `Down ${gap}, ${trail} needs a takeaway. Strip the ball, jump a route, I don't care how. They need a short field.`,
        `${trail} doesn't have time to go ten plays at a time anymore, not down ${gap}. They need a big play on one side of the ball.`,
      ], n),
    });
  }

  const ready = options.filter(c => {
    const last = mem.lastAt.get(c.topic);
    return last === undefined || mem.plays - last >= c.cooldown;
  });
  ready.sort((a, b) => (mem.lastAt.get(a.topic) ?? -1) - (mem.lastAt.get(b.topic) ?? -1));
  return ready[0] ?? null;
}

/** Whole-game moments: comebacks, blowouts, and tight finishes. */
function gameShapeRead(g: GameState, ev: PlayEvent, names: Names, mem: Memory): Candidate | null {
  const margin = ev.homeScore - ev.awayScore;
  const gap = Math.abs(margin);
  const [m, s] = ev.timeStr.split(':').map(Number);
  const secs = (m || 0) * 60 + (s || 0);

  if (ev.type === 'extra_point' || ev.type === 'field_goal_good') {
    const side = ev.possession;
    const down = g.maxDeficit[side];
    const nowDown = side === 'home' ? -margin : margin;
    if (down >= 14 && nowDown <= 3 && down > (mem.comebackFrom.get(side) ?? 0)) {
      return {
        topic: 'comeback', cooldown: 0, onUse: () => { mem.comebackFrom.set(side, down); }, say: n => rotate([
          `${names[side]} was down ${down}! This is a whole new ballgame!`,
          `Remember when ${names[side]} was down ${down}? Nobody on that sideline does!`,
        ], n),
      };
    }
  }
  if (ev.quarter === 4 && gap >= 21 && secs <= 480) {
    const lead = names[margin > 0 ? 'home' : 'away'];
    return {
      topic: 'blowout', cooldown: 40, say: n => rotate([
        `Up ${gap} in the fourth. ${lead} can get those starters out of there. No reason to risk anybody now.`,
        `This one's over, folks. ${gap} points, and the clock's the only thing left to beat.`,
      ], n),
    };
  }
  if (ev.quarter >= 4 && secs <= 300 && gap <= 8 && isScrimmage(ev) && !isNonPlayRun(ev)) {
    return {
      topic: 'closing-time', cooldown: 14, say: n => rotate([
        gap === 0
          ? `Tied up with the clock running down. Nobody wants to be the one who makes the mistake now.`
          : `A one-score game, and this is where it gets won. Every snap matters, and I mean every snap.`,
        `This is why you watch. Protect the football, win your matchup, and let's see who wants it.`,
      ], n),
    };
  }
  return null;
}

/**
 * Tony's read tied to this exact play. Null when there's nothing new to say, and
 * a minimum gap between reads keeps him from talking over every snap.
 */
export function readForPlay(g: GameState, ev: PlayEvent, names: Names, mem: Memory): string | null {
  if (mem.plays - mem.lastRead < MIN_PLAYS_BETWEEN_READS) return null;
  const candidates: (Candidate | null)[] = [
    gameShapeRead(g, ev, names, mem),
    trendRead(g, ev, names),
    hotPlayerRead(g, ev, names, mem),
    trailingNeedsRead(g, ev, names, mem),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const last = mem.lastAt.get(c.topic);
    if (last !== undefined && mem.plays - last < c.cooldown) continue;
    const countKey = c.topic.replace(/:.*/, '');
    const turn = (mem.count.get(countKey) ?? 0) + mem.seed;
    const text = c.say(turn);
    mem.lastAt.set(c.topic, mem.plays);
    mem.count.set(countKey, (mem.count.get(countKey) ?? 0) + 1);
    mem.lastRead = mem.plays;
    c.onUse?.();
    return text;
  }
  return null;
}

/** Rotate a shared reaction list by how often it's been used. */
export function nextFrom(list: string[], key: string, mem: Memory): string {
  const n = mem.count.get(key) ?? 0;
  mem.count.set(key, n + 1);
  return list[(n + mem.seed) % list.length];
}

/** About one read per this many plays at most. */
const MIN_PLAYS_BETWEEN_READS = 5;

/** The biggest individual line on a side, in words. */
function bestLine(g: GameState, side: Side): string | null {
  let best: { score: number; text: string } | null = null;
  const consider = (score: number, text: string) => { if (!best || score > best.score) best = { score, text }; };
  for (const p of g.players.values()) {
    if (p.side !== side) continue;
    if (p.rushYds >= 40) consider(p.rushYds * 1.6, `${p.name} has ${p.rushYds} rushing yards`);
    if (p.recYds >= 40) consider(p.recYds * 1.5, `${p.name} has ${p.recYds} receiving yards`);
  }
  const t = g.team[side];
  const qb = g.passers[side].size === 1 ? [...g.passers[side]][0] : null;
  if (qb && t.passYds >= 60) consider(t.passYds * 0.8, `${qb} is ${t.passComp} of ${t.passAtt} for ${t.passYds} yards`);
  return (best as { score: number; text: string } | null)?.text ?? null;
}

/** Tony's summary at a quarter break, the half or the final. */
export function breakRead(g: GameState, homeScore: number, awayScore: number, quarter: number, names: Names, final: boolean): string | null {
  const margin = homeScore - awayScore;
  const gap = Math.abs(margin);

  if (gap === 0) {
    if (final) return `A tie! Nobody's happy, and I love it!`;
    const line = bestLine(g, 'home') ?? bestLine(g, 'away');
    return line ? `Dead even! ${line}, and somebody's gotta make an adjustment.` : `Dead even! Somebody's gotta make an adjustment.`;
  }

  const leadSide: Side = margin > 0 ? 'home' : 'away';
  const trailSide = other(leadSide);
  const lead = names[leadSide];
  const trail = names[trailSide];
  const ld = g.team[leadSide];
  const tr = g.team[trailSide];
  const line = bestLine(g, leadSide);

  if (final) {
    if (gap <= 7) return line ? `What a finish! ${line}, and ${lead} needed every bit of it!` : `What a finish! ${lead} survives that one!`;
    return line ? `${line}. ${lead} takes care of business, and we'll see you next time!` : `${lead} takes care of business. We'll see you next time!`;
  }

  const leadYards = ld.rushYds + ld.passYds;
  const trailYards = tr.rushYds + tr.passYds;
  let why = line ?? '';
  if (tr.turnovers >= ld.turnovers + 2) why = `${trail} has ${plural(tr.turnovers, 'turnover')}`;
  else if (leadYards - trailYards >= 100) why = `${lead} has ${leadYards} yards to ${trailYards}`;

  let need: string;
  if (gap <= 3) need = `It's a ${gap}-point game. This thing is wide open.`;
  else if (tr.turnovers >= ld.turnovers + 2) need = `You can't keep handing ${lead} the ball.`;
  else if (ld.rushAtt >= 6 && pct(ld.rushYds, ld.rushAtt) >= 4.5) need = `${trail} has got to stop the run first.`;
  else if (tr.sacksTaken >= 3) need = `${trail} has to protect the quarterback, or none of this matters.`;
  else if (tr.sacksMade === 0 && ld.passAtt >= 8) need = `${trail} has got to get some pressure on the quarterback.`;
  else need = quarter % 2 === 0
    ? `${trail} needs to come out and answer right away.`
    : `${trail} needs a stop and a long drive to get back in it.`;
  return why ? `${why}. ${need}` : need;
}
