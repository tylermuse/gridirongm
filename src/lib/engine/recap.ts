/**
 * Text Recap Engine — "Gridiron Tonight"
 *
 * Analyzes weekly game results and generates narrative segments for a
 * weekly recap show. Runs entirely client-side using existing sim data.
 *
 * Storyline detection:
 *   - Upsets (lower-record team beats higher-record team by 14+)
 *   - Comebacks (trailing by 14+ at half and winning)
 *   - Blowouts (margin ≥ 28)
 *   - Shootouts (combined score ≥ 70)
 *   - Defensive battles (combined score ≤ 16)
 *   - Standout performances (300+ pass yards, 150+ rush yards, 3+ TDs, etc.)
 *   - Win/loss streaks (4+)
 *   - Division rivalry games
 *   - Player milestones
 */

import type { GameResult, Player, PlayerStats, Team } from '@/types';

/* ─── Public Types ─── */

export interface RecapSegment {
  type: 'headline' | 'upset' | 'comeback' | 'blowout' | 'shootout' | 'defensive' | 'performance' | 'streak' | 'rivalry' | 'milestone' | 'summary';
  title: string;
  body: string;
  /** IDs of teams involved */
  teamIds: string[];
  /** IDs of players mentioned */
  playerIds: string[];
  /** Priority for ordering (higher = more important) */
  priority: number;
  /** Emoji icon for the segment */
  icon: string;
}

export interface WeeklyRecap {
  season: number;
  week: number;
  segments: RecapSegment[];
}

/* ─── Helpers ─── */

function teamName(team: Team): string {
  return `${team.city} ${team.name}`;
}

function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

function getTeam(teams: Team[], id: string): Team | undefined {
  return teams.find(t => t.id === id);
}

function getPlayer(players: Player[], id: string): Player | undefined {
  return players.find(p => p.id === id);
}

function winPct(team: Team): number {
  const total = team.record.wins + team.record.losses;
  return total === 0 ? 0.5 : team.record.wins / total;
}

/** Get the halftime score from scoringPlays (sum of Q1 + Q2 plays) */
function halftimeScore(game: GameResult): [number, number] {
  let away = 0, home = 0;
  for (const play of game.scoringPlays ?? []) {
    if (play.quarter > 2) break;
    if (play.teamId === game.awayTeamId) away += play.points;
    else home += play.points;
  }
  return [away, home];
}

/** Find the top performer for a given stat in a game */
function topStat(
  game: GameResult,
  players: Player[],
  statKey: keyof PlayerStats,
  teamId?: string
): { player: Player; value: number } | null {
  let best: { player: Player; value: number } | null = null;
  for (const [pid, stats] of Object.entries(game.playerStats)) {
    const val = (stats[statKey] as number) ?? 0;
    if (val <= 0) continue;
    if (teamId) {
      const p = getPlayer(players, pid);
      if (!p || p.teamId !== teamId) continue;
    }
    if (!best || val > best.value) {
      const player = getPlayer(players, pid);
      if (player) best = { player, value: val };
    }
  }
  return best;
}

/* ─── Segment Generators ─── */

function detectUpsets(games: GameResult[], teams: Team[], players: Player[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    const homeWP = winPct(home);
    const awayWP = winPct(away);
    const margin = Math.abs(game.homeScore - game.awayScore);
    const homeWon = game.homeScore > game.awayScore;

    const winnerWP = homeWon ? homeWP : awayWP;
    const loserWP = homeWon ? awayWP : homeWP;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;

    // Upset: winner had significantly worse record than loser
    if (loserWP - winnerWP >= 0.25 && loser.record.wins >= 3) {
      const topPerf = topStat(game, players, 'passYards', winner.id) ||
                      topStat(game, players, 'rushYards', winner.id);
      const perfLine = topPerf
        ? ` ${playerName(topPerf.player)} led the charge for the victors.`
        : '';

      segments.push({
        type: 'upset',
        title: `Upset Alert: ${teamName(winner)} Stun ${teamName(loser)}`,
        body: `The ${teamName(winner)} pulled off a stunning ${homeWon ? game.homeScore : game.awayScore}-${homeWon ? game.awayScore : game.homeScore} upset over the ${teamName(loser)} (${loser.record.wins}-${loser.record.losses}).${perfLine}`,
        teamIds: [winner.id, loser.id],
        playerIds: topPerf ? [topPerf.player.id] : [],
        priority: 90 + margin,
        icon: '😱',
      });
    }
  }
  return segments;
}

