/**
 * Draft big board + recap (parity 2.1d).
 *
 * buildBigBoard ranks the current prospect pool for the pre-draft preview
 * (scouted ceiling when known, else the noisy perceived projection). After the
 * draft, buildDraftRecap grades each pick by where the player went vs. his
 * board value — surfacing steals (fell past his value) and reaches. Pure.
 */

import { getDraft } from './draft';
import { perceivedPotential, projectionGrade, isScouted, type ProjectionGrade } from '../scouting';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Ceiling-weighted draft value (mirrors the scouting report's grade input). */
function draftValue(overall: number, ceiling: number): number {
  return ceiling * 0.7 + overall * 0.3;
}

// ---------------------------------------------------------------------------
// Big board (pre-draft)
// ---------------------------------------------------------------------------

export interface BigBoardEntry {
  rank: number;
  player: BasketballPlayer;
  /** Projection grade A–D (scouted truth if scouted, else perceived). */
  grade: ProjectionGrade;
  ceiling: number;
  scouted: boolean;
}

/** The prospect pool ranked best-to-worst. Null if no draft is set up. */
export function buildBigBoard(league: LeagueState): BigBoardEntry[] | null {
  const draft = getDraft(league);
  if (!draft) return null;

  const rows = draft.poolIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p)
    .map(player => {
      const scouted = isScouted(draft, player.id);
      const ceiling = scouted ? player.development.potential : perceivedPotential(player, draft.season);
      return {
        player,
        ceiling,
        scouted,
        grade: projectionGrade(ceiling),
        value: draftValue(player.ratings.overall, ceiling),
      };
    })
    .sort((a, b) => b.value - a.value);

  return rows.map((r, i) => ({ rank: i + 1, player: r.player, grade: r.grade, ceiling: r.ceiling, scouted: r.scouted }));
}

// ---------------------------------------------------------------------------
// Recap (post-draft)
// ---------------------------------------------------------------------------

export interface RecapPick {
  overall: number;
  round: number;
  teamId: string;
  teamLabel: string;
  player: BasketballPlayer;
  /** 1 = best value in the class (by ceiling-weighted draft value). */
  valueRank: number;
  /** overall − valueRank. Positive = fell past his value (steal); negative = reach. */
  delta: number;
  grade: string;
  gradeColor: string;
  isUser: boolean;
}

export interface DraftRecap {
  picks: RecapPick[];
  steals: RecapPick[];
  reaches: RecapPick[];
  userPicks: RecapPick[];
}

function pickGrade(delta: number): { grade: string; color: string } {
  const grade =
    delta >= 12 ? 'A+' : delta >= 7 ? 'A' : delta >= 3 ? 'B+' :
    delta >= -2 ? 'B' : delta >= -6 ? 'C' : delta >= -12 ? 'D' : 'F';
  const color = grade.startsWith('A') ? '#10b981' : grade.startsWith('B') ? '#2563eb' : grade === 'C' ? '#d97706' : '#dc2626';
  return { grade, color };
}

/** Grade every made pick vs. its board value. Null until the draft completes. */
export function buildDraftRecap(league: LeagueState): DraftRecap | null {
  const draft = getDraft(league);
  if (!draft || !draft.complete) return null;

  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id as string, t]));
  const made = draft.picks
    .filter(slot => slot.prospectId)
    .map(slot => {
      const player = league.players[slot.prospectId as PlayerId] as BasketballPlayer | undefined;
      return player ? { slot, player, value: draftValue(player.ratings.overall, player.development.potential) } : null;
    })
    .filter((x): x is { slot: typeof draft.picks[number]; player: BasketballPlayer; value: number } => !!x);

  // Value rank across all made picks (1 = best).
  const byValue = [...made].sort((a, b) => b.value - a.value);
  const valueRankOf = new Map<string, number>();
  byValue.forEach((m, i) => valueRankOf.set(m.player.id, i + 1));

  const picks: RecapPick[] = made.map(({ slot, player }) => {
    const valueRank = valueRankOf.get(player.id)!;
    const delta = slot.overall - valueRank;
    const { grade, color } = pickGrade(delta);
    const team = teamById.get(slot.teamId);
    return {
      overall: slot.overall, round: slot.round, teamId: slot.teamId,
      teamLabel: team ? `${team.city} ${team.name}` : slot.teamId,
      player, valueRank, delta, grade, gradeColor: color,
      isUser: slot.teamId === league.userTeamId,
    };
  });

  return {
    picks,
    steals: picks.filter(p => p.delta >= 6).sort((a, b) => b.delta - a.delta),
    reaches: picks.filter(p => p.delta <= -6).sort((a, b) => a.delta - b.delta),
    userPicks: picks.filter(p => p.isUser),
  };
}
