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
import { ReleaseModal } from '@/components/modals/ReleaseModal';
import { DepthChart } from '@/components/roster/DepthChart';
import { resolveLineup, validateBasketballLineup, buildDefaultBasketballLineup } from '@/lib/lineup';
import { getHeadCoach, coachScheme, schemeFit, SCHEME_LABELS, type SchemeFit } from '@/lib/coaching/coaches';
import { getInjuries } from '@/lib/injuries';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { lastSeasonLog } from '@/lib/stats/statLine';
import { playerMood, moodFactors, type Mood, type MoodFactor } from '@/lib/roster/mood';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import type { BasketballLineup, BasketballPlayer, BasketballPosition, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import type { ValidationViolation } from '@bs/core/adapter';

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

// Scheme-fit dot palette — shared by the legend and every row's dot so neutral
// reads the same in both (muted amber rather than the engine's grey text token).
const FIT_LEGEND_COLOR: Record<SchemeFit['tier'], string> = {
  great: '#10b981', good: '#84cc16', neutral: '#f59e0b', poor: '#dc2626',
};

const ROW_GRID = 'grid items-center gap-2 px-2 py-1.5 min-w-[52rem]';
// Name is capped so it no longer hogs all the slack; the stats column shares the
// remaining width with it, so PPG/RPG/APG · MP · PER has room to breathe.
const ROW_COLS = { gridTemplateColumns: '2.5rem minmax(9rem,1fr) 2.6rem 2.6rem 2.8rem 2.8rem 6rem 7rem 2.6rem minmax(9rem,1fr) 6rem 5rem' };

interface MenuState { id: string; x: number; y: number }

export default function RosterPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // FEAT-26: which team's roster we're viewing. Defaults to the user's team;
  // any other selection renders read-only (no lineup editing / front-office).
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [moodOpenId, setMoodOpenId] = useState<string | null>(null);

  const activeTeamId = viewTeamId ?? league?.userTeamId ?? null;
  const isReadOnly = !!league && activeTeamId !== league.userTeamId;

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league || !activeTeamId) return null;
    return (league.teams.find(t => t.id === activeTeamId) as BasketballTeam | undefined) ?? null;
  }, [league, activeTeamId]);

  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !team) return [];
    const players = league.players as Record<string, BasketballPlayer>;
    return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
  }, [league, team]);

  const statsMap = useMemo(() => (league ? regularSeasonStatsByPlayer(league) : new Map()), [league]);

  // BUG-24: during the offseason Re-sign phase, the engine flags expiring
  // players on sportData.pendingResign. Tint their rows so the user can see
  // his roster as it WOULD look without them (pending walk to FA).
  const pendingResignIds = useMemo(
    () => new Set<string>(
      (league?.sportData as { pendingResign?: string[] } | undefined)?.pendingResign ?? [],
    ),
    [league],
  );

  // OVR rank on the team (0 = best) — drives the Mood model.
  const talentRank = useMemo(() => {
    const m = new Map<string, number>();
    [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).forEach((p, i) => m.set(p.id, i));
    return m;
  }, [roster]);

  // Lineup state — seeded from the resolved (saved-or-default) lineup. Re-seeds
  // whenever the viewed team changes (FEAT-26 team switcher) so each team shows
  // its own starters/bench.
  const [starters, setStarters] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [seededTeamId, setSeededTeamId] = useState<string | null>(null);
  if (team && roster.length > 0 && seededTeamId !== team.id) {
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
    setSeededTeamId(team.id);
    setSaved(false);
    setMenu(null);
    setMoodOpenId(null);
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
    return playerMood({ player: p, team: team!, talentRank: talentRank.get(p.id) ?? 99, isStarter, yearsLeft: contractYearsLeft(p, season) });
  }
  function moodFactorsFor(p: BasketballPlayer, isStarter: boolean): MoodFactor[] {
    return moodFactors({ player: p, team: team!, talentRank: talentRank.get(p.id) ?? 99, isStarter, yearsLeft: contractYearsLeft(p, season) });
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
    // The five slots are on-court roles, not position gates — any player can fill
    // any slot. Prefer the player's natural-position slot when it's open; if it's
    // already taken, drop into the first empty slot so you can stack a position
    // (e.g. start five guards). Only when the lineup is full do we swap into the
    // natural slot.
    const pos = playerById[id]?.sportData.position;
    const natural = pos ? POSITIONS.indexOf(pos) : 0;
    const firstEmpty = starters.findIndex(s => !s);
    let slot = natural >= 0 && !starters[natural] ? natural : firstEmpty;
    if (slot < 0) slot = natural >= 0 ? natural : 0; // lineup full → swap into natural
    setStarter(slot, id);
  }

  function benchStarter(slot: number) {
    // Move the starter to the bench and leave the slot OPEN — don't auto-promote
    // a same-position replacement (that's what blocked putting, say, a PF into the
    // SF slot). Fill the empty slot by dragging a player onto it or clicking Start.
    const id = starters[slot];
    if (!id) return;
    setSaved(false);
    setStarters(prev => prev.map((x, i) => (i === slot ? '' : x)));
    setBench(prev => (prev.includes(id) ? prev : [...prev, id]));
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
  function onRelease(id: string) {
    setMenu(null);
    setReleaseId(id);
  }
  function onReleased(id: string) {
    setStarters(s => s.map(x => (x === id ? '' : x)));
    setBench(b => b.filter(x => x !== id));
    setSaved(false);
  }
  function onExtend(id: string) { setMenu(null); setExtendId(id); }
  function onDetails(id: string) { setMenu(null); setModalPlayerId(id); }
  // FEAT-5: deep-link the trade builder with this player pre-loaded as one of
  // the user's outgoing assets. /trade already reads ?give=<playerId> for the
  // user side (mirrors the existing ?target=...&getPlayer=... seed used by
  // "Trade for this player" entry points on the team / player pages).
  function onTrade(id: string) { setMenu(null); router.push(`/trade?give=${id}`); }

  // Just the roster count, or "Cut to 15" when over the limit. There used to be a
  // "Sign a free agent" pill when short-handed, but it was a non-interactive span
  // and in-season free agency isn't supported, so it only looked clickable — drop
  // it (BUG-25).
  const sizeBadge = isReadOnly || roster.length <= TARGET_ROSTER
    ? { text: `${roster.length} / ${TARGET_ROSTER}`, color: 'var(--text-sec)' }
    : { text: `Cut to ${TARGET_ROSTER}`, color: '#dc2626' };

  const hc = getHeadCoach(league, team.id);
  const hcScheme = hc ? coachScheme(hc) : null;
  const injuries = getInjuries(league);
  const today = league.currentTick;
  const injuryLabel = (id: string): string | null => {
    const inj = injuries[id];
    if (!inj || inj.returnDay <= today) return null;
    return inj.returnDay >= 50_000 ? 'OUT' : `OUT ${inj.returnDay - today}d`;
  };
  const renderCells = (p: BasketballPlayer, isStarter: boolean, dragData: object) => (
    <PlayerCells
      p={p}
      stats={statsForPlayer(statsMap, p.id)}
      mood={moodFor(p, isStarter)}
      moodFactors={moodFactorsFor(p, isStarter)}
      moodOpen={moodOpenId === p.id}
      onToggleMood={() => setMoodOpenId(cur => (cur === p.id ? null : p.id))}
      fit={hcScheme ? schemeFit(p, hcScheme) : null}
      injury={injuryLabel(p.id)}
      season={season}
      draggable={!isReadOnly}
      dragData={dragData}
      onName={setModalPlayerId}
    />
  );

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>{team.city} {team.name} Roster</h1>
            {/* FEAT-26: team switcher — view any team's roster read-only */}
            <select
              aria-label="View team roster"
              value={team.id}
              onChange={e => setViewTeamId(e.target.value)}
              className="text-sm font-semibold rounded-lg border px-2 py-1 bg-[var(--surface)] hover:bg-[var(--surface-2)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {[...league.teams]
                .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.city} {t.name}{t.id === league.userTeamId ? ' (your team)' : ''}
                  </option>
                ))}
            </select>
            {isReadOnly && (
              <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--text-sec) 16%, transparent)', color: 'var(--text-sec)' }}>
                Read-only
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-sec)]">
            <span className="tabular-nums font-semibold">{team.record.wins}–{team.record.losses}</span>
            <span>· payroll {fmtMoney(cap.payroll)} ·</span>
            <span className="tabular-nums">{cap.capRoom >= 0 ? `${fmtMoney(cap.capRoom)} room` : `${fmtMoney(-cap.capRoom)} over`}</span>
            <span>·</span>
            <span className="tabular-nums">Roster {roster.length}/{TARGET_ROSTER}</span>
          </div>
        </div>
        <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: `color-mix(in srgb, ${sizeBadge.color} 16%, transparent)`, color: sizeBadge.color }}>{sizeBadge.text}</span>
        {!isReadOnly && (
          <Link href="/trade" className="text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>Trade →</Link>
        )}
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

      {/* Lineup controls — editing only on the user's own team (FEAT-26). */}
      {isReadOnly ? (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xs text-[var(--text-sec)] mr-auto">Viewing another team — lineup and roster moves are disabled.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-xs text-[var(--text-sec)] mr-auto">Drag a player onto a starting slot, or use <b>Start</b> / <b>Bench</b>, then save.</p>
          <Button variant="ghost" onClick={autoFill}>Auto-fill</Button>
          <Button variant="primary" disabled={!validation.valid || store.loading} onClick={() => void save()}>
            {store.loading ? 'Working…' : 'Save Lineup'}
          </Button>
          {saved && <span className="text-sm" style={{ color: 'var(--accent)' }}>✓ Saved</span>}
        </div>
      )}

      {/* Scheme-fit legend */}
      {hcScheme && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-[var(--text-sec)]">
          <span>Scheme fit ({SCHEME_LABELS[hcScheme]}):</span>
          {(['great', 'good', 'neutral', 'poor'] as const).map(label => (
            <span key={label} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: FIT_LEGEND_COLOR[label] }} />{label}</span>
          ))}
        </div>
      )}

      {/* Combined table */}
      <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <div className={`${ROW_GRID} text-[10px] uppercase tracking-wide text-[var(--text-sec)] border-b font-semibold`} style={{ ...ROW_COLS, borderColor: 'var(--border)' }}>
          <span></span><span>Name</span><span>Pos</span><span className="text-right">Age</span><span className="text-right">OVR</span><span className="text-right">POT</span><span className="text-right">Contract</span><span className="text-right">Acquired</span><span className="text-right">GP</span><span className="text-right">PPG/RPG/APG</span><span className="text-center">Mood</span><span className="text-right">Action</span>
        </div>

        {/* Starters */}
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>Starters</div>
        {POSITIONS.map((pos, slot) => {
          const p = starters[slot] ? playerById[starters[slot]] : null;
          // BUG-24: amber tint overrides the starter-row accent when expiring.
          const isPending = !!p && pendingResignIds.has(p.id);
          const baseBg = dragOverSlot === slot
            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
            : 'color-mix(in srgb, var(--accent) 5%, transparent)';
          const starterBg = isPending ? 'color-mix(in srgb, #f59e0b 14%, transparent)' : baseBg;
          return (
            <div
              key={pos}
              draggable={!!p && !isReadOnly}
              onDragStart={p && !isReadOnly ? e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, from: 'starter', slot })); e.dataTransfer.effectAllowed = 'move'; } : undefined}
              onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOverSlot(slot); }}
              onDragLeave={isReadOnly ? undefined : () => setDragOverSlot(s => (s === slot ? null : s))}
              onDrop={isReadOnly ? undefined : e => onDropSlot(slot, e)}
              className={`${ROW_GRID} border-t ${p && !isReadOnly ? 'cursor-grab' : ''}`}
              style={{ ...ROW_COLS, borderColor: 'var(--border)', background: starterBg }}
              title={isPending ? 'Expiring contract — re-sign or this player walks at season start' : undefined}
            >
              <span className="text-[11px] font-black text-center rounded" style={{ color: POS_COLORS[pos] }} title={`Starting ${pos}`}>{pos}</span>
              {p ? renderCells(p, true, { id: p.id, from: 'starter', slot }) : <EmptyStarter />}
              {isReadOnly ? <span /> : (
                <ActionCell
                  toggle={p ? { label: 'Bench', onClick: () => benchStarter(slot) } : null}
                  onMenu={p ? e => setMenu({ id: p.id, x: e.clientX, y: e.clientY }) : undefined}
                />
              )}
            </div>
          );
        })}

        {/* Bench */}
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>Bench</div>
        {bench.map(id => {
          const p = playerById[id];
          if (!p) return null;
          // BUG-24: amber tint for expiring players during Re-sign phase.
          const isPending = pendingResignIds.has(p.id);
          const benchRowStyle = isPending
            ? { ...ROW_COLS, borderColor: 'var(--border)', background: 'color-mix(in srgb, #f59e0b 10%, transparent)' }
            : { ...ROW_COLS, borderColor: 'var(--border)' };
          return (
            <div
              key={id}
              draggable={!isReadOnly}
              onDragStart={isReadOnly ? undefined : e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, from: 'bench', slot: -1 })); e.dataTransfer.effectAllowed = 'move'; }}
              className={`${ROW_GRID} border-t ${isReadOnly ? '' : 'cursor-grab'}`}
              style={benchRowStyle}
              title={isPending ? 'Expiring contract — re-sign or this player walks at season start' : undefined}
            >
              <span className="text-xs opacity-30 text-center select-none" aria-hidden>⠿</span>
              {renderCells(p, false, { id: p.id, from: 'bench', slot: -1 })}
              {isReadOnly ? <span /> : (
                <ActionCell
                  toggle={{ label: 'Start', onClick: () => startPlayer(id), accent: true }}
                  onMenu={e => setMenu({ id: p.id, x: e.clientX, y: e.clientY })}
                />
              )}
            </div>
          );
        })}
      </div>

      {validation.warnings.length > 0 && (
        <p className="mt-2 text-xs" style={{ color: '#f59e0b' }}>⚠ {humanizeWarning(validation.warnings[0], roster)}</p>
      )}

      {/* Per-position depth chart (#21) */}
      <DepthChart roster={roster} starterIds={starters} onName={setModalPlayerId} />

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
            <MenuItem label="Trade…" onClick={() => onTrade(menu.id)} />
            <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
            <MenuItem label="Release" danger onClick={() => void onRelease(menu.id)} />
          </div>
        </>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
      <ReleaseModal playerId={releaseId} onClose={() => setReleaseId(null)} onReleased={onReleased} />
    </Shell>
  );
}

