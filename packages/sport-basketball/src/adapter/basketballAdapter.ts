/**
 * Basketball SportAdapter assembly.
 *
 * Wires every capability module in this package — sim, playerGen, schedule,
 * draft, awards, development, capRules, tradeEvaluator, coaching, lineup,
 * UI metadata — into one object satisfying SportAdapter<BasketballRatings,
 * BasketballStats, BasketballPosition, BasketballLineup>.
 *
 * The core engine consumes only this object; it never reaches into individual
 * modules. That keeps the multi-sport boundary clean: when @bs/sport-hockey
 * lands, the core's only change is to import a different adapter.
 *
 * v1 design choices:
 *   - Where our existing function signatures don't exactly match the contract
 *     (e.g. computeBasketballAwards takes BasketballPlayer[] not a stats map),
 *     we wrap them in adapter methods that translate the args.
 *   - Wrappers that the core hasn't fully wired yet stay thin — they call our
 *     underlying functions with sensible defaults rather than throwing stubs.
 *   - Type assertions are used to bridge from concrete BasketballPlayer to
 *     the generic BasePlayer<TRatings, TStats> the contract requires. This is
 *     sound: BasketballPlayer extends BasePlayer<BasketballRatings, BasketballStats>.
 */

import type {
  SportAdapter,
  RosterRules,
  SeasonCalendar,
  CompetitionDefinition,
  PlayerGenerator,
  SimEngine,
  ScheduleGenerator,
  DraftSystem,
  DevelopmentSystem,
  PlayerMovementValuator,
  AwardSystem,
  PlayerGenOptions,
  BasePlayer,
  BaseTeam,
  BaseGameResult,
  BaseDraftPick,
  PlayerMovement,
  GameContext,
  TeamSnapshot,
  TeamId,
  PlayerId,
  ValidationResult,
  AwardWinner,
} from '@bs/core/adapter';

import type {
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup,
  BasketballPlayer,
} from '../types';

// Module imports — re-used as-is when their signature matches the contract.
import {
  generateBasketballPlayer,
  generateBasketballDraftClass,
  type PlayerArchetype,
} from '../playerGen';
import { basketballStatsEngine } from '../statsEngine';
import { simBasketballGame, type BasketballGameSide, type BasketballGameContext } from '../sim';
import { generateBasketballSchedule } from '../scheduleGenerator';
import {
  generateBasketballDraftOrder,
  aiBasketballDraftPick,
  basketballPickValue,
} from '../draftSystem';
import {
  developBasketballPlayer,
  shouldBasketballPlayerRetire,
  tickBasketballPlayer,
} from '../developmentSystem';
import {
  evaluateBasketballTrade,
  type BasketballTradeProposal,
} from '../tradeEvaluator';
import { basketballMarketSalary } from '../capRules';
import { computeBasketballAwards, type TeamSeasonRecord } from '../awards';
import { basketballLineupModel } from '../lineupModel';
import { basketballCoachingSystem } from '../coachingSystem';
import { basketballUiMetadata } from '../uiMetadata';

// ===========================================================================
// RosterRules
// ===========================================================================

export const basketballRosterRules: RosterRules<BasketballPosition> = {
  buckets: [
    {
      name: 'active',
      label: 'Active Roster (15)',
      capacity: 15,
      countsAsActive: true,
      countsAgainstCap: true,
      eligibleForLineups: true,
      ownership: 'self',
    },
    {
      name: 'two_way',
      label: 'Two-Way Contracts (3)',
      capacity: 3,
      countsAsActive: false,
      countsAgainstCap: false,
      eligibleForLineups: true,
      ownership: 'self',
    },
    {
      name: 'inactive',
      label: 'Inactive List',
      capacity: Infinity,
      countsAsActive: false,
      countsAgainstCap: true,
      eligibleForLineups: false,
      ownership: 'self',
    },
  ],
  activeRosterSize: 15,
  positionLimits: {
    PG: { min: 2, max: 4 },
    SG: { min: 2, max: 4 },
    SF: { min: 2, max: 4 },
    PF: { min: 2, max: 4 },
    C:  { min: 2, max: 3 },
  },
  validate(team, _league): ValidationResult {
    const violations: { code: string; message: string }[] = [];
    const warnings: { code: string; message: string }[] = [];
    const active = team.rosterBuckets?.active ?? [];
    if (active.length > 15) {
      violations.push({
        code: 'ROSTER_OVER_ACTIVE_LIMIT',
        message: `Active roster has ${active.length} players (max 15).`,
      });
    }
    if (active.length < 13) {
      violations.push({
        code: 'ROSTER_UNDER_MIN',
        message: `Active roster has ${active.length} players (min 13).`,
      });
    }
    return { valid: violations.length === 0, violations, warnings };
  },
};

