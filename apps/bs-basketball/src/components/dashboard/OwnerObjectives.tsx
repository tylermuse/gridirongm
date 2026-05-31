'use client';

import { Card } from '@/components/ui/Card';
import { teamCap, teamObjectives } from '@/lib/dashboard/summary';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const JOB_SECURITY_META: Record<string, { label: string; color: string }> = {
  safe: { label: 'Safe', color: '#10b981' },
  warm: { label: 'On Notice', color: '#f59e0b' },
  hot: { label: 'Hot Seat', color: '#f97316' },
  final_warning: { label: 'Final Warning', color: '#dc2626' },
};

/**
 * Owner objectives (P0.3) — three specific, live-computed goals as a checklist,
 * plus the job-security chip. Replaces the abstract Owner/Fan approval bars,
 * which read as meaningless numbers without context.
 */
export function OwnerObjectives({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const cap = teamCap(league, team);
  const objectives = teamObjectives(league, team, cap);
  const job = JOB_SECURITY_META[team.approval.jobSecurity] ?? JOB_SECURITY_META.safe;

  return (
    <Card className="!p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest opacity-60">Owner objectives</div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ background: `color-mix(in srgb, ${job.color} 18%, transparent)`, color: job.color }}
        >
          {job.label}
        </span>
      </div>
      <ul className="space-y-2">
        {objectives.map(o => (
          <li key={o.label} className="flex items-center gap-3 text-sm">
            <span
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px]"
              style={{
                background: o.met ? '#10b981' : 'var(--surface-2)',
                color: o.met ? '#fff' : 'var(--text-sec)',
              }}
              aria-hidden
            >
              {o.met ? '✓' : o.icon}
            </span>
            <span className={`flex-1 ${o.met ? 'line-through opacity-60' : ''}`}>{o.label}</span>
            <span className="text-xs tabular-nums text-[var(--text-sec)]">{o.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
