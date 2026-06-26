'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { TeamId } from '@bs/core/adapter';

/**
 * /rosters — "Community Rosters" catalog, modeled on the BS Football rosters
 * page. Download real-roster files and start a league from one; the shipped
 * BBGM NBA file converts into a full 30-team BS Hoops league via the store's
 * import actions.
 *
 * Flow: pick a roster (start-from-URL, download, paste-a-URL, or upload a file)
 * → the store builds + persists the league → pick your team → /league.
 *
 * BUG-14: the picker state used to live in a `useState(false)` flipped to true
 * after a successful import. That worked the first time, but the local state
 * was lost on any remount (e.g. AppShell re-rendering because the league
 * replacement flipped `userTeamId` to null and the sidebar reshapes its
 * sections), bouncing the user back to the catalog state and forcing them to
 * click "Start a league with this roster" a second time. Derive the picker
 * state from league shape instead — if a league is loaded but no team's been
 * picked, show the picker. Restartable + remount-safe.
 */

// Bump `?v=` when the JSON is regenerated to bust the Vercel edge cache.
const CACHE_BUST = 8;
const NBA_FILE = '/rosters/BBGM_NBA_Roster_2026_Updated.json';
const nbaUrl = `${NBA_FILE}?v=${CACHE_BUST}`;
const LAST_UPDATED = 'June 25, 2026';
const DISCORD_INVITE = 'https://discord.gg/RMtusS2GKW';

/** Collapsible "How to use this roster" panel — BS Hoops + Basketball GM paths. */
function HowToUse() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t mt-4 pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        How to use this roster
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <div className="font-bold text-[var(--text)] mb-1">For BS Hoops:</div>
            <p className="text-[var(--text-sec)]">Click the <strong>&quot;Start a league with this roster&quot;</strong> button above, then pick your team.</p>
          </div>
          <div>
            <div className="font-bold text-[var(--text)] mb-1">For Basketball GM:</div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--text-sec)]">
              <li>Download the JSON above.</li>
              <li>Go to <a href="https://play.basketball-gm.com" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>play.basketball-gm.com</a></li>
              <li>Click <strong>Create new league</strong></li>
              <li>Under <strong>Customize</strong>, choose <strong>Upload league file</strong> and select the downloaded JSON</li>
              <li>Click <strong>Create league</strong></li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RostersPage() {
  const { importLeagueFromUrl, importLeagueFromData, pickUserTeam, league, loading, error, clearError } = useLeagueStore();
  const router = useRouter();
  const [customUrl, setCustomUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // Show the team picker whenever a league is loaded without a user team —
  // either a fresh import (the common path) or returning to /rosters with an
  // imported-but-not-picked league. The catalog still shows when no league is
  // loaded, OR (BUG-14: explicitly allow starting another league) when the
  // user has already picked a team and revisits /rosters.
  const picking = !!league && !league.userTeamId;

  async function startFromUrl(url: string) {
    clearError();
    await importLeagueFromUrl(url);
    // No setPicking — `picking` derives from league.userTeamId, which the
    // import path leaves null. The next render flips into picker state.
  }

  async function startFromFile(file: File) {
    clearError();
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      await importLeagueFromData(raw);
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
    // Imported leagues start in the offseason with their draft pending — go run
    // it first; otherwise straight to the team dashboard.
    const picked = useLeagueStore.getState().league;
    const sd = picked?.sportData as { draft?: unknown; postDraftImport?: boolean } | undefined;
    router.push(sd?.draft ? '/draft' : sd?.postDraftImport ? '/re-sign' : '/league');
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
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="lg" />
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

  // --- Community Rosters catalog ---
  return (
    <div className="min-h-screen">
      {/* Header band */}
      <div className="border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">Community Rosters</h1>
          <p className="text-[var(--text-sec)] text-sm sm:text-base">
            Download updated NBA rosters for Basketball GM and BS Hoops
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="px-4 py-3 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, #dc2626 12%, transparent)', color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* Featured roster card */}
        <div className="rounded-xl p-6 shadow-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
                >
                  Modern
                </span>
              </div>
              <h2 className="text-lg font-black">NBA 2025-26 Roster</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1.5 leading-relaxed">
                All 30 teams with real rosters, positions, and contracts, re-leveled to current NBA 2K26 overalls.
                Imports as a full 30-team league in Basketball GM or BS Hoops, starting at the 2026 season. Includes
                the 2026 draft class with the top of the board curated to real consensus big-board order (AJ Dybantsa,
                Darryn Peterson, Cameron Boozer, Caleb Wilson…), so the lottery feels true to life.
              </p>
              <p className="text-[11px] text-[var(--text-sec)] mt-2 opacity-70">BBGM-native · 30 teams · 529 players</p>
              <p className="text-xs mt-2 text-[var(--text-sec)] italic">
                Base roster by <span className="font-semibold not-italic text-[var(--text)]">AlexNoob</span> (2025-26 NBA),
                synced to current overalls. Free-agency &amp; draft updates by BS Hoops. Thanks to AlexNoob for making this possible.
              </p>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {['Basketball GM (BBGM)', 'BS Hoops'].map(tag => (
                  <span key={tag} className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                    {tag}
                  </span>
                ))}
                <span className="text-xs text-[var(--text-sec)]">Updated {LAST_UPDATED}</span>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-2 sm:w-52">
              <Button variant="primary" size="lg" disabled={loading} onClick={() => void startFromUrl(nbaUrl)}>
                {loading ? 'Loading…' : 'Start a league with this roster →'}
              </Button>
              <Button variant="secondary" disabled={loading} onClick={downloadNba}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download JSON
              </Button>
            </div>
          </div>

          <HowToUse />
        </div>

        {/* Use your own file */}
        <div className="rounded-xl p-6 shadow-sm border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="text-sm font-bold mb-1">Use your own file</div>
          <p className="text-xs text-[var(--text-sec)] mb-3">Paste a URL to a BBGM / ZenGM league JSON, or upload one from your device.</p>
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
        </div>

        {/* What you'll get */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-sec)] mb-3">What you&apos;ll get</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: '🏀', title: 'Full season sim', body: 'Play a single game or sim to the next milestone — All-Star break, playoffs, lottery.' },
              { icon: '💼', title: 'Front-office tools', body: 'Trades with full pick + contract context, Bird-rights free agency, GM rankings.' },
              { icon: '📊', title: 'Deep stats + awards', body: 'League leaders, team rankings, MVP / ROY / MIP races, draft scouting reports.' },
            ].map(b => (
              <div key={b.title} className="rounded-xl border p-4 bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                <div className="text-2xl mb-2" aria-hidden>{b.icon}</div>
                <div className="text-sm font-bold mb-1">{b.title}</div>
                <div className="text-xs text-[var(--text-sec)]">{b.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Community submission */}
        <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <p className="text-sm text-[var(--text)]">
            Have a custom roster to share? Drop it in{' '}
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium hover:underline" style={{ color: 'var(--accent)' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              our Discord
            </a>{' '}
            and we&apos;ll feature it here.
          </p>
        </div>
      </div>
    </div>
  );
}
