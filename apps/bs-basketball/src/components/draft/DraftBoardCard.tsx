'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ScoutingReportBody } from '@/components/draft/ScoutingReportBody';
import { buildScoutingReport, teamFitFor } from '@/lib/scouting/scoutingReport';
import { isScouted, scoutsLeft } from '@/lib/scouting';
import { SCOUTS_PER_DRAFT } from '@/lib/draft';
import { positionNeeds, TARGET_DEPTH } from '@/lib/draft/needs';
import { consensus2026Rank } from '@/lib/data/draft2026';
import { ratingColor } from '@/lib/ui/ratingColor';
import type { DraftState } from '@/lib/draft';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * Draft Board (parity §B): the rich prospect table — search + position + a
 * three-state filter (All / ⭐ Starred / Scouted), a scout-points bar with
 * auto-scout, a roster-needs snapshot, and inline row expansion that renders the
 * full scouting report. The single prospect surface.
 */

const POSITIONS: (BasketballPosition | 'ALL')[] = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'];

/** Board ranking score: consensus big-board prospects sit on top in board order
 *  (so a high-upside teen isn't buried by his low current OVR); everyone else is
 *  ranked by a potential-weighted projection (it's a draft — ceiling matters). */
function prospectScore(p: BasketballPlayer): number {
  const rank = consensus2026Rank(`${p.firstName} ${p.lastName}`);
  return rank ? 10_000 - rank : p.ratings.overall * 0.35 + p.development.potential * 0.65;
}

