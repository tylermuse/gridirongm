/**
 * Team Spotlight show: lip-synced two-shot for generated lines.
 *
 * Some of each episode's voiced lines (the talk, not the stat lines) are put
 * on camera: both hosts at the desk facing the camera, the speaking host's
 * mouth lip-synced to his line by MuseTalk (fal.ai) on footage of him
 * talking (public/show/lips). Renders take a minute or more, so the show
 * never waits: the server queues one render per line as soon as its block
 * is voiced and streams the request id; the player asks /api/spotlight-show/lips
 * for the finished clips and cuts to the two-shot for a line only if its
 * clip is ready by then (otherwise the line keeps its usual shot).
 * Server-only.
 */
import type { Host, ShowSegment } from './showScript';

const FAL_KEY = process.env.FAL_KEY;
export const LIPS_MODEL = 'fal-ai/musetalk';
/** On-camera seconds per episode at most (cost cap). */
export const LIPS_MAX_SECONDS = Number(process.env.SPOTLIGHT_SHOW_LIPS_MAX_SECONDS || 90);
const MIN_LINE = 2.5, MAX_LINE = 15;

export const lipsEnabled = () => !!FAL_KEY && process.env.SPOTLIGHT_SHOW_LIPS !== 'off';

/** What the player needs to line a clip up with the line's audio: the fal
 *  request, and where in the block's audio the clip's sound starts. */
export interface LipsRequest { request: string; start: number }

/** The footage each host's mouth is synced onto (him talking, 60 s, 720²). */
export const talkSrc = (host: Host) => `/show/lips/talk_${host}.mp4`;

/** Lines worth putting on camera: conversation, not numbers (those keep
 *  their graphic), long enough to be a shot, short enough to render. */
export function wantsLips(seg: ShowSegment, duration: number): boolean {
  return seg.kind === 'tts' && seg.visual === 'graphic' && seg.topicIdx >= 0
    && duration >= MIN_LINE && duration <= MAX_LINE && !/\d/.test(seg.text);
}

// ── MP3 slicing (frame-accurate, no re-encode) ───────────────────────
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]; // MPEG-1 Layer III, kbps
const RATES = [44100, 48000, 32000];

interface Frame { offset: number; length: number; time: number; duration: number }

/** The MPEG-1 Layer III frames of an MP3 (an ID3v2 tag in front is skipped). */
export function mp3Frames(buf: Buffer): Frame[] {
  let p = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    p = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  const frames: Frame[] = [];
  let time = 0;
  while (p + 4 <= buf.length) {
    const b1 = buf[p + 1], b2 = buf[p + 2];
    // Sync, MPEG-1 (bits 11), Layer III (bits 01).
    if (buf[p] !== 0xff || (b1 & 0xfe) !== 0xfa) { p++; continue; }
    const kbps = BITRATES[b2 >> 4], rate = RATES[(b2 >> 2) & 3];
    if (!kbps || !rate) { p++; continue; }
    const length = Math.floor(144000 * kbps / rate) + ((b2 >> 1) & 1);
    frames.push({ offset: p, length, time, duration: 1152 / rate });
    time += 1152 / rate;
    p += length;
  }
  return frames;
}

/** The frames covering [start, end] seconds, and the time the slice
 *  actually starts at (a frame boundary at or before `start`). */
export function mp3Slice(buf: Buffer, start: number, end: number): { bytes: Buffer; start: number } | null {
  const frames = mp3Frames(buf);
  const keep = frames.filter(f => f.time + f.duration > start && f.time < end);
  if (!keep.length) return null;
  const last = keep[keep.length - 1];
  return { bytes: buf.subarray(keep[0].offset, last.offset + last.length), start: keep[0].time };
}

// ── fal queue ───────────────────────────────────────────────────────
const QUEUE = `https://queue.fal.run/${LIPS_MODEL}`;
const auth = () => ({ authorization: `Key ${FAL_KEY}` });

/** Queue one render: `origin` serves the talking footage. */
export async function submitLips(origin: string, host: Host, mp3: Buffer): Promise<string> {
  const res = await fetch(QUEUE, {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'application/json' },
    body: JSON.stringify({
      source_video_url: new URL(talkSrc(host), origin).toString(),
      audio_url: `data:audio/mpeg;base64,${mp3.toString('base64')}`,
    }),
  });
  if (!res.ok) throw new Error(`lips ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { request_id } = (await res.json()) as { request_id: string };
  return request_id;
}

export type LipsStatus = { id: string; status: 'queued' | 'running' | 'done' | 'failed'; url?: string };

/** Where a render is; the clip's URL once it's done. */
export async function lipsStatus(id: string): Promise<LipsStatus> {
  if (!/^[\w-]{8,80}$/.test(id)) return { id, status: 'failed' };
  const s = await fetch(`${QUEUE}/requests/${id}/status`, { headers: auth(), cache: 'no-store' });
  if (!s.ok) return { id, status: 'failed' };
  const { status } = (await s.json()) as { status: string };
  if (status === 'IN_QUEUE') return { id, status: 'queued' };
  if (status === 'IN_PROGRESS') return { id, status: 'running' };
  if (status !== 'COMPLETED') return { id, status: 'failed' };
  const r = await fetch(`${QUEUE}/requests/${id}`, { headers: auth(), cache: 'no-store' });
  if (!r.ok) return { id, status: 'failed' };
  const out = (await r.json()) as { video?: { url?: string } };
  return out.video?.url ? { id, status: 'done', url: out.video.url } : { id, status: 'failed' };
}
