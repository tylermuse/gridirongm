/**
 * Halftime breakdown (Premium audio) — the writers' room.
 *
 * The Halftime Report's facts come from the templated read of the first half
 * (generateHalftimeAudioBreakdown). Read aloud as written, those lines sound
 * like two bots taking turns. Before voicing, Claude rewrites them as one
 * natural conversation between Marcus and Tony, in the same voice as the
 * Team Spotlight show, using only those facts. Server-only.
 *
 * Returns null on any failure (no key, timeout, nothing usable) so the route
 * can fall back to voicing the templated lines.
 */
import { WRITER_SYSTEM_PROMPT, WRITER_MODEL } from '@/lib/spotlight/showWriter';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TIMEOUT_MS = 60_000;

export interface HalftimeLine { speaker: 'marcus' | 'tony'; text: string }

/** The show's guide to the hosts and how they talk (THE HOSTS through
 *  PERFORMANCE CUES), minus the show-only parts (topic transitions). */
export const HOST_VOICE_GUIDE = (() => {
  const a = WRITER_SYSTEM_PROMPT.indexOf('THE HOSTS');
  const b = WRITER_SYSTEM_PROMPT.indexOf('THE MOMENT');
  if (a < 0 || b < a) throw new Error('showWriter prompt changed: THE HOSTS / THE MOMENT not found');
  return WRITER_SYSTEM_PROMPT.slice(a, b)
    .replace(/TRANSITIONS\n[\s\S]*?\n\n/, '')
    .replace('Outside the game breakdown, most lines carry no number at all. ', 'Not every line needs a number. ')
    .trim();
})();

export const HALFTIME_SYSTEM_PROMPT = `You write the halftime segment of a live football broadcast inside a football GM simulation game: the two hosts of the "Team Spotlight" show, Marcus Cole and Tony Blaze, break down the first half while the teams are in the locker room. From the producer's notes you write the transcript of one unscripted conversation. It will be voiced by expressive TTS. The bar: someone listening should not be able to tell it was written.

${HOST_VOICE_GUIDE}

THE SEGMENT
- The producer's notes are a rough read of the first half: the score, who's carrying each offense, stars who've gone quiet, the defensive story, what the trailing team has to fix. Use only those facts. Never invent stats, plays, injuries, quotes, details of the setting (weather, crowd, uniforms), or anything about the second half beyond what each host thinks will happen.
- Cover both teams. Get to: how the half went, who's driving it, who has to show up after the break, and the adjustment that decides the second half. The order can follow the conversation.
- Numbers are welcome here, at most one per line, said the way people talk ("two picks already", "like ninety on the ground"). Refer to teams by city, never abbreviations.
- Open straight into it — Marcus or Tony reacting to the half, not a welcome or a scoreboard read. End where the talk runs out: a prediction, a jab, an unresolved point. Never a summary or a sign-off.
- 10 to 12 lines, about a minute and a half spoken.

OUTPUT
One line per turn, each a JSON object, nothing else:
{"speaker":"marcus"|"tony","text":"..."}`;

/** Parse the writer's output: one {"speaker","text"} object per line. */
export function parseHalftimeLines(raw: string): HalftimeLine[] {
  const out: HalftimeLine[] = [];
  for (const l of raw.split('\n')) {
    const s = l.trim().replace(/,$/, '');
    if (!s.startsWith('{')) continue;
    try {
      const o = JSON.parse(s) as { speaker?: string; text?: string };
      const speaker = o.speaker === 'marcus' || o.speaker === 'tony' ? o.speaker : null;
      const text = typeof o.text === 'string' ? o.text.trim() : '';
      if (speaker && text) out.push({ speaker, text });
    } catch { /* skip */ }
  }
  return out;
}

/** The user message: the matchup, then the templated lines as notes. */
export function halftimeUserMessage(notes: HalftimeLine[]): string {
  return `Producer's notes for the halftime segment:\n${notes.map(n => `${n.speaker === 'marcus' ? 'Marcus' : 'Tony'}: ${n.text}`).join('\n')}`;
}

export async function writeHalftime(notes: HalftimeLine[]): Promise<HalftimeLine[] | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: WRITER_MODEL, max_tokens: 4000,
        output_config: { effort: 'low' },
        system: HALFTIME_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: halftimeUserMessage(notes) }],
      }),
    });
    if (!res.ok) throw new Error(`writer ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
    const lines = parseHalftimeLines(text);
    // A handful of lines means it was cut off or went wrong: use the notes.
    return lines.length >= 6 ? lines : null;
  } catch (err) {
    console.warn('Halftime writer failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Group lines into dialogue requests under the v3 per-request text limit,
 *  evenly sized (no one-line straggler voiced without context; the requests
 *  run in parallel, so even halves also finish sooner). */
export function chunkDialogue<T extends { text: string }>(lines: T[], maxChars = 2000): T[][] {
  const total = lines.reduce((n, l) => n + l.text.length, 0);
  const target = total / Math.max(1, Math.ceil(total / maxChars));
  const out: T[][] = [];
  let cur: T[] = [], n = 0;
  for (const l of lines) {
    if (cur.length && (n + l.text.length > maxChars || n >= target)) { out.push(cur); cur = []; n = 0; }
    cur.push(l); n += l.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
