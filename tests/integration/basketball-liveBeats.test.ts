/**
 * Live-viewer broadcast beats (parity 1.2): lead changes, ties, and runs tagged
 * on the synthesized play-by-play.
 */

import { describe, it, expect } from 'vitest';
import { computeEventBeats } from '@/../apps/bs-basketball/src/lib/live/beats';
import type { LiveEvent } from '@/../apps/bs-basketball/src/lib/live/playByPlay';

// Minimal scoring-event factory (only the fields beats reads).
function ev(side: 'home' | 'away', points: number, home: number, away: number): LiveEvent {
  return { side, points, scoring: points > 0, home, away, kind: 'make2', clock: '0:00', quarter: 1, text: '' } as LiveEvent;
}

describe('computeEventBeats', () => {
  it('flags lead changes, ties, and 8+ runs', () => {
    const events: LiveEvent[] = [
      ev('away', 2, 0, 2),   // away leads
      ev('home', 2, 2, 2),   // tie
      ev('home', 2, 4, 2),   // home takes lead
      ev('home', 2, 6, 2),   // home run building (6-0)
      ev('home', 3, 9, 2),   // 9-0 run
      ev('away', 2, 9, 4),   // run resets
    ];
    const beats = computeEventBeats(events, 'BOS', 'LAL');

    expect(beats[1].tie).toBe(true);
    expect(beats[2].leadChange).toBe(true);
    expect(beats[4].runText).toBe('BOS 9-0 run'); // home = BOS
    expect(beats[5].runText).toBeUndefined();      // away scored, run broken
    expect(beats[0].leadChange).toBe(false);       // first basket isn't a "change"
  });

  it('returns one beat per event', () => {
    const events = [ev('home', 2, 2, 0), ev('away', 2, 2, 2)];
    expect(computeEventBeats(events, 'A', 'B')).toHaveLength(2);
  });
});