export function DraftBoardCard({
  league, draft, pool, recommendedId, userOnClock, loading, onScout, onDraft,
}: {
  league: BasketballLeagueState;
  draft: DraftState;
  /** The prospect pool (already resolved from poolIds). */
  pool: BasketballPlayer[];
  recommendedId: string | null;
  userOnClock: boolean;
  loading: boolean;
  onScout: (id: string) => void;
  onDraft: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<BasketballPosition | 'ALL'>('ALL');
  const [tab, setTab] = useState<'all' | 'starred' | 'scouted'>('all');
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  // Projected draft rank = position on the overall board.
  const projRank = useMemo(() => {
    const m = new Map<string, number>();
    [...pool].sort((a, b) => prospectScore(b) - prospectScore(a)).forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [pool]);

  const userTeam = league.userTeamId ? (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) : undefined;
  const needs = userTeam ? positionNeeds(userTeam, league.players as Record<string, BasketballPlayer>) : [];
  const needSet = new Set(needs.filter(n => n.needScore >= 25).map(n => n.position));

  const rows = pool.filter(p => {
    if (posFilter !== 'ALL' && p.sportData.position !== posFilter) return false;
    if (tab === 'starred' && !starred.has(p.id)) return false;
    if (tab === 'scouted' && !isScouted(draft, p.id)) return false;
    if (search && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => prospectScore(b) - prospectScore(a));

  const scoutsRemaining = scoutsLeft(draft);
  const scoutPct = Math.round((scoutsRemaining / SCOUTS_PER_DRAFT) * 100);
  const scoutBar = scoutsRemaining > SCOUTS_PER_DRAFT * 0.5 ? 'bg-blue-500' : scoutsRemaining > SCOUTS_PER_DRAFT * 0.2 ? 'bg-amber-500' : 'bg-red-500';

  function toggleStar(id: string) {
    setStarred(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function autoScout() {
    // Scout down the board (starred first, then rank order), spending scouts.
    const order = [...pool]
      .filter(p => !isScouted(draft, p.id))
      .sort((a, b) => (Number(starred.has(b.id)) - Number(starred.has(a.id))) || (b.ratings.overall - a.ratings.overall));
    order.slice(0, scoutsRemaining).forEach(p => onScout(p.id));
  }

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Header + filters */}
      <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-sm mr-1">Draft Board</h2>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-8 px-2 text-xs rounded border bg-[var(--surface)] flex-1 min-w-[100px]" style={{ borderColor: 'var(--border)' }} />
          <select value={posFilter} onChange={e => setPosFilter(e.target.value as BasketballPosition | 'ALL')} className="h-8 px-2 text-xs rounded border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex rounded-lg p-0.5 text-xs font-bold" style={{ background: 'var(--surface)' }}>
            {([['all', 'All'], ['starred', '⭐'], ['scouted', 'Scouted']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="px-2.5 py-1 rounded-md" style={tab === k ? { background: 'var(--surface-2)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : { color: 'var(--text-sec)' }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]">Scout Pts</span>
          <div className="w-20 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div className={`h-full ${scoutBar}`} style={{ width: `${scoutPct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-[var(--text-sec)]">{scoutsRemaining}/{SCOUTS_PER_DRAFT}</span>
          <button onClick={autoScout} disabled={scoutsRemaining === 0 || loading} className="ml-auto text-[11px] font-bold rounded-md px-2 py-1 disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>Auto-scout</button>
        </div>
      </div>

      {/* Roster needs snapshot */}
      {userTeam && (
        <details className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <summary className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] cursor-pointer">Your roster needs</summary>
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {needs.slice().sort((a, b) => ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(a.position) - ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(b.position)).map(n => (
              <div key={n.position} className="rounded-md text-center py-1" style={{ background: n.needScore >= 40 ? 'color-mix(in srgb,#dc2626 14%,transparent)' : n.needScore >= 25 ? 'color-mix(in srgb,#d97706 14%,transparent)' : 'color-mix(in srgb,#10b981 12%,transparent)' }}>
                <div className="text-[10px] font-bold">{n.position}</div>
                <div className="text-sm font-black tabular-nums">{n.count}</div>
                <div className="text-[9px] opacity-60">/{TARGET_DEPTH}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Table — FEAT-3: cap the visible window at ~10 rows so the board
          doesn't sprawl down the page, and scroll the rest. max-h is sized
          for thead + 10 body rows at the current py-2.5 row height. Sticky
          thead keeps column labels in view while the user scans down. */}
      <div className="overflow-auto max-h-[28rem]">
        <table className="w-full text-sm min-w-[480px] sticky-col sticky-action">
          <thead className="text-[var(--text-sec)] text-[10px] uppercase tracking-wider sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
            <tr>
              <th className="w-6"></th>
              <th className="w-12 text-center py-2">Proj</th>
              <th className="text-left">Player</th>
              <th className="text-center">Pos</th>
              <th className="text-center">OVR</th>
              <th className="text-center">Scout</th>
              <th className="text-right pr-3">Draft</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const scouted = isScouted(draft, p.id);
              const isOpen = expanded === p.id;
              const affordable = scoutsRemaining > 0;
              const fillsNeed = needSet.has(p.sportData.position);
              return (
                <FragmentRow key={p.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="border-t cursor-pointer transition-colors"
                    style={{ borderColor: 'var(--border)', background: isOpen ? 'var(--surface-2)' : p.id === recommendedId ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}
                  >
                    <td className="py-2.5 pl-2"><svg width="10" height="10" viewBox="0 0 10 10" className={isOpen ? 'rotate-90' : ''} style={{ transition: 'transform .15s', opacity: 0.5 }}><path d="M3 1l4 4-4 4" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg></td>
                    <td className="text-center font-mono text-xs text-[var(--text-sec)]">{projRank.get(p.id)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={e => { e.stopPropagation(); toggleStar(p.id); }} className="text-sm" style={{ color: starred.has(p.id) ? '#f59e0b' : 'var(--text-sec)' }} aria-label="Star">{starred.has(p.id) ? '★' : '☆'}</button>
                        <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                        {p.id === recommendedId && <span className="text-[9px] font-black px-1 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>REC</span>}
                        {fillsNeed && <span className="text-[9px] px-1 rounded" style={{ background: 'color-mix(in srgb,#10b981 18%,transparent)', color: '#059669' }}>Need</span>}
                      </div>
                      <div className="text-[10px] text-[var(--text-sec)]">Age {p.age} · {p.sportData.starTier}</div>
                    </td>
                    <td className="text-center"><Chip>{p.sportData.position}</Chip></td>
                    <td className={`text-center font-bold tabular-nums ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                    <td className="text-center">
                      {scouted
                        ? <span className={`font-bold tabular-nums ${ratingColor(p.development.potential)}`} title="Scouted ceiling">{p.development.potential}</span>
                        : <button onClick={e => { e.stopPropagation(); onScout(p.id); setExpanded(p.id); }} disabled={!affordable || loading} className="text-[10px] font-bold rounded border px-2 py-1 disabled:opacity-40" style={affordable ? { color: 'var(--accent)', background: 'var(--accent-glow)', borderColor: 'var(--accent)' } : { color: '#d97706', borderColor: '#d97706' }}>{affordable ? 'Scout' : '🔒'}</button>}
                    </td>
                    <td className="text-right pr-3">
                      {userOnClock
                        ? <button onClick={e => { e.stopPropagation(); onDraft(p.id); }} disabled={loading} className="text-xs font-bold rounded-md px-2.5 py-1" style={{ background: 'var(--accent)', color: '#fff' }}>Draft</button>
                        : <span className="text-xs opacity-30">—</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={7} className="px-4 py-3">
                        <ScoutingReportBody
                          player={p}
                          report={buildScoutingReport(p, { season: draft.season, scouted })}
                          teamFit={userTeam ? teamFitFor(userTeam.playerIds.filter(id => (league.players[id] as BasketballPlayer | undefined)?.sportData.position === p.sportData.position).length, userTeam.abbreviation) : null}
                          onScout={() => onScout(p.id)}
                          canScout={affordable && !loading}
                        />
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-[var(--text-sec)]">No prospects match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// React fragments can't take a key on a <></> with multiple children in a map
// cleanly across rows, so wrap the row pair in a keyed fragment helper.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
