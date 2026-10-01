/**
 * Team Spotlight video show — the writers' room.
 *
 * The Spotlight topics are written as debate-show copy (punchy, CAPS, a
 * stat in every line). Read aloud that sounds like two bots trading lines.
 * Before voicing an episode, Claude rewrites each topic's notes as the
 * transcript of a real, unscripted conversation between the two hosts —
 * reacting to each other, conceding, interrupting, calling back — using
 * only the facts in the notes. Server-only.
 *
 * Falls back to the original topics on any failure (no key, timeout, bad
 * JSON), so the show always plays.
 */
import type { ShowTopicInput } from './showScript';
import type { ShowStatLine } from './teamStats';
import { ordinal } from './teamStats';
import { PHRASES } from './phrases';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SPOTLIGHT_SHOW_WRITER_MODEL || 'claude-sonnet-5-5';
const TIMEOUT_MS = 45_000;

export const WRITER_SYSTEM_PROMPT = `You are the writer for "Team Spotlight", a two-person football talk show inside a football GM simulation game. You turn the producer's notes for each topic into the transcript of a real, unscripted conversation between the two hosts. The test: a listener who hears it voiced should believe these are two real people who know each other well, thinking out loud on live TV — not a script, not an AI.

THE HOSTS
- Marcus Cole: the analyst. Measured, precise, dry sense of humor. Likes one telling number more than five. Will concede a good point, then narrow it. Rarely raises his voice.
- Tony Blaze: the emotional one. Big opinions, but a real football mind, not a caricature. Argues from what he sees on film and from gut feel. Gets louder when he's sure, laughs at himself when he's wrong.
- They've worked together for years. They tease each other, finish or cut off each other's thoughts, and remember what the other said earlier in the episode.

HOW REAL PEOPLE TALK (do this)
- React to the exact thing the other person just said. Quote a phrase back, push on one word, answer the question they asked.
- Mostly short turns (one or two sentences). Every so often one host gets a longer run where he works through an idea.
- Let people interrupt or get cut off with an em dash ("you're telling me—" / "No, no, let me finish."), restart a sentence, or trail off.
- Plain spoken English with contractions. Light fillers where a real person would use them ("I mean", "look", "right", "yeah, but") — sparingly, never one per line.
- Disagreement has reasons and movement: someone concedes part of a point, changes his mind a little, or they land on a sharper question than they started with.
- Specifics over adjectives. A concrete detail beats "they're struggling".
- Numbers sparingly and the way people say them out loud ("about twenty-five a game", "seventh in the league"). At most one number per line, and only numbers that appear in the notes or the team numbers.
- Call back to earlier topics when it's natural ("two minutes ago you wanted him benched").

AVOID (these read as AI)
- Catchphrases and announcer clichés ("buckle up", "make no mistake", "let that sink in", "at the end of the day", "here's the thing").
- "It's not X, it's Y" constructions, lists of three, rhetorical-question chains, and every line ending on an exclamation point.
- ALL-CAPS shouting, hashtags, emojis.
- Summarizing the topic, restating the headline, or wrapping each topic with a neat moral.
- Each host announcing his own personality ("as the numbers guy…").

PERFORMANCE CUES
The audio is voiced with ElevenLabs v3, which reads bracketed cues. Use them only where a real person would actually do it, at most one in every three lines: [laughs], [chuckles], [sighs], [scoffs], [exhales], [pause].

FACTS
Use only facts, names and numbers from the notes and the team numbers. Do not invent stats, injuries, trades, quotes or events. Refer to teams as "they" or by name — the hosts are neutral, never "we". When the notes name a player or a position group, keep naming it plainly (the show puts that player's or unit's stats on screen when it hears the name).

ON-CAMERA LINES
The hosts have pre-recorded lines (listed with the notes as CLIPS). The show cuts to the host on camera for these, so they're valuable — but only when one is exactly what that host would say at that moment. Use a clip by id instead of writing the line: {"speaker":"tony","clip":"tony_t_draft_now"}. Rules:
- The speaker must match the clip's host, and the words must be true for this team (don't use a "they're rolling" clip for a team on a losing streak, or a contract clip when no contract is in the notes).
- The next line has to respond to the clip's actual words, just as it would to a line you wrote.
- Every on-camera clip is a cut to a real shot of the host, which makes the show feel live — so lean on them: in each topic of four or more lines, use two or three clips (the short reactions are easy fits: a concession, a push-back, "say that again"). Never use one that doesn't fit, and never the same clip twice in an episode.
- Write your own lines around a clip so the clip lands naturally (set up the subject it's about, then answer what it says).

OUTPUT
Return JSON only: {"topics":[{"lines":[{"speaker":"marcus"|"tony","text":"..."} or {"speaker":"marcus"|"tony","clip":"<id>"}]}]}
- Same number of topics, same order, as the notes.
- The first topic is a quick cold open: 2–3 lines.
- Other topics: 4–7 lines, alternating speakers most of the time (a host can occasionally get two in a row when he's cut off and comes back).`;

