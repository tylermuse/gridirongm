/**
 * Tony's read on a Football game: real sims plus Live Coach's wording. Live
 * Coach games have no bucket snapshots, so everything is read from the events,
 * and the sim's buckets are what keeps that reading honest.
 */
import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay, type PlayEvent } from '@/lib/engine/playByPlay';
import { broadcastClipLines } from '@/lib/engine/gameBroadcast';
import { applyPlay, newGameState } from '@/lib/engine/gameRead';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, last: string, ovr: number): Player {
  return {
    id, firstName: 'Sam', lastName: last, position, age: 26, experience: 4,
    ratings: { overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr, stamina: ovr, throwing: ovr,
      catching: ovr, carrying: ovr, blocking: ovr, tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr },
    potential: ovr, ratingHistory: [], stats: {} as Player['stats'], careerStats: {} as Player['careerStats'],
    contract: {} as Player['contract'], teamId: null, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}
const POS = ['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'DL', 'LB', 'CB', 'S'] as Position[];
const roster = (p: string, ovr: number) => POS.map((pos, i) => makePlayer(`${p}${i}`, pos, `${p}${'abcdefghij'[i]}`, ovr));
const team = (id: string, city: string): Team =>
  ({ id, city, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} }) as unknown as Team;

const sim = (h = 78, a = 78) =>
  simulatePlayByPlay(team('DAL', 'Dallas'), team('BUF', 'Buffalo'), roster('Dal', h), roster('Buf', a)).events;
const say = (events: PlayEvent[], i: number, from = 0) => broadcastClipLines(events, i, 'DAL', 'BUF', from, 'Dallas', 'Buffalo');
const tony = (events: PlayEvent[]) =>
  events.flatMap((_, i) => say(events, i).filter(l => l.speaker === 'tony').map(l => ({ i, text: l.text })));

describe('Football running numbers', () => {
  it('match what the sim itself recorded', () => {
    for (let n = 0; n < 8; n++) {
      const events = sim();
      const state = newGameState();
      events.forEach((e, i) => applyPlay(state, e, events[i + 1]));
      const last = events[events.length - 1];
      for (const [side, bucket] of [['home', last.homeBucketSnap], ['away', last.awayBucketSnap]] as const) {
        if (!bucket) continue;
        const t = state.team[side];
        // The sim's buckets also count two-point tries, and its attempts count sacks.
        expect(Math.abs(t.passComp - bucket.passCompletions)).toBeLessThanOrEqual(2);
        expect(t.passAtt).toBeLessThanOrEqual(bucket.passAttempts + 2);
        expect(t.passAtt + t.sacksTaken).toBeGreaterThanOrEqual(bucket.passAttempts - 3);
        // Buckets credit a touchdown its rolled yards even past the goal line, so
        // they run high. The events have the real distance.
        expect(t.passYds).toBeLessThanOrEqual(bucket.passYards + 30);
        expect(t.passYds).toBeGreaterThanOrEqual(bucket.passYards - 120);
        expect(t.rushYds).toBeLessThanOrEqual(bucket.rushYards + bucket.qbRushYards + 30);
        expect(t.rushYds).toBeGreaterThanOrEqual(bucket.rushYards + bucket.qbRushYards - 120);
      }
    }
  });
});

describe("Tony's read", () => {
  it('talks about the game, with real numbers, in every game', () => {
    for (let n = 0; n < 6; n++) {
      const lines = tony(sim());
      expect(lines.filter(l => /\d/.test(l.text)).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('says true numbers: "X is C of A" matches the team line at that moment', () => {
    let checked = 0;
    for (let n = 0; n < 6; n++) {
      const events = sim();
      for (const { i, text } of tony(events)) {
        const m = /\b(?:is|to) (\d+) of (\d+)(?: for (\d+) yards|\.)/.exec(text);
        if (!m || /third down/.test(text)) continue;
        const state = newGameState();
        events.slice(0, i + 1).forEach((e, j) => applyPlay(state, e, events[j + 1]));
        const lines = [state.team.home, state.team.away];
        expect(lines.some(t => t.passComp === +m[1] && t.passAtt === +m[2] && (!m[3] || t.passYds === +m[3])), text).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('only knows what has happened so far', () => {
    const events = sim();
    const cut = Math.floor(events.length / 2);
    const part = events.slice(0, cut);
    // The last play of the cut can't see who recovered a fumble; earlier ones can.
    for (let i = 0; i < cut - 1; i++) expect(say(part, i)).toEqual(say(events, i));
  });

  it('says the same thing however the listener joined, so the audio cache still hits', () => {
    const events = sim();
    for (let i = 41; i < events.length; i += 3) expect(say(events, i, 40)).toEqual(say(events, i, 0));
  });

  it('never repeats itself back to back', () => {
    for (let n = 0; n < 4; n++) {
      const lines = tony(sim()).map(l => l.text);
      for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    }
  });

  it('summarizes the half and the final with something specific', () => {
    const events = sim(85, 60);
    const half = events.findIndex(e => e.type === 'halftime');
    const final = events.length - 1;
    expect(say(events, half).find(l => l.speaker === 'tony')!.text).not.toMatch(/Plenty of football left/);
    expect(say(events, final).find(l => l.speaker === 'tony')!.text).toMatch(/\d|finish|tie|business/i);
  });
});

function coach(partial: Partial<PlayEvent>): PlayEvent {
  return {
    id: 1, type: 'run', description: '', quarter: 2, timeStr: '8:00', possession: 'home', fieldPos: 40,
    down: 1, yardsToGo: 10, yardsGained: 0, homeScore: 14, awayScore: 0, isScoring: false, ...partial,
  } as PlayEvent;
}

describe('with Live Coach wording (untagged names, no buckets)', () => {
  it('credits the runner and tells the other team to stop him', () => {
    const events: PlayEvent[] = [];
    for (let id = 1; id <= 14; id++) {
      events.push(coach({ id, description: `HB Dive — S. Barkley breaks free for 11 yards!`, yardsGained: 11 }));
    }
    const said = tony(events).map(l => l.text).join(' ');
    expect(said).toMatch(/Barkley/);
    expect(said).toMatch(/\d+ yards/);
    expect(said).not.toMatch(/Dive|HB/);
  });

  it('credits the passer and the target', () => {
    const state = newGameState();
    applyPlay(state, coach({ type: 'pass_complete', description: `J. Hurts completes to A. Brown for 18 yards.`, yardsGained: 18 }), undefined);
    expect(state.team.home.passYds).toBe(18);
    expect(state.team.home.passComp).toBe(1);
    expect(state.players.get('home:Brown')?.recYds).toBe(18);
    expect([...state.passers.home]).toEqual(['Hurts']);
  });

  it('adds a turnover only when the ball actually changes hands', () => {
    const fumble = coach({ type: 'fumble', description: 'Fumble! S. Barkley loses the ball!' });
    const kept = newGameState();
    applyPlay(kept, fumble, coach({ possession: 'home' }));
    expect(kept.team.home.turnovers).toBe(0);
    const lost = newGameState();
    applyPlay(lost, fumble, coach({ possession: 'away' }));
    expect(lost.team.home.turnovers).toBe(1);
  });
});
