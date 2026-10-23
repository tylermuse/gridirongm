/**
 * Broadcast moments for the live viewer — the hoops version of BS Football's
 * big-play outcome chips. Pure pass over the event list, indexed 1:1:
 * which plays deserve a banner, and which stretch is "crunch time" (the
 * viewer slows playback there so the finish breathes).
 */

import type { LiveEvent } from './playByPlay';
import type { EventBeat } from './beats';

export type MomentTone = 'gold' | 'red' | 'blue' | 'accent';

export interface Moment {
  /** Banner text, or null when the play doesn't warrant one. */
  chip: { text: string; tone: MomentTone } | null;
  /** Final 2:00 of the 4th/OT with the game within 6. */
  crunch: boolean;
}

function clockSecs(clock: string): number {
  const [m, s] = clock.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

function lastName(text: string): string {
  // Event text starts with "F. Last …" for player plays.
  const m = /^[A-Z]\. ([^\s(]+(?: (?:Jr\.|Sr\.|II|III|IV))?)/.exec(text);
  return m ? m[1] : 'He';
}

export function computeMoments(events: LiveEvent[], beats: EventBeat[], homeAbbr: string, awayAbbr: string): Moment[] {
  const streak = new Map<string, number>();
  let lastRunShown = 0;
  return events.map((e, i) => {
    const before = i > 0 ? events[i - 1] : { home: 0, away: 0 };
    const secs = clockSecs(e.clock);
    const late = e.quarter >= 4 && secs <= 120 && e.kind !== 'period';
    const crunch = late && (Math.abs(before.home - before.away) <= 6 || Math.abs(e.home - e.away) <= 6);
    const beat = beats[i];
    let chip: Moment['chip'] = null;

    // Shooting streaks (field goals only — misses reset).
    if (e.playerId && (e.kind === 'make2' || e.kind === 'make3')) {
      const n = (streak.get(e.playerId) ?? 0) + 1;
      streak.set(e.playerId, n);
      if (n === 3) chip = { text: `🔥 ${lastName(e.text)} is heating up`, tone: 'accent' };
      else if (n === 5) chip = { text: `🔥 ${lastName(e.text)} is ON FIRE`, tone: 'red' };
    } else if (e.playerId && (e.kind === 'miss' || e.kind === 'block' || e.kind === 'ft')) {
      // A blocked/missed attempt by this shooter ends the streak. For blocks the
      // event's player is the blocker, so the shooter streak resets on their next miss.
      if (e.kind === 'miss') streak.set(e.playerId, 0);
    }

    if (e.scoring && secs <= 2 && e.kind !== 'ft' && e.kind !== 'period') {
      chip = { text: e.quarter >= 4 && Math.abs(e.home - e.away) <= 3 ? '🚨 AT THE BUZZER!' : 'BEAT THE BUZZER', tone: 'gold' };
    } else if (crunch && beat?.leadChange) {
      chip = { text: 'GO-AHEAD BUCKET', tone: 'gold' };
    } else if (crunch && beat?.tie) {
      chip = { text: 'TIE GAME', tone: 'blue' };
    } else if (e.and1) {
      chip = chip ?? { text: 'AND ONE!', tone: 'accent' };
    } else if (e.kind === 'block' && (crunch || /REJECTS/.test(e.text))) {
      chip = { text: 'REJECTED!', tone: 'blue' };
    } else if (crunch && e.kind === 'steal') {
      chip = { text: 'PICKED OFF!', tone: 'blue' };
    } else if (crunch && e.kind === 'make3') {
      chip = { text: 'CLUTCH THREE', tone: 'gold' };
    }

    // Runs: announce at 10 and 15 unanswered (once per run).
    if (e.scoring && beat?.runText) {
      const pts = Number(/(\d+)-0/.exec(beat.runText)?.[1] ?? 0);
      const tier = pts >= 15 ? 15 : pts >= 10 ? 10 : 0;
      if (tier && tier > lastRunShown) { chip = chip ?? { text: `${beat.runText.toUpperCase()}`, tone: 'red' }; lastRunShown = tier; }
    } else if (e.scoring) {
      lastRunShown = 0;
    }
    void homeAbbr; void awayAbbr;
    return { chip, crunch };
  });
}
