/**
 * Synthesize a believable play-by-play from a finished game.
 *
 * The sim computes a final box score instantly (no possession stream), so the
 * live viewer "replays" a narrative reconstructed from the box score + quarter
 * scores: every made basket becomes an event, flavor plays (boards, blocks,
 * steals, turnovers) are sprinkled in, a clock counts down per quarter, and the
 * running score is honest — it ends exactly on the final. Deterministic per
 * game id, so re-watching shows the same game.
 */

import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type Side = 'home' | 'away';

export interface LiveEvent {
  quarter: number;     // 1-4, 5+ = OT
  clock: string;       // "8:42"
  side: Side;
  text: string;
  home: number;        // running score after this event
  away: number;
  scoring: boolean;
}

interface Basket { side: Side; playerId: string; pts: number; kind: '3' | '2' | 'ft' }
type Players = Record<string, BasketballPlayer>;

// Small seeded PRNG for stable, repeatable replays.
function makeRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nm(players: Players, id: string): string {
  const p = players[id];
  return p ? `${p.firstName[0]}. ${p.lastName}` : 'A player';
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Spread baskets (summing to total) into per-quarter buckets matching targets. */
function allocate(baskets: Basket[], targets: number[]): Basket[][] {
  const out: Basket[][] = targets.map(() => []);
  let q = 0, acc = 0;
  for (const b of baskets) {
    if (q < targets.length - 1 && acc >= targets[q]) { q++; acc = 0; }
    out[q].push(b);
    acc += b.pts;
  }
  return out;
}

/** Interleave two ordered lists, weighted by remaining count (back-and-forth). */
function interleave<T>(a: T[], b: T[], rand: () => number): T[] {
  const out: T[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    const ra = a.length - i, rb = b.length - j;
    if (j >= b.length || (i < a.length && rand() < ra / (ra + rb))) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

function clockFor(quarter: number, i: number, n: number): string {
  const total = quarter >= 5 ? 300 : 720; // OT = 5:00, regulation = 12:00
  const elapsed = Math.round(((i + 1) / (n + 1)) * total);
  const left = Math.max(0, total - elapsed);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function basketsFor(team: BasketballTeam, side: Side, box: Record<string, Partial<BasketballStats>>, rand: () => number): Basket[] {
  const out: Basket[] = [];
  for (const pid of team.playerIds) {
    const s = box[pid];
    if (!s) continue;
    const threes = s.threePointsMade ?? 0;
    const twos = Math.max(0, (s.fieldGoalsMade ?? 0) - threes);
    const fts = s.freeThrowsMade ?? 0;
    for (let i = 0; i < threes; i++) out.push({ side, playerId: pid, pts: 3, kind: '3' });
    for (let i = 0; i < twos; i++) out.push({ side, playerId: pid, pts: 2, kind: '2' });
    for (let i = 0; i < fts; i++) out.push({ side, playerId: pid, pts: 1, kind: 'ft' });
  }
  return shuffle(out, rand);
}

interface Flavor { side: Side; playerId: string; verb: string }

function flavorFor(team: BasketballTeam, side: Side, box: Record<string, Partial<BasketballStats>>): Flavor[] {
  const out: Flavor[] = [];
  for (const pid of team.playerIds) {
    const s = box[pid];
    if (!s) continue;
    for (let i = 0; i < (s.blocks ?? 0); i++) out.push({ side, playerId: pid, verb: 'rejects the shot' });
    for (let i = 0; i < (s.steals ?? 0); i++) out.push({ side, playerId: pid, verb: 'picks off the pass' });
    for (let i = 0; i < Math.min(2, s.turnovers ?? 0); i++) out.push({ side, playerId: pid, verb: 'turns it over' });
    for (let i = 0; i < Math.min(1, s.offensiveRebounds ?? 0); i++) out.push({ side, playerId: pid, verb: 'crashes the offensive glass' });
  }
  return out;
}

function scoreText(b: Basket, players: Players, rand: () => number): string {
  const who = nm(players, b.playerId);
  if (b.kind === '3') return `${who} ${pick(['drains a three', 'buries it from deep', 'hits a triple'], rand)}`;
  if (b.kind === 'ft') return `${who} ${pick(['knocks down the free throw', 'makes it at the line'], rand)}`;
  return `${who} ${pick(['scores inside', 'hits the jumper', 'finishes at the rim', 'gets the bucket'], rand)}`;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function synthesizePlayByPlay(
  game: GameResult,
  homeTeam: BasketballTeam,
  awayTeam: BasketballTeam,
  players: Players,
): LiveEvent[] {
  const rand = makeRng(game.id);
  const box = game.boxScores as Record<string, Partial<BasketballStats>>;
  const quarters = (game.sportData as { quarterScores?: { home: number; away: number }[] } | undefined)?.quarterScores ?? [];
  if (quarters.length === 0) return [];

  const homeByQ = allocate(basketsFor(homeTeam, 'home', box, rand), quarters.map(q => q.home));
  const awayByQ = allocate(basketsFor(awayTeam, 'away', box, rand), quarters.map(q => q.away));

  // Flavor, split evenly across quarters.
  const allFlavor = shuffle([...flavorFor(homeTeam, 'home', box), ...flavorFor(awayTeam, 'away', box)], rand);
  const flavorByQ: Flavor[][] = quarters.map(() => []);
  allFlavor.forEach((f, i) => flavorByQ[i % quarters.length].push(f));

  const events: LiveEvent[] = [];
  let home = 0, away = 0;

  for (let q = 0; q < quarters.length; q++) {
    const baskets = interleave(homeByQ[q], awayByQ[q], rand);
    // Build a combined list: baskets in order, with flavor sprinkled between.
    const combined: ({ type: 'basket'; b: Basket } | { type: 'flavor'; f: Flavor })[] = [];
    const flavor = flavorByQ[q];
    let fi = 0;
    for (const b of baskets) {
      if (fi < flavor.length && rand() < 0.4) combined.push({ type: 'flavor', f: flavor[fi++] });
      combined.push({ type: 'basket', b });
    }
    while (fi < flavor.length) combined.push({ type: 'flavor', f: flavor[fi++] });

    combined.forEach((item, i) => {
      const clock = clockFor(q + 1, i, combined.length);
      if (item.type === 'basket') {
        if (item.b.side === 'home') home += item.b.pts; else away += item.b.pts;
        events.push({ quarter: q + 1, clock, side: item.b.side, text: scoreText(item.b, players, rand), home, away, scoring: true });
      } else {
        events.push({ quarter: q + 1, clock, side: item.f.side, text: `${nm(players, item.f.playerId)} ${item.f.verb}`, home, away, scoring: false });
      }
    });
  }

  // Guarantee the final running score equals the real final (rounding safety).
  if (events.length && game.finalScore) {
    const last = events[events.length - 1];
    last.home = game.finalScore.home;
    last.away = game.finalScore.away;
  }
  return events;
}
