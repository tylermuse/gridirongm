/**
 * AI Spotlight — shared pre-fetch cache for AI-generated commentary.
 *
 * The SpotlightPopup triggers fetchAiSpotlight() as soon as a spotlight-worthy
 * state change is detected. By the time the user clicks through to the home page,
 * the result is already cached and ready to render.
 */

import type { Team, Player } from '@/types';

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

export function fetchAiSpotlight(
  team: Team,
  roster: Player[],
  allTeams: Team[],
  season: number,
  week: number,
  phase: string,
) {
  const gp = team.record.wins + team.record.losses;
  if (gp === 0) return;

  const key = buildCacheKey(team.id, season, week, team.record.wins, team.record.losses, phase);
  // Already fetched or in-flight for this state
  if (key === cache.key && (cache.topics || cache.loading)) return;

  cache.key = key;
  cache.topics = null;
  cache.loading = true;
  cache.error = false;
  notify();

  const activeRoster = roster.filter(p => !p.retired);
  const topPlayers = [...activeRoster].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 8);
  const injured = activeRoster.filter(p => p.injury).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 3);
  const youngStars = activeRoster.filter(p => p.age <= 25 && p.potential >= 75).sort((a, b) => b.potential - a.potential).slice(0, 3);

  const allTeamsPpg = allTeams.map(t => ({ id: t.id, ppg: t.record.pointsFor / Math.max(1, t.record.wins + t.record.losses) })).sort((a, b) => b.ppg - a.ppg);
  const allTeamsDefPpg = allTeams.map(t => ({ id: t.id, oppPpg: t.record.pointsAgainst / Math.max(1, t.record.wins + t.record.losses) })).sort((a, b) => a.oppPpg - b.oppPpg);
  const ppgRank = allTeamsPpg.findIndex(t => t.id === team.id) + 1;
  const defRank = allTeamsDefPpg.findIndex(t => t.id === team.id) + 1;

  const teamData = {
    team: { name: team.name, city: team.city, record: `${team.record.wins}-${team.record.losses}`, conference: team.conference, streak: team.record.streak, pointsFor: team.record.pointsFor, pointsAgainst: team.record.pointsAgainst },
    rankings: { ppgRank, defRank, totalTeams: allTeams.length },
    season, week, phase,
    capSpace: Math.round((team.salaryCap - team.totalPayroll) * 10) / 10,
    capPct: Math.round(team.totalPayroll / team.salaryCap * 100),
    topPlayers: topPlayers.map(p => ({ name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, age: p.age, potential: p.potential, salary: p.contract.salary, yearsLeft: p.contract.yearsLeft, stats: { passYds: p.stats.passYards, passTDs: p.stats.passTDs, rushYds: p.stats.rushYards, rushTDs: p.stats.rushTDs, recYds: p.stats.receivingYards, recTDs: p.stats.receivingTDs, tackles: p.stats.tackles, sacks: p.stats.sacks, ints: p.stats.interceptions } })),
    injured: injured.map(p => ({ name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, injury: p.injury?.type, weeksLeft: p.injury?.weeksLeft })),
    youngStars: youngStars.map(p => ({ name: `${p.firstName} ${p.lastName}`, pos: p.position, ovr: p.ratings.overall, age: p.age, potential: p.potential })),
  };

  cache.promise = fetch('/api/spotlight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamData }),
  })
    .then(res => res.ok ? res.json() : Promise.reject(new Error('API error')))
    .then(data => {
      // Only update if this is still the current request
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
      // Clear the key so a retry is possible
      cache.key = '';
      notify();
    });
}
