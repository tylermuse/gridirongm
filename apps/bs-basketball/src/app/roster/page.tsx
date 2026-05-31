'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { resolveLineup, validateBasketballLineup, buildDefaultBasketballLineup } from '@/lib/lineup';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { playerMood, type Mood } from '@/lib/roster/mood';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import type { BasketballLineup, BasketballPlayer, BasketballPosition, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

/**
 * /roster — combined roster + depth chart (lineup editor) + front-office actions.
 *
 * Starting five grouped on top (one accent row per position slot), bench below.
 * Drag a player onto a slot — or use Start / Bench — to set the lineup, then
 * Save. Each row shows OVR/POT, contract, season stats (GP + PPG/RPG/APG), a
 * derived Mood chip, and an Actions menu (Extend / Release / Details / Trade).
 */

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_COLORS: Record<BasketballPosition, string> = {
  PG: '#06b6d4', SG: '#10b981', SF: '#f59e0b', PF: '#f97316', C: '#8b5cf6',
};
const TARGET_ROSTER = 15;
const MIN_ROSTER = 13;

const ROW_GRID = 'grid items-center gap-2 px-2 py-1.5 min-w-[52rem]';
const ROW_COLS = { gridTemplateColumns: '2.75rem 1fr 2.4rem 2.4rem 2.6rem 2.6rem 5.5rem 2.2rem 6.5rem 5rem 5.5rem' };

interface MenuState { id: string; x: number; y: number }

