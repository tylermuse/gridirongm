/**
 * Trade-rumor mill (P2.1).
 *
 * A persistent rumor feed that lives on `league.sportData.tradeRumors` and
 * evolves as the season sims: it generates new rumors on a cadence, heats up
 * toward the deadline, and resolves each rumor as accurate or a false alarm by
 * cross-referencing the transaction log (did the named player actually get
 * traded this season?). That self-grading drives the "Season Accuracy: X/Y"
 * tracker.
 *
 * Generation is deterministic (hashed off season + day + slot), so a given save
 * always produces the same mill — no RNG, stable across reloads. Refresh is
 * called once per simmed day from runSimDay, so it persists with the normal
 * save cadence and never touches state on render.
 */

import {
  basketballMarketSalary,
  type BasketballPlayer,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getTransactions } from '../transactions';
import { TRADE_DEADLINE_DAY } from '../sim/simRange';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type RumorType =
  | 'deadline_buzz'
  | 'star_available'
  | 'shopping_pick'
  | 'position_need'
  | 'blockbuster';

export interface TradeRumor {
  id: string;
  season: number;
  /** Day-of-season the rumor surfaced. */
  day: number;
  type: RumorType;
  teamId: TeamId;
  targetTeamId?: TeamId;
  playerId?: string;
  /** Stored for resolution + meta line (rosters change as trades happen). */
  playerName?: string;
  headline: string;
  detail: string;
  /** HOT (heating up) vs COLD (simmering). */
  hot: boolean;
  /** Day the rumor goes stale if nothing happens. */
  resolveDay: number;
  resolved: boolean;
  outcome?: 'accurate' | 'false_alarm';
}

interface RumorData {
  tradeRumors?: TradeRumor[];
  [key: string]: unknown;
}

const GEN_CADENCE = 6; // generate at most every N days
const RUMOR_TTL = 24; // a rumor stays active ~24 days unless resolved sooner

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function rosterOf(league: LeagueState, teamId: TeamId): BasketballPlayer[] {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return [];
  return team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
}

function winPct(team: { record: { wins: number; losses: number } }): number {
  const g = team.record.wins + team.record.losses;
  return g > 0 ? team.record.wins / g : 0.5;
}

/** Target number of active rumors for a given day — ramps toward the deadline. */
function targetCount(day: number): number {
  if (day > TRADE_DEADLINE_DAY) return 0;
  const toDeadline = TRADE_DEADLINE_DAY - day;
  if (toDeadline <= 15) return 8;
  if (toDeadline <= 35) return 6;
  if (toDeadline <= 70) return 4;
  return 3;
}

/** Was the rumor's named player traded this season? (transaction cross-ref) */
function cameTrue(league: LeagueState, rumor: TradeRumor): boolean {
  if (!rumor.playerName) {
    // Pick/posture rumors: accurate if the team made any trade this season.
    return getTransactions(league).some(
      t => t.kind === 'trade' && t.season === rumor.season && t.teamIds.includes(rumor.teamId),
    );
  }
  return getTransactions(league).some(
    t => t.kind === 'trade' && t.season === rumor.season && t.detail.includes(rumor.playerName!),
  );
}

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** Weakest position on a roster (lowest best-player OVR at that slot). */
function weakestPosition(roster: BasketballPlayer[]): BasketballPosition | null {
  let worst: { pos: BasketballPosition; ovr: number } | null = null;
  for (const pos of POSITIONS) {
    const best = roster.filter(p => p.sportData.position === pos).reduce((m, p) => Math.max(m, p.ratings.overall), 0);
    if (!worst || best < worst.ovr) worst = { pos, ovr: best };
  }
  return worst && worst.ovr < 74 ? worst.pos : null;
}

function bestPlayer(roster: BasketballPlayer[]): BasketballPlayer | null {
  return roster.reduce<BasketballPlayer | null>((m, p) => (!m || p.ratings.overall > m.ratings.overall ? p : m), null);
}

