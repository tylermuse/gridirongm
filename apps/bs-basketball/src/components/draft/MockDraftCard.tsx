'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { buildMockDraft, type MockPick } from '@/lib/draft';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * Mock draft: for every remaining slot in the live order, the prospect that
 * team's AI would take — computed with the same pick function the AI uses when
 * it actually drafts (lib/draft/mockDraft.ts). Recomputes whenever the league
 * changes (each pick / trade). Labeled as a projection throughout.
 */
export function MockDraftCard({
  league, onSelectProspect, maxHeight = '40rem',
}: {
  league: BasketballLeagueState;
  onSelectProspect?: (id: string) => void;
  maxHeight?: string;
}) {
  const [round, setRound] = useState<1 | 2>(1);
  const mock = useMemo(() => buildMockDraft(league), [league]);
  const teamById = useMemo(() => new Map(league.teams.map(t => [t.id as string, t as BasketballTeam])), [league]);

  if (!mock) return null;
  const rows = mock.filter(m => m.round === round);
  const players = league.players as Record<string, BasketballPlayer>;

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2.5 border-b flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <h2 className="font-bold text-sm">Mock Draft</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>Projection</span>
        <div className="ml-auto flex rounded-lg p-0.5 text-xs font-bold" style={{ background: 'var(--surface)' }}>
          {([1, 2] as const).map(r => (
            <button key={r} onClick={() => setRound(r)} className="px-2.5 py-1 rounded-md" style={round === r ? { background: 'var(--surface-2)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : { color: 'var(--text-sec)' }}>Round {r}</button>
          ))}
        </div>
      </div>
      <p className="px-3 py-2 text-[11px] text-[var(--text-sec)] border-b" style={{ borderColor: 'var(--border)' }}>
        Who each team&apos;s front office would take if the draft ran right now, using the same logic the AI uses on the clock. Updates after every pick; trades and your own picks change it.
      </p>
      <ul className="overflow-y-auto" style={{ maxHeight }}>
        {rows.map(m => <MockRow key={m.overall} m={m} team={teamById.get(m.teamId)} player={players[m.prospectId]} isUser={m.teamId === league.userTeamId} onSelect={onSelectProspect} />)}
        {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--text-sec)]">No picks to project.</li>}
      </ul>
    </section>
  );
}

function MockRow({ m, team, player, isUser, onSelect }: {
  m: MockPick;
  team: BasketballTeam | undefined;
  player: BasketballPlayer | undefined;
  isUser: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <li
      className="grid grid-cols-[2.25rem_3rem_1fr_auto] gap-2 items-center px-3 py-2 border-t text-sm"
      style={{ borderColor: 'var(--border)', background: isUser ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined, opacity: m.made ? 0.6 : 1 }}
    >
      <span className="font-black tabular-nums text-[var(--text-sec)]">{m.overall}</span>
      <span className="text-xs font-bold" style={{ color: team?.primaryColor }}>{team?.abbreviation ?? '—'}</span>
      <button onClick={() => player && onSelect?.(player.id)} className="text-left min-w-0">
        <span className="font-semibold truncate block">{player ? `${player.firstName} ${player.lastName}` : '—'}</span>
        <span className="text-[10px] text-[var(--text-sec)]">{player ? `${player.ratings.overall} OVR · Age ${player.age}` : ''}{isUser ? ' · your pick' : ''}</span>
      </button>
      <span className="flex items-center gap-1.5">
        {player && <Chip>{player.sportData.position}</Chip>}
        <span className="text-[9px] font-bold uppercase tracking-wide w-12 text-right" style={{ color: m.made ? 'var(--text-sec)' : 'var(--accent)' }}>{m.made ? 'Made' : 'Proj'}</span>
      </span>
    </li>
  );
}
