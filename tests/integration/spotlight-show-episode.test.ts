import { describe, it, expect } from 'vitest';
import { assemble, blocksOf, displaySegments } from '@/lib/spotlight/showEpisode';
import { buildShowScript } from '@/lib/spotlight/showScript';
import { clipCatalog, MIN_CLIP_SPEECH } from '@/lib/spotlight/showWriter';
import { PHRASES } from '@/lib/spotlight/phrases';
import type { ShowStatLine } from '@/lib/spotlight/teamStats';

const stats: ShowStatLine = {
  record: '2-9',
  stats: [
    { key: 'ppg', label: 'PPG', value: '14.0', rank: 29, of: 32 },
    { key: 'rush', label: 'Rush YDS/G', value: '60', rank: 32, of: 32 },
  ],
};

const written = [
  { headline: 'Cold open', icon: '🎬', exchanges: [
    { speakerId: 'hottake', text: 'Two and nine. [sighs] Where do we even start.' },
    { speakerId: 'stats', text: 'With the run game, probably.' },
  ] },
  { headline: 'Draft', icon: '📋', exchanges: [
    { speakerId: 'stats', text: 'Speaking of starting over, they pick high in April.' },
    { speakerId: 'hottake', text: 'x', clipId: 'tony_t_draft_now' },
    { speakerId: 'stats', text: 'Now. You always want it now.' },
  ] },
];

describe('written episodes', () => {
  const segs = buildShowScript(written, 'X', stats, { written: true });

  it('plays the conversation as written: no stock exchanges, record take or "next topic" clip', () => {
    const fixed = segs.filter(s => s.kind === 'clip').map(s => (s as { clip: string }).clip);
    expect(fixed).toEqual(['marcus_intro', 'tony_intro', 'marcus_outro', 'tony_outro']);
    const phrases = segs.filter(s => s.kind === 'phrase').map(s => (s as { phraseId: string }).phraseId);
    expect(phrases).toEqual(['tony_t_draft_now']);
  });

  it('each partial script (topics as they are written) is a prefix of the final one', () => {
    const open = buildShowScript([], 'X', stats, { written: true, partial: true });
    const first = buildShowScript(written.slice(0, 1), 'X', stats, { written: true, partial: true });
    for (const part of [open, first]) expect(segs.slice(0, part.length)).toEqual(part);
    expect(open.map(s => s.kind)).toEqual(['clip', 'tts', 'clip']);
    // Blocks keep their index as the script grows.
    expect(blocksOf(first)).toEqual(blocksOf(segs).slice(0, 2));
  });

  it('groups voiced lines into blocks (title, then each topic) and maps them back', () => {
    const blocks = blocksOf(segs);
    expect(blocks.map(b => b.length)).toEqual([1, 2, 2]);
    const voiced = blocks.map((idxs, index) => ({ index, audio: `a${index}`, lines: idxs.map((seg, k) => ({ seg, start: k, duration: 1 })) }));
    const payload = assemble(segs, voiced);
    expect(payload.audios).toEqual(['a0', 'a1', 'a2']);
    const open = payload.segments.find(s => s.kind === 'tts' && s.text.startsWith('Two and nine'))!;
    expect(open).toMatchObject({ audioIndex: 1, audioStart: 0, audioDuration: 1 });
    // Performance cues never reach the screen.
    expect(displaySegments(segs).some(s => s.text.includes('['))).toBe(false);
  });

  it('offers the writer only clips that are true for this team', () => {
    const cat = clipCatalog(stats);
    expect(cat.length).toBeGreaterThan(20);
    for (const { phrase, words } of cat) {
      expect(words).not.toContain('{rank}');
      if (!phrase.stat && phrase.tone) expect(phrase.tone).toBe('bad');
    }
    expect(cat.some(c => c.phrase.id === 'tony_t_streak_rolling')).toBe(false);
    // Topical lines only (no stat riffs, no exchange lines), and none so short
    // that cutting to it reads as a flicker.
    expect(cat.every(c => c.phrase.kind === 'topical')).toBe(true);
    expect(cat.every(c => c.phrase.speech.end - c.phrase.speech.start >= MIN_CLIP_SPEECH)).toBe(true);
    expect(cat.every(c => PHRASES.includes(c.phrase))).toBe(true);
  });
});
