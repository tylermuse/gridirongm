'use client';

import { Card } from '@/components/ui/Card';
import { computeAchievements } from '@/lib/dashboard/achievements';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Two ring gauges — Fan Pulse + Owner approval (parity audit #18). Football
 *  pairs them with the owner objectives right under the hero; the hot-seat
 *  flag sits beside the rings. */
export function ApprovalRings({ team, className = '' }: { team: BasketballTeam; className?: string }) {
  const { fanApproval, ownerApproval, jobSecurity } = team.approval;
  const hot = jobSecurity === 'hot' || jobSecurity === 'final_warning';
  return (
    <Card className={`!p-4 flex flex-col justify-center ${className}`}>
      <div className="flex items-center justify-around gap-4">
        <Ring value={fanApproval} label="Fan Pulse" />
        <Ring value={ownerApproval} label="Owner" />
      </div>
      {hot && (
        <div className="mt-3 text-center">
          <span className="text-xs font-bold px-2 py-1 rounded animate-pulse" style={{ color: '#dc2626', background: 'color-mix(in srgb, #dc2626 12%, transparent)' }}>
            🔥 {jobSecurity === 'final_warning' ? 'Final Warning' : 'Hot Seat'}
          </span>
        </div>
      )}
    </Card>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const color = value >= 60 ? '#10b981' : value >= 40 ? '#f59e0b' : '#dc2626';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" />
        <text x="32" y="38" textAnchor="middle" className="font-black" style={{ fontSize: 16, fill: 'var(--text)' }}>{Math.round(value)}</text>
      </svg>
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
    </div>
  );
}

/** Trophy case — derived achievement badges (parity audit #17). Football's
 *  compact achievements strip: one small tile per badge, unlocked in amber,
 *  locked greyed with progress; names collapse to just the emoji on phones. */
export function TrophyCase({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const achievements = computeAchievements(league, team);
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-6" aria-label="Trophy case">
      {achievements.map(a => (
        <div
          key={a.label}
          className={`flex flex-col items-center gap-0.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-xs border transition-all ${a.unlocked ? '' : 'opacity-40'}`}
          style={a.unlocked
            ? { background: 'color-mix(in srgb, #f59e0b 12%, transparent)', borderColor: 'color-mix(in srgb, #f59e0b 40%, transparent)' }
            : { background: 'var(--surface-2)', borderColor: 'transparent' }}
          title={`${a.label}: ${a.desc}${a.unlocked ? ' (Unlocked)' : a.max != null ? ` (${a.progress ?? 0}/${a.max})` : ''}`}
        >
          <span className="text-lg leading-none" style={{ filter: a.unlocked ? 'none' : 'grayscale(1)' }}>{a.icon}</span>
          <span className="font-medium hidden sm:inline text-[10px]">{a.label}</span>
          {a.max != null && a.max > 1 && !a.unlocked && (
            <span className="text-[9px] tabular-nums text-[var(--text-sec)] hidden sm:inline">{a.progress ?? 0}/{a.max}</span>
          )}
        </div>
      ))}
    </div>
  );
}
