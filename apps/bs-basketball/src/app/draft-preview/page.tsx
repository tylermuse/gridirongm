'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScoutingReportModal } from '@/components/draft/ScoutingReportModal';
import { buildBigBoard, getDraft, type BigBoardEntry } from '@/lib/draft';
import { isScouted } from '@/lib/scouting';
import { buildScoutingReport } from '@/lib/scouting/scoutingReport';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * /draft-preview — the pre-draft big board: every prospect ranked by scouted
 * (or projected) value, with a projection grade and a one-click full scouting
 * report. Available whenever a draft is set up.
 */
const GRADE_COLOR: Record<string, string> = { A: '#10b981', B: '#2563eb', C: '#d97706', D: '#dc2626' };

export default function DraftPreviewPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [reportId, setReportId] = useState<string | null>(null);

  const board = useMemo<BigBoardEntry[] | null>(() => (league ? buildBigBoard(league) : null), [league]);
  const draft = league ? getDraft(league) : null;

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  if (!board || board.length === 0) {
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

  const reportPlayer = reportId ? board.find(b => b.player.id === reportId)?.player ?? null : null;

  return (
    <Shell>
      <p className="text-sm text-[var(--text-sec)] mb-4">
        {board.length} prospects ranked by projected value. {draft ? `${draft.scoutsRemaining ?? 0} scouts left.` : ''} Tap a name for the full report.
      </p>
      <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_4rem] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--text-sec)] border-b" style={{ borderColor: 'var(--border)' }}>
          <span>Rank</span><span>Prospect</span><span className="text-center">OVR</span><span className="text-center">Pot</span><span className="text-right">Grade</span>
        </div>
        <ul className="max-h-[38rem] overflow-y-auto">
          {board.map(entry => (
            <li key={entry.player.id}>
              <button
                onClick={() => setReportId(entry.player.id)}
                className="w-full grid grid-cols-[2.5rem_1fr_3rem_3rem_4rem] gap-2 items-center px-3 py-2 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="font-black tabular-nums text-[var(--text-sec)]">{entry.rank}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <PlayerAvatar firstName={entry.player.firstName} lastName={entry.player.lastName} primaryColor="#555" secondaryColor="#fff" size="sm" />
                  <span className="min-w-0">
                    <span className="font-semibold truncate block">{entry.player.firstName} {entry.player.lastName}</span>
                    <span className="text-xs text-[var(--text-sec)]">{entry.player.sportData.position} · Age {entry.player.age}</span>
                  </span>
                </span>
                <span className="text-center font-bold tabular-nums">{entry.player.ratings.overall}</span>
                <span className="text-center tabular-nums text-[var(--text-sec)]">
                  {entry.ceiling}{entry.scouted ? '' : '?'}
                </span>
                <span className="text-right">
                  <span className="text-xs font-black px-1.5 py-0.5 rounded" style={{ color: GRADE_COLOR[entry.grade], border: `1px solid ${GRADE_COLOR[entry.grade]}` }}>{entry.grade}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {reportPlayer && draft && (
        <ScoutingReportModal
          player={reportPlayer}
          report={buildScoutingReport(reportPlayer as BasketballPlayer, { season: draft.season, scouted: isScouted(draft, reportPlayer.id) })}
          onClose={() => setReportId(null)}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/draft" className="text-sm font-semibold opacity-70 hover:opacity-100">← Draft</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-4" style={{ color: 'var(--accent)' }}>Draft Big Board</h1>
      {children}
    </main>
  );
}
