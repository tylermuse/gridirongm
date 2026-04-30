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
  playoffSeeds?: { AC: string[]; NC: string[] } | null,
): NarrativeMoment {
  // 1. START OF SEASON: preseason phase or week 1 of regular season
  if (phase === 'preseason') return 'preseason';
  if (phase === 'regular' && week === 1) return 'preseason';

  // 2. TRADE DEADLINE: at or just past the deadline week
  if (phase === 'regular' && week >= tradeDeadlineWeek && week <= tradeDeadlineWeek + 1) {
    return 'tradeDeadline';
  }

  // 3. END OF REGULAR SEASON for non-playoff teams:
  //    If we're past week 18 in regular season, or entering playoffs and user team didn't make it
  if (phase === 'regular' && week >= 18) {
    // Check if user missed playoffs (seeds don't include them)
    if (playoffSeeds) {
      const allSeeds = [...(playoffSeeds.AC ?? []), ...(playoffSeeds.NC ?? [])];
      if (!allSeeds.includes(userTeamId)) return 'seasonOver';
    }
  }

  // 4. PLAYOFFS START: entered playoffs and user team is still active
  if (phase === 'playoffs' && playoffBracket) {
    const userLost = playoffBracket.some(m =>
      m.winnerId &&
      (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId) &&
      m.winnerId !== userTeamId
    );
    const champGame = playoffBracket.find(m => m.round === 4 && m.winnerId);
    const userWonChamp = champGame?.winnerId === userTeamId;

    // 5. ELIMINATED or WON CHAMPIONSHIP
    if (userWonChamp) return 'seasonOver';
    if (userLost) return 'seasonOver';

    // Check if user team didn't make playoffs at all
    if (playoffSeeds) {
      const allSeeds = [...(playoffSeeds.AC ?? []), ...(playoffSeeds.NC ?? [])];
      if (!allSeeds.includes(userTeamId)) return 'seasonOver';
    }

    return 'playoffsStart';
  }
  if (phase === 'playoffs') return 'playoffsStart';

  // 6. OFFSEASON: entering re-signing/draft/FA
  if (phase === 'resigning' || phase === 'draft' || phase === 'freeAgency') {
    return 'seasonOver';
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

  // Starting QB — use depth chart if available, fall back to highest OVR
  const qbDepthChart = team.depthChart?.QB ?? [];
  const allQBs = activeRoster.filter(p => p.position === 'QB').sort((a, b) => {
    const aIdx = qbDepthChart.indexOf(a.id);
    const bIdx = qbDepthChart.indexOf(b.id);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx; // depth chart order
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return b.ratings.overall - a.ratings.overall;
  });
  const startingQB = allQBs[0] ?? null;
  const backupQB = allQBs[1] ?? null;

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
    // Narrative trend data — helps AI reference how things have changed over the season
    ...(gamesPlayed >= 6 ? {
      trendNarrative: (() => {
        const trends: string[] = [];
        // Team win streak / skid
        if (team.record.streak >= 3) trends.push(`Currently on a ${team.record.streak}-game winning streak.`);
        else if (team.record.streak <= -3) trends.push(`Currently on a ${Math.abs(team.record.streak)}-game losing streak.`);

        // QB trend: compare INTs per game in early season vs recent
        if (startingQB && startingQB.stats.gamesPlayed >= 4) {
          const totalINTs = startingQB.stats.interceptions;
          const totalTDs = startingQB.stats.passTDs;
          const gp = startingQB.stats.gamesPlayed;
          const intRate = totalINTs / gp;
          const tdRate = totalTDs / gp;
          if (intRate >= 1.5) trends.push(`${startingQB.firstName} ${startingQB.lastName} is averaging ${intRate.toFixed(1)} INTs per game — a major concern.`);
          else if (intRate <= 0.5 && tdRate >= 2) trends.push(`${startingQB.firstName} ${startingQB.lastName} has been elite — ${tdRate.toFixed(1)} TDs per game with only ${intRate.toFixed(1)} INTs.`);

          // TD:INT ratio as narrative
          const ratio = totalINTs > 0 ? (totalTDs / totalINTs) : totalTDs;
          if (ratio < 1.0) trends.push(`QB TD-to-INT ratio is ${ratio.toFixed(1)} — he's turning the ball over more than he's scoring.`);
          else if (ratio >= 3.0) trends.push(`QB TD-to-INT ratio is an elite ${ratio.toFixed(1)}.`);
        }

        // Scoring trend
        if (gamesPlayed >= 8) {
          const ppgVal = team.record.pointsFor / gamesPlayed;
          if (ppgVal >= 28) trends.push(`Offense is averaging ${ppgVal.toFixed(1)} PPG — one of the most explosive in the league.`);
          else if (ppgVal <= 16) trends.push(`Offense struggling at just ${ppgVal.toFixed(1)} PPG.`);
        }

        return trends.length > 0 ? trends.join(' ') : null;
      })(),
    } : {}),
    capSpace: `$${Math.round((team.salaryCap - team.totalPayroll) * 10) / 10}M`,
    capPct: `${Math.round(team.totalPayroll / team.salaryCap * 100)}%`,
    startingQB: startingQB ? { ...mapPlayer(startingQB), depthChartPosition: 'starter (QB1)' } : null,
    backupQB: backupQB ? { ...mapPlayer(backupQB), depthChartPosition: 'backup (QB2)', ovrGap: startingQB ? startingQB.ratings.overall - backupQB.ratings.overall : 0, qbCompetition: backupQB && startingQB && Math.abs(startingQB.ratings.overall - backupQB.ratings.overall) <= 5 ? 'close — potential QB competition' : null } : null,
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

  // Build a pool of fallback player names from the user roster.
  // The AI sometimes forgets to set playerName on player exchanges — we
  // backfill with a real player from the team so the UI never shows "Player".
  const rosterPool = roster
    .filter(p => !p.retired && p.ratings.overall >= 65)
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
  // emoji-heavy social post tagged as Marcus/Tony — Tyler caught one
  // attributed to Marcus saying "Gonna rise and grind this offseason!
  // #RedBirds #NextLevel". Hashtags + hype emojis are PLAYER signals,
  // not commentator voice. Reroute mis-tagged exchanges before render
  // so the misclassification can't slip through even if the prompt drifts.
  const HASHTAG_RE = /#[A-Za-z][A-Za-z0-9]+/;
  const HYPE_EMOJI_RE = /[💯🔥💪🙏👀😤😈🦅🐻🦁🦌🐯🐅⚡️]/u;
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
            playerName: e.playerName && e.playerName.trim() !== '' && e.playerName !== 'Player'
              ? e.playerName
              : pickFallbackName(),
          };
        }
        if (e.speakerId === 'player' && (!e.playerName || e.playerName === 'Player' || e.playerName.trim() === '')) {
          return { ...e, playerName: pickFallbackName() };
        }
        return { ...e, playerName: e.playerName };
      }),
      teamIds: [team.id],
      playerIds: [] as string[],
    };
  }

  // Streaming pipeline. Topics arrive one at a time via NDJSON; each one is
  // pushed into cache.topics and broadcast to subscribers immediately. The
  // promise we return resolves on the FIRST topic so SpotlightPopup's gate
  // flips early — perceived load drops from "wait for full output" to
  // "wait for one topic".
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

      // Read the response as NDJSON. Each line is a {type, ...} event. We
      // bail out if the cache key changed mid-stream — a newer fetch has
      // taken over and any further updates would clobber it.
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
            // Surface server-side failures to the browser console so they're
            // diagnosable without Vercel log access.
            console.warn(
              '[AI Spotlight] stream error:',
              (evt as { message?: string }).message,
              (evt as { details?: unknown }).details,
            );
          }
          // 'done' is implicit at stream end; nothing to do here.
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
      // Belt-and-suspenders: if no topic ever arrived, still flip the popup
      // gate so it doesn't hang. Home page templates will fill in the gap.
      triggerFirstSignal();
    }
  })();

  // Settle on first topic or full completion — whichever lands first.
  // Subscribers continue to get notified for later topics via notify().
  cache.promise = Promise.race([firstSignalPromise, streamPromise]);
  return cache.promise;
}