// ===========================================================================
// Cells
// ===========================================================================

function PlayerCells({
  p, stats, mood, moodFactors, moodOpen, onToggleMood, fit, injury, season, draggable, dragData, onName,
}: {
  p: BasketballPlayer;
  stats: BasketballStats;
  mood: Mood;
  moodFactors: MoodFactor[];
  moodOpen: boolean;
  onToggleMood: () => void;
  fit: SchemeFit | null;
  injury: string | null;
  season: number;
  draggable: boolean;
  dragData: object;
  onName: (id: string) => void;
}) {
  const gp = stats.gamesPlayed;
  // Before the season tips off (or right after taking over a team) nobody has
  // current-season games, so fall back to last season's line so the inherited
  // roster is still legible (BUG-24).
  const lastLog = gp === 0 ? lastSeasonLog(p) : null;
  const per = (v: number) => (gp > 0 ? (v / gp).toFixed(1) : '—');
  const statLine = gp > 0 ? `${per(stats.points)} / ${per(stats.totalRebounds)} / ${per(stats.assists)}` : '—';
  const mpg = gp > 0 ? (stats.minutes / gp).toFixed(1) : null;
  // Simplified efficiency rating (NBA "EFF" per game) shown as PER.
  const eff = gp > 0
    ? ((stats.points + stats.totalRebounds + stats.assists + stats.steals + stats.blocks
        - (stats.fieldGoalsAttempted - stats.fieldGoalsMade)
        - (stats.freeThrowsAttempted - stats.freeThrowsMade)
        - stats.turnovers) / gp).toFixed(1)
    : null;
  return (
    <>
      <button
        draggable={draggable}
        onDragStart={draggable ? e => { e.dataTransfer.setData('application/json', JSON.stringify(dragData)); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onClick={() => onName(p.id)}
        className={`font-semibold text-left truncate hover:underline inline-flex items-center gap-1.5 min-w-0 ${draggable ? 'cursor-grab' : 'cursor-pointer'}`}
        style={{ color: 'var(--accent)' }}
        title={draggable ? 'Drag to a starting slot, or click for details' : 'Click for details'}
      >
        {fit && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: FIT_LEGEND_COLOR[fit.tier] }}
            title={`Scheme fit: ${fit.tier}${fit.delta !== 0 ? ` (${fit.delta > 0 ? '+' : ''}${fit.delta} OVR)` : ''}`}
          />
        )}
        <span className="truncate">{p.firstName} {p.lastName}</span>
      </button>
      <span className="text-xs font-mono" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</span>
      <span className="text-right tabular-nums text-sm">{p.age}</span>
      <span className="text-right tabular-nums text-sm font-bold inline-flex items-center justify-end gap-1" style={{ color: ovrColor(p.ratings.overall) }}>
        {p.ratings.overall}
        <OvrTrend player={p} />
      </span>
      <span className="text-right tabular-nums text-sm opacity-70">{p.development.potential}</span>
      <span className="text-right tabular-nums text-xs">{contractLabel(p, season)}</span>
      <span className="text-right text-xs text-[var(--text-sec)]">{acquiredLabel(p)}</span>
      {/* GP cell. When sourcing from `lastLog` (no current-season games yet),
          mute the number so it doesn't read as a current-year count (BUG-25). */}
      <span className={`text-right tabular-nums text-sm ${gp > 0 ? '' : 'text-[var(--text-sec)]'}`}>
        {gp || (lastLog ? lastLog.gamesPlayed : '—')}
      </span>
      <span className="text-right tabular-nums text-xs leading-tight">
        {gp > 0 ? (
          <>
            <span className="block">{statLine}</span>
            {mpg && <span className="block text-[10px] opacity-60">{mpg} MP · {eff} PER</span>}
          </>
        ) : lastLog ? (
          <>
            <span className="block">{lastLog.ppg} / {lastLog.rpg} / {lastLog.apg}</span>
            {/* Honest about what this is: the player has no games THIS season,
                so we're showing his most recent logged season — which may be
                multiple sim years back if he's been buried / injured / etc.
                "last season" read as "season - 1" and misled users (BUG-25). */}
            <span className="block text-[10px] opacity-60">Last played &apos;{String(lastLog.season).slice(2)}</span>
          </>
        ) : (
          <span className="block">—</span>
        )}
      </span>
      <span className="relative flex justify-center">
        {injury ? (
          <span className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap" style={{ background: 'color-mix(in srgb, #dc2626 16%, transparent)', color: '#dc2626' }} title="Injured — unavailable">
            🏥 {injury}
          </span>
        ) : (
          <>
            <button
              onClick={onToggleMood}
              aria-expanded={moodOpen}
              className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap inline-flex items-center gap-1 hover:brightness-105"
              style={{ background: `color-mix(in srgb, ${mood.color} 24%, transparent)`, color: mood.color }}
              title={`${mood.reason} — click for the contributing factors`}
            >
              <span aria-hidden>{mood.emoji}</span>{mood.label}
            </button>
            {moodOpen && <MoodPopover mood={mood} factors={moodFactors} onClose={onToggleMood} />}
          </>
        )}
      </span>
    </>
  );
}

