import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { executeTrade, pickKey, getProtection } from '@/../apps/bs-basketball/src/lib/trade';
import { currentOwner } from '@/../apps/bs-basketball/src/lib/trade/picks';
import { getDraft } from '@/../apps/bs-basketball/src/lib/draft';
import type { TeamId } from '@bs/core/adapter';

describe("pick protection conveyance (BUG-9)", () => {
  it('Dallas-style protected pick conveys when it lands outside the protection', () => {
    let l = createNewBasketballLeague({ rngSeed: 'bug9-e2e' });
    const season = l.currentSeason; // e.g. 2026
    const pickSeason = season + 1;  // the traded "next-year R1"

    // Complete the season so standings + the next lottery order are meaningful.
    let g = 0; while (!isRegularSeasonComplete(l) && g < 400) { const r = simNextDay(l); if (!r) break; l = r.league; g++; }
    l = initializePlayoffs(l);
    g = 0; while (!getBracket(l)!.complete && g < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; g++; }

    // Team A trades its next-year R1 to team B, top-2 protected.
    const teamA = l.teams[0].id as TeamId;
    const teamB = l.teams[1].id as TeamId;
    const pickId = pickKey(pickSeason, 1, teamA);
    l = executeTrade(l, [
      { teamId: teamA, playerIds: [], pickIds: [pickId], pickProtections: { [pickId]: { topN: 2, rollUntilSeason: pickSeason + 2, fallback: 'second' } } },
      // B sends a token player so the trade is two-sided (executeTrade is 2-team).
      { teamId: teamB, playerIds: [l.teams[1].playerIds[0]], pickIds: [] },
    ]);
    console.log(`after trade: owner of A's ${pickSeason} R1 = ${currentOwner(l, pickSeason, 1, teamA)} (B=${teamB}); protection=${JSON.stringify(getProtection(l, pickSeason, 1, teamA))}`);

    // Roll into the offseason — this is where setupDraft + resolveProtectedPicks run.
    l = enterOffseason(l);
    const draft = getDraft(l)!;
    const slot = draft.picks.find(p => (p.originalTeamId ?? p.teamId) === teamA && p.round === 1)!;
    const owner = currentOwner(l, pickSeason, 1, teamA);
    console.log(`draft season=${draft.season}, A's R1 landed at overall #${slot.overall} (pickInRound ${slot.pickInRound}), slot.teamId=${slot.teamId}`);
    console.log(`  conveyance: owner now = ${owner}; expected ${slot.pickInRound > 2 ? `B (${teamB}) — conveys` : `A (${teamA}) — protected`}`);

    if (slot.pickInRound > 2) {
      expect(owner).toBe(teamB); // conveys to creditor
      expect(slot.teamId).toBe(teamB);
    } else {
      expect(owner).toBe(teamA); // protection holds
    }
  });
});
