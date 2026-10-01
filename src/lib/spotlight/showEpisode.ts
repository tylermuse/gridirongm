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
export const SHOW_VERSION = 'show-v6';

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
const scriptPath = (e: EpisodeInput) => `show/script-${hash({ v: SHOW_VERSION, m: WRITER_MODEL, topics: e.topics, teamName: e.teamName, stats: e.stats })}.json`;
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

// One write per script per server instance, even when the prefetch and
// Watch Show race each other.
const inflight = new Map<string, Promise<ShowSegment[]>>();
const PENDING_MS = 75_000;

/**
 * The episode's script: from the cache, or written now (and cached). If
 * another instance is already writing it (a recent pending marker), wait
 * for that instead of paying for a second write.
 */
export function getScript(sb: SupabaseClient | null, e: EpisodeInput): Promise<ShowSegment[]> {
  const path = scriptPath(e);
  const running = inflight.get(path);
  if (running) return running;
  const job = (async () => {
    const cached = await readJson<{ segments: ShowSegment[] }>(sb, path);
    if (cached?.segments?.length) return cached.segments;
    const pending = await readJson<{ at: number }>(sb, `${path}.pending`);
    if (pending && Date.now() - pending.at < PENDING_MS) {
      for (let waited = 0; waited < PENDING_MS; waited += 1500) {
        await new Promise(r => setTimeout(r, 1500));
        const done = await readJson<{ segments: ShowSegment[] }>(sb, path);
        if (done?.segments?.length) return done.segments;
      }
    }
    await writeJson(sb, `${path}.pending`, { at: Date.now() });
    const ep = await writeConversation(e.topics, e.teamName, e.stats);
    const segments = buildShowScript(ep.topics, e.teamName, e.stats, { written: ep.written });
    // Only cache a written script: a fallback (writer down) gets retried.
    if (ep.written) await writeJson(sb, path, { segments });
    return segments;
  })();
  inflight.set(path, job);
  job.finally(() => setTimeout(() => inflight.delete(path), 60_000)).catch(() => {});
  return job;
}

/** Voiced blocks of generated lines: the title line, then one per topic. */
export function blocksOf(segments: ShowSegment[]): number[][] {
  const blocks = new Map<number, number[]>();
  segments.forEach((seg, i) => {
    if (seg.kind !== 'tts') return;
    const list = blocks.get(seg.topicIdx) ?? [];
    list.push(i);
    blocks.set(seg.topicIdx, list);
  });
  return [...blocks.values()];
}

/** On-screen text never shows the [laughs]-style performance cues. */
export const displaySegments = (segments: ShowSegment[]): TimedShowSegment[] =>
  segments.map(seg => (seg.kind === 'tts' ? { ...seg, text: stripCues(seg.text) } : seg));

/**
 * Voice every block (all in parallel) and hand each one over as soon as it
 * is done — the short title block first, typically within a second or two.
 */
export async function voiceBlocks(segments: ShowSegment[], onBlock: (b: VoicedBlock) => void): Promise<VoicedBlock[]> {
  const blocks = blocksOf(segments);
  const out: VoicedBlock[] = [];
  await Promise.all(blocks.map(async (idxs, index) => {
    const voiced = await generateDialogue(idxs.map(i => {
      const seg = segments[i] as Extract<ShowSegment, { kind: 'tts' }>;
      return { voiceId: VOICES[seg.speaker], text: normalizeTtsText(seg.text) };
    }));
    const block: VoicedBlock = {
      index,
      audio: voiced.audio.toString('base64'),
      lines: idxs.map((seg, k) => ({ seg, start: voiced.lines[k].start, duration: Math.max(0, voiced.lines[k].end - voiced.lines[k].start) })),
    };
    out[index] = block;
    onBlock(block);
  }));
  return out;
}

/** The complete episode (what the cache stores and a cache hit returns). */
export function assemble(segments: ShowSegment[], blocks: VoicedBlock[]): ShowPayload {
  const timed = displaySegments(segments);
  for (const b of blocks) for (const l of b.lines) {
    timed[l.seg] = { ...timed[l.seg], audioIndex: b.index, audioStart: l.start, audioDuration: l.duration };
  }
  return { segments: timed, audios: blocks.map(b => b.audio) };
}
