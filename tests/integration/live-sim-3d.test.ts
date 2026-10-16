import { describe, it, expect } from 'vitest';
import { toSimResult, toSimPlay, toSimTeam, clockSeconds } from '@/lib/engine/liveSim3d';
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
