/**
 * Discipline (#13): foul-outs occasionally draw suspensions/fines. The roll is
 * deterministic, suspensions gate availability (returnDay > day), and served
 * suspensions clear. Fines never bench a player.
 */
import { describe, it, expect } from 'vitest';
import {
  rollGameDiscipline, isSuspendedOn, clearServed, applyDisciplineRolls, getDiscipline,
  type DisciplineMap,
} from '@/../apps/bs-basketball/src/lib/discipline';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

function gameWithFoulOuts(ids: string[]): GameResult {
  const boxScores: Record<string, Partial<BasketballStats>> = {};
  for (const id of ids) boxScores[id] = { minutes: 30, personalFouls: 6 };
  return {
    id: 'g-disc', season: 2026, competitionId: 'c', date: '', homeTeamId: 'h' as never, awayTeamId: 'a' as never,
    status: 'played', finalScore: { home: 100, away: 98 }, boxScores: boxScores as never, sportData: {},
  } as GameResult;
}

describe('discipline', () => {
  it('rolls deterministically and only from foul-outs', () => {
    // Many foul-outs so at least one incident lands; identical seed → identical map.
    const ids = Array.from({ length: 80 }, (_, i) => `p${i}`);
    const a = rollGameDiscipline({}, gameWithFoulOuts(ids), 10, 2026);
    const b = rollGameDiscipline({}, gameWithFoulOuts(ids), 10, 2026);
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(Object.keys(a).length).toBeGreaterThan(0);

    // A player who did NOT foul out is never disciplined.
    const clean: GameResult = { ...gameWithFoulOuts([]), boxScores: { safe: { minutes: 30, personalFouls: 3 } } as never };
    expect(Object.keys(rollGameDiscipline({}, clean, 10, 2026))).toHaveLength(0);
  });

  it('suspensions gate availability and then clear', () => {
    const ids = Array.from({ length: 80 }, (_, i) => `p${i}`);
    const map: DisciplineMap = rollGameDiscipline({}, gameWithFoulOuts(ids), 10, 2026);
    const susp = Object.values(map).find(d => d.kind === 'suspension');
    expect(susp).toBeDefined();

    // Out on the suspension day, available again on/after returnDay.
    expect(isSuspendedOn(map, susp!.playerId, 10)).toBe(true);
    expect(isSuspendedOn(map, susp!.playerId, susp!.returnDay)).toBe(false);

    // Fines never gate.
    const fine = Object.values(map).find(d => d.kind === 'fine');
    if (fine) expect(isSuspendedOn(map, fine.playerId, 10)).toBe(false);

    // clearServed drops the suspension once served.
    const league = { ...createNewBasketballLeague({ rngSeed: 'd' }), sportData: { discipline: map } } as never;
    const cleared = clearServed(league, susp!.returnDay);
    expect(getDiscipline(cleared)[susp!.playerId]).toBeUndefined();
  });

  it('integrates through a stretch of real sim days without crashing', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'disc-sim' });
    const out = applyDisciplineRolls(simThroughDay(fresh, 40).league, [], 40, 2026);
    // The map is well-formed (every record keyed by its own playerId).
    for (const [id, rec] of Object.entries(getDiscipline(out))) expect(rec.playerId).toBe(id);
  });
});
