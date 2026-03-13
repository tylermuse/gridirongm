import type { Player, PlayerStats, GameResult, ScoringPlay, BettingLine } from '@/types';

/**
 * Computes an aggregate offensive and defensive power rating for a roster.
 * Returns a value roughly in 50-100 range for typical pro teams.
 */
export function teamPower(roster: Player[]): { offense: number; defense: number } {
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

/**
 * Generate Vegas-style betting lines for a game based on team power ratings.
 * spread < 0 means home team is favored.
 */
export function generateBettingLine(
  homeRoster: Player[],
  awayRoster: Player[],
): BettingLine {
  const homePow = teamPower(homeRoster);
  const awayPow = teamPower(awayRoster);
  const homeTotal = homePow.offense + homePow.defense;
  const awayTotal = awayPow.offense + awayPow.defense;

  // Spread: power diff scaled to points + 3pt home field advantage
  const rawSpread = (awayTotal - homeTotal) * 0.35 - 3;
  const spread = Math.round(rawSpread * 2) / 2; // nearest 0.5

  // O/U: based on combined offensive strength
  const combinedOff = (homePow.offense + awayPow.offense) / 2;
  const rawOU = 38 + (combinedOff - 50) * 0.4;
  const overUnder = Math.round(rawOU * 2) / 2;

  // Moneyline from spread
  const absSpread = Math.abs(spread);
  let homeML: number, awayML: number;
  if (absSpread <= 1) {
    homeML = spread <= 0 ? -115 : -105;
    awayML = spread <= 0 ? -105 : -115;
  } else {
    const favML = Math.round(-100 - absSpread * 20);
    const dogML = Math.round(100 + absSpread * 18);
    homeML = spread <= 0 ? favML : dogML;
    awayML = spread <= 0 ? dogML : favML;
  }

  return { spread, overUnder, homeML, awayML };
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
  passDefender?: Player; // CB/S who broke up an incomplete pass
  tackleForLoss?: boolean; // rush play went for negative yards
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

  // Decide pass vs rush (weighted by situation) — NFL avg ~58% pass
  const passChance = down >= 3 && yardsToGo > 5 ? 0.70 :
                     down >= 3 ? 0.55 :
                     down === 1 ? 0.42 : 0.48;

  const isPass = Math.random() < passChance;

  if (isPass && qb && receivers.length > 0) {
    // ── Sack check ──
    const sackChance = clamp((dlPower - olPower) / 300 + 0.06, 0.03, 0.12);
    if (Math.random() < sackChance) {
      const sackYards = -(3 + Math.floor(Math.random() * 6));
      // Sacks come from DLs or LBs — starters (top 4 DL, top 2 LB) get heavy snap share
      const sackerPool = [...dls.slice(0, 4), ...lbs.slice(0, 2)];
      const sacker = sackerPool.length > 0
        ? weightedPick(sackerPool, sackerPool.map((p, i) => {
            const isLB = p.position === 'LB';
            const base = isLB ? 1 : 1.5; // DLs slightly more likely
            const starterBonus = i < 4 ? 3 : 1; // Top 4 DL get 3x snap weight
            return base * starterBonus * (p.ratings.passRush / 70);
          }))
        : allDefenders[0];
      return { type: 'sack', yards: sackYards, touchdown: false, turnover: false, passer: qb, sacker };
    }

    // ── Pick receiver (starters get more usage but spread more) ──
    const recWeights = receivers.map((r, i) => {
      const starterBonus = i === 0 ? 4 : i === 1 ? 3 : i === 2 ? 2 : 1;
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
    // Avg INT rate ~2.5% of attempts. Elite QBs ~1.5% (~8/season), bad QBs ~3.5% (~18/season).
    const intChance = clamp(
      (coverageRating - qb.ratings.throwing) / 600 + 0.025,
      0.012, 0.040,
    );
    if (Math.random() < intChance) {
      const interceptor = coverageDefender ?? (cbs[0] || safeties[0] || allDefenders[0]);
      return {
        type: 'interception', yards: 0, touchdown: false, turnover: true,
        passer: qb, receiver: target, interceptor,
      };
    }

    // ── Completion check ──
    // NFL avg comp% ~65%, elite QBs ~70%, bad QBs ~57%
    const compBase = 0.50 + (qb.ratings.throwing / 100) * 0.16 + (target.ratings.catching / 100) * 0.10;
    // Red zone boost: shorter field compresses coverage, boosting completion rates
    const redZoneBonus = fieldPosition >= 80 ? 0.06 : 0;
    const compRate = clamp(compBase - (coverageRating / 100) * 0.13 + redZoneBonus, 0.40, 0.72);

    if (Math.random() < compRate) {
      // Completed pass — yards tuned for realism
      // Average: ~11.8 yards per completion, top WR ~1,000-1,400 yds/season
      const baseYards = 3 + Math.random() * 11; // 3-14 base (avg 8.5)
      const bonusYards = (qb.ratings.throwing / 100) * 3 + (target.ratings.speed / 100) * 2;
      let yards = Math.round(baseYards + bonusYards * Math.random());

      // Big play chance (~4-6% of completions go 20+) — explosive plays
      const bigPlayChance = 0.02 + (target.ratings.speed / 100) * 0.03;
      if (Math.random() < bigPlayChance) {
        yards += 15 + Math.floor(Math.random() * 20);
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
      // Incomplete pass — defender gets a pass deflection ~40% of the time
      const pd = coverageDefender && Math.random() < 0.40 ? coverageDefender : undefined;
      return {
        type: 'pass', yards: 0, touchdown: false, turnover: false,
        passer: qb, receiver: target, passDefender: pd,
      };
    }
  } else if (rbs.length > 0) {
    // ── Rush play ──
    const rushWeights = rbs.map((r, i) => {
      const starterBonus = i === 0 ? 4 : i === 1 ? 2 : 1;
      return starterBonus * (r.ratings.carrying / 70);
    });
    const rusher = weightedPick(rbs, rushWeights);

    const defRushPower = [...dls, ...lbs].length > 0
      ? [...dls, ...lbs].reduce((s, p) => s + p.ratings.tackling + p.ratings.strength * 0.5, 0) / [...dls, ...lbs].length
      : 50;
    const rushSkill = rusher.ratings.carrying * 0.5 + rusher.ratings.speed * 0.3 + rusher.ratings.agility * 0.2;
    const olBonus = (olPower - 60) / 100 * 2.6; // 1.3x OL bonus multiplier (was 2)

    // Average: ~4.3 yards per carry, top RB ~1,000-1,400 yds/season
    // Increased signal: divisor 35 (was 50), reduced noise range 2.5 (was 3.0)
    // Red zone boost: goal-line runs benefit from compressed field
    const rushRedZoneBonus = fieldPosition >= 80 ? 1.0 : 0;
    let yards = Math.round(
      (rushSkill - defRushPower) / 35 + 2.5 + (Math.random() * 2.5 - 0.75) + olBonus + rushRedZoneBonus,
    );

    // Big rush chance (~2-3%) — breakaway runs
    if (Math.random() < 0.01 + (rusher.ratings.speed / 100) * 0.02) {
      yards += 10 + Math.floor(Math.random() * 15);
    }

    // Negative play chance (~15% of rushes go for loss)
    const isNegative = Math.random() < 0.15;
    if (isNegative) {
      yards = -(1 + Math.floor(Math.random() * 4));
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
      tackleForLoss: isNegative || yards < 0,
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
  let fieldPosition = 30 + Math.floor(Math.random() * 15); // start at own 30-45 (kickoff returns + touchbacks)
  let down = 1;
  let yardsToGo = 10;
  const kicker = offense.find(p => p.position === 'K' && (!p.injury || p.injury.weeksLeft === 0));

  // Max 10 plays per drive (NFL avg ~6, long drives 9-11). Drives also end on
  // 4th-down stops, turnovers, or scores before hitting the cap.
  for (let playNum = 0; playNum < 10; playNum++) {
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
      fieldPosition = Math.max(1, fieldPosition + play.yards);
      yardsToGo -= play.yards;
    }

    // First down
    if (yardsToGo <= 0) {
      down = 1;
      yardsToGo = Math.min(10, 100 - fieldPosition); // goal-to-go if inside 10
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

  // Ran out of plays (20-play safety valve) — try field goal if in range
  if (kicker) {
    const fgDistance = 100 - fieldPosition + 17;
    if (fgDistance <= 55) {
      const fgChance = clamp(
        0.92 - (fgDistance - 20) * 0.018 + (kicker.ratings.kicking / 100) * 0.08,
        0.15, 0.95,
      );
      const made = Math.random() < fgChance;
      plays.push({
        type: 'fieldGoal', yards: 0, touchdown: false, turnover: false,
        kicker, fieldGoalMade: made,
      });
      return { points: made ? 3 : 0, plays };
    }
  }

  return { points: 0, plays };
}

// ── Stats helper ────────────────────────────────────────────────────────────

function ensure(
  stats: Record<string, Partial<PlayerStats>>,
  id: string,
): Partial<PlayerStats> {
  if (!stats[id]) stats[id] = { gamesPlayed: 1 };
  return stats[id];
}

// ── Main simulation entry point ─────────────────────────────────────────────

/**
 * Simulates a full game between two teams using play-by-play simulation.
 * Each team gets ~11-12 possessions. Stats are accumulated from individual plays,
 * so starters naturally dominate stats through weighted play selection.
 *
 * Tuned for realistic pro scores: average ~20-24 points per team.
 * QB season averages: ~3,200-4,200 pass yards, ~25-35 TDs.
 */
export function simulateGame(
  game: GameResult,
  homeRoster: Player[],
  awayRoster: Player[],
): GameResult {
  let homeScore = 0;
  let awayScore = 0;
  // ~9 possessions per team per game (NFL has ~11 but many are 3-and-outs/short punts)
  const possessions = 9;

  const allHomePlays: PlayResult[] = [];
  const allAwayPlays: PlayResult[] = [];
  const scoringPlays: ScoringPlay[] = [];

  // Track scoring play index per quarter for timestamp generation
  const quarterScoringIndex: Record<number, number> = {};

  // Helper to build scoring play descriptions
  function describeScoring(drive: DriveResult, offenseTeamId: string, quarter: number, runningAway: number, runningHome: number): { away: number; home: number } {
    if (drive.points === 0) return { away: runningAway, home: runningHome };

    const plays = drive.plays;
    // Find the scoring play
    const tdPlay = plays.find(p => p.touchdown);
    const fgPlay = plays.find(p => p.type === 'fieldGoal' && p.fieldGoalMade && !plays.find(pp => pp.touchdown && plays.indexOf(pp) < plays.indexOf(p)));

    const isHome = offenseTeamId === game.homeTeamId;
    let desc = '';
    let pts = drive.points;

    if (tdPlay) {
      if (tdPlay.type === 'pass' && tdPlay.passer && tdPlay.receiver) {
        desc = `${tdPlay.passer.firstName[0]}. ${tdPlay.passer.lastName} ${tdPlay.yards} yd pass to ${tdPlay.receiver.firstName[0]}. ${tdPlay.receiver.lastName}`;
      } else if (tdPlay.type === 'rush' && tdPlay.rusher) {
        desc = `${tdPlay.rusher.firstName[0]}. ${tdPlay.rusher.lastName} ${tdPlay.yards} yd rush`;
      } else {
        desc = `${tdPlay.yards} yd touchdown`;
      }
      desc += ` (${pts === 7 ? 'XP good' : 'XP missed'})`;
    } else if (fgPlay && fgPlay.kicker) {
      desc = `${fgPlay.kicker.firstName[0]}. ${fgPlay.kicker.lastName} field goal`;
      pts = 3;
    } else {
      desc = `${pts} points`;
    }

    if (isHome) {
      runningHome += pts;
    } else {
      runningAway += pts;
    }

    // Generate timestamp: distribute scoring plays within the quarter
    // Each quarter has 15:00 of game time. Scoring plays happen at roughly random times.
    quarterScoringIndex[quarter] = (quarterScoringIndex[quarter] ?? 0) + 1;
    const idx = quarterScoringIndex[quarter];
    const minutesBase = quarter <= 4 ? 15 : 10; // OT is 10 min
    const minutesLeft = Math.max(0, minutesBase - Math.floor(idx * (minutesBase / 5) + Math.random() * 3));
    const secondsLeft = Math.floor(Math.random() * 60);
    const timeLeft = `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`;

    scoringPlays.push({
      quarter,
      timeLeft,
      teamId: offenseTeamId,
      points: pts,
      description: desc,
      score: [runningAway, runningHome],
    });

    return { away: runningAway, home: runningHome };
  }

  let runAway = 0;
  let runHome = 0;

  for (let i = 0; i < possessions; i++) {
    // Quarter assignment: distribute possessions across 4 quarters
    const quarter = Math.min(4, Math.floor(i / (possessions / 4)) + 1);

    // Home offense drives
    const homeDrive = simulateDrive(homeRoster, awayRoster);
    homeScore += homeDrive.points;
    allHomePlays.push(...homeDrive.plays);
    const afterHome = describeScoring(homeDrive, game.homeTeamId, quarter, runAway, runHome);
    runAway = afterHome.away;
    runHome = afterHome.home;

    // Away offense drives
    const awayDrive = simulateDrive(awayRoster, homeRoster);
    awayScore += awayDrive.points;
    allAwayPlays.push(...awayDrive.plays);
    const afterAway = describeScoring(awayDrive, game.awayTeamId, quarter, runAway, runHome);
    runAway = afterAway.away;
    runHome = afterAway.home;
  }

  // Break ties with OT field goal
  if (homeScore === awayScore) {
    const homeWinsOT = Math.random() < 0.55;
    if (homeWinsOT) {
      homeScore += 3;
      runHome += 3;
    } else {
      awayScore += 3;
      runAway += 3;
    }
    const otMinutes = Math.floor(Math.random() * 8) + 1;
    const otSeconds = Math.floor(Math.random() * 60);
    scoringPlays.push({
      quarter: 5,
      timeLeft: `${otMinutes}:${otSeconds.toString().padStart(2, '0')}`,
      teamId: homeWinsOT ? game.homeTeamId : game.awayTeamId,
      points: 3,
      description: 'OT field goal',
      score: [runAway, runHome],
    });
  }

  // Accumulate stats — one pass per team over their relevant plays.
  // Home offense plays: home players get offensive stats, away players get defensive stats.
  // Away offense plays: away players get offensive stats, home players get defensive stats.
  const homeIds = new Set(homeRoster.map(p => p.id));
  const awayIds = new Set(awayRoster.map(p => p.id));
  const playerStats: Record<string, Partial<PlayerStats>> = {};

  function addPlayStats(plays: PlayResult[], rosterIds: Set<string>, rosterList: Player[]) {
    // Process play-by-play, only counting stats for players on this roster
    for (const play of plays) {
      if (play.type === 'pass') {
        if (play.passer && rosterIds.has(play.passer.id)) {
          const s = ensure(playerStats, play.passer.id);
          s.passAttempts = (s.passAttempts ?? 0) + 1;
          if (play.yards > 0 || play.touchdown) {
            s.passCompletions = (s.passCompletions ?? 0) + 1;
            s.passYards = (s.passYards ?? 0) + play.yards;
            if (play.touchdown) s.passTDs = (s.passTDs ?? 0) + 1;
          }
          // Track pass blocks for OL
          for (const p of rosterList) {
            if (p.position === 'OL' && (!p.injury || p.injury.weeksLeft === 0)) {
              ensure(playerStats, p.id).passBlocks = (ensure(playerStats, p.id).passBlocks ?? 0) + 1;
            }
          }
        }
        if (play.receiver && rosterIds.has(play.receiver.id) && (play.yards > 0 || play.touchdown)) {
          const s = ensure(playerStats, play.receiver.id);
          s.targets = (s.targets ?? 0) + 1;
          s.receptions = (s.receptions ?? 0) + 1;
          s.receivingYards = (s.receivingYards ?? 0) + play.yards;
          if (play.touchdown) s.receivingTDs = (s.receivingTDs ?? 0) + 1;
        } else if (play.receiver && rosterIds.has(play.receiver.id)) {
          const s = ensure(playerStats, play.receiver.id);
          s.targets = (s.targets ?? 0) + 1;
        }
        if (play.tackler && rosterIds.has(play.tackler.id)) {
          const s = ensure(playerStats, play.tackler.id);
          s.tackles = (s.tackles ?? 0) + 1;
        }
        // Pass deflection on incomplete pass
        if (play.passDefender && rosterIds.has(play.passDefender.id)) {
          const s = ensure(playerStats, play.passDefender.id);
          s.passDeflections = (s.passDeflections ?? 0) + 1;
        }
      }
      if (play.type === 'rush') {
        if (play.rusher && rosterIds.has(play.rusher.id)) {
          const s = ensure(playerStats, play.rusher.id);
          s.rushAttempts = (s.rushAttempts ?? 0) + 1;
          s.rushYards = (s.rushYards ?? 0) + play.yards;
          if (play.touchdown) s.rushTDs = (s.rushTDs ?? 0) + 1;
          if (play.turnover) s.fumbles = (s.fumbles ?? 0) + 1;
        }
        if (play.tackler && rosterIds.has(play.tackler.id)) {
          const s = ensure(playerStats, play.tackler.id);
          s.tackles = (s.tackles ?? 0) + 1;
          if (play.tackleForLoss) s.tacklesForLoss = (s.tacklesForLoss ?? 0) + 1;
          if (play.turnover) s.forcedFumbles = (s.forcedFumbles ?? 0) + 1;
        }
      }
      if (play.type === 'sack') {
        if (play.sacker && rosterIds.has(play.sacker.id)) {
          const s = ensure(playerStats, play.sacker.id);
          s.sacks = (s.sacks ?? 0) + 1;
          s.tackles = (s.tackles ?? 0) + 1;
          s.tacklesForLoss = (s.tacklesForLoss ?? 0) + 1;
        }
        // Charge sacksAllowed to one of the 5 starting OL (weighted by inverse blocking)
        // and passBlocks to the starting 5 OL on the passer's team
        if (play.passer && rosterIds.has(play.passer.id)) {
          const olPlayers = rosterList
            .filter(p => p.position === 'OL' && (!p.injury || p.injury.weeksLeft === 0))
            .slice(0, 5); // Only the 5 starters
          if (olPlayers.length > 0) {
            // Assign sack to one starting OL (worse blockers more likely to be blamed)
            const sackWeights = olPlayers.map(p => Math.max(1, 100 - p.ratings.blocking));
            const blamed = weightedPick(olPlayers, sackWeights);
            ensure(playerStats, blamed.id).sacksAllowed = (ensure(playerStats, blamed.id).sacksAllowed ?? 0) + 1;
          }
          for (const p of olPlayers) {
            ensure(playerStats, p.id).passBlocks = (ensure(playerStats, p.id).passBlocks ?? 0) + 1;
          }
        }
      }
      if (play.type === 'interception') {
        if (play.passer && rosterIds.has(play.passer.id)) {
          const s = ensure(playerStats, play.passer.id);
          s.passAttempts = (s.passAttempts ?? 0) + 1;
          s.interceptions = (s.interceptions ?? 0) + 1;
        }
        if (play.interceptor && rosterIds.has(play.interceptor.id)) {
          const s = ensure(playerStats, play.interceptor.id);
          s.defensiveINTs = (s.defensiveINTs ?? 0) + 1;
        }
      }
      if (play.type === 'fieldGoal') {
        if (play.kicker && rosterIds.has(play.kicker.id) && play.fieldGoalMade !== undefined) {
          const s = ensure(playerStats, play.kicker.id);
          const idx = plays.indexOf(play);
          const prevPlay = idx > 0 ? plays[idx - 1] : null;
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
    // Mark gamesPlayed for all healthy roster players
    for (const p of rosterList) {
      if (!p.injury || p.injury.weeksLeft === 0) {
        ensure(playerStats, p.id).gamesPlayed = 1;
      }
    }
  }

  // Home team: offensive stats from home plays + defensive stats from away plays
  addPlayStats(allHomePlays, homeIds, homeRoster);
  addPlayStats(allAwayPlays, homeIds, homeRoster);
  // Away team: offensive stats from away plays + defensive stats from home plays
  addPlayStats(allAwayPlays, awayIds, awayRoster);
  addPlayStats(allHomePlays, awayIds, awayRoster);

  return {
    ...game,
    homeScore,
    awayScore,
    played: true,
    playerStats,
    scoringPlays,
  };
}
