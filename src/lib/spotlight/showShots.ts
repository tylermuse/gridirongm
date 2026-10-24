/**
 * Team Spotlight video show — shot planning for the voiced lines.
 *
 * Every voiced line (no lip sync) plays over either the topic graphic or
 * the over-the-shoulder listening shot. Choosing per line made the show
 * choppy: a two-word "Right." cut away and back, banter bounced between
 * angles. So shots are planned over the whole run of lines:
 *  - a topic always opens on its graphic;
 *  - a short line never cuts: it stays on whatever shot is up;
 *  - lines with nothing to show go to the listening shot only when there's
 *    enough of them to hold it (a quick aside stays on the graphic);
 *  - in the listening shot the camera faces whoever isn't talking (shot /
 *    reverse shot), but a short interjection doesn't flip it;
 *  - nothing holds too long: once the same picture (same graphic, or the
 *    same listening angle) has run ~MAX_HOLD words (~9s), the next full
 *    line cuts to the other shot.
 */
import type { Host } from './showScript';

export interface ShotLine {
  /** A voiced line, or anything else (an on-camera clip, a transition). */
  kind: 'tts' | 'other';
  speaker: Host;
  words: number;
  topicIdx: number;
  /** Nothing in the line to put on screen (banter, a reaction). */
  bare: boolean;
  /** What the graphic would show for this line (player, unit, standings…);
   *  a new look on the graphic counts as a new picture. */
  look?: string;
}

export type Shot =
  | { kind: 'gfx' }
  | { kind: 'ots'; listener: Host; take: number }
  | { kind: 'cam' };

/** A line this short never gets its own cut. */
export const SHORT_LINE = 7;
/** Words of back-and-forth needed before cutting to the hosts. */
export const OTS_MIN_RUN = 18;
/** Words one picture may hold before the next full line cuts away (~9s). */
export const MAX_HOLD = 25;

const other = (h: Host): Host => (h === 'marcus' ? 'tony' : 'marcus');

export function planShots(lines: ShotLine[]): Shot[] {
  const out: Shot[] = [];
  const seenTopic = new Set<number>();
  let prev: Shot | null = null;
  let prevLook: string | undefined;
  let held = 0; // words the current picture has been up
  let takes = 0;
  lines.forEach((l, i) => {
    let shot: Shot;
    if (l.kind !== 'tts') {
      shot = { kind: 'cam' };
    } else if (!seenTopic.has(l.topicIdx)) {
      shot = { kind: 'gfx' };
    } else if (l.words < SHORT_LINE && prev && prev.kind !== 'cam') {
      shot = prev;
    } else if (!l.bare) {
      shot = { kind: 'gfx' };
    } else {
      // How much back-and-forth is coming (this line and the bare ones after it).
      let run = 0;
      for (let k = i; k < lines.length && lines[k].kind === 'tts' && lines[k].bare && lines[k].topicIdx === l.topicIdx; k++) run += lines[k].words;
      if (prev?.kind === 'gfx' && run < OTS_MIN_RUN) shot = prev;
      else {
        const listener = other(l.speaker);
        shot = prev?.kind === 'ots' && prev.listener === listener ? prev : { kind: 'ots', listener, take: takes++ % 2 };
      }
    }
    if (l.kind === 'tts') {
      const samePicture = (s: Shot) => !!prev && s.kind === prev.kind
        && (s.kind !== 'gfx' || l.look === prevLook)
        && (s.kind !== 'ots' || (prev.kind === 'ots' && s.listener === prev.listener));
      const opening = !seenTopic.has(l.topicIdx);
      if (!opening && l.words >= SHORT_LINE && samePicture(shot) && held + l.words > MAX_HOLD) {
        shot = shot.kind === 'gfx'
          ? { kind: 'ots', listener: other(l.speaker), take: takes++ % 2 }
          : { kind: 'gfx' };
      }
      held = samePicture(shot) ? held + l.words : l.words;
      if (shot.kind === 'gfx') prevLook = l.look;
      seenTopic.add(l.topicIdx);
    } else {
      held = 0;
    }
    out.push(shot);
    prev = shot;
  });
  return out;
}
