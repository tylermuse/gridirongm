'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { powerScore } from '@/lib/stats/powerScore';
import { powerBreakdown, rankByGroup, GROUP_LABEL, type GroupKey, type TeamBreakdown } from '@/lib/rankings/powerBreakdown';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /power-rankings — every team (30-32) ranked by a derived power score.
 *
 * Score formula lives in `@/lib/stats/powerScore` so the /stats Power tab and
 * this rich-card view always show the same numbers. Each card carries
 * auto-generated commentary tailored to the team's stat signature. The user's
 * team is highlighted with an accent border.
 */

interface TeamSportData { conference: string; division: string }

function commentary(team: BasketballTeam): string {
  const games = team.record.wins + team.record.losses;
  if (games === 0) return 'Yet to tip off the season.';
  const pdPerGame = (team.record.pointsFor - team.record.pointsAgainst) / games;
  const winPct = team.record.wins / games;
  const last6 = team.record.streak.slice(-6);
  const wins6 = last6.filter(c => c === 'W').length;
  const losses6 = last6.length - wins6;

  if (wins6 >= 5) return `Hot streak — ${wins6}-${losses6} over the last ${last6.length}.`;
  if (last6.length >= 5 && wins6 <= 1) return `Ice cold — ${wins6}-${losses6} over the last ${last6.length}.`;
  if (pdPerGame >= 6) return `Outscoring opponents by ${pdPerGame.toFixed(1)}/game.`;
  if (pdPerGame <= -6) return `Outscored by ${(-pdPerGame).toFixed(1)}/game.`;
  if (winPct >= 0.65) return 'Among the league’s elite.';
  if (winPct <= 0.35) return 'Lottery-bound trajectory.';
  return 'Holding steady in the pack.';
}

