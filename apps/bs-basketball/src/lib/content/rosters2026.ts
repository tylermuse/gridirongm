/**
 * Server-only data access for the public 2026 roster reference pages
 * (/rosters/2026 and /rosters/2026/[team]).
 *
 * Reads the shipped BBGM roster file from /public/rosters at BUILD time and runs
 * it through the exact same converter the game uses on import
 * (`convertBbgmLeague`), so the overalls, positions and contracts shown on these
 * pages are the numbers a player actually gets when they start a league from
 * this roster. Uses node:fs — import ONLY from Server Components so the 7.6MB
 * JSON never reaches a client bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  basketballTeamCapStatus,
  basketballMarketSalary,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/lib/data/leagueImport';

export const ROSTER_FILE = 'BBGM_NBA_Roster_2026_Updated.json';
export const ROSTER_SEASON = 2026;
export const SITE = 'https://bs-basketball.com';

export interface RosterPlayer {
  id: string;
  name: string;
  pos: string;
  secondaryPos: string | null;
  age: number;
  height: string;
  ovr: number;
  pot: number;
  threePoint: number;
  finishing: number;
  passing: number;
  defense: number;
  rebounding: number;
  /** 2026-27 cap hit in dollars (0 if none). */
  salary: number;
  /** Estimated market value in dollars (what he'd ask as a free agent). */
  market: number;
  /** Last season of the contract, as "2029-30". */
  through: string | null;
  yearsLeft: number;
  college: string | null;
  draft: string | null;
  isRookie: boolean;
  injury: string | null;
}

export type CapTier = 'under-cap' | 'over-cap' | 'taxpayer' | 'first-apron' | 'second-apron';

export interface RosterTeam {
  slug: string;
  abbrev: string;
  city: string;
  name: string;
  fullName: string;
  conference: string;
  division: string;
  color: string;
  lastRecord: { won: number; lost: number } | null;
  players: RosterPlayer[];
  payroll: number;
  cap: number;
  taxLine: number;
  firstApron: number;
  secondApron: number;
  capTier: CapTier;
  avgAge: number;
  /** Mean OVR of the top 8 — the rotation-quality number the game's own AI uses. */
  top8: number;
  /** 1 = deepest top-8 in the league. */
  strengthRank: number;
  expiringMoney: number;
  /** Future picks this team owns from other teams, e.g. "2027 R1 (from PHX)". */
  picksIn: string[];
  /** Own future picks currently owned by another team. */
  picksOut: string[];
}

export interface LeagueSummary {
  teams: RosterTeam[];
  playerCount: number;
  starCount: number; // 85+ OVR
  freeAgentCount: number;
  cap: number;
  taxLine: number;
  firstApron: number;
  secondApron: number;
}

