/**
 * Pick realism + rationale (trade-engine overhaul, Phase 3 §B/§F).
 *
 *   - A future first regresses toward the team's ROSTER-quality prior, not the
 *     league midpoint — a bad team's pick stays an early pick (§B.1).
 *   - A protected first is worth less than an outright one (§B.2).
 *   - The AI's reasoning surfaces WHY it (dis)likes a deal (§F).
 */

import { describe, it, expect } from 'vitest';
import {
  basketballFuturePickValue,
  generateBasketballPlayer,
  evaluateBasketballTrade,
  type PickValueContext,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTradeContext,
  type BasketballTradeProposal,
} from '@bs/sport-basketball';
import { pickValue } from '@/../apps/bs-basketball/src/lib/trade/picks';
import type { BaseContract, BaseDraftPick, TeamId } from '@bs/core/adapter';

const SEASON = 2026;
const TEAMS = Array.from({ length: 30 }, (_, i) => `t${i}` as TeamId);

describe('future pick regresses to the roster prior (§B.1)', () => {
  // Standings put BOTH teams mid-pack (neutral signal); the roster prior says one
  // is the worst roster and the other the best.
  const midOrder = [...TEAMS];
  const rosterOrder = ['bad' as TeamId, ...TEAMS.slice(1, 29), 'good' as TeamId];

  const ctx = (withPrior: boolean): PickValueContext => ({
    numTeams: 30,
    standingsWorstFirst: midOrder, // 'bad'/'good' aren't in here → default mid slot
    currentSeason: SEASON,
    confidence: 0.1, // thin early-season sample → lean on the prior
    ...(withPrior ? { rosterStrengthWorstFirst: rosterOrder } : {}),
  });

  const futurePick = (team: TeamId): BaseDraftPick => ({
    season: SEASON + 2,
    round: 1,
    originalTeamId: team,
    currentTeamId: team,
  });

  it('a weak-roster team’s future first is worth more than a strong-roster team’s', () => {
    const badVal = basketballFuturePickValue(futurePick('bad' as TeamId), ctx(true));
    const goodVal = basketballFuturePickValue(futurePick('good' as TeamId), ctx(true));
    expect(badVal).toBeGreaterThan(goodVal * 1.3);
  });

  it('without a roster prior, both regress toward mid-round (legacy)', () => {
    const badVal = basketballFuturePickValue(futurePick('bad' as TeamId), ctx(false));
    const goodVal = basketballFuturePickValue(futurePick('good' as TeamId), ctx(false));
    expect(Math.abs(badVal - goodVal)).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Protection discount (§B.2) — via a minimal hand-built league.
// ---------------------------------------------------------------------------

type LeagueLike = Parameters<typeof pickValue>[0];

function contract(annual: number, years: number): BaseContract {
  const yrs = [];
  for (let i = 0; i < years; i++) yrs.push({ season: SEASON + i, baseSalary: annual, proratedBonus: 0, guaranteed: true });
  return { years: yrs, signedSeason: SEASON, guaranteedAtSigning: annual * years, modifications: [], sportData: null };
}
function mk(ovr: number, pos: BasketballPosition, id: string): BasketballPlayer {
  const p = generateBasketballPlayer({ targetOverall: ovr, age: 25, position: pos, rngSeed: id });
  return { ...p, id: id as BasketballPlayer['id'], ratings: { ...p.ratings, overall: ovr }, contract: contract(8_000_000, 3) };
}

function miniLeague(protections?: Record<string, unknown>): LeagueLike {
  const players: Record<string, BasketballPlayer> = {};
  const teams = TEAMS.map((id, i) => {
    const ids: string[] = [];
    for (let k = 0; k < 8; k++) {
      const pid = `${id}-p${k}`;
      players[pid] = mk(70 - i, 'SF', pid); // team 0 strongest → descending
      ids.push(pid);
    }
    return { id, record: { wins: 20, losses: 20 }, playerIds: ids, abbreviation: id };
  });
  return {
    currentSeason: SEASON,
    teams,
    players,
    sportData: protections ? { pickProtections: protections } : {},
  } as unknown as LeagueLike;
}

describe('protection discount (§B.2)', () => {
  const pick: BaseDraftPick = { season: SEASON + 2, round: 1, originalTeamId: 't5' as TeamId, currentTeamId: 't9' as TeamId };

  it('a top-4-protected first is worth less than an outright one', () => {
    const outright = pickValue(miniLeague(), pick);
    const protectedVal = pickValue(
      miniLeague({ [`${SEASON + 2}-r1-t5`]: { topN: 4, creditorTeamId: 't9', rollUntilSeason: SEASON + 5, fallback: 'void' } }),
      pick,
    );
    expect(protectedVal).toBeLessThan(outright);
    expect(protectedVal).toBeGreaterThan(outright * 0.6); // a light protection, modest cut
  });

  it('a lottery-protected first is discounted much harder', () => {
    const outright = pickValue(miniLeague(), pick);
    const lottery = pickValue(
      miniLeague({ [`${SEASON + 2}-r1-t5`]: { topN: 14, creditorTeamId: 't9', rollUntilSeason: SEASON + 5, fallback: 'void' } }),
      pick,
    );
    expect(lottery).toBeLessThan(outright * 0.65);
  });
});

describe('acceptance reasoning surfaces the why (§F)', () => {
  it('mentions cap room when a rebuilder absorbs salary for picks', () => {
    const filler = (salary: number) => Array.from({ length: 12 }, (_, i) => {
      const p = generateBasketballPlayer({ targetOverall: 64, age: 25, position: 'SG', rngSeed: `f${salary}${i}` });
      return { ...p, contract: contract(salary, 2) };
    });
    const badContract = { ...mk(74, 'PF', 'bad-deal'), contract: contract(30_000_000, 2) };
    const senderRoster = [...filler(11_000_000), badContract];
    const roomRoster = filler(4_000_000);
    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'SND' as TeamId, playersSent: [badContract.id], picksSent: [{ season: SEASON + 1, round: 1, originalTeamId: 'SND' as TeamId, currentTeamId: 'SND' as TeamId }] },
        { teamId: 'RCV' as TeamId, playersSent: [], picksSent: [] },
      ],
    };
    const ctx: BasketballTradeContext = {
      teamRosters: new Map<TeamId, BasketballPlayer[]>([
        ['SND' as TeamId, senderRoster],
        ['RCV' as TeamId, roomRoster],
      ]),
      disposition: id => (id === 'RCV' ? 'Rebuilding' : 'Win Now'),
    };
    const res = evaluateBasketballTrade(proposal, ctx);
    const rcv = res.perTeam.find(t => t.teamId === 'RCV')!;
    expect(rcv.reasoning.toLowerCase()).toContain('cap room');
  });
});
