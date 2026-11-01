'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PlayerName, usePlayerModal } from '@/components/modals/PlayerModalProvider';
import { dropConfetti } from '@/lib/ui/confetti';
import { LiveViewer } from '@/components/live/LiveViewer';
import { hasPlayLog } from '@/lib/live/fromPlayLog';
import { dayOf, gameSD } from '@/lib/standings/extendedStandings';
import type {
  BasketballGameData,
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';

/**
 * /game/[gameId] — box score (football BoxScoreModal / BoxScore parity).
 *
 * Played games: score header (Day · Season, Playoffs tag, losing side
 * dimmed), an auto recap, the line score, game leaders, a Team Stats
 * comparison with dual team-color bars, then the box score itself — Away |
 * Home tabs, Starters / Bench split, sortable columns, pinned name column.
 *
 * Unplayed games get a pregame card (logos, records, day, team links) instead
 * of a dead end.
 */

type LeagueT = NonNullable<ReturnType<typeof useLeagueOrHydrate>['league']>;
type GameT = LeagueT['games'][number];
type Line = Partial<BasketballStats>;
type Side = 'away' | 'home';

const n = (s: Line, k: keyof BasketballStats): number => (s[k] as number | undefined) ?? 0;
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const fullName = (t: BasketballTeam) => `${t.city} ${t.name}`;

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const store = useLeagueStore();
  const { league, loading, error } = useLeagueOrHydrate();

  const game = useMemo(() => {
    if (!league) return null;
    return league.games.find(g => g.id === params.gameId) ?? null;
  }, [league, params.gameId]);

  const homeTeam = useMemo<BasketballTeam | null>(() => {
    if (!league || !game) return null;
    return (league.teams.find(t => t.id === game.homeTeamId) as BasketballTeam | undefined) ?? null;
  }, [league, game]);

  const awayTeam = useMemo<BasketballTeam | null>(() => {
    if (!league || !game) return null;
    return (league.teams.find(t => t.id === game.awayTeamId) as BasketballTeam | undefined) ?? null;
  }, [league, game]);

  // Prev/Next navigation. For a game involving the user's team this walks the
  // USER's own schedule (not every game in the league) — and when you're caught
  // up to your latest played game, "Next" SIMS your next game rather than
  // dead-ending, which is what the chevrons are really for. Viewing some other
  // team's game keeps the plain league-wide played-game flip.
  const { prevId, nextId, canSimNext } = useMemo(() => {
    const none = { prevId: null as string | null, nextId: null as string | null, canSimNext: false };
    if (!league || !game) return none;
    const byDate = (a: typeof league.games[number], b: typeof league.games[number]) =>
      (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id);
    const uid = league.userTeamId;
    const isUserGame = !!uid && (game.homeTeamId === uid || game.awayTeamId === uid);

    if (uid && isUserGame) {
      const mine = league.games
        .filter(g => g.homeTeamId === uid || g.awayTeamId === uid)
        .sort(byDate);
      const i = mine.findIndex(g => g.id === params.gameId);
      // Prev = your previous already-played game.
      let prevId: string | null = null;
      for (let k = i - 1; k >= 0; k--) { if (mine[k].status === 'played') { prevId = mine[k].id; break; } }
      // Next = the next game on your schedule: navigate if it's played, sim it if not.
      const next = i >= 0 && i < mine.length - 1 ? mine[i + 1] : null;
      if (next?.status === 'played') return { prevId, nextId: next.id, canSimNext: false };
      return { prevId, nextId: null, canSimNext: !!next && next.status === 'scheduled' };
    }

    const played = league.games.filter(g => g.status === 'played').sort(byDate);
    const i = played.findIndex(g => g.id === params.gameId);
    return {
      prevId: i > 0 ? played[i - 1].id : null,
      nextId: i >= 0 && i < played.length - 1 ? played[i + 1].id : null,
      canSimNext: false,
    };
  }, [league, game, params.gameId]);

  async function simNext() {
    const id = await store.simNextUserGame();
    if (id) router.push(`/game/${id}`);
  }

  // The user's most recent played game.
  const latestUserPlayedId = useMemo(() => {
    if (!league?.userTeamId) return null;
    const uid = league.userTeamId;
    const mine = league.games
      .filter(g => (g.homeTeamId === uid || g.awayTeamId === uid) && g.status === 'played')
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
    return mine.length ? mine[mine.length - 1].id : null;
  }, [league]);

  // Follow the sim forward: if you're viewing your latest game and a newer one
  // gets played (e.g. via the top-nav "Sim Day"), jump the view to it. Only
  // auto-advances when you were already caught up, so reviewing an OLD game with
  // Prev/Next isn't hijacked the moment the league simulates.
  const caughtUpRef = useRef(false);
  useEffect(() => {
    if (params.gameId === latestUserPlayedId) { caughtUpRef.current = true; return; }
    if (caughtUpRef.current && latestUserPlayedId) {
      router.replace(`/game/${latestUserPlayedId}`);
    }
  }, [latestUserPlayedId, params.gameId, router]);

  // Confetti when the user's team won this game — once per viewed game.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!league?.userTeamId || !game || game.status !== 'played' || !game.finalScore) return;
    const userId = league.userTeamId;
    const inGame = game.homeTeamId === userId || game.awayTeamId === userId;
    if (!inGame) return;
    const userScore = game.homeTeamId === userId ? game.finalScore.home : game.finalScore.away;
    const oppScore = game.homeTeamId === userId ? game.finalScore.away : game.finalScore.home;
    if (userScore > oppScore && celebratedRef.current !== game.id) {
      celebratedRef.current = game.id;
      dropConfetti();
    }
  }, [league?.userTeamId, game]);

  if (loading && !league) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!game) return <NotFound message="Game not found." />;
  if (!homeTeam || !awayTeam) return <NotFound message="Game references missing teams." />;

  const uid = league.userTeamId ?? null;
  const isUserGame = !!uid && (game.homeTeamId === uid || game.awayTeamId === uid);
  const played = game.status === 'played' && !!game.finalScore;

  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      {/* Prev/next flip through games; the left link returns to the list
          this game lives in (your schedule, or the league scoreboard). */}
      <div className="flex items-center justify-between">
        <Link
          href={isUserGame ? '/standings?view=schedule' : '/standings?view=scores'}
          className="text-sm font-semibold text-[var(--text-sec)] hover:text-[var(--accent)] transition-colors"
        >
          {isUserGame ? 'Schedule' : 'Scores'}
        </Link>
        <div className="flex items-center gap-2">
          {prevId
            ? <Link href={`/game/${prevId}`} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)] transition-colors" style={{ color: 'var(--accent)' }} title="Previous game">‹ Prev</Link>
            : <span className="text-sm opacity-30 px-2 py-1">‹ Prev</span>}
          {nextId
            ? <Link href={`/game/${nextId}`} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)] transition-colors" style={{ color: 'var(--accent)' }} title="Next game">Next ›</Link>
            : canSimNext && played
              ? <button onClick={() => void simNext()} disabled={store.loading} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50" style={{ color: 'var(--accent)' }} title="Simulate your next game">{store.loading ? 'Simming…' : 'Sim Next ›'}</button>
              : <span className="text-sm opacity-30 px-2 py-1">Next ›</span>}
        </div>
      </div>

      {played ? (
        <BoxScoreView key={game.id} league={league} game={game} home={homeTeam} away={awayTeam} />
      ) : (
        <PregameCard game={game} home={homeTeam} away={awayTeam} isUserGame={isUserGame} />
      )}
    </main>
  );
}

