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

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Weighted random pick — higher weight = higher chance */
function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Play types ──────────────────────────────────────────────────────────────

type PlayResult = {
  type: 'pass' | 'rush' | 'sack' | 'interception' | 'fieldGoal' | 'punt';
  yards: number;
  touchdown: boolean;
  turnover: boolean;
  passer?: Player;
  rusher?: Player;
  receiver?: Player;
  tackler?: Player;
  sacker?: Player;
  interceptor?: Player;
  kicker?: Player;
  fieldGoalMade?: boolean;
};

// ── Play-by-play simulation ─────────────────────────────────────────────────

/**
 * Simulates a single offensive play.
 * Starters (index 0 in roster order) get heavily favored via weighting.
 */
function simulatePlay(
  offense: Player[],
  defense: Player[],
  down: number,
  yardsToGo: number,
  fieldPosition: number, // yards from own end zone (0-100)
): PlayResult {
  const qbs = offense.filter(p => p.position === 'QB' && (!p.injury || p.injury.weeksLeft === 0));
  const rbs = offense.filter(p => p.position === 'RB' && (!p.injury || p.injury.weeksLeft === 0));
  const wrs = offense.filter(p => p.position === 'WR' && (!p.injury || p.injury.weeksLeft === 0));
  const tes = offense.filter(p => p.position === 'TE' && (!p.injury || p.injury.weeksLeft === 0));
  const ols = offense.filter(p => p.position === 'OL' && (!p.injury || p.injury.weeksLeft === 0));
  const dls = defense.filter(p => p.position === 'DL' && (!p.injury || p.injury.weeksLeft === 0));
  const lbs = defense.filter(p => p.position === 'LB' && (!p.injury || p.injury.weeksLeft === 0));
  const cbs = defense.filter(p => p.position === 'CB' && (!p.injury || p.injury.weeksLeft === 0));
  const safeties = defense.filter(p => p.position === 'S' && (!p.injury || p.injury.weeksLeft === 0));
  const allDefenders = [...dls, ...lbs, ...cbs, ...safeties];

  const qb = qbs[0]; // starter QB
  const receivers = [...wrs, ...tes];

  // OL blocking power
  const olPower = ols.length > 0
    ? ols.reduce((s, p) => s + p.ratings.blocking * 1.2 + p.ratings.strength, 0) / ols.length
    : 50;
  // DL rush power
  const dlPower = dls.length > 0
    ? dls.reduce((s, p) => s + p.ratings.passRush * 1.2 + p.ratings.strength, 0) / dls.length
    : 50;

  // Decide pass vs rush (weighted by situation)
  const passChance = down >= 3 && yardsToGo > 5 ? 0.72 :
                     down >= 3 ? 0.60 :
                     down === 1 ? 0.48 : 0.55;

  const isPass = Math.random() < passChance;

  if (isPass && qb && receivers.length > 0) {
    // ── Sack check ──
    // NFL average: ~6.5% of pass plays result in a sack (~2.3 sacks per team per game)
    // Top pass rusher gets ~8-12 sacks per season (not 25+), so spread sacks across DL
    const sackChance = clamp((dlPower - olPower) / 500 + 0.05, 0.03, 0.08);
    if (Math.random() < sackChance) {
      const sackYards = -(3 + Math.floor(Math.random() * 6));
      // Spread sacks more evenly across DL — reduce starter dominance
      const sacker = dls.length > 0
        ? weightedPick(dls, dls.map((p, i) => (i === 0 ? 3 : i === 1 ? 2.5 : 1.5) * (p.ratings.passRush / 70)))
        : allDefenders[0];
      return { type: 'sack', yards: sackYards, touchdown: false, turnover: false, passer: qb, sacker };
    }

    // ── Pick receiver (starters get much more usage) ──
    const recWeights = receivers.map((r, i) => {
      const starterBonus = i === 0 ? 6 : i === 1 ? 4 : i === 2 ? 2.5 : 1;
      return starterBonus * (r.ratings.catching / 70);
    });
    const target = weightedPick(receivers, recWeights);

    // ── Coverage matchup ──
    const coverageDefender = cbs.length > 0
      ? cbs[Math.min(receivers.indexOf(target), cbs.length - 1)]
      : allDefenders.length > 0 ? allDefenders[0] : null;
    const coverageRating = coverageDefender
      ? coverageDefender.ratings.coverage
      : 50;

    // ── Interception check ──
    const intChance = clamp(
      (coverageRating - qb.ratings.throwing) / 400 + 0.03,
      0.015, 0.07,
    );
    if (Math.random() < intChance) {
      const interceptor = coverageDefender ?? (cbs[0] || safeties[0] || allDefenders[0]);
      return {
        type: 'interception', yards: 0, touchdown: false, turnover: true,
        passer: qb, receiver: target, interceptor,
      };
    }

    // ── Completion check ──
    const compBase = 0.52 + (qb.ratings.throwing / 100) * 0.12 + (target.ratings.catching / 100) * 0.08;
    const compRate = clamp(compBase - (coverageRating / 100) * 0.10, 0.30, 0.78);

    if (Math.random() < compRate) {
      // Completed pass — yards tuned for realism
      // NFL average: ~11 yards per completion
      const baseYards = 2 + Math.random() * 8; // 2-10 base
      const bonusYards = (qb.ratings.throwing / 100) * 3 + (target.ratings.speed / 100) * 3;
      let yards = Math.round(baseYards + bonusYards * Math.random());

      // Big play chance (~5% of completions go 20+)
      const bigPlayChance = (target.ratings.speed / 100) * 0.04;
      if (Math.random() < bigPlayChance) {
        yards += 15 + Math.floor(Math.random() * 25);
      }

      const newPos = fieldPosition + yards;
      const td = newPos >= 100;
      if (td) yards = 100 - fieldPosition;

      const tackler = allDefenders.length > 0
        ? weightedPick(allDefenders, allDefenders.map((d, i) => (i < 3 ? 2 : 1) * (d.ratings.tackling / 70)))
        : null;

      return {
        type: 'pass', yards, touchdown: td, turnover: false,
        passer: qb, receiver: target, tackler: tackler ?? undefined,
      };
    } else {
      // Incomplete pass
      return { type: 'pass', yards: 0, touchdown: false, turnover: false, passer: qb, receiver: target };
    }
  } else if (rbs.length > 0) {
    // ── Rush play ──
    const rushWeights = rbs.map((r, i) => {
      const starterBonus = i === 0 ? 6 : i === 1 ? 2.5 : 1;
      return starterBonus * (r.ratings.carrying / 70);
    });
    const rusher = weightedPick(rbs, rushWeights);

    const defRushPower = [...dls, ...lbs].length > 0
      ? [...dls, ...lbs].reduce((s, p) => s + p.ratings.tackling + p.ratings.strength * 0.5, 0) / [...dls, ...lbs].length
      : 50;
    const rushSkill = rusher.ratings.carrying * 0.5 + rusher.ratings.speed * 0.3 + rusher.ratings.agility * 0.2;
    const olBonus = (olPower - 60) / 100 * 2;

    // NFL average: ~4.3 yards per carry
    let yards = Math.round(
      (rushSkill - defRushPower) / 30 + 3.0 + (Math.random() * 4 - 1.5) + olBonus,
    );

    // Big rush chance (~3%)
    if (Math.random() < (rusher.ratings.speed / 100) * 0.04) {
      yards += 10 + Math.floor(Math.random() * 20);
    }

    // Negative play chance (~12% of rushes go for loss)
    if (Math.random() < 0.12) {
      yards = -(1 + Math.floor(Math.random() * 3));
    }

    // Fumble check
    const fumbleChance = clamp(0.015 - (rusher.ratings.carrying / 100) * 0.008, 0.003, 0.02);
    if (Math.random() < fumbleChance) {
      const tackler = allDefenders.length > 0
        ? weightedPick(allDefenders, allDefenders.map((d, i) => (i < 4 ? 3 : 1) * (d.ratings.tackling / 70)))
        : null;
      return {
        type: 'rush', yards: Math.max(0, yards), touchdown: false, turnover: true,
        rusher, tackler: tackler ?? undefined,
      };
    }

    const newPos = fieldPosition + yards;
    const td = newPos >= 100;
    if (td) yards = 100 - fieldPosition;

    const tackler = allDefenders.length > 0
      ? weightedPick(allDefenders, allDefenders.map((d, i) => (i < 4 ? 3 : 1) * (d.ratings.tackling / 70)))
      : null;

    return {
      type: 'rush', yards: Math.max(-10, yards), touchdown: td, turnover: false,
      rusher, tackler: tackler ?? undefined,
    };
  }

  // Fallback (no eligible players)
  return { type: 'rush', yards: 0, touchdown: false, turnover: false };
}

