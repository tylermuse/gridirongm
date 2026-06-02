/**
 * Draft-lottery reveal model.
 *
 * Turns a finished lottery (the first 14 picks of a DraftState) into a
 * broadcast-style reveal: one card per pick, surfaced #14 → #1 so the drama
 * builds toward the top selection. For each team we diff the actual slot against
 * its pre-lottery seed (`draft.lotteryOrder`) to know who jumped the odds and
 * who slid, then voice a war-room reaction off that outcome.
 *
 * Everything here is deterministic — reaction phrasing is hashed off the team id
 * and season, so a given lottery always reads the same across reloads.
 */

import type { TeamId } from '@bs/core/adapter';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { DraftState } from './types';

export type LotteryMovement = 'big_jump' | 'jump' | 'held' | 'slip' | 'big_slip';

export interface LotteryRevealCard {
  /** 1..14 — the pick being revealed. */
  overall: number;
  team: BasketballTeam;
  /** Pick this team was seeded to land on its odds alone (1..14). */
  expectedSlot: number;
  /** expectedSlot − overall. Positive = moved up the board. */
  delta: number;
  movement: LotteryMovement;
  /** True if this is the user-controlled team. */
  isUser: boolean;
  /** Voiced war-room reaction to the result. */
  reaction: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function movementOf(delta: number): LotteryMovement {
  if (delta >= 3) return 'big_jump';
  if (delta >= 1) return 'jump';
  if (delta <= -3) return 'big_slip';
  if (delta <= -1) return 'slip';
  return 'held';
}

// Reaction pools. `{n}` is replaced with the absolute number of spots moved.
// The #1 overall pick gets its own dedicated lines (see reactionFor).
const LEAGUE_REACTIONS: Record<LotteryMovement, string[]> = {
  big_jump: [
    'The war room ERUPTS — they jumped {n} spots and never saw it coming.',
    'Front office in disbelief. A {n}-spot leap rewrites the whole offseason.',
    'Pure pandemonium. The ping-pong balls fell their way by {n}.',
  ],
  jump: [
    'A measured fist-pump in the war room — up {n} and happy to take it.',
    'They climbed {n}, and you can hear the relief from the table.',
    'Nudged up {n} spots. The GM allows himself a small smile.',
  ],
  held: [
    'No movement — they land right where the odds said. Stone faces all around.',
    'Held serve. Exactly the pick they walked in expecting.',
    'Chalk. The board respected the standings and the room shrugs.',
  ],
  slip: [
    'A groan ripples through the war room — slid {n} as a rival jumped them.',
    'Down {n}. The GM rubs his temples and reaches for the backup board.',
    'Slipped {n} spots. Not the night they were hoping for.',
  ],
  big_slip: [
    'Gut punch. They tumbled {n} spots as the lottery broke against them.',
    'The room goes silent — a {n}-pick fall nobody planned for.',
    'Disaster at the table. Down {n} and the whole plan needs a rewrite.',
  ],
};

const USER_REACTIONS: Record<LotteryMovement, string[]> = {
  big_jump: [
    "YOUR table goes wild — you jumped {n} spots. The board just opened up.",
    "You leapt {n} picks up the order. This changes everything for your rebuild.",
  ],
  jump: [
    "You climbed {n} spots — a real win for your war room.",
    "Up {n}. Take it and run; the lottery smiled on you.",
  ],
  held: [
    'You hold right where you were seeded. Steady hands — now go make the pick.',
    'No jump, no slide. Exactly your projected slot. Time to get to work.',
  ],
  slip: [
    'Tough break — you slid {n} spots as a rival jumped you.',
    'You fell {n}. Not ideal, but there is still talent on the board.',
  ],
  big_slip: [
    'Brutal. You tumbled {n} picks. The room is stunned — regroup and adjust.',
    'A {n}-spot fall. The lottery gods were not kind to you tonight.',
  ],
};

const TOP_PICK_LEAGUE = [
  'THE TOP PICK. {city} wins the lottery and the entire class is theirs.',
  'It is {city} at the top — the franchise-altering No. 1 selection.',
];

const TOP_PICK_USER = [
  "YOU'RE ON THE CLOCK AT No. 1. The whole class belongs to you — make it count.",
  'The No. 1 overall pick is YOURS. A franchise cornerstone awaits.',
];

function reactionFor(card: Omit<LotteryRevealCard, 'reaction'>, season: number): string {
  const seed = hash(`${card.team.id}-${season}-${card.overall}`);
  if (card.overall === 1) {
    return card.isUser
      ? pick(TOP_PICK_USER, seed)
      : pick(TOP_PICK_LEAGUE, seed).replace('{city}', `${card.team.city} ${card.team.name}`);
  }
  const pool = (card.isUser ? USER_REACTIONS : LEAGUE_REACTIONS)[card.movement];
  return pick(pool, seed).replace('{n}', String(Math.abs(card.delta)));
}

/**
 * Build the ordered reveal cards (#14 first, #1 last). Returns an empty array if
 * the draft has no lottery seeding (older save) or teams can't be resolved — the
 * caller falls back to the instant board in that case.
 */
export function buildLotteryReveal(
  draft: DraftState,
  teamById: Map<string, BasketballTeam>,
  userTeamId: TeamId | null,
): LotteryRevealCard[] {
  const seedOf = new Map<TeamId, number>();
  (draft.lotteryOrder ?? []).forEach((teamId, i) => seedOf.set(teamId, i + 1));

  const cards: LotteryRevealCard[] = [];
  for (const slot of draft.picks) {
    if (!slot.isLottery) break;
    const team = teamById.get(slot.teamId);
    if (!team) continue;
    const expectedSlot = seedOf.get(slot.teamId) ?? slot.overall;
    const delta = expectedSlot - slot.overall;
    const base = {
      overall: slot.overall,
      team,
      expectedSlot,
      delta,
      movement: movementOf(delta),
      isUser: slot.teamId === userTeamId,
    };
    cards.push({ ...base, reaction: reactionFor(base, draft.season) });
  }

  // Reveal worst-to-best: #14 down to #1.
  return cards.reverse();
}
