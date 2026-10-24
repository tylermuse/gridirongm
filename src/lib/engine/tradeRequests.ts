/**
 * Trade requests / refuse-to-play — Phase 1 (BS Football).
 *
 * The football parallel of the shipped hoops loop (PR #387). Football already
 * recomputes `player.mood` every simmed week in `store.ts` (win %, depth-chart
 * role, underpaid-vs-market, win/loss streak) and `social.ts` already surfaces
 * "trade demand brewing / holdout risk" flavor — but nothing mechanical followed
 * from it. This turns that dead-end mood signal into a real, persistent
 * consequence: a sustained-discontent player formally FILES a trade request.
 *
 * The request persists on the player (`player.tradeRequest`, additive/optional —
 * no SAVE_VERSION bump), seeds the existing trade-rumor feed, and makes him
 * "more available" in the AI trade-proposal path so offers actually surface.
 *
 * Phase 1 ships two stages: `unhappy` (escalation clock running) → `requested`
 * (formally filed). The `refusing` (refuse-to-play) stage, placate actions and
 * the resolution UI are Phase 2. There is deliberately NO RNG here: stage
 * transitions are a pure function of the persisted discontent clock and the
 * live (already-recomputed) mood, so a given save always advances identically
 * and the state never mutates on re-render or reload. Advanced once per simmed
 * WEEK from the weekly-advance path, alongside the rumor mill.
 *
 * IMPORTANT: kept fully separate from the existing contract `holdout` (a *money*
 * dispute driven by `holdoutDemands`). `tradeRequest` is a *"trade me"* dispute.
 * The two systems never read or overwrite each other's fields.
 */

import type { Player, Team, TradeRumor, TradeRequest } from '@/types';
import { estimateSalary } from './salary';

/** Mood at or below this counts as "discontent" and runs the escalation clock. */
export const DISCONTENT_MOOD = 40;
/** Consecutive weeks of sustained discontent before a formal request is filed. */
export const REQUEST_WEEKS = 3;

/** AI-team players must be at least this OVR to formally file a request. */
export const NOTABLE_MIN_OVR = 70;
/** AI-team players must also rank in the top `NOTABLE_STARTER_SHARE` of the
 *  league's starter slots at their position (e.g. top-16 QBs, top-80 OL). */
export const NOTABLE_STARTER_SHARE = 0.5;
/** Max NEW league-wide (non-user-team) filings per simmed week — highest OVR
 *  first; the rest stay `unhappy` and get another shot next week. */
export const MAX_NEW_FILINGS_PER_WEEK = 2;

/** Approx. starter slots per position — mirrors the weekly mood recompute in
 *  store.ts so "benched" here means the same thing it does there. */
const STARTER_SLOTS: Record<string, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
  DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

/** True once a request has been formally filed (Phase 1: `requested`; Phase 2
 *  will add `refusing`). `unhappy` is the pre-file clock and does NOT count. */
function isFiled(req: TradeRequest | undefined): boolean {
  return !!req && (req.stage === 'requested' || req.stage === 'refusing');
}

/** Human-readable trigger, derived from the same signals the mood model uses. */
function deriveReason(p: Player, team: Team): string {
  const slots = STARTER_SLOTS[p.position] ?? 1;
  const depthPos = team.depthChart[p.position]?.indexOf(p.id) ?? -1;
  const benched = !(depthPos >= 0 && depthPos < slots);
  const wpGames = team.record.wins + team.record.losses + team.record.ties;
  const wp = wpGames > 0 ? (team.record.wins + team.record.ties * 0.5) / wpGames : 0.5;
  const market = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);

  if (benched && depthPos >= 0) return 'Buried on the depth chart';
  if (p.contract.salary < market * 0.7) return 'Feels underpaid for his talent';
  if (team.record.streak <= -3) return `Fed up amid a ${Math.abs(team.record.streak)}-game skid`;
  if (wp <= 0.35) return 'Frustrated with the losing';
  if (p.contract.yearsLeft <= 1 && p.ratings.overall >= 70) return 'Wants his future settled';
  return 'Unhappy with his situation';
}

export interface RefreshInput {
  players: Player[];
  teams: Team[];
  season: number;
  /** Week-of-season just completed — stamps the escalation clock. */
  week: number;
  /** The user's team. Its players can always request (a locker-room signal
   *  the user manages); everyone else must be a notable player league-wide. */
  userTeamId?: string;
}

export interface RefreshResult {
  players: Player[];
  /** Rumors newly seeded by freshly-filed requests (append to the feed). */
  rumors: TradeRumor[];
}

/**
 * Advance the trade-request loop one simmed week. Pure — returns new player
 * objects only where a request changed, plus any rumors seeded by newly-filed
 * requests. Reads the already-recomputed `player.mood`.
 */
