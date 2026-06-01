'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { teamFinances, apronLabel } from '@/lib/finances/finances';
import { fmtMoney } from '@/lib/dashboard/summary';
import type { BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * /finances — revenue, expenses, profit, cap & apron status, salary by position,
 * expiring contracts, and top salaries for the user's team.
 */

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_COLORS: Record<BasketballPosition, string> = {
  PG: '#06b6d4', SG: '#10b981', SF: '#f59e0b', PF: '#f97316', C: '#8b5cf6',
};

export default function FinancesPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const fin = useMemo(() => (league && team ? teamFinances(league, team) : null), [league, team]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!team || !fin) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="💰" title="No team yet" message="Pick a team from the League page to see its books." />
        </div>
      </Shell>
    );
  }

  const apron = apronLabel(fin.cap);
  const maxPos = Math.max(1, ...POSITIONS.map(p => fin.byPosition[p]));

  return (
    <Shell>
      <div className="flex items-center gap-3 mb-5">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>{team.city} {team.name} Finances</h1>
          <p className="text-sm text-[var(--text-sec)]">Season {league.currentSeason}</p>
        </div>
        <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: `color-mix(in srgb, ${apron.color} 16%, transparent)`, color: apron.color }}>{apron.text}</span>
      </div>

      {/* P&L */}
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle>Revenue</CardTitle><span className="text-sm font-black tabular-nums" style={{ color: '#10b981' }}>{fmtMoney(fin.revenue.total)}</span></CardHeader>
          <dl className="space-y-1.5 text-sm">
            <Row label="National TV" value={fmtMoney(fin.revenue.nationalTv)} />
            <Row label="Local TV" value={fmtMoney(fin.revenue.localTv)} />
            <Row label="Gate / tickets" value={fmtMoney(fin.revenue.gate)} />
            <Row label="Merch & sponsorship" value={fmtMoney(fin.revenue.merch)} />
          </dl>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenses</CardTitle><span className="text-sm font-black tabular-nums" style={{ color: '#dc2626' }}>{fmtMoney(fin.expenses.total)}</span></CardHeader>
          <dl className="space-y-1.5 text-sm">
            <Row label="Player payroll" value={fmtMoney(fin.expenses.payroll)} />
            <Row label="Coaching payroll" value={fmtMoney(fin.expenses.coaching)} muted />
            <Row label="Luxury tax" value={fmtMoney(fin.expenses.luxuryTax)} color={fin.expenses.luxuryTax > 0 ? '#dc2626' : undefined} />
            {fin.expenses.deadCap > 0 && <Row label="Dead cap" value={fmtMoney(fin.expenses.deadCap)} color="#f59e0b" />}
          </dl>
        </Card>
        <Card>
          <CardHeader><CardTitle>Profit</CardTitle></CardHeader>
          <div className="text-3xl font-black tabular-nums" style={{ color: fin.profit >= 0 ? '#10b981' : '#dc2626' }}>
            {fin.profit >= 0 ? '+' : ''}{fmtMoney(fin.profit)}
          </div>
          <p className="text-xs text-[var(--text-sec)] mt-1">Revenue minus payroll and luxury tax.</p>
        </Card>
      </div>

      {/* Cap + salary by position */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle>Cap &amp; Apron</CardTitle></CardHeader>
          <ApronMeter cap={fin.cap} />
          <dl className="space-y-1.5 text-sm mt-4">
            <Row label="Salary cap" value={fmtMoney(fin.cap.cap)} />
            <Row label="Payroll" value={fmtMoney(fin.cap.payroll)} />
            <Row label="Cap room" value={`${fin.cap.capRoom >= 0 ? '+' : ''}${fmtMoney(fin.cap.capRoom)}`} color={fin.cap.capRoom >= 0 ? '#10b981' : '#f97316'} />
            <Row label="Luxury tax line" value={fmtMoney(fin.cap.taxThreshold)} muted />
            <Row label="1st apron" value={fmtMoney(fin.cap.firstApron)} muted />
            <Row label="2nd apron" value={fmtMoney(fin.cap.secondApron)} muted />
            <Row label="Tax bill" value={fmtMoney(fin.cap.taxBill)} color={fin.cap.taxBill > 0 ? '#dc2626' : undefined} />
          </dl>
        </Card>
        <Card>
          <CardHeader><CardTitle>Salary by position</CardTitle></CardHeader>
          <div className="space-y-2">
            {POSITIONS.map(pos => {
              const totalPos = POSITIONS.reduce((s, p) => s + fin.byPosition[p], 0) || 1;
              const sharePct = Math.round((fin.byPosition[pos] / totalPos) * 100);
              return (
                <div key={pos} className="flex items-center gap-2 text-sm">
                  <span className="w-7 font-mono text-xs" style={{ color: POS_COLORS[pos] }}>{pos}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(fin.byPosition[pos] / maxPos) * 100}%`, background: POS_COLORS[pos] }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-[11px] text-[var(--text-sec)]">{sharePct}%</span>
                  <span className="w-14 text-right tabular-nums text-xs">{fmtMoney(fin.byPosition[pos])}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="!p-0 overflow-hidden">
          <CardHeader className="px-4 pt-3"><CardTitle>Top salaries</CardTitle></CardHeader>
          <SalaryList rows={fin.topSalaries} onName={setModalPlayerId} />
        </Card>
        <Card className="!p-0 overflow-hidden">
          <CardHeader className="px-4 pt-3"><CardTitle>Expiring contracts</CardTitle><span className="text-xs text-[var(--text-sec)]">{fin.expiring.length}</span></CardHeader>
          {fin.expiring.length === 0
            ? <p className="px-4 pb-4 text-sm text-[var(--text-sec)]">No deals expiring this season.</p>
            : <SalaryList rows={fin.expiring} onName={setModalPlayerId} />}
        </Card>
      </div>

      <p className="mt-3 text-xs text-[var(--text-sec)]">Manage contracts — extend or release — from the <Link href="/roster" className="font-semibold" style={{ color: 'var(--accent)' }}>Roster</Link>.</p>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </Shell>
  );
}

function SalaryList({ rows, onName }: { rows: { player: { id: string; firstName: string; lastName: string; sportData: { position: string } }; salary: number }[]; onName: (id: string) => void }) {
  return (
    <div className="pb-2">
      {rows.map(({ player, salary }) => (
        <button
          key={player.id}
          onClick={() => onName(player.id)}
          className="w-full flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-[var(--surface-2)] transition-colors text-left"
        >
          <span className="font-semibold truncate flex-1" style={{ color: 'var(--accent)' }}>{player.firstName} {player.lastName}</span>
          <span className="text-xs opacity-60 w-7">{player.sportData.position}</span>
          <span className="tabular-nums font-semibold w-14 text-right">{fmtMoney(salary)}</span>
        </button>
      ))}
    </div>
  );
}

/** Visual cap → tax → 1st apron → 2nd apron meter with a payroll marker. */
function ApronMeter({ cap }: { cap: { payroll: number; cap: number; taxThreshold: number; firstApron: number; secondApron: number } }) {
  // Scale runs from the salary cap to a touch past the 2nd apron.
  const lo = cap.cap;
  const hi = cap.secondApron + (cap.secondApron - cap.firstApron);
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const payrollPos = pos(cap.payroll);
  const tiers: { at: number; label: string; color: string }[] = [
    { at: cap.taxThreshold, label: 'Tax', color: '#f59e0b' },
    { at: cap.firstApron, label: '1st', color: '#f97316' },
    { at: cap.secondApron, label: '2nd', color: '#dc2626' },
  ];
  const overColor = cap.payroll >= cap.secondApron ? '#dc2626' : cap.payroll >= cap.firstApron ? '#f97316' : cap.payroll >= cap.taxThreshold ? '#f59e0b' : '#10b981';
  return (
    <div className="pt-1">
      <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#10b981, #eab308 45%, #f97316 72%, #dc2626)' , opacity: 0.35 }} />
      <div className="relative h-0">
        {/* threshold ticks */}
        {tiers.map(t => (
          <div key={t.label} className="absolute -top-3 flex flex-col items-center" style={{ left: pos(t.at), transform: 'translateX(-50%)' }}>
            <div className="w-px h-3" style={{ background: t.color }} />
            <span className="text-[9px] font-bold mt-0.5" style={{ color: t.color }}>{t.label}</span>
          </div>
        ))}
        {/* payroll marker */}
        <div className="absolute -top-[18px]" style={{ left: payrollPos, transform: 'translateX(-50%)' }}>
          <div className="w-2.5 h-2.5 rotate-45 rounded-[2px]" style={{ background: overColor, boxShadow: `0 0 6px ${overColor}` }} />
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-sec)] mt-5">Payroll marker (◆) vs cap thresholds</div>
    </div>
  );
}

function Row({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-sec)]">{label}</dt>
      <dd className={`tabular-nums font-semibold ${muted ? 'opacity-60' : ''}`} style={color ? { color } : undefined}>{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
