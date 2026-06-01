'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtMoney } from '@/lib/dashboard/summary';
import {
  getHeadCoach, coachOverall, coachSalary, coachScheme, candidateCoaches,
  schemeFit, SCHEME_LABELS, schemeDescription,
} from '@/lib/coaching/coaches';
import type { BaseCoach } from '@bs/core/adapter';
import { resolveBasketballPDCEffect, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';

/**
 * /staff — the team's head coach (scheme, ratings, salary) + a hiring market,
 * plus how the current roster fits the coach's system.
 */
export default function StaffPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { hireCoach, loading: busy } = useLeagueStore();
  const [pool, setPool] = useState<BaseCoach[]>(() => candidateCoaches(6));
  const [hiringId, setHiringId] = useState<string | null>(null);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const hc = league && team ? getHeadCoach(league, team.id) : null;

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!team) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🧑‍🏫" title="No team yet" message="Pick a team from the League page to manage its staff." />
        </div>
      </Shell>
    );
  }

  const roster = team.playerIds
    .map(id => (league.players as Record<string, BasketballPlayer>)[id])
    .filter((p): p is BasketballPlayer => !!p);
  const scheme = hc ? coachScheme(hc) : null;
  const fitCounts = scheme
    ? roster.reduce((acc, p) => { const t = schemeFit(p, scheme).tier; acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>)
    : null;

  async function onHire(coach: BaseCoach) {
    setHiringId(coach.id);
    const ok = await hireCoach(team!.id, coach);
    if (ok) setPool(p => p.filter(c => c.id !== coach.id).concat(candidateCoaches(1)));
    setHiringId(null);
  }

  return (
    <Shell>
      <h1 className="text-2xl sm:text-3xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
        {team.city} {team.name} — Staff
      </h1>

      {/* Current head coach */}
      <Card className="mb-4">
        <CardHeader><CardTitle>Head Coach</CardTitle></CardHeader>
        {hc && scheme ? (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white shrink-0" style={{ background: 'var(--accent)' }}>
                {hc.firstName[0]}{hc.lastName[0]}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold">{hc.firstName} {hc.lastName}</div>
                <div className="text-sm text-[var(--text-sec)]">Age {hc.age} · {coachOverall(hc)} OVR · {fmtMoney(coachSalary(hc))}/yr</div>
              </div>
              <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
                {SCHEME_LABELS[scheme]} system
              </span>
            </div>
            <p className="text-sm text-[var(--text-sec)] mt-2">{schemeDescription(scheme)}</p>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <RatingTile label="Offense" value={hc.ratings.offense} />
              <RatingTile label="Defense" value={hc.ratings.defense} />
              <RatingTile label="Development" value={hc.ratings.development} />
              <RatingTile label="Morale" value={hc.ratings.morale} />
            </div>
            {(() => {
              const boost = Math.round((resolveBasketballPDCEffect(hc.ratings.development, 21) - 1) * 100);
              return (
                <p className="mt-2 text-xs text-[var(--text-sec)]">
                  {boost > 0
                    ? `Develops under-25 players ${boost}% faster each offseason.`
                    : 'Average development staff — no growth boost for young players.'}
                </p>
              );
            })()}
            {fitCounts && (
              <div className="mt-3 text-sm flex flex-wrap gap-3">
                <span className="text-[var(--text-sec)]">Roster fit:</span>
                <span style={{ color: '#10b981' }}>● {fitCounts.great ?? 0} great</span>
                <span style={{ color: '#84cc16' }}>● {fitCounts.good ?? 0} good</span>
                <span style={{ color: '#dc2626' }}>● {fitCounts.poor ?? 0} poor</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-sec)]">No head coach. Hire one from the market below.</p>
        )}
      </Card>

      {/* Hiring market */}
      <Card className="!p-0 overflow-hidden">
        <CardHeader className="px-4 pt-3"><CardTitle>Coaching market</CardTitle><span className="text-xs text-[var(--text-sec)]">Hire to replace your head coach</span></CardHeader>
        <div className="pb-2">
          {pool.map(c => {
            const sc = coachScheme(c);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.firstName} {c.lastName}</div>
                  <div className="text-xs text-[var(--text-sec)]">Age {c.age} · {coachOverall(c)} OVR · {SCHEME_LABELS[sc]}</div>
                </div>
                <div className="hidden sm:flex gap-2 text-[10px] text-[var(--text-sec)]">
                  <span>OFF {c.ratings.offense}</span>
                  <span>DEF {c.ratings.defense}</span>
                  <span>DEV {c.ratings.development}</span>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm tabular-nums font-semibold">{fmtMoney(coachSalary(c))}/yr</span>
                  <Button variant="secondary" disabled={busy} onClick={() => void onHire(c)}>
                    {hiringId === c.id ? 'Hiring…' : 'Hire'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="mt-3 text-xs text-[var(--text-sec)]">Per-player scheme fit shows on the <Link href="/roster" className="font-semibold" style={{ color: 'var(--accent)' }}>Roster</Link>. The coaching salary appears in <Link href="/finances" className="font-semibold" style={{ color: 'var(--accent)' }}>Finances</Link>.</p>
    </Shell>
  );
}

function RatingTile({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? '#10b981' : value >= 72 ? '#84cc16' : value >= 60 ? '#eab308' : '#f97316';
  return (
    <div className="p-2 rounded-lg text-center" style={{ background: 'var(--surface-2)' }}>
      <div className="text-lg font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