// ── Drive simulation ────────────────────────────────────────────────────────

interface DriveResult {
  points: number;
  plays: PlayResult[];
}

function simulateDrive(
  offense: Player[],
  defense: Player[],
): DriveResult {
  const plays: PlayResult[] = [];
  let fieldPosition = 20 + Math.floor(Math.random() * 15); // start at own 20-35
  let down = 1;
  let yardsToGo = 10;
  const kicker = offense.find(p => p.position === 'K' && (!p.injury || p.injury.weeksLeft === 0));

  for (let playNum = 0; playNum < 12; playNum++) { // max 12 plays per drive (avg NFL drive ~6)
    const play = simulatePlay(offense, defense, down, yardsToGo, fieldPosition);
    plays.push(play);

    if (play.touchdown) {
      // Extra point
      if (kicker) {
        const xpMade = Math.random() < 0.94 + (kicker.ratings.kicking / 100) * 0.04;
        plays.push({
          type: 'fieldGoal', yards: 0, touchdown: false, turnover: false,
          kicker, fieldGoalMade: xpMade,
        });
        return { points: xpMade ? 7 : 6, plays };
      }
      return { points: 7, plays };
    }

    if (play.turnover) {
      return { points: 0, plays };
    }

    if (play.type === 'sack') {
      fieldPosition = Math.max(1, fieldPosition + play.yards);
      yardsToGo -= play.yards; // sack yards are negative, so this adds
      down++;
    } else {
      fieldPosition += Math.max(0, play.yards);
      yardsToGo -= play.yards;
    }

    // First down
    if (yardsToGo <= 0) {
      down = 1;
      yardsToGo = 10;
    } else {
      down++;
    }

    // Fourth down decision
    if (down > 4) {
      // Field goal range?
      const fgDistance = 100 - fieldPosition + 17;
      if (fgDistance <= 52 && kicker) {
        const fgChance = clamp(
          0.92 - (fgDistance - 20) * 0.018 + (kicker.ratings.kicking / 100) * 0.08,
          0.20, 0.97,
        );
        const made = Math.random() < fgChance;
        plays.push({
          type: 'fieldGoal', yards: 0, touchdown: false, turnover: false,
          kicker, fieldGoalMade: made,
        });
        return { points: made ? 3 : 0, plays };
      }
      // Turnover on downs / punt
      return { points: 0, plays };
    }

    // Safety check
    if (fieldPosition <= 0) {
      return { points: 0, plays };
    }
  }

  // Ran out of plays (stalled drive)
  return { points: 0, plays };
}

