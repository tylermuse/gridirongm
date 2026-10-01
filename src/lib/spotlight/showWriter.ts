/**
 * Team Spotlight video show — the writers' room.
 *
 * The Spotlight topics are written as debate-show copy (punchy, a stat in
 * every line). Read aloud, that sounds like two bots trading lines. Before
 * voicing an episode, Claude rewrites the topics' notes as one unscripted
 * conversation between the hosts — reacting, conceding, interrupting,
 * calling back — using only the facts in the notes, and picks which of the
 * hosts' pre-recorded on-camera lines to cut to. Server-only.
 *
 * Falls back to the original topics on any failure (no key, timeout, bad
 * JSON), so the show always plays.
 */
import type { ShowTopicInput } from './showScript';
import type { ShowStatLine } from './teamStats';
import { ordinal, rankTone } from './teamStats';
import { PHRASES, type Phrase, type PhraseTone } from './phrases';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
/** The writing is what makes the show sound human: use the strongest model.
 *  Scripts are written ahead of time (see /api/spotlight-show/script), so
 *  its latency is mostly hidden. */
export const WRITER_MODEL = process.env.SPOTLIGHT_SHOW_WRITER_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = 90_000;
/** How long the model deliberates before writing (it thinks adaptively).
 *  Low keeps the first topic arriving in seconds: the show is already
 *  playing while it writes. */
const WRITER_EFFORT = process.env.SPOTLIGHT_SHOW_WRITER_EFFORT || 'low';

export const WRITER_SYSTEM_PROMPT = `You write "Team Spotlight", a two-host football talk show inside a football GM simulation game. From the producer's notes you write the transcript of one unscripted conversation between the hosts. It will be voiced by expressive TTS and cut against pre-recorded on-camera clips. The bar: someone listening should not be able to tell it was written. It should sound like two guys who've done this show together for years, talking, not performing.

THE HOSTS
- Marcus Cole: the analyst. Dry, precise, a little wry. Reaches for one telling detail rather than a list. Concedes good points without fuss, then narrows them ("Fine. But only on early downs.").
- Tony Blaze: the gut-feel guy with real football knowledge. Opinionated, funny, sometimes wrong and knows it. Gets louder when he's sure; laughs at himself when caught.
- They like each other. They tease, interrupt, finish each other's thoughts, and bring back things said earlier in the episode.

WHAT MAKES IT SOUND REAL
- Respond to what was just said, not to the topic in general. Pick up a word or phrase the other guy used.
- Vary turn length a lot: some turns are two words ("Yeah, no." / "Right." / "Sure, sure."), some are a three- or four-sentence run where a host thinks out loud and changes direction mid-way.
- Let thoughts be messy: restarts ("They— look, they have to run it."), interruptions with an em dash, a host coming back after being cut off.
- Disagreement that goes somewhere: someone gives ground, or they find the actual question they disagree about. It doesn't always resolve.
- Outside the game breakdown, most lines carry no number at all. When a number comes up, say it the way people talk ("like sixteen a game", "twenty-seventh, I think?"), and never repeat a number the other host just said.
- Humor comes from the relationship (needling, callbacks, a running bit), not from jokes.
- Topics end where the talk naturally runs out: an unresolved point, a jab, a shrug. Never a summary, never "Thank you."

TRANSITIONS
Each topic after the first opens with one host moving the conversation on in his own words, usually tying back to what was just said ("Speaking of the run game—", "Alright, Buffalo. You've been waiting on this one all show."). Never "next topic" or "let's move on".

NEVER (these read as AI or as a bad radio script)
- Catchphrases and broadcaster clichés: "statement game", "buckle up", "make no mistake", "let that sink in", "at the end of the day", "here's the thing", "it is what it is", "mark my words".
- "It's not X, it's Y", tidy lists of three, rhetorical-question chains, every line ending in an exclamation point.
- Restating the headline, announcing the topic, explaining what a stat means to a co-host who obviously knows.
- A host describing his own personality, or the hosts agreeing in a neat bow.
- ALL CAPS, hashtags, emojis.

STYLE REFERENCE (a different team — tone only, don't reuse lines)
TONY: I'm just saying, if he throws one more pick into double coverage I'm driving to the facility myself.
MARCUS: You'd get lost.
TONY: [laughs] I would get lost.
MARCUS: But — and I hate this — you're not wrong. Two of his last three picks were on third down, same read.
TONY: Same read! That's coaching.
MARCUS: Or it's him. That's sort of the whole question, isn't it.
TONY: Yeah. Yeah, okay. I don't know which one scares me more.

PERFORMANCE CUES
Voiced with ElevenLabs v3, which performs bracketed cues. Use them only where a person really would, at most one in four lines: [laughs], [chuckles], [sighs], [scoffs], [exhales], [pause].

FACTS
Use only facts, names and numbers in the notes and team numbers. You may reason about football in general, but don't invent stats, injuries, trades, quotes or events for this team. Teams are "they" or their name, never "we". When a player or position group comes up, name it plainly (the show puts his or its numbers on screen when it hears the name).

ON-CAMERA CLIPS
The hosts have pre-recorded on-camera lines, listed with the notes as CLIPS (all already true for this team). Using one cuts to a real shot of the host, which makes the show feel live, so use them — but only where it is exactly what that host would say next. Write {"speaker":"tony","clip":"<id>"} instead of a text line.
- The speaker must be the clip's host. Never use a clip twice.
- The next line must react to the clip's actual words.
- Write around clips so they land: set up the subject, then answer it.
- Aim for two or three clips in each topic of five or more lines, one in shorter topics.

OUTPUT
One JSON object per topic, each on its own single line (no array around them, no other text), in the same order as the notes — the show starts playing the first topic while you write the rest:
{"lines":[{"speaker":"marcus"|"tony","text":"..."} or {"speaker":"marcus"|"tony","clip":"<id>"}, ...]}
- Exactly one line per topic in the notes.
- The first topic comes right after the hosts' intros: get straight into it, no greeting. If it's a regular topic, keep it a quick cold open (2–4 lines).
- Topics marked "depth":"deep" are the game they just played. Go deep, the way a real postgame show does: 10–16 lines each. Walk through how the game was won or lost (the flow, the turning points, the deciding drive), argue about what decided it, and put the real stat lines in the hosts' mouths — specific players, specific numbers, said the way people say them ("three touchdowns, no picks", "a hundred and twelve on the ground"). Here, numbers are welcome: one per line is fine.
- Other topics: 5–9 lines.`;

