'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { teamLeaders } from '@/lib/dashboard/leaders';
import { ordinal } from '@/lib/stats/leagueRank';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Team Leaders dashboard card (spec 2.3) — the user team's leader in each
 * headline category with an Age·OVR·POT meta line. Renders nothing before any
 * games are played.
 */
export function TeamLeaders({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const leaders = useMemo(() => teamLeaders(league, team), [league, team]);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  if (leaders.length === 0) return null;

  return (
    <Card className="mb-6">
      <SectionHeader title="Team Leaders" icon="⭐" action={{ label: 'Stats →', href: '/stats' }} />
      <div className="grid sm:grid-cols-2 gap-2">
        {leaders.map(l => (
          <button
            key={l.category}
            onClick={() => setModalPlayerId(l.player.id)}
            className="flex items-center gap-3 rounded-lg p-2.5 text-left hover:bg-[var(--surface-2)] transition-colors"
            style={{ background: 'var(--surface-2)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">{l.category}</div>
              <div className="font-bold truncate">{l.player.firstName} {l.player.lastName}</div>
              <div className="text-[11px] text-[var(--text-sec)] truncate">{l.meta}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{l.value.toFixed(1)}</div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">
                {l.unit}{l.rank ? <span className="normal-case"> · {ordinal(l.rank)}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </Card>
  );
}
