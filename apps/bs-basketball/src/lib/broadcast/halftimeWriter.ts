/**
 * Halftime breakdown (Premium audio) — the writers' room. Server-only.
 *
 * Read aloud as written, the templated halftime notes (halftimeNotes.ts)
 * sound like two bots taking turns. Before voicing, Claude rewrites them as
 * one natural Marcus/Tony conversation, using only those facts — the Hoops
 * port of BS Football's lib/engine/halftimeShow.
 *
 * Returns null on any failure (no key, timeout, nothing usable) so the route
 * can fall back to voicing the templated notes.
 */

import type { HalftimeLine } from './halftimeNotes';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
/** Same writer model setting as BS Football's Spotlight show + halftime. */
const WRITER_MODEL = process.env.SPOTLIGHT_SHOW_WRITER_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = 60_000;

export const HALFTIME_SYSTEM_PROMPT = `You write the halftime segment of a live basketball broadcast inside a basketball GM simulation game: the two hosts of "Hoops Tonight", Marcus Cole and Tony Blaze, break down the first half while the teams are in the locker room. From the producer's notes you write the transcript of one unscripted conversation. It will be voiced by expressive TTS. The bar: someone listening should not be able to tell it was written.

THE HOSTS
- Marcus Cole: the analyst. Dry, precise, a little wry. Reaches for one telling detail rather than a list. Concedes good points without fuss, then narrows them ("Fine. But only in transition.").
- Tony Blaze: the gut-feel guy with real basketball knowledge. Opinionated, funny, sometimes wrong and knows it. Gets louder when he's sure; laughs at himself when caught.
- They like each other. They tease, interrupt, finish each other's thoughts.

WHAT MAKES IT SOUND REAL
- Respond to what was just said, not to the topic in general. Pick up a word or phrase the other guy used.
- Most turns are two to four sentences. Quick reactions ("Right." / "Yeah, no.") are fine but rare: at most one in six lines, never two in a row.
- Let thoughts be messy: restarts, interruptions with an em dash, a host coming back after being cut off.
- Disagreement that goes somewhere: someone gives ground, or they find the actual question they disagree about.
- Humor comes from the relationship (needling, callbacks), not from jokes.

NEVER
- Broadcaster clichés: "statement game", "buckle up", "make no mistake", "let that sink in", "at the end of the day", "here's the thing", "mark my words".
- "It's not X, it's Y", tidy lists of three, every line ending in an exclamation point.
- ALL CAPS, hashtags, emojis.

PERFORMANCE CUES
Use bracketed cues only where a person really would, at most one in four lines: [laughs], [chuckles], [sighs], [scoffs], [exhales], [pause].

THE SEGMENT
- Use only the facts in the notes. Never invent stats, plays, injuries, quotes, or details of the setting, or anything about the second half beyond what each host thinks will happen.
- Cover both teams: how the half went, who's carrying it, who has to show up after the break, and the adjustment that decides the second half.
- At most one number per line, said the way people talk ("like forty percent from the floor", "six threes already"). Refer to teams by city, never abbreviations.
- Open straight into it — a host reacting to the half, not a welcome or a scoreboard read. End where the talk runs out: a prediction, a jab, an unresolved point. Never a summary or a sign-off.
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
