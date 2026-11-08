import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay } from '@/lib/engine/playByPlay';
import { simulateGame } from '@/lib/engine/simulate';
import { createLiveCoachEngine } from '@/lib/engine/liveCoachEngine';
import { generateRoster } from '@/lib/engine/playerGen';
import type { GameResult, Team } from '@/types';

const team = (id: string) => ({ id, abbreviation: id.toUpperCase(), city: id, name: id, depthChart: {} }) as unknown as Team;
const N = 400;

/** Fumbles at NFL rates: ~0.5 LOST per team per game (~0.25 on runs, ~6–7% of sacks as strip-sacks, ~1 in 175–200
 *  catches) and about as many again that the offense falls on. Wide bands: these are random sims. */
describe('lost fumbles happen about as often as in the NFL', () => {
  it('watch-live engine: runs, strip-sacks and catches', () => {
    let fum = 0, sacks = 0, comps = 0, runs = 0, stripSack = 0, catchFum = 0, kept = 0;
    for (let g = 0; g < N; g++) {
      const hr = generateRoster('h', 72), ar = generateRoster('a', 72);
      const r = simulatePlayByPlay(team('h'), team('a'), hr, ar);
      r.events.forEach((e, i) => {
        if (e.type === 'fumble') {
          fum++;
          const prev = r.events[i - 1]?.type;
          if (prev === 'sack') stripSack++;
          if (prev === 'pass_complete') catchFum++;
        }
        if ((e.type === 'run' || e.type === 'sack' || e.type === 'pass_complete') && /FUMBLE!|Ball is out!/.test(e.description)) kept++;
        if (e.type === 'sack') sacks++;
        if (e.type === 'pass_complete') comps++;
        if (e.type === 'run') runs++;
      });
    }
    void runs;
    // about half of NFL fumbles are recovered by the offense: kept ≈ lost
    expect(kept / fum).toBeGreaterThan(0.6);
    expect(kept / fum).toBeLessThan(1.6);
    expect(fum / N / 2).toBeGreaterThan(0.38);
    expect(fum / N / 2).toBeLessThan(0.62);
    expect(stripSack / sacks).toBeGreaterThan(0.025);
    expect(stripSack / sacks).toBeLessThan(0.1);
    expect(catchFum / comps).toBeGreaterThan(0.0025);
    expect(catchFum / comps).toBeLessThan(0.011);
  });

  it('season engine', () => {
    let fum = 0;
    for (let g = 0; g < N; g++) {
      const hr = generateRoster('h', 72), ar = generateRoster('a', 72);
      for (const p of hr) (p as { teamId: string }).teamId = 'h';
      for (const p of ar) (p as { teamId: string }).teamId = 'a';
      const game = { id: `g${g}`, homeTeamId: 'h', awayTeamId: 'a', week: 1, homeScore: 0, awayScore: 0, played: false } as unknown as GameResult;
      const r = simulateGame(game, hr, ar);
      fum += Object.values(r.playerStats).reduce((s, p) => s + (p.fumbles ?? 0), 0);
    }
    // the box-score FUM stat counts every fumble, lost or kept: ~1 per team per game (NFL ~1.0–1.1)
    expect(fum / N / 2).toBeGreaterThan(0.75);
    expect(fum / N / 2).toBeLessThan(1.3);
  });

  it('live-coach engine (had no fumbles at all before)', () => {
    let fum = 0, games = 0;
    for (let g = 0; g < 150; g++) {
      const hr = generateRoster('h', 72), ar = generateRoster('a', 72);
      for (const p of hr) (p as { teamId: string }).teamId = 'h';
      for (const p of ar) (p as { teamId: string }).teamId = 'a';
      const eng = createLiveCoachEngine(team('h'), team('a'), hr, ar, {
        quarter: 1, timeSecs: 900, possession: 'home', fieldPos: 25, down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0,
        isGameOver: false, twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
        awaitingXpChoice: false, awaitingKickoffChoice: false, homeTimeouts: 3, awayTimeouts: 3,
      }, 'home');
      let safety = 0;
      while (!eng.isFinished() && safety++ < 4000) for (const e of eng.runOnePlay()) if (e.type === 'fumble') fum++;
      games++;
    }
    expect(fum / games / 2).toBeGreaterThan(0.3);
    expect(fum / games / 2).toBeLessThan(0.75);
  });
});
