/**
 * Showing a defensive look on the field (defensiveLooks.ts, LOOK_ALIGNMENT).
 *
 * The 2D field and the 3D sim both line the defense up from the same table. The 3D sim is plain JS under public/, so it
 * carries a copy: this file fails if the copy drifts, and checks that each look is actually what its name says.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFENSIVE_LOOKS, DL_ALIGNMENT, LOOK_ALIGNMENT, lookDefenders } from '@/lib/engine/defensiveLooks';
import { toSimPlay } from '@/lib/engine/liveSim3d';
import type { PlayEvent } from '@/lib/engine/playByPlay';

const simHtml = readFileSync(join(process.cwd(), 'public/chase-cam/index.html'), 'utf8');

describe('look alignments', () => {
  it('the 3D sim carries the same table', () => {
    const line = simHtml.split('\n').find(l => l.startsWith('const LOOKS = '));
    expect(line).toBeDefined();
    const simLooks = JSON.parse(line!.slice('const LOOKS = '.length).replace(/;\s*$/, ''));
    expect(simLooks).toEqual(LOOK_ALIGNMENT);
  });

  it('the game page and the sim agree on the sim build tag', () => {
    const inSim = /const SIM_BUILD='([^']+)'/.exec(simHtml)?.[1];
    const inPage = /const SIM_BUILD = '([^']+)'/.exec(readFileSync(join(process.cwd(), 'src/components/game/LiveSim3D.tsx'), 'utf8'))?.[1];
    expect(inSim).toBeTruthy();
    expect(inPage).toBe(inSim);
  });

  it('every look puts eleven men on the defensive side of the ball, inside the sidelines', () => {
    for (const look of DEFENSIVE_LOOKS) {
      const men = lookDefenders(look);
      expect(men).toHaveLength(11);
      for (const m of men) {
        expect(m.depth).toBeGreaterThan(1);
        expect(m.depth).toBeLessThanOrEqual(16);
        expect(Math.abs(m.x)).toBeLessThan(26);
      }
      expect(men.filter(m => m.unit === 'dl').map(m => [m.x, m.depth])).toEqual(DL_ALIGNMENT);
    }
  });

  it('each look is what its name says', () => {
    const a = LOOK_ALIGNMENT;
    const inBox = (look: keyof typeof a) => [...a[look].lb, ...a[look].s].filter(([x, d]) => Math.abs(x) <= 9 && d <= 5).length + 4;
    const deep = (look: keyof typeof a) => a[look].s.filter(([, d]) => d >= 12).length;
    // Blitz: all three backers up at the line
    expect(a.blitz.lb.every(([, d]) => d <= 2.5)).toBe(true);
    // Stacked Box: eight in the box, one safety deep
    expect(inBox('stacked_box')).toBe(8);
    expect(deep('stacked_box')).toBe(1);
    // Two-High: two deep safeties, split wide, and seven in the box
    expect(deep('two_high')).toBe(2);
    expect(a.two_high.s[0][0]).toBeLessThan(-8);
    expect(a.two_high.s[1][0]).toBeGreaterThan(8);
    // Man Press: corners up on the line, nearer than in any other look
    expect(a.man_press.cb.every(([, d]) => d <= 2)).toBe(true);
    for (const look of DEFENSIVE_LOOKS) if (look !== 'man_press') expect(a[look].cb.every(([, d]) => d > 5)).toBe(true);
    // Soft Zone: nobody in the back seven within 6 yards of the ball
    expect([...a.soft_zone.lb, ...a.soft_zone.cb, ...a.soft_zone.s].every(([, d]) => d > 6)).toBe(true);
  });
});

describe('the look reaches the 3D sim', () => {
  const play = (over: Partial<PlayEvent>): PlayEvent => ({
    id: 7, type: 'run', description: 'C. Carter runs for 5 yards.', quarter: 1, timeStr: '10:00', possession: 'home',
    fieldPos: 30, down: 1, yardsToGo: 10, yardsGained: 5, homeScore: 0, awayScore: 0, isScoring: false, ...over,
  } as PlayEvent);

  it('a snap the user called carries the look the CPU defense showed', () => {
    expect(toSimPlay(play({ defLook: 'two_high', lookEdge: 1 }))?.look).toBe('two_high');
  });

  it('a CPU snap carries the look the user called', () => {
    expect(toSimPlay(play({ possession: 'away', userDefCall: 'stacked_box', userDefEdge: 1 }))?.look).toBe('stacked_box');
  });

  it('a snap with no look sends none', () => {
    expect(toSimPlay(play({}))).not.toHaveProperty('look');
  });
});
