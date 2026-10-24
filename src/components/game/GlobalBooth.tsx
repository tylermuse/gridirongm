'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { useBoothStore } from '@/lib/engine/boothStore';
import { detectNarrativeMoment, getAiSpotlightState, subscribeAiSpotlight, type FetchOptions } from '@/lib/engine/aiSpotlight';
import { Avatar, BoothPanel } from './SpotlightCallIn';

/**
 * The Booth on every in-game screen: the docked panel plus the floating
 * launcher in the bottom-right corner (which replaces the feedback bubble
 * on game screens). The top bar's Booth button opens the same panel.
 *
 * Builds the hosts' grounding straight from the game store so it works on
 * any page, not just the dashboard that renders the Team Spotlight.
 */
export function GlobalBooth() {
  const pathname = usePathname();
  const open = useBoothStore(s => s.open);
  const setOpen = useBoothStore(s => s.setOpen);
  const setMounted = useBoothStore(s => s.setMounted);
  const publishedEpisode = useBoothStore(s => s.episode);

  const {
    teams, players, userTeamId, season, week, phase, newsItems, draftResults,
    playoffBracket, playoffSeeds, champions, leagueSettings,
  } = useGameStore();
  const team = teams.find(t => t.id === userTeamId);

  // Fallback episode for players who never opened the dashboard this session.
  const [aiState, setAiState] = useState(getAiSpotlightState);
  useEffect(() => subscribeAiSpotlight(() => setAiState(getAiSpotlightState())), []);
  const episode = publishedEpisode ?? aiState.topics ?? [];

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const narrative = team
    ? detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, team.id, playoffSeeds)
    : 'weekly';

  // Same bracket gating as the dashboard spotlight: only name a playoff
  // opponent once their matchup is fully populated.
  const nextOpponentId = useMemo(() => {
    if (phase !== 'playoffs' || !playoffBracket || !team) return undefined;
    const next = playoffBracket.find(m =>
      !m.winnerId && m.homeTeamId && m.awayTeamId &&
      (m.homeTeamId === team.id || m.awayTeamId === team.id));
    if (!next) return null;
    return next.homeTeamId === team.id ? next.awayTeamId! : next.homeTeamId!;
  }, [phase, playoffBracket, team]);

  const fetchOpts = useMemo<FetchOptions | null>(() => {
    if (!team) return null;
    return {
      team,
      roster: players.filter(p => p.teamId === team.id),
      allTeams: teams,
      allPlayers: players,
      season, week, phase, narrative,
      newsItems, draftResults, playoffBracket, playoffSeeds, champions,
      tradeDeadlineWeek, nextOpponentId,
    };
  // Rebuilt when the facts the hosts talk about change, not on every store write.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, team?.record.wins, team?.record.losses, season, week, phase, narrative, nextOpponentId, players.length]);

  if (!team || !fetchOpts) return null;
  // The live game page has its own broadcast booth.
  const onLiveGame = pathname.startsWith('/game/');
  const weekKey = `${team.id}-s${season}-w${week}-${phase}-${narrative}`;

  return (
    <>
      {!open && !onLiveGame && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open the Booth: ask Marcus & Tony"
          className="fixed right-4 bottom-20 sm:bottom-5 sm:right-5 z-50 flex items-center gap-2 pl-1.5 pr-1.5 sm:pr-4 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <span className="flex">
            <Avatar host="marcus" />
            <span className="-ml-1"><Avatar host="tony" /></span>
          </span>
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-sm font-extrabold uppercase tracking-wide">The Booth</span>
            <span className="text-[11px] text-[var(--text-sec)]">Ask Marcus &amp; Tony</span>
          </span>
        </button>
      )}
      <BoothPanel
        fetchOpts={fetchOpts}
        episode={episode}
        weekKey={weekKey}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
