/**
 * Import a BBGM/ZenGM-format basketball league JSON and convert it into BS
 * Hoops domain objects, mirroring the football app's `convertFbgmLeague`
 * (src/lib/data/leagueImport.ts).
 *
 * The source file is BBGM-native: combo positions (G/GF/F/FC), 15 BBGM rating
 * keys (no stored overall — BBGM computes it), `contract.amount` in thousands
 * of dollars, `ratings` as a season-history array. All of that is normalized
 * here. `convertBbgmLeague` is pure (no I/O) so it's unit-testable; the URL
 * loader is a thin fetch wrapper around it.
 *
 * v1 scope: skip `disabled` teams (tid ≥ 30) and the retired (-3) / draft-pool
 * (-2) player buckets. tid 0–29 → on a team; tid -1 → free agent pool.
 */

import {
  computeOverall,
  emptyBasketballStats,
  type BasketballPlayer,
  type BasketballTeam,
  type BasketballRatings,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { PlayerId, TeamId } from '@bs/core/adapter';
import { HOOPS_LEAGUE_TEAMS, type BasketballTeamTemplate } from './teams';
import { makeBasketballTeam } from '../league/createLeague';

// ===========================================================================
// Source schema (loose — input is untrusted JSON)
// ===========================================================================

interface BbgmRatingSeason {
  season?: number;
  hgt: number; stre: number; spd: number; jmp: number; endu: number;
  ins: number; dnk: number; ft: number; fg: number; tp: number;
  diq: number; oiq: number; drb: number; pss: number; reb: number;
}

interface BbgmPlayer {
  tid: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  pos?: string;
  hgt?: number; // inches
  weight?: number;
  born?: { year?: number; loc?: string };
  contract?: { amount?: number; exp?: number };
  draft?: { year?: number; round?: number; pick?: number; tid?: number };
  injury?: { type?: string; gamesRemaining?: number };
  college?: string;
  imgURL?: string;
  ratings?: BbgmRatingSeason[] | BbgmRatingSeason;
}

interface BbgmTeam {
  tid: number;
  abbrev?: string;
  region?: string;
  name?: string;
  colors?: string[];
  imgURL?: string;
  disabled?: boolean;
}

export interface BbgmLeagueFile {
  startingSeason?: number;
  version?: number;
  players: BbgmPlayer[];
  teams: BbgmTeam[];
  gameAttributes?: Array<{ key: string; value: unknown }> | Record<string, unknown>;
}

export interface ImportedHoopsLeague {
  season: number;
  teams: BasketballTeam[];
  players: Record<PlayerId, BasketballPlayer>;
  /** Players with tid -1 — real veterans who populate the FA pool. */
  freeAgentIds: PlayerId[];
}

// ===========================================================================
// Constants
// ===========================================================================

/** BS Hoops league minimum (matches capRules.LEAGUE_MINIMUM_SALARY, in $). */
const LEAGUE_MINIMUM_SALARY = 1_200_000;

const STARTER_POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_INDEX: Record<BasketballPosition, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

/**
 * BBGM team abbreviation → BS Hoops template abbreviation. BBGM uses standard
 * NBA abbrevs (with a couple of historical variants like BRK/CHO/PHO); the BS
 * Hoops parody set uses its own (CHW/CLR/NYE/…). Mapping is by real-NBA
 * identity, which lets us inherit the correct conference/division slot from the
 * template while carrying BBGM's real region/name/colors for display.
 */
const BBGM_TO_HOOPS_ABBREV: Record<string, string> = {
  ATL: 'ATL', BOS: 'BOS', BKN: 'BKN', BRK: 'BKN', CHA: 'CHA', CHO: 'CHA',
  CHI: 'CHW', CLE: 'CLR', DAL: 'DAL', DEN: 'DEN', DET: 'DET', GSW: 'GSW',
  HOU: 'HOO', IND: 'IND', LAC: 'LAS', LAL: 'LSH', MEM: 'MEM', MIA: 'MIH',
  MIL: 'MIL', MIN: 'MIN', NOP: 'NOB', NYK: 'NYE', OKC: 'OKC', ORL: 'ORS',
  PHI: 'PHL', PHX: 'PHX', PHO: 'PHX', POR: 'POR', SAC: 'SAC', SAS: 'SA',
  TOR: 'TOR', UTA: 'UTA', WAS: 'WAS',
};

const TEMPLATE_BY_ABBREV: Record<string, BasketballTeamTemplate> =
  Object.fromEntries(HOOPS_LEAGUE_TEAMS.map(t => [t.abbreviation, t]));

// ===========================================================================
// Small helpers
// ===========================================================================

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** WCAG-ish relative luminance for a #rrggbb hex (0 dark – 1 light). */
function colorLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0.5;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick visible primary/secondary colors, mirroring football's guard: if the
 *  primary is near-white and the secondary isn't, swap them; if both are
 *  near-white, fall back to the parody template's palette. */
function guardColors(
  colors: string[] | undefined,
  template: BasketballTeamTemplate,
): { primary: string; secondary: string } {
  const primary = colors?.[0] ?? template.primaryColor;
  const secondary = colors?.[1] ?? template.secondaryColor;
  const pLight = colorLuminance(primary) > 0.85;
  const sLight = colorLuminance(secondary) > 0.85;
  if (pLight && sLight) return { primary: template.primaryColor, secondary: template.secondaryColor };
  if (pLight && !sLight) return { primary: secondary, secondary: primary };
  return { primary, secondary };
}

function latestRatings(p: BbgmPlayer): BbgmRatingSeason | null {
  const r = p.ratings;
  if (!r) return null;
  if (Array.isArray(r)) return r.length ? r[r.length - 1] : null;
  return r;
}

function normalizeGameAttributes(
  ga: BbgmLeagueFile['gameAttributes'],
): Record<string, unknown> {
  if (Array.isArray(ga)) return Object.fromEntries(ga.map(x => [x.key, x.value]));
  return ga ?? {};
}

function splitName(p: BbgmPlayer): { firstName: string; lastName: string } {
  if (p.firstName || p.lastName) {
    return { firstName: p.firstName ?? '', lastName: p.lastName ?? '' };
  }
  const parts = (p.name ?? 'Unknown Player').trim().split(/\s+/);
  return { firstName: parts[0] ?? 'Unknown', lastName: parts.slice(1).join(' ') || (parts[0] ?? 'Player') };
}

// ===========================================================================
// Position mapping (BBGM combo → BS Hoops PG/SG/SF/PF/C)
// ===========================================================================

/** Deterministic combo → position with a ratings tiebreak, plus the runner-up
 *  as a secondary position when the combo implies two. */
function mapPosition(
  pos: string | undefined,
  r: BbgmRatingSeason,
): { primary: BasketballPosition; secondary?: BasketballPosition } {
  const p = (pos ?? '').toUpperCase();
  switch (p) {
    case 'PG': return { primary: 'PG' };
    case 'SG': return { primary: 'SG' };
    case 'SF': return { primary: 'SF' };
    case 'PF': return { primary: 'PF' };
    case 'C': return { primary: 'C' };
    case 'G':
      // Playmaking lean → PG, scoring lean → SG.
      return r.pss >= r.drb && r.pss >= r.tp
        ? { primary: 'PG', secondary: 'SG' }
        : { primary: 'SG', secondary: 'PG' };
    case 'GF':
      return { primary: 'SF', secondary: 'SG' };
    case 'F':
      // Interior/rebounding lean → PF, else wing SF.
      return r.ins + r.reb >= r.tp + r.drb
        ? { primary: 'PF', secondary: 'SF' }
        : { primary: 'SF', secondary: 'PF' };
    case 'FC':
      return r.ins >= r.tp ? { primary: 'C', secondary: 'PF' } : { primary: 'PF', secondary: 'C' };
    default:
      return { primary: 'SF' };
  }
}

/** Guarantee each team carries ≥1 of every position — the sim crashes on a
 *  position with no eligible player. Reassigns the closest combo-position
 *  player (preferring a secondary match, then an adjacent surplus position). */
function ensurePositionCoverage(teamPlayers: BasketballPlayer[]): void {
  const counts = (): Record<BasketballPosition, number> => {
    const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const p of teamPlayers) c[p.sportData.position]++;
    return c;
  };

  for (const pos of STARTER_POSITIONS) {
    let c = counts();
    if (c[pos] >= 1) continue;

    // 1. A player whose secondary already is this position (and whose primary
    //    has cover to spare).
    let cand = teamPlayers.find(p => p.sportData.secondaryPosition === pos && c[p.sportData.position] >= 2);
    // 2. Otherwise pull from the nearest position that has a surplus, lowest OVR first.
    if (!cand) {
      const surplus = teamPlayers
        .filter(p => c[p.sportData.position] >= 2)
        .sort((a, b) =>
          (Math.abs(POS_INDEX[a.sportData.position] - POS_INDEX[pos]) -
            Math.abs(POS_INDEX[b.sportData.position] - POS_INDEX[pos])) ||
          (a.ratings.overall - b.ratings.overall));
      cand = surplus[0];
    }
    // 3. Last resort: the lowest-OVR player on the roster.
    if (!cand) cand = [...teamPlayers].sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
    if (cand) {
      cand.sportData = { ...cand.sportData, secondaryPosition: cand.sportData.position, position: pos };
      // Overall is position-weighted — recompute for the new slot so it stays
      // consistent with the attributes (the aging pass recomputes it too).
      cand.ratings = { ...cand.ratings, overall: computeOverall(cand.ratings, pos) };
      c = counts();
    }
  }
}

