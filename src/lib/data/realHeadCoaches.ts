import type { Coach, CoachHistory, Team } from '@/types';

/**
 * Real current head coaches for the live NFL roster file.
 *
 * scripts/weekly_roster_update.py writes a BS-only `bsCoaches` block into
 * FBGM_NFL_Roster_2026_Updated.json from ESPN's core API (one head coach per
 * team, keyed by the file's team abbreviation). newLeague() in store.ts rolls a
 * random staff for every imported team, then applyRealHeadCoach() renames each
 * team's HC to the real person and makes his age / tenure / career record
 * plausible from ESPN's `experience` (completed seasons as an NFL head coach).
 *
 * Only head coaches are real — ESPN publishes nothing for coordinators or
 * position coaches, so those stay auto-generated. Ratings, schemes and
 * personality stay generated too: we have no basis for rating real people.
 *
 * Files without `bsCoaches` (random leagues, era rosters, uploads from stock
 * FBGM) are untouched, as are existing saves — this only runs at league
 * creation.
 */

export interface RealHeadCoachEntry {
  /** "First Last" as ESPN lists it. */
  name: string;
  /** Completed seasons as a head coach in this league (0 = first year). */
  experience: number;
  /** Age at the season start, when ESPN has a date of birth. */
  age?: number;
}

/** Validate the raw `bsCoaches` block from a roster file; undefined when absent or empty. */
export function realHeadCoachesFromFile(raw: unknown): Record<string, RealHeadCoachEntry> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, RealHeadCoachEntry> = {};
  for (const [abbrev, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as { name?: unknown; experience?: unknown; age?: unknown };
    if (typeof e.name !== 'string' || !e.name.trim()) continue;
    const entry: RealHeadCoachEntry = {
      name: e.name.trim(),
      experience: typeof e.experience === 'number' && e.experience >= 0 ? Math.floor(e.experience) : 0,
    };
    if (typeof e.age === 'number' && e.age >= 25 && e.age <= 90) entry.age = Math.floor(e.age);
    out[abbrev.toUpperCase()] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Overlay the real head coach onto a team's generated staff, in place.
 * Returns true when a coach was applied.
 */
export function applyRealHeadCoach(
  coaches: Coach[] | undefined,
  team: Pick<Team, 'id' | 'city' | 'name' | 'abbreviation'>,
  entries: Record<string, RealHeadCoachEntry> | undefined,
  season: number,
): boolean {
  if (!coaches || !entries) return false;
  const entry = entries[team.abbreviation.toUpperCase()];
  if (!entry) return false;
  const hcIdx = coaches.findIndex(c => c.role === 'HC');
  if (hcIdx === -1) return false;
  const hc = coaches[hcIdx];

  const parts = entry.name.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ') || parts[0];
  const yearsExp = entry.experience;
  // A head coach is rarely younger than ~35, and has been one for `yearsExp` years.
  const age = entry.age ?? Math.max(hc.age, 36 + yearsExp);

  // Career record from the generated OVR (same win-rate bands generateCoach uses)
  // over the real number of completed seasons, so the HC card is self-consistent.
  const winsPerYear = hc.ovr > 70 ? 10.5 : hc.ovr > 55 ? 8.5 : 7;
  const careerWins = Math.round(winsPerYear * yearsExp);
  const careerLosses = Math.max(0, 17 * yearsExp - careerWins);

  // ESPN gives career HC seasons, not tenure with this club; treating it as
  // tenure is right for most coaches and never invents stints elsewhere.
  const history: CoachHistory[] = yearsExp > 0 ? [{
    teamId: team.id,
    teamName: `${team.city} ${team.name}`,
    role: 'HC',
    seasonStart: season - yearsExp,
    seasonEnd: season - 1,
    wins: careerWins,
    losses: careerLosses,
    playoffAppearances: Math.round(yearsExp * (hc.ovr > 70 ? 0.6 : hc.ovr > 55 ? 0.35 : 0.15)),
    championships: 0,
  }] : [];

  const tenure = yearsExp === 0
    ? `his first season as an NFL head coach`
    : `his ${ordinal(yearsExp + 1)} season as an NFL head coach`;
  const bio = `${entry.name} enters ${season} in ${tenure}. Real-world ${season} ${team.name} head coach (ESPN); his ratings, scheme and staff are simulated.`;

  coaches[hcIdx] = {
    ...hc,
    firstName,
    lastName,
    age,
    yearsWithTeam: yearsExp,
    careerWins,
    careerLosses,
    bio,
    history,
  };
  return true;
}
