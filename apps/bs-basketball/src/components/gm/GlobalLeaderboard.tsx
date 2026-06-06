'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSupabaseUser, displayNameOf } from '@/lib/auth/useSupabaseUser';

/**
 * Cross-player global GM board (parity 3.3) — all-time + this-season, fetched
 * from /api/gm/leaderboard. Sits alongside the local within-league rankings.
 * Optional sign-in (you stay fully playable logged-out); signed-in users can
 * set a leaderboard display name.
 */

interface AllTimeRow { userId: string; displayName: string; teamName: string | null; wins: number; losses: number; winPct: number; championships: number; playoffAppearances: number; seasonsPlayed: number }
interface SeasonRow { userId: string; displayName: string; teamName: string | null; wins: number; losses: number; winPct: number; madePlayoffs: boolean }
interface Board { latestSeason: number | null; allTime: AllTimeRow[]; thisSeason: SeasonRow[] }

export function GlobalLeaderboard() {
  const { user, configured, signOut } = useSupabaseUser();
  const [board, setBoard] = useState<Board | null>(null);
  const [tab, setTab] = useState<'all' | 'season'>('all');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/gm/leaderboard')
      .then(r => r.json())
      .then(j => { if (active) setBoard(j); })
      .catch(() => { /* unconfigured */ })
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, []);

  if (!configured) return null; // online board not available in this build

  const rows = tab === 'all' ? (board?.allTime ?? []) : (board?.thisSeason ?? []);

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mb-6" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2.5 border-b flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <span className="font-bold text-sm">🌍 Global GM Board</span>
        <div className="inline-flex rounded-lg overflow-hidden text-xs font-bold ml-1" style={{ background: 'var(--surface-2)' }}>
          {([['all', 'All-time'], ['season', 'This season']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className="px-2.5 py-1" style={tab === k ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{label}</button>
          ))}
        </div>
        <div className="ml-auto text-xs">
          {user ? <NameControls name={displayNameOf(user)} onSignOut={signOut} /> : <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Sign in to compete →</Link>}
        </div>
      </div>

      {!loaded ? (
        <p className="px-3 py-4 text-sm text-[var(--text-sec)]">Loading the global board…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-[var(--text-sec)]">No managers on the board yet — finish a season signed in to be the first.</p>
      ) : (
        <ol>
          {rows.map((r, i) => (
            <li key={r.userId}>
              <Link href={`/gm/${r.userId}`} className="flex items-center gap-3 px-3 py-2 border-t text-sm hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)', background: user?.id === r.userId ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
                <span className="w-6 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                <span className="font-semibold truncate flex-1">{r.displayName}{user?.id === r.userId && <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--accent)' }}>YOU</span>}</span>
                {'championships' in r && (r as AllTimeRow).championships > 0 && <span className="text-xs">🏆 {(r as AllTimeRow).championships}</span>}
                <span className="text-xs tabular-nums text-[var(--text-sec)] w-16 text-right">{r.wins}-{r.losses}</span>
                <span className="text-sm font-bold tabular-nums w-12 text-right" style={{ color: 'var(--accent)' }}>{r.winPct.toFixed(3).replace(/^0/, '')}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NameControls({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try { await fetch('/api/gm/display-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val }) }); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input value={val} onChange={e => setVal(e.target.value)} maxLength={32} className="px-2 py-0.5 rounded border bg-[var(--surface-2)] text-xs w-28" style={{ borderColor: 'var(--border)' }} />
        <button onClick={() => void save()} disabled={saving} className="font-semibold" style={{ color: 'var(--accent)' }}>Save</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[var(--text-sec)]">
      <span>{name}</span>
      <button onClick={() => setEditing(true)} className="hover:underline">edit</button>
      <button onClick={onSignOut} className="hover:underline">sign out</button>
    </span>
  );
}
