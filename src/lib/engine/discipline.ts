/**
 * Discipline & Suspensions System
 *
 * Each player has a `discipline` rating (0-100, default 70). Low-discipline
 * players risk suspension events each week. Events generate news, fines
 * (cap hit), and game suspensions (player unavailable in depth chart).
 *
 * Event types:
 *   - Flagrant Hit: 1-2 game suspension (DL, LB more likely)
 *   - Conduct Violation: 2-4 game suspension (any position)
 *   - Failed Drug Test: 4-6 game suspension (any position)
 *   - Ref Argument: 1 game suspension, fine only (any position)
 *   - Practice Incident: 1 game, morale hit to team (low mood + low discipline)
 *
 * Discipline rating is visible during scouting (draft) and affects mood.
 */

import type { Player, NewsItem, LeagueSettings } from '@/types';

interface DisciplineEvent {
  playerId: string;
  playerName: string;
  teamId: string;
  type: 'flagrant_hit' | 'conduct' | 'drug_test' | 'ref_argument' | 'practice_incident';
  gamesLeft: number;
  fine: number;
  headline: string;
}

const EVENT_CONFIG = {
  flagrant_hit: {
    label: 'Flagrant Hit',
    gamesRange: [1, 2],
    fineRange: [0.2, 0.5], // in millions
    positionWeights: { DL: 3, LB: 2.5, S: 1.5, CB: 1, RB: 1, OL: 0.8, WR: 0.5, TE: 0.5, QB: 0.2, K: 0.1, P: 0.1 } as Record<string, number>,
    templates: [
      '{name} has been suspended {games} game{s} for a flagrant hit during practice.',
      '{name} received a {games}-game suspension after an illegal hit in team drills.',
    ],
  },
  conduct: {
    label: 'Conduct Violation',
    gamesRange: [2, 4],
    fineRange: [0.5, 2.0],
    positionWeights: {} as Record<string, number>,
    templates: [
      '{name} suspended {games} game{s} for violating the league\'s personal conduct policy.',
      'The league has suspended {name} {games} game{s} following an off-field conduct violation.',
    ],
  },
  drug_test: {
    label: 'Failed Drug Test',
    gamesRange: [4, 6],
    fineRange: [1.0, 3.0],
    positionWeights: {} as Record<string, number>,
    templates: [
      '{name} has been suspended {games} game{s} after failing a random drug test.',
      '{name} tested positive during a random screening and will miss {games} game{s}.',
    ],
  },
  ref_argument: {
    label: 'Referee Confrontation',
    gamesRange: [1, 1],
    fineRange: [0.1, 0.3],
    positionWeights: {} as Record<string, number>,
    templates: [
      '{name} fined and suspended 1 game after a confrontation with officials.',
      '{name} will miss 1 game following an ejection and verbal altercation with referees.',
    ],
  },
  practice_incident: {
    label: 'Practice Incident',
    gamesRange: [1, 1],
    fineRange: [0.05, 0.15],
    positionWeights: {} as Record<string, number>,
    templates: [
      '{name} suspended 1 game after a fight during team practice.',
      '{name} has been disciplined with a 1-game suspension for a practice altercation.',
    ],
  },
};

/**
 * Assign a discipline rating to a player based on their personality and
 * draft profile. Called during player generation.
 */
export function generateDiscipline(personality?: string, draftProfile?: string): number {
  let base = 72 + Math.floor(Math.random() * 22); // 72-93
  if (personality === 'red_flag') base -= 20;
  else if (personality === 'high_character') base += 7;
  if (draftProfile === 'bust') base -= 5;
  return Math.max(20, Math.min(99, base));
}

/**
 * Run discipline checks for all players on a team after a simmed week.
 * Returns any discipline events that occurred.
 *
 * Target rates (at suspensionFrequency=1.0):
 *   - League-wide: ~50-80 suspensions per 17-week season across 32 teams
 *   - Per team avg: ~1.5-2.5 per season
 *   - High discipline (80+): <2% per season
 *   - Low discipline (≤40): ~15-20% per season
 */
