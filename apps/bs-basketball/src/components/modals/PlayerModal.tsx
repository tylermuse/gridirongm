'use client';

/**
 * PlayerModal — popover player card.
 *
 * Same content as /player/[playerId] (grouped ratings with bars) but rendered
 * inline as a modal so box scores / rosters can show a player without a full
 * navigation. The dedicated page stays for deep-linkable URLs.
 *
 * Props: playerId (null = closed), onClose.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from './Modal';
import { isGodMode } from '@/lib/godMode/godMode';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { getInjuries, SEVERITY_LABEL } from '@/lib/injuries';
import { ratingHex, ratingTier } from '@/lib/ui/ratingColor';
import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballStats,
  type BasketballTeam,
  type PlayerSeasonLogEntry,
} from '@bs/sport-basketball';

interface PlayerModalProps {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const league = useLeagueStore(s => s.league);
  const router = useRouter();

  const player = playerId && league
    ? ((league.players as Record<string, BasketballPlayer>)[playerId] ?? null)
    : null;

  const team: BasketballTeam | null =
    player?.rosterSlot && league
      ? ((league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null)
      : null;

  // Current-season averages (aggregated lazily from box scores) and the
  // last-season line from the rollover log for comparison.
  const seasonStats: BasketballStats | null =
    player && league ? statsForPlayer(regularSeasonStatsByPlayer(league), player.id) : null;
  const lastSeason: PlayerSeasonLogEntry | null = player
    ? (player.sportData.seasonLog?.[player.sportData.seasonLog.length - 1] ?? null)
    : null;

  // OVR trend vs the pre-offseason snapshot.
  const ovrDelta = player
    ? player.ratings.overall - (player.sportData.prevRatings?.overall ?? player.ratings.overall)
    : 0;

  // Injury status (current day = league.currentTick).
  const injuries = league ? getInjuries(league) : {};
  const injury = player ? injuries[player.id] : undefined;
  const day = league?.currentTick ?? 0;
  const injuryActive = !!injury && injury.returnDay > day;

  // "Trade for this player" — only for players on another team while managing.
  const canTradeFor =
    !!player?.rosterSlot &&
    !!league?.userTeamId &&
    player.rosterSlot.teamId !== league.userTeamId;

  // Group ratings by category as declared in basketballUiMetadata.
  const grouped = new Map<string, { key: string; label: string }[]>();
  for (const f of basketballUiMetadata.ratingFields) {
    if (!grouped.has(f.group)) grouped.set(f.group, []);
    grouped.get(f.group)!.push({ key: String(f.key), label: f.label });
  }

  return (
    <Modal
      open={!!playerId}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      title={player ? `${player.firstName} ${player.lastName}` : 'Player'}
    >
      {!player ? (
        <p className="text-[var(--text-sec)] py-8 text-center">Player not found.</p>
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-4 mb-5">
            {/* BUG-38: lead with the player's avatar (real headshot for
                imported NBA players via sportData.photoUrl, initials badge
                in the team's colors otherwise). The team logo used to take
                this slot, which read as a team card instead of a player card. */}
            <PlayerAvatar
              firstName={player.firstName}
              lastName={player.lastName}
              primaryColor={team?.primaryColor ?? 'var(--accent)'}
              secondaryColor={team?.secondaryColor ?? '#fff'}
              photoUrl={(player.sportData as { photoUrl?: string }).photoUrl}
              size="xl"
            />
            <div className="min-w-0">
              <div className="text-2xl font-extrabold flex items-center gap-2 flex-wrap">
                <span>{player.firstName} {player.lastName}</span>
                {/* Keep a small team logo next to the name so the team context
                    isn't lost when the headshot takes the headline slot. */}
                {team && (
                  <TeamLogo
                    abbreviation={team.abbreviation}
                    primaryColor={team.primaryColor}
                    secondaryColor={team.secondaryColor}
                    size="xs"
                  />
                )}
              </div>
              <p className="text-sm text-[var(--text-sec)]">
                {player.sportData.position} · Age {player.age}
                {team && ` · ${team.city} ${team.name}`}
                {' · '}<span className="capitalize">{player.sportData.starTier}</span>
              </p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <div
                className="text-4xl font-extrabold px-4 py-1 rounded-lg text-white"
                style={{ background: 'var(--accent)' }}
                title="Overall rating"
              >
                {player.ratings.overall}
              </div>
              <OvrTrend delta={ovrDelta} />
            </div>
          </header>

          <div className="flex flex-wrap gap-2 mb-5">
            <Badge variant="default" size="md">
              {Math.floor(player.ratings.height / 12)}&apos;{player.ratings.height % 12}&quot;
            </Badge>
            <Badge variant="default" size="md">{player.ratings.wingspan}&quot; wing</Badge>
            <Badge variant={trajectoryVariant(player.development.currentTrajectory)} size="md">
              {player.development.currentTrajectory}
            </Badge>
            {player.sportData.isTwoWay && <Badge variant="amber" size="md">Two-way</Badge>}
            {injuryActive && injury && (
              <Badge variant="red" size="md">
                {injury.returnDay >= 50_000
                  ? `Out for season (${injury.bodyPart})`
                  : `Out: ${injury.bodyPart} · ${injury.returnDay - day}d (${SEVERITY_LABEL[injury.severity]})`}
              </Badge>
            )}
          </div>

          {/* Stat lines: current season + last-season comparison. */}
          {(seasonStats?.gamesPlayed || lastSeason) && (
            <div
              className="mb-5 p-3 rounded-lg space-y-2"
              style={{ background: 'var(--surface-2)' }}
            >
              {seasonStats && seasonStats.gamesPlayed > 0 && (
                <StatLine
                  label="This season"
                  ppg={per(seasonStats.points, seasonStats.gamesPlayed)}
                  rpg={per(seasonStats.totalRebounds, seasonStats.gamesPlayed)}
                  apg={per(seasonStats.assists, seasonStats.gamesPlayed)}
                  fgPct={pct(seasonStats.fieldGoalsMade, seasonStats.fieldGoalsAttempted)}
                  tpPct={pct(seasonStats.threePointsMade, seasonStats.threePointsAttempted)}
                  gp={seasonStats.gamesPlayed}
                  mpg={per(seasonStats.minutes, seasonStats.gamesPlayed)}
                />
              )}
              {lastSeason && (
                <StatLine
                  label="Last season"
                  ppg={lastSeason.ppg.toFixed(1)}
                  rpg={lastSeason.rpg.toFixed(1)}
                  apg={lastSeason.apg.toFixed(1)}
                  gp={lastSeason.gamesPlayed}
                  muted
                />
              )}
            </div>
          )}

          {canTradeFor && player.rosterSlot && (
            <div className="mb-5">
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  onClose();
                  router.push(`/trade?target=${player.rosterSlot!.teamId}&getPlayer=${player.id}`);
                }}
              >
                🔁 Trade for this player
              </Button>
            </div>
          )}

          <section className="grid sm:grid-cols-2 gap-4">
            {[...grouped.entries()].map(([group, fields]) => (
              <div
                key={group}
                className="p-4 rounded-lg"
                style={{ background: 'var(--surface-2)' }}
              >
                <h3 className="text-xs font-bold uppercase tracking-wide mb-3 text-[var(--text-sec)]">{group}</h3>
                <ul className="space-y-2">
                  {fields.map(f => {
                    const v = (player.ratings as unknown as Record<string, number>)[f.key];
                    if (typeof v !== 'number') return null;
                    // EPIC-D: tier label + actual hex color on the bar so a
                    // new user can read 'ELITE 86' rather than just decode 86.
                    const tier = ratingTier(v);
                    const hex = ratingHex(v);
                    return (
                      <li key={f.key} className="flex items-center gap-2 sm:gap-3" title={f.label}>
                        <span className="w-14 text-xs text-[var(--text-sec)] truncate">{f.label}</span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
                          <div className="h-2 rounded-full" style={{ width: `${v}%`, background: hex }} />
                        </div>
                        <span className="w-10 text-[10px] uppercase tracking-wide font-bold text-right" style={{ color: hex }}>{tier}</span>
                        <span className="w-7 text-right text-sm font-semibold tabular-nums">{v}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {isGodMode(league) && <GodModeEditor key={player.id} player={player} />}

          <div className="mt-5 text-center">
            <Link
              href={`/player/${player.id}`}
              onClick={onClose}
              className="text-sm font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Open full player page →
            </Link>
          </div>
        </>
      )}
    </Modal>
  );
}

/** God-Mode editor: stepper controls for overall, age, and potential. */
function GodModeEditor({ player }: { player: BasketballPlayer }) {
  const godEditPlayer = useLeagueStore(s => s.godEditPlayer);
  // Keyed by player id at the call site, so a fresh mount re-seeds from props.
  const [ovr, setOvr] = useState(player.ratings.overall);
  const [age, setAge] = useState(player.age);
  const [pot, setPot] = useState(player.development.potential);

  const dirty = ovr !== player.ratings.overall || age !== player.age || pot !== player.development.potential;

  return (
    <section className="mt-5 rounded-lg border p-4" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
      <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--accent)' }}>🛠️ God Mode</h3>
      <div className="grid grid-cols-3 gap-3">
        <Stepper label="Overall" value={ovr} min={40} max={99} onChange={setOvr} />
        <Stepper label="Age" value={age} min={18} max={44} onChange={setAge} />
        <Stepper label="Potential" value={Math.max(pot, ovr)} min={ovr} max={99} onChange={setPot} />
      </div>
      <button
        disabled={!dirty}
        onClick={() => void godEditPlayer(player.id, { setOverall: ovr, age, potential: Math.max(pot, ovr) })}
        className="mt-3 w-full text-sm font-bold rounded-lg py-2 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {dirty ? 'Apply changes' : 'No changes'}
      </button>
    </section>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: 'var(--surface-2)' }}>
      <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => onChange(clamp(value - 1))} className="w-6 h-6 rounded font-bold" style={{ background: 'var(--surface)' }}>−</button>
        <span className="w-8 text-lg font-black tabular-nums">{value}</span>
        <button onClick={() => onChange(clamp(value + 1))} className="w-6 h-6 rounded font-bold" style={{ background: 'var(--surface)' }}>+</button>
      </div>
    </div>
  );
}

