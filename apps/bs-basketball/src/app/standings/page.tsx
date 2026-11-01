'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { TeamRosterModal } from '@/components/modals/TeamRosterModal';
import { usePlayerModal } from '@/components/modals/PlayerModalProvider';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { clinchMarks, CLINCH_LEGEND, type ClinchMark } from '@/lib/standings/clinch';
import {
  computeExtendedStandings, dayOf, defaultScoreboardDay, gameSD, scoreboardDays, scoreboardForDay, fmtWL, gamesBehind,
  type ExtendedTeamStanding, type ScoreboardGame,
} from '@/lib/standings/extendedStandings';
import { seedConferences } from '@/lib/playoffs/seeding';
import type { BasketballTeam } from '@bs/sport-basketball';

type Grouping = 'conference' | 'division' | 'league';
type View = 'standings' | 'scores' | 'schedule';

const CONFERENCES = ['Eastern', 'Western'] as const;
const DIVISIONS_BY_CONF: Record<string, string[]> = {
  Eastern: ['Atlantic', 'Central', 'Southeast'],
  Western: ['Northwest', 'Pacific', 'Southwest'],
};

const VIEW_OPTIONS = [
  { value: 'standings', label: 'Standings' },
  { value: 'scores', label: 'Scores' },
  { value: 'schedule', label: 'Schedule' },
] as const satisfies ReadonlyArray<{ value: View; label: string }>;

const GROUPING_OPTIONS = [
  { value: 'division', label: 'Division' },
  { value: 'conference', label: 'Conference' },
  { value: 'league', label: 'League' },
] as const satisfies ReadonlyArray<{ value: Grouping; label: string }>;

function parseView(v: string | null): View {
  return v === 'scores' || v === 'schedule' ? v : 'standings';
}

/**
 * /standings — Standings & Schedule (football parity).
 *
 * Three views, switched by the primary SegmentedControl and mirrored in the
 * URL as `?view=standings|scores|schedule` (so `/schedule` can deep-link
 * here):
 *   - Standings: Division (two-column, one card per division, compact
 *     columns), Conference (playoff seed order with the play-in / lottery cut
 *     lines + split columns) or League. Rows open the team's roster modal.
 *   - Scores: league-wide scoreboard by day, the user's game first.
 *   - Schedule: the user's full schedule as card rows, next game highlighted.
 *
 * Records/splits come from league.games via lib/standings/extendedStandings.
 * Sim controls live in the top bar; this page has none of its own.
 */

interface TeamSportData { conference: 'Eastern' | 'Western'; division: string }

function sd(t: BasketballTeam): TeamSportData {
  return t.sportData as TeamSportData;
}

/** Division anchor colors — a scannable left stripe per row (NBA convention). */
const DIVISION_COLORS: Record<string, string> = {
  Atlantic: '#10b981', Central: '#8b5cf6', Southeast: '#f59e0b',
  Northwest: '#f43f5e', Pacific: '#06b6d4', Southwest: '#f97316',
};

const byStanding = (a: BasketballTeam, b: BasketballTeam) => {
  if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
  if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
  return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
};

// useSearchParams() must sit under a Suspense boundary or the static
// prerender of this route fails at `next build`.
export default function StandingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StandingsContent />
    </Suspense>
  );
}

