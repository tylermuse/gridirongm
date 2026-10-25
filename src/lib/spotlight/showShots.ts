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
 *  - nothing holds too long: once the same graphic has run ~MAX_HOLD
 *    words (~9s), the next full line cuts to the listening shot.
 *
 * The listening shot is a cutaway, not the default picture (wall-to-wall
 * over-the-shoulder, ~45% of the voiced lines, read as the show hiding its
 * hosts): a stretch runs at most ~OTS_MAX words, the next one waits
 * ~OTS_GAP words, and it never plays over the verdict board or right after
 * a host was on camera (that shot just showed them).
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
  /** On the verdict board (the closing topic of a themed episode): the
   *  board stays up, no cutaway. */
  verdict?: boolean;
}

export type Shot =
  | { kind: 'gfx' }
  | { kind: 'ots'; listener: Host; take: number }
  | { kind: 'cam' };

/** A line this short never gets its own cut. */
export const SHORT_LINE = 7;
/** Words of back-and-forth needed before cutting to the hosts. */
export const OTS_MIN_RUN = 30;
/** Words the graphic may hold before the next full line cuts away (~9s). */
export const MAX_HOLD = 25;
/** Words a listening stretch may run before the next full line goes back
 *  to the graphic (~11s). */
export const OTS_MAX = 30;
/** Words of other shots before the next listening stretch (~11s). */
export const OTS_GAP = 30;

const other = (h: Host): Host => (h === 'marcus' ? 'tony' : 'marcus');

export function planShots(lines: ShotLine[]): Shot[] {
  const out: Shot[] = [];
  const seenTopic = new Set<number>();
  let prev: Shot | null = null;
  let prevLook: string | undefined;
  let held = 0; // words the current picture has been up
  let otsRun = 0; // words the current listening stretch has run
  let sinceOts = Infinity; // words since the last one ended
  let takes = 0;
  const ots = (l: ShotLine): Shot => ({ kind: 'ots', listener: other(l.speaker), take: takes++ % 2 });
  lines.forEach((l, i) => {
    let shot: Shot;
    const inOts = prev?.kind === 'ots';
    const otsOk = !l.verdict && (inOts || (prev?.kind !== 'cam' && sinceOts >= OTS_GAP));
    if (l.kind !== 'tts') {
      shot = { kind: 'cam' };
    } else if (!seenTopic.has(l.topicIdx)) {
      shot = { kind: 'gfx' };
    } else if (l.words < SHORT_LINE && prev && prev.kind !== 'cam') {
      shot = prev;
    } else if (!l.bare || !otsOk) {
      shot = { kind: 'gfx' };
    } else if (prev?.kind === 'ots') {
      // Shot / reverse shot: the camera faces whoever isn't talking.
      shot = prev.listener === other(l.speaker) ? prev : ots(l);
    } else {
      // How much back-and-forth is coming (this line and the bare ones after it).
      let run = 0;
      for (let k = i; k < lines.length && lines[k].kind === 'tts' && lines[k].bare && lines[k].topicIdx === l.topicIdx; k++) run += lines[k].words;
      shot = run < OTS_MIN_RUN ? (prev?.kind === 'gfx' ? prev : { kind: 'gfx' }) : ots(l);
    }
    if (l.kind === 'tts') {
      const samePicture = (s: Shot) => !!prev && s.kind === prev.kind
        && (s.kind !== 'gfx' || l.look === prevLook)
        && (s.kind !== 'ots' || (prev.kind === 'ots' && s.listener === prev.listener));
      const opening = !seenTopic.has(l.topicIdx);
      if (!opening && l.words >= SHORT_LINE) {
        if (shot.kind === 'ots' && inOts && otsRun + l.words > OTS_MAX) shot = { kind: 'gfx' };
        else if (shot.kind === 'gfx' && samePicture(shot) && held + l.words > MAX_HOLD && otsOk && !inOts) shot = ots(l);
      }
      held = samePicture(shot) ? held + l.words : l.words;
      otsRun = shot.kind === 'ots' ? (inOts ? otsRun : 0) + l.words : 0;
      sinceOts = shot.kind === 'ots' ? 0 : sinceOts + l.words;
      if (shot.kind === 'gfx') prevLook = l.look;
      seenTopic.add(l.topicIdx);
    } else {
      held = 0;
      otsRun = 0;
    }
    out.push(shot);
    prev = shot;
  });
  return out;
}