const seasonLabel = (s: number) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`;

function heightStr(inches: number): string {
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
}

function capTierFor(payroll: number, s: ReturnType<typeof basketballTeamCapStatus>): CapTier {
  if (payroll > s.secondApron) return 'second-apron';
  if (payroll > s.firstApron) return 'first-apron';
  if (payroll > s.taxThreshold) return 'taxpayer';
  if (payroll > s.cap) return 'over-cap';
  return 'under-cap';
}

export const CAP_TIER_LABEL: Record<CapTier, string> = {
  'under-cap': 'Under the cap',
  'over-cap': 'Over the cap',
  taxpayer: 'Taxpayer',
  'first-apron': 'Above 1st apron',
  'second-apron': 'Above 2nd apron',
};

interface RawPlayer {
  college?: string;
  draft?: { year?: number; round?: number; pick?: number };
}

let cached: LeagueSummary | null = null;

export function getLeague2026(): LeagueSummary {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), 'public', 'rosters', ROSTER_FILE);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as BbgmLeagueFile & {
    teams: { tid: number; abbrev?: string; disabled?: boolean; seasons?: { season?: number; won?: number; lost?: number }[] }[];
  };
  const league = convertBbgmLeague(raw);
  const season = league.season;

  // Last completed season's record per abbreviation, straight from the file.
  const recordByAbbrev = new Map<string, { won: number; lost: number }>();
  for (const t of raw.teams) {
    if (t.disabled || !t.abbrev) continue;
    const played = (t.seasons ?? []).filter(s => (s.won ?? 0) + (s.lost ?? 0) > 0);
    const last = played[played.length - 1];
    if (last) recordByAbbrev.set(t.abbrev, { won: last.won ?? 0, lost: last.lost ?? 0 });
  }

  const abbrevById = new Map(league.teams.map(t => [t.id, t.abbreviation] as const));
  const picksIn = new Map<string, string[]>();
  const picksOut = new Map<string, string[]>();
  for (const p of league.draftPickOwnership) {
    if (p.season <= season) continue; // current draft already happened
    const owner = abbrevById.get(p.ownerTeamId) ?? '?';
    const orig = abbrevById.get(p.originalTeamId) ?? '?';
    const label = `${p.season} R${p.round}`;
    picksIn.set(owner, [...(picksIn.get(owner) ?? []), `${label} (from ${orig})`]);
    picksOut.set(orig, [...(picksOut.get(orig) ?? []), `${label} (to ${owner})`]);
  }
  const pickSort = (a: string, b: string) => a.localeCompare(b);

  const toRow = (p: BasketballPlayer): RosterPlayer => {
    const idx = Number(String(p.id).replace('player-', ''));
    const rp = (raw.players[idx] ?? {}) as RawPlayer;
    const years = p.contract?.years ?? [];
    const cur = years.find(y => y.season === season);
    const last = years.length ? Math.max(...years.map(y => y.season)) : null;
    const r = p.ratings;
    const d = rp.draft;
    return {
      id: String(p.id),
      name: `${p.firstName} ${p.lastName}`.trim(),
      pos: p.sportData.position,
      secondaryPos: p.sportData.secondaryPosition ?? null,
      age: p.age,
      height: heightStr(r.height),
      ovr: r.overall,
      pot: p.development.potential,
      threePoint: r.threePoint,
      finishing: r.finishing,
      passing: r.passing,
      defense: Math.round((r.perimeterDefense + r.interiorDefense) / 2),
      rebounding: r.rebounding,
      salary: cur ? cur.baseSalary + cur.proratedBonus : 0,
      market: basketballMarketSalary(p, { season }),
      through: last != null ? seasonLabel(last) : null,
      yearsLeft: years.filter(y => y.season >= season).length,
      college: rp.college && rp.college.trim() ? rp.college.trim() : null,
      draft: d && (d.round ?? 0) > 0 && d.year ? `${d.year} R${d.round} #${d.pick}` : null,
      isRookie: d?.year === season,
      injury: p.injury ? p.injury.type : null,
    };
  };

  const teams: RosterTeam[] = league.teams.map((t: BasketballTeam) => {
    const roster = t.playerIds.map(id => league.players[id]).filter(Boolean);
    const status = basketballTeamCapStatus(roster, season);
    const rows = roster.map(toRow).sort((a, b) => b.ovr - a.ovr || b.pot - a.pot);
    const top = rows.slice(0, 8);
    return {
      slug: t.abbreviation.toLowerCase(),
      abbrev: t.abbreviation,
      city: t.city,
      name: t.name,
      fullName: `${t.city} ${t.name}`,
      conference: t.sportData.conference,
      division: t.sportData.division,
      color: t.primaryColor,
      lastRecord: recordByAbbrev.get(t.abbreviation) ?? null,
      players: rows,
      payroll: status.payroll,
      cap: status.cap,
      taxLine: status.taxThreshold,
      firstApron: status.firstApron,
      secondApron: status.secondApron,
      capTier: capTierFor(status.payroll, status),
      avgAge: rows.length ? rows.reduce((s, p) => s + p.age, 0) / rows.length : 0,
      top8: top.length ? top.reduce((s, p) => s + p.ovr, 0) / top.length : 0,
      strengthRank: 0,
      expiringMoney: rows.filter(p => p.yearsLeft === 1).reduce((s, p) => s + p.salary, 0),
      picksIn: (picksIn.get(t.abbreviation) ?? []).sort(pickSort),
      picksOut: (picksOut.get(t.abbreviation) ?? []).sort(pickSort),
    };
  });

  [...teams].sort((a, b) => b.top8 - a.top8).forEach((t, i) => { t.strengthRank = i + 1; });
  teams.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const any = teams[0];
  cached = {
    teams,
    playerCount: teams.reduce((s, t) => s + t.players.length, 0),
    starCount: teams.reduce((s, t) => s + t.players.filter(p => p.ovr >= 85).length, 0),
    freeAgentCount: league.freeAgentIds.length,
    cap: any.cap,
    taxLine: any.taxLine,
    firstApron: any.firstApron,
    secondApron: any.secondApron,
  };
  return cached;
}