function teamLabel(league: LeagueState, teamId: TeamId): string {
  const t = league.teams.find(x => x.id === teamId);
  return t ? `${t.city}` : teamId;
}

/** Generate one rumor for a given slot seed, avoiding already-used subjects. */
function generateRumor(
  league: LeagueState,
  day: number,
  seed: number,
  usedTeams: Set<TeamId>,
  usedPlayers: Set<string>,
): TradeRumor | null {
  const toDeadline = TRADE_DEADLINE_DAY - day;
  const hotBias = toDeadline <= 30;

  // Candidate archetype order varies by seed so the mill feels varied.
  const order: RumorType[] = [
    pick(['deadline_buzz', 'star_available', 'shopping_pick', 'position_need'] as RumorType[], seed),
    'star_available',
    'shopping_pick',
    'position_need',
    'deadline_buzz',
  ];

  for (const type of order) {
    const r = buildOfType(league, type, day, seed, usedTeams, usedPlayers, hotBias);
    if (r) return r;
  }
  return null;
}

function buildOfType(
  league: LeagueState,
  type: RumorType,
  day: number,
  seed: number,
  usedTeams: Set<TeamId>,
  usedPlayers: Set<string>,
  hotBias: boolean,
): TradeRumor | null {
  const teams = league.teams.filter(t => !usedTeams.has(t.id));
  if (teams.length === 0) return null;

  const make = (
    team: { id: TeamId },
    partial: Omit<TradeRumor, 'id' | 'season' | 'day' | 'teamId' | 'resolveDay' | 'resolved'>,
  ): TradeRumor => ({
    id: `rumor-${league.currentSeason}-${day}-${seed}`,
    season: league.currentSeason,
    day,
    teamId: team.id,
    resolveDay: Math.min(TRADE_DEADLINE_DAY + 1, day + RUMOR_TTL),
    resolved: false,
    ...partial,
  });

  if (type === 'star_available' || type === 'deadline_buzz') {
    // A team's best player is in the rumor mill. star_available leans to
    // strugglers; deadline_buzz applies to anyone as the deadline nears.
    const pool = teams
      .map(t => ({ t, wp: winPct(t) }))
      .filter(x => (type === 'star_available' ? x.wp < 0.46 : true))
      .sort((a, b) => a.wp - b.wp);
    for (const { t } of pool) {
      const star = bestPlayer(rosterOf(league, t.id));
      if (!star || usedPlayers.has(star.id) || star.ratings.overall < 74) continue;
      usedTeams.add(t.id); usedPlayers.add(star.id);
      const name = `${star.firstName} ${star.lastName}`;
      if (type === 'deadline_buzz') {
        return make(t, {
          type, playerId: star.id, playerName: name, hot: true,
          headline: `Trade talks heating up around ${name}`,
          detail: `${teamLabel(league, t.id)} fielding calls on the ${star.sportData.position} as the deadline nears.`,
        });
      }
      return make(t, {
        type, playerId: star.id, playerName: name, hot: hotBias,
        headline: `Sources: ${teamLabel(league, t.id)} listening to offers for ${name}`,
        detail: `With the season slipping, ${teamLabel(league, t.id)} is gauging the market for its veteran ${star.sportData.position}.`,
      });
    }
    return null;
  }

  if (type === 'shopping_pick') {
    const contender = teams.map(t => ({ t, wp: winPct(t) })).filter(x => x.wp >= 0.55).sort((a, b) => b.wp - a.wp)[0];
    if (!contender) return null;
    usedTeams.add(contender.t.id);
    return make(contender.t, {
      type, hot: hotBias,
      headline: `${teamLabel(league, contender.t.id)} may move future draft capital`,
      detail: `A win-now ${teamLabel(league, contender.t.id)} is dangling picks for an impact rotation piece.`,
    });
  }

  if (type === 'position_need') {
    for (const t of teams) {
      const need = weakestPosition(rosterOf(league, t.id));
      if (!need) continue;
      usedTeams.add(t.id);
      return make(t, {
        type, hot: false,
        headline: `${teamLabel(league, t.id)} actively seeking ${need} help`,
        detail: `${teamLabel(league, t.id)} has scouted the market for an upgrade at ${need}.`,
      });
    }
    return null;
  }

  return null;
}