// ===========================================================================
// Header bits shared by the pregame + final views
// ===========================================================================

function GameMeta({ game }: { game: GameT }) {
  const isPlayoff = !!gameSD(game).isPlayoff;
  return (
    <div className="text-xs text-[var(--text-sec)] text-center mb-3 flex items-center justify-center gap-2">
      <span>Day {dayOf(game)} · Season {game.season}</span>
      {isPlayoff && (
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-600">
          Playoffs
        </span>
      )}
    </div>
  );
}

// ===========================================================================
// Pregame card (unplayed game)
// ===========================================================================

function PregameCard({ game, home, away, isUserGame }: { game: GameT; home: BasketballTeam; away: BasketballTeam; isUserGame: boolean }) {
  const side = (t: BasketballTeam, label: string) => (
    <div className="flex flex-col items-center text-center gap-2 min-w-0">
      <Link href={`/team/${t.id}`} title={fullName(t)} className="transition-transform hover:scale-105">
        <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xl" />
      </Link>
      <div className="min-w-0">
        <div className="text-xs text-[var(--text-sec)] hidden sm:block">{t.city}</div>
        <div className="font-bold truncate">
          <span className="sm:hidden">{t.abbreviation}</span>
          <span className="hidden sm:inline">{t.name}</span>
        </div>
        <div className="text-sm tabular-nums text-[var(--text-sec)]">{t.record.wins}–{t.record.losses}</div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] mt-0.5">{label}</div>
      </div>
    </div>
  );
  return (
    <section className="my-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-sm">
      <GameMeta game={game} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {side(away, 'Away')}
        <div className="text-center">
          <div className="text-2xl font-black text-[var(--text-sec)]">@</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] mt-1">Upcoming</div>
        </div>
        {side(home, 'Home')}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {[away, home].map(t => (
          <Link
            key={t.id}
            href={`/team/${t.id}`}
            className="text-sm font-semibold rounded-lg border border-[var(--border)] px-3 py-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {fullName(t)} →
          </Link>
        ))}
      </div>
      {isUserGame && (
        <p className="mt-4 p-3 rounded-lg bg-[var(--surface-2)] text-sm text-[var(--text-sec)] text-center">
          Use <span className="font-semibold text-[var(--text)]">Sim Day</span> in the top bar or{' '}
          <span className="font-semibold text-[var(--text)]">Watch Live</span> from Home to play this game.
        </p>
      )}
    </section>
  );
}

