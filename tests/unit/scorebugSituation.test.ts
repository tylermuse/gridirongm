import { describe, it, expect } from 'vitest';
import { nextSnapSituation, type EngineSituation } from '@/lib/engine/scorebugSituation';
import type { PlayEvent } from '@/lib/engine/playByPlay';

const ev = (over: Partial<PlayEvent>): PlayEvent => ({
  id: 1, type: 'run', description: '', quarter: 1, timeStr: '4:00', possession: 'away', fieldPos: 29,
  down: 1, yardsToGo: 10, yardsGained: 0, homeScore: 0, awayScore: 0, isScoring: false, ...over,
});
const engine = (over: Partial<EngineSituation> = {}): EngineSituation => ({
  possession: 'away', fieldPos: 31, down: 1, yardsToGo: 10,
  isGameOver: false, awaitingXpChoice: false, awaitingKickoffChoice: false, ...over,
});

describe('nextSnapSituation (QA 11/8 bug 4: header one play behind the 3D scorebug)', () => {
  it("moves to the next event's snap after a stuffed run", () => {
    // "1st & 10 at DAL 29 — stuffed for no gain" → the next snap is 2nd & 10 at the 29
    expect(nextSnapSituation(ev({ down: 2 }), null)).toMatchObject({ down: 2, yardsToGo: 10, fieldPos: 29 });
  });

  it("uses the engine's state when Live Coach hasn't generated the next play (e.g. after Auto-sim)", () => {
    expect(nextSnapSituation(undefined, engine())).toMatchObject({ possession: 'away', fieldPos: 31, down: 1 });
  });

  it('keeps the current numbers before kickoffs, tries, and engine choices', () => {
    expect(nextSnapSituation(ev({ type: 'kickoff' }), engine())).toBeNull();
    expect(nextSnapSituation(ev({ type: 'extra_point' }), engine())).toBeNull();
    expect(nextSnapSituation(null, engine({ awaitingXpChoice: true }))).toBeNull();
    expect(nextSnapSituation(null, engine({ awaitingKickoffChoice: true }))).toBeNull();
    expect(nextSnapSituation(null, engine({ awaitingTwoPointCall: true }))).toBeNull();
    expect(nextSnapSituation(null, engine({ isGameOver: true }))).toBeNull();
    expect(nextSnapSituation(null, null)).toBeNull();
  });
});
