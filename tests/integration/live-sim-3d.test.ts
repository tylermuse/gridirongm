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
    expect(toSimResult(ev({ type: 'punt' }))).toEqual({ kind: 'punt' });
    expect(toSimResult(ev({ type: 'kickoff' }))).toBeNull();
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