function detectComebacks(games: GameResult[], teams: Team[], players: Player[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    if (!game.scoringPlays || game.scoringPlays.length === 0) continue;
    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    const [halfAway, halfHome] = halftimeScore(game);
    const homeWon = game.homeScore > game.awayScore;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;

    // Comeback: winning team was trailing by 14+ at halftime
    const winnerHalf = homeWon ? halfHome : halfAway;
    const loserHalf = homeWon ? halfAway : halfHome;
    const halfDeficit = loserHalf - winnerHalf;

    if (halfDeficit >= 14) {
      const qb = topStat(game, players, 'passTDs', winner.id);
      const qbLine = qb && qb.value >= 2
        ? ` ${playerName(qb.player)} threw ${qb.value} TDs in the second half rally.`
        : '';

      segments.push({
        type: 'comeback',
        title: `Epic Comeback: ${teamName(winner)} Erase ${halfDeficit}-Point Deficit`,
        body: `Down ${winnerHalf}-${loserHalf} at the half, the ${teamName(winner)} stormed back to beat the ${teamName(loser)} ${homeWon ? game.homeScore : game.awayScore}-${homeWon ? game.awayScore : game.homeScore}.${qbLine}`,
        teamIds: [winner.id, loser.id],
        playerIds: qb ? [qb.player.id] : [],
        priority: 95 + halfDeficit,
        icon: '🔥',
      });
    }
  }
  return segments;
}

function detectBlowouts(games: GameResult[], teams: Team[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    const margin = Math.abs(game.homeScore - game.awayScore);
    if (margin < 28) continue;

    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    const homeWon = game.homeScore > game.awayScore;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;

    segments.push({
      type: 'blowout',
      title: `Blowout: ${teamName(winner)} Dominate ${teamName(loser)}`,
      body: `The ${teamName(winner)} cruised to a ${homeWon ? game.homeScore : game.awayScore}-${homeWon ? game.awayScore : game.homeScore} blowout victory, winning by ${margin} points.`,
      teamIds: [winner.id, loser.id],
      playerIds: [],
      priority: 50 + margin,
      icon: '💪',
    });
  }
  return segments;
}

function detectShootouts(games: GameResult[], teams: Team[], players: Player[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    const total = game.homeScore + game.awayScore;
    if (total < 70) continue;

    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    const homeWon = game.homeScore > game.awayScore;
    const winner = homeWon ? home : away;

    const qb1 = topStat(game, players, 'passYards', home.id);
    const qb2 = topStat(game, players, 'passYards', away.id);
    let qbLine = '';
    if (qb1 && qb2) {
      qbLine = ` ${playerName(qb1.player)} (${qb1.value} yds) and ${playerName(qb2.player)} (${qb2.value} yds) traded haymakers all afternoon.`;
    }

    segments.push({
      type: 'shootout',
      title: `Shootout: ${game.homeScore}-${game.awayScore} Thriller`,
      body: `The ${teamName(winner)} edged out a ${game.homeScore}-${game.awayScore} shootout (${total} combined points).${qbLine}`,
      teamIds: [home.id, away.id],
      playerIds: [qb1?.player.id, qb2?.player.id].filter(Boolean) as string[],
      priority: 70 + total - 70,
      icon: '🎆',
    });
  }
  return segments;
}

function detectDefensiveBattles(games: GameResult[], teams: Team[], players: Player[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    const total = game.homeScore + game.awayScore;
    if (total > 16) continue;

    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    const homeWon = game.homeScore > game.awayScore;
    const winner = homeWon ? home : away;

    const topDef = topStat(game, players, 'sacks') || topStat(game, players, 'tackles');
    const defLine = topDef
      ? ` ${playerName(topDef.player)} anchored the defense.`
      : '';

    segments.push({
      type: 'defensive',
      title: `Defensive Slugfest: ${game.homeScore}-${game.awayScore}`,
      body: `The ${teamName(winner)} ground out a ${game.homeScore}-${game.awayScore} victory in a bruising defensive battle.${defLine}`,
      teamIds: [home.id, away.id],
      playerIds: topDef ? [topDef.player.id] : [],
      priority: 55,
      icon: '🛡️',
    });
  }
  return segments;
}

