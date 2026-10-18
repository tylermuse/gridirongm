/**
 * League expansion (30 → 31 → 32 teams): create franchises, realign, protect,
 * run the expansion draft, fill rosters. Pure functions over league state; the
 * store wraps each in a thin action.
 *
 * WINDOW — the offseason AFTER the draft completes and BEFORE the next season
 * starts (`startNextSeason`). That's the cleanest seam: this year's draft order
 * is already settled (so no lottery re-seeding), this year's draftees are on
 * their teams (and exempt), and the rollover that follows regenerates the
 * schedule, standings and next year's draft for the new team count. One
 * expansion per offseason; max 32 teams.
 *
 * RULES (NBA 2004 Bobcats-style):
 *   - Every existing team protects up to 8 players. AI teams protect their top 8
 *     by trade value (OVR / age / potential / contract — basketballTradeValue);
 *     the user picks theirs in the UI.
 *   - Exempt (can't be taken, don't use a protection slot): players drafted in
 *     this year's draft, and anyone without a contract for the upcoming season
 *     (they're headed to free agency).
 *   - Each expansion team makes PICKS_PER_EXPANSION_TEAM selections (snake order
 *     when there are two), and an existing team can lose at most ONE player in
 *     the whole expansion draft.
 *   - Contracts carry over. Expansion teams start at $0 payroll (full cap room)
 *     and are hard-capped at the first apron during the draft — a selection that
 *     would push payroll past it is illegal.
 *   - Afterwards each expansion team is filled to the 13-man legal minimum from
 *     the free-agent pool (generated depth if the pool runs dry).
 *
 * Future draft picks need no materialization: pick ownership is a delta
 * registry keyed by original team (lib/trade/picks), so a new team owns its own
 * R1/R2 picks for every future draft from creation. It has no slot in the
 * already-completed current draft (getTeamPicks filters that).
 */

