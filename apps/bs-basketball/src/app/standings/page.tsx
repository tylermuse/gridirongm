'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { TeamRosterModal } from '@/components/modals/TeamRosterModal';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { TRADE_DEADLINE_DAY } from '@/lib/sim/simRange';
import { clinchMarks, CLINCH_LEGEND, type ClinchMark } from '@/lib/standings/clinch';
import {
  computeExtendedStandings, defaultScoreboardDay, scoreboardDays, scoreboardForDay, fmtWL, gamesBehind,
  type ExtendedTeamStanding, type ScoreboardGame,
} from '@/lib/standings/extendedStandings';
import { seedConferences } from '@/lib/playoffs/seeding';
import type { BasketballTeam } from '@bs/sport-basketball';

type Grouping = 'conference' | 'division' | 'league';
const DIVISIONS_BY_CONF: Record<string, string[]> = {
  Eastern: ['Atlantic', 'Central', 'Southeast'],
  Western: ['Northwest', 'Pacific', 'Southwest'],
};

/**
 * /standings — standings by conference.
 *
 * Records/splits come from league.games via lib/standings/extendedStandings.
 * Conference view orders teams by the real playoff seeding (lib/playoffs/
 * seeding.ts) and draws the playoff (1-6) and play-in (7-10) cut lines.
 * GB is computed against the group's best record. A Scores tab browses the
 * league-wide scoreboard by day.
 *
 * User's team row is highlighted with the accent color.
 *
 * Quick-action: 'Sim Day' button up top advances the season by one day.
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
const divStripe = (t: BasketballTeam) => `inset 3px 0 0 ${DIVISION_COLORS[sd(t).division] ?? 'transparent'}`;

export default function StandingsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { simDay, simRange, loading: storeLoading } = useLeagueStore();
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [view, setView] = useState<'standings' | 'scores' | 'schedule'>('standings');
  const [grouping, setGrouping] = useState<Grouping>('conference');

  const byStanding = (a: BasketballTeam, b: BasketballTeam) => {
    if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
    if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
    return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
  };

  // Groups of teams to render as separate tables, per the chosen grouping.
  const groups = useMemo<{ label: string; teams: BasketballTeam[] }[]>(() => {
    if (!league) return [];
    const all = league.teams as BasketballTeam[];
    if (grouping === 'league') {
      return [{ label: 'League', teams: [...all].sort(byStanding) }];
    }
    if (grouping === 'division') {
      const out: { label: string; teams: BasketballTeam[] }[] = [];
      for (const conf of ['Eastern', 'Western'] as const)
        for (const division of DIVISIONS_BY_CONF[conf])
          out.push({ label: `${division}`, teams: all.filter(t => sd(t).division === division).sort(byStanding) });
      return out;
    }
    // Conference: follow the real seeding order (tiebreakers applied) for the
    // top 10, then the rest by record.
    const seeds = seedConferences(league);
    const byId = new Map(all.map(t => [t.id, t]));
    return (['Eastern', 'Western'] as const).map(conf => {
      const seeded = seeds[conf];
      const rest = all.filter(t => sd(t).conference === conf && !seeded.includes(t.id)).sort(byStanding);
      return {
        label: `${conf} Conference`,
        teams: [...seeded.map(id => byId.get(id)).filter((t): t is BasketballTeam => !!t), ...rest],
      };
    });
  }, [league, grouping]);

  const ext = useMemo(() => (league ? computeExtendedStandings(league) : new Map<string, ExtendedTeamStanding>()), [league]);

  const marks = useMemo(() => (league ? clinchMarks(league) : new Map<string, ClinchMark>()), [league]);
  const anyMarks = useMemo(() => [...marks.values()].some(Boolean), [marks]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const gamesPlayed = league.games.filter(g => g.status === 'played').length;
  const totalGames = league.games.length;
  const regularSeasonDone = !league.games.some(g => g.status === 'scheduled');

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Home
      </Link>

      <header className="flex flex-wrap items-baseline gap-4 mt-2 mb-6">
        <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          Standings
        </h1>
        <p className="text-sm opacity-70">
          Season {league.currentSeason} · Day {league.currentTick} · {gamesPlayed} / {totalGames} games played
        </p>
        {regularSeasonDone ? (
          <Link
            href="/playoffs"
            className="ml-auto px-4 py-2 rounded-lg font-bold transition"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            🏆 Playoffs →
          </Link>
        ) : (
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => void simDay()}
              disabled={storeLoading}
              className="px-4 py-2 rounded-lg font-bold transition disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {storeLoading ? 'Simming…' : 'Sim Day'}
            </button>
            <button
              onClick={() => void simRange('week')}
              disabled={storeLoading}
              className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              Sim Week
            </button>
            {league.currentTick <= TRADE_DEADLINE_DAY && (
              <button
                onClick={() => void simRange('deadline')}
                disabled={storeLoading}
                className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              >
                Sim to Deadline
              </button>
            )}
            <button
              onClick={() => void simRange('season')}
              disabled={storeLoading}
              className="px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50 border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              Sim Season
            </button>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
          {(['standings', 'scores', 'schedule'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className="px-3 py-1.5 capitalize" style={view === v ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{v}</button>
          ))}
        </div>
        {view === 'standings' && (
          <div className="inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            {(['division', 'conference', 'league'] as const).map(g => (
              <button key={g} onClick={() => setGrouping(g)} className="px-3 py-1.5 capitalize" style={grouping === g ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{g}</button>
            ))}
          </div>
        )}
        {view === 'standings' && anyMarks && (
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[var(--text-sec)] ml-auto">
            {CLINCH_LEGEND.map(l => (
              <span key={l.mark} className="inline-flex items-center gap-1">
                <span className="font-bold tabular-nums" style={{ color: l.color }}>{l.mark}</span>{l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {gamesPlayed === 0 && view === 'standings' && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🏀"
            title="Day 1. Nobody's 0–0 forever."
            message="Tip off the season and start writing your record. 82 games to a playoff spot."
            action={{ label: 'Sim Day →', onClick: () => void simDay() }}
          />
        </div>
      )}

      {view === 'standings' && (
        <>
          <div className="flex flex-col gap-6">
            {groups.map(g => (
              <ConferenceTable
                key={g.label}
                label={g.label}
                teams={g.teams}
                ext={ext}
                showSeedLines={grouping === 'conference'}
                userTeamId={league.userTeamId ?? null}
                marks={marks}
                onRosterClick={setRosterTeamId}
              />
            ))}
          </div>
          <SeedingNote grouping={grouping} />
        </>
      )}
      {view === 'scores' && <ScoresView league={league} />}
      {view === 'schedule' && <ScheduleView league={league} />}

      <TeamRosterModal
        teamId={rosterTeamId}
        onClose={() => setRosterTeamId(null)}
        onPlayerClick={pid => { setRosterTeamId(null); setModalPlayerId(pid); }}
      />
      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

// ===========================================================================
// Components
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

function ConferenceTable({
  label, teams, ext, showSeedLines, userTeamId, marks, onRosterClick,
}: {
  label: string;
  teams: BasketballTeam[];
  ext: Map<string, ExtendedTeamStanding>;
  showSeedLines: boolean;
  userTeamId: string | null;
  marks: Map<string, ClinchMark>;
  onRosterClick: (teamId: string) => void;
}) {
  const rec = (t: BasketballTeam) => ext.get(t.id) ?? { wins: t.record.wins, losses: t.record.losses };
  // GB vs the best record in the group (seeding order can put a tiebreak
  // winner first, but GB is always vs the top record).
  const leader = teams.reduce<BasketballTeam | null>((best, t) => {
    if (!best) return t;
    const a = rec(t), b = rec(best);
    return a.wins - a.losses > b.wins - b.losses ? t : best;
  }, null);
  const COLS = 14;
  const th = 'px-2 py-1.5 text-right font-semibold whitespace-nowrap';
  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        {label}
      </h2>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-[var(--text-sec)]">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Team</th>
              <th className={th}>W</th>
              <th className={th}>L</th>
              <th className={th}>PCT</th>
              <th className={th}>GB</th>
              <th className={th}>Conf</th>
              <th className={th}>Home</th>
              <th className={th}>Away</th>
              <th className={th}>PPG</th>
              <th className={th}>Opp</th>
              <th className={th}>Diff</th>
              <th className={th}>Strk</th>
              <th className="px-2 py-1.5 text-left font-semibold pl-3 whitespace-nowrap">L10</th>
              <th className="px-2 py-1 w-9" aria-label="Roster" />
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
              return (
                <Fragment key={t.id}>
                  {showSeedLines && i === 6 && <CutLine label="Play-in" colSpan={COLS} />}
                  {showSeedLines && i === 10 && <CutLine label="Lottery" colSpan={COLS} />}
                  <tr
                    className="border-t"
                    style={{
                      borderColor: 'var(--border)',
                      background: isUser ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
                      boxShadow: divStripe(t),
                    }}
                  >
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-xs w-5 tabular-nums font-semibold" style={{ color: showSeedLines ? seedTone(i) : undefined, opacity: showSeedLines && i < 10 ? 1 : 0.5 }}>{i + 1}.</span>
                        {mark && <span className="text-[10px] font-bold tabular-nums w-2.5 -ml-1" style={{ color: MARK_COLOR[mark] }} title={mark}>{mark}</span>}
                        <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />
                        <Link href={`/team/${t.id}`} className="font-semibold hover:underline whitespace-nowrap" style={{ color: isUser ? 'var(--accent)' : undefined }}>
                          {t.city}
                        </Link>
                        <span className="text-xs text-[var(--text-sec)] truncate hidden lg:inline">{t.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold">{wins}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{losses}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{pct.toFixed(3).replace(/^0/, '')}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtGb(gb)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.conf) : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.home) : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-[var(--text-sec)]">{s ? fmtWL(s.away) : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{s && s.gp > 0 ? s.ppg.toFixed(1) : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{s && s.gp > 0 ? s.oppPpg.toFixed(1) : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-semibold" style={{ color: diff > 0 ? WIN_C : diff < 0 ? LOSS_C : undefined }}>
                      {s && s.gp > 0 ? fmtDiff(diff) : '—'}
                    </td>
                    <td className="px-2 py-1 text-right"><Streak s={s} /></td>
                    <td className="px-2 py-1 pl-3 whitespace-nowrap"><Last10 s={s} /></td>
                    <td className="px-2 py-1 text-center">
                      <button
                        onClick={() => onRosterClick(t.id)}
                        title={`View ${t.city} roster`}
                        aria-label={`View ${t.city} roster`}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors"
                      >
                        👁
                      </button>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="sm:hidden">
        {teams.map((t, i) => {
          const s = ext.get(t.id);
          const wins = s?.wins ?? t.record.wins;
          const losses = s?.losses ?? t.record.losses;
          const pct = s?.pct ?? 0;
          const gb = leader && leader !== t ? gamesBehind(rec(leader), { wins, losses }) : 0;
          const diff = s?.diffPerGame ?? 0;
          const isUser = userTeamId === t.id;
          const mark = marks.get(t.id);
          return (
            <Fragment key={t.id}>
              {showSeedLines && (i === 6 || i === 10) && (
                <li aria-hidden className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] border-t border-dashed" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  {i === 6 ? 'Play-in' : 'Lottery'}
                </li>
              )}
              <li
                className="p-3 border-t first:border-t-0"
                style={{
                  borderColor: 'var(--border)',
                  background: isUser ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined,
                  boxShadow: divStripe(t),
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs w-5 tabular-nums font-semibold" style={{ color: showSeedLines ? seedTone(i) : undefined, opacity: showSeedLines && i < 10 ? 1 : 0.5 }}>{i + 1}.</span>
                  {mark && <span className="text-[10px] font-bold tabular-nums -ml-1" style={{ color: MARK_COLOR[mark] }}>{mark}</span>}
                  <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />
                  <Link href={`/team/${t.id}`} className="font-semibold hover:underline truncate" style={{ color: isUser ? 'var(--accent)' : undefined }}>
                    {t.city} <span className="text-[var(--text-sec)] font-normal">{t.name}</span>
                  </Link>
                  <button
                    onClick={() => onRosterClick(t.id)}
                    aria-label={`View ${t.city} roster`}
                    className="ml-auto w-11 h-11 inline-flex items-center justify-center rounded-md text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--accent)] transition-colors"
                  >
                    👁
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 pl-7 text-sm">
                  <span className="font-semibold tabular-nums">{wins}–{losses}</span>
                  <span className="tabular-nums text-[var(--text-sec)]">{pct.toFixed(3).replace(/^0/, '')}</span>
                  <span className="tabular-nums text-[var(--text-sec)]">GB {fmtGb(gb)}</span>
                  <span className="tabular-nums" style={{ color: diff > 0 ? WIN_C : diff < 0 ? LOSS_C : undefined }}>
                    {s && s.gp > 0 ? fmtDiff(diff) : '—'}
                  </span>
                  <Streak s={s} />
                  <span className="ml-auto text-xs text-[var(--text-sec)]">L10 <Last10 s={s} /></span>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </section>
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

function ScoresView({ league }: { league: LeagueT }) {
  const days = useMemo(() => scoreboardDays(league), [league]);
  const fallback = useMemo(() => defaultScoreboardDay(league), [league]);
  const [picked, setPicked] = useState<number | null>(null);
  const day = picked !== null && days.includes(picked) ? picked : fallback;
  const games = useMemo(() => (day === null ? [] : scoreboardForDay(league, day)), [league, day]);
  const teamById = useMemo(() => new Map((league.teams as BasketballTeam[]).map(t => [t.id, t])), [league]);

  if (day === null || days.length === 0) {
    return <p className="text-sm text-[var(--text-sec)]">No games on the schedule.</p>;
  }
  const idx = days.indexOf(day);
  const prev = idx > 0 ? days[idx - 1] : null;
  const next = idx < days.length - 1 ? days[idx + 1] : null;
  const finals = games.filter(g => g.played).length;
  const isPlayoffDay = games.some(g => g.isPlayoff);
  const navBtn = 'px-3 py-1.5 rounded-lg border text-sm font-semibold transition disabled:opacity-40 hover:bg-[var(--surface-2)]';

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button className={navBtn} style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} disabled={prev === null} onClick={() => prev !== null && setPicked(prev)} aria-label="Previous day">
          ← Prev
        </button>
        <div>
          <h3 className="text-lg font-bold leading-tight">
            Day {day}{isPlayoffDay && <span className="ml-2 text-xs font-bold uppercase tracking-wide align-middle" style={{ color: '#d97706' }}>Playoffs</span>}
          </h3>
          <p className="text-xs text-[var(--text-sec)]">{finals}/{games.length} final</p>
        </div>
        <button className={navBtn} style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} disabled={next === null} onClick={() => next !== null && setPicked(next)} aria-label="Next day">
          Next →
        </button>
        {fallback !== null && day !== fallback && (
          <button className="ml-auto text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }} onClick={() => setPicked(fallback)}>
            Latest results
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {games.map(g => (
          <ScoreCard key={g.gameId} g={g} teamById={teamById} userTeamId={league.userTeamId ?? null} />
        ))}
      </div>
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
    return (
      <div className="flex items-center gap-2 py-1">
        {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className={`truncate ${won ? 'font-bold' : 'font-medium'}`} style={{ color: lost ? 'var(--text-sec)' : undefined }}>
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
          <span className={`text-xl tabular-nums ${won ? 'font-black' : 'font-semibold'}`} style={{ color: lost ? 'var(--text-sec)' : undefined }}>
            {score}
          </span>
        )}
      </div>
    );
  };
  const body = (
    <div
      className="rounded-xl border bg-[var(--surface)] px-3 py-2 h-full transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: involvesUser ? 'var(--accent)' : 'var(--border)' }}
    >
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider mb-0.5">
        <span style={{ color: g.played ? 'var(--foreground)' : 'var(--text-sec)' }}>{status}</span>
        {g.isPlayoff && <span style={{ color: '#d97706' }}>Playoffs</span>}
      </div>
      {row(g.awayTeamId, g.awayScore, g.topAway, 'away')}
      <div className="border-t" style={{ borderColor: 'var(--border)' }} />
      {row(g.homeTeamId, g.homeScore, g.topHome, 'home')}
    </div>
  );
  return g.played ? <Link href={`/game/${g.gameId}`} className="block">{body}</Link> : body;
}

function ScheduleView({ league }: { league: NonNullable<ReturnType<typeof useLeagueOrHydrate>['league']> }) {
  const uid = league.userTeamId;
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id, t]));
  if (!uid) {
    return <p className="text-sm text-[var(--text-sec)]">Pick a team to see its schedule.</p>;
  }
  const dayOf = (g: { sportData: unknown }) => (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
  const games = league.games
    .filter(g => g.homeTeamId === uid || g.awayTeamId === uid)
    .sort((a, b) => dayOf(a) - dayOf(b));

  return (
    <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {games.map(g => {
        const isHome = g.homeTeamId === uid;
        const opp = teamById.get(isHome ? g.awayTeamId : g.homeTeamId);
        const played = g.status === 'played' && !!g.finalScore;
        const us = played ? (isHome ? g.finalScore!.home : g.finalScore!.away) : 0;
        const them = played ? (isHome ? g.finalScore!.away : g.finalScore!.home) : 0;
        const won = played && us > them;
        const row = (
          <div className="flex items-center gap-2 px-4 py-1.5 text-sm border-t first:border-t-0 hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
            <span className="w-14 text-xs text-[var(--text-sec)] tabular-nums">Day {dayOf(g)}</span>
            <span className="text-xs text-[var(--text-sec)] w-5">{isHome ? 'vs' : '@'}</span>
            {opp && <TeamLogo abbreviation={opp.abbreviation} primaryColor={opp.primaryColor} secondaryColor={opp.secondaryColor} size="xs" />}
            <span className="font-semibold flex-1 truncate">{opp ? `${opp.city} ${opp.name}` : '—'}</span>
            {played
              ? <span className="text-sm font-black tabular-nums" style={{ color: won ? '#10b981' : '#dc2626' }}>{won ? 'W' : 'L'} {us}–{them}</span>
              : <span className="text-xs text-[var(--text-sec)]">scheduled</span>}
          </div>
        );
        return played ? <Link key={g.id} href={`/game/${g.id}`}>{row}</Link> : <div key={g.id}>{row}</div>;
      })}
    </div>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Home
      </Link>
    </main>
  );
}
