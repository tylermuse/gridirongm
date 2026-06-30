/**
 * AI Spotlight — shared pre-fetch cache for AI-generated commentary.
 *
 * The SpotlightPopup triggers fetchAiSpotlight() as soon as a spotlight-worthy
 * state change is detected. By the time the user clicks through to the home page,
 * the result is already cached and ready to render.
 *
 * Supports narrative-specific moments:
 *  - preseason: opening night, lottery hangover, offseason recap
 *  - tradeDeadline: midseason assessment + buyout-market suggestions
 *  - playInStart: play-in tournament preview
 *  - allStarBreak: halfway-mark check-in, MVP race tightening
 *  - playoffsStart: bracket preview + per-round next-opponent updates
 *  - seasonOver: elimination or championship wrap-up
 *  - weekly: standard weekly analysis (default)
 *
 * Ported from BS Football (src/lib/engine/aiSpotlight.ts) and adapted to the
 * basketball league-state shape. Sport-agnostic plumbing (cache, NDJSON
 * stream parser, scrubber) is kept verbatim; basketball-specific bits are
 * the data extraction (basketball stats, conference seeding, play-in vs
 * playoff bracket) and the narrative-detection cadence (82-game season,
 * All-Star break at ~game 41, play-in then playoffs).
 */

import type { BaseGameResult, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type {
  BasketballPlayer,
  BasketballRatings,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';
import type { TransactionEntry } from '../transactions/transactions';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type NarrativeMoment =
  | 'preseason'
  | 'tradeDeadline'
  | 'playInStart'
  | 'playoffsStart'
  | 'allStarBreak'
  | 'seasonOver'
  | 'weekly';

export interface AiSpotlightTopic {
  headline: string;
  icon: string;
  exchanges: { speakerId: 'stats' | 'hottake' | 'fans' | 'player'; text: string; playerName?: string }[];
  teamIds: string[];
  playerIds: string[];
}

interface CacheEntry {
  key: string;
  topics: AiSpotlightTopic[] | null;
  loading: boolean;
  error: boolean;
  promise: Promise<void> | null;
}

const cache: CacheEntry = {
  key: '',
  topics: null,
  loading: false,
  error: false,
  promise: null,
};

// Subscribers get notified when cache state changes
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeAiSpotlight(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAiSpotlightState() {
  return { topics: cache.topics, loading: cache.loading, error: cache.error };
}

export function buildCacheKey(
  teamId: string,
  season: number,
  dayIndex: number,
  wins: number,
  losses: number,
  phase: string,
) {
  return `${teamId}-s${season}-d${dayIndex}-${wins}-${losses}-${phase}`;
}

// ============================================================================
// Bracket types (shape mirrors apps/bs-basketball/src/lib/playoffs/types.ts —
// kept as a local interface so we don't pull the whole module into this file).
// ============================================================================

interface PlayoffSeriesLite {
  id: string;
  round: number;
  roundName: string;
  conference: 'Eastern' | 'Western' | 'Finals';
  teamA: TeamId | null;
  teamB: TeamId | null;
  winsA: number;
  winsB: number;
  winnerTeamId: TeamId | null;
}

interface PlayoffBracketLite {
  season: number;
  rounds: PlayoffSeriesLite[][];
  playIn?: PlayoffSeriesLite[];
  seeds: { Eastern: TeamId[]; Western: TeamId[] };
  dayIndex: number;
  complete: boolean;
  championTeamId: TeamId | null;
}

// ============================================================================
// Narrative detection
// ============================================================================

/**
 * Detect narrative moment from basketball league state. Basketball runs on
 * total games-played and bracket state rather than a week counter:
 *
 *   - phase === 'preseason' OR zero league-wide games played → preseason
 *   - phase === 'regular_season' AND avg games-per-team ≈ 41 → allStarBreak
 *     (halfway through the 82, the natural break point)
 *   - phase === 'playoffs' AND bracket exists AND dayIndex === 0 → playoffsStart
 *   - phase === 'playoffs' AND bracket.complete → seasonOver
 *   - phase === 'offseason' → seasonOver
 *   - else → weekly
 *
 * `tradeDeadline` is layered on top by the caller (SpotlightPopup gates the
 * one-shot popup off the trade-deadline day), not auto-detected here.
 *
 * Kept intentionally simple — ~30 lines, matching the football function's
 * scope. The render site (SpotlightPopup) is responsible for stable
 * gating across transition windows.
 */
export function detectNarrativeMoment(
  league: LeagueState,
  bracket: PlayoffBracketLite | null,
): NarrativeMoment {
  const phase = league.currentPhase;

  // 1) Preseason or zero games tipped off league-wide
  const totalGamesPlayed = league.games.reduce(
    (n, g) => n + (g.status === 'played' ? 1 : 0),
    0,
  );
  if (phase === 'preseason' || totalGamesPlayed === 0) return 'preseason';

  // 2) Playoffs phase — preview vs. eliminated vs. complete
  if (phase === 'playoffs' && bracket) {
    if (bracket.complete) return 'seasonOver';
    // dayIndex === 0 → the bracket was just seeded, no playoff games yet.
    // For subsequent rounds (dayIndex > 0) we still return playoffsStart;
    // the route is round-aware via the cache key + nextOpponentId.
    return 'playoffsStart';
  }
  if (phase === 'playoffs') return 'playoffsStart';

  // 3) Offseason → seasonOver vibe (offseason recap, free agency, draft)
  if (phase === 'offseason') return 'seasonOver';

  // 4) All-Star break — roughly halfway through the 82-game season.
  //    Average games played per team ≈ 41.
  if (phase === 'regular_season' && league.teams.length > 0) {
    const avgGames = totalGamesPlayed / league.teams.length;
    if (avgGames >= 40 && avgGames <= 42) return 'allStarBreak';
  }

  return 'weekly';
}

// ============================================================================
// Fetch
// ============================================================================

interface FetchOptions {
  team: BasketballTeam;
  roster: BasketballPlayer[];
  allTeams: BasketballTeam[];
  allPlayers: BasketballPlayer[];
  season: number;
  dayIndex: number;
  phase: string;
  narrative: NarrativeMoment;
  transactions?: TransactionEntry[];
  playoffBracket?: PlayoffBracketLite | null;
  champions?: { season: number; teamId: string }[];
  coachName?: string;
  /** Resolved next-round opponent for the user team, when the render site has
   *  gated on a stable bracket transition. Football's stale-opponent guard —
   *  the render site is the only place that knows the bracket is stable, so
   *  it tells us explicitly. */
  nextOpponentId?: string | null;
}

function teamRecord(t: BasketballTeam): { w: number; l: number } {
  return { w: t.record.wins, l: t.record.losses };
}

function getStreakValue(streak: string[]): number {
  // Convert the oldest-first ['W','W','L','W','W'] form into a +/- count
  // of the trailing run. Positive = win streak, negative = loss streak.
  if (!streak || streak.length === 0) return 0;
  const last = streak[streak.length - 1];
  let n = 0;
  for (let i = streak.length - 1; i >= 0 && streak[i] === last; i--) n++;
  return last === 'W' ? n : last === 'L' ? -n : 0;
}

export function fetchAiSpotlight(opts: FetchOptions): Promise<void> {
  const { team, roster, allTeams, allPlayers, season, dayIndex, phase, narrative } = opts;

  const { w, l } = teamRecord(team);
  const gp = w + l;
  // Allow preseason (gp=0) and seasonOver
  if (gp === 0 && narrative !== 'preseason' && narrative !== 'seasonOver') return Promise.resolve();

  // During playoffs, both `narrative` (playoffsStart) and `dayIndex` move
  // independently of the user's series progress. Tag the cache key with
  // the user's completed playoff series wins so each round refetches.
  // Also tag with the resolved next-opponent id (when supplied) so a stale
  // prior-round cache entry can't re-render with the wrong team.
  let cacheNarrative: string = narrative;
  let userPlayoffWins = 0;
  let userPlayoffLosses = 0;
  if (phase === 'playoffs' && opts.playoffBracket) {
    const allSeries = [
      ...(opts.playoffBracket.playIn ?? []),
      ...opts.playoffBracket.rounds.flat(),
    ];
    const userSeries = allSeries.filter(
      s => s.winnerTeamId && (s.teamA === team.id || s.teamB === team.id),
    );
    userPlayoffWins = userSeries.filter(s => s.winnerTeamId === team.id).length;
    userPlayoffLosses = userSeries.filter(s => s.winnerTeamId && s.winnerTeamId !== team.id).length;
    const oppKey = opts.nextOpponentId ? `-no${opts.nextOpponentId}` : '';
    cacheNarrative = `${narrative}-pw${userPlayoffWins}-pl${userPlayoffLosses}${oppKey}`;
  }

  const key = buildCacheKey(team.id, season, dayIndex, w, l, `${phase}-${cacheNarrative}`);
  if (key === cache.key && (cache.topics || cache.loading)) return cache.promise ?? Promise.resolve();

  cache.key = key;
  cache.topics = null;
  cache.loading = true;
  cache.error = false;
  notify();

  // ─ Roster slices ─
  const activeRoster = roster.filter(p => !p.contract === false || p.contract !== null); // signed players only
  const sortedByOvr = [...activeRoster].sort((a, b) => b.ratings.overall - a.ratings.overall);
  const topPlayers = sortedByOvr.slice(0, 10);
  const injured = activeRoster
    .filter(p => p.injury)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 3);
  const youngStars = activeRoster
    .filter(p => p.age <= 24 && p.development.potential >= 78)
    .sort((a, b) => b.development.potential - a.development.potential)
    .slice(0, 3);

  // Team scoring ranks (PPG, opponent PPG)
  const teamPpgRanked = allTeams
    .map(t => ({
      id: t.id,
      gp: t.record.wins + t.record.losses,
      ppg: t.record.pointsFor / Math.max(1, t.record.wins + t.record.losses),
    }))
    .sort((a, b) => b.ppg - a.ppg);
  const teamDefRanked = allTeams
    .map(t => ({
      id: t.id,
      gp: t.record.wins + t.record.losses,
      oppPpg: t.record.pointsAgainst / Math.max(1, t.record.wins + t.record.losses),
    }))
    .sort((a, b) => a.oppPpg - b.oppPpg);
  const ppgRank = gp > 0 ? teamPpgRanked.findIndex(t => t.id === team.id) + 1 : 0;
  const defRank = gp > 0 ? teamDefRanked.findIndex(t => t.id === team.id) + 1 : 0;

  // ─ Player mapper ─
  const mapPlayer = (p: BasketballPlayer) => {
    const sd = p.sportData;
    // Determine how THIS TEAM acquired the player
    const acquiredVia = sd.acquiredVia;
    const acquiredSeason = sd.acquiredSeason;
    let howAcquired: string;
    if (acquiredVia === 'trade') {
      howAcquired = `traded for${acquiredSeason ? ` in ${acquiredSeason}` : ''}`;
    } else if (acquiredVia === 'free-agency') {
      howAcquired = `signed in free agency${acquiredSeason ? ` in ${acquiredSeason}` : ''}`;
    } else if (acquiredVia === 'draft') {
      howAcquired = `drafted${sd.draftRound ? ` in round ${sd.draftRound}` : ''}${sd.draftYear ? ` (${sd.draftYear})` : ''}${sd.draftPick ? `, pick #${sd.draftPick}` : ''}`;
    } else {
      howAcquired = 'on the original roster';
    }

    const stats = p.seasonStats;
    const playerGp = stats.gamesPlayed || 1;
    const ppgVal = stats.points / playerGp;
    const rpgVal = stats.totalRebounds / playerGp;
    const apgVal = stats.assists / playerGp;
    const spgVal = stats.steals / playerGp;
    const bpgVal = stats.blocks / playerGp;
    const tsAttempts = stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted;
    const tsPct = tsAttempts > 0 ? (stats.points / (2 * tsAttempts)) * 100 : 0;

    return {
      name: `${p.firstName} ${p.lastName}`,
      pos: sd.position,
      ovr: p.ratings.overall,
      age: p.age,
      potential: p.development.potential,
      starTier: sd.starTier,
      yearsInLeague: sd.yearsInLeague,
      howAcquired,
      stats: {
        gamesPlayed: stats.gamesPlayed,
        ppg: Math.round(ppgVal * 10) / 10,
        rpg: Math.round(rpgVal * 10) / 10,
        apg: Math.round(apgVal * 10) / 10,
        spg: Math.round(spgVal * 10) / 10,
        bpg: Math.round(bpgVal * 10) / 10,
        tsPct: Math.round(tsPct * 10) / 10,
        threePtMade: stats.threePointsMade,
        threePtAttempts: stats.threePointsAttempted,
      },
    };
  };

  // Star player — the team's leading scorer + best overall, used to drive the
  // narrative prompt's "lead with the star" rule.
  const starPlayer = topPlayers[0] ?? null;

  const winPct = gp > 0 ? Math.round((w / gp) * 1000) / 10 : 0;
  const ppg = gp > 0 ? Math.round((team.record.pointsFor / gp) * 10) / 10 : 0;
  const oppPpg = gp > 0 ? Math.round((team.record.pointsAgainst / gp) * 10) / 10 : 0;
  const pointDiff = team.record.pointsFor - team.record.pointsAgainst;
  const streakVal = getStreakValue(team.record.streak);
  const teamSd = team.sportData;

  const teamData: Record<string, unknown> = {
    team: {
      name: team.name,
      city: team.city,
      wins: w,
      losses: l,
      record: `${w}-${l}`,
      winPct: `${winPct}%`,
      conference: teamSd.conference,
      division: teamSd.division,
      streak:
        streakVal > 0 ? `W${streakVal}` : streakVal < 0 ? `L${Math.abs(streakVal)}` : '',
      pointsFor: team.record.pointsFor,
      pointsAgainst: team.record.pointsAgainst,
      pointDiff: pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`,
      ppg,
      oppPpg,
    },
    rankings: {
      ppgRank: `${ppgRank} of ${allTeams.length}`,
      defRank: `${defRank} of ${allTeams.length}`,
    },
    season,
    dayIndex,
    phase,
    coachName: opts.coachName ?? null,
    // Narrative trend data — gives the AI something concrete to reference
    // when describing how things have changed over the season.
    ...(gp >= 6
      ? {
          trendNarrative: (() => {
            const trends: string[] = [];
            if (streakVal >= 3) trends.push(`Currently on a ${streakVal}-game winning streak.`);
            else if (streakVal <= -3)
              trends.push(`Currently on a ${Math.abs(streakVal)}-game losing streak.`);

            if (starPlayer) {
              const stats = starPlayer.seasonStats;
              const playerGp = stats.gamesPlayed || 1;
              const ppgStar = stats.points / playerGp;
              const apgStar = stats.assists / playerGp;
              if (ppgStar >= 26) {
                trends.push(
                  `${starPlayer.firstName} ${starPlayer.lastName} is averaging ${ppgStar.toFixed(1)} PPG — squarely in the MVP conversation.`,
                );
              } else if (ppgStar >= 22 && apgStar >= 6) {
                trends.push(
                  `${starPlayer.firstName} ${starPlayer.lastName} is putting up ${ppgStar.toFixed(1)} / ${apgStar.toFixed(1)} as a primary creator.`,
                );
              } else if (ppgStar < 16 && starPlayer.sportData.starTier === 'star') {
                trends.push(
                  `${starPlayer.firstName} ${starPlayer.lastName} is only averaging ${ppgStar.toFixed(1)} PPG — well off star-tier pace.`,
                );
              }
            }

            if (gp >= 10) {
              if (ppg >= 118) trends.push(`Offense is averaging ${ppg.toFixed(1)} PPG — one of the most explosive in the league.`);
              else if (ppg <= 105) trends.push(`Offense struggling at just ${ppg.toFixed(1)} PPG.`);
              if (oppPpg <= 108) trends.push(`Defense is suffocating teams at ${oppPpg.toFixed(1)} PPG allowed.`);
              else if (oppPpg >= 120) trends.push(`Defense is leaking points — ${oppPpg.toFixed(1)} allowed per game.`);
            }

            return trends.length > 0 ? trends.join(' ') : null;
          })(),
        }
      : {}),
    capSpace: team.capState
      ? `$${Math.round(((team.capState.salaryCap - team.capState.currentPayroll) / 1_000_000) * 10) / 10}M`
      : null,
    capPct: team.capState
      ? `${Math.round((team.capState.currentPayroll / team.capState.salaryCap) * 100)}%`
      : null,
    starPlayer: starPlayer ? mapPlayer(starPlayer) : null,
    topPlayers: topPlayers.map(mapPlayer),
    injured: injured.map(p => ({
      name: `${p.firstName} ${p.lastName}`,
      pos: p.sportData.position,
      ovr: p.ratings.overall,
      injury: p.injury?.type,
      weeksLeft: p.injury?.weeksOut,
    })),
    youngStars: youngStars.map(p => ({
      name: `${p.firstName} ${p.lastName}`,
      pos: p.sportData.position,
      ovr: p.ratings.overall,
      age: p.age,
      potential: p.development.potential,
    })),
  };

  // ─ Narrative-specific context ─

  if (narrative === 'preseason') {
    const offseasonMoves = (opts.transactions ?? [])
      .filter(
        tx =>
          tx.season === season &&
          tx.teamIds.includes(team.id) &&
          (tx.kind === 'trade' || tx.kind === 'signing' || tx.kind === 'release' || tx.kind === 'draft' || tx.kind === 'pick'),
      )
      .slice(0, 12)
      .map(tx => ({ kind: tx.kind, summary: tx.summary, day: tx.day ?? null }));
    teamData.offseasonMoves = offseasonMoves;

    // Players drafted by this team this season
    const draftedThisYear = activeRoster
      .filter(p => p.sportData.acquiredVia === 'draft' && p.sportData.acquiredSeason === season)
      .map(mapPlayer);
    teamData.draftPicks = draftedThisYear;

    // FA signings this season
    const faSignings = activeRoster
      .filter(p => p.sportData.acquiredVia === 'free-agency' && p.sportData.acquiredSeason === season)
      .map(mapPlayer);
    teamData.freeAgencySignings = faSignings;
  }

  if (narrative === 'tradeDeadline') {
    teamData.tradeDeadlineDay = 115;
    const seasonTrades = (opts.transactions ?? [])
      .filter(tx => tx.kind === 'trade' && tx.season === season && tx.teamIds.includes(team.id))
      .map(tx => tx.summary);
    teamData.tradesThisSeason = seasonTrades;

    // Position group strength — average OVR per position group (G/F/C).
    const posGroups: Record<string, BasketballPlayer[]> = {};
    for (const p of activeRoster) {
      const grp =
        p.sportData.position === 'PG' || p.sportData.position === 'SG'
          ? 'guards'
          : p.sportData.position === 'SF' || p.sportData.position === 'PF'
            ? 'wings'
            : 'bigs';
      (posGroups[grp] ??= []).push(p);
    }
    const groupAvgs = Object.entries(posGroups)
      .map(([pos, players]) => ({
        pos,
        avgOvr: Math.round(players.reduce((s, p) => s + p.ratings.overall, 0) / Math.max(1, players.length)),
        count: players.length,
      }))
      .sort((a, b) => a.avgOvr - b.avgOvr);
    teamData.positionGroupStrength = groupAvgs;
  }

  if (narrative === 'allStarBreak') {
    // Conference standing snapshot at the break.
    const conf = teamSd.conference;
    const confTeams = (allTeams as BasketballTeam[]).filter(
      t => t.sportData.conference === conf,
    );
    const confSorted = [...confTeams].sort((a, b) => {
      const wa = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const wb = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return wb - wa;
    });
    teamData.allStarStandings = confSorted.slice(0, 12).map((t, i) => ({
      seed: i + 1,
      name: `${t.city} ${t.name}`,
      record: `${t.record.wins}-${t.record.losses}`,
      isUser: t.id === team.id,
    }));

    // Surface MVP candidates league-wide (by PPG + team success).
    const mvpPool = [...(allPlayers as BasketballPlayer[])]
      .filter(p => p.contract && (p.seasonStats.gamesPlayed ?? 0) >= 30)
      .map(p => ({
        name: `${p.firstName} ${p.lastName}`,
        team: allTeams.find(t => t.id === p.rosterSlot?.teamId)?.name ?? '',
        ppg: Math.round((p.seasonStats.points / Math.max(1, p.seasonStats.gamesPlayed)) * 10) / 10,
        apg: Math.round((p.seasonStats.assists / Math.max(1, p.seasonStats.gamesPlayed)) * 10) / 10,
        rpg: Math.round((p.seasonStats.totalRebounds / Math.max(1, p.seasonStats.gamesPlayed)) * 10) / 10,
      }))
      .sort((a, b) => b.ppg - a.ppg)
      .slice(0, 8);
    teamData.mvpCandidates = mvpPool;
  }

  if (narrative === 'playInStart') {
    teamData.playInContext =
      'Play-in tournament: seeds 7-10 in each conference. The 7v8 winner gets the 7-seed; the 7v8 loser plays the 9v10 winner for the 8-seed. Seeds 9 and 10 must win two games to make the field.';
    if (opts.playoffBracket?.playIn) {
      const userPI = opts.playoffBracket.playIn.find(
        s => !s.winnerTeamId && (s.teamA === team.id || s.teamB === team.id),
      );
      if (userPI) {
        const oppId = userPI.teamA === team.id ? userPI.teamB : userPI.teamA;
        const opp = oppId ? allTeams.find(t => t.id === oppId) : null;
        if (opp) {
          const oppRoster = (allPlayers as BasketballPlayer[]).filter(
            p => p.rosterSlot?.teamId === opp.id,
          );
          const oppStar = [...oppRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
          teamData.playInOpponent = {
            name: `${opp.city} ${opp.name}`,
            record: `${opp.record.wins}-${opp.record.losses}`,
            roundName: userPI.roundName,
            star: oppStar
              ? `${oppStar.firstName} ${oppStar.lastName} (${oppStar.sportData.position}, ${oppStar.ratings.overall} OVR)`
              : null,
          };
        }
      }
    }
  }

  if (narrative === 'playoffsStart') {
    const conf = teamSd.conference;
    const confTeams = (allTeams as BasketballTeam[]).filter(t => t.sportData.conference === conf);
    const confSorted = [...confTeams].sort((a, b) => {
      const wa = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const wb = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return wb - wa;
    });
    teamData.conferenceStandings = confSorted.slice(0, 10).map((t, i) => ({
      seed: i + 1,
      name: `${t.city} ${t.name}`,
      record: `${t.record.wins}-${t.record.losses}`,
      isUser: t.id === team.id,
    }));

    if (opts.playoffBracket) {
      const bracket = opts.playoffBracket;
      const confKey = conf as 'Eastern' | 'Western';
      const seedIdx = bracket.seeds[confKey]?.indexOf(team.id) ?? -1;
      const userSeed = seedIdx >= 0 ? seedIdx + 1 : 0;
      const madePlayoffs = userSeed > 0 && userSeed <= 8;
      teamData.madePlayoffs = madePlayoffs;
      teamData.userSeed = madePlayoffs ? userSeed : null;

      // First-round opponent — ONLY surface in the pre-First-Round preview.
      // After the user wins round 1, this entry would still resolve to the
      // (now-defeated) first-round opponent and the AI would confidently
      // name it as the next showdown. Gate on userPlayoffWins === 0 so the
      // field disappears the moment the user advances. (Mirrors football's
      // 5/22 stale-opponent guard.)
      if (userSeed > 0 && userSeed <= 8 && userPlayoffWins === 0) {
        const firstSeries = bracket.rounds[0]?.find(
          s => s.teamA === team.id || s.teamB === team.id,
        );
        if (firstSeries) {
          const oppId = firstSeries.teamA === team.id ? firstSeries.teamB : firstSeries.teamA;
          const opp = oppId ? allTeams.find(t => t.id === oppId) : null;
          if (opp) {
            const oppRoster = (allPlayers as BasketballPlayer[]).filter(
              p => p.rosterSlot?.teamId === opp.id,
            );
            const oppStar = [...oppRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
            teamData.firstRoundOpponent = {
              name: `${opp.city} ${opp.name}`,
              record: `${opp.record.wins}-${opp.record.losses}`,
              star: oppStar
                ? `${oppStar.firstName} ${oppStar.lastName} (${oppStar.sportData.position}, ${oppStar.ratings.overall} OVR)`
                : null,
            };
          }
        }
      }

      // Playoff stage tag — round labels mirror bracket.ts.
      const ROUND_LABELS = ['', 'First Round', 'Conference Semis', 'Conference Finals', 'NBA Finals'];
      const currentRoundIndex = userPlayoffWins + 1;
      const stageLabel = ROUND_LABELS[Math.min(currentRoundIndex, 4)] ?? 'Playoffs';
      teamData.playoffStage = {
        roundJustWon: ROUND_LABELS[userPlayoffWins] || null,
        nextRound: stageLabel,
        winsSoFar: userPlayoffWins,
      };

      // Next opponent — prefer the explicit nextOpponentId from the render
      // site (authoritative from a gated bracket-stable state). Fall back to
      // bracket derivation only when nextOpponentId is undefined.
      let nextOppId: string | null = null;
      let nextOppRoundIdx = 0;
      const allSeries = [...(bracket.playIn ?? []), ...bracket.rounds.flat()];
      if (typeof opts.nextOpponentId === 'string' && opts.nextOpponentId) {
        nextOppId = opts.nextOpponentId;
        const ng = allSeries.find(
          s =>
            !s.winnerTeamId &&
            ((s.teamA === team.id && s.teamB === nextOppId) ||
              (s.teamB === team.id && s.teamA === nextOppId)),
        );
        nextOppRoundIdx = ng?.round ?? Math.min(userPlayoffWins + 1, 4);
      } else if (opts.nextOpponentId === null) {
        // Render site explicitly told us there's no next matchup (eliminated
        // or title done) — skip nextPlayoffOpponent entirely.
        nextOppId = null;
      } else {
        const ng = allSeries.find(
          s => !s.winnerTeamId && (s.teamA === team.id || s.teamB === team.id),
        );
        if (ng) {
          nextOppId = ng.teamA === team.id ? ng.teamB : ng.teamA;
          nextOppRoundIdx = ng.round;
        }
      }
      if (nextOppId) {
        const opp = allTeams.find(t => t.id === nextOppId);
        if (opp) {
          const oppRoster = (allPlayers as BasketballPlayer[]).filter(
            p => p.rosterSlot?.teamId === opp.id,
          );
          const oppStar = [...oppRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
          teamData.nextPlayoffOpponent = {
            round: ROUND_LABELS[nextOppRoundIdx] ?? `Round ${nextOppRoundIdx}`,
            name: `${opp.city} ${opp.name}`,
            record: `${opp.record.wins}-${opp.record.losses}`,
            star: oppStar
              ? `${oppStar.firstName} ${oppStar.lastName} (${oppStar.sportData.position}, ${oppStar.ratings.overall} OVR)`
              : null,
          };
        }
      }
    }
  }

  if (narrative === 'seasonOver') {
    const bracket = opts.playoffBracket;
    const championship = bracket?.rounds[3]?.[0] ?? null;
    const wonChampionship = championship?.winnerTeamId === team.id;
    const madeChampionship =
      !!championship && (championship.teamA === team.id || championship.teamB === team.id);

    const allSeries = bracket
      ? [...(bracket.playIn ?? []), ...bracket.rounds.flat()]
      : [];
    const userSeries = allSeries.filter(
      s => s.winnerTeamId && (s.teamA === team.id || s.teamB === team.id),
    );
    const userWins = userSeries.filter(s => s.winnerTeamId === team.id).length;
    const userLosses = userSeries.filter(s => s.winnerTeamId && s.winnerTeamId !== team.id).length;

    // Who eliminated them?
    const eliminationSeries = userSeries.find(s => s.winnerTeamId !== team.id);
    const eliminatedById = eliminationSeries?.winnerTeamId ?? null;
    const eliminatedBy = eliminatedById ? allTeams.find(t => t.id === eliminatedById) : null;
    const ROUND_LABELS = ['', 'First Round', 'Conference Semis', 'Conference Finals', 'NBA Finals'];
    const eliminationRound = eliminationSeries
      ? ROUND_LABELS[eliminationSeries.round] ?? 'Playoffs'
      : null;

    // Dynasty check
    const champCount = (opts.champions ?? []).filter(c => c.teamId === team.id).length;

    // Key acquisitions that contributed this season
    const keyAcquisitions = activeRoster
      .filter(p => p.sportData.acquiredVia && p.sportData.acquiredVia !== 'initial' && p.ratings.overall >= 70)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .slice(0, 5)
      .map(mapPlayer);

    teamData.seasonResult = {
      wonChampionship,
      madeChampionship,
      playoffRecord: `${userWins}-${userLosses}`,
      eliminatedBy: eliminatedBy ? `${eliminatedBy.city} ${eliminatedBy.name}` : null,
      eliminationRound,
      championshipCount: champCount,
    };
    teamData.keyAcquisitions = keyAcquisitions;

    const seasonTrades = (opts.transactions ?? [])
      .filter(tx => tx.kind === 'trade' && tx.season === season && tx.teamIds.includes(team.id))
      .map(tx => tx.summary);
    teamData.tradesThisSeason = seasonTrades;
  }

  // ─ Fallback name pool ─
  // Build a pool of fallback player names from the user roster so the UI
  // never shows "Player" if the AI forgets to set playerName on a player
  // exchange.
  const rosterPool = roster
    .filter(p => p.ratings.overall >= 65)
    .map(p => `${p.firstName} ${p.lastName}`);
  let fallbackIdx = 0;
  function pickFallbackName(): string {
    if (rosterPool.length === 0) return 'Team Captain';
    const name = rosterPool[fallbackIdx % rosterPool.length];
    fallbackIdx++;
    return name;
  }

  type RawTopic = {
    headline: string;
    icon: string;
    exchanges: { speakerId: 'stats' | 'hottake' | 'fans' | 'player'; text: string; playerName?: string }[];
  };

  // Player-voice signals. The AI occasionally returns a hashtag-laden,
  // emoji-heavy social post tagged as the analyst/hot-take voice. Reroute
  // mis-tagged exchanges before render so the misclassification can't slip
  // through even if the prompt drifts.
  const HASHTAG_RE = /#[A-Za-z][A-Za-z0-9]+/;
  const HYPE_EMOJI_RE = /[💯🔥💪🙏👀😤😈🏀⚡️]/u;
  function looksLikePlayerVoice(text: string): boolean {
    return HASHTAG_RE.test(text) || HYPE_EMOJI_RE.test(text);
  }

  function adaptTopic(t: RawTopic): AiSpotlightTopic {
    return {
      headline: t.headline,
      icon: t.icon,
      exchanges: t.exchanges.map(e => {
        // Reroute commentator exchanges that read like player social posts.
        if ((e.speakerId === 'stats' || e.speakerId === 'hottake') && looksLikePlayerVoice(e.text)) {
          return {
            ...e,
            speakerId: 'player' as const,
            playerName:
              e.playerName && e.playerName.trim() !== '' && e.playerName !== 'Player'
                ? e.playerName
                : pickFallbackName(),
          };
        }
        if (
          e.speakerId === 'player' &&
          (!e.playerName || e.playerName === 'Player' || e.playerName.trim() === '')
        ) {
          return { ...e, playerName: pickFallbackName() };
        }
        return { ...e, playerName: e.playerName };
      }),
      teamIds: [team.id],
      playerIds: [] as string[],
    };
  }

  // ─ Streaming pipeline ─
  // Topics arrive one at a time via NDJSON; each one is pushed into
  // cache.topics and broadcast to subscribers immediately. The promise we
  // return resolves on the FIRST topic so SpotlightPopup's gate flips early.
  const accumulated: AiSpotlightTopic[] = [];
  let firstSignal: (() => void) | null = null;
  const firstSignalPromise = new Promise<void>((resolve) => {
    firstSignal = resolve;
  });
  const triggerFirstSignal = () => {
    if (firstSignal) {
      firstSignal();
      firstSignal = null;
    }
  };

  const streamPromise = (async () => {
    try {
      const res = await fetch('/api/spotlight?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamData, narrative }),
      });
      if (!res.ok || !res.body) {
        throw new Error('API error');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawError = false;

      let streamDone = false;
      while (!streamDone) {
        const { value, done } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }
        buf += decoder.decode(value, { stream: true });

        let nl = buf.indexOf('\n');
        while (nl !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (!line) continue;

          if (cache.key !== key) {
            try { await reader.cancel(); } catch { /* ignore */ }
            return;
          }

          let evt: { type?: string; data?: unknown; message?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === 'topic' && evt.data) {
            const adapted = adaptTopic(evt.data as RawTopic);
            accumulated.push(adapted);
            cache.topics = [...accumulated];
            cache.loading = accumulated.length === 0; // false now
            notify();
            triggerFirstSignal();
          } else if (evt.type === 'error') {
            sawError = true;
            console.warn(
              '[AI Spotlight] stream error:',
              (evt as { message?: string }).message,
              (evt as { details?: unknown }).details,
            );
          }
        }
      }

      if (cache.key !== key) return;

      if (accumulated.length === 0) {
        cache.loading = false;
        cache.error = true;
        cache.key = '';
        notify();
      } else {
        cache.loading = false;
        cache.error = sawError;
        notify();
      }
    } catch {
      if (cache.key !== key) return;
      cache.loading = false;
      cache.error = true;
      cache.key = '';
      notify();
    } finally {
      triggerFirstSignal();
    }
  })();

  cache.promise = Promise.race([firstSignalPromise, streamPromise]);
  return cache.promise;
}

// Re-export for callers that want the bracket type from the same place
// they're importing fetchAiSpotlight from.
export type { PlayoffBracketLite, PlayoffSeriesLite };

// Silence "unused import" for BaseGameResult — kept in the import list because
// the FetchOptions signature documents that callers pass roster + games out of
// a BaseLeagueState<BasketballRatings, BasketballStats>. Avoids a tslint
// follow-up if/when we extend the options to include game-derived context.
type _GameResult = BaseGameResult<BasketballStats>;
type _State = LeagueState;
type _Unused = _GameResult | _State;
