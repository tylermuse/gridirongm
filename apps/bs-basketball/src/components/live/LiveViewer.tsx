'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { synthesizePlayByPlay } from '@/lib/live/playByPlay';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type Speed = 1 | 2 | 5 | 'max';

/**
 * Live game viewer (P0.1). Replays a synthesized play-by-play of the user's
 * game with a live scoreboard, a possession indicator, speed controls, and an
 * "Around the League" panel revealing the rest of the day's slate.
 */
export function LiveViewer({
  userGameId, dayGameIds, onClose,
}: {
  userGameId: string;
  dayGameIds: string[];
  onClose: () => void;
}) {
  const { league } = useLeagueStore();
  const router = useRouter();
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState<Speed>(2);
  const [paused, setPaused] = useState(false);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const game = league?.games.find(g => g.id === userGameId) as GameResult | undefined;
  const home = game ? teamById.get(game.homeTeamId) ?? null : null;
  const away = game ? teamById.get(game.awayTeamId) ?? null : null;

  const events = useMemo(() => {
    if (!game || !home || !away || !league) return [];
    return synthesizePlayByPlay(game, home, away, league.players as Record<string, BasketballPlayer>);
  }, [game, home, away, league]);

  const otherGames = useMemo(
    () => dayGameIds
      .filter(id => id !== userGameId)
      .map(id => league?.games.find(g => g.id === id) as GameResult | undefined)
      .filter((g): g is GameResult => !!g),
    [dayGameIds, userGameId, league],
  );

  const atEnd = cursor >= events.length;

  // Playback ticker (paused / max excluded). The interval's setState is async,
  // so it doesn't trip set-state-in-effect.
  useEffect(() => {
    if (paused || atEnd || speed === 'max') return;
    const id = window.setInterval(
      () => setCursor(c => (c >= events.length ? c : c + 1)),
      1100 / speed,
    );
    return () => window.clearInterval(id);
  }, [paused, atEnd, speed, events.length]);

  if (!game || !home || !away) return null;

  const last = cursor > 0 ? events[cursor - 1] : null;
  const score = last ? { home: last.home, away: last.away } : { home: 0, away: 0 };
  const progress = events.length ? cursor / events.length : 1;
  const qLabel = last ? quarterLabel(last.quarter) : '1st';
  const clock = last ? last.clock : '12:00';
  const feed = events.slice(0, cursor).reverse();

  function setSpeedFn(s: Speed) {
    if (s === 'max') setCursor(events.length);
    setSpeed(s);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'rgba(8,12,20,0.96)' }}>
      {/* Scoreboard */}
      <div className="shrink-0 px-4 sm:px-8 py-4 border-b border-white/10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <ScoreSide team={away} score={score.away} align="left" />
          <div className="text-center px-4">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold" style={{ color: atEnd ? 'rgba(255,255,255,0.6)' : '#ef4444' }}>
              {!atEnd && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
              {atEnd ? 'FINAL' : 'LIVE'}
            </div>
            <div className="text-white/80 text-sm font-semibold tabular-nums mt-0.5">{qLabel} · {clock}</div>
          </div>
          <ScoreSide team={home} score={score.home} align="right" />
        </div>

        {/* Possession / court indicator */}
        <div className="max-w-4xl mx-auto mt-3 relative h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="absolute -top-1 w-3.5 h-3.5 rounded-full transition-all duration-500"
            style={{
              background: 'var(--accent)',
              left: last ? (last.side === 'home' ? 'calc(100% - 14px)' : '0%') : '50%',
              boxShadow: '0 0 8px var(--accent)',
            }}
            aria-hidden
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto px-4 sm:px-8 py-4 grid md:grid-cols-[1fr_15rem] gap-4">
        {/* Play-by-play */}
        <div className="min-h-0 flex flex-col">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Play-by-play</div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1 pr-1">
            {feed.length === 0 && <div className="text-white/40 text-sm">Tip-off…</div>}
            {feed.map((e, i) => {
              const team = e.side === 'home' ? home : away;
              return (
                <div key={cursor - i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${i === 0 ? 'bg-white/10' : ''}`}>
                  <span className="text-[10px] tabular-nums text-white/40 w-10 shrink-0">{e.clock}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team.primaryColor }} />
                  <span className={`flex-1 ${e.scoring ? 'text-white font-semibold' : 'text-white/60'}`}>{e.text}</span>
                  {e.scoring && <span className="text-xs tabular-nums text-white/50">{e.away}–{e.home}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Around the league */}
        <div className="hidden md:flex flex-col min-h-0">
          <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-2">Around the league</div>
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5">
            {otherGames.length === 0 && <div className="text-white/30 text-xs">No other games today.</div>}
            {otherGames.map(g => (
              <AroundCard key={g.id} game={g} teamById={teamById} progress={progress} />
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/10 px-4 sm:px-8 py-3">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2">
          {!atEnd && (
            <button onClick={() => setPaused(p => !p)} className="rounded-lg px-3 py-1.5 text-sm font-bold text-white bg-white/10 hover:bg-white/20">
              {paused ? '▶ Play' : '⏸ Pause'}
            </button>
          )}
          {!atEnd && (
            <div className="flex items-center gap-1">
              {([1, 2, 5, 'max'] as Speed[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSpeedFn(s)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold"
                  style={speed === s ? { background: 'var(--accent)', color: '#fff' } : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                >
                  {s === 'max' ? 'Max' : `${s}×`}
                </button>
              ))}
            </div>
          )}
          {!atEnd && (
            <button onClick={() => setCursor(events.length)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white">
              Skip to final →
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {atEnd && (
              <button onClick={() => { onClose(); router.push(`/game/${userGameId}`); }} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
                Box Score →
              </button>
            )}
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white/60 hover:text-white">
              {atEnd ? 'Close' : 'Exit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreSide({ team, score, align }: { team: BasketballTeam | null; score: number; align: 'left' | 'right' }) {
  if (!team) return <div />;
  return (
    <div className={`flex items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />
      <div>
        <div className="text-white font-bold leading-tight">{team.abbreviation}</div>
        <div className="text-white/50 text-xs">{team.city}</div>
      </div>
      <div className="text-4xl font-black tabular-nums text-white px-2">{score}</div>
    </div>
  );
}

function AroundCard({ game, teamById, progress }: { game: GameResult; teamById: Map<string, BasketballTeam>; progress: number }) {
  const home = teamById.get(game.homeTeamId);
  const away = teamById.get(game.awayTeamId);
  if (!home || !away || !game.finalScore) return null;
  const done = progress >= 1;
  const h = Math.round(game.finalScore.home * progress);
  const a = Math.round(game.finalScore.away * progress);
  return (
    <div className="rounded-lg bg-white/5 px-2.5 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-white/80">
          <TeamLogo abbreviation={away.abbreviation} primaryColor={away.primaryColor} secondaryColor={away.secondaryColor} size="xs" />
          {away.abbreviation}
        </span>
        <span className="tabular-nums font-bold text-white">{done ? game.finalScore.away : a}</span>
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className="flex items-center gap-1.5 text-white/80">
          <TeamLogo abbreviation={home.abbreviation} primaryColor={home.primaryColor} secondaryColor={home.secondaryColor} size="xs" />
          {home.abbreviation}
        </span>
        <span className="tabular-nums font-bold text-white">{done ? game.finalScore.home : h}</span>
      </div>
      <div className="text-[9px] uppercase tracking-widest mt-1" style={{ color: done ? 'rgba(255,255,255,0.4)' : '#ef4444' }}>
        {done ? 'Final' : 'Live'}
      </div>
    </div>
  );
}

function quarterLabel(q: number): string {
  if (q === 1) return '1st';
  if (q === 2) return '2nd';
  if (q === 3) return '3rd';
  if (q === 4) return '4th';
  return `OT${q - 4}`;
}