function teamNumbers(teamName: string, stats?: ShowStatLine | null): string {
  if (!stats) return `${teamName}.`;
  const parts = stats.stats.map(s => `${s.label} ${s.value} (${ordinal(s.rank)} of ${s.of})`);
  return `${teamName}, record ${stats.record}. ${parts.join('; ')}.`;
}

interface WriterLine { speaker: string; text?: string; clip?: string }

function recordTone(stats?: ShowStatLine | null): PhraseTone | null {
  if (!stats) return null;
  const [w, l] = stats.record.split('-').map(Number);
  const pct = w + l > 0 ? w / (w + l) : 0.5;
  return pct >= 0.6 ? 'good' : pct <= 0.4 ? 'bad' : 'mid';
}

/**
 * On-camera lines the writer may use for this team: the conversational
 * topical bank and Marcus's stat takes — only the ones that are true for
 * this team (tone matches its record / that stat), with any rank slot shown
 * filled in. The older announcer-style lines (Tony's stat riffs, record
 * takes, stock glue) are left out: they're what made the show sound canned.
 */
export function clipCatalog(stats?: ShowStatLine | null): { phrase: Phrase; words: string }[] {
  const rt = recordTone(stats);
  const statOf = (k: string) => stats?.stats.find(x => x.key === k);
  const out: { phrase: Phrase; words: string }[] = [];
  for (const p of PHRASES) {
    const usable = p.kind === 'topical' || (p.kind === 'riff' && p.host === 'marcus');
    if (!usable) continue;
    let words = p.text;
    if (p.stat) {
      const st = statOf(p.stat);
      if (!st || (p.tone && rankTone(st.rank, st.of) !== p.tone)) continue;
      words = words.replace('{rank}', ordinal(st.rank));
    } else if (p.tone) {
      if (p.tone !== rt) continue;
    }
    if (words.includes('{rank}')) continue;
    out.push({ phrase: p, words: words.charAt(0).toUpperCase() + words.slice(1) });
  }
  return out;
}

interface TopicLines { lines: WriterLine[] }

const topicOk = (o: unknown): o is TopicLines =>
  !!o && Array.isArray((o as TopicLines).lines) && (o as TopicLines).lines.length > 0
  && (o as TopicLines).lines.every(l => !!l && typeof l === 'object' && typeof l.speaker === 'string');

export interface WrittenEpisode {
  topics: ShowTopicInput[];
  /** True when the writer produced the conversation (else: original notes). */
  written: boolean;
}

/** Calls back with each topic as soon as the writer finishes it: the topic's
 *  index in `topics` and its rewritten version. */
export type OnTopic = (index: number, topic: ShowTopicInput) => void;

const debateOf = (t: ShowTopicInput) => t.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
export const hasDebate = (t: ShowTopicInput) => debateOf(t).length > 0;

