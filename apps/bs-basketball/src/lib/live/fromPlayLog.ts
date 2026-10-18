/**
 * Turn the engine's real possession log into a broadcast feed.
 *
 * Unlike `synthesizePlayByPlay` (which invents a story from the final box
 * score), every line here is a possession that actually happened in the sim:
 * real misses, real boards, real assists, real and-ones, the real clock and the
 * real five on the floor. Stat deltas ride on each event so the live box score
 * can be accumulated exactly — at the final horn it equals the saved box score.
 */

import type { BasketballPlayer, PlayLog, PlayLogEntry, PlayLogFieldCode } from '@bs/sport-basketball';
import type { LiveEvent, LiveEventKind, Side } from './playByPlay';

type Players = Record<string, BasketballPlayer>;
type PossessionEntry = Extract<PlayLogEntry, { k: 'p' }>;

export function hasPlayLog(sportData: unknown): sportData is { playLog: PlayLog } {
  const log = (sportData as { playLog?: Partial<PlayLog> } | undefined)?.playLog;
  return !!log && Array.isArray(log.entries) && log.entries.length > 0 && Array.isArray(log.ids);
}

/** Show at most one sub line per side per this many game-seconds (the
 *  engine rotates whole units every few possessions — too chatty to list). */
const SUB_LINE_GAP_SECONDS = 150;

// ---------------------------------------------------------------------------
// Deterministic flavor (no Math.random → same game, same call, every replay)
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: readonly T[], seed: number): T { return arr[seed % arr.length]; }

function nm(players: Players, id: string | undefined): string {
  const p = id ? players[id] : undefined;
  return p ? `${p.firstName[0]}. ${p.lastName}` : 'A player';
}

const SHOT_TEXT: Record<NonNullable<PossessionEntry['st']>, { made: string[]; miss: string[] }> = {
  three: {
    made: ['drains a three', 'buries it from deep', 'hits the corner three', 'splashes a step-back three', 'knocks down the triple'],
    miss: ['misses from three', 'clanks the three', 'front-rims the triple', 'can\'t connect from deep'],
  },
  midrange: {
    made: ['hits the pull-up jumper', 'knocks down the mid-range fadeaway', 'drills the elbow jumper', 'nails the baseline J'],
    miss: ['misses the pull-up jumper', 'misfires from mid-range', 'leaves the fadeaway short'],
  },
  at_rim: {
    made: ['finishes at the rim', 'throws it down', 'lays it in', 'scores on the drive', 'flushes the dunk'],
    miss: ['misses the layup', 'can\'t finish at the rim', 'blows the layup'],
  },
  post: {
    made: ['scores in the post', 'drops in the hook shot', 'hits the turnaround', 'backs down and scores'],
    miss: ['misses the hook shot', 'can\'t get the turnaround to fall', 'misses in the post'],
  },
};
const SHOT_NOUN: Record<NonNullable<PossessionEntry['st']>, string> = {
  three: 'three', midrange: 'jumper', at_rim: 'layup', post: 'post move',
};

// ---------------------------------------------------------------------------
// Shot chart geometry — court viewBox 200×100; away attacks the LEFT rim
// (x=11), home the RIGHT rim (x=189), matching CourtCanvas.
// ---------------------------------------------------------------------------

