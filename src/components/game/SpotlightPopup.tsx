'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { COMMENTATORS } from '@/lib/engine/debate';
import { fetchAiSpotlight, detectNarrativeMoment } from '@/lib/engine/aiSpotlight';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { useAiCommentary } from '@/components/providers/useAiCommentary';
import { shouldShowSpotlightPopup } from '@/lib/engine/spotlightAccess';

/**
 * Floating corner popup that nudges the user to check the Team Spotlight.
 * Rendered inside GameShell so it appears on every page.
 *
 * Triggers at narrative moments only, identically for Free and Premium
 * (see shouldShowSpotlightPopup): preseason / week 1, trade deadline, season
 * over + offseason transitions, and each playoff game. Premium additionally
 * pre-fetches the AI topics; Free gets the template spotlight plus a
 * one-line note about what Premium adds.
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

export function SpotlightPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    teams, userTeamId, season, week, phase, playoffBracket, playoffSeeds,
    players, leagueSettings, newsItems, draftResults, champions,
  } = useGameStore();
  const aiOn = useAiCommentary();
  const { hasFeature, loading: subLoading } = useSubscription();
  const isPremium = subLoading || hasFeature('ai_commentary');

  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const prevKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const userTeam = teams.find(t => t.id === userTeamId);
  // Count playoff games the user's team has played
  const playoffGamesPlayed = playoffBracket && userTeamId
    ? playoffBracket.filter(m => m.winnerId && (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)).length
    : 0;

  const currentKey = computeSpotlightKey(season, week, phase, playoffGamesPlayed);

  useEffect(() => {
    if (!userTeamId || !userTeam) return;

    const lastShownKey = sessionStorage.getItem(STORAGE_KEY) ?? '';
    const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
    const narrative = detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, userTeam.id, playoffSeeds);
    const isMoment = shouldShowSpotlightPopup(narrative);

    // First mount: record the state; only a narrative moment can show on load.
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevKeyRef.current = currentKey;
      if (!lastShownKey) sessionStorage.setItem(STORAGE_KEY, currentKey);
      if (!isMoment) return;
    } else {
      if (currentKey === prevKeyRef.current) return;
      prevKeyRef.current = currentKey;
    }

    // Same rule for every tier: ordinary weeks never pop up.
    if (!isMoment) return;

    // Premium: warm the shared AI cache so the dashboard has topics ready.
    if (aiOn) {
      const roster = players.filter(p => p.teamId === userTeam.id);
      fetchAiSpotlight({
        team: userTeam, roster, allTeams: teams, allPlayers: players,
        season, week, phase, narrative,
        newsItems, draftResults, playoffBracket, playoffSeeds, champions,
        tradeDeadlineWeek,
      }).catch(() => { /* errors handled via cache.error subscribers */ });
    }

    if (lastShownKey === currentKey) return; // already shown this state
    sessionStorage.setItem(STORAGE_KEY, currentKey);
    setShouldShow(true);
    setDismissed(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, userTeamId, phase, playoffGamesPlayed, aiOn]);

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
          {!isPremium && (
            <p className="mt-1 text-[10px] text-purple-600">Premium adds an AI-written breakdown of this moment.</p>
          )}
        </button>
      </div>
    </div>
  );
}
