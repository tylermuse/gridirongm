'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { computeAchievements } from '@/lib/dashboard/achievements';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Two ring gauges — Fan Pulse + Owner approval (parity audit #18). */
export function ApprovalRings({ team }: { team: BasketballTeam }) {
  const { fanApproval, ownerApproval } = team.approval;
  return (
    <Card className="!p-4">
      <div className="text-xs uppercase tracking-widest opacity-60 mb-3">Pulse</div>
      <div className="flex justify-around">
        <Ring value={fanApproval} label="Fan Pulse" />
        <Ring value={ownerApproval} label="Owner" />
      </div>
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

/** Trophy case — derived achievement badges (parity audit #17). */
export function TrophyCase({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const achievements = computeAchievements(league, team);
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Trophy Case</CardTitle><span className="text-xs text-[var(--text-sec)]">{achievements.filter(a => a.unlocked).length}/{achievements.length}</span></CardHeader>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {achievements.map(a => (
          <div
            key={a.label}
            className="rounded-lg p-2.5 text-center transition"
            style={{
              background: a.unlocked ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface-2)',
              opacity: a.unlocked ? 1 : 0.55,
            }}
            title={a.desc}
          >
            <div className="text-2xl leading-none" style={{ filter: a.unlocked ? 'none' : 'grayscale(1)' }}>{a.icon}</div>
            <div className="text-[11px] font-bold mt-1 leading-tight">{a.label}</div>
            {a.max != null && !a.unlocked && (
              <div className="text-[10px] tabular-nums text-[var(--text-sec)]">{a.progress ?? 0}/{a.max}</div>
            )}
            {a.unlocked && <div className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>Unlocked</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}