// ===========================================================================
// Ratings mapping (BBGM 15 → BasketballRatings 20)
// ===========================================================================

function mapRatings(
  r: BbgmRatingSeason,
  heightInches: number,
  primary: BasketballPosition,
): BasketballRatings {
  const guard = primary === 'PG' || primary === 'SG';
  const big = primary === 'C' || primary === 'PF';
  // 0–100 scale of how tall the player is (6'6" → 6'11" maps across the range).
  const heightScaled = clamp(((heightInches - 66) / (91 - 66)) * 100);

  const ratings: BasketballRatings = {
    overall: 0, // computed below
    height: heightInches,
    wingspan: heightInches + (big ? 4 : 2),
    speed: clamp(r.spd),
    strength: clamp(r.stre),
    vertical: clamp(r.jmp),
    threePoint: clamp(r.tp),
    midRange: clamp(r.fg),
    finishing: clamp(0.6 * r.dnk + 0.4 * r.ins),
    freeThrow: clamp(r.ft),
    postScoring: clamp(r.ins),
    handles: clamp(r.drb),
    passing: clamp(r.pss),
    // BBGM folds all defense into diq — split it back out.
    perimeterDefense: clamp(r.diq * (guard ? 1.05 : 0.92)),
    interiorDefense: clamp(0.6 * r.diq + 0.4 * r.ins),
    rebounding: clamp(r.reb),
    steal: clamp(0.7 * r.diq + 0.3 * r.spd),
    block: clamp(0.5 * r.diq + 0.3 * heightScaled + 0.2 * r.jmp),
    basketballIQ: clamp(r.oiq),
    intangibles: clamp(0.5 * r.oiq + 0.5 * r.diq),
  };
  // Recompute overall on the BS Hoops 40–99 scale (BBGM ovr is not carried).
  ratings.overall = computeOverall(ratings, primary);
  return calibrateToNba(ratings, primary);
}

