import type { Player, PlayerRatings, Position, Team } from '@/types';
import { emptyRecord, emptyStats, POSITIONS, generateGuaranteed } from '@/types';
import { estimateSalary, LEAGUE_MINIMUM_SALARY } from '@/lib/engine/salary';
import { LEAGUE_TEAMS } from './teams';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Convert a (year, round, pick-in-round) imported draft pick into the
 * overall pick number used everywhere else in the engine. The in-engine
 * draft path already stores overall in player.draftPick, so we normalize
 * imports to match — otherwise R3 pick 18 would display as "Draft #18"
 * alongside another R1 pick 18.
 *
 * Round sizes are hardcoded for years where we have authoritative data
 * (e.g. the 2026 NFL roster file with its full draft applied). For other
 * years we fall back to the standard 32-per-round approximation, which is
 * off for comp picks but matches the convention used by FBGM displays.
 */
const DRAFT_ROUND_SIZES: Record<number, number[]> = {
  // [R1, R2, R3, R4, R5, R6, R7] sizes for 2026 (matches Sharp Football's tracker)
  2026: [32, 32, 36, 40, 40, 33, 41],
};

function computeOverallPick(
  year: number | null | undefined,
  round: number | null | undefined,
  pickInRound: number | null | undefined,
): number | null {
  if (round == null || pickInRound == null || round < 1) return pickInRound ?? null;
  const sizes = year != null ? DRAFT_ROUND_SIZES[year] : undefined;
  if (sizes && sizes.length >= round) {
    let overall = pickInRound;
    for (let i = 0; i < round - 1; i++) overall += sizes[i];
    return overall;
  }
  // Fallback: standard 32-per-round (ignores comp picks for older years)
  return (round - 1) * 32 + pickInRound;
}

interface FbgmRating {
  pos?: string;
  ovr?: number;
  pot?: number;
  season?: number;
  spd?: number;
  stre?: number;
  elu?: number;
  endu?: number;
  thv?: number;
  thp?: number;
  tha?: number;
  hnd?: number;
  bsc?: number;
  rbk?: number;
  pbk?: number;
  tck?: number;
  pcv?: number;
  prs?: number;
  rns?: number;
  kpw?: number;
  kac?: number;
  ppw?: number;
  pac?: number;
}

interface FbgmTeam {
  tid: number;
  cid: number;
  did: number;
  region: string;
  name: string;
  abbrev: string;
  colors?: string[];
  imgURL?: string;
}

interface FbgmPlayer {
  pid: number;
  tid: number;
  firstName: string;
  lastName: string;
  imgURL?: string;
  born?: { year?: number };
  draft?: { year?: number; pick?: number; round?: number; tid?: number; originalTid?: number };
  contract?: { amount?: number; exp?: number };
  injury?: { type?: string; gamesRemaining?: number };
  ratings?: FbgmRating[];
}

interface FbgmDraftPick {
  tid: number;            // current owner (may differ from originalTid for traded picks)
  originalTid: number;    // original owner
  round: number;
  pick?: number;          // 0 if order not yet determined
  season: number;
  dpid?: number;          // FBGM internal id
}

interface FbgmLeagueFile {
  teams: FbgmTeam[];
  players: FbgmPlayer[];
  gameAttributes?: {
    season?: number;
    confs?: Array<{ cid: number; name: string }>;
    divs?: Array<{ did: number; cid: number; name: string }>;
  };
  draftPicks?: FbgmDraftPick[];
}

function clamp(value: number, min = 20, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function avg(values: number[], fallback = 50): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return fallback;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function normalizeHexColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

/** Relative luminance (0-1) — used to detect white/near-white team colors
 *  that render invisible against the light page background. */
function colorLuminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0.5;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mapDivision(name: string | undefined): Team['division'] {
  if (!name) return 'East';
  if (name.endsWith('North')) return 'North';
  if (name.endsWith('South')) return 'South';
  if (name.endsWith('West')) return 'West';
  return 'East';
}

function mapPosition(pos?: string): Position | null {
  const normalized = (pos ?? '').toUpperCase();
  if (normalized === 'QB') return 'QB';
  if (['RB', 'HB', 'FB'].includes(normalized)) return 'RB';
  if (['WR', 'KR', 'PR'].includes(normalized)) return 'WR';
  if (normalized === 'TE') return 'TE';
  if (['OL', 'C', 'G', 'T', 'OT', 'OG'].includes(normalized)) return 'OL';
  if (['DL', 'DE', 'DT', 'NT'].includes(normalized)) return 'DL';
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(normalized)) return 'LB';
  if (normalized === 'CB') return 'CB';
  if (['S', 'FS', 'SS'].includes(normalized)) return 'S';
  if (normalized === 'K') return 'K';
  if (normalized === 'P') return 'P';
  return null;
}

