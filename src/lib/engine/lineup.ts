/**
 * Who starts: the formation slots the roster page's formation card shows, and
 * the per-game depth order every game engine reads.
 *
 * A team's saved depth chart is one flat list per position, and every engine
 * (quick sim, live play-by-play, live coach, 3D lineup) treats the first N of
 * that list as the starters. The roster page, though, splits OL / DL / LB / S
 * into sub-position rows (OT/OG/C, EDGE/DT, OLB/MLB, FS/SS) and its formation
 * card starts the top players of each row: a 4-3 front is LDE, LDT, RDT, RDE =
 * the top two EDGEs and the top two DTs. The flat list is free to interleave
 * those rows however ratings or reorders left it, so a front the page showed
 * as 2 EDGE + 2 DT often played 3 EDGE + 1 DT, the strong safety sat behind
 * two free safeties, and promoting a DT inside the DT row could push the other
 * DT out of the top four. Tyler 11/23: "I have to reset the depth chart
 * because my main starters aren't playing."
 *
 * lineupDepthChart() rebuilds that flat list per game with each formation
 * slot's player first, so the sims field exactly the players the card shows.
 * Order within a sub-position never changes, which is all the page displays,
 * so the saved chart and old saves need no migration.
 */
import { deriveSubPosition } from '@/types';
import type { Player, Position, SubPosition } from '@/types';

export type BaseFormation = '4-3' | '3-4' | 'Nickel';

export interface LineupSlot { label: string; pos: Position; idx: number; subPos?: SubPosition }

/** Offense: the same in every formation. OL slots route by sub-position (LT/RT
 *  from the tackles, LG/RG from the guards, C from the centers) so a 71-OVR
 *  center never shows at LT (bryangrove 6/11). */
export const OFFENSE_SLOTS: LineupSlot[] = [
  { label: 'QB', pos: 'QB', idx: 0 },
  { label: 'RB', pos: 'RB', idx: 0 },
  { label: 'WR1', pos: 'WR', idx: 0 },
  { label: 'WR2', pos: 'WR', idx: 1 },
  { label: 'TE', pos: 'TE', idx: 0 },
  { label: 'LT', pos: 'OL', idx: 0, subPos: 'OT' },
  { label: 'LG', pos: 'OL', idx: 0, subPos: 'OG' },
  { label: 'C',  pos: 'OL', idx: 0, subPos: 'C' },
  { label: 'RG', pos: 'OL', idx: 1, subPos: 'OG' },
  { label: 'RT', pos: 'OL', idx: 1, subPos: 'OT' },
];

