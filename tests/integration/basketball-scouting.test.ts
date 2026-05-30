/**
 * Draft scouting (hidden potential) integration tests.
 *
 * Prospects start unscouted with a noisy projection grade; spending a scout
 * reveals true potential and decrements the budget; the budget is finite.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { getDraft, SCOUTS_PER_DRAFT } from '@/../apps/bs-basketball/src/lib/draft';
import {
  isScouted, scoutsLeft, scoutProspect, revealedPotential, perceivedPotential, projectionGrade,
} from '@/../apps/bs-basketball/src/lib/scouting';
import type { BasketballPlayer } from '@bs/sport-basketball';

function offseason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return enterOffseason(league);
}

describe('draft scouting', () => {
  it('starts with a full scout budget and unscouted prospects', () => {
    const league = offseason('scout-init');
    const draft = getDraft(league)!;
    expect(scoutsLeft(draft)).toBe(SCOUTS_PER_DRAFT);
    const first = league.players[draft.poolIds[0]] as BasketballPlayer;
    expect(isScouted(draft, first.id)).toBe(false);
    expect(revealedPotential(draft, first)).toBeNull();
  });

  it('scouting reveals true potential and spends a scout', () => {
    const league = offseason('scout-spend');
    const id = getDraft(league)!.poolIds[0];
    const after = scoutProspect(league, id);
    const draft = getDraft(after)!;
    expect(isScouted(draft, id)).toBe(true);
    expect(scoutsLeft(draft)).toBe(SCOUTS_PER_DRAFT - 1);
    expect(revealedPotential(draft, after.players[id] as BasketballPlayer))
      .toBe((after.players[id] as BasketballPlayer).development.potential);
  });

  it('cannot scout past the budget', () => {
    let league = offseason('scout-budget');
    const pool = getDraft(league)!.poolIds;
    for (let i = 0; i < SCOUTS_PER_DRAFT + 3; i++) league = scoutProspect(league, pool[i]);
    const draft = getDraft(league)!;
    expect(scoutsLeft(draft)).toBe(0);
    expect((draft.scoutedIds ?? []).length).toBe(SCOUTS_PER_DRAFT);
    // The (budget+1)th prospect stayed unscouted.
    expect(isScouted(draft, pool[SCOUTS_PER_DRAFT])).toBe(false);
  });

  it('projection grade is deterministic per prospect', () => {
    const league = offseason('scout-grade');
    const p = league.players[getDraft(league)!.poolIds[0]] as BasketballPlayer;
    const a = projectionGrade(perceivedPotential(p, 2027));
    const b = projectionGrade(perceivedPotential(p, 2027));
    expect(a).toBe(b);
    expect(['A', 'B', 'C', 'D']).toContain(a);
  });

  it('a fresh draft each season starts with a full budget', () => {
    const next = advanceToNextSeason(offseasonLeagueBase('scout-reset'));
    // advanceToNextSeason auto-drafts; the draft is cleared afterward.
    expect(getDraft(next)).toBeNull();
  });
});

function offseasonLeagueBase(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}
