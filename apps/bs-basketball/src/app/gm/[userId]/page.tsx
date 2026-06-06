'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';

/**
 * /gm/[userId] — public Hall of Fame profile: career card, season-by-season
 * history, and a trophy case. Fetches the public /api/gm/profile route.
 */

interface Career {
  displayName: string; teamName: string | null; teamAbbreviation: string | null;
  wins: number; losses: number; winPct: number; championships: number;
  playoffAppearances: number; seasonsPlayed: number;
}
interface SeasonRow { season: number; team_name: string | null; wins: number; losses: number; made_playoffs: boolean; won_championship: boolean }
interface AwardRow { season: number; award_type: string }
interface Profile { career: Career; seasons: SeasonRow[]; awards: AwardRow[] }

export default function GmProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/gm/profile/${userId}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (active) { if (ok) setData(j); else setError(j.error ?? 'Failed to load'); } })
      .catch(() => active && setError('Failed to load profile'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId]);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <Link href="/gm-rankings" className="text-sm font-semibold opacity-70 hover:opacity-100">← GM Rankings</Link>
      {loading ? (
        <p className="mt-4 opacity-60">Loading…</p>
      ) : error || !data ? (
        <p className="mt-4 text-sm text-[var(--text-sec)]">{error ?? 'GM not found.'}</p>
      ) : (
        <Loaded data={data} />
      )}
    </main>
  );
}

function Loaded({ data }: { data: Profile }) {
  const c = data.career;
  const hof = c.championships >= 3;
  return (
    <>
      <header className="mt-2 mb-5 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>{c.displayName}</h1>
        {hof && <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: 'color-mix(in srgb, #f59e0b 18%, transparent)', color: '#d97706' }}>Hall of Fame</span>}
      </header>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Titles" value={c.championships} />
        <Stat label="Record" value={`${c.wins}-${c.losses}`} />
        <Stat label="Win%" value={c.winPct.toFixed(3).replace(/^0/, '')} />
        <Stat label="Playoffs" value={c.playoffAppearances} />
        <Stat label="Seasons" value={c.seasonsPlayed} />
      </div>

      {data.awards.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-sec)] mb-2">Trophy case</h2>
          <div className="flex flex-wrap gap-2">
            {data.awards.map((a, i) => (
              <span key={i} className="text-xs font-semibold rounded px-2 py-1" style={{ background: 'var(--surface-2)' }}>
                🏆 {awardLabel(a.award_type)} · {a.season}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>Season history</h2>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">
            <tr><th className="text-left px-3 py-1.5">Season</th><th className="text-left px-3 py-1.5">Team</th><th className="text-right px-3 py-1.5">W-L</th><th className="text-right px-3 py-1.5">Result</th></tr>
          </thead>
          <tbody>
            {data.seasons.map(s => (
              <tr key={s.season} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-1.5 tabular-nums">{s.season}</td>
                <td className="px-3 py-1.5 truncate">{s.team_name ?? '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{s.wins}-{s.losses}</td>
                <td className="px-3 py-1.5 text-right">{s.won_championship ? '🏆 Champion' : s.made_playoffs ? 'Playoffs' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 rounded-lg text-center" style={{ background: 'var(--surface-2)' }}>
      <div className="text-lg font-black" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
    </div>
  );
}

function awardLabel(t: string): string {
  return t === 'gm_of_year' ? 'GM of the Year' : t === 'best_draft' ? 'Best Draft' : t === 'best_rebuild' ? 'Best Rebuild' : t;
}
