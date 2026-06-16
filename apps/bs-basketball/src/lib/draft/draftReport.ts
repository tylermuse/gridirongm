/**
 * Post-draft team report (No-Ceilings-style "Draft Report").
 *
 * buildUserDraftReport turns the completed draft into a magazine-style recap of
 * the USER's haul: every selection with derived skill badges, a scouting blurb,
 * its board rank and per-pick grade; a Trade Activity panel reconstructed from
 * the draft's logged swaps; an overall grade; narrative analysis sections
 * (headline pick, supporting cast, trade recap, draft philosophy, what-ifs,
 * verdict); and the team's projected new starting five. Pure — derives
 * everything from league state, generates no side effects.
 */

import { getDraft } from './draft';
import { buildDraftRecap, type RecapPick } from './recap';
import { resolveLineup } from '../lineup/lineup';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type {
  BasketballPlayer,
  BasketballPosition,
  BasketballRatings,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BadgeTone = 'offense' | 'defense' | 'physical' | 'playmaking' | 'upside';

export interface SkillBadge {
  label: string;
  tone: BadgeTone;
}

export interface ReportPick {
  overall: number;
  round: number;
  player: BasketballPlayer;
  position: BasketballPosition;
  /** Consensus board rank if known, else the prospect's value rank in the class. */
  boardRank: number;
  /** overall − boardRank. Positive = fell past his board slot (steal). */
  steal: number;
  grade: string;
  gradeColor: string;
  badges: SkillBadge[];
  blurb: string;
}

export interface DraftTradeView {
  index: number;
  partnerLabel: string;
  sent: string[];
  received: string[];
}

export interface ReportSection {
  heading: string;
  body: string;
}

export interface StartingFiveSlot {
  position: BasketballPosition;
  player: BasketballPlayer;
  isRookie: boolean;
}

export interface UserDraftReport {
  teamLabel: string;
  teamAbbrev: string;
  primaryColor: string;
  secondaryColor: string;
  overallGrade: string;
  overallGradeColor: string;
  picks: ReportPick[];
  trades: DraftTradeView[];
  sections: ReportSection[];
  startingFive: StartingFiveSlot[];
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

function gradeFromDelta(delta: number): { grade: string; color: string } {
  const grade =
    delta >= 12 ? 'A+' : delta >= 7 ? 'A' : delta >= 3 ? 'B+' :
    delta >= -2 ? 'B' : delta >= -6 ? 'C' : delta >= -12 ? 'D' : 'F';
  const color = grade.startsWith('A') ? '#10b981' : grade.startsWith('B') ? '#2563eb' : grade === 'C' ? '#d97706' : '#dc2626';
  return { grade, color };
}

/** The board rank we show/reason about: real consensus rank when imported, else
 *  the prospect's value rank within the drafted class (from buildDraftRecap). */
function boardRankOf(pick: RecapPick): number {
  return pick.player.sportData.draftProjection ?? pick.valueRank;
}

// ---------------------------------------------------------------------------
// Skill badges (derived from ratings — the game has no explicit badge system)
// ---------------------------------------------------------------------------

interface BadgeRule {
  label: string;
  tone: BadgeTone;
  /** Returns a "strength" >= 0 when the badge applies (higher = more distinctive),
   *  or a negative number when it doesn't. */
  score: (r: BasketballRatings, potential: number) => number;
}

const BADGE_RULES: BadgeRule[] = [
  { label: 'DEADEYE', tone: 'offense', score: r => r.threePoint - 78 },
  { label: 'SHOT CREATOR', tone: 'offense', score: r => Math.min(r.handles - 80, r.midRange - 74) },
  { label: 'MICROWAVE', tone: 'offense', score: r => Math.min(r.midRange - 80, r.threePoint - 72) },
  { label: 'SLASHER', tone: 'offense', score: r => Math.min(r.finishing - 80, r.speed - 74) },
  { label: 'BULLY BALL', tone: 'offense', score: r => Math.min(r.postScoring - 78, r.strength - 74) },
  { label: 'CHANGE OF GEARS', tone: 'physical', score: r => Math.min(r.speed - 82, r.handles - 74) },
  { label: 'QUICKNESS', tone: 'physical', score: r => r.speed - 84 },
  { label: 'LOB THREAT', tone: 'physical', score: r => Math.min(r.vertical - 82, r.finishing - 76) },
  { label: 'REBOUNDING', tone: 'physical', score: r => r.rebounding - 80 },
  { label: 'STRONG FRAME', tone: 'physical', score: r => r.strength - 84 },
  { label: 'FLOOR GENERAL', tone: 'playmaking', score: r => Math.min(r.passing - 80, r.basketballIQ - 74) },
  { label: 'HIGH FEEL', tone: 'playmaking', score: r => r.basketballIQ - 84 },
  { label: 'RELENTLESS MOTOR', tone: 'playmaking', score: r => r.intangibles - 82 },
  { label: 'RIM PROTECTOR', tone: 'defense', score: r => Math.min(r.block - 78, r.interiorDefense - 74) },
  { label: 'POINT OF ATTACK', tone: 'defense', score: r => Math.min(r.perimeterDefense - 80, r.steal - 72) },
  { label: 'PICKPOCKET', tone: 'defense', score: r => r.steal - 82 },
  { label: 'STOPPER', tone: 'defense', score: r => r.perimeterDefense - 84 },
  { label: 'UPSIDE GALORE', tone: 'upside', score: (r, p) => (p - r.overall) - 13 },
  { label: 'PREPARE FOR LIFTOFF', tone: 'upside', score: (_r, p) => p - 88 },
];

/** Up to 3 most-distinctive badges, dedup'd by tone so one skill area doesn't
 *  hog all the slots. */
function deriveBadges(player: BasketballPlayer): SkillBadge[] {
  const r = player.ratings;
  const potential = player.development.potential;
  const hits = BADGE_RULES
    .map(rule => ({ rule, strength: rule.score(r, potential) }))
    .filter(h => h.strength >= 0)
    .sort((a, b) => b.strength - a.strength);

  const out: SkillBadge[] = [];
  const usedTones = new Set<BadgeTone>();
  for (const h of hits) {
    if (out.length >= 3) break;
    if (usedTones.has(h.rule.tone) && out.length >= 2) continue;
    usedTones.add(h.rule.tone);
    out.push({ label: h.rule.label, tone: h.rule.tone });
  }
  // Always give a flagship pick at least one badge so the card never looks bare.
  if (out.length === 0) {
    out.push(potential - r.overall >= 8 ? { label: 'UPSIDE GALORE', tone: 'upside' } : { label: 'PRO READY', tone: 'playmaking' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scouting blurb (template prose from the player's profile)
// ---------------------------------------------------------------------------

function heightLabel(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  return `${ft}'${inch}"`;
}

const POSITION_NOUN: Record<BasketballPosition, string> = {
  PG: 'lead guard',
  SG: 'wing scorer',
  SF: 'two-way wing',
  PF: 'forward',
  C: 'big',
};

function topSkillPhrase(player: BasketballPlayer): string {
  const r = player.ratings;
  const candidates: Array<{ v: number; phrase: string }> = [
    { v: r.threePoint, phrase: 'a knockdown outside stroke' },
    { v: r.handles, phrase: 'advanced ball-handling' },
    { v: r.passing, phrase: 'real playmaking feel' },
    { v: r.finishing, phrase: 'explosive finishing at the rim' },
    { v: r.postScoring, phrase: 'a polished post game' },
    { v: r.midRange, phrase: 'a reliable pull-up' },
    { v: r.perimeterDefense, phrase: 'point-of-attack defense' },
    { v: r.block, phrase: 'rim-protecting instincts' },
    { v: r.rebounding, phrase: 'a nose for the glass' },
    { v: r.speed, phrase: 'open-floor burst' },
  ];
  const top = candidates.sort((a, b) => b.v - a.v).slice(0, 2);
  return top.map(t => t.phrase).join(' and ');
}

function buildBlurb(pick: ReportPick): string {
  const p = pick.player;
  const noun = POSITION_NOUN[pick.position];
  const ceiling = p.development.potential;
  const ceilingClause =
    ceiling - p.ratings.overall >= 14 ? 'The ceiling here is sky-high if the development clicks.' :
    ceiling >= 85 ? 'There is genuine All-Star upside in the projection.' :
    ceiling - p.ratings.overall >= 7 ? 'There is room to grow into a quality starter.' :
    'A polished, ready-to-contribute profile.';
  const valueClause =
    pick.steal >= 7 ? `Landing him at #${pick.overall} when the board had him ${pick.boardRank}th is outright larceny.` :
    pick.steal >= 3 ? `Nice value to grab him at #${pick.overall}.` :
    pick.steal <= -7 ? `A clear reach at #${pick.overall} — the board didn't love him here.` :
    `A sensible value at #${pick.overall}.`;
  return `A ${heightLabel(p.ratings.height)} ${noun} who brings ${topSkillPhrase(p)}. ${ceilingClause} ${valueClause}`;
}

// ---------------------------------------------------------------------------
// Narrative sections
// ---------------------------------------------------------------------------

function fullName(p: BasketballPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

function buildSections(
  picks: ReportPick[],
  trades: DraftTradeView[],
  whatIfs: Array<{ name: string; boardRank: number; overall: number }>,
  overallGrade: string,
): ReportSection[] {
  const sections: ReportSection[] = [];
  if (picks.length === 0) return sections;

  const byGrade = [...picks].sort((a, b) => b.steal - a.steal);
  const headline = byGrade[0];

  // The headline pick.
  const needOrValue = headline.steal >= 3 ? 'a best-player-available steal, pure and simple' : 'the talent this front office had circled';
  sections.push({
    heading: 'THE HEADLINE PICK',
    body: `${fullName(headline.player)} at #${headline.overall} is ${needOrValue}. Ranked ${headline.boardRank}th on the board, ` +
      `you're not passing on that kind of value just because of positional fit — talent wins. ${buildBlurb(headline)}`,
  });

  // Supporting cast — the rest of the haul.
  const rest = byGrade.slice(1);
  if (rest.length > 0) {
    const namedSteals = rest.filter(p => p.steal >= 3).slice(0, 2);
    const lead = namedSteals.length > 0
      ? `The supporting picks are where this draft really shines. ${namedSteals.map(p => `${fullName(p.player)} (#${p.overall}, ranked ${p.boardRank}th)`).join(' and ')} — that's the kind of surplus value that turns a good draft into a great one.`
      : `Beyond the headliner, ${rest.map(p => `${fullName(p.player)} (#${p.overall})`).slice(0, 3).join(', ')} round out the class with rotation upside.`;
    sections.push({ heading: 'THE SUPPORTING CAST', body: lead });
  }

  // Trade recap.
  if (trades.length > 0) {
    const moves = trades.map(t => {
      const got = [...t.received];
      return `the move to acquire ${got.slice(0, 3).join(', ')} from the ${t.partnerLabel}`;
    });
    sections.push({
      heading: 'TRADE RECAP',
      body: `Smart maneuvering on the clock. ${capitalize(moves.join('; '))}. Not a blockbuster, but a sharp front office knows when to consolidate value and when to add bites at the apple.`,
    });
  }

  // Draft philosophy — how disciplined was the board-following?
  const bpaCount = picks.filter(p => p.steal >= -2).length;
  const philosophy = bpaCount >= Math.ceil(picks.length / 2)
    ? `This was a best-player-available draft through and through. ${bpaCount} of ${picks.length} picks took close to the highest-ranked player on the board regardless of position. That's the kind of discipline that builds long-term rosters, even if it doesn't fill every hole today.`
    : `This was a needs-first draft. The front office leaned into fit over board rank on several picks — a win-now bet that the roster fit pays off faster than raw talent would.`;
  sections.push({ heading: 'DRAFT PHILOSOPHY', body: philosophy });

  // The what-ifs.
  if (whatIfs.length > 0) {
    const names = whatIfs.map(w => `${w.name} (#${w.boardRank} on the board, went #${w.overall})`);
    sections.push({
      heading: 'THE WHAT-IFS',
      body: `Names to monitor: ${names.join(' and ')} were still available when this front office was on the clock. The alternate timeline exists — the question is whether this one turns out better.`,
    });
  }

  // The verdict.
  const verdict = overallGrade.startsWith('A')
    ? 'If these players develop anywhere near their ceiling, this is a franchise-altering draft night.'
    : overallGrade.startsWith('B')
      ? 'A solid, disciplined night that adds real depth — not flashy, but the kind of draft good teams string together.'
      : 'An uneven night. The talent is there in spots, but this class will have to outperform its billing to be remembered fondly.';
  sections.push({ heading: 'THE VERDICT', body: verdict });

  return sections;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

const SLOT_POSITIONS: readonly BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** The user's full draft report, or null until the draft completes / when
 *  spectating. */
export function buildUserDraftReport(league: LeagueState): UserDraftReport | null {
  const draft = getDraft(league);
  if (!draft || !draft.complete) return null;
  const userTeamId = league.userTeamId;
  if (!userTeamId) return null;

  const recap = buildDraftRecap(league);
  if (!recap) return null;

  const team = (league.teams as BasketballTeam[]).find(t => t.id === userTeamId);
  if (!team) return null;

  // Selections.
  const picks: ReportPick[] = recap.userPicks
    .slice()
    .sort((a, b) => a.overall - b.overall)
    .map(rp => {
      const player = rp.player;
      // One board metric (consensus rank when known, else value rank) drives the
      // board rank, the steal magnitude, the grade, and the blurb — so the card
      // never reads "A+" next to "a sensible value."
      const boardRank = boardRankOf(rp);
      const steal = rp.overall - boardRank;
      const { grade, color } = gradeFromDelta(steal);
      const base: ReportPick = {
        overall: rp.overall,
        round: rp.round,
        player,
        position: player.sportData.position,
        boardRank,
        steal,
        grade,
        gradeColor: color,
        badges: deriveBadges(player),
        blurb: '',
      };
      return { ...base, blurb: buildBlurb(base) };
    });

  // Overall grade — average of the per-pick steal deltas.
  const avgSteal = picks.length > 0 ? picks.reduce((s, p) => s + p.steal, 0) / picks.length : 0;
  const { grade: overallGrade, color: overallGradeColor } = gradeFromDelta(avgSteal);

  // Trade activity — from the logged swaps.
  const trades: DraftTradeView[] = (draft.trades ?? []).map((t, i) => ({
    index: i + 1,
    partnerLabel: t.partnerLabel,
    sent: [...t.sentPicks.map(n => `Pick #${n}`), ...t.sentPlayers],
    received: [...t.receivedPicks.map(n => `Pick #${n}`), ...t.receivedPlayers],
  }));

  // What-ifs — best-by-board players still on the board when the user picked,
  // taken later by someone else.
  const earliestUserPick = Math.min(...picks.map(p => p.overall));
  const userPlayerIds = new Set(picks.map(p => p.player.id));
  const whatIfs = recap.picks
    .filter(p => !userPlayerIds.has(p.player.id) && p.overall > earliestUserPick)
    .map(p => ({ name: fullName(p.player), boardRank: boardRankOf(p), overall: p.overall }))
    .filter(w => w.boardRank < earliestUserPick) // would've been a board-rank upgrade
    .sort((a, b) => a.boardRank - b.boardRank)
    .slice(0, 2);

  const sections = buildSections(picks, trades, whatIfs, overallGrade);

  // Projected new starting five.
  const roster = (team.playerIds as PlayerId[])
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  const lineup = resolveLineup(team, roster);
  const startingFive: StartingFiveSlot[] = lineup.starters
    .map((id, i) => {
      const player = league.players[id as PlayerId] as BasketballPlayer | undefined;
      if (!player) return null;
      return {
        position: SLOT_POSITIONS[i],
        player,
        isRookie: player.sportData.draftYear === draft.season,
      };
    })
    .filter((s): s is StartingFiveSlot => !!s);

  return {
    teamLabel: `${team.city} ${team.name}`,
    teamAbbrev: team.abbreviation,
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    overallGrade,
    overallGradeColor,
    picks,
    trades,
    sections,
    startingFive,
  };
}
