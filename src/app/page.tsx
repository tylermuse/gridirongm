'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { SpotlightAudioPlayer } from '@/components/game/SpotlightAudioPlayer';

import { useGameStore, computeLuxuryTax } from '@/lib/engine/store';
import { migrateFromLocalStorage, getItem as idbGetItem } from '@bs/core/storage';
import { PlayerModal } from '@/components/game/PlayerModal';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LEAGUE_TEAMS, type TeamTemplate } from '@/lib/data/teams';
import { type ImportedLeagueData, loadLeagueFromUrl, loadNativeSaveIntoApp, BsfNativeSaveImportError } from '@/lib/data/leagueImport';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { SpectatorBanner, useIsSpectator } from '@/components/game/SpectatorBanner';
import { generateTeamSpotlight, COMMENTATORS, type SpotlightContext } from '@/lib/engine/debate';
import { getAiSpotlightState, subscribeAiSpotlight, fetchAiSpotlight, detectNarrativeMoment } from '@/lib/engine/aiSpotlight';
import { ALL_ACHIEVEMENTS } from '@/lib/engine/achievements';
import { DebateBubble } from '@/components/game/DebateBubble';
import { formatRecord } from '@/types';
import { ProgressRing } from '@/components/shared/ProgressRing';
import { AdSlot } from '@/components/AdSlot';

