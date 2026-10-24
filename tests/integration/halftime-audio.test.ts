import { describe, it, expect } from 'vitest';
import { HALFTIME_SYSTEM_PROMPT, HOST_VOICE_GUIDE, parseHalftimeLines, chunkDialogue, halftimeUserMessage } from '@/lib/engine/halftimeShow';

describe('halftime breakdown writer', () => {
  it('uses the Team Spotlight show\'s host guide, without the show-only parts', () => {
    expect(HOST_VOICE_GUIDE).toMatch(/^THE HOSTS/);
    expect(HOST_VOICE_GUIDE).toContain('Marcus Cole');
    expect(HOST_VOICE_GUIDE).toContain('PERFORMANCE CUES');
    expect(HOST_VOICE_GUIDE).not.toContain('TRANSITIONS');
    expect(HOST_VOICE_GUIDE).not.toContain('THE MOMENT');
    expect(HALFTIME_SYSTEM_PROMPT).toContain(HOST_VOICE_GUIDE);
    expect(HALFTIME_SYSTEM_PROMPT).toMatch(/Use only those facts/);
  });

  it('parses one JSON turn per line and skips anything else', () => {
    const raw = [
      'Here you go:',
      '{"speaker":"tony","text":"Two picks already."}',
      '{"speaker":"marcus","text":"[chuckles] Well, they\'re chasing."},',
      '{"speaker":"fans","text":"nope"}',
      '{"speaker":"marcus","text":""}',
      '{broken',
    ].join('\n');
    expect(parseHalftimeLines(raw)).toEqual([
      { speaker: 'tony', text: 'Two picks already.' },
      { speaker: 'marcus', text: "[chuckles] Well, they're chasing." },
    ]);
  });

  it('passes the templated lines as notes', () => {
    expect(halftimeUserMessage([{ speaker: 'marcus', text: 'Dallas 10, Detroit 17.' }, { speaker: 'tony', text: 'Two picks!' }]))
      .toBe("Producer's notes for the halftime segment:\nMarcus: Dallas 10, Detroit 17.\nTony: Two picks!");
  });

  it('splits the voicing into even chunks under the limit, never a lone straggler', () => {
    const line = (n: number) => ({ text: 'x'.repeat(n) });
    const lines = [...Array(14)].map(() => line(145)).concat([line(30)]); // 2030 + 30
    const chunks = chunkDialogue(lines, 2000);
    const sizes = chunks.map(c => c.reduce((n, l) => n + l.text.length, 0));
    expect(chunks.length).toBe(2);
    expect(Math.min(...sizes)).toBeGreaterThan(800);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2000);
    expect(chunks.flat()).toHaveLength(15);
    expect(chunkDialogue([line(500)], 2000)).toHaveLength(1);
  });
});
