/**
 * BUG-19 regression — imported 2026 prospects must not be sitting in the
 * 2027 offseason FA pool (with their rookie deals still ostensibly guaranteed
 * for any that were drafted).
 *
 * Reported by Tyler 2026-06-17 (Cowork chat) against a Mavericks 40-42 save
 * in the 2027 offseason FA window. Named players from the screenshot:
 *   Karim Lopez · Labaron Philon · Brayden Burries · Tahaad Pettiford ·
 *   Jayden Quaintance · Chris Cenac Jr. · Bennett Stirtz ·
 *   Christian Anderson · Dame Sarr
 *
 * Mechanism the test traces — the import path attaches ~70 prospects to
 * `players` with `rosterSlot: null`. The inaugural draft has only 60 picks,
 * so ~10 prospects are guaranteed to land undrafted. `finishInauguralDraft`
 * adds them to `freeAgentIds`. They sit in FA all of 2026. Then the 2027
 * offseason's `startNextSeason` (called from the AppShell `startFreeAgency`
 * action) rebuilds `freeAgentIds = filter(!rosterSlot)` and they're still
 * there — Tyler's view.
 *
 * The right fix isn't "make the AI draft every consensus-board prospect"
 * (some always fall out of 60 picks). It's that those undrafted consensus
 * prospects should NOT linger as multi-year FAs — they should either roll
 * into the NEXT year's draft class OR be recycled out of the league. They
 * are not active NBA players with realistic FA contracts. This test asserts
 * the former: any undrafted consensus prospect from year N's draft class
 * must not still be a UFA in year N+1.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertBbgmLeague, type BbgmLeagueFile } from '@/../apps/bs-basketball/src/lib/data/leagueImport';
import { assembleLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, startNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { autoPickUntilUser, getDraft } from '@/../apps/bs-basketball/src/lib/draft/draft';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const FILE = resolve(__dirname, '../../apps/bs-basketball/public/rosters/BBGM_NBA_Roster_2026_Updated.json');

/** Build a league from the import path AND attach the inaugural draft state,
 *  matching the leagueStore import flow. */
function importLeagueWithInauguralDraft(): LeagueState {
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as BbgmLeagueFile;
  const imported = convertBbgmLeague(file);
  const league = assembleLeague({
    teams: imported.teams,
    players: imported.players,
    freeAgentIds: imported.freeAgentIds,
    season: imported.season,
  });

  // Construct an inaugural draft over the imported prospect pool, reverse
  // standings for both rounds (test path doesn't need ESPN order — what we're
  // measuring is "do undrafted prospects leak into FA later").
  const reverseStandings = (league.teams as { id: string }[]).map(t => t.id);
  const picks = [];
  for (let round = 1; round <= 2; round++) {
    for (let i = 0; i < reverseStandings.length; i++) {
      const overall = (round - 1) * reverseStandings.length + i + 1;
      picks.push({
        overall,
        round,
        pickInRound: i + 1,
        originalTeamId: reverseStandings[i] as TeamId,
        teamId: reverseStandings[i] as TeamId,
        isLottery: overall <= 14,
        prospectId: null,
      });
    }
  }
  return {
    ...league,
    currentPhase: 'offseason',
    sportData: {
      ...(league.sportData as object),
      imported: true,
      draft: {
        season: imported.season,
        picks,
        poolIds: [...imported.draftProspectIds],
        currentPick: 0,
        complete: false,
        lotteryRevealed: true,
        scoutsRemaining: 0,
        scoutedIds: [],
        inaugural: true,
      },
    },
  } as LeagueState;
}

function playFullRegularSeason(league: LeagueState): LeagueState {
  let l = league;
  let guard = 0;
  while (!isRegularSeasonComplete(l) && guard < 400) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league;
    guard++;
  }
  return l;
}

function completeSeason(league: LeagueState): LeagueState {
  let l = initializePlayoffs(playFullRegularSeason(league));
  let guard = 0;
  while (!getBracket(l)!.complete && guard < 200) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
    guard++;
  }
  return l;
}

