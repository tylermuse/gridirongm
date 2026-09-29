/**
 * Team Spotlight video show — script → timeline of segments.
 *
 * Fixed lines (intro/transitions/outro) are pre-rendered, lip-synced video
 * clips in /public/show and play with their own baked-in audio. Everything
 * else is generated per episode with ElevenLabs TTS and plays over a topic
 * graphic or the *other* host's silent reaction loop — so we never need
 * per-episode lip sync.
 *
 * Shared by the API route (which generates TTS for `tts` segments) and the
 * client player (which sequences clips/audio/visuals).
 */

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

export const SHOW_CLIPS: Record<ShowClipId, { src: string; speaker: Host; text: string }> = {
  marcus_intro: { src: '/show/marcus_intro.mp4', speaker: 'marcus', text: "Welcome back to the Team Spotlight. I'm Marcus Cole, alongside Tony Blaze." },
  marcus_transition_move_on: { src: '/show/marcus_transition_move_on.mp4', speaker: 'marcus', text: "Alright, let's move on. Next topic." },
  marcus_transition_shifting_gears: { src: '/show/marcus_transition_shifting_gears.mp4', speaker: 'marcus', text: 'Okay, shifting gears here.' },
  marcus_transition_keep_moving: { src: '/show/marcus_transition_keep_moving.mp4', speaker: 'marcus', text: "Let's keep it moving, Tony." },
  marcus_outro: { src: '/show/marcus_outro.mp4', speaker: 'marcus', text: "And that's the show. Thanks for tuning in to the Team Spotlight. We'll see you next time." },
  tony_intro: { src: '/show/tony_intro.mp4', speaker: 'tony', text: "Let's go! I've got a lot to say about this team. Let's not waste any time." },
  tony_transition_next_one: { src: '/show/tony_transition_next_one.mp4', speaker: 'tony', text: "Next one. Let's go." },
  tony_outro: { src: '/show/tony_outro.mp4', speaker: 'tony', text: 'Stay loud, stay passionate, and keep grinding. This is Tony Blaze, we\'re out!' },
};

/** Silent "listening" loops (ping-ponged, no audio track). */
export const REACTION_CLIPS: Record<Host, string> = {
  marcus: '/show/marcus_react_skeptical.mp4',
  tony: '/show/tony_react_nod.mp4',
};

export const HOSTS: Record<Host, { name: string; title: string }> = {
  marcus: { name: 'Marcus Cole', title: 'Analyst' },
  tony: { name: 'Tony Blaze', title: 'Hot Takes' },
};

export type ShowSegment =
  | { kind: 'clip'; clip: ShowClipId; speaker: Host; text: string }
  | {
      kind: 'tts';
      speaker: Host;
      text: string;
      /** What to put on screen while this line plays. */
      visual: 'title' | 'graphic' | 'reaction';
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

function clip(id: ShowClipId): ShowSegment {
  const c = SHOW_CLIPS[id];
  return { kind: 'clip', clip: id, speaker: c.speaker, text: c.text };
}

export function buildShowScript(topics: ShowTopicInput[], teamName: string): ShowSegment[] {
  const segs: ShowSegment[] = [];

  segs.push(clip('marcus_intro'));
  // The team name changes every episode, so this half of the original intro
  // is TTS over a title card instead of part of the lip-synced clip.
  segs.push({
    kind: 'tts',
    speaker: 'marcus',
    text: `And today we're breaking down the ${teamName}.`,
    visual: 'title',
    topicIdx: -1,
    headline: teamName,
    icon: '🎬',
  });
  segs.push(clip('tony_intro'));

  topics.forEach((topic, i) => {
    const debate = topic.exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
    if (debate.length === 0) return;
    if (i > 0) segs.push(clip(TRANSITIONS[i % TRANSITIONS.length]));

    debate.forEach((ex, j) => {
      // First line of a topic sits on the topic graphic; after that we cut
      // to the listener's reaction, returning to the graphic every 3rd line
      // so long topics don't hold one shot too long.
      const visual: 'graphic' | 'reaction' = j === 0 || j % 3 === 0 ? 'graphic' : 'reaction';
      segs.push({
        kind: 'tts',
        speaker: ex.speakerId === 'stats' ? 'marcus' : 'tony',
        text: ex.text,
        visual,
        topicIdx: i,
        headline: topic.headline,
        icon: topic.icon,
      });
    });
  });

  segs.push(clip('marcus_outro'));
  segs.push(clip('tony_outro'));
  return segs;
}

/** Timeline entry returned by /api/spotlight-show: TTS segments carry their
 *  slice of the concatenated episode audio. */
export type TimedShowSegment = ShowSegment & { audioStart?: number; audioDuration?: number };