// ── Stats accumulation from plays ───────────────────────────────────────────

function accumulateStats(
  allPlays: PlayResult[],
  roster: Player[],
): Record<string, Partial<PlayerStats>> {
  const stats: Record<string, Partial<PlayerStats>> = {};

  function ensure(id: string): Partial<PlayerStats> {
    if (!stats[id]) stats[id] = { gamesPlayed: 1 };
    return stats[id];
  }

  for (const play of allPlays) {
    if (play.type === 'pass') {
      if (play.passer) {
        const s = ensure(play.passer.id);
        s.passAttempts = (s.passAttempts ?? 0) + 1;
        if (play.yards > 0 || play.touchdown) {
          s.passCompletions = (s.passCompletions ?? 0) + 1;
          s.passYards = (s.passYards ?? 0) + play.yards;
          if (play.touchdown) s.passTDs = (s.passTDs ?? 0) + 1;
        }
      }
      if (play.receiver && (play.yards > 0 || play.touchdown)) {
        const s = ensure(play.receiver.id);
        s.targets = (s.targets ?? 0) + 1;
        s.receptions = (s.receptions ?? 0) + 1;
        s.receivingYards = (s.receivingYards ?? 0) + play.yards;
        if (play.touchdown) s.receivingTDs = (s.receivingTDs ?? 0) + 1;
      } else if (play.receiver) {
        // Incomplete - count target
        const s = ensure(play.receiver.id);
        s.targets = (s.targets ?? 0) + 1;
      }
      if (play.tackler) {
        const s = ensure(play.tackler.id);
        s.tackles = (s.tackles ?? 0) + 1;
      }
    }

    if (play.type === 'rush') {
      if (play.rusher) {
        const s = ensure(play.rusher.id);
        s.rushAttempts = (s.rushAttempts ?? 0) + 1;
        s.rushYards = (s.rushYards ?? 0) + play.yards;
        if (play.touchdown) s.rushTDs = (s.rushTDs ?? 0) + 1;
        if (play.turnover) s.fumbles = (s.fumbles ?? 0) + 1;
      }
      if (play.tackler) {
        const s = ensure(play.tackler.id);
        s.tackles = (s.tackles ?? 0) + 1;
        if (play.turnover) s.forcedFumbles = (s.forcedFumbles ?? 0) + 1;
      }
    }

    if (play.type === 'sack') {
      if (play.sacker) {
        const s = ensure(play.sacker.id);
        s.sacks = (s.sacks ?? 0) + 1;
        s.tackles = (s.tackles ?? 0) + 1;
      }
    }

    if (play.type === 'interception') {
      if (play.passer) {
        const s = ensure(play.passer.id);
        s.passAttempts = (s.passAttempts ?? 0) + 1;
        s.interceptions = (s.interceptions ?? 0) + 1;
      }
      if (play.interceptor) {
        const s = ensure(play.interceptor.id);
        s.defensiveINTs = (s.defensiveINTs ?? 0) + 1;
      }
    }

    if (play.type === 'fieldGoal') {
      if (play.kicker && play.fieldGoalMade !== undefined) {
        const s = ensure(play.kicker.id);
        const idx = allPlays.indexOf(play);
        const prevPlay = idx > 0 ? allPlays[idx - 1] : null;
        if (prevPlay?.touchdown) {
          s.extraPointAttempts = (s.extraPointAttempts ?? 0) + 1;
          if (play.fieldGoalMade) s.extraPointsMade = (s.extraPointsMade ?? 0) + 1;
        } else {
          s.fieldGoalAttempts = (s.fieldGoalAttempts ?? 0) + 1;
          if (play.fieldGoalMade) s.fieldGoalsMade = (s.fieldGoalsMade ?? 0) + 1;
        }
      }
    }
  }

  // Mark all active players with gamesPlayed
  for (const p of roster) {
    if (!p.injury || p.injury.weeksLeft === 0) {
      if (!stats[p.id]) stats[p.id] = { gamesPlayed: 1 };
      else stats[p.id].gamesPlayed = 1;
    }
  }

  return stats;
}