function shotSpot(side: Side, type: NonNullable<PossessionEntry['st']>, seed: number): { x: number; y: number } {
  const u = (seed % 1000) / 1000;
  const v = ((seed >>> 10) % 1000) / 1000;
  const [rMin, rMax] = type === 'three' ? [31, 34] : type === 'midrange' ? [14, 25] : type === 'post' ? [6, 12] : [1.5, 5];
  const r = rMin + v * (rMax - rMin);
  // Angle from the rim toward mid-court; threes reach the corners.
  const spread = type === 'three' ? 82 : 75;
  const ang = ((u * 2 - 1) * spread * Math.PI) / 180;
  let dx = Math.cos(ang) * r;
  let dy = Math.sin(ang) * r;
  // Corner threes: clamp inside the sideline, push them out along the baseline.
  if (Math.abs(dy) > 29) { dy = Math.sign(dy) * 29; dx = Math.max(dx, 2); }
  const rimX = side === 'home' ? 189 : 11;
  return { x: side === 'home' ? rimX - dx : rimX + dx, y: 50 + dy };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function periodName(q: number): string {
  if (q <= 4) return ['1st', '2nd', '3rd', '4th'][q - 1] + ' quarter';
  return q === 5 ? 'overtime' : `OT${q - 4}`;
}

function fmtClock(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function eventsFromPlayLog(playLog: PlayLog, players: Players, homeAbbr: string, awayAbbr: string): LiveEvent[] {
  const ids = playLog.ids;
  const log = playLog.entries;
  const out: LiveEvent[] = [];
  let home = 0, away = 0;
  let lastQ = 1;
  /** Last five seen per side — used to name the subs coming in. */
  const onFloor: Record<Side, string[]> = { home: [], away: [] };
  const starters: Record<Side, string[]> = { home: [], away: [] };
  /** Game-elapsed seconds of the last sub line shown per side. */
  const lastSubShown: Record<Side, number> = { home: -Infinity, away: -Infinity };
  const elapsed = (q: number, t: number) => (q <= 4 ? (q - 1) * 720 + (720 - t) : 2880 + (q - 5) * 300 + (300 - t));

  const push = (e: Omit<LiveEvent, 'home' | 'away'> & { home?: number; away?: number }) => {
    out.push({ ...e, home: e.home ?? home, away: e.away ?? away });
  };

  log.forEach((entry, idx) => {
    if (entry.q !== lastQ) {
      // Period break marker(s).
      const ended = lastQ;
      push({
        quarter: ended, clock: '0:00', side: 'home', kind: 'period', scoring: false, points: 0,
        text: ended === 2 ? `Halftime — ${awayAbbr} ${away}, ${homeAbbr} ${home}` : `End of the ${periodName(ended)} — ${awayAbbr} ${away}, ${homeAbbr} ${home}`,
      });
      if (entry.q > 4 && ended === 4) {
        push({ quarter: entry.q, clock: '5:00', side: 'home', kind: 'period', scoring: false, points: 0, text: 'Tied at the end of regulation — we\'re going to overtime!' });
      }
      lastQ = entry.q;
    }

    if (entry.k === 's') {
      const side: Side = entry.side === 'h' ? 'home' : 'away';
      const five = entry.ids.map(i => ids[i]);
      const prev = onFloor[side];
      onFloor[side] = five;
      if (prev.length === 0) { starters[side] = five; return; } // opening five
      const coming = five.filter(id => !prev.includes(id));
      if (coming.length === 0) return;
      const now = elapsed(entry.q, entry.t);
      const quiet = now - lastSubShown[side] < SUB_LINE_GAP_SECONDS;
      if (!quiet) lastSubShown[side] = now;
      const abbr = side === 'home' ? homeAbbr : awayAbbr;
      const startersBack = five.every(id => starters[side].includes(id));
      const names = coming.slice(0, 3).map(id => nm(players, id)).join(', ');
      push({
        quarter: entry.q, clock: fmtClock(entry.t), side, kind: 'sub', scoring: false, points: 0, quiet,
        text: startersBack
          ? `${abbr} brings the starters back`
          : coming.length >= 4 ? `${abbr} goes to the second unit — ${names} check in` : `${abbr} sub: ${names} ${coming.length > 1 ? 'check' : 'checks'} in`,
        onFloor: five,
      });
      return;
    }

    narratePossession(entry, idx, ids, players, push, () => ({ home, away }), (h, a) => { home = h; away = a; });
  });

  if (log.length) {
    const lastEntry = log[log.length - 1];
    push({ quarter: lastEntry.q, clock: '0:00', side: 'home', kind: 'period', scoring: false, points: 0, text: `Final — ${awayAbbr} ${away}, ${homeAbbr} ${home}` });
  }
  return out;
}

type Push = (e: Omit<LiveEvent, 'home' | 'away'> & { home?: number; away?: number }) => void;

function narratePossession(
  p: PossessionEntry,
  idx: number,
  ids: string[],
  players: Players,
  push: Push,
  score: () => { home: number; away: number },
  setScore: (h: number, a: number) => void,
) {
  const side: Side = p.o === 'h' ? 'home' : 'away';
  const defSide: Side = side === 'home' ? 'away' : 'home';
  const clock = fmtClock(p.t);
  const seed = hash(`${idx}-${p.q}-${p.t}-${p.e.map(x => x[0]).join('.')}`);
  const stats = p.e.map(([pi, f, d]) => [ids[pi], f, d ?? 1] as [string, PlayLogFieldCode, number]);

  const by = (code: PlayLogFieldCode) => p.e.filter(x => x[1] === code).map(x => ids[x[0]]);
  const fga = by('fga');
  const fgm = by('fgm');
  const blk = by('blk')[0];
  const ast = by('ast')[0];
  const stl = by('stl')[0];
  const to = by('to')[0];
  const orb = by('orb')[0];
  const drb = by('drb')[0];
  const pf = by('pf')[0];
  const fta = by('fta').length;
  const ftm = by('ftm').length;

  const finalScore = { home: p.h, away: p.a };

  // Turnover possessions.
  if (to) {
    push({
      quarter: p.q, clock, side: stl ? defSide : side, kind: stl ? 'steal' : 'turnover', scoring: false, points: 0,
      playerId: stl ?? to,
      text: stl
        ? `${nm(players, stl)} ${pick(['picks off', 'strips', 'jumps the passing lane on', 'pokes it away from'], seed)} ${nm(players, to)} — turnover`
        : `${nm(players, to)} ${pick(['throws it away', 'loses the handle', 'is called for traveling', 'steps out of bounds', 'commits the offensive foul'], seed)}`,
      stats,
    });
    return;
  }

  if (fga.length === 0) return; // defensive: nothing happened (shouldn't occur)

  const shooter = fga[0];
  const st = p.st ?? (by('3pa').length ? 'three' : 'midrange');
  const made = fgm.length > 0;
  const spot = shotSpot(side, st, seed);
  const shot = { x: spot.x, y: spot.y, made, type: st };
  const pts = p.pts;

  // Split stat deltas: shot-phase stats go on the shot event, the board on the rebound event.
  const shotStats = stats.filter(s => s[1] !== 'orb' && s[1] !== 'drb' && s[1] !== 'reb');
  const boardStats = stats.filter(s => s[1] === 'orb' || s[1] === 'drb' || s[1] === 'reb');

  if (made) {
    const and1 = !!pf && fta === 1;
    let text = `${nm(players, shooter)} ${pick(SHOT_TEXT[st].made, seed)}`;
    if (ast) text += ` (${nm(players, ast)} assists)`;
    if (and1) text += ftm ? ` — AND ONE! Converts the free throw` : ` — and-one chance, but misses the free throw`;
    setScore(finalScore.home, finalScore.away);
    push({
      quarter: p.q, clock, side, kind: st === 'three' ? 'make3' : 'make2', scoring: true, points: pts,
      playerId: shooter, assistId: ast, shot, stats: shotStats, and1, text,
    });
    return;
  }

  // Missed / blocked / fouled.
  if (pf && fta > 0) {
    const kind: LiveEventKind = 'ft';
    setScore(finalScore.home, finalScore.away);
    push({
      quarter: p.q, clock, side, kind, scoring: ftm > 0, points: pts, playerId: shooter, shot,
      stats: shotStats,
      text: `${nm(players, pf)} fouls ${nm(players, shooter)} on the ${SHOT_NOUN[st]} — ${ftm} of ${fta} at the line`,
    });
    return;
  }

  const cur = score();
  if (blk) {
    push({
      quarter: p.q, clock, side: defSide, kind: 'block', scoring: false, points: 0, playerId: blk, shot,
      stats: shotStats, home: cur.home, away: cur.away,
      text: `${nm(players, blk)} ${pick(['REJECTS', 'swats away', 'blocks', 'sends back'], seed)} ${nm(players, shooter)}'s ${SHOT_NOUN[st]}`,
    });
  } else {
    push({
      quarter: p.q, clock, side, kind: 'miss', scoring: false, points: 0, playerId: shooter, shot,
      stats: shotStats, home: cur.home, away: cur.away,
      text: `${nm(players, shooter)} ${pick(SHOT_TEXT[st].miss, seed)}`,
    });
  }
  const reb = orb ?? drb;
  if (reb) {
    push({
      quarter: p.q, clock, side: orb ? side : defSide, kind: 'rebound', scoring: false, points: 0, playerId: reb,
      stats: boardStats, home: cur.home, away: cur.away, offensive: !!orb,
      text: orb
        ? `${nm(players, reb)} ${pick(['grabs the offensive board', 'crashes the glass — second chance', 'tips it back out — offensive rebound'], seed >>> 3)}`
        : `${nm(players, reb)} ${pick(['pulls down the rebound', 'cleans the glass', 'secures the defensive board'], seed >>> 3)}`,
    });
  }
}

