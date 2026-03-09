import type { Player, PlayerRatings, Position, Team } from '@/types';
import { emptyRecord, emptyStats, POSITIONS, generateGuaranteed } from '@/types';
import { LEAGUE_TEAMS } from './teams';

function uuid(): string {
  return crypto.randomUUID();
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
}

interface FbgmPlayer {
  pid: number;
  tid: number;
  firstName: string;
  lastName: string;
  imgURL?: string;
  born?: { year?: number };
  draft?: { year?: number; pick?: number; round?: number };
  contract?: { amount?: number; exp?: number };
  injury?: { type?: string; gamesRemaining?: number };
  ratings?: FbgmRating[];
}

interface FbgmLeagueFile {
  teams: FbgmTeam[];
  players: FbgmPlayer[];
  gameAttributes?: {
    season?: number;
    confs?: Array<{ cid: number; name: string }>;
    divs?: Array<{ did: number; cid: number; name: string }>;
  };
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
    const primaryColor = normalizeHexColor(team.colors?.[0], template?.primaryColor ?? '#1E3A8A');
    const secondaryColor = normalizeHexColor(team.colors?.[1], template?.secondaryColor ?? '#E5E7EB');
    return {
      id: `team-${team.tid}`,
      city: team.region,
      name: team.name,
      abbreviation: team.abbrev,
      conference: confById.get(team.cid) ?? template?.conference ?? 'AC',
      division: divById.get(team.did) ?? template?.division ?? 'East',
      primaryColor,
      secondaryColor,
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
      draftPick: player.draft?.pick ?? null,
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

  const rosterByTeamId = new Map<string, string[]>();
  const payrollByTeamId = new Map<string, number>();
  for (const player of players) {
    if (!player.teamId) continue;
    const roster = rosterByTeamId.get(player.teamId) ?? [];
    roster.push(player.id);
    rosterByTeamId.set(player.teamId, roster);
    payrollByTeamId.set(player.teamId, (payrollByTeamId.get(player.teamId) ?? 0) + player.contract.salary);
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
    return {
      ...team,
      roster: rosterIds,
      totalPayroll: Math.round((payrollByTeamId.get(team.id) ?? 0) * 10) / 10,
      draftPicks: [1, 2, 3, 4, 5, 6, 7].map((round) => ({
        id: uuid(),
        year: season,
        round,
        originalTeamId: team.id,
        ownerTeamId: team.id,
      })),
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
