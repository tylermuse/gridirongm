'use client';

/**
 * /live — "Upload your Football GM league, watch it play in 3D."
 *
 * Upload (or use the real 2026 NFL rosters) → pick away @ home → kick off
 * straight into the 3D game. The league is loaded in memory only and the game
 * is an exhibition, so the player's saved franchise is never touched (see
 * src/lib/engine/exhibition.ts). From the Game Over card players can run it
 * back, pick a new matchup (back here, league still loaded), or start a full
 * season with the same file.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@bs/core/analytics/track';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/lib/engine/store';
import { useExhibition, startExhibition, rematchExhibition } from '@/lib/engine/exhibition';
import { readUploadedLeagueFile, loadLeagueFromUrl, LeagueFileUploadError } from '@/lib/data/leagueImport';

/** Real NFL rosters for visitors without a Football GM file. */
const NFL_ROSTER_URL = '/rosters/FBGM_NFL_Roster_2026_Updated.json';

interface PickerTeam {
  abbr: string;
  city: string;
  name: string;
  color: string;
}

interface LoadedLeague {
  url: string;
  fileName: string | null;
  teams: PickerTeam[];
}

function toPickerTeams(teams: Array<{ abbreviation: string; city: string; name: string; primaryColor: string }>): PickerTeam[] {
  return teams
    .map(t => ({ abbr: t.abbreviation, city: t.city, name: t.name, color: t.primaryColor }))
    .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`));
}

export function LiveExhibition() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exhibition = useExhibition();
  const storeTeams = useGameStore(s => s.teams);

  const [league, setLeague] = useState<LoadedLeague | null>(null);
  const [homeAbbr, setHomeAbbr] = useState('');
  const [awayAbbr, setAwayAbbr] = useState('');
  const [busy, setBusy] = useState<null | 'reading' | 'kickoff'>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Back from a finished exhibition: the league is still in memory.
  useEffect(() => {
    if (!exhibition || league) return;
    if (searchParams.get('rematch') === '1') {
      const id = rematchExhibition();
      if (id) { router.replace(`/game/${id}`); return; }
    }
    const byId = new Map(storeTeams.map(t => [t.id, t]));
    setLeague({ url: exhibition.leagueUrl, fileName: exhibition.fileName, teams: toPickerTeams(storeTeams) });
    setHomeAbbr(byId.get(exhibition.homeTeamId)?.abbreviation ?? '');
    setAwayAbbr(byId.get(exhibition.awayTeamId)?.abbreviation ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibition]);

  function applyLeague(next: LoadedLeague, source: 'upload' | 'nfl') {
    setLeague(next);
    // Default matchup: the first two teams alphabetically; players change it in one tap.
    setAwayAbbr(next.teams[0]?.abbr ?? '');
    setHomeAbbr(next.teams[1]?.abbr ?? '');
    trackEvent('exhibition_league_loaded', { source, teams: next.teams.length });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy('reading');
    setError(null);
    try {
      const result = await readUploadedLeagueFile(file);
      if (result.kind !== 'fbgm') {
        setError('That’s a BS Football save. Upload a league exported from Football GM instead.');
        return;
      }
      applyLeague({ url: result.url, fileName: file.name, teams: toPickerTeams(result.league.teams) }, 'upload');
    } catch (err) {
      setError(err instanceof LeagueFileUploadError ? err.message : 'Could not read that file. Export your league again from Football GM and try once more.');
    } finally {
      setBusy(null);
    }
  }

  async function handleNflRosters() {
    setBusy('reading');
    setError(null);
    try {
      const data = await loadLeagueFromUrl(NFL_ROSTER_URL);
      applyLeague({ url: NFL_ROSTER_URL, fileName: null, teams: toPickerTeams(data.teams) }, 'nfl');
    } catch {
      setError('Could not load the NFL rosters. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function kickoff() {
    if (!league || !homeAbbr || !awayAbbr || homeAbbr === awayAbbr) return;
    setBusy('kickoff');
    setError(null);
    try {
      const id = await startExhibition({ leagueUrl: league.url, homeAbbr, awayAbbr, fileName: league.fileName });
      trackEvent('exhibition_kickoff', { home: homeAbbr, away: awayAbbr, source: league.fileName ? 'upload' : 'nfl' });
      router.push(`/game/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game.');
      setBusy(null);
    }
  }

  const teamByAbbr = useMemo(() => new Map((league?.teams ?? []).map(t => [t.abbr, t])), [league]);
  const home = teamByAbbr.get(homeAbbr);
  const away = teamByAbbr.get(awayAbbr);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="max-w-3xl mx-auto px-4 pt-5 flex items-center justify-between">
        <Link href="/" className="text-base font-black tracking-tight">
          <span className="text-blue-600">BS</span> Football
        </Link>
        <Link href="/" className="text-xs text-[var(--text-sec)] hover:text-[var(--text)]">Full GM game →</Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-16">
        <section className="text-center pt-10 pb-8">
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-[1.05] mb-3">
            Watch your Football GM league play in 3D
          </h1>
          <p className="text-[var(--text-sec)] text-base sm:text-lg max-w-xl mx-auto">
            Upload your league, pick two teams, and watch every snap live. Free, in your browser. Nothing to install.
          </p>
        </section>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!league ? (
          <section className="space-y-4">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); }}
              className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors
                ${dragging ? 'border-blue-500 bg-blue-50' : 'border-[var(--border)] bg-[var(--surface)]'}`}
            >
              <div className="text-4xl mb-3" aria-hidden>🏈</div>
              <p className="font-bold text-lg mb-1">Drop your Football GM league here</p>
              <p className="text-sm text-[var(--text-sec)] mb-5">.json or .json.gz, straight from Football GM</p>
              <Button size="md" busy={busy === 'reading'} onClick={() => inputRef.current?.click()}>
                Upload league file
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".json,.gz,application/json,application/gzip"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void handleFile(f); }}
              />
            </div>

            <ol className="grid sm:grid-cols-3 gap-3 text-sm">
              {[
                ['1', 'Export', 'In Football GM, open Tools → Export League and download the file.'],
                ['2', 'Upload', 'Drop it here. Your teams, players and depth charts come with it.'],
                ['3', 'Watch', 'Pick any two teams and watch the game play out in 3D.'],
              ].map(([n, title, body]) => (
                <li key={n} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="text-xs font-black text-blue-600 mb-1">STEP {n}</div>
                  <div className="font-semibold mb-1">{title}</div>
                  <div className="text-[var(--text-sec)]">{body}</div>
                </li>
              ))}
            </ol>

            <p className="text-center text-sm text-[var(--text-sec)]">
              No Football GM league?{' '}
              <button onClick={handleNflRosters} disabled={!!busy} className="font-semibold text-blue-600 hover:underline disabled:opacity-50">
                Use the real 2026 NFL rosters
              </button>
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <p className="text-xs text-[var(--text-sec)] truncate">
                {league.fileName ? <>✓ <span className="font-medium text-[var(--text)]">{league.fileName}</span></> : '2026 NFL rosters'}
                {' '}· {league.teams.length} teams
              </p>
              <button
                onClick={() => { setLeague(null); setError(null); }}
                className="text-xs text-[var(--text-sec)] hover:text-[var(--text)] shrink-0"
              >
                Change league
              </button>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:gap-5">
              <TeamSelect label="Away" value={awayAbbr} onChange={setAwayAbbr} teams={league.teams} team={away} disabledAbbr={homeAbbr} />
              <div className="pb-3 text-lg font-black text-[var(--text-sec)]">@</div>
              <TeamSelect label="Home" value={homeAbbr} onChange={setHomeAbbr} teams={league.teams} team={home} disabledAbbr={awayAbbr} />
            </div>

            <div className="mt-6 flex flex-col items-center gap-2">
              <Button
                size="lg"
                busy={busy === 'kickoff'}
                disabled={!home || !away || homeAbbr === awayAbbr}
                onClick={kickoff}
                className="w-full sm:w-auto px-10"
              >
                Kick off in 3D
              </Button>
              <p className="text-[11px] text-[var(--text-sec)] text-center">
                You coach the home team. Exhibition only: nothing is saved, and your BS Football league stays as it is.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TeamSelect({
  label, value, onChange, teams, team, disabledAbbr,
}: {
  label: string;
  value: string;
  onChange: (abbr: string) => void;
  teams: PickerTeam[];
  team: PickerTeam | undefined;
  disabledAbbr: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1.5">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 focus-within:border-blue-500">
        <span className="h-6 w-6 shrink-0 rounded-full border border-black/10" style={{ background: team?.color ?? '#cbd5e1' }} aria-hidden />
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm sm:text-base font-semibold outline-none"
        >
          {teams.map(t => (
            <option key={t.abbr} value={t.abbr} disabled={t.abbr === disabledAbbr}>
              {t.city} {t.name}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}
