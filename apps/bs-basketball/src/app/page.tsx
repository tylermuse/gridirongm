'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { listLeagues, deleteLeague, type LeagueSaveMeta } from '@/lib/persistence/db';
import { HOOPS_LEAGUE_TEAMS } from '@/lib/data/teams';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { NewsFeed } from '@/components/feed/NewsFeed';

/**
 * BS Hoops home — port of bs-football's TeamPicker pattern.
 *
 *   - Top: hero (BS HOOPS lockup + tagline)
 *   - Resume card (if there's a saved league)
 *   - Spectator card (dashed border, watch-only)
 *   - Search input
 *   - 30 team grid: each card shows the TeamLogo + city + nickname
 *
 * Clicking a team starts a new league and stamps that team as userTeamId
 * before navigating to /league.
 */

export default function HomePage() {
  const { league, loading, error, newLeague, continueLatest, loadLeague, pickUserTeam, clearActive } = useLeagueStore();
  const [saves, setSaves] = useState<LeagueSaveMeta[]>([]);
  const [showLoadList, setShowLoadList] = useState(false);
  const [search, setSearch] = useState('');
  const [pickingAbbr, setPickingAbbr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await listLeagues();
      if (!cancelled) setSaves(all);
    })();
    return () => { cancelled = true; };
  }, [league]);

  async function handlePick(abbreviation: string, spectator = false) {
    setPickingAbbr(abbreviation);
    try {
      await newLeague();
      if (!spectator) {
        // After newLeague, the store's league has the freshly generated
        // teams with new IDs; find the one matching the chosen abbreviation.
        const state = useLeagueStore.getState();
        const picked = state.league?.teams.find(t => t.abbreviation === abbreviation);
        if (picked) {
          await pickUserTeam(picked.id);
        }
      }
    } finally {
      setPickingAbbr(null);
    }
  }

  async function handleDelete(id: string) {
    await deleteLeague(id);
    const all = await listLeagues();
    setSaves(all);
  }

  // ---------------- League loaded ----------------
  if (league) {
    const playedCount = league.games.filter(g => g.status === 'played').length;
    const userTeam = league.userTeamId ? league.teams.find(t => t.id === league.userTeamId) : null;
    return (
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex flex-wrap items-baseline gap-4 mb-6">
          <h1
            className="text-5xl sm:text-6xl font-black tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
          >
            {league.displayName}
          </h1>
          <span className="text-[var(--text-sec)] text-sm">
            Season {league.currentSeason} · {league.currentPhase} · Day {league.currentTick}
          </span>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="lg:col-span-2">
            {userTeam && (
              <div className="flex items-center gap-3 mb-8">
                <TeamLogo
                  abbreviation={userTeam.abbreviation}
                  primaryColor={userTeam.primaryColor}
                  secondaryColor={userTeam.secondaryColor}
                  size="lg"
                />
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-60">You manage</div>
                  <div className="text-xl font-bold">{userTeam.city} {userTeam.name}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard label="Teams" value={league.teams.length} />
              <StatCard label="Games Played" value={`${playedCount} / ${league.games.length}`} />
              <StatCard label="Day" value={league.currentTick} />
              <StatCard label="Saves" value={saves.length} />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/league">
                <Button variant="primary" size="lg">Enter League →</Button>
              </Link>
              <Link href="/standings">
                <Button variant="secondary" size="lg">Standings</Button>
              </Link>
              {userTeam && (
                <Link href={`/team/${userTeam.id}`}>
                  <Button variant="secondary" size="lg">My Team</Button>
                </Link>
              )}
              <Button variant="ghost" size="lg" onClick={clearActive}>
                ← Back to menu
              </Button>
            </div>
          </div>

          {/* News sidebar */}
          <aside className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">League News</h2>
              <Link href="/news" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                View all →
              </Link>
            </div>
            <NewsFeed league={league} max={6} />
          </aside>
        </div>
      </div>
    );
  }

  // ---------------- Splash ----------------
  const filtered = HOOPS_LEAGUE_TEAMS
    .filter(t =>
      !search ||
      t.city.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.abbreviation.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.city.localeCompare(b.city));

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center px-4 sm:px-8 py-10">
      {/* Hero */}
      <div className="text-center mb-8 max-w-2xl">
        <h1
          className="text-5xl sm:text-7xl font-black tracking-tighter leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <span style={{ color: 'var(--accent)' }}>BS</span>{' '}
          <span>HOOPS</span>
        </h1>
        <p className="text-[var(--text-sec)] text-sm sm:text-lg mt-3">
          Choose your franchise. Build your dynasty.
        </p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Resume saved game */}
      {saves.length > 0 && (
        <div className="mb-6 max-w-md w-full">
          <button
            onClick={() => void continueLatest()}
            disabled={loading}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent)]/5
                       hover:bg-[var(--accent)]/10 hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all group"
          >
            <div className="flex items-center gap-3 text-left">
              <div
                className="w-10 h-10 rounded-full text-white flex items-center justify-center text-sm font-black shrink-0"
                style={{ background: 'var(--accent)', fontFamily: 'var(--font-display)' }}
              >
                {(saves[0].displayName ?? 'BS').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                  Continue League
                </div>
                <div className="text-xs text-[var(--text-sec)]">
                  Season {saves[0].currentSeason} · {saves[0].currentPhase} · {saves[0].teamCount} teams
                </div>
              </div>
            </div>
            <div className="text-[var(--accent)] text-xl group-hover:translate-x-1 transition-transform">→</div>
          </button>
          <div className="text-center mt-2">
            <button
              onClick={() => setShowLoadList(s => !s)}
              className="text-xs text-[var(--text-sec)] hover:text-[var(--accent)] underline-offset-4 hover:underline"
            >
              {showLoadList ? 'Hide' : 'Or browse'} {saves.length} saved {saves.length === 1 ? 'league' : 'leagues'}
            </button>
          </div>
        </div>
      )}

      {/* Browseable saved leagues */}
      {showLoadList && saves.length > 0 && (
        <div className="mb-6 max-w-2xl w-full">
          <CardHeader>
            <CardTitle>Saved leagues</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {saves.map(s => (
              <Card key={s.id} className="flex items-center gap-3 !p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.displayName}</div>
                  <div className="text-xs text-[var(--text-sec)] truncate">
                    Season {s.currentSeason} · {s.currentPhase} · {s.teamCount} teams · {s.playerCount} players
                  </div>
                  <div className="text-xs text-[var(--text-sec)] opacity-70 mt-0.5">
                    Saved {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" onClick={() => void loadLeague(s.id)}>Load</Button>
                <Button size="sm" variant="ghost" onClick={() => void handleDelete(s.id)} title="Delete save">✕</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search teams…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-md mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm focus:outline-none focus:border-[var(--accent)]"
      />

      {/* Spectator card */}
      <button
        onClick={() => void handlePick('', true)}
        disabled={!!pickingAbbr || loading}
        className="w-full max-w-4xl mb-3 group flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)]
                   hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all text-left disabled:opacity-50"
      >
        <div className="w-12 h-12 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-2xl shrink-0">
          👁
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Spectator (no team)</div>
          <div className="text-xs text-[var(--text-sec)]">Watch all 30 AI-controlled teams play out the season. No managing.</div>
        </div>
        <div className="text-[var(--accent)] text-xl group-hover:translate-x-1 transition-transform shrink-0">→</div>
      </button>

      {/* Team grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-4xl w-full">
        {filtered.map(team => {
          const isPicking = pickingAbbr === team.abbreviation;
          return (
            <button
              key={team.abbreviation}
              onClick={() => void handlePick(team.abbreviation)}
              disabled={!!pickingAbbr || loading}
              className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                         hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all text-left
                         disabled:opacity-50 disabled:cursor-wait"
            >
              <TeamLogo
                abbreviation={team.abbreviation}
                primaryColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                size="lg"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{team.city}</div>
                <div className="text-xs text-[var(--text-sec)] truncate">
                  {isPicking ? 'Starting…' : team.name}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="!p-4">
      <div
        className="text-2xl font-black"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest opacity-60 mt-0.5">{label}</div>
    </Card>
  );
}
