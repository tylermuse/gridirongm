function uuid(): string {
  return crypto.randomUUID();
}
import type { Player, PlayerRatings, Position } from '@/types';
import { emptyStats } from '@/types';
import { randomName } from '@/lib/data/names';

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

function gaussian(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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

function randomSalary(overall: number, position: Position): number {
  // Match estimateSalary curve from store.ts for consistency
  const POSITION_SALARY_MULT: Record<string, number> = {
    QB: 1.9, WR: 1.0, CB: 1.05, DL: 1.35, LB: 0.95, OL: 1.0,
    S: 0.9, TE: 0.85, RB: 0.8, K: 0.25, P: 0.25,
  };
  const normalized = Math.max(0, (overall - 40) / 60);
  const baseSalary = Math.max(0.75, Math.pow(normalized, 1.6) * 42);
  const posMult = POSITION_SALARY_MULT[position] ?? 1.0;
  let salary = baseSalary * posMult;
  if (position === 'K' || position === 'P') salary = Math.min(salary, 5.0);
  // Add ±20% noise for variety
  const noise = 0.8 + Math.random() * 0.4;
  return Math.round(salary * noise * 10) / 10;
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
  const salary = randomSalary(ratings.overall, position);

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
];

/** Generates a class of draft prospects.
 *  Top picks should be mid-level starter quality (~75-80 OVR),
 *  declining through mid-round role players (~55-65) to late-round
 *  projects (~35-45). This mirrors real NFL draft talent distribution.
 */
export function generateDraftClass(count: number): Player[] {
  const prospects: Player[] = [];
  const positions: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

  for (let i = 0; i < count; i++) {
    const position = positions[Math.floor(Math.random() * positions.length)];
    // Talent curve: top picks ~78, mid-round ~55, late-round ~35
    const progress = i / count;
    const talent = gaussian(78 - progress * 45, 7);
    const player = generatePlayer(position, talent, { age: 21 + Math.floor(Math.random() * 2), experience: 0 });
    player.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
    player.scoutingLabel = SCOUTING_LABELS[Math.floor(Math.random() * SCOUTING_LABELS.length)];
    prospects.push(player);
  }

  return prospects.sort((a, b) => b.ratings.overall - a.ratings.overall);
}
