/**
 * Mock draft — a projection of who goes where for every remaining slot.
 *
 * Source of truth: it replays the remaining picks with `aiChooseProspect`, the
 * exact function the AI uses when it actually drafts (via recommendedProspectId
 * → autoPickCurrent). Each projected pick is removed from the pool and added to
 * the picking team's roster before the next slot is projected, exactly as
 * makeDraftPick does, so with no user interference the mock IS the AI's draft.
 *
 * It diverges from reality only when the inputs change: the user drafts someone
 * else (or anyone, at the user's slot — the mock projects the AI's choice
 * there), a pick is traded (slot owner changes → different roster/need and a
 * different seeded tie-break), or a player is signed/released mid-draft (roster
 * need). Recompute after each pick — it's pure and cheap (~60 × pool scans).
 *
 * Consensus-board leagues (imports stamped with sportData.draftProjection,
 * BUG-19) project the board order automatically: the AI's strict-consensus
 * scoring dominates need/noise, so the mock reads straight down the board.
 */

import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { aiChooseProspect, getDraft, teamRosterPlayers } from './draft';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface MockPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: TeamId;
  /** Projected (or, for slots already made, actual) selection. */
  prospectId: PlayerId;
  /** True when the slot has already been used — the real pick, not a projection. */
  made: boolean;
}

/**
 * Project the draft through `rounds` rounds (default 2 = all 60). Already-made
 * picks are returned as-is (`made: true`); the rest are projected. Null if no
 * draft is set up.
 */
export function buildMockDraft(league: LeagueState, opts: { rounds?: number } = {}): MockPick[] | null {
  const draft = getDraft(league);
  if (!draft) return null;
  const maxRound = opts.rounds ?? 2;

  const pool = draft.poolIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  const rosters = new Map<TeamId, BasketballPlayer[]>();
  const rosterFor = (teamId: TeamId) => {
    let r = rosters.get(teamId);
    if (!r) { r = teamRosterPlayers(league, teamId); rosters.set(teamId, r); }
    return r;
  };

  const out: MockPick[] = [];
  for (let i = 0; i < draft.picks.length; i++) {
    const slot = draft.picks[i];
    if (slot.round > maxRound) break;
    if (i < draft.currentPick || slot.prospectId) {
      if (slot.prospectId) {
        out.push({ overall: slot.overall, round: slot.round, pickInRound: slot.pickInRound, teamId: slot.teamId, prospectId: slot.prospectId, made: true });
      }
      continue;
    }
    const roster = rosterFor(slot.teamId);
    const choice = aiChooseProspect(slot.teamId, roster, pool);
    if (!choice) break;
    const idx = pool.findIndex(p => p.id === choice);
    const [taken] = pool.splice(idx, 1);
    rosters.set(slot.teamId, [...roster, taken]);
    out.push({ overall: slot.overall, round: slot.round, pickInRound: slot.pickInRound, teamId: slot.teamId, prospectId: choice, made: false });
  }
  return out;
}
