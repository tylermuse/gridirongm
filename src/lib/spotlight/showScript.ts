/**
 * Team Spotlight video show — script → timeline of segments.
 *
 * Three kinds of segments:
 *  - `clip`   fixed lines (intro / transitions / outro): pre-rendered,
 *             lip-synced clips in /public/show, played with their own audio.
 *  - `phrase` reusable on-camera lines from the phrase bank, chosen from
 *             the team's real stats (optionally with a spoken rank slot).
 *             Each topic gets one on-camera back-and-forth (~10–14s): a
 *             host's stat riff, the other's reply, a sign-off.
 *  - `tts`    the episode's generated lines, voiced per episode with
 *             ElevenLabs and played over a stat graphic (voiceover).
 *
 * Nobody is ever shown listening: the screen is either the host who is
 * talking or a graphic.
 *
 * Shared by the API route (which voices `tts` segments) and the client
 * player. Deterministic for a given input so cached episodes are stable.
 */
import { PHRASES, topicTagsIn, type Phrase, type PhraseKind, type PhraseTone } from './phrases';
import { rankTone, statsMentioned, type ShowStatKey, type ShowStatLine } from './teamStats';

export type Host = 'marcus' | 'tony';

export type ShowClipId =
  | 'marcus_intro'
  | 'marcus_transition_move_on'
  | 'marcus_transition_shifting_gears'
  | 'marcus_transition_keep_moving'
  | 'marcus_outro'
  | 'tony_intro'
  | 'tony_transition_next_one'
  | 'tony_outro';

/** `speech`: where the words start/end inside the file (s). Playback trims
 *  the silence around them so the conversation doesn't stall between shots. */
export type SpeechSpan = { start: number; end: number };

export const SHOW_CLIPS: Record<ShowClipId, { src: string; speaker: Host; text: string; speech: SpeechSpan }> = {
  marcus_intro: { src: '/show/marcus_intro.mp4', speaker: 'marcus', text: "Welcome back to the Team Spotlight. I'm Marcus Cole, alongside Tony Blaze.", speech: { start: 0.06, end: 4.0 } },
  marcus_transition_move_on: { src: '/show/marcus_transition_move_on.mp4', speaker: 'marcus', text: "Alright, let's move on. Next topic.", speech: { start: 0.0, end: 2.42 } },
  marcus_transition_shifting_gears: { src: '/show/marcus_transition_shifting_gears.mp4', speaker: 'marcus', text: 'Okay, shifting gears here.', speech: { start: 0.02, end: 1.08 } },
  marcus_transition_keep_moving: { src: '/show/marcus_transition_keep_moving.mp4', speaker: 'marcus', text: "Let's keep it moving, Tony.", speech: { start: 0.0, end: 1.1 } },
  marcus_outro: { src: '/show/marcus_outro.mp4', speaker: 'marcus', text: "And that's the show. Thanks for tuning in to the Team Spotlight. We'll see you next time.", speech: { start: 0.0, end: 3.56 } },
  tony_intro: { src: '/show/tony_intro.mp4', speaker: 'tony', text: "Let's go! I've got a lot to say about this team. Let's not waste any time.", speech: { start: 0.2, end: 3.38 } },
  tony_transition_next_one: { src: '/show/tony_transition_next_one.mp4', speaker: 'tony', text: "Next one. Let's go.", speech: { start: 0.0, end: 1.06 } },
  tony_outro: { src: '/show/tony_outro.mp4', speaker: 'tony', text: "Stay loud, stay passionate, and keep grinding. This is Tony Blaze, we're out!", speech: { start: 0.0, end: 3.68 } },
};

export const HOSTS: Record<Host, { name: string; title: string }> = {
  marcus: { name: 'Marcus Cole', title: 'Analyst' },
  tony: { name: 'Tony Blaze', title: 'Hot Takes' },
};