function TeamPicker() {
  const { newLeague } = useGameStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importedTeams, setImportedTeams] = useState<ImportedLeagueData | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [savedGame, setSavedGame] = useState<{ teamAbbr: string; season: number; wins: number; losses: number; phase: string } | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [startMode, setStartMode] = useState<'offseason' | 'regular'>(
    searchParams.get('startMode') === 'regular' ? 'regular' : 'offseason'
  );
  const [bsModePreselect, setBsModePreselect] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const autoLoadedRef = useRef(false);

  // Auto-load roster from ?roster= query param (e.g. from /rosters page)
  useEffect(() => {
    if (autoLoadedRef.current) return;
    const rosterParam = searchParams.get('roster');
    if (!rosterParam) return;
    autoLoadedRef.current = true;
    const url = rosterParam.startsWith('/') ? `${window.location.origin}${rosterParam}` : rosterParam;
    setImportUrl(url);
    setShowImport(true);
    setImportLoading(true);
    loadLeagueFromUrl(url)
      .then((data) => {
        setImportedTeams(data);
        setActiveUrl(url);
      })
      .catch(async (err) => {
        if (err instanceof BsfNativeSaveImportError && err.nativeSave !== undefined) {
          const routed = await routeNativeSave(err.nativeSave);
          if (routed) return; // reloading into the loaded save
        }
        setError(err instanceof BsfNativeSaveImportError ? err.message : 'Failed to load roster file.');
      })
      .finally(() => setImportLoading(false));
  }, [searchParams]);

  const [migrated, setMigrated] = useState(false);

  // After a native-save URL import reloads the page (§1.3), surface the one-time
  // notice explaining that the link was a saved game (now loaded), not a roster.
  useEffect(() => {
    let msg: string | null = null;
    try {
      msg = sessionStorage.getItem('gg-import-notice');
      if (msg) sessionStorage.removeItem('gg-import-notice');
    } catch { /* sessionStorage unavailable */ }
    if (!msg) return;
    setImportNotice(msg);
    const t = setTimeout(() => setImportNotice(null), 9000);
    return () => clearTimeout(t);
  }, []);

  // Migrate localStorage → IndexedDB on first load, then check for autosave
  useEffect(() => {
    async function checkSave() {
      try {
        // Run migration first (no-ops if already done)
        const didMigrate = await migrateFromLocalStorage();
        if (didMigrate) setMigrated(true);

        const raw = await idbGetItem('gridiron-gm-autosave');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const state = parsed.state ?? parsed;
        if (state.userTeamId && state.teams?.length > 0) {
          const team = state.teams.find((t: { id: string; abbreviation: string }) => t.id === state.userTeamId);
          const userRecord = state.teams.find((t: { id: string; record: { wins: number; losses: number } }) => t.id === state.userTeamId)?.record;
          const PHASE_LABELS: Record<string, string> = {
            preseason: 'Preseason', regular: 'Regular Season', playoffs: 'Playoffs',
            resigning: 'Re-signing', draft: 'Draft', freeAgency: 'Free Agency', offseason: 'Offseason',
          };
          setSavedGame({
            teamAbbr: team?.abbreviation ?? '???',
            season: state.season ?? 1,
            wins: userRecord?.wins ?? 0,
            losses: userRecord?.losses ?? 0,
            phase: PHASE_LABELS[state.phase] ?? state.phase ?? 'Unknown',
          });
        }
      } catch {
        // Ignore parse errors
      }
    }
    checkSave();
  }, []);

  function handleResume() {
    setResumeLoading(true);
    // The store auto-hydrates from localStorage via persist middleware.
    // We just need to set initialized = true.
    useGameStore.setState({ initialized: true });
  }

  async function handlePick(abbr: string, spectator: boolean = false) {
    // Auto-save current league to next available slot before starting new one
    if (savedGame) {
      const { saveToSlot } = useGameStore.getState();
      // Find an empty slot (1-5), or use slot 5 as overflow
      let savedToSlot = 0;
      for (let slot = 1; slot <= 5; slot++) {
        try {
          const existing = await idbGetItem(`gridiron-gm-save-${slot}`);
          if (!existing) {
            await saveToSlot(slot);
            savedToSlot = slot;
            break;
          }
        } catch { /* skip */ }
      }
      if (savedToSlot === 0) {
        // All slots full — ask user
        if (!window.confirm(`All 5 save slots are full. Your current league (${savedGame.teamAbbr}, Season ${savedGame.season}, ${formatRecord({ wins: savedGame.wins, losses: savedGame.losses })}) will be overwritten. Use Save/Load to free a slot first, or continue to overwrite.`)) {
          return;
        }
      } else {
        // Saved successfully — brief notification would be nice but just proceed
      }
    }
    setLoading(true);
    setError(null);
    try {
      await newLeague(abbr, activeUrl ?? undefined, activeUrl ? startMode : undefined, spectator);
      // Enable BS Mode if preselected from the banner
      if (bsModePreselect) {
        useGameStore.getState().updateLeagueSettings({ bsMode: true });
      }
      // Clear ?roster= from the URL so HomeContent stops forcing TeamPicker.
      // Without this, users who arrived via /rosters "Play in BS Football"
      // would stay stuck on the picker even after initializing a new league.
      if (searchParams.get('roster') !== null) {
        router.replace('/');
      }
      // Store is now initialized — Dashboard renders automatically on this page
    } catch {
      setError('Failed to start league. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // When a URL import turns out to be a BS Football native save (someone pasting
  // a community *save* link rather than a roster — e.g. somedude4759's FSL-2
  // file), don't dead-end on the typed error. Load it the same way Save/Load
  // does, stash a one-time notice, and reload so it rehydrates. (§1.3)
  async function routeNativeSave(nativeSave: unknown): Promise<boolean> {
    try {
      const meta = await loadNativeSaveIntoApp(nativeSave);
      const where = meta.season
        ? ` (Season ${meta.season}${meta.teamAbbr ? `, ${meta.teamAbbr}` : ''})`
        : '';
      try {
        sessionStorage.setItem(
          'gg-import-notice',
          `Loaded as a BS Football save${where} — that link was a saved game, not a roster. Hit Resume to jump back in.`,
        );
      } catch { /* sessionStorage unavailable — proceed without the notice */ }
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setError(null);
    try {
      const data = await loadLeagueFromUrl(importUrl.trim());
      setImportedTeams(data);
      setActiveUrl(importUrl.trim());
    } catch (err) {
      if (err instanceof BsfNativeSaveImportError && err.nativeSave !== undefined) {
        const routed = await routeNativeSave(err.nativeSave);
        if (routed) return; // reloading into the loaded save
      }
      setError(err instanceof BsfNativeSaveImportError ? err.message : 'Failed to load league file. Check the URL and try again.');
    } finally {
      setImportLoading(false);
    }
  }

  function handleClearImport() {
    setImportedTeams(null);
    setActiveUrl(null);
    setImportUrl('');
  }

  // Use imported teams if available, otherwise default fictional teams
  const displayTeams: { city: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string; logoUrl?: string }[] = importedTeams
    ? importedTeams.teams.map(t => ({ city: t.city, name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor ?? '#FFFFFF', logoUrl: t.logoUrl }))
    : LEAGUE_TEAMS;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-3">
          <span className="text-blue-600">BS</span> Football
        </h1>
        <p className="text-[var(--text-sec)] text-sm sm:text-lg">Choose your franchise. Build your dynasty.</p>
      </div>

      {/* Native-save URL-import notice (§1.3) */}
      {importNotice && (
        <div className="mb-6 max-w-2xl w-full rounded-xl border border-blue-400/40 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 flex items-start gap-3">
          <span className="text-lg leading-none">💾</span>
          <p className="flex-1 text-sm text-blue-900 dark:text-blue-200">{importNotice}</p>
          <button
            onClick={() => setImportNotice(null)}
            className="text-blue-700/60 dark:text-blue-300/60 hover:text-blue-900 dark:hover:text-blue-100 text-sm shrink-0"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* BS Mode Banner */}
      {(
        <button
          onClick={() => {
            setBsModePreselect(true);
            // Auto-load the NFL roster for the best BS Mode experience
            if (!importedTeams) {
              setImportUrl('/rosters/FBGM_NFL_Roster_2026_Updated.json');
              setShowImport(true);
              setImportLoading(true);
              loadLeagueFromUrl(`${window.location.origin}/rosters/FBGM_NFL_Roster_2026_Updated.json?v=12`)
                .then((data) => { setImportedTeams(data); setActiveUrl(`/rosters/FBGM_NFL_Roster_2026_Updated.json?v=12`); })
                .catch(() => {})
                .finally(() => setImportLoading(false));
            }
          }}
          className={`mb-6 max-w-2xl w-full rounded-2xl overflow-hidden transition-all hover:scale-[1.02] hover:shadow-xl ${
            bsModePreselect ? 'ring-2 ring-amber-400 shadow-amber-400/20 shadow-lg' : ''
          }`}
        >
          <div className="relative bg-gradient-to-r from-gray-950 via-gray-900 to-teal-950 p-6 sm:p-8 text-left">
            <div className="absolute inset-0 opacity-55" style={{ backgroundImage: 'url(/images/bs-mode-banner.jpg)', backgroundSize: 'cover', backgroundPosition: 'right center' }} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-400 text-xs font-bold uppercase tracking-widest bg-amber-400/10 px-2 py-0.5 rounded">New Mode</span>
              </div>
              <h3 className="text-white text-xl sm:text-2xl font-black mb-1">
                Play Bill Simmons&apos; Ideal NFL
              </h3>
              <p className="text-gray-400 text-sm sm:text-base mb-3">
                Draft Lottery. Ewing Theory. QB Tier Pyramid. Irrational Confidence Guys. The way football <em>should</em> be.
              </p>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                bsModePreselect
                  ? 'bg-amber-500 text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}>
                {bsModePreselect ? '✓ BS Mode Active — Pick Your Team Below' : 'Launch in BS Mode →'}
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Migration toast */}
      {migrated && (
        <div className="mb-4 max-w-md w-full">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 text-sm">
            <span>Save data migrated to new storage system</span>
            <button onClick={() => setMigrated(false)} className="ml-auto text-green-600 hover:text-green-800 font-bold">&times;</button>
          </div>
        </div>
      )}

      {/* Resume saved game */}
      {savedGame && (
        <div className="mb-6 max-w-md w-full">
          <button
            onClick={handleResume}
            disabled={resumeLoading}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-blue-500 bg-blue-500/5
                       hover:bg-blue-500/10 hover:shadow-lg hover:shadow-blue-500/10 transition-all group"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-black shrink-0">
                {savedGame.teamAbbr.slice(0, 2)}
              </div>
              <div>
                <div className="text-sm font-bold text-blue-600">Continue League</div>
                <div className="text-xs text-[var(--text-sec)]">
                  {savedGame.teamAbbr} · Season {savedGame.season} · {savedGame.wins}-{savedGame.losses} · {savedGame.phase}
                </div>
              </div>
            </div>
            <div className="text-blue-600 text-xl group-hover:translate-x-1 transition-transform">→</div>
          </button>
          <div className="text-center mt-2">
            <span className="text-xs text-[var(--text-sec)]">or start a new league below</span>
          </div>
        </div>
      )}

      {/* Import League File Section */}
      <div className="mb-6 max-w-4xl w-full">
        <button
          onClick={() => setShowImport(!showImport)}
          className="flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-blue-600 transition-colors mx-auto"
        >
          <svg className={`w-3 h-3 transition-transform ${showImport ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Import League File
        </button>
        {showImport && (
          <div className="mt-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] max-w-xl mx-auto">
            <p className="text-xs text-[var(--text-sec)] mb-3">
              Paste a URL to a league file (JSON format) to use custom teams, players, and draft prospects.
            </p>
            <div className="flex gap-2">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/league-file.json"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              />
              <Button size="sm" onClick={handleImport} disabled={importLoading || !importUrl.trim()}>
                {importLoading ? 'Loading...' : 'Load'}
              </Button>
            </div>
            {importedTeams && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-green-600 font-medium">
                  ✓ Loaded {importedTeams.teams.length} teams, {importedTeams.players.length} players
                </span>
                <button onClick={handleClearImport} className="text-xs text-[var(--text-sec)] hover:text-red-500">
                  Clear & Use Default
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-[var(--text-sec)]">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading league data...
        </div>
      ) : (
        <>
        {/* Start Mode toggle — only relevant when importing real-roster league */}
        {activeUrl && (
          <div className="w-full max-w-md mb-4 flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--text-sec)] mr-2">Start in:</span>
            <button
              onClick={() => setStartMode('offseason')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                startMode === 'offseason'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:border-blue-400'
              }`}
            >
              Offseason
              <div className="text-[10px] font-normal opacity-80">Re-sign → Draft → FA</div>
            </button>
            <button
              onClick={() => setStartMode('regular')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                startMode === 'regular'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:border-blue-400'
              }`}
            >
              Regular Season
              <div className="text-[10px] font-normal opacity-80">Skip to Week 1</div>
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Search teams..."
          value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          className="w-full max-w-md mb-4 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm"
        />
        {/* Spectator card — observe-only league with no user team. */}
        <button
          onClick={() => {
            const firstAbbr = ([...displayTeams].sort((a, b) => a.city.localeCompare(b.city))[0])?.abbreviation;
            if (firstAbbr) handlePick(firstAbbr, true);
          }}
          className="w-full max-w-4xl mb-3 group flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)]
                     hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-2xl shrink-0">
            👁️
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Spectator (no team)</div>
            <div className="text-xs text-[var(--text-sec)]">Watch all 32 AI-controlled teams play out the season. No managing.</div>
          </div>
          <div className="text-blue-600 text-xl group-hover:translate-x-1 transition-transform shrink-0">→</div>
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-4xl">
          {[...displayTeams]
            .filter(t =>
              !teamSearch ||
              t.city.toLowerCase().includes(teamSearch.toLowerCase()) ||
              t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
              t.abbreviation.toLowerCase().includes(teamSearch.toLowerCase())
            )
            .sort((a, b) => a.city.localeCompare(b.city)).map(team => (
            <button
              key={team.abbreviation}
              onClick={() => handlePick(team.abbreviation)}
              className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                         hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all text-left"
            >
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="lg" />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{team.city}</div>
                <div className="text-xs text-[var(--text-sec)] truncate">{team.name}</div>
              </div>
            </button>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

/* ─── Team Spotlight Section ─── */

function TeamSpotlightSection({
  team, roster, allTeams, allPlayers, season, week, ctx, onPlayerClick,
}: {
  team: import('@/types').Team;
  roster: import('@/types').Player[];
  allTeams: import('@/types').Team[];
  allPlayers: import('@/types').Player[];
  season: number;
  week: number;
  ctx?: SpotlightContext;
  onPlayerClick: (id: string) => void;
}) {
  const { leagueSettings, newsItems, draftResults, playoffBracket, playoffSeeds, champions, players: allPlayersFromStore } = useGameStore();
  const aiCommentary = leagueSettings?.aiCommentary ?? false;

  // Filter news to this season's re-injury items so the spotlight can surface
  // front-office blowback without pulling in the full feed each render.
  const recentReInjuryNews = React.useMemo(
    () => newsItems.filter(n =>
      n.type === 'injury' &&
      n.season === season &&
      n.teamId === team.id &&
      n.headline.includes('re-injured playing through')
    ).slice(-5),
    [newsItems, season, team.id],
  );

  const templateTopics = React.useMemo(
    () => generateTeamSpotlight(team, roster, allTeams, allPlayers, season, week, { ...(ctx ?? {}), newsItems: recentReInjuryNews }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, roster, allTeams, allPlayers, season, week, ctx?.phase, ctx?.faDay, ctx?.draftResults?.length, ctx?.playoffBracket, ctx?.playoffBracket?.filter(m => m.winnerId).length, recentReInjuryNews.length],
  );

  // Subscribe to shared AI spotlight cache (pre-fetched by SpotlightPopup)
  const [aiState, setAiState] = useState(getAiSpotlightState);
  React.useEffect(() => {
    return subscribeAiSpotlight(() => setAiState(getAiSpotlightState()));
  }, []);

  // Detect current narrative moment
  const currentNarrative = React.useMemo(() => {
    const phase = ctx?.phase ?? 'regular';
    const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
    return detectNarrativeMoment(phase, week, tradeDeadlineWeek, playoffBracket, team.id, playoffSeeds);
  }, [ctx?.phase, week, leagueSettings?.tradeDeadlineWeek, playoffBracket, team.id]);

  // 5/22 stale-opponent fix (Marcus Cole / Tony Blaze hallucinating PHI when
  // next opponent was actually NE). Compute three pieces of bracket state
  // here at the render site — this is the only layer that knows whether the
  // bracket transition has stabilized for the user's team:
  //   nextOpponentId : the team the user plays next (or null when eliminated
  //                    / champion / no next matchup yet committed)
  //   playoffsEliminated : user lost a playoff game
  //   playoffsBracketReady : safe to render spotlight — either user is out
  //                          of the tournament (eliminated / SB done) or the
  //                          next matchup has both teams populated. Mid-
  //                          transition (user won round N but round N+1
  //                          matchup not yet populated) returns false so
  //                          we render a placeholder rather than fire a
  //                          fetch with stale prompt context.
  const playoffsState = React.useMemo(() => {
    if ((ctx?.phase ?? 'regular') !== 'playoffs' || !playoffBracket) {
      return { nextOpponentId: null as string | null, eliminated: false, bracketReady: true, championshipDone: false };
    }
    const userGames = playoffBracket.filter(m =>
      m.winnerId && (m.homeTeamId === team.id || m.awayTeamId === team.id));
    const eliminated = userGames.some(m => m.winnerId && m.winnerId !== team.id);
    const championship = playoffBracket.find(m => m.id === 'championship');
    const championshipDone = !!championship?.winnerId;
    const nextGame = playoffBracket.find(m =>
      !m.winnerId &&
      m.homeTeamId && m.awayTeamId &&
      (m.homeTeamId === team.id || m.awayTeamId === team.id));
    const nextOpponentId = nextGame
      ? (nextGame.homeTeamId === team.id ? nextGame.awayTeamId! : nextGame.homeTeamId!)
      : null;
    // Bracket is "ready" to spotlight when there's no further matchup to
    // wait on (user is out / SB done) OR the next matchup is fully
    // populated. The unstable window is: user won round N, round N+1 row
    // exists in the bracket but home/away aren't filled in yet.
    const bracketReady = eliminated || championshipDone || nextOpponentId !== null;
    return { nextOpponentId, eliminated, bracketReady, championshipDone };
  }, [ctx?.phase, playoffBracket, team.id]);

  // If AI is enabled and this is a special narrative moment, trigger AI fetch.
  // Regular weeks use templates only. fetchAiSpotlight handles cache key comparison internally.
  // During playoffs, skip the fetch entirely while the bracket transition is
  // still unstable — otherwise the prompt would reach the AI with stale
  // round-1 opponent data and no next-matchup data, and the AI would
  // confidently name the just-defeated opponent (5/22 bug).
  React.useEffect(() => {
    if (!aiCommentary || currentNarrative === 'weekly') return;
    const phase = ctx?.phase ?? 'regular';
    if (phase === 'playoffs' && !playoffsState.bracketReady) return;
    fetchAiSpotlight({
      team, roster, allTeams, allPlayers, season, week, phase, narrative: currentNarrative,
      newsItems, draftResults, playoffBracket, playoffSeeds, champions,
      tradeDeadlineWeek: leagueSettings?.tradeDeadlineWeek ?? 12,
      nextOpponentId: phase === 'playoffs'
        ? (playoffsState.eliminated || playoffsState.championshipDone
            ? null
            : playoffsState.nextOpponentId)
        : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiCommentary, currentNarrative, team, season, week, ctx?.phase, playoffsState.bracketReady, playoffsState.nextOpponentId]);

  // Always show templates immediately. If AI topics arrive, they replace templates.
  // Never show a loading spinner — templates are the instant fallback.
  const hasAiTopics = aiState.topics && aiState.topics.length > 0;
  const aiLoading = false; // never block rendering
  const topics = hasAiTopics ? aiState.topics! : templateTopics;

  // Delay podcast button 8s so AI has a chance to replace templates first
  const [podcastReady, setPodcastReady] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setPodcastReady(true), aiCommentary ? 8000 : 0);
    return () => clearTimeout(timer);
  }, [aiCommentary]);

  // Accordion state — first topic expanded by default
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set([0]));
  const toggleTopic = (idx: number) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // During the playoff bracket-transition window (user won round N, round
  // N+1 matchup not yet populated), suppress the AI-generated spotlight to
  // prevent the 5/22 stale-opponent regression. AI topics generated for the
  // prior round still live in cache.topics until cache key advances; render
  // a transition placeholder instead.
  const phase = ctx?.phase ?? 'regular';
  if (phase === 'playoffs' && !playoffsState.bracketReady) {
    return (
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2"><span>🏆</span> Playoff Spotlight</span>
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4">
            <p className="text-sm text-[var(--text-sec)]">
              Awaiting next-round matchup. Spotlight will update once the bracket advances.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // During playoffs (or other non-regular phases), show a fallback instead of unmounting
  if (topics.length === 0 && !aiLoading) {
    if (phase === 'playoffs') {
      return (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2"><span>🏆</span> Playoff Spotlight</span>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4">
              <p className="text-sm text-[var(--text-sec)]">
                The playoffs are underway! Spotlight updates will appear as matchups are decided.
              </p>
            </div>
          </Card>
        </div>
      );
    }
    return null;
  }

  if (aiLoading) {
    return (
      <div className="mt-6">
        <Card>
          <div className="px-4 py-8 text-center">
            <div className="text-2xl mb-2 animate-pulse">🎬</div>
            <p className="text-sm text-[var(--text-sec)]">Generating Team Spotlight...</p>
          </div>
        </Card>
      </div>
    );
  }

  const getTopicBadge = (headline: string): { label: string; color: string } | null => {
    if (headline.includes('Trade')) return { label: 'Trade', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (headline.includes('Draft')) return { label: 'Draft', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (headline.includes('Playoff')) return { label: 'Playoffs', color: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (headline.includes('QB')) return { label: 'QB Watch', color: 'bg-red-100 text-red-700 border-red-200' };
    if (headline.includes('Free Agenc') || headline.includes('Free Agent')) return { label: 'Free Agency', color: 'bg-green-100 text-green-700 border-green-200' };
    if (headline.includes('Cap')) return { label: 'Cap', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    if (headline.includes('Overview') || headline.includes('State of')) return { label: 'Overview', color: 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]' };
    return null;
  };

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>
                <span className="flex items-center gap-2"><span>🎬</span> Team Spotlight</span>
              </CardTitle>
              <p className="text-xs text-[var(--text-sec)] mt-0.5">
                with {COMMENTATORS.stats.name} {COMMENTATORS.stats.avatar} & {COMMENTATORS.hottake.name} {COMMENTATORS.hottake.avatar}
                {aiCommentary && aiState.topics && (
                  <span className="ml-2 text-purple-500 font-medium">AI</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 pt-0.5">
              {topics.length > 1 && (
                <button
                  onClick={() => {
                    if (expandedTopics.size === topics.length) setExpandedTopics(new Set([0]));
                    else setExpandedTopics(new Set(topics.map((_, i) => i)));
                  }}
                  className="text-xs text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                >
                  {expandedTopics.size === topics.length ? 'Collapse All' : 'Expand All'}
                </button>
              )}
              {topics.length > 0 && podcastReady && (
                <SpotlightAudioPlayer
                  topics={topics}
                  teamName={`${team.city} ${team.name}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="space-y-2">
            {topics.map((topic, topicIdx) => {
              const isExpanded = expandedTopics.has(topicIdx);
              const badge = getTopicBadge(topic.headline);
              return (
                <div key={topicIdx} className="border border-[var(--border)] rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleTopic(topicIdx)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <span className="text-base shrink-0">{topic.icon}</span>
                    {badge && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    <h4 className="text-sm font-bold flex-1 truncate">{topic.headline}</h4>
                    <svg
                      className={`w-4 h-4 shrink-0 text-[var(--text-sec)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2.5">
                      {topic.exchanges.map((exchange, exIdx) => (
                        <DebateBubble
                          key={exIdx}
                          exchange={exchange}
                          onPlayerClick={onPlayerClick}
                          playerIds={topic.playerIds}
                          players={allPlayers}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function DraftCapitalCard({ team, season, phase, teams }: { team: { draftPicks: { id: string; year: number; round: number; originalTeamId: string; ownerTeamId: string; playerId?: string }[] }; season: number; phase: string; teams: { id: string; abbreviation: string }[] }) {
  const [showFuture, setShowFuture] = useState(false);
  const nextDraftYear = phase === 'draft' ? season : season + 1;
  const currentPicks = team.draftPicks
    .filter(pk => pk.year === nextDraftYear && !pk.playerId)
    .sort((a, b) => a.round - b.round);
  const futurePicks = team.draftPicks
    .filter(pk => pk.year > nextDraftYear && !pk.playerId)
    .sort((a, b) => a.year - b.year || a.round - b.round);

  if (currentPicks.length === 0 && futurePicks.length === 0) return null;

  const pickLabel = (pk: typeof currentPicks[0]) => {
    const orig = teams.find(t => t.id === pk.originalTeamId);
    const isOwn = pk.originalTeamId === pk.ownerTeamId;
    return `Rd ${pk.round}${isOwn ? '' : ` (via ${orig?.abbreviation ?? '?'})`}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft Capital</CardTitle>
        <span className="text-xs text-[var(--text-sec)]">{nextDraftYear} Draft</span>
      </CardHeader>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {currentPicks.map(pk => (
          <span key={pk.id} className="px-2 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
            {pickLabel(pk)}
          </span>
        ))}
        {currentPicks.length === 0 && <span className="text-xs text-[var(--text-sec)]">No picks in {nextDraftYear}</span>}
      </div>
      {futurePicks.length > 0 && (
        <>
          <button
            onClick={() => setShowFuture(!showFuture)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showFuture ? 'Hide future picks' : `View all (${futurePicks.length} future picks)`}
          </button>
          {showFuture && (
            <div className="mt-2 space-y-1.5">
              {Array.from(new Set(futurePicks.map(pk => pk.year))).map(year => (
                <div key={year}>
                  <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">{year}</div>
                  <div className="flex flex-wrap gap-1">
                    {futurePicks.filter(pk => pk.year === year).map(pk => (
                      <span key={pk.id} className="px-2 py-0.5 text-[10px] font-medium rounded bg-[var(--surface-2)] text-[var(--text-sec)]">
                        {pickLabel(pk)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Dashboard() {
  const { teams, userTeamId, players, schedule, week, season, phase, playoffBracket, playoffSeeds, champions, finalsMvpPlayerId, draftResults, freeAgents, faDay, newsItems, achievements, leagueSettings, firedState } = useGameStore();
  const isSpectator = useIsSpectator();
  const { isFoundingMember } = useSubscription();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const userTeam = teams.find(t => t.id === userTeamId)!;
  const roster = players.filter(p => p.teamId === userTeamId);

  if (firedState?.fired) {
    // Find teams that might hire a new GM — teams with losing records or that also fired their GM
    const hiringTeams = teams
      .filter(t => t.id !== userTeamId) // not your old team
      .filter(t => {
        const record = t.record;
        const wins = record.wins;
        // Teams with bad records or middling teams looking for a change
        return wins <= 7 || Math.random() < 0.15; // ~15% of good teams also have openings
      })
      .sort(() => Math.random() - 0.5) // randomize
      .slice(0, 5); // show up to 5 options

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 overflow-y-auto py-8">
        <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 text-center space-y-6">
          <div className="text-6xl">🔥</div>
          <h1 className="text-3xl font-black text-red-600">You&apos;ve Been Fired</h1>
          <p className="text-[var(--text-sec)]">{firedState.reason}</p>
          <p className="text-sm text-[var(--text-sec)]">Season {firedState.season} · {teams.find(t => t.id === userTeamId)?.city} {teams.find(t => t.id === userTeamId)?.name}</p>

          <div className="border-t border-[var(--border)] pt-4 space-y-4">
            <p className="text-sm font-bold">What do you want to do?</p>

            {/* Option 1: Start fresh */}
            <Button className="w-full" onClick={() => useGameStore.setState({ initialized: false, firedState: null })}>
              Start a New League from 2026
            </Button>

            {/* Option 2: Get hired by another team */}
            {hiringTeams.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-sec)] uppercase tracking-wider font-bold">Teams interested in hiring you</p>
                {hiringTeams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      // Switch user team to this one, reset approval
                      const store = useGameStore.getState();
                      useGameStore.setState({
                        firedState: null,
                        userTeamId: t.id,
                        teams: store.teams.map(team =>
                          team.id === t.id
                            ? { ...team, approval: { fanApproval: 50, ownerApproval: 50, objectives: team.approval?.objectives ?? [], tenureSeasons: 0, warningIssued: false } }
                            : team,
                        ),
                        newsItems: [...store.newsItems, {
                          id: crypto.randomUUID(),
                          season: store.season + 1,
                          week: 0,
                          type: 'system' as const,
                          headline: `${t.city} ${t.name} hire new GM`,
                          body: `The ${t.name} have hired a new General Manager to lead the franchise into the ${store.season + 1} season.`,
                          isUserTeam: true,
                        }],
                      });
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  >
                    <div>
                      <div className="font-bold text-sm">{t.city} {t.name}</div>
                      <div className="text-xs text-[var(--text-sec)]">{t.record.wins}-{t.record.losses} · {t.conference} {t.division}</div>
                    </div>
                    <span className="text-xs text-blue-600 font-medium">Accept Job →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Listen for spotlight scroll requests (from SpotlightPopup in GameShell or ?spotlight=1 query)
  useEffect(() => {
    function scrollToSpotlight() {
      spotlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.addEventListener('scroll-to-spotlight', scrollToSpotlight);

    // Check for ?spotlight=1 query param (navigated from another page)
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotlight') === '1') {
      setTimeout(scrollToSpotlight, 300); // small delay to let page render
      // Clean up the URL
      window.history.replaceState({}, '', '/');
    }

    return () => window.removeEventListener('scroll-to-spotlight', scrollToSpotlight);
  }, []);

  // Conference standings sorted by win pct, then wins
  const conferenceTeams = teams
    .filter(t => t.conference === userTeam.conference)
    .sort((a, b) => {
      const aGp = a.record.wins + a.record.losses;
      const bGp = b.record.wins + b.record.losses;
      const aWp = aGp > 0 ? a.record.wins / aGp : 0;
      const bWp = bGp > 0 ? b.record.wins / bGp : 0;
      if (bWp !== aWp) return bWp - aWp;
      return b.record.wins - a.record.wins;
    });

  // Find the leader (first team)
  const leader = conferenceTeams[0];
  const leaderGp = leader ? leader.record.wins + leader.record.losses : 0;
  const leaderWp = leaderGp > 0 ? leader.record.wins / leaderGp : 0;

  function getGB(t: typeof leader) {
    if (!leader || t.id === leader.id) return '-';
    const gp = t.record.wins + t.record.losses;
    const gb = ((leader.record.wins - t.record.wins) + (t.record.losses - leader.record.losses)) / 2;
    return gb === 0 ? '-' : gb.toFixed(1).replace(/\.0$/, '');
  }

  const capPct = userTeam.totalPayroll / userTeam.salaryCap;

  function teamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Compute revenue/profit for finances card
  // Revenue model: ~$600M avg revenue, ~$255M cap. Our cap is $300M, so scale accordingly.
  // Revenue sources: national TV (~$350M shared equally), local revenue (~$100-200M),
  // game-day revenue (~$50-80M), merchandise/sponsorships (~$30-50M)
  const gamesPlayed = userTeam.record.wins + userTeam.record.losses;
  const seasonsPlayed = champions.length;
  const nationalTV = 330 + seasonsPlayed * 8; // National TV deal, grows with new contracts
  const localRevenue = 80 + userTeam.record.wins * 3; // Winning drives local ratings/attendance
  const gameDayRevenue = gamesPlayed * (3.5 + userTeam.record.wins * 0.15); // Tickets, concessions, parking
  const merchAndSponsors = 40 + userTeam.record.wins * 1.5; // Merch, naming rights, sponsors
  const totalRevenue = Math.round((nationalTV + localRevenue + gameDayRevenue + merchAndSponsors) * 10) / 10;
  const playerPayroll = Math.round(userTeam.totalPayroll * 10) / 10;
  const coachingPayroll = Math.round((userTeam.coaches ?? []).reduce((s, c) => s + (c.salary ?? 0), 0) * 10) / 10;
  const coachingDeadCap = Math.round((userTeam.deadCap ?? []).filter(d => d.isCoaching).reduce((s, d) => s + d.amount, 0) * 10) / 10;
  const luxuryTax = computeLuxuryTax(userTeam.totalPayroll, userTeam.salaryCap);
  const expenses = Math.round((playerPayroll + coachingPayroll + coachingDeadCap + luxuryTax) * 10) / 10;
  const profit = Math.round((totalRevenue - expenses) * 10) / 10;

  // Recent news (latest 5 items)
  const recentNews = [...newsItems]
    .sort((a, b) => {
      if (b.season !== a.season) return b.season - a.season;
      return b.week - a.week;
    })
    .slice(0, 5);

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto space-y-4">
        <SpectatorBanner />
        {isSpectator ? (
          // Neutral League Overview header for spectator leagues — the user
          // doesn't own a team, so the team-color banner reads as ownership
          // even when actions are gated. Keep it generic.
          <div className="rounded-xl px-4 sm:px-5 py-4 border border-[var(--border)] bg-[var(--surface)]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-2xl shrink-0">👁️</div>
              <div className="min-w-0">
                <div className="text-lg font-black">League Overview</div>
                <div className="text-xs text-[var(--text-sec)]">
                  Season {season} · Week {week} · Spectator mode — observing all 32 AI teams
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Team header */
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl px-4 sm:px-5 py-4"
            style={{ background: `linear-gradient(135deg, var(--team-primary) 0%, ${userTeam.secondaryColor} 100%)` }}
          >
            <div className="flex items-center gap-3 sm:block shrink-0">
              <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} logoUrl={userTeam.logoUrl} size="xl" />
              {/* On mobile, show team name next to logo */}
              <div className="sm:hidden min-w-0">
                <h2 className="text-xl font-black leading-tight" style={{ color: 'var(--team-text-on-primary)' }}>{userTeam.city}</h2>
                <h2 className="text-xl font-black leading-tight" style={{ color: 'var(--team-text-on-primary)' }}>{userTeam.name}</h2>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="hidden sm:block text-2xl font-black" style={{ color: 'var(--team-text-on-primary)' }}>{userTeam.city} {userTeam.name}</h2>
              <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
                <Badge variant={userTeam.record.wins > userTeam.record.losses ? 'green' : userTeam.record.wins < userTeam.record.losses ? 'red' : 'default'} size="md">
                  {formatRecord(userTeam.record)}
                </Badge>
                <span className="text-xs sm:text-sm whitespace-nowrap" style={{ color: 'var(--team-text-on-primary)', opacity: 0.85 }}>
                  {userTeam.conference} {userTeam.division}
                </span>
                <span className="text-xs sm:text-sm whitespace-nowrap" style={{ color: capPct > 0.95 ? '#fecaca' : 'var(--team-text-on-primary)', opacity: capPct > 0.95 ? 1 : 0.85 }}>
                  ${Math.round(userTeam.totalPayroll)}M / ${userTeam.salaryCap}M
                </span>
                {champions.length > 0 && champions.filter(c => c.teamId === userTeamId).length > 0 && (
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap" style={{ color: 'var(--team-text-on-primary)' }}>
                    {champions.filter(c => c.teamId === userTeamId).length}× 🏆
                  </span>
                )}
                {isFoundingMember && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-100 border border-amber-400/30 whitespace-nowrap">
                    ⭐ Founder
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discord Banner */}
        <DiscordBanner />

        {/* Free-tier ad slot. Hidden for Premium / Founder / Admin users. */}
        <AdSlot size="leaderboard" slotId="home-top" />

        {/* Approval & Objectives — hidden in spectator mode (no user team to evaluate) */}
        {!isSpectator && userTeam.approval && (
          <Card>
            <div className="flex items-center gap-6 flex-wrap">
              {/* Approval gauges */}
              <div className="flex items-center gap-4">
                <ProgressRing value={userTeam.approval.fanApproval} label="Fan Pulse" />
                <ProgressRing value={userTeam.approval.ownerApproval} label="Owner" />
                {userTeam.approval.warningIssued && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded animate-pulse">🔥 Hot Seat</span>
                )}
              </div>
              {/* Objectives + (optionally) season outcome. The outcome replaces
                  the objectives slot when the season is over, since season-
                  specific objectives become noise at that point and the user
                  wants a clear "what just happened" signal next to the gauges. */}
              {(() => {
                const userMatchups = (playoffBracket ?? [])
                  .filter(m => m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)
                  .sort((a, b) => b.round - a.round);
                const latest = userMatchups[0];
                const isChampion = (champions ?? []).some(c => c.season === season && c.teamId === userTeamId);
                const playoffTeamIds = playoffSeeds ? new Set([...(playoffSeeds.AC ?? []), ...(playoffSeeds.NC ?? [])]) : new Set();
                const madePlayoffs = playoffTeamIds.has(userTeamId);

                const ROUND_LABELS = ['', 'Wild Card', 'Divisional', 'Conference Championship', 'Championship'];
                let headline: string | null = null;
                let subline: string | null = null;
                let tone: 'win' | 'lose' | 'neutral' = 'neutral';

                if (isChampion) {
                  headline = '🏆 Champions!';
                  subline = `You won the ${season} championship.`;
                  tone = 'win';
                } else if (latest && latest.winnerId && latest.winnerId !== userTeamId) {
                  const userIsHome = latest.homeTeamId === userTeamId;
                  const oppId = userIsHome ? latest.awayTeamId : latest.homeTeamId;
                  const opp = teams.find(t => t.id === oppId);
                  const userScore = userIsHome ? latest.homeScore : latest.awayScore;
                  const oppScore = userIsHome ? latest.awayScore : latest.homeScore;
                  headline = `Eliminated — ${ROUND_LABELS[latest.round] ?? `Round ${latest.round}`}`;
                  subline = opp && userScore !== undefined && oppScore !== undefined
                    ? `Lost to ${opp.abbreviation} ${oppScore}–${userScore}. Focus shifts to the offseason.`
                    : 'Season over. Focus shifts to the offseason.';
                  tone = 'lose';
                } else if (phase === 'playoffs' && !madePlayoffs) {
                  headline = 'Missed the Playoffs';
                  subline = `${userTeam.record.wins}-${userTeam.record.losses} wasn't enough this year.`;
                  tone = 'lose';
                }

                if (headline) {
                  const toneClasses = tone === 'win'
                    ? 'bg-green-50 border-green-300 text-green-800'
                    : tone === 'lose'
                    ? 'bg-red-50 border-red-300 text-red-800'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]';
                  return (
                    <div className={`flex-1 min-w-0 rounded-lg border px-4 py-3 ${toneClasses}`}>
                      <div className="font-black text-sm">{headline}</div>
                      <div className="text-xs mt-1 opacity-90 leading-snug">{subline}</div>
                    </div>
                  );
                }

                return (
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mb-1">Owner Objectives</div>
                    <div className="flex flex-col gap-0.5">
                      {userTeam.approval.objectives.filter(o => o.season === season).map(obj => (
                        <div key={obj.id} className="flex items-center gap-2 text-xs">
                          <span>{obj.status === 'completed' ? '✅' : obj.status === 'failed' ? '❌' : '⏳'}</span>
                          <span className={obj.status === 'failed' ? 'text-red-600 line-through' : obj.status === 'completed' ? 'text-green-600' : ''}>{obj.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </Card>
        )}

        {/* Active Mode Indicators */}
        {(leagueSettings?.bsMode || leagueSettings?.mcafeeMode) && (
          <div className="flex items-center gap-2 flex-wrap">
            {leagueSettings?.bsMode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                <span className="text-amber-600 font-bold">BS Mode Active</span>
                <span className="text-amber-500">· Draft Lottery · QB Tiers · Ewing Theory · IC Guys</span>
              </div>
            )}
            {leagueSettings?.mcafeeMode && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs">
                <span className="text-blue-600 font-bold">McAfee Mode Active</span>
                <span className="text-blue-500">· Punt God · Returns · Fake Punts · Onside Kicks</span>
              </div>
            )}
          </div>
        )}

        {/* Achievements row — hidden in spectator (achievements are user-team only) */}
        {!isSpectator && ALL_ACHIEVEMENTS.length > 0 && (() => {
          const achievementEmojiMap: Record<string, string> = {
            'Champion': '🏆', 'Dynasty Builder': '👑', 'Perfect Season': '💎',
            'Cap Wizard': '🧙', 'Rebuilder': '🔨', 'Stat Stacker': '📊',
            'Trade Master': '🤝', 'On Fire': '🔥', 'Lockdown': '🔒',
            'All-Star Factory': '⭐',
          };
          return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_ACHIEVEMENTS.map(def => {
              const unlocked = achievements.find(a => a.id === def.id);
              const prog = !unlocked && def.progress ? def.progress(useGameStore.getState() as never) : null;
              const emoji = achievementEmojiMap[def.name] ?? def.icon;
              return (
                <div
                  key={def.id}
                  className={`flex flex-col items-center gap-0.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-xs border transition-all ${
                    unlocked
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 opacity-40'
                  }`}
                  title={`${def.name}: ${def.description}${unlocked ? ` (Unlocked S${unlocked.unlockedSeason})` : prog ? ` (${prog.current}/${prog.target} ${prog.label})` : ''}`}
                >
                  <span className={`text-lg ${unlocked ? '' : 'grayscale'}`}>{emoji}</span>
                  <span className="font-medium hidden sm:inline text-[10px]">{def.name}</span>
                  {prog && prog.target > 1 && (
                    <span className="text-[9px] text-[var(--text-sec)] hidden sm:inline">{prog.current}/{prog.target}</span>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* Next Game + Injury Report — both user-team only. Spectator
            leagues skip; watch-live for any game is reachable via /standings. */}
        {!isSpectator && (() => {
          let nextGame = phase === 'regular'
            ? schedule.find(g => g.week === week && !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId))
            : null;
          // During playoffs, find the user's next unplayed matchup
          if (!nextGame && phase === 'playoffs' && playoffBracket) {
            const userMatchup = playoffBracket.find(m =>
              !m.winnerId && (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)
            );
            if (userMatchup && userMatchup.homeTeamId && userMatchup.awayTeamId) {
              nextGame = { id: userMatchup.id, week: 99, season, homeTeamId: userMatchup.homeTeamId, awayTeamId: userMatchup.awayTeamId, homeScore: 0, awayScore: 0, played: false, playerStats: {} };
            }
          }
          const injuredPlayers = roster.filter(p => p.injury && !p.retired).sort((a, b) => (b.injury?.weeksLeft ?? 0) - (a.injury?.weeksLeft ?? 0));
          const oppTeam = nextGame ? teams.find(t => t.id === (nextGame.homeTeamId === userTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)) : null;
          return (nextGame || injuredPlayers.length > 0) ? (
            <div className={`grid grid-cols-1 ${nextGame && injuredPlayers.length > 0 ? 'md:grid-cols-2' : ''} gap-4`}>
              {nextGame && oppTeam && (
                <div className="rounded-xl bg-gradient-to-r from-[var(--surface)] to-blue-50 border border-blue-200 overflow-hidden">
                  <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <TeamLogo abbreviation={oppTeam.abbreviation} primaryColor={oppTeam.primaryColor} secondaryColor={oppTeam.secondaryColor} logoUrl={oppTeam.logoUrl} size="lg" />
                      <div>
                        <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider font-medium">{phase === 'playoffs' ? 'Playoffs' : `Week ${week}`} · {nextGame.homeTeamId === userTeamId ? 'Home' : 'Away'}</div>
                        <div className="text-lg font-black mt-0.5">{nextGame.homeTeamId === userTeamId ? 'vs' : '@'} {oppTeam.city} {oppTeam.name}</div>
                        <div className="text-sm text-[var(--text-sec)] font-medium">{formatRecord(oppTeam.record)}</div>
                      </div>
                    </div>
                    <Link href={`/game/${nextGame.id}`}>
                      <Button size="md" className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 text-base">
                        Watch Live
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
              {injuredPlayers.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Injury Report ({injuredPlayers.length})</CardTitle></CardHeader>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {injuredPlayers.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm px-1 py-0.5">
                        <button onClick={() => setSelectedPlayerId(p.id)} className="flex items-center gap-2 hover:text-blue-600">
                          <Badge variant="red" size="sm">{p.position}</Badge>
                          <span className="font-medium">{p.firstName} {p.lastName}</span>
                          <span className="text-xs text-[var(--text-sec)]">{p.ratings.overall} OVR</span>
                        </button>
                        <div className="text-xs text-[var(--text-sec)]">
                          <span className="text-red-600">{p.injury?.type}</span>
                          <span className="ml-2">{p.injury?.weeksLeft}w{p.onIR ? ' · IR' : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ) : null;
        })()}

        {/* Row 1: Standings, Finances, Team Stats — all framed around the
            user's team (filtered to their conference, their cap, their stats).
            Spectator leagues route the user to /standings for the
            unfiltered league view. */}
        {!isSpectator && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Conference standings with GB */}
          <Card>
            <CardHeader><CardTitle>{userTeam.conference} Standings</CardTitle></CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs">
                  <th className="text-left pb-2">Team</th>
                  <th className="text-center pb-2">W</th>
                  <th className="text-center pb-2">L</th>
                  <th className="text-right pb-2">GB</th>
                </tr>
              </thead>
              <tbody>
                {conferenceTeams.slice(0, 10).map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-t border-[var(--border)] ${t.id === userTeamId ? 'text-blue-600 font-semibold' : ''} cursor-pointer hover:bg-[var(--surface-2)]`}
                    onClick={() => setViewTeamId(t.id)}
                  >
                    <td className="py-1 text-left flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--text-sec)] w-4">{i + 1}</span>
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span className="truncate">{t.abbreviation}</span>
                    </td>
                    <td className="py-1 text-center">{t.record.wins}</td>
                    <td className="py-1 text-center">{t.record.losses}</td>
                    <td className="py-1 text-right text-[var(--text-sec)]">{getGB(t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Finances */}
          <Card>
            <CardHeader><CardTitle>Finances</CardTitle></CardHeader>
            {(() => {
              const capSpace = Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10;
              const playerDeadCap = Math.round((userTeam.deadCap ?? []).filter(d => !d.isCoaching).reduce((s, d) => s + d.amount, 0) * 10) / 10;
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Revenue</span><span className="font-bold text-green-600">${totalRevenue}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Player Payroll</span><span className="font-bold">${playerPayroll}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Coaching Payroll</span><span className="font-bold">${coachingPayroll}M{coachingDeadCap > 0 ? ` + $${coachingDeadCap}M dead` : ''}</span></div>
                  {luxuryTax > 0 && (
                    <div className="flex justify-between"><span className="text-[var(--text-sec)]">Luxury Tax</span><span className="font-bold text-red-600">${luxuryTax}M</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Total Expenses</span><span className="font-bold">${expenses}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Profit</span><span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profit >= 0 ? '+' : ''}${profit}M</span></div>
                  <div className="border-t border-[var(--border)] my-1" />
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Salary Cap</span><span className="font-bold">${userTeam.salaryCap}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Cap Space</span><span className={`font-bold ${capSpace < 10 ? 'text-red-600' : 'text-green-600'}`}>${capSpace}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Player Dead Cap</span><span className="font-bold text-amber-600">${playerDeadCap}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Roster</span><span className="font-bold">{roster.length} / 53</span></div>
                </div>
              );
            })()}
          </Card>

          {/* Team Stats */}
          <Card>
            <CardHeader><CardTitle>Team Stats</CardTitle></CardHeader>
            {gamesPlayed === 0 ? (
              <div className="text-sm text-[var(--text-sec)] text-center py-4">
                Season hasn&apos;t started — sim some games!
              </div>
            ) : (() => {
              const gp = Math.max(1, gamesPlayed);
              const ppg = userTeam.record.pointsFor / gp;
              const pag = userTeam.record.pointsAgainst / gp;
              const totalPassYds = roster.reduce((s, p) => s + p.stats.passYards, 0);
              const totalRushYds = roster.reduce((s, p) => s + p.stats.rushYards, 0);
              const passPerGame = totalPassYds / gp;
              const rushPerGame = totalRushYds / gp;
              const totalYds = totalPassYds + totalRushYds;

              const teamStatsList = teams.map(t => {
                const tgp = Math.max(1, t.record.wins + t.record.losses);
                const tRoster = players.filter(p => p.teamId === t.id);
                const tPass = tRoster.reduce((s, p) => s + p.stats.passYards, 0);
                const tRush = tRoster.reduce((s, p) => s + p.stats.rushYards, 0);
                return {
                  id: t.id,
                  ppg: t.record.pointsFor / tgp,
                  pag: t.record.pointsAgainst / tgp,
                  passPerGame: tPass / tgp,
                  rushPerGame: tRush / tgp,
                  totalYds: tPass + tRush,
                };
              });
              const rank = (arr: { id: string; val: number }[], desc = true) => {
                const sorted = [...arr].sort((a, b) => desc ? b.val - a.val : a.val - b.val);
                return sorted.findIndex(x => x.id === userTeamId) + 1;
              };
              const ppgRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.ppg })));
              const pagRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.pag })), false);
              const passRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.passPerGame })));
              const rushRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.rushPerGame })));
              const ydsRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.totalYds })));

              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">PPG</span><span className="font-bold">{ppg.toFixed(1)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(ppgRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Opp PPG</span><span className="font-bold">{pag.toFixed(1)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(pagRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Pass YDS/G</span><span className="font-bold">{passPerGame.toFixed(0)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(passRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Rush YDS/G</span><span className="font-bold">{rushPerGame.toFixed(0)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(rushRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Total YDS</span><span className="font-bold">{totalYds.toLocaleString()} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(ydsRank)})</span></span></div>
                </div>
              );
            })()}
          </Card>
        </div>
        )}

        {/* Row 2: League Leaders, Team Leaders, News */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* League Leaders */}
          <Card>
            <CardHeader><CardTitle>League Leaders</CardTitle></CardHeader>
            {gamesPlayed === 0 ? (
              <div className="text-sm text-[var(--text-sec)] text-center py-4">
                Season hasn&apos;t started — sim some games!
              </div>
            ) : (
            <div className="space-y-3">
              {(() => {
                const allActive = players.filter(p => p.teamId && !p.retired);
                const passLeader = allActive.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0];
                const rushLeader = allActive.sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
                const recLeader = allActive.sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];
                const sackLeader = allActive.sort((a, b) => b.stats.sacks - a.stats.sacks)[0];
                const leaders = [
                  passLeader && { label: 'Pass YDS', player: passLeader, stat: `${passLeader.stats.passYards}` },
                  rushLeader && { label: 'Rush YDS', player: rushLeader, stat: `${rushLeader.stats.rushYards}` },
                  recLeader && { label: 'Rec YDS', player: recLeader, stat: `${recLeader.stats.receivingYards}` },
                  sackLeader && { label: 'Sacks', player: sackLeader, stat: `${sackLeader.stats.sacks}` },
                ].filter(Boolean) as { label: string; player: typeof passLeader; stat: string }[];
                return leaders.map(l => {
                  const t = teams.find(t => t.id === l.player!.teamId);
                  return (
                    <div key={l.label} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="text-xs text-[var(--text-sec)]">{l.label}</div>
                        <button onClick={() => setSelectedPlayerId(l.player!.id)} className="font-semibold hover:text-blue-600 transition-colors">
                          {l.player!.firstName[0]}. {l.player!.lastName}
                        </button>
                        <span className="text-xs text-[var(--text-sec)] ml-1">{t?.abbreviation}</span>
                      </div>
                      <div className="text-xs font-bold">{l.stat}</div>
                    </div>
                  );
                });
              })()}
            </div>
            )}
          </Card>

          {/* Team Leaders — user-team only; spectator skips */}
          {!isSpectator && (
          <Card>
            <CardHeader><CardTitle>Team Leaders</CardTitle></CardHeader>
            {gamesPlayed === 0 ? (
              <div className="text-sm text-[var(--text-sec)] text-center py-4">
                Season hasn&apos;t started — sim some games!
              </div>
            ) : (
            <div className="space-y-3">
              {(() => {
                const qb = roster.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0];
                const rb = roster.filter(p => p.position === 'RB').sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
                const wr = roster.filter(p => ['WR', 'TE'].includes(p.position)).sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];
                const def = roster.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position)).sort((a, b) => b.stats.tackles - a.stats.tackles)[0];
                const leaders = [
                  qb && { label: 'Passing', player: qb, stat: `${qb.stats.passYards} YDS, ${qb.stats.passTDs} TD, ${qb.stats.interceptions} INT` },
                  rb && { label: 'Rushing', player: rb, stat: `${rb.stats.rushYards} YDS, ${rb.stats.rushTDs} TD` },
                  wr && { label: 'Receiving', player: wr, stat: `${wr.stats.receivingYards} YDS, ${wr.stats.receivingTDs} TD` },
                  def && { label: 'Defense', player: def, stat: `${def.stats.tackles} TKL, ${def.stats.sacks} SCK` },
                ].filter(Boolean) as { label: string; player: typeof qb; stat: string }[];
                return leaders.map(l => (
                  <div key={l.label} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="text-xs text-[var(--text-sec)]">{l.label}</div>
                      <button onClick={() => setSelectedPlayerId(l.player!.id)} className="font-semibold hover:text-blue-600 transition-colors">
                        {l.player!.firstName} {l.player!.lastName}
                      </button>
                      <div className="text-[10px] text-[var(--text-sec)]">
                        Age {l.player!.age} · OVR {l.player!.ratings.overall} · POT {l.player!.potential}
                      </div>
                    </div>
                    <div className="text-xs text-right text-[var(--text-sec)]">{l.stat}</div>
                  </div>
                ));
              })()}
            </div>
            )}
          </Card>
          )}

          {/* News */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <CardTitle>Recent News</CardTitle>
                <Link href="/news" className="text-xs text-blue-600 hover:underline">View All</Link>
              </div>
            </CardHeader>
            {recentNews.length === 0 ? (
              <div className="text-sm text-[var(--text-sec)] text-center py-4">
                No news yet. Sim games to see headlines.
              </div>
            ) : (
              <div className="space-y-2">
                {recentNews.map(item => (
                  <div
                    key={item.id}
                    className={`text-xs rounded-lg p-2 ${
                      item.isUserTeam
                        ? 'bg-blue-500/10 border border-blue-500/20'
                        : 'bg-[var(--surface-2)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-[var(--text-sec)]">
                        S{item.season}{item.week > 0 ? ` W${item.week}` : ''}
                      </span>
                      {item.isUserTeam && (
                        <span className="text-[10px] text-blue-600 font-bold">YOUR TEAM</span>
                      )}
                    </div>
                    <p className="leading-tight">{item.headline}</p>
                    {item.type === 'recap' && item.body && (() => {
                      const perfLines = item.body.split('\n').filter(l => l.startsWith('\u2022 ')).slice(0, 2);
                      if (perfLines.length === 0) return null;
                      return (
                        <div className="mt-1 text-[10px] text-[var(--text-sec)] space-y-0.5">
                          {perfLines.map((line, i) => (
                            <div key={i} className="truncate">{line}</div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Team Spotlight — generates dialogue framed around the user's
            team. Spectator leagues skip; the news feed already covers
            league-wide narrative. */}
        {!isSpectator && (
          <div ref={spotlightRef}>
            <TeamSpotlightSection
              team={userTeam}
              roster={roster}
              allTeams={teams}
              allPlayers={players}
              season={season}
              week={week}
              ctx={{ phase, playoffBracket, playoffSeeds, champions, finalsMvpPlayerId, draftResults, freeAgents, faDay }}
              onPlayerClick={setSelectedPlayerId}
            />
          </div>
        )}
      </div>


      {/* Team Roster Modal */}
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />

      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

function DiscordBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('gg-discord-dismissed')) setDismissed(true);
    } catch { /* noop */ }
  }, []);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    try { localStorage.setItem('gg-discord-dismissed', '1'); } catch { /* noop */ }
  }

  return (
    <div className="mt-6 relative bg-[#5865F2]/10 border border-[#5865F2]/20 rounded-xl p-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors text-xs"
        aria-label="Dismiss"
      >
        ✕
      </button>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--text)]">Join the BS Football Community</p>
          <p className="text-xs text-[var(--text-sec)] mt-0.5">Tell me what features you want me to build into the game!</p>
        </div>
        <a
          href="https://discord.gg/RMtusS2GKW"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
        >
          Join Discord
        </a>
      </div>
    </div>
  );
}

import { Suspense } from 'react';

function HomeContent() {
  const initialized = useGameStore(s => s.initialized);
  const searchParams = useSearchParams();
  const hasRosterParam = searchParams.get('roster') !== null;
  return initialized && !hasRosterParam ? <Dashboard /> : <TeamPicker />;
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