export default function RosterPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !team) return [];
    const players = league.players as Record<string, BasketballPlayer>;
    return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
  }, [league, team]);

  const statsMap = useMemo(() => (league ? regularSeasonStatsByPlayer(league) : new Map()), [league]);

  // OVR rank on the team (0 = best) — drives the Mood model.
  const talentRank = useMemo(() => {
    const m = new Map<string, number>();
    [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).forEach((p, i) => m.set(p.id, i));
    return m;
  }, [roster]);

  // Lineup state — seeded once from the resolved (saved-or-default) lineup.
  const [starters, setStarters] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  if (!initialized && team && roster.length > 0) {
    const base = resolveLineup(team, roster);
    const s = [...base.starters];
    const benchInit = roster
      .filter(p => !s.includes(p.id))
      .sort((a, b) => {
        const ia = base.bench.indexOf(a.id), ib = base.bench.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return b.ratings.overall - a.ratings.overall;
      })
      .map(p => p.id);
    setStarters(s);
    setBench(benchInit);
    setInitialized(true);
  }

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!team) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="👥" title="No team yet" message="Pick a team from the League page to manage its roster." />
        </div>
      </Shell>
    );
  }

  const playerById = league.players as Record<string, BasketballPlayer>;
  const season = league.currentSeason;
  const cap = teamCap(league, team);
  const counts = countByPos(roster);
  const lineup: BasketballLineup = {
    starters: starters as BasketballLineup['starters'],
    bench: bench as BasketballLineup['bench'],
    backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null },
    pace: team.sportData.lineup?.pace ?? team.sportData.pace ?? 'medium',
  };
  const validation = validateBasketballLineup(lineup, roster);

  function moodFor(p: BasketballPlayer, isStarter: boolean): Mood {
    return playerMood({ player: p, talentRank: talentRank.get(p.id) ?? 99, isStarter, yearsLeft: contractYearsLeft(p, season) });
  }

  // --- lineup mutations ---
  function setStarter(slot: number, playerId: string) {
    setSaved(false);
    const existingSlot = starters.indexOf(playerId);
    const next = [...starters];
    if (existingSlot !== -1) {
      next[existingSlot] = starters[slot];
      next[slot] = playerId;
      setStarters(next);
      return;
    }
    const demoted = starters[slot];
    next[slot] = playerId;
    setStarters(next);
    setBench(prev => {
      const without = prev.filter(id => id !== playerId);
      return demoted ? [...without, demoted] : without;
    });
  }

  function startPlayer(id: string) {
    const pos = playerById[id]?.sportData.position;
    const slot = pos ? POSITIONS.indexOf(pos) : 0;
    setStarter(slot < 0 ? 0 : slot, id);
  }

  function benchStarter(slot: number) {
    const pos = POSITIONS[slot];
    const replacement = [...bench]
      .map(id => playerById[id])
      .filter(Boolean)
      .sort((a, b) => {
        const am = a.sportData.position === pos ? 1 : 0;
        const bm = b.sportData.position === pos ? 1 : 0;
        if (am !== bm) return bm - am;
        return b.ratings.overall - a.ratings.overall;
      })[0];
    if (replacement) setStarter(slot, replacement.id);
  }

  function onDropSlot(slot: number, e: React.DragEvent) {
    e.preventDefault();
    setDragOverSlot(null);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { id } = JSON.parse(raw) as { id: string };
      if (id && id !== starters[slot]) setStarter(slot, id);
    } catch { /* ignore */ }
  }

  async function save() {
    const ok = await store.saveLineup(team!.id, lineup);
    if (ok) setSaved(true);
  }

  function autoFill() {
    setSaved(false);
    const def = buildDefaultBasketballLineup(roster);
    setStarters([...def.starters]);
    setBench(roster.filter(p => !def.starters.includes(p.id)).sort((a, b) => b.ratings.overall - a.ratings.overall).map(p => p.id));
  }

  // --- front-office actions ---
  async function onRelease(id: string) {
    setMenu(null);
    const p = playerById[id];
    if (!window.confirm(`Release ${p?.firstName} ${p?.lastName} to free agency?`)) return;
    const ok = await store.releasePlayer(id);
    if (ok) {
      setStarters(s => s.map(x => (x === id ? '' : x)));
      setBench(b => b.filter(x => x !== id));
      setSaved(false);
    }
  }
  function onExtend(id: string) { setMenu(null); setExtendId(id); }
  function onDetails(id: string) { setMenu(null); setModalPlayerId(id); }
  function onTrade() { setMenu(null); router.push('/trade'); }

  const sizeBadge = roster.length > TARGET_ROSTER
    ? { text: `Cut to ${TARGET_ROSTER}`, color: '#dc2626' }
    : roster.length < MIN_ROSTER
    ? { text: 'Sign a free agent', color: '#f59e0b' }
    : { text: `${roster.length} / ${TARGET_ROSTER}`, color: 'var(--text-sec)' };

  const renderCells = (p: BasketballPlayer, isStarter: boolean, dragData: object) => (
    <PlayerCells p={p} stats={statsForPlayer(statsMap, p.id)} mood={moodFor(p, isStarter)} season={season} dragData={dragData} onName={setModalPlayerId} />
  );

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>{team.city} {team.name} Roster</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-sec)]">
            <span className="tabular-nums font-semibold">{team.record.wins}–{team.record.losses}</span>
            <span>· payroll {fmtMoney(cap.payroll)} ·</span>
            <span className="tabular-nums">{cap.capRoom >= 0 ? `${fmtMoney(cap.capRoom)} room` : `${fmtMoney(-cap.capRoom)} over`}</span>
          </div>
        </div>
        <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: `color-mix(in srgb, ${sizeBadge.color} 16%, transparent)`, color: sizeBadge.color }}>{sizeBadge.text}</span>
        <Link href="/trade" className="text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>Trade →</Link>
      </div>

      {/* Position composition bar */}
      <div className="mb-4">
        <div className="flex h-3 rounded-full overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {POSITIONS.map(pos => counts[pos] > 0 && (
            <div key={pos} title={`${pos}: ${counts[pos]}`} style={{ width: `${(counts[pos] / roster.length) * 100}%`, background: POS_COLORS[pos] }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--text-sec)]">
          {POSITIONS.map(pos => (
            <span key={pos} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: POS_COLORS[pos] }} />{pos} {counts[pos]}</span>
          ))}
        </div>
      </div>

      {/* Lineup controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <p className="text-xs text-[var(--text-sec)] mr-auto">Drag a player onto a starting slot, or use <b>Start</b> / <b>Bench</b>, then save.</p>
        <Button variant="ghost" onClick={autoFill}>Auto-fill</Button>
        <Button variant="primary" disabled={!validation.valid || store.loading} onClick={() => void save()}>
          {store.loading ? 'Working…' : 'Save Lineup'}
        </Button>
        {saved && <span className="text-sm" style={{ color: 'var(--accent)' }}>✓ Saved</span>}
      </div>

      {/* Combined table */}
      <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <div className={`${ROW_GRID} text-[10px] uppercase tracking-wide text-[var(--text-sec)] border-b font-semibold`} style={{ ...ROW_COLS, borderColor: 'var(--border)' }}>
          <span></span><span>Name</span><span>Pos</span><span className="text-right">Age</span><span className="text-right">OVR</span><span className="text-right">POT</span><span className="text-right">Contract</span><span className="text-right">GP</span><span className="text-right">PPG/RPG/APG</span><span className="text-center">Mood</span><span className="text-right">Action</span>
        </div>

        {/* Starters */}
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>Starters</div>
        {POSITIONS.map((pos, slot) => {
          const p = starters[slot] ? playerById[starters[slot]] : null;
          return (
            <div
              key={pos}
              onDragOver={e => { e.preventDefault(); setDragOverSlot(slot); }}
              onDragLeave={() => setDragOverSlot(s => (s === slot ? null : s))}
              onDrop={e => onDropSlot(slot, e)}
              className={`${ROW_GRID} border-t`}
              style={{ ...ROW_COLS, borderColor: 'var(--border)', background: dragOverSlot === slot ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'color-mix(in srgb, var(--accent) 5%, transparent)' }}
            >
              <span className="text-[11px] font-black text-center rounded" style={{ color: POS_COLORS[pos] }} title={`Starting ${pos}`}>{pos}</span>
              {p ? renderCells(p, true, { id: p.id, from: 'starter', slot }) : <EmptyStarter />}
              <ActionCell
                toggle={p ? { label: 'Bench', onClick: () => benchStarter(slot) } : null}
                onMenu={p ? e => setMenu({ id: p.id, x: e.clientX, y: e.clientY }) : undefined}
              />
            </div>
          );
        })}

        {/* Bench */}
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>Bench</div>
        {bench.map(id => {
          const p = playerById[id];
          if (!p) return null;
          return (
            <div key={id} className={`${ROW_GRID} border-t`} style={{ ...ROW_COLS, borderColor: 'var(--border)' }}>
              <span className="text-xs opacity-30 text-center cursor-grab select-none" aria-hidden>⠿</span>
              {renderCells(p, false, { id: p.id, from: 'bench', slot: -1 })}
              <ActionCell
                toggle={{ label: 'Start', onClick: () => startPlayer(id), accent: true }}
                onMenu={e => setMenu({ id: p.id, x: e.clientX, y: e.clientY })}
              />
            </div>
          );
        })}
      </div>

      {validation.warnings.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: '#f59e0b' }}>⚠ {validation.warnings[0].message}</p>
      )}

      {/* Actions menu (fixed, so the scroll container can't clip it) */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 rounded-lg border bg-[var(--surface)] shadow-lg py-1 text-sm w-44"
            style={{ left: menu.x, top: menu.y, transform: 'translateX(-100%)', borderColor: 'var(--border)' }}
          >
            <MenuItem label="Extend contract" onClick={() => onExtend(menu.id)} />
            <MenuItem label="View details" onClick={() => onDetails(menu.id)} />
            <MenuItem label="Trade…" onClick={onTrade} />
            <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
            <MenuItem label="Release" danger onClick={() => void onRelease(menu.id)} />
          </div>
        </>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
    </Shell>
  );
}

