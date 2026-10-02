/**
 * Team Spotlight video show — producing an episode (server-only).
 *
 * Two stages with very different costs:
 *  1. The script: Claude writes the conversation, the composer lays out the
 *     episode. A few cents; ~30s. Done ahead of time when a premium user
 *     opens the Spotlight (POST /api/spotlight-show/script) and cached.
 *  2. The voices: ElevenLabs v3 voices each topic's conversation. The real
 *     cost; only when someone presses Watch Show (one podcast credit), and
 *     streamed to the player block by block so playback starts at once.
 */
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { VOICES, normalizeTtsText, generateDialogue, stripCues } from './tts';
import { writeConversation, WRITER_MODEL } from './showWriter';
import { buildShowScript, type ShowSegment, type ShowTopicInput, type TimedShowSegment } from './showScript';
import type { ShowStatLine } from './teamStats';

export const CACHE_BUCKET = 'spotlight-audio';
/** Bump when the episode format or the composer changes. */
export const SHOW_VERSION = 'show-v12';

export interface EpisodeInput {
  topics: ShowTopicInput[];
  teamName: string;
  stats: ShowStatLine | null;
}

export interface ShowPayload {
  segments: TimedShowSegment[];
  audios: string[]; // base64 mp3 per voiced block
}

/** One voiced block, as streamed to the player. */
export interface VoicedBlock {
  index: number;
  audio: string; // base64 mp3
  lines: { seg: number; start: number; duration: number }[];
}

function hash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

export const episodeKey = (e: EpisodeInput) => hash({ v: SHOW_VERSION, topics: e.topics, teamName: e.teamName, stats: e.stats });
export const scriptPath = (e: EpisodeInput) => `show/script-${hash({ v: SHOW_VERSION, m: WRITER_MODEL, topics: e.topics, teamName: e.teamName, stats: e.stats })}.json`;
export const payloadPath = (e: EpisodeInput) => `show/${episodeKey(e)}.json`;

async function readJson<T>(sb: SupabaseClient | null, path: string): Promise<T | null> {
  if (!sb) return null;
  const { data } = await sb.storage.from(CACHE_BUCKET).download(path);
  if (!data) return null;
  try { return JSON.parse(await data.text()) as T; } catch { return null; }
}

export async function writeJson(sb: SupabaseClient | null, path: string, body: unknown): Promise<void> {
  if (!sb) return;
  await sb.storage.from(CACHE_BUCKET).upload(path, JSON.stringify(body), { contentType: 'application/json', upsert: true });
}

export async function readPayload(sb: SupabaseClient | null, e: EpisodeInput): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb.storage.from(CACHE_BUCKET).download(payloadPath(e));
  return data ? data.text() : null;
}

/**
 * A script being written (one per episode per server instance). Both the
 * ahead-of-time prefetch and Watch Show attach to the same session, and
 * Watch Show follows it line by line — so clicking while the prefetch is
 * still writing never waits for the whole script.
 */
interface Writing {
  last: { sofar: ShowTopicInput[]; done: Set<number> } | null;
  listeners: Set<(sofar: ShowTopicInput[], done: Set<number>) => void>;
  result: Promise<{ segments: ShowSegment[]; written: boolean }>;
}
const writing = new Map<string, Writing>();

function startWriting(sb: SupabaseClient | null, e: EpisodeInput): Writing {
  const path = scriptPath(e);
  const running = writing.get(path);
  if (running) return running;
  const w: Writing = { last: null, listeners: new Set(), result: null as unknown as Writing['result'] };
  w.result = (async () => {
    const ep = await writeConversation(e.topics, e.teamName, e.stats, (sofar, done) => {
      w.last = { sofar, done: new Set(done) };
      for (const l of w.listeners) l(sofar, done);
    });
    const segments = buildShowScript(ep.topics, e.teamName, e.stats, { written: ep.written });
    // Only cache a written script: a fallback (writer down) gets retried.
    if (ep.written) await writeJson(sb, path, { segments });
    return { segments, written: ep.written };
  })();
  writing.set(path, w);
  w.result.finally(() => setTimeout(() => writing.delete(path), 120_000)).catch(() => {});
  return w;
}

/** The episode's script, written ahead of time (the prefetch): from the
 *  cache, or written now and cached. */
export async function getScript(sb: SupabaseClient | null, e: EpisodeInput): Promise<ShowSegment[]> {
  const cached = await readJson<{ segments: ShowSegment[] }>(sb, scriptPath(e));
  if (cached?.segments?.length) return cached.segments;
  return (await startWriting(sb, e).result).segments;
}

/** Lines per voiced block: a topic's first block is short so it's ready
 *  fast; the rest are a few lines each (one dialogue pass per block). */
const BLOCK_SIZES = [2, 3];
const blockSize = (k: number) => BLOCK_SIZES[Math.min(k, BLOCK_SIZES.length - 1)];

export interface Block { idxs: number[]; topicIdx: number; full: boolean }

/** Voiced blocks of generated lines: the title line, then each topic's
 *  lines in runs of 2, 3, 3… Purely positional, so the blocks of a script
 *  that's still growing are the same as in the finished one. */
export function blockList(segments: ShowSegment[]): Block[] {
  const byTopic = new Map<number, number[]>();
  segments.forEach((seg, i) => {
    if (seg.kind !== 'tts') return;
    byTopic.set(seg.topicIdx, [...(byTopic.get(seg.topicIdx) ?? []), i]);
  });
  const out: Block[] = [];
  for (const [topicIdx, idxs] of byTopic) {
    for (let at = 0, k = 0; at < idxs.length; k++) {
      const size = blockSize(k);
      out.push({ idxs: idxs.slice(at, at + size), topicIdx, full: idxs.length - at >= size });
      at += size;
    }
  }
  return out;
}

