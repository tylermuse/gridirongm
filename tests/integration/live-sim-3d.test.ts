import { describe, it, expect } from 'vitest';
import { toSimResult, toSimPlay, toSimTeam, clockSeconds, toSimLineup, skinToneFor, whoMadeThePlay } from '@/lib/engine/liveSim3d';
import portraitSkin from '@/lib/portraits/portraitSkin.json';
import { portraitFileFor } from '@/lib/portraits/portraitPool';
import type { PlayEvent } from '@/lib/engine/playByPlay';

function ev(p: Partial<PlayEvent>): PlayEvent {
  return {
    id: 7, type: 'run', description: '', quarter: 2, timeStr: '07:05',
    possession: 'home', fieldPos: 30, down: 2, yardsToGo: 6, yardsGained: 0,
    homeScore: 10, awayScore: 3, isScoring: false, ...p,
  };
}

describe('liveSim3d.toSimResult', () => {
  it('maps scrimmage plays with the real yardage', () => {
    expect(toSimResult(ev({ type: 'run', yardsGained: -2 }))).toEqual({ kind: 'run', yards: -2 });
    expect(toSimResult(ev({ type: 'pass_complete', yardsGained: 12 }))).toEqual({ kind: 'complete', depth: 'short', yards: 12 });
    expect(toSimResult(ev({ type: 'pass_complete', yardsGained: 31 }))).toEqual({ kind: 'complete', depth: 'deep', yards: 31 });
    expect(toSimResult(ev({ type: 'sack', yardsGained: -7 }))).toEqual({ kind: 'sack', yards: -7 });
    expect(toSimResult(ev({ type: 'interception', description: 'picked off downfield' }))).toEqual({ kind: 'int', depth: 'deep' });
  });
  it('pictures the pass the user CALLED, not one guessed from the yardage (10/27: called deep shots animated as short catches and vice versa)', () => {
    // a 16-yard deep shot is still a deep ball
    expect(toSimResult(ev({ type: 'pass_complete', description: '🚀 Deep Shot — J. Hurts completes to D. Smith for 16 yards.', yardsGained: 16 }))).toEqual({ kind: 'complete', depth: 'deep', yards: 16 });
    // a short pass that breaks for 25 after the catch is still a short throw
    expect(toSimResult(ev({ type: 'pass_complete', description: '🎯 Short Pass — J. Hurts fires deep to D. Smith — 25 yards!', yardsGained: 25 }))).toEqual({ kind: 'complete', depth: 'short', yards: 25 });
    expect(toSimResult(ev({ type: 'pass_incomplete', description: "🎯 Short Pass — J. Hurts's pass to D. Smith falls incomplete." }))).toEqual({ kind: 'incomplete', depth: 'short' });
    expect(toSimResult(ev({ type: 'pass_incomplete', description: "🚀 Deep Shot — J. Hurts's pass to D. Smith falls incomplete." }))).toEqual({ kind: 'incomplete', depth: 'deep' });
    // a screen that pops for 20+ stays a screen
    expect(toSimResult(ev({ type: 'pass_complete', description: '🛡️ Screen — J. Hurts fires deep to S. Barkley — 24 yards!', yardsGained: 24 }))).toEqual({ kind: 'complete', depth: 'short', yards: 24, style: 'screen' });
    // the live engine's own 20+ wording on an uncalled (CPU) play still reads as deep
    expect(toSimResult(ev({ type: 'pass_complete', description: 'J. Hurts fires deep to D. Smith — 23 yards!', yardsGained: 23 }))).toEqual({ kind: 'complete', depth: 'deep', yards: 23 });
  });
  it('reads the live engine kickoff results (return spot, touchback, return TD)', () => {
    expect(toSimResult(ev({ type: 'kickoff', description: 'Kickoff returned to the 28 by D. Hill.' }))).toEqual({ kind: 'kickoff', ret: 28 });
    expect(toSimResult(ev({ type: 'kickoff', description: 'Kickoff sails into the end zone — touchback. Ball at the 35.' }))).toEqual({ kind: 'kickoff', touchback: true });
    expect(toSimResult(ev({ type: 'kickoff', description: 'Kick return TOUCHDOWN! D. Hill takes it all the way back!', isScoring: true, yardsGained: 100 }))).toEqual({ kind: 'kickoff', td: true });
  });
  it('skips bookkeeping events that ride on the run type (timeouts, turnover on downs)', () => {
    expect(toSimResult(ev({ type: 'run', description: '⏱️ Timeout called by NE. (2 remaining)' }))).toBeNull();
    expect(toSimResult(ev({ type: 'run', description: 'Turnover on downs! The defense takes over.' }))).toBeNull();
    expect(toSimResult(ev({ type: 'run', description: 'R. Stevenson runs for 3 yards.', yardsGained: 3 }))).toEqual({ kind: 'run', yards: 3 });
  });
  it('scores when the game scored, from both engines', () => {
    // liveCoachEngine: run / pass_complete + isScoring; the sim scores when yards >= yards-to-goal
    expect(toSimResult(ev({ type: 'run', isScoring: true, yardsGained: 4, fieldPos: 96 }))).toEqual({ kind: 'run', yards: 4 });
    expect(toSimResult(ev({ type: 'pass_complete', isScoring: true, yardsGained: 22, fieldPos: 78 }))).toEqual({ kind: 'complete', depth: 'deep', yards: 22 });
    // playByPlay: type 'touchdown', rush vs pass from the text
    expect(toSimResult(ev({ type: 'touchdown', description: 'Dive to the pylon! TOUCHDOWN!', fieldPos: 97, yardsGained: 3 }))).toEqual({ kind: 'run', yards: 3 });
    expect(toSimResult(ev({ type: 'touchdown', description: 'hits T. Kelce for the 12-yard score!', fieldPos: 88, yardsGained: 12 }))).toEqual({ kind: 'complete', depth: 'short', yards: 12 });
  });
  it('maps special teams and skips what the sim cannot picture', () => {
    expect(toSimResult(ev({ type: 'field_goal_good' }))).toEqual({ kind: 'fg', good: true });
    expect(toSimResult(ev({ type: 'field_goal_miss' }))).toEqual({ kind: 'fg', good: false });
    // the try after a TD is an extra point (1 pt, labelled as such), not a field goal
    expect(toSimResult(ev({ type: 'extra_point', description: 'Extra point is GOOD.' }))).toEqual({ kind: 'fg', xp: true, good: true });
    expect(toSimResult(ev({ type: 'extra_point', description: 'Extra point is no good.' }))).toEqual({ kind: 'fg', xp: true, good: false });
    // playByPlay logs net yards only: fielded and downed at the net spot (30 + 45 → receiving 25)
    expect(toSimResult(ev({ type: 'punt', yardsGained: 45, description: 'Punt — 45 yards net.' }))).toEqual({ kind: 'punt', catchAt: 25, endAt: 25 });
    // Live Coach names the catch and return spots: the sim must use them, not invent its own
    expect(toSimResult(ev({ type: 'punt', fieldPos: 54, yardsGained: 41, description: '🥾 Punt — 41 yards, BAL fields at their own 5, returns to the 9.' }))).toEqual({ kind: 'punt', catchAt: 5, endAt: 9 });
    expect(toSimResult(ev({ type: 'punt', yardsGained: 40, description: '🥾 Punt — 40 yards, BAL fields at their own 30, fair catch.' }))).toEqual({ kind: 'punt', catchAt: 30, endAt: 30 });
    expect(toSimResult(ev({ type: 'punt', description: 'Muffed punt! The kicking team recovers!' }))).toBeNull();
    expect(toSimResult(ev({ type: 'kickoff', description: 'Onside kick attempt — receiving team recovers.' }))).toBeNull();   // normal kickoffs are pictured now (see 'kickoffs')
    expect(toSimResult(ev({ type: 'fumble' }))).toBeNull();
    expect(toSimResult(ev({ type: 'run', description: 'takes a knee' }))).toBeNull();
    expect(toSimResult(ev({ type: 'punt', description: 'FAKE PUNT!' }))).toBeNull();
  });
});