export function refreshTradeRequests({ players, teams, season, week, userTeamId }: RefreshInput): RefreshResult {
  const teamById = new Map(teams.map(t => [t.id, t]));
  const rumors: TradeRumor[] = [];
  const notable = notablePlayerIds(players, teams.length);

  // Pass 1: compute each player's next request state.
  const draft = players.map(p => {
    if (!p.teamId || p.retired) return { p, changed: false as const };
    const team = teamById.get(p.teamId);
    if (!team) return { p, changed: false as const };

    const mood = p.mood ?? 70;
    const discontent = mood < DISCONTENT_MOOD;
    // A request from a previous season is cleared on rollover.
    const existing = p.tradeRequest && p.tradeRequest.season === season ? p.tradeRequest : undefined;

    let nextReq: TradeRequest | undefined;
    if (!discontent) {
      // Mood recovered (promoted, extended, team winning, traded into a role) →
      // the request resolves. This is Phase 1's natural resolution path.
      nextReq = undefined;
    } else if (!existing) {
      // First week discontent — start the clock at the `unhappy` stage.
      nextReq = { stage: 'unhappy', since: week, reason: deriveReason(p, team), season };
    } else if (existing.stage === 'unhappy') {
      const reason = deriveReason(p, team);
      nextReq =
        week - existing.since >= REQUEST_WEEKS
          ? { ...existing, stage: 'requested', requestedWeek: week, reason }
          : { ...existing, reason };
    } else {
      // Already filed — keep it, just refresh the human-readable reason.
      nextReq = { ...existing, reason: deriveReason(p, team) };
    }

    // League-wide, only players who matter can escalate. Depth-chart filler
    // on AI teams never files (no rumor, no news) — the feed is for names.
    const eligible = team.id === userTeamId || notable.has(p.id);
    if (!eligible) nextReq = undefined;

    return { p, team, existing, nextReq, changed: true as const };
  });

  // Cap brand-new AI-team filings per week to the highest-OVR candidates.
  const newFilers = draft
    .filter(d => d.changed && d.team.id !== userTeamId && isFiled(d.nextReq) && !isFiled(d.existing))
    .sort((a, b) => b.p.ratings.overall - a.p.ratings.overall || a.p.id.localeCompare(b.p.id));
  const deferred = new Set(newFilers.slice(MAX_NEW_FILINGS_PER_WEEK).map(d => d.p.id));

  // Pass 2: apply, seed rumors.
  const nextPlayers = draft.map(d => {
    if (!d.changed) return d.p;
    const { p, team, existing } = d;
    // Deferred filers stay on the `unhappy` clock and retry next week.
    const nextReq = deferred.has(p.id) && existing ? { ...existing, reason: d.nextReq!.reason } : d.nextReq;

    const wasFiled = isFiled(existing);
    const nowFiled = isFiled(nextReq);
    if (nowFiled && !wasFiled) {
      const name = `${p.firstName} ${p.lastName}`;
      rumors.push({
        id: `req-${season}-${p.id}`,
        season,
        week,
        type: 'trade_request',
        teamId: team.id,
        playerIds: [p.id],
        headline: `${name} has requested a trade from ${team.city}`,
        detail: `${name} (${p.ratings.overall} OVR ${p.position}) has formally asked ${team.city} for a move — ${nextReq!.reason.toLowerCase()}. Front offices around the league are circling.`,
        resolved: false,
        _accurate: true,
      });
    }

    if (sameRequest(p.tradeRequest, nextReq)) return p;
    if (!nextReq) {
      const { tradeRequest: _drop, ...rest } = p;
      void _drop;
      return rest as Player;
    }
    return { ...p, tradeRequest: nextReq };
  });

  // Highest-OVR requests first so the feed leads with the biggest names.
  rumors.sort((a, b) => ovrOf(players, b.playerIds[0]) - ovrOf(players, a.playerIds[0]));
  return { players: nextPlayers, rumors };
}

function ovrOf(players: Player[], id: string): number {
  return players.find(p => p.id === id)?.ratings.overall ?? 0;
}

/** Players good enough that a trade request is league news: OVR floor plus a
 *  top-half-of-league-starters rank at their position. */
export function notablePlayerIds(players: Player[], teamCount: number): Set<string> {
  const byPos = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.teamId || p.retired) continue;
    const list = byPos.get(p.position) ?? [];
    list.push(p);
    byPos.set(p.position, list);
  }
  const out = new Set<string>();
  for (const [pos, list] of byPos) {
    const cutoff = Math.max(1, Math.round(teamCount * (STARTER_SLOTS[pos] ?? 1) * NOTABLE_STARTER_SHARE));
    list
      .sort((a, b) => b.ratings.overall - a.ratings.overall || a.id.localeCompare(b.id))
      .slice(0, cutoff)
      .forEach(p => { if (p.ratings.overall >= NOTABLE_MIN_OVR) out.add(p.id); });
  }
  return out;
}

function sameRequest(a: TradeRequest | undefined, b: TradeRequest | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.stage === b.stage &&
    a.since === b.since &&
    a.reason === b.reason &&
    a.season === b.season &&
    a.requestedWeek === b.requestedWeek
  );
}

// ===========================================================================
// Read helpers (UI + AI proposal weighting)
// ===========================================================================

/** True if the player has a live, formally-filed request this season. */
export function hasActiveTradeRequest(player: Player, season: number): boolean {
  const r = player.tradeRequest;
  return !!r && r.season === season && isFiled(r);
}

export interface TradeRequestBadge {
  label: string;
  emoji: string;
  /** Tailwind color classes for the badge chip. */
  className: string;
}

/** Roster/modal badge for a filed request this season, or null if none. */
export function tradeRequestBadge(player: Player, season: number): TradeRequestBadge | null {
  const r = player.tradeRequest;
  if (!r || r.season !== season) return null;
  if (r.stage === 'requested') {
    return { label: 'Trade request', emoji: '📣', className: 'text-red-700 bg-red-50' };
  }
  if (r.stage === 'refusing') {
    return { label: 'Refusing to play', emoji: '🚫', className: 'text-red-800 bg-red-100' };
  }
  return null;
}
