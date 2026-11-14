/**
 * Sort a team that is carrying more than the active-roster limit into the
 * three tiers a real club has in season: the active 53, the practice squad
 * and injured reserve.
 *
 * A regular-season roster file lists everybody under contract with a team
 * (53 + practice squad + IR, 69-87 players), so a league that opens in season
 * landed the user on a 75-man "active" roster and made them cut 22 before the
 * first sim. This settles the team the way the real club already has:
 *
 *   1. players the file tags as on real injured reserve go to IR
 *   2. players the file tags as on the real practice squad go to the PS
 *   3. still over the limit: long-term injured players go to IR
 *   4. still over: the lowest-rated PS-eligible players fill open PS slots
 *   5. still over (only with `release`): the lowest-rated are released
 *
 * Steps 3-5 never take a position below its ROSTER_LIMITS minimum, and stop the
 * moment the active roster is at the limit. Pure: returns the changes for the
 * caller to apply.
 */
import {
  IR_MIN_WEEKS_OUT,
  IR_RETURN_CLOCK_WEEKS,
  POSITIONS,
  PRACTICE_SQUAD_LIMIT,
  ROSTER_LIMITS,
  isPracticeSquadEligible,
  type Player,
  type Position,
  type Team,
} from '@/types';

/** Where the roster file says a player really is, when not on the active roster. */
export type RealRosterStatus = 'ps' | 'ir';

export const ACTIVE_ROSTER_LIMIT = 53;

export interface SettleRosterOptions {
  /** Current league week, for the IR return clock. */
  week: number;
  /** Real status per player id, from the roster file. Untagged = active. */
  realStatus?: Readonly<Record<string, RealRosterStatus | undefined>>;
  /** Release whoever is still over the limit once IR and the PS are used. */
  release?: boolean;
  rosterLimit?: number;
}

export interface SettleRosterResult {
  /** The team with roster / practiceSquad / injuredReserve / depthChart / totalPayroll updated. */
  team: Team;
  /** Player ids moved to injured reserve. */
  toIR: string[];
  /** Player ids moved to the practice squad. */
  toPracticeSquad: string[];
  /** Player ids released to free agency. */
  released: string[];
  /** Field changes to merge into each affected player. */
  playerPatches: Map<string, Partial<Player>>;
}

