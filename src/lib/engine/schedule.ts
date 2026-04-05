function uuid(): string {
  return crypto.randomUUID();
}
import type { Team, GameResult } from '@/types';

/**
 * Generates an 18-week NFL-style regular season schedule:
 * - 17 games per team, 1 bye per team
 * - 6 division games (home-and-away vs each of 3 division rivals)
 * - 4 games vs a rotating in-conference division (2 home, 2 away)
 * - 4 games vs a rotating out-of-conference division (2 home, 2 away)
 * - 3 games vs remaining in-conference teams (based on prior finish position)
 *
 * No back-to-back opponents. Bye weeks are weeks 5-14.
 */
export function generateSchedule(teams: Team[], season: number): GameResult[] {
  if (teams.length !== 32) {
    // Fallback for non-standard league sizes
    return generateScheduleFallback(teams, season);
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const result = tryGenerateNFLSchedule(teams, season);
    if (result) return result;
  }

  // Fallback if NFL-style fails
  return generateScheduleFallback(teams, season);
}

// ---------------------------------------------------------------------------
// NFL-style schedule generation
// ---------------------------------------------------------------------------

interface Matchup {
  homeTeamId: string;
  awayTeamId: string;
}

function tryGenerateNFLSchedule(teams: Team[], season: number): GameResult[] | null {
  // Group teams by conference and division
  const divisions = new Map<string, Team[]>();
  for (const t of teams) {
    const key = `${t.conference}-${t.division}`;
    if (!divisions.has(key)) divisions.set(key, []);
    divisions.get(key)!.push(t);
  }

  // Validate structure: 8 divisions of 4 teams each
  if (divisions.size !== 8) return null;
  for (const [, div] of divisions) {
    if (div.length !== 4) return null;
  }

  const conferences = ['AC', 'NC'] as const;
  const divNames = ['North', 'South', 'East', 'West'] as const;

  // Determine rotating division matchups using season number
  // Each division plays one other in-conference division and one cross-conference division
  const rotationIndex = (season - 2026) % 3; // cycles every 3 years

  // Build all 17 matchups per team
  const allMatchups: Matchup[] = [];

  for (const conf of conferences) {
    const confDivs = divNames.map(d => ({
      name: d,
      teams: divisions.get(`${conf}-${d}`) ?? [],
    }));

    const otherConf = conf === 'AC' ? 'NC' : 'AC';
    const otherConfDivs = divNames.map(d => ({
      name: d,
      teams: divisions.get(`${otherConf}-${d}`) ?? [],
    }));

    for (let di = 0; di < 4; di++) {
      const div = confDivs[di];

      // 1. Division games: home-and-away vs each of 3 division rivals (6 games)
      for (let i = 0; i < div.teams.length; i++) {
        for (let j = i + 1; j < div.teams.length; j++) {
          allMatchups.push({ homeTeamId: div.teams[i].id, awayTeamId: div.teams[j].id });
          allMatchups.push({ homeTeamId: div.teams[j].id, awayTeamId: div.teams[i].id });
        }
      }

      // 2. In-conference rotating division (4 games — each team plays each team in that division once)
      const inConfRotDivIdx = (di + 1 + rotationIndex) % 4;
      const inConfRotDiv = confDivs[inConfRotDivIdx];
      for (let i = 0; i < 4; i++) {
        const team = div.teams[i];
        const opp = inConfRotDiv.teams[i];
        // Alternate home/away by team index
        if (i % 2 === 0) {
          allMatchups.push({ homeTeamId: team.id, awayTeamId: opp.id });
        } else {
          allMatchups.push({ homeTeamId: opp.id, awayTeamId: team.id });
        }
      }
      // Second pair (cross-match within the rotation)
      for (let i = 0; i < 4; i++) {
        const team = div.teams[i];
        const opp = inConfRotDiv.teams[(i + 1) % 4];
        if (i % 2 === 1) {
          allMatchups.push({ homeTeamId: team.id, awayTeamId: opp.id });
        } else {
          allMatchups.push({ homeTeamId: opp.id, awayTeamId: team.id });
        }
      }

      // 3. Cross-conference rotating division (4 games)
      const crossConfDivIdx = (di + rotationIndex) % 4;
      const crossConfDiv = otherConfDivs[crossConfDivIdx];
      for (let i = 0; i < 4; i++) {
        const team = div.teams[i];
        const opp = crossConfDiv.teams[i];
        if (i % 2 === 0) {
          allMatchups.push({ homeTeamId: team.id, awayTeamId: opp.id });
        } else {
          allMatchups.push({ homeTeamId: opp.id, awayTeamId: team.id });
        }
      }
      for (let i = 0; i < 4; i++) {
        const team = div.teams[i];
        const opp = crossConfDiv.teams[(i + 1) % 4];
        if (i % 2 === 1) {
          allMatchups.push({ homeTeamId: team.id, awayTeamId: opp.id });
        } else {
          allMatchups.push({ homeTeamId: opp.id, awayTeamId: team.id });
        }
      }

      // 4. Remaining in-conference games (3 games)
      // Play 3 teams from the 2 other in-conference divisions (not the rotating one)
      const otherInConfDivIdxs = [0, 1, 2, 3].filter(x => x !== di && x !== inConfRotDivIdx);
      for (let i = 0; i < div.teams.length; i++) {
        const team = div.teams[i];
        // Pick one opponent from each remaining division + one extra from the first
        let oppCount = 0;
        for (const odIdx of otherInConfDivIdxs) {
          if (oppCount >= 3) break;
          const oppDiv = confDivs[odIdx];
          // Match by position (simulates "same finish" matchup)
          const opp = oppDiv.teams[i % oppDiv.teams.length];
          if (opp.id === team.id) continue;
          // Check we haven't already scheduled this matchup
          const alreadyPlaying = allMatchups.some(m =>
            (m.homeTeamId === team.id && m.awayTeamId === opp.id) ||
            (m.homeTeamId === opp.id && m.awayTeamId === team.id));
          if (alreadyPlaying) {
            // Try a different opponent from this division
            const altOpp = oppDiv.teams[(i + 1) % oppDiv.teams.length];
            const altAlready = allMatchups.some(m =>
              (m.homeTeamId === team.id && m.awayTeamId === altOpp.id) ||
              (m.homeTeamId === altOpp.id && m.awayTeamId === team.id));
            if (!altAlready) {
              allMatchups.push(oppCount % 2 === 0
                ? { homeTeamId: team.id, awayTeamId: altOpp.id }
                : { homeTeamId: altOpp.id, awayTeamId: team.id });
              oppCount++;
            }
          } else {
            allMatchups.push(oppCount % 2 === 0
              ? { homeTeamId: team.id, awayTeamId: opp.id }
              : { homeTeamId: opp.id, awayTeamId: team.id });
            oppCount++;
          }
        }
        // If we still need games, pick from remaining divisions
        while (oppCount < 3) {
          const odIdx = otherInConfDivIdxs[oppCount % otherInConfDivIdxs.length];
          const oppDiv = confDivs[odIdx];
          const opp = oppDiv.teams[(i + 2) % oppDiv.teams.length];
          const alreadyPlaying = allMatchups.some(m =>
            (m.homeTeamId === team.id && m.awayTeamId === opp.id) ||
            (m.homeTeamId === opp.id && m.awayTeamId === team.id));
          if (!alreadyPlaying) {
            allMatchups.push(oppCount % 2 === 0
              ? { homeTeamId: team.id, awayTeamId: opp.id }
              : { homeTeamId: opp.id, awayTeamId: team.id });
          }
          oppCount++;
        }
      }
    }
  }

  // Deduplicate matchups (division games were added from both sides)
  const uniqueMatchups: Matchup[] = [];
  const seen = new Set<string>();
  for (const m of allMatchups) {
    const key = `${m.homeTeamId}|${m.awayTeamId}`;
    const reverseKey = `${m.awayTeamId}|${m.homeTeamId}`;
    if (!seen.has(key) && !seen.has(reverseKey)) {
      seen.add(key);
      uniqueMatchups.push(m);
    }
  }

  // Verify each team has exactly 17 games
  const gameCount = new Map<string, number>();
  for (const m of uniqueMatchups) {
    gameCount.set(m.homeTeamId, (gameCount.get(m.homeTeamId) ?? 0) + 1);
    gameCount.set(m.awayTeamId, (gameCount.get(m.awayTeamId) ?? 0) + 1);
  }

  // If counts are off, bail and let the fallback handle it
  for (const t of teams) {
    const count = gameCount.get(t.id) ?? 0;
    if (count !== 17) return null;
  }

  // Assign bye weeks (weeks 5-14, 2 teams per week on bye)
  const byeWeeks = assignByeWeeksNFL(teams);

  // Slot matchups into weeks with constraints:
  // - No team plays more than once per week
  // - Respect bye weeks
  // - No back-to-back opponents
  const schedule = slotMatchupsIntoWeeks(uniqueMatchups, teams, byeWeeks, season);
  return schedule;
}

