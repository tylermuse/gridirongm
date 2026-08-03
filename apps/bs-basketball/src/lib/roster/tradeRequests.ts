/**
 * Trade requests / refuse-to-play — Phase 1 (backlog: hoops trade requests,
 * 7 votes).
 *
 * Turns the derived roster mood signal — `mood.ts` already surfaces "trade
 * demand brewing" / "holdout risk" with nothing behind it — into a real,
 * persistent consequence loop. A sustained-discontent player formally FILES a
 * trade request; the request persists on the player's `sportData` (so it saves
 * on the normal cadence and travels with him through trades), seeds the existing
 * trade-rumor feed, and makes him "more available" in the AI trade finder.
 *
 * Phase 1 ships two stages: `unhappy` (escalation clock running) → `requested`
 * (formally filed). Holdout/unavailability, placate actions and the resolution
 * UI are Phase 2. There is deliberately NO RNG: stage transitions are a pure
 * function of the (persisted) discontent clock and the live mood model, so a
 * given save always advances identically — mirroring the deterministic rumor
 * mill. Advanced once per simmed day from `runSimDay`, never on render.
 *
 * No save-version bump: `tradeRequest` is additive/optional and defaulted absent
 * on read (see persistence/migrations.ts, CURRENT_SAVE_VERSION stays 1).
 */

import type {
  BasketballPlayer,
  BasketballPlayerData,
  BasketballTeam,
  BasketballTradeRequest,
  BasketballRatings,
  BasketballStats,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import { resolveLineup } from '../lineup';
import { playerMood } from './mood';
import { contractYearsLeft } from './playerActions';
import type { TradeRumor } from '../trade/rumors';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Days of sustained anger (a clear star riding the bench) before he files. */
export const ANGRY_FILE_DAYS = 7;
/** Days of sustained Unhappy/Restless before a formal request is filed. */
export const DISCONTENT_FILE_DAYS = 10;
/** How long a request-seeded rumor stays active before going stale. */
const REQUEST_RUMOR_TTL = 30;

/** Mood labels that count as "discontent" for the escalation clock. */
const DISCONTENT_LABELS = new Set(['Angry', 'Unhappy', 'Restless']);

interface RumorLikeData {
  tradeRumors?: TradeRumor[];
  [key: string]: unknown;
}

function isFiled(req: BasketballTradeRequest | undefined): boolean {
  return !!req && (req.stage === 'requested' || req.stage === 'holdout');
}

function sameRequest(
  a: BasketballTradeRequest | undefined,
  b: BasketballTradeRequest | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.stage === b.stage &&
    a.since === b.since &&
    a.reason === b.reason &&
    a.season === b.season &&
    a.requestedOn === b.requestedOn
  );
}

function stripTradeRequest(data: BasketballPlayerData): BasketballPlayerData {
  if (!data.tradeRequest) return data;
  const rest = { ...data };
  delete rest.tradeRequest;
  return rest;
}

/**
 * Advance the trade-request loop one simmed day. Pure — returns a new league
 * (players updated in place only where a request changed, plus any newly-filed
 * requests seeded into the rumor feed).
 */