/**
 * Rewrite the topics' Marcus/Tony lines as one natural conversation,
 * streamed: each topic is handed to `onTopic` the moment it's written, so
 * the show can voice and play the first topics while the rest are written.
 * Topics the writer doesn't deliver keep their original lines.
 */
export async function writeConversation(
  topics: ShowTopicInput[],
  teamName: string,
  stats?: ShowStatLine | null,
  onTopic?: OnTopic,
): Promise<WrittenEpisode> {
  const original = { topics, written: false };
  if (!ANTHROPIC_API_KEY) return original;
  const liveIdx = topics.flatMap((t, i) => (hasDebate(t) ? [i] : []));
  if (!liveIdx.length) return original;

  const catalog = clipCatalog(stats);
  const clipById = new Map(catalog.map(c => [c.phrase.id, c]));
  const notes = liveIdx.map(i => ({
    headline: topics[i].headline,
    ...(topics[i].depth === 'deep' ? { depth: 'deep' } : {}),
    notes: debateOf(topics[i]).map(e => `${e.speakerId === 'stats' ? 'Marcus' : 'Tony'}: ${e.text}`),
  }));
  const clipList = catalog.map(c => `${c.phrase.id} (${c.phrase.host}): ${c.words}`).join('\n');
  const user = `Team numbers: ${teamNumbers(teamName, stats)}\n\nProducer's notes for this episode:\n${JSON.stringify(notes, null, 1)}`
    + (clipList ? `\n\nCLIPS (id (host): words):\n${clipList}` : '');

  const lineOk = (l: WriterLine): boolean => {
    if (l.speaker !== 'marcus' && l.speaker !== 'tony') return false;
    if (typeof l.clip === 'string') return clipById.get(l.clip)?.phrase.host === l.speaker;
    return typeof l.text === 'string' && l.text.trim().length > 0;
  };
  const toTopic = (t: ShowTopicInput, o: TopicLines): ShowTopicInput | null => {
    // Drop any line that doesn't check out (unknown clip, wrong host).
    const lines = o.lines.filter(lineOk);
    if (!lines.length) return null;
    return {
      ...t,
      exchanges: lines.map(l => {
        const speakerId = l.speaker === 'marcus' ? 'stats' : 'hottake';
        const clip = l.clip ? clipById.get(l.clip) : undefined;
        return clip ? { speakerId, text: clip.words, clipId: clip.phrase.id } : { speakerId, text: (l.text ?? '').trim() };
      }),
    };
  };

  const out = [...topics];
  let got = 0;
  const take = (jsonLine: string) => {
    if (got >= liveIdx.length) return;
    const start = jsonLine.indexOf('{');
    if (start < 0) return;
    let o: unknown;
    try { o = JSON.parse(jsonLine.slice(start, jsonLine.lastIndexOf('}') + 1)); } catch { return; }
    if (!topicOk(o)) return;
    const i = liveIdx[got++];
    const t = toTopic(topics[i], o);
    if (t) out[i] = t;
    onTopic?.(i, out[i]);
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: WRITER_MODEL, max_tokens: 8000, stream: true,
        output_config: { effort: WRITER_EFFORT },
        system: WRITER_SYSTEM_PROMPT, messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`writer ${res.status}: ${(await res.text()).slice(0, 200)}`);
    // Server-sent events → text deltas → one topic per completed line.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let sse = '';
    let text = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        sse += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = sse.indexOf('\n')) >= 0) {
          const ev = sse.slice(0, nl).trim();
          sse = sse.slice(nl + 1);
          if (!ev.startsWith('data:')) continue;
          let data: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
          try { data = JSON.parse(ev.slice(5)); } catch { continue; }
          if (data.type === 'error') throw new Error(data.error?.message ?? 'stream error');
          if (data.type !== 'content_block_delta' || data.delta?.type !== 'text_delta') continue;
          text += data.delta.text ?? '';
          let cut: number;
          while ((cut = text.indexOf('\n')) >= 0) { take(text.slice(0, cut)); text = text.slice(cut + 1); }
        }
      }
    } finally {
      clearTimeout(timer);
    }
    take(text);
    if (!got) throw new Error('writer returned no topics');
    // Any topic it didn't get to keeps its original lines.
    for (let k = got; k < liveIdx.length; k++) onTopic?.(liveIdx[k], out[liveIdx[k]]);
    return { topics: out, written: true };
  } catch (err) {
    console.warn('Spotlight show writer failed:', err instanceof Error ? err.message : err);
    if (!got) return original;
    for (let k = got; k < liveIdx.length; k++) onTopic?.(liveIdx[k], out[liveIdx[k]]);
    return { topics: out, written: true };
  }
}
