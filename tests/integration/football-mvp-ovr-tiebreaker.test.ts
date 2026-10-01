/**
 * QB MVP OVR tie-breaker (P2 — 2026-10-01, obungaloo via Commish).
 *
 * Reported: mid-70 OVR QBs with the irrational_confidence trait were winning
 * MVP over genuinely better 80+ OVR passers, because mvpScore()'s QB branch was
 * purely stat-based and the IC trait inflates in-game stats via hero games.
 * Fix: add `+ p.ratings.overall * 0.3` to the QB branch so talent breaks ties
 * (mirroring allLeagueScore's ~20% OVR weight) without overriding real stat
 * dominance — an IC QB with genuinely elite stats can still win.
 */
import { describe, it, expect } from 'vitest';
import { mvpScore } from '@/lib/engine/awards';
import type { Player, Team } from '@/types';

function makeQB(id: string, overall: number, stats: Partial<Player['stats']>, teamId = 't1'): Player {
  return {
    id, firstName: 'Test', lastName: id, position: 'QB', age: 26, experience: 4,
    ratings: { overall, speed: 70, strength: 70, agility: 70, awareness: overall,
      stamina: 70, throwing: overall, catching: 40, carrying: 50, blocking: 30,
      tackling: 30, coverage: 30, passRush: 30, kicking: 30 },
    potential: overall, ratingHistory: [],
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

// Same team for both QBs so winBonus is identical and only OVR/stats vary.
const teams: Team[] = [{ id: 't1', record: { wins: 12, losses: 5 } } as unknown as Team];

describe('QB MVP OVR tie-breaker', () => {
  it('an 80 OVR QB beats a 74 OVR QB with identical stats', () => {
    const elite = makeQB('elite', 80, { passYards: 4200, passTDs: 32, interceptions: 10, rushYards: 180, rushTDs: 2 });
    const ic = makeQB('ic', 74, { passYards: 4200, passTDs: 32, interceptions: 10, rushYards: 180, rushTDs: 2 });
    expect(mvpScore(elite, teams)).toBeGreaterThan(mvpScore(ic, teams));
  });

  it('is only a tie-breaker — a lower-OVR QB with genuinely elite stats still wins', () => {
    // A 74 OVR QB who actually posts a monster line beats an 80 OVR QB with a
    // mediocre season: the ~1.8-pt OVR gap can't override real stat dominance.
    const lowOvrElite = makeQB('lowElite', 74, { passYards: 5100, passTDs: 44, interceptions: 6, rushYards: 300, rushTDs: 4 });
    const highOvrWeak = makeQB('highWeak', 80, { passYards: 3100, passTDs: 17, interceptions: 15, rushYards: 40, rushTDs: 0 });
    expect(mvpScore(lowOvrElite, teams)).toBeGreaterThan(mvpScore(highOvrWeak, teams));
  });
});
