/**
 * GM Rankings (parity audit #8).
 *
 * Ranks every front office in the league by a composite "GM score" — not raw
 * team strength (that's Power Rankings) but how well the front office is doing
 * across results, roster talent, young-core upside, cap health, and franchise
 * legacy. Fully derived from current state + season history; nothing persisted,
 * so it works on any save. This is a within-league leaderboard (the meaningful
 * comparison), not a cross-save one.
 */

import { basketballTeamCapStatus, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { SeasonHistoryEntry } from '../history';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface GmScoreComponents {
  results: number;
  talent: number;
  future: number;
  capHealth: number;
  legacy: number;
}

export interface GmRanking {
  teamId: string;
  rank: number;
  score: number;
  record: string;
  components: GmScoreComponents;
  tier: { label: string; color: string };
  isUser: boolean;
}

const WEIGHTS: GmScoreComponents = { results: 0.35, talent: 0.22, future: 0.16, capHealth: 0.12, legacy: 0.15 };

function clamp(n: number): number { return Math.max(0, Math.min(100, n)); }

function rosterOf(league: LeagueState, team: BasketballTeam): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
}

function historyEntries(league: LeagueState): SeasonHistoryEntry[] {
  const raw = league.seasonHistory as Record<number, SeasonHistoryEntry> | undefined;
  if (!raw) return [];
  return Object.values(raw).filter((e): e is SeasonHistoryEntry => !!e && typeof e.season === 'number');
}

function scoreTeam(league: LeagueState, team: BasketballTeam, history: SeasonHistoryEntry[]): GmRanking {
  const roster = rosterOf(league, team);
  const season = league.currentSeason;

  // Results — win% this season, with point differential as a tiebreak nudge.
  const gp = team.record.wins + team.record.losses + (team.record.otherResults ?? 0);
  const winPct = gp > 0 ? team.record.wins / gp : 0.5;
  const diffPg = gp > 0 ? (team.record.pointsFor - team.record.pointsAgainst) / gp : 0;
  const results = clamp(winPct * 100 + diffPg * 1.5);

  // Talent — average of the top 8 overalls, mapped 60→0, 90→100.
  const top8 = [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 8);
  const avgTop8 = top8.length ? top8.reduce((s, p) => s + p.ratings.overall, 0) / top8.length : 60;
  const talent = clamp(((avgTop8 - 60) / 30) * 100);

  // Future — promising young players (age ≤ 23, OVR ≥ 70), up to 4 → 100.
  const youngStuds = roster.filter(p => p.age <= 23 && p.ratings.overall >= 70).length;
  const future = clamp((youngStuds / 4) * 100);

  // Cap health — reward flexibility, penalize paying tax for a losing team.
  const cap = basketballTeamCapStatus(roster, season);
  let capHealth = 60;
  if (cap.capRoom > 0) capHealth = 75 + Math.min(25, (cap.capRoom / 1e6) * 0.8);
  else if (cap.isOverSecondApron) capHealth = winPct >= 0.55 ? 55 : 20;
  else if (cap.isOverTax) capHealth = winPct >= 0.5 ? 60 : 35;
  else capHealth = 65;
  capHealth = clamp(capHealth);

  // Legacy — championships + Finals appearances across recorded history.
  let titles = 0, finals = 0;
  for (const h of history) {
    if (h.champion === team.id) { titles++; finals++; }
    else if (h.runnerUp === team.id) finals++;
  }
  const legacy = clamp(titles * 45 + finals * 15);

  const score =
    results * WEIGHTS.results +
    talent * WEIGHTS.talent +
    future * WEIGHTS.future +
    capHealth * WEIGHTS.capHealth +
    legacy * WEIGHTS.legacy;

  return {
    teamId: team.id,
    rank: 0,
    score: Math.round(score * 10) / 10,
    record: `${team.record.wins}-${team.record.losses}`,
    components: { results: Math.round(results), talent: Math.round(talent), future: Math.round(future), capHealth: Math.round(capHealth), legacy: Math.round(legacy) },
    tier: { label: '', color: '' },
    isUser: team.id === league.userTeamId,
  };
}

function tierFor(rank: number, total: number): { label: string; color: string } {
  const pct = rank / total;
  if (rank <= 3) return { label: 'Executive of the Year contender', color: '#fbbf24' };
  if (pct <= 0.33) return { label: 'Strong front office', color: '#10b981' };
  if (pct <= 0.66) return { label: 'Solid', color: '#06b6d4' };
  if (pct <= 0.85) return { label: 'Under pressure', color: '#f97316' };
  return { label: 'On the hot seat', color: '#ef4444' };
}

/** Rank all front offices, best GM first. */
export function gmRankings(league: LeagueState): GmRanking[] {
  const history = historyEntries(league);
  const ranked = (league.teams as BasketballTeam[])
    .map(t => scoreTeam(league, t, history))
    .sort((a, b) => b.score - a.score);
  const total = ranked.length;
  ranked.forEach((r, i) => { r.rank = i + 1; r.tier = tierFor(r.rank, total); });
  return ranked;
}
