import { describe, it, expect } from 'vitest';
import {
  THEMES, WIDE_CLIPS, WIDE_BANTER, SIGNOFFS, themeFor, planTheme, verdictTopicNotes,
  parseVerdict, parseCalls, wideLineAt, VERDICT_HEADLINE,
} from '@/lib/spotlight/showThemes';
import { buildShowScript, type ShowSegment, type ShowTopicInput } from '@/lib/spotlight/showScript';
import { themePlan, writerTopics } from '@/lib/spotlight/showEpisode';
import fs from 'node:fs';
import path from 'node:path';

const reg = (narrative = 'weekly' as const) => ({ phase: 'regular' as const, narrative });

describe('show themes: which one, when', () => {
  it('trade deadline → Buy or Sell', () => {
    expect(themeFor({ phase: 'regular', narrative: 'tradeDeadline' }, '7-4')).toBe('buysell');
  });
  it('losing or .500 team → Panic Mode; clearly winning → Contender or Pretender', () => {
    expect(themeFor(reg(), '3-5')).toBe('panic');
    expect(themeFor(reg(), '4-4')).toBe('panic');
    expect(themeFor(reg(), '6-2')).toBe('contender');
    expect(themeFor(reg(), '5-4')).toBeNull(); // one game over: a regular episode
  });
  it('alive in the playoffs → Contender or Pretender', () => {
    expect(themeFor({ phase: 'playoffs', narrative: 'playoffsStart' }, '12-5')).toBe('contender');
  });
  it('no theme in the offseason, preseason, after the season, or too early', () => {
    expect(themeFor({ phase: 'draft', narrative: 'seasonOver' }, '3-14')).toBeNull();
    expect(themeFor({ phase: 'preseason', narrative: 'preseason' }, '0-0')).toBeNull();
    expect(themeFor({ phase: 'regular', narrative: 'seasonOver' }, '5-12')).toBeNull();
    expect(themeFor(reg(), '0-2')).toBeNull();
    expect(themeFor(undefined, '3-5')).toBeNull();
  });
  it('the same team and record always get the same opener and verdict prompt', () => {
    const a = planTheme('panic', 'Dallas Wranglers|3-5');
    expect(planTheme('panic', 'Dallas Wranglers|3-5')).toEqual(a);
    expect(THEMES.panic.openers).toContain(a!.opener);
    expect(SIGNOFFS).toContain(a!.signoff);
    expect(planTheme(null, 'x')).toBeNull();
  });
});