import { v4 as uuid } from 'uuid';
import {
  basketballTradeValue,
  basketballTeamPayroll,
  basketballFirstApron,
  generateBasketballPlayer,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { BasketballConference, BasketballDivision } from '../data/teams';
import { makeBasketballTeam } from '../league/createLeague';
import { generateHeadCoach } from '../coaching/coaches';
import { ensureCoachingStaff } from '../coaching/carousel';
import { marketContract, hasContractForSeason } from '../league/contracts';
import { getDraft } from '../draft';
import { appendTransaction } from '../transactions';
import { clearGmFired } from '../approval';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const MAX_LEAGUE_TEAMS = 32;
export const PROTECTED_PER_TEAM = 8;
export const PICKS_PER_EXPANSION_TEAM = 14;
export const MIN_LEGAL_ROSTER = 13;

export const CONFERENCE_DIVISIONS: Record<BasketballConference, BasketballDivision[]> = {
  Eastern: ['Atlantic', 'Central', 'Southeast'],
  Western: ['Northwest', 'Pacific', 'Southwest'],
};

// ===========================================================================
// Types
// ===========================================================================

export interface ExpansionTeamConfig {
  city: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  conference: BasketballConference;
  division: BasketballDivision;
}

export interface Placement {
  conference: BasketballConference;
  division: BasketballDivision;
}

export interface RealignmentMove {
  teamId: TeamId;
  label: string;
  from: Placement;
  to: Placement;
}

export interface RealignmentPlan {
  /** Final placement of each new team (index-aligned with the configs). */
  newTeams: Placement[];
  /** Existing teams that change conference/division. */
  moves: RealignmentMove[];
  /** Conference sizes after the plan. */
  sizes: Record<BasketballConference, number>;
  /** Division sizes after the plan. */
  divisionSizes: Record<BasketballDivision, number>;
}

export interface ExpansionPickRecord {
  overall: number;
  expansionTeamId: TeamId;
  fromTeamId: TeamId | null;
  playerId: PlayerId | null;
}

export interface ExpansionState {
  /** Season the expansion teams debut (the upcoming season). */
  season: number;
  stage: 'protect' | 'draft' | 'done';
  newTeamIds: TeamId[];
  existingTeamIds: TeamId[];
  /** Protected player ids per existing team. */
  protected: Record<string, PlayerId[]>;
  /** True while the user (running an existing team) still has to submit their list. */
  userProtectionPending: boolean;
  /** True when the user took over an expansion team. */
  userTookOver: boolean;
  /** Expansion team on the clock for each pick, in order. */
  order: TeamId[];
  picks: ExpansionPickRecord[];
  currentPick: number;
}

interface LeagueSportData {
  expansion?: ExpansionState;
  /** Seasons (debut year) in which the league expanded, with the new team ids. */
  expansionHistory?: { season: number; teamIds: TeamId[] }[];
  tradeBlockIds?: string[];
  seasonStarted?: boolean;
  postDraftImport?: boolean;
  [key: string]: unknown;
}

const sd = (league: LeagueState): LeagueSportData => (league.sportData ?? {}) as LeagueSportData;

export function getExpansion(league: LeagueState): ExpansionState | null {
  return sd(league).expansion ?? null;
}

const confOf = (t: BasketballTeam) => (t.sportData as { conference: BasketballConference }).conference;
const divOf = (t: BasketballTeam) => (t.sportData as { division: BasketballDivision }).division;
const teamLabel = (t: BasketballTeam) => `${t.city} ${t.name}`;

// ===========================================================================
// Window
// ===========================================================================

export interface ExpansionWindow {
  open: boolean;
  /** Why it's closed (or a hint when open). */
  reason: string;
  /** Max new teams allowed right now (0-2). */
  maxNewTeams: number;
}

/** Whether a new expansion can START now. An expansion already in progress is
 *  reported by getExpansion(), not here. */
export function expansionWindow(league: LeagueState): ExpansionWindow {
  const closed = (reason: string): ExpansionWindow => ({ open: false, reason, maxNewTeams: 0 });
  const data = sd(league);
  const room = MAX_LEAGUE_TEAMS - league.teams.length;
  if (room <= 0) return closed(`The league is already at the ${MAX_LEAGUE_TEAMS}-team maximum.`);
  const exp = data.expansion;
  if (exp && exp.stage !== 'done') return closed('An expansion is already in progress.');
  if (league.currentPhase !== 'offseason') return closed('Expansion opens in the offseason, after the draft.');
  const draft = getDraft(league);
  if (!draft || draft.inaugural || data.postDraftImport) return closed('Expansion opens after a regular offseason draft.');
  if (!draft.complete) return closed('Finish this year\'s draft first — expansion happens between the draft and the new season.');
  if (data.seasonStarted) return closed('The new season has already started.');
  if ((data.expansionHistory ?? []).some(h => h.season === draft.season)) {
    return closed('The league already expanded this offseason.');
  }
  return { open: true, reason: `Add up to ${Math.min(2, room)} team${Math.min(2, room) === 1 ? '' : 's'} before the ${draft.season} season.`, maxNewTeams: Math.min(2, room) };
}

// ===========================================================================
// Realignment
// ===========================================================================

interface Slot {
  key: string;
  teamId: TeamId | null; // null → new team
  label: string;
  conference: BasketballConference;
  division: BasketballDivision;
  original: Placement | null;
}

/**
 * Propose a realignment that keeps the league schedulable: conferences of 15/16
 * (16/16 at 32), each with divisions of 5/5/5 or 6/5/5. New teams go where the
 * user asked; if that unbalances things, the fewest existing teams are moved
 * (largest division of the bigger conference → smallest division of the
 * smaller; then within a conference, largest division → smallest). Pure.
 */
export function proposeRealignment(league: LeagueState, configs: ExpansionTeamConfig[]): RealignmentPlan {
  const teams = league.teams as BasketballTeam[];
  const slots: Slot[] = [
    ...teams
      .slice()
      .sort((a, b) => a.city.localeCompare(b.city))
      .map(t => ({ key: t.id, teamId: t.id, label: teamLabel(t), conference: confOf(t), division: divOf(t), original: { conference: confOf(t), division: divOf(t) } })),
    ...configs.map((c, i) => {
      const conference = c.conference;
      const division = CONFERENCE_DIVISIONS[conference].includes(c.division) ? c.division : CONFERENCE_DIVISIONS[conference][0];
      return { key: `new-${i}`, teamId: null, label: `${c.city} ${c.name}`, conference, division, original: null };
    }),
  ];

  const inConf = (c: BasketballConference) => slots.filter(s => s.conference === c);
  const inDiv = (d: BasketballDivision) => slots.filter(s => s.division === d);
  const divsBySize = (c: BasketballConference) =>
    CONFERENCE_DIVISIONS[c].slice().sort((a, b) => inDiv(a).length - inDiv(b).length);
  // Prefer moving an existing team (keep the new franchise where it was asked).
  const mover = (d: BasketballDivision): Slot => {
    const members = inDiv(d);
    return members.filter(s => s.teamId).at(-1) ?? members.at(-1)!;
  };

  for (let guard = 0; guard < 8; guard++) {
    const e = inConf('Eastern').length;
    const w = inConf('Western').length;
    if (Math.abs(e - w) <= 1) break;
    const from: BasketballConference = e > w ? 'Eastern' : 'Western';
    const to: BasketballConference = from === 'Eastern' ? 'Western' : 'Eastern';
    const s = mover(divsBySize(from).at(-1)!);
    s.conference = to;
    s.division = divsBySize(to)[0];
  }
  for (const c of ['Eastern', 'Western'] as const) {
    for (let guard = 0; guard < 8; guard++) {
      const order = divsBySize(c);
      const small = order[0];
      const big = order.at(-1)!;
      if (inDiv(big).length - inDiv(small).length <= 1) break;
      mover(big).division = small;
    }
  }

  const moves: RealignmentMove[] = slots
    .filter(s => s.teamId && s.original && (s.original.conference !== s.conference || s.original.division !== s.division))
    .map(s => ({ teamId: s.teamId!, label: s.label, from: s.original!, to: { conference: s.conference, division: s.division } }));
  const newTeams = configs.map((_, i) => {
    const s = slots.find(x => x.key === `new-${i}`)!;
    return { conference: s.conference, division: s.division };
  });
  const divisionSizes = {} as Record<BasketballDivision, number>;
  for (const c of ['Eastern', 'Western'] as const) for (const d of CONFERENCE_DIVISIONS[c]) divisionSizes[d] = inDiv(d).length;
  return {
    newTeams,
    moves,
    sizes: { Eastern: inConf('Eastern').length, Western: inConf('Western').length },
    divisionSizes,
  };
}

// ===========================================================================
// Eligibility + protection
// ===========================================================================

/** Exempt from the expansion draft: drafted this year, or no deal for the
 *  upcoming season (headed to free agency). Exempt players can't be taken and
 *  don't use a protection slot. */
export function isExpansionExempt(player: BasketballPlayer, season: number): boolean {
  if (player.sportData.draftYear === season) return true;
  return !hasContractForSeason(player, season);
}

function rosterOf(league: LeagueState, teamId: TeamId): BasketballPlayer[] {
  const team = league.teams.find(t => t.id === teamId);
  return (team?.playerIds ?? [])
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
}

/** Players on `teamId` who need protecting to stay put (non-exempt). */
export function protectablePlayers(league: LeagueState, teamId: TeamId, season: number): BasketballPlayer[] {
  return rosterOf(league, teamId).filter(p => !isExpansionExempt(p, season));
}

/** AI protection: the top 8 non-exempt players by trade value (OVR + age +
 *  upside + contract). */
export function autoProtect(league: LeagueState, teamId: TeamId, season: number): PlayerId[] {
  return protectablePlayers(league, teamId, season)
    .map(p => ({ id: p.id as PlayerId, v: basketballTradeValue(p, { season }) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, PROTECTED_PER_TEAM)
    .map(x => x.id);
}

// ===========================================================================
// Start: create teams, realign, set protections
// ===========================================================================

export interface StartExpansionOptions {
  /** Index into `configs` of the expansion team the user takes over, or null
   *  to keep running their current team. */
  takeOverIndex?: number | null;
}

function cleanText(s: string, max: number): string {
  return (s ?? '').trim().slice(0, max);
}

/** Validate new-team configs (names present, abbreviations unique). Returns an
 *  error message or null. */
export function validateExpansionConfigs(league: LeagueState, configs: ExpansionTeamConfig[]): string | null {
  const win = expansionWindow(league);
  if (!win.open) return win.reason;
  if (configs.length < 1 || configs.length > win.maxNewTeams) return `Choose 1-${win.maxNewTeams} expansion teams.`;
  const abbrevs = new Set(league.teams.map(t => t.abbreviation.toUpperCase()));
  for (const c of configs) {
    if (!cleanText(c.city, 24) || !cleanText(c.name, 24)) return 'Every expansion team needs a city and a name.';
    const a = cleanText(c.abbreviation, 4).toUpperCase();
    if (a.length < 2) return 'Abbreviations need 2-4 characters.';
    if (abbrevs.has(a)) return `Abbreviation ${a} is already taken.`;
    abbrevs.add(a);
  }
  return null;
}

/**
 * Create the expansion franchise(s), apply the realignment plan, and open the
 * protection step (AI lists are set immediately). Throws on an invalid request.
 */
export function startExpansion(
  league: LeagueState,
  configs: ExpansionTeamConfig[],
  plan: RealignmentPlan,
  opts: StartExpansionOptions = {},
): LeagueState {
  const err = validateExpansionConfigs(league, configs);
  if (err) throw new Error(err);
  if (plan.newTeams.length !== configs.length) throw new Error('Realignment plan does not match the new teams.');
  const draft = getDraft(league)!;
  const season = draft.season;

  const moveById = new Map(plan.moves.map(m => [m.teamId, m.to] as const));
  const existing = (league.teams as BasketballTeam[]).map(t => {
    const to = moveById.get(t.id);
    return to ? { ...t, sportData: { ...t.sportData, conference: to.conference, division: to.division } } : t;
  });

  const coaches = { ...league.coaches };
  const newTeams: BasketballTeam[] = configs.map((c, i) => {
    const abbreviation = cleanText(c.abbreviation, 4).toUpperCase();
    const id = `team-${abbreviation.toLowerCase()}-${uuid().slice(0, 8)}` as TeamId;
    const team = makeBasketballTeam({
      id,
      template: {
        city: cleanText(c.city, 24),
        name: cleanText(c.name, 24),
        abbreviation,
        primaryColor: cleanText(c.primaryColor, 9) || '#2356A8',
        secondaryColor: cleanText(c.secondaryColor, 9) || '#F5F0DC',
        conference: plan.newTeams[i].conference,
        division: plan.newTeams[i].division,
      },
      playerIds: [],
    });
    const hc = generateHeadCoach(id);
    coaches[hc.id] = hc;
    return { ...team, coachIds: [hc.id] };
  });
  const teams = [...existing, ...newTeams];

  // Keep the (offseason) standings table covering every team.
  const competitions = league.competitions.map((c, i) => i !== 0 ? c : {
    ...c,
    standings: [
      ...c.standings,
      ...newTeams.map((t, k) => ({ teamId: t.id, wins: 0, losses: 0, draws: 0, pointsFor: 0, pointsAgainst: 0, competitionPoints: 0, position: c.standings.length + k + 1 })),
    ],
  });

  // Staff the new franchises like every other team: contracted head coach +
  // player-development coach (idempotent for the existing 30).
  let next: LeagueState = ensureCoachingStaff({ ...league, teams, coaches, competitions });

  // Optional takeover: the user becomes GM of an expansion team. Their old
  // team turns AI (auto-protected); pending re-sign decisions for it lapse.
  const takeOver = opts.takeOverIndex ?? null;
  const userTookOver = takeOver !== null && takeOver >= 0 && takeOver < newTeams.length;
  if (userTookOver) {
    next = clearGmFired({
      ...next,
      userTeamId: newTeams[takeOver].id,
      sportData: { ...sd(next), pendingResign: [], gmTenureStartSeason: season, gmConsecutiveBadSeasons: 0 },
    });
  }

  const existingTeamIds = existing.map(t => t.id);
  const userExisting = next.userTeamId && existingTeamIds.includes(next.userTeamId) ? next.userTeamId : null;
  const protectedLists: Record<string, PlayerId[]> = {};
  for (const id of existingTeamIds) {
    protectedLists[id] = id === userExisting ? [] : autoProtect(next, id, season);
  }

  // Snake order: round r runs the expansion teams forward on even r, reversed
  // on odd r. Capped so no existing team can lose more than one player.
  const perTeam = Math.min(PICKS_PER_EXPANSION_TEAM, Math.floor(existingTeamIds.length / newTeams.length));
  const order: TeamId[] = [];
  for (let r = 0; r < perTeam; r++) {
    const ids = newTeams.map(t => t.id);
    order.push(...(r % 2 === 0 ? ids : ids.reverse()));
  }

  const expansion: ExpansionState = {
    season,
    stage: 'protect',
    newTeamIds: newTeams.map(t => t.id),
    existingTeamIds,
    protected: protectedLists,
    userProtectionPending: !!userExisting,
    userTookOver,
    order,
    picks: [],
    currentPick: 0,
  };
  next = { ...next, sportData: { ...sd(next), expansion } };
  return appendTransaction(next, {
    kind: 'expansion',
    season,
    teamIds: newTeams.map(t => t.id),
    summary: `League expands to ${teams.length} teams`,
    detail: `${newTeams.map(teamLabel).join(' and ')} join the league for the ${season} season.${plan.moves.length ? ` Realignment: ${plan.moves.map(m => `${m.label} → ${m.to.conference} / ${m.to.division}`).join('; ')}.` : ''}`,
  });
}

/** Set the user's protected list (≤ 8 of their non-exempt players). */
export function setUserProtection(league: LeagueState, playerIds: PlayerId[]): LeagueState {
  const exp = getExpansion(league);
  if (!exp || exp.stage !== 'protect') throw new Error('No expansion protection step in progress.');
  const uid = league.userTeamId;
  if (!uid || !exp.existingTeamIds.includes(uid)) throw new Error('Your team is not protecting players in this expansion.');
  const eligible = new Set(protectablePlayers(league, uid, exp.season).map(p => p.id));
  const ids = [...new Set(playerIds)];
  if (ids.length > PROTECTED_PER_TEAM) throw new Error(`You can protect at most ${PROTECTED_PER_TEAM} players.`);
  if (ids.some(id => !eligible.has(id))) throw new Error('You can only protect players under contract on your roster.');
  const expansion: ExpansionState = { ...exp, protected: { ...exp.protected, [uid]: ids }, userProtectionPending: false };
  return { ...league, sportData: { ...sd(league), expansion } };
}

/** Close protection and open the draft. If the user hasn't submitted a list,
 *  their best 8 are protected for them. */
export function beginExpansionDraft(league: LeagueState): LeagueState {
  const exp = getExpansion(league);
  if (!exp || exp.stage !== 'protect') throw new Error('No expansion protection step in progress.');
  const protectedLists = { ...exp.protected };
  const uid = league.userTeamId;
  if (exp.userProtectionPending && uid) protectedLists[uid] = autoProtect(league, uid, exp.season);
  const expansion: ExpansionState = { ...exp, protected: protectedLists, userProtectionPending: false, stage: 'draft' };
  return { ...league, sportData: { ...sd(league), expansion } };
}

// ===========================================================================
// Draft
// ===========================================================================

export function expansionTeamOnClock(exp: ExpansionState): TeamId | null {
  if (exp.stage !== 'draft' || exp.currentPick >= exp.order.length) return null;
  return exp.order[exp.currentPick];
}

function payrollOf(league: LeagueState, teamId: TeamId, season: number): number {
  return basketballTeamPayroll(rosterOf(league, teamId), season);
}

function salaryFor(p: BasketballPlayer, season: number): number {
  const y = p.contract?.years.find(x => x.season === season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}

/** Players the given expansion team may select right now: unprotected,
 *  non-exempt, from an existing team that hasn't lost a player yet, and
 *  affordable under the first apron. */
export function availableForExpansion(league: LeagueState, expansionTeamId?: TeamId | null): BasketballPlayer[] {
  const exp = getExpansion(league);
  if (!exp) return [];
  const raided = new Set(exp.picks.map(p => p.fromTeamId).filter(Boolean));
  const prot = new Set(Object.values(exp.protected).flat());
  const apron = basketballFirstApron(exp.season);
  const payroll = expansionTeamId ? payrollOf(league, expansionTeamId, exp.season) : 0;
  const out: BasketballPlayer[] = [];
  for (const teamId of exp.existingTeamIds) {
    if (raided.has(teamId)) continue;
    for (const p of rosterOf(league, teamId)) {
      if (prot.has(p.id) || isExpansionExempt(p, exp.season)) continue;
      if (expansionTeamId && payroll + salaryFor(p, exp.season) > apron) continue;
      out.push(p);
    }
  }
  return out;
}

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** The AI's choice for the expansion team on the clock: best trade value, with
 *  a nudge toward positions the new roster lacks. */
export function recommendedExpansionPick(league: LeagueState): PlayerId | null {
  const exp = getExpansion(league);
  if (!exp) return null;
  const teamId = expansionTeamOnClock(exp);
  if (!teamId) return null;
  const pool = availableForExpansion(league, teamId);
  if (!pool.length) return null;
  const counts: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of rosterOf(league, teamId)) counts[p.sportData.position]++;
  const scored = pool.map(p => {
    const need = counts[p.sportData.position] === 0 ? 1.25 : counts[p.sportData.position] >= 4 ? 0.8 : 1;
    return { id: p.id as PlayerId, v: basketballTradeValue(p, { season: exp.season }) * need + p.ratings.overall };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].id;
}

/** Remove a player from every bucket of `team`. */
function withoutPlayer(team: BasketballTeam, playerId: PlayerId): BasketballTeam {
  const buckets: Record<string, PlayerId[]> = {};
  for (const [k, ids] of Object.entries(team.rosterBuckets)) buckets[k] = ids.filter(id => id !== playerId);
  return { ...team, playerIds: team.playerIds.filter(id => id !== playerId), rosterBuckets: buckets } as BasketballTeam;
}

function withPlayer(team: BasketballTeam, playerId: PlayerId): BasketballTeam {
  return {
    ...team,
    playerIds: [...team.playerIds, playerId],
    rosterBuckets: { ...team.rosterBuckets, active: [...(team.rosterBuckets.active ?? []), playerId] },
  } as BasketballTeam;
}

/** Make the current expansion pick. Contract carries over. */
export function makeExpansionPick(league: LeagueState, playerId: PlayerId): LeagueState {
  const exp = getExpansion(league);
  if (!exp || exp.stage !== 'draft') throw new Error('No expansion draft in progress.');
  const teamId = expansionTeamOnClock(exp);
  if (!teamId) throw new Error('The expansion draft is complete.');
  if (!availableForExpansion(league, teamId).some(p => p.id === playerId)) {
    throw new Error('That player is not available (protected, exempt, his team already lost a player, or over the apron).');
  }
  const player = league.players[playerId] as BasketballPlayer;
  const fromTeamId = player.rosterSlot!.teamId as TeamId;
  const toTeam = league.teams.find(t => t.id === teamId) as BasketballTeam;

  const teams = (league.teams as BasketballTeam[]).map(t =>
    t.id === fromTeamId ? withoutPlayer(t, playerId) : t.id === teamId ? withPlayer(t, playerId) : t,
  );
  const players = {
    ...league.players,
    [playerId]: {
      ...player,
      rosterSlot: { teamId, bucket: 'active' as const, index: toTeam.playerIds.length },
      sportData: { ...player.sportData, acquiredVia: 'expansion' as const, acquiredSeason: exp.season },
    },
  };
  const data = sd(league);
  const expansion: ExpansionState = {
    ...exp,
    picks: [...exp.picks, { overall: exp.currentPick + 1, expansionTeamId: teamId, fromTeamId, playerId }],
    currentPick: exp.currentPick + 1,
  };
  const from = league.teams.find(t => t.id === fromTeamId) as BasketballTeam;
  const updated: LeagueState = {
    ...league,
    teams,
    players,
    sportData: {
      ...data,
      expansion,
      ...(data.tradeBlockIds ? { tradeBlockIds: data.tradeBlockIds.filter(id => id !== playerId) } : {}),
    },
  };
  return appendTransaction(updated, {
    kind: 'expansion',
    season: exp.season,
    teamIds: [teamId, fromTeamId],
    summary: `${teamLabel(toTeam)} select ${player.firstName} ${player.lastName} from ${teamLabel(from)}`,
    detail: `Expansion pick ${expansion.currentPick}: ${player.firstName} ${player.lastName}, ${player.sportData.position} · ${player.ratings.overall} OVR. Contract carries over.`,
  });
}

/** Pass on the current pick (nothing legal left for this team). */
function passPick(league: LeagueState): LeagueState {
  const exp = getExpansion(league)!;
  const teamId = expansionTeamOnClock(exp)!;
  const expansion: ExpansionState = {
    ...exp,
    picks: [...exp.picks, { overall: exp.currentPick + 1, expansionTeamId: teamId, fromTeamId: null, playerId: null }],
    currentPick: exp.currentPick + 1,
  };
  return { ...league, sportData: { ...sd(league), expansion } };
}

/** AI makes the current pick (or passes if nothing legal remains). */
export function autoExpansionPick(league: LeagueState): LeagueState {
  const exp = getExpansion(league);
  if (!exp || !expansionTeamOnClock(exp)) return league;
  const id = recommendedExpansionPick(league);
  return id ? makeExpansionPick(league, id) : passPick(league);
}

/** Auto-pick until a user-controlled expansion team is on the clock (or the
 *  draft ends). With `userTeamId` null every pick is simmed. */
export function autoExpansionUntilUser(league: LeagueState, userTeamId: TeamId | null): LeagueState {
  let l = league;
  for (let guard = 0; guard < 128; guard++) {
    const exp = getExpansion(l);
    const onClock = exp ? expansionTeamOnClock(exp) : null;
    if (!onClock) break;
    if (userTeamId && onClock === userTeamId) {
      // A user with nothing legal to pick passes automatically.
      if (availableForExpansion(l, onClock).length === 0) { l = passPick(l); continue; }
      break;
    }
    l = autoExpansionPick(l);
  }
  return l;
}

/** Close the expansion: fill each new team to the 13-man minimum from the
 *  free-agent pool (best OVR first, market contracts for the debut season;
 *  generated depth if the pool runs dry), then mark it done. */
export function finishExpansion(league: LeagueState): LeagueState {
  const exp = getExpansion(league);
  if (!exp || exp.stage !== 'draft') throw new Error('No expansion draft in progress.');
  if (expansionTeamOnClock(exp)) throw new Error('Finish the expansion draft first.');
  const season = exp.season;
  const players = { ...league.players } as Record<string, BasketballPlayer>;
  let freeAgentIds = [...league.freeAgentIds];
  let teams = league.teams as BasketballTeam[];
  const signings: { teamId: TeamId; playerId: PlayerId }[] = [];

  for (const teamId of exp.newTeamIds) {
    let team = teams.find(t => t.id === teamId)!;
    // Fill to the legal minimum only; the 15-man max is never approached here.
    const target = MIN_LEGAL_ROSTER;
    const pool = freeAgentIds
      .map(id => players[id])
      .filter((p): p is BasketballPlayer => !!p && !p.rosterSlot)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
    while (team.playerIds.length < target) {
      const counts: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
      for (const id of team.playerIds) { const p = players[id]; if (p) counts[p.sportData.position]++; }
      const missing = POSITIONS.find(pos => counts[pos] === 0);
      const idx = missing ? pool.findIndex(p => p.sportData.position === missing) : 0;
      let p = idx >= 0 ? pool.splice(idx, 1)[0] : undefined;
      if (!p) p = generateBasketballPlayer({ position: missing ?? POSITIONS[team.playerIds.length % 5], targetOverall: 62, age: 24 });
      const signed: BasketballPlayer = {
        ...p,
        contract: marketContract(p, season),
        rosterSlot: { teamId, bucket: 'active', index: team.playerIds.length },
        sportData: { ...p.sportData, acquiredVia: 'free-agency', acquiredSeason: season },
      };
      players[p.id] = signed;
      freeAgentIds = freeAgentIds.filter(id => id !== p!.id);
      team = withPlayer(team, p.id as PlayerId);
      signings.push({ teamId, playerId: p.id as PlayerId });
    }
    teams = teams.map(t => t.id === teamId ? team : t);
  }

  const data = sd(league);
  const expansion: ExpansionState = { ...exp, stage: 'done' };
  let next: LeagueState = {
    ...league,
    teams,
    players,
    freeAgentIds,
    sportData: {
      ...data,
      expansion,
      expansionHistory: [...(data.expansionHistory ?? []), { season, teamIds: exp.newTeamIds }],
    },
  };
  for (const s of signings) {
    const p = players[s.playerId];
    const t = teams.find(x => x.id === s.teamId)!;
    next = appendTransaction(next, {
      kind: 'signing',
      season,
      teamIds: [s.teamId],
      summary: `${teamLabel(t)} sign ${p.firstName} ${p.lastName}`,
      detail: `Expansion roster fill — ${p.sportData.position} · ${p.ratings.overall} OVR.`,
    });
  }
  return next;
}

/** Run the whole expansion with every decision made by the AI (tests + a
 *  one-click path): start → auto-protect → draft → fill. */
export function runFullExpansion(
  league: LeagueState,
  configs: ExpansionTeamConfig[],
  opts: StartExpansionOptions = {},
): LeagueState {
  let l = startExpansion(league, configs, proposeRealignment(league, configs), opts);
  l = beginExpansionDraft(l);
  l = autoExpansionUntilUser(l, null);
  return finishExpansion(l);
}

/** True while an expansion is mid-flight (blocks the season rollover). */
export function expansionInProgress(league: LeagueState): boolean {
  const exp = getExpansion(league);
  return !!exp && exp.stage !== 'done';
}
