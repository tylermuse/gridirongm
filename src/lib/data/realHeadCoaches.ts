import type { Coach, CoachHistory, CoachRole, Team } from '@/types';
import { COACH_ROLE_LABELS } from '@/lib/engine/coaching';

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
 * Each entry can also carry `staff` — the real OC, DC and position coaches
 * (Wikipedia staff navboxes, scripts/nfl_coach_staff.py) — which
 * applyRealStaff() puts on the generated staff by role, and `contract` — the
 * publicly reported HC deal (years left incl. this season, $M/yr) from
 * scripts/data/nfl2026_coach_contracts.json. Coordinator / position-coach
 * contracts aren't public, so those stay generated. Ratings, schemes and
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
  /** Real assistant staff by role ("First Last"); roles missing here stay generated. */
  staff?: Partial<Record<StaffRole, string>>;
  /** Publicly reported HC contract: years left including this season, average $M/yr. */
  contract?: { years?: number; salary?: number };
}

export type StaffRole = Exclude<CoachRole, 'HC'>;
const STAFF_ROLES: StaffRole[] = ['OC', 'DC', 'QB', 'RB', 'WR', 'OL', 'DL', 'DB'];

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
    const rawStaff = (v as { staff?: unknown }).staff;
    if (rawStaff && typeof rawStaff === 'object') {
      const staff: Partial<Record<StaffRole, string>> = {};
      for (const role of STAFF_ROLES) {
        const n = (rawStaff as Record<string, unknown>)[role];
        if (typeof n === 'string' && n.trim()) staff[role] = n.trim();
      }
      if (Object.keys(staff).length > 0) entry.staff = staff;
    }
    const rawContract = (v as { contract?: unknown }).contract;
    if (rawContract && typeof rawContract === 'object') {
      const c = rawContract as { years?: unknown; salary?: unknown };
      const contract: { years?: number; salary?: number } = {};
      if (typeof c.years === 'number' && c.years >= 1 && c.years <= 10) contract.years = Math.floor(c.years);
      if (typeof c.salary === 'number' && c.salary > 0 && c.salary <= 50) contract.salary = c.salary;
      if (contract.years || contract.salary) entry.contract = contract;
    }
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

  // Publicly reported deal, where there is one; otherwise the generated contract stands.
  const contractYears = entry.contract?.years ?? hc.contractYears;
  const salary = entry.contract?.salary ?? hc.salary;
  const guaranteed = entry.contract
    ? Math.round((salary ?? 0) * (contractYears ?? 0) * 0.6 * 10) / 10
    : hc.guaranteed;

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
    contractYears,
    salary,
    guaranteed,
  };
  return true;
}

/**
 * Rename each generated coordinator / position coach to the team's real one,
 * in place. Ratings, age, schemes and contract stay generated (none of that is
 * public); the backfilled résumé is cleared so a real person isn't given
 * invented stints at other clubs. Returns how many coaches were renamed.
 */
export function applyRealStaff(
  coaches: Coach[] | undefined,
  team: Pick<Team, 'id' | 'city' | 'name' | 'abbreviation'>,
  entries: Record<string, RealHeadCoachEntry> | undefined,
  season: number,
): number {
  const staff = entries?.[team.abbreviation.toUpperCase()]?.staff;
  if (!coaches || !staff) return 0;
  let n = 0;
  for (const role of STAFF_ROLES) {
    const name = staff[role];
    if (!name) continue;
    const idx = coaches.findIndex(c => c.role === role);
    if (idx === -1) continue;
    const parts = name.split(' ');
    const label = COACH_ROLE_LABELS[role] ?? role;
    coaches[idx] = {
      ...coaches[idx],
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || parts[0],
      bio: `${name}: real-world ${season} ${team.name} ${label}. His ratings, age and contract are simulated.`,
      history: [],
    };
    n++;
  }
  return n;
}