// ── Main simulation entry point ─────────────────────────────────────────────

/**
 * Simulates a full game between two teams using play-by-play simulation.
 * Each team gets ~10-12 possessions. Stats are accumulated from individual plays,
 * so starters naturally dominate stats through weighted play selection.
 *
 * Tuned for realistic NFL scores: average ~20-24 points per team.
 * QB season averages: ~3,800-4,500 pass yards, ~25-35 TDs.
 */
export function simulateGame(
  game: GameResult,
  homeRoster: Player[],
  awayRoster: Player[],
): GameResult {
  let homeScore = 0;
  let awayScore = 0;
  // NFL average: ~11-12 possessions per team per game
  const possessions = 10 + Math.floor(Math.random() * 3);

  const allHomePlays: PlayResult[] = [];
  const allAwayPlays: PlayResult[] = [];

  for (let i = 0; i < possessions; i++) {
    // Home offense drives
    const homeDrive = simulateDrive(homeRoster, awayRoster);
    homeScore += homeDrive.points;
    allHomePlays.push(...homeDrive.plays);

    // Away offense drives
    const awayDrive = simulateDrive(awayRoster, homeRoster);
    awayScore += awayDrive.points;
    allAwayPlays.push(...awayDrive.plays);
  }

  // Break ties with OT field goal
  if (homeScore === awayScore) {
    if (Math.random() < 0.55) homeScore += 3;
    else awayScore += 3;
  }

  // Accumulate stats from plays
  const homeOffStats = accumulateStats(allHomePlays, homeRoster);
  const awayDefStats = accumulateStats(allHomePlays, awayRoster);
  const awayOffStats = accumulateStats(allAwayPlays, awayRoster);
  const homeDefStats = accumulateStats(allAwayPlays, homeRoster);

  // Merge stats
  const playerStats: Record<string, Partial<PlayerStats>> = {};

  function mergeIn(source: Record<string, Partial<PlayerStats>>) {
    for (const [id, s] of Object.entries(source)) {
      if (!playerStats[id]) {
        playerStats[id] = { ...s };
      } else {
        const existing = playerStats[id];
        for (const key of Object.keys(s) as Array<keyof Partial<PlayerStats>>) {
          if (key === 'gamesPlayed') {
            existing[key] = 1;
          } else {
            (existing as Record<string, number>)[key] = ((existing as Record<string, number>)[key] ?? 0) + ((s as Record<string, number>)[key] ?? 0);
          }
        }
      }
    }
  }

  mergeIn(homeOffStats);
  mergeIn(homeDefStats);
  mergeIn(awayOffStats);
  mergeIn(awayDefStats);

  return {
    ...game,
    homeScore,
    awayScore,
    played: true,
    playerStats,
  };
}
