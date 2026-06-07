'use client';

import { useEffect } from 'react';
import { ScoutingReportBody } from '@/components/draft/ScoutingReportBody';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BasketballScoutingReport } from '@/lib/scouting/scoutingReport';

/**
 * Full scouting report modal (parity 2.1 / §F). Header + the shared
 * ScoutingReportBody (same content the Draft Board renders inline).
 */
export function ScoutingReportModal({
  player, report, onClose, onScout, canScout,
}: {
  player: BasketballPlayer;
  report: BasketballScoutingReport;
  onClose: () => void;
  onScout?: () => void;
  canScout?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-start gap-3 sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Scouting Report</div>
            <div className="text-lg font-black truncate">{player.firstName} {player.lastName}</div>
            <div className="text-xs text-[var(--text-sec)]">{player.sportData.position} · Age {player.age} · {report.archetype}</div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-3xl font-black leading-none" style={{ color: report.gradeColor }}>{report.grade}</div>
            <div className="text-[9px] uppercase tracking-widest opacity-60 mt-0.5">Grade</div>
          </div>
          <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-lg leading-none px-1" title="Close">✕</button>
        </div>
        <div className="p-5">
          <ScoutingReportBody player={player} report={report} onScout={onScout} canScout={canScout} />
        </div>
      </div>
    </div>
  );
}
