'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { buildRecapShow, HOSTS, type SeasonRecap } from '@/lib/recap';
import type { BasketballLeagueState } from '@/lib/persistence/db';

/**
 * Episodic recap show (parity audit #15) — step through a studio rundown of the
 * season told by two commentator hosts. Pure UI over buildRecapShow().
 */
export function RecapShow({ league, recap }: { league: BasketballLeagueState; recap: SeasonRecap }) {
  const segments = useMemo(() => buildRecapShow(league, recap), [league, recap]);
  const [i, setI] = useState(0);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  if (segments.length === 0) return null;
  const seg = segments[Math.min(i, segments.length - 1)];
  const host = HOSTS[seg.host];

  return (
    <section className="rounded-2xl border mb-6 overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>📺</span>
          <span className="font-bold text-sm">The {recap.season} Recap Show</span>
        </div>
        <span className="text-xs uppercase tracking-widest text-[var(--text-sec)]">{seg.chapter}</span>
      </div>

      <div className="p-5">
        <button
          onClick={() => seg.playerId && setModalPlayerId(seg.playerId)}
          disabled={!seg.playerId}
          className={`w-full flex items-start gap-3 text-left ${seg.playerId ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="shrink-0 h-12 w-12 rounded-full grid place-items-center text-2xl" style={{ background: 'var(--surface-2)' }} aria-hidden>
            {host.avatar}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--accent)]">{host.name}</div>
            <p className="text-base leading-snug mt-0.5">{seg.line}</p>
          </div>
        </button>

        <div className="flex items-center justify-between mt-5">
          <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => setI(n => Math.max(0, n - 1))}>← Back</Button>
          <div className="flex gap-1.5" aria-hidden>
            {segments.map((s, idx) => (
              <span
                key={s.id}
                className="h-1.5 rounded-full transition-all"
                style={{ width: idx === i ? 18 : 6, background: idx === i ? 'var(--accent)' : 'var(--border)' }}
              />
            ))}
          </div>
          {i < segments.length - 1 ? (
            <Button variant="primary" size="sm" onClick={() => setI(n => Math.min(segments.length - 1, n + 1))}>Next →</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setI(0)}>↺ Replay</Button>
          )}
        </div>
      </div>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </section>
  );
}
