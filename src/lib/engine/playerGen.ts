function uuid(): string {
  return crypto.randomUUID();
}
import type { Player, PlayerRatings, Position } from '@/types';
import { emptyStats } from '@/types';
import { randomName } from '@/lib/data/names';
import { estimateSalary } from './salary';

/** Rating weights per position — higher weight = more important for that position. */
export const POSITION_WEIGHTS: Record<Position, Partial<Record<keyof PlayerRatings, number>>> = {
  QB:  { throwing: 3, awareness: 2, speed: 1, agility: 1 },
  RB:  { carrying: 3, speed: 2, agility: 2, strength: 1 },
  WR:  { catching: 3, speed: 2, agility: 1 },
  TE:  { catching: 2, blocking: 2, strength: 1, speed: 1 },
  OL:  { blocking: 3, strength: 3, awareness: 1 },
  DL:  { passRush: 3, strength: 2, tackling: 1, speed: 1 },
  LB:  { tackling: 3, coverage: 1, speed: 1, awareness: 1 },
  CB:  { coverage: 3, speed: 2, agility: 1 },
  S:   { coverage: 2, tackling: 2, speed: 1, awareness: 1 },
  K:   { kicking: 4, awareness: 1 },
  P:   { kicking: 4, awareness: 1 },
};

function clamp(val: number, min = 20, max = 99): number {
  return Math.round(Math.max(min, Math.min(max, val)));
}

// Height/weight ranges by position (inches, lbs)
const POSITION_BODY: Record<Position, { heightMin: number; heightMax: number; weightMin: number; weightMax: number }> = {
  QB:  { heightMin: 72, heightMax: 77, weightMin: 210, weightMax: 240 },
  RB:  { heightMin: 68, heightMax: 73, weightMin: 195, weightMax: 230 },
  WR:  { heightMin: 69, heightMax: 76, weightMin: 175, weightMax: 215 },
  TE:  { heightMin: 74, heightMax: 78, weightMin: 235, weightMax: 265 },
  OL:  { heightMin: 74, heightMax: 78, weightMin: 295, weightMax: 340 },
  DL:  { heightMin: 73, heightMax: 78, weightMin: 270, weightMax: 320 },
  LB:  { heightMin: 72, heightMax: 76, weightMin: 225, weightMax: 260 },
  CB:  { heightMin: 69, heightMax: 74, weightMin: 180, weightMax: 205 },
  S:   { heightMin: 70, heightMax: 75, weightMin: 195, weightMax: 220 },
  K:   { heightMin: 69, heightMax: 74, weightMin: 180, weightMax: 210 },
  P:   { heightMin: 71, heightMax: 76, weightMin: 200, weightMax: 230 },
};

function generateHeight(position: Position): string {
  const { heightMin, heightMax } = POSITION_BODY[position];
  const inches = heightMin + Math.floor(Math.random() * (heightMax - heightMin + 1));
  const feet = Math.floor(inches / 12);
  const rem = inches % 12;
  return `${feet}'${rem}"`;
}

function generateWeight(position: Position): number {
  const { weightMin, weightMax } = POSITION_BODY[position];
  return weightMin + Math.floor(Math.random() * (weightMax - weightMin + 1));
}

const COLLEGES = [
  'Alabama', 'Ohio State', 'Georgia', 'Clemson', 'LSU', 'Michigan', 'Oklahoma',
  'Notre Dame', 'Texas', 'Penn State', 'Oregon', 'Florida', 'USC', 'Auburn',
  'Wisconsin', 'Iowa', 'Miami (FL)', 'Tennessee', 'Texas A&M', 'Florida State',
  'Stanford', 'Michigan State', 'Virginia Tech', 'North Carolina', 'Ole Miss',
  'Arkansas', 'Kentucky', 'Pittsburgh', 'Utah', 'Baylor', 'Minnesota',
  'West Virginia', 'Mississippi State', 'South Carolina', 'TCU', 'NC State',
  'Missouri', 'UCLA', 'Nebraska', 'Colorado', 'BYU', 'Washington', 'Arizona State',
  'Louisville', 'Boston College', 'Duke', 'Cal', 'Illinois', 'Purdue', 'Syracuse',
  'Cincinnati', 'Houston', 'Memphis', 'UCF', 'Boise State', 'San Diego State',
  'Fresno State', 'SMU', 'Tulane', 'App State', 'James Madison', 'Liberty',
  'Coastal Carolina', 'Georgia Tech', 'Vanderbilt', 'Wake Forest', 'Kansas State',
  'Iowa State', 'Oklahoma State', 'Oregon State', 'Washington State', 'Arizona',
];

