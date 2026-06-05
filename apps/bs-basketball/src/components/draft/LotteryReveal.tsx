'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { dropConfetti } from '@/lib/ui/confetti';
import type { LotteryRevealCard, LotteryMovement } from '@/lib/draft/lotteryReveal';

/**
 * Draft Lottery reveal ceremony.
 *
 * A full-screen broadcast: picks surface #14 → #1, one card at a time, with a
 * war-room reaction to each result. Auto-plays like a TV reveal (pausable), with
 * manual Back/Next + Skip. Confetti fires on the No. 1 pick and whenever the
 * user's team lands a top-4 selection. The board behind it stays hidden until
 * the ceremony closes (which flips `lotteryRevealed`).
 */

const AUTOPLAY_MS = 2600;

const MOVEMENT_META: Record<LotteryMovement, { badge: (n: number) => string; color: string }> = {
  big_jump: { badge: n => `▲ JUMPED ${n}`, color: '#10b981' },
  jump:     { badge: n => `▲ Up ${n}`,     color: '#34d399' },
  held:     { badge: () => '— Held',        color: 'var(--text-sec)' },
  slip:     { badge: n => `▼ Down ${n}`,   color: '#f59e0b' },
  big_slip: { badge: n => `▼ FELL ${n}`,   color: '#ef4444' },
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function LotteryRevealCeremony({
  cards,
  onClose,
}: {
  cards: LotteryRevealCard[];
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(!prefersReducedMotion());
  const firedRef = useRef<Set<number>>(new Set());

  const atEnd = step >= cards.length - 1;
  const card = cards[step];

  const next = useCallback(() => {
    setStep(s => Math.min(s + 1, cards.length - 1));
  }, [cards.length]);
  const back = useCallback(() => {
    setPlaying(false);
    setStep(s => Math.max(s - 1, 0));
  }, []);

  // Auto-advance like a broadcast until we reach the No. 1 pick, then hold.
  useEffect(() => {
    if (!playing || atEnd) return;
    const id = setTimeout(next, AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [playing, atEnd, step, next]);

  // Keyboard: arrows step (and pause auto-play), space toggles play, Esc skips.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') { setPlaying(false); next(); }
      else if (e.key === 'ArrowLeft') back();
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  // Confetti on the climax (#1) and on the user's big moments (top-4).
  useEffect(() => {
    if (!card || firedRef.current.has(card.overall)) return;
    const userTop4 = card.isUser && card.overall <= 4;
    if (card.overall === 1 || userTop4) {
      firedRef.current.add(card.overall);
      dropConfetti(card.overall === 1 ? 80 : 50);
    }
  }, [card]);

  if (!card) return null;

  const meta = MOVEMENT_META[card.movement];
  const { team } = card;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bs-animate-fade"
      style={{ background: 'rgba(8,12,20,0.94)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md mx-auto px-6 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] font-bold text-white/40 mb-1">
          The Draft Lottery
        </div>
        <div className="text-xs text-white/40 mb-6">
          Revealing {cards.length - step} of {cards.length}
        </div>

        {/* Reveal card — keyed on step so it re-animates every advance. */}
        <div key={step} className="bs-animate-slide-right">
          <div className="text-white/50 text-sm font-semibold mb-3">
            With the {ordinal(card.overall)} pick…
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <TeamLogo
                abbreviation={team.abbreviation}
                primaryColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                size="xl"
              />
              <div
                className="absolute -top-2 -left-2 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shadow-lg tabular-nums"
                style={{ background: 'var(--accent)' }}
              >
                {card.overall}
              </div>
            </div>

            <div
              className="text-2xl font-black text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {team.city} {team.name}
              {card.isUser && (
                <span className="ml-2 align-middle text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'var(--accent)', color: '#fff' }}>
                  You
                </span>
              )}
            </div>

            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-black uppercase tracking-widest"
              style={{ color: meta.color, background: 'rgba(255,255,255,0.06)' }}
            >
              {meta.badge(Math.abs(card.delta))}
              <span className="text-white/40 normal-case tracking-normal font-semibold">
                · seeded {ordinal(card.expectedSlot)} ({card.oddsPct.toFixed(1)}% at No. 1)
              </span>
            </div>

            {/* War-room reaction */}
            <div className="relative mt-2 max-w-sm rounded-2xl px-4 py-3 text-sm text-white/90 bg-white/[0.06] border border-white/10">
              <span className="mr-1.5" aria-hidden>🎙️</span>
              {card.reaction}
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-7">
          {cards.map((c, i) => (
            <span
              key={c.overall}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? 18 : 6,
                background: i <= step
                  ? (c.isUser ? 'var(--accent)' : 'rgba(255,255,255,0.6)')
                  : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={back}
            disabled={step === 0}
            className="text-sm font-semibold text-white/70 hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <div className="flex items-center gap-4">
            {!atEnd && (
              <button
                onClick={() => setPlaying(p => !p)}
                className="text-xs text-white/40 hover:text-white/70"
              >
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
            )}
            <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">
              Skip
            </button>
          </div>
          {atEnd ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95"
            >
              Enter the Draft →
            </button>
          ) : (
            <button
              onClick={() => { setPlaying(false); next(); }}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
