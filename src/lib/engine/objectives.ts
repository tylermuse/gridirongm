/**
 * Owner Objectives — generated at the start of each season.
 * 2-3 objectives based on roster quality and recent history.
 */

import type { Team, Player, OwnerObjective } from '@/types';

function uuid(): string {
  return crypto.randomUUID();
}

export function generateSeasonObjectives(
  team: Team,
  players: Player[],
  season: number,
  lastSeasonPlayoffResult?: string,
): OwnerObjective[] {
  const objectives: OwnerObjective[] = [];
  const roster = players.filter(p => p.teamId === team.id && !p.retired);
  const avgOvr = roster.length > 0
    ? Math.round(roster.reduce((s, p) => s + p.ratings.overall, 0) / roster.length)
    : 60;

  // 1. Always: win target based on roster quality
  let winTarget: number;
  if (avgOvr >= 72) {
    winTarget = 10 + Math.floor(Math.random() * 3); // 10-12
  } else if (avgOvr >= 64) {
    winTarget = 7 + Math.floor(Math.random() * 3); // 7-9
  } else {
    winTarget = 4 + Math.floor(Math.random() * 3); // 4-6
  }
  objectives.push({
    id: uuid(),
    description: `Win ${winTarget} games`,
    type: 'wins',
    target: winTarget,
    season,
    status: 'active',
  });

  // 2. Context-based objective
  if (avgOvr >= 78) {
    objectives.push({
      id: uuid(),
      description: 'Win the championship',
      type: 'championship',
      target: 'champion',
      season,
      status: 'active',
    });
  } else if (avgOvr >= 72) {
    objectives.push({
      id: uuid(),
      description: 'Reach the conference championship',
      type: 'playoffs',
      target: 'conference',
      season,
      status: 'active',
    });
  } else if (avgOvr >= 64) {
    objectives.push({
      id: uuid(),
      description: 'Make the playoffs',
      type: 'playoffs',
      target: 'wildcard',
      season,
      status: 'active',
    });
  } else if (lastSeasonPlayoffResult === 'missed' || !lastSeasonPlayoffResult) {
    // Bad team: development objective
    const youngPlayers = roster.filter(p => p.age <= 25 && p.potential >= 70);
    if (youngPlayers.length >= 2) {
      objectives.push({
        id: uuid(),
        description: 'Develop 2 players by 5+ OVR points',
        type: 'development',
        target: 2,
        season,
        status: 'active',
      });
    } else {
      objectives.push({
        id: uuid(),
        description: 'Draft and start a rookie',
        type: 'development',
        target: 1,
        season,
        status: 'active',
      });
    }
  }

  // 3. Cap objective if over the cap
  if (team.totalPayroll > team.salaryCap) {
    objectives.push({
      id: uuid(),
      description: 'Get under the salary cap',
      type: 'cap',
      target: team.salaryCap,
      season,
      status: 'active',
    });
  }

  return objectives.slice(0, 3); // max 3
}

/**
 * Evaluate objectives at end of season.
 */
export function evaluateObjectives(
  objectives: OwnerObjective[],
  team: Team,
  playoffResult: string, // 'missed' | 'wildcard' | 'divisional' | 'conference' | 'runnerup' | 'champion'
  players: Player[],
  season: number,
): OwnerObjective[] {
  const PLAYOFF_ORDER = ['missed', 'wildcard', 'divisional', 'conference', 'runnerup', 'champion'];

  return objectives.map(obj => {
    if (obj.season !== season || obj.status !== 'active') return obj;

    let completed = false;

    switch (obj.type) {
      case 'wins':
        completed = team.record.wins >= (obj.target as number);
        break;

      case 'playoffs': {
        const targetIdx = PLAYOFF_ORDER.indexOf(obj.target as string);
        const actualIdx = PLAYOFF_ORDER.indexOf(playoffResult);
        completed = actualIdx >= targetIdx && actualIdx > 0;
        break;
      }

      case 'championship':
        completed = playoffResult === 'champion';
        break;

      case 'cap':
        completed = team.totalPayroll <= team.salaryCap;
        break;

      case 'development': {
        const roster = players.filter(p => p.teamId === team.id && !p.retired);
        if (obj.description.includes('Develop')) {
          // Check if N players improved by 5+ OVR
          const improved = roster.filter(p => {
            const lastSeason = p.seasonLog?.find(s => s.season === season - 1);
            if (!lastSeason) return false;
            // Compare current OVR to start-of-season (rough: use last season's endpoint)
            return p.ratings.overall - (p.ratings.overall - 5) >= 5; // simplified
          });
          // Simplified: just check if young players have high OVR
          const youngImproved = roster.filter(p => p.age <= 26 && p.experience >= 1 && p.ratings.overall >= 65);
          completed = youngImproved.length >= (obj.target as number);
        } else {
          // "Draft and start a rookie"
          const rookieStarter = roster.find(p => p.experience === 1 && p.stats.gamesPlayed >= 10);
          completed = !!rookieStarter;
        }
        break;
      }
    }

    return { ...obj, status: completed ? 'completed' : 'failed' };
  });
}
