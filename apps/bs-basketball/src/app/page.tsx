'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { listLeagues, deleteLeague, type LeagueSaveMeta } from '@/lib/persistence/db';
import { basketballAdapter } from '@bs/sport-basketball';

/**
 * BS Hoops home page.
 *
 * 2C-2a: Three primary actions — New Game / Continue / Load Game.
 * In-memory league state lives in the Zustand store; persistence is via
 * Dexie. Once a league is loaded, this page shows a confirmation summary
 * (real league pages land in 2C-3).
 *
 * Once an actual /league route exists we'll router.push() there instead of
 * rendering inline.
 */

export default function HomePage() {
  const { league, loading, error, newLeague, continueLatest, loadLeague, clearActive } = useLeagueStore();
  const [saves, setSaves] = useState<LeagueSaveMeta[]>([]);
  const [showLoadList, setShowLoadList] = useState(false);

  // Refresh the save list whenever the active league changes (covers the
  // post-creation case where we want the new save reflected immediately).
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

  // ---------- League-loaded view ----------
  if (league) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <header className="border-b pb-4 mb-8" style={{ borderColor: 'var(--accent)' }}>
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ color: 'var(--accent)' }}>
            {league.displayName}
          </h1>
          <p className="text-lg mt-1 opacity-70">
            Season {league.currentSeason} · {league.currentPhase}
          </p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <Stat label="Teams" value={league.teams.length} />
          <Stat
            label="Games played"
            value={`${league.games.filter(g => g.status === 'played').length} / ${league.games.length}`}
          />
          <Stat label="Day" value={league.currentTick} />
          <Stat label="Save version" value={league.saveVersion} />
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/league"
            className="px-6 py-3 rounded-lg font-bold text-lg"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Enter League →
          </Link>
          <Link
            href="/standings"
            className="px-4 py-3 rounded-lg font-semibold"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            Standings
          </Link>
          <button
            onClick={clearActive}
            className="px-4 py-2 rounded font-semibold"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            ← Back to menu
          </button>
        </div>
      </main>
    );
  }

  // ---------- Splash view (no league loaded) ----------
  return (
    <main className="max-w-2xl mx-auto p-8">
      <header className="text-center mb-12">
        <h1 className="text-6xl font-extrabold tracking-tight" style={{ color: 'var(--accent)' }}>
          BS Hoops
        </h1>
        <p className="text-lg mt-2 opacity-70">
          Build your dynasty. Run the franchise.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-3 rounded border" style={{ borderColor: '#dc2626', background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div className="space-y-3">
        <Button
          primary
          disabled={loading}
          onClick={() => void newLeague()}
        >
          {loading ? 'Generating…' : 'New Game'}
        </Button>

        <Button
          disabled={loading || saves.length === 0}
          onClick={() => void continueLatest()}
        >
          {saves.length === 0 ? 'Continue (no saves)' : 'Continue'}
        </Button>

        <Button
          disabled={saves.length === 0}
          onClick={() => setShowLoadList(s => !s)}
        >
          Load Game ({saves.length})
        </Button>
      </div>

      {showLoadList && saves.length > 0 && (
        <section className="mt-6">
          <h2 className="font-bold mb-2">Saved leagues</h2>
          <ul className="space-y-2">
            {saves.map(s => (
              <li
                key={s.id}
                className="p-3 rounded border flex items-center gap-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex-1">
                  <div className="font-semibold">{s.displayName}</div>
                  <div className="text-xs opacity-60">
                    Season {s.currentSeason} · {s.currentPhase} · {s.teamCount} teams · {s.playerCount} players
                  </div>
                  <div className="text-xs opacity-50">
                    Saved {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => void loadLeague(s.id)}
                  className="px-3 py-1 rounded text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Load
                </button>
                <button
                  onClick={() => void handleDelete(s.id)}
                  className="px-3 py-1 rounded text-sm opacity-70 hover:opacity-100"
                  style={{ background: 'var(--muted)' }}
                  title="Delete save"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-16 pt-4 border-t opacity-60 text-xs text-center" style={{ borderColor: 'var(--border)' }}>
        BS Hoops · adapter {basketballAdapter.sportId} · {basketballAdapter.positions.length} positions ·{' '}
        {basketballAdapter.competitions.length} competition
      </footer>
    </main>
  );
}

// ===========================================================================
// Reusable bits (inline for now — extract to /components in a later slice)
// ===========================================================================

function Button({
  children, onClick, disabled, primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-6 py-4 rounded-lg font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: primary ? 'var(--accent)' : 'var(--muted)',
        color: primary ? '#fff' : 'var(--foreground)',
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
      <div className="text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-xs opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}
