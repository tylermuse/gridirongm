'use client';

import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { standingsSlice, teamCap, teamStatLine, fmtMoney } from '@/lib/dashboard/summary';
import { teamStatRanks, type RankedStat } from '@/lib/dashboard/leaders';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Dashboard 3-column row (P0.5): conference standings slice · cap & contracts ·
 * team stats. Mirrors football's home-page row, sport-corrected for basketball.
 */
export function DashboardRow({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  return (
    <div className="grid md:grid-cols-3 gap-4 mb-6">
      <MiniStandings league={league} team={team} />
      <CapCard league={league} team={team} />
      <TeamStatsCard league={league} team={team} />
    </div>
  );
}

function MiniStandings({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const slice = standingsSlice(league, team.id);
  return (
    <Card className="!p-0 overflow-hidden">
      <CardHeader className="px-4 pt-3">
        <CardTitle>{slice?.conference ?? ''} Standings</CardTitle>
        <Link href="/standings" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Full →</Link>
      </CardHeader>
      <div className="pb-2">
        {slice?.rows.map(r => (
          <Link
            key={r.team.id}
            href={`/team/${r.team.id}`}
            className="flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-[var(--surface-2)] transition-colors"
            style={r.isUser ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)' } : undefined}
          >
            <span className="w-5 text-xs tabular-nums text-[var(--text-sec)]">{r.seed}</span>
            <TeamLogo abbreviation={r.team.abbreviation} primaryColor={r.team.primaryColor} secondaryColor={r.team.secondaryColor} size="xs" />
            <span className={`flex-1 truncate ${r.isUser ? 'font-bold' : ''}`}>{r.team.city}</span>
            <span className="tabular-nums text-[var(--text-sec)]">{r.team.record.wins}–{r.team.record.losses}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function CapCard({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const cap = teamCap(league, team);
  const apron = cap.isOverSecondApron ? 'Over 2nd apron'
    : cap.isOverFirstApron ? 'Over 1st apron'
    : cap.isOverTax ? 'In luxury tax'
    : cap.isOverCap ? 'Over the cap'
    : 'Below the cap';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap &amp; Contracts</CardTitle>
      </CardHeader>
      <dl className="space-y-1.5 text-sm">
        <CapRow label="Salary cap" value={fmtMoney(cap.cap)} />
        <CapRow label="Payroll" value={fmtMoney(cap.payroll)} />
        <CapRow label="Cap room" value={(cap.capRoom >= 0 ? '+' : '') + fmtMoney(cap.capRoom)} color={cap.capRoom >= 0 ? '#10b981' : '#f97316'} />
        <CapRow label="Tax bill" value={fmtMoney(cap.taxBill)} color={cap.taxBill > 0 ? '#dc2626' : undefined} />
      </dl>
      <div className="mt-3 text-xs font-semibold inline-block rounded px-2 py-0.5" style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
        {apron}
      </div>
    </Card>
  );
}

function CapRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-sec)]">{label}</dt>
      <dd className="tabular-nums font-semibold" style={color ? { color } : undefined}>{value}</dd>
    </div>
  );
}

function TeamStatsCard({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const s = teamStatLine(league, team);
  const ranks = teamStatRanks(league, team);
  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Stats</CardTitle>
      </CardHeader>
      {s.gamesPlayed === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">No games played yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatTile label="PPG" value={s.ppg.toFixed(1)} rank={ranks.ppg} />
            <StatTile label="Opp PPG" value={s.oppPpg.toFixed(1)} rank={ranks.oppPpg} />
            <StatTile label="Diff" value={`${s.diff >= 0 ? '+' : ''}${s.diff.toFixed(1)}`} color={s.diff >= 0 ? '#10b981' : '#dc2626'} rank={ranks.diff} />
          </div>
          <div className="flex gap-3 text-xs text-[var(--text-sec)] mb-2">
            <span>FG {pct(s.fgPct)}</span>
            <span>3P {pct(s.tpPct)}</span>
            <span>FT {pct(s.ftPct)}</span>
          </div>
          {s.leader && (
            <div className="text-xs">
              <span className="text-[var(--text-sec)]">Leading scorer: </span>
              <span className="font-semibold">{s.leader.name}</span>
              <span className="tabular-nums"> · {s.leader.ppg.toFixed(1)} PPG</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function StatTile({ label, value, color, rank }: { label: string; value: string; color?: string; rank?: RankedStat }) {
  const rankColor = rank ? (rank.rank <= 5 ? '#10b981' : rank.rank >= rank.of - 4 ? '#ef4444' : 'var(--text-sec)') : undefined;
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="text-lg font-black tabular-nums" style={{ color: color ?? 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      {rank && <div className="text-[10px] font-bold tabular-nums" style={{ color: rankColor }}>{ordinal(rank.rank)}</div>}
    </div>
  );
}
