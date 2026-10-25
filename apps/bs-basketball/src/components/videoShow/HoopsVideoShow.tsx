'use client';

import { useMemo } from 'react';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import { buildSpotlight } from '@/lib/show/spotlight';
import { boothFetchOptions, spotlightWeek } from '@/lib/show/booth';
import { nextAction } from '@/lib/ui/nextAction';
import { fromLeague } from '@/lib/videoShow/adapters';
import { computeShowStatLine } from '@/lib/videoShow/teamStats';
import { buildGameTopics, gameTopicsForMoment } from '@/lib/videoShow/showGame';
import type { EpisodeMoment } from '@/lib/videoShow/showMoment';
import { SpotlightShowPlayer } from './SpotlightShowPlayer';

/**
 * The Team Spotlight *video* show for a Hoops league (BS Football parity):
 * the broadcast poster that plays this week's episode — Marcus & Tony on the
 * studio set, the last game broken down first, then the week's storylines,
 * with the team's real numbers on screen. Premium; one studio episode credit
 * per fresh episode (cached episodes replay free).
 */

const STORY_ICON: Record<string, string> = {
  Statement: '📣', Upset: '😱', Breakout: '🚀', Streak: '🔥', Discipline: '🟥', 'MVP Race': '🏆', Rivalry: '⚔️',
  'Your Team': '🏀', Record: '📈', 'By the Numbers': '📊', 'Star Watch': '⭐', Cap: '💰', 'Young Core': '🌱',
  'Playoff Picture': '🗺️', Injury: '🩹', AI: '✨',
};

/** Hoops phase + narrative → the show's moment (football phase names). */
function momentFor(league: BasketballLeagueState, narrative: EpisodeMoment['narrative']): EpisodeMoment {
  const p = league.currentPhase;
  if (p === 'offseason') {
    const label = nextAction(league).phaseLabel ?? '';
    const phase = /draft/i.test(label) ? 'draft' : /free agency/i.test(label) ? 'freeAgency' : 'resigning';
    return { phase, narrative: 'seasonOver' };
  }
  return { phase: p === 'regular_season' ? 'regular' : p === 'playoffs' ? 'playoffs' : 'preseason', narrative };
}

function episodeLabel(m: EpisodeMoment, week: number): string {
  if (m.phase === 'draft') return 'Draft Special';
  if (m.phase === 'freeAgency') return 'Free Agency Special';
  if (m.phase === 'resigning') return 'Offseason Breakdown';
  switch (m.narrative) {
    case 'preseason': return m.phase === 'preseason' ? 'Season Preview' : 'Opening Week';
    case 'tradeDeadline': return 'Trade Deadline Special';
    case 'allStarBreak': return 'All-Star Break Special';
    case 'playInStart': return 'Play-In Special';
    case 'playoffsStart': return 'Playoff Edition';
    case 'seasonOver': return 'Season Review';
    default: return `Week ${week} Breakdown`;
  }
}

export function HoopsVideoShow({ league }: { league: BasketballLeagueState }) {
  const week = spotlightWeek(league);
  // Rebuilt when the sim moves, not on every league write.
  const stamp = `${league.currentSeason}|${league.currentTick}|${league.games.length}|${league.userTeamId}|${league.currentPhase}`;
  const data = useMemo(() => {
    const view = fromLeague(league);
    if (!view) return null;
    const opts = boothFetchOptions(league);
    const narrative = (opts?.narrative ?? 'weekly') as EpisodeMoment['narrative'];
    const moment = momentFor(league, narrative);
    const episode = buildSpotlight(league);
    const topics = (episode?.stories ?? []).map(s => ({
      headline: s.headline,
      icon: STORY_ICON[s.category] ?? '🎙️',
      exchanges: s.exchanges
        .filter(e => e.voice === 'analyst' || e.voice === 'take')
        .map(e => ({ speakerId: e.voice === 'analyst' ? 'stats' : 'hottake', text: e.line })),
      ...(s.playerId ? { playerIds: [s.playerId] } : {}),
    })).filter(t => t.exchanges.length > 0);
    const game = gameTopicsForMoment(buildGameTopics(league, view.team, view.teams, view.players), moment.narrative);
    return { view, topics, game, moment, stats: computeShowStatLine(view.team, view.teams, view.players) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  if (!data || data.topics.length + data.game.length === 0) return null;
  const { view, topics, game, moment, stats } = data;
  return (
    <SpotlightShowPlayer
      topics={topics}
      game={game}
      teamName={`${view.team.city} ${view.team.name}`}
      stats={stats}
      team={view.team}
      teams={view.teams}
      players={view.players}
      schedule={view.schedule}
      season={view.season}
      poster={{ episodeLabel: episodeLabel(moment, week), ready: true }}
      moment={moment}
    />
  );
}
