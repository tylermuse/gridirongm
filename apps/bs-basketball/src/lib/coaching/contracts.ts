/**
 * Coach contracts: salaries, signing, firing (dead money), and extensions.
 *
 * Coach pay is an owner expense, NOT a player-cap charge — fired coaches'
 * remaining guaranteed money is stored on `team.sportData.coachDeadMoney`
 * (separate from the player `deadCap` list) and shown on Finances.
 *
 * Salary scale (2026-27, $165M cap): head coaches $4M–$12M by overall +
 * reputation; player-development coaches $0.5M–$2M. Both scale with the cap,
 * so League Rules cap changes move coach pay too.
 */

import {
  basketballSalaryCap,
  createRng,
  type BasketballTeam,
  type Rng,
} from '@bs/sport-basketball';
import type { BaseCoach, BaseContract, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { upcomingSeason } from '../draft/draft';
import {
  coachData,
  coachOverall,
  generateCoach,
  getTeamCoach,
  withCoachData,
  type StaffRole,
} from './coaches';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const REFERENCE_CAP = 165_000_000;
const ANNUAL_RAISE = 0.03;

// ===========================================================================
// Salary
// ===========================================================================

/** Reputation 0–1 from the résumé: winning %, playoff runs, titles, COYs. */
export function coachReputation(coach: BaseCoach): number {
  const logs = coachData(coach).seasons ?? [];
  if (logs.length === 0) return 0;
  const w = logs.reduce((s, l) => s + l.wins, 0);
  const l = logs.reduce((s, x) => s + x.losses, 0);
  const pct = w + l > 0 ? w / (w + l) : 0.5;
  const titles = logs.filter(x => x.champion).length;
  const coys = logs.filter(x => x.coy).length;
  const deepRuns = logs.filter(x => x.playoffRound >= 3).length;
  const score = (pct - 0.45) * 2 + titles * 0.25 + coys * 0.15 + deepRuns * 0.06;
  return Math.max(0, Math.min(1, score));
}

/** Market salary for a coach in `season` (dollars/yr). */
export function coachMarketSalary(coach: BaseCoach, season: number): number {
  const capScale = basketballSalaryCap(season) / REFERENCE_CAP;
  if (coach.role === 'PDC') {
    const t = Math.max(0, Math.min(1, (coach.ratings.development - 40) / 50));
    return Math.round((500_000 + t * 1_500_000) * capScale / 50_000) * 50_000;
  }
  const ovrT = Math.max(0, Math.min(1, (coachOverall(coach) - 55) / 37));
  const t = Math.min(1, ovrT * 0.8 + coachReputation(coach) * 0.35);
  return Math.round((4_000_000 + t * 8_000_000) * capScale / 100_000) * 100_000;
}

/** The season coach contracts should be priced / counted from: during the
 *  offseason that's the upcoming season (the one just played is paid out). */
export function coachContractSeason(league: LeagueState): number {
  return upcomingSeason(league);
}

/** Salary for the given season (0 when the deal doesn't cover it). */
export function coachSalaryFor(coach: BaseCoach, season: number): number {
  const yr = coach.contract?.years.find(y => y.season === season);
  return yr ? yr.baseSalary + yr.proratedBonus : 0;
}

/**
 * Salary to DISPLAY: the year for `season` if covered, else the next year on
 * the books, else (candidates / legacy) the market rate.
 */
export function coachSalary(coach: BaseCoach, season?: number): number {
  const years = coach.contract?.years ?? [];
  if (years.length) {
    const yr = season == null
      ? years[0]
      : years.find(y => y.season === season) ?? years.find(y => y.season > season);
    if (yr) return yr.baseSalary + yr.proratedBonus;
  }
  return coachMarketSalary(coach, season ?? 2026);
}

/** Last season on the deal, or null. */
export function contractEnd(coach: BaseCoach): number | null {
  const ys = coach.contract?.years ?? [];
  return ys.length ? Math.max(...ys.map(y => y.season)) : null;
}

/** Contract years still to be paid from `season` on. */
export function yearsRemaining(coach: BaseCoach, season: number): number {
  return (coach.contract?.years ?? []).filter(y => y.season >= season).length;
}

/** True when the deal doesn't cover `season` (expired / expiring at rollover). */
export function isExpired(coach: BaseCoach, season: number): boolean {
  return yearsRemaining(coach, season) === 0;
}

/** Build a contract: `years` seasons from `startSeason`, 3% annual raises. */
export function buildCoachContract(
  salary: number,
  years: number,
  startSeason: number,
  opts: { guaranteed?: boolean } = {},
): BaseContract {
  const n = Math.max(1, Math.round(years));
  const guaranteed = opts.guaranteed ?? true;
  const ys = Array.from({ length: n }, (_, i) => ({
    season: startSeason + i,
    baseSalary: Math.round(salary * Math.pow(1 + ANNUAL_RAISE, i) / 10_000) * 10_000,
    proratedBonus: 0,
    guaranteed,
  }));
  return {
    years: ys,
    signedSeason: startSeason,
    guaranteedAtSigning: guaranteed ? ys.reduce((s, y) => s + y.baseSalary, 0) : 0,
    modifications: [],
    sportData: {},
  };
}

/** Typical contract length: head coaches 3–5 yrs (better → longer), dev coaches 2–3. */
export function standardContractYears(coach: BaseCoach, rng: Rng): number {
  if (coach.role === 'PDC') return 2 + (rng.random() < 0.5 ? 1 : 0);
  const ovr = coachOverall(coach);
  const base = ovr >= 82 ? 4 : ovr >= 70 ? 3 : 3;
  return Math.min(5, base + (rng.random() < 0.45 ? 1 : 0));
}

/** Sign a coach to a standard market deal starting `startSeason`. */
export function signCoach(coach: BaseCoach, startSeason: number, rng: Rng, years?: number): BaseCoach {
  const salary = coachMarketSalary(coach, startSeason);
  const n = years ?? standardContractYears(coach, rng);
  return { ...coach, contract: buildCoachContract(salary, n, startSeason) };
}

// ===========================================================================
// Dead money (owner expense, not cap)
// ===========================================================================

export interface CoachDeadMoneyEntry {
  season: number;
  amount: number;
  coachId: string;
  coachName: string;
  role: StaffRole;
}

export function teamCoachDeadMoneyEntries(team: BasketballTeam): CoachDeadMoneyEntry[] {
  return (team.sportData as { coachDeadMoney?: CoachDeadMoneyEntry[] }).coachDeadMoney ?? [];
}

/** Dead coach money a team pays in `season`. */
export function teamCoachDeadMoney(team: BasketballTeam, season: number): number {
  return teamCoachDeadMoneyEntries(team)
    .filter(e => e.season === season)
    .reduce((s, e) => s + e.amount, 0);
}

export interface FirePreview {
  /** Total guaranteed money still owed (becomes dead money). */
  total: number;
  byYear: { season: number; amount: number }[];
}

/** What firing this coach right now would leave on the books. */
export function firePreview(coach: BaseCoach, fromSeason: number): FirePreview {
  const byYear = (coach.contract?.years ?? [])
    .filter(y => y.season >= fromSeason && y.guaranteed)
    .map(y => ({ season: y.season, amount: y.baseSalary + y.proratedBonus }));
  return { total: byYear.reduce((s, y) => s + y.amount, 0), byYear };
}

// ===========================================================================
// Staff moves (pure league → league)
// ===========================================================================

function coachesOf(league: LeagueState): Record<string, BaseCoach> {
  return { ...((league.coaches ?? {}) as Record<string, BaseCoach>) };
}

/** Close the departing coach's tenure and free him into the market. */
function release(coach: BaseCoach): BaseCoach {
  return withCoachData({ ...coach, teamId: null, contract: null }, { hiredSeason: undefined, interim: undefined });
}

/**
 * Remove the team's coach in `role`. `chargeDeadMoney` books the remaining
 * guaranteed salary as dead money (a firing); false = an expiring deal ending.
 * Does NOT backfill the slot — callers decide (hire / interim).
 */
export function removeCoach(
  league: LeagueState,
  teamId: string,
  role: StaffRole,
  chargeDeadMoney: boolean,
  season: number = coachContractSeason(league),
): { league: LeagueState; removed: BaseCoach | null; deadMoney: number } {
  const coach = getTeamCoach(league, teamId, role);
  if (!coach) return { league, removed: null, deadMoney: 0 };
  const preview = chargeDeadMoney ? firePreview(coach, season) : { total: 0, byYear: [] };
  const coaches = coachesOf(league);
  coaches[coach.id] = release(coach);
  const teams = league.teams.map(t => {
    if (t.id !== teamId) return t;
    const sd = (t as BasketballTeam).sportData;
    const entries: CoachDeadMoneyEntry[] = preview.byYear.map(y => ({
      season: y.season, amount: y.amount, coachId: coach.id,
      coachName: `${coach.firstName} ${coach.lastName}`, role,
    }));
    return {
      ...t,
      coachIds: t.coachIds.filter(id => id !== coach.id),
      sportData: entries.length
        ? { ...sd, coachDeadMoney: [...teamCoachDeadMoneyEntries(t as BasketballTeam), ...entries] }
        : sd,
    } as typeof t;
  });
  return { league: { ...league, coaches, teams }, removed: coach, deadMoney: preview.total };
}

/**
 * Put `coach` in the team's `role` slot. An incumbent in that role is fired
 * (dead money for any guaranteed years). The hire gets a standard market deal
 * unless he already carries a contract that covers the contract season.
 */
export function installCoach(
  league: LeagueState,
  teamId: string,
  coach: BaseCoach,
  rng: Rng,
  opts: { interim?: boolean; years?: number; season?: number } = {},
): LeagueState {
  const role = (coach.role === 'PDC' ? 'PDC' : 'HC') as StaffRole;
  const season = opts.season ?? coachContractSeason(league);
  let next = removeCoach(league, teamId, role, true, season).league;
  let hired: BaseCoach = { ...coach, role, teamId: teamId as TeamId };
  if (opts.interim) {
    // Interim: one cheap, NON-guaranteed year — replacing him costs nothing.
    const salary = Math.round(coachMarketSalary(hired, season) * 0.6 / 100_000) * 100_000;
    hired = { ...hired, contract: buildCoachContract(salary, 1, season, { guaranteed: false }) };
  } else if (!hired.contract || isExpired(hired, season)) {
    hired = signCoach(hired, season, rng, opts.years);
  }
  hired = withCoachData(hired, { hiredSeason: season, interim: opts.interim || undefined, retired: undefined });
  const coaches = coachesOf(next);
  coaches[hired.id] = hired;
  const teams = next.teams.map(t =>
    t.id === teamId ? ({ ...t, coachIds: [...t.coachIds.filter(id => id !== hired.id), hired.id] } as typeof t) : t,
  );
  next = { ...next, coaches, teams };
  return next;
}

/** Fire the team's coach; a fired head coach is replaced by an interim so the
 *  team always has exactly one head coach. */
export function fireCoach(league: LeagueState, teamId: string, role: StaffRole): { league: LeagueState; deadMoney: number; fired: BaseCoach | null } {
  const r = removeCoach(league, teamId, role, true);
  if (!r.removed) return { league, deadMoney: 0, fired: null };
  let next = r.league;
  if (role === 'HC') {
    const rng = createRng(`${league.id}-interim-${teamId}-${league.currentSeason}-${r.removed.id}`);
    const interim = generateCoach('HC', null, rng);
    // Interims are a step down: shave the ratings.
    const shaved = { ...interim, ratings: {
      offense: Math.max(45, interim.ratings.offense - 6), defense: Math.max(45, interim.ratings.defense - 6),
      development: Math.max(45, interim.ratings.development - 6), morale: Math.max(45, interim.ratings.morale - 6),
    } };
    next = installCoach(next, teamId, shaved, rng, { interim: true });
  }
  return { league: next, deadMoney: r.deadMoney, fired: r.removed };
}

// ===========================================================================
// Extensions
// ===========================================================================

/** Team success 0–1 for extension talks: this season's win % (or last
 *  logged season when the record has been reset), +bonus for a playoff run. */
export function teamSuccess(league: LeagueState, teamId: string, coach: BaseCoach): number {
  const team = league.teams.find(t => t.id === teamId);
  const gp = team ? team.record.wins + team.record.losses : 0;
  let pct: number;
  let playoffRound = 0;
  const lastLog = [...(coachData(coach).seasons ?? [])].reverse().find(l => l.teamId === teamId);
  if (team && gp >= 10) pct = team.record.wins / gp;
  else if (lastLog && lastLog.wins + lastLog.losses > 0) {
    pct = lastLog.wins / (lastLog.wins + lastLog.losses);
    playoffRound = lastLog.playoffRound;
  } else pct = 0.5;
  return Math.max(0, Math.min(1, pct + playoffRound * 0.03));
}

export interface ExtensionTerms {
  years: number;
  salary: number;
  startSeason: number;
}

export interface ExtensionResult {
  accepted: boolean;
  /** Why the coach said yes / no (UI copy). */
  reason: string;
  terms: ExtensionTerms;
}

/**
 * The coach's asking price + verdict for an extension of `years` seasons.
 *  - Asking salary = market × situation premium (winning teams get a
 *    hometown discount; losing teams pay a premium).
 *  - An elite coach (80+ OVR) won't commit long-term to a losing team
 *    (success < .40); any coach refuses a 5-year deal from a bottom team.
 */
export function evaluateCoachExtension(league: LeagueState, teamId: string, role: StaffRole, years: number): ExtensionResult | null {
  const coach = getTeamCoach(league, teamId, role);
  if (!coach) return null;
  const season = coachContractSeason(league);
  const end = contractEnd(coach);
  const startSeason = end != null && end >= season ? end + 1 : season;
  const success = teamSuccess(league, teamId, coach);
  const ovr = coachOverall(coach);
  const premium = success >= 0.6 ? 0.95 : success >= 0.45 ? 1.05 : 1.15;
  const salary = Math.round(coachMarketSalary(coach, startSeason) * premium / 100_000) * 100_000;
  const n = Math.max(1, Math.min(5, Math.round(years)));
  const terms = { years: n, salary, startSeason };

  if (ovr >= 80 && success < 0.4 && n >= 2) {
    return { accepted: false, reason: `${coach.lastName} wants to see the roster turn around before committing — he'd only take a one-year deal.`, terms };
  }
  if (success < 0.3 && n >= 5) {
    return { accepted: false, reason: `${coach.lastName} won't tie himself to a rebuild for five more years.`, terms };
  }
  if (coach.age + n > 74) {
    return { accepted: false, reason: `${coach.lastName} (age ${coach.age}) doesn't plan to coach that long.`, terms };
  }
  const tone = success >= 0.6 ? 'He loves the situation — hometown discount.' : success >= 0.45 ? 'Market rate.' : 'He wants a premium to stay with a struggling team.';
  return { accepted: true, reason: tone, terms };
}

/** Apply an accepted extension (adds years after the current deal). */
export function extendCoach(league: LeagueState, teamId: string, role: StaffRole, years: number): { league: LeagueState; result: ExtensionResult | null } {
  const result = evaluateCoachExtension(league, teamId, role, years);
  const coach = getTeamCoach(league, teamId, role);
  if (!result || !coach || !result.accepted) return { league, result };
  const add = buildCoachContract(result.terms.salary, result.terms.years, result.terms.startSeason);
  const season = coachContractSeason(league);
  const keep = (coach.contract?.years ?? []).filter(y => y.season >= season && y.season < result.terms.startSeason);
  const contract: BaseContract = {
    years: [...keep, ...add.years],
    signedSeason: coach.contract?.signedSeason ?? season,
    guaranteedAtSigning: (coach.contract?.guaranteedAtSigning ?? 0) + add.guaranteedAtSigning,
    modifications: [
      ...(coach.contract?.modifications ?? []),
      {
        date: `${league.currentSeason}`,
        type: 'extension',
        description: `${result.terms.years}-yr extension at ${(result.terms.salary / 1e6).toFixed(1)}M/yr`,
        capImpactByYear: {},
      },
    ],
    sportData: {},
  };
  const coaches = coachesOf(league);
  coaches[coach.id] = withCoachData({ ...coach, contract }, { interim: undefined });
  return { league: { ...league, coaches }, result };
}
