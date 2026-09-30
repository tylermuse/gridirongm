/**
 * Team Spotlight video show — script → timeline of segments.
 *
 * Three kinds of segments:
 *  - `clip`   fixed lines (intro / transitions / outro): pre-rendered,
 *             lip-synced clips in /public/show, played with their own audio.
 *  - `phrase` reusable on-camera reactions from the phrase bank, chosen from
 *             the team's real stats (optionally with a spoken rank slot).
 *             At most one per topic, so each topic plays as one long
 *             graphic shot with a single cut to a host.
 *  - `tts`    the episode's generated lines, voiced per episode with
 *             ElevenLabs and played over a stat graphic (voiceover).
 *
 * Nobody is ever shown listening: the screen is either the host who is
 * talking or a graphic.
 *
 * Shared by the API route (which voices `tts` segments) and the client
 * player. Deterministic for a given input so cached episodes are stable.
 */
import { PHRASES, type Phrase, type PhraseKind } from './phrases';
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
  exchanges: { speakerId: string; text: string }[];
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
const MAX_PHRASES_PER_TOPIC = 1;

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

function phraseSegment(p: Phrase, rank?: number): ShowSegment {
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

class PhrasePicker {
  private used = new Set<string>();
  private glueTurn = 0;

  constructor(private stats: ShowStatLine | null | undefined) {}

  private pick(pred: (p: Phrase) => boolean): Phrase | null {
    const p = PHRASES.find(x => !this.used.has(x.id) && pred(x));
    if (p) this.used.add(p.id);
    return p ?? null;
  }

  /** A host reacting on camera to a stat: prefer the slot version (says the rank). */
  stat(host: Host, key: ShowStatKey): ShowSegment | null {
    const st = this.stats?.stats.find(s => s.key === key);
    if (!st) return null;
    const tone = rankTone(st.rank, st.of);
    const slotted = this.pick(p => p.host === host && p.stat === key && p.tone === tone && !!p.slot);
    if (slotted) return phraseSegment(slotted, st.rank);
    const plain = this.pick(p => p.host === host && p.stat === key && p.tone === tone && !p.slot);
    return plain ? phraseSegment(plain) : null;
  }

  record(host: Host): ShowSegment | null {
    if (!this.stats) return null;
    const [w, l] = this.stats.record.split('-').map(Number);
    const pct = w + l > 0 ? w / (w + l) : 0.5;
    const tone = pct >= 0.6 ? 'good' : pct <= 0.4 ? 'bad' : 'mid';
    const p = this.pick(x => x.host === host && x.kind === 'record' && x.tone === tone);
    return p ? phraseSegment(p) : null;
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

export function buildShowScript(
  topics: ShowTopicInput[],
  teamName: string,
  stats?: ShowStatLine | null,
): ShowSegment[] {
  const segs: ShowSegment[] = [];
  const picker = new PhrasePicker(stats);
  const coveredStats = new Set<ShowStatKey>();

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

  topics.forEach((topic, i) => {
    const debate = topic.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
    if (debate.length === 0) return;
    if (i > 0) {
      segs.push({
        ...clip(TRANSITIONS[i % TRANSITIONS.length]),
        voiceover: { topicIdx: i, headline: topic.headline, icon: topic.icon },
      });
    }

    let onCamera = 0;
    let lastSpeaker: Host = 'marcus';
    const spoke = new Set<Host>();
    debate.forEach(ex => {
      const speaker: Host = ex.speakerId === 'stats' ? 'marcus' : 'tony';
      lastSpeaker = speaker;
      spoke.add(speaker);
      segs.push({
        kind: 'tts', speaker, text: ex.text, visual: 'graphic',
        topicIdx: i, headline: topic.headline, icon: topic.icon,
      });
      if (onCamera >= MAX_PHRASES_PER_TOPIC) return;

      // The other host reacts on camera to the stat just cited (saying the
      // real rank) if it hasn't been covered yet this episode.
      const respondent = other(speaker);
      for (const key of statsMentioned(ex.text)) {
        if (coveredStats.has(key)) continue;
        const reaction = picker.stat(respondent, key);
        if (reaction) { coveredStats.add(key); segs.push(reaction); onCamera++; break; }
      }
    });
    // No stat reaction? Close a real back-and-forth with a short on-camera
    // reaction from whoever didn't have the last word.
    const respondent = other(lastSpeaker);
    // …but not Marcus right before his own on-camera outro.
    const lastTopic = topics.slice(i + 1).every(t => !t.exchanges.some(e => e.speakerId === 'stats' || e.speakerId === 'hottake'));
    if (onCamera === 0 && debate.length >= 2 && !(lastTopic && respondent === 'marcus')) {
      const glue = picker.glue(respondent, spoke.has(respondent));
      if (glue) segs.push(glue);
    }
  });

  segs.push(clip('marcus_outro'));
  segs.push(clip('tony_outro'));
  return segs;
}

/** Timeline entry returned by /api/spotlight-show: TTS segments carry their
 *  slice of the concatenated episode audio. */
export type TimedShowSegment = ShowSegment & { audioStart?: number; audioDuration?: number };
