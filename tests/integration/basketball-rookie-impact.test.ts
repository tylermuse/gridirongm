import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, startNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { autoPickUntilUser } from '@/../apps/bs-basketball/src/lib/draft';
import { regularSeasonStatsByPlayer } from '@/../apps/bs-basketball/src/lib/stats/seasonStats';
import { generateBasketballDraftClass } from '@bs/sport-basketball';
import type { BasketballPlayer } from '@bs/sport-basketball';

function completeSeason(l: ReturnType<typeof createNewBasketballLeague>) {
  let g = 0;
  while (!isRegularSeasonComplete(l) && g < 400) { const r = simNextDay(l); if (!r) break; l = r.league; g++; }
  l = initializePlayoffs(l);
  g = 0;
  while (!getBracket(l)!.complete && g < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; g++; }
  return l;
}

describe('BUG-10 rookie impact', () => {
  it('generates rotation-caliber top picks', () => {
    const cls = generateBasketballDraftClass(2027, 60);
    const top3 = cls.slice(0, 3).map(p => p.ratings.overall);
    // Top picks should be NBA-rotation caliber, not low-60s bench filler.
    expect(Math.max(...top3)).toBeGreaterThanOrEqual(72);
  });

  it('a top rookie posts real production in his rookie season', () => {
    let l = completeSeason(createNewBasketballLeague({ rngSeed: 'rookie-impact' }));
    l = startNextSeason(autoPickUntilUser(enterOffseason(l), null));
    const rookieSeason = l.currentSeason;
    // Sim the full rookie regular season.
    let g = 0;
    while (!isRegularSeasonComplete(l) && g < 400) { const r = simNextDay(l); if (!r) break; l = r.league; g++; }

    const stats = regularSeasonStatsByPlayer(l);
    const rookies = Object.values(l.players)
      .map(p => p as BasketballPlayer)
      .filter(p => (p.sportData.draftYear === rookieSeason) || (p.sportData.acquiredVia === 'draft' && p.sportData.acquiredSeason === rookieSeason));
    expect(rookies.length).toBeGreaterThan(0);

    const ppgOf = (p: BasketballPlayer) => {
      const s = stats.get(p.id as never);
      return s && s.gamesPlayed > 0 ? s.points / s.gamesPlayed : 0;
    };
    const bestPpg = Math.max(...rookies.map(ppgOf));
    // The bug had the ROY at ~5-8 PPG. The best rookie should now be a real
    // contributor (well into double digits — observed ~18 with the OVR retune).
    expect(bestPpg).toBeGreaterThan(12);
  });
});