describe('liveSim3d.toSimPlay', () => {
  it('sends pre-snap state and backs the score out of a scoring play', () => {
    const m = toSimPlay(ev({ type: 'touchdown', description: 'runs it in', fieldPos: 95, yardsGained: 5, homeScore: 17, awayScore: 3, possession: 'home' }))!;
    expect(m.type).toBe('bsgm:play');
    expect(m.id).toBe(7);
    expect(m.pre).toEqual({ fieldPos: 95, down: 2, toGo: 6, quarter: 2, clock: 425, homeScore: 11, awayScore: 3 });
    expect(m.res).toEqual({ kind: 'run', yards: 5 });
  });
  it('parses the clock defensively', () => {
    expect(clockSeconds('12:34')).toBe(754);
    expect(clockSeconds('0:05')).toBe(5);
    expect(clockSeconds('')).toBe(900);
  });
});

describe('liveSim3d.toSimTeam', () => {
  const t = { abbreviation: 'BUF', name: 'Blizzard', primaryColor: '#1A1A1A', secondaryColor: '#C8A82E' };
  it('home wears its primary, away wears white with the primary as the accent', () => {
    expect(toSimTeam(t, 'home')).toMatchObject({ id: 'BUF', jersey: '#1A1A1A', num: '#ffffff', helmet: '#1A1A1A' });
    expect(toSimTeam(t, 'away')).toMatchObject({ id: 'BUF', jersey: '#f4f1ea', num: '#1A1A1A', helmet: '#1A1A1A' });
  });
});