// ===========================================================================
// SeasonCalendar
// ===========================================================================

/** NBA-style calendar in day-ticks. Preseason short, regular season is
 *  the long stretch, playoffs ~50 days, offseason gets the rest. */
const PHASES = [
  { name: 'preseason',      label: 'Preseason',       startTick: 1,   endTick: 20,  hasGames: true,  allowedMovements: ['trade', 'free_agency_sign', 'release'] as PlayerMovement['type'][] },
  { name: 'regular_season', label: 'Regular Season',  startTick: 21,  endTick: 200, hasGames: true,  allowedMovements: ['trade', 'release', 'free_agency_sign'] as PlayerMovement['type'][] },
  { name: 'playoffs',       label: 'Playoffs',        startTick: 201, endTick: 250, hasGames: true,  allowedMovements: [] as PlayerMovement['type'][] },
  { name: 'offseason',      label: 'Offseason',       startTick: 251, endTick: 300, hasGames: false, allowedMovements: ['trade', 'free_agency_sign', 'release'] as PlayerMovement['type'][] },
] as const;

export const basketballSeasonCalendar: SeasonCalendar = {
  ticksPerSeason: 300,
  phases: PHASES,
  describeTick(tick: number): string {
    const phase = PHASES.find(p => tick >= p.startTick && tick <= p.endTick);
    if (!phase) return `Day ${tick}`;
    const dayInPhase = tick - phase.startTick + 1;
    return `${phase.label} — Day ${dayInPhase}`;
  },
  phaseForTick(tick: number): string {
    const phase = PHASES.find(p => tick >= p.startTick && tick <= p.endTick);
    return phase?.name ?? 'offseason';
  },
};

// ===========================================================================
// Competitions
// ===========================================================================

