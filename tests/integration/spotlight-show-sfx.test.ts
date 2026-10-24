import { describe, expect, it } from 'vitest';
import { ALL_SFX, MUSIC_LEVEL, SFX_GAIN, graphicCues, sfxSrc } from '@/lib/spotlight/showSfx';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('show sound design', () => {
  it('every cue has a file', () => {
    for (const id of ALL_SFX) expect(existsSync(join(process.cwd(), 'public', sfxSrc(id)))).toBe(true);
  });

  it('effects and music have levels', () => {
    for (const id of ALL_SFX) expect(id in SFX_GAIN || id in MUSIC_LEVEL).toBe(true);
  });

  it('a topic wipes in with a whoosh, once', () => {
    const fired = new Set<string>();
    expect(graphicCues({ topicIdx: 2, visual: 'graphic' }, fired)).toEqual([{ id: 'whoosh', at: 0 }]);
    expect(graphicCues({ topicIdx: 2, visual: 'graphic' }, fired)).toEqual([]);
    expect(graphicCues({ topicIdx: 3, visual: 'graphic' }, fired)).toEqual([{ id: 'whoosh', at: 0 }]);
  });

  it('the show open (title card) is silent', () => {
    expect(graphicCues({ topicIdx: -1, visual: 'title' }, new Set())).toEqual([]);
  });

  it('buy/sell chips pop as they land', () => {
    const cues = graphicCues({ topicIdx: 1, visual: 'graphic', calls: { marcus: 'buy', tony: 'sell' } }, new Set());
    expect(cues.filter(c => c.id === 'pop').map(c => c.at)).toEqual([0.3, 0.65]);
  });

  it('chips that arrive after the wipe still pop (once)', () => {
    const fired = new Set<string>();
    graphicCues({ topicIdx: 1, visual: 'graphic' }, fired);
    const later = graphicCues({ topicIdx: 1, visual: 'graphic', calls: { marcus: 'buy', tony: 'buy' } }, fired);
    expect(later.map(c => c.id)).toEqual(['pop', 'pop']);
    expect(graphicCues({ topicIdx: 1, visual: 'graphic', calls: { marcus: 'buy', tony: 'buy' } }, fired)).toEqual([]);
  });

  it('panic meters fill, and an 8+ sets off the alarm', () => {
    const cues = graphicCues({ topicIdx: 4, visual: 'graphic', verdict: { marcus: 3, tony: 9 } }, new Set(['w:4']));
    expect(cues.map(c => c.id)).toEqual(['meter', 'meter', 'alarm']);
  });

  it('contender/pretender stamps; a move just pops', () => {
    expect(graphicCues({ topicIdx: 4, visual: 'graphic', verdict: { marcus: 'contender', tony: 'pretender' } }, new Set(['w:4'])).map(c => c.id))
      .toEqual(['stamp', 'stamp']);
    expect(graphicCues({ topicIdx: 4, visual: 'graphic', verdict: { marcus: 'Trade for a corner', tony: 'Fire the OC' } }, new Set(['w:4'])).map(c => c.id))
      .toEqual(['pop', 'pop']);
  });
});