export function getTeam2026(slug: string): RosterTeam | undefined {
  return getLeague2026().teams.find(t => t.slug === slug.toLowerCase());
}

export function money(n: number): string {
  if (!n) return '—';
  return `$${(n / 1e6).toFixed(1)}M`;
}

/**
 * A short, data-driven front-office read for a team — cap position and what it
 * unlocks, age profile, the best young asset, the riskiest contract, and
 * expiring money. Every sentence is computed from the roster, so each team page
 * says something specific rather than boilerplate.
 */
export function teamOutlook(t: RosterTeam): string[] {
  const out: string[] = [];
  const gap = (n: number) => `$${(Math.abs(n) / 1e6).toFixed(1)}M`;
  switch (t.capTier) {
    case 'under-cap':
      out.push(`At ${money(t.payroll)} the ${t.name} sit ${gap(t.cap - t.payroll)} under the ${money(t.cap)} cap — one of the few teams that can sign a free agent outright with room, then still use the Room Exception (about $8.8M) afterward.`);
      break;
    case 'over-cap':
      out.push(`Payroll of ${money(t.payroll)} is over the cap but ${gap(t.taxLine - t.payroll)} below the tax line, so the full Non-Tax Mid-Level (about $15.5M) and the Bi-Annual are both available — just remember either one hard-caps the team at the first apron (${money(t.firstApron)}) for the season.`);
      break;
    case 'taxpayer':
      out.push(`At ${money(t.payroll)} the ${t.name} are ${gap(t.payroll - t.taxLine)} into the luxury tax. Only the smaller Tax MLE (about $6.1M) is on the table, and every extra dollar is taxed at $1.50 or more.`);
      break;
    case 'first-apron':
      out.push(`Payroll of ${money(t.payroll)} is above the first apron (${money(t.firstApron)}): no Bi-Annual, only the ~$6.1M Taxpayer MLE, and incoming trade salary is limited to 110% of outgoing plus $250K.`);
      break;
    case 'second-apron':
      out.push(`At ${money(t.payroll)} the ${t.name} are ${gap(t.payroll - t.secondApron)} over the second apron (${money(t.secondApron)}). That means no Mid-Level at all and strict 1-for-1 salary matching in trades — improving this roster runs through Bird rights, minimums, and the draft.`);
      break;
  }

  const ageWord = t.avgAge < 24.8 ? 'one of the younger rosters' : t.avgAge > 26.8 ? 'a veteran-heavy roster' : 'a roster in the middle of the age range';
  out.push(`The top-8 averages ${t.top8.toFixed(1)} OVR (#${t.strengthRank} of 30) with an average age of ${t.avgAge.toFixed(1)} — ${ageWord}.`);

  const young = t.players.filter(p => p.age <= 23).sort((a, b) => b.pot - a.pot)[0];
  if (young && young.pot >= 80) {
    out.push(`Best long-term asset: ${young.name} (${young.pos}, age ${young.age}), ${young.ovr} OVR now with ${young.pot} potential. Players 23 and under still carry positive expected growth every offseason in BS Hoops.`);
  }

  const risky = t.players
    .filter(p => p.salary > 0 && p.age >= 31 && p.salary - p.market > 5_000_000)
    .sort((a, b) => (b.salary - b.market) * b.yearsLeft - (a.salary - a.market) * a.yearsLeft)[0];
  if (risky) {
    out.push(`Contract to watch: ${risky.name} (age ${risky.age}) earns ${money(risky.salary)} against a market value near ${money(risky.market)}${risky.yearsLeft > 1 ? `, with ${risky.yearsLeft} seasons left` : ' on an expiring deal'}. Aging curves turn negative after 28, so his trade value is unlikely to be higher than it is today.`);
  }

  if (t.expiringMoney > 0) {
    out.push(`${money(t.expiringMoney)} of salary expires after ${seasonLabel(ROSTER_SEASON)} — useful as matching salary at the deadline or as next summer's flexibility.`);
  }
  if (t.picksIn.length || t.picksOut.length) {
    const bits = [];
    if (t.picksIn.length) bits.push(`owns ${t.picksIn.length} extra future pick${t.picksIn.length === 1 ? '' : 's'}`);
    if (t.picksOut.length) bits.push(`owes ${t.picksOut.length} of its own`);
    out.push(`On the draft-pick ledger the team ${bits.join(' and ')}.`);
  }
  return out;
}