export const basketballCompetitions: readonly CompetitionDefinition[] = [
  {
    id: 'primary',
    displayName: 'BS Hoops',
    format: {
      kind: 'round_robin',
      gamesPerOpponent: 3,
      followedByPlayoff: {
        rounds: [
          { name: 'Play-In',          tieFormat: { type: 'single_match' } },
          { name: 'First Round',      tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Conference Semis', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Conference Finals',tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Finals',           tieFormat: { type: 'best_of', games: 7 } },
        ],
        reseededEachRound: false,
      },
    },
    entryRule: 'all_league',
    weight: 1.0,
  },
];

// ===========================================================================
// PlayerGenerator wrapper
// ===========================================================================

const basketballPlayerGen: PlayerGenerator<BasketballRatings, BasketballStats> = {
  generatePlayer(opts: PlayerGenOptions): BasePlayer<BasketballRatings, BasketballStats> {
    return generateBasketballPlayer({
      age: opts.age,
      position: opts.position as BasketballPosition | undefined,
      targetOverall: opts.targetOverall,
      archetype: opts.archetype as PlayerArchetype | undefined,
    });
  },
  generateDraftClass(season: number, count: number): BasePlayer<BasketballRatings, BasketballStats>[] {
    return generateBasketballDraftClass(season, count);
  },
  migrate(rawPlayer: unknown, _fromVersion: number): BasePlayer<BasketballRatings, BasketballStats> {
    // v1: no migrations needed yet — return as-is. A future version field
    // change will route here.
    return rawPlayer as BasePlayer<BasketballRatings, BasketballStats>;
  },
};

// ===========================================================================
// SimEngine wrapper
// ===========================================================================

const basketballSimEngine: SimEngine<BasketballRatings, BasketballStats> = {
  simGame(
    home: TeamSnapshot<BasketballRatings, BasketballStats>,
    away: TeamSnapshot<BasketballRatings, BasketballStats>,
    ctx: GameContext,
  ): BaseGameResult<BasketballStats> {
    const buildSide = (snap: TeamSnapshot<BasketballRatings, BasketballStats>): BasketballGameSide => ({
      teamId: snap.team.id,
      players: snap.availablePlayers as BasketballPlayer[],
      lineup: snap.lineup as BasketballLineup,
      plan: (snap.team.sportData as { gamePlan?: BasketballGameSide['plan'] }).gamePlan,
    });
    const gameCtx: BasketballGameContext = {
      gameId: `game-${ctx.rngSeed}` as BasketballGameContext['gameId'],
      season: ctx.season,
      date: new Date().toISOString().slice(0, 10),
      competitionId: ctx.competitionId as BasketballGameContext['competitionId'],
      isPlayoff: ctx.isPlayoff,
      rngSeed: ctx.rngSeed,
    };
    return simBasketballGame(buildSide(home), buildSide(away), gameCtx);
  },
};

// ===========================================================================
// ScheduleGenerator wrapper
// ===========================================================================

const basketballScheduleGen: ScheduleGenerator<BasketballRatings, BasketballStats> = {
  generate(
    teams: BaseTeam<BasketballRatings, BasketballStats>[],
    season: number,
    _competitionId: string,
    _prevSeasonResults?: BaseGameResult<BasketballStats>[],
  ): BaseGameResult<BasketballStats>[] {
    // generateBasketballSchedule needs BasketballTeamForSchedule (same shape).
    return generateBasketballSchedule(teams, { season });
  },
};

// ===========================================================================
// DraftSystem wrapper
// ===========================================================================

const basketballDraftSystemAdapter: DraftSystem<BasketballRatings, BasketballStats> = {
  rounds: 2,
  draftPhase: 'offseason_early',
  orderRule: 'mixed_lottery_then_reverse',
  computeDraftOrder(
    teams: BaseTeam<BasketballRatings, BasketballStats>[],
    prevSeasonResults: BaseGameResult<BasketballStats>[],
  ): TeamId[] {
    // Derive simple standings from prevSeasonResults
    const winsByTeam = new Map<TeamId, number>();
    const lossesByTeam = new Map<TeamId, number>();
    for (const t of teams) {
      winsByTeam.set(t.id, 0);
      lossesByTeam.set(t.id, 0);
    }
    for (const g of prevSeasonResults) {
      if (!g.finalScore) continue;
      const homeWon = g.finalScore.home > g.finalScore.away;
      const winner = homeWon ? g.homeTeamId : g.awayTeamId;
      const loser  = homeWon ? g.awayTeamId : g.homeTeamId;
      winsByTeam.set(winner, (winsByTeam.get(winner) ?? 0) + 1);
      lossesByTeam.set(loser, (lossesByTeam.get(loser) ?? 0) + 1);
    }
    const standings = teams.map(t => ({
      teamId: t.id,
      wins: winsByTeam.get(t.id) ?? 0,
      losses: lossesByTeam.get(t.id) ?? 0,
      // v1: top 16 by wins make playoffs. The core may override this later.
      madePlayoffs: false,
    }));
    // Mark top 16 by wins as playoff teams
    const sortedByWins = [...standings].sort((a, b) => b.wins - a.wins);
    for (let i = 0; i < 16 && i < sortedByWins.length; i++) {
      sortedByWins[i].madePlayoffs = true;
    }
    // Re-sort by wins ascending (worst first) for the lottery input
    standings.sort((a, b) => a.wins - b.wins);
    return generateBasketballDraftOrder(standings);
  },
  aiPick(
    pickingTeamId: TeamId,
    availableProspects: BasePlayer<BasketballRatings, BasketballStats>[],
    state,
  ): PlayerId {
    // Find the picking team's roster in the league state (teams is an array)
    const team = state.teams?.find(t => t.id === pickingTeamId);
    const rosterIds: PlayerId[] = team?.playerIds ?? [];
    const rosterPlayers = rosterIds
      .map(id => state.players?.[id] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p);
    return aiBasketballDraftPick(
      { teamId: pickingTeamId, rosterPlayers },
      availableProspects as BasketballPlayer[],
    );
  },
  pickValue(pick: BaseDraftPick, _teams): number {
    // v1: use round-based curve; pick within a round defaults to "middle"
    return basketballPickValue(pick.round);
  },
};

// ===========================================================================
// DevelopmentSystem wrapper
// ===========================================================================

const basketballDevAdapter: DevelopmentSystem<BasketballRatings, BasketballStats> = {
  developSeason(player, season) {
    return developBasketballPlayer(player as BasketballPlayer, season);
  },
  shouldRetire(player) {
    return shouldBasketballPlayerRetire(player as BasketballPlayer);
  },
  tickPlayer(player, ticksAdvanced) {
    return tickBasketballPlayer(player as BasketballPlayer, ticksAdvanced);
  },
};

// ===========================================================================
// PlayerMovementValuator (trade) wrapper
// ===========================================================================

const basketballTradeValuator: PlayerMovementValuator<BasketballRatings, BasketballStats> = {
  playerValue(player, _forTeam, league): number {
    const season = league?.currentSeason ?? new Date().getFullYear();
    return basketballMarketSalary(player as BasketballPlayer, { season });
  },
  evaluate(movement: PlayerMovement, league): { accept: boolean; reasoning: string } {
    if (movement.type !== 'trade') {
      return { accept: true, reasoning: 'Non-trade movement; no evaluation needed.' };
    }
    // Build roster map from league state (teams is an array)
    const teamRosters = new Map<TeamId, BasketballPlayer[]>();
    if (league?.teams) {
      for (const team of league.teams) {
        const players = (team.playerIds ?? [])
          .map((id: PlayerId) => league.players?.[id] as BasketballPlayer | undefined)
          .filter((p: BasketballPlayer | undefined): p is BasketballPlayer => !!p);
        teamRosters.set(team.id, players);
      }
    }
    const proposal: BasketballTradeProposal = {
      season: league?.currentSeason ?? new Date().getFullYear(),
      sides: movement.sides.map(s => ({
        teamId: s.teamId,
        playersSent: s.playersSent,
        picksSent: s.picksSent,
        cashSent: s.cashSent,
      })),
    };
    const result = evaluateBasketballTrade(proposal, { teamRosters });
    return {
      accept: result.legal && result.allAccept,
      reasoning: result.summary,
    };
  },
  supportedMovementTypes: ['trade', 'free_agency_sign', 'release'],
};

// ===========================================================================
// AwardSystem wrapper
// ===========================================================================

const basketballAwards: AwardSystem<BasketballStats> = {
  definitions: [
    { id: 'mvp',         name: 'MVP',                            description: 'Most Valuable Player',                primaryStatKeys: ['points', 'assists', 'totalRebounds'] },
    { id: 'dpoy',        name: 'Defensive Player of the Year',   description: 'Top defender',                         primaryStatKeys: ['steals', 'blocks', 'defensiveRebounds'] },
    { id: 'roy',         name: 'Rookie of the Year',             description: 'Top rookie',                           primaryStatKeys: ['points', 'assists'] },
    { id: 'sixth_man',   name: 'Sixth Man of the Year',          description: 'Top bench player',                     primaryStatKeys: ['points'] },
    { id: 'mip',         name: 'Most Improved Player',           description: 'Biggest year-over-year improvement',   primaryStatKeys: ['points'] },
    { id: 'coy',         name: 'Coach of the Year',              description: 'Top coaching performance',             primaryStatKeys: [] },
    { id: 'finals_mvp',  name: 'Finals MVP',                     description: 'Best player in the Finals',            primaryStatKeys: ['points', 'assists', 'totalRebounds'] },
  ],
  computeWinners(
    _finalStats: Record<PlayerId, BasketballStats>,
    _seasonResults: BaseGameResult<BasketballStats>[],
  ): Record<string, AwardWinner> {
    // The core hands us aggregated stats but our underlying computeBasketballAwards
    // function works off Player[] + team records. v1: just return an empty
    // map; the higher-level orchestration (which has BasketballPlayer[] handy)
    // calls computeBasketballAwards directly. v2 will reshape this interface.
    return {};
  },
};

// Re-export the underlying high-fidelity awards function for direct use by
// sport-specific code paths that have access to the full player objects.
export { computeBasketballAwards, type TeamSeasonRecord };

// ===========================================================================
// Cap rules — defer to standalone implementations
// ===========================================================================

// Re-import only what we use here for the capRules wrapper.
import {
  basketballSalaryCap,
  isLegalBasketballContract,
  isLegalBasketballRoster,
  basketballDeadCapForRelease,
  basketballAvailableCapActions,
} from '../capRules';
import type { CapRules } from '@bs/core/adapter';

const basketballCapRulesAdapter: CapRules<BasketballRatings, BasketballStats> = {
  currentCap(season: number): number {
    return basketballSalaryCap(season);
  },
  isLegalContract(contract, player, _team, league): ValidationResult {
    const season = league?.currentSeason ?? contract.signedSeason;
    const res = isLegalBasketballContract(contract, player as BasketballPlayer, season);
    return {
      valid: res.legal,
      violations: res.legal
        ? []
        : res.violations.map((v: string) => ({ code: 'CONTRACT_INVALID', message: v })),
      warnings: (res.warnings ?? []).map((w: string) => ({ code: 'CONTRACT_WARNING', message: w })),
    };
  },
  isLegalRoster(team, league): ValidationResult {
    const season = league?.currentSeason ?? new Date().getFullYear();
    const players = (team.playerIds ?? [])
      .map((id: PlayerId) => league.players?.[id] as BasketballPlayer | undefined)
      .filter((p: BasketballPlayer | undefined): p is BasketballPlayer => !!p);
    const res = isLegalBasketballRoster(players, season);
    return {
      valid: res.legal,
      violations: res.violations.map((v: string) => ({ code: 'ROSTER_VIOLATION', message: v })),
      warnings: (res.warnings ?? []).map((w: string) => ({ code: 'ROSTER_WARNING', message: w })),
    };
  },
  deadCapForRelease(player, league) {
    const season = league?.currentSeason ?? new Date().getFullYear();
    const entries = basketballDeadCapForRelease(player as BasketballPlayer, {
      releaseSeason: season,
    });
    return entries.map(e => ({ season: e.season, amount: e.amount }));
  },
  marketSalary(player, league): number {
    const season = league?.currentSeason ?? new Date().getFullYear();
    return basketballMarketSalary(player as BasketballPlayer, { season });
  },
  availableCapActions(team, league) {
    const season = league?.currentSeason ?? new Date().getFullYear();
    const players = (team.playerIds ?? [])
      .map((id: PlayerId) => league.players?.[id] as BasketballPlayer | undefined)
      .filter((p: BasketballPlayer | undefined): p is BasketballPlayer => !!p);
    return basketballAvailableCapActions(team.id, players, season);
  },
};

// ===========================================================================
// Final assembled adapter
// ===========================================================================

export const basketballAdapter: SportAdapter<
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup
> = {
  sportId: 'basketball',
  displayName: 'BS Hoops',
  brandName: 'BS Hoops',
  positions: ['PG', 'SG', 'SF', 'PF', 'C'] as const,
  playerKinds: ['standard'] as const,

  rosterRules: basketballRosterRules,
  seasonCalendar: basketballSeasonCalendar,
  competitions: basketballCompetitions,

  playerGen: basketballPlayerGen,
  statsEngine: basketballStatsEngine,
  simEngine: basketballSimEngine,
  scheduleGenerator: basketballScheduleGen,
  draftSystem: basketballDraftSystemAdapter,
  developmentSystem: basketballDevAdapter,
  tradeValuator: basketballTradeValuator,
  awards: basketballAwards,
  ui: basketballUiMetadata,
  lineupModel: basketballLineupModel,
  coachingSystem: basketballCoachingSystem,
  capRules: basketballCapRulesAdapter,

  // liveSim: undefined — basketball ships without live sim in v1
  // promotionRelegation: undefined — US sports don't promote/relegate
};