describe('every two-shot exists and is captioned line by line', () => {
  const pub = (p: string) => path.join(process.cwd(), 'public', p);
  const ids = new Set([
    ...Object.values(THEMES).flatMap(t => [...t.openers, ...t.verdictClips.map(v => v.id)]),
    ...WIDE_BANTER.map(b => b.id), ...SIGNOFFS,
  ]);
  it('has a clip for every id the themes use', () => {
    for (const id of ids) expect(WIDE_CLIPS[id], id).toBeTruthy();
  });
  it('clip files exist (when the public folder is present)', () => {
    if (!fs.existsSync(pub('show'))) return;
    for (const id of ids) expect(fs.existsSync(pub(WIDE_CLIPS[id].src)), id).toBe(true);
  });
  it('lines are in order, alternate hosts, and cover the clip', () => {
    for (const [id, w] of Object.entries(WIDE_CLIPS)) {
      w.lines.forEach((l, k) => {
        expect(l.end, id).toBeGreaterThan(l.start);
        if (k) { expect(l.start, id).toBeGreaterThanOrEqual(w.lines[k - 1].end - 0.01); expect(l.host, id).not.toBe(w.lines[k - 1].host); }
        expect(l.text, id).not.toMatch(/\[/); // no performance cues on screen
      });
      expect(w.duration, id).toBeGreaterThanOrEqual(w.speech.end);
    }
  });
  it('captions follow the clip', () => {
    const w = WIDE_CLIPS.panic_open_1;
    expect(wideLineAt('panic_open_1', 0.2)?.host).toBe(w.lines[0].host);
    expect(wideLineAt('panic_open_1', w.lines[1].start + 0.1)?.text).toBe(w.lines[1].text);
    expect(wideLineAt('panic_open_1', 999)?.text).toBe(w.lines[w.lines.length - 1].text);
  });
});

describe('verdicts and calls from the writer', () => {
  it('Panic Mode takes numbers 1–10; Contender takes the two words', () => {
    expect(parseVerdict('panic', { marcus: 4, tony: 9 })).toEqual({ marcus: 4, tony: 9 });
    expect(parseVerdict('panic', { marcus: 0, tony: 9 })).toBeNull();
    expect(parseVerdict('panic', { marcus: 'contender', tony: 9 })).toBeNull();
    expect(parseVerdict('contender', { marcus: 'contender', tony: 'pretender' })).toEqual({ marcus: 'contender', tony: 'pretender' });
    expect(parseVerdict('buysell', { marcus: 'buy', tony: 'sell' })).toBeNull();
  });
  it('Buy or Sell takes buy/sell calls only', () => {
    expect(parseCalls('buysell', { marcus: 'buy', tony: 'sell' })).toEqual({ marcus: 'buy', tony: 'sell' });
    expect(parseCalls('buysell', { marcus: 'hold', tony: 'sell' })).toBeNull();
    expect(parseCalls('panic', { marcus: 'buy', tony: 'sell' })).toBeNull();
  });
  it('the verdict topic tells the writer who answers first after the prompt clip', () => {
    const plan = planTheme('panic', 'seed')!;
    const notes = verdictTopicNotes(plan).join('\n');
    expect(notes).toContain(plan.verdictClip!.first === 'marcus' ? 'Marcus answers first' : 'Tony answers first');
    expect(notes).toContain('"verdict"');
    expect(verdictTopicNotes(planTheme('buysell', 'seed')!)).toEqual([]);
  });
});

const topic = (headline: string, lines: [string, string][], extra: Partial<ShowTopicInput> = {}): ShowTopicInput =>
  ({ headline, icon: '🏈', exchanges: lines.map(([s, text]) => ({ speakerId: s === 'm' ? 'stats' : 'hottake', text })), ...extra });
const kinds = (segs: ShowSegment[]) => segs.map(s => (s.kind === 'clip' ? s.clip : s.kind === 'phrase' ? s.phraseId : `tts:${s.speaker}`));

describe('a themed episode', () => {
  const plan = planTheme('panic', 'Dallas Wranglers|3-5')!;
  const topics = [
    topic('The defense', [['m', 'They give up a lot.'], ['t', 'Way too much.']]),
    topic(VERDICT_HEADLINE, [['t', 'Nine. Hit it.'], ['m', 'Four. Breathe.']], { isVerdict: true, verdict: { marcus: 4, tony: 9 } }),
  ];
  const segs = buildShowScript(topics, 'Dallas Wranglers', null, { written: true, theme: plan });
  const k = kinds(segs);

  it('opens on the theme two-shot (with its title card) right after the intros', () => {
    const at = k.indexOf(`wide:${plan.opener}`);
    expect(at).toBe(k.indexOf('tony_intro') + 1);
    const opener = segs[at] as Extract<ShowSegment, { kind: 'phrase' }>;
    expect(opener.wide).toBe(true);
    expect(opener.themeCard).toBe('panic');
  });
  it('plays the verdict prompt before the verdict, and every line carries the theme', () => {
    expect(k.indexOf(`wide:${plan.verdictClip!.id}`)).toBe(k.indexOf('tts:tony', k.indexOf(`wide:${plan.opener}`) + 3) - 1);
    const lines = segs.filter((s): s is Extract<ShowSegment, { kind: 'tts' }> => s.kind === 'tts' && s.topicIdx >= 0);
    expect(lines.every(l => l.theme === 'panic')).toBe(true);
    expect(lines.filter(l => l.verdict).map(l => l.text)).toEqual(['Nine. Hit it.', 'Four. Breathe.']);
  });
  it('signs off on the two-shot instead of the solo outros', () => {
    expect(k[k.length - 1]).toBe(`wide:${plan.signoff}`);
    expect(k).not.toContain('marcus_outro');
  });
  it('a partial script (still being written) has the opener and no sign-off', () => {
    const partial = kinds(buildShowScript([], 'Dallas Wranglers', null, { written: true, partial: true, theme: plan }));
    expect(partial).toContain(`wide:${plan.opener}`);
    expect(partial.some(x => x.startsWith('wide:signoff'))).toBe(false);
  });
  it('an unthemed episode is unchanged: no two-shots, solo outros', () => {
    const plain = kinds(buildShowScript([topics[0]], 'Dallas Wranglers', null, { written: true }));
    expect(plain.some(x => x.startsWith('wide:'))).toBe(false);
    expect(plain.slice(-2)).toEqual(['marcus_outro', 'tony_outro']);
  });
  it('a writer-placed banter two-shot plays once, never dropped as a jump cut', () => {
    const t = topic('Offense', [['t', 'They win ten games.']]);
    t.exchanges.push({ speakerId: 'stats', text: '', wideId: 'banter_1' }, { speakerId: 'stats', text: 'Ten?' }, { speakerId: 'stats', text: '', wideId: 'banter_2' });
    const kk = kinds(buildShowScript([t], 'Dallas Wranglers', null, { written: true }));
    expect(kk.filter(x => x.startsWith('wide:banter'))).toEqual(['wide:banter_1']);
  });
  it('buy/sell calls ride on that topic\'s lines', () => {
    const bs = planTheme('buysell', 's')!;
    const s2 = buildShowScript([topic('A receiver', [['m', 'Buy or sell: they need a receiver.'], ['t', 'Buy.']], { calls: { marcus: 'sell', tony: 'buy' } })], 'X', null, { written: true, theme: bs });
    const l = s2.find((s): s is Extract<ShowSegment, { kind: 'tts' }> => s.kind === 'tts' && s.topicIdx === 0)!;
    expect(l.calls).toEqual({ marcus: 'sell', tony: 'buy' });
    expect(kinds(s2).some(x => x.startsWith('wide:panic_verdict') || x.startsWith('wide:contender_verdict'))).toBe(false);
  });
});

describe('episode plumbing', () => {
  const e = { topics: [topic('T', [['m', 'a']])], teamName: 'Dallas Wranglers', stats: { record: '3-5', stats: [] }, moment: { phase: 'regular' as const, narrative: 'weekly' as const } };
  it('picks the theme from the record and adds the verdict topic for the writer (same list every time)', () => {
    const plan = themePlan(e)!;
    expect(plan.id).toBe('panic');
    const w = writerTopics(e, plan);
    expect(w).toHaveLength(2);
    expect(w[1].isVerdict).toBe(true);
    expect(writerTopics(e, plan)).toBe(w);
  });
  it('no theme → the topics as they are', () => {
    const plain = { ...e, stats: { record: '5-4', stats: [] } };
    expect(themePlan(plain)).toBeNull();
    expect(writerTopics(plain, null)).toBe(plain.topics);
  });
});
