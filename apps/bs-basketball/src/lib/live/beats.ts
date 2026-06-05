/**
 * Broadcast "beats" for the live viewer (parity 1.2): tag each scoring play that
 * flipped the lead, tied the game, or extended an unanswered run. Pure pass over
 * the synthesized play-by-play, indexed 1:1 with the events array.
 */

import type { LiveEvent } from './playByPlay';

export interface EventBeat {
  leadChange: boolean;
  tie: boolean;
  /** e.g. "BOS 10-0 run" once a team strings together 8+ unanswered. */
  runText?: string;
}

export function computeEventBeats(events: LiveEvent[], homeAbbr: string, awayAbbr: string): EventBeat[] {
  const out: EventBeat[] = [];
  // Track the last team to actually hold the lead, so retaking it after a tie
  // still reads as a lead change. The first basket of the game isn't a "change".
  let lastLeader: 'home' | 'away' | null = null;
  let wasTied = false;
  let runSide: 'home' | 'away' | null = null;
  let runPts = 0;
  for (const e of events) {
    let leadChange = false, tie = false, runText: string | undefined;
    if (e.scoring) {
      if (runSide === e.side) runPts += e.points; else { runSide = e.side; runPts = e.points; }
      const leader = e.home > e.away ? 'home' : e.away > e.home ? 'away' : 'tie';
      if (leader === 'tie') {
        if (lastLeader !== null && !wasTied) tie = true;
        wasTied = true;
      } else {
        if (lastLeader !== null && leader !== lastLeader) leadChange = true;
        lastLeader = leader;
        wasTied = false;
      }
      if (runPts >= 8) runText = `${e.side === 'home' ? homeAbbr : awayAbbr} ${runPts}-0 run`;
    }
    out.push({ leadChange, tie, runText });
  }
  return out;
}
