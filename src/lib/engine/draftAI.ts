/**
 * Pure draft AI — no store, no LeagueState.
 *
 * Shared by the in-game draft (store.ts → autoDraftPlayerId) and the
 * standalone /mock-draft tool, so both draft the same way and there is only
 * one place to tune. Everything the scorer needs is passed in; randomness
 * comes from an injectable `rng` (defaults to Math.random) so tests and
 * seeded mocks are reproducible.
 */

import { ROSTER_LIMITS, type Position } from '@/types';

/** The minimum a prospect needs to be scored. */
export interface DraftAIProspect {
  id: string;
  position: Position;
  overall: number;
  potential: number;
  /**
   * Optional talent score that replaces the game's `overall * 15 + potential * 0.5`
   * base. The mock-draft tool passes `value * 15` (FBGM's potential-weighted
   * value) because a pre-draft class is all ~50-56 OVR, where current OVR is
   * noise. The in-game draft leaves this unset, so its behaviour is unchanged.
   */
  boardScore?: number;
}

/** What the picking team already has. */
export interface DraftAITeamContext {
  /** Players currently on the roster at each position. */
  countByPosition: Record<Position, number>;
  /** OVR of the team's best QB (0 if none). */
  bestQbOvr: number;
  /** Team already has a young (≤1 yr exp), high-potential (80+) QB. */
  hasDevQB: boolean;
}

/** Position draft value premium — mirrors real NFL draft tendencies.
 *  QBs, OL, DL, and edge rushers are valued higher; RBs are devalued. */
export const POSITION_DRAFT_VALUE: Record<Position, number> = {
  QB: 35,   // QBs go early — massive positional value
  OL: 20,   // Protect the QB — OL valued in early rounds
  DL: 18,   // Pass rushers are premium picks
  WR: 10,   // WRs go throughout the draft
  LB: 8,    // Linebackers — solid mid-round value
  CB: 5,    // CBs — slightly less premium than pass rush
  TE: 5,    // TEs go mid-rounds unless elite
  S: 0,     // Safeties — least valued in early rounds
  RB: -15,  // RBs devalued — "don't draft a RB in round 1" effect
  K: -50,   // Kickers/punters go very late
  P: -50,
};

/**
 * Chance an AI team follows the round-1 mock/consensus pick instead of its own
 * board. Real NFL mocks are ~50-60% accurate — top picks more predictable.
 * Pick 1 always follows the mock.
 */
export function mockFollowChance(overallPick: number): number {
  if (overallPick === 1) return 1;
  return overallPick <= 3 ? 0.75 : overallPick <= 10 ? 0.60 : overallPick <= 20 ? 0.50 : 0.40;
}

/** Score one prospect for one team. Consumes exactly one rng() call. */
export function scoreProspect(
  prospect: DraftAIProspect,
  team: DraftAITeamContext,
  rng: () => number = Math.random,
): number {
  const limits = ROSTER_LIMITS[prospect.position];
  const count = team.countByPosition[prospect.position] ?? 0;
  const minNeed = Math.max(0, limits.min - count);
  const needScore = minNeed * 12;
  const posValue = POSITION_DRAFT_VALUE[prospect.position] ?? 0;
  const base = prospect.boardScore ?? prospect.overall * 15 + prospect.potential * 0.5;
  let score = base + needScore + posValue;
  score += (rng() - 0.5) * 8;

  // Position max enforcement: heavily penalize positions already at or above max
  if (count >= limits.max) {
    score *= 0.05; // Nearly eliminate chance of drafting surplus positions
  }

  // QB premium: QBs are the most valuable position in football. Teams
  // draft QBs early and often — even with decent starters, they chase
  // upside (see Jets/Patriots/Steelers picking QBs every year).
  // Real NFL teams still draft dev/bridge QBs behind capable starters.
  if (prospect.position === 'QB') {
    const qbOvr = team.bestQbOvr;
    // A young, high-potential QB already on the roster satisfies the
    // future-QB need even while his current OVR is still low. Without this,
    // a freshly drafted dev rookie keeps reading as "terrible QB, must
    // upgrade" and the team stacks a second (then third) QB in the SAME draft.
    if (count >= 2) {
      // QB-saturated: two arms is plenty. No QB bonus; the position-max
      // penalty (count >= max) still guards the hard roster cap.
    } else if (count === 0) {
      score += 250; // No QB on roster — must draft one
    } else if (team.hasDevQB) {
      // Future is covered — only a genuine blue-chip prospect gets a nudge.
      score += prospect.potential >= 90 ? 20 : 0;
    } else if (qbOvr < 60) {
      score += 180; // Terrible veteran QB — strong upgrade motivation
    } else if (qbOvr < 68) {
      score += 130; // Bad QB — still a priority
    } else if (qbOvr < 75) {
      score += 85; // Below average — "bridge QB" territory
    } else if (qbOvr < 78) {
      // Below-average starter — an upgrade is a real priority.
      score += prospect.potential >= 85 ? 55 :
               prospect.potential >= 80 ? 35 :
               prospect.overall > qbOvr ? 20 : 8;
    } else if (qbOvr < 82) {
      // Capable starter (Cam Ward range) — only seek a backup if short one.
      score += prospect.potential >= 88 ? 20 : prospect.potential >= 85 ? 10 : 0;
    } else {
      // Elite QB (82+) — don't chase dev QBs unless truly short-handed.
      score += prospect.potential >= 90 ? 15 : 0;
    }
  }

  if (prospect.position === 'K' || prospect.position === 'P') {
    score = minNeed > 0 ? score * 0.4 : score * 0.15;
  }
  return score;
}

/** Rank prospects for a team, best first. Calls rng() once per prospect, in input order. */
export function rankProspects(
  prospects: DraftAIProspect[],
  team: DraftAITeamContext,
  rng: () => number = Math.random,
): { playerId: string; score: number }[] {
  return prospects
    .map((p) => ({ playerId: p.id, score: scoreProspect(p, team, rng) }))
    .sort((a, b) => b.score - a.score);
}

/** Build the team context from a roster (experience/potential feed the dev-QB check). */
export function teamContextFromRoster(
  roster: { position: Position; overall: number; experience?: number; potential?: number }[],
  positions: Position[],
): DraftAITeamContext {
  const countByPosition = positions.reduce<Record<Position, number>>((acc, pos) => {
    acc[pos] = roster.filter((p) => p.position === pos).length;
    return acc;
  }, {} as Record<Position, number>);
  const bestQbOvr = roster
    .filter((p) => p.position === 'QB')
    .reduce((m, p) => Math.max(m, p.overall), 0);
  const hasDevQB = roster.some(
    (p) => p.position === 'QB' && (p.experience ?? 0) <= 1 && (p.potential ?? 0) >= 80,
  );
  return { countByPosition, bestQbOvr, hasDevQB };
}

/**
 * Pick for an AI team: follow the consensus/mock pick (if one is given and
 * still available) with mockFollowChance, otherwise take the top of its board.
 */
export function chooseDraftPick(args: {
  overallPick: number;
  available: DraftAIProspect[];
  team: DraftAITeamContext;
  /** Consensus/mock player id for this slot, if any (already filtered to available). */
  mockPlayerId?: string;
  rng?: () => number;
}): string | undefined {
  const rng = args.rng ?? Math.random;
  if (args.mockPlayerId) {
    if (args.overallPick === 1 || rng() < mockFollowChance(args.overallPick)) return args.mockPlayerId;
  }
  return rankProspects(args.available, args.team, rng)[0]?.playerId;
}
