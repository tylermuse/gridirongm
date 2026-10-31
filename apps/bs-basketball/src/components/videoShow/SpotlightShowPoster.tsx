'use client';

import { useRef, useState } from 'react';
import { EPISODE_PACK } from '@bs/core/billing';
import Link from 'next/link';
import type { ShowTeam as Team } from '@/lib/videoShow/types';
import { ShowTeamLogo } from './ShowArt';
import { SHOW_CLIPS } from '@/lib/videoShow/showScript';
import { TWO_SHOT_SRC } from './SpotlightShowGraphics';
import { formatResetDate, nextCreditReset, type ListenState } from '@/lib/videoShow/access';

/** Pre-recorded studio open — free to play, so it's the teaser. */
const TEASER = [SHOW_CLIPS.marcus_intro.src, SHOW_CLIPS.tony_intro.src];

export type PosterPlayer = 'idle' | 'loading' | 'error' | 'exhausted' | 'locked' | 'open';

/**
 * The Spotlight show's front door: a still of the broadcast with the
 * user's team on the lower third and a big play button.
 *  - Premium: play → produce + open the full episode (onPlay).
 *  - Free / signed out: play → the real studio open (~12s, pre-recorded,
 *    no generation cost) → an end card asking to upgrade / sign in.
 */
export function SpotlightShowPoster({
  team, episodeLabel, access, player, resetAt, ready, onPlay, onRetry, message,
}: {
  team: Team;
  /** "Trade Deadline Special", "Week 9 Breakdown", … */
  episodeLabel: string;
  access: ListenState;
  /** The full player's state (server can still say locked/exhausted). */
  player: PosterPlayer;
  resetAt: string | null;
  /** Topics settled (AI had its chance) — safe to produce the episode. */
  ready: boolean;
  onPlay: () => void;
  onRetry: () => void;
  /** Why the episode couldn't be produced (the server's words), if it said. */
  message?: string | null;
}) {
  const [teaser, setTeaser] = useState<'off' | 'playing' | 'done'>('off');
  const [buying, setBuying] = useState<'idle' | 'loading' | 'error'>('idle');

  // Out of episodes: buy a pack (Stripe Checkout, one-time).
  async function buyPack() {
    if (buying === 'loading') return;
    setBuying('loading');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'episode_pack' }),
      });
      const data = (await res.json()) as { url?: string };
      if (!res.ok || !data.url) throw new Error('no checkout url');
      window.location.href = data.url;
    } catch {
      setBuying('error');
    }
  }
  const [clip, setClip] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const gated = access === 'locked' || access === 'signedOut' || player === 'locked';
  const exhausted = access === 'exhausted' || player === 'exhausted';
  const resetLabel = formatResetDate(nextCreditReset(resetAt));

  function play() {
    if (access === 'checking') return;
    if (gated) {
      setClip(0);
      setTeaser('playing');
      // Start inside the click so audio is allowed (iPhone included).
      requestAnimationFrame(() => videoRef.current?.play().catch(() => setTeaser('done')));
      return;
    }
    if (exhausted || !ready) return;
    onPlay();
  }

  function onClipEnded() {
    if (clip + 1 < TEASER.length) {
      setClip(clip + 1);
      requestAnimationFrame(() => videoRef.current?.play().catch(() => setTeaser('done')));
    } else {
      setTeaser('done');
    }
  }

  const record = `${team.record.wins}-${team.record.losses}`;
  const busy = player === 'loading' || (!gated && !exhausted && !ready && access === 'ready');

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-800 shadow-sm">
      {teaser === 'off' || teaser === 'done' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={TWO_SHOT_SRC} alt="Marcus Cole and Tony Blaze at the Team Spotlight desk" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          key={TEASER[clip]}
          src={TEASER[clip]}
          playsInline
          preload="auto"
          onEnded={onClipEnded}
          onError={() => setTeaser('done')}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Lower third: whose show this is. Slimmer on phones, where the poster is
          only ~190px tall; the overlays below center above it (pb-14), not under it. */}
      {teaser !== 'done' && (
        <div className="absolute left-3 right-3 bottom-3 sm:left-5 sm:bottom-5 sm:right-auto flex items-stretch overflow-hidden rounded-lg bg-white/95 shadow-md">
          <div className="w-1.5 shrink-0" style={{ background: team.primaryColor }} />
          <div className="flex items-center gap-2 sm:gap-2.5 px-2.5 py-1.5 sm:px-3 sm:py-2">
            <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0">
              <ShowTeamLogo team={team} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[10px] font-bold uppercase tracking-wider text-purple-700">Team Spotlight · {episodeLabel}</div>
              <div className="truncate text-[13px] sm:text-sm font-bold text-slate-900">{team.city} {team.name} <span className="font-semibold text-slate-500">· {record}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Out of episodes: the notice and the buy-a-pack button as one centered
          stack (pinned separately, the pack button ran into the lower third on phones). */}
      {teaser === 'off' && exhausted && !gated && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 pb-14 sm:pb-0 bg-black/10">
          <span className="rounded-full bg-white/95 px-4 py-2 text-center text-sm font-semibold text-slate-600 shadow-lg">
            Out of episodes this month · resets {resetLabel}
          </span>
          {EPISODE_PACK.priceId && (
            <>
              <button
                onClick={() => void buyPack()}
                disabled={buying === 'loading'}
                className="rounded-full bg-purple-600 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-purple-700 disabled:opacity-60 transition-colors"
              >
                {buying === 'loading' ? 'Opening checkout…' : `Get ${EPISODE_PACK.credits} more episodes · ${EPISODE_PACK.priceLabel}`}
              </button>
              {buying === 'error' && <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-red-700">Couldn&apos;t open checkout — try again</span>}
              <span className="text-[11px] font-semibold text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">They never expire.</span>
            </>
          )}
        </div>
      )}

      {/* Play / state overlay */}
      {teaser === 'off' && !(exhausted && !gated) && (
        <button
          onClick={player === 'error' ? onRetry : play}
          disabled={access === 'checking' || busy}
          aria-label={`Play Team Spotlight — ${team.city} ${team.name}`}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-2 pb-14 sm:pb-0 bg-black/10 hover:bg-black/20 transition-colors disabled:cursor-default"
        >
          {busy ? (
            <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-purple-700 shadow-lg">
              <span className="animate-pulse">📺</span> {player === 'loading' ? 'Producing your episode…' : 'Loading this week’s Spotlight…'}
            </span>
          ) : player === 'error' ? (
            <>
              <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-red-700 shadow-lg">⚠️ Couldn&apos;t produce the show — tap to retry</span>
              {message && <span className="max-w-[85%] text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]">{message}</span>}
            </>
          ) : (
            <>
              <span className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white/95 shadow-xl transition-transform group-hover:scale-105">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 sm:h-10 sm:w-10 fill-purple-600"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow">
                {gated ? 'Watch the preview' : 'Watch your episode'}
              </span>
            </>
          )}
        </button>
      )}

      {/* End of the teaser: the ask. */}
      {teaser === 'done' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-sm p-4">
          <div className="max-w-sm text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Team Spotlight · {episodeLabel}</div>
            <p className="mt-1 text-lg font-bold text-slate-900">
              Your full {team.name} episode is Premium
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Marcus &amp; Tony break down your last game and storylines on air, with your stats on screen. Premium is $4.99/mo.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {access === 'signedOut' ? (
                <>
                  <Link href="/login" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">Sign in</Link>
                  <Link href="/pricing" className="rounded-lg bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-200">See Premium</Link>
                </>
              ) : (
                <Link href="/pricing" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">Upgrade to Premium</Link>
              )}
              <button onClick={() => setTeaser('off')} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Not now</button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">The written recap is free, just below ↓</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** The poster's episode title for this moment. */
export function episodeLabelFor(narrative: string, phase: string, week: number): string {
  if (phase === 'resigning' || phase === 'draft' || phase === 'freeAgency') return 'Offseason Report';
  switch (narrative) {
    case 'preseason': return phase === 'preseason' ? 'Season Preview' : 'Week 1 Breakdown';
    case 'tradeDeadline': return 'Trade Deadline Special';
    case 'playoffsStart': return 'Playoff Edition';
    case 'seasonOver': return 'Season Wrap';
    // The dashboard's week is the upcoming one; the episode covers the last.
    default: return `Week ${Math.max(1, week - 1)} Breakdown`;
  }
}