export const blocksOf = (segments: ShowSegment[]): number[][] => blockList(segments).map(b => b.idxs);

/** On-screen text never shows the [laughs]-style performance cues. */
export const displaySegments = (segments: ShowSegment[]): TimedShowSegment[] =>
  segments.map(seg => (seg.kind === 'tts' ? { ...seg, text: stripCues(seg.text) } : seg));

/** The complete episode (what the cache stores and a cache hit returns). */
export function assemble(segments: ShowSegment[], blocks: VoicedBlock[]): ShowPayload {
  const timed = displaySegments(segments);
  for (const b of blocks) for (const l of b.lines) {
    timed[l.seg] = { ...timed[l.seg], audioIndex: b.index, audioStart: l.start, audioDuration: l.duration };
  }
  return { segments: timed, audios: blocks.map(b => b.audio) };
}

/** What the episode stream sends the player. */
export type EpisodeMessage =
  | { type: 'script'; segments: TimedShowSegment[]; final: boolean }
  | ({ type: 'block' } & VoicedBlock);

/**
 * Produce a fresh episode as a stream the player can start on immediately:
 *  - the opening (intro clips + the title line) right away, voiced within a
 *    couple of seconds;
 *  - then the conversation as the writer writes it, line by line, each run
 *    of lines voiced the moment it's complete — so the first lines are ready
 *    while the intro is still playing.
 * If the script was written ahead of time, it all goes out at once.
 * Returns the complete episode for the cache.
 */
export async function streamEpisode(sb: SupabaseClient | null, e: EpisodeInput, send: (m: EpisodeMessage) => void): Promise<ShowPayload> {
  const t0 = Date.now();
  const log = (what: string) => console.info(`[spotlight-show] ${what} +${Date.now() - t0}ms`);
  const voiced: VoicedBlock[] = [];
  const voicing: Promise<void>[] = [];
  const started = new Set<number>(); // blocks whose voicing has begun
  let sentLen = -1;

  /** Send the script so far (if it grew) and voice every block that's
   *  complete and not voiced yet. */
  const publish = (segments: ShowSegment[], final: boolean, doneTopics?: Set<number>) => {
    if (final || segments.length !== sentLen) {
      send({ type: 'script', segments: displaySegments(segments), final });
      sentLen = segments.length;
    }
    blockList(segments).forEach((b, index) => {
      if (started.has(index)) return;
      if (!final && !b.full && !(b.topicIdx < 0 || doneTopics?.has(b.topicIdx))) return;
      started.add(index);
      voicing.push(voiceBlock(segments, b.idxs, index).then(v => {
        voiced[index] = v;
        send({ type: 'block', ...v });
        log(`block ${index} voiced (${b.idxs.length} lines)`);
      }));
    });
  };

  const cached = await readJson<{ segments: ShowSegment[] }>(sb, scriptPath(e));
  let final: ShowSegment[];
  if (cached?.segments?.length) {
    log('script from cache');
    final = cached.segments;
    publish(final, true);
  } else {
    // The opening needs nothing from the writer.
    publish(buildShowScript([], e.teamName, e.stats, { written: true, partial: true }), false);
    let first = true;
    const onProgress = (sofar: ShowTopicInput[], done: Set<number>) => {
      if (first) { log('first line written'); first = false; }
      // Only the topics the writer has reached.
      const reached = sofar.map((t, i) => (done.has(i) || t !== e.topics[i] ? i : -1)).reduce((m, i) => Math.max(m, i), -1);
      publish(buildShowScript(sofar.slice(0, reached + 1), e.teamName, e.stats, { written: true, partial: true }), false, done);
    };
    // Join the writing session (maybe already started by the prefetch):
    // catch up on what's written so far, then follow it.
    const w = startWriting(sb, e);
    if (w.last) onProgress(w.last.sofar, w.last.done);
    w.listeners.add(onProgress);
    try {
      const out = await w.result;
      log('script written');
      // Written: the final script. Writer unavailable: the original notes,
      // composed the classic way (same intro, so what's playing stays valid).
      final = out.written ? out.segments : buildShowScript(e.topics, e.teamName, e.stats);
    } finally {
      w.listeners.delete(onProgress);
    }
    publish(final, true);
  }
  await Promise.all(voicing);
  log('all voiced');
  return assemble(final, blocksOf(final).map((_, i) => voiced[i]));
}

// ElevenLabs caps concurrent requests per account: voice a few blocks at a
// time, in order (the next lines to play go first), retrying when throttled.
const MAX_VOICING = 4;
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (active >= MAX_VOICING) await new Promise<void>(r => waiting.push(r));
  active++;
  try { return await job(); } finally { active--; waiting.shift()?.(); }
}

async function voiceBlock(segments: ShowSegment[], idxs: number[], index: number): Promise<VoicedBlock> {
  const lines = idxs.map(i => {
    const seg = segments[i] as Extract<ShowSegment, { kind: 'tts' }>;
    return { voiceId: VOICES[seg.speaker], text: normalizeTtsText(seg.text) };
  });
  const voiced = await slot(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await generateDialogue(lines);
      } catch (err) {
        const throttled = /\(429\)|concurrent|too_many/i.test(err instanceof Error ? err.message : '');
        if (!throttled || attempt >= 4) throw err;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  });
  return {
    index,
    audio: voiced.audio.toString('base64'),
    lines: idxs.map((seg, k) => ({ seg, start: voiced.lines[k].start, duration: Math.max(0, voiced.lines[k].end - voiced.lines[k].start) })),
  };
}
