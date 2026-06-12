'use client';

import { useState } from 'react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Chip } from '@/components/ui/Chip';
import { ratingColor } from '@/lib/ui/ratingColor';
import { acceptanceProbability, bestCompetingOffer, type FreeAgentInfo } from '@/lib/freeAgency';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * Sortable free-agent table with an expandable intel panel (parity with
 * football's FA table + FAEvaluationPanel). All intel is derived from existing
 * engine calls — acceptance %, competing interest, Bird rights, market vs ask.
 */

type SortKey = 'ovr' | 'pot' | 'age' | 'ppg' | 'ask';

function money(n: number): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return a >= 1_000_000 ? `${s}$${(a / 1_000_000).toFixed(1)}M` : `${s}$${Math.round(a / 1000)}K`;
}
function lastLine(f: FreeAgentInfo): { ppg: number; text: string } {
  const log = f.player.sportData.seasonLog;
  const last = log && log.length ? log[log.length - 1] : null;
  if (!last || !last.gamesPlayed) return { ppg: 0, text: '—' };
  return { ppg: last.ppg, text: `${last.ppg}/${last.rpg}/${last.apg}` };
}

export function FreeAgentTable({
  league, pool, room, selectedId, onSelect,
}: {
  league: BasketballLeagueState;
  pool: FreeAgentInfo[];
  room: number;
  selectedId: string | null;
  onSelect: (f: FreeAgentInfo) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id as string, t]));

  const rows = [...pool].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'ovr': cmp = a.player.ratings.overall - b.player.ratings.overall; break;
      case 'pot': cmp = a.player.development.potential - b.player.development.potential; break;
      case 'age': cmp = a.player.age - b.player.age; break;
      case 'ppg': cmp = lastLine(a).ppg - lastLine(b).ppg; break;
      default: cmp = a.marketSalary * a.desiredYears - b.marketSalary * b.desiredYears;
    }
    return cmp * dir;
  });

  function sort(k: SortKey) {
    if (k === sortKey) setDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === 'age' ? 1 : -1); }
  }
  const th = (k: SortKey, label: string, cls = '') => (
    <th onClick={() => sort(k)} className={`py-2 cursor-pointer hover:text-[var(--text)] select-none ${cls}`}>{label}{k === sortKey ? (dir === 1 ? ' ↑' : ' ↓') : ''}</th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm sticky-col sticky-action">
        <thead className="text-[var(--text-sec)] text-[10px] uppercase tracking-wider" style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th className="w-5"></th>
            <th className="text-left pl-1">Player</th>
            <th className="text-center">Pos</th>
            {th('age', 'Age', 'text-center')}
            {th('ovr', 'OVR', 'text-center')}
            {th('pot', 'POT', 'text-center')}
            {th('ppg', 'Last', 'text-center')}
            {th('ask', 'Ask', 'text-right')}
            <th className="text-right pr-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-[var(--text-sec)]">No free agents match.</td></tr>}
          {rows.map(f => {
            const p = f.player;
            const last = f.lastTeamId ? teamById.get(f.lastTeamId) : null;
            const isSel = selectedId === p.id;
            const isOpen = expanded === p.id;
            const ll = lastLine(f);
            return (
              <RowGroup key={p.id}>
                <tr
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="border-t cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderColor: 'var(--border)', background: isSel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                >
                  <td className="pl-2"><svg width="9" height="9" viewBox="0 0 10 10" className={isOpen ? 'rotate-90' : ''} style={{ transition: 'transform .15s', opacity: 0.5 }}><path d="M3 1l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg></td>
                  <td className="py-2 pl-1">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={last?.primaryColor ?? '#555'} secondaryColor={last?.secondaryColor ?? '#fff'} size="sm" />
                      <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                      <BirdChip tier={f.birdRights} />
                    </div>
                  </td>
                  <td className="text-center"><Chip>{p.sportData.position}</Chip></td>
                  <td className="text-center tabular-nums text-[var(--text-sec)]">{p.age}</td>
                  <td className={`text-center font-bold tabular-nums ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                  <td className="text-center tabular-nums text-[var(--text-sec)]">{p.development.potential}</td>
                  <td className="text-center tabular-nums text-[var(--text-sec)]">{ll.text}</td>
                  <td className="text-right tabular-nums">{money(f.marketSalary)}</td>
                  <td className="text-right pr-3">
                    <button onClick={e => { e.stopPropagation(); onSelect(f); }} className="text-xs font-bold rounded-md px-2.5 py-1 text-white" style={{ background: 'var(--accent)' }}>Offer</button>
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ background: 'color-mix(in srgb, var(--surface-2) 50%, transparent)' }}>
                    <td colSpan={9} className="px-4 py-3">
                      <FaIntel league={league} info={f} room={room} teamById={teamById} />
                    </td>
                  </tr>
                )}
              </RowGroup>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FaIntel({ league, info, room, teamById }: { league: BasketballLeagueState; info: FreeAgentInfo; room: number; teamById: Map<string, BasketballTeam> }) {
  const offer = { years: info.desiredYears, salaryPerYear: info.marketSalary };
  const competing = bestCompetingOffer(league, info);
  const accept = Math.round(acceptanceProbability(info, offer, competing?.total ?? 0) * 100);
  const total = info.marketSalary * info.desiredYears;
  const affordable = info.marketSalary <= room;
  const compTeam = competing ? teamById.get(competing.teamId) : null;
  const rec = info.player.ratings.overall >= 78 ? 'Priority Target' : info.player.ratings.overall >= 70 ? 'Solid Add' : affordable ? 'Depth Option' : 'Stretch';
  const recColor = rec === 'Priority Target' ? '#10b981' : rec === 'Stretch' ? '#d97706' : 'var(--accent-alt)';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black px-2 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${recColor} 16%, transparent)`, color: recColor }}>{rec}</span>
        <span className="text-xs text-[var(--text-sec)]">{info.player.sportData.position} · {info.player.ratings.overall} OVR · {info.player.development.potential} POT · age {info.player.age}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div><L>Accepts at market</L><div className="font-bold tabular-nums" style={{ color: accept >= 60 ? '#10b981' : accept >= 35 ? '#d97706' : '#dc2626' }}>{accept}%</div></div>
        <div><L>Market ask</L><div className="font-bold tabular-nums">{money(info.marketSalary)}/yr · {info.desiredYears}y</div><div className="opacity-60">{money(total)} total</div></div>
        <div><L>Competition</L><div className="font-semibold">{compTeam ? `${compTeam.city} ~${money(competing!.total)}` : 'No competing interest'}</div></div>
        <div>
          <L>Bird rights</L>
          <div
            className="font-semibold capitalize"
            title={
              info.birdRights === 'none'
                ? 'No Bird rights: his former team has no cap exception to re-sign him, so he signs like any free agent.'
                : 'Bird rights let his former team exceed the salary cap to re-sign him (earned by 2-3 seasons on a roster). That team competes hard to keep him even when capped out.'
            }
          >
            {info.birdRights}{info.birdRights !== 'none' ? ' — former team can exceed cap to keep him' : ''}
          </div>
        </div>
      </div>
      <div className="text-xs italic text-[var(--text-sec)]">
        GM take: {accept >= 60 ? 'Should sign at market.' : accept >= 35 ? 'May need to beat the market or his ask.' : 'Will likely take a better offer elsewhere.'}{!affordable ? ' Over your cap room — clear space first.' : ''}
      </div>
    </div>
  );
}

function L({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]">{children}</div>;
}

function BirdChip({ tier }: { tier: FreeAgentInfo['birdRights'] }) {
  if (tier === 'none') return null;
  return <span className="text-[9px] font-bold px-1 rounded shrink-0" style={{ background: 'color-mix(in srgb, var(--accent-alt) 16%, transparent)', color: 'var(--accent-alt)' }}>🐦 {tier}</span>;
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
