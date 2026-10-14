/**
 * Trade-deadline needs: where a team's starters rank against the league,
 * position by position, and real players who'd fill the biggest holes —
 * so the deadline show can talk about what kind of player to go get, and
 * who, instead of re-hashing last week's game. Pure (client-safe).
 */
import type { Player, Position, Team } from '@/types';

/** How many starters each position fields. */
export const STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2 };

export interface NeedTarget {
  name: string; pos: Position; ovr: number; age: number;
  team: string; teamRecord: string;
  salary: number; yearsLeft: number;
  /** Expiring deal: a rental for the stretch run. */
  rental: boolean;
  /** Salary fits under the cap space they have now. */
  fitsCap: boolean;
}

export interface PositionNeed {
  pos: Position;
  /** Starters' average OVR, and where that ranks (1 = best). */
  avgOvr: number; rank: number; of: number;
  /** The weakest starter at the spot: the guy a trade would replace. */
  weakest: { name: string; ovr: number; age: number };
  targets: NeedTarget[];
}

export interface TradeNeeds {
  stance: 'buyer' | 'seller' | 'bubble';
  capSpace: number;
  needs: PositionNeed[];
  strengths: { pos: Position; rank: number; of: number }[];
  /** Sellers only: veterans another contender would pay for. */
  sellCandidates: { name: string; pos: Position; ovr: number; age: number; salary: number; yearsLeft: number }[];
}

const active = (p: Player) => !p.retired && !p.injury?.weeksLeft;
const starters = (players: Player[], teamId: string, pos: Position) =>
  players.filter(p => p.teamId === teamId && p.position === pos && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, STARTERS[pos] ?? 1);
const avg = (ps: Player[]) => (ps.length ? ps.reduce((s, p) => s + p.ratings.overall, 0) / ps.length : 0);
const record = (t: Team) => `${t.record.wins}-${t.record.losses}`;
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

export function computeTradeNeeds(team: Team, teams: Team[], players: Player[], maxNeeds = 2, perNeed = 3): TradeNeeds {
  const { wins, losses } = team.record;
  const stance = wins - losses >= 2 ? 'buyer' : losses - wins >= 2 ? 'seller' : 'bubble';
  const capSpace = Math.round((team.salaryCap - team.totalPayroll) * 10) / 10;
  const byId = new Map(teams.map(t => [t.id, t]));

  const ranked = (Object.keys(STARTERS) as Position[]).map(pos => {
    const league = teams.map(t => ({ id: t.id, v: avg(starters(players, t.id, pos)) })).sort((a, b) => b.v - a.v);
    const mine = starters(players, team.id, pos);
    return { pos, mine, avgOvr: Math.round(avg(mine)), rank: league.findIndex(x => x.id === team.id) + 1, of: league.length };
  });

  const needs = ranked.filter(r => r.mine.length > 0).sort((a, b) => b.rank / b.of - a.rank / a.of).slice(0, maxNeeds).map(r => {
    const weakest = r.mine[r.mine.length - 1];
    const targets = players
      .filter(p => p.position === r.pos && p.teamId && p.teamId !== team.id && active(p) && p.age <= 32 && p.ratings.overall >= weakest.ratings.overall + 3)
      .map(p => ({ p, t: byId.get(p.teamId!) }))
      // Teams out of it are the ones who'll sell.
      .filter((x): x is { p: Player; t: Team } => !!x.t && x.t.record.wins <= x.t.record.losses)
      .sort((a, b) => b.p.ratings.overall - a.p.ratings.overall)
      .slice(0, perNeed)
      .map(({ p, t }) => ({
        name: name(p), pos: p.position, ovr: p.ratings.overall, age: p.age,
        team: `${t.city} ${t.name}`, teamRecord: record(t),
        salary: p.contract.salary, yearsLeft: p.contract.yearsLeft,
        rental: p.contract.yearsLeft <= 1, fitsCap: p.contract.salary <= capSpace,
      }));
    return { pos: r.pos, avgOvr: r.avgOvr, rank: r.rank, of: r.of, weakest: { name: name(weakest), ovr: weakest.ratings.overall, age: weakest.age }, targets };
  });

  const strengths = [...ranked].filter(r => r.mine.length > 0).sort((a, b) => a.rank - b.rank).slice(0, 2).map(r => ({ pos: r.pos, rank: r.rank, of: r.of }));

  const sellCandidates = stance !== 'seller' ? [] : players
    .filter(p => p.teamId === team.id && !p.retired && p.age >= 29 && p.ratings.overall >= 75)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 3)
    .map(p => ({ name: name(p), pos: p.position, ovr: p.ratings.overall, age: p.age, salary: p.contract.salary, yearsLeft: p.contract.yearsLeft }));

  return { stance, capSpace, needs, strengths, sellCandidates };
}
