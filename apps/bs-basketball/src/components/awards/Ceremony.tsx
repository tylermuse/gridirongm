'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { dropConfetti } from '@/lib/ui/confetti';
import type { SeasonAwards } from '@/lib/awards';
import { perGame, emptyBasketballStats, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';

/**
 * Awards ceremony (Tier 3.5). A full-screen overlay that reveals the trophies
 * one at a time, building from the lesser awards up to MVP (confetti on the
 * climax). Manual stepping with Next/Back + arrow keys; Esc closes.
 *
 * Slides are derived from the same computeSeasonAwards data the grid uses, so
 * there's no second source of truth — this is purely a presentation layer.
 */

interface Slide {
  key: string;
  label: string;
  emoji: string;
  name: string;
  subtitle: string;
  statline: { label: string; value: string }[];
  finalists: string[];
  primaryColor: string;
  secondaryColor: string;
  firstName: string;
  lastName: string;
  isMvp: boolean;
  /** Optional headshot URL — BUG-31. Falls back to initials. */
  photoUrl?: string;
}

// Lesser → greater, so the ceremony crescendos into MVP.
const ORDER: { key: keyof SeasonAwards['winners']; label: string; emoji: string; defensive?: boolean }[] = [
  { key: 'mip', label: 'Most Improved Player', emoji: '📈' },
  { key: 'sixthMan', label: 'Sixth Man of the Year', emoji: '🔥' },
  { key: 'roy', label: 'Rookie of the Year', emoji: '🌟' },
  { key: 'dpoy', label: 'Defensive Player of the Year', emoji: '🛡️', defensive: true },
  { key: 'finalsMvp', label: 'Finals MVP', emoji: '👑' },
  { key: 'mvp', label: 'Most Valuable Player', emoji: '🏆' },
];

function buildSlides(
  awards: SeasonAwards,
  teamById: Map<string, BasketballTeam>,
  playerById: Record<string, BasketballPlayer>,
): Slide[] {
  const slides: Slide[] = [];
  for (const def of ORDER) {
    const winner = awards.winners[def.key];
    if (!winner) continue;
    const player = playerById[winner.winnerId];
    if (!player) continue;
    const team = player.rosterSlot ? teamById.get(player.rosterSlot.teamId) : undefined;
    const statsMap = def.key === 'finalsMvp' ? awards.finalsStats : awards.seasonStats;
    const pg = perGame(statsMap?.get(player.id) ?? emptyBasketballStats());
    const statline = def.defensive
      ? [
          { label: 'PPG', value: (pg.points ?? 0).toFixed(1) },
          { label: 'SPG', value: (pg.steals ?? 0).toFixed(1) },
          { label: 'BPG', value: (pg.blocks ?? 0).toFixed(1) },
        ]
      : [
          { label: 'PPG', value: (pg.points ?? 0).toFixed(1) },
          { label: 'RPG', value: (pg.totalRebounds ?? 0).toFixed(1) },
          { label: 'APG', value: (pg.assists ?? 0).toFixed(1) },
        ];
    slides.push({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      name: `${player.firstName} ${player.lastName}`,
      subtitle: team ? `${team.city} ${team.name} · ${player.sportData.position}` : player.sportData.position,
      statline,
      finalists: winner.finalists
        .map(id => playerById[id])
        .filter(Boolean)
        .map(p => `${p.firstName[0]}. ${p.lastName}`),
      primaryColor: team?.primaryColor ?? '#888',
      secondaryColor: team?.secondaryColor ?? '#fff',
      firstName: player.firstName,
      lastName: player.lastName,
      photoUrl: player.sportData.photoUrl,
      isMvp: def.key === 'mvp',
    });
  }
  return slides;
}

export function AwardsCeremony({
  awards, teamById, playerById, onClose,
}: {
  awards: SeasonAwards;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
  onClose: () => void;
}) {
  const slides = useMemo(() => buildSlides(awards, teamById, playerById), [awards, teamById, playerById]);
  const [step, setStep] = useState(0);
  const confettiFiredRef = useRef(false);

  const atEnd = step >= slides.length - 1;
  const slide = slides[step];

  // Keyboard: arrows step, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setStep(s => Math.min(s + 1, slides.length - 1)); }
      else if (e.key === 'ArrowLeft') setStep(s => Math.max(s - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length, onClose]);

  // Confetti when the MVP slide is revealed (once).
  useEffect(() => {
    if (slide?.isMvp && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      dropConfetti(60);
    }
  }, [slide]);

  if (slides.length === 0) {
    return (
      <Backdrop onClose={onClose}>
        <div className="text-center text-white">
          <p className="mb-4">No awards to present yet.</p>
          <button onClick={onClose} className="underline opacity-80 hover:opacity-100">Close</button>
        </div>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <div className="w-full max-w-md mx-auto px-6" onClick={e => e.stopPropagation()}>
        {/* Reveal card — keyed on step so the animation replays each advance. */}
        <div key={step} className="bs-animate-slide-right text-center">
          <div className="text-6xl mb-3" aria-hidden>{slide.emoji}</div>
          <div className="text-xs uppercase tracking-[0.3em] font-bold text-white/60 mb-5">{slide.label}</div>

          <div className="flex flex-col items-center gap-3">
            <PlayerAvatar
              firstName={slide.firstName}
              lastName={slide.lastName}
              primaryColor={slide.primaryColor}
              secondaryColor={slide.secondaryColor}
              photoUrl={slide.photoUrl}
              size="xl"
            />
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
              Winner
            </div>
            <div className="text-2xl font-black text-white" style={{ fontFamily: 'var(--font-display)' }}>{slide.name}</div>
            <div className="text-sm text-white/60">{slide.subtitle}</div>
          </div>

          <div className="flex justify-center gap-6 mt-5">
            {slide.statline.map(s => (
              <div key={s.label}>
                <div className="text-2xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{s.value}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">{s.label}</div>
              </div>
            ))}
          </div>

          {slide.finalists.length > 0 && (
            <div className="mt-5 text-xs text-white/40">
              Finalists: {slide.finalists.join(', ')}
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-8">
          {slides.map((s, i) => (
            <span
              key={s.key}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? 20 : 6,
                background: i <= step ? 'var(--accent)' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => setStep(s => Math.max(s - 1, 0))}
            disabled={step === 0}
            className="text-sm font-semibold text-white/70 hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70">Skip</button>
          {atEnd ? (
            <button onClick={onClose} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95">
              Done
            </button>
          ) : (
            <button
              onClick={() => setStep(s => Math.min(s + 1, slides.length - 1))}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white active:scale-95"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bs-animate-fade"
      style={{ background: 'rgba(8,12,20,0.92)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}
