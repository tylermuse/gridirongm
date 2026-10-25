import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import { detectNarrativeMoment, type FetchOptions, type NarrativeMoment } from '../ai/aiSpotlight';
import { getBracket } from '../playoffs';
import { getTransactions } from '../transactions';
import { getTradeDeadlineDay } from '../rules/leagueRules';
import { regularSeasonStatsByPlayer } from '../stats/seasonStats';
import { teamFinances } from '../finances/finances';
import type { SpotlightEpisode } from './spotlight';
import type { BasketballLeagueState } from '../persistence/db';

/**
 * The Booth (Marcus & Tony call-in panel) — BS Hoops port of BS Football's
 * boothStore + GlobalBooth wiring.
 *
 * UI state lives apart from the league store so opening the panel never
 * touches the save. `seen` tracks the newest Team Spotlight episode: whether
 * the Booth was opened since it dropped (clears the launcher dot), whether the
 * corner callout was shown, and whether the caller watched or called in
 * (collapses the On Air card). `logs` keeps the call history per in-game week,
 * persisted to sessionStorage so closing the Booth, changing pages or a
 * refresh keeps the conversation.
 */

export interface BoothEpisodeTopic {
  headline: string;
  exchanges: { speakerId: string; text: string; playerName?: string }[];
}

export type BoothHost = 'marcus' | 'tony';
export interface BoothMsg { role: 'user' | BoothHost; text: string; verdict?: string }
export interface BoothLog {
  messages: BoothMsg[];
  /** Typed (LLM) turns only — chips are free. */
  turns: number;
}

export const EMPTY_BOOTH_LOG: BoothLog = { messages: [], turns: 0 };

// Only the current week matters for the free-turn cap; keep a couple of
// recent weeks so stepping back and forth doesn't wipe a call.
const MAX_LOGS = 4;

export interface BoothEpisodeSeen {
  opened?: string;
  dismissed?: string;
  engaged?: string;
}

interface BoothState {
  open: boolean;
  /** True while the AppShell has the Booth mounted (hides the feedback bubble). */
  mounted: boolean;
  seen: BoothEpisodeSeen;
  logs: Record<string, BoothLog>;
  setOpen: (open: boolean) => void;
  setMounted: (mounted: boolean) => void;
  markSeen: (field: keyof BoothEpisodeSeen, episodeKey: string) => void;
  updateLog: (weekKey: string, fn: (log: BoothLog) => BoothLog) => void;
}

export const useBoothStore = create<BoothState>()(
  persist(
    set => ({
      open: false,
      mounted: false,
      seen: {},
      logs: {},
      setOpen: open => set({ open }),
      setMounted: mounted => set({ mounted }),
      markSeen: (field, episodeKey) => set(s => (s.seen[field] === episodeKey ? s : { seen: { ...s.seen, [field]: episodeKey } })),
      updateLog: (weekKey, fn) => set(s => {
        const { [weekKey]: current, ...rest } = s.logs;
        // Re-insert last so the most recently used weeks survive the trim.
        const kept = Object.entries(rest).slice(-(MAX_LOGS - 1));
        return { logs: { ...Object.fromEntries(kept), [weekKey]: fn(current ?? EMPTY_BOOTH_LOG) } };
      }),
    }),
    {
      name: 'bshoops-booth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: s => ({ logs: s.logs, seen: s.seen }),
    },
  ),
);

const DAYS_PER_WEEK = 7;

/** Spotlight week for the league's current day (same rule as buildSpotlight). */
export function spotlightWeek(league: BasketballLeagueState): number {
  return Math.max(1, Math.floor(league.currentTick / DAYS_PER_WEEK));
}

/** User's decided playoff series (play-in included); each one is a new episode. */
function userSeriesDecided(league: BasketballLeagueState): number {
  const bracket = getBracket(league);
  const uid = league.userTeamId;
  if (!bracket || !uid) return 0;
  return [...(bracket.playIn ?? []), ...bracket.rounds.flat()]
    .filter(s => s.winnerTeamId && (s.teamA === uid || s.teamB === uid)).length;
}

/** One Team Spotlight episode per in-game state. */
export function boothEpisodeKey(league: BasketballLeagueState): string {
  return `s${league.currentSeason}-w${spotlightWeek(league)}-${league.currentPhase}-ps${userSeriesDecided(league)}`;
}

export const MOMENT_LABEL: Record<NarrativeMoment, string | null> = {
  preseason: 'Season preview',
  tradeDeadline: 'Trade deadline',
  playInStart: 'Play-in',
  playoffsStart: 'Playoffs',
  allStarBreak: 'All-Star break',
  seasonOver: 'Season review',
  weekly: null,
};

/** The user's unresolved series opponent, once both slots are filled. */
function nextOpponentId(league: BasketballLeagueState): string | null {
  const bracket = getBracket(league);
  const uid = league.userTeamId;
  if (!bracket || !uid) return null;
  const next = [...(bracket.playIn ?? []), ...bracket.rounds.flat()]
    .find(s => !s.winnerTeamId && s.teamA && s.teamB && (s.teamA === uid || s.teamB === uid));
  if (!next) return null;
  return next.teamA === uid ? next.teamB : next.teamA;
}

/**
 * The hosts' grounding inputs for the user team (fed to buildSpotlightTeamData),
 * built straight from the league so the Booth works on any page.
 */
export function boothFetchOptions(league: BasketballLeagueState): FetchOptions | null {
  const rawTeam = league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined;
  if (!rawTeam) return null;
  // Player.seasonStats and team.capState aren't maintained in Hoops saves (stats
  // live in box scores, cap is derived), so fill both before building teamData.
  const statsById = regularSeasonStatsByPlayer(league);
  const players: Record<string, BasketballPlayer> = {};
  for (const [id, p] of Object.entries(league.players as Record<string, BasketballPlayer>)) {
    const stats = statsById.get(p.id);
    players[id] = stats ? { ...p, seasonStats: stats } : p;
  }
  const cap = teamFinances(league, rawTeam).cap;
  const team: BasketballTeam = {
    ...rawTeam,
    capState: { deadCapByYear: {}, sportData: null, ...rawTeam.capState, salaryCap: cap.cap, currentPayroll: cap.payroll },
  };
  const bracket = getBracket(league);
  return {
    team,
    roster: team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p),
    allTeams: (league.teams as BasketballTeam[]).map(t => (t.id === team.id ? team : t)),
    allPlayers: Object.values(players),
    season: league.currentSeason,
    dayIndex: league.currentTick,
    phase: league.currentPhase,
    narrative: detectNarrativeMoment(league, bracket),
    transactions: getTransactions(league),
    playoffBracket: bracket,
    nextOpponentId: nextOpponentId(league),
    tradeDeadlineDay: getTradeDeadlineDay(league),
  };
}

/** Team Spotlight stories in the Booth's topic shape (analyst → stats, take → hottake). */
export function episodeTopics(episode: SpotlightEpisode | null): BoothEpisodeTopic[] {
  if (!episode) return [];
  return episode.stories.map(story => ({
    headline: story.headline,
    exchanges: story.exchanges
      .filter(e => e.voice === 'analyst' || e.voice === 'take')
      .map(e => ({ speakerId: e.voice === 'analyst' ? 'stats' : 'hottake', text: e.line })),
  }));
}
