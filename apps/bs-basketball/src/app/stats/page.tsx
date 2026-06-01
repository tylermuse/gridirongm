'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { regularSeasonStatsByPlayer } from '@/lib/stats/seasonStats';
import { SkeletonList } from '@/components/ui/Skeleton';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

/**
 * /stats — league leaderboards (per-game + shooting %) and a team-stats table.
 * Aggregated from box scores (player.seasonStats isn't maintained), qualified by
 * games / attempts so small samples don't top the boards.
 */

interface Cat {
  key: string;
  label: string;
  unit?: string;
  value: (s: BasketballStats) => number;
  /** Minimum attempts to qualify (per game, scaled by the leader's games). */
  qualify?: (s: BasketballStats, gpMin: number) => boolean;
  fmt: (v: number) => string;
}

const ONE = (v: number) => v.toFixed(1);
const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;

const CATEGORIES: Cat[] = [
  { key: 'pts', label: 'Points', unit: 'PPG', value: s => s.points / s.gamesPlayed, fmt: ONE },
  { key: 'reb', label: 'Rebounds', unit: 'RPG', value: s => s.totalRebounds / s.gamesPlayed, fmt: ONE },
  { key: 'ast', label: 'Assists', unit: 'APG', value: s => s.assists / s.gamesPlayed, fmt: ONE },
  { key: 'stl', label: 'Steals', unit: 'SPG', value: s => s.steals / s.gamesPlayed, fmt: ONE },
  { key: 'blk', label: 'Blocks', unit: 'BPG', value: s => s.blocks / s.gamesPlayed, fmt: ONE },
  { key: '3pm', label: '3-Pointers', unit: '3PM', value: s => s.threePointsMade / s.gamesPlayed, fmt: ONE },
  { key: 'fg', label: 'FG%', value: s => (s.fieldGoalsAttempted ? s.fieldGoalsMade / s.fieldGoalsAttempted : 0), qualify: (s, gp) => s.fieldGoalsAttempted >= gp * 5, fmt: PCT },
  { key: '3p', label: '3P%', value: s => (s.threePointsAttempted ? s.threePointsMade / s.threePointsAttempted : 0), qualify: (s, gp) => s.threePointsAttempted >= gp * 1.5, fmt: PCT },
  { key: 'ft', label: 'FT%', value: s => (s.freeThrowsAttempted ? s.freeThrowsMade / s.freeThrowsAttempted : 0), qualify: (s, gp) => s.freeThrowsAttempted >= gp * 1.5, fmt: PCT },
];

export default function StatsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [tab, setTab] = useState<'leaders' | 'teams'>('leaders');
  const [catKey, setCatKey] = useState('pts');
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const statsMap = useMemo(() => (league ? regularSeasonStatsByPlayer(league) : new Map()), [league]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const leaders = useMemo(() => {
    if (!league) return [];
    const cat = CATEGORIES.find(c => c.key === catKey)!;
    const players = league.players as Record<string, BasketballPlayer>;
    const maxGp = Math.max(1, ...[...statsMap.values()].map(s => (s as BasketballStats).gamesPlayed));
    const gpMin = Math.max(1, Math.floor(maxGp * 0.4));
    const rows: { player: BasketballPlayer; value: number; gp: number }[] = [];
    for (const [pid, s] of statsMap as Map<string, BasketballStats>) {
      const p = players[pid];
      if (!p || s.gamesPlayed < gpMin) continue;
      if (cat.qualify && !cat.qualify(s, gpMin)) continue;
      rows.push({ player: p, value: cat.value(s), gp: s.gamesPlayed });
    }
    return rows.sort((a, b) => b.value - a.value).slice(0, 20);
  }, [league, statsMap, catKey]);

  if (loading) return <Shell><SkeletonList rows={8} /></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  const anyGames = league.games.some(g => g.status === 'played');
  const cat = CATEGORIES.find(c => c.key === catKey)!;
  const userTeamId = league.userTeamId;

  const teamRows = (league.teams as BasketballTeam[]).map(t => {
    const gp = t.record.wins + t.record.losses + (t.record.otherResults ?? 0);
    return {
      team: t,
      ppg: gp ? t.record.pointsFor / gp : 0,
      oppPpg: gp ? t.record.pointsAgainst / gp : 0,
      diff: gp ? (t.record.pointsFor - t.record.pointsAgainst) / gp : 0,
    };
  }).sort((a, b) => b.diff - a.diff);

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline gap-3 mb-5">
        <h1 className="text-3xl sm:text-4xl font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>Stats</h1>
        <div className="ml-auto inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
          {(['leaders', 'teams'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 capitalize" style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{t}</button>
          ))}
        </div>
      </div>

      {!anyGames ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
          Stats populate once games are played. Sim some games to see who&apos;s balling out.
        </div>
      ) : tab === 'leaders' ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCatKey(c.key)} className="text-xs font-bold rounded-full px-3 py-1 border transition active:scale-95"
                style={catKey === c.key ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-sec)' }}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {leaders.map((r, i) => (
              <button key={r.player.id} onClick={() => setModalPlayerId(r.player.id)}
                className="w-full flex items-center gap-3 px-4 py-2 border-t first:border-t-0 text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
                style={{ borderColor: 'var(--border)', background: r.player.rosterSlot?.teamId === userTeamId ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
                <span className="w-6 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                <TeamCrest teamId={r.player.rosterSlot?.teamId} teamById={teamById} />
                <span className="font-semibold truncate flex-1">{r.player.firstName} {r.player.lastName}</span>
                <span className="text-xs text-[var(--text-sec)] w-7">{r.player.sportData.position}</span>
                <span className="text-base font-black tabular-nums w-16 text-right" style={{ color: 'var(--accent)' }}>{cat.fmt(r.value)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead><tr className="text-[var(--text-sec)] text-xs border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="px-3 py-2 text-left">Team</th><th className="px-3 py-2 text-right">PPG</th><th className="px-3 py-2 text-right">Opp PPG</th><th className="px-3 py-2 text-right">Diff</th>
            </tr></thead>
            <tbody>
              {teamRows.map((r, i) => (
                <tr key={r.team.id} className="border-t" style={{ borderColor: 'var(--border)', background: r.team.id === userTeamId ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
                  <td className="px-3 py-2">
                    <Link href={`/team/${r.team.id}`} className="flex items-center gap-2 hover:underline">
                      <span className="text-xs tabular-nums text-[var(--text-sec)] w-4">{i + 1}</span>
                      <TeamLogo abbreviation={r.team.abbreviation} primaryColor={r.team.primaryColor} secondaryColor={r.team.secondaryColor} size="xs" />
                      {r.team.city}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.ppg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.oppPpg.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: r.diff >= 0 ? '#10b981' : '#dc2626' }}>{r.diff >= 0 ? '+' : ''}{r.diff.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </Shell>
  );
}

function TeamCrest({ teamId, teamById }: { teamId?: string; teamById: Map<string, BasketballTeam> }) {
  const t = teamId ? teamById.get(teamId) : null;
  if (!t) return <span className="w-5" />;
  return <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
