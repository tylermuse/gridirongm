/**
 * Returns: the next drive starts where the return ENDED (Tyler 11/15).
 *
 * Report: in a Live game a defender picked off a pass and ran it back to the opponent's 5, but his offense took the field
 * at the spot of the interception. Cause: none of the three engines modelled a return. A pick was one number rolled around
 * the mirror of the line of scrimmage (no catch spot, no return yards, never a touchdown), a lost fumble changed hands
 * where it lay, and the headless sim started the next drive at the mirrored line of scrimmage. The play that was shown
 * and the spot of the next drive could not agree.
 *
 * Now every change of possession on a return goes through returns.ts: catch / recovery spot, flipped to the new offense's
 * side, plus the return yards; a return that reaches the end zone is a touchdown and a kickoff follows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Player, Position, Team, GameResult } from '@/types';

/** Set a value to force that roll in every engine; null = the engine's own dice. */
const dice = vi.hoisted(() => ({ air: null as number | null, ret: null as number | null }));
vi.mock('@/lib/engine/returns', async (original) => {
  const real = await original<typeof import('@/lib/engine/returns')>();
  return {
    ...real,
    rollPickAirYards: (...a: Parameters<typeof real.rollPickAirYards>) => dice.air ?? real.rollPickAirYards(...a),
    rollReturn: (...a: Parameters<typeof real.rollReturn>) =>
      dice.ret != null ? real.resolveReturn({ spot: a[1], returnYards: dice.ret }) : real.rollReturn(...a),
  };
});

import { resolveReturn, returnNote, rollReturn, rollPickAirYards } from '@/lib/engine/returns';
import { createLiveCoachEngine, type LiveEngineState } from '@/lib/engine/liveCoachEngine';
import { simulatePlayByPlay, deriveScoringPlaysFromEvents, type PlayEvent } from '@/lib/engine/playByPlay';
import { simulateGame } from '@/lib/engine/simulate';
import { toSimResult, toSimPlay } from '@/lib/engine/liveSim3d';
import { generateRoster } from '@/lib/engine/playerGen';