function StandingsContent() {
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const { league, loading, error } = useLeagueOrHydrate();
  const simDay = useLeagueStore(s => s.simDay);
  const openPlayer = usePlayerModal();
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('conference');

  // The URL is the source of truth for the view. Next syncs useSearchParams
  // with the native history API, so this swaps tabs without a navigation.
  const setView = (v: View) => {
    window.history.replaceState(null, '', v === 'standings' ? '/standings' : `/standings?view=${v}`);
  };

  // Conference view follows the real seeding order (tiebreakers applied) for
  // the top 10, then the rest by record.
  const conferenceGroups = useMemo<{ conf: string; teams: BasketballTeam[] }[]>(() => {
    if (!league) return [];
    const all = league.teams as BasketballTeam[];
    const seeds = seedConferences(league);
    const byId = new Map(all.map(t => [t.id, t]));
    return CONFERENCES.map(conf => {
      const seeded = seeds[conf];
      const rest = all.filter(t => sd(t).conference === conf && !seeded.includes(t.id)).sort(byStanding);
      return {
        conf,
        teams: [...seeded.map(id => byId.get(id)).filter((t): t is BasketballTeam => !!t), ...rest],
      };
    });
  }, [league]);

  const ext = useMemo(() => (league ? computeExtendedStandings(league) : new Map<string, ExtendedTeamStanding>()), [league]);
  const marks = useMemo(() => (league ? clinchMarks(league) : new Map<string, ClinchMark>()), [league]);
  const anyMarks = useMemo(() => [...marks.values()].some(Boolean), [marks]);

  if (loading && !league) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const allTeams = league.teams as BasketballTeam[];
  const userTeamId = league.userTeamId ?? null;
  const gamesPlayed = league.games.filter(g => g.status === 'played').length;
  const totalGames = league.games.length;
  const regularSeasonDone = !league.games.some(g => g.status === 'scheduled');

  const tableProps = { ext, userTeamId, marks, onTeamClick: setRosterTeamId };

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        quickNav="standings"
        title="Standings & Schedule"
        subtitle={`Season ${league.currentSeason} · Day ${league.currentTick} · ${gamesPlayed} / ${totalGames} games played`}
        right={
          <>
            {regularSeasonDone && (
              <Link
                href="/playoffs"
                className="px-3 py-1.5 rounded-lg text-sm font-bold text-white transition hover:brightness-110"
                style={{ background: 'var(--accent)' }}
              >
                🏆 Playoffs →
              </Link>
            )}
            <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} variant="primary" />
          </>
        }
      />

      {view === 'standings' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SegmentedControl options={GROUPING_OPTIONS} value={grouping} onChange={setGrouping} variant="secondary" size="sm" />
            {anyMarks && (
              <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[var(--text-sec)] ml-auto">
                {CLINCH_LEGEND.map(l => (
                  <span key={l.mark} className="inline-flex items-center gap-1">
                    <span className="font-bold tabular-nums" style={{ color: l.color }}>{l.mark}</span>{l.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {gamesPlayed === 0 && (
            <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <EmptyState
                icon="🏀"
                title="Day 1. Nobody's 0–0 forever."
                message="Tip off the season and start writing your record. 82 games to a playoff spot."
                action={{ label: 'Sim Day →', onClick: () => void simDay() }}
              />
            </div>
          )}

          {grouping === 'division' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {CONFERENCES.map(conf => (
                <div key={conf} className="space-y-4">
                  <h3 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{conf}</h3>
                  {DIVISIONS_BY_CONF[conf].map(div => (
                    <Card key={div}>
                      <CardHeader className="mb-2">
                        <CardTitle>{conf} · {div}</CardTitle>
                      </CardHeader>
                      <StandingsTable
                        {...tableProps}
                        teams={allTeams.filter(t => sd(t).division === div).sort(byStanding)}
                        compact
                        leaderTitle="Division leader"
                      />
                    </Card>
                  ))}
                </div>
              ))}
            </div>
          )}

          {grouping === 'conference' && (
            <div className="flex flex-col gap-6">
              {conferenceGroups.map(g => (
                <Card key={g.conf}>
                  <CardHeader className="mb-2">
                    <div>
                      <CardTitle>{g.conf} Conference</CardTitle>
                      <p className="text-[11px] text-[var(--text-sec)] mt-0.5">Ordered by playoff seed (tiebreakers applied).</p>
                    </div>
                  </CardHeader>
                  <StandingsTable {...tableProps} teams={g.teams} showSeedLines stripe leaderTitle="Conference leader" />
                </Card>
              ))}
            </div>
          )}

          {grouping === 'league' && (
            <Card>
              <CardHeader className="mb-2">
                <CardTitle>League Standings</CardTitle>
              </CardHeader>
              <StandingsTable {...tableProps} teams={[...allTeams].sort(byStanding)} stripe leaderTitle="League leader" />
            </Card>
          )}

          <SeedingNote grouping={grouping} />
        </>
      )}
      {view === 'scores' && <ScoresView league={league} />}
      {view === 'schedule' && <ScheduleView league={league} ext={ext} />}

      <TeamRosterModal
        teamId={rosterTeamId}
        onClose={() => setRosterTeamId(null)}
        onPlayerClick={pid => { setRosterTeamId(null); openPlayer(pid); }}
      />
    </main>
  );
}

// ===========================================================================
// Standings table
// ===========================================================================

const MARK_COLOR: Record<string, string> = { z: '#fbbf24', y: '#10b981', x: '#3b82f6', e: '#ef4444' };

const WIN_C = '#10b981';
const LOSS_C = '#dc2626';

/** Last-10 record plus a compact row of result dots (oldest → newest). */
function Last10({ s }: { s: ExtendedTeamStanding | undefined }) {
  if (!s || s.last10.length === 0) return <span className="text-xs text-[var(--text-sec)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={s.last10.join(' ')}>
      <span className="tabular-nums">{fmtWL(s.last10Record)}</span>
      <span className="hidden md:inline-flex gap-[2px]">
        {s.last10.map((c, i) => (
          <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: c === 'W' ? WIN_C : LOSS_C, opacity: 0.85 }} />
        ))}
      </span>
    </span>
  );
}

