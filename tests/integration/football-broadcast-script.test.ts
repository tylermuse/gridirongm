/**
 * The live broadcast script: what Marcus and Tony actually get handed. Runs real
 * simulated games plus Live Coach's own wording through the generator, checking
 * the things a listener hears: names not tags, the situation, and the score.
 */
import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay, type PlayEvent } from '@/lib/engine/playByPlay';
import { broadcastClipLines } from '@/lib/engine/gameBroadcast';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, last: string): Player {
  const ovr = 78;
  return {
    id, firstName: 'Sam', lastName: last, position, age: 26, experience: 4,
    ratings: { overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr,
      stamina: ovr, throwing: ovr, catching: ovr, carrying: ovr, blocking: ovr,
      tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr },
    potential: ovr, ratingHistory: [], stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'], contract: {} as Player['contract'],
    teamId: null, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}
const POS: Position[] = ['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'DL', 'LB', 'CB', 'S'] as Position[];
const roster = (p: string) => POS.map((pos, i) => makePlayer(`${p}-${pos}${i}`, pos, `${p}name${'abcdefghij'[i]}`));
const team = (id: string, city: string): Team =>
  ({ id, city, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} }) as unknown as Team;

const clip = (events: PlayEvent[], i: number, from = -1) =>
  broadcastClipLines(events, i, 'DAL', 'BUF', from, 'Dallas', 'Buffalo');

function ev(partial: Partial<PlayEvent>): PlayEvent {
  return {
    id: 7, type: 'run', description: '', quarter: 1, timeStr: '10:00', possession: 'home', fieldPos: 40,
    down: 1, yardsToGo: 10, yardsGained: 0, homeScore: 0, awayScore: 0, isScoring: false, ...partial,
  } as PlayEvent;
}

describe('football broadcast script', () => {
  const game = simulatePlayByPlay(team('DAL', 'Dallas'), team('BUF', 'Buffalo'), roster('Dal'), roster('Buf'));
  const events = game.events;
  const allText = events.flatMap((_, i) => clip(events, i, 0)).map(l => l.text);

  it('never reads tags, abbreviations, emoji or feed shorthand aloud', () => {
    expect(allText.length).toBeGreaterThan(100);
    for (const t of allText) {
      expect(t).not.toMatch(/\b[A-Z]\.\s+[A-Z]/);          // "S. Barkley"
      expect(t).not.toMatch(/\b(QB|RB|WR|TE)\b/);          // position tags
      expect(t).not.toMatch(/\b(DAL|BUF)\b/);              // team tags
      expect(t).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(t).not.toMatch(/PAT\b|\bQ[1-4]\b|Kicking team lines up|yards net/);
    }
  });

  it('is deterministic, so a re-watch hits the audio cache', () => {
    for (let i = 0; i < events.length; i += 5) expect(clip(events, i, 0)).toEqual(clip(events, i, 0));
  });

  it('says who has the ball, the big downs, and the score', () => {
    const said = allText.join(' ');
    expect(said).toMatch(/(Dallas|Buffalo) takes over at /);
    expect(said).toMatch(/Third and (\d+|goal)\./);
    expect(said).toMatch(/First down|Moves the chains/);
    expect(said).toMatch(/That's the ballgame\. Final score: /);
  });

  it('keeps the score right after a field goal and an extra point', () => {
    const fg = ev({ type: 'field_goal_good', description: 'Field goal from 30 — S. Lamb K splits the uprights! 🏈', possession: 'away', homeScore: 7, awayScore: 0, isScoring: true });
    expect(clip([fg], 0)[0].text).toContain('Dallas 7, Buffalo 3.');
    const xp = ev({ type: 'extra_point', description: 'S. Evans K nails the extra point. PAT is good.', homeScore: 7 });
    expect(clip([xp], 0)[0].text).toBe('The extra point is good. Dallas 7, Buffalo nothing.');
    const miss = ev({ type: 'extra_point', description: 'Extra point is no good!', homeScore: 6, awayScore: 6 });
    expect(clip([miss], 0)[0].text).toBe('The extra point is no good! All tied up at 6.');
  });

  it("calls Live Coach's untagged plays by name", () => {
    const run = ev({ description: 'HB Dive — S. Barkley runs for 4 yards.', yardsGained: 4 });
    expect(clip([run], 0)[0].text).toMatch(/Barkley/);
    expect(clip([run], 0)[0].text).not.toMatch(/The back|HB Dive|S\. /);

    const pass = ev({ type: 'pass_complete', description: 'P. Mahomes completes to T. Kelce for 8 yards.', yardsGained: 8 });
    expect(clip([pass], 0)[0].text).toMatch(/Mahomes.*Kelce/);

    const miss = ev({ type: 'pass_incomplete', description: "P. Mahomes's pass to T. Kelce falls incomplete." });
    expect(clip([miss], 0)[0].text).toMatch(/Mahomes/);
    expect(clip([miss], 0)[0].text).not.toMatch(/Mahomes's looks|Mahomes's's|'s's/);

    const td = ev({ description: 'HB Dive — S. Barkley runs it in for a 4-yard TOUCHDOWN!', yardsGained: 4, isScoring: true });
    const tdLines = clip([td], 0);
    expect(tdLines[0].text).toBe('Barkley runs it in for a 4-yard TOUCHDOWN!');
    expect(tdLines[1].speaker).toBe('tony');

    const timeout = ev({ description: '⏱️ Timeout called by DAL. (2 remaining)' });
    expect(clip([timeout], 0)[0].text).toBe('Timeout called by Dallas. 2 remaining');
  });

  it('calls the situation around the snap', () => {
    const prev = ev({ id: 1, possession: 'away' });
    expect(clip([prev, ev({ description: 'S. Diggs RB runs for 3 yards.', yardsGained: 3, fieldPos: 30 })], 1)[0].text)
      .toMatch(/^Dallas takes over at their own 30\. /);
    expect(clip([prev, ev({ description: 'S. Diggs RB runs for 3 yards.', yardsGained: 3, fieldPos: 70 })], 1)[0].text)
      .toMatch(/^Dallas takes over at the Buffalo 30\. /);

    const same = ev({ id: 1 });
    const third = ev({ description: 'S. Diggs RB runs for 2 yards.', down: 3, yardsToGo: 4, yardsGained: 2 });
    expect(clip([same, third], 1)[0].text).toMatch(/^Third and 4\. .*Fourth and 2 coming up\.$/);
    const conversion = ev({ description: 'S. Diggs RB runs for 5 yards.', down: 3, yardsToGo: 4, yardsGained: 5 });
    expect(clip([same, conversion], 1)[0].text).toMatch(/First down|Moves the chains/);
    const goal = ev({ type: 'pass_incomplete', description: 'S. Henry QB overthrows S. Hill WR. Incomplete.', down: 3, yardsToGo: 5, fieldPos: 95 });
    expect(clip([same, goal], 1)[0].text).toMatch(/^Third and goal\. /);
  });

  it("doesn't call a recovered fumble a giveaway", () => {
    const fumble = ev({ id: 2, type: 'fumble', description: 'Fumble! S. Diggs RB loses the ball — recovered by S. Hill WR!' });
    const kept = clip([fumble, ev({ id: 3, possession: 'home' })], 0);
    expect(kept[1].text).toMatch(/get it back|dodged one/);
    const lost = clip([fumble, ev({ id: 3, possession: 'away' })], 0);
    expect(lost[1].text).not.toMatch(/get it back|dodged one/);
  });

  it('opens the show only where it should', () => {
    expect(clip(events, 0, 0)[0].text).toMatch(/^Welcome in/);
    const later = clip(events, 20, 20);
    expect(later[0].text).toMatch(/^Marcus Cole and Tony Blaze joining you in /);
    expect(later).toHaveLength(2); // the score, not a re-call of a play already shown
    expect(clip(events, 20, -1)[0]?.text ?? '').not.toMatch(/Welcome in|joining you/);
  });

  it("doesn't read the score twice across the quarter break before the half and final", () => {
    const end = ev({ type: 'quarter_end', description: 'End of the second quarter.', quarter: 2 });
    const half = ev({ type: 'halftime', description: 'Halftime', quarter: 2 });
    expect(clip([end, half], 0)).toEqual([]);
    expect(clip([half], 0)[0].text).toMatch(/^That's the half\. /);
    expect(clip([end], 0)[0].text).toBe("That's the end of the second quarter. Still scoreless.");
  });
});
