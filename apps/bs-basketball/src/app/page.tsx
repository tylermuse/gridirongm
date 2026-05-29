'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { listLeagues, deleteLeague, type LeagueSaveMeta } from '@/lib/persistence/db';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardSubtitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

/**
 * BS Hoops splash + entry page.
 *
 * Two modes:
 *   - No league loaded: hero + 3 CTAs (New / Continue / Load).
 *   - League loaded: dashboard with stats + Enter League + Standings.
 *
 * 2C-7a pass: lean on the Card / Button / Badge primitives and the
 * Barlow Condensed display font.
 */

export default function HomePage() {
  const { league, loading, error, newLeague, continueLatest, loadLeague, clearActive } = useLeagueStore();
  const [saves, setSaves] = useState<LeagueSaveMeta[]>([]);
  const [showLoadList, setShowLoadList] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await listLeagues();
      if (!cancelled) setSaves(all);
    })();
    return () => { cancelled = true; };
  }, [league]);

  async function handleDelete(id: string) {
    await deleteLeague(id);
    const all = await listLeagues();
    setSaves(all);
  }

  // ---------- League-loaded dashboard ----------
  if (league) {
    const playedCount = league.games.filter(g => g.status === 'played').length;
    return (
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-wrap items-baseline gap-4 mb-8">
          <h1
            className="text-5xl font-black tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
          >
            {league.displayName}
          </h1>
          <Badge variant="default" size="md">
            Season {league.currentSeason}
          </Badge>
          <span className="text-[var(--text-sec)] text-sm">
            {league.currentPhase}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Teams" value={league.teams.length} />
          <StatCard label="Games Played" value={`${playedCount} / ${league.games.length}`} />
          <StatCard label="Day" value={league.currentTick} />
          <StatCard label="Your Team" value={league.userTeamId ? '✓' : '—'} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/league">
            <Button variant="primary" size="lg">
              Enter League →
            </Button>
          </Link>
          <Link href="/standings">
            <Button variant="secondary" size="lg">
              Standings
            </Button>
          </Link>
          <Button variant="ghost" size="lg" onClick={clearActive}>
            ← Back to menu
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Splash (no league loaded) ----------
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <section className="text-center mb-12">
        <h1
          className="text-7xl sm:text-8xl font-black tracking-tighter leading-none"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--accent)',
            textShadow: '0 2px 0 var(--accent-alt)',
          }}
        >
          BS HOOPS
        </h1>
        <p className="text-lg sm:text-xl mt-4 text-[var(--text-sec)] max-w-xl mx-auto">
          Build your dynasty. Run the franchise.
          <br />
          30 teams · 82 games · one championship.
        </p>
      </section>

      {error && (
        <Card className="mb-6 border-red-300 bg-red-50 text-red-700">
          {error}
        </Card>
      )}

      <div className="space-y-3 mb-6">
        <Button
          variant="primary"
          size="lg"
          disabled={loading}
          onClick={() => void newLeague()}
          className="w-full"
        >
          {loading ? 'Generating…' : 'New Game'}
        </Button>

        <Button
          variant="secondary"
          size="lg"
          disabled={loading || saves.length === 0}
          onClick={() => void continueLatest()}
          className="w-full"
        >
          {saves.length === 0 ? 'Continue (no saves yet)' : `Continue · ${saves[0]?.displayName ?? ''}`}
        </Button>

        <Button
          variant="ghost"
          size="lg"
          disabled={saves.length === 0}
          onClick={() => setShowLoadList(s => !s)}
          className="w-full"
        >
          Load Game ({saves.length})
        </Button>
      </div>

      {showLoadList && saves.length > 0 && (
        <section>
          <CardHeader>
            <CardTitle>Saved leagues</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {saves.map(s => (
              <Card key={s.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.displayName}</div>
                  <CardSubtitle>
                    Season {s.currentSeason} · {s.currentPhase} · {s.teamCount} teams · {s.playerCount} players
                  </CardSubtitle>
                  <div className="text-xs text-[var(--text-sec)] opacity-70 mt-0.5">
                    Saved {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" onClick={() => void loadLeague(s.id)}>Load</Button>
                <Button size="sm" variant="ghost" onClick={() => void handleDelete(s.id)} title="Delete save">
                  ✕
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
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
