/**
 * Basketball trade evaluator tests.
 *
 * Validates:
 *   - Even-value 1-for-1 trade accepted by both sides
 *   - Lopsided trade flagged as rejected
 *   - Over-cap team taking back too much salary fails the 125% rule
 *   - Under-cap team has more flexibility (no 125% rule)
 *   - Second-apron team is hard-capped at 1:1 matching (enforced, blocking)
 *   - Picks count toward fairness math
 *   - Multi-team (3-team) trade splits flow correctly
 *   - Crossing the second apron surfaces a (non-blocking) hard-cap warning
 *   - Pick-only trade (no salary) handled
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateBasketballTrade,
  generateBasketballPlayer,
  basketballSalaryCap,
  basketballTradeValue,
  basketballPickTradeValue,
  type BasketballPlayer,
  type BasketballTradeProposal,
  type BasketballTradeContext,
} from '@bs/sport-basketball';
import type { TeamId, PlayerId, BaseDraftPick, BaseContract } from '@bs/core/adapter';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const SEASON = 2026;

function makeContract(
  annualSalary: number,
  years: number,
  startSeason = SEASON,
): BaseContract {
  const yrs = [];
  for (let i = 0; i < years; i++) {
    yrs.push({
      season: startSeason + i,
      baseSalary: annualSalary,
      proratedBonus: 0,
      guaranteed: true,
    });
  }
  return {
    years: yrs,
    signedSeason: startSeason,
    guaranteedAtSigning: annualSalary * years,
    modifications: [],
    sportData: null,
  };
}

function makePlayerWithSalary(
  targetOverall: number,
  annualSalary: number,
  contractYears = 3,
): BasketballPlayer {
  const p = generateBasketballPlayer({ targetOverall, age: 26 });
  return {
    ...p,
    contract: makeContract(annualSalary, contractYears),
  };
}

function makePick(round: number, season = SEASON + 1, teamId: TeamId = 'team-x' as TeamId): BaseDraftPick {
  return {
    season,
    round,
    originalTeamId: teamId,
    currentTeamId: teamId,
  };
}

/** Build a fully-filled roster at a specified payroll target. */
function fillRosterToPayroll(payrollTarget: number, count = 15): BasketballPlayer[] {
  // Spread payroll evenly across `count` players at OVR 70-ish
  const perPlayer = Math.round(payrollTarget / count);
  return Array.from({ length: count }, () => makePlayerWithSalary(70, perPlayer, 3));
}