// ===========================================================================
// Cells
// ===========================================================================

function PlayerCells({
  p, stats, mood, season, dragData, onName,
}: {
  p: BasketballPlayer;
  stats: BasketballStats;
  mood: Mood;
  season: number;
  dragData: object;
  onName: (id: string) => void;
}) {
  const gp = stats.gamesPlayed;
  const per = (v: number) => (gp > 0 ? (v / gp).toFixed(1) : '—');
  const statLine = gp > 0 ? `${per(stats.points)} / ${per(stats.totalRebounds)} / ${per(stats.assists)}` : '—';
  return (
    <>
      <button
        draggable
        onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify(dragData)); e.dataTransfer.effectAllowed = 'move'; }}
        onClick={() => onName(p.id)}
        className="font-semibold text-left truncate hover:underline cursor-grab"
        style={{ color: 'var(--accent)' }}
        title="Drag to a starting slot, or click for details"
      >
        {p.firstName} {p.lastName}
      </button>
      <span className="text-xs font-mono" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</span>
      <span className="text-right tabular-nums text-sm">{p.age}</span>
      <span className="text-right tabular-nums text-sm font-bold" style={{ color: ovrColor(p.ratings.overall) }}>{p.ratings.overall}</span>
      <span className="text-right tabular-nums text-sm opacity-70">{p.development.potential}</span>
      <span className="text-right tabular-nums text-xs">{contractLabel(p, season)}</span>
      <span className="text-right tabular-nums text-sm">{gp || '—'}</span>
      <span className="text-right tabular-nums text-xs">{statLine}</span>
      <span className="flex justify-center">
        <span className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap" style={{ background: `color-mix(in srgb, ${mood.color} 16%, transparent)`, color: mood.color }} title={mood.reason}>
          {mood.label}
        </span>
      </span>
    </>
  );
}

