'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { useBoothStore, boothEpisodeKey } from '@/lib/engine/boothStore';
import { detectNarrativeMoment, type FetchOptions, type NarrativeMoment } from '@/lib/engine/aiSpotlight';
import { generateTeamSpotlight } from '@/lib/engine/debate';
import { shouldShowSpotlightPopup } from '@/lib/engine/spotlightAccess';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { Avatar, BoothPanel, type OnAirInfo } from './SpotlightCallIn';

/**
 * The Booth on every in-game screen: the docked panel plus the floating
 * launcher in the bottom-right corner (which replaces the feedback bubble
 * on game screens).
 *
 * The launcher is also where new Team Spotlight episodes are announced (it
 * replaced the old SpotlightPopup): at narrative moments a callout slides
 * out above it with Watch / Call in, and a dot stays on the launcher until
 * the Booth is opened. Inside, the episode is pinned as the On Air card.
 *
 * Builds the hosts' grounding straight from the game store so it works on
 * any page, not just the dashboard that renders the Team Spotlight.
 */

const MOMENT_LABEL: Record<NarrativeMoment, string | null> = {
  preseason: 'Season preview',
  tradeDeadline: 'Trade deadline',
  playoffsStart: 'Playoffs',
  seasonOver: 'Season review',
  weekly: null,
};

