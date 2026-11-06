/**
 * Free broadcast teaser (2026-11-06): free users hear one drive of the Marcus & Tony call over the 3D sim,
 * then get the Premium card. teaserEndIndex decides where that drive stops.
 */
import { describe, it, expect } from 'vitest';
import { teaserEndIndex } from '@/lib/engine/gameBroadcast';
import type { PlayEvent } from '@/lib/engine/playByPlay';

let nextId = 0;
function ev(type: PlayEvent['type'], possession: 'home' | 'away'): PlayEvent {
  return { id: nextId++, type, possession, quarter: 1, description: type } as unknown as PlayEvent;
}

describe('teaserEndIndex', () => {
  it('stops when the other team gets the ball', () => {
    const events = [ev('run', 'home'), ev('pass_complete', 'home'), ev('run', 'home'), ev('run', 'home'), ev('punt', 'home'), ev('run', 'away'), ev('run', 'away')];
    expect(teaserEndIndex(events, 0)).toBe(5);
  });

  it('follows the receiving team when it starts on a kickoff (kickoffs are logged on the kicking side)', () => {
    const events = [ev('kickoff', 'away'), ev('run', 'home'), ev('run', 'home'), ev('pass_complete', 'home'), ev('touchdown', 'home'), ev('extra_point', 'home'), ev('kickoff', 'home'), ev('run', 'away')];
    expect(teaserEndIndex(events, 0)).toBe(6);
  });

  it('keeps going into the next drive when the first one is only a play or two', () => {
    const events = [ev('punt', 'home'), ev('run', 'away'), ev('run', 'away'), ev('run', 'away'), ev('punt', 'away'), ev('run', 'home')];
    expect(teaserEndIndex(events, 0)).toBe(5);
  });

  it('includes the halftime call and stops there', () => {
    const events = [ev('run', 'home'), ev('run', 'home'), ev('halftime', 'home'), ev('kickoff', 'away')];
    expect(teaserEndIndex(events, 0)).toBe(3);
  });

  it('never runs longer than maxPlays', () => {
    const events = Array.from({ length: 40 }, () => ev('run', 'home'));
    expect(teaserEndIndex(events, 10, 18)).toBe(28);
  });

  it('always plays at least the starting event, even at the end of the list', () => {
    const events = [ev('run', 'home'), ev('final', 'home')];
    expect(teaserEndIndex(events, 1)).toBe(2);
  });
});