// ---------------------------------------------------------------------------
// NBA-realistic overall calibration
// ---------------------------------------------------------------------------
//
// Mapping BBGM's spread + blended-defense attributes straight through
// computeOverall compresses the top end: even elite real players land ~78,
// while generated fictional stars reach 85. That makes an imported league feel
// star-less. We stretch each player's *skill* attributes (not height/wingspan)
// by a single additive delta, solved so computeOverall lands on an NBA-shaped
// target. Lifting the attributes — rather than just the overall number — means
// the calibration survives the offseason aging pass, which recomputes overall
// from attributes (developmentSystem.approximateOverall, same weighted formula).

/** Skill ratings that feed computeOverall (everything except height/wingspan/overall). */
const OVR_SKILL_KEYS: (keyof BasketballRatings)[] = [
  'speed', 'strength', 'vertical',
  'threePoint', 'midRange', 'finishing', 'freeThrow', 'postScoring',
  'handles', 'passing',
  'perimeterDefense', 'interiorDefense', 'rebounding', 'steal', 'block',
  'basketballIQ', 'intangibles',
];

/** Raw computeOverall → NBA-shaped target. Tuned so the source distribution
 *  (~40 floor, ~52 median, ~78 ceiling) lands at role players in the low-70s,
 *  starters low-80s, and stars high-80s/90s. Monotonic, so order is preserved. */
