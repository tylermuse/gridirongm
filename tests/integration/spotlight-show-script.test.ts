import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildShowScript, SHOW_CLIPS, type ShowSegment } from '@/lib/spotlight/showScript';
import { PHRASES, ordinalSrc } from '@/lib/spotlight/phrases';
import type { ShowStatLine } from '@/lib/spotlight/teamStats';

const topics = [
  { headline: 'Defense carrying the load', icon: '🛡️', exchanges: [
    { speakerId: 'stats', text: 'Their offense ranks 29th in the league.' },
    { speakerId: 'hottake', text: 'And the defense is giving up everything!' },
    { speakerId: 'fans', text: 'ignored' },
    { speakerId: 'stats', text: 'The rushing attack is 32nd.' },
    { speakerId: 'hottake', text: 'I love this team.' },
  ] },
  { headline: 'QB question', icon: '🏈', exchanges: [{ speakerId: 'hottake', text: 'Bench him.' }] },
  { headline: 'Empty topic', icon: '❓', exchanges: [{ speakerId: 'fans', text: 'skip me' }] },
  { headline: 'Schedule', icon: '📅', exchanges: [{ speakerId: 'stats', text: 'Tough stretch ahead.' }, { speakerId: 'hottake', text: 'Bring it on.' }] },
];

const stats: ShowStatLine = {
  record: '3-8',
  stats: [
    { key: 'ppg', label: 'PPG', value: '14.0', rank: 29, of: 32 },
    { key: 'pag', label: 'Opp PPG', value: '27.0', rank: 30, of: 32 },
    { key: 'pass', label: 'Pass YDS/G', value: '230', rank: 12, of: 32 },
    { key: 'rush', label: 'Rush YDS/G', value: '60', rank: 32, of: 32 },
    { key: 'yds', label: 'Total YDS/G', value: '290', rank: 28, of: 32 },
  ],
};

const phrases = (segs: ShowSegment[]) => segs.filter((s): s is Extract<ShowSegment, { kind: 'phrase' }> => s.kind === 'phrase');

describe('buildShowScript', () => {
  const segs = buildShowScript(topics, 'Las Vegas Raiders', stats);

  it('opens with the intro clips, a title card, and a record take', () => {
    expect(segs[0]).toMatchObject({ kind: 'clip', clip: 'marcus_intro' });
    expect(segs[1]).toMatchObject({ kind: 'tts', visual: 'title', text: "And today we're breaking down the Las Vegas Raiders." });
    expect(segs[2]).toMatchObject({ kind: 'clip', clip: 'tony_intro' });
    expect(segs[3]).toMatchObject({ kind: 'phrase', phraseId: 'tony_record_losing' });
  });

  it('never shows a listener: generated lines are graphics, phrases are the speaker on camera', () => {
    for (const s of segs) if (s.kind === 'tts') expect(['title', 'graphic']).toContain(s.visual);
    for (const p of phrases(segs)) expect(PHRASES.find(x => x.id === p.phraseId)!.host).toBe(p.speaker);
  });

  it('the other host reacts to a cited bad stat, saying the real rank', () => {
    const i = segs.findIndex(s => s.kind === 'tts' && s.text.startsWith('Their offense'));
    expect(segs[i + 1]).toMatchObject({ kind: 'phrase', speaker: 'tony', stat: 'ppg', slot: { rank: 29 } });
    expect((segs[i + 1] as { text: string }).text).toMatch(/^29th in scoring/);
    // One reaction per topic: the rest of the topic stays on the graphic.
    const j = segs.findIndex(s => s.kind === 'tts' && s.text.startsWith('And the defense'));
    expect(segs[j + 1]).toMatchObject({ kind: 'tts' });
  });

  it('mid-table stats get the "middle of the pack" take', () => {
    const t = [{ headline: 'Air it out', icon: '🏈', exchanges: [{ speakerId: 'stats', text: 'The passing game is fine.' }] }];
    const p = phrases(buildShowScript(t, 'X', stats));
    expect(p.find(x => x.stat === 'pass')).toMatchObject({ speaker: 'tony', slot: { rank: 12 } });
    expect(PHRASES.find(x => x.id === p.find(y => y.stat === 'pass')!.phraseId)!.tone).toBe('mid');
  });

  it('a back-and-forth with no stat reaction closes on a glue reaction', () => {
    const i = segs.findIndex(s => s.kind === 'tts' && s.text === 'Bring it on.');
    expect(segs[i + 1]).toMatchObject({ kind: 'phrase', speaker: 'marcus' });
    expect((segs[i + 1] as { stat?: string }).stat).toBeUndefined();
    // Marcus already spoke in this topic and got answered → he pushes back.
    expect(['disagree', 'skeptical', 'pivot']).toContain(PHRASES.find(x => x.id === (segs[i + 1] as { phraseId: string }).phraseId)!.kind);
  });

  it('caps on-camera phrases per topic and never repeats a phrase', () => {
    const ids = phrases(segs).map(p => p.phraseId);
    expect(new Set(ids).size).toBe(ids.length);
    const firstTopic = segs.slice(4, segs.findIndex((s, k) => k > 4 && s.kind === 'clip'));
    expect(phrases(firstTopic).length).toBeLessThanOrEqual(1);
  });

  it('keeps transitions (skipping empty topics) and closes with both outros', () => {
    const tr = segs.filter(s => s.kind === 'clip' && s.clip.includes('transition')).map(s => s.kind === 'clip' && s.clip);
    expect(tr).toEqual(['marcus_transition_shifting_gears', 'tony_transition_next_one']);
    expect(segs.slice(-2).map(s => s.kind === 'clip' && s.clip)).toEqual(['marcus_outro', 'tony_outro']);
  });

  it('works without stats (no stat reactions, glue only)', () => {
    const plain = buildShowScript(topics, 'X', null);
    expect(phrases(plain).every(p => !p.stat && !p.slot)).toBe(true);
  });
});

describe('show assets', () => {
  const pub = (p: string) => path.join(process.cwd(), 'public', p);
  it('every clip, phrase and ordinal file exists', () => {
    for (const c of Object.values(SHOW_CLIPS)) expect(fs.existsSync(pub(c.src))).toBe(true);
    for (const p of PHRASES) expect(fs.existsSync(pub(p.src))).toBe(true);
    for (const h of ['marcus', 'tony'] as const) for (let n = 1; n <= 32; n++) expect(fs.existsSync(pub(ordinalSrc(h, n)))).toBe(true);
  });
  it('slot phrases have a sane slot window', () => {
    for (const p of PHRASES.filter(x => x.text.includes('{rank}'))) {
      expect(p.slot).toBeDefined();
      expect(p.slot!.end - p.slot!.start).toBeGreaterThan(0.3);
      expect(p.slot!.end).toBeLessThan(p.duration);
    }
  });
});
