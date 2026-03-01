import type { Player, PlayerStats, GameResult } from '@/types';

/**
 * Computes an aggregate offensive and defensive power rating for a roster.
 * Returns a value roughly in 50-100 range for typical NFL teams.
 */
function teamPower(roster: Player[]): { offense: number; defense: number } {
  let offSum = 0, offCount = 0;
  let defSum = 0, defCount = 0;

  for (const p of roster) {
    if (p.injury && p.injury.weeksLeft > 0) continue;
    const r = p.ratings;
    switch (p.position) {
      case 'QB':
        offSum += r.throwing * 2 + r.awareness + r.speed * 0.5;
        offCount += 3.5;
        break;
      case 'RB':
        offSum += r.carrying * 1.5 + r.speed + r.agility * 0.5;
        offCount += 3;
        break;
      case 'WR':
        offSum += r.catching * 1.5 + r.speed;
        offCount += 2.5;
        break;
      case 'TE':
        offSum += r.catching + r.blocking + r.strength * 0.5;
        offCount += 2.5;
        break;
      case 'OL':
        offSum += r.blocking * 1.5 + r.strength;
        offCount += 2.5;
        break;
      case 'DL':
        defSum += r.passRush * 1.5 + r.strength + r.tackling * 0.5;
        defCount += 3;
        break;
      case 'LB':
        defSum += r.tackling * 1.5 + r.coverage * 0.5 + r.speed * 0.5;
        defCount += 2.5;
        break;
      case 'CB':
        defSum += r.coverage * 2 + r.speed * 0.5;
        defCount += 2.5;
        break;
      case 'S':
        defSum += r.coverage + r.tackling + r.speed * 0.5;
        defCount += 2.5;
        break;
    }
  }

  return {
    offense: offCount > 0 ? offSum / offCount : 50,
    defense: defCount > 0 ? defSum / defCount : 50,
  };
}

function randomVariance(): number {
  return 0.85 + Math.random() * 0.3;
}

/**
 * Simulates a single drive. Returns points scored (0, 3, or 7).
 * Probability is based on the offensive power vs opposing defense.
 */
function simulateDrive(offPower: number, defPower: number): number {
  const advantage = (offPower - defPower) / 100;
  const tdChance = 0.20 + advantage * 0.15;
  const fgChance = 0.15 + advantage * 0.05;
  const roll = Math.random();

  if (roll < tdChance) return 7;
  if (roll < tdChance + fgChance) return 3;
  return 0;
}

/**
 * Generates individual player stats for a game based on team score.
 * This is a simplified stat allocation — not play-by-play.
 */
function allocateStats(
  roster: Player[],
  teamScore: number,
  opposingScore: number,
): Record<string, Partial<PlayerStats>> {
  const stats: Record<string, Partial<PlayerStats>> = {};
  const activePlayers = roster.filter(p => !p.injury || p.injury.weeksLeft === 0);

  const qb = activePlayers.find(p => p.position === 'QB');
  const rbs = activePlayers.filter(p => p.position === 'RB');
  const wrs = activePlayers.filter(p => p.position === 'WR');
  const tes = activePlayers.filter(p => p.position === 'TE');
  const defenders = activePlayers.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));

  const totalYards = (teamScore / 24) * (280 + Math.random() * 120);
  const passRatio = 0.55 + Math.random() * 0.15;
  const passYards = Math.round(totalYards * passRatio);
  const rushYards = Math.round(totalYards * (1 - passRatio));

  if (qb) {
    const attempts = Math.round(25 + Math.random() * 15);
    const compRate = 0.58 + (qb.ratings.throwing / 100) * 0.12;
    const completions = Math.round(attempts * compRate);
    stats[qb.id] = {
      gamesPlayed: 1,
      passAttempts: attempts,
      passCompletions: completions,
      passYards,
      passTDs: Math.max(0, Math.round(teamScore / 7 * 0.7 + (Math.random() - 0.3))),
      interceptions: Math.random() < 0.3 ? Math.ceil(Math.random() * 2) : 0,
    };
  }

  const totalRushAttempts = Math.round(20 + Math.random() * 12);
  for (let i = 0; i < rbs.length; i++) {
    const share = i === 0 ? 0.65 : 0.35 / (rbs.length - 1);
    const attempts = Math.round(totalRushAttempts * share);
    const yards = Math.round(rushYards * share * randomVariance());
    stats[rbs[i].id] = {
      gamesPlayed: 1,
      rushAttempts: attempts,
      rushYards: yards,
      rushTDs: Math.random() < (teamScore > 14 ? 0.4 : 0.2) ? 1 : 0,
    };
  }

  const receivers = [...wrs, ...tes];
  const totalTargets = stats[qb?.id ?? '']?.passAttempts ?? 30;
  for (let i = 0; i < receivers.length; i++) {
    const share = i < 2 ? 0.25 : 0.5 / Math.max(1, receivers.length - 2);
    const targets = Math.round(totalTargets * share);
    const catchRate = 0.55 + (receivers[i].ratings.catching / 100) * 0.2;
    const receptions = Math.round(targets * catchRate);
    const yards = Math.round(passYards * share * randomVariance());
    stats[receivers[i].id] = {
      gamesPlayed: 1,
      targets,
      receptions,
      receivingYards: yards,
      receivingTDs: Math.random() < 0.2 ? 1 : 0,
    };
  }

  const totalTackles = Math.round(45 + Math.random() * 20);
  for (let i = 0; i < defenders.length; i++) {
    const tackleShare = 1 / defenders.length;
    const tackles = Math.round(totalTackles * tackleShare * randomVariance());
    stats[defenders[i].id] = {
      gamesPlayed: 1,
      tackles,
      sacks: defenders[i].position === 'DL' && Math.random() < 0.25 ? 1 : 0,
      defensiveINTs: defenders[i].position === 'CB' && Math.random() < 0.08 ? 1 : 0,
    };
  }

  for (const p of activePlayers) {
    if (!stats[p.id]) {
      stats[p.id] = { gamesPlayed: 1 };
    }
  }

  return stats;
}

/**
 * Simulates a full game between two teams.
 * Each team gets ~12 possessions. Score is determined by drive outcomes.
 */
export function simulateGame(
  game: GameResult,
  homeRoster: Player[],
  awayRoster: Player[],
): GameResult {
  const homePower = teamPower(homeRoster);
  const awayPower = teamPower(awayRoster);

  const homeFieldBonus = 3;
  let homeScore = 0;
  let awayScore = 0;
  const possessions = 11 + Math.floor(Math.random() * 3);

  for (let i = 0; i < possessions; i++) {
    homeScore += simulateDrive(
      homePower.offense * randomVariance() + homeFieldBonus,
      awayPower.defense * randomVariance(),
    );
    awayScore += simulateDrive(
      awayPower.offense * randomVariance(),
      homePower.defense * randomVariance() + homeFieldBonus * 0.5,
    );
  }

  // Break ties with OT field goal
  if (homeScore === awayScore) {
    if (Math.random() < 0.55) homeScore += 3;
    else awayScore += 3;
  }

  const homeStats = allocateStats(homeRoster, homeScore, awayScore);
  const awayStats = allocateStats(awayRoster, awayScore, homeScore);

  return {
    ...game,
    homeScore,
    awayScore,
    played: true,
    playerStats: { ...homeStats, ...awayStats },
  };
}