export function checkDisciplineEvents(
  players: Player[],
  userTeamId: string,
  season: number,
  week: number,
  suspensionFrequency = 1.0,
): { events: DisciplineEvent[]; updatedPlayers: Player[] } {
  const events: DisciplineEvent[] = [];
  if (suspensionFrequency <= 0) return { events, updatedPlayers: players };

  const updatedPlayers = players.map(p => {
    if (p.retired || !p.teamId || p.suspension) return p;

    const discipline = p.discipline ?? 70;

    // Redesigned probability curve (per player per week):
    //   discipline 90 → ~0.0003  (~0.5% per season)
    //   discipline 70 → ~0.002   (~3.4% per season per player)
    //   discipline 50 → ~0.008   (~13% per season per player)
    //   discipline 40 → ~0.016   (~24% per season per player)
    //   discipline 20 → ~0.04    (~50% per season per player)
    // League-wide with avg discipline ~82: ~40-60 suspensions per 17-week season
    const rawChance = Math.pow((100 - discipline) / 80, 2.5) * 0.04;
    const baseChance = Math.max(0.00005, rawChance);

    // Low mood increases risk slightly
    const moodMultiplier = p.mood < 30 ? 1.5 : p.mood < 50 ? 1.2 : 1.0;

    if (Math.random() >= baseChance * moodMultiplier * suspensionFrequency) return p;

    // An event occurred — pick the type
    const typeRoll = Math.random();
    let eventType: keyof typeof EVENT_CONFIG;
    if (typeRoll < 0.30) eventType = 'flagrant_hit';
    else if (typeRoll < 0.50) eventType = 'conduct';
    else if (typeRoll < 0.65) eventType = 'drug_test';
    else if (typeRoll < 0.85) eventType = 'ref_argument';
    else eventType = 'practice_incident';

    // Position weight check for flagrant hits
    const config = EVENT_CONFIG[eventType];
    if (eventType === 'flagrant_hit') {
      const posWeight = config.positionWeights[p.position] ?? 1;
      if (Math.random() > posWeight / 3) return p; // Position doesn't fit
    }

    const [minGames, maxGames] = config.gamesRange;
    const gamesLeft = minGames + Math.floor(Math.random() * (maxGames - minGames + 1));
    const [minFine, maxFine] = config.fineRange;
    const fine = Math.round((minFine + Math.random() * (maxFine - minFine)) * 10) / 10;

    const template = config.templates[Math.floor(Math.random() * config.templates.length)];
    const headline = template
      .replace('{name}', `${p.firstName} ${p.lastName}`)
      .replace('{games}', String(gamesLeft))
      .replace('{s}', gamesLeft > 1 ? 's' : '');

    events.push({
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      teamId: p.teamId!,
      type: eventType,
      gamesLeft,
      fine,
      headline,
    });

    // Apply suspension + discipline hit
    return {
      ...p,
      suspension: { gamesLeft, reason: config.label, fine },
      discipline: Math.max(20, discipline - Math.floor(Math.random() * 5 + 2)), // drops 2-6
      mood: Math.max(0, p.mood - 10), // mood drops
    };
  });

  return { events, updatedPlayers };
}

/**
 * Pure eligibility check: is this player suspended this game?
 * Used by every lineup-construction site so the discipline state flag set
 * by checkDisciplineEvents actually keeps the player out of the box score.
 *
 * agarre3552 (5/14): the discipline event headlines were firing but
 * suspended players still played the next game. Root cause was that the
 * live-coach (Watch Live) path and the playoff sim paths in store.ts
 * filtered by teamId only — the auto-sim regular-season path was the only
 * place that checked p.suspension. Centralizing the check here so all
 * paths stay in lockstep.
 */
export function isPlayerSuspended(player: Pick<Player, 'suspension'>): boolean {
  return !!player.suspension && (player.suspension.gamesLeft ?? 0) > 0;
}

/**
 * Decrement suspension counters after a simmed week.
 * Players whose suspension reaches 0 are cleared.
 */
export function tickSuspensions(players: Player[]): Player[] {
  return players.map(p => {
    if (!p.suspension || p.suspension.gamesLeft <= 0) {
      return p.suspension ? { ...p, suspension: undefined } : p;
    }
    const gamesLeft = p.suspension.gamesLeft - 1;
    if (gamesLeft <= 0) {
      return { ...p, suspension: undefined };
    }
    return { ...p, suspension: { ...p.suspension, gamesLeft } };
  });
}

/**
 * Generate discipline news items from events.
 */
export function disciplineNewsItems(
  events: DisciplineEvent[],
  userTeamId: string,
  season: number,
  week: number,
): NewsItem[] {
  return events.map(e => ({
    id: crypto.randomUUID(),
    season,
    week,
    type: 'system' as const,
    teamId: e.teamId,
    playerIds: [e.playerId],
    headline: e.headline,
    body: `Fine: $${e.fine}M. Suspended ${e.gamesLeft} game${e.gamesLeft > 1 ? 's' : ''}.`,
    isUserTeam: e.teamId === userTeamId,
  }));
}