const TYLER_LIST = new Set([
  'Karim Lopez',
  'Labaron Philon',
  'Brayden Burries',
  'Tahaad Pettiford',
  'Jayden Quaintance',
  'Chris Cenac Jr.',
  'Bennett Stirtz',
  'Christian Anderson',
  'Dame Sarr',
]);

describe('BUG-19: imported 2026 prospects do not still be UFAs in the 2027 offseason', () => {
  it('every 2026 import prospect is either rostered, retired, or rolled out — none linger in 2027 FA', () => {
    // Step 1: import the NBA file + attach the inaugural draft.
    let league = importLeagueWithInauguralDraft();

    // Snapshot the imported 2026 prospect class (and which of them are Tyler's
    // named examples) BEFORE the inaugural draft runs.
    const prospects2026 = (getDraft(league)!.poolIds as PlayerId[]).map(
      id => league.players[id] as BasketballPlayer,
    );
    expect(prospects2026.length).toBeGreaterThan(40);
    const tylerProspects = prospects2026.filter(p =>
      TYLER_LIST.has(`${p.firstName} ${p.lastName}`),
    );
    expect(tylerProspects.length).toBe(TYLER_LIST.size);

    // Step 2: run the inaugural draft auto-pick → finishInauguralDraft shape.
    // (Inaugural doesn't go through startNextSeason; undrafted → freeAgentIds.)
    league = autoPickUntilUser(league, null);
    const inauguralDraft = getDraft(league)!;
    expect(inauguralDraft.complete).toBe(true);

    const undraftedAfterInaugural = inauguralDraft.poolIds.filter(
      id => !(league.players[id] as BasketballPlayer).rosterSlot,
    );
    const sd = { ...(league.sportData as Record<string, unknown>) };
    delete sd.draft;
    league = {
      ...league,
      sportData: sd,
      currentPhase: 'preseason',
      freeAgentIds: [...league.freeAgentIds, ...(undraftedAfterInaugural as PlayerId[])],
    } as LeagueState;

    // Step 3: play 2026 season + playoffs.
    league = completeSeason(league);

    // Step 4: enter 2027 offseason + auto-pick the 2027 draft.
    league = enterOffseason(league);
    league = autoPickUntilUser(league, null);

    // Step 5: this is the moment Tyler hits when clicking "Start Free Agency"
    // — AppShell.tsx calls store.startNextSeason() before routing to the FA
    // page. That's where freeAgentIds gets rebuilt from filter(!rosterSlot).
    league = startNextSeason(league);

    // Now check: ANY 2026 prospect sitting in the 2027 freeAgentIds is a leak
    // — by year 2027 they're either an NBA player (rostered with rookie deal)
    // or they're not in the league. They should NOT be wandering UFAs.
    const faSet = new Set<string>(league.freeAgentIds);
    const leaked: { name: string; isTylerNamed: boolean; ovr: number; pot: number; proj: number | undefined; age: number; rosterSlot: boolean; contract: number[] }[] = [];

    for (const original of prospects2026) {
      const after = league.players[original.id] as BasketballPlayer | undefined;
      if (!after) continue; // recycled out of the league — fine
      if (faSet.has(original.id)) {
        leaked.push({
          name: `${original.firstName} ${original.lastName}`,
          isTylerNamed: TYLER_LIST.has(`${original.firstName} ${original.lastName}`),
          ovr: after.ratings.overall,
          pot: after.development.potential,
          proj: original.sportData.draftProjection,
          age: after.age,
          rosterSlot: after.rosterSlot != null,
          contract: (after.contract?.years ?? []).map(y => y.season),
        });
      }
    }

    expect(
      leaked,
      `${leaked.length} prospect(s) from the 2026 import are still in the 2027 FA pool:\n` +
        leaked.slice(0, 30).map(l => {
          const tylerTag = l.isTylerNamed ? ' [TYLER-NAMED]' : '';
          return `  - ${l.name}${tylerTag} (OVR ${l.ovr} / POT ${l.pot}, proj ${l.proj ?? '—'}, age ${l.age}, rosterSlot=${l.rosterSlot}, contract: [${l.contract.join(', ')}])`;
        }).join('\n'),
    ).toEqual([]);
  });
});
