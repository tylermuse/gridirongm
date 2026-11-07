/**
 * Tony Blaze's read on the game: the color commentary that comes from watching
 * the whole game instead of the last play. Who's red hot and should get the
 * ball, which team is on fire, what the team getting beat has to change.
 *
 * Replays the events up to the current one, so it only ever knows what the
 * listener has already seen, and it stays deterministic (same game, same lines,
 * same audio cache entry). Every number Tony says comes from the event stats.
 *
 * Games without a play log have no misses to count, so anything that needs
 * shooting percentages stays quiet for them.
 *
 * Pure + client-safe: no React, no Node APIs.
 */

import type { LiveEvent, Side } from '../live/playByPlay';

export interface ReadContext {
  homeName: string;
  awayName: string;
}

interface Line {
  pts: number; fgm: number; fga: number; tpm: number; tpa: number;
  reb: number; stl: number; blk: number; to: number;
}
interface PlayerLine extends Line { id: string; side: Side; name: string }

const emptyLine = (): Line => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, stl: 0, blk: 0, to: 0 });

export interface GameState {
  team: Record<Side, Line>;
  players: Map<string, PlayerLine>;
  /** Biggest deficit each side has faced so far. */
  maxDeficit: Record<Side, number>;
  /** Whether attempts are known (real play log), not just makes. */
  tracked: boolean;
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const pct = (m: number, a: number) => (a > 0 ? m / a : 0);
const pctWord = (m: number, a: number) => `${Math.round(pct(m, a) * 100)} percent`;
const plural = (n: number, word: string) => `${n === 0 ? 'no' : n} ${word}${n === 1 ? '' : 's'}`;

function clockSecs(clock: string): number {
  const [m, s] = clock.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

/** "J. Tatum hits…" → "Tatum". Only the event's own player leads its text. */
function leadingName(text: string): string | null {
  const m = /^[A-Z]\. ((?:(?:St\.|De|Van|Von|Mc) )?[^\s(']+(?: (?:Jr\.|Sr\.|II|III|IV))?)/.exec(text);
  return m ? m[1] : null;
}

export function newGameState(): GameState {
  return {
    team: { home: emptyLine(), away: emptyLine() },
    players: new Map(),
    maxDeficit: { home: 0, away: 0 },
    tracked: false,
  };
}

function playerLine(g: GameState, id: string, side: Side): PlayerLine {
  let p = g.players.get(id);
  if (!p) { p = { ...emptyLine(), id, side, name: '' }; g.players.set(id, p); }
  return p;
}

const STAT_FIELD: Record<string, keyof Line> = {
  pts: 'pts', fgm: 'fgm', fga: 'fga', '3pm': 'tpm', '3pa': 'tpa', reb: 'reb',
  stl: 'stl', blk: 'blk', to: 'to',
};

/** Fold one event into the running numbers. */
export function applyEvent(g: GameState, e: LiveEvent): void {
  // Blocks, steals and fouls are stamped with the defender's side.
  const defensive = e.kind === 'steal' || e.kind === 'block' || e.kind === 'foul';
  const offense: Side = defensive ? other(e.side) : e.side;

  if (e.stats?.length) {
    g.tracked = true;
    for (const [id, code, delta] of e.stats) {
      const field = STAT_FIELD[code];
      if (!field) continue;
      const onDefense = code === 'stl' || code === 'blk';
      const side = onDefense ? other(offense) : offense;
      g.team[side][field] += delta;
      playerLine(g, id, side)[field] += delta;
    }
  } else if (e.playerId) {
    // No play log: only what the event itself says happened.
    const p = playerLine(g, e.playerId, e.side);
    const t = g.team[e.side];
    if (e.scoring) { p.pts += e.points; t.pts += e.points; }
    if (e.kind === 'make2' || e.kind === 'make3') { p.fgm++; t.fgm++; }
    if (e.kind === 'make3') { p.tpm++; t.tpm++; }
    if (e.kind === 'steal') { p.stl++; t.stl++; }
    if (e.kind === 'block') { p.blk++; t.blk++; }
    if (e.kind === 'rebound') { p.reb++; t.reb++; }
    if (e.kind === 'turnover') { p.to++; t.to++; }
  }

  if (e.playerId) {
    const name = leadingName(e.text);
    const p = g.players.get(e.playerId);
    if (p && name) p.name = name;
  }

  g.maxDeficit.home = Math.max(g.maxDeficit.home, e.away - e.home);
  g.maxDeficit.away = Math.max(g.maxDeficit.away, e.home - e.away);
}

/** Top scorer on a side whose name we've seen, if he's actually done something. */
function topScorer(g: GameState, side: Side): PlayerLine | null {
  let best: PlayerLine | null = null;
  for (const p of g.players.values()) {
    if (p.side === side && p.name && (!best || p.pts > best.pts)) best = p;
  }
  return best && best.pts > 0 ? best : null;
}

// ─── The lines ────────────────────────────────────────────────────────────────

type Fill = (seed: number) => string;

/** A per-game offset for the wordings, so every game doesn't open with the same ones. */
export function gameSeed(events: LiveEvent[]): number {
  let h = 2166136261;
  for (const e of events.slice(0, 3)) for (let i = 0; i < e.text.length; i++) h = Math.imul(h ^ e.text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Tracks what's been said so a topic rotates its wording and doesn't nag. */
export interface Memory {
  /** Called-event counter when each topic last fired. */
  lastAt: Map<string, number>;
  /** How many times each topic has fired. */
  count: Map<string, number>;
  /** Points at the last mention, per player, so "he's hot" needs new evidence. */
  hotAt: Map<string, number>;
  /** The deficit a side's comeback was last called from. */
  comebackFrom: Map<Side, number>;
  called: number;
  lastRead: number;
  seed: number;
}

export function newMemory(seed = 0): Memory {
  return { seed, lastAt: new Map(), count: new Map(), hotAt: new Map(), comebackFrom: new Map(), called: 0, lastRead: -100 };
}

/** Rotate through a topic's wordings rather than picking at random. */
const rotate = (list: string[], turn: number, seed: number) => list[(turn + seed) % list.length];

interface Candidate { topic: string; cooldown: number; say: Fill; onUse?: () => void }

/** Points that count as a big night so far: 9 in the first quarter is hot, 9 in the fourth isn't. */
const hotPoints = (quarter: number) => (quarter <= 1 ? 8 : quarter === 2 ? 12 : quarter === 3 ? 16 : 20);

/** A player who's scoring efficiently, as of this make. */
function hotPlayerRead(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): Candidate | null {
  if (!e.playerId || (e.kind !== 'make2' && e.kind !== 'make3')) return null;
  const p = g.players.get(e.playerId);
  if (!p?.name) return null;
  const earned = p.pts - (mem.hotAt.get(p.id) ?? 0) >= (mem.hotAt.has(p.id) ? 7 : 0);
  if (!earned) return null;

  const team = e.side === 'home' ? ctx.homeName : ctx.awayName;
  const opp = e.side === 'home' ? ctx.awayName : ctx.homeName;
  const used = () => { mem.hotAt.set(p.id, p.pts); };

  if (g.tracked) {
    if (e.kind === 'make3' && p.tpm >= 4 && pct(p.tpm, p.tpa) >= 0.5) {
      return {
        topic: 'hot-three', cooldown: 8, onUse: used, say: seed => rotate([
          `That's ${p.tpm} threes for ${p.name}, on ${p.tpa} tries! ${opp} can NOT go under the screen on this guy. Run him off the line!`,
          `${p.name} from deep again! ${p.tpm} of ${p.tpa}! ${team} needs to keep finding him. He is red hot!`,
          `Somebody on ${opp} has to find ${p.name}! That's ${p.tpm} threes, and he's not even looking at the rim anymore.`,
        ], mem.count.get('hot-three') ?? 0, seed),
      };
    }
    if (p.fgm >= 3 && p.pts >= hotPoints(e.quarter) && pct(p.fgm, p.fga) >= 0.55) {
      return {
        topic: 'hot-player', cooldown: 8, onUse: used, say: seed => rotate([
          `${p.name} has ${p.pts} on ${p.fgm} of ${p.fga} shooting. ${team} needs to run everything through him right now. He is red hot!`,
          pct(p.fgm, p.fga) >= 0.7
            ? `Give ${p.name} the ball and get out of the way! That's ${p.pts} points, and he's barely missed!`
            : `Give ${p.name} the ball and get out of the way! That's ${p.pts} points. He's feeling it!`,
          `${p.name} is cooking! ${p.pts} now. ${opp} has got to send a second guy at him. Make somebody else beat you!`,
          `That's ${p.fgm} of ${p.fga} for ${p.name}. If I'm ${team}, he gets every touch until somebody proves they can stop him.`,
        ], mem.count.get('hot-player') ?? 0, seed),
      };
    }
    return null;
  }
  // Without attempts all we can honestly say is how many he has.
  if (p.pts >= hotPoints(e.quarter) + 4) {
    return {
      topic: 'hot-player', cooldown: 8, onUse: used, say: seed => rotate([
        `${p.name} has ${p.pts} already. ${team} needs to keep getting him the ball!`,
        `That's ${p.pts} for ${p.name}! ${opp} has got to find an answer for this guy.`,
      ], mem.count.get('hot-player') ?? 0, seed),
    };
  }
  return null;
}

/** The scoring team, shooting the lights out with a lead to show for it. */
function teamOnFireRead(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): Candidate | null {
  if (!e.scoring || !g.tracked) return null;
  const t = g.team[e.side];
  const lead = e.side === 'home' ? e.home - e.away : e.away - e.home;
  if (lead < 8 || t.fga < 12) return null;
  const team = e.side === 'home' ? ctx.homeName : ctx.awayName;
  const opp = e.side === 'home' ? ctx.awayName : ctx.homeName;
  const n = mem.count.get('team-fire') ?? 0;
  if (t.tpa >= 8 && pct(t.tpm, t.tpa) >= 0.48) {
    return {
      topic: 'team-fire', cooldown: 30, say: seed => rotate([
        `${team} is ${t.tpm} of ${t.tpa} from three! This whole team is on fire, and ${opp} is just standing there watching it happen.`,
        `${t.tpm} threes on ${t.tpa} attempts! When ${team} shoots it like this, I don't care who you are, you're in trouble.`,
      ], n, seed),
    };
  }
  if (pct(t.fgm, t.fga) >= 0.54) {
    return {
      topic: 'team-fire', cooldown: 30, say: seed => rotate([
        `${team} is shooting ${pctWord(t.fgm, t.fga)}! This team is on FIRE right now, and they're up ${lead} because of it.`,
        `${pctWord(t.fgm, t.fga)} from the field for ${team}! Everybody's getting good looks and everybody's knocking them down.`,
        `${t.fgm} of ${t.fga}! The rim's a hula hoop for ${team} right now. That's how you get up ${lead}.`,
      ], n, seed),
    };
  }
  return null;
}

/**
 * What the team getting beat has to fix, picked from what's actually going
 * wrong: giveaways, no defensive disruption, the glass, or cold shooting.
 */
function trailingNeedsRead(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): Candidate | null {
  const margin = e.home - e.away;
  const gap = Math.abs(margin);
  if (gap < 8) return null;
  const leadSide: Side = margin > 0 ? 'home' : 'away';
  const trailSide = other(leadSide);
  // Said over the leader's bucket or the trailer's giveaway, when it stings.
  const stings = (e.scoring && e.side === leadSide)
    || ((e.kind === 'steal') && e.side === leadSide)
    || (e.kind === 'turnover' && e.side === trailSide)
    || (e.kind === 'block' && e.side === leadSide);
  if (!stings) return null;

  const ld = g.team[leadSide];
  const tr = g.team[trailSide];
  const lead = leadSide === 'home' ? ctx.homeName : ctx.awayName;
  const trail = trailSide === 'home' ? ctx.homeName : ctx.awayName;
  const options: Candidate[] = [];

  if (tr.to >= 6 && tr.to >= ld.to + 3) {
    options.push({
      topic: 'needs-ball-security', cooldown: 40, say: seed => rotate([
        `That's ${plural(tr.to, 'turnover')} for ${trail}. You cannot spot a team like ${lead} free possessions. Take care of the basketball!`,
        `${plural(tr.to, 'turnover')}! ${trail} is doing half of ${lead}'s work for them. Slow down, make the simple pass.`,
      ], mem.count.get('needs-ball-security') ?? 0, seed),
    });
  }
  if (g.tracked) {
    if (ld.fga >= 14 && pct(ld.fgm, ld.fga) >= 0.48 && tr.stl + tr.blk <= 4) {
      const disruption = `${plural(tr.stl, 'steal')} and ${plural(tr.blk, 'block')}`;
      options.push({
        topic: 'needs-defense', cooldown: 40, say: seed => rotate([
          `${trail} has ${disruption}, and ${lead} is shooting ${pctWord(ld.fgm, ld.fga)}. Nobody's making them feel it! Get in the passing lanes. Protect the rim!`,
          `You want back in this game? ${trail} needs stops, and ${disruption} isn't going to do it. Somebody has to go make a play on the ball!`,
        ], mem.count.get('needs-defense') ?? 0, seed),
      });
    }
    if (ld.reb - tr.reb >= 7) {
      options.push({
        topic: 'needs-boards', cooldown: 40, say: seed => rotate([
          `${trail} is getting killed on the glass, ${ld.reb} to ${tr.reb}. No boards, no run. It's that simple. Somebody has to put a body on somebody!`,
          `${ld.reb} rebounds to ${tr.reb}. You can't come back if you only get one shot and they get two. ${trail} has to go get the ball!`,
        ], mem.count.get('needs-boards') ?? 0, seed),
      });
    }
    if (tr.tpa >= 10 && pct(tr.tpm, tr.tpa) <= 0.27) {
      options.push({
        topic: 'needs-rim', cooldown: 40, say: seed => rotate([
          `${trail} is ${tr.tpm} of ${tr.tpa} from three, and they keep shooting them! Put it on the floor. Get to the rim. Get something easy!`,
          `${tr.tpm} for ${tr.tpa} from deep. At some point, ${trail} has to stop settling and go attack the paint.`,
        ], mem.count.get('needs-rim') ?? 0, seed),
      });
    }
    if (tr.fga >= 14 && pct(tr.fgm, tr.fga) <= 0.40) {
      options.push({
        topic: 'needs-shots', cooldown: 40, say: seed => rotate([
          `${trail} is ${tr.fgm} of ${tr.fga} from the field. You can't win shooting ${pctWord(tr.fgm, tr.fga)}. They need better looks, and they need them now.`,
          `${pctWord(tr.fgm, tr.fga)} for ${trail}. They can't buy a bucket. Run something to get a guy going downhill!`,
        ], mem.count.get('needs-shots') ?? 0, seed),
      });
    }
  }
  if (gap >= 14 && e.quarter >= 2) {
    const star = topScorer(g, trailSide);
    options.push({
      topic: 'needs-run', cooldown: 45, say: seed => rotate([
        `Down ${gap}, ${trail} doesn't get it back with one big shot. String together three or four stops first. That's how it starts.`,
        star && star.pts >= 10
          ? `Down ${gap}. ${star.name} has ${star.pts}, but he needs some help. Somebody else on ${trail} has to step up.`
          : `Down ${gap}, and nobody on ${trail} is stepping up. Somebody has to take this over.`,
      ], mem.count.get('needs-run') ?? 0, seed),
    });
  }

  // The least recently used, so a one-sided game walks through its problems
  // instead of repeating the first one that qualified.
  const ready = options.filter(c => {
    const last = mem.lastAt.get(c.topic);
    return last === undefined || mem.called - last >= c.cooldown;
  });
  ready.sort((a, b) => (mem.lastAt.get(a.topic) ?? -1) - (mem.lastAt.get(b.topic) ?? -1));
  return ready[0] ?? null;
}

/** A star on the scoring side's team who can't find it. Said on his team's play. */
function coldStarRead(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): Candidate | null {
  if (!g.tracked || !e.scoring) return null;
  const side = other(e.side);
  const team = side === 'home' ? ctx.homeName : ctx.awayName;
  let cold: PlayerLine | null = null;
  for (const p of g.players.values()) {
    if (p.side === side && p.name && p.fga >= 7 && pct(p.fgm, p.fga) <= 0.25 && (!cold || p.fga > cold.fga)) cold = p;
  }
  if (!cold) return null;
  const c = cold;
  return {
    topic: 'cold-star', cooldown: 45, say: seed => rotate([
      `And ${team} is still waiting on ${c.name}. He's ${c.fgm} of ${c.fga}. They need him to find something, even if it's just a trip to the line.`,
      `Meanwhile ${c.name} is ${c.fgm} for ${c.fga}. You've got to keep him involved, but ${team} can't keep giving him those same looks.`,
    ], mem.count.get('cold-star') ?? 0, seed),
  };
}

/** A defender piling up steals or blocks, on his latest one. */
function defenderRead(g: GameState, e: LiveEvent, mem: Memory): Candidate | null {
  if (!e.playerId || (e.kind !== 'block' && e.kind !== 'steal')) return null;
  const p = g.players.get(e.playerId);
  if (!p?.name) return null;
  const n = e.kind === 'block' ? p.blk : p.stl;
  if (n < 3) return null;
  return {
    topic: `defender:${p.id}:${n}`, cooldown: 0, say: seed => e.kind === 'block'
      ? rotate([
        `That's ${n} blocks for ${p.name}! Nobody wants any part of him at the rim tonight.`,
        `${n} blocks! ${p.name} is changing this whole game. Guys are looking for him before they even go up.`,
      ], mem.count.get('defender') ?? 0, seed)
      : rotate([
        `That's ${n} steals for ${p.name}! He's living in the passing lanes.`,
        `${n} steals! You'd better know where ${p.name} is before you make that pass.`,
      ], mem.count.get('defender') ?? 0, seed),
  };
}

/** Whole-game moments: comebacks, blowouts, and tight finishes. */
function gameShapeRead(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): Candidate | null {
  const margin = e.home - e.away;
  const gap = Math.abs(margin);
  const secs = clockSecs(e.clock);

  // A big deficit erased.
  const scorer = e.side;
  const down = g.maxDeficit[scorer];
  const nowDown = scorer === 'home' ? -margin : margin;
  if (e.scoring && down >= 12 && nowDown <= 3 && down > (mem.comebackFrom.get(scorer) ?? 0)) {
    const team = scorer === 'home' ? ctx.homeName : ctx.awayName;
    return {
      topic: 'comeback', cooldown: 0, onUse: () => { mem.comebackFrom.set(scorer, down); }, say: seed => rotate([
        `${team} was down ${down}! This is a whole new ballgame!`,
        `Remember when ${team} was down ${down}? Nobody on that bench does! We've got a game!`,
      ], mem.count.get('comeback') ?? 0, seed),
    };
  }

  if (e.quarter === 4 && gap >= 20 && secs <= 360) {
    const lead = margin > 0 ? ctx.homeName : ctx.awayName;
    return {
      topic: 'blowout', cooldown: 60, say: seed => rotate([
        `Up ${gap} in the fourth. ${lead} can start thinking about getting those starters some rest.`,
        `This one's over, folks. ${gap} points with this little time left. Time to empty the bench.`,
      ], mem.count.get('blowout') ?? 0, seed),
    };
  }
  if (e.quarter === 3 && gap >= 22) {
    const trail = margin > 0 ? ctx.awayName : ctx.homeName;
    return {
      topic: 'blowout', cooldown: 60, say: seed => rotate([
        `Down ${gap} in the third. ${trail} is running out of time to make this a game.`,
        `This is getting ugly. ${trail} needs a timeout and about three more stops than they've had all night.`,
      ], mem.count.get('blowout') ?? 0, seed),
    };
  }
  if (e.quarter >= 4 && secs <= 240 && secs > 30 && gap <= 5) {
    const closer = [topScorer(g, 'home'), topScorer(g, 'away')]
      .filter((p): p is PlayerLine => !!p)
      .sort((a, b) => b.pts - a.pts)[0];
    return {
      topic: 'closing-time', cooldown: 18, say: seed => rotate([
        closer
          ? `${gap === 0 ? 'Tie game' : `${gap}-point game`} with the clock running down. ${closer.side === 'home' ? ctx.homeName : ctx.awayName} is going to ride ${closer.name}, I promise you. He's got ${closer.pts}.`
          : `This is it. This is when you find out who wants the ball.`,
        `This is the part of the game you can't teach. Every possession matters now. No bad shots, no silly fouls.`,
        `One stop. One bucket. That's the whole game now, and everybody in this building knows it.`,
      ], mem.count.get('closing-time') ?? 0, seed),
    };
  }
  return null;
}

/**
 * Tony's read for this event, or null when there's nothing new to say. Runs the
 * topics most tied to this exact play first, and a minimum gap between reads
 * keeps him from talking over every possession.
 */
export function readForEvent(g: GameState, e: LiveEvent, ctx: ReadContext, mem: Memory): string | null {
  if (mem.called - mem.lastRead < MIN_CALLS_BETWEEN_READS) return null;
  const candidates: (Candidate | null)[] = [
    gameShapeRead(g, e, ctx, mem),
    defenderRead(g, e, mem),
    hotPlayerRead(g, e, ctx, mem),
    teamOnFireRead(g, e, ctx, mem),
    trailingNeedsRead(g, e, ctx, mem),
    coldStarRead(g, e, ctx, mem),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const last = mem.lastAt.get(c.topic);
    if (last !== undefined && mem.called - last < c.cooldown) continue;
    const text = c.say(mem.seed);
    mem.lastAt.set(c.topic, mem.called);
    const countKey = c.topic.startsWith('defender:') ? 'defender' : c.topic;
    mem.count.set(countKey, (mem.count.get(countKey) ?? 0) + 1);
    mem.lastRead = mem.called;
    c.onUse?.();
    return text;
  }
  return null;
}

/** About one read per this many called plays at most. */
const MIN_CALLS_BETWEEN_READS = 4;

/** Rotate a shared reaction list by how often it's been used. */
export function nextFrom(list: string[], key: string, mem: Memory): string {
  const n = mem.count.get(key) ?? 0;
  mem.count.set(key, n + 1);
  return rotate(list, n, mem.seed);
}

/** Tony's summary at the end of a period: where it stands and why. */
export function periodRead(g: GameState, e: LiveEvent, ctx: ReadContext, final: boolean): string | null {
  const margin = e.home - e.away;
  const gap = Math.abs(margin);
  const homeTop = topScorer(g, 'home');
  const awayTop = topScorer(g, 'away');

  if (final) {
    if (gap === 0) return null;
    const side: Side = margin > 0 ? 'home' : 'away';
    const winner = side === 'home' ? ctx.homeName : ctx.awayName;
    const top = side === 'home' ? homeTop : awayTop;
    const t = g.team[side];
    const shooting = g.tracked && t.fga >= 40 && pct(t.fgm, t.fga) >= 0.5 ? ` ${winner} shot ${pctWord(t.fgm, t.fga)} as a team.` : '';
    if (!top) return `${winner} gets it done.${shooting}`;
    const line = g.tracked ? `${top.pts} on ${top.fgm} of ${top.fga} shooting` : `${top.pts} points`;
    return gap <= 5
      ? `What a finish! ${top.name} had ${line}, and ${winner} needed every bit of it!`
      : `${top.name} with ${line}. ${winner} takes care of business.${shooting} We'll see you next time!`;
  }

  if (gap === 0) {
    const top = [homeTop, awayTop].filter((p): p is PlayerLine => !!p).sort((a, b) => b.pts - a.pts)[0];
    return top
      ? `Dead even! ${top.name} has ${top.pts} to lead everybody, and somebody else needs to step up.`
      : `Dead even! Somebody's gotta make adjustments.`;
  }

  const leadSide: Side = margin > 0 ? 'home' : 'away';
  const trailSide = other(leadSide);
  const lead = leadSide === 'home' ? ctx.homeName : ctx.awayName;
  const trail = trailSide === 'home' ? ctx.homeName : ctx.awayName;
  const ld = g.team[leadSide];
  const tr = g.team[trailSide];
  const top = leadSide === 'home' ? homeTop : awayTop;

  // Why the leader leads…
  let why = '';
  if (g.tracked && ld.fga >= 10 && pct(ld.fgm, ld.fga) >= 0.5) why = `${lead} is shooting ${pctWord(ld.fgm, ld.fga)}`;
  else if (tr.to >= ld.to + 3) why = `${trail} has ${plural(tr.to, 'turnover')}`;
  else if (g.tracked && ld.reb - tr.reb >= 6) why = `${lead} is winning the glass ${ld.reb} to ${tr.reb}`;
  else if (top && top.pts >= 8) why = `${top.name} has ${top.pts} for ${lead}`;

  // …and what the other side has to change.
  let need = '';
  if (gap <= 4) need = `It's a ${gap}-point game. One good run changes everything.`;
  else if (tr.to >= ld.to + 3) need = why.includes('turnover') ? `You can't keep handing ${lead} extra possessions.` : `${trail} has to take care of the ball.`;
  else if (g.tracked && tr.tpa >= 8 && pct(tr.tpm, tr.tpa) <= 0.28) need = `${trail} is ${tr.tpm} of ${tr.tpa} from three, so stop settling and get to the rim.`;
  else if (g.tracked && tr.fga >= 10 && pct(tr.fgm, tr.fga) <= 0.4) need = `${trail} has got to find some better looks.`;
  else if (tr.stl + tr.blk <= 2) need = `${trail} needs to make something happen on defense. Get a steal, get a block, get out and run.`;
  else need = `${trail} needs stops. You don't come back trading baskets.`;

  return why ? `${why}. ${need}` : need;
}
