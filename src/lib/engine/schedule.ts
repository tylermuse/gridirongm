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
  isDivision?: boolean;
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
  // Each division plays one other in-conference division and one cross-conference division.
  // Normalize to always be non-negative: JS `%` returns negative for negative
  // dividends (e.g. (2007 - 2026) % 3 === -1), and a negative rotationIndex
  // would make `(di + rotationIndex) % 4` negative for di=0, indexing
  // otherConfDivs[-1] = undefined and throwing on `.teams`. Hits any era
  // roster with season < 2026 (e.g. Brady Era 2007).
  const rotationIndex = (((season - 2026) % 3) + 3) % 3; // cycles every 3 years, always 0-2

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
          allMatchups.push({ homeTeamId: div.teams[i].id, awayTeamId: div.teams[j].id, isDivision: true });
          allMatchups.push({ homeTeamId: div.teams[j].id, awayTeamId: div.teams[i].id, isDivision: true });
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

  // Deduplicate matchups. Non-division pairs get added from both sides
  // (e.g. div0's rotating-div loop pushes div0↔div3, then di=3's loop also
  // pushes div3↔div0) — collapse those via reverse-key match. Division
  // pairs are home-and-away by design (6 division games per team), so they
  // bypass dedup entirely.
  const uniqueMatchups: Matchup[] = [];
  const seenPair = new Set<string>(); // unordered-pair key for non-division dedup
  for (const m of allMatchups) {
    if (m.isDivision) {
      uniqueMatchups.push(m);
      continue;
    }
    const pairKey = [m.homeTeamId, m.awayTeamId].sort().join('|');
    if (!seenPair.has(pairKey)) {
      seenPair.add(pairKey);
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

/**
 * Fallback scheduler for leagues that are NOT a clean 32-team, 8x4-division
 * layout - e.g. historical era rosters (1994 = 28 teams with 2-3 team
 * divisions, 1999 = 31 teams) and post-expansion leagues (33+ teams).
 *
 * The NFL-style generator (tryGenerateNFLSchedule) hard-requires 32 teams in
 * eight four-team divisions, and the previous greedy fallback hard-required
 * every team to reach exactly 17 games with 6 division games each - both
 * impossible for an odd team count (you can't pair everyone every week) or for
 * divisions smaller than four. When that happened the old code threw "Unable
 * to generate schedule after multiple attempts", newLeague swallowed the error
 * in its try/catch, and the app silently generated a fictional stock league
 * instead of the imported roster (yo46363: era rosters loading as "Minnesota
 * Frost" / "Dallas Wranglers" - the default template teams).
 *
 * This deterministic circle-method round robin never throws and works for any
 * team count >= 2 and any division layout. Each team plays up to 17 distinct
 * opponents (min(17, N-1)); in an odd league the team paired with the bye slot
 * rests that week, so a team plays 16 or 17 games with at most one bye.
 * Home/away is balanced greedily. Division records still populate because each
 * division is a subset of the round robin, so playoff seeding by division
 * winner keeps working.
 */
// ---------------------------------------------------------------------------
// Fallback scheduler (non-standard league sizes)
// ---------------------------------------------------------------------------

/**
 * Handles any league that is not a clean 32-team, 8x4-division layout:
 * historical era rosters (1994 = 28 teams with 2-3 team divisions, 1999 = 31
 * teams) and post-expansion leagues (33+ teams).
 *
 * First tries the greedy NFL-flavored builder (home-and-away division
 * rivalries, one bye per team across 18 weeks). That builder cannot satisfy
 * every layout - an odd team count can't pair everyone each week, so exactly
 * 17 games for all is mathematically impossible - so when it can't converge we
 * fall back to a deterministic circle-method round robin that never fails for
 * any N >= 2.
 *
 * Previously the greedy builder THREW when it couldn't converge: odd counts,
 * or divisions smaller than four where the old hardcoded "6 division games"
 * target was unreachable. newLeague swallowed that throw in its try/catch and
 * silently generated a fictional stock league instead of the imported roster,
 * which is why the 1994/1999 era rosters loaded as the default template teams
 * ("Dallas Wranglers" / "Minnesota Frost") reported by yo46363.
 */
function generateScheduleFallback(teams: Team[], season: number): GameResult[] {
  const greedy = tryGreedyScheduleFallback(teams, season);
  if (greedy) return greedy;
  return circleRoundRobinSchedule(teams, season);
}

/** Number of teams in a team's (conference, division) group. */
function divisionSize(team: Team, allTeams: Team[]): number {
  let size = 0;
  for (const t of allTeams) {
    if (t.conference === team.conference && t.division === team.division) size++;
  }
  return size;
}

/**
 * Home-and-away division games a team should get, capped by division size.
 * A four-team division yields the NFL-standard 6; smaller era divisions (a
 * two-team 1994 AFC South, say) yield fewer instead of an unreachable quota
 * that used to deadlock the scheduler.
 */
function divisionGameTarget(team: Team, allTeams: Team[]): number {
  return Math.min(6, 2 * Math.max(0, divisionSize(team, allTeams) - 1));
}

function tryGreedyScheduleFallback(teams: Team[], season: number): GameResult[] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const byeWeekByTeamId = assignByeWeeks(teams);
    const gamesPlayedByTeamId = new Map<string, number>(teams.map((team) => [team.id, 0]));
    const homeGamesByTeamId = new Map<string, number>(teams.map((team) => [team.id, 0]));
    const pairCounts = new Map<string, number>();
    // wildbadger5 4/29: division pairs were sometimes scheduled HH/AA when
    // the running home-count balance + random tiebreaker happened to pick
    // the same host both times. Track first-meeting host so the second
    // meeting can be forced to the opposite venue.
    const firstHomeByPair = new Map<string, string>();
    const schedule: GameResult[] = [];
    let failed = false;

    for (let week = 1; week <= 18; week++) {
      const available = shuffle(
        teams.filter((team) => byeWeekByTeamId.get(team.id) !== week),
      );
      const weeklyGames = buildWeekGames(
        available, week, season, gamesPlayedByTeamId, homeGamesByTeamId, pairCounts, firstHomeByPair, teams,
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

  // Could not converge (e.g. odd team count) - let the caller use the
  // guaranteed circle-method builder instead of throwing.
  return null;
}

function divGamesPlayed(teamId: string, team: Team, allTeams: Team[], pairCounts: Map<string, number>): number {
  let played = 0;
  for (const other of allTeams) {
    if (other.id === teamId) continue;
    if (other.conference !== team.conference || other.division !== team.division) continue;
    played += pairCounts.get(makePairKey(teamId, other.id)) ?? 0;
  }
  return played;
}

function buildWeekGames(
  availableTeams: Team[], week: number, season: number,
  gamesPlayedByTeamId: Map<string, number>,
  homeGamesByTeamId: Map<string, number>,
  pairCounts: Map<string, number>,
  firstHomeByPair: Map<string, string>,
  allTeams: Team[],
): GameResult[] | null {
  const games: GameResult[] = [];
  const available = [...availableTeams];
  // Weeks remaining (including this one) determines how aggressive to be
  // about forcing division-only matchups for teams that still need them.
  const weeksLeft = 19 - week;

  while (available.length > 0) {
    const team = available.pop();
    if (!team) break;

    // wildbadger5 4/27 + milkytoad 4/20: teams were getting 3 division games
    // instead of 6 because the greedy slotter never enforced the quota.
    // When the games-left budget is exactly the div-games-still-needed, the
    // team must play a div opponent this week or the quota becomes unfillable.
    const teamDivTarget = divisionGameTarget(team, allTeams);
    const teamDivPlayed = divGamesPlayed(team.id, team, allTeams, pairCounts);
    const teamDivNeeded = Math.max(0, teamDivTarget - teamDivPlayed);
    const teamGamesLeft = 17 - (gamesPlayedByTeamId.get(team.id) ?? 0);
    const forceDiv = teamDivNeeded > 0 && teamDivNeeded >= teamGamesLeft - 1;

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

        // Division pairs MUST play home-and-away (up to 6 games per team).
        let score = 0;
        if (sameDivision && pairCount === 0) score += 300;
        else if (sameDivision && pairCount === 1) score += 250;
        else if (!sameDivision && pairCount === 0) score += 100;
        else if (!sameDivision && pairCount === 1) score += 5;

        // Extra urgency: candidate's own div quota also pressures the score.
        const candidateDivPlayed = divGamesPlayed(candidate.id, candidate, allTeams, pairCounts);
        const candidateDivNeeded = Math.max(0, divisionGameTarget(candidate, allTeams) - candidateDivPlayed);
        if (sameDivision) score += teamDivNeeded * 10 + candidateDivNeeded * 10;
        // Heavy penalty for non-div opponents when team is at div-quota
        // pressure - they CAN still be picked if no div opponent is
        // available this week (avoids unschedulable weeks), just last resort.
        if (forceDiv && !sameDivision) score -= 500;
        void weeksLeft;
        const teamHome = homeGamesByTeamId.get(team.id) ?? 0;
        const candidateHome = homeGamesByTeamId.get(candidate.id) ?? 0;
        score += Math.max(0, 9 - Math.abs(teamHome - candidateHome));
        return { candidate, index, score };
      })
      .filter((value): value is { candidate: Team; index: number; score: number } => Boolean(value))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return null;

    // Only randomize among candidates within 50 points of the leader, so
    // a div pair (300+) is never passed over for a non-div pair (100).
    const leaderScore = candidates[0].score;
    const within = candidates.filter(c => leaderScore - c.score <= 50);
    const top = within.slice(0, Math.min(4, within.length));
    const selected = top[Math.floor(Math.random() * top.length)];
    const opponent = selected.candidate;
    available.splice(selected.index, 1);

    // H/A direction. Second meetings between the same pair MUST flip
    // venues - otherwise division pairs can end up HH or AA, which the
    // NFL rotation forbids and which testers (wildbadger5) have flagged.
    // First meetings still use the home-count balance heuristic.
    const pairKey = makePairKey(team.id, opponent.id);
    const prevPairCount = pairCounts.get(pairKey) ?? 0;
    let homeTeamId: string;
    let awayTeamId: string;
    if (prevPairCount >= 1 && firstHomeByPair.has(pairKey)) {
      const firstHome = firstHomeByPair.get(pairKey)!;
      homeTeamId = firstHome === team.id ? opponent.id : team.id;
      awayTeamId = firstHome === team.id ? team.id : opponent.id;
    } else {
      const teamHome = homeGamesByTeamId.get(team.id) ?? 0;
      const opponentHome = homeGamesByTeamId.get(opponent.id) ?? 0;
      const shouldTeamBeHome = teamHome < opponentHome || (teamHome === opponentHome && Math.random() < 0.5);
      homeTeamId = shouldTeamBeHome ? team.id : opponent.id;
      awayTeamId = shouldTeamBeHome ? opponent.id : team.id;
      firstHomeByPair.set(pairKey, homeTeamId);
    }

    games.push(makeGame(homeTeamId, awayTeamId, week, season));
    gamesPlayedByTeamId.set(team.id, (gamesPlayedByTeamId.get(team.id) ?? 0) + 1);
    gamesPlayedByTeamId.set(opponent.id, (gamesPlayedByTeamId.get(opponent.id) ?? 0) + 1);
    homeGamesByTeamId.set(homeTeamId, (homeGamesByTeamId.get(homeTeamId) ?? 0) + 1);
    pairCounts.set(pairKey, prevPairCount + 1);
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

/**
 * Deterministic circle-method round robin - the guaranteed builder used when
 * the greedy fallback cannot converge (odd team counts, exotic layouts). Never
 * throws for any N >= 2. Each team plays up to 17 distinct opponents
 * (min(17, N-1)); in an odd league the team paired with the bye slot rests
 * that week, so a team plays 16 or 17 games with at most one bye. Home/away is
 * balanced greedily. Division records still populate because each division is
 * a subset of the round robin, so playoff seeding by division winner keeps
 * working.
 */
const BYE_SLOT = '__BYE__';

function circleRoundRobinSchedule(teams: Team[], season: number): GameResult[] {
  const n = teams.length;
  if (n < 2) return [];

  const gamesTarget = Math.min(17, n - 1);

  // The circle method needs an even slot count; add a bye placeholder if odd.
  const slots: string[] = shuffle(teams.map((t) => t.id));
  if (slots.length % 2 === 1) slots.push(BYE_SLOT);
  const slotCount = slots.length;
  const half = slotCount / 2;

  const homeGamesById = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const schedule: GameResult[] = [];

  // Fix the first slot; rotate the rest. Pair slot i with slot (slotCount-1-i)
  // each round. Over slotCount-1 rounds this is a complete single round robin,
  // so taking the first `gamesTarget` rounds yields distinct opponents.
  const rotating = slots.slice(1);
  let week = 0;
  for (let round = 0; round < gamesTarget; round++) {
    week += 1;
    const arrangement = [slots[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const a = arrangement[i];
      const b = arrangement[slotCount - 1 - i];
      if (a === BYE_SLOT || b === BYE_SLOT) continue; // that real team is on bye

      const aHome = homeGamesById.get(a) ?? 0;
      const bHome = homeGamesById.get(b) ?? 0;
      let homeTeamId: string;
      let awayTeamId: string;
      if (aHome < bHome || (aHome === bHome && (round + i) % 2 === 0)) {
        homeTeamId = a;
        awayTeamId = b;
      } else {
        homeTeamId = b;
        awayTeamId = a;
      }
      schedule.push(makeGame(homeTeamId, awayTeamId, week, season));
      homeGamesById.set(homeTeamId, (homeGamesById.get(homeTeamId) ?? 0) + 1);
    }
    rotating.unshift(rotating.pop()!);
  }

  return schedule;
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