export function refreshTradeRequests(league: LeagueState): LeagueState {
  const season = league.currentSeason;
  const today = league.currentTick;
  const players = league.players as Record<string, BasketballPlayer>;

  let changed = false;
  const nextPlayers: Record<string, BasketballPlayer> = { ...players };
  const newlyFiled: { player: BasketballPlayer; team: BasketballTeam }[] = [];

  for (const baseTeam of league.teams) {
    const team = baseTeam as BasketballTeam;
    const roster = team.playerIds
      .map(id => players[id])
      .filter((p): p is BasketballPlayer => !!p);
    if (roster.length === 0) continue;

    const lineup = resolveLineup(team, roster);
    const starterIds = new Set(lineup.starters.filter((id): id is NonNullable<typeof id> => !!id));
    const talentRank = new Map<string, number>();
    [...roster]
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .forEach((p, i) => talentRank.set(p.id, i));

    for (const p of roster) {
      const mood = playerMood({
        player: p,
        team,
        talentRank: talentRank.get(p.id) ?? 99,
        isStarter: starterIds.has(p.id),
        yearsLeft: contractYearsLeft(p, season),
      });
      const discontent = DISCONTENT_LABELS.has(mood.label);
      const existing = p.sportData.tradeRequest;
      // Ignore a request left over from a previous season (rollover clears it).
      const current = existing && existing.season === season ? existing : undefined;

      let nextReq: BasketballTradeRequest | undefined;
      if (!discontent) {
        // Mood recovered (traded into a role, promoted, extended, team winning)
        // → the request resolves. Phase 1's natural resolution path.
        nextReq = undefined;
      } else if (!current) {
        // First day discontent — start the clock at the `unhappy` stage.
        nextReq = { stage: 'unhappy', since: today, reason: mood.reason, season };
      } else if (current.stage === 'unhappy') {
        const threshold = mood.label === 'Angry' ? ANGRY_FILE_DAYS : DISCONTENT_FILE_DAYS;
        nextReq =
          today - current.since >= threshold
            ? { ...current, stage: 'requested', requestedOn: today, reason: mood.reason }
            : { ...current, reason: mood.reason };
      } else {
        // Already filed (`requested`/`holdout`) — keep it, refresh the reason.
        nextReq = { ...current, reason: mood.reason };
      }

      if (isFiled(nextReq) && !isFiled(current)) newlyFiled.push({ player: p, team });

      if (!sameRequest(p.sportData.tradeRequest, nextReq)) {
        nextPlayers[p.id] = {
          ...p,
          sportData: nextReq
            ? { ...p.sportData, tradeRequest: nextReq }
            : stripTradeRequest(p.sportData),
        };
        changed = true;
      }
    }
  }

  let next: LeagueState = changed ? { ...league, players: nextPlayers } : league;
  if (newlyFiled.length > 0) next = seedRequestRumors(next, newlyFiled, today, season);
  return next;
}

/**
 * Seed a `star_available` rumor for each newly-filed request so the existing
 * rumor feed reflects it (free integration — no new feed surface). Idempotent
 * on a stable per-player id, and self-grading via the rumor mill's transaction
 * cross-ref (a requested player who gets traded resolves "accurate").
 */
function seedRequestRumors(
  league: LeagueState,
  filed: { player: BasketballPlayer; team: BasketballTeam }[],
  day: number,
  season: number,
): LeagueState {
  const sport = (league.sportData as RumorLikeData | undefined) ?? {};
  const existing = sport.tradeRumors ?? [];
  const haveId = new Set(existing.map(r => r.id));
  const additions: TradeRumor[] = [];
  for (const { player, team } of filed) {
    const id = `req-${season}-${player.id}`;
    if (haveId.has(id)) continue;
    const name = `${player.firstName} ${player.lastName}`;
    additions.push({
      id,
      season,
      day,
      type: 'star_available',
      teamId: team.id as TeamId,
      playerId: player.id,
      playerName: name,
      hot: true,
      headline: `${name} has requested a trade from ${team.city}`,
      detail: `${name} (${player.sportData.position}) has formally asked ${team.city} for a move — front offices around the league are circling.`,
      resolveDay: day + REQUEST_RUMOR_TTL,
      resolved: false,
    });
  }
  if (additions.length === 0) return league;
  return { ...league, sportData: { ...sport, tradeRumors: [...existing, ...additions] } };
}

// ===========================================================================
// Read helpers (UI + finder)
// ===========================================================================

/** True if the player has a live, formally-filed request this season. */
export function hasActiveTradeRequest(player: BasketballPlayer, season: number): boolean {
  return isFiled(player.sportData.tradeRequest) && player.sportData.tradeRequest?.season === season;
}

export interface TradeRequestBadge {
  label: string;
  emoji: string;
}

/** Roster-chip badge for a filed request/holdout, or null if none this season. */
export function tradeRequestBadge(player: BasketballPlayer, season: number): TradeRequestBadge | null {
  const r = player.sportData.tradeRequest;
  if (!r || r.season !== season) return null;
  if (r.stage === 'requested') return { label: 'Trade request', emoji: '📣' };
  if (r.stage === 'holdout') return { label: 'Holdout', emoji: '🚫' };
  return null;
}
