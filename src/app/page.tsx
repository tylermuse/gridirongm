'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LEAGUE_TEAMS, type TeamTemplate } from '@/lib/data/teams';
import { type ImportedLeagueData, loadLeagueFromUrl } from '@/lib/data/leagueImport';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { generateTeamSpotlight, COMMENTATORS, type SpotlightContext } from '@/lib/engine/debate';
import { ALL_ACHIEVEMENTS } from '@/lib/engine/achievements';
import { DebateBubble } from '@/components/game/DebateBubble';

function TeamPicker() {
  const router = useRouter();
  const { newLeague } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importedTeams, setImportedTeams] = useState<ImportedLeagueData | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [savedGame, setSavedGame] = useState<{ teamAbbr: string; season: number; wins: number; losses: number; phase: string } | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

  // Check for existing autosave on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('gridiron-gm-autosave');
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
  }, []);

  function handleResume() {
    setResumeLoading(true);
    // The store auto-hydrates from localStorage via persist middleware.
    // We just need to set initialized = true.
    useGameStore.setState({ initialized: true });
  }

  async function handlePick(abbr: string) {
    setLoading(true);
    setError(null);
    try {
      await newLeague(abbr, activeUrl ?? undefined);
      // New leagues start in re-signing phase — redirect there
      router.push('/re-sign');
    } catch {
      setError('Failed to start league. Please try again.');
    } finally {
      setLoading(false);
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
    } catch {
      setError('Failed to load league file. Check the URL and try again.');
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
  const displayTeams: { city: string; name: string; abbreviation: string; primaryColor: string; secondaryColor: string }[] = importedTeams
    ? importedTeams.teams.map(t => ({ city: t.city, name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor ?? '#FFFFFF' }))
    : LEAGUE_TEAMS;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight mb-3">
          <span className="text-blue-600">GRIDIRON</span> GM
        </h1>
        <p className="text-[var(--text-sec)] text-sm sm:text-lg">Choose your franchise. Build your dynasty.</p>
      </div>

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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-4xl">
          {[...displayTeams].sort((a, b) => a.city.localeCompare(b.city)).map(team => (
            <button
              key={team.abbreviation}
              onClick={() => handlePick(team.abbreviation)}
              className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                         hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all text-left"
            >
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{team.city}</div>
                <div className="text-xs text-[var(--text-sec)] truncate">{team.name}</div>
              </div>
            </button>
          ))}
        </div>
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
  // All features are free — no tier gating

  const topics = React.useMemo(
    () => generateTeamSpotlight(team, roster, allTeams, allPlayers, season, week, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, roster, allTeams, allPlayers, season, week, ctx?.phase, ctx?.faDay, ctx?.draftResults?.length, ctx?.playoffBracket],
  );

  if (topics.length === 0) return null;

  // Free tier: show first topic with only 2 exchanges as teaser

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                <span className="flex items-center gap-2"><span>🎬</span> Team Spotlight</span>
              </CardTitle>
              <p className="text-xs text-[var(--text-sec)] mt-0.5">
                with {COMMENTATORS.stats.name} {COMMENTATORS.stats.avatar} & {COMMENTATORS.hottake.name} {COMMENTATORS.hottake.avatar}
              </p>
            </div>
          </div>
        </CardHeader>
        <div className="px-4 pb-4">
          <div className="space-y-5">
            {topics.map((topic, topicIdx) => (
              <div key={topicIdx}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{topic.icon}</span>
                  <h4 className="text-sm font-bold">{topic.headline}</h4>
                </div>
                <div className="space-y-2.5">
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
                {topicIdx < topics.length - 1 && (
                  <div className="border-b border-[var(--border)] mt-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Dashboard() {
  const { teams, userTeamId, players, schedule, week, season, phase, playoffBracket, playoffSeeds, champions, finalsMvpPlayerId, draftResults, freeAgents, faDay, newsItems, achievements } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const userTeam = teams.find(t => t.id === userTeamId)!;
  const roster = players.filter(p => p.teamId === userTeamId);

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
  const expenses = Math.round(userTeam.totalPayroll * 10) / 10;
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
        {/* Team header */}
        <div className="flex items-center gap-4">
          <div
            className="shrink-0"
          >
            <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="xl" />
          </div>
          <div>
            <h2 className="text-2xl font-black">{userTeam.city} {userTeam.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant={userTeam.record.wins > userTeam.record.losses ? 'green' : userTeam.record.wins < userTeam.record.losses ? 'red' : 'default'} size="md">
                {userTeam.record.wins}-{userTeam.record.losses}
              </Badge>
              <span className="text-sm text-[var(--text-sec)]">
                {userTeam.conference} {userTeam.division}
              </span>
              <span className={`text-sm ${capPct > 0.95 ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>
                Cap: ${Math.round(userTeam.totalPayroll)}M / ${userTeam.salaryCap}M
              </span>
              {champions.length > 0 && champions.filter(c => c.teamId === userTeamId).length > 0 && (
                <span className="text-sm text-amber-600 font-bold">
                  {champions.filter(c => c.teamId === userTeamId).length}x Champion
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Achievements row */}
        {ALL_ACHIEVEMENTS.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {ALL_ACHIEVEMENTS.map(def => {
              const unlocked = achievements.find(a => a.id === def.id);
              return (
                <div
                  key={def.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-all ${
                    unlocked
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-sec)] opacity-40'
                  }`}
                  title={`${def.name}: ${def.description}${unlocked ? ` (Unlocked S${unlocked.unlockedSeason})` : ''}`}
                >
                  <span className="text-sm">{def.icon}</span>
                  <span className="font-medium hidden sm:inline">{def.name}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Next Game: Watch Live + Injury Report */}
        {(() => {
          const nextGame = phase === 'regular'
            ? schedule.find(g => g.week === week && !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId))
            : null;
          const injuredPlayers = roster.filter(p => p.injury && !p.retired).sort((a, b) => (b.injury?.weeksLeft ?? 0) - (a.injury?.weeksLeft ?? 0));
          const oppTeam = nextGame ? teams.find(t => t.id === (nextGame.homeTeamId === userTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)) : null;
          return (nextGame || injuredPlayers.length > 0) ? (
            <div className={`grid grid-cols-1 ${nextGame && injuredPlayers.length > 0 ? 'md:grid-cols-2' : ''} gap-4`}>
              {nextGame && oppTeam && (
                <Card>
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TeamLogo abbreviation={oppTeam.abbreviation} primaryColor={oppTeam.primaryColor} secondaryColor={oppTeam.secondaryColor} size="md" />
                      <div>
                        <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider">Week {week} · {nextGame.homeTeamId === userTeamId ? 'Home' : 'Away'}</div>
                        <div className="font-bold">{nextGame.homeTeamId === userTeamId ? 'vs' : '@'} {oppTeam.city} {oppTeam.name}</div>
                        <div className="text-xs text-[var(--text-sec)]">{oppTeam.record.wins}-{oppTeam.record.losses}</div>
                      </div>
                    </div>
                    <Link href={`/game/${nextGame.id}`}>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                        Watch Live
                      </Button>
                    </Link>
                  </div>
                </Card>
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

        {/* Row 1: Standings, Finances, Team Stats */}
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
              const deadCapTotal = (userTeam.deadCap ?? []).reduce((sum: number, dc: { amount: number }) => sum + dc.amount, 0);
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Revenue</span><span className="font-bold text-green-600">${totalRevenue}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Payroll</span><span className="font-bold">${expenses}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Profit</span><span className={`font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{profit >= 0 ? '+' : ''}${profit}M</span></div>
                  <div className="border-t border-[var(--border)] my-1" />
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Salary Cap</span><span className="font-bold">${userTeam.salaryCap}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Cap Space</span><span className={`font-bold ${capSpace < 10 ? 'text-red-600' : 'text-green-600'}`}>${capSpace}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Dead Cap</span><span className="font-bold text-amber-600">${Math.round(deadCapTotal * 10) / 10}M</span></div>
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

          {/* Team Leaders */}
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
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Team Spotlight */}
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

      {/* Team Roster Modal */}
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />

      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

export default function Home() {
  const initialized = useGameStore(s => s.initialized);
  return initialized ? <Dashboard /> : <TeamPicker />;
}
