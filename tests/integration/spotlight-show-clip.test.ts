import { describe, it, expect } from 'vitest';
import { clipEventOf, hasClip } from '@/lib/spotlight/showClip';
import { gameFlowOf } from '@/lib/spotlight/showGame';
import { toSimPlay } from '@/lib/engine/liveSim3d';
import type { GameResult, Player, ScoringPlay, Team } from '@/types';

const team = (id: string, abbreviation: string) => ({ id, abbreviation, city: id, name: id, primaryColor: '#112233', secondaryColor: '#ddeeff' }) as unknown as Team;
const dal = team('dal', 'DAL');
const tb = team('tb', 'TB');
const man = (id: string, firstName: string, lastName: string, position: string, teamId: string, jerseyNumber: number) =>
  ({ id, firstName, lastName, position, teamId, jerseyNumber }) as unknown as Player;
const players = [
  man('dak', 'Dak', 'Prescott', 'QB', 'dal', 4),
  man('lamb', 'CeeDee', 'Lamb', 'WR', 'dal', 88),
  man('rb', 'Tony', 'Pollard', 'RB', 'dal', 20),
  man('k', 'Chase', 'McLaughlin', 'K', 'tb', 4),
  man('baker', 'Baker', 'Mayfield', 'QB', 'tb', 6),
  man('evans', 'Mike', 'Evans', 'WR', 'tb', 13),
];

const sp = (quarter: number, teamId: string, points: number, description: string, score: [number, number], timeLeft = '8:00'): ScoringPlay =>
  ({ quarter, timeLeft, teamId, points, description, score });

/** Dallas at home against Tampa. `score` is [away, home]. */
const flowOf = (scoringPlays: ScoringPlay[], home = true) => gameFlowOf(
  { id: 'g', week: 1, season: 2026, homeTeamId: home ? 'dal' : 'tb', awayTeamId: home ? 'tb' : 'dal', homeScore: 0, awayScore: 0, played: true, playerStats: {}, scoringPlays } as GameResult,
  dal, tb, players,
)!;

describe('highlight clips: a score worked back to its snap', () => {
  it('a touchdown pass is snapped as far out as it went, by the team that scored', () => {
    const flow = flowOf([
      sp(1, 'tb', 3, 'C. McLaughlin 41-yard field goal', [3, 0]),
      sp(2, 'dal', 7, 'D. Prescott 34 yd pass to C. Lamb (XP good)', [3, 7], '2:11'),
    ]);
    const e = clipEventOf(flow, 2)!;
    expect(e).toMatchObject({ type: 'pass_complete', possession: 'home', fieldPos: 66, yardsGained: 34, quarter: 2, timeStr: '2:11', isScoring: true });
    // The score once the touchdown is up: the extra point is its own play.
    expect(e).toMatchObject({ homeScore: 6, awayScore: 3 });

    const sim = toSimPlay(e, { home: players.filter(p => p.teamId === 'dal'), away: players.filter(p => p.teamId === 'tb') })!;
    expect(sim.res).toMatchObject({ kind: 'complete', depth: 'deep', yards: 34 });
    expect(sim.pre).toMatchObject({ fieldPos: 66, homeScore: 0, awayScore: 3, quarter: 2, clock: 131 });
    // The man who caught it wears his number.
    expect(sim.who?.ball).toMatchObject({ n: 88, pos: 'WR' });
  });

  it('a field goal is kicked from 17 yards behind its distance', () => {
    const flow = flowOf([
      sp(4, 'dal', 7, 'T. Pollard 3 yd rush (XP good)', [0, 7]),
      sp(5, 'tb', 3, 'C. McLaughlin 27-yard field goal', [3, 7], '5:39'),
    ]);
    const e = clipEventOf(flow, 2)!;
    // A 27-yarder is snapped at the 10, by the visitors.
    expect(e).toMatchObject({ type: 'field_goal_good', possession: 'away', fieldPos: 90, down: 4, quarter: 5, homeScore: 7, awayScore: 3 });
    const sim = toSimPlay(e)!;
    expect(sim.res).toEqual({ kind: 'fg', good: true });
    expect(sim.pre).toMatchObject({ homeScore: 7, awayScore: 0 });
  });

  it('a rushing touchdown is a run', () => {
    const flow = flowOf([sp(1, 'dal', 7, 'T. Pollard 3 yd rush (XP good)', [0, 7])]);
    const e = clipEventOf(flow, 1)!;
    expect(e).toMatchObject({ type: 'run', fieldPos: 97, yardsToGo: 3 });
    expect(toSimPlay(e)!.res).toMatchObject({ kind: 'run', yards: 3 });
  });

  it("reads the live game's wording too", () => {
    const flow = flowOf([
      sp(1, 'dal', 6, '🏈 TOUCHDOWN! D. Prescott hits C. Lamb for the 22-yard score!', [0, 6]),
      sp(1, 'dal', 1, 'Extra point is GOOD', [0, 7]),
      sp(2, 'tb', 6, '🏈 TOUCHDOWN! M. Evans crosses the goal line!', [6, 7]),
      sp(3, 'dal', 6, '🏈 Dive to the pylon by T. Pollard! TOUCHDOWN!', [6, 13]),
    ]);
    expect(clipEventOf(flow, 1)).toMatchObject({ type: 'pass_complete', fieldPos: 78, homeScore: 6, awayScore: 0 });
    // No distance in the line: a short one, and the score before it counts the folded extra point.
    expect(clipEventOf(flow, 2)).toMatchObject({ type: 'run', possession: 'away', fieldPos: 97, homeScore: 7, awayScore: 6 });
    expect(clipEventOf(flow, 3)).toMatchObject({ type: 'run', possession: 'home' });
  });

  it('on the road, the team is the visitor in the clip', () => {
    const flow = flowOf([sp(1, 'dal', 7, 'D. Prescott 12 yd pass to C. Lamb (XP good)', [7, 0])], false);
    expect(flow.usHome).toBe(false);
    expect(clipEventOf(flow, 1)).toMatchObject({ possession: 'away', awayScore: 6, homeScore: 0 });
  });

  it('a kickoff return is run back by the team that scored', () => {
    const flow = flowOf([sp(1, 'dal', 6, 'Kick return TOUCHDOWN! Taken all the way back!', [0, 6])]);
    const e = clipEventOf(flow, 1)!;
    // The kicking team has the ball on a kickoff.
    expect(e).toMatchObject({ type: 'kickoff', possession: 'away', homeScore: 0, awayScore: 0 });
    expect(toSimPlay(e)!.res).toEqual({ kind: 'kickoff', td: true });
  });

  it('scores the sim has no picture for stay on the chart', () => {
    const flow = flowOf([
      sp(1, 'tb', 2, 'Safety', [2, 0]),
      sp(2, 'dal', 6, 'Punt return TOUCHDOWN! He takes it all the way!', [2, 6]),
      sp(3, 'tb', 6, 'Pick-six! M. Evans takes the interception back 40 yards', [8, 6]),
      sp(4, 'dal', 3, 'C. McLaughlin 30-yard field goal', [8, 9]),
    ]);
    expect(flow.plays.map(hasClip)).toEqual([false, false, false, true]);
    expect(clipEventOf(flow, 1)).toBeNull();
    expect(clipEventOf(flow, 2)).toBeNull();
    expect(clipEventOf(flow, 3)).toBeNull();
    expect(clipEventOf(flow, 9)).toBeNull();
  });
});
