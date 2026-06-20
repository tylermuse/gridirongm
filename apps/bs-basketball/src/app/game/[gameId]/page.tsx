'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { dropConfetti } from '@/lib/ui/confetti';
import type {
  BasketballGameData,
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';

/**
 * /game/[gameId] — box score view.
 *
 * Renders final score + per-player stat lines for both teams. Only valid
 * for games with status='played'; scheduled games get a "not yet" message.
 */

const BOXSCORE_COLS: { key: keyof BasketballStats; label: string }[] = [
  { key: 'minutes',             label: 'MIN' },
  { key: 'points',              label: 'PTS' },
  { key: 'fieldGoalsMade',      label: 'FGM' },
  { key: 'fieldGoalsAttempted', label: 'FGA' },
  { key: 'threePointsMade',     label: '3PM' },
  { key: 'threePointsAttempted',label: '3PA' },
  { key: 'freeThrowsMade',      label: 'FTM' },
  { key: 'freeThrowsAttempted', label: 'FTA' },
  { key: 'totalRebounds',       label: 'REB' },
  { key: 'assists',             label: 'AST' },
  { key: 'steals',              label: 'STL' },
  { key: 'blocks',              label: 'BLK' },
  { key: 'turnovers',           label: 'TO' },
];

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const store = useLeagueStore();
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

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

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!game) return <NotFound message="Game not found." />;
  if (!homeTeam || !awayTeam) return <NotFound message="Game references missing teams." />;

  if (game.status !== 'played' || !game.finalScore) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="mb-4 opacity-70">Game not yet played.</p>
        <Link href={`/team/${homeTeam.id}`} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          ← Back to {homeTeam.city} {homeTeam.name}
        </Link>
      </main>
    );
  }

  const playerMap = league.players as Record<string, BasketballPlayer>;
  const homeWon = game.finalScore.home > game.finalScore.away;
  const gameData = game.sportData as BasketballGameData | undefined;

  return (
    <main className="max-w-5xl mx-auto p-8">
      {/* Prev/next chevrons flank the page so you can flip through games. */}
      <div className="flex items-center justify-between">
        {league.userTeamId ? (
          <Link href={`/team/${league.userTeamId}`} className="text-sm font-semibold opacity-70 hover:opacity-100">← My Team</Link>
        ) : <span />}
        <div className="flex items-center gap-2">
          {prevId
            ? <Link href={`/game/${prevId}`} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)]" style={{ color: 'var(--accent)' }} title="Previous game">‹ Prev</Link>
            : <span className="text-sm opacity-30 px-2 py-1">‹ Prev</span>}
          {nextId
            ? <Link href={`/game/${nextId}`} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)]" style={{ color: 'var(--accent)' }} title="Next game">Next ›</Link>
            : canSimNext
              ? <button onClick={() => void simNext()} disabled={store.loading} className="text-sm font-semibold px-2 py-1 rounded hover:bg-[var(--surface-2)] disabled:opacity-50" style={{ color: 'var(--accent)' }} title="Simulate your next game">{store.loading ? 'Simming…' : 'Sim Next ›'}</button>
              : <span className="text-sm opacity-30 px-2 py-1">Next ›</span>}
        </div>
      </div>

      {/* Final score header */}
      <section className="grid grid-cols-3 items-center my-6 p-6 rounded-lg" style={{ background: 'var(--muted)' }}>
        <TeamScoreCell
          team={awayTeam}
          score={game.finalScore.away}
          won={!homeWon}
          align="left"
        />
        <div className="text-center text-sm opacity-60 uppercase tracking-wide">
          {gameData?.wentToOvertime ? `Final / ${gameData.periodsPlayed - 4} OT` : 'Final'}
        </div>
        <TeamScoreCell
          team={homeTeam}
          score={game.finalScore.home}
          won={homeWon}
          align="right"
        />
      </section>

      {/* Quarter-by-quarter line score + game info (FEAT-24). When the engine
          recorded per-quarter splits we use them; otherwise we fall back to a
          deterministic synthetic split from the final score so the view is
          always present (covers playoff games saved before BUG-30 lost the
          quarterScores in sportData). */}
      {gameData?.quarterScores?.length ? (
        <LineScore away={awayTeam} home={homeTeam} data={gameData} />
      ) : (
        <LineScoreFallback away={awayTeam} home={homeTeam} game={game} />
      )}

      <GameLeaders away={awayTeam} home={homeTeam} game={game} playerMap={playerMap} onPlayerClick={setModalPlayerId} />

      <div className="grid md:grid-cols-2 gap-6">
        <BoxScoreTable team={awayTeam} game={game} playerMap={playerMap} onPlayerClick={setModalPlayerId} />
        <BoxScoreTable team={homeTeam} game={game} playerMap={playerMap} onPlayerClick={setModalPlayerId} />
      </div>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function LineScore({ away, home, data }: { away: BasketballTeam; home: BasketballTeam; data: BasketballGameData }) {
  const qs = data.quarterScores;
  const labels = qs.map((_, i) => (i < 4 ? `Q${i + 1}` : qs.length - 4 > 1 ? `OT${i - 3}` : 'OT'));
  const rows: { team: BasketballTeam; side: 'home' | 'away' }[] = [
    { team: away, side: 'away' },
    { team: home, side: 'home' },
  ];
  const leadTeam = data.biggestLead.team === 'home' ? home : away;
  return (
    <section className="mb-6 rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="opacity-60" style={{ background: 'var(--muted)' }}>
            <th className="px-3 py-1.5 text-left font-semibold">Team</th>
            {labels.map((l, i) => <th key={i} className="px-3 py-1.5 text-center font-semibold">{l}</th>)}
            <th className="px-3 py-1.5 text-center font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, side }) => (
            <tr key={side} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-3 py-1.5 font-semibold">{team.abbreviation}</td>
              {qs.map((q, i) => <td key={i} className="px-3 py-1.5 text-center tabular-nums">{q[side]}</td>)}
              <td className="px-3 py-1.5 text-center font-bold tabular-nums">{qs.reduce((s, q) => s + q[side], 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-[var(--text-sec)] border-t flex flex-wrap gap-x-3 gap-y-0.5" style={{ borderColor: 'var(--border)' }}>
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
  game: { id: string; finalScore: { home: number; away: number } };
}) {
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
    const diff = total - raw.reduce((s, n) => s + n, 0);
    raw[3] += diff;
    return raw;
  };
  const awayQs = splitTotal(game.finalScore.away, `${game.id}-A`);
  const homeQs = splitTotal(game.finalScore.home, `${game.id}-H`);
  const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const rows: { team: BasketballTeam; qs: number[]; total: number }[] = [
    { team: away, qs: awayQs, total: game.finalScore.away },
    { team: home, qs: homeQs, total: game.finalScore.home },
  ];
  return (
    <section className="mb-6 rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="opacity-60" style={{ background: 'var(--muted)' }}>
            <th className="px-3 py-1.5 text-left font-semibold">Team</th>
            {labels.map(l => <th key={l} className="px-3 py-1.5 text-center font-semibold">{l}</th>)}
            <th className="px-3 py-1.5 text-center font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, qs, total }) => (
            <tr key={team.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-3 py-1.5 font-semibold">{team.abbreviation}</td>
              {qs.map((n, i) => <td key={i} className="px-3 py-1.5 text-center tabular-nums">{n}</td>)}
              <td className="px-3 py-1.5 text-center font-bold tabular-nums">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-[var(--text-sec)] border-t" style={{ borderColor: 'var(--border)' }}>
        Estimated splits — this game was simulated before per-quarter scoring was recorded.
      </div>
    </section>
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
    <Link href={`/team/${team.id}`} title={`${team.city} ${team.name}`}>
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
    </Link>
  );
  return (
    <div className={`flex items-center gap-3 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      {align === 'left' && logo}
      <Link href={`/team/${team.id}`} className={`${align === 'right' ? 'text-right' : ''} hover:opacity-80`}>
        <div className="text-xs opacity-70">{team.city}</div>
        <div className="font-bold">{team.name}</div>
      </Link>
      <div
        className="text-4xl font-extrabold"
        style={{ color: won ? 'var(--accent)' : 'var(--foreground)' }}
      >
        {score}
      </div>
      {align === 'right' && logo}
    </div>
  );
}

function GameLeaders({
  away, home, game, playerMap, onPlayerClick,
}: {
  away: BasketballTeam;
  home: BasketballTeam;
  game: { boxScores: Record<string, Partial<BasketballStats>> };
  playerMap: Record<string, BasketballPlayer>;
  onPlayerClick: (id: string) => void;
}) {
  const cats: { key: keyof BasketballStats; label: string }[] = [
    { key: 'points', label: 'PTS' },
    { key: 'totalRebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
  ];
  const leader = (team: BasketballTeam, key: keyof BasketballStats) => {
    let best: { player: BasketballPlayer; value: number } | null = null;
    for (const pid of team.playerIds) {
      const v = (game.boxScores[pid]?.[key] as number | undefined) ?? 0;
      const p = playerMap[pid];
      if (v > 0 && p && (!best || v > best.value)) best = { player: p, value: v };
    }
    return best;
  };
  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-widest opacity-60 mb-2">Game Leaders</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {[away, home].map(team => (
          <div key={team.id} className="rounded-xl border bg-[var(--surface)] p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 mb-2 text-sm font-bold">
              <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
              {team.city}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cats.map(c => {
                const l = leader(team, c.key);
                return (
                  <button
                    key={String(c.key)}
                    onClick={() => l && onPlayerClick(l.player.id)}
                    className="text-left rounded-lg bg-[var(--surface-2)] p-2 hover:brightness-95 transition"
                  >
                    <div className="text-[9px] uppercase tracking-widest opacity-60">{c.label}</div>
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

function BoxScoreTable({
  team, game, playerMap, onPlayerClick,
}: {
  team: BasketballTeam;
  game: { boxScores: Record<string, Partial<BasketballStats>> };
  playerMap: Record<string, BasketballPlayer>;
  onPlayerClick: (playerId: string) => void;
}) {
  // Players who appeared (have a box score) — sorted by points descending.
  const lines = team.playerIds
    .map(pid => ({
      player: playerMap[pid],
      stats: game.boxScores[pid] ?? {},
    }))
    .filter(({ player, stats }) => player && (stats.minutes ?? 0) > 0)
    .sort((a, b) => (b.stats.points ?? 0) - (a.stats.points ?? 0));

  // Team totals across every box-score column + shooting splits (FEAT-24).
  const sum = (key: keyof BasketballStats) => lines.reduce((s, l) => s + ((l.stats[key] as number) ?? 0), 0);
  const totals = Object.fromEntries(BOXSCORE_COLS.map(c => [c.key, sum(c.key)])) as Record<string, number>;
  const pct = (made: number, att: number) => (att > 0 ? `${Math.round((made / att) * 100)}%` : '—');
  const splits = [
    { label: 'FG', text: `${totals.fieldGoalsMade}/${totals.fieldGoalsAttempted} ${pct(totals.fieldGoalsMade, totals.fieldGoalsAttempted)}` },
    { label: '3P', text: `${totals.threePointsMade}/${totals.threePointsAttempted} ${pct(totals.threePointsMade, totals.threePointsAttempted)}` },
    { label: 'FT', text: `${totals.freeThrowsMade}/${totals.freeThrowsAttempted} ${pct(totals.freeThrowsMade, totals.freeThrowsAttempted)}` },
  ];

  return (
    <section className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        {team.city} {team.name}
      </h2>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead>
          <tr className="opacity-70">
            <th className="px-2 py-1 text-left">Player</th>
            {BOXSCORE_COLS.map(c => (
              <th key={String(c.key)} className="px-2 py-1 text-right">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(({ player, stats }) => (
            <tr key={player.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-2 py-1">
                <button
                  onClick={() => onPlayerClick(player.id)}
                  className="font-semibold hover:underline text-left"
                  style={{ color: 'var(--accent)' }}
                >
                  {player.firstName[0]}. {player.lastName}
                </button>
                <span className="opacity-60 ml-1">{player.sportData.position}</span>
              </td>
              {BOXSCORE_COLS.map(c => (
                <td key={String(c.key)} className="px-2 py-1 text-right">
                  {formatStat(c.key, stats[c.key])}
                </td>
              ))}
            </tr>
          ))}
          {/* Team totals */}
          <tr className="border-t-2 font-bold" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
            <td className="px-2 py-1">Team</td>
            {BOXSCORE_COLS.map(c => (
              <td key={String(c.key)} className="px-2 py-1 text-right">
                {c.key === 'minutes' ? '' : formatStat(c.key, totals[c.key])}
              </td>
            ))}
          </tr>
        </tbody>
      </table></div>
      <div className="px-3 py-1.5 text-[11px] text-[var(--text-sec)] border-t flex flex-wrap gap-x-3" style={{ borderColor: 'var(--border)' }}>
        {splits.map(s => <span key={s.label}><span className="opacity-60">{s.label}</span> {s.text}</span>)}
      </div>
    </section>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function formatStat(key: keyof BasketballStats, value: number | undefined): string {
  if (value === undefined || value === null) return '–';
  if (key === 'minutes') return Math.round(value).toString();
  return Math.round(value).toString();
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/league" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to league
      </Link>
    </main>
  );
}
