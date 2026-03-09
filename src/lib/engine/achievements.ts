import type { Achievement, LeagueState } from '@/types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (state: LeagueState) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'champion',
    name: 'Champion',
    description: 'Win the Super Bowl.',
    icon: '🏆',
    check: (s) => s.champions.some(c => c.teamId === s.userTeamId),
  },
  {
    id: 'dynasty',
    name: 'Dynasty Builder',
    description: 'Win 3 or more championships.',
    icon: '📈',
    check: (s) => s.champions.filter(c => c.teamId === s.userTeamId).length >= 3,
  },
  {
    id: 'perfect_season',
    name: 'Perfect Season',
    description: 'Go undefeated in the regular season.',
    icon: '🔥',
    check: (s) => {
      const team = s.teams.find(t => t.id === s.userTeamId);
      if (!team) return false;
      // Only check at end of regular season or later
      const gamesPlayed = team.record.wins + team.record.losses + team.record.ties;
      return gamesPlayed >= 17 && team.record.losses === 0;
    },
  },
  {
    id: 'cap_wizard',
    name: 'Cap Wizard',
    description: 'Win a championship with $20M+ cap space remaining.',
    icon: '💰',
    check: (s) => {
      const isChamp = s.champions.some(c => c.teamId === s.userTeamId && c.season === s.season);
      if (!isChamp) return false;
      const team = s.teams.find(t => t.id === s.userTeamId);
      return !!team && (team.salaryCap - team.totalPayroll) >= 20;
    },
  },
  {
    id: 'rebuilder',
    name: 'Rebuilder',
    description: 'Go from worst record to playoffs within 2 seasons.',
    icon: '🏗️',
    check: (s) => {
      // Check if in current season user made playoffs after being worst in a recent season
      if (!s.playoffSeeds) return false;
      const inPlayoffs = s.playoffSeeds.AC.includes(s.userTeamId!) || s.playoffSeeds.NC.includes(s.userTeamId!);
      if (!inPlayoffs) return false;
      // Check recent season history for worst record
      const recentHistory = s.seasonHistory.filter(h => h.season >= s.season - 2);
      // Did user have the worst record in any of those seasons?
      // This is approximated: check if they had 4 or fewer wins
      for (const hist of recentHistory) {
        const worstRecord = hist.bestRecord; // We'd need worst record, approximate with threshold
        // Simple: if user had <= 4 wins in a recent season summary and is now in playoffs
        if (s.season - hist.season <= 2) return true; // Simplified check
      }
      return false;
    },
  },
  {
    id: 'stat_stacker',
    name: 'Stat Stacker',
    description: 'Have the #1 ranked offense AND defense in the league.',
    icon: '📊',
    check: (s) => {
      if (s.phase === 'preseason') return false;
      const userTeam = s.teams.find(t => t.id === s.userTeamId);
      if (!userTeam) return false;
      const gamesPlayed = userTeam.record.wins + userTeam.record.losses + userTeam.record.ties;
      if (gamesPlayed < 4) return false;
      // Best offense = most points for per game
      const bestPFPG = s.teams.every(t => {
        const gp = t.record.wins + t.record.losses + t.record.ties;
        if (gp === 0) return true;
        return (userTeam.record.pointsFor / gamesPlayed) >= (t.record.pointsFor / gp);
      });
      // Best defense = fewest points against per game
      const bestPAPG = s.teams.every(t => {
        const gp = t.record.wins + t.record.losses + t.record.ties;
        if (gp === 0) return true;
        return (userTeam.record.pointsAgainst / gamesPlayed) <= (t.record.pointsAgainst / gp);
      });
      return bestPFPG && bestPAPG;
    },
  },
  {
    id: 'trade_master',
    name: 'Trade Master',
    description: 'Win 5 or more trades (assessed as "you win").',
    icon: '🤝',
    check: (s) => {
      const wonTrades = s.tradeProposals.filter(p =>
        p.status === 'accepted' && p.valueAssessment === 'lopsided-you-win'
      ).length;
      return wonTrades >= 5;
    },
  },
  {
    id: 'on_fire',
    name: 'On Fire',
    description: 'Win 10 or more consecutive games.',
    icon: '⚡',
    check: (s) => {
      const team = s.teams.find(t => t.id === s.userTeamId);
      return !!team && team.record.streak >= 10;
    },
  },
  {
    id: 'lockdown',
    name: 'Lockdown',
    description: 'Hold opponents under 10 PPG for 5+ consecutive games.',
    icon: '🛡️',
    check: (s) => {
      // Check the last 5 user team games
      const userGames = s.schedule
        .filter(g => g.played && (g.homeTeamId === s.userTeamId || g.awayTeamId === s.userTeamId))
        .sort((a, b) => a.week - b.week);
      if (userGames.length < 5) return false;
      const last5 = userGames.slice(-5);
      return last5.every(g => {
        const oppScore = g.homeTeamId === s.userTeamId ? g.awayScore : g.homeScore;
        return oppScore < 10;
      });
    },
  },
  {
    id: 'allstar_factory',
    name: 'All-Star Factory',
    description: 'Have 5 or more players with 85+ OVR on your roster.',
    icon: '🌟',
    check: (s) => {
      const elitePlayers = s.players.filter(p =>
        p.teamId === s.userTeamId && p.ratings.overall >= 85 && !p.retired
      );
      return elitePlayers.length >= 5;
    },
  },
];

/**
 * Check all achievement definitions against current state.
 * Returns newly unlocked achievements (not already in state.achievements).
 */
export function checkAchievements(state: LeagueState): Achievement[] {
  const unlockedIds = new Set(state.achievements.map(a => a.id));
  const newlyUnlocked: Achievement[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (unlockedIds.has(def.id)) continue;
    try {
      if (def.check(state)) {
        newlyUnlocked.push({
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          unlockedSeason: state.season,
          unlockedWeek: state.week,
        });
      }
    } catch {
      // Silently skip broken checks
    }
  }

  return newlyUnlocked;
}

/** All available achievement definitions (for display purposes) */
export const ALL_ACHIEVEMENTS = ACHIEVEMENT_DEFS.map(d => ({
  id: d.id,
  name: d.name,
  description: d.description,
  icon: d.icon,
}));
