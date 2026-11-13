'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { PlayerModal } from '@/components/modals/PlayerModal';
import {
  getAllStarGames,
  getAllStarDay,
  selectAllStars,
  SIDE_LABEL,
  type AllStarGame,
  type AllStarSelection,
  type AllStarSide,
  type AllStarLine,
} from '@/lib/allStar/allStar';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /all-star — the All-Star Game. Before the break: the projected rosters,
 * updating as you sim. After: the final, the MVP and both box scores. Past
 * seasons' games stay browsable.
 */

const SIDE_COLOR: Record<AllStarSide, string> = { east: '#1d4ed8', west: '#b91c1c' };

export default function AllStarPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const games = useMemo(() => (league ? getAllStarGames(league) : {}), [league]);
  const seasons = useMemo(() => Object.keys(games).map(Number).sort((a, b) => b - a), [games]);
  const [picked, setPicked] = useState<number | null>(null);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const current = league ? games[league.currentSeason] ?? null : null;
  const breakDay = league ? getAllStarDay(league) : null;
  const projected = useMemo(() => {
    if (!league || current || breakDay == null) return null;
    if (!league.games.some(g => g.status === 'played')) return null;
    return selectAllStars(league, league.currentTick);
  }, [league, current, breakDay]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const season = picked ?? (current ? league.currentSeason : null);
  const game = season != null ? games[season] ?? null : null;
  const players = league.players as Record<string, BasketballPlayer>;
  const ctx = { teamById, players, userTeamId: league.userTeamId, onPlayer: setModalPlayerId };

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        title="⭐ All-Star Game"
        subtitle={game ? `Season ${game.season} · East vs West` : `Season ${league.currentSeason}`}
        right={seasons.length > 0 ? (
          <select
            aria-label="Season"
            value={season ?? ''}
            onChange={e => setPicked(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border px-2 py-1.5 text-sm bg-[var(--surface)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {!current && <option value="">{league.currentSeason} (projected)</option>}
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : undefined}
        className="mb-6"
      />

      {game ? (
        <GameView game={game} {...ctx} />
      ) : projected ? (
        <>
          <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
            🗳️ <b>Projected All-Stars</b> — if voting closed today. The rosters lock and the game tips off at the All-Star break
            {breakDay != null ? <> (after <b>Day {breakDay}</b>; you&apos;re on Day {league.currentTick})</> : null}.
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {(['east', 'west'] as AllStarSide[]).map(side => (
              <RosterCard key={side} side={side} roster={projected[side]} {...ctx} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="⭐"
            title={breakDay == null ? 'No All-Star Game this season' : 'Voting opens once the season tips off'}
            message={breakDay == null
              ? 'The All-Star Game is played at the midpoint of the regular season.'
              : `Sim some games — the projected rosters fill in as players stack up numbers, and East vs West tip off at the All-Star break (after Day ${breakDay}).`}
          />
        </div>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

interface Ctx {
  teamById: Map<string, BasketballTeam>;
  players: Record<string, BasketballPlayer>;
  userTeamId: string | null;
  onPlayer: (id: string) => void;
}

function GameView({ game, ...ctx }: { game: AllStarGame } & Ctx) {
  const loser: AllStarSide = game.winner === 'east' ? 'west' : 'east';
  const mvp = game.mvpId ? ctx.players[game.mvpId] : null;
  const mvpLine = game.mvpId ? game.lines[game.mvpId] : null;
  const mvpTeam = mvp?.rosterSlot?.teamId ? ctx.teamById.get(mvp.rosterSlot.teamId) : undefined;
  const sides: AllStarSide[] = ['east', 'west'];

  return (
    <>
      {/* Scoreboard */}
      <section className="rounded-xl border bg-[var(--surface)] p-4 mb-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-center gap-6 sm:gap-10">
          {sides.map((side, i) => (
            <div key={side} className={`flex items-center gap-3 ${i === 1 ? 'flex-row-reverse' : ''}`}>
              <div className="text-center">
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: SIDE_COLOR[side] }}>{SIDE_LABEL[side]}</div>
                <div className={`text-4xl sm:text-5xl font-black tabular-nums ${side === game.winner ? '' : 'opacity-50'}`}>{game.finalScore[side]}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-[var(--text-sec)] mt-1">
          Final{game.overtime ? ' (OT)' : ''} · {SIDE_LABEL[game.winner]} wins by {game.finalScore[game.winner] - game.finalScore[loser]}
        </div>
        {game.quarterScores.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="mx-auto text-xs tabular-nums">
              <thead>
                <tr className="text-[var(--text-sec)]">
                  <th className="px-2 text-left" />
                  {game.quarterScores.map((_, i) => <th key={i} className="px-2">{i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ''}`}</th>)}
                  <th className="px-2">T</th>
                </tr>
              </thead>
              <tbody>
                {sides.map(side => (
                  <tr key={side}>
                    <td className="px-2 font-bold" style={{ color: SIDE_COLOR[side] }}>{SIDE_LABEL[side]}</td>
                    {game.quarterScores.map((q, i) => <td key={i} className="px-2 text-center">{q[side]}</td>)}
                    <td className="px-2 text-center font-bold">{game.finalScore[side]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MVP */}
      {mvp && mvpLine && (
        <button
          onClick={() => ctx.onPlayer(mvp.id)}
          className="w-full text-left rounded-xl border p-4 mb-6 flex items-center gap-4 hover:shadow-lg transition-shadow"
          style={{ borderColor: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 8%, var(--surface))' }}
        >
          <PlayerAvatar
            firstName={mvp.firstName}
            lastName={mvp.lastName}
            primaryColor={mvpTeam?.primaryColor ?? '#999'}
            secondaryColor={mvpTeam?.secondaryColor ?? '#fff'}
            photoUrl={mvp.sportData.photoUrl}
            size="lg"
          />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-bold text-amber-600">🌟 All-Star Game MVP</div>
            <div className="text-xl font-black truncate">{mvp.firstName} {mvp.lastName}</div>
            <div className="text-sm text-[var(--text-sec)]">
              {mvpLine.pts} PTS · {mvpLine.reb} REB · {mvpLine.ast} AST · {mvpLine.fgm}-{mvpLine.fga} FG · {mvpLine.tpm}-{mvpLine.tpa} 3PT
            </div>
          </div>
        </button>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {sides.map(side => (
          <BoxScore key={side} side={side} roster={game.rosters[side]} lines={game.lines} mvpId={game.mvpId} {...ctx} />
        ))}
      </div>
    </>
  );
}

function PlayerName({ sel, ctx }: { sel: AllStarSelection; ctx: Ctx }) {
  const t = sel.teamId ? ctx.teamById.get(sel.teamId) : undefined;
  const isUser = !!ctx.userTeamId && sel.teamId === ctx.userTeamId;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-6 text-xs font-mono text-[var(--text-sec)]">{sel.position}</span>
      {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />}
      <span className="font-semibold truncate">{sel.name}</span>
      {isUser && <span className="text-[10px] font-black" style={{ color: 'var(--accent)' }}>YOU</span>}
      {sel.replacement && <span className="text-[10px] font-bold text-[var(--text-sec)]" title="Injury replacement">REPL</span>}
    </span>
  );
}

function SideHeader({ side, note }: { side: AllStarSide; note?: string }) {
  return (
    <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
      <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: SIDE_COLOR[side] }}>Team {SIDE_LABEL[side]}</span>
      {note && <span className="text-[10px] text-[var(--text-sec)]">{note}</span>}
    </div>
  );
}

function RosterCard({ side, roster, ...ctx }: { side: AllStarSide; roster: AllStarSelection[] } & Ctx) {
  const groups: [string, AllStarSelection[]][] = [
    ['Starters', roster.filter(s => s.starter)],
    ['Reserves', roster.filter(s => !s.starter)],
  ];
  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <SideHeader side={side} note="PTS / REB / AST" />
      {groups.map(([label, list]) => (
        <div key={label}>
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</div>
          <ul>
            {list.map(sel => (
              <li key={sel.playerId}>
                <button
                  onClick={() => ctx.onPlayer(sel.playerId)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                  style={{ background: ctx.userTeamId && sel.teamId === ctx.userTeamId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                >
                  <PlayerName sel={sel} ctx={ctx} />
                  <span className="text-[11px] text-[var(--text-sec)] tabular-nums shrink-0">
                    {sel.injured ? '🏥 Injured' : sel.statline}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function BoxScore({ side, roster, lines, mvpId, ...ctx }: { side: AllStarSide; roster: AllStarSelection[]; lines: Record<string, AllStarLine>; mvpId: string | null } & Ctx) {
  const rows = [...roster].sort((a, b) => {
    if (a.starter !== b.starter) return a.starter ? -1 : 1;
    return (lines[b.playerId]?.min ?? -1) - (lines[a.playerId]?.min ?? -1);
  });
  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <SideHeader side={side} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">
              <th className="px-3 py-1.5 text-left font-bold">Player</th>
              <th className="px-1.5 text-right">MIN</th>
              <th className="px-1.5 text-right">PTS</th>
              <th className="px-1.5 text-right">REB</th>
              <th className="px-1.5 text-right">AST</th>
              <th className="px-1.5 text-right">FG</th>
              <th className="px-1.5 pr-3 text-right">3PT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(sel => {
              const l = lines[sel.playerId];
              return (
                <tr
                  key={sel.playerId}
                  onClick={() => ctx.onPlayer(sel.playerId)}
                  className="border-t cursor-pointer hover:bg-[var(--surface-2)]"
                  style={{ borderColor: 'var(--border)', background: ctx.userTeamId && sel.teamId === ctx.userTeamId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                >
                  <td className="px-3 py-1.5 max-w-0 w-1/2">
                    <span className="flex items-center gap-1">
                      <PlayerName sel={sel} ctx={ctx} />
                      {sel.playerId === mvpId && <span title="All-Star MVP" aria-label="MVP">🌟</span>}
                    </span>
                  </td>
                  {l ? (
                    <>
                      <td className="px-1.5 text-right">{l.min}</td>
                      <td className="px-1.5 text-right font-bold">{l.pts}</td>
                      <td className="px-1.5 text-right">{l.reb}</td>
                      <td className="px-1.5 text-right">{l.ast}</td>
                      <td className="px-1.5 text-right text-[var(--text-sec)]">{l.fgm}-{l.fga}</td>
                      <td className="px-1.5 pr-3 text-right text-[var(--text-sec)]">{l.tpm}-{l.tpa}</td>
                    </>
                  ) : (
                    <td colSpan={6} className="px-3 text-right text-xs text-[var(--text-sec)]">{sel.injured ? '🏥 Injured — did not play' : 'DNP'}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Loading() {
  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <Skeleton className="h-8 w-48 mb-6" />
      <SkeletonList rows={6} />
    </main>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
        Start or load a league
      </Link>
    </main>
  );
}