export function GlobalBooth() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useBoothStore(s => s.open);
  const setOpen = useBoothStore(s => s.setOpen);
  const setMounted = useBoothStore(s => s.setMounted);
  const publishedEpisode = useBoothStore(s => s.episode);
  const publishedFor = useBoothStore(s => s.episodeFor);
  const seen = useBoothStore(s => s.seen);
  const markSeen = useBoothStore(s => s.markSeen);
  const { hasFeature, loading: subLoading } = useSubscription();
  const isPremium = subLoading || hasFeature('ai_commentary');

  const {
    teams, players, userTeamId, season, week, phase, newsItems, draftResults,
    playoffBracket, playoffSeeds, champions, finalsMvpPlayerId, freeAgents, faDay, leagueSettings,
  } = useGameStore();
  const team = teams.find(t => t.id === userTeamId);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const narrative = team
    ? detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, team.id, playoffSeeds)
    : 'weekly';
  const episodeKey = boothEpisodeKey(season, week, phase, playoffBracket, userTeamId);
  const momentKey = shouldShowSpotlightPopup(narrative) ? episodeKey : null;

  // The episode: whatever the dashboard last rendered for this exact state
  // (AI topics when it wrote them), else the template spotlight, which is
  // what the dashboard would show — so the On Air card works on any page.
  const roster = useMemo(() => (team ? players.filter(p => p.teamId === team.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team?.id, players.length, episodeKey]);
  const templateTopics = useMemo(() => {
    if (!team) return [];
    const reInjury = newsItems.filter(n =>
      n.type === 'injury' && n.season === season && n.teamId === team.id &&
      n.headline.includes('re-injured playing through')).slice(-5);
    return generateTeamSpotlight(team, roster, teams, players, season, week, {
      phase, playoffBracket, playoffSeeds, champions, finalsMvpPlayerId, draftResults, freeAgents, faDay, newsItems: reInjury,
    });
  // Same inputs the dashboard keys its spotlight on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, roster, season, week, phase, faDay, draftResults?.length, playoffBracket?.filter(m => m.winnerId).length]);
  const episode = (publishedFor === episodeKey && publishedEpisode) || templateTopics;

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
      roster,
      allTeams: teams,
      allPlayers: players,
      season, week, phase, narrative,
      newsItems, draftResults, playoffBracket, playoffSeeds, champions,
      tradeDeadlineWeek, nextOpponentId,
    };
  // Rebuilt when the facts the hosts talk about change, not on every store write.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, team?.record.wins, team?.record.losses, season, week, phase, narrative, nextOpponentId, players.length]);

  // Opening the Booth clears the launcher dot for this episode.
  useEffect(() => {
    if (open && momentKey) markSeen('opened', momentKey);
  }, [open, momentKey, markSeen]);

  const fresh = !!momentKey && seen.engaged !== momentKey;
  const showDot = fresh && seen.opened !== momentKey;
  const onLiveGame = pathname.startsWith('/game/');
  const showCallout = showDot && seen.dismissed !== momentKey && !open && !onLiveGame && episode.length > 0;

  // Slide the callout in a beat after it's due, like the old popup.
  const [calloutIn, setCalloutIn] = useState(false);
  useEffect(() => {
    if (!showCallout) { setCalloutIn(false); return; }
    const t = setTimeout(() => setCalloutIn(true), 800);
    return () => clearTimeout(t);
  }, [showCallout]);

  if (!team || !fetchOpts) return null;
  const weekKey = `${team.id}-s${season}-w${week}-${phase}-${narrative}`;

  function watch() {
    if (momentKey) markSeen('engaged', momentKey);
    setOpen(false);
    if (pathname === '/') window.dispatchEvent(new CustomEvent('scroll-to-spotlight'));
    else router.push('/?spotlight=1');
  }

  const onAir: OnAirInfo | null = episode.length > 0
    ? { moment: MOMENT_LABEL[narrative], topics: episode, fresh, onWatch: watch }
    : null;

  // TopBar renders a fixed bottom action bar (Sim Week / Sim Season) on phones
  // during the regular season only; clear it then, otherwise sit at the bottom.
  const mobileBottomBar = phase === 'regular';

  return (
    <>
      {!open && !onLiveGame && (
        <div className={`fixed right-4 ${mobileBottomBar ? 'bottom-20' : 'bottom-4'} sm:bottom-5 sm:right-5 z-50 flex flex-col items-end gap-2`}>
          {showCallout && (
            <div
              role="status"
              className={`relative w-60 sm:w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden transition-all duration-500 ${calloutIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
            >
              {/* Phones get a compact card: one-line headline, no moment label, slim buttons. */}
              <div className="bg-[#121A2B] text-white px-3 py-2 pr-9 sm:px-3.5 sm:py-2.5 sm:pr-10">
                <span className="inline-flex items-center gap-1.5 bg-red-600 text-[9px] sm:text-[10px] font-extrabold tracking-widest px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />NEW EPISODE
                </span>
                <p className="text-[13px] sm:text-sm font-bold leading-snug mt-1 sm:mt-1.5 truncate sm:whitespace-normal">
                  <span className="sm:hidden">Marcus &amp; Tony on the {team.name}</span>
                  <span className="hidden sm:inline">Marcus &amp; Tony break down the {team.name}</span>
                </p>
                {MOMENT_LABEL[narrative] && <p className="hidden sm:block text-xs text-slate-300 mt-0.5">{MOMENT_LABEL[narrative]}</p>}
              </div>
              <button
                onClick={() => momentKey && markSeen('dismissed', momentKey)}
                aria-label="Dismiss"
                className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <div className="flex gap-1.5 sm:gap-2 p-2 sm:p-2.5">
                <button onClick={watch} className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-8 sm:min-h-10 rounded-lg bg-blue-600 text-white text-xs sm:text-[13px] font-bold hover:bg-blue-700">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>Watch
                </button>
                <button onClick={() => setOpen(true)} className="flex-1 min-h-8 sm:min-h-10 rounded-lg border border-[var(--border)] text-xs sm:text-[13px] font-semibold hover:bg-[var(--bg-hover)]">
                  Call in
                </button>
              </div>
              {!isPremium && (
                <p className="hidden sm:block px-3 pb-2.5 -mt-1 text-[11px] text-purple-700">Premium adds an AI-written breakdown of this moment.</p>
              )}
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            aria-label={showDot ? 'Open the Booth: new episode from Marcus & Tony' : 'Open the Booth: ask Marcus & Tony'}
            className={`relative ${showCallout ? 'hidden sm:flex' : 'flex'} items-center gap-2 pl-1.5 pr-1.5 sm:pr-4 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all`}
          >
            <span className="flex">
              <Avatar host="marcus" />
              <span className="-ml-1"><Avatar host="tony" /></span>
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-extrabold uppercase tracking-wide">The Booth</span>
              <span className="text-[11px] text-[var(--text-sec)]">{showDot ? 'New episode' : 'Ask Marcus & Tony'}</span>
            </span>
            {showDot && (
              <span aria-hidden="true" className="absolute -top-0.5 left-0.5 w-3 h-3 rounded-full bg-red-600 ring-2 ring-[var(--surface)]" />
            )}
          </button>
        </div>
      )}
      <BoothPanel
        fetchOpts={fetchOpts}
        episode={episode}
        weekKey={weekKey}
        open={open}
        onClose={() => setOpen(false)}
        onAir={onAir}
        onAsk={() => { if (momentKey) markSeen('engaged', momentKey); }}
      />
    </>
  );
}