export default function PowerRankingsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [view, setView] = useState<'overall' | 'groups'>('overall');
  const [group, setGroup] = useState<GroupKey>('backcourt');
  const [expanded, setExpanded] = useState<string | null>(null);
  const breakdown = useMemo(() => (league ? powerBreakdown(league) : new Map<string, TeamBreakdown>()), [league]);

  const ranked = useMemo(() => {
    if (!league) return [] as { team: BasketballTeam; score: number }[];
    return (league.teams as BasketballTeam[])
      .map(team => ({ team, score: powerScore(team) }))
      .sort((a, b) => b.score - a.score);
  }, [league]);

  if (loading) return <main className="max-w-3xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  const gamesPlayed = league.games.filter(g => g.status === 'played').length;

  return (
    <main className="max-w-3xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          Power Rankings
        </h1>
        <span className="text-sm text-[var(--text-sec)]">
          Season {league.currentSeason} · Day {league.currentTick}
        </span>
        <div className="ml-auto inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
          {(['overall', 'groups'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className="px-3 py-1.5" style={view === v ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>
              {v === 'overall' ? 'Overall' : 'By group'}
            </button>
          ))}
        </div>
      </header>

      {view === 'groups' && (
        <GroupView league={league} breakdown={breakdown} group={group} setGroup={setGroup} />
      )}

      {gamesPlayed === 0 && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="📊"
            title="Rankings update once games are played"
            message="It’s preseason — every team starts level. Sim some games to see the board move."
          />
        </div>
      )}

      {view === 'overall' && <ol className="space-y-2">
        {ranked.map(({ team, score }, i) => {
          const sd = team.sportData as TeamSportData;
          const isUser = league.userTeamId === team.id;
          const bd = breakdown.get(team.id);
          const open = expanded === team.id;
          return (
            <li key={team.id}>
              <Link
                href={`/team/${team.id}`}
                className={`flex items-center gap-4 p-3 rounded-xl border bg-[var(--surface)] transition-all hover:shadow-lg hover:shadow-[var(--accent-glow)] ${
                  isUser ? 'border-[var(--accent)] border-2' : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div
                  className="w-9 text-center text-3xl font-black shrink-0"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
                >
                  {i + 1}
                </div>
                <TeamLogo
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate flex items-center gap-2">
                    {team.city} {team.name}
                    {isUser && <Badge variant="orange" size="sm">You</Badge>}
                  </div>
                  <div className="text-xs text-[var(--text-sec)] truncate">
                    {sd.conference} · {commentary(team)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-semibold tabular-nums">{score.toFixed(1)}</div>
                  <div className="text-xs text-[var(--text-sec)]">{team.record.wins}–{team.record.losses}</div>
                </div>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={open ? 'Hide breakdown' : 'Show breakdown'}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(open ? null : team.id); }}
                  className="shrink-0 h-7 w-7 rounded-md border text-xs font-bold text-[var(--text-sec)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {open ? '−' : '+'}
                </button>
              </Link>
              {open && bd && <BreakdownPanel bd={bd} total={league.teams.length} />}
            </li>
          );
        })}
      </ol>}
    </main>
  );
}

const CARD_GROUPS: GroupKey[] = ['backcourt', 'wings', 'frontcourt', 'bench', 'offense', 'defense', 'ortg', 'drtg', 'net'];

function rankColor(rank: number, total: number): string {
  if (rank <= Math.ceil(total * 0.2)) return '#10b981';
  if (rank > Math.floor(total * 0.8)) return '#dc2626';
  return 'var(--text-sec)';
}

function fmtValue(key: GroupKey, v: number, gp: number): string {
  if ((key === 'ortg' || key === 'drtg' || key === 'net') && gp === 0) return '—';
  if (key === 'net') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  return v.toFixed(1);
}

function BreakdownPanel({ bd, total }: { bd: TeamBreakdown; total: number }) {
  return (
    <div className="mt-1 mx-2 rounded-lg border bg-[var(--surface-2)] p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {CARD_GROUPS.map(k => (
          <div key={k} className="rounded-md bg-[var(--surface)] border px-2 py-1.5" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">{GROUP_LABEL[k]}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums">{fmtValue(k, bd.values[k], bd.gamesPlayed)}</span>
              <span className="text-[10px] font-bold tabular-nums" style={{ color: rankColor(bd.ranks[k], total) }}>#{bd.ranks[k]}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 text-[11px] text-[var(--text-sec)]">
        {(['backcourt', 'wings', 'frontcourt', 'bench'] as const).map(k => (
          <div key={k} className="truncate"><span className="font-semibold text-[var(--foreground)]">{GROUP_LABEL[k]}:</span> {bd.leaders[k].join(', ') || '—'}</div>
        ))}
      </div>
    </div>
  );
}

function GroupView({ league, breakdown, group, setGroup }: {
  league: { teams: unknown[]; userTeamId?: string | null };
  breakdown: Map<string, TeamBreakdown>;
  group: GroupKey;
  setGroup: (g: GroupKey) => void;
}) {
  const teams = new Map<string, BasketballTeam>((league.teams as BasketballTeam[]).map(t => [t.id, t]));
  const rows = rankByGroup(breakdown, group);
  const total = rows.length;
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CARD_GROUPS.map(k => (
          <button key={k} onClick={() => setGroup(k)} className="text-xs font-bold rounded-full px-3 py-1 border transition active:scale-95"
            style={group === k ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-sec)' }}>
            {GROUP_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {rows.map(r => {
          const t = teams.get(r.teamId);
          if (!t) return null;
          const isUser = league.userTeamId === t.id;
          const lead = group in r.leaders ? r.leaders[group as keyof TeamBreakdown['leaders']] : [];
          return (
            <Link key={r.teamId} href={`/team/${t.id}`}
              className="flex items-center gap-3 px-4 py-2 border-t first:border-t-0 text-sm hover:bg-[var(--surface-2)] transition-colors"
              style={{ borderColor: 'var(--border)', background: isUser ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
              <span className="w-6 text-xs font-bold tabular-nums" style={{ color: rankColor(r.ranks[group], total) }}>{r.ranks[group]}</span>
              <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{t.city} {t.name}</div>
                {lead.length > 0 && <div className="text-[10px] text-[var(--text-sec)] truncate">{lead.join(', ')}</div>}
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{fmtValue(group, r.values[group], r.gamesPlayed)}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-sec)]">
        Groups use healthy-roster ratings (weighted top players; thin groups are padded with replacement level). ORtg/DRtg are points per 100 possessions from played games.
      </p>
    </>
  );
}