export type ShowSegment =
  | {
      kind: 'clip';
      clip: ShowClipId;
      speaker: Host;
      text: string;
      speech: SpeechSpan;
      /** Play only the clip's audio, over this topic's graphic (topic
       *  transitions: no 1-second shot of a host, the new topic wipes in). */
      voiceover?: { topicIdx: number; headline: string; icon: string };
    }
  | {
      kind: 'phrase';
      phraseId: string;
      speaker: Host;
      src: string;
      /** Caption text with the rank filled in. */
      text: string;
      /** Stat this phrase is about → on-screen stat bug. */
      stat?: ShowStatKey;
      slot?: { start: number; end: number; rank: number };
      speech: SpeechSpan;
    }
  | {
      kind: 'tts';
      speaker: Host;
      text: string;
      visual: 'title' | 'graphic';
      /** Topic this line belongs to (-1 for the show open). */
      topicIdx: number;
      headline: string;
      icon: string;
    };

export interface ShowTopicInput {
  headline: string;
  icon: string;
  /** `clipId`: the writer chose a pre-recorded on-camera line (a topical
   *  phrase) for this turn; `text` is that phrase's words. */
  exchanges: { speakerId: string; text: string; clipId?: string }[];
}

// Mirrors the transition rotation in /api/spotlight-audio's buildPodcastScript.
const TRANSITIONS: ShowClipId[] = [
  'marcus_transition_move_on',
  'marcus_transition_shifting_gears',
  'marcus_transition_keep_moving',
  'tony_transition_next_one',
];

/** Max on-camera bank phrases per topic. One keeps the topic's graphic on
 *  screen as a long, continuous shot instead of cutting every line. */

const other = (h: Host): Host => (h === 'marcus' ? 'tony' : 'marcus');

function clip(id: ShowClipId): Extract<ShowSegment, { kind: 'clip' }> {
  const c = SHOW_CLIPS[id];
  return { kind: 'clip', clip: id, speaker: c.speaker, text: c.text, speech: c.speech };
}