/** Defense: formation-specific slots, each with the sub-position it starts. */
export function defenseSlots(formation: BaseFormation | undefined): LineupSlot[] {
  if (formation === '3-4') return [
    { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
    { label: 'NT',  pos: 'DL', idx: 0, subPos: 'DT' },
    { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
    { label: 'LOLB', pos: 'LB', idx: 0, subPos: 'OLB' },
    { label: 'LILB', pos: 'LB', idx: 0, subPos: 'MLB' },
    { label: 'RILB', pos: 'LB', idx: 1, subPos: 'MLB' },
    { label: 'ROLB', pos: 'LB', idx: 1, subPos: 'OLB' },
    { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
    { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
    { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
    { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
  ];
  if (formation === 'Nickel') return [
    { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
    { label: 'LDT', pos: 'DL', idx: 0, subPos: 'DT' },
    { label: 'RDT', pos: 'DL', idx: 1, subPos: 'DT' },
    { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
    { label: 'WLB', pos: 'LB', idx: 0, subPos: 'OLB' },
    { label: 'MLB', pos: 'LB', idx: 0, subPos: 'MLB' },
    { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
    { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
    { label: 'NCB', pos: 'CB', idx: 2, subPos: 'CB' },
    { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
    { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
  ];
  return [ // 4-3, the default
    { label: 'LDE', pos: 'DL', idx: 0, subPos: 'EDGE' },
    { label: 'LDT', pos: 'DL', idx: 0, subPos: 'DT' },
    { label: 'RDT', pos: 'DL', idx: 1, subPos: 'DT' },
    { label: 'RDE', pos: 'DL', idx: 1, subPos: 'EDGE' },
    { label: 'WLB', pos: 'LB', idx: 0, subPos: 'OLB' },
    { label: 'MLB', pos: 'LB', idx: 0, subPos: 'MLB' },
    { label: 'SLB', pos: 'LB', idx: 1, subPos: 'OLB' },
    { label: 'LCB', pos: 'CB', idx: 0, subPos: 'CB' },
    { label: 'RCB', pos: 'CB', idx: 1, subPos: 'CB' },
    { label: 'FS',  pos: 'S',  idx: 0, subPos: 'FS' },
    { label: 'SS',  pos: 'S',  idx: 0, subPos: 'SS' },
  ];
}

/** Positions the roster page splits into sub-position rows. Every other
 *  position is one row in saved order, which the engines already read as is. */
const SPLIT_POSITIONS: Position[] = ['OL', 'DL', 'LB', 'S'];

type LineupPlayer = Pick<Player, 'id' | 'position' | 'subPosition' | 'ratings'>;

/** The sub-position a player's depth row shows (stored, else derived from ratings). */
export function lineupSubPosition(p: LineupPlayer): SubPosition {
  return p.subPosition ?? deriveSubPosition(p);
}

/** Fill formation slots from one position's depth order. A slot takes the
 *  idx-th player of its sub-position; a slot the roster can't fill at that
 *  sub-position (a team with one DT in a 4-3) takes the next player in depth
 *  order who isn't already starting. Entries are undefined only when the
 *  position runs out of players. */
export function fillSlots<P extends LineupPlayer>(group: P[], slots: LineupSlot[]): (P | undefined)[] {
  const filled = slots.map(s => (s.subPos ? group.filter(p => lineupSubPosition(p) === s.subPos) : group)[s.idx]);
  const used = new Set(filled.filter((p): p is P => !!p).map(p => p.id));
  const spare = group.filter(p => !used.has(p.id));
  return filled.map(p => p ?? spare.shift());
}

/** One position's depth order with its formation starters first, in slot
 *  order (LDE, LDT, RDT, RDE), then everyone else in saved order. */
export function startersFirst<P extends LineupPlayer>(group: P[], slots: LineupSlot[]): P[] {
  const starters = fillSlots(group, slots).filter((p): p is P => !!p);
  const ids = new Set(starters.map(p => p.id));
  return [...starters, ...group.filter(p => !ids.has(p.id))];
}

type LineupRosterPlayer = LineupPlayer & Pick<Player, 'teamId' | 'injury' | 'playingThroughInjury' | 'onIR' | 'retired'>;

/** Can this man take the field this week (same rule as simulate.ts playerAvailable)? */
function canPlay(p: LineupRosterPlayer): boolean {
  return !p.onIR && !p.retired && (!p.injury || p.injury.weeksLeft <= 0 || !!p.playingThroughInjury);
}

/**
 * The depth chart to field for one game. For OL / DL / LB / S the players who
 * can play are lined up starters-first by the team's formation; injured, IR
 * and practice-squad players go to the back, so an injured EDGE is replaced
 * by the next EDGE rather than by whoever sits next in the flat list. Active
 * players missing from the saved chart (a fresh signing) join after the saved
 * ones, as the roster page lists them. Other positions are returned as saved.
 *
 * `roster` may hold anyone; only the team's own players are lined up.
 */
export function lineupDepthChart(
  team: { id: string; depthChart: Record<Position, string[]>; baseFormation?: BaseFormation; practiceSquad?: string[] },
  roster: LineupRosterPlayer[],
): Record<Position, string[]> {
  const ps = new Set(team.practiceSquad ?? []);
  const slots = [...OFFENSE_SLOTS, ...defenseSlots(team.baseFormation)];
  const out = { ...team.depthChart };
  for (const pos of SPLIT_POSITIONS) {
    const saved = team.depthChart[pos] ?? [];
    const mine = roster.filter(p => p.teamId === team.id && p.position === pos);
    const byId = new Map(mine.map(p => [p.id, p]));
    const inSaved = new Set(saved);
    const ordered = [
      ...saved.map(id => byId.get(id)).filter((p): p is LineupRosterPlayer => !!p),
      ...mine.filter(p => !inSaved.has(p.id)),
    ];
    const ready = ordered.filter(p => canPlay(p) && !ps.has(p.id));
    const readyIds = new Set(ready.map(p => p.id));
    const lined = startersFirst(ready, slots.filter(s => s.pos === pos)).map(p => p.id);
    // Keep every saved id (the engines skip the ones who can't play) so the
    // list never loses anyone the saved chart had.
    out[pos] = [...lined, ...saved.filter(id => !readyIds.has(id))];
  }
  return out;
}
