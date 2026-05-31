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
import { TeamHero } from '@/components/dashboard/TeamHero';
import { OwnerObjectives } from '@/components/dashboard/OwnerObjectives';
import { NextMatchupCard } from '@/components/dashboard/NextMatchup';
import { DashboardRow } from '@/components/dashboard/DashboardRow';
import { LiveViewer } from '@/components/live/LiveViewer';
import { ApprovalRings, TrophyCase } from '@/components/dashboard/MetaWidgets';
import { GamePlanModal } from '@/components/modals/GamePlanModal';
import { nextAction } from '@/lib/ui/nextAction';
import { useRouter } from 'next/navigation';
import { canAdvanceSeason } from '@/lib/season';
import { getBracket } from '@/lib/playoffs';
import { getDraft } from '@/lib/draft';
import { getGmFired } from '@/lib/approval';
import type { BasketballTeam } from '@bs/sport-basketball';

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
  const { league, loading, error, newLeague, continueLatest, loadLeague, pickUserTeam, clearActive, enterOffseason, watchNextUserGame } = useLeagueStore();
  const router = useRouter();
  const [watching, setWatching] = useState<{ userGameId: string; dayGameIds: string[] } | null>(null);
  const [gamePlanOpen, setGamePlanOpen] = useState(false);

  async function handleWatchLive() {
    const res = await watchNextUserGame();
    if (res) setWatching({ userGameId: res.userGameId, dayGameIds: res.dayGameIds });
  }
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
    const userTeam = league.userTeamId ? league.teams.find(t => t.id === league.userTeamId) : null;
    const bracket = getBracket(league);
    const draft = getDraft(league);
    const fired = getGmFired(league);
    const seasonOver = canAdvanceSeason(league);
    const champion = seasonOver && bracket?.championTeamId
      ? (league.teams.find(t => t.id === bracket.championTeamId) as BasketballTeam | undefined)
      : undefined;
    return (
      <div className="max-w-6xl mx-auto px-5 py-12">
        {userTeam ? (
          <TeamHero league={league} team={userTeam as BasketballTeam} />
        ) : (
          <div className="flex flex-wrap items-baseline gap-4 mb-6">
            <h1
              className="text-5xl sm:text-6xl font-black tracking-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
            >
              {league.displayName}
            </h1>
            <span className="text-[var(--text-sec)] text-sm">
              Season {league.currentSeason} · {nextAction(league).phaseLabel}
            </span>
          </div>
        )}

        {fired && !league.userTeamId && (
          <div className="mb-8 rounded-xl border-2 p-5 flex flex-wrap items-center gap-4" style={{ borderColor: '#dc2626', background: 'color-mix(in srgb, #dc2626 8%, transparent)' }}>
            <div className="text-3xl">📉</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold">You were fired by the {fired.teamName}</div>
              <div className="text-sm text-[var(--text-sec)]">
                Ownership ran out of patience after the {fired.season} season. Take over any club from the League page to keep your GM career going.
              </div>
            </div>
            <Link href="/league">
              <Button variant="primary" size="lg">Find a New Team →</Button>
            </Link>
          </div>
        )}

        {draft ? (
          <div
            className="mb-8 rounded-xl border-2 p-5 flex flex-wrap items-center gap-4"
            style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          >
            <div className="text-3xl">🎟️</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{draft.season} Draft is on the clock</div>
              <div className="text-sm text-[var(--text-sec)]">
                {draft.complete
                  ? 'The draft is done — finalize rosters and tip off the season.'
                  : `Pick ${draft.currentPick + 1} of ${draft.picks.length}. Make your selections, then start the season.`}
              </div>
            </div>
            <Link href="/draft">
              <Button variant="primary" size="lg">
                {draft.complete ? 'Finish Offseason →' : 'Continue Draft →'}
              </Button>
            </Link>
          </div>
        ) : seasonOver && (
          <div
            className="mb-8 rounded-xl border-2 p-5 flex flex-wrap items-center gap-4"
            style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          >
            <div className="text-3xl">🏁</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold">Season {league.currentSeason} is complete</div>
              <div className="text-sm text-[var(--text-sec)]">
                {champion
                  ? `${champion.city} ${champion.name} are your champions. `
                  : ''}
                Age your league and head into the {league.currentSeason + 1} Draft.
              </div>
            </div>
            <Button
              variant="primary"
              size="lg"
              disabled={loading}
              onClick={() => {
                void (async () => {
                  const ok = await enterOffseason();
                  if (ok) router.push('/draft');
                })();
              }}
            >
              {loading ? 'Working…' : 'Enter Offseason →'}
            </Button>
          </div>
        )}

        {userTeam && (
          <>
            <NextMatchupCard league={league} team={userTeam as BasketballTeam} onWatchLive={() => void handleWatchLive()} onGamePlan={() => setGamePlanOpen(true)} loading={loading} />
            <DashboardRow league={league} team={userTeam as BasketballTeam} />
            <div className="grid md:grid-cols-[1fr_15rem] gap-4 mb-6 items-start">
              <TrophyCase league={league} team={userTeam as BasketballTeam} />
              <ApprovalRings team={userTeam as BasketballTeam} />
            </div>
          </>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main column */}
          <div className="lg:col-span-2">
            {userTeam && <OwnerObjectives league={league} team={userTeam as BasketballTeam} />}

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

        {watching && (
          <LiveViewer userGameId={watching.userGameId} dayGameIds={watching.dayGameIds} onClose={() => setWatching(null)} />
        )}
        {userTeam && (
          <GamePlanModal teamId={userTeam.id} open={gamePlanOpen} onClose={() => setGamePlanOpen(false)} />
        )}
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
    <div className="min-h-screen flex flex-col items-center">
      {/* Hero banner — full-bleed court backdrop with the wordmark over it. */}
      <div className="w-full relative overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% 110%, #2a1808 0%, #120c16 55%, #0a0a0f 100%)' }}>
        {/* Court key lines */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMax slice" viewBox="0 0 400 200" fill="none" aria-hidden>
          <g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.4">
            <circle cx="200" cy="210" r="58" />
            <circle cx="200" cy="210" r="30" />
            <rect x="170" y="150" width="60" height="80" />
            <path d="M118 230 A 100 100 0 0 1 282 230" />
          </g>
          <circle cx="200" cy="62" r="120" fill="#E66B00" fillOpacity="0.10" />
        </svg>
        <div className="relative z-10 flex flex-col items-center text-center px-4 pt-16 pb-12 sm:pt-20 sm:pb-16">
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-white/40 mb-2">Franchise Basketball · Parody GM Sim</span>
          <h1 className="text-6xl sm:text-8xl font-black tracking-tighter leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--accent)' }}>BS</span> <span className="text-white">HOOPS</span>
          </h1>
          <p className="text-white/70 text-base sm:text-xl mt-4 max-w-xl">
            30 cities. 60 prospects. One banner. Build your dynasty and run the franchise.
          </p>
          <div className="text-white/40 text-xs mt-6 animate-pulse">↓ pick your team</div>
        </div>
      </div>

      <div className="w-full flex flex-col items-center px-4 sm:px-8 py-10 max-w-5xl">
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

      {/* Team grid (skeletons while a saved league is loading) */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-4xl w-full">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="w-12 h-12 rounded-xl bg-[var(--surface-2)] animate-pulse shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-[var(--surface-2)] animate-pulse" />
                <div className="h-2.5 w-1/2 rounded bg-[var(--surface-2)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : (
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
      )}
      </div>
    </div>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

