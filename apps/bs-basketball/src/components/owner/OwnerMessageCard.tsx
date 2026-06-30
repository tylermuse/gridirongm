'use client';

/**
 * Owner Message card (FEAT-4) — renders the structured note from buildOwnerMessage
 * above the trophy ceremony on /awards. Tone drives the accent color so the user
 * gets an immediate read on how the owner feels about the season before reading
 * a word.
 */

import type { OwnerMessage } from '@/lib/owner/ownerMessage';

const TONE_STYLE: Record<OwnerMessage['tone'], { ring: string; tint: string; pill: string; pillFg: string; emoji: string; label: string }> = {
  celebrate: {
    ring: '#10b981',
    tint: 'color-mix(in srgb, #10b981 8%, transparent)',
    pill: 'color-mix(in srgb, #10b981 18%, transparent)',
    pillFg: '#059669',
    emoji: '🏆',
    label: 'Championship season',
  },
  encourage: {
    ring: 'var(--accent)',
    tint: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    pill: 'color-mix(in srgb, var(--accent) 18%, transparent)',
    pillFg: 'var(--accent)',
    emoji: '📈',
    label: 'Trending up',
  },
  level: {
    ring: 'var(--border)',
    tint: 'var(--surface)',
    pill: 'var(--surface-2)',
    pillFg: 'var(--text-sec)',
    emoji: '⚖️',
    label: 'Steady',
  },
  concern: {
    ring: '#d97706',
    tint: 'color-mix(in srgb, #d97706 8%, transparent)',
    pill: 'color-mix(in srgb, #d97706 18%, transparent)',
    pillFg: '#b45309',
    emoji: '⚠️',
    label: 'Under expectations',
  },
  warning: {
    ring: '#dc2626',
    tint: 'color-mix(in srgb, #dc2626 8%, transparent)',
    pill: 'color-mix(in srgb, #dc2626 18%, transparent)',
    pillFg: '#dc2626',
    emoji: '🔥',
    label: 'Hot seat',
  },
};

export function OwnerMessageCard({ message }: { message: OwnerMessage }) {
  const t = TONE_STYLE[message.tone];
  return (
    <section
      className="rounded-2xl border-2 p-5 sm:p-6 mb-8"
      style={{ borderColor: t.ring, background: t.tint }}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-80">
          <span aria-hidden>{t.emoji}</span>
          <span>{message.headline}</span>
        </div>
        <span
          className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: t.pill, color: t.pillFg }}
        >
          {t.label}
        </span>
      </header>
      <div className="space-y-2.5 text-sm leading-relaxed">
        {message.body.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div
        className="mt-4 rounded-lg border-l-4 px-4 py-3 bg-[var(--surface)] text-sm font-semibold italic"
        style={{ borderColor: t.ring, color: 'var(--text)' }}
      >
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60 not-italic block mb-1">
          Marching orders
        </span>
        {message.directive}
      </div>
    </section>
  );
}
