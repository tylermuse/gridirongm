/**
 * Draft recap computation — grades, press quotes, highlights.
 */
import type { DraftSelection, Player, Team } from '@/types';
import { ROSTER_LIMITS } from '@/types';
import { pickGrade, gradeValue, teamDraftGrade, expectedOvrForPick } from './draftGrades';

/* ─── Types ─── */

export interface PickRecapEntry {
  overallPick: number;
  round: number;
  pickInRound: number;
  playerId: string;
  teamId: string;
  grade: string;
  /** Actual OVR minus expected OVR for that pick slot */
  valueDelta: number;
}

export interface TeamDraftReport {
  teamId: string;
  grade: string;
  avgValue: number;
  pickCount: number;
  /** Percentage of picks that fill a below-minimum position */
  needFit: number;
  picks: PickRecapEntry[];
}

export interface PressQuote {
  teamId: string;
  playerId: string;
  pickNumber: number;
  quote: string;
}

export interface DraftHighlights {
  biggestSteal: PickRecapEntry | null;
  biggestReach: PickRecapEntry | null;
}

/* ─── Seeded Random (deterministic per-season) ─── */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/* ─── Grade Computation ─── */

function expectedOvr(overallPick: number, totalPicks: number): number {
  return expectedOvrForPick(overallPick, totalPicks);
}

export function computeAllTeamGrades(
  draftResults: DraftSelection[],
  players: Player[],
  teams: Team[],
): TeamDraftReport[] {
  const totalPicks = draftResults.length;
  const playerMap = new Map(players.map(p => [p.id, p]));

  // Count pre-draft roster positions per team (excluding drafted players)
  const draftedIds = new Set(draftResults.map(d => d.playerId));
  const preDraftCounts = new Map<string, Record<string, number>>();
  for (const t of teams) {
    const counts: Record<string, number> = {};
    for (const p of players) {
      if (p.teamId === t.id && !p.retired && !draftedIds.has(p.id)) {
        counts[p.position] = (counts[p.position] ?? 0) + 1;
      }
    }
    preDraftCounts.set(t.id, counts);
  }

  // Group picks by team
  const teamPicks = new Map<string, PickRecapEntry[]>();
  for (const sel of draftResults) {
    const player = playerMap.get(sel.playerId);
    if (!player) continue;
    const grade = pickGrade(sel.overallPick, totalPicks, player.ratings.overall, player.potential);
    const delta = player.ratings.overall - expectedOvr(sel.overallPick, totalPicks);
    const entry: PickRecapEntry = {
      overallPick: sel.overallPick,
      round: sel.round,
      pickInRound: sel.pickInRound,
      playerId: sel.playerId,
      teamId: sel.teamId,
      grade,
      valueDelta: delta,
    };
    if (!teamPicks.has(sel.teamId)) teamPicks.set(sel.teamId, []);
    teamPicks.get(sel.teamId)!.push(entry);
  }

  const reports: TeamDraftReport[] = [];
  for (const t of teams) {
    const picks = teamPicks.get(t.id) ?? [];
    if (picks.length === 0) {
      reports.push({ teamId: t.id, grade: 'N/A', avgValue: 0, pickCount: 0, needFit: 0, picks: [] });
      continue;
    }

    const avgVal = picks.reduce((s, p) => s + gradeValue(p.grade), 0) / picks.length;
    const grade = teamDraftGrade(avgVal);

    // Compute need fit: how many picks filled a position below minimum?
    const preCounts = preDraftCounts.get(t.id) ?? {};
    const addedCounts: Record<string, number> = {};
    let needPicks = 0;
    for (const pk of picks) {
      const player = playerMap.get(pk.playerId);
      if (!player) continue;
      const pos = player.position;
      const preCount = (preCounts[pos] ?? 0) + (addedCounts[pos] ?? 0);
      const minNeeded = ROSTER_LIMITS[pos]?.min ?? 1;
      if (preCount < minNeeded) needPicks++;
      addedCounts[pos] = (addedCounts[pos] ?? 0) + 1;
    }
    const needFit = Math.round((needPicks / picks.length) * 100);

    reports.push({ teamId: t.id, grade, avgValue: avgVal, pickCount: picks.length, needFit, picks });
  }

  // Sort by avgValue descending
  reports.sort((a, b) => b.avgValue - a.avgValue);
  return reports;
}

/* ─── Highlights ─── */

export function findHighlights(allReports: TeamDraftReport[]): DraftHighlights {
  let biggestSteal: PickRecapEntry | null = null;
  let biggestReach: PickRecapEntry | null = null;

  for (const report of allReports) {
    for (const pk of report.picks) {
      if (!biggestSteal || pk.valueDelta > biggestSteal.valueDelta) biggestSteal = pk;
      if (!biggestReach || pk.valueDelta < biggestReach.valueDelta) biggestReach = pk;
    }
  }

  return { biggestSteal, biggestReach };
}

/* ─── Press Quotes ─── */

const QUOTE_TEMPLATES = [
  'This pick at #{pick} reflects the identity we\'re building. {name} from {college} has the {trait} we need.',
  'We had {name} ranked much higher on our board. Getting him at #{pick} was a no-brainer.',
  '{name} from {college} was the best player available. At #{pick}, we couldn\'t pass that up.',
  'The tape on {name} speaks for itself. {trait} — you can\'t teach that.',
  'We did our homework on {name}. {college} produces NFL-ready {pos} players and he\'s no exception.',
  'At #{pick}, {name} gives us exactly what we needed — {trait} at the {pos} position.',
  'Our scouts were unanimous on {name}. The {trait} he showed at {college} translates to this level.',
  '{name} brings {trait} to our roster. He\'s going to compete for snaps from day one.',
  'When {name} was still on the board at #{pick}, our war room erupted. {college} developed him perfectly.',
  'We see {name} as a cornerstone piece. The {trait} he displayed at {college} is rare.',
  'I told our owner — if {name} is there at #{pick}, we\'re taking him. No hesitation.',
  'The versatility {name} showed at {college} is what sold us. A {pos} with {trait} is hard to find.',
  '{name} was our guy all along. We\'re thrilled he fell to #{pick}.',
  'Adding {name} from {college} upgrades our {pos} group immediately. The {trait} is elite.',
  'We didn\'t expect {name} to be available at #{pick}. Credit to {college} for developing his {trait}.',
];

const TRAITS = [
  'footwork and temperament', 'explosiveness and length', 'juice and patience',
  'football IQ and instincts', 'burst off the line', 'route-running savvy',
  'ball skills and awareness', 'physicality and motor', 'coverage ability',
  'hand technique and power', 'lateral quickness', 'vision and processing speed',
  'competitive toughness', 'elite athleticism', 'discipline and technique',
];

export function generatePressQuotes(
  userPicks: PickRecapEntry[],
  players: Player[],
  _teams: Team[],
  season: number,
): PressQuote[] {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const rand = seededRandom(season * 7919 + 31);

  return userPicks.map(pk => {
    const player = playerMap.get(pk.playerId);
    if (!player) return null;

    const template = pick(QUOTE_TEMPLATES, rand);
    const trait = pick(TRAITS, rand);
    const quote = template
      .replace(/\{name\}/g, `${player.firstName} ${player.lastName}`)
      .replace(/\{college\}/g, player.college ?? 'his program')
      .replace(/\{pick\}/g, String(pk.overallPick))
      .replace(/\{pos\}/g, player.position)
      .replace(/\{trait\}/g, trait);

    return { teamId: pk.teamId, playerId: pk.playerId, pickNumber: pk.overallPick, quote };
  }).filter(Boolean) as PressQuote[];
}