function latestRatings(player: FbgmPlayer, season: number): FbgmRating | null {
  if (!player.ratings || player.ratings.length === 0) return null;
  const seasonRatings = player.ratings.filter((r) => (r.season ?? season) <= season);
  const pool = seasonRatings.length > 0 ? seasonRatings : player.ratings;
  return pool.reduce((best, current) =>
    (current.season ?? 0) > (best.season ?? 0) ? current : best,
  );
}

function mapRatings(ratings: FbgmRating): { ratings: PlayerRatings; potential: number; position: Position | null } {
  const position = mapPosition(ratings.pos);
  const overall = clamp(ratings.ovr ?? 50);
  const potential = clamp(ratings.pot ?? overall);
  const mapped: PlayerRatings = {
    overall,
    speed: clamp(ratings.spd ?? 50),
    strength: clamp(ratings.stre ?? 50),
    agility: clamp(ratings.elu ?? ratings.spd ?? 50),
    awareness: clamp(avg([ratings.ovr ?? 50, ratings.pot ?? 50])),
    stamina: clamp(ratings.endu ?? 60),
    throwing: clamp(avg([ratings.thv ?? 0, ratings.thp ?? 0, ratings.tha ?? 0], 20)),
    catching: clamp(ratings.hnd ?? 20),
    carrying: clamp(ratings.bsc ?? 20),
    blocking: clamp(avg([ratings.rbk ?? 0, ratings.pbk ?? 0], 20)),
    tackling: clamp(ratings.tck ?? 20),
    coverage: clamp(ratings.pcv ?? 20),
    passRush: clamp(avg([ratings.prs ?? 0, ratings.rns ?? 0], 20)),
    kicking: clamp(avg([ratings.kpw ?? 0, ratings.kac ?? 0, ratings.ppw ?? 0, ratings.pac ?? 0], 20)),
  };
  return { ratings: mapped, potential, position };
}

function mapContract(
  contract: FbgmPlayer['contract'],
  season: number,
): { salary: number; yearsLeft: number; guaranteed: number; totalYears: number } {
  const salary = Math.max(0.5, Math.round(((contract?.amount ?? 500) / 1000) * 10) / 10);
  const yearsLeft = Math.max(1, (contract?.exp ?? season) - season + 1);
  return { salary, yearsLeft, guaranteed: generateGuaranteed(salary, yearsLeft), totalYears: yearsLeft };
}

export interface ImportedLeagueData {
  season: number;
  teams: Team[];
  players: Player[];
}