function assignByeWeeksNFL(teams: Team[]): Map<string, number> {
  const byeMap = new Map<string, number>();
  const shuffled = shuffle(teams);
  // Bye weeks 5-14 (10 weeks), ~3 teams per bye week
  for (let i = 0; i < shuffled.length; i++) {
    const byeWeek = 5 + (i % 10);
    byeMap.set(shuffled[i].id, byeWeek);
  }
  return byeMap;
}

function slotMatchupsIntoWeeks(
  matchups: Matchup[],
  teams: Team[],
  byeWeeks: Map<string, number>,
  season: number,
): GameResult[] | null {
  const schedule: GameResult[] = [];
  const remaining = shuffle([...matchups]);
  const weekAssignments: Matchup[][] = Array.from({ length: 18 }, () => []);
  const lastOpponent = new Map<string, string>(); // team → last week's opponent

  for (let week = 1; week <= 18; week++) {
    const busyThisWeek = new Set<string>();
    // Mark bye teams as busy
    for (const [teamId, byeWk] of byeWeeks) {
      if (byeWk === week) busyThisWeek.add(teamId);
    }

    // Find matchups that fit this week
    const toRemove: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i];
      if (busyThisWeek.has(m.homeTeamId) || busyThisWeek.has(m.awayTeamId)) continue;

      // No back-to-back opponents
      if (lastOpponent.get(m.homeTeamId) === m.awayTeamId ||
          lastOpponent.get(m.awayTeamId) === m.homeTeamId) continue;

      weekAssignments[week - 1].push(m);
      busyThisWeek.add(m.homeTeamId);
      busyThisWeek.add(m.awayTeamId);
      toRemove.push(i);

      if (weekAssignments[week - 1].length >= 16) break; // max 16 games per week
    }

    // Remove assigned matchups (reverse order to preserve indices)
    for (const idx of toRemove.reverse()) {
      remaining.splice(idx, 1);
    }

    // Update last opponents
    for (const m of weekAssignments[week - 1]) {
      lastOpponent.set(m.homeTeamId, m.awayTeamId);
      lastOpponent.set(m.awayTeamId, m.homeTeamId);
    }
  }

  // If we couldn't place all matchups, fail
  if (remaining.length > 0) return null;

  // Convert to GameResult
  for (let week = 0; week < 18; week++) {
    for (const m of weekAssignments[week]) {
      schedule.push(makeGame(m.homeTeamId, m.awayTeamId, week + 1, season));
    }
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Fallback: original greedy algorithm for non-32-team leagues
// ---------------------------------------------------------------------------

function generateScheduleFallback(teams: Team[], season: number): GameResult[] {
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
        available, week, season, gamesPlayedByTeamId, homeGamesByTeamId, pairCounts,
      );

      if (!weeklyGames) { failed = true; break; }
      schedule.push(...weeklyGames);
    }

    if (failed) continue;

    const allHave17Games = teams.every((team) => gamesPlayedByTeamId.get(team.id) === 17);
    const has18Weeks = Math.max(...schedule.map((game) => game.week)) === 18;
    if (allHave17Games && has18Weeks) {
      return schedule.sort((a, b) => a.week - b.week);
    }
  }

  throw new Error('Unable to generate schedule after multiple attempts');
}

function buildWeekGames(
  availableTeams: Team[], week: number, season: number,
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

        const sameDivision = team.conference === candidate.conference && team.division === candidate.division;
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

    if (candidates.length === 0) return null;

    const top = candidates.slice(0, Math.min(4, candidates.length));
    const selected = top[Math.floor(Math.random() * top.length)];
    const opponent = selected.candidate;
    available.splice(selected.index, 1);

    const teamHome = homeGamesByTeamId.get(team.id) ?? 0;
    const opponentHome = homeGamesByTeamId.get(opponent.id) ?? 0;
    const shouldTeamBeHome = teamHome < opponentHome || (teamHome === opponentHome && Math.random() < 0.5);
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
  for (let i = 0; i < shuffled.length; i++) {
    const byeWeek = 2 + (i % 16);
    byeWeekByTeamId.set(shuffled[i].id, byeWeek);
  }
  return byeWeekByTeamId;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