describe('liveSim3d lineup', () => {
  const mk = (id: string, position: string, jerseyNumber?: number, photoUrl?: string) => ({ id, position, jerseyNumber, photoUrl });
  it('starters by slot in depth-chart order, with numbers and a skin tone each', () => {
    const roster = [mk('q1', 'QB', 9), mk('q2', 'QB', 12), mk('r1', 'RB', 26), mk('w1', 'WR', 81), mk('w2', 'WR', 13), mk('w3', 'WR', 17), mk('w4', 'WR', 19),
      ...[70, 71, 72, 73, 74, 75].map((n, i) => mk('o' + i, 'OL', n)), mk('k1', 'K', 3), mk('d1', 'DL', 90), mk('c1', 'CB', 9)];
    const L = toSimLineup(roster);
    expect(L.qb?.n).toBe(9);
    expect(L.wr.map(m => m.n)).toEqual([81, 13, 17]);
    expect(L.ol.map(m => m.n)).toEqual([70, 71, 72, 73, 74]);
    expect(L.k?.n).toBe(3);
    expect(L.cb).toEqual([]);                      // #9 is already the QB's: the sim keeps its default there
    for (const m of [L.qb!, ...L.wr, ...L.ol]) expect(m.s).toMatch(/^#[0-9a-f]{6}$/);
    expect(toSimTeam({ abbreviation: 'BUF', name: 'B', primaryColor: '#1A1A1A', secondaryColor: '#C8A82E' }, 'home', roster).lineup?.rb?.n).toBe(26);
  });
  it('skin tone matches the generated headshot, stable for imported photos', () => {
    const p = mk('player-abc', 'RB', 22);
    const file = portraitFileFor('player-abc', 'RB')!;
    expect(skinToneFor(p)).toBe((portraitSkin as Record<string, string>)[file]);
    const real = mk('real-1', 'WR', 11, 'https://example.com/x.png');
    expect(skinToneFor(real)).toBe(skinToneFor(real));
    expect(Object.values(portraitSkin)).toContain(skinToneFor(real));
  });
});

describe('reconcileJerseys keeps real numbers', () => {
  it('a backup without a number never takes a starter\'s real number', async () => {
    const { reconcileJerseys } = await import('@/types');
    type P = Parameters<typeof reconcileJerseys>[0][number];
    const mk = (id: string, n: number | undefined, ovr: number, draftPick: number) =>
      ({ id, teamId: 't', position: 'QB', jerseyNumber: n, draftPick, lastName: id, ratings: { overall: ovr } }) as unknown as P;
    const out = reconcileJerseys([mk('backup', undefined, 50, 1), mk('starter', 4, 82, 135), mk('dup', 4, 40, 2)], [{ id: 't', retiredNumbers: [] } as never]);
    const by = Object.fromEntries(out.map(p => [p.id, p.jerseyNumber]));
    expect(by.starter).toBe(4);
    expect(by.backup).not.toBe(4);
    expect(by.dup).not.toBe(4);
  });
});

describe('liveSim3d who made the play', () => {
  const P = (firstName: string, lastName: string, position: string, jerseyNumber: number) => ({ id: lastName, firstName, lastName, position, jerseyNumber });
  const phi = [P('Jalen', 'Hurts', 'QB', 1), P('Saquon', 'Barkley', 'RB', 26), P('DeVonta', 'Smith', 'WR', 6), P('Dallas', 'Goedert', 'TE', 88)];
  const dal = [P('Micah', 'Parsons', 'DL', 11), P('Trevon', 'Diggs', 'CB', 7), P('Ryan', 'Smith', 'DL', 99)];
  const ev = (type: string, description: string) => ({ type, description } as unknown as Parameters<typeof whoMadeThePlay>[0]);
  it('runner, target, QB keeper, sacker and picker by name', () => {
    expect(whoMadeThePlay(ev('run', 'S. Barkley runs for 4 yards.'), phi, dal)?.ball?.n).toBe(26);
    expect(whoMadeThePlay(ev('pass_complete', 'J. Hurts completes to D. Goedert for 11 yards.'), phi, dal)?.ball).toMatchObject({ n: 88, pos: 'TE' });
    expect(whoMadeThePlay(ev('run', 'J. Hurts QB scrambles for 7.'), phi, dal)?.ball?.n).toBe(1);
    expect(whoMadeThePlay(ev('sack', '💥 M. Parsons DL gets home — J. Hurts QB sacked for 7 yards!'), phi, dal)?.def?.n).toBe(11);
    expect(whoMadeThePlay(ev('interception', 'INTERCEPTED! T. Diggs picks off J. Hurts.'), phi, dal)?.def?.n).toBe(7);
  });
  it('same last name on the other team is not confused; no names → nothing', () => {
    expect(whoMadeThePlay(ev('pass_complete', 'J. Hurts completes to D. Smith for 9 yards.'), phi, dal)?.ball?.n).toBe(6);
    expect(whoMadeThePlay(ev('run', 'The running back runs for 2 yards.'), phi, dal)).toBeUndefined();
  });
});

describe('whoMadeThePlay', () => {
  const p = (id: string, firstName: string, lastName: string, position: string, jerseyNumber: number) => ({ id, firstName, lastName, position, jerseyNumber });
  const off = [p('q', 'Dak', 'Prescott', 'QB', 4), p('r', 'Javonte', 'Williams', 'RB', 33), p('w', 'George', 'Pickens', 'WR', 3), p('w2', 'Amon-Ra', 'St. Brown', 'WR', 14), p('s', 'Joe', 'Smithson', 'WR', 80), p('s2', 'Jaylen', 'Smith', 'WR', 81)];
  const def = [p('d', 'Micah', 'Parsons', 'DL', 11), p('c', 'Trevon', 'Diggs', 'CB', 7)];
  const ev = (type: string, description: string) => ({ type, description }) as unknown as Parameters<typeof whoMadeThePlay>[0];
  it('finds the target on a throw, not the passer', () => {
    expect(whoMadeThePlay(ev('pass_complete', 'Short Pass — D. Prescott completes to G. Pickens for 5 yards.'), off, def)?.ball?.n).toBe(3);
    expect(whoMadeThePlay(ev('pass_complete', 'D. Prescott QB hits A. St. Brown WR over the middle.'), off, def)?.ball?.n).toBe(14);
  });
  it('runner, QB keeper, sacker, picker', () => {
    expect(whoMadeThePlay(ev('run', 'J. Williams runs for 4 yards.'), off, def)?.ball?.n).toBe(33);
    expect(whoMadeThePlay(ev('run', 'D. Prescott scrambles for 6.'), off, def)?.ball).toMatchObject({ n: 4, pos: 'QB' });
    expect(whoMadeThePlay(ev('sack', '💥 Sack! M. Parsons brings down D. Prescott for a 7-yard loss!'), off, def)?.def?.n).toBe(11);
    expect(whoMadeThePlay(ev('interception', '🚨 Intercepted! T. Diggs picks off D. Prescott!'), off, def)?.def?.n).toBe(7);
  });
  it('a name inside a longer name does not match', () => {
    expect(whoMadeThePlay(ev('run', 'J. Smithson runs for 2.'), off, def)?.ball?.n).toBe(80);
  });
});

describe('fumble after a run', () => {
  const p = (id: string, firstName: string, lastName: string, position: string, jerseyNumber: number) => ({ id, firstName, lastName, position, jerseyNumber });
  const home = [p('r', 'Javonte', 'Williams', 'RB', 33)], away = [p('l', 'Zack', 'Baun', 'LB', 53)];
  const base = { id: 7, quarter: 1, timeStr: '12:00', possession: 'home', fieldPos: 40, down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isScoring: false };
  it('pictures the run and the lost fumble as one play, the recoverer wearing his number', () => {
    const run = { ...base, type: 'run', description: 'J. Williams runs for 4 yards.', yardsGained: 4 } as unknown as Parameters<typeof toSimPlay>[0];
    const fum = { ...base, id: 8, fieldPos: 44, type: 'fumble', description: 'Fumble! J. Williams RB loses the ball — recovered by Z. Baun LB!', yardsGained: 0 } as unknown as Parameters<typeof toSimPlay>[0];
    const m = toSimPlay(run, { home, away }, fum)!;
    expect(m.res).toMatchObject({ kind: 'run', yards: 4, fumble: true });
    expect(m.who?.ball?.n).toBe(33);
    expect(m.who?.def?.n).toBe(53);
    expect(toSimPlay(fum, { home, away })).toBeNull();          // the fumble line itself is not a second play
    expect(toSimPlay(run, { home, away }, null)!.res.fumble).toBeUndefined();
  });
});

describe('screens keep their style', () => {
  const base = { id: 9, quarter: 2, timeStr: '5:00', possession: 'home', fieldPos: 97, down: 1, yardsToGo: 3, homeScore: 0, awayScore: 0 };
  it('a screen that scores at the goal line, and an incomplete screen, are still screens', () => {
    const td = { ...base, type: 'touchdown', isScoring: true, yardsGained: 3, description: '🛡️ Screen — D. Prescott completes to J. Williams for 3 yards. TOUCHDOWN!' } as unknown as Parameters<typeof toSimResult>[0];
    expect(toSimResult(td)).toMatchObject({ kind: 'complete', style: 'screen', depth: 'short' });
    const inc = { ...base, type: 'pass_incomplete', isScoring: false, yardsGained: 0, description: '🛡️ Screen — D. Prescott throws incomplete to J. Williams.' } as unknown as Parameters<typeof toSimResult>[0];
    expect(toSimResult(inc)).toMatchObject({ kind: 'incomplete', style: 'screen' });
    const long = { ...base, fieldPos: 30, type: 'pass_complete', isScoring: false, yardsGained: 24, description: '🛡️ Screen — D. Prescott completes to J. Williams for 24 yards.' } as unknown as Parameters<typeof toSimResult>[0];
    expect(toSimResult(long)).toMatchObject({ style: 'screen', depth: 'short' });
  });
});

describe('kickoffs', () => {
  const base = { id: 3, quarter: 1, timeStr: '15:00', possession: 'away', fieldPos: 30, down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, yardsGained: 0, isScoring: false };
  const ev = (description: string, extra = {}) => ({ ...base, type: 'kickoff', description, ...extra }) as unknown as Parameters<typeof toSimPlay>[0];
  it('return, fielded, touchback, return TD, onside', () => {
    expect(toSimPlay(ev('Kicking team lines up — kickoff. Returned to the 31.'))).toMatchObject({ possession: 'away', pre: { fieldPos: 35 }, res: { kind: 'kickoff', ret: 31 } });
    expect(toSimResult(ev('Kickoff fielded at the 25.'))).toEqual({ kind: 'kickoff', ret: 25 });
    expect(toSimResult(ev('Touchback.'))).toEqual({ kind: 'kickoff', touchback: true });
    expect(toSimResult(ev('Kick return TOUCHDOWN! Taken all the way back!', { isScoring: true, yardsGained: 100 }))).toEqual({ kind: 'kickoff', td: true });
    expect(toSimResult(ev('ONSIDE KICK — RECOVERED by the kicking team!'))).toBeNull();
  });
});

describe('team pants', () => {
  it('49ers wear gold and the Cowboys silver, home and away', () => {
    const sf = { abbreviation: 'SF', name: '49ers', primaryColor: '#aa0000', secondaryColor: '#b3995d' };
    const dal = { abbreviation: 'DAL', name: 'Cowboys', primaryColor: '#041e42', secondaryColor: '#869397' };
    expect(toSimTeam(sf, 'home').pants).toBe('#b3995d');
    expect(toSimTeam(sf, 'away').pants).toBe('#b3995d');
    expect(toSimTeam(dal, 'home').pants).toBe('#8a97a4');
    expect(toSimTeam(dal, 'away').pants).toBe('#8a97a4');
    // the fictional default-league SF club keeps its own kit
    expect(toSimTeam({ ...sf, name: 'Fog' }, 'away').pants).toBe('#f4f1ea');
  });
});
