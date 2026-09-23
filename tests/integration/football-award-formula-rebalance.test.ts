/**
 * OPOY/DPOY formula rebalance (P1 — 2026-09-22, obungaloo #general).
 *
 * Reported: "it seems to be impossible for a wr or db to win opoy/dpoy."
 * Root causes fixed in awards.ts:
 *  - opoyScore counted pass + rush + receiving yards as one raw total, so RBs
 *    (rush AND receiving) always outscored WRs (receiving only). Now it's a
 *    receiver-vs-runner battle: receivingYards*1.2 + rushYards + recTD*30 + rushTD*25.
 *  - dpoyScore weighted sacks at 8 but INT at 7 / PD at 2, burying shutdown
 *    corners. Now INT is 12 and PD is 4 so an 8-INT/15-PD CB can match a DL.
 *
 * These guard the intended competitiveness without over-correcting (RBs and DLs
 * must still be able to win with dominant lines).
 */
import { describe, it, expect } from 'vitest';
import { opoyScore, dpoyScore } from '@/lib/engine/awards';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, stats: Partial<Player['stats']>, teamId = 't1'): Player {
  return {
    id, firstName: 'Test', lastName: id, position, age: 26, experience: 4,
    ratings: { overall: 88, speed: 88, strength: 88, agility: 88, awareness: 88,
      stamina: 88, throwing: 88, catching: 88, carrying: 88, blocking: 88,
      tackling: 88, coverage: 88, passRush: 88, kicking: 88 },
    potential: 88, ratingHistory: [],
    stats: {
      passYards: 0, passTDs: 0, interceptions: 0, rushYards: 0, rushTDs: 0,
      receivingYards: 0, receivingTDs: 0, receptions: 0, tackles: 0, sacks: 0,
      defensiveINTs: 0, tacklesForLoss: 0, passDeflections: 0, forcedFumbles: 0,
      ...stats,
    } as Player['stats'],
    careerStats: {} as Player['careerStats'], contract: {} as Player['contract'],
    teamId, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}

const teams: Team[] = [{ id: 't1', record: { wins: 11 } } as unknown as Team];

describe('OPOY formula rebalance', () => {
  it('lets a standout WR win over a merely good dual-threat RB', () => {
    // A monster WR year (1600 rec / 15 TD) should now beat a good-not-elite RB.
    const wr = makePlayer('wr', 'WR', { receivingYards: 1600, receivingTDs: 15 });
    const rb = makePlayer('rb', 'RB', { rushYards: 1400, rushTDs: 12, receivingYards: 250, receivingTDs: 1 });
    expect(opoyScore(wr)).toBeGreaterThan(opoyScore(rb));
  });

  it('makes the reported comparable WR competitive with a dual-threat RB', () => {
    // The reported case: 1400 rec / 12 TD WR vs 1500 rush / 300 rec / 15 TD RB.
    // Under the old raw-total formula the WR (1760) trailed the RB (2250) by ~22%
    // — effectively unwinnable. The rebalance must close that to a competitive
    // margin (within 15%) so a slightly better WR year flips it.
    const wr = makePlayer('wr', 'WR', { receivingYards: 1400, receivingTDs: 12 });
    const rb = makePlayer('rb', 'RB', { rushYards: 1500, rushTDs: 12, receivingYards: 300, receivingTDs: 3 });
    expect(opoyScore(wr) / opoyScore(rb)).toBeGreaterThan(0.85);
  });

  it('still lets a truly dominant RB win over an average WR', () => {
    const eliteRb = makePlayer('rb', 'RB', { rushYards: 2000, rushTDs: 20, receivingYards: 600, receivingTDs: 4 });
    const avgWr = makePlayer('wr', 'WR', { receivingYards: 1000, receivingTDs: 7 });
    expect(opoyScore(eliteRb)).toBeGreaterThan(opoyScore(avgWr));
  });

  it('ignores pass yards (OPOY excludes QBs by design)', () => {
    const trickPlay = makePlayer('wr', 'WR', { receivingYards: 1200, receivingTDs: 10, passYards: 500, passTDs: 5 });
    const clean = makePlayer('wr2', 'WR', { receivingYards: 1200, receivingTDs: 10 });
    expect(opoyScore(trickPlay)).toBe(opoyScore(clean));
  });
});

describe('DPOY formula rebalance', () => {
  it('lets a shutdown CB match/beat a sack-heavy DL', () => {
    // 8 INT / 15 PD / 60 TKL CB vs 10-sack / 55-TKL / 12-TFL DL.
    const cb = makePlayer('cb', 'CB', { defensiveINTs: 8, passDeflections: 15, tackles: 60 });
    const dl = makePlayer('dl', 'DL', { sacks: 10, tackles: 55, tacklesForLoss: 12, forcedFumbles: 2 });
    expect(dpoyScore(cb, teams)).toBeGreaterThanOrEqual(dpoyScore(dl, teams));
  });

  it('still lets a monster pass-rusher win over an average CB', () => {
    const eliteDl = makePlayer('dl', 'DL', { sacks: 18, tackles: 65, tacklesForLoss: 22, forcedFumbles: 5 });
    const avgCb = makePlayer('cb', 'CB', { defensiveINTs: 3, passDeflections: 8, tackles: 55 });
    expect(dpoyScore(eliteDl, teams)).toBeGreaterThan(dpoyScore(avgCb, teams));
  });
});
