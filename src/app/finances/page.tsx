'use client';

import { useState } from 'react';
import { useGameStore, computeLuxuryTax, LUXURY_TAX_RATE } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import type { Position } from '@/types';
import { POSITIONS, getCapHit, getUnamortizedBonus } from '@/types';

function ratingColor(val: number) {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default function FinancesPage() {
  const { teams, players, userTeamId, releasePlayer } = useGameStore();
  const userTeam = teams.find(t => t.id === userTeamId);
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  if (!userTeam) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-[var(--text-sec)]">No team data available.</p>
        </div>
      </GameShell>
    );
  }

  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);
  const cap = userTeam.salaryCap;
  const used = userTeam.totalPayroll;
  const remaining = cap - used;
  const capPct = used / cap;

  // Salary by position
  const salaryByPosition = POSITIONS.reduce<Record<Position, number>>((acc, pos) => {
    acc[pos] = roster.filter(p => p.position === pos).reduce((s, p) => s + p.contract.salary, 0);
    return acc;
  }, {} as Record<Position, number>);

  const positionsWithSalary = POSITIONS.filter(pos => salaryByPosition[pos] > 0)
    .sort((a, b) => salaryByPosition[b] - salaryByPosition[a]);

  // Expiring contracts (yearsLeft <= 1)
  const expiring = roster
    .filter(p => p.contract.yearsLeft <= 1)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  // Top salaries
  const topSalaries = [...roster].sort((a, b) => b.contract.salary - a.contract.salary).slice(0, 10);

  function handleRelease(playerId: string) {
    if (confirmRelease === playerId) {
      releasePlayer(playerId);
      setConfirmRelease(null);
    } else {
      setConfirmRelease(playerId);
    }
  }

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-2xl font-black mb-6">Finances & Cap Management</h2>

        {/* Cap summary */}
        <Card>
          <CardHeader><CardTitle>Salary Cap</CardTitle></CardHeader>
          <div className="grid grid-cols-3 gap-6 mb-4">
            <div className="text-center">
              <div className="text-xs text-[var(--text-sec)] mb-1">Salary Cap</div>
              <div className="text-3xl font-black">${cap}M</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-[var(--text-sec)] mb-1">Committed</div>
              <div className={`text-3xl font-black ${capPct > 0.95 ? 'text-red-600' : capPct > 0.85 ? 'text-amber-600' : 'text-green-600'}`}>
                ${Math.round(used * 10) / 10}M
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-[var(--text-sec)] mb-1">Available</div>
              <div className={`text-3xl font-black ${remaining < 10 ? 'text-red-600' : remaining < 25 ? 'text-amber-600' : 'text-green-600'}`}>
                ${Math.round(remaining * 10) / 10}M
              </div>
            </div>
          </div>
          {/* Cap bar */}
          <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${capPct > 0.95 ? 'bg-red-500' : capPct > 0.85 ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, capPct * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="text-xs text-[var(--text-sec)] mt-1 text-right">{(capPct * 100).toFixed(1)}% of cap used</div>
          {remaining < 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-sm text-red-600 font-semibold">
                Over the salary cap by ${Math.abs(Math.round(remaining * 10) / 10)}M — release players to clear space.
              </div>
              <div className="text-sm text-red-600">
                Luxury Tax: ${computeLuxuryTax(used, cap)}M
                <span className="text-xs text-[var(--text-sec)] ml-2">
                  ({LUXURY_TAX_RATE}x penalty on every $1M over the cap)
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Dead Money */}
        {(() => {
          const deadCapEntries = userTeam.deadCap ?? [];
          const totalDeadCap = deadCapEntries.reduce((sum, dc) => sum + dc.amount, 0);

          // Calculate future dead money risk from restructured contracts
          const restructuredPlayers = roster.filter(p => p.contract.contractYears?.some(y => y.proratedBonus > 0));
          const futureRisk: { year: number; amount: number; count: number }[] = [];
          for (let yi = 1; yi <= 3; yi++) {
            let yearTotal = 0;
            let count = 0;
            for (const p of restructuredPlayers) {
              if (p.contract.contractYears && p.contract.contractYears.length > yi) {
                yearTotal += p.contract.contractYears[yi].proratedBonus;
                if (p.contract.contractYears[yi].proratedBonus > 0) count++;
              }
            }
            if (yearTotal > 0) {
              futureRisk.push({ year: yi, amount: Math.round(yearTotal * 10) / 10, count });
            }
          }

          if (totalDeadCap === 0 && restructuredPlayers.length === 0) return null;

          return (
            <Card>
              <CardHeader><CardTitle>Dead Money & Restructured Contracts</CardTitle></CardHeader>
              {totalDeadCap > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-red-600 mb-2">
                    Active Dead Cap: ${Math.round(totalDeadCap * 10) / 10}M
                  </div>
                  <div className="space-y-1">
                    {deadCapEntries.map((dc, i) => (
                      <div key={i} className="flex justify-between text-sm px-2 py-1 rounded bg-red-50">
                        <span>{dc.playerName} <span className="text-xs text-[var(--text-sec)]">({dc.source ?? 'release'})</span></span>
                        <span className="font-medium text-red-600">${dc.amount}M</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {restructuredPlayers.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">Restructured Contracts ({restructuredPlayers.length})</div>
                  <div className="space-y-1">
                    {restructuredPlayers.map(p => {
                      const unamortized = getUnamortizedBonus(p.contract);
                      return (
                        <div key={p.id} className="flex justify-between text-sm px-2 py-1 rounded bg-amber-50">
                          <span>
                            {p.firstName} {p.lastName}
                            <span className="text-xs text-[var(--text-sec)] ml-1">
                              ${getCapHit(p.contract).toFixed(1)}M cap hit
                            </span>
                          </span>
                          <span className="font-medium text-amber-700" title="Dead money if cut/traded">
                            ${unamortized.toFixed(1)}M risk
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {futureRisk.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Future Dead Money Risk</div>
                  <div className="grid grid-cols-3 gap-2">
                    {futureRisk.map(fr => (
                      <div key={fr.year} className="bg-[var(--surface-2)] rounded-lg p-2 text-center">
                        <div className="text-xs text-[var(--text-sec)]">Year +{fr.year}</div>
                        <div className="font-bold text-amber-600">${fr.amount}M</div>
                        <div className="text-[10px] text-[var(--text-sec)]">{fr.count} contract{fr.count !== 1 ? 's' : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

        {/* Revenue & Profit/Loss */}
        {userTeam.revenue && userTeam.revenue.total > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Revenue Breakdown</CardTitle></CardHeader>
              <div className="space-y-3">
                {[
                  { label: 'Ticket Sales', value: userTeam.revenue.tickets, icon: '🎟️', color: 'bg-blue-500' },
                  { label: 'Merchandise', value: userTeam.revenue.merchandise, icon: '👕', color: 'bg-purple-500' },
                  { label: 'TV Deal', value: userTeam.revenue.tvDeal, icon: '📺', color: 'bg-amber-500' },
                ].map(item => {
                  const pct = item.value / userTeam.revenue.total;
                  return (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-lg w-7">{item.icon}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{item.label}</span>
                          <span className="font-mono">${item.value}M</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${(pct * 100).toFixed(1)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-[var(--border)] pt-2 flex justify-between font-bold">
                  <span>Total Revenue</span>
                  <span className="font-mono">${userTeam.revenue.total}M</span>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader><CardTitle>Profit / Loss</CardTitle></CardHeader>
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-sec)]">Total Revenue</span>
                  <span className="font-mono text-green-600">+${userTeam.revenue.total}M</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-sec)]">Player Payroll</span>
                  <span className="font-mono text-red-600">-${Math.round(used * 10) / 10}M</span>
                </div>
                {remaining < 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-sec)]">Luxury Tax</span>
                    <span className="font-mono text-red-600">-${computeLuxuryTax(used, cap)}M</span>
                  </div>
                )}
                <div className="border-t border-[var(--border)] pt-2">
                  {(() => {
                    const luxTax = remaining < 0 ? computeLuxuryTax(used, cap) : 0;
                    const profit = Math.round((userTeam.revenue.total - used - luxTax) * 10) / 10;
                    return (
                      <div className="flex justify-between font-bold text-lg">
                        <span>{profit >= 0 ? 'Profit' : 'Loss'}</span>
                        <span className={`font-mono ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {profit >= 0 ? '+' : ''}{profit}M
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Salary by position */}
        <Card>
          <CardHeader><CardTitle>Salary by Position</CardTitle></CardHeader>
          <div className="space-y-2">
            {positionsWithSalary.map(pos => {
              const pct = salaryByPosition[pos] / cap;
              return (
                <div key={pos} className="flex items-center gap-3">
                  <div className="w-8 text-xs font-semibold text-[var(--text-sec)]">{pos}</div>
                  <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500/60"
                      style={{ width: `${(pct * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="text-xs font-mono w-16 text-right">${Math.round(salaryByPosition[pos] * 10) / 10}M</div>
                  <div className="text-xs text-[var(--text-sec)] w-10 text-right">{(pct * 100).toFixed(0)}%</div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Expiring contracts */}
          <Card>
            <CardHeader><CardTitle>Expiring Contracts ({expiring.length})</CardTitle></CardHeader>
            {expiring.length === 0 ? (
              <p className="text-sm text-[var(--text-sec)]">No expiring contracts.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase">
                    <th className="text-left pb-2">Player</th>
                    <th className="text-center pb-2">OVR</th>
                    <th className="text-right pb-2">Salary</th>
                    <th className="text-right pb-2">Yrs</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map(p => (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="py-2">
                        <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600 transition-colors">
                          {p.firstName} {p.lastName}
                        </button>
                        <div className="text-xs text-[var(--text-sec)]">{p.position} · Age {p.age}</div>
                      </td>
                      <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                      <td className="py-2 text-right font-mono">${p.contract.salary}M</td>
                      <td className="py-2 text-right text-[var(--text-sec)]">{p.contract.yearsLeft}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Top salaries with release */}
          <Card>
            <CardHeader><CardTitle>Top Salaries</CardTitle></CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase">
                  <th className="text-left pb-2">Player</th>
                  <th className="text-center pb-2">OVR</th>
                  <th className="text-center pb-2">POT</th>
                  <th className="text-right pb-2">Salary</th>
                  <th className="text-right pb-2 pr-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {topSalaries.map(p => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="py-2">
                      <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600 transition-colors">
                        {p.firstName} {p.lastName}
                      </button>
                      <div className="text-xs text-[var(--text-sec)]">{p.position} · {p.contract.yearsLeft}yr</div>
                    </td>
                    <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                    <td className={`py-2 text-center text-xs ${potentialColor(p.potential, p.experience)}`}>
                      {potentialLabel(p.potential, p.experience)}
                    </td>
                    <td className="py-2 text-right font-mono">${p.contract.salary}M</td>
                    <td className="py-2 text-right pr-1">
                      <Button
                        size="sm"
                        variant={confirmRelease === p.id ? 'danger' : 'secondary'}
                        onClick={() => handleRelease(p.id)}
                      >
                        {confirmRelease === p.id ? 'Confirm?' : 'Release'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
