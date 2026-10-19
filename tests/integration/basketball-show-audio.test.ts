/**
 * BS Hoops — The Show studio audio (ShowAudioPlayer helpers).
 *
 * Pure parts only: request body from a spotlight episode, fallback-reason
 * mapping from /api/spotlight-audio responses, transcript timing offsets,
 * chapter boundaries, the client request helper (fetch mocked — no
 * ElevenLabs), and the route's shared TTS normalization.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildShowAudioRequest, mapAudioFailure, fallbackNote, computeLineTimings, lineIndexAt, parseLineBytes,
  buildChapters, chapterStarts, chapterIndexForLine, scriptFor, requestShowAudio, cachedShowAudio,
  _resetShowAudioCache, formatClock, estimatedGenProgress, SHOW_AUDIO_ENDPOINT,
} from '@/../apps/bs-basketball/src/lib/show/showAudio';
import { buildPodcastScript, normalizeTtsText } from '@/../apps/bs-basketball/src/lib/show/podcastScript';
import { buildSpotlight, SPOTLIGHT_HOSTS, type SpotlightEpisode } from '@/../apps/bs-basketball/src/lib/show/spotlight';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

const episode: SpotlightEpisode = {
  week: 3,
  title: 'Hoops Tonight · Week 3',
  hosts: SPOTLIGHT_HOSTS,
  intro: [],
  outro: [],
  stories: [
    {
      id: 'a', category: 'Your Team', headline: 'Dallas win four straight',
      exchanges: [
        { voice: 'analyst', line: 'Net rating is +9 over the stretch.' },
        { voice: 'take', line: 'RING SEASON, Marcus!' },
        { voice: 'fan', line: 'LETS GOOO' },
      ],
    },
    { id: 'b', category: 'Breakout', headline: 'Only a tweet', exchanges: [{ voice: 'player', line: 'Grateful 🙏' }] },
    {
      id: 'c', category: 'MVP Race', headline: 'MVP watch',
      exchanges: [
        { voice: 'take', line: 'He is the MVP. Period.' },
        { voice: 'analyst', line: '31 PPG on 62 TS% — hard to argue.' },
      ],
    },
  ],
};

function audioResponse(bytes: number, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'audio/mpeg', ...headers } });
}
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('hoops show audio — request body', () => {
  it('maps voices onto the route speaker ids and keeps every story', () => {
    const body = buildShowAudioRequest(episode, 'Dallas Mavericks');
    expect(body.teamName).toBe('Dallas Mavericks');
    expect(body.topics).toHaveLength(3);
    expect(body.topics[0]).toEqual({
      headline: 'Dallas win four straight', icon: 'Your Team',
      exchanges: [
        { speakerId: 'stats', text: 'Net rating is +9 over the stretch.' },
        { speakerId: 'hottake', text: 'RING SEASON, Marcus!' },
        { speakerId: 'fans', text: 'LETS GOOO' },
      ],
    });
    expect(body.topics[1].exchanges[0].speakerId).toBe('player');
    expect(buildShowAudioRequest(episode, '  ').teamName).toBe('league');
  });

  it('is deterministic for a real simmed league (same body → same server cache key)', () => {
    const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'show-audio' }), 20).league as unknown as BasketballLeagueState;
    const ep = buildSpotlight(league)!;
    expect(ep).toBeTruthy();
    const a = JSON.stringify(buildShowAudioRequest(ep, 'X'));
    const b = JSON.stringify(buildShowAudioRequest(buildSpotlight(league)!, 'X'));
    expect(a).toBe(b);
    // Hosts in the script match the route's ElevenLabs voices (Marcus / Tony).
    expect(SPOTLIGHT_HOSTS.analyst.name).toBe('Marcus Cole');
    expect(SPOTLIGHT_HOSTS.take.name).toContain('Tony');
    const allLines = [...ep.intro, ...ep.outro, ...ep.stories.flatMap(s => s.exchanges)].map(e => e.line).join(' ');
    expect(allLines).not.toMatch(/\b(Mike|Trey|Hartwell|Daniels)\b/);
  });
});

describe('hoops show audio — script + chapters', () => {
  const body = buildShowAudioRequest(episode, 'Dallas Mavericks');
  const lines = scriptFor(body);

  it('voices only analyst/take lines, wrapped in cold open + sign-off', () => {
    expect(lines.map(l => l.speaker)).toEqual(['marcus', 'tony', 'marcus', 'tony', 'marcus', 'tony', 'marcus', 'marcus', 'tony']);
    expect(lines.some(l => l.text === 'LETS GOOO' || l.text.includes('Grateful'))).toBe(false);
    expect(lines[0].text).toContain('Dallas Mavericks');
    // Topic 2 (index 2) gets a transition from the rotation (2 % 4 → "Let's keep it moving").
    expect(lines[4]).toMatchObject({ speaker: 'marcus', topicIndex: 2, text: "Let's keep it moving, Tony." });
    // Same builder the route uses.
    expect(buildPodcastScript(body.topics, body.teamName)).toEqual(lines);
  });

  it('builds contiguous chapters (transition opens its topic chapter; empty topics skipped)', () => {
    const ch = buildChapters(lines, body.topics);
    expect(ch.map(c => c.title)).toEqual(['Cold open', 'Dallas win four straight', 'MVP watch', 'Sign-off']);
    expect(ch.map(c => [c.startLine, c.endLine])).toEqual([[0, 1], [2, 3], [4, 6], [7, 8]]);
    expect(ch[1].category).toBe('Your Team');
    for (let i = 1; i < ch.length; i++) expect(ch[i].startLine).toBe(ch[i - 1].endLine + 1);
    expect(chapterIndexForLine(ch, 5)).toBe(2);
    expect(chapterIndexForLine(ch, 8)).toBe(3);
  });

  it('chapter start times come from line timings', () => {
    const ch = buildChapters(lines, body.topics);
    const tm = computeLineTimings(lines, 90, lines.map(() => 100));
    expect(chapterStarts(ch, tm)).toEqual([0, 20, 40, 70]);
  });
});

describe('hoops show audio — timing', () => {
  it('uses exact clip byte lengths when provided (CBR → time ∝ bytes)', () => {
    const tm = computeLineTimings([{ text: 'a' }, { text: 'b' }, { text: 'c' }], 60, [1000, 2000, 3000]);
    expect(tm).toEqual([{ start: 0, end: 10 }, { start: 10, end: 30 }, { start: 30, end: 60 }]);
  });

  it('estimates proportional to character counts otherwise (with per-clip overhead)', () => {
    const tm = computeLineTimings([{ text: 'x'.repeat(88) }, { text: 'x'.repeat(188) }], 30);
    // weights 100 / 200
    expect(tm[0].start).toBe(0);
    expect(tm[0].end).toBeCloseTo(10);
    expect(tm[1].end).toBe(30);
    // Mismatched byte arrays are ignored rather than trusted.
    expect(computeLineTimings([{ text: 'x'.repeat(88) }, { text: 'x'.repeat(188) }], 30, [1])[0].end).toBeCloseTo(10);
    expect(computeLineTimings([], 10)).toEqual([]);
  });

  it('finds the line at a time and clamps out-of-range', () => {
    const tm = computeLineTimings([{ text: 'a' }, { text: 'b' }, { text: 'c' }], 60, [1, 1, 1]);
    expect(lineIndexAt(tm, -5)).toBe(0);
    expect(lineIndexAt(tm, 0)).toBe(0);
    expect(lineIndexAt(tm, 19.9)).toBe(0);
    expect(lineIndexAt(tm, 20)).toBe(1);
    expect(lineIndexAt(tm, 59)).toBe(2);
    expect(lineIndexAt(tm, 999)).toBe(2);
    expect(lineIndexAt([], 1)).toBe(-1);
  });

  it('parses X-Line-Bytes only when it has one positive int per line', () => {
    expect(parseLineBytes('10, 20,30', 3)).toEqual([10, 20, 30]);
    expect(parseLineBytes('10,20', 3)).toBeNull();
    expect(parseLineBytes('10,abc,30', 3)).toBeNull();
    expect(parseLineBytes('10,0,30', 3)).toBeNull();
    expect(parseLineBytes(null, 3)).toBeNull();
  });

  it('formats clocks and keeps gen progress bounded', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.9)).toBe('1:15');
    expect(formatClock(NaN)).toBe('0:00');
    expect(estimatedGenProgress(0, 20)).toBe(0);
    expect(estimatedGenProgress(1e9, 20)).toBe(0.95);
    expect(estimatedGenProgress(5000, 20)).toBeLessThan(estimatedGenProgress(15000, 20));
  });
});

describe('hoops show audio — fallback reasons', () => {
  it('maps route responses to honest reasons', () => {
    expect(mapAudioFailure(503, { code: 'not_configured', error: 'ELEVENLABS_API_KEY not configured' })).toBe('not_configured');
    // Older deploys returned 500 + the message only.
    expect(mapAudioFailure(500, { error: 'ELEVENLABS_API_KEY not configured' })).toBe('not_configured');
    expect(mapAudioFailure(401, { error: 'Not authenticated' })).toBe('signed_out');
    expect(mapAudioFailure(403, { error: 'Premium subscription required' })).toBe('not_premium');
    expect(mapAudioFailure(402, { error: 'Monthly podcast credits exhausted' })).toBe('out_of_credits');
    expect(mapAudioFailure(429, null)).toBe('out_of_credits');
    expect(mapAudioFailure(402, { code: 'tts_quota', error: 'ElevenLabs quota exceeded (401): …' })).toBe('tts_quota');
    expect(mapAudioFailure(500, { error: 'boom' })).toBe('error');
    expect(mapAudioFailure(400, null)).toBe('error');
  });

  it('notes name the real reason and the right next step', () => {
    expect(fallbackNote('signed_out').text).toMatch(/^Playing with your browser's voice — sign in/);
    expect(fallbackNote('signed_out').cta?.href).toContain('/login');
    expect(fallbackNote('not_premium').text).toMatch(/go Premium for studio audio/);
    expect(fallbackNote('not_premium').cta?.href).toBe('/pricing');
    expect(fallbackNote('out_of_credits', 'Nov 1').text).toContain('Nov 1');
    expect(fallbackNote('out_of_credits').cta).toBeUndefined();
    expect(fallbackNote('not_configured').text).toMatch(/isn't set up/);
    expect(fallbackNote('timeout').text).toMatch(/too long/);
  });
});

describe('hoops show audio — client request helper', () => {
  const body = buildShowAudioRequest(episode, 'Dallas Mavericks');
  const lineCount = scriptFor(body).length;
  beforeEach(() => _resetShowAudioCache());

  it('POSTs the body, returns the blob + line bytes, and caches per episode', async () => {
    const bytes = Array.from({ length: lineCount }, (_, i) => 100 + i);
    const fetchImpl = vi.fn(async () => audioResponse(500, { 'x-line-bytes': bytes.join(',') }));
    const r = await requestShowAudio(body, { fetchImpl: fetchImpl as unknown as typeof fetch, online: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.blob.size).toBe(500);
    expect(r.lineBytes).toEqual(bytes);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SHOW_AUDIO_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
    // Replay: served from memory, no second request.
    const again = await requestShowAudio(body, { fetchImpl: fetchImpl as unknown as typeof fetch, online: true });
    expect(again).toBe(r);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cachedShowAudio(JSON.stringify(body))).toBe(r);
  });

  it('missing X-Line-Bytes → lineBytes null (client estimates)', async () => {
    const r = await requestShowAudio(body, { fetchImpl: (async () => audioResponse(10)) as unknown as typeof fetch, online: true });
    expect(r.ok && r.lineBytes).toBeNull();
  });

  it('maps gating responses and does not cache failures (user may sign in)', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ === 0 ? jsonResponse(401, { error: 'Not authenticated' }) : audioResponse(10)));
    expect(await requestShowAudio(body, { fetchImpl: fetchImpl as unknown as typeof fetch, online: true })).toEqual({ ok: false, reason: 'signed_out' });
    expect((await requestShowAudio(body, { fetchImpl: fetchImpl as unknown as typeof fetch, online: true })).ok).toBe(true);
  });

  it('not-configured is sticky for the session (no repeated requests)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, { error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' }));
    const f = fetchImpl as unknown as typeof fetch;
    expect(await requestShowAudio(body, { fetchImpl: f, online: true })).toEqual({ ok: false, reason: 'not_configured' });
    const other = buildShowAudioRequest(episode, 'Boston Celtics');
    expect(await requestShowAudio(other, { fetchImpl: f, online: true })).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times out, survives network errors / non-audio 200s, and short-circuits offline', async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    expect(await requestShowAudio(body, { fetchImpl: hang, timeoutMs: 20, online: true })).toEqual({ ok: false, reason: 'timeout' });
    expect(await requestShowAudio(body, { fetchImpl: (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, online: true })).toEqual({ ok: false, reason: 'error' });
    expect(await requestShowAudio(body, { fetchImpl: (async () => jsonResponse(200, { ok: 1 })) as unknown as typeof fetch, online: true })).toEqual({ ok: false, reason: 'error' });
    const never = vi.fn();
    expect(await requestShowAudio(body, { fetchImpl: never as unknown as typeof fetch, online: false })).toEqual({ ok: false, reason: 'offline' });
    expect(never).not.toHaveBeenCalled();
  });
});

describe('hoops show audio — TTS normalization (shared with the route)', () => {
  it('expands money, stats, positions and awards', () => {
    expect(normalizeTtsText('$55M deal')).toBe('55 million dollars deal');
    expect(normalizeTtsText('$500K')).toBe('500 thousand dollars');
    expect(normalizeTtsText('31 PPG, 12 REB')).toBe('31 points per game, 12 rebounds');
    expect(normalizeTtsText('62 TS%')).toBe('62 true shooting percentage');
    expect(normalizeTtsText('the PG is the MVP')).toBe('the point guard is the M V P');
    expect(normalizeTtsText('48 FG% and 80 FT%')).toBe('48 field goal percentage and 80 free throw percentage');
    expect(normalizeTtsText('Lakers vs. Celtics')).toBe('Lakers versus Celtics');
    expect(normalizeTtsText('a -13 differential')).toBe('a negative 13 differential');
  });
});