// ===========================================================================
// Final: box score view
// ===========================================================================

interface PlayerLine { player: BasketballPlayer; stats: Line }

/** Players who appeared for a team (box lines carry no team id, so attribute
 *  via the current roster — same as the rest of the app). */
function teamLines(team: BasketballTeam, game: GameT, playerMap: Record<string, BasketballPlayer>): PlayerLine[] {
  return team.playerIds
    .map(pid => ({ player: playerMap[pid], stats: (game.boxScores[pid] ?? {}) as Line }))
    .filter(({ player, stats }) => !!player && (n(stats, 'minutes') > 0 || n(stats, 'gamesStarted') > 0));
}

function sumLines(lines: PlayerLine[], k: keyof BasketballStats): number {
  return lines.reduce((s, l) => s + n(l.stats, k), 0);
}

function statLine(s: Line): string {
  const parts = [`${n(s, 'points')} pts`];
  if (n(s, 'totalRebounds') >= 5) parts.push(`${n(s, 'totalRebounds')} reb`);
  if (n(s, 'assists') >= 5) parts.push(`${n(s, 'assists')} ast`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function topScorer(lines: PlayerLine[]): PlayerLine | null {
  let best: PlayerLine | null = null;
  for (const l of lines) if (!best || n(l.stats, 'points') > n(best.stats, 'points')) best = l;
  return best && n(best.stats, 'points') > 0 ? best : null;
}

/** Football's auto recap: who beat whom, then the scoring leaders. */
function buildRecap(
  game: GameT, home: BasketballTeam, away: BasketballTeam,
  homeLines: PlayerLine[], awayLines: PlayerLine[], periods: number,
): string {
  const fs = game.finalScore!;
  const homeWon = fs.home > fs.away;
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const ot = periods > 4 ? (periods - 4 === 1 ? ' in overtime' : ` in ${periods - 4} overtimes`) : '';
  const out = [`The ${fullName(winner)} beat the ${fullName(loser)} ${Math.max(fs.home, fs.away)}–${Math.min(fs.home, fs.away)}${ot}.`];
  const wTop = topScorer(homeWon ? homeLines : awayLines);
  const lTop = topScorer(homeWon ? awayLines : homeLines);
  if (wTop) out.push(`${wTop.player.firstName} ${wTop.player.lastName} had ${statLine(wTop.stats)}.`);
  if (lTop) out.push(`${lTop.player.firstName} ${lTop.player.lastName} led the ${loser.name} with ${n(lTop.stats, 'points')}.`);
  return out.join(' ');
}

function BoxScoreView({ league, game, home, away }: { league: LeagueT; game: GameT; home: BasketballTeam; away: BasketballTeam }) {
  const uid = league.userTeamId ?? null;
  const [side, setSide] = useState<Side>(uid === home.id ? 'home' : 'away');
  const [sort, setSort] = useState<{ key: ColKey; dir: 'asc' | 'desc' } | null>(null);
  const [replaying, setReplaying] = useState(false);

  const playerMap = league.players as Record<string, BasketballPlayer>;
  const homeLines = useMemo(() => teamLines(home, game, playerMap), [home, game, playerMap]);
  const awayLines = useMemo(() => teamLines(away, game, playerMap), [away, game, playerMap]);

  const fs = game.finalScore!;
  const homeWon = fs.home > fs.away;
  const gameData = game.sportData as BasketballGameData | undefined;
  const periods = gameData?.periodsPlayed ?? 4;
  const otCount = gameData?.wentToOvertime ? Math.max(1, periods - 4) : 0;
  const realResult = !!(game.sportData as { realResult?: boolean } | undefined)?.realResult;
  const recap = buildRecap(game, home, away, realResult ? [] : homeLines, realResult ? [] : awayLines, otCount ? periods : 4);

  // Bars in team colors; fall back to the home secondary when both teams
  // wear the same primary so the two halves stay distinguishable.
  const awayColor = away.primaryColor;
  const homeColor = home.primaryColor.toLowerCase() === away.primaryColor.toLowerCase() ? home.secondaryColor : home.primaryColor;

  const onSort = (key: ColKey) => {
    setSort(cur => (cur?.key === key ? { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  };

  const shownTeam = side === 'home' ? home : away;
  const shownLines = side === 'home' ? homeLines : awayLines;

  return (
    <>
      {/* Final score header */}
      <section className="my-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-sm">
        <GameMeta game={game} />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <TeamScoreCell team={away} score={fs.away} won={!homeWon} align="left" />
          <div className="text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">
              {otCount ? `Final/${otCount > 1 ? otCount : ''}OT` : 'Final'}
            </div>
            {hasPlayLog(game.sportData) && (
              <button
                onClick={() => setReplaying(true)}
                className="mt-2 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-110"
                style={{ background: 'var(--accent)' }}
                title="Replay the actual game possession by possession"
              >
                ▶ <span className="hidden sm:inline">Watch </span>Replay
              </button>
            )}
          </div>
          <TeamScoreCell team={home} score={fs.home} won={homeWon} align="right" />
        </div>
      </section>

      {/* Auto recap */}
      <p className="mb-6 p-4 rounded-lg bg-[var(--surface-2)] text-sm text-[var(--text-sec)] leading-relaxed">{recap}</p>

      {realResult ? (
        // Real result baked into a mid-season roster import: the score is real,
        // but there's no box score or quarter split to show (and we don't invent one).
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-sec)]">
          Real result from before this league was imported — final score only, no box score.
        </section>
      ) : (
        <>
          {/* Quarter-by-quarter line score + game info (FEAT-24). When the engine
              recorded per-quarter splits we use them; otherwise we fall back to a
              deterministic synthetic split from the final score so the view is
              always present (covers playoff games saved before BUG-30 lost the
              quarterScores in sportData). */}
          {gameData?.quarterScores?.length ? (
            <LineScore away={away} home={home} data={gameData} />
          ) : (
            <LineScoreFallback away={away} home={home} game={game} />
          )}

          <GameLeaders away={away} home={home} awayLines={awayLines} homeLines={homeLines} />

          <TeamStatsCompare
            away={away} home={home} awayLines={awayLines} homeLines={homeLines}
            awayColor={awayColor} homeColor={homeColor}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">Box Score</h2>
            <SegmentedControl
              variant="secondary"
              size="sm"
              value={side}
              onChange={setSide}
              options={[
                { value: 'away', label: `${away.city} (Away)` },
                { value: 'home', label: `${home.city} (Home)` },
              ]}
            />
          </div>
          <BoxScoreTable team={shownTeam} lines={shownLines} sort={sort} onSort={onSort} />
        </>
      )}

      {replaying && (
        <LiveViewer userGameId={game.id} dayGameIds={[game.id]} onClose={() => setReplaying(false)} />
      )}
    </>
  );
}

function TeamScoreCell({
  team, score, won, align,
}: {
  team: BasketballTeam;
  score: number;
  won: boolean;
  align: 'left' | 'right';
}) {
  const logo = (
    <Link href={`/team/${team.id}`} title={fullName(team)} className="shrink-0">
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
    </Link>
  );
  const name = (
    <Link href={`/team/${team.id}`} className={`hidden sm:block min-w-0 hover:text-[var(--accent)] transition-colors ${align === 'right' ? 'text-right' : ''}`}>
      <div className="text-xs text-[var(--text-sec)] truncate">{team.city}</div>
      <div className="font-bold truncate">{team.name}</div>
    </Link>
  );
  const scoreEl = (
    <div className="text-3xl sm:text-4xl font-black tabular-nums text-[var(--text)]">{score}</div>
  );
  return (
    <div className={`flex items-center gap-2 sm:gap-3 min-w-0 ${align === 'right' ? 'justify-end' : 'justify-start'} ${won ? '' : 'opacity-60'}`}>
      {align === 'left' ? <>{logo}{name}{scoreEl}</> : <>{scoreEl}{name}{logo}</>}
    </div>
  );
}

// ===========================================================================
// Line score
// ===========================================================================

function LineScore({ away, home, data }: { away: BasketballTeam; home: BasketballTeam; data: BasketballGameData }) {
  const qs = data.quarterScores;
  const labels = qs.map((_, i) => (i < 4 ? `Q${i + 1}` : qs.length - 4 > 1 ? `OT${i - 3}` : 'OT'));
  const rows: { team: BasketballTeam; side: Side }[] = [
    { team: away, side: 'away' },
    { team: home, side: 'home' },
  ];
  const leadTeam = data.biggestLead.team === 'home' ? home : away;
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-[var(--text-sec)]">
            <th className="px-3 py-2 text-left font-semibold">Team</th>
            {labels.map((l, i) => <th key={i} className="px-3 py-2 text-center font-semibold">{l}</th>)}
            <th className="px-3 py-2 text-center font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, side }) => (
            <tr key={side} className="border-t border-[var(--border)]">
              <td className="px-3 py-1.5 font-semibold">{team.abbreviation}</td>
              {qs.map((q, i) => <td key={i} className="px-3 py-1.5 text-center tabular-nums">{q[side]}</td>)}
              <td className="px-3 py-1.5 text-center font-bold tabular-nums">{qs.reduce((s, q) => s + q[side], 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-[var(--text-sec)] border-t border-[var(--border)] flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Biggest lead: <span className="font-semibold">{leadTeam.abbreviation} +{data.biggestLead.points}</span></span>
        <span>· {data.totalPossessions} possessions</span>
        <span>· {data.pace} pace</span>
        {data.wentToOvertime ? <span>· {data.periodsPlayed - 4} OT</span> : null}
      </div>
    </section>
  );
}

/**
 * Synthetic line score for games where the engine did not persist quarter
 * splits (older saves + playoff games simmed before BUG-30 landed). We rebuild
 * a plausible 4-quarter breakdown from the final score using a small seeded
 * RNG keyed on the game id, so the split is deterministic across reloads:
 * same game → same Q1/Q2/Q3/Q4 every time.
 *
 * The split favors a mild halftime bump (Q2 + Q3 a touch lower than Q1 + Q4
 * to approximate NBA rest-pace patterns) and balances rounding so the four
 * quarters always sum to the real total.
 */
function LineScoreFallback({
  away, home, game,
}: {
  away: BasketballTeam;
  home: BasketballTeam;
  game: { id: string; finalScore: { home: number; away: number } | null };
}) {
  // Defensive: the outer page already short-circuits unplayed games, but the
  // type is nullable upstream.
  if (!game.finalScore) return null;
  const finalScore = game.finalScore;
  const splitTotal = (total: number, seed: string): number[] => {
    // Tiny deterministic RNG (xfnv1 hash → mulberry-style step).
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const next = () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // Base each quarter at total/4, jitter ±15% with a slight Q2/Q3 dip.
    const base = total / 4;
    const weights = [1.04, 0.96, 0.96, 1.04].map(w => w * (0.88 + next() * 0.24));
    const wSum = weights.reduce((s, w) => s + w, 0);
    const raw = weights.map(w => Math.round((base * 4) * (w / wSum)));
    // Force exact sum by nudging the last quarter.
    const diff = total - raw.reduce((s, x) => s + x, 0);
    raw[3] += diff;
    return raw;
  };
  const awayQs = splitTotal(finalScore.away, `${game.id}-A`);
  const homeQs = splitTotal(finalScore.home, `${game.id}-H`);
  const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const rows: { team: BasketballTeam; qs: number[]; total: number }[] = [
    { team: away, qs: awayQs, total: finalScore.away },
    { team: home, qs: homeQs, total: finalScore.home },
  ];
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-[var(--text-sec)]">
            <th className="px-3 py-2 text-left font-semibold">Team</th>
            {labels.map(l => <th key={l} className="px-3 py-2 text-center font-semibold">{l}</th>)}
            <th className="px-3 py-2 text-center font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, qs, total }) => (
            <tr key={team.id} className="border-t border-[var(--border)]">
              <td className="px-3 py-1.5 font-semibold">{team.abbreviation}</td>
              {qs.map((x, i) => <td key={i} className="px-3 py-1.5 text-center tabular-nums">{x}</td>)}
              <td className="px-3 py-1.5 text-center font-bold tabular-nums">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-[var(--text-sec)] border-t border-[var(--border)]">
        Estimated splits — this game was simulated before per-quarter scoring was recorded.
      </div>
    </section>
  );
}

// ===========================================================================
// Game leaders
// ===========================================================================

function GameLeaders({
  away, home, awayLines, homeLines,
}: {
  away: BasketballTeam;
  home: BasketballTeam;
  awayLines: PlayerLine[];
  homeLines: PlayerLine[];
}) {
  const openPlayer = usePlayerModal();
  const cats: { key: keyof BasketballStats; label: string }[] = [
    { key: 'points', label: 'PTS' },
    { key: 'totalRebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
  ];
  const leader = (lines: PlayerLine[], key: keyof BasketballStats) => {
    let best: { player: BasketballPlayer; value: number } | null = null;
    for (const l of lines) {
      const v = n(l.stats, key);
      if (v > 0 && (!best || v > best.value)) best = { player: l.player, value: v };
    }
    return best;
  };
  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Game Leaders</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {([[away, awayLines], [home, homeLines]] as const).map(([team, lines]) => (
          <div key={team.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-bold">
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
              {fullName(team)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cats.map(c => {
                const l = leader(lines, c.key);
                return (
                  <button
                    key={String(c.key)}
                    type="button"
                    onClick={() => l && openPlayer(l.player.id)}
                    disabled={!l}
                    className="text-left rounded-lg bg-[var(--surface-2)] p-2 transition-colors hover:bg-[var(--border)]/60 disabled:cursor-default"
                  >
                    <div className="text-[9px] uppercase tracking-widest text-[var(--text-sec)]">{c.label}</div>
                    {l ? (
                      <>
                        <div className="text-lg font-black tabular-nums" style={{ color: 'var(--accent)' }}>{Math.round(l.value)}</div>
                        <div className="text-xs font-semibold truncate">{l.player.firstName[0]}. {l.player.lastName}</div>
                      </>
                    ) : (
                      <div className="text-sm opacity-40 mt-1">—</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ===========================================================================
// Team stats comparison (football BoxScore "Team Stats")
// ===========================================================================

function TeamStatsCompare({
  away, home, awayLines, homeLines, awayColor, homeColor,
}: {
  away: BasketballTeam;
  home: BasketballTeam;
  awayLines: PlayerLine[];
  homeLines: PlayerLine[];
  awayColor: string;
  homeColor: string;
}) {
  const pct = (lines: PlayerLine[], made: keyof BasketballStats, att: keyof BasketballStats) => {
    const a = sumLines(lines, att);
    return a > 0 ? (sumLines(lines, made) / a) * 100 : 0;
  };
  const rows: { label: string; away: number; home: number; fmt: (v: number) => string; lowerIsBetter?: boolean }[] = [
    { label: 'FG%', away: pct(awayLines, 'fieldGoalsMade', 'fieldGoalsAttempted'), home: pct(homeLines, 'fieldGoalsMade', 'fieldGoalsAttempted'), fmt: v => `${v.toFixed(1)}%` },
    { label: '3P%', away: pct(awayLines, 'threePointsMade', 'threePointsAttempted'), home: pct(homeLines, 'threePointsMade', 'threePointsAttempted'), fmt: v => `${v.toFixed(1)}%` },
    { label: 'FT%', away: pct(awayLines, 'freeThrowsMade', 'freeThrowsAttempted'), home: pct(homeLines, 'freeThrowsMade', 'freeThrowsAttempted'), fmt: v => `${v.toFixed(1)}%` },
    { label: 'Rebounds', away: sumLines(awayLines, 'totalRebounds'), home: sumLines(homeLines, 'totalRebounds'), fmt: String },
    { label: 'Assists', away: sumLines(awayLines, 'assists'), home: sumLines(homeLines, 'assists'), fmt: String },
    { label: 'Turnovers', away: sumLines(awayLines, 'turnovers'), home: sumLines(homeLines, 'turnovers'), fmt: String, lowerIsBetter: true },
    { label: 'Steals', away: sumLines(awayLines, 'steals'), home: sumLines(homeLines, 'steals'), fmt: String },
    { label: 'Blocks', away: sumLines(awayLines, 'blocks'), home: sumLines(homeLines, 'blocks'), fmt: String },
  ];
  if (awayLines.length === 0 && homeLines.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-xs font-bold">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: awayColor }} />{away.abbreviation}
        </span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">Team Stats</h2>
        <span className="flex items-center gap-1.5 text-xs font-bold">
          {home.abbreviation}<span className="w-2.5 h-2.5 rounded-sm" style={{ background: homeColor }} />
        </span>
      </div>
      <div className="space-y-2.5">
        {rows.map(r => {
          const total = r.away + r.home;
          const awayPct = total > 0 ? (r.away / total) * 100 : 50;
          const awayBetter = r.lowerIsBetter ? r.away < r.home : r.away > r.home;
          const homeBetter = r.lowerIsBetter ? r.home < r.away : r.home > r.away;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs mb-0.5 tabular-nums">
                <span className={awayBetter ? 'font-bold text-[var(--text)]' : 'text-[var(--text-sec)]'}>{r.fmt(r.away)}</span>
                <span className="text-[var(--text-sec)]">{r.label}</span>
                <span className={homeBetter ? 'font-bold text-[var(--text)]' : 'text-[var(--text-sec)]'}>{r.fmt(r.home)}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--surface-2)]">
                <div className="rounded-l-full" style={{ width: `${awayPct}%`, backgroundColor: awayColor }} />
                <div className="rounded-r-full" style={{ width: `${100 - awayPct}%`, backgroundColor: homeColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ===========================================================================
// Box score table
// ===========================================================================

type ColKey =
  | 'minutes' | 'points' | 'totalRebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers'
  | 'personalFouls' | 'plusMinus' | 'fg' | 'tp' | 'ft' | 'offensiveRebounds';

interface BoxCol {
  key: ColKey;
  label: string;
  title: string;
  /** Numeric value used for sorting. */
  sortValue: (s: Line) => number;
  /** Cell text for a player (or the team totals, when `isTotal`). */
  cell: (s: Line, isTotal: boolean) => string;
}

const simple = (key: ColKey & keyof BasketballStats, label: string, title: string): BoxCol => ({
  key, label, title,
  sortValue: s => n(s, key),
  cell: s => String(Math.round(n(s, key))),
});

const madeAtt = (key: ColKey, label: string, title: string, made: keyof BasketballStats, att: keyof BasketballStats): BoxCol => ({
  key, label, title,
  // Sort by makes, attempts as the tiebreak.
  sortValue: s => n(s, made) * 1000 + n(s, att),
  cell: s => `${n(s, made)}-${n(s, att)}`,
});

const BOX_COLS: BoxCol[] = [
  simple('minutes', 'MIN', 'Minutes'),
  simple('points', 'PTS', 'Points'),
  simple('totalRebounds', 'REB', 'Rebounds'),
  simple('assists', 'AST', 'Assists'),
  simple('steals', 'STL', 'Steals'),
  simple('blocks', 'BLK', 'Blocks'),
  simple('turnovers', 'TO', 'Turnovers'),
  simple('personalFouls', 'PF', 'Personal fouls'),
  {
    key: 'plusMinus', label: '+/-', title: 'Plus/minus while on the floor',
    sortValue: s => n(s, 'plusMinus'),
    cell: (s, isTotal) => (isTotal ? '' : signed(n(s, 'plusMinus'))),
  },
  madeAtt('fg', 'FG', 'Field goals made-attempted', 'fieldGoalsMade', 'fieldGoalsAttempted'),
  madeAtt('tp', '3PT', 'Three-pointers made-attempted', 'threePointsMade', 'threePointsAttempted'),
  madeAtt('ft', 'FT', 'Free throws made-attempted', 'freeThrowsMade', 'freeThrowsAttempted'),
  simple('offensiveRebounds', 'OREB', 'Offensive rebounds'),
];

const SUM_KEYS: (keyof BasketballStats)[] = [
  'points', 'totalRebounds', 'assists', 'steals', 'blocks', 'turnovers', 'personalFouls',
  'fieldGoalsMade', 'fieldGoalsAttempted', 'threePointsMade', 'threePointsAttempted',
  'freeThrowsMade', 'freeThrowsAttempted', 'offensiveRebounds',
];

function BoxScoreTable({
  team, lines, sort, onSort,
}: {
  team: BasketballTeam;
  lines: PlayerLine[];
  sort: { key: ColKey; dir: 'asc' | 'desc' } | null;
  onSort: (key: ColKey) => void;
}) {
  // Default order: minutes, most first (box-score convention).
  const col = sort ? BOX_COLS.find(c => c.key === sort.key) : undefined;
  const order = (arr: PlayerLine[]) => [...arr].sort((a, b) => {
    if (col && sort) {
      const d = col.sortValue(a.stats) - col.sortValue(b.stats);
      if (d !== 0) return sort.dir === 'desc' ? -d : d;
    }
    return n(b.stats, 'minutes') - n(a.stats, 'minutes');
  });
  const starters = order(lines.filter(l => n(l.stats, 'gamesStarted') > 0));
  const bench = order(lines.filter(l => n(l.stats, 'gamesStarted') === 0));
  const hasSplit = starters.length > 0;

  const totals: Line = {};
  for (const k of SUM_KEYS) totals[k] = sumLines(lines, k);
  const pct = (made: number, att: number) => (att > 0 ? `${((made / att) * 100).toFixed(1)}%` : '—');
  const splits = [
    { label: 'FG', text: `${totals.fieldGoalsMade}-${totals.fieldGoalsAttempted} · ${pct(n(totals, 'fieldGoalsMade'), n(totals, 'fieldGoalsAttempted'))}` },
    { label: '3P', text: `${totals.threePointsMade}-${totals.threePointsAttempted} · ${pct(n(totals, 'threePointsMade'), n(totals, 'threePointsAttempted'))}` },
    { label: 'FT', text: `${totals.freeThrowsMade}-${totals.freeThrowsAttempted} · ${pct(n(totals, 'freeThrowsMade'), n(totals, 'freeThrowsAttempted'))}` },
  ];
  const colSpan = BOX_COLS.length + 1;

  const groupRow = (label: string) => (
    <tr key={`group-${label}`}>
      <td
        colSpan={colSpan}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]"
        style={{ background: 'var(--surface-2)' }}
      >
        {label}
      </td>
    </tr>
  );

  const playerRow = ({ player, stats }: PlayerLine) => (
    <tr key={player.id} className="border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]">
      <td className="px-3 py-1.5 whitespace-nowrap">
        <PlayerName
          playerId={player.id}
          className="font-semibold transition-colors hover:text-[var(--accent)]"
        >
          {player.firstName[0]}. {player.lastName}
        </PlayerName>
        <span className="text-xs text-[var(--text-sec)] ml-1">{player.sportData.position}</span>
      </td>
      {BOX_COLS.map(c => {
        const pm = c.key === 'plusMinus' ? n(stats, 'plusMinus') : 0;
        return (
          <td
            key={c.key}
            className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${c.key === 'points' ? 'font-bold' : ''}`}
            style={c.key === 'plusMinus' && pm !== 0 ? { color: pm > 0 ? '#10b981' : '#dc2626' } : undefined}
          >
            {c.cell(stats, false)}
          </td>
        );
      })}
    </tr>
  );

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="sm" />
        <h3 className="font-bold">{fullName(team)}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm sticky-col min-w-[760px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-[var(--text-sec)]">
              <th className="px-3 py-2 text-left font-semibold">Player</th>
              {BOX_COLS.map(c => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className="px-1 py-1 text-right font-semibold whitespace-nowrap"
                    aria-sort={active ? (sort!.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      title={`Sort by ${c.title.toLowerCase()}`}
                      className={`px-1 py-1 rounded select-none uppercase tracking-wider transition-colors hover:text-[var(--text)] hover:bg-[var(--surface-2)] ${active ? 'text-[var(--accent)]' : ''}`}
                    >
                      {c.label}
                      {active && <span className="ml-0.5">{sort!.dir === 'desc' ? '↓' : '↑'}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hasSplit && groupRow('Starters')}
            {starters.map(playerRow)}
            {hasSplit && bench.length > 0 && groupRow('Bench')}
            {bench.map(playerRow)}
            {/* Team totals */}
            <tr className="border-t-2 border-[var(--border)] font-bold">
              <td className="px-3 py-1.5" style={{ background: 'var(--muted)' }}>Team</td>
              {BOX_COLS.map(c => (
                <td key={c.key} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap" style={{ background: 'var(--muted)' }}>
                  {c.key === 'minutes' ? '' : c.cell(totals, true)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-[var(--text-sec)] border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
        {splits.map(s => <span key={s.label}><span className="font-semibold">{s.label}</span> {s.text}</span>)}
      </div>
    </section>
  );
}

// ===========================================================================
// Fallbacks
// ===========================================================================

function Loading() {
  return <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/standings?view=scores" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        Browse scores
      </Link>
    </main>
  );
}