/** OVR delta indicator vs the pre-offseason snapshot. Nothing when delta is 0. */
function OvrTrend({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className="text-xs font-bold tabular-nums"
      style={{ color: up ? '#10b981' : '#dc2626' }}
      title="Change vs last season"
    >
      {up ? '▲' : '▼'} {up ? '+' : ''}{delta}
    </span>
  );
}

function StatLine({
  label, ppg, rpg, apg, fgPct, tpPct, gp, mpg, muted,
}: {
  label: string;
  ppg: string;
  rpg: string;
  apg: string;
  fgPct?: string;
  tpPct?: string;
  gp: number;
  mpg?: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm ${muted ? 'opacity-70' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)] w-20">{label}</span>
      <span><strong className="tabular-nums">{ppg}</strong> <span className="text-[var(--text-sec)] text-xs">PPG</span></span>
      <span><strong className="tabular-nums">{rpg}</strong> <span className="text-[var(--text-sec)] text-xs">RPG</span></span>
      <span><strong className="tabular-nums">{apg}</strong> <span className="text-[var(--text-sec)] text-xs">APG</span></span>
      {fgPct && <span><strong className="tabular-nums">{fgPct}</strong> <span className="text-[var(--text-sec)] text-xs">FG</span></span>}
      {tpPct && <span><strong className="tabular-nums">{tpPct}</strong> <span className="text-[var(--text-sec)] text-xs">3P</span></span>}
      <span className="text-[var(--text-sec)] text-xs tabular-nums">{gp} GP{mpg ? ` · ${mpg} MPG` : ''}</span>
    </div>
  );
}

function per(total: number, games: number): string {
  if (!games) return '0.0';
  return (total / games).toFixed(1);
}

function pct(made: number, att: number): string {
  if (!att) return '—';
  return `${Math.round((made / att) * 100)}%`;
}

function trajectoryVariant(t: string): 'green' | 'red' | 'default' {
  if (t === 'breakout' || t === 'rising') return 'green';
  if (t === 'declining' || t === 'cliff') return 'red';
  return 'default';
}