function makePlayer(id: string, position: Position, ovr = 78): Player {
  return {
    id, firstName: 'Test', lastName: id, position, age: 26, experience: 4,
    ratings: {
      overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr,
      stamina: ovr, throwing: ovr, catching: ovr, carrying: ovr, blocking: ovr,
      tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr,
    },
    potential: ovr, ratingHistory: [], stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'], contract: {} as Player['contract'],
    teamId: null, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}
function makeRoster(prefix: string): Player[] {
  return (['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'P', 'DL', 'LB', 'CB', 'S'] as Position[])
    .map((pos, i) => makePlayer(`${prefix}-${pos}${i}`, pos));
}
function makeTeam(id: string): Team {
  return { id, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} } as unknown as Team;
}
function midGame(over: Partial<LiveEngineState>): LiveEngineState {
  return {
    quarter: 2, timeSecs: 600, possession: 'away', fieldPos: 50,
    down: 1, yardsToGo: 10, homeScore: 7, awayScore: 7, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3,
    ...over,
  } as LiveEngineState;
}
/** The user is the home team. */
function engineIn(state: LiveEngineState) {
  return createLiveCoachEngine(makeTeam('HOM'), makeTeam('AWY'), makeRoster('H'), makeRoster('A'), state, 'home');
}
/** Snap fresh copies of `state` until the play produces an event of `type`; returns the engine and what it logged. */
function snapUntil(type: PlayEvent['type'], state: Partial<LiveEngineState>, call: Parameters<ReturnType<typeof engineIn>['runOnePlay']>[0]) {
  for (let i = 0; i < 20000; i++) {
    const engine = engineIn(midGame(state));
    const events = engine.runOnePlay(call);
    const ev = events.find(e => e.type === type);
    if (ev) return { engine, events, ev, after: engine.getState() };
  }
  throw new Error(`no ${type} in 20000 snaps`);
}

beforeEach(() => { dice.air = null; dice.ret = null; });

describe('resolveReturn — the one helper every return is spotted with', () => {
  it('INT at the defense\'s own 30, 60-yard return: the drive starts at the opponent\'s 10', () => {
    // the offense's 70 is the defense's own 30
    expect(resolveReturn({ spot: 70, returnYards: 60 })).toEqual({ result: 'spot', fieldPos: 90, from: 30, returnYards: 60 });
  });
  it('a 0-yard return: the spot is the catch spot', () => {
    expect(resolveReturn({ spot: 70, returnYards: 0 })).toEqual({ result: 'spot', fieldPos: 30, from: 30, returnYards: 0 });
  });
  it('flips the field BEFORE adding the return (the return is the new offense\'s gain, never the old offense\'s)', () => {
    // caught at the old offense's 20 = the returner's 80; +15 is the opponent's 5, not back at his own 65
    expect(resolveReturn({ spot: 20, returnYards: 15 }).fieldPos).toBe(95);
  });
  it('a return that reaches the end zone is a touchdown, not 1st-and-goal at the 1', () => {
    expect(resolveReturn({ spot: 70, returnYards: 70 })).toEqual({ result: 'touchdown', fieldPos: 100, from: 30, returnYards: 70 });
    expect(resolveReturn({ spot: 70, returnYards: 99 })).toMatchObject({ result: 'touchdown', returnYards: 70 });
    // one yard short is the 1... of the opponent
    expect(resolveReturn({ spot: 70, returnYards: 69 })).toEqual({ result: 'spot', fieldPos: 99, from: 30, returnYards: 69 });
  });
  it('caught in his own end zone and not brought out: touchback (the 20; a kickoff passes its own spot)', () => {
    expect(resolveReturn({ spot: 104, returnYards: 0 })).toEqual({ result: 'touchback', fieldPos: 20, from: 0, returnYards: 0 });
    expect(resolveReturn({ spot: 100, returnYards: 0, touchbackAt: 35 }).fieldPos).toBe(35);
    // brought out of the end zone: spotted where he got to
    expect(resolveReturn({ spot: 104, returnYards: 18 })).toEqual({ result: 'spot', fieldPos: 18, from: 0, returnYards: 18 });
  });
  it('caught inside his own 5 and carried into the end zone: back at the spot of the catch (momentum rule); from farther out it is a safety', () => {
    expect(resolveReturn({ spot: 97, returnYards: -6 })).toEqual({ result: 'spot', fieldPos: 3, from: 3, returnYards: 0 });
    expect(resolveReturn({ spot: 92, returnYards: -10 })).toMatchObject({ result: 'safety', fieldPos: 0, from: 8 });
  });
  it('the same arithmetic spots a fumble return and a punt return', () => {
    // fumble recovered at the offense's 45 (the defense's 55), run back 20: the opponent's 25
    expect(resolveReturn({ spot: 45, returnYards: 20 })).toEqual({ result: 'spot', fieldPos: 75, from: 55, returnYards: 20 });
    // punt from the 30 travelling 45 lands at the punting team's 75 = the returner's 25; a 12-yard return is his 37
    expect(resolveReturn({ spot: 30 + 45, returnYards: 12 })).toEqual({ result: 'spot', fieldPos: 37, from: 25, returnYards: 12 });
    expect(resolveReturn({ spot: 30 + 45, returnYards: 0 }).fieldPos).toBe(25);
    expect(resolveReturn({ spot: 30 + 45, returnYards: 80 }).result).toBe('touchdown');
  });
  it('the words say what the spot did', () => {
    expect(returnNote('interception', resolveReturn({ spot: 70, returnYards: 60 }))).toBe(" Returned 60 yards to the opponent's 10.");
    expect(returnNote('interception', resolveReturn({ spot: 70, returnYards: 0 }))).toBe(' Down at his own 30, no return.');
    expect(returnNote('interception', resolveReturn({ spot: 70, returnYards: 80 }))).toBe(' PICK-SIX! Returned 70 yards for a TOUCHDOWN!');
    expect(returnNote('fumble', resolveReturn({ spot: 45, returnYards: 1 }))).toBe(" Returned 1 yard to the opponent's 44.");
    expect(returnNote('fumble', resolveReturn({ spot: 45, returnYards: 60 }))).toBe(' SCOOP AND SCORE! Returned 45 yards for a TOUCHDOWN!');
  });
  it('the dice never lose ground, and an end-zone punt is always a touchback', () => {
    for (let i = 0; i < 3000; i++) {
      for (const kind of ['interception', 'fumble', 'punt'] as const) {
        const spot = 1 + Math.floor(Math.random() * 108);
        const out = rollReturn(kind, spot);
        expect(out.result).not.toBe('safety');
        expect(out.returnYards).toBeGreaterThanOrEqual(0);
        if (out.result === 'spot') { expect(out.fieldPos).toBeGreaterThanOrEqual(1); expect(out.fieldPos).toBeLessThanOrEqual(99); expect(out.fieldPos).toBe(Math.max(1, out.from + out.returnYards)); }
        if (kind === 'punt' && spot >= 100) expect(out.result).toBe('touchback');
      }
      const toGoal = 1 + Math.floor(Math.random() * 99);
      expect(rollPickAirYards('deep', toGoal)).toBeLessThanOrEqual(toGoal + 7);
    }
  });
});

describe('Live Coach — the drive after a return starts where the return ended', () => {
  it('INT at the defense\'s own 30, 60-yard return: 1st-and-10 at the opponent\'s 10, and the feed and the 3D sim say the same', () => {
    dice.air = 20; dice.ret = 60;   // snapped at the 50, thrown 20 yards: picked at the offense's 70
    const { ev, after } = snapUntil('interception', { fieldPos: 50 }, 'pass_deep');
    expect(after.possession).toBe('home');
    expect([after.fieldPos, after.down, after.yardsToGo]).toEqual([90, 1, 10]);
    expect(ev).toMatchObject({ returnFrom: 30, returnYards: 60, returnTo: 90, isScoring: false });
    expect(ev.description).toMatch(/INTERCEPTED!.* Returned 60 yards to the opponent's 10\.$/);
    expect([after.homeScore, after.awayScore]).toEqual([7, 7]);
    // the sim throws the pick to the engine's catch spot and runs the return to the engine's end spot
    expect(toSimResult(ev)).toEqual({ kind: 'int', depth: 'deep', catchAt: 30, endAt: 90 });
  });

  it('INT with a 0-yard return: the spot is the catch spot', () => {
    dice.air = 6; dice.ret = 0;
    const { ev, after } = snapUntil('interception', { fieldPos: 40 }, 'pass_short');
    expect(after.possession).toBe('home');
    expect(after.fieldPos).toBe(54);   // picked at the offense's 46
    expect(ev).toMatchObject({ returnFrom: 54, returnYards: 0, returnTo: 54 });
    expect(ev.description).toMatch(/Down at the opponent's 46, no return\.$/);
    expect(toSimResult(ev)).toEqual({ kind: 'int', depth: 'short', catchAt: 54, endAt: 54 });
  });

  it('pick-six: the defense scores, then kicks off', () => {
    dice.air = 20; dice.ret = 99;
    const { ev, events, after } = snapUntil('interception', { fieldPos: 50, homeScore: 0, awayScore: 0 }, 'pass_deep');
    expect(ev).toMatchObject({ isScoring: true, returnFrom: 30, returnYards: 70, returnTo: 100 });
    expect(ev.description).toMatch(/PICK-SIX! Returned 70 yards for a TOUCHDOWN!$/);
    // 7 to the team that made the pick (home), on the play's own line
    expect([ev.homeScore, ev.awayScore]).toEqual([7, 0]);
    expect([after.homeScore, after.awayScore]).toEqual([7, 0]);
    // …then a kickoff, and the team that threw it has the ball again
    const idx = events.indexOf(ev);
    expect(events.slice(idx + 1).map(e => e.type)).toContain('kickoff');
    expect(events[idx + 1].possession).toBe('home');   // the scoring team kicks
    expect(after.possession).toBe('away');
    expect(after.down).toBe(1);
    // the sim is told the engine scored it, and shows the score from before the play going in
    expect(toSimResult(ev)).toMatchObject({ kind: 'int', catchAt: 30, td: true });
    expect(toSimPlay(ev)!.pre).toMatchObject({ homeScore: 0, awayScore: 0 });
    // the box score's scoring summary itemizes it for the defense
    expect(deriveScoringPlaysFromEvents(events, 'HOM', 'AWY')).toEqual([expect.objectContaining({ teamId: 'HOM', points: 7 })]);
  });

  it('a pick in the end zone that is not brought out is a touchback at the 20', () => {
    dice.ret = 0;
    const { ev, after } = snapUntil('interception', { fieldPos: 92 }, 'pass_deep');   // deep from the 8: caught in the end zone
    expect(after.possession).toBe('home');
    expect(after.fieldPos).toBe(20);
    expect(ev).toMatchObject({ returnFrom: 0, returnYards: 0, returnTo: 20, isScoring: false });
    expect(ev.description).toMatch(/Picked in the end zone — touchback\.$/);
    expect(toSimResult(ev)).toMatchObject({ kind: 'int', catchAt: 1, endAt: 1 });   // no return to picture
  });

  it('fumble return: recovered at the spot, run back 25 — the drive starts 25 yards on', () => {
    dice.ret = 25;
    const { ev, after } = snapUntil('fumble', { fieldPos: 40 }, 'run');
    const lostAt = 100 - ev.fieldPos;   // the fumble is logged at the spot the ball came out, on the offense's side
    expect(after.possession).toBe('home');
    expect(ev).toMatchObject({ returnFrom: lostAt, returnYards: 25, returnTo: lostAt + 25 });
    expect([after.fieldPos, after.down, after.yardsToGo]).toEqual([lostAt + 25, 1, 10]);
    expect(ev.description).toMatch(/ Returned 25 yards to /);
  });

  it('fumble with no return: the defense takes over where it was recovered', () => {
    dice.ret = 0;
    const { ev, after } = snapUntil('fumble', { fieldPos: 40 }, 'run');
    expect(after.fieldPos).toBe(100 - ev.fieldPos);
    expect(ev).toMatchObject({ returnYards: 0, returnTo: 100 - ev.fieldPos });
    expect(ev.description).toMatch(/no return\.$/);
  });

  it('scoop-and-score: the defense scores, then kicks off', () => {
    dice.ret = 99;
    const { ev, events, after } = snapUntil('fumble', { fieldPos: 40 }, 'run');
    expect(ev).toMatchObject({ isScoring: true, returnTo: 100 });
    expect(ev.description).toMatch(/SCOOP AND SCORE! Returned \d+ yards? for a TOUCHDOWN!$/);
    expect([after.homeScore, after.awayScore]).toEqual([14, 7]);
    expect(events.slice(events.indexOf(ev) + 1).map(e => e.type)).toContain('kickoff');
    expect(after.possession).toBe('away');
  });

  it('punt return: fielded where the punt came down, the drive starts where the return ended', () => {
    dice.ret = 12;
    for (let i = 0; i < 50; i++) {
      const engine = engineIn(midGame({ possession: 'home', fieldPos: 30, down: 4, yardsToGo: 8 }));
      const ev = engine.runOnePlay('punt').find(e => e.type === 'punt')!;
      const after = engine.getState();
      const caughtAt = 100 - (30 + ev.yardsGained);   // the returner's yard line
      expect(after.possession).toBe('away');
      expect(ev).toMatchObject({ returnFrom: caughtAt, returnYards: 12, returnTo: caughtAt + 12 });
      expect([after.fieldPos, after.down, after.yardsToGo]).toEqual([caughtAt + 12, 1, 10]);
      expect(ev.description).toContain(`fields at their own ${caughtAt}, returns to `);
      expect(toSimResult(ev)).toEqual({ kind: 'punt', catchAt: caughtAt, endAt: caughtAt + 12 });
    }
  });

  it('punt with a fair catch: the spot is the catch spot', () => {
    dice.ret = 0;
    const engine = engineIn(midGame({ possession: 'home', fieldPos: 30, down: 4, yardsToGo: 8 }));
    const ev = engine.runOnePlay('punt').find(e => e.type === 'punt')!;
    const caughtAt = 100 - (30 + ev.yardsGained);
    expect(engine.getState().fieldPos).toBe(caughtAt);
    expect(ev.description).toContain(`fields at their own ${caughtAt}, fair catch.`);
  });

  it('punt return touchdown: the returning team scores, then kicks off', () => {
    dice.ret = 100;
    const engine = engineIn(midGame({ possession: 'home', fieldPos: 30, down: 4, yardsToGo: 8 }));
    const events = engine.runOnePlay('punt');
    const ev = events.find(e => e.type === 'punt')!;
    const after = engine.getState();
    expect(ev).toMatchObject({ isScoring: true, returnTo: 100 });
    expect(ev.description).toMatch(/punt return TOUCHDOWN!$/);
    expect([after.homeScore, after.awayScore]).toEqual([7, 14]);
    expect(events.slice(events.indexOf(ev) + 1).map(e => e.type)).toContain('kickoff');
    expect(after.possession).toBe('home');   // the punting team gets the kickoff
  });

  it('a punt that reaches the end zone is a touchback at the 20 or is dropped inside the 10 — and the yardage agrees with the spot', () => {
    let touchbacks = 0;
    for (let i = 0; i < 300; i++) {
      const engine = engineIn(midGame({ possession: 'home', fieldPos: 70, down: 4, yardsToGo: 8 }));   // 30 from the goal line: every punt gets there
      const ev = engine.runOnePlay('punt').find(e => e.type === 'punt')!;
      const after = engine.getState();
      if (ev.isScoring) continue;   // the rare return all the way back has its own test
      if (/touchback/.test(ev.description)) {
        touchbacks++;
        expect(ev.yardsGained).toBe(30);
        expect(after.fieldPos).toBe(20);
      } else {
        expect(after.fieldPos).toBe(100 - (70 + ev.yardsGained) + (ev.returnYards ?? 0));
        expect(100 - (70 + ev.yardsGained)).toBeLessThan(10);
      }
    }
    expect(touchbacks).toBeGreaterThan(60);
    expect(touchbacks).toBeLessThan(240);
  });

  it('kickoff return: the event carries the same return the spot was set from', () => {
    for (let i = 0; i < 200; i++) {
      const engine = engineIn(midGame({ possession: 'away', fieldPos: 70, down: 4, yardsToGo: 5, quarter: 1, homeScore: 0, awayScore: 0 }));
      const events = engine.runOnePlay();   // CPU kicks the field goal or goes for it
      const kick = events.find(e => e.type === 'kickoff' && e.returnTo != null && !e.isScoring);
      if (!kick || events[events.length - 1] !== kick) continue;
      expect(kick.returnTo).toBe(kick.returnFrom! + kick.returnYards!);
      expect(engine.getState().fieldPos).toBe(kick.returnTo);
    }
  });
});

describe('watch-live play-by-play — the feed, the return and the next snap agree', () => {
  const isSnap = (e: PlayEvent) => ['run', 'pass_complete', 'pass_incomplete', 'sack', 'interception', 'touchdown', 'field_goal_good', 'field_goal_miss', 'punt', 'penalty'].includes(e.type);
  const other = (s: 'home' | 'away') => (s === 'home' ? 'away' : 'home');
  /** The next snap after event `i`, unless the period ended first (the half and overtime open with a new kickoff). */
  function nextSnap(evs: PlayEvent[], i: number): PlayEvent | undefined {
    for (let j = i + 1; j < evs.length; j++) {
      if (['quarter_end', 'halftime', 'overtime', 'final'].includes(evs[j].type)) return undefined;
      if (isSnap(evs[j])) return evs[j];
    }
    return undefined;
  }

  function check(games: number, mcafee: boolean) {
    const seen = { interception: 0, fumble: 0, punt: 0, kickoff: 0, td: 0 };
    for (let g = 0; g < games; g++) {
      const live = simulatePlayByPlay(makeTeam('H'), makeTeam('A'), makeRoster('H'), makeRoster('A'), false, mcafee);
      const evs = live.events;
      evs.forEach((ev, i) => {
        if (ev.returnTo == null || /Muffed/.test(ev.description)) return;
        const kind = ev.type as keyof typeof seen;
        if (!(kind in seen)) throw new Error(`unexpected return on a ${ev.type} event`);
        seen[kind]++;
        const returner = other(ev.possession);
        const from = ev.returnFrom!, yds = ev.returnYards!;
        if (ev.returnTo === 100) {
          // return touchdown: 7 to the returning team on this line, and that team kicks off next
          seen.td++;
          expect(ev.isScoring).toBe(true);
          expect(ev.description).toMatch(/TOUCHDOWN/);
          const before = evs[i - 1] ?? { homeScore: 0, awayScore: 0 };   // the opening kickoff can be the one run back
          expect(ev[`${returner}Score`] - before[`${returner}Score`]).toBeGreaterThanOrEqual(7);
          const next = evs[i + 1];
          if (next && next.type === 'kickoff') expect(next.possession).toBe(returner);
          return;
        }
        expect(ev.isScoring).toBe(false);
        const touchback = yds === 0 && ev.returnTo !== from;
        if (touchback) { expect(from).toBe(0); expect(ev.description).toMatch(/touchback/i); }
        else expect(ev.returnTo).toBe(Math.max(1, from + yds));
        // the words carry the same numbers
        if (ev.type === 'interception' || ev.type === 'fumble') {
          if (touchback) { /* said above */ }
          else if (yds > 0) expect(ev.description).toContain(`Returned ${yds} yard${yds === 1 ? '' : 's'} to `);
          else expect(ev.description).toMatch(/no return\.$/);
        }
        if (ev.type === 'punt' && !touchback) {
          expect(from).toBe(100 - (ev.fieldPos + ev.yardsGained));
          expect(ev.description).toMatch(yds > 0 ? new RegExp(`returned ${yds} yards? to `) : /Fair catch at /);
        }
        // …and the returning team's next snap is 1st-and-10 exactly there
        const next = nextSnap(evs, i);
        if (next) {
          expect(next.possession).toBe(returner);
          expect([next.fieldPos, next.down, next.yardsToGo]).toEqual([ev.returnTo, 1, 10]);
        }
      });
      // every point is itemized for the right team, return touchdowns included
      const plays = deriveScoringPlaysFromEvents(evs, 'H', 'A');
      expect(plays.filter(p => p.teamId === 'H').reduce((a, p) => a + p.points, 0)).toBe(live.homeScore);
      expect(plays.filter(p => p.teamId === 'A').reduce((a, p) => a + p.points, 0)).toBe(live.awayScore);
    }
    return seen;
  }

  it('with the engine\'s own dice, every return in 60 games is told and spotted the same way', () => {
    const seen = check(60, false);
    expect(seen.interception).toBeGreaterThan(20);
    expect(seen.punt).toBeGreaterThan(100);
    expect(seen.kickoff).toBeGreaterThan(100);
    const mc = check(30, true);
    expect(mc.punt).toBeGreaterThan(50);
  });

  it('INT with a 60-yard return starts the drive 60 yards past the catch (own 30 → the opponent\'s 10)', () => {
    dice.air = 10; dice.ret = 60;
    let found = 0;
    for (let g = 0; g < 40; g++) {
      const evs = simulatePlayByPlay(makeTeam('H'), makeTeam('A'), makeRoster('H'), makeRoster('A')).events;
      evs.forEach((ev, i) => {
        if (ev.type !== 'interception') return;
        const from = 100 - (ev.fieldPos + 10);   // thrown 10 yards from the line of scrimmage
        if (from < 1 || from > 39) return;        // a 60-yard return from here stays in the field of play
        found++;
        expect(ev).toMatchObject({ returnFrom: from, returnYards: 60, returnTo: from + 60, isScoring: false });
        if (from === 30) expect(ev.description).toMatch(/ Returned 60 yards to the opponent's 10\.$/);
        const next = nextSnap(evs, i);
        if (next) expect([next.possession, next.fieldPos, next.down, next.yardsToGo]).toEqual([other(ev.possession), from + 60, 1, 10]);
      });
    }
    expect(found).toBeGreaterThan(5);
  });

  it('every pick run back to the house is a pick-six followed by a kickoff from the scoring team', () => {
    dice.ret = 99;
    const seen = check(15, false);
    expect(seen.td).toBeGreaterThan(10);
  });

  it('with no return at all, every turnover is spotted exactly where the ball was caught or recovered', () => {
    dice.ret = 0;
    for (let g = 0; g < 20; g++) {
      for (const ev of simulatePlayByPlay(makeTeam('H'), makeTeam('A'), makeRoster('H'), makeRoster('A')).events) {
        if (ev.type === 'fumble') expect(ev.returnTo).toBe(100 - ev.fieldPos);   // not pushed out to the 15 / pulled back to the 75
        if (ev.type === 'interception' && ev.returnFrom! > 0) expect(ev.returnTo).toBe(ev.returnFrom);
      }
    }
    check(10, false);
  });
});

describe('headless sim — return touchdowns reach the scoreboard', () => {
  function simOne(i: number) {
    const game = { id: `r${i}`, week: 1, season: 2026, homeTeamId: 'H', awayTeamId: 'A', homeScore: 0, awayScore: 0, played: false, playerStats: {} } as GameResult;
    return simulateGame(game, generateRoster('H', 72), generateRoster('A', 72));
  }
  const sum = (r: GameResult, teamId: string) => (r.scoringPlays ?? []).filter(p => p.teamId === teamId && p.quarter <= 4).reduce((a, p) => a + p.points, 0);

  it('a turnover run back to the end zone is 7 for the DEFENSE, itemized as a return', () => {
    dice.ret = 99;
    let returns = 0;
    for (let i = 0; i < 40; i++) {
      const r = simOne(i);
      const tds = (r.scoringPlays ?? []).filter(p => /(interception|fumble) return/.test(p.description));
      returns += tds.length;
      for (const p of tds) expect(p.points).toBe(7);
      // with every turnover a touchdown, a team's interceptions thrown show up as the OTHER team's return scores
      const picksBy = (roster: 'H' | 'A') => Object.entries(r.playerStats).filter(([id]) => id.startsWith(roster)).reduce((a, [, s]) => a + (s.interceptions ?? 0), 0);
      const pickSixesFor = (teamId: string) => tds.filter(p => p.teamId === teamId && /interception return/.test(p.description)).length;
      if (Object.keys(r.playerStats).some(id => id.startsWith('H'))) {
        expect(pickSixesFor('A')).toBe(picksBy('H'));
        expect(pickSixesFor('H')).toBe(picksBy('A'));
      }
    }
    expect(returns).toBeGreaterThan(20);
  });

  it('regulation scoring plays still add up to the score with the real dice', () => {
    for (let i = 0; i < 60; i++) {
      const r = simOne(i);
      const ot = (r.scoringPlays ?? []).filter(p => p.quarter > 4);
      const otFor = (teamId: string) => ot.filter(p => p.teamId === teamId).reduce((a, p) => a + p.points, 0);
      expect(sum(r, 'H') + otFor('H')).toBe(r.homeScore);
      expect(sum(r, 'A') + otFor('A')).toBe(r.awayScore);
    }
  });
});
