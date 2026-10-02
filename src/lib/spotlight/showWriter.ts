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
const TIMEOUT_MS = 110_000;
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
- Let turns breathe. Most turns are two to four sentences: a host making his point, thinking out loud, changing direction mid-way, answering the other guy and then adding something. Quick reactions ("Right." / "Yeah, no.") are fine but rare: at most one in six lines, never two in a row. Fewer, fuller turns beat a rapid volley.
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
Use only facts, names and numbers in the notes and team numbers. Never claim a "first", a record or a streak ("their first title", "first time since…") unless the notes state it. You may reason about football in general, but don't invent stats, injuries, trades, quotes or events for this team. Teams are "they" or their name, never "we". When a player or position group comes up, name it plainly (the show puts his or its numbers on screen when it hears the name).

ON-CAMERA CLIPS
The hosts have pre-recorded on-camera lines, listed with the notes as CLIPS (all already true for this team). Using one cuts to a real shot of the host, which makes the show feel live, so use them — but only where it is exactly what that host would say next. Write {"speaker":"tony","clip":"<id>"} instead of a text line.
- The speaker must be the clip's host. Never use a clip twice.
- The next line must react to the clip's actual words.
- Write around clips so they land: set up the subject, then answer it.
- Aim for two or three clips in each topic of five or more lines, one in shorter topics.
- Clips marked "said to his co-host" are quick replies across the desk: use them right after the other host makes a point, as the answer to it.

PRE-RECORDED EXCHANGES
Some whole back-and-forths are pre-recorded, shot with the hosts facing each other, listed as EXCHANGES with when each one fits. Write {"t":<topic>,"exchange":"<id>"} to play one: it stands in for all its lines, in order. Use one only when its condition is true for this team and topic, set it up so its first line follows naturally, and make your next line follow from its last line. Never more than one exchange per episode, and never repeat its lines in your own words.

