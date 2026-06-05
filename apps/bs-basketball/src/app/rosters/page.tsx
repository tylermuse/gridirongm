'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { TeamId } from '@bs/core/adapter';

/**
 * /rosters — download real-roster files and start a league from one, mirroring
 * the football app's /rosters page. The shipped BBGM NBA file converts into a
 * full 30-team BS Hoops league via the store's import actions.
 *
 * Flow: pick a roster (download, start-from-URL, paste-a-URL, or upload a file)
 * → the store builds + persists the league → pick your team → /league.
 */

// Bump `?v=` when the JSON is regenerated to bust the Vercel edge cache.
const CACHE_BUST = 1;
const NBA_FILE = '/rosters/BBGM_NBA_Roster_2026_Updated.json';
const nbaUrl = `${NBA_FILE}?v=${CACHE_BUST}`;

export default function RostersPage() {
  const { importLeagueFromUrl, importLeagueFromData, pickUserTeam, league, loading, error, clearError } = useLeagueStore();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function startFromUrl(url: string) {
    clearError();
    const ok = await importLeagueFromUrl(url);
    if (ok) setPicking(true);
  }

  async function startFromFile(file: File) {
    clearError();
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const ok = await importLeagueFromData(raw);
      if (ok) setPicking(true);
    } catch {
      useLeagueStore.setState({ error: "Couldn't read that file — is it valid league JSON?" });
    }
  }

  function downloadNba() {
    const a = document.createElement('a');
    a.href = nbaUrl;
    a.download = 'BBGM_NBA_Roster_2026_Updated.json';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function choose(teamId: TeamId) {
    await pickUserTeam(teamId);
    router.push('/league');
  }

  // --- After a successful import: pick your team ---
  if (picking && league) {
    const teams = [...league.teams].sort((a, b) => a.city.localeCompare(b.city));
    return (
      <main className="max-w-5xl mx-auto p-8">
        <h1 className="text-3xl font-extrabold mb-1" style={{ color: 'var(--accent)' }}>Pick your team</h1>
        <p className="text-sm text-[var(--text-sec)] mb-6">{league.displayName} is loaded — choose who you want to run.</p>

        <button
          onClick={() => router.push('/league')}
          className="w-full mb-3 group flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-all text-left"
        >
          <div className="w-11 h-11 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-2xl shrink-0">👁</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Spectator (no team)</div>
            <div className="text-xs text-[var(--text-sec)]">Watch all 30 teams play out the season.</div>
          </div>
          <div className="text-[var(--accent)] text-xl group-hover:translate-x-1 transition-transform shrink-0">→</div>
        </button>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => void choose(team.id)}
              disabled={loading}
              className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-wait"
            >
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{team.city}</div>
                <div className="text-xs text-[var(--text-sec)] truncate">{team.name}</div>
              </div>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // --- Roster catalog ---
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-extrabold mb-1" style={{ color: 'var(--accent)' }}>Rosters</h1>
      <p className="text-sm text-[var(--text-sec)] mb-6">
        Start a league from a real-roster file. BS Hoops imports BBGM / ZenGM-format basketball league JSON.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, #dc2626 12%, transparent)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold">NBA 2025-26 Roster</div>
            <div className="text-sm text-[var(--text-sec)] mt-0.5">
              All 30 teams with real rosters, positions, and contracts. Converted to the BS Hoops ratings scale on import.
            </div>
            <div className="text-[11px] text-[var(--text-sec)] mt-1 opacity-70">BBGM-native · 30 teams · 529 players</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button variant="primary" disabled={loading} onClick={() => void startFromUrl(nbaUrl)}>
            {loading ? 'Loading…' : 'Start a league with this roster'}
          </Button>
          <Button variant="secondary" disabled={loading} onClick={downloadNba}>Download JSON</Button>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-bold mb-1">Use your own file</div>
        <p className="text-xs text-[var(--text-sec)] mb-3">Paste a URL to a BBGM/ZenGM league JSON, or upload one from your device.</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="https://example.com/league.json"
            onKeyDown={e => { if (e.key === 'Enter' && customUrl.trim()) void startFromUrl(customUrl.trim()); }}
            className="flex-1 min-w-[12rem] px-3 py-2 text-sm rounded-lg border bg-[var(--surface-2)] outline-none focus:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
          />
          <Button variant="secondary" disabled={loading || !customUrl.trim()} onClick={() => void startFromUrl(customUrl.trim())}>Load URL</Button>
          <Button variant="ghost" disabled={loading} onClick={() => fileInput.current?.click()}>Upload file</Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void startFromFile(f); e.target.value = ''; }}
          />
        </div>
      </Card>
    </main>
  );
}