export function convertFbgmLeague(league: FbgmLeagueFile): ImportedLeagueData {
  const season = league.gameAttributes?.season ?? new Date().getFullYear();
  const confById = new Map<number, Team['conference']>(
    (league.gameAttributes?.confs ?? []).map((conf) => [
      conf.cid,
      conf.name === 'NFC' ? 'NC' : 'AC',
    ]),
  );
  const divById = new Map<number, Team['division']>(
    (league.gameAttributes?.divs ?? []).map((div) => [div.did, mapDivision(div.name)]),
  );
  const templateByAbbrev = new Map(LEAGUE_TEAMS.map((team) => [team.abbreviation, team]));

  const teams = league.teams.map((team) => {
    const template = templateByAbbrev.get(team.abbrev);
    let primaryColor = normalizeHexColor(team.colors?.[0], template?.primaryColor ?? '#1E3A8A');
    let secondaryColor = normalizeHexColor(team.colors?.[1], template?.secondaryColor ?? '#E5E7EB');
    // Some FBGM rosters list white (#ffffff) as the primary color for teams
    // like the Colts or Dolphins. White-on-white rendering hides the entire
    // home side of the scoreboard. If primary is too light (luminance > 0.85),
    // swap with secondary so both render visibly.
    if (colorLuminance(primaryColor) > 0.85 && colorLuminance(secondaryColor) < 0.85) {
      [primaryColor, secondaryColor] = [secondaryColor, primaryColor];
    } else if (colorLuminance(primaryColor) > 0.85) {
      // Both colors too light — fall back to the BS Football template.
      primaryColor = template?.primaryColor ?? '#1E3A8A';
    }
    return {
      id: `team-${team.tid}`,
      city: team.region,
      name: team.name,
      abbreviation: team.abbrev,
      conference: confById.get(team.cid) ?? template?.conference ?? 'AC',
      division: divById.get(team.did) ?? template?.division ?? 'East',
      primaryColor,
      secondaryColor,
      logoUrl: team.imgURL || undefined,
      record: emptyRecord(),
      salaryCap: 300,
      totalPayroll: 0,
      roster: [],
      draftPicks: [],
    };
  });

  const teamByTid = new Map(league.teams.map((team) => [team.tid, `team-${team.tid}`]));

  const players: Player[] = [];
  for (const player of league.players) {
    if (player.tid < 0 || !teamByTid.has(player.tid)) {
      continue;
    }

    const rating = latestRatings(player, season);
    if (!rating) continue;
    const { ratings, potential, position } = mapRatings(rating);
    if (!position) continue;

    const age = Math.max(20, season - (player.born?.year ?? season - 24));
    const draftYear = player.draft?.year ?? null;
    const experience = draftYear ? Math.max(0, season - draftYear) : Math.max(0, age - 22);
    const contract = mapContract(player.contract, season);

    players.push({
      id: `player-${player.pid}`,
      firstName: player.firstName,
      lastName: player.lastName,
      position,
      age,
      experience,
      ratings,
      potential,
      stats: emptyStats(),
      careerStats: emptyStats(),
      contract,
      teamId: teamByTid.get(player.tid) ?? null,
      draftYear,
      // FBGM source rosters store draft.pick as pick-in-round (e.g. 18 for the
      // 18th pick of the 3rd round). The in-engine draft path stores overall.
      // Normalize imports to overall so the Roster page's "Draft #N" display
      // doesn't show two players from different rounds with the same number.
      draftPick: computeOverallPick(draftYear, player.draft?.round, player.draft?.pick),
      // Persist round + drafting team so the Draft Results panel can find
      // historic picks (R1-R3 typically pre-applied in the source roster)
      // when the in-game draftResults array doesn't have an entry for that
      // overall pick.
      draftRound: player.draft?.round,
      draftTeamId: player.draft?.tid != null ? teamByTid.get(player.draft.tid) : undefined,
      retired: false,
      injury: player.injury?.type && player.injury.type !== 'Healthy'
        ? { type: player.injury.type, weeksLeft: Math.max(1, player.injury.gamesRemaining ?? 1) }
        : null,
      ratingHistory: [],
      onIR: false,
      mood: 60 + Math.floor(Math.random() * 30),
      photoUrl: player.imgURL || undefined,
    });
  }

  // Draft classes are typically stored as tid = -2 for upcoming draft years.
  // Pull all classes from current season forward so each draft year stays separate.
  const importedProspects: Player[] = [];
  for (const player of league.players) {
    if (player.tid !== -2) {
      continue;
    }
    const draftYear = player.draft?.year;
    if (!draftYear || draftYear < season) {
      continue;
    }
    const rating = latestRatings(player, season);
    if (!rating) continue;
    const { ratings, potential, position } = mapRatings(rating);
    if (!position) continue;
    const age = Math.max(20, season - (player.born?.year ?? season - 21));
    importedProspects.push({
      id: `player-${player.pid}`,
      firstName: player.firstName,
      lastName: player.lastName,
      position,
      age,
      experience: 0,
      ratings,
      potential,
      stats: emptyStats(),
      careerStats: emptyStats(),
      contract: { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 },
      teamId: null,
      draftYear,
      draftPick: null,
      retired: false,
      injury: null,
      ratingHistory: [],
      onIR: false,
      mood: 70,
      photoUrl: player.imgURL || undefined,
    });
  }

  players.push(...importedProspects);

  // ── Fix stale / minimum-salary contracts for imported players ──────────
  // Roster files often update a player's team (tid) to reflect real FA moves
  // without also updating the contract object. This leaves good players on
  // league-minimum deals. Re-price any rostered player whose salary is
  // significantly below what their OVR warrants.
  for (const p of players) {
    if (!p.teamId || p.experience === 0) continue; // skip FAs and prospects
    const fair = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);
    // Flag as stale: on a team, paid near the league minimum, but fair value is much higher
    if (p.contract.salary <= LEAGUE_MINIMUM_SALARY + 0.1 && fair > LEAGUE_MINIMUM_SALARY * 2) {
      const salary = Math.round(fair * 10) / 10;
      const yearsLeft = Math.max(1, p.contract.yearsLeft);
      p.contract = { salary, yearsLeft, guaranteed: generateGuaranteed(salary, yearsLeft), totalYears: yearsLeft };
    }
  }

  const rosterByTeamId = new Map<string, string[]>();
  const payrollByTeamId = new Map<string, number>();
  for (const player of players) {
    if (!player.teamId) continue;
    const roster = rosterByTeamId.get(player.teamId) ?? [];
    roster.push(player.id);
    rosterByTeamId.set(player.teamId, roster);
    payrollByTeamId.set(player.teamId, (payrollByTeamId.get(player.teamId) ?? 0) + player.contract.salary);
  }

  // Pre-compute draft picks from the source JSON. The file encodes real
  // ownership including trades (e.g. Dexter Lawrence's pick to CIN, Mauigoa
  // to NYG at 10) — previously the import ignored raw.draftPicks entirely
  // and hardcoded `rounds 1-7 × season / +1 / +2` for every team, so traded
  // picks reverted and already-consumed picks reappeared.
  //
  // Convention: group by current owner. For a given (year, round, ownerTid)
  // we use the source record and carry originalTid over. Any (team, year)
  // combo the source file DOESN'T cover falls back to the old synthesized
  // default — important for years beyond the file's horizon (e.g. 2029+
  // once a user plays past the file's range).
  const sourcePicks = league.draftPicks ?? [];
  const picksByOwner = new Map<string, Array<{ id: string; year: number; round: number; originalTeamId: string; ownerTeamId: string }>>();
  const yearsCoveredPerOwner = new Map<string, Set<number>>();
  for (const sp of sourcePicks) {
    const ownerId = teamByTid.get(sp.tid);
    if (!ownerId) continue; // unknown tid — skip defensively
    const originalId = teamByTid.get(sp.originalTid) ?? ownerId;
    const list = picksByOwner.get(ownerId) ?? [];
    list.push({
      id: uuid(),
      year: sp.season,
      round: sp.round,
      originalTeamId: originalId,
      ownerTeamId: ownerId,
    });
    picksByOwner.set(ownerId, list);
    // Track which (team, year) combos the source file provided so we don't
    // double-up by also synthesizing defaults for those years.
    const yrs = yearsCoveredPerOwner.get(ownerId) ?? new Set<number>();
    yrs.add(sp.season);
    yearsCoveredPerOwner.set(ownerId, yrs);
  }

  const finalizedTeams = teams.map((team) => {
    const rosterIds = rosterByTeamId.get(team.id) ?? [];
    const teamPlayers = players.filter(p => p.teamId === team.id);
    const depthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
      acc[pos] = teamPlayers
        .filter(p => p.position === pos)
        .sort((a, b) => b.ratings.overall - a.ratings.overall)
        .map(p => p.id);
      return acc;
    }, {} as Record<Position, string[]>);

    // Merge source picks with synthesized defaults for uncovered years only.
    const sourceOwned = picksByOwner.get(team.id) ?? [];
    const covered = yearsCoveredPerOwner.get(team.id) ?? new Set<number>();
    const synthesized = [season, season + 1, season + 2]
      .filter(yr => !covered.has(yr))
      .flatMap((yr) =>
        [1, 2, 3, 4, 5, 6, 7].map((round) => ({
          id: uuid(),
          year: yr,
          round,
          originalTeamId: team.id,
          ownerTeamId: team.id,
        })),
      );

    return {
      ...team,
      roster: rosterIds,
      totalPayroll: Math.round((payrollByTeamId.get(team.id) ?? 0) * 10) / 10,
      draftPicks: [...sourceOwned, ...synthesized],
      depthChart,
      deadCap: [],
      franchiseTagUsed: false,
      revenue: { tickets: 0, merchandise: 0, tvDeal: 0, total: 0 },
    };
  });

  return { season, teams: finalizedTeams, players };
}

export async function loadLeagueFromUrl(url: string): Promise<ImportedLeagueData> {
  const data = await fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load league data: ${response.status}`);
      }
      return response.json() as Promise<FbgmLeagueFile>;
    })
    .then((raw) => convertFbgmLeague(raw));
  return data;
}