function nbaTargetOverall(raw: number): number {
  return clamp(Math.round(0.92 * raw + 25), 40, 99);
}

function calibrateToNba(base: BasketballRatings, position: BasketballPosition): BasketballRatings {
  const target = nbaTargetOverall(base.overall);

  // computeOverall is a monotonic weighted mean of the skill keys, so the
  // overall after a uniform +d shift is monotonic in d — bisect for the d that
  // hits the target (clamping keeps maxed attributes from overshooting).
  const overallAtDelta = (d: number): number => {
    const probe = { ...base };
    for (const k of OVR_SKILL_KEYS) probe[k] = clamp(base[k] + d);
    return computeOverall(probe, position);
  };

  let lo = 0, hi = 60;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (overallAtDelta(mid) < target) lo = mid; else hi = mid;
  }
  const delta = (lo + hi) / 2;

  const out = { ...base };
  for (const k of OVR_SKILL_KEYS) out[k] = clamp(base[k] + delta);
  out.overall = computeOverall(out, position);
  return out;
}

// ===========================================================================
// Player conversion
// ===========================================================================

function starTierFor(overall: number): BasketballPlayer['sportData']['starTier'] {
  if (overall >= 85) return 'superstar';
  if (overall >= 78) return 'star';
  if (overall >= 70) return 'starter';
  if (overall >= 62) return 'role';
  return 'bench';
}

function buildContract(
  bbgm: BbgmPlayer['contract'],
  season: number,
): BasketballPlayer['contract'] {
  const amountK = bbgm?.amount ?? 0;
  const baseSalary = Math.max(LEAGUE_MINIMUM_SALARY, Math.round((amountK * 1000) / 100_000) * 100_000);
  const yearsLeft = Math.max(1, (bbgm?.exp ?? season + 1) - season);
  return {
    years: Array.from({ length: yearsLeft }, (_, i) => ({
      season: season + i,
      baseSalary,
      proratedBonus: 0,
      guaranteed: true,
    })),
    signedSeason: season,
    guaranteedAtSigning: baseSalary * yearsLeft,
    modifications: [],
    sportData: {},
  };
}

function convertPlayer(
  bbgm: BbgmPlayer,
  index: number,
  season: number,
  teamId: TeamId | null,
  rosterIndex: number,
): BasketballPlayer | null {
  const r = latestRatings(bbgm);
  if (!r) return null;

  const heightInches = bbgm.hgt && bbgm.hgt > 30 ? bbgm.hgt : 78; // sane default 6'6"
  const { primary, secondary } = mapPosition(bbgm.pos, r);
  const ratings = mapRatings(r, heightInches, primary);
  const overall = ratings.overall;

  const { firstName, lastName } = splitName(bbgm);
  const bornYear = bbgm.born?.year ?? season - 25;
  const age = Math.max(18, season - bornYear);
  const draftYear = bbgm.draft?.year ?? season;
  const yearsInLeague = Math.max(0, season - draftYear);

  const isFreeAgent = teamId === null;
  const contract = isFreeAgent ? null : buildContract(bbgm.contract, season);
  const yearsLeft = contract ? contract.years.length : 0;

  const injury = (() => {
    const t = bbgm.injury?.type;
    const games = bbgm.injury?.gamesRemaining ?? 0;
    if (!t || t === 'Healthy' || games <= 0) return null;
    return {
      type: t,
      weeksOut: Math.max(1, Math.round(games / 3)),
      severity: 'minor' as const,
      occurredDate: `${season}-10-01`,
      playingThrough: false,
    };
  })();

  // Younger players get headroom; veterans cap near their current overall.
  const youthBump = age <= 21 ? 8 : age <= 23 ? 5 : age <= 25 ? 2 : 0;
  const potential = clamp(overall + youthBump, overall, 99);
  const trajectory: BasketballPlayer['development']['currentTrajectory'] =
    age <= 24 ? 'rising' : age <= 29 ? 'plateau' : 'declining';

  return {
    id: `player-${index}` as PlayerId,
    firstName,
    lastName,
    birthDate: `${bornYear}-06-01`,
    age,
    nationality: 'USA',
    kind: 'standard',
    ratings,
    seasonStats: emptyBasketballStats(),
    careerStats: emptyBasketballStats(),
    contract,
    rosterSlot: teamId ? { teamId, bucket: 'active', index: rosterIndex } : null,
    injury,
    development: {
      potential,
      currentTrajectory: trajectory,
      seasonsAtCurrentTrajectory: 1,
    },
    sportData: {
      position: primary,
      ...(secondary ? { secondaryPosition: secondary } : {}),
      starTier: starTierFor(overall),
      yearsInLeague,
      birdRights: yearsLeft >= 2 ? 'full' : 'none',
      isTwoWay: false,
      shootingHand: 'right',
    },
  };
}

