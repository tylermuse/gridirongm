'use client';

import { useEffect } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ScoutingReportBody } from '@/components/draft/ScoutingReportBody';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BasketballScoutingReport, TeamFit } from '@/lib/scouting/scoutingReport';

/**
 * Full scouting report modal (parity 2.1 / §F). A football-width panel: sticky
 * header, scrollable body (the shared ScoutingReportBody), and a sticky "Draft"
 * footer when the user's on the clock — so a freshly-scouted prospect can be
 * drafted straight from the auto-opened report.
 */
export function ScoutingReportModal({
  player, report, teamFit, onClose, onScout, canScout, userOnClock, onDraft,
}: {
  player: BasketballPlayer;
  report: BasketballScoutingReport;
  teamFit?: TeamFit | null;
  onClose: () => void;
  onScout?: () => void;
  canScout?: boolean;
  userOnClock?: boolean;
  onDraft?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div className="shrink-0 px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Scouting Report</div>
            <div className="text-xl font-black truncate">{player.firstName} {player.lastName}</div>
            <div className="text-xs text-[var(--text-sec)] flex items-center gap-1.5 mt-0.5">
              <Chip>{player.sportData.position}</Chip> · Age {player.age} · {report.archetype}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-3xl font-black leading-none" style={{ color: report.gradeColor }}>{report.grade}</div>
            <div className="text-[9px] uppercase tracking-widest opacity-60 mt-0.5">Grade</div>
          </div>
          <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-lg leading-none px-1" title="Close">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5">
          <ScoutingReportBody player={player} report={report} teamFit={teamFit} onScout={onScout} canScout={canScout} />
        </div>

        {/* Sticky footer — draft from the report when on the clock */}
        {userOnClock && onDraft && (
          <div className="shrink-0 sticky bottom-0 border-t px-5 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <button onClick={onDraft} className="w-full min-h-[44px] rounded-lg text-sm font-black text-white active:scale-[0.99]" style={{ background: 'var(--accent)' }}>
              Draft {player.lastName} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