/** FEAT-27: click-to-expand explainer listing the contributing mood factors. */
function MoodPopover({ mood, factors, onClose }: { mood: Mood; factors: MoodFactor[]; onClose: () => void }) {
  return (
    <>
      {/* click-away catcher */}
      <span className="fixed inset-0 z-40" onClick={onClose} />
      <span
        className="absolute z-50 top-full right-0 mt-1 w-56 rounded-lg border bg-[var(--surface)] shadow-lg p-2.5 text-left normal-case"
        style={{ borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <span className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: mood.color }}>
          <span aria-hidden>{mood.emoji}</span>{mood.label}
        </span>
        {factors.length === 0 ? (
          <span className="block text-[11px] text-[var(--text-sec)]">Role fits his level — nothing notable.</span>
        ) : (
          <span className="block space-y-1">
            {factors.map((f, i) => (
              <span key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text)]">
                <span className="font-black shrink-0" style={{ color: f.positive ? '#16a34a' : '#dc2626' }}>{f.positive ? '+' : '−'}</span>
                <span>{f.label}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
}

/** Tiny inline OVR movement vs the pre-offseason snapshot (▲ +3 / ▼ -2). */
function OvrTrend({ player }: { player: BasketballPlayer }) {
  const prev = player.sportData.prevRatings?.overall;
  if (prev == null) return null;
  const delta = player.ratings.overall - prev;
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className="text-[9px] font-bold leading-none tabular-nums"
      style={{ color: up ? '#10b981' : '#dc2626' }}
      title={`${up ? '+' : ''}${delta} OVR since last season`}
    >
      {up ? '▲' : '▼'}{up ? '+' : ''}{delta}
    </span>
  );
}

function ActionCell({ toggle, onMenu }: { toggle: { label: string; onClick: () => void; accent?: boolean } | null; onMenu?: (e: React.MouseEvent) => void }) {
  return (
    <span className="flex items-center justify-end gap-1">
      {toggle && (
        // MOBILE-5: bs-touch-target lifts this from ~20px → 44px min on
        // touch devices only — desktop stays compact.
        <button
          onClick={toggle.onClick}
          className="bs-touch-target text-[11px] font-semibold rounded border px-1.5 py-0.5 hover:bg-[var(--surface-2)]"
          style={{ borderColor: toggle.accent ? 'var(--accent)' : 'var(--border)', color: toggle.accent ? 'var(--accent)' : 'var(--text-sec)' }}
        >
          {toggle.label}
        </button>
      )}
      {onMenu && (
        <button onClick={onMenu} className="bs-touch-target w-6 h-6 rounded hover:bg-[var(--surface-2)] text-[var(--text-sec)]" aria-label="Player actions" title="Actions">⋯</button>
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
  // 10 cells to match PlayerCells: name, pos, age, ovr, pot, contract, acquired, gp, stats, mood.
  return (
    <>
      <span className="text-sm" style={{ color: '#dc2626' }}>— empty —</span>
      <span /><span /><span /><span /><span /><span /><span /><span /><span />
    </>
  );
}

/** How the player joined his team (roster "Acquired" column), with a fallback
 *  for old saves that predate acquisition tracking. */
function acquiredLabel(p: BasketballPlayer): string {
  const sd = p.sportData;
  switch (sd.acquiredVia) {
    case 'draft': return `Draft #${sd.draftPick ?? '?'}${sd.draftYear ? ` (${sd.draftYear})` : ''}`;
    case 'free-agency': return `Free Agent${sd.acquiredSeason ? ` (${sd.acquiredSeason})` : ''}`;
    case 'trade': return `Trade${sd.acquiredSeason ? ` (${sd.acquiredSeason})` : ''}`;
    case 'initial': return sd.draftPick ? `Draft #${sd.draftPick}` : 'Original';
    default: return sd.draftPick ? `Draft #${sd.draftPick}` : sd.draftRound ? 'Drafted' : '—';
  }
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

/** Turn a lineup-validation warning into player-friendly text: the engine builds
 *  messages with raw player IDs (e.g. "player-105 listed as PG …"), so swap any
 *  rostered player's id for their name before showing it. */
function humanizeWarning(w: ValidationViolation, roster: BasketballPlayer[]): string {
  const named = (p: BasketballPlayer) => `${p.firstName} ${p.lastName}`;
  // Prefer the structured ref when present; still scrub the message body for any
  // other ids that might be embedded.
  let msg = w.message;
  const ref = roster.find(p => p.id === w.ref?.id);
  if (ref) msg = msg.split(ref.id).join(named(ref));
  for (const p of roster) {
    if (msg.includes(p.id)) msg = msg.split(p.id).join(named(p));
  }
  return msg;
}

function contractLabel(p: BasketballPlayer, season: number): string {
  if (!p.contract) return '—';
  // Show the deal's AAV over its remaining years, not just THIS season's salary.
  // After an extension the raise lands in future years, so the current-season
  // figure made a freshly re-signed player still read at his old number ("didn't
  // increase the amount"); AAV reflects the actual deal. Flat contracts are
  // unchanged (AAV == current salary).
  const remaining = p.contract.years.filter(y => y.season >= season);
  if (remaining.length === 0) return '—';
  const aav = remaining.reduce((s, y) => s + y.baseSalary + y.proratedBonus, 0) / remaining.length;
  if (aav <= 0) return '—';
  return `${fmtMoney(aav)} · ${remaining.length}y`;
}