function detectStandoutPerformances(games: GameResult[], teams: Team[], players: Player[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    // 300+ passing yards
    for (const [pid, stats] of Object.entries(game.playerStats)) {
      const p = getPlayer(players, pid);
      if (!p) continue;
      const team = getTeam(teams, p.teamId ?? '');
      if (!team) continue;

      const passYds = stats.passYards ?? 0;
      const passTDs = stats.passTDs ?? 0;
      const rushYds = stats.rushYards ?? 0;
      const rushTDs = stats.rushTDs ?? 0;
      const recYds = stats.receivingYards ?? 0;
      const recTDs = stats.receivingTDs ?? 0;
      const sacks = stats.sacks ?? 0;
      const defINTs = stats.defensiveINTs ?? 0;

      // QB: 300+ yards or 4+ TDs
      if (passYds >= 300 || passTDs >= 4) {
        const lines: string[] = [];
        if (passYds >= 300) lines.push(`${passYds} passing yards`);
        if (passTDs >= 4) lines.push(`${passTDs} touchdown passes`);
        segments.push({
          type: 'performance',
          title: `${playerName(p)} Goes Off for ${teamName(team)}`,
          body: `${playerName(p)} put on a show with ${lines.join(' and ')}, leading the ${teamName(team)} offense.`,
          teamIds: [team.id],
          playerIds: [p.id],
          priority: 60 + passYds / 10 + passTDs * 5,
          icon: '⭐',
        });
      }

      // RB: 150+ rush yards or 3+ rush TDs
      if (rushYds >= 150 || rushTDs >= 3) {
        const lines: string[] = [];
        if (rushYds >= 150) lines.push(`${rushYds} rushing yards`);
        if (rushTDs >= 3) lines.push(`${rushTDs} rushing TDs`);
        segments.push({
          type: 'performance',
          title: `${playerName(p)} Dominates on the Ground`,
          body: `${playerName(p)} of the ${teamName(team)} was unstoppable on the ground with ${lines.join(' and ')}.`,
          teamIds: [team.id],
          playerIds: [p.id],
          priority: 65 + rushYds / 10 + rushTDs * 5,
          icon: '🏃',
        });
      }

      // WR/TE: 150+ receiving yards or 3+ receiving TDs
      if (recYds >= 150 || recTDs >= 3) {
        const lines: string[] = [];
        if (recYds >= 150) lines.push(`${recYds} receiving yards`);
        if (recTDs >= 3) lines.push(`${recTDs} receiving TDs`);
        segments.push({
          type: 'performance',
          title: `${playerName(p)} Lights Up the Secondary`,
          body: `${playerName(p)} torched defenses for ${lines.join(' and ')} in a standout showing for the ${teamName(team)}.`,
          teamIds: [team.id],
          playerIds: [p.id],
          priority: 65 + recYds / 10 + recTDs * 5,
          icon: '🎯',
        });
      }

      // Defensive: 3+ sacks or 2+ INTs
      if (sacks >= 3 || defINTs >= 2) {
        const lines: string[] = [];
        if (sacks >= 3) lines.push(`${sacks} sacks`);
        if (defINTs >= 2) lines.push(`${defINTs} interceptions`);
        segments.push({
          type: 'performance',
          title: `${playerName(p)} Wreaks Havoc on Defense`,
          body: `${playerName(p)} terrorized the opposition with ${lines.join(' and ')} for the ${teamName(team)}.`,
          teamIds: [team.id],
          playerIds: [p.id],
          priority: 70 + sacks * 5 + defINTs * 8,
          icon: '🦅',
        });
      }
    }
  }

  // Deduplicate: keep best per player
  const byPlayer = new Map<string, RecapSegment>();
  for (const seg of segments) {
    for (const pid of seg.playerIds) {
      const existing = byPlayer.get(pid);
      if (!existing || seg.priority > existing.priority) {
        byPlayer.set(pid, seg);
      }
    }
  }
  return Array.from(byPlayer.values());
}