function ActionCell({ toggle, onMenu }: { toggle: { label: string; onClick: () => void; accent?: boolean } | null; onMenu?: (e: React.MouseEvent) => void }) {
  return (
    <span className="flex items-center justify-end gap-1">
      {toggle && (
        <button
          onClick={toggle.onClick}
          className="text-[11px] font-semibold rounded border px-1.5 py-0.5 hover:bg-[var(--surface-2)]"
          style={{ borderColor: toggle.accent ? 'var(--accent)' : 'var(--border)', color: toggle.accent ? 'var(--accent)' : 'var(--text-sec)' }}
        >
          {toggle.label}
        </button>
      )}
      {onMenu && (
        <button onClick={onMenu} className="w-6 h-6 rounded hover:bg-[var(--surface-2)] text-[var(--text-sec)]" aria-label="Player actions" title="Actions">⋯</button>
      )}
    </span>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface-2)]"
      style={danger ? { color: '#dc2626' } : undefined}
    >
      {label}
    </button>
  );
}

function EmptyStarter() {
  // 9 cells to match PlayerCells: name, pos, age, ovr, pot, contract, gp, stats, mood.
  return (
    <>
      <span className="text-sm" style={{ color: '#dc2626' }}>— empty —</span>
      <span /><span /><span /><span /><span /><span /><span /><span />
    </>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}

function countByPos(roster: BasketballPlayer[]): Record<BasketballPosition, number> {
  const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of roster) c[p.sportData.position]++;
  return c;
}

function ovrColor(v: number): string {
  if (v >= 90) return '#10b981';
  if (v >= 80) return '#84cc16';
  if (v >= 70) return '#eab308';
  if (v >= 60) return '#f97316';
  return '#dc2626';
}

function contractLabel(p: BasketballPlayer, season: number): string {
  if (!p.contract) return '—';
  const cur = p.contract.years.find(y => y.season === season);
  const yearsLeft = p.contract.years.filter(y => y.season >= season).length;
  const salary = cur ? cur.baseSalary + cur.proratedBonus : 0;
  if (salary <= 0) return '—';
  return `${fmtMoney(salary)} · ${yearsLeft}y`;
}