function Streak({ s }: { s: ExtendedTeamStanding | undefined }) {
  const label = s?.streak ?? '—';
  const color = label.startsWith('W') ? WIN_C : label.startsWith('L') ? LOSS_C : undefined;
  return <span className="font-semibold tabular-nums" style={{ color }}>{label}</span>;
}

const fmtDiff = (d: number) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
const fmtGb = (gb: number) => (gb === 0 ? '—' : gb.toFixed(1).replace('.0', ''));
const fmtPct = (p: number) => p.toFixed(3).replace(/^0/, '');

/** Seed tint: 1-6 playoff (accent), 7-10 play-in (amber). */
function seedTone(i: number): string | undefined {
  if (i < 6) return 'var(--accent)';
  if (i < 10) return '#d97706';
  return undefined;
}

function CutLine({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={colSpan} className="p-0">
        <div className="flex items-center gap-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>
          <span className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
          {label}
          <span className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
        </div>
      </td>
    </tr>
  );
}

function StandingsTable({
  teams, ext, userTeamId, marks, onTeamClick, compact = false, showSeedLines = false, stripe = false, leaderTitle,
}: {
  teams: BasketballTeam[];
  ext: Map<string, ExtendedTeamStanding>;
  userTeamId: string | null;
  marks: Map<string, ClinchMark>;
  onTeamClick: (teamId: string) => void;
  /** Division cards: W, L, PCT, GB, Strk, L10 only. */
  compact?: boolean;
  /** Conference view: playoff / play-in / lottery cut lines + seed tint. */
  showSeedLines?: boolean;
  /** Mixed-division tables: a division-colored stripe on each row. */
  stripe?: boolean;
  leaderTitle: string;
}) {
  const rec = (t: BasketballTeam) => ext.get(t.id) ?? { wins: t.record.wins, losses: t.record.losses };
  // GB vs the best record in the group (seeding order can put a tiebreak
  // winner first, but GB is always vs the top record).
  const leader = teams.reduce<BasketballTeam | null>((best, t) => {
    if (!best) return t;
    const a = rec(t), b = rec(best);
    return a.wins - a.losses > b.wins - b.losses ? t : best;
  }, null);
  const colSpan = compact ? 7 : 13;
  const th = 'px-2 py-1.5 text-right font-semibold whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm sticky-col ${compact ? 'min-w-[420px]' : 'min-w-[820px]'}`}>
        <thead>
          <tr className="sticky top-0 z-10 bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--text-sec)]">
            <th className="px-2 py-1.5 text-left font-semibold">Team</th>
            <th className={th}>W</th>
            <th className={th}>L</th>
            <th className={th}>PCT</th>
            <th className={th}>GB</th>
            {!compact && (
              <>
                <th className={th}>Conf</th>
                <th className={th}>Home</th>
                <th className={th}>Away</th>
                <th className={th}>PPG</th>
                <th className={th}>Opp</th>
                <th className={th}>Diff</th>
              </>
            )}
            <th className={th}>Strk</th>
            <th className="px-2 py-1.5 text-left font-semibold pl-3 whitespace-nowrap">L10</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const s = ext.get(t.id);
            const wins = s?.wins ?? t.record.wins;
            const losses = s?.losses ?? t.record.losses;
            const pct = s?.pct ?? 0;
            const gb = leader && leader !== t ? gamesBehind(rec(leader), { wins, losses }) : 0;
            const diff = s?.diffPerGame ?? 0;
            const isUser = userTeamId === t.id;
            const mark = marks.get(t.id);
            // The pinned first cell carries the row's left edge: a 4px accent
            // bar for the user's team, else the division stripe. Drawn as an
            // inset shadow on the cell so it survives the sticky column.
            const edge = isUser
              ? 'inset 4px 0 0 var(--accent)'
              : stripe ? `inset 3px 0 0 ${DIVISION_COLORS[sd(t).division] ?? 'transparent'}` : undefined;
            return (
              <Fragment key={t.id}>
                {showSeedLines && i === 6 && <CutLine label="Play-in" colSpan={colSpan} />}
                {showSeedLines && i === 10 && <CutLine label="Lottery" colSpan={colSpan} />}
                <tr
                  onClick={() => onTeamClick(t.id)}
                  title={`View ${t.city} ${t.name} roster`}
                  className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)] transition-colors ${
                    isUser ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold' : ''
                  }`}
                >
                  <td
                    className="px-2 py-1.5 pl-3"
                    style={{
                      boxShadow: edge,
                      background: isUser ? 'color-mix(in srgb, var(--accent) 10%, var(--surface))' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-[150px]">
                      <span
                        className="text-xs w-5 tabular-nums font-semibold"
                        style={{ color: showSeedLines ? seedTone(i) : undefined, opacity: !showSeedLines || i < 10 ? 1 : 0.5 }}
                      >
                        {i + 1}
                      </span>
                      {mark && <span className="text-[10px] font-bold tabular-nums w-2.5 -ml-1" style={{ color: MARK_COLOR[mark] }} title={mark}>{mark}</span>}
                      <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />
                      <span className="flex items-center gap-1 min-w-0">
                        <Link
                          href={`/team/${t.id}`}
                          onClick={e => e.stopPropagation()}
                          className={`whitespace-nowrap hover:text-[var(--accent)] transition-colors ${isUser ? 'font-bold' : 'font-semibold'}`}
                        >
                          {t.city}
                        </Link>
                        <span className={`text-xs truncate ${compact ? 'hidden xl:inline' : 'hidden md:inline'} ${isUser ? '' : 'text-[var(--text-sec)] font-normal'}`}>{t.name}</span>
                        {i === 0 && <span className="text-xs" title={leaderTitle} aria-label={leaderTitle}>👑</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{wins}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{losses}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtPct(pct)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtGb(gb)}</td>
                  {!compact && (
                    <>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.conf) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.home) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.away) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s && s.gp > 0 ? s.ppg.toFixed(1) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s && s.gp > 0 ? s.oppPpg.toFixed(1) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: diff > 0 ? WIN_C : diff < 0 ? LOSS_C : undefined }}>
                        {s && s.gp > 0 ? fmtDiff(diff) : '—'}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-1.5 text-right"><Streak s={s} /></td>
                  <td className="px-2 py-1.5 pl-3 whitespace-nowrap"><Last10 s={s} /></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Explains the cut lines and the tiebreakers lib/playoffs/seeding.ts applies. */
function SeedingNote({ grouping }: { grouping: Grouping }) {
  return (
    <div className="mt-4 rounded-xl border bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-sec)] leading-relaxed" style={{ borderColor: 'var(--border)' }}>
      <p>
        <span className="font-semibold" style={{ color: 'var(--accent)' }}>Seeds 1–6</span> go straight to the playoffs;{' '}
        <span className="font-semibold" style={{ color: '#d97706' }}>seeds 7–10</span> enter the play-in.
        {grouping !== 'conference' && ' Switch to Conference view to see seed order and cut lines.'}
      </p>
      <p className="mt-1">
        <span className="font-semibold text-[var(--foreground)]">Tiebreakers</span> (regular-season games only), in order:
        win % → head-to-head record → division win % → conference win % → point differential.
        Ties are resolved pairwise, not as a multi-team mini-standings.
      </p>
    </div>
  );
}

// ===========================================================================
// Scores — league-wide scoreboard by day
// ===========================================================================

type LeagueT = NonNullable<ReturnType<typeof useLeagueOrHydrate>['league']>;
type GameT = LeagueT['games'][number];

function ScoresView({ league }: { league: LeagueT }) {
  const days = useMemo(() => scoreboardDays(league), [league]);
  const fallback = useMemo(() => defaultScoreboardDay(league), [league]);
  const [picked, setPicked] = useState<number | null>(null);
  const day = picked !== null && days.includes(picked) ? picked : fallback;
  const userTeamId = league.userTeamId ?? null;
  // The lib orders finals first; float the user's game to the very top
  // (stable sort keeps finals-then-scheduled for the rest), as football does.
  const games = useMemo(() => {
    if (day === null) return [];
    const list = scoreboardForDay(league, day);
    if (!userTeamId) return list;
    const mine = (g: ScoreboardGame) => (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId ? 1 : 0);
    return [...list].sort((a, b) => mine(b) - mine(a));
  }, [league, day, userTeamId]);
  const teamById = useMemo(() => new Map((league.teams as BasketballTeam[]).map(t => [t.id, t])), [league]);

  if (day === null || days.length === 0) {
    return <p className="text-sm text-[var(--text-sec)]">No games on the schedule.</p>;
  }
  const idx = days.indexOf(day);
  const prev = idx > 0 ? days[idx - 1] : null;
  const next = idx < days.length - 1 ? days[idx + 1] : null;
  const finals = games.filter(g => g.played).length;
  const isPlayoffDay = games.some(g => g.isPlayoff);
  const navBtn = 'px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold transition-colors disabled:opacity-40 hover:bg-[var(--surface-2)]';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={navBtn} disabled={prev === null} onClick={() => prev !== null && setPicked(prev)} aria-label="Previous day">
          ← Prev
        </button>
        <div>
          <h3 className="text-lg font-bold leading-tight">
            Day {day} — Around the League
            {isPlayoffDay && <span className="ml-2 text-xs font-bold uppercase tracking-wide align-middle" style={{ color: '#d97706' }}>Playoffs</span>}
          </h3>
          <p className="text-xs text-[var(--text-sec)]">{finals}/{games.length} final</p>
        </div>
        <button className={navBtn} disabled={next === null} onClick={() => next !== null && setPicked(next)} aria-label="Next day">
          Next →
        </button>
        {fallback !== null && day !== fallback && (
          <button className="ml-auto text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }} onClick={() => setPicked(fallback)}>
            Latest results
          </button>
        )}
      </div>

      {games.length === 0 ? (
        <div className="text-center text-[var(--text-sec)] py-12">No games this day</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {games.map(g => (
            <ScoreCard key={g.gameId} g={g} teamById={teamById} userTeamId={userTeamId} />
          ))}
        </div>
      )}
    </section>
  );
}

function ScoreCard({ g, teamById, userTeamId }: { g: ScoreboardGame; teamById: Map<string, BasketballTeam>; userTeamId: string | null }) {
  const involvesUser = userTeamId !== null && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId);
  const status = g.played ? (g.overtimes > 0 ? `Final/${g.overtimes > 1 ? g.overtimes : ''}OT` : 'Final') : 'Scheduled';
  const row = (teamId: string, score: number | null, top: ScoreboardGame['topHome'], side: 'away' | 'home') => {
    const t = teamById.get(teamId);
    const won = g.winnerId === teamId;
    const lost = g.played && !won;
    const isUser = teamId === userTeamId;
    return (
      <div className={`flex items-center gap-2 py-1 ${lost ? 'opacity-60' : ''}`}>
        {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className={`truncate text-sm ${won ? 'font-bold' : 'font-medium'}`} style={{ color: isUser ? 'var(--accent)' : undefined }}>
            {t ? `${t.city} ${t.name}` : teamId}
            {side === 'home' && <span className="ml-1 text-[10px] text-[var(--text-sec)] font-normal">home</span>}
          </div>
          {top && (
            <div className="text-[11px] text-[var(--text-sec)] truncate tabular-nums">
              {top.name} · {top.points} pts, {top.rebounds} reb, {top.assists} ast
            </div>
          )}
        </div>
        {score !== null && (
          <span className={`text-xl tabular-nums ${won ? 'font-black' : 'font-semibold'}`}>
            {score}
          </span>
        )}
      </div>
    );
  };
  return (
    <Link
      href={`/game/${g.gameId}`}
      className={`block rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 h-full shadow-sm hover:border-[var(--accent)] hover:shadow-md active:scale-[0.98] transition-all ${
        involvesUser ? 'ring-1 ring-[var(--accent)]' : ''
      }`}
    >
      {row(g.awayTeamId, g.awayScore, g.topAway, 'away')}
      <div className="border-t border-[var(--border)]" />
      {row(g.homeTeamId, g.homeScore, g.topHome, 'home')}
      <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
        <span className={g.played ? 'text-[var(--text-sec)]' : 'text-[var(--accent)]'}>{status}</span>
        <span className="flex items-center gap-2">
          {g.isPlayoff && <span style={{ color: '#d97706' }}>Playoffs</span>}
          <span className="text-[var(--accent)] normal-case tracking-normal font-semibold">{g.played ? 'Box Score →' : 'Preview →'}</span>
        </span>
      </div>
    </Link>
  );
}

// ===========================================================================
// Schedule — the user's season as card rows (football parity)
// ===========================================================================

function ScheduleView({ league, ext }: { league: LeagueT; ext: Map<string, ExtendedTeamStanding> }) {
  const uid = league.userTeamId ?? null;
  const teamById = useMemo(() => new Map((league.teams as BasketballTeam[]).map(t => [t.id, t])), [league]);
  const games = useMemo<GameT[]>(
    () => (uid ? league.games.filter(g => g.homeTeamId === uid || g.awayTeamId === uid).sort((a, b) => dayOf(a) - dayOf(b)) : []),
    [league, uid],
  );
  const nextGameId = games.find(g => g.status !== 'played')?.id ?? null;
  const nextRef = useRef<HTMLAnchorElement | null>(null);

  // Land on the next game rather than Day 1 of an 82-game list.
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  if (!uid) {
    return <p className="text-sm text-[var(--text-sec)]">Pick a team to see its schedule.</p>;
  }
  if (games.length === 0) {
    return <div className="text-center text-[var(--text-sec)] py-12">No games scheduled yet</div>;
  }

  let w = 0, l = 0;
  for (const g of games) {
    if (g.status !== 'played' || !g.finalScore) continue;
    const isHome = g.homeTeamId === uid;
    const us = isHome ? g.finalScore.home : g.finalScore.away;
    const them = isHome ? g.finalScore.away : g.finalScore.home;
    if (us > them) w++; else l++;
  }
  const remaining = games.length - w - l;
  const recordOf = (teamId: BasketballTeam['id']) => {
    const s = ext.get(teamId);
    const t = teamById.get(teamId);
    const wins = s?.wins ?? t?.record.wins ?? 0;
    const losses = s?.losses ?? t?.record.losses ?? 0;
    return `${wins}–${losses}`;
  };

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-lg font-bold">Your Schedule</h3>
        <span className="text-xs text-[var(--text-sec)] tabular-nums">
          {w}–{l}{remaining > 0 ? ` · ${remaining} game${remaining === 1 ? '' : 's'} left` : ' · complete'}
        </span>
      </div>
      <div className="space-y-2">
        {games.map(g => {
          const isHome = g.homeTeamId === uid;
          const oppId = isHome ? g.awayTeamId : g.homeTeamId;
          const opp = teamById.get(oppId);
          const played = g.status === 'played' && !!g.finalScore;
          const us = played ? (isHome ? g.finalScore!.home : g.finalScore!.away) : 0;
          const them = played ? (isHome ? g.finalScore!.away : g.finalScore!.home) : 0;
          const won = played && us > them;
          const isNext = g.id === nextGameId;
          const isPlayoff = !!gameSD(g).isPlayoff;
          return (
            <Link
              key={g.id}
              href={`/game/${g.id}`}
              ref={isNext ? nextRef : undefined}
              className={`flex items-center gap-3 sm:gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 sm:px-5 py-3 shadow-sm hover:border-[var(--accent)] hover:shadow-md active:scale-[0.99] transition-all ${
                played ? (won ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500') : ''
              } ${isNext ? 'ring-1 ring-[var(--accent)]' : ''}`}
            >
              <div className="flex items-center gap-2 sm:gap-3 w-[96px] sm:w-32 shrink-0">
                <span className="text-xs text-[var(--text-sec)] tabular-nums w-12">Day {dayOf(g)}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isHome ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-sec)]'
                  }`}
                >
                  {isHome ? 'Home' : 'Away'}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                {opp && <TeamLogo abbreviation={opp.abbreviation} primaryColor={opp.primaryColor} secondaryColor={opp.secondaryColor} size="sm" />}
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    <span className="text-[var(--text-sec)] font-normal">{isHome ? 'vs' : '@'}</span>{' '}
                    <span className="sm:hidden">{opp?.abbreviation ?? '—'}</span>
                    <span className="hidden sm:inline">{opp ? `${opp.city} ${opp.name}` : '—'}</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-sec)] tabular-nums">
                    {recordOf(oppId)}
                    {isPlayoff && <span className="ml-1.5 font-bold uppercase" style={{ color: '#d97706' }}>Playoffs</span>}
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2 sm:gap-3">
                {played ? (
                  <>
                    <span className="font-mono font-bold tabular-nums text-sm">{us}–{them}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        won ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'
                      }`}
                    >
                      {won ? 'W' : 'L'}
                    </span>
                    <span className="hidden sm:inline text-xs font-semibold text-[var(--accent)]">Box Score</span>
                    <span className="sm:hidden text-[var(--text-sec)]" aria-hidden>›</span>
                  </>
                ) : isNext ? (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[var(--accent)] text-white">
                    Next
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text-sec)]">Preview ›</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        Go to the dashboard
      </Link>
    </main>
  );
}