function detectStreaks(teams: Team[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const team of teams) {
    const streak = team.record.streak;
    if (streak >= 4) {
      segments.push({
        type: 'streak',
        title: `${teamName(team)} Ride ${streak}-Game Win Streak`,
        body: `The ${teamName(team)} have now won ${streak} straight games and are ${team.record.wins}-${team.record.losses} on the season.`,
        teamIds: [team.id],
        playerIds: [],
        priority: 40 + streak * 3,
        icon: '📈',
      });
    } else if (streak <= -4) {
      const lossStreak = Math.abs(streak);
      segments.push({
        type: 'streak',
        title: `${teamName(team)} in Freefall: ${lossStreak} Straight Losses`,
        body: `The ${teamName(team)} have dropped ${lossStreak} consecutive games, falling to ${team.record.wins}-${team.record.losses} on the season. Fans are calling for changes.`,
        teamIds: [team.id],
        playerIds: [],
        priority: 45 + lossStreak * 3,
        icon: '📉',
      });
    }
  }
  return segments;
}

function detectRivalries(games: GameResult[], teams: Team[]): RecapSegment[] {
  const segments: RecapSegment[] = [];

  for (const game of games) {
    const home = getTeam(teams, game.homeTeamId);
    const away = getTeam(teams, game.awayTeamId);
    if (!home || !away) continue;

    // Division rivalry: same conference AND division
    if (home.conference === away.conference && home.division === away.division) {
      const margin = Math.abs(game.homeScore - game.awayScore);
      const homeWon = game.homeScore > game.awayScore;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;

      // Only highlight close division games (margin ≤ 7) or important ones
      if (margin <= 7) {
        segments.push({
          type: 'rivalry',
          title: `Division Thriller: ${teamName(winner)} Edge ${teamName(loser)}`,
          body: `In a tight ${home.conference} ${home.division} showdown, the ${teamName(winner)} outlasted the ${teamName(loser)} ${homeWon ? game.homeScore : game.awayScore}-${homeWon ? game.awayScore : game.homeScore}.`,
          teamIds: [home.id, away.id],
          playerIds: [],
          priority: 55 + (7 - margin) * 3,
          icon: '⚔️',
        });
      }
    }
  }
  return segments;
}

function generateWeekSummary(games: GameResult[], teams: Team[], week: number): RecapSegment {
  // Quick standings summary
  const sorted = [...teams].sort((a, b) => {
    const wpA = winPct(a);
    const wpB = winPct(b);
    return wpB - wpA;
  });

  const top3 = sorted.slice(0, 3);
  const bottom = sorted[sorted.length - 1];

  const lines = top3.map(t => `${t.abbreviation} (${t.record.wins}-${t.record.losses})`).join(', ');
  const totalPoints = games.reduce((sum, g) => sum + g.homeScore + g.awayScore, 0);
  const avgScore = Math.round(totalPoints / (games.length * 2));

  return {
    type: 'summary',
    title: `Week ${week} Around the League`,
    body: `${games.length} games played this week with an average score of ${avgScore} points. League leaders: ${lines}. The ${teamName(bottom!)} (${bottom!.record.wins}-${bottom!.record.losses}) sit at the bottom of the standings.`,
    teamIds: [...top3.map(t => t.id), bottom!.id],
    playerIds: [],
    priority: 10,
    icon: '📋',
  };
}

/* ─── Main Generator ─── */

/**
 * Generate a full weekly recap from game results.
 *
 * @param games - Games played this week (already simulated)
 * @param teams - Teams with updated records (post-sim)
 * @param players - All players
 * @param season - Current season number
 * @param week - Week number that was just played
 */
export function generateWeeklyRecap(
  games: GameResult[],
  teams: Team[],
  players: Player[],
  season: number,
  week: number,
): WeeklyRecap {
  const playedGames = games.filter(g => g.played);
  if (playedGames.length === 0) return { season, week, segments: [] };

  const allSegments: RecapSegment[] = [
    ...detectComebacks(playedGames, teams, players),
    ...detectUpsets(playedGames, teams, players),
    ...detectBlowouts(playedGames, teams),
    ...detectShootouts(playedGames, teams, players),
    ...detectDefensiveBattles(playedGames, teams, players),
    ...detectStandoutPerformances(playedGames, teams, players),
    ...detectStreaks(teams),
    ...detectRivalries(playedGames, teams),
    generateWeekSummary(playedGames, teams, week),
  ];

  // Sort by priority (highest first), cap at ~10 segments
  allSegments.sort((a, b) => b.priority - a.priority);
  const segments = allSegments.slice(0, 10);

  return { season, week, segments };
}
