'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { COMMENTATORS } from '@/lib/engine/debate';
import { fetchAiSpotlight, detectNarrativeMoment } from '@/lib/engine/aiSpotlight';

/**
 * Floating corner popup that nudges the user to check the Team Spotlight.
 * Rendered inside GameShell so it appears on every page.
 *
 * Triggers at specific moments only (not every render):
 *  - After regular season game sim (week changes)
 *  - After playoff game IF user team is involved
 *  - After re-signing ends (phase → draft)
 *  - After draft completes (phase → freeAgency)
 *  - After free agency ends (phase → preseason)
 *
 * Uses sessionStorage to avoid showing twice for the same state.
 */

const STORAGE_KEY = 'gg-spotlight-last';

function computeSpotlightKey(
  season: number,
  week: number,
  phase: string,
  playoffGamesPlayed: number,
): string {
  return `s${season}-w${week}-${phase}-pg${playoffGamesPlayed}`;
}

/** Phases that should trigger the popup when entered */
const TRIGGER_PHASES = new Set(['resigning', 'draft', 'freeAgency', 'preseason']);

export function SpotlightPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    teams, userTeamId, season, week, phase, playoffBracket, playoffSeeds,
    players, leagueSettings, newsItems, draftResults, champions,
  } = useGameStore();

  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const prevKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const userTeam = teams.find(t => t.id === userTeamId);
  const gamesPlayed = userTeam ? userTeam.record.wins + userTeam.record.losses : 0;

  // Count playoff games the user's team has played
  const playoffGamesPlayed = playoffBracket && userTeamId
    ? playoffBracket.filter(m => m.winnerId && (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)).length
    : 0;

  const currentKey = computeSpotlightKey(season, week, phase, playoffGamesPlayed);

  useEffect(() => {
    // Skip if no team selected
    if (!userTeamId) return;

    const lastShownKey = sessionStorage.getItem(STORAGE_KEY) ?? '';

    // First mount — skip for weekly moments (prevents popup on every refresh).
    // But DO trigger for special narrative moments (preseason, seasonOver, etc.)
    // so they aren't silently consumed on initial load.
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevKeyRef.current = currentKey;
      if (!lastShownKey) sessionStorage.setItem(STORAGE_KEY, currentKey);
      const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
      const narrative = userTeam
        ? detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, userTeam.id)
        : 'weekly';
      if (narrative === 'weekly') return; // skip on refresh for weekly
      // Fall through for special moments — let them trigger below
    }

    // Nothing changed
    if (currentKey === prevKeyRef.current) return;
    prevKeyRef.current = currentKey;

    // Already shown for this state — but still allow AI fetch for special moments
    // (the popup won't show again but the content will be in the cache for the dashboard)
    if (lastShownKey === currentKey) {
      if (leagueSettings?.aiCommentary && userTeam) {
        const tradeDeadlineWeek = leagueSettings.tradeDeadlineWeek ?? 12;
        const narrative = detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, userTeam.id);
        if (narrative !== 'weekly') {
          const rosterForFetch = players.filter(p => p.teamId === userTeam.id);
          fetchAiSpotlight({ team: userTeam, roster: rosterForFetch, allTeams: teams, allPlayers: players, season, week, phase, narrative, newsItems, draftResults, playoffBracket, playoffSeeds, champions, tradeDeadlineWeek });
        }
      }
      return;
    }

    // Determine if this is a trigger moment
    const isRegularSeasonSim = phase === 'regular' && (gamesPlayed > 0 || week === 1);
    const isPlayoffUpdate = phase === 'playoffs' && playoffGamesPlayed >= 0;
    const isPhaseTransition = TRIGGER_PHASES.has(phase);

    if (isRegularSeasonSim || isPlayoffUpdate || isPhaseTransition) {
      sessionStorage.setItem(STORAGE_KEY, currentKey);

      // If AI commentary is on, generate it for SPECIAL narrative moments only.
      // Weekly recaps use the template engine to save ~90% of API costs.
      if (leagueSettings?.aiCommentary && userTeam) {
        const tradeDeadlineWeek = leagueSettings.tradeDeadlineWeek ?? 12;
        const narrative = detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, userTeam.id);

        // Skip AI for weekly — template engine handles these to save API costs
        if (narrative === 'weekly') {
          setShouldShow(true);
          setDismissed(false);
          return;
        }

        const roster = players.filter(p => p.teamId === userTeam.id);

        fetchAiSpotlight({
          team: userTeam,
          roster,
          allTeams: teams,
          allPlayers: players,
          season, week, phase, narrative,
          newsItems,
          draftResults,
          playoffBracket,
          playoffSeeds,
          champions,
          tradeDeadlineWeek,
        }).then(() => {
          setShouldShow(true);
          setDismissed(false);
        });
      } else {
        setShouldShow(true);
        setDismissed(false);
      }
    }
  }, [currentKey, userTeamId, gamesPlayed, phase, playoffGamesPlayed]);

  // Slide-in animation
  useEffect(() => {
    if (!shouldShow || dismissed) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [shouldShow, dismissed]);

  if (!shouldShow || dismissed || !userTeam) return null;

  function handleClick() {
    setDismissed(true);
    setShouldShow(false);
    if (pathname === '/') {
      window.dispatchEvent(new CustomEvent('scroll-to-spotlight'));
    } else {
      router.push('/?spotlight=1');
    }
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(true);
    setShouldShow(false);
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
    >
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl shadow-black/10 overflow-hidden max-w-xs">
        {/* Dismiss X */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>

        <button onClick={handleClick} className="w-full text-left p-3 hover:bg-[var(--surface-2)] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg shrink-0">
              🎬
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Team Spotlight</p>
              <p className="text-xs text-[var(--text-sec)] leading-tight mt-0.5">
                {COMMENTATORS.stats.avatar} {COMMENTATORS.stats.name} & {COMMENTATORS.hottake.avatar} {COMMENTATORS.hottake.name} break down the {userTeam.name}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
            <span>Watch Now</span>
            <span>→</span>
          </div>
        </button>
      </div>
    </div>
  );
}
