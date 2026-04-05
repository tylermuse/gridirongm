/**
 * AI Spotlight — shared pre-fetch cache for AI-generated commentary.
 *
 * The SpotlightPopup triggers fetchAiSpotlight() as soon as a spotlight-worthy
 * state change is detected. By the time the user clicks through to the home page,
 * the result is already cached and ready to render.
 *
 * Supports narrative-specific moments:
 *  - preseason: offseason recap (draft picks, FA signings, trades)
 *  - tradeDeadline: midseason assessment, trade suggestions
 *  - playoffsStart: end-of-regular-season playoffs preview
 *  - seasonOver: elimination or championship wrap-up
 *  - weekly: standard weekly analysis (default)
 */

import type { Team, Player, NewsItem, PlayoffMatchup, DraftSelection } from '@/types';

export type NarrativeMoment = 'preseason' | 'tradeDeadline' | 'playoffsStart' | 'seasonOver' | 'weekly';

export interface AiSpotlightTopic {
  headline: string;
  icon: string;
  exchanges: { speakerId: 'stats' | 'hottake'; text: string }[];
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

export function buildCacheKey(teamId: string, season: number, week: number, wins: number, losses: number, phase: string) {
  return `${teamId}-s${season}-w${week}-${wins}-${losses}-${phase}`;
}

/** Detect narrative moment from game state */
export function detectNarrativeMoment(
  phase: string,
  week: number,
  tradeDeadlineWeek: number,
  playoffBracket: PlayoffMatchup[] | null,
  userTeamId: string,
): NarrativeMoment {
  // Preseason: either the literal preseason phase OR when starting a new season (week 1, regular)
  if (phase === 'preseason') return 'preseason';
  if (phase === 'regular' && week === 1) return 'preseason';

  // Season over: entering re-signing/draft/FA after playoffs
  if ((phase === 'resigning' || phase === 'draft' || phase === 'freeAgency') && playoffBracket) {
    return 'seasonOver';
  }

  // Playoffs start: entered playoffs phase (regardless of games played)
  if (phase === 'playoffs') {
    return 'playoffsStart';
  }

  // Trade deadline: at or just past the deadline week (catches sim-past-it)
  if (phase === 'regular' && week >= tradeDeadlineWeek && week <= tradeDeadlineWeek + 1) {
    return 'tradeDeadline';
  }

  return 'weekly';
}

interface FetchOptions {
  team: Team;
  roster: Player[];
  allTeams: Team[];
  allPlayers: Player[];
  season: number;
  week: number;
  phase: string;
  narrative: NarrativeMoment;
  newsItems?: NewsItem[];
  draftResults?: DraftSelection[];
  playoffBracket?: PlayoffMatchup[] | null;
  playoffSeeds?: { AC: string[]; NC: string[] } | null;
  champions?: { season: number; teamId: string }[];
  tradeDeadlineWeek?: number;
}

export function fetchAiSpotlight(opts: FetchOptions): Promise<void> {
  const { team, roster, allTeams, allPlayers, season, week, phase, narrative } = opts;

  const gp = team.record.wins + team.record.losses;
  // Allow preseason (gp=0) and seasonOver
  if (gp === 0 && narrative !== 'preseason' && narrative !== 'seasonOver') return Promise.resolve();

  const key = buildCacheKey(team.id, season, week, team.record.wins, team.record.losses, `${phase}-${narrative}`);
  if (key === cache.key && (cache.topics || cache.loading)) return cache.promise ?? Promise.resolve();

  cache.key = key;
  cache.topics = null;
  cache.loading = true;
  cache.error = false;
  notify();

  const activeRoster = roster.filter(p => !p.retired);
  const topPlayers = [...activeRoster].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 10);
  const injured = activeRoster.filter(p => p.injury).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 3);
  const youngStars = activeRoster.filter(p => p.age <= 25 && p.potential >= 75).sort((a, b) => b.potential - a.potential).slice(0, 3);

  const allTeamsPpg = allTeams.map(t => ({ id: t.id, ppg: t.record.pointsFor / Math.max(1, t.record.wins + t.record.losses) })).sort((a, b) => b.ppg - a.ppg);
  const allTeamsDefPpg = allTeams.map(t => ({ id: t.id, oppPpg: t.record.pointsAgainst / Math.max(1, t.record.wins + t.record.losses) })).sort((a, b) => a.oppPpg - b.oppPpg);
  const ppgRank = gp > 0 ? allTeamsPpg.findIndex(t => t.id === team.id) + 1 : 0;
  const defRank = gp > 0 ? allTeamsDefPpg.findIndex(t => t.id === team.id) + 1 : 0;

  // Build player data with clear acquisition context
  const mapPlayer = (p: Player) => {
    // Determine how THIS TEAM acquired the player (not how they entered the league)
    let howAcquired: string;
    const draftedByThisTeam = p.draftTeamId === team.id;
    if (p.acquiredVia === 'trade') {
      howAcquired = `traded for${p.acquiredSeason ? ` in ${p.acquiredSeason}` : ''}`;
    } else if (p.acquiredVia === 'free-agency') {
      howAcquired = `signed in free agency${p.acquiredSeason ? ` in ${p.acquiredSeason}` : ''}`;
    } else if (p.acquiredVia === 'draft' && draftedByThisTeam) {
      howAcquired = `drafted by this team${p.draftRound ? ` in round ${p.draftRound}` : ''}${p.draftYear ? ` (${p.draftYear})` : ''}`;
    } else if (p.acquiredVia === 'draft' && !draftedByThisTeam) {
      howAcquired = 'original roster';
    } else {
      howAcquired = 'original roster';
    }

    return {
      name: `${p.firstName} ${p.lastName}`,
      pos: p.position,
      ovr: p.ratings.overall,
      age: p.age,
      potential: p.potential,
      salary: p.contract.salary,
      yearsLeft: p.contract.yearsLeft,
      howAcquired,
      stats: {
        passYds: p.stats.passYards, passTDs: p.stats.passTDs,
        rushYds: p.stats.rushYards, rushTDs: p.stats.rushTDs,
        recYds: p.stats.receivingYards, recTDs: p.stats.receivingTDs,
        tackles: p.stats.tackles, sacks: p.stats.sacks, ints: p.stats.interceptions,
      },
    };
  };

  // Starting QB is the most important player — always include with full stats
  const startingQB = activeRoster
    .filter(p => p.position === 'QB')
    .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];

  const gamesPlayed = team.record.wins + team.record.losses;
  const winPct = gamesPlayed > 0 ? Math.round((team.record.wins / gamesPlayed) * 1000) / 10 : 0;
  const ppg = gamesPlayed > 0 ? Math.round(team.record.pointsFor / gamesPlayed * 10) / 10 : 0;
  const oppPpg = gamesPlayed > 0 ? Math.round(team.record.pointsAgainst / gamesPlayed * 10) / 10 : 0;
  const pointDiff = team.record.pointsFor - team.record.pointsAgainst;

  const teamData: Record<string, unknown> = {
    team: {
      name: team.name, city: team.city,
      wins: team.record.wins, losses: team.record.losses, ties: team.record.ties ?? 0,
      record: `${team.record.wins}-${team.record.losses}${team.record.ties ? `-${team.record.ties}` : ''}`,
      winPct: `${winPct}%`,
      conference: team.conference,
      streak: team.record.streak,
      pointsFor: team.record.pointsFor, pointsAgainst: team.record.pointsAgainst,
      pointDiff: pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`,
      ppg, oppPpg,
    },
    rankings: { ppgRank: `${ppgRank} of ${allTeams.length}`, defRank: `${defRank} of ${allTeams.length}` },
    season, week, phase,
    capSpace: `$${Math.round((team.salaryCap - team.totalPayroll) * 10) / 10}M`,
    capPct: `${Math.round(team.totalPayroll / team.salaryCap * 100)}%`,
    startingQB: startingQB ? mapPlayer(startingQB) : null,
    topPlayers: topPlayers.map(mapPlayer),
    injured: injured.map(p => ({ name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, injury: p.injury?.type, weeksLeft: p.injury?.weeksLeft })),
    youngStars: youngStars.map(p => ({ name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, age: p.age, potential: p.potential })),
  };

  // Add narrative-specific context
  if (narrative === 'preseason' && opts.newsItems) {
    // Offseason transactions for the user's team
    const offseasonNews = opts.newsItems
      .filter(n => n.isUserTeam && (n.type === 'trade' || n.type === 'signing' || n.type === 'release'))
      .map(n => ({ type: n.type, headline: n.headline, week: n.week }));
    teamData.offseasonMoves = offseasonNews;

    // Draft picks this season
    if (opts.draftResults) {
      const teamPicks = opts.draftResults.filter(dr => dr.teamId === team.id);
      const draftedPlayers = teamPicks.map(dr => {
        const p = allPlayers.find(pl => pl.id === dr.playerId);
        return p ? { name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, potential: p.potential, round: dr.round, pick: dr.overallPick } : null;
      }).filter(Boolean);
      teamData.draftPicks = draftedPlayers;
    }

    // Recent FA signings
    const recentSignings = activeRoster
      .filter(p => p.acquiredVia === 'free-agency' && p.acquiredSeason === season)
      .map(mapPlayer);
    teamData.freeAgencySignings = recentSignings;
  }

  if (narrative === 'tradeDeadline') {
    teamData.tradeDeadlineWeek = opts.tradeDeadlineWeek ?? 12;
    // Trades made this season
    const seasonTrades = (opts.newsItems ?? [])
      .filter(n => n.isUserTeam && n.type === 'trade' && n.season === season)
      .map(n => n.headline);
    teamData.tradesThisSeason = seasonTrades;

    // Roster needs: find weakest position groups
    const posGroups: Record<string, Player[]> = {};
    for (const p of activeRoster) {
      (posGroups[p.position] ??= []).push(p);
    }
    const groupAvgs = Object.entries(posGroups).map(([pos, players]) => ({
      pos, avgOvr: Math.round(players.reduce((s, p) => s + p.ratings.overall, 0) / players.length), count: players.length,
    })).sort((a, b) => a.avgOvr - b.avgOvr);
    teamData.positionGroupStrength = groupAvgs;
  }

  if (narrative === 'playoffsStart') {
    // Conference standings
    const confTeams = allTeams.filter(t => t.conference === team.conference);
    const confSorted = [...confTeams].sort((a, b) => {
      const wa = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const wb = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return wb - wa;
    });
    teamData.conferenceStandings = confSorted.slice(0, 7).map((t, i) => ({
      seed: i + 1, name: `${t.city} ${t.name}`, record: `${t.record.wins}-${t.record.losses}`, isUser: t.id === team.id,
    }));

    if (opts.playoffSeeds) {
      const conf = team.conference as 'AC' | 'NC';
      const userSeed = (opts.playoffSeeds[conf]?.indexOf(team.id) ?? -1) + 1;
      const madePlayoffs = userSeed > 0 && userSeed <= 7;
      teamData.madePlayoffs = madePlayoffs;
      teamData.userSeed = madePlayoffs ? userSeed : null;

      // First round opponent
      if (userSeed > 0 && userSeed <= 7 && opts.playoffBracket) {
        const firstGame = opts.playoffBracket.find(m =>
          m.round === 1 && (m.homeTeamId === team.id || m.awayTeamId === team.id));
        if (firstGame) {
          const oppId = firstGame.homeTeamId === team.id ? firstGame.awayTeamId : firstGame.homeTeamId;
          const opp = allTeams.find(t => t.id === oppId);
          if (opp) {
            const oppRoster = allPlayers.filter(p => p.teamId === opp.id && !p.retired);
            const oppStar = [...oppRoster].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
            teamData.firstRoundOpponent = {
              name: `${opp.city} ${opp.name}`, record: `${opp.record.wins}-${opp.record.losses}`,
              star: oppStar ? `${oppStar.firstName} ${oppStar.lastName} (${oppStar.position}, ${oppStar.ratings.overall} OVR)` : null,
            };
          }
        }
      }
    }
  }

  if (narrative === 'seasonOver') {
    // Determine result
    const bracket = opts.playoffBracket ?? [];
    const championship = bracket.find(m => m.id === 'championship');
    const wonChampionship = championship?.winnerId === team.id;
    const madeChampionship = championship && (championship.homeTeamId === team.id || championship.awayTeamId === team.id);

    // User's playoff record
    const userGames = bracket.filter(m => m.winnerId && (m.homeTeamId === team.id || m.awayTeamId === team.id));
    const userWins = userGames.filter(m => m.winnerId === team.id).length;
    const userLosses = userGames.filter(m => m.winnerId && m.winnerId !== team.id).length;

    // Find who eliminated them
    const eliminationGame = userGames.find(m => m.winnerId !== team.id);
    const eliminatedById = eliminationGame?.winnerId;
    const eliminatedBy = eliminatedById ? allTeams.find(t => t.id === eliminatedById) : null;

    const roundNames = ['', 'Wild Card', 'Divisional', 'Conference Championship', 'Championship'];
    const eliminationRound = eliminationGame ? roundNames[eliminationGame.round] ?? 'Playoffs' : null;

    // Dynasty check
    const champCount = (opts.champions ?? []).filter(c => c.teamId === team.id).length;

    // Key acquisitions that contributed this season
    const keyAcquisitions = activeRoster
      .filter(p => p.acquiredVia && p.acquiredVia !== 'initial' && p.ratings.overall >= 70)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .slice(0, 5)
      .map(mapPlayer);

    teamData.seasonResult = {
      wonChampionship, madeChampionship: !!madeChampionship,
      playoffRecord: `${userWins}-${userLosses}`,
      eliminatedBy: eliminatedBy ? `${eliminatedBy.city} ${eliminatedBy.name}` : null,
      eliminationRound,
      championshipCount: champCount,
    };
    teamData.keyAcquisitions = keyAcquisitions;

    // Season trades
    const seasonTrades = (opts.newsItems ?? [])
      .filter(n => n.isUserTeam && n.type === 'trade' && n.season === season)
      .map(n => n.headline);
    teamData.tradesThisSeason = seasonTrades;
  }

  const p = fetch('/api/spotlight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamData, narrative }),
  })
    .then(res => res.ok ? res.json() : Promise.reject(new Error('API error')))
    .then(data => {
      if (cache.key !== key) return;
      cache.topics = (data.topics as { headline: string; icon: string; exchanges: { speakerId: 'stats' | 'hottake'; text: string }[] }[]).map(t => ({
        headline: t.headline,
        icon: t.icon,
        exchanges: t.exchanges,
        teamIds: [team.id],
        playerIds: [] as string[],
      }));
      cache.loading = false;
      cache.error = false;
      notify();
    })
    .catch(() => {
      if (cache.key !== key) return;
      cache.loading = false;
      cache.error = true;
      cache.key = '';
      notify();
    });

  cache.promise = p;
  return p;
}
