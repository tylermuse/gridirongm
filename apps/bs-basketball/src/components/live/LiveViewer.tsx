'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { synthesizePlayByPlay, type LiveEvent, type LiveEventKind } from '@/lib/live/playByPlay';
import { computeEventBeats } from '@/lib/live/beats';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;
type Speed = 1 | 2 | 5 | 'max';
type Tab = 'pbp' | 'box' | 'quarters';

const EVENT_ICON: Record<LiveEventKind, string> = {
  make3: '🎯', make2: '●', ft: '○', block: '🚫', steal: '🖐', turnover: '🔄', rebound: '⬆',
};

/**
 * Live game viewer (P0.1 + broadcast polish 2.2 / P3.1). Replays a synthesized
 * play-by-play with a court canvas, team-colored scoreboard, iconified plays,
 * an "Around the League" panel, and in-game Play-by-Play / Box Score / Quarters
 * tabs.
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
  const [tab, setTab] = useState<Tab>('pbp');

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

  // Broadcast beats: tag scoring plays that flipped the lead, tied it, or
  // extended a run — indexed 1:1 with the events array.
  const beats = useMemo(
    () => (home && away ? computeEventBeats(events, home.abbreviation, away.abbreviation) : []),
    [events, home, away],
  );

  const atEnd = cursor >= events.length;

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

        {/* Court canvas. MOBILE-3: hidden below md. The court at 390px renders
            as a ~358×125px abstract strip that reads more like a hockey rink
            than a basketball court — and the play-by-play below is the
            genuinely good part of this view. Reclaiming that vertical space
            until a proper mobile court redesign lands. */}
        <div className="hidden md:block max-w-md mx-auto mt-3">
          <CourtCanvas home={home} away={away} last={last} cursor={cursor} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto px-4 sm:px-8 py-4 grid md:grid-cols-[1fr_15rem] gap-4">
        <div className="min-h-0 flex flex-col">
          {/* In-game tabs */}
          <div className="inline-flex self-start rounded-lg overflow-hidden mb-2 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.08)' }}>
            {([['pbp', 'Play-by-Play'], ['box', 'Box Score'], ['quarters', 'Quarters']] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 transition-colors" style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'rgba(255,255,255,0.6)' }}>{label}</button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-1">
            {tab === 'pbp' && (
              <div className="space-y-1">
                {feed.length === 0 && <div className="text-white/40 text-sm">Tip-off…</div>}
                {feed.map((e, i) => {
                  const team = e.side === 'home' ? home : away;
                  const beat = beats[cursor - 1 - i];
                  const three = e.scoring && e.points >= 3;
                  // 3-pointers get a gold rail; everything else the team color.
                  const rail = three ? '#f59e0b' : team.primaryColor;
                  return (
                    <div key={cursor - i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${i === 0 ? 'bg-white/10' : ''}`} style={e.scoring && (i === 0 || three) ? { boxShadow: `inset 2px 0 0 ${rail}` } : undefined}>
                      <span className="text-[10px] tabular-nums text-white/40 w-10 shrink-0">{e.clock}</span>
                      <span className="w-4 text-center shrink-0 text-xs" aria-hidden>{EVENT_ICON[e.kind]}</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: team.primaryColor }} />
                      <span className={`flex-1 ${e.scoring ? 'text-white font-semibold' : 'text-white/60'}`}>
                        {e.text}{three ? ' (+3)' : ''}
                        {beat?.leadChange && <Beat label="Lead change" color="#f59e0b" />}
                        {beat?.tie && <Beat label="Tie game" color="#38bdf8" />}
                        {beat?.runText && <Beat label={beat.runText} color="#ef4444" />}
                      </span>
                      {e.scoring && <span className="text-xs tabular-nums text-white/50">{e.away}–{e.home}</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {tab === 'box' && <BoxScore game={game} home={home} away={away} players={league!.players as Record<string, BasketballPlayer>} progress={progress} />}
            {tab === 'quarters' && <QuarterSplits game={game} home={home} away={away} uptoQuarter={last?.quarter ?? 1} atEnd={atEnd} />}
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
                <button key={s} onClick={() => setSpeedFn(s)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold" style={speed === s ? { background: 'var(--accent)', color: '#fff' } : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
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

/** Minimal broadcast court: possession indicator + a made-shot flash. */
function CourtCanvas({ home, away, last, cursor }: { home: BasketballTeam; away: BasketballTeam; last: LiveEvent | null; cursor: number }) {
  const possSide = last?.side ?? null;
  const made = !!last?.scoring;
  const scoreColor = last ? (last.side === 'home' ? home.primaryColor : away.primaryColor) : '#fff';
  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10" style={{ background: 'linear-gradient(180deg,#1a2433,#141c28)' }}>
      <svg viewBox="0 0 200 70" className="w-full block" style={{ height: 70 }}>
        <rect x="2" y="2" width="196" height="66" rx="2" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <line x1="100" y1="2" x2="100" y2="68" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <circle cx="100" cy="35" r="10" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <rect x="2" y="22" width="26" height="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
        <rect x="172" y="22" width="26" height="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
        <circle cx="10" cy="35" r="2.5" fill={away.primaryColor} />
        <circle cx="190" cy="35" r="2.5" fill={home.primaryColor} />
        {made && (
          <circle key={cursor} cx={last!.side === 'home' ? 190 : 10} cy="35" r="4" fill="none" stroke={scoreColor} strokeWidth="2">
            <animate attributeName="r" from="4" to="16" dur="0.6s" />
            <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" />
          </circle>
        )}
        {possSide && (
          <circle cx={possSide === 'home' ? 150 : 50} cy="35" r="3.5" fill="#f59e0b" stroke="#7c3a08" strokeWidth="0.7">
            <animate attributeName="cx" to={possSide === 'home' ? 150 : 50} dur="0.4s" />
          </circle>
        )}
      </svg>
      <div className="absolute top-1 left-2 text-[9px] font-bold" style={{ color: away.primaryColor }}>{away.abbreviation}</div>
      <div className="absolute top-1 right-2 text-[9px] font-bold" style={{ color: home.primaryColor }}>{home.abbreviation}</div>
    </div>
  );
}

function BoxScore({ game, home, away, players, progress }: { game: GameResult; home: BasketballTeam; away: BasketballTeam; players: Record<string, BasketballPlayer>; progress: number }) {
  return (
    <div className="space-y-3">
      {[away, home].map(team => (
        <div key={team.id}>
          <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: team.primaryColor }}>
            <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
            {team.city} {team.name}
          </div>
          <div className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] text-[11px] text-white/40 px-2">
            <span>Player</span><span className="text-right">PTS</span><span className="text-right">REB</span><span className="text-right">AST</span>
          </div>
          {team.playerIds
            .map(id => ({ p: players[id], s: game.boxScores[id] as Partial<BasketballStats> | undefined }))
            .filter(x => x.p && x.s && (x.s.minutes ?? 0) > 0)
            .sort((a, b) => (b.s!.points ?? 0) - (a.s!.points ?? 0))
            .slice(0, 8)
            .map(({ p, s }) => (
              <div key={p!.id} className="grid grid-cols-[1fr_2.2rem_2.2rem_2.2rem] text-xs px-2 py-0.5 text-white/80">
                <span className="truncate">{p!.firstName[0]}. {p!.lastName}</span>
                <span className="text-right tabular-nums font-semibold">{Math.round((s!.points ?? 0) * progress)}</span>
                <span className="text-right tabular-nums">{Math.round((s!.totalRebounds ?? 0) * progress)}</span>
                <span className="text-right tabular-nums">{Math.round((s!.assists ?? 0) * progress)}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function QuarterSplits({ game, home, away, uptoQuarter, atEnd }: { game: GameResult; home: BasketballTeam; away: BasketballTeam; uptoQuarter: number; atEnd: boolean }) {
  const quarters = (game.sportData as { quarterScores?: { home: number; away: number }[] } | undefined)?.quarterScores ?? [];
  const shown = atEnd ? quarters.length : Math.min(quarters.length, uptoQuarter);
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm text-white/80">
      <thead className="text-[11px] text-white/40">
        <tr>
          <th className="text-left py-1">Team</th>
          {quarters.map((_, i) => <th key={i} className="text-center w-9">{i < 4 ? `Q${i + 1}` : `OT${i - 3}`}</th>)}
          <th className="text-right w-10">T</th>
        </tr>
      </thead>
      <tbody>
        {([away, home] as const).map((team, ti) => (
          <tr key={team.id} className="border-t border-white/10">
            <td className="py-1 font-semibold" style={{ color: team.primaryColor }}>{team.abbreviation}</td>
            {quarters.map((q, i) => (
              <td key={i} className="text-center tabular-nums">{i < shown ? (ti === 0 ? q.away : q.home) : '–'}</td>
            ))}
            <td className="text-right tabular-nums font-black">{quarters.slice(0, shown).reduce((s, q) => s + (ti === 0 ? q.away : q.home), 0)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function ScoreSide({ team, score, align }: { team: BasketballTeam | null; score: number; align: 'left' | 'right' }) {
  if (!team) return <div />;
  return (
    <div className={`flex items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />
      <div>
        <div className="font-bold leading-tight" style={{ color: team.primaryColor }}>{team.abbreviation}</div>
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
          <span className="w-2 h-2 rounded-full" style={{ background: away.primaryColor }} />
          <TeamLogo abbreviation={away.abbreviation} primaryColor={away.primaryColor} secondaryColor={away.secondaryColor} size="xs" />
          {away.abbreviation}
        </span>
        <span className="tabular-nums font-bold text-white">{done ? game.finalScore.away : a}</span>
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="w-2 h-2 rounded-full" style={{ background: home.primaryColor }} />
          <TeamLogo abbreviation={home.abbreviation} primaryColor={home.primaryColor} secondaryColor={home.secondaryColor} size="xs" />
          {home.abbreviation}
        </span>
        <span className="tabular-nums font-bold text-white">{done ? game.finalScore.home : h}</span>
      </div>
      <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest rounded px-1.5 py-0.5" style={{ background: done ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.18)', color: done ? 'rgba(255,255,255,0.5)' : '#ef4444' }}>
        {!done && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}{done ? 'Final' : 'Live'}
      </div>
    </div>
  );
}

/** Inline broadcast badge for a notable moment (lead change / tie / run). */
function Beat({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="ml-1.5 inline-block align-middle text-[9px] font-black uppercase tracking-wider rounded px-1 py-0.5"
      style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {label}
    </span>
  );
}

function quarterLabel(q: number): string {
  if (q === 1) return '1st';
  if (q === 2) return '2nd';
  if (q === 3) return '3rd';
  if (q === 4) return '4th';
  return `OT${q - 4}`;
}