/**
 * Advance the rumor mill one tick: resolve stale/realized rumors, then top up to
 * the day's target. Pure — returns a new league.
 */
export function refreshTradeRumors(league: LeagueState): LeagueState {
  const sport = (league.sportData as RumorData | undefined) ?? {};
  const day = league.currentTick;
  const existing = (sport.tradeRumors ?? []).filter(r => r.season === league.currentSeason);

  // 1) Resolve: a rumor that came true → accurate; one past its window → false.
  const deadlinePassed = day > TRADE_DEADLINE_DAY;
  const resolved: TradeRumor[] = existing.map(r => {
    if (r.resolved) return r;
    if (cameTrue(league, r)) return { ...r, resolved: true, outcome: 'accurate' };
    if (day >= r.resolveDay || deadlinePassed) return { ...r, resolved: true, outcome: 'false_alarm' };
    return r;
  });

  // 2) Generate: top up active rumors to the day's target on a cadence.
  const active = resolved.filter(r => !r.resolved);
  const target = targetCount(day);
  const lastGen = resolved.reduce((m, r) => Math.max(m, r.day), -GEN_CADENCE);
  let next = resolved;
  if (active.length < target && day - lastGen >= GEN_CADENCE && !deadlinePassed) {
    const usedTeams = new Set<TeamId>(active.map(r => r.teamId));
    const usedPlayers = new Set<string>(active.map(r => r.playerId).filter((x): x is string => !!x));
    const additions: TradeRumor[] = [];
    const toAdd = Math.min(2, target - active.length); // stagger: a couple per cadence
    for (let i = 0; i < toAdd; i++) {
      const seed = hash(`${league.currentSeason}-${day}-${i}`);
      const r = generateRumor(league, day, seed, usedTeams, usedPlayers);
      if (r) additions.push(r);
    }
    next = [...resolved, ...additions];
  }

  return { ...league, sportData: { ...sport, tradeRumors: next } };
}

// ===========================================================================
// Read helpers (UI)
// ===========================================================================

export function getActiveRumors(league: LeagueState): TradeRumor[] {
  const sport = (league.sportData as RumorData | undefined) ?? {};
  return (sport.tradeRumors ?? [])
    .filter(r => r.season === league.currentSeason && !r.resolved)
    .sort((a, b) => Number(b.hot) - Number(a.hot) || b.day - a.day);
}

export interface RumorAccuracy {
  resolved: number;
  accurate: number;
  pct: number;
}

export function rumorAccuracy(league: LeagueState): RumorAccuracy {
  const sport = (league.sportData as RumorData | undefined) ?? {};
  const done = (sport.tradeRumors ?? []).filter(r => r.season === league.currentSeason && r.resolved);
  const accurate = done.filter(r => r.outcome === 'accurate').length;
  return { resolved: done.length, accurate, pct: done.length ? Math.round((accurate / done.length) * 100) : 0 };
}

/** Player meta line for a rumor card, e.g. "M. Diaz (SF, 27yo, 88 OVR, $32.0M/yr)". */
export function rumorPlayerMeta(league: LeagueState, rumor: TradeRumor): string | null {
  if (!rumor.playerId) return null;
  const p = (league.players as Record<string, BasketballPlayer>)[rumor.playerId];
  if (!p) return null;
  const sal = basketballMarketSalary(p, { season: league.currentSeason });
  const salStr = sal >= 1_000_000 ? `$${(sal / 1_000_000).toFixed(1)}M/yr` : `$${Math.round(sal / 1000)}K/yr`;
  return `${p.firstName[0]}. ${p.lastName} (${p.sportData.position}, ${p.age}yo, ${p.ratings.overall} OVR, ${salStr})`;
}