function ordinalText(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function phraseSegment(p: Phrase, rank?: number): Extract<ShowSegment, { kind: 'phrase' }> {
  const withRank = rank != null ? p.text.replace('{rank}', ordinalText(rank)) : p.text.replace('{rank}', '');
  return {
    kind: 'phrase',
    phraseId: p.id,
    speaker: p.host,
    src: p.src,
    text: withRank.charAt(0).toUpperCase() + withRank.slice(1),
    stat: p.stat,
    slot: p.slot && rank != null ? { ...p.slot, rank } : undefined,
    speech: p.speech,
  };
}

/** Small deterministic PRNG so an episode's picks vary with its content but
 *  stay stable for caching. */
function seededRandom(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PhrasePicker {
  private used = new Set<string>();
  private glueTurn = 0;

  constructor(private stats: ShowStatLine | null | undefined, private rand: () => number = Math.random) {}

  private pick(pred: (p: Phrase) => boolean): Phrase | null {
    const pool = PHRASES.filter(x => !this.used.has(x.id) && pred(x));
    if (!pool.length) return null;
    const p = pool[Math.floor(this.rand() * pool.length)];
    this.used.add(p.id);
    return p;
  }

  private statLine(key: ShowStatKey) {
    const st = this.stats?.stats.find(s => s.key === key);
    return st ? { st, tone: rankTone(st.rank, st.of) } : null;
  }

  /** Long on-camera take on a stat (6–8s), saying the real rank. */
  riff(host: Host, key: ShowStatKey): Extract<ShowSegment, { kind: 'phrase' }> | null {
    const s = this.statLine(key);
    if (!s) return null;
    const p = this.pick(x => x.host === host && x.kind === 'riff' && x.stat === key && x.tone === s.tone);
    return p ? phraseSegment(p, s.st.rank) : null;
  }

  /** Short on-camera reaction to a stat: prefer the slot version (says the rank). */
  stat(host: Host, key: ShowStatKey): Extract<ShowSegment, { kind: 'phrase' }> | null {
    const s = this.statLine(key);
    if (!s) return null;
    const base = (x: Phrase) => x.host === host && x.kind === 'stat' && x.stat === key && x.tone === s.tone;
    const slotted = this.pick(x => base(x) && !!x.slot);
    if (slotted) return phraseSegment(slotted, s.st.rank);
    const plain = this.pick(x => base(x) && !x.slot);
    return plain ? phraseSegment(plain) : null;
  }

  record(host: Host): ShowSegment | null {
    const tone = this.recordTone();
    if (!tone) return null;
    const p = this.pick(x => x.host === host && x.kind === 'record' && x.tone === tone);
    return p ? phraseSegment(p) : null;
  }

  /** A specific phrase the writer chose (once per episode, right host). */
  byId(host: Host, id: string): Extract<ShowSegment, { kind: 'phrase' }> | null {
    if (this.used.has(id)) return null;
    const p = PHRASES.find(x => x.id === id && x.host === host);
    if (!p) return null;
    this.used.add(id);
    return phraseSegment(p);
  }

  /** A topical line on one of these subjects, true for this team: its tone
   *  matches the team's record (or the stat it's about). */
  topical(host: Host, tags: string[]): Extract<ShowSegment, { kind: 'phrase' }> | null {
    if (!tags.length) return null;
    const recordTone = this.recordTone();
    const p = this.pick(x => {
      if (x.host !== host || x.kind !== 'topical' || x.writerOnly || !x.tags?.some(t => tags.includes(t))) return false;
      if (x.stat) {
        const s = this.statLine(x.stat);
        return !!s && (!x.tone || s.tone === x.tone);
      }
      return !x.tone || x.tone === recordTone;
    });
    return p ? phraseSegment(p) : null;
  }

  private recordTone(): PhraseTone | null {
    if (!this.stats) return null;
    const [w, l] = this.stats.record.split('-').map(Number);
    const pct = w + l > 0 ? w / (w + l) : 0.5;
    return pct >= 0.6 ? 'good' : pct <= 0.4 ? 'bad' : 'mid';
  }

  /** First available phrase of these kinds, in order. */
  kinds(host: Host, kinds: PhraseKind[]): ShowSegment | null {
    for (const k of kinds) {
      const p = this.pick(x => x.host === host && x.kind === k);
      if (p) return phraseSegment(p);
    }
    return null;
  }

  /** Short connective reaction, rotated so episodes vary line to line.
   *  `rebut`: the host already made a point this topic and just got
   *  answered, so they push back rather than agree. */
  glue(host: Host, rebut = false): ShowSegment | null {
    const order: PhraseKind[] = rebut
      ? ['disagree', 'skeptical', 'disagree', 'pivot']
      : host === 'tony'
        ? ['agree', 'hype', 'pivot', 'agree', 'hype', 'skeptical']
        : ['agree', 'pivot', 'skeptical', 'agree', 'pivot'];
    for (let k = 0; k < order.length; k++) {
      const kind = order[(this.glueTurn + k) % order.length];
      const p = this.pick(x => x.host === host && x.kind === kind);
      if (p) { this.glueTurn++; return phraseSegment(p); }
    }
    return null;
  }
}

const onCamera = (x: ShowSegment) => x.kind === 'phrase' || (x.kind === 'clip' && !x.voiceover);

/** Drop any on-camera phrase that would sit next to another on-camera shot
 *  of the same host (a jump cut): a sign-off goes first, else the later
 *  phrase; a fixed clip (intro/outro) always stays. */
function removeJumpCuts(segs: ShowSegment[]): ShowSegment[] {
  const out = [...segs];
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1], b = out[k];
    if (!onCamera(a) || !onCamera(b) || a.speaker !== b.speaker) continue;
    const aButton = a.kind === 'phrase' && PHRASES.find(p => p.id === a.phraseId)?.kind === 'button';
    if (b.kind === 'phrase' && !aButton) out.splice(k, 1);
    else if (a.kind === 'phrase') out.splice(k - 1, 1);
    else continue; // two fixed clips — never generated back to back
    k = Math.max(0, k - 2);
  }
  return out;
}