function teamNumbers(teamName: string, stats?: ShowStatLine | null): string {
  if (!stats) return `${teamName}.`;
  const parts = stats.stats.map(s => `${s.label} ${s.value} (${ordinal(s.rank)} of ${s.of})`);
  return `${teamName}, record ${stats.record}. ${parts.join('; ')}.`;
}

interface WriterLine { speaker: string; text?: string; clip?: string }
interface WriterOutput { topics: { lines: WriterLine[] }[] }

/** Pre-recorded on-camera lines the writer may place. */
const CLIPS = PHRASES.filter(p => p.kind === 'topical');
const CLIP_LIST = CLIPS.map(p => `${p.id} (${p.host}): ${p.text}`).join('\n');

function lineOk(l: WriterLine): boolean {
  if (l.speaker !== 'marcus' && l.speaker !== 'tony') return false;
  if (typeof l.clip === 'string') return CLIPS.some(c => c.id === l.clip && c.host === l.speaker);
  return typeof l.text === 'string' && l.text.trim().length > 0;
}

function valid(out: unknown, n: number): out is WriterOutput {
  const o = out as WriterOutput;
  return !!o && Array.isArray(o.topics) && o.topics.length === n
    && o.topics.every(t => Array.isArray(t.lines) && t.lines.length > 0
      && t.lines.every(l => !!l && typeof l === 'object' && typeof l.speaker === 'string'));
}

/** Rewrite each topic's Marcus/Tony lines as natural conversation. */
export async function writeConversation(
  topics: ShowTopicInput[],
  teamName: string,
  stats?: ShowStatLine | null,
): Promise<ShowTopicInput[]> {
  if (!ANTHROPIC_API_KEY) return topics;
  const debateOf = (t: ShowTopicInput) => t.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
  const live = topics.filter(t => debateOf(t).length > 0);
  if (!live.length) return topics;

  const notes = live.map(t => ({
    headline: t.headline,
    notes: debateOf(t).map(e => `${e.speakerId === 'stats' ? 'Marcus' : 'Tony'}: ${e.text}`),
  }));
  const user = `Team numbers: ${teamNumbers(teamName, stats)}\n\nProducer's notes for this episode:\n${JSON.stringify(notes, null, 1)}${CLIP_LIST ? `\n\nCLIPS (id (host): words):\n${CLIP_LIST}` : ''}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 6000, system: WRITER_SYSTEM_PROMPT, messages: [{ role: 'user', content: user }] }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`writer ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = j.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!valid(json, live.length)) throw new Error('writer returned an unexpected shape');

    let k = 0;
    return topics.map(t => {
      if (!debateOf(t).length) return t;
      // Drop any line that doesn't check out (unknown clip, wrong host).
      const lines = json.topics[k++].lines.filter(lineOk);
      if (!lines.length) return t;
      return {
        ...t,
        exchanges: lines.map(l => {
          const speakerId = l.speaker === 'marcus' ? 'stats' : 'hottake';
          const clip = l.clip ? CLIPS.find(c => c.id === l.clip) : undefined;
          return clip ? { speakerId, text: clip.text, clipId: clip.id } : { speakerId, text: (l.text ?? '').trim() };
        }),
      };
    });
  } catch (err) {
    console.warn('Spotlight show writer failed, using original lines:', err instanceof Error ? err.message : err);
    return topics;
  }
}
