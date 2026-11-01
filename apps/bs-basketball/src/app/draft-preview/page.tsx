'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoutingReportModal } from '@/components/draft/ScoutingReportModal';
import { TieredScoutPanel, TierPips } from '@/components/draft/TieredScoutPanel';
import { MockDraftCard } from '@/components/draft/MockDraftCard';
import { buildBigBoard, getDraft, type BigBoardEntry } from '@/lib/draft';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { buildTieredReport, isWatched, potentialRange, scoutLevel, scoutPointsLeft, scoutSaveSeed } from '@/lib/scouting';
import { buildScoutingReport } from '@/lib/scouting/scoutingReport';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * /draft-preview — the pre-draft big board: every prospect ranked by scouted
 * (or projected) value with a projection grade, tiered scouting, a watchlist,
 * and the mock-draft projection of the first two rounds.
 */
const GRADE_COLOR: Record<string, string> = { A: '#10b981', B: '#2563eb', C: '#d97706', D: '#dc2626' };

export default function DraftPreviewPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const [reportId, setReportId] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'mock'>('board');
  const { scoutingAllocations } = useSubscription();
  const [watchOnly, setWatchOnly] = useState(false);

  const board = useMemo<BigBoardEntry[] | null>(() => (league ? buildBigBoard(league) : null), [league]);
  const draft = league ? getDraft(league) : null;

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  if (!board || board.length === 0 || !draft) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🔭"
            title="The big board opens at the draft"
            message="Once the season ends and the draft is set, scout the class here — ranked best to worst with full reports."
          />
        </div>
      </Shell>
    );
  }

  const saveSeed = scoutSaveSeed(league);
  const reportPlayer = reportId ? ((league.players as Record<string, BasketballPlayer>)[reportId] as BasketballPlayer | undefined) ?? null : null;
  const rows = watchOnly ? board.filter(e => isWatched(draft, e.player.id)) : board;
  const points = scoutPointsLeft(draft, scoutingAllocations.scoutPoints);

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-sm text-[var(--text-sec)]">
          {board.length} prospects · <span className="font-semibold text-[var(--foreground)]">{scoutingAllocations.isUnlimited ? '∞' : `${points}/${scoutingAllocations.scoutPoints}`}</span> scouting pts left. Tap a name to scout.
        </p>
        <div className="ml-auto flex rounded-lg p-0.5 text-xs font-bold" style={{ background: 'var(--surface-2)' }} role="tablist">
          {([['board', 'Big Board'], ['mock', 'Mock Draft']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className="px-3 py-1 rounded-md" style={view === k ? { background: 'var(--surface)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : { color: 'var(--text-sec)' }}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'mock' ? (
        <MockDraftCard league={league} onSelectProspect={setReportId} maxHeight="44rem" />
      ) : (
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={watchOnly} onChange={e => setWatchOnly(e.target.checked)} />
              ★ Watchlist only ({(draft.watchlist ?? []).length})
            </label>
          </div>
          <div className="grid grid-cols-[1.5rem_2.5rem_1fr_3rem_4.5rem_3.5rem] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-sec)] border-b" style={{ borderColor: 'var(--border)' }}>
            <span></span><span>Rank</span><span>Prospect</span><span className="text-center">OVR</span><span className="text-center">Pot</span><span className="text-right">Grade</span>
          </div>
          <ul className="max-h-[38rem] overflow-y-auto">
            {rows.map(entry => {
              const level = scoutLevel(draft, entry.player.id);
              const range = potentialRange(entry.player, level, saveSeed, draft.season);
              const watched = isWatched(draft, entry.player.id);
              return (
                <li key={entry.player.id} className="grid grid-cols-[1.5rem_2.5rem_1fr_3rem_4.5rem_3.5rem] gap-2 items-center px-3 py-2 border-t text-sm hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => void store.toggleWatchlist(entry.player.id)} className="text-sm" style={{ color: watched ? '#f59e0b' : 'var(--text-sec)' }} aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={watched}>{watched ? '★' : '☆'}</button>
                  <span className="font-black tabular-nums text-[var(--text-sec)]">{entry.rank}</span>
                  <button onClick={() => setReportId(entry.player.id)} className="flex items-center gap-2 min-w-0 text-left">
                    <PlayerAvatar firstName={entry.player.firstName} lastName={entry.player.lastName} primaryColor="#555" secondaryColor="#fff" photoUrl={entry.player.sportData.photoUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="font-semibold truncate block">{entry.player.firstName} {entry.player.lastName}</span>
                      <span className="text-xs text-[var(--text-sec)]">{entry.player.sportData.position} · Age {entry.player.age}</span>
                    </span>
                  </button>
                  <span className="text-center font-bold tabular-nums">{entry.player.ratings.overall}</span>
                  <span className="text-center tabular-nums text-xs">
                    {level === 3 ? <span className="font-bold text-sm">{entry.ceiling}</span> : level > 0 ? `${range.low}–${range.high}` : <span className="text-[var(--text-sec)]">{entry.ceiling}?</span>}
                    {level > 0 && <div className="leading-none"><TierPips level={level} /></div>}
                  </span>
                  <span className="text-right">
                    <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ color: GRADE_COLOR[entry.grade], border: `1px solid ${GRADE_COLOR[entry.grade]}` }}>{entry.grade}</span>
                  </span>
                </li>
              );
            })}
            {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--text-sec)]">No starred prospects yet — tap ☆ to add one.</li>}
          </ul>
        </section>
      )}

      {reportPlayer && (
        <ScoutingReportModal
          player={reportPlayer}
          report={buildScoutingReport(reportPlayer, { season: draft.season, scouted: scoutLevel(draft, reportPlayer.id) === 3 })}
          tiered={
            <TieredScoutPanel
              report={buildTieredReport(league, draft, reportPlayer)}
              onScout={lvl => void store.scoutProspect(reportPlayer.id, lvl)}
              disabled={store.loading}
            />
          }
          onClose={() => setReportId(null)}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
      <Link href="/draft" className="text-sm font-semibold opacity-70 hover:opacity-100">← Draft</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-4" style={{ color: 'var(--accent)' }}>Draft Big Board</h1>
      {children}
    </main>
  );
}