// ===========================================================================
// Main conversion (pure)
// ===========================================================================

export function convertBbgmLeague(file: BbgmLeagueFile): ImportedHoopsLeague {
  if (!file || !Array.isArray(file.teams) || !Array.isArray(file.players)) {
    throw new Error('Not a BBGM league file — missing teams/players arrays.');
  }
  const ga = normalizeGameAttributes(file.gameAttributes);
  const season =
    (typeof ga.season === 'number' ? ga.season : undefined) ??
    file.startingSeason ??
    2026;

  // --- Map BBGM teams (tid 0–29, non-disabled) onto BS Hoops template slots ---
  const teamMeta = new Map<number, { team: BasketballTeam; players: BasketballPlayer[] }>();
  for (const t of file.teams) {
    if (t.disabled) continue;
    if (typeof t.tid !== 'number' || t.tid < 0) continue;
    const hoopsAbbrev = t.abbrev ? BBGM_TO_HOOPS_ABBREV[t.abbrev.toUpperCase()] : undefined;
    const template = hoopsAbbrev ? TEMPLATE_BY_ABBREV[hoopsAbbrev] : undefined;
    if (!template) {
      throw new Error(`Could not map BBGM team "${t.abbrev ?? t.tid}" to a BS Hoops team.`);
    }
    const colors = guardColors(t.colors, template);
    const slugAbbrev = t.abbrev ?? hoopsAbbrev ?? `t${t.tid}`;
    const teamId = `team-${slugAbbrev.toLowerCase()}` as TeamId;
    const team = makeBasketballTeam({
      id: teamId,
      template: {
        city: t.region ?? template.city,
        name: t.name ?? template.name,
        abbreviation: t.abbrev ?? template.abbreviation,
        primaryColor: colors.primary,
        secondaryColor: colors.secondary,
        conference: template.conference,
        division: template.division,
      },
      playerIds: [],
      logoUrl: t.imgURL,
    });
    teamMeta.set(t.tid, { team, players: [] });
  }

  if (teamMeta.size !== 30) {
    throw new Error(`Expected 30 active teams in the BBGM file; mapped ${teamMeta.size}.`);
  }

  // --- Convert players, routing by tid ---
  const players: Record<PlayerId, BasketballPlayer> = {};
  const freeAgentIds: PlayerId[] = [];

  file.players.forEach((bp, index) => {
    const tid = bp.tid;
    if (typeof tid !== 'number') return;
    if (tid <= -2) return; // -3 retired, -2 draft pool — skipped in v1.

    if (tid === -1) {
      const fa = convertPlayer(bp, index, season, null, 0);
      if (!fa) return;
      players[fa.id] = fa;
      freeAgentIds.push(fa.id);
      return;
    }

    const meta = teamMeta.get(tid);
    if (!meta) return; // player on a disabled/unmapped team — drop.
    const rosterIndex = meta.players.length;
    const p = convertPlayer(bp, index, season, meta.team.id, rosterIndex);
    if (!p) return;
    meta.players.push(p);
    players[p.id] = p;
  });

  // --- Finalize each team: position coverage + playerIds/buckets ---
  const teams: BasketballTeam[] = [];
  for (const { team, players: roster } of teamMeta.values()) {
    ensurePositionCoverage(roster);
    const ids = roster.map(p => p.id);
    teams.push({
      ...team,
      playerIds: ids,
      rosterBuckets: { ...team.rosterBuckets, active: ids },
    });
  }

  return { season, teams, players, freeAgentIds };
}

// ===========================================================================
// URL loader (thin fetch wrapper)
// ===========================================================================

export async function loadHoopsLeagueFromUrl(url: string): Promise<ImportedHoopsLeague> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load roster file: ${res.status}`);
  }
  const raw = (await res.json()) as BbgmLeagueFile;
  return convertBbgmLeague(raw);
}
