import type { Coach, CoachRole, CoachHistory, OffensiveScheme, DefensiveScheme, Player, Team } from '@/types';

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

const PERSONALITIES = ['fiery', 'cerebral', 'old-school', 'innovator', 'disciplinarian', "players' coach", 'tactician', 'motivator'];

const HC_SPECS = ['Game Management', 'Player Development', 'Locker Room Culture', 'Clock Management', 'In-Game Adjustments', 'Recruiting Free Agents'];
const OC_SPECS = ['QB Development', 'Play Design', 'Red Zone Offense', 'RPO Schemes', 'Pass Protection', 'Screen Game'];
const DC_SPECS = ['Pass Rush Schemes', 'Run Stopping', 'Coverage Design', 'Blitz Packages', 'Secondary Development', 'Situational Defense'];

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
  const name = `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
  const trait = randomFrom(COACH_TRAITS);
  const personality = randomFrom(PERSONALITIES);
  const scheme = role === 'DC' ? undefined : randomFrom(OFF_SCHEMES);

  // Bio generation
  const BIO_TEMPLATES = [
    `${name} is a ${yearsExp > 0 ? yearsExp + '-year' : 'first-year'} ${role} known for his ${trait} approach to the game.`,
    `A ${personality} leader, ${name} has built his reputation on ${scheme ? scheme + ' scheme mastery' : 'defensive excellence'}.`,
    `${name} spent ${yearsExp} years climbing the coaching ranks before landing his ${role === 'HC' ? 'head coaching' : 'coordinator'} role.`,
    `Known as a ${personality} presence on the sideline, ${name} brings ${yearsExp} years of experience.`,
  ];
  const bio = BIO_TEMPLATES[Math.floor(Math.random() * BIO_TEMPLATES.length)];

  // Specialties (2-3 based on role)
  const specPool = role === 'HC' ? HC_SPECS : role === 'OC' ? OC_SPECS : DC_SPECS;
  const specCount = 2 + Math.floor(Math.random() * 2); // 2-3
  const shuffled = [...specPool].sort(() => Math.random() - 0.5);
  const specialties = shuffled.slice(0, specCount);

  // Contract and salary
  const contractYears = 3 + Math.floor(Math.random() * 3); // 3-5
  const salary = ovr >= 80
    ? 8 + Math.round(Math.random() * 4 * 10) / 10
    : ovr >= 60
      ? 4 + Math.round(Math.random() * 3 * 10) / 10
      : 2 + Math.round(Math.random() * 2 * 10) / 10;

  const firstName = name.split(' ')[0];
  const lastName = name.split(' ').slice(1).join(' ');

  return {
    id: `coach_${_coachId}_${Date.now()}`,
    firstName,
    lastName,
    role,
    ovr,
    age,
    offensiveScheme: role === 'DC' ? undefined : scheme,
    defensiveScheme: role === 'OC' ? undefined : randomFrom(DEF_SCHEMES),
    trait,
    yearsWithTeam: Math.floor(Math.random() * 6),
    careerWins: Math.round(winsPerYear * yearsExp),
    careerLosses: Math.round((17 - winsPerYear) * yearsExp),
    bio,
    history: [],
    ratingHistory: [{ season: 0, ovr }],
    personality,
    specialties,
    contractYears,
    salary,
  };
}

export function generateCoachingStaff(): Coach[] {
  return [generateCoach('HC'), generateCoach('OC'), generateCoach('DC')];
}

/** Backfill 1-2 fake coaching history stints for initial league generation */
export function backfillCoachHistory(coach: Coach, currentTeamId: string, teams: Team[], season: number): CoachHistory[] {
  const stints = 1 + Math.floor(Math.random() * 2); // 1-2 previous stints
  const history: CoachHistory[] = [];
  const otherTeams = teams.filter(t => t.id !== currentTeamId);
  for (let i = 0; i < stints && otherTeams.length > 0; i++) {
    const prevTeam = otherTeams[Math.floor(Math.random() * otherTeams.length)];
    const duration = 1 + Math.floor(Math.random() * 4); // 1-4 years
    const startSeason = season - duration - Math.floor(Math.random() * 3);
    history.push({
      teamId: prevTeam.id,
      teamName: `${prevTeam.city} ${prevTeam.name}`,
      role: coach.role,
      seasonStart: startSeason,
      seasonEnd: startSeason + duration - 1,
      wins: Math.floor(Math.random() * 10 * duration),
      losses: Math.floor(Math.random() * 10 * duration),
      playoffAppearances: Math.floor(Math.random() * (duration > 2 ? 2 : 1)),
      championships: Math.random() < 0.1 ? 1 : 0,
    });
  }
  return history;
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
// Rating context: primary stats use gaussian(talentMean, 8) where tier is 50-75.
// Secondary stats use gaussian(talentMean-10, 10). Unweighted stats use gaussian(35, 12).
// Thresholds are calibrated so ~20-30% of a roster gets "great", ~5-15% gets "poor".

export type SchemeFit = 'great' | 'neutral' | 'poor';

/** Compute a scheme fit score for a player. Positive = great, negative = poor, 0 = neutral. */
function offensiveFitScore(player: Player, scheme: OffensiveScheme): number {
  const r = player.ratings;
  const pos = player.position;

  // Great fit thresholds use the player's OVR as a baseline so good players
  // at relevant positions naturally fit schemes.  Each scheme emphasizes 3-4
  // positions; others fall through to neutral.
  switch (scheme) {
    case 'rpo':
      // Athletic QB, agile RB, route-running WR, versatile OL
      if (pos === 'QB') return (r.speed + r.agility) / 2 >= 58 ? 1 : (r.speed <= 35 ? -1 : 0);
      if (pos === 'RB') return r.agility >= 67 && r.speed >= 62 ? 1 : (r.speed <= 42 ? -1 : 0);
      if (pos === 'WR') return r.catching >= 67 && r.agility >= 55 ? 1 : (r.catching <= 42 ? -1 : 0);
      if (pos === 'OL') return r.blocking >= 67 && r.strength >= 65 ? 1 : (r.blocking <= 42 ? -1 : 0);
      break;

    case 'spread':
      // Accurate QB, fast WR, receiving TE
      if (pos === 'QB') return r.throwing >= 68 ? 1 : (r.throwing <= 48 ? -1 : 0);
      if (pos === 'WR') return r.speed >= 68 ? 1 : (r.speed <= 48 ? -1 : 0);
      if (pos === 'TE') return r.catching >= 64 ? 1 : (r.catching <= 42 ? -1 : 0);
      if (pos === 'RB') return r.speed >= 70 ? 1 : 0;
      break;

    case 'power_run':
      // Strong RB, mauler OL, blocking TE
      if (pos === 'RB') return r.strength >= 62 && r.carrying >= 67 ? 1 : (r.strength <= 42 ? -1 : 0);
      if (pos === 'OL') return r.blocking >= 67 && r.strength >= 67 ? 1 : (r.strength <= 45 ? -1 : 0);
      if (pos === 'TE') return r.blocking >= 64 ? 1 : (r.blocking <= 38 ? -1 : 0);
      if (pos === 'WR') return r.blocking <= 25 ? -1 : 0;
      break;

    case 'west_coast':
      // Smart accurate QB, route-running WR, receiving RB
      if (pos === 'QB') return r.throwing >= 67 && r.awareness >= 67 ? 1 : (r.awareness <= 45 ? -1 : 0);
      if (pos === 'WR') return r.catching >= 68 ? 1 : (r.catching <= 45 ? -1 : 0);
      if (pos === 'RB') return r.agility >= 67 ? 1 : (r.agility <= 40 ? -1 : 0);
      if (pos === 'TE') return r.catching >= 64 ? 1 : 0;
      break;

    case 'air_raid':
      // Big arm QB, speedy WR, pass-blocking OL
      if (pos === 'QB') return r.throwing >= 70 ? 1 : (r.throwing <= 48 ? -1 : 0);
      if (pos === 'WR') return r.speed >= 70 && r.catching >= 60 ? 1 : (r.speed <= 48 ? -1 : 0);
      if (pos === 'OL') return r.blocking >= 68 ? 1 : (r.blocking <= 45 ? -1 : 0);
      if (pos === 'RB') return r.speed <= 42 ? -1 : 0;
      break;
  }
  return 0;
}

function defensiveFitScore(player: Player, scheme: DefensiveScheme): number {
  const r = player.ratings;
  const pos = player.position;

  switch (scheme) {
    case 'man_press':
      // Fast physical CBs, coverage S, pass-rushing DL
      if (pos === 'CB') return r.speed >= 68 && r.coverage >= 67 ? 1 : (r.speed <= 48 ? -1 : 0);
      if (pos === 'S') return r.coverage >= 64 ? 1 : (r.coverage <= 40 ? -1 : 0);
      if (pos === 'LB') return r.coverage >= 54 ? 1 : (r.coverage <= 30 ? -1 : 0);
      if (pos === 'DL') return r.passRush >= 67 ? 1 : (r.passRush <= 42 ? -1 : 0);
      break;

    case 'cover_3':
      // Zone coverage CBs, rangy safeties, zone LBs
      if (pos === 'CB') return r.coverage >= 67 ? 1 : (r.coverage <= 42 ? -1 : 0);
      if (pos === 'S') return r.coverage >= 64 && r.speed >= 54 ? 1 : (r.speed <= 38 ? -1 : 0);
      if (pos === 'LB') return r.coverage >= 52 && r.awareness >= 57 ? 1 : (r.coverage <= 28 ? -1 : 0);
      if (pos === 'DL') return r.strength >= 67 ? 1 : 0;
      break;

    case 'tampa_2':
      // Fast coverage LBs, coverage safeties, zone CBs
      if (pos === 'LB') return r.speed >= 58 && r.coverage >= 50 ? 1 : (r.speed <= 38 ? -1 : 0);
      if (pos === 'S') return r.coverage >= 64 ? 1 : (r.coverage <= 40 ? -1 : 0);
      if (pos === 'CB') return r.coverage >= 67 ? 1 : 0;
      if (pos === 'DL') return r.passRush >= 67 ? 1 : 0;
      break;

    case 'blitz_34':
      // Pass-rushing LBs, strong DL
      if (pos === 'LB') return r.passRush >= 54 || (r.tackling >= 70 && r.speed >= 58) ? 1 : (r.tackling <= 42 ? -1 : 0);
      if (pos === 'DL') return r.strength >= 68 && r.passRush >= 62 ? 1 : (r.strength <= 45 ? -1 : 0);
      if (pos === 'S') return r.tackling >= 64 ? 1 : 0;
      if (pos === 'CB') return r.speed >= 68 ? 1 : 0;
      break;

    case 'zone_blitz':
      // Versatile LBs, aware DL
      if (pos === 'LB') return r.awareness >= 60 && r.tackling >= 58 ? 1 : (r.awareness <= 38 ? -1 : 0);
      if (pos === 'DL') return r.awareness >= 56 && r.passRush >= 58 ? 1 : (r.awareness <= 35 ? -1 : 0);
      if (pos === 'CB') return r.coverage >= 64 ? 1 : 0;
      if (pos === 'S') return r.awareness >= 58 ? 1 : 0;
      break;
  }
  return 0;
}

export function calculateSchemeFit(player: Player, team: Team): SchemeFit {
  const coaches = team.coaches ?? [];
  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  const offScheme = oc?.offensiveScheme ?? hc?.offensiveScheme;
  const defScheme = dc?.defensiveScheme ?? hc?.defensiveScheme;

  const isOffense = ['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.position);
  const isDefense = ['DL', 'LB', 'CB', 'S'].includes(player.position);

  let score = 0;
  if (isOffense && offScheme) score = offensiveFitScore(player, offScheme);
  if (isDefense && defScheme) score = defensiveFitScore(player, defScheme);

  // K/P are always neutral
  if (score >= 1) return 'great';
  if (score <= -1) return 'poor';
  return 'neutral';
}

/** Returns OVR adjustment for scheme fit: +2 for great, -1 for poor, 0 for neutral. */
export function schemeFitOvrBonus(player: Player, team: Team): number {
  const fit = calculateSchemeFit(player, team);
  if (fit === 'great') return 2;
  if (fit === 'poor') return -1;
  return 0;
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
export function coachingBonus(team: Team, roster?: Player[]): number {
  const coaches = team.coaches ?? [];
  if (coaches.length === 0) return 0;
  const avgOvr = coaches.reduce((s, c) => s + c.ovr, 0) / coaches.length;
  // Scale: 50 OVR = 0 bonus, 80 OVR = ~3 bonus
  let bonus = Math.max(0, (avgOvr - 50) * 0.1);

  // Scheme fit roster bonus: avg of all scheme fit bonuses (+2 great, -1 poor)
  // A well-constructed roster adds ~0.5-1.0 to team power
  if (roster && roster.length > 0) {
    const fitSum = roster.reduce((s, p) => s + schemeFitOvrBonus(p, team), 0);
    bonus += (fitSum / roster.length) * 0.8;
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// Coach Progression (called during offseason)
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Progress all coaches: OVR changes based on team record, aging, retirement checks */
export function progressCoaches(teams: Team[], season?: number): { teams: Team[]; news: string[] } {
  const news: string[] = [];
  const updatedTeams = teams.map(t => {
    if (!t.coaches || t.coaches.length === 0) return t;
    const wins = t.record.wins;
    const coaches = t.coaches.map(c => {
      let ovr = c.ovr;
      // Season performance
      if (wins >= 10) ovr += 1 + Math.floor(Math.random() * 2); // +1 to +2
      else if (wins <= 5) ovr -= 1 + Math.floor(Math.random() * 3); // -1 to -3
      else ovr += Math.floor(Math.random() * 3) - 1; // -1 to +1
      ovr = clamp(ovr, 40, 95);

      const newAge = c.age + 1;
      const newWins = c.careerWins + t.record.wins;
      const newLosses = c.careerLosses + t.record.losses;
      const newYears = c.yearsWithTeam + 1;

      // Retirement check
      const retireChance = newAge >= 70 ? 0.25 : newAge >= 65 ? 0.10 : 0;
      if (retireChance > 0 && Math.random() < retireChance) {
        news.push(`${t.city} ${c.role} Coach ${c.firstName} ${c.lastName} (age ${newAge}) announces retirement after ${newYears} seasons.`);
        const replacement = generateCoach(c.role);
        replacement.yearsWithTeam = 0;
        return replacement;
      }

      // Update rating history
      const ratingHistory = [...(c.ratingHistory ?? []), { season: season ?? 0, ovr }];

      // Decrement contract years
      const updatedContractYears = Math.max(0, (c.contractYears ?? 3) - 1);

      // Recalculate salary based on updated OVR
      const updatedSalary = ovr >= 80
        ? 8 + Math.round(Math.random() * 4 * 10) / 10
        : ovr >= 60
          ? 4 + Math.round(Math.random() * 3 * 10) / 10
          : 2 + Math.round(Math.random() * 2 * 10) / 10;

      return {
        ...c, ovr, age: newAge, careerWins: newWins, careerLosses: newLosses, yearsWithTeam: newYears,
        ratingHistory,
        contractYears: updatedContractYears,
        salary: updatedSalary,
      };
    });
    return { ...t, coaches };
  });
  return { teams: updatedTeams, news };
}

// ---------------------------------------------------------------------------
// AI Coaching Carousel (called during offseason)
// ---------------------------------------------------------------------------

/** AI teams fire underperforming coaches */
export function processCoachingCarousel(teams: Team[], userTeamId: string, season?: number): { teams: Team[]; news: string[] } {
  const news: string[] = [];
  const updatedTeams = teams.map(t => {
    if (t.id === userTeamId) return t; // user manages their own coaches
    if (!t.coaches || t.coaches.length === 0) return t;

    const hc = t.coaches.find(c => c.role === 'HC');
    if (!hc) return t;

    const wins = t.record.wins;
    const tenure = hc.yearsWithTeam;

    let fireChance = 0;
    if (wins <= 4) fireChance = 0.75;
    else if (wins <= 5 && tenure >= 3) fireChance = 0.50;
    // Missing playoffs 3+ years tracked by low win totals over tenure
    else if (wins <= 8 && tenure >= 3) fireChance = 0.15;

    if (fireChance > 0 && Math.random() < fireChance) {
      news.push(`${t.city} fires HC ${hc.firstName} ${hc.lastName} after ${tenure} season${tenure !== 1 ? 's' : ''} (${hc.careerWins}-${hc.careerLosses} career).`);

      // Close out fired HC's history entry
      const currentSeason = season ?? 0;
      if (hc.history) {
        const openEntry = hc.history.find(h => h.seasonEnd >= currentSeason - 1 && h.teamId === t.id);
        if (openEntry) {
          openEntry.seasonEnd = currentSeason;
          openEntry.wins += t.record.wins;
          openEntry.losses += t.record.losses;
        }
      }

      const newHC = generateCoach('HC');
      newHC.yearsWithTeam = 0;
      // Start a new history entry for the hired coach
      newHC.history = [...(newHC.history ?? []), {
        teamId: t.id,
        teamName: `${t.city} ${t.name}`,
        role: 'HC' as const,
        seasonStart: currentSeason,
        seasonEnd: currentSeason, // will be updated each season
        wins: 0,
        losses: 0,
        playoffAppearances: 0,
        championships: 0,
      }];

      let coaches = t.coaches.map(c => c.role === 'HC' ? newHC : c);

      // 40% chance coordinators also get replaced
      if (Math.random() < 0.40) {
        const replaceOC = Math.random() < 0.5;
        const role = replaceOC ? 'OC' : 'DC';
        // Close out fired coordinator's history
        const firedCoord = t.coaches.find(c => c.role === role);
        if (firedCoord?.history) {
          const openEntry = firedCoord.history.find(h => h.seasonEnd >= currentSeason - 1 && h.teamId === t.id);
          if (openEntry) {
            openEntry.seasonEnd = currentSeason;
            openEntry.wins += t.record.wins;
            openEntry.losses += t.record.losses;
          }
        }
        const newCoord = generateCoach(role as CoachRole);
        newCoord.yearsWithTeam = 0;
        // Start a new history entry for the hired coordinator
        newCoord.history = [...(newCoord.history ?? []), {
          teamId: t.id,
          teamName: `${t.city} ${t.name}`,
          role: role as 'HC' | 'OC' | 'DC',
          seasonStart: currentSeason,
          seasonEnd: currentSeason,
          wins: 0,
          losses: 0,
          playoffAppearances: 0,
          championships: 0,
        }];
        coaches = coaches.map(c => c.role === role ? newCoord : c);
        news.push(`${t.city} also parts ways with ${role} Coach.`);
      }

      return { ...t, coaches };
    }
    return t;
  });
  return { teams: updatedTeams, news };
}