function randomCollege(): string {
  return COLLEGES[Math.floor(Math.random() * COLLEGES.length)];
}

function gaussian(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Position multipliers for bench press (big guys press more)
const BENCH_POS_MULT: Record<Position, number> = {
  OL: 1.4, DL: 1.35, TE: 1.15, LB: 1.1, RB: 1.0, S: 0.9,
  QB: 0.8, WR: 0.7, CB: 0.7, K: 0.6, P: 0.65,
};

/**
 * Generate NFL Combine-style measurables from a player's ratings.
 * These are permanent (set once at player creation, never change).
 */
export function generateCombineStats(
  position: Position,
  ratings: { speed: number; strength: number; agility: number },
  seed = 0,
): { fortyYard: number; benchPress: number; verticalJump: number } {
  // Deterministic-ish noise from seed
  const noise1 = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5; // -0.5 to 0.5
  const noise2 = ((seed * 7919 + 12347) % 233280) / 233280 - 0.5;
  const noise3 = ((seed * 6271 + 54321) % 233280) / 233280 - 0.5;

  // 40-yard dash: speed 99→4.28, speed 60→4.72, speed 30→5.10
  // Linear interpolation with agility factor and noise
  const speedFactor = (ratings.speed - 30) / 69; // 0 to 1
  const rawForty = 5.10 - speedFactor * 0.82; // 5.10 to 4.28
  const agilityAdj = (ratings.agility - 60) * 0.001; // small agility bonus
  const fortyYard = Math.round((rawForty - agilityAdj + noise1 * 0.06) * 100) / 100;

  // Bench press (225 lb reps): strength-based, position-adjusted
  const strengthFactor = (ratings.strength - 20) / 79; // 0 to 1
  const rawBench = 8 + strengthFactor * 22; // 8 to 30 reps
  const posMult = BENCH_POS_MULT[position] ?? 1.0;
  const benchPress = Math.max(1, Math.round(rawBench * posMult + noise2 * 4));

  // Vertical jump (inches): speed + agility blend
  const jumpFactor = ((ratings.speed * 0.6 + ratings.agility * 0.4) - 30) / 69;
  const rawVert = 28 + jumpFactor * 14; // 28 to 42 inches
  const verticalJump = Math.round((rawVert + noise3 * 3) * 10) / 10;

  return {
    fortyYard: Math.max(4.2, Math.min(5.4, fortyYard)),
    benchPress,
    verticalJump: Math.max(24, Math.min(46, verticalJump)),
  };
}

/** Generates position-appropriate ratings for a player of a given talent tier. */
function generateRatings(position: Position, talentMean: number): PlayerRatings {
  const weights = POSITION_WEIGHTS[position];
  const ratings: Record<string, number> = {};

  const allKeys: (keyof PlayerRatings)[] = [
    'speed', 'strength', 'agility', 'awareness', 'stamina',
    'throwing', 'catching', 'carrying', 'blocking',
    'tackling', 'coverage', 'passRush', 'kicking',
  ];

  for (const key of allKeys) {
    const weight = (weights[key] ?? 0);
    if (weight >= 2) {
      ratings[key] = clamp(gaussian(talentMean, 8));
    } else if (weight === 1) {
      ratings[key] = clamp(gaussian(talentMean - 10, 10));
    } else {
      ratings[key] = clamp(gaussian(35, 12));
    }
  }

  ratings.stamina = clamp(gaussian(talentMean + 5, 8));

  const weightedSum = allKeys.reduce((sum, key) => {
    const w = (weights[key] ?? 0);
    return sum + ratings[key] * (w || 0.2);
  }, 0);
  const totalWeight = allKeys.reduce((sum, key) => sum + ((weights[key] ?? 0) || 0.2), 0);
  ratings.overall = clamp(Math.round(weightedSum / totalWeight));

  return ratings as unknown as PlayerRatings;
}

/** Age distribution: most players are 23-30. */
function randomAge(experience: number): number {
  return 22 + experience;
}

function randomSalary(overall: number, position: Position, age: number, potential: number): number {
  // Use the canonical estimateSalary curve so initial rosters are consistent
  const base = estimateSalary(overall, position, age, potential);
  // Add ±15% noise for variety
  const noise = 0.85 + Math.random() * 0.30;
  let salary = Math.round(base * noise * 10) / 10;
  // Enforce K/P caps after noise
  if (position === 'K') salary = Math.min(salary, 4.0);
  if (position === 'P') salary = Math.min(salary, 2.5);
  return salary;
}

export function generatePlayer(
  position: Position,
  talentMean: number,
  options: { age?: number; experience?: number; teamId?: string | null } = {},
): Player {
  const experience = options.experience ?? Math.floor(Math.random() * 12);
  const age = options.age ?? randomAge(experience);
  const { firstName, lastName } = randomName();
  const ratings = generateRatings(position, talentMean);
  // Potential peaks around age 27-29. Past prime, potential drops sharply (can't grow past peak).
  // Young players: potential = OVR + bonus (room to grow)
  // Prime (27-29): potential ≈ OVR (already near peak)
  // Past prime (30+): potential = OVR or lower (declining, no upside)
  let potentialBonus: number;
  if (age <= 25) {
    potentialBonus = Math.round(gaussian(10, 5)); // Big upside for young players
  } else if (age <= 29) {
    potentialBonus = Math.round(gaussian(3, 3)); // Small upside in prime
  } else if (age <= 32) {
    potentialBonus = Math.round(gaussian(-2, 2)); // Slightly below current OVR
  } else {
    potentialBonus = Math.round(gaussian(-5, 3)); // Well below current OVR — clearly declining
  }
  const potential = clamp(ratings.overall + potentialBonus);
  const salary = randomSalary(ratings.overall, position, age, potential);

  return {
    id: uuid(),
    firstName,
    lastName,
    position,
    age,
    experience,
    ratings,
    potential,
    ratingHistory: [],
    stats: emptyStats(),
    careerStats: emptyStats(),
    contract: (() => {
      const yearsLeft = Math.ceil(Math.random() * 4);
      const totalValue = salary * yearsLeft;
      const guaranteedPct = yearsLeft <= 1 ? 1.0 : yearsLeft <= 2 ? 0.65 : yearsLeft <= 3 ? 0.50 : 0.40;
      return {
        salary,
        yearsLeft,
        guaranteed: Math.round(totalValue * guaranteedPct * 10) / 10,
        totalYears: yearsLeft,
      };
    })(),
    teamId: options.teamId ?? null,
    draftYear: null,
    draftPick: null,
    retired: false,
    injury: null,
    onIR: false,
    mood: 60 + Math.floor(Math.random() * 30), // 60-90 initial mood
    height: generateHeight(position),
    weight: generateWeight(position),
    college: randomCollege(),
    seasonLog: [],
    combineStats: generateCombineStats(position, ratings, Math.floor(Math.random() * 10000)),
  };
}

/** Generates a full roster of ~53 players for a team. */
export function generateRoster(teamId: string, tierMean: number): Player[] {
  const rosterSpec: { position: Position; count: number }[] = [
    { position: 'QB', count: 2 },
    { position: 'RB', count: 3 },
    { position: 'WR', count: 5 },
    { position: 'TE', count: 2 },
    { position: 'OL', count: 7 },
    { position: 'DL', count: 6 },
    { position: 'LB', count: 5 },
    { position: 'CB', count: 4 },
    { position: 'S', count: 3 },
    { position: 'K', count: 1 },
    { position: 'P', count: 1 },
  ];

  const players: Player[] = [];
  for (const { position, count } of rosterSpec) {
    for (let i = 0; i < count; i++) {
      const isStarter = i === 0 || (i === 1 && count > 3);
      const talent = isStarter ? tierMean + gaussian(5, 4) : tierMean + gaussian(-8, 6);
      players.push(generatePlayer(position, talent, { teamId }));
    }
  }
  return players;
}

const SCOUTING_LABELS = [
  'High motor', 'Raw but explosive', 'Pro-ready',
  'Injury history', 'Combine standout', 'Character concerns',
  'Sleeper',
];

/** Generates a class of draft prospects.
 *  Top picks should be mid-level starter quality (~75-80 OVR),
 *  declining through mid-round role players (~55-65) to late-round
 *  projects (~35-45). This mirrors real pro draft talent distribution.
 */
export function generateDraftClass(count: number): Player[] {
  const prospects: Player[] = [];
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

  for (let i = 0; i < count; i++) {
    const position = positions[Math.floor(Math.random() * positions.length)];
    // Talent curve: top picks ~82, mid-round ~63, late-round ~44
    const progress = i / count;
    let talent = gaussian(82 - progress * 38, 7);
    // Ensure top 6 picks are truly elite (blue-chip prospects every class)
    if (i < 6) talent = Math.max(talent, 72 + Math.random() * 8);
    const player = generatePlayer(position, talent, { age: 21 + Math.floor(Math.random() * 2), experience: 0 });
    player.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
    player.college = COLLEGES[Math.floor(Math.random() * COLLEGES.length)];
    player.scoutingLabel = SCOUTING_LABELS[Math.floor(Math.random() * SCOUTING_LABELS.length)];
    player.scoutingSeed = Math.floor(Math.random() * 10000);
    prospects.push(player);
  }

  // Sort by OVR so pick order aligns with talent
  prospects.sort((a, b) => b.ratings.overall - a.ratings.overall);

  // ── Sleeper pass: upgrade 2-3 late-round prospects into hidden gems ──
  // These have modest OVR (fall to rounds 4-7) but elite potential (develop
  // into stars over 2-3 seasons). At low scouting levels the high potential
  // is hidden; elite scouting reveals the upside.
  const halfIdx = Math.floor(prospects.length / 2);
  const bottomHalf = prospects.slice(halfIdx);
  const sleeperCount = 2 + (Math.random() < 0.5 ? 1 : 0); // 2 or 3
  const shuffled = [...bottomHalf].sort(() => Math.random() - 0.5);
  const sleepers = shuffled.slice(0, sleeperCount);

  for (const prospect of sleepers) {
    // Re-roll ratings to land in the 45-55 OVR sweet spot (falls to late rounds)
    const targetOvr = 45 + Math.floor(Math.random() * 11); // 45-55
    const newRatings = generateRatings(prospect.position, targetOvr + 5);
    // Manually adjust overall to be in range
    newRatings.overall = clamp(targetOvr, 35, 60);
    prospect.ratings = newRatings;
    // High potential — develops into a star over 2-3 seasons
    prospect.potential = clamp(75 + Math.floor(Math.random() * 11), 75, 85); // 75-85
    prospect.scoutingLabel = 'Sleeper';
  }

  // Re-sort after sleeper adjustments (internal ordering for generation only)
  prospects.sort((a, b) => b.ratings.overall - a.ratings.overall);

  // ── Assign projected ranks (public mock-draft order) ──
  // Sort by OVR descending with small noise to simulate media perception.
  // K/P get pushed to the bottom. Rank = position in this sorted list.
  const ranked = [...prospects].sort((a, b) => {
    // K/P are never drafted high — heavy penalty
    const aOvr = (a.position === 'K' || a.position === 'P') ? a.ratings.overall - 40 : a.ratings.overall;
    const bOvr = (b.position === 'K' || b.position === 'P') ? b.ratings.overall - 40 : b.ratings.overall;
    // Small noise: ±3 OVR points for top prospects, ±6 for mid, ±8 for late
    const aIdx = prospects.indexOf(a);
    const bIdx = prospects.indexOf(b);
    const aNoise = ((aIdx * 7919 + 12347) % 17) - 8; // deterministic ±8
    const bNoise = ((bIdx * 7919 + 12347) % 17) - 8;
    const aAdj = aOvr + Math.round(aNoise * 0.5);
    const bAdj = bOvr + Math.round(bNoise * 0.5);
    return bAdj - aAdj;
  });
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].projectedRank = i + 1;
  }

  // Sort by projected rank for the final output
  prospects.sort((a, b) => (a.projectedRank ?? 999) - (b.projectedRank ?? 999));

  return prospects;
}
