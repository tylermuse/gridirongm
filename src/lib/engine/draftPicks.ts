import type { DraftPick, LeagueState, Team } from '@/types';

/** The slice of league state needed to tell whether a pick can still be used. */
export type DraftPickContext = Pick<LeagueState, 'season' | 'phase'> & {
  currentDraftYear?: number;
  draftPickOrder?: string[];
  draftOrder?: string[];
  champions?: { season: number }[];
};

/**
 * True when a pick can no longer be traded or used: its selection has been
 * made, its slot in the running draft has already gone by, or its draft is
 * over. A used pick is normally stamped with `playerId`, but saves from before
 * the stamping fix can hold used picks without one, so the slot and the year
 * are checked as well.
 */
export function isDraftPickSpent(pick: DraftPick, ctx: DraftPickContext): boolean {
  if (pick.playerId) return true;

  if (ctx.phase === 'draft') {
    const draftYear = ctx.currentDraftYear ?? ctx.season;
    if (pick.year !== draftYear) return pick.year < draftYear;
    const order = ctx.draftPickOrder;
    if (!order || order.length === 0) return false;
    const picksMade = order.length - (ctx.draftOrder?.length ?? 0);
    const slot = order.indexOf(pick.id);
    return slot >= 0 && slot < picksMade;
  }

  if (pick.year !== ctx.season) return pick.year < ctx.season;
  // The draft for a season is always held before that season's games. Once
  // the games are underway (or done) the next draft is next year's, so a pick
  // for this season can never be used.
  if (ctx.phase === 'preseason' || ctx.phase === 'regular' || ctx.phase === 'playoffs') return true;
  return (ctx.champions ?? []).some(c => c.season === ctx.season);
}

/**
 * The id of the pick being used by the selection on the clock.
 *
 * `draftPickOrder` lists pick ids slot by slot, so the slot number names the
 * exact pick. Choosing "the first unused pick this team owns in this round"
 * instead stamps the wrong pick when a team holds two in a round, which left
 * the other one looking unused and still tradeable after it had been spent.
 * That choice is kept only as a fallback for drafts with no usable slot list.
 */
export function resolvePickOnClock(
  teams: Team[],
  args: { draftPickOrder?: string[]; slotIndex: number; draftYear: number; teamId: string; round: number },
): string | undefined {
  const { draftPickOrder, slotIndex, draftYear, teamId, round } = args;
  const open: DraftPick[] = [];
  for (const t of teams) {
    for (const pk of t.draftPicks) {
      if (pk.year === draftYear && pk.ownerTeamId === teamId && !pk.playerId) open.push(pk);
    }
  }
  const slotPickId = slotIndex >= 0 ? draftPickOrder?.[slotIndex] : undefined;
  if (slotPickId && open.some(pk => pk.id === slotPickId)) return slotPickId;
  return open.find(pk => pk.round === round)?.id;
}
