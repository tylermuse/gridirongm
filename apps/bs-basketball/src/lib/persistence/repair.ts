/**
 * Save repair — fix rosters that are missing a whole position (Tier: Sim-Day
 * blocker, Fix 4).
 *
 * Earlier builds waived roster overflow by overall rating alone, so low-OVR
 * role players (often the only centers) were shed every offseason. After a few
 * rollovers a team could reach 0 players at a position; the lineup builder then
 * had nothing to slot there and the sim crashed.
 *
 * Fix 1 (position-aware waivers) stops new saves from breaking, and Fix 2
 * (cross-position lineup fallback) stops the crash regardless — but a save that
 * is ALREADY at 0-of-a-position keeps fielding an out-of-position starter
 * forever. This repair restores a real player at each missing position by
 * swapping out the lowest-OVR player from the most-overstocked position (so
 * roster size is preserved), waiving them to free agency. It's idempotent:
 * once every position has ≥1 player it does nothing, so it's safe to run on
 * every load.
 */

import {
  generateBasketballPlayer,
  type BasketballPlayer,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { PlayerId } from '@bs/core/adapter';
import type { BasketballLeagueState } from './db';

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function repairRosterPositions(
  state: BasketballLeagueState,
): { state: BasketballLeagueState; repaired: boolean } {
  let repaired = false;
  const players = { ...(state.players as Record<string, BasketballPlayer>) };
  const newFreeAgents: PlayerId[] = [];

  const teams = state.teams.map(team => {
    let playerIds: PlayerId[] = [...team.playerIds];
    const buckets: Record<string, PlayerId[]> = {};
    for (const [name, ids] of Object.entries(team.rosterBuckets)) buckets[name] = [...ids];

    const countByPos = (): Record<BasketballPosition, number> => {
      const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
      for (const id of playerIds) {
        const p = players[id];
        if (p?.sportData?.position) c[p.sportData.position]++;
      }
      return c;
    };

    for (const missing of POSITIONS) {
      let c = countByPos();
      // A roster of <5 can't be balanced (it can't field a lineup anyway — the
      // sim has its own fallback); only repair real, fillable rosters.
      while (c[missing] < 1 && playerIds.length >= 5) {
        // Donate a slot from the most-overstocked position that still keeps ≥1.
        let donor: BasketballPosition | null = null;
        for (const pos of POSITIONS) {
          if (pos === missing) continue;
          if (c[pos] >= 2 && (donor === null || c[pos] > c[donor])) donor = pos;
        }
        if (!donor) break; // can't preserve size — leave it (Fix 2 keeps it playable)

        const out = playerIds
          .map(id => players[id])
          .filter((p): p is BasketballPlayer => !!p && p.sportData.position === donor)
          .sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
        if (!out) break;

        // Waive the donor player to free agency.
        players[out.id] = { ...out, rosterSlot: null };
        playerIds = playerIds.filter(id => id !== out.id);
        for (const name of Object.keys(buckets)) buckets[name] = buckets[name].filter(id => id !== out.id);
        newFreeAgents.push(out.id);

        // Bring in a replacement at the missing position.
        const filler = generateBasketballPlayer({ position: missing, targetOverall: 62, age: 22 });
        players[filler.id] = filler;
        playerIds.push(filler.id);
        buckets.active = [...(buckets.active ?? []), filler.id];

        repaired = true;
        c = countByPos();
      }
    }

    // Re-index the active bucket so rosterSlot indices stay contiguous.
    (buckets.active ?? []).forEach((id, idx) => {
      const p = players[id];
      if (p) players[id] = { ...p, rosterSlot: { teamId: team.id, bucket: 'active', index: idx } };
    });

    return { ...team, playerIds, rosterBuckets: buckets } as typeof team;
  });

  if (!repaired) return { state, repaired: false };
  return {
    state: { ...state, players, teams, freeAgentIds: [...state.freeAgentIds, ...newFreeAgents] },
    repaired: true,
  };
}
