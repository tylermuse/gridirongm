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
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Badge } from '@/components/ui/Badge';
import { Modal } from './Modal';
import { isGodMode } from '@/lib/godMode/godMode';
import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';

interface PlayerModalProps {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const league = useLeagueStore(s => s.league);

  const player = playerId && league
    ? ((league.players as Record<string, BasketballPlayer>)[playerId] ?? null)
    : null;

  const team: BasketballTeam | null =
    player?.rosterSlot && league
      ? ((league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null)
      : null;

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
            {team && (
              <TeamLogo
                abbreviation={team.abbreviation}
                primaryColor={team.primaryColor}
                secondaryColor={team.secondaryColor}
                size="xl"
              />
            )}
            <div className="min-w-0">
              <div className="text-2xl font-extrabold">
                {player.firstName} {player.lastName}
              </div>
              <p className="text-sm text-[var(--text-sec)]">
                {player.sportData.position} · Age {player.age}
                {team && ` · ${team.city} ${team.name}`}
                {' · '}<span className="capitalize">{player.sportData.starTier}</span>
              </p>
            </div>
            <div
              className="ml-auto text-4xl font-extrabold px-4 py-1 rounded-lg text-white"
              style={{ background: 'var(--accent)' }}
              title="Overall rating"
            >
              {player.ratings.overall}
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
          </div>

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
                    return (
                      <li key={f.key} className="flex items-center gap-3">
                        <span className="w-14 text-xs text-[var(--text-sec)]">{f.label}</span>
                        <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
                          <div className="h-2 rounded-full" style={{ width: `${v}%`, background: ratingColor(v) }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold">{v}</span>
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

function ratingColor(v: number): string {
  if (v >= 90) return '#10b981';
  if (v >= 80) return '#84cc16';
  if (v >= 70) return '#eab308';
  if (v >= 60) return '#f97316';
  return '#dc2626';
}

function trajectoryVariant(t: string): 'green' | 'red' | 'default' {
  if (t === 'breakout' || t === 'rising') return 'green';
  if (t === 'declining' || t === 'cliff') return 'red';
  return 'default';
}