OUTPUT
One JSON object per spoken line, each on its own single line, nothing else (no array, no prose) — the show starts playing while you write, so write the lines in order:
{"t":<topic number, from 1>,"speaker":"marcus"|"tony","text":"..."}
{"t":<topic number>,"speaker":"marcus"|"tony","clip":"<id>"}
- In the game breakdown, when a line is about one specific score from the numbered list of scores (the drive, the throw, the kick, what it did to the game), add "play":<its number> to that line: {"t":1,"speaker":"tony","text":"...","play":4}. The show puts that moment on screen. Walk through the game's key moments in order, the way a highlight package would.
- Cover every topic in the notes, in order; "t" is its position in the notes (the first topic is 1).
- The first topic comes right after the hosts' intros: get straight into it, no greeting. If it's a regular topic, keep it a quick cold open (2–4 lines).
- Topics marked "depth":"deep" are the game they just played. Go deep, the way a real postgame show does: 10–16 lines each. Walk through how the game was won or lost (the flow, the turning points, the deciding drive), argue about what decided it, and put the real stat lines in the hosts' mouths — specific players, specific numbers, said the way people say them ("three touchdowns, no picks", "a hundred and twelve on the ground"). Here, numbers are welcome: one per line is fine.
- Other topics: 5–9 lines.`;

function teamNumbers(teamName: string, stats?: ShowStatLine | null): string {
  if (!stats) return `${teamName}.`;
  const parts = stats.stats.map(s => `${s.label} ${s.value} (${ordinal(s.rank)} of ${s.of})`);
  return `${teamName}, record ${stats.record}. ${parts.join('; ')}.`;
}

interface WriterLine { speaker: string; text?: string; clip?: string; play?: unknown; exchange?: unknown }

/** Pre-recorded back-and-forths (lines are the manifest's `exchange` phrases,
 *  in order): when the writer may use each, and whether it's true for the
 *  team at all. */
const EXCHANGES: { id: string; when: string; fits: (stats?: ShowStatLine | null) => boolean }[] = [
  {
    id: 'buyer',
    when: 'Trade-deadline / trades topic, only if the team has a winning record AND the notes say it has made no trades this season. Tony opens "See, now you\'re buying", so set it up with Marcus saying he\'d add one specific piece at the right price.',
    fits: stats => { const [w, l] = (stats?.record ?? '').split('-').map(Number); return w > l; },
  },
];

export function exchangesFor(stats?: ShowStatLine | null): { id: string; when: string; lines: Phrase[] }[] {
  return EXCHANGES.filter(x => x.fits(stats))
    .map(x => ({ id: x.id, when: x.when, lines: PHRASES.filter(p => p.exchange === x.id) }))
    .filter(x => x.lines.length >= 2);
}

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
/** Seconds of speech a clip needs before the writer may cut to it. */
export const MIN_CLIP_SPEECH = 2.5;

export function clipCatalog(stats?: ShowStatLine | null): { phrase: Phrase; words: string }[] {
  const rt = recordTone(stats);
  const statOf = (k: string) => stats?.stats.find(x => x.key === k);
  const out: { phrase: Phrase; words: string }[] = [];
  for (const p of PHRASES) {
    const usable = p.kind === 'topical' || (p.kind === 'riff' && p.host === 'marcus');
    if (!usable) continue;
    // A one-second cut to a host and back reads as choppy: only offer clips
    // with enough speech to hold the shot.
    if (p.speech.end - p.speech.start < MIN_CLIP_SPEECH) continue;
    let words = p.text.replace(/\[[a-z ]+\]\s*/gi, '');
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

export interface WrittenEpisode {
  topics: ShowTopicInput[];
  /** True when the writer produced the conversation (else: original notes). */
  written: boolean;
}

/** Progress while the writer streams: called after every line it writes
 *  with the episode so far — topics it has started carry their rewritten
 *  lines; `done` = the topics (indexes into `topics`) it has finished. */
export type OnProgress = (sofar: ShowTopicInput[], done: Set<number>) => void;

/** "MAKE A MOVE! They must act NOW!" → "Make a move. They must act now." (acronyms like QB, NFL, DAL stay). */
export function calm(text: string): string {
  const SHOUT = new Set(['NOW', 'YES', 'WOW', 'BIG', 'ALL', 'AND', 'THE', 'OUT', 'NOT', 'WIN', 'WON', 'GO', 'NO', 'SO', 'IS', 'IT']);
  // Runs of shouted words, long shouted words, and shouted short words (not acronyms like QB, NFL, DAL).
  let out = text.replace(/\b[A-Z][A-Z']*(?:\s+[A-Z][A-Z']*)+\b/g, run => (run.split(/\s+/).some(w => w.length >= 4 || SHOUT.has(w)) ? run.toLowerCase() : run));
  out = out.replace(/\b[A-Z][A-Z']{3,}\b/g, w => w.toLowerCase()).replace(/\b[A-Z]{2,3}\b/g, w => (SHOUT.has(w) ? w.toLowerCase() : w));
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const bangs = (out.match(/!/g) ?? []).length;
  if (bangs > 1) { let k = 0; out = out.replace(/!/g, () => (++k === bangs ? '!' : '.')); }
  return out;
}

const debateOf = (t: ShowTopicInput) => t.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
export const hasDebate = (t: ShowTopicInput) => debateOf(t).length > 0;

/**
 * Rewrite the topics' Marcus/Tony lines as one natural conversation,
 * streamed line by line: `onProgress` fires after every line, so the show
 * can voice and play the start while the rest is still being written.
 * Topics the writer doesn't deliver keep their original lines.
 */
export async function writeConversation(
  topics: ShowTopicInput[],
  teamName: string,
  stats?: ShowStatLine | null,
  onProgress?: OnProgress,
): Promise<WrittenEpisode> {
  // No writer at all: the notes are voiced as they are, toned down
  // (no shouted ALL-CAPS words, no exclamation pile-ups).
  const original = { topics: topics.map(t => ({ ...t, exchanges: t.exchanges.map(e => ({ ...e, text: calm(e.text) })) })), written: false };
  if (!ANTHROPIC_API_KEY) return original;
  const liveIdx = topics.flatMap((t, i) => (hasDebate(t) ? [i] : []));
  if (!liveIdx.length) return original;

  const catalog = clipCatalog(stats);
  const clipById = new Map(catalog.map(c => [c.phrase.id, c]));
  const exchanges = new Map(exchangesFor(stats).map(x => [x.id, x]));
  let exchangeUsed = false;
  const notes = liveIdx.map(i => ({
    headline: topics[i].headline,
    ...(topics[i].depth === 'deep' ? { depth: 'deep' } : {}),
    notes: debateOf(topics[i]).map(e => `${e.speakerId === 'stats' ? 'Marcus' : 'Tony'}: ${e.text}`),
  }));
  const clipList = catalog.map(c => `${c.phrase.id} (${c.phrase.host}${c.phrase.angle === 'side' ? ', said to his co-host' : ''}): ${c.words}`).join('\n');
  const user = `Team numbers: ${teamNumbers(teamName, stats)}\n\nProducer's notes for this episode (topics 1–${liveIdx.length}):\n${JSON.stringify(notes, null, 1)}`
    + (clipList ? `\n\nCLIPS (id (host): words):\n${clipList}` : '')
    + (exchanges.size ? `\n\nEXCHANGES (id — when — lines):\n${[...exchanges.values()].map(x => `${x.id} — ${x.when}\n${x.lines.map(p => `  ${p.host === 'marcus' ? 'MARCUS' : 'TONY'}: ${p.text}`).join('\n')}`).join('\n')}` : '');

  // The episode as written so far.
  const written = new Map<number, ShowTopicInput['exchanges']>(); // topic index → lines
  const done = new Set<number>();
  let current = -1; // position in liveIdx being written
  const sofar = () => topics.map((t, i) => (written.has(i) ? { ...t, exchanges: written.get(i)! } : t));

  const take = (jsonLine: string) => {
    const start = jsonLine.indexOf('{');
    if (start < 0) return;
    let l: WriterLine & { t?: unknown };
    try { l = JSON.parse(jsonLine.slice(start, jsonLine.lastIndexOf('}') + 1)); } catch { return; }
    const pos = typeof l.t === 'number' ? l.t - 1 : -1;
    if (pos < 0 || pos >= liveIdx.length || pos < current) return; // out of order: skip
    if (typeof l.exchange === 'string') {
      const x = exchanges.get(l.exchange);
      if (!x || exchangeUsed) return;
      exchangeUsed = true;
      for (let k = Math.max(0, current); k < pos; k++) done.add(liveIdx[k]);
      current = pos;
      const i = liveIdx[pos];
      written.set(i, [...(written.get(i) ?? []), ...x.lines.map(p => ({ speakerId: (p.host === 'marcus' ? 'stats' : 'hottake') as 'stats' | 'hottake', text: p.text, clipId: p.id }))]);
      onProgress?.(sofar(), done);
      return;
    }
    if (l.speaker !== 'marcus' && l.speaker !== 'tony') return;
    const clip = typeof l.clip === 'string' ? clipById.get(l.clip) : undefined;
    if (l.clip && clip?.phrase.host !== l.speaker) return;
    const text = clip ? clip.words : typeof l.text === 'string' ? l.text.trim() : '';
    if (!text) return;
    // Moving on: every topic before this one is finished.
    for (let k = Math.max(0, current); k < pos; k++) done.add(liveIdx[k]);
    current = pos;
    const i = liveIdx[pos];
    const speakerId = l.speaker === 'marcus' ? 'stats' : 'hottake';
    const play = typeof l.play === 'number' && Number.isInteger(l.play) && l.play > 0 ? l.play : undefined;
    written.set(i, [...(written.get(i) ?? []), clip ? { speakerId, text, clipId: clip.phrase.id } : { speakerId, text, ...(play ? { play } : {}) }]);
    onProgress?.(sofar(), done);
  };

  const finish = (): WrittenEpisode => {
    for (const i of liveIdx) done.add(i);
    // A topic the writer never got to (cut off, skipped) is dropped rather
    // than voiced from the producer's notes — those read like a promo.
    const out = sofar().map((t, i) => (liveIdx.includes(i) && !written.has(i) ? { ...t, exchanges: t.exchanges.filter(e => !debateOf({ ...t, exchanges: [e] }).length) } : t));
    onProgress?.(out, done);
    return { topics: out, written: true };
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
    // Server-sent events → text deltas → one spoken line per completed line.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let sse = '';
    let text = '';
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
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
    if (!written.size) throw new Error('writer returned no lines');
    return finish();
  } catch (err) {
    console.warn('Spotlight show writer failed:', err instanceof Error ? err.message : err);
    // Keep whatever it wrote; the rest keeps the original lines.
    return written.size ? finish() : original;
  }
}
