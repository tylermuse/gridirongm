import type { Coach, CoachRole, OffensiveScheme, DefensiveScheme, Player, Team } from '@/types';

// ---------------------------------------------------------------------------
// Coach generation
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Mike', 'Sean', 'Kyle', 'Matt', 'Dan', 'Kevin', 'Brian', 'Andy', 'Doug', 'John',
  'Robert', 'Todd', 'Dennis', 'Frank', 'Pete', 'Bill', 'Ron', 'Josh', 'Dave', 'Steve',
  'Brandon', 'Arthur', 'Jim', 'Nick', 'Zac', 'DeMeco', 'Raheem', 'Jonathan',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Thompson', 'White', 'Harris',
  'Clark', 'Lewis', 'Robinson', 'Walker', 'Hall', 'Young', 'Allen', 'King',
  'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson',
  'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Parker',
  'Collins', 'Edwards', 'Stewart', 'Morris', 'Murphy', 'Rivera', 'Quinn', 'Payton',
];

const COACH_TRAITS = [
  'Players Coach', 'Disciplinarian', 'Offensive Guru', 'Defensive Mastermind',
  'Aggressive', 'Conservative', 'Motivator', 'Strategist', 'Developer',
  'Innovator', 'Old School', 'Analytics Driven',
];

const OFF_SCHEMES: OffensiveScheme[] = ['spread', 'west_coast', 'power_run', 'air_raid', 'rpo'];
const DEF_SCHEMES: DefensiveScheme[] = ['cover_3', 'man_press', 'tampa_2', 'blitz_34', 'zone_blitz'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let _coachId = 0;

export function generateCoach(role: CoachRole): Coach {
  _coachId++;
  const age = 38 + Math.floor(Math.random() * 25); // 38-62
  const ovr = 45 + Math.floor(Math.random() * 45);  // 45-89
  const yearsExp = Math.max(0, age - 35 - Math.floor(Math.random() * 10));
  const winsPerYear = ovr > 70 ? 9 + Math.random() * 3 : ovr > 55 ? 7 + Math.random() * 3 : 5 + Math.random() * 4;

  return {
    id: `coach_${_coachId}_${Date.now()}`,
    firstName: randomFrom(FIRST_NAMES),
    lastName: randomFrom(LAST_NAMES),
    role,
    ovr,
    age,
    offensiveScheme: role === 'DC' ? undefined : randomFrom(OFF_SCHEMES),
    defensiveScheme: role === 'OC' ? undefined : randomFrom(DEF_SCHEMES),
    trait: randomFrom(COACH_TRAITS),
    yearsWithTeam: Math.floor(Math.random() * 6),
    careerWins: Math.round(winsPerYear * yearsExp),
    careerLosses: Math.round((17 - winsPerYear) * yearsExp),
  };
}

export function generateCoachingStaff(): Coach[] {
  return [generateCoach('HC'), generateCoach('OC'), generateCoach('DC')];
}

// ---------------------------------------------------------------------------
// Scheme labels
// ---------------------------------------------------------------------------

export const OFFENSIVE_SCHEME_LABELS: Record<OffensiveScheme, string> = {
  spread: 'Spread',
  west_coast: 'West Coast',
  power_run: 'Power Run',
  air_raid: 'Air Raid',
  rpo: 'RPO',
};

export const DEFENSIVE_SCHEME_LABELS: Record<DefensiveScheme, string> = {
  cover_3: 'Cover 3',
  man_press: 'Man Press',
  tampa_2: 'Tampa 2',
  blitz_34: '3-4 Blitz',
  zone_blitz: 'Zone Blitz',
};

// ---------------------------------------------------------------------------
// Scheme fit
// ---------------------------------------------------------------------------

export type SchemeFit = 'great' | 'neutral' | 'poor';

export function calculateSchemeFit(player: Player, team: Team): SchemeFit {
  const coaches = team.coaches ?? [];
  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  const offScheme = oc?.offensiveScheme ?? hc?.offensiveScheme;
  const defScheme = dc?.defensiveScheme ?? hc?.defensiveScheme;
  const r = player.ratings;

  // Offensive players
  if (['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.position) && offScheme) {
    switch (offScheme) {
      case 'spread':
        if (player.position === 'WR' && r.speed >= 80) return 'great';
        if (player.position === 'QB' && r.throwing >= 75) return 'great';
        if (player.position === 'RB' && r.strength >= 80 && r.speed < 70) return 'poor';
        break;
      case 'power_run':
        if (player.position === 'OL' && r.blocking >= 78) return 'great';
        if (player.position === 'RB' && r.strength >= 78) return 'great';
        if (player.position === 'WR' && r.speed >= 85 && r.blocking < 55) return 'poor';
        break;
      case 'west_coast':
        if (player.position === 'TE' && r.catching >= 75) return 'great';
        if (player.position === 'QB' && r.awareness >= 78) return 'great';
        break;
      case 'air_raid':
        if (player.position === 'QB' && r.throwing >= 80) return 'great';
        if (player.position === 'WR' && r.catching >= 78) return 'great';
        if (player.position === 'RB') return 'poor';
        break;
      case 'rpo':
        if (player.position === 'QB' && r.speed >= 72 && r.throwing >= 70) return 'great';
        if (player.position === 'OL' && r.blocking >= 75) return 'great';
        break;
    }
  }

  // Defensive players
  if (['DL', 'LB', 'CB', 'S'].includes(player.position) && defScheme) {
    switch (defScheme) {
      case 'cover_3':
        if (player.position === 'CB' && r.coverage >= 78) return 'great';
        if (player.position === 'S' && r.coverage >= 75) return 'great';
        break;
      case 'man_press':
        if (player.position === 'CB' && r.speed >= 82 && r.coverage >= 75) return 'great';
        if (player.position === 'CB' && r.speed < 75) return 'poor';
        break;
      case 'tampa_2':
        if (player.position === 'LB' && r.coverage >= 70 && r.speed >= 72) return 'great';
        break;
      case 'blitz_34':
        if (player.position === 'LB' && r.passRush >= 78) return 'great';
        if (player.position === 'DL' && r.passRush >= 80) return 'great';
        break;
      case 'zone_blitz':
        if (player.position === 'LB' && r.awareness >= 75) return 'great';
        if (player.position === 'DL' && r.awareness >= 72) return 'great';
        break;
    }
  }

  return 'neutral';
}

export function schemeFitColor(fit: SchemeFit): string {
  switch (fit) {
    case 'great': return 'text-green-600';
    case 'poor': return 'text-red-500';
    default: return 'text-[var(--text-sec)]';
  }
}

export function schemeFitDot(fit: SchemeFit): string {
  switch (fit) {
    case 'great': return '🟢';
    case 'poor': return '🔴';
    default: return '🟡';
  }
}

// ---------------------------------------------------------------------------
// Coach OVR sim bonus
// ---------------------------------------------------------------------------

/** Returns a small OVR bonus (0-3) for team power based on coaching quality. */
export function coachingBonus(team: Team): number {
  const coaches = team.coaches ?? [];
  if (coaches.length === 0) return 0;
  const avgOvr = coaches.reduce((s, c) => s + c.ovr, 0) / coaches.length;
  // Scale: 50 OVR = 0 bonus, 80 OVR = ~3 bonus
  return Math.max(0, (avgOvr - 50) * 0.1);
}
