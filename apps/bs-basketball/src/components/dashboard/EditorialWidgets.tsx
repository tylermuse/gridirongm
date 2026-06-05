'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { byTheNumbers, scoringLeaders, teamStar } from '@/lib/dashboard/editorial';
import { computeLeagueStatRanks, ordinal } from '@/lib/stats/leagueRank';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Editorial dashboard row (parity audit #23) — By the Numbers + Star Watch.
 * Derived from box scores; renders nothing until at least one game is played.
 */
export function EditorialWidgets({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const numbers = useMemo(() => byTheNumbers(league, team), [league, team]);
  const star = useMemo(() => teamStar(league, team), [league, team]);
  const mvpRace = useMemo(() => scoringLeaders(league, 5), [league]);
  const ranks = useMemo(() => computeLeagueStatRanks(league), [league]);

  if (numbers.length === 0 && !star) return null;

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>By the Numbers</CardTitle></CardHeader>
          <div className="space-y-2.5">
            {numbers.map((n, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span className="text-2xl font-black tabular-nums shrink-0 w-16 text-right" style={{ color: 'var(--accent)' }}>{n.value}</span>
                <span className="text-sm text-[var(--text-sec)] leading-tight">{n.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Star Watch</CardTitle>
            <Link href="/stats" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Leaders →</Link>
          </CardHeader>

          {star && (
            <button
              onClick={() => setModalPlayerId(star.id)}
              className="w-full text-left rounded-lg p-3 mb-3 transition-colors hover:bg-[var(--surface-2)]"
              style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
            >
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-0.5">Your standout</div>
              <div className="font-bold">{star.name} <span className="text-[var(--text-sec)] font-normal">· {star.position}</span></div>
              <div className="text-sm tabular-nums mt-0.5">
                <span className="font-semibold">{star.ppg.toFixed(1)}</span> ppg{(() => { const r = ranks.rank(star.id, 'ppg'); return r ? <span className="opacity-60"> ({ordinal(r)})</span> : null; })()} ·{' '}
                <span className="font-semibold">{star.rpg.toFixed(1)}</span> rpg{(() => { const r = ranks.rank(star.id, 'rpg'); return r ? <span className="opacity-60"> ({ordinal(r)})</span> : null; })()} ·{' '}
                <span className="font-semibold">{star.apg.toFixed(1)}</span> apg{(() => { const r = ranks.rank(star.id, 'apg'); return r ? <span className="opacity-60"> ({ordinal(r)})</span> : null; })()}
              </div>
            </button>
          )}

          {mvpRace.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">MVP race · scoring</div>
              <ol className="space-y-1">
                {mvpRace.map((r, i) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setModalPlayerId(r.id)}
                      className="w-full flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors text-left"
                    >
                      <span className="w-4 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                      <span className="flex-1 truncate">{r.name} <span className="text-[var(--text-sec)]">{r.teamAbbr}</span></span>
                      <span className="tabular-nums font-semibold">{r.ppg.toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      </div>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </>
  );
}
