/**
 * Sim calibration guard. One full simulated season must land in broad
 * NBA-realistic bands (2024-25 targets in comments), and the end-game decision
 * table must behave. Bands are deliberately wide — this catches regressions
 * like "blocks fell back to ~1/game" or "leaderboards went flat", not noise.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { endgamePlan, createRng, clutchEffect } from '@bs/sport-basketball';
import type { BasketballStats } from '@bs/sport-basketball';

describe('end-game decisions', () => {
  const rng = createRng('endgame-test');
  it('plays normally before the final period or with time left', () => {
    expect(endgamePlan(3, 30, false, rng).kind).toBe('normal');
    expect(endgamePlan(3, 300, true, rng).kind).toBe('normal');
  });
  it('trailing defense fouls late; leader with the ball drains clock otherwise', () => {
    const kinds = new Set(Array.from({ length: 40 }, () => endgamePlan(5, 20, true, rng).kind));
    expect(kinds.has('foul')).toBe(true);
    expect([...kinds].every(k => k === 'foul' || k === 'hold')).toBe(true);
  });
  it('tied late → last shot; trailing by 3 late → must shoot a three; ≤4s → heave', () => {
    expect(endgamePlan(0, 18, true, rng).kind).toBe('lastShot');
    const p = endgamePlan(-3, 15, true, rng);
    expect(p.kind === 'hurry' && p.forceThree).toBe(true);
    expect(endgamePlan(0, 3, true, rng).kind).toBe('heave');
  });
  it('clutch convergence only bites late in close games, toward the trailer', () => {
    expect(clutchEffect(4, 600)).toBe(0);   // too early
    expect(clutchEffect(15, 60)).toBe(0);   // blowout
    expect(clutchEffect(0, 30)).toBe(0);    // tied
    expect(clutchEffect(4, 60)).toBeLessThan(0);   // leader eases off
    expect(clutchEffect(-4, 60)).toBeGreaterThan(0); // trailer presses
  });
  it('never fouls when the game is out of reach', () => {
    for (let i = 0; i < 30; i++) expect(endgamePlan(15, 20, true, rng).kind).not.toBe('foul');
  });
});

describe('season calibration bands', () => {
  let l = createNewBasketballLeague({ rngSeed: 'calibration-guard' });
  for (let i = 0; i < 400; i++) { const r = simNextDay(l); if (!r) break; l = r.league; }
  const games = l.games.filter(g => g.status === 'played' && g.finalScore);
  const T: Record<string, number> = {};
  const per = new Map<string, { gp: number; pts: number; reb: number; ast: number; blk: number }>();
  let ot = 0, marginSum = 0;
  for (const g of games) {
    if ((g.sportData as { wentToOvertime?: boolean }).wentToOvertime) ot++;
    marginSum += Math.abs(g.finalScore!.home - g.finalScore!.away);
    for (const [pid, b] of Object.entries(g.boxScores) as [string, Partial<BasketballStats>][]) {
      for (const [k, v] of Object.entries(b)) if (typeof v === 'number') T[k] = (T[k] ?? 0) + v;
      const e = per.get(pid) ?? { gp: 0, pts: 0, reb: 0, ast: 0, blk: 0 };
      if ((b.minutes ?? 0) > 0) e.gp++;
      e.pts += b.points ?? 0; e.reb += b.totalRebounds ?? 0; e.ast += b.assists ?? 0; e.blk += b.blocks ?? 0;
      per.set(pid, e);
    }
  }
  const tg = games.length * 2;
  const leader = (k: 'pts' | 'reb' | 'ast' | 'blk') => Math.max(...[...per.values()].filter(e => e.gp >= 50).map(e => e[k] / e.gp));

  it('plays a full season', () => expect(games.length).toBe(1230));
  it('team totals are NBA-like', () => {
    expect(T.points / tg).toBeGreaterThan(108);            // NBA 113.8
    expect(T.points / tg).toBeLessThan(124);
    expect(T.fieldGoalsMade / T.fieldGoalsAttempted).toBeGreaterThan(0.43); // 46.7%
    expect(T.fieldGoalsMade / T.fieldGoalsAttempted).toBeLessThan(0.5);
    expect(T.threePointsMade / T.threePointsAttempted).toBeGreaterThan(0.33); // 36.0%
    expect(T.threePointsMade / T.threePointsAttempted).toBeLessThan(0.39);
    expect(T.freeThrowsAttempted / tg).toBeGreaterThan(18); // 21.7
    expect(T.blocks / tg).toBeGreaterThan(3.5);             // 4.9
    expect(T.personalFouls / tg).toBeGreaterThan(15);       // 18
  });
  it('leaderboards have real stars', () => {
    expect(leader('pts')).toBeGreaterThan(26);  // NBA ~32
    expect(leader('reb')).toBeGreaterThan(10.5); // ~13.9
    expect(leader('ast')).toBeGreaterThan(8);    // ~11.6
    expect(leader('blk')).toBeGreaterThan(1.8);  // ~3.8
  });
  it('games are competitive and sometimes go to overtime', () => {
    expect(marginSum / games.length).toBeLessThan(14); // NBA ~12
    expect(ot / games.length).toBeGreaterThan(0.03);   // NBA ~6%; sim ~5-6%
    expect(ot / games.length).toBeLessThan(0.09);
  });
});
