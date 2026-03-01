function uuid(): string {
  return crypto.randomUUID();
}
import type { Team, GameResult } from '@/types';

/**
 * Generates an 18-week NFL-style regular season schedule:
 * - 17 games per team
 * - 1 bye per team
 * - at most 1 game per team per week
 */
export function generateSchedule(teams: Team[], season: number): GameResult[] {
  if (teams.length % 2 !== 0) {
    throw new Error('Schedule generation requires an even number of teams');
  }

  // Retry with new random seeds if a weekly pairing dead-ends.
  for (let attempt = 0; attempt < 200; attempt++) {
    const byeWeekByTeamId = assignByeWeeks(teams);
    const gamesPlayedByTeamId = new Map<string, number>(teams.map((team) => [team.id, 0]));
    const homeGamesByTeamId = new Map<string, number>(teams.map((team) => [team.id, 0]));
    const pairCounts = new Map<string, number>();
    const schedule: GameResult[] = [];
    let failed = false;

    for (let week = 1; week <= 18; week++) {
      const available = shuffle(
        teams.filter((team) => byeWeekByTeamId.get(team.id) !== week),
      );
      const weeklyGames = buildWeekGames(
        available,
        week,
        season,
        gamesPlayedByTeamId,
        homeGamesByTeamId,
        pairCounts,
      );

      if (!weeklyGames) {
        failed = true;
        break;
      }
      schedule.push(...weeklyGames);
    }

    if (failed) {
      continue;
    }

    const allHave17Games = teams.every((team) => gamesPlayedByTeamId.get(team.id) === 17);
    const has18Weeks = Math.max(...schedule.map((game) => game.week)) === 18;
    if (allHave17Games && has18Weeks) {
      return schedule.sort((a, b) => a.week - b.week);
    }
  }

  throw new Error('Unable to generate 18-week schedule after multiple attempts');
}

function buildWeekGames(
  availableTeams: Team[],
  week: number,
  season: number,
  gamesPlayedByTeamId: Map<string, number>,
  homeGamesByTeamId: Map<string, number>,
  pairCounts: Map<string, number>,
): GameResult[] | null {
  const games: GameResult[] = [];
  const available = [...availableTeams];

  while (available.length > 0) {
    const team = available.pop();
    if (!team) break;

    const candidates = available
      .map((candidate, index) => ({ candidate, index }))
      .map(({ candidate, index }) => {
        const pairKey = makePairKey(team.id, candidate.id);
        const pairCount = pairCounts.get(pairKey) ?? 0;
        if (pairCount >= 2) return null;

        const teamGames = gamesPlayedByTeamId.get(team.id) ?? 0;
        const candidateGames = gamesPlayedByTeamId.get(candidate.id) ?? 0;
        if (teamGames >= 17 || candidateGames >= 17) return null;

        const sameDivision =
          team.conference === candidate.conference && team.division === candidate.division;

        let score = 0;
        if (pairCount === 0) score += 100;
        if (pairCount === 1) score += 20;
        if (sameDivision) score += 8;

        const teamHome = homeGamesByTeamId.get(team.id) ?? 0;
        const candidateHome = homeGamesByTeamId.get(candidate.id) ?? 0;
        score += Math.max(0, 9 - Math.abs(teamHome - candidateHome));

        return { candidate, index, score };
      })
      .filter((value): value is { candidate: Team; index: number; score: number } => Boolean(value))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return null;
    }

    // Weighted random among top choices for variability and fewer dead ends.
    const top = candidates.slice(0, Math.min(4, candidates.length));
    const selected = top[Math.floor(Math.random() * top.length)];
    const opponent = selected.candidate;
    available.splice(selected.index, 1);

    const teamHome = homeGamesByTeamId.get(team.id) ?? 0;
    const opponentHome = homeGamesByTeamId.get(opponent.id) ?? 0;
    const shouldTeamBeHome =
      teamHome < opponentHome || (teamHome === opponentHome && Math.random() < 0.5);
    const homeTeamId = shouldTeamBeHome ? team.id : opponent.id;
    const awayTeamId = shouldTeamBeHome ? opponent.id : team.id;

    games.push(makeGame(homeTeamId, awayTeamId, week, season));

    gamesPlayedByTeamId.set(team.id, (gamesPlayedByTeamId.get(team.id) ?? 0) + 1);
    gamesPlayedByTeamId.set(opponent.id, (gamesPlayedByTeamId.get(opponent.id) ?? 0) + 1);
    homeGamesByTeamId.set(homeTeamId, (homeGamesByTeamId.get(homeTeamId) ?? 0) + 1);

    const key = makePairKey(team.id, opponent.id);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return games;
}

function assignByeWeeks(teams: Team[]): Map<string, number> {
  const byeWeekByTeamId = new Map<string, number>();
  const shuffled = shuffle(teams);
  // 16 bye weeks with 2 teams each -> 32 total byes.
  for (let i = 0; i < shuffled.length; i++) {
    const byeWeek = 2 + (i % 16); // Weeks 2-17; weeks 1 and 18 have no byes.
    byeWeekByTeamId.set(shuffled[i].id, byeWeek);
  }
  return byeWeekByTeamId;
}

function makePairKey(teamAId: string, teamBId: string): string {
  return [teamAId, teamBId].sort().join('|');
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeGame(homeTeamId: string, awayTeamId: string, week: number, season: number): GameResult {
  return {
    id: uuid(),
    week,
    season,
    homeTeamId,
    awayTeamId,
    homeScore: 0,
    awayScore: 0,
    played: false,
    playerStats: {},
  };
}