export function settleRosterTiers(
  team: Team,
  allPlayers: readonly Player[],
  opts: SettleRosterOptions,
): SettleRosterResult {
  const limit = opts.rosterLimit ?? ACTIVE_ROSTER_LIMIT;
  const realStatus = opts.realStatus ?? {};
  const byId = new Map(allPlayers.map(p => [p.id, p]));

  const active = new Set(team.roster.filter(id => {
    const p = byId.get(id);
    return !!p && !p.retired;
  }));
  const ps = [...(team.practiceSquad ?? [])];
  const ir = [...(team.injuredReserve ?? [])];
  const toIR: string[] = [];
  const toPracticeSquad: string[] = [];
  const released: string[] = [];

  const posCount: Record<string, number> = {};
  for (const id of active) {
    const pos = byId.get(id)!.position;
    posCount[pos] = (posCount[pos] ?? 0) + 1;
  }
  const leaveActive = (p: Player) => {
    active.delete(p.id);
    posCount[p.position] = (posCount[p.position] ?? 1) - 1;
  };
  const aboveMinimum = (p: Player) =>
    (posCount[p.position] ?? 0) > (ROSTER_LIMITS[p.position]?.min ?? 1);
  const activePlayers = () => [...active].map(id => byId.get(id)!);
  const lowestRatedFirst = (a: Player, b: Player) =>
    a.ratings.overall - b.ratings.overall || a.id.localeCompare(b.id);

  const moveToIR = (p: Player) => { leaveActive(p); ir.push(p.id); toIR.push(p.id); };
  const moveToPS = (p: Player) => { leaveActive(p); ps.push(p.id); toPracticeSquad.push(p.id); };

  // 1 + 2: mirror the real club. Only when the team is over the limit, so a
  // roster that already fits is left exactly as it is.
  if (active.size > limit) {
    for (const p of activePlayers()) {
      // A real-IR player the file lists as healthy has no clock to sit out.
      if (realStatus[p.id] === 'ir' && p.injury) moveToIR(p);
    }
    for (const p of activePlayers().sort(lowestRatedFirst)) {
      if (ps.length >= PRACTICE_SQUAD_LIMIT) break;
      if (realStatus[p.id] === 'ps') moveToPS(p);
    }
  }

  // 3: long-term injured, longest absence first.
  if (active.size > limit) {
    const longTerm = activePlayers()
      .filter(p => (p.injury?.weeksLeft ?? 0) >= IR_MIN_WEEKS_OUT)
      .sort((a, b) => (b.injury!.weeksLeft - a.injury!.weeksLeft) || lowestRatedFirst(a, b));
    for (const p of longTerm) {
      if (active.size <= limit) break;
      if (aboveMinimum(p)) moveToIR(p);
    }
  }

  // 4: the bottom of the roster fills the open practice-squad slots.
  if (active.size > limit) {
    for (const p of activePlayers().sort(lowestRatedFirst)) {
      if (active.size <= limit || ps.length >= PRACTICE_SQUAD_LIMIT) break;
      if (!aboveMinimum(p)) continue;
      const psPlayers = ps.map(id => byId.get(id)).filter((x): x is Player => !!x);
      if (isPracticeSquadEligible(p, psPlayers).eligible) moveToPS(p);
    }
  }

  // 5: release whoever is left over.
  if (opts.release && active.size > limit) {
    for (const p of activePlayers().sort(lowestRatedFirst)) {
      if (active.size <= limit) break;
      if (!aboveMinimum(p)) continue;
      leaveActive(p);
      released.push(p.id);
    }
  }

  const playerPatches = new Map<string, Partial<Player>>();
  for (const id of toIR) {
    // Real IR stints began before the league did, so the return clock has
    // already run; the injury itself still has to heal before activation.
    const alreadyServed = realStatus[id] === 'ir';
    playerPatches.set(id, {
      onIR: true,
      irPlacedWeek: alreadyServed ? opts.week - IR_RETURN_CLOCK_WEEKS : opts.week,
    });
  }
  for (const id of released) playerPatches.set(id, { teamId: null, onIR: false });

  const gone = new Set([...toIR, ...toPracticeSquad, ...released]);
  if (gone.size === 0) {
    return { team, toIR, toPracticeSquad, released, playerPatches };
  }
  // Same ledger as the manual moves: PS and IR players come off the payroll.
  const salaryOff = [...gone].reduce((sum, id) => sum + (byId.get(id)?.contract.salary ?? 0), 0);
  const depthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
    acc[pos] = (team.depthChart[pos] ?? []).filter(id => !gone.has(id));
    return acc;
  }, {} as Record<Position, string[]>);

  return {
    team: {
      ...team,
      roster: team.roster.filter(id => !gone.has(id)),
      practiceSquad: ps,
      injuredReserve: ir,
      depthChart,
      totalPayroll: Math.max(0, Math.round((team.totalPayroll - salaryOff) * 10) / 10),
    },
    toIR,
    toPracticeSquad,
    released,
    playerPatches,
  };
}

/** "3 to injured reserve, 16 to the practice squad and 2 released" */
export function describeRosterSettle(r: Pick<SettleRosterResult, 'toIR' | 'toPracticeSquad' | 'released'>): string {
  const parts: string[] = [];
  if (r.toIR.length) parts.push(`${r.toIR.length} to injured reserve`);
  if (r.toPracticeSquad.length) parts.push(`${r.toPracticeSquad.length} to the practice squad`);
  if (r.released.length) parts.push(`${r.released.length} released`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
