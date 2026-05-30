'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { TeamRosterModal } from '@/components/modals/TeamRosterModal';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { TRADE_DEADLINE_DAY } from '@/lib/sim/simRange';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /standings — standings by conference.
 *
 * Computes from team.record. Default sort: wins desc, then losses asc, then
 * points-diff desc. GB is computed against the conference leader.
 *
 * User's team row is highlighted with the accent color.
 *
 * Quick-action: 'Sim Day' button up top advances the season by one day.
 */

interface TeamSportData { conference: 'Eastern' | 'Western'; division: string }

function sd(t: BasketballTeam): TeamSportData {
  return t.sportData as TeamSportData;
}

export default function StandingsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { simDay, simRange, loading: storeLoading } = useLeagueStore();
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!league) return { Eastern: [], Western: [] } as Record<'Eastern' | 'Western', BasketballTeam[]>;
    const byConf: Record<'Eastern' | 'Western', BasketballTeam[]> = { Eastern: [], Western: [] };
    for (const t of league.teams) {
      byConf[sd(t as BasketballTeam).conference].push(t as BasketballTeam);
    }
    for (const conf of ['Eastern', 'Western'] as const) {
      byConf[conf].sort((a, b) => {
        if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
        if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
        return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
      });
    }
    return byConf;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const gamesPlayed = league.games.filter(g => g.status === 'played').length;
  const totalGames = league.games.length;
  const regularSeasonDone = !league.games.some(g => g.status === 'scheduled');

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Home
      </Link>

      <header className="flex flex-wrap items-baseline gap-4 mt-2 mb-6">
        <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          Standings
        </h1>
        <p className="text-sm opacity-70">
          Season {league.currentSeason} · Day {league.currentTick} · {gamesPlayed} / {totalGames} games played
        </p>
        {regularSeasonDone ? (
          <Link
            href="/playoffs"
            className="ml-auto px-4 py-2 rounded-lg font-bold transition"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            🏆 Playoffs →
          </Link>
        ) : (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => void simDay()}
              disabled={storeLoading}
              className="px-4 py-2 rounded-lg font-bold transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {storeLoading ? 'Simming…' : 'Sim Day'}
            </button>
            <button
              onClick={() => void simRange('week')}
              disabled={storeLoading}
              className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              Sim Week
            </button>
            {league.currentTick <= TRADE_DEADLINE_DAY && (
              <button
                onClick={() => void simRange('deadline')}
                disabled={storeLoading}
                className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                Sim to Deadline
              </button>
            )}
            <button
              onClick={() => void simRange('season')}
              disabled={storeLoading}
              className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              Sim Season
            </button>
          </div>
        )}
      </header>

      {gamesPlayed === 0 && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🏀"
            title="Day 1 — preseason"
            message="No games played yet. Sim a day to start writing the standings."
            action={{ label: 'Sim Day →', onClick: () => void simDay() }}
          />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {(['Eastern', 'Western'] as const).map(conf => (
          <ConferenceTable
            key={conf}
            label={`${conf} Conference`}
            teams={sorted[conf]}
            userTeamId={league.userTeamId ?? null}
            onRosterClick={setRosterTeamId}
          />
        ))}
      </div>

      <TeamRosterModal
        teamId={rosterTeamId}
        onClose={() => setRosterTeamId(null)}
        onPlayerClick={pid => { setRosterTeamId(null); setModalPlayerId(pid); }}
      />
      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function ConferenceTable({
  label, teams, userTeamId, onRosterClick,
}: {
  label: string;
  teams: BasketballTeam[];
  userTeamId: string | null;
  onRosterClick: (teamId: string) => void;
}) {
  const leader = teams[0];
  return (
    <section className="rounded border" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        {label}
      </h2>
      {/* Desktop table */}
      <table className="w-full text-sm hidden sm:table">
        <thead className="opacity-70 text-xs">
          <tr>
            <th className="px-2 py-1 text-left">Team</th>
            <th className="px-2 py-1 text-right">W</th>
            <th className="px-2 py-1 text-right">L</th>
            <th className="px-2 py-1 text-right">PCT</th>
            <th className="px-2 py-1 text-right">GB</th>
            <th className="px-2 py-1 text-right">Diff</th>
            <th className="px-2 py-1 text-left pl-3">Last 5</th>
            <th className="px-2 py-1 w-9" aria-label="Roster" />
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const games = t.record.wins + t.record.losses;
            const pct = games > 0 ? t.record.wins / games : 0;
            const gb = leader && leader !== t
              ? ((leader.record.wins - t.record.wins) + (t.record.losses - leader.record.losses)) / 2
              : 0;
            const diff = t.record.pointsFor - t.record.pointsAgainst;
            const isUser = userTeamId === t.id;
            return (
              <tr
                key={t.id}
                className="border-t"
                style={{
                  borderColor: 'var(--border)',
                  background: isUser ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
                }}
              >
                <td className="px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="opacity-50 text-xs w-4">{i + 1}.</span>
                    <TeamLogo
                      abbreviation={t.abbreviation}
                      primaryColor={t.primaryColor}
                      secondaryColor={t.secondaryColor}
                      size="xs"
                    />
                    <Link
                      href={`/team/${t.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: isUser ? 'var(--accent)' : undefined }}
                    >
                      {t.city}
                    </Link>
                    <span className="text-xs text-[var(--text-sec)] truncate">{t.name}</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">{t.record.wins}</td>
                <td className="px-2 py-1 text-right">{t.record.losses}</td>
                <td className="px-2 py-1 text-right tabular-nums">{pct.toFixed(3).slice(1)}</td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {gb === 0 ? '—' : gb.toFixed(1).replace('.0', '')}
                </td>
                <td
                  className="px-2 py-1 text-right tabular-nums"
                  style={{ color: diff > 0 ? '#10b981' : diff < 0 ? '#dc2626' : undefined }}
                >
                  {diff > 0 ? '+' : ''}{diff}
                </td>
                <td className="px-2 py-1 pl-3 font-mono text-xs">
                  {t.record.streak.slice(-5).join('') || '—'}
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    onClick={() => onRosterClick(t.id)}
                    title={`View ${t.city} roster`}
                    aria-label={`View ${t.city} roster`}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors"
                  >
                    👁
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile card list */}
      <ul className="sm:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {teams.map((t, i) => {
          const games = t.record.wins + t.record.losses;
          const pct = games > 0 ? t.record.wins / games : 0;
          const diff = t.record.pointsFor - t.record.pointsAgainst;
          const isUser = userTeamId === t.id;
          return (
            <li
              key={t.id}
              className="p-3"
              style={{
                borderColor: 'var(--border)',
                background: isUser ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="opacity-50 text-xs w-5">{i + 1}.</span>
                <TeamLogo
                  abbreviation={t.abbreviation}
                  primaryColor={t.primaryColor}
                  secondaryColor={t.secondaryColor}
                  size="sm"
                />
                <Link
                  href={`/team/${t.id}`}
                  className="font-semibold hover:underline truncate"
                  style={{ color: isUser ? 'var(--accent)' : undefined }}
                >
                  {t.city} <span className="text-[var(--text-sec)] font-normal">{t.name}</span>
                </Link>
                <button
                  onClick={() => onRosterClick(t.id)}
                  aria-label={`View ${t.city} roster`}
                  className="ml-auto w-11 h-11 inline-flex items-center justify-center rounded-md text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors"
                >
                  👁
                </button>
              </div>
              <div className="flex items-center gap-4 mt-1.5 pl-7 text-sm">
                <span className="font-semibold">{t.record.wins}–{t.record.losses}</span>
                <span className="tabular-nums text-[var(--text-sec)]">{pct.toFixed(3).slice(1)}</span>
                <span
                  className="tabular-nums"
                  style={{ color: diff > 0 ? '#10b981' : diff < 0 ? '#dc2626' : undefined }}
                >
                  {diff > 0 ? '+' : ''}{diff}
                </span>
                <span className="font-mono text-xs ml-auto">{t.record.streak.slice(-5).join('') || '—'}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Home
      </Link>
    </main>
  );
}
