/**
 * Hoops video show — episode length caps (cost: every line is voiced).
 * The writer is run against a stubbed OpenAI stream that writes far past the
 * prompt's line counts, the way real models do.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { capShowTopics, SHOW_MAX_STORYLINES, type ShowTopicInput } from '@/../apps/bs-basketball/src/lib/videoShow/showScript';

const topic = (headline: string, deep = false): ShowTopicInput => ({
  headline, icon: '🎙️', ...(deep ? { depth: 'deep' as const } : {}),
  exchanges: [{ speakerId: 'stats', text: `${headline}: the numbers.` }, { speakerId: 'hottake', text: `${headline}: the take.` }],
});

describe('Hoops video show — episode length', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it('keeps the game breakdown and only the first storylines', () => {
    const topics = [topic('Recap', true), topic('Who won it', true), ...Array.from({ length: 9 }, (_, k) => topic(`Story ${k + 1}`))];
    const capped = capShowTopics(topics);
    expect(capped.map(t => t.headline)).toEqual(['Recap', 'Who won it', ...Array.from({ length: SHOW_MAX_STORYLINES }, (_, k) => `Story ${k + 1}`)]);
    expect(capped).toEqual(topics.slice(0, capped.length)); // a prefix: indexes line up
    expect(capShowTopics(topics.slice(0, 3))).toHaveLength(3);
  });

  it('drops lines past each topic’s cap when the writer runs long', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const lines = [
      ...Array.from({ length: 9 }, (_, k) => ({ t: 1, speaker: k % 2 ? 'tony' : 'marcus', text: `Recap line ${k}.` })),
      ...Array.from({ length: 9 }, (_, k) => ({ t: 2, speaker: k % 2 ? 'tony' : 'marcus', text: `Performer line ${k}.` })),
      ...Array.from({ length: 7 }, (_, k) => ({ t: 3, speaker: k % 2 ? 'tony' : 'marcus', text: `Story line ${k}.` })),
    ];
    const sse = lines.map(l => `data: ${JSON.stringify({ choices: [{ delta: { content: `${JSON.stringify(l)}\n` } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    const { writeConversation, MAX_TOPIC_LINES } = await import('@/../apps/bs-basketball/src/lib/videoShow/showWriter');
    const out = await writeConversation([topic('Recap', true), topic('Who won it', true), topic('Story 1')], 'Dallas Mavericks', null, undefined, undefined, null, { writers: ['openai'] });

    expect(out.written).toBe(true);
    expect(out.topics.map(t => t.exchanges.length)).toEqual([MAX_TOPIC_LINES.deep, MAX_TOPIC_LINES.deep, MAX_TOPIC_LINES.topic]);
    expect(out.topics[0].exchanges.map(e => e.text)).toEqual(['Recap line 0.', 'Recap line 1.', 'Recap line 2.', 'Recap line 3.', 'Recap line 4.']);
  });
});
