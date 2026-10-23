'use client';

/**
 * Owner objectives card — this season's 2–3 owner goals with live progress
 * bars (dashboard + GM hub). Reads the frozen set from the save, or previews
 * the set the owner will hand out on the first simmed day (old saves).
 */

import { useMemo } from 'react';
import { currentObjectives, objectiveProgress, type ProgressStatus } from '@/lib/owner/objectives';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const STATUS: Record<ProgressStatus, { label: string; color: string }> = {
  met: { label: 'Met', color: '#059669' },
  on_track: { label: 'On track', color: '#059669' },
  at_risk: { label: 'At risk', color: '#d97706' },
  behind: { label: 'Behind', color: '#dc2626' },
  missed: { label: 'Missed', color: '#dc2626' },
  pending: { label: 'In progress', color: 'var(--text-sec)' },
};

const POSTURE_LABEL = { contend: 'Contend', balanced: 'Compete', rebuild: 'Rebuild' } as const;

const JOB_SECURITY_META: Record<string, { label: string; color: string }> = {
  safe: { label: 'Safe', color: '#059669' },
  warm: { label: 'On Notice', color: '#d97706' },
  hot: { label: 'Hot Seat', color: '#ea580c' },
  final_warning: { label: 'Final Warning', color: '#dc2626' },
};

export function OwnerObjectivesCard({ league, team, className = '' }: { league: LeagueState; team: BasketballTeam; className?: string }) {
  const set = useMemo(() => currentObjectives(league), [league]);
  const rows = useMemo(() => (set ? objectiveProgress(league, set) : []), [league, set]);
  const job = JOB_SECURITY_META[team.approval.jobSecurity] ?? JOB_SECURITY_META.safe;
  if (!set || rows.length === 0) return null;

  return (
    <section className={`rounded-xl border p-4 ${className}`} style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <header className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-xs uppercase tracking-widest text-[var(--text-sec)] mr-auto">Owner objectives · {set.season}</h2>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
          {POSTURE_LABEL[set.posture]} mode
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${job.color} 14%, transparent)`, color: job.color }}>
          {job.label}
        </span>
      </header>
      <ul className="space-y-3">
        {rows.map(r => {
          const st = STATUS[r.status];
          return (
            <li key={r.objective.id}>
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)' }}>{r.objective.description}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: st.color }}>{st.label}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(r.pct * 100)}%`, background: st.color === 'var(--text-sec)' ? 'var(--accent)' : st.color }} />
              </div>
              <div className="text-xs text-[var(--text-sec)] mt-0.5 tabular-nums">{r.detail}</div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-[var(--text-sec)] mt-3">Graded at season end — each met objective raises owner approval, each miss costs it.</p>
    </section>
  );
}
