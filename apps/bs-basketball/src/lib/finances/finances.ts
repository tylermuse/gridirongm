/**
 * Team finances (parity audit P0.3).
 *
 * The cap side is real (basketballTeamCapStatus); the revenue side is a derived
 * model — there's no money simulation, so revenue is reconstructed from market
 * size (a deterministic per-team factor), record, and star power. NBA-scale and
 * stable. Nothing is persisted, so it works on every save.
 */

import {
  basketballTeamCapStatus,
  type TeamCapStatus,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getHeadCoach, getDevCoach } from '../coaching/coaches';
import { coachSalaryFor, coachContractSeason, teamCoachDeadMoney } from '../coaching/contracts';
import { teamDeadCap } from '../roster/deadCap';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const NATIONAL_TV = 110_000_000; // league-shared national TV money, flat per team

export interface TeamFinances {
  revenue: { nationalTv: number; localTv: number; gate: number; merch: number; total: number };
  expenses: {
    payroll: number;
    /** Head coach + dev coach salaries (owner expense, not cap). */
    coaching: number;
    /** Salary still owed to fired coaches this season (owner expense, not cap). */
    coachDeadMoney: number;
    luxuryTax: number;
    deadCap: number;
    total: number;
  };
  profit: number;
  cap: TeamCapStatus;
  byPosition: Record<BasketballPosition, number>;
  expiring: { player: BasketballPlayer; salary: number }[];
  topSalaries: { player: BasketballPlayer; salary: number }[];
}

/** Stable 0.75–1.40 market multiplier from the team abbreviation. */
function marketFactor(team: BasketballTeam): number {
  let h = 0;
  for (const c of team.abbreviation) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 0.75 + ((h % 100) / 100) * 0.65;
}

function currentSalary(p: BasketballPlayer, season: number): number {
  if (!p.contract) return 0;
  const y = p.contract.years.find(yr => yr.season === season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}

export function teamFinances(league: LeagueState, team: BasketballTeam): TeamFinances {
  const season = league.currentSeason;
  const players = team.playerIds
    .map(id => (league.players as Record<string, BasketballPlayer>)[id])
    .filter((p): p is BasketballPlayer => !!p);

  // Dead money counts fully against the cap + luxury tax (NBA rules), so fold it
  // into the cap status as extra payroll — that makes capRoom, the aprons, and
  // the tax bill all reflect it. cap.payroll then INCLUDES dead cap; the expense
  // breakdown below splits it back out so the rows still read cleanly.
  const deadCap = teamDeadCap(team, season);
  const cap = basketballTeamCapStatus(players, season, deadCap);

  const gp = team.record.wins + team.record.losses;
  const winPct = gp > 0 ? team.record.wins / gp : 0.5;
  const mkt = marketFactor(team);
  const starOvr = players.reduce((m, p) => Math.max(m, p.ratings.overall), 0);

  const localTv = Math.round((35_000_000 + 20_000_000 * winPct) * mkt);
  const gate = Math.round((45_000_000 + 25_000_000 * winPct) * mkt);
  const merch = Math.round((20_000_000 + 30_000_000 * winPct) * mkt * (0.8 + Math.max(0, starOvr - 75) / 50));
  const revTotal = NATIONAL_TV + localTv + gate + merch;

  // Coaching staff is an owner expense — it never touches the player cap.
  // Priced for the contract season (the upcoming one during the offseason).
  const staffSeason = coachContractSeason(league);
  const hc = getHeadCoach(league, team.id);
  const pdc = getDevCoach(league, team.id);
  const coaching = (hc ? coachSalaryFor(hc, staffSeason) : 0) + (pdc ? coachSalaryFor(pdc, staffSeason) : 0);
  const coachDeadMoney = teamCoachDeadMoney(team, staffSeason);
  const expenses = {
    payroll: cap.payroll - deadCap, // player salaries only (dead cap is its own row)
    coaching,
    coachDeadMoney,
    luxuryTax: cap.taxBill,
    deadCap,
    total: cap.payroll + cap.taxBill + coaching + coachDeadMoney, // cap.payroll already includes deadCap
  };

  const byPosition: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of players) byPosition[p.sportData.position] += currentSalary(p, season);

  const withSalary = players
    .map(p => ({ player: p, salary: currentSalary(p, season) }))
    .filter(x => x.salary > 0);

  const expiring = withSalary.filter(
    x => x.player.contract && x.player.contract.years.filter(y => y.season >= season).length <= 1,
  ).sort((a, b) => b.salary - a.salary);

  const topSalaries = [...withSalary].sort((a, b) => b.salary - a.salary).slice(0, 8);

  return {
    revenue: { nationalTv: NATIONAL_TV, localTv, gate, merch, total: revTotal },
    expenses,
    profit: revTotal - expenses.total,
    cap,
    byPosition,
    expiring,
    topSalaries,
  };
}

export function apronLabel(cap: TeamCapStatus): { text: string; color: string } {
  if (cap.isOverSecondApron) return { text: 'Over the 2nd apron', color: '#dc2626' };
  if (cap.isOverFirstApron) return { text: 'Over the 1st apron', color: '#f97316' };
  if (cap.isOverTax) return { text: 'In the luxury tax', color: '#f59e0b' };
  if (cap.isOverCap) return { text: 'Over the cap', color: '#eab308' };
  return { text: 'Below the cap', color: '#10b981' };
}
