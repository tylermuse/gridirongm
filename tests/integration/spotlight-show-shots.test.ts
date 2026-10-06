import { describe, it, expect } from 'vitest';
import { planShots, type ShotLine } from '@/lib/spotlight/showShots';

const L = (speaker: 'marcus' | 'tony', words: number, bare: boolean, topicIdx = 0): ShotLine => ({ kind: 'tts', speaker, words, bare, topicIdx });
const clip: ShotLine = { kind: 'other', speaker: 'tony', words: 0, bare: false, topicIdx: -1 };

describe('planShots', () => {
  it('opens each topic on its graphic, and a short line never cuts', () => {
    const s = planShots([L('marcus', 20, true), L('tony', 2, false), L('marcus', 12, false)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'gfx', 'gfx']);
  });
  it('a quick aside stays on the graphic; a real run of banter goes to the hosts', () => {
    expect(planShots([L('marcus', 15, false), L('tony', 9, true), L('marcus', 15, false)]).map(x => x.kind)).toEqual(['gfx', 'gfx', 'gfx']);
    const s = planShots([L('marcus', 15, false), L('tony', 12, true), L('marcus', 10, true), L('tony', 3, true), L('marcus', 14, false)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'ots', 'ots', 'ots', 'gfx']);
    // Shot / reverse shot: Tony talks → Marcus faces camera; then the reverse; a 3-word interjection doesn't flip it.
    expect(s[1]).toMatchObject({ listener: 'marcus' });
    expect(s[2]).toMatchObject({ listener: 'tony' });
    expect(s[3]).toBe(s[2]);
  });
  it('after an on-camera clip, banter can go straight to the hosts', () => {
    const s = planShots([L('marcus', 15, false), clip, L('marcus', 10, true)]);
    expect(s.map(x => x.kind)).toEqual(['gfx', 'cam', 'ots']);
  });
});
