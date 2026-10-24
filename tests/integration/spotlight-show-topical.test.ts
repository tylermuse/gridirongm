import { describe, it, expect } from 'vitest';
import { buildShowScript, type ShowSegment } from '@/lib/spotlight/showScript';
import { PHRASES, topicTagsIn } from '@/lib/spotlight/phrases';
import type { ShowStatLine } from '@/lib/spotlight/teamStats';

const losing: ShowStatLine = {
  record: '2-9',
  stats: [
    { key: 'ppg', label: 'PPG', value: '14.0', rank: 29, of: 32 },
    { key: 'pag', label: 'Opp PPG', value: '27.0', rank: 30, of: 32 },
  ],
};

const phraseIds = (segs: ShowSegment[]) => segs.flatMap(s => (s.kind === 'phrase' ? [s.phraseId] : []));
const byId = (id: string) => PHRASES.find(p => p.id === id)!;

describe('topical on-camera lines', () => {
  it('reads subjects from commentary', () => {
    expect(topicTagsIn('They have the third pick in the draft.')).toContain('draft');
    expect(topicTagsIn('Is the coaching staff the problem?')).toContain('coaching');
    expect(topicTagsIn('Nothing to see here.')).toEqual([]);
  });

  it('drops in a topical line from the other host when a line names a subject', () => {
    const segs = buildShowScript([
      { headline: 'Open', icon: '🎬', exchanges: [{ speakerId: 'stats', text: 'Quick open.' }] },
      { headline: 'Draft', icon: '📋', exchanges: [
        { speakerId: 'hottake', text: 'They own the second pick in the draft.' },
        { speakerId: 'stats', text: 'They do.' },
      ] },
    ], 'X', losing);
    const topical = phraseIds(segs).map(byId).filter(p => p.kind === 'topical');
    expect(topical.length).toBeGreaterThan(0);
    for (const p of topical) {
      expect(p.host).toBe('marcus');
      expect(p.tags).toContain('draft');
      expect(p.writerOnly).toBeFalsy();
    }
  });

  it('never picks a line whose tone contradicts the team (no "rolling" for a 2-9 team)', () => {
    for (let k = 0; k < 20; k++) {
      const segs = buildShowScript([
        { headline: `Streak ${k}`, icon: '🔥', exchanges: [
          { speakerId: 'stats', text: `They are on a win streak, ${k}.` },
          { speakerId: 'hottake', text: 'Playoffs? Talk to me about the playoffs.' },
        ] },
      ], `Team ${k}`, losing);
      for (const id of phraseIds(segs)) {
        const p = byId(id);
        if (p.kind === 'topical' && !p.stat) expect(p.tone === undefined || p.tone === 'bad').toBe(true);
      }
    }
  });

  it('plays the clips the writer chose, as that host, once', () => {
    const clip = PHRASES.find(p => p.kind === 'topical' && p.host === 'tony')!;
    const segs = buildShowScript([
      { headline: 'Draft', icon: '📋', exchanges: [
        { speakerId: 'stats', text: 'Big decision coming.' },
        { speakerId: 'hottake', text: clip.text, clipId: clip.id },
        { speakerId: 'stats', text: 'Fair enough.' },
        { speakerId: 'hottake', text: clip.text, clipId: clip.id },
      ] },
    ], 'X', losing);
    expect(phraseIds(segs).filter(id => id === clip.id)).toHaveLength(1);
    // The repeat falls back to a voiced line instead of vanishing.
    expect(segs.filter(s => s.kind === 'tts' && s.text === clip.text)).toHaveLength(1);
  });
});

describe('calm', () => {
  it('tones down promo copy', async () => {
    const { calm } = await import('@/lib/spotlight/showWriter');
    expect(calm("THEY NEED TO GATHER ALL THEIR RESOURCES AND MAKE A MOVE! The window can't start CLOSING just yet, but they must act NOW!"))
      .toBe("They need to gather all their resources and make a move. The window can't start closing just yet, but they must act now!");
    expect(calm('The QB is 3rd in the NFL. DAL wins.')).toBe('The QB is 3rd in the NFL. DAL wins.');
  });
});
