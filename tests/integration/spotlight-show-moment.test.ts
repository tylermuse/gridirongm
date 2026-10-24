import { describe, it, expect } from 'vitest';
import { hookLine, momentNote, recordWords, sanitizeMoment, isOffseason } from '@/lib/spotlight/showMoment';
import { planShots, MAX_HOLD, type ShotLine } from '@/lib/spotlight/showShots';

describe('show moment', () => {
  it('says records the way hosts do', () => {
    expect(recordWords('6-11')).toBe('six and eleven');
    expect(recordWords('10-1')).toBe('ten and one');
    expect(recordWords('9-7-1')).toBe('nine, seven and one');
    expect(recordWords('0-0')).toBe('zero and zero');
    expect(recordWords(undefined)).toBeNull();
  });

  it('validates what the client sends', () => {
    expect(sanitizeMoment({ phase: 'resigning', narrative: 'seasonOver' })).toEqual({ phase: 'resigning', narrative: 'seasonOver' });
    expect(sanitizeMoment({ phase: 'regular', narrative: 'bogus' })).toEqual({ phase: 'regular', narrative: 'weekly' });
    expect(sanitizeMoment({ phase: 'hack' })).toBeUndefined();
    expect(sanitizeMoment('x')).toBeUndefined();
    expect(isOffseason('draft')).toBe(true);
    expect(isOffseason('regular')).toBe(false);
  });

  it('builds a cold-open hook for the moment', () => {
    const t = 'Dallas Wranglers';
    expect(hookLine(t, '6-11', { phase: 'resigning', narrative: 'seasonOver' }))
      .toBe("Six and eleven last season, and now it's decision time. Today, the Dallas Wranglers.");
    expect(hookLine(t, '7-4', { phase: 'regular', narrative: 'tradeDeadline' }))
      .toBe('Seven and four at the trade deadline. Buy, sell, or sit tight? Today, the Dallas Wranglers.');
    expect(hookLine(t, '12-5', { phase: 'playoffs', narrative: 'playoffsStart' }))
      .toBe("Twelve and five, and now it's win or go home. Today, the Dallas Wranglers.");
    expect(hookLine(t, '0-0', { phase: 'preseason', narrative: 'preseason' }))
      .toBe('A brand new season, and a lot to sort out. Today, the Dallas Wranglers.');
    // No moment (older clients, tests): the original line.
    expect(hookLine(t, '6-11')).toBe("And today we're breaking down the Dallas Wranglers.");
  });

  it('tells the writer the offseason record is last season and nothing is left to play', () => {
    const note = momentNote({ phase: 'resigning', narrative: 'seasonOver' }, '6-11');
    expect(note).toMatch(/OFFSEASON/);
    expect(note).toMatch(/LAST season/);
    expect(note).toMatch(/rest of the season/);
    expect(momentNote({ phase: 'regular', narrative: 'tradeDeadline' }, '7-4')).toMatch(/trade deadline/);
  });
});

describe('planShots — nothing holds too long', () => {
  const line = (speaker: 'marcus' | 'tony', words: number, look = 'team:'): ShotLine =>
    ({ kind: 'tts', speaker, words, topicIdx: 0, bare: false, look });

  it('cuts away from one graphic after ~MAX_HOLD words', () => {
    // Six 12-word lines on the same graphic (~27s) used to be one long hold.
    const shots = planShots([0, 1, 2, 3, 4, 5].map(i => line(i % 2 ? 'tony' : 'marcus', 12)));
    let run = 0, worst = 0, prev = '';
    shots.forEach(s => { const k = s.kind === 'ots' ? `ots:${s.listener}` : s.kind; run = k === prev ? run + 12 : 12; worst = Math.max(worst, run); prev = k; });
    expect(worst).toBeLessThanOrEqual(MAX_HOLD);
    expect(shots[0].kind).toBe('gfx'); // a topic still opens on its graphic
    expect(shots.some(s => s.kind === 'ots')).toBe(true);
  });

  it('a new graphic (different look) resets the hold', () => {
    const shots = planShots([line('marcus', 12, 'team:'), line('tony', 12, 'player:a'), line('marcus', 12, 'player:b')]);
    expect(shots.map(s => s.kind)).toEqual(['gfx', 'gfx', 'gfx']);
  });

  it('short lines never force a cut', () => {
    const shots = planShots([line('marcus', 20), line('tony', 4), line('marcus', 3)]);
    expect(shots.map(s => s.kind)).toEqual(['gfx', 'gfx', 'gfx']);
  });
});
