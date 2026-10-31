/**
 * Football video show — episode length caps (cost: every line is voiced).
 * The writer is run against a stubbed OpenAI stream that writes far past the
 * prompt's line counts, the way real models do.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { capShowTopics, SHOW_MAX_STORYLINES, type ShowTopicInput } from '@/lib/spotlight/showScript';
import { parseEpisode } from '@/lib/spotlight/showRequest';

const topic = (headline: string, extra: Partial<ShowTopicInput> = {}): ShowTopicInput => ({
  headline, icon: '🏈', ...extra,
  exchanges: [{ speakerId: 'stats', text: `${headline}: the numbers.` }, { speakerId: 'hottake', text: `${headline}: the take.` }],
});
const deep = (headline: string) => topic(headline, { depth: 'deep' });
const stories = (n: number) => Array.from({ length: n }, (_, k) => topic(`Story ${k + 1}`));

describe('Football video show — episode length', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it('keeps the game breakdown and only the first storylines', () => {
    const topics = [deep('Week 9: DAL 24, NYG 17'), deep('Who won it'), ...stories(6)];
    const capped = capShowTopics(topics);
    expect(capped.map(t => t.headline)).toEqual(['Week 9: DAL 24, NYG 17', 'Who won it', ...stories(SHOW_MAX_STORYLINES).map(t => t.headline)]);
    expect(capped).toEqual(topics.slice(0, capped.length)); // a prefix: indexes line up
    expect(capShowTopics(topics.slice(0, 4))).toHaveLength(4);
  });

  it('counts a short game topic (playoff "Next:") as one of the storylines', () => {
    const topics = [deep('Divisional Round: BAL 55, DEN 14'), deep('Who won it'), topic('Next: Conference Championship vs TEN'), ...stories(5)];
    expect(capShowTopics(topics).map(t => t.headline)).toEqual(['Divisional Round: BAL 55, DEN 14', 'Who won it', 'Next: Conference Championship vs TEN', 'Story 1', 'Story 2']);
  });

  it('caps the topics server-side too, whatever the client sends', async () => {
    const body = { topics: [deep('Week 9: DAL 24, NYG 17'), deep('Who won it'), ...stories(6)], teamName: 'Dallas Cowboys' };
    const ep = await parseEpisode(new Request('http://x/api/spotlight-show', { method: 'POST', body: JSON.stringify(body) }));
    expect(ep?.topics).toHaveLength(2 + SHOW_MAX_STORYLINES);
  });

  it('drops lines past each topic’s cap when the writer runs long', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const run = (t: number, n: number, what: string) =>
      Array.from({ length: n }, (_, k) => ({ t, speaker: k % 2 ? 'tony' : 'marcus', text: `${what} line ${k}.` }));
    const lines = [...run(1, 11, 'Recap'), ...run(2, 9, 'Performer'), ...run(3, 7, 'Story'), ...run(4, 9, 'Verdict')];
    const sse = lines.map(l => `data: ${JSON.stringify({ choices: [{ delta: { content: `${JSON.stringify(l)}\n` } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    const { writeConversation, MAX_TOPIC_LINES } = await import('@/lib/spotlight/showWriter');
    const topics = [deep('Week 9: DAL 24, NYG 17'), deep('Who won it'), topic('Story 1'), topic('The verdict', { isVerdict: true })];
    const out = await writeConversation(topics, 'Dallas Cowboys', null, undefined, undefined, null, { writers: ['openai'] });

    expect(out.written).toBe(true);
    expect(out.topics.map(t => t.exchanges.length)).toEqual([MAX_TOPIC_LINES.deep, MAX_TOPIC_LINES.deep, MAX_TOPIC_LINES.topic, MAX_TOPIC_LINES.verdict]);
    expect(out.topics[0].exchanges.map(e => e.text)).toEqual(['Recap line 0.', 'Recap line 1.', 'Recap line 2.', 'Recap line 3.', 'Recap line 4.']);
  });
});