export function buildShowScript(
  topics: ShowTopicInput[],
  teamName: string,
  stats?: ShowStatLine | null,
): ShowSegment[] {
  const segs: ShowSegment[] = [];
  const picker = new PhrasePicker(stats, seededRandom(JSON.stringify([teamName, stats?.record, topics.map(t => t.headline)])));
  const coveredStats = new Set<ShowStatKey>();
  let exchangeNo = 0;

  segs.push(clip('marcus_intro'));
  // The team name changes every episode, so this half of the original intro
  // is TTS over a title card instead of part of the lip-synced clip.
  segs.push({
    kind: 'tts', speaker: 'marcus', text: `And today we're breaking down the ${teamName}.`,
    visual: 'title', topicIdx: -1, headline: teamName, icon: '🎬',
  });
  segs.push(clip('tony_intro'));
  // Marcus answers Tony's intro (never two shots of the same host back to
  // back — that's a jump cut).
  const record = picker.record('marcus');
  if (record) segs.push(record);

  /** An on-camera back-and-forth (~10–14s): `a` takes the stat (long riff,
   *  real rank), `b` replies, `a` gets the last word. */
  const statExchange = (a: Host, key: ShowStatKey): ShowSegment[] => {
    const take = picker.riff(a, key) ?? picker.stat(a, key);
    if (!take) return [];
    const b = other(a);
    const tone = stats?.stats.find(s => s.key === key);
    // Marcus mostly agrees with a bad-stat rant and pushes back on hype;
    // Tony mostly agrees with bad news and pushes back on caution.
    const agree = (tone && rankTone(tone.rank, tone.of) === 'bad') !== (exchangeNo++ % 3 === 2);
    const reply = picker.kinds(b, agree ? ['reply_agree', 'agree'] : ['reply_push', 'disagree', 'skeptical']);
    const button = reply ? picker.kinds(a, ['button']) : null;
    return [take, reply, button].filter((x): x is ShowSegment => !!x);
  };

  /** For a topic with no stat to riff on: Tony's take, Marcus's answer. */
  const debateExchange = (): ShowSegment[] => {
    const open = picker.kinds('tony', ['open']);
    const answer = open ? picker.kinds('marcus', ['answer', 'skeptical']) : null;
    return [open, answer].filter((x): x is ShowSegment => !!x);
  };

  // When the writer placed pre-recorded lines itself, trust its choices;
  // otherwise drop in one topical line per topic where a line's subject
  // matches (the draft, trades, the coaching…).
  const writerClips = topics.some(t => t.exchanges.some(e => !!e.clipId));

  topics.forEach((topic, i) => {
    const debate = topic.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
    if (debate.length === 0) return;
    if (i > 0) {
      segs.push({
        ...clip(TRANSITIONS[i % TRANSITIONS.length]),
        voiceover: { topicIdx: i, headline: topic.headline, icon: topic.icon },
      });
    }

    let exchanged = false;
    let topicalDone = writerClips;
    const tryExchange = (text: string, speaker: Host) => {
      if (exchanged) return;
      // The other host takes the stat just cited (if not covered yet this
      // episode) and the two go back and forth on camera.
      for (const key of statsMentioned(text)) {
        if (coveredStats.has(key)) continue;
        const run = statExchange(other(speaker), key);
        if (run.length) { coveredStats.add(key); segs.push(...run); exchanged = true; break; }
      }
      // No stat in play? After Marcus's first line, Tony takes the topic on
      // camera and Marcus answers.
      if (!exchanged && speaker === 'marcus' && !debate.some(d => statsMentioned(d.text).some(k => !coveredStats.has(k)))) {
        const run = debateExchange();
        if (run.length) { segs.push(...run); exchanged = true; }
      }
    };
    debate.forEach(ex => {
      const speaker: Host = ex.speakerId === 'stats' ? 'marcus' : 'tony';
      if (ex.clipId) {
        const chosen = picker.byId(speaker, ex.clipId);
        if (chosen) { segs.push(chosen); return; }
      }
      segs.push({
        kind: 'tts', speaker, text: ex.text, visual: 'graphic',
        topicIdx: i, headline: topic.headline, icon: topic.icon,
      });
      const before = segs.length;
      tryExchange(ex.text, speaker);
      if (segs.length === before && !topicalDone) {
        const line = picker.topical(other(speaker), topicTagsIn(ex.text));
        if (line) { segs.push(line); topicalDone = true; }
      }
    });
  });

  segs.push(clip('marcus_outro'));
  segs.push(clip('tony_outro'));
  return removeJumpCuts(segs);
}

/** Timeline entry returned by /api/spotlight-show: TTS segments carry their
 *  slice of the concatenated episode audio. */
export type TimedShowSegment = ShowSegment & {
  /** Which voiced block (title, then one per topic) holds this line. */
  audioIndex?: number;
  /** Seconds inside that block. */
  audioStart?: number;
  audioDuration?: number;
};