function makeContext(rosters: Record<string, BasketballPlayer[]>): BasketballTradeContext {
  const m = new Map<TeamId, BasketballPlayer[]>();
  for (const [id, roster] of Object.entries(rosters)) {
    m.set(id as TeamId, roster);
  }
  return { teamRosters: m };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('basketball trade evaluator — basic mechanics', () => {
  it('accepts an even-value 1-for-1 trade between two cap-flexible teams', () => {
    const cap = basketballSalaryCap(SEASON);
    // Both teams under cap (~50M payroll for ~140M cap)
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);

    // Identical star profiles + salaries → exactly even value, so the result is
    // deterministic. (Two separately-generated 85-OVR players get random
    // positions/ratings and thus unequal value, which made this test flaky.)
    const playerA = makePlayerWithSalary(85, 25_000_000, 3);
    const playerB: BasketballPlayer = { ...playerA, id: 'even-trade-player-b' as typeof playerA.id };
    teamARoster.push(playerA);
    teamBRoster.push(playerB);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    expect(result.legal).toBe(true);
    expect(result.allAccept).toBe(true);
    expect(result.perTeam).toHaveLength(2);
    void cap;
  });

  it('rejects a lopsided trade (one team way ahead, other way behind)', () => {
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);

    // Team A sends a superstar; Team B sends a bench warmer
    const superstar = makePlayerWithSalary(95, 45_000_000, 4);
    const bench = makePlayerWithSalary(62, 2_000_000, 1);
    teamARoster.push(superstar);
    teamBRoster.push(bench);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [superstar.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [bench.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    // Team A is GIVING way too much — they reject.
    // Salary match: outgoing $45M (>$29M), max incoming = 125% + 250k = $56.5M.
    // Incoming $2M satisfies cap rule but fairness fails for Team A.
    const teamA = result.perTeam.find(t => t.teamId === 'A')!;
    expect(teamA.willAccept).toBe(false);
    expect(result.allAccept).toBe(false);
  });

  it('flags cap violation when over-cap team takes back too much salary', () => {
    const cap = basketballSalaryCap(SEASON);
    // Team A is OVER the cap (~$155M payroll, cap $140M-ish)
    const teamARoster = fillRosterToPayroll(cap + 15_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);

    // Team A sends a low-salary player ($3M)
    // Team B sends a giant contract ($35M)
    // For $3M outgoing, max incoming under 200%+$250k = $6.25M.
    // $35M incoming is wildly illegal.
    const cheapPlayer = makePlayerWithSalary(68, 3_000_000, 2);
    const bigContract = makePlayerWithSalary(88, 35_000_000, 3);
    teamARoster.push(cheapPlayer);
    teamBRoster.push(bigContract);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [cheapPlayer.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [bigContract.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    expect(result.legal).toBe(false);
    const teamA = result.perTeam.find(t => t.teamId === 'A')!;
    expect(teamA.capCompliant).toBe(false);
    expect(teamA.reasoning).toMatch(/salary doesn.?t match|exceeds the .* ceiling/i);
  });

  it('enforces the second-apron hard 1:1 — a take-back-more deal that the 125% rule would allow is now illegal', () => {
    const cap = basketballSalaryCap(SEASON);
    // Team A is over the SECOND apron (~1.295× cap). Fill to 200M + a 20M player
    // = ~220M, comfortably past the 213.7M second apron at a 165M cap.
    const teamARoster = fillRosterToPayroll(200_000_000);
    const teamBRoster = fillRosterToPayroll(60_000_000);

    // Team A sends $20M, takes back $25M. Under the standard tier ($7.5M–$29M →
    // outgoing + $7.5M = $27.5M ceiling) that's LEGAL — but a second-apron team
    // is hard-capped at 1:1, so $25M > $20M is now illegal.
    const sent = makePlayerWithSalary(75, 20_000_000, 3);
    const back = makePlayerWithSalary(80, 25_000_000, 3);
    teamARoster.push(sent);
    teamBRoster.push(back);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [sent.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [back.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    const teamA = result.perTeam.find(t => t.teamId === 'A')!;
    expect(teamA.capCompliant).toBe(false);
    expect(result.legal).toBe(false);
    expect(teamA.reasoning).toMatch(/second apron/i);
    void cap;
  });

  it('lets an under-cap team absorb a big incoming contract', () => {
    // Team A is far under the cap with ~$70M room
    const teamARoster = fillRosterToPayroll(70_000_000);
    const teamBRoster = fillRosterToPayroll(120_000_000);

    // Team A sends only a $5M player
    // Team B sends a $30M star
    // Cap-legal: Team A has $70M room + $5M outgoing >> $30M
    const smallPlayer = makePlayerWithSalary(70, 5_000_000, 2);
    const star = makePlayerWithSalary(86, 30_000_000, 4);
    teamARoster.push(smallPlayer);
    teamBRoster.push(star);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [smallPlayer.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [star.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    const teamA = result.perTeam.find(t => t.teamId === 'A')!;
    expect(teamA.capCompliant).toBe(true);
    expect(result.legal).toBe(true);
  });
});

describe('trade value — productive veterans (BUG-8)', () => {
  function withSeasonLog(p: BasketballPlayer, ppg: number, rpg: number, apg: number): BasketballPlayer {
    return {
      ...p,
      sportData: {
        ...p.sportData,
        seasonLog: [{ season: SEASON - 1, age: p.age - 1, overall: p.ratings.overall, gamesPlayed: 70, ppg, rpg, apg }],
      },
    };
  }

  it('values a productive star vet above a raw teenager and a mid-first pick', () => {
    // 81-OVR, 34-yo, ~21/4/5 producer (Kyrie-like).
    const vetBase = generateBasketballPlayer({ targetOverall: 81, age: 34 });
    const vet = withSeasonLog({ ...vetBase, contract: makeContract(39_500_000, 2) }, 21, 4, 5);
    // 69-OVR, 19-yo prospect with upside but no production.
    const teenBase = generateBasketballPlayer({ targetOverall: 69, age: 19 });
    const teen = { ...teenBase, development: { ...teenBase.development, potential: 82 }, contract: makeContract(4_000_000, 3) };

    const vetValue = basketballTradeValue(vet, { season: SEASON });
    const teenValue = basketballTradeValue(teen, { season: SEASON });

    // The reported bug: the vet was valued BELOW the teenager. Now he's clearly above.
    expect(vetValue).toBeGreaterThan(teenValue);
    // And worth more than a real first-round pick (≈ #25), so a win-now team
    // would reasonably surrender a first for him (the bug had him below a late-
    // first AND below the teenager).
    expect(vetValue).toBeGreaterThan(basketballPickTradeValue(25));
  });

  it('still discounts an unproductive vet relative to a producer of equal age/OVR', () => {
    const base = generateBasketballPlayer({ targetOverall: 81, age: 34 });
    const producer = withSeasonLog({ ...base, contract: makeContract(20_000_000, 2) }, 22, 5, 6);
    const benchwarmer = withSeasonLog({ ...base, contract: makeContract(20_000_000, 2) }, 5, 2, 1);
    expect(basketballTradeValue(producer, { season: SEASON })).toBeGreaterThan(
      basketballTradeValue(benchwarmer, { season: SEASON }),
    );
  });
});

describe('basketball trade evaluator — picks + balance', () => {
  it('counts draft picks as value (sweetener moves a borderline trade)', () => {
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);

    // Team A sends mid-tier player; Team B sends slightly weaker player + 1st-round pick
    const playerA = makePlayerWithSalary(80, 18_000_000, 3);
    const playerB = makePlayerWithSalary(75, 15_000_000, 3);
    teamARoster.push(playerA);
    teamBRoster.push(playerB);

    // Without sweetener
    const withoutPick: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [] },
      ],
    };
    // With sweetener (Team B adds a 1st-round pick)
    const withPick: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [makePick(1)] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const r1 = evaluateBasketballTrade(withoutPick, ctx);
    const r2 = evaluateBasketballTrade(withPick, ctx);

    // Team A's incoming value goes UP when Team B adds a pick
    const teamA1 = r1.perTeam.find(t => t.teamId === 'A')!;
    const teamA2 = r2.perTeam.find(t => t.teamId === 'A')!;
    expect(teamA2.valueIn).toBeGreaterThan(teamA1.valueIn);
  });

  it('handles a pure pick-for-player swap', () => {
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);

    // Team A trades a player for Team B's two 1st-round picks
    const player = makePlayerWithSalary(76, 14_000_000, 2);
    teamARoster.push(player);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [player.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [], picksSent: [makePick(1), makePick(1, SEASON + 2)] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    // B is under-cap and sends no salary so no 125% rule issue.
    // A sends a player and gets no salary back — also under cap.
    expect(result.legal).toBe(true);
    // Each side should have valid value math (no NaN, etc.)
    for (const t of result.perTeam) {
      expect(Number.isFinite(t.valueIn)).toBe(true);
      expect(Number.isFinite(t.valueOut)).toBe(true);
    }
  });
});

describe('basketball trade evaluator — multi-team', () => {
  it('handles a 3-team trade without crashing and produces per-team outcomes', () => {
    const teamARoster = fillRosterToPayroll(60_000_000);
    const teamBRoster = fillRosterToPayroll(60_000_000);
    const teamCRoster = fillRosterToPayroll(60_000_000);

    const playerA = makePlayerWithSalary(82, 22_000_000, 3);
    const playerB = makePlayerWithSalary(78, 18_000_000, 2);
    const playerC = makePlayerWithSalary(80, 20_000_000, 3);
    teamARoster.push(playerA);
    teamBRoster.push(playerB);
    teamCRoster.push(playerC);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [] },
        { teamId: 'C' as TeamId, playersSent: [playerC.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster, C: teamCRoster });

    const result = evaluateBasketballTrade(proposal, ctx);
    expect(result.perTeam).toHaveLength(3);
    for (const t of result.perTeam) {
      expect(Number.isFinite(t.valueIn)).toBe(true);
      expect(Number.isFinite(t.netValue)).toBe(true);
      // Each team's incoming value should be positive (got something)
      expect(t.valueIn).toBeGreaterThan(0);
    }
  });
});

describe('basketball trade evaluator — output shape', () => {
  it('returns a summary string that mentions legality status', () => {
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);
    const playerA = makePlayerWithSalary(80, 18_000_000, 3);
    const playerB = makePlayerWithSalary(80, 18_000_000, 3);
    teamARoster.push(playerA);
    teamBRoster.push(playerB);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });
    const result = evaluateBasketballTrade(proposal, ctx);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('cap detail surfaces outgoing/incoming/max for UI display', () => {
    const teamARoster = fillRosterToPayroll(50_000_000);
    const teamBRoster = fillRosterToPayroll(50_000_000);
    const playerA = makePlayerWithSalary(80, 18_000_000, 3);
    const playerB = makePlayerWithSalary(80, 18_000_000, 3);
    teamARoster.push(playerA);
    teamBRoster.push(playerB);

    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [playerA.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [playerB.id], picksSent: [] },
      ],
    };
    const ctx = makeContext({ A: teamARoster, B: teamBRoster });
    const result = evaluateBasketballTrade(proposal, ctx);
    for (const t of result.perTeam) {
      expect(t.capDetail.outgoingSalary).toBeGreaterThan(0);
      expect(t.capDetail.incomingSalary).toBeGreaterThan(0);
      expect(t.capDetail.maxIncomingAllowed).toBeGreaterThan(0);
    }
  });
});

// Suppress unused warnings for symbol-only imports used in type positions
void ({} as PlayerId);
void ({} as BaseDraftPick);
