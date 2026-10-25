import { describe, it, expect } from 'vitest';
import { planShots, OTS_MAX, OTS_GAP, type ShotLine } from '@/lib/spotlight/showShots';

// A line with something to show gets its own graphic (a new look); bare lines show the topic panel.
let n = 0;
const L = (speaker: 'marcus' | 'tony', words: number, bare: boolean, topicIdx = 0): ShotLine => ({ kind: 'tts', speaker, words, bare, topicIdx, look: bare ? 'none' : `look-${n++}` });
const clip: ShotLine = { kind: 'other', speaker: 'tony', words: 0, bare: false, topicIdx: -1 };

describe('planShots', () => {
  it('opens each topic on its graphic, and a short line never cuts', () => {
    const s = planShots([L('marcus', 20, true), L('tony', 2, false), L('marcus', 12, false)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'gfx', 'gfx']);
  });
  it('a quick aside stays on the graphic; a real run of banter goes to the hosts', () => {
    expect(planShots([L('marcus', 15, false), L('tony', 9, true), L('marcus', 15, false)]).map(x => x.kind)).toEqual(['gfx', 'gfx', 'gfx']);
    const s = planShots([L('marcus', 15, false), L('tony', 16, true), L('marcus', 12, true), L('tony', 3, true), L('marcus', 14, false)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'ots', 'ots', 'ots', 'gfx']);
    // Shot / reverse shot: Tony talks → Marcus faces camera; then the reverse; a 3-word interjection doesn't flip it.
    expect(s[1]).toMatchObject({ listener: 'marcus' });
    expect(s[2]).toMatchObject({ listener: 'tony' });
    expect(s[3]).toBe(s[2]);
  });
  it('after an on-camera clip the next line goes back to the graphic (that shot just showed the hosts)', () => {
    const s = planShots([L('marcus', 15, false), clip, L('marcus', 20, true)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'cam', 'gfx']);
  });
});

describe('planShots — the listening shot is a cutaway', () => {
  const run = (lines: ShotLine[]) => planShots(lines).map(x => x.kind);
  it('a listening stretch runs ~OTS_MAX words, then back to the graphic', () => {
    const s = run([L('marcus', 15, false), L('tony', 20, true), L('marcus', 20, true), L('tony', 20, true)]);
    expect(s).toEqual(['gfx', 'ots', 'gfx', 'gfx']);
    expect(20 + 20).toBeGreaterThan(OTS_MAX);
  });
  it('the next stretch waits ~OTS_GAP words', () => {
    const banter = [L('tony', 20, true), L('marcus', 20, true)];
    const s = run([L('marcus', 15, false), ...banter, L('tony', 10, true), L('marcus', 10, true), ...banter]);
    // After the first stretch, 20 + 10 words on the graphic = OTS_GAP: the
    // next line may cut away again (and that stretch is capped too).
    expect(OTS_GAP).toBe(30);
    expect(s).toEqual(['gfx', 'ots', 'gfx', 'gfx', 'ots', 'ots', 'gfx']);
  });
  it('never over the verdict board', () => {
    const v = (speaker: 'marcus' | 'tony', words: number): ShotLine => ({ ...L(speaker, words, true, 3), verdict: true });
    expect(run([v('marcus', 20), v('tony', 20), v('marcus', 20), v('tony', 20)])).toEqual(['gfx', 'gfx', 'gfx', 'gfx']);
  });
});
