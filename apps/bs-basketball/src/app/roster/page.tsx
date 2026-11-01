'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { ReleaseModal } from '@/components/modals/ReleaseModal';
import { DepthChart } from '@/components/roster/DepthChart';
import {
  NAME_CLS, OvrChip, PotValue, PotHeader, ContractText, TwoWayChip, ResponsiveName,
  SortTh, PlainTh, useRosterSort, contractInfo, injuryStatus, type InjuryStatus,
} from '@/components/roster/RosterCells';
import { resolveLineup, validateBasketballLineup, buildDefaultBasketballLineup } from '@/lib/lineup';
import { getHeadCoach, coachScheme, schemeFit, SCHEME_LABELS, type SchemeFit } from '@/lib/coaching/coaches';
import { getInjuries } from '@/lib/injuries';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { lastSeasonLog } from '@/lib/stats/statLine';
import { playerMood, moodFactors, type Mood, type MoodFactor } from '@/lib/roster/mood';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { tradeRequestBadge } from '@/lib/roster/tradeRequests';
import { releasePreview } from '@/lib/roster/release';
import type { BasketballLineup, BasketballPlayer, BasketballPosition, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import type { ValidationViolation } from '@bs/core/adapter';

/**
 * /roster — roster + lineup editor + front-office actions, in football's tabbed
 * layout:
 *   - Lineup: one list ranked by projected minutes. Drag a player onto a slot —
 *     or use Start / Bench — then Save.
 *   - Roster: sortable table with a position filter.
 *   - Depth: per-position depth chart.
 *   - Injuries: the team's injury report (GTD vs OUT).
 * Every row has the OVR chip, POT, contract (amber when expiring), season
 * stats, a Mood chip with its factor breakdown, and an Actions menu.
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

// The lineup grid is wider than a phone, so it scrolls sideways with the Min +
// Name cells pinned. min-w matches the column sum so row fills/borders span it.
const ROW_GRID = 'grid items-center gap-2 px-2 py-1.5 min-w-[63rem]';
const ROW_COLS = { gridTemplateColumns: '2.5rem minmax(9rem,1fr) 2.4rem 2.4rem 3.4rem 3.2rem 5.2rem 6rem 2.4rem minmax(8rem,1fr) 5rem 7rem' };
// Pinned cells inherit the row's (opaque) fill so scrolled cells pass beneath.
const PIN_MIN = 'sticky left-0 z-[1] self-stretch flex items-center justify-center';
const PIN_NAME = 'sticky left-10 z-[1] self-stretch';
const INHERIT_BG = { background: 'inherit' } as const;

/** Opaque tint of `color` over the surface — an alpha tint that stays solid
 *  under the pinned cells. */
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--surface))`;

type Tab = 'lineup' | 'roster' | 'depth' | 'injuries';
type PosFilter = 'ALL' | BasketballPosition;
type RosterSortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'contract' | 'gp' | 'ppg' | 'rpg' | 'apg';

const MENU_W = 232;
const MOOD_W = 224;

interface MenuState { id: string; top: number; left: number }
interface MoodPopState { id: string; left: number; top?: number; bottom?: number }

export default function RosterPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [dragOverBenchId, setDragOverBenchId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // FEAT-26: which team's roster we're viewing. Defaults to the user's team;
  // any other selection renders read-only (no lineup editing / front-office).
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [moodPop, setMoodPop] = useState<MoodPopState | null>(null);
  const [tab, setTab] = useState<Tab>('lineup');
  const [filterPos, setFilterPos] = useState<PosFilter>('ALL');
  const sort = useRosterSort<RosterSortKey>('ovr', 'desc', ['name', 'pos']);

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
    setMoodPop(null);
  }

  // Projected minutes per player — mirrors the sim's rotation so the roster can
  // be ranked by playing time: the 5 starters split ~168 team-minutes weighted
  // by OVR (stars play more); the top 5 bench split ~72 by a geometric decay
  // (earlier in the rotation = more run); anyone deeper is out of the rotation
  // (~0, shown as DNP). A projection off the lineup, not logged MPG.
  const rosterById = useMemo(() => new Map<string, BasketballPlayer>(roster.map(p => [p.id as string, p])), [roster]);
  const projMinutes = useMemo(() => {
    const m = new Map<string, number>();
    const startPlayers = starters
      .map(id => (id ? rosterById.get(id) : undefined))
      .filter((p): p is BasketballPlayer => !!p);
    const ovrSum = startPlayers.reduce((s, p) => s + p.ratings.overall, 0) || 1;
    for (const p of startPlayers) m.set(p.id, Math.round((168 * p.ratings.overall) / ovrSum));
    const W = [1, 0.8, 0.64, 0.512, 0.4096]; // top-5 bench geometric decay
    const wSum = W.reduce((a, b) => a + b, 0);
    bench.forEach((id, i) => m.set(id, i < W.length ? Math.round((72 * W[i]) / wSum) : 0));
    return m;
  }, [starters, bench, rosterById]);

  // One flat list ranked by projected minutes: any open starting slots first (so
  // they stay easy to fill by drag), then every player, most minutes to fewest.
  const sortedRoster = useMemo(() => {
    const openSlots: number[] = [];
    starters.forEach((id, slot) => { if (!id) openSlots.push(slot); });
    const filled: { p: BasketballPlayer; isStarter: boolean; slot: number; min: number }[] = [];
    starters.forEach((id, slot) => {
      const p = id ? rosterById.get(id) : undefined;
      if (p) filled.push({ p, isStarter: true, slot, min: projMinutes.get(id) ?? 0 });
    });
    bench.forEach(id => {
      const p = rosterById.get(id);
      if (p) filled.push({ p, isStarter: false, slot: -1, min: projMinutes.get(id) ?? 0 });
    });
    filled.sort((a, b) => b.min - a.min);
    return { openSlots, filled };
  }, [starters, bench, rosterById, projMinutes]);

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

  // Reorder the bench by dropping one bench player onto another — he takes that
  // rung of the rotation (earlier = more minutes), pushing the rest down. Only
  // bench→bench moves reorder; a starter dropped here promotes nothing (use his
  // Bench button instead).
  function onDropBench(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverBenchId(null);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { id, from } = JSON.parse(raw) as { id: string; from?: string };
      if (from !== 'bench' || !id || id === targetId) return;
      setSaved(false);
      setBench(prev => {
        const without = prev.filter(x => x !== id);
        const ti = without.indexOf(targetId);
        if (ti < 0) return prev;
        without.splice(ti, 0, id);
        return without;
      });
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
  // Deep-link the Trade Center's Trading Block with this player already on the
  // block (?block=<playerId>) — "Add to Trade Block" is "shop this guy", so it
  // opens the block to solicit offers rather than the empty Propose Trade
  // builder. (/trade still honors ?give=… / ?target=…&getPlayer=… for the
  // "trade for this player" entry points elsewhere.)
  function onTrade(id: string) { setMenu(null); router.push(`/trade?block=${id}`); }

  // Actions menu + mood popover render `fixed` at the trigger (clamped to the
  // viewport) so the sideways-scrolling table can't clip them on the last rows.
  function toggleMenu(id: string, el: HTMLElement) {
    if (menu?.id === id) { setMenu(null); return; }
    const r = el.getBoundingClientRect();
    setMoodPop(null);
    setMenu({
      id,
      top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 260)),
      left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
    });
  }
  function toggleMood(id: string, el: HTMLElement) {
    if (moodPop?.id === id) { setMoodPop(null); return; }
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MOOD_W, window.innerWidth - MOOD_W - 8));
    // Open below the chip; flip above when it would run off the bottom.
    const below = r.bottom + 4 + 200 <= window.innerHeight;
    setMenu(null);
    setMoodPop(below ? { id, left, top: r.bottom + 4 } : { id, left, bottom: Math.max(8, window.innerHeight - r.top + 4) });
  }
  function changeTab(t: Tab) {
    setTab(t);
    setMenu(null);
    setMoodPop(null);
  }

  const hc = getHeadCoach(league, team.id);
  const hcScheme = hc ? coachScheme(hc) : null;
  const injuries = getInjuries(league);
  const today = league.currentTick;
  // A player who can suit up through a day-to-day / minor knock is NOT "OUT" —
  // he's game-time decision (GTD) and may play. Flagging those as a hard red
  // "OUT" was the bug: users saw OUT in the lineup, then the guy played.
  const injuryOf = (id: string): InjuryStatus | null => injuryStatus(injuries[id], today);
  const injured = roster
    .map(p => ({ p, st: injuryOf(p.id) }))
    .filter((x): x is { p: BasketballPlayer; st: InjuryStatus } => !!x.st)
    .sort((a, b) => (b.st.daysLeft ?? 1e9) - (a.st.daysLeft ?? 1e9));
  const capClass = cap.capRoom > 10_000_000 ? 'text-green-600' : cap.capRoom > 0 ? 'text-amber-600' : 'text-red-600';
  const overLimit = !isReadOnly && roster.length > TARGET_ROSTER;

  const renderMood = (p: BasketballPlayer, isStarter: boolean) => (
    <MoodCell
      p={p}
      mood={moodFor(p, isStarter)}
      injury={injuryOf(p.id)}
      season={season}
      open={moodPop?.id === p.id}
      onToggle={toggleMood}
    />
  );
  const renderCells = (p: BasketballPlayer, isStarter: boolean, dragData: object) => (
    <PlayerCells
      p={p}
      stats={statsForPlayer(statsMap, p.id)}
      moodCell={renderMood(p, isStarter)}
      fit={hcScheme ? schemeFit(p, hcScheme) : null}
      season={season}
      draggable={!isReadOnly}
      dragData={dragData}
      onName={setModalPlayerId}
    />
  );

  // --- Roster tab: filtered + sorted table rows ---
  const perGame = (s: BasketballStats, k: 'points' | 'totalRebounds' | 'assists') => (s.gamesPlayed > 0 ? s[k] / s.gamesPlayed : 0);
  const tableRows = roster
    .filter(p => filterPos === 'ALL' || p.sportData.position === filterPos)
    .map(p => ({ p, s: statsForPlayer(statsMap, p.id) as BasketballStats }))
    .sort((a, b) => {
      const dir = sort.sortDir === 'asc' ? 1 : -1;
      let d = 0;
      switch (sort.sortKey) {
        case 'name': d = `${a.p.lastName} ${a.p.firstName}`.localeCompare(`${b.p.lastName} ${b.p.firstName}`); break;
        case 'pos':
          d = POSITIONS.indexOf(a.p.sportData.position) - POSITIONS.indexOf(b.p.sportData.position);
          if (d === 0) return b.p.ratings.overall - a.p.ratings.overall;
          break;
        case 'age': d = a.p.age - b.p.age; break;
        case 'ovr': d = a.p.ratings.overall - b.p.ratings.overall; break;
        case 'pot': d = a.p.development.potential - b.p.development.potential; break;
        case 'contract': d = (contractInfo(a.p, season)?.aav ?? 0) - (contractInfo(b.p, season)?.aav ?? 0); break;
        case 'gp': d = a.s.gamesPlayed - b.s.gamesPlayed; break;
        case 'ppg': d = perGame(a.s, 'points') - perGame(b.s, 'points'); break;
        case 'rpg': d = perGame(a.s, 'totalRebounds') - perGame(b.s, 'totalRebounds'); break;
        case 'apg': d = perGame(a.s, 'assists') - perGame(b.s, 'assists'); break;
      }
      return dir * d;
    });
  const sortProps = { sortKey: sort.sortKey, sortDir: sort.sortDir, onSort: sort.onSort };

  const menuPlayer = menu ? rosterById.get(menu.id) : undefined;
  const moodPlayer = moodPop ? rosterById.get(moodPop.id) : undefined;

  return (
    <Shell>
      <PageHeader
        quickNav="roster"
        className="mb-4"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{team.city} {team.name} Roster</span>
            {/* FEAT-26: team switcher — view any team's roster read-only */}
            <select
              aria-label="View team roster"
              value={team.id}
              onChange={e => setViewTeamId(e.target.value)}
              className="h-8 px-2 text-xs font-semibold normal-case tracking-normal rounded border bg-[var(--surface-2)] hover:bg-[var(--surface)] cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {[...league.teams]
                .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`))
                .map(t => (
                  <option key={t.id} value={t.id}>
                    {t.abbreviation} — {t.city} {t.name}{t.id === league.userTeamId ? ' (You)' : ''}
                  </option>
                ))}
            </select>
            {isReadOnly && (
              <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--text-sec) 16%, transparent)', color: 'var(--text-sec)' }}>
                Read-only
              </span>
            )}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            <span className="tabular-nums font-semibold text-[var(--text)]">{team.record.wins}–{team.record.losses}</span>
            <span className={`tabular-nums ${overLimit ? 'text-red-600 font-bold' : ''}`}>{roster.length}/{TARGET_ROSTER} players</span>
            <span className="tabular-nums">Payroll {fmtMoney(cap.payroll)}</span>
            <span className={`tabular-nums ${capClass}`}>
              {cap.capRoom >= 0 ? `${fmtMoney(cap.capRoom)} cap space` : `${fmtMoney(-cap.capRoom)} over cap`}
            </span>
            {injured.length > 0 && <span className="text-red-600">{injured.length} injured</span>}
          </span>
        }
        right={
          <>
            {overLimit && (
              <span className="text-xs font-bold rounded-full px-3 py-1 text-red-600 bg-red-500/15">Cut to {TARGET_ROSTER}</span>
            )}
            <div className="max-w-full overflow-x-auto no-scrollbar">
              <SegmentedControl
                size="sm"
                value={tab}
                onChange={changeTab}
                options={[
                  { value: 'lineup', label: 'Lineup' },
                  { value: 'roster', label: 'Roster' },
                  { value: 'depth', label: 'Depth' },
                  { value: 'injuries', label: `Injuries${injured.length > 0 ? ` (${injured.length})` : ''}` },
                ]}
              />
            </div>
          </>
        }
      />

      {/* Position composition bar */}
      {(tab === 'lineup' || tab === 'roster') && (
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
      )}

      {/* Scheme-fit legend */}
      {hcScheme && (tab === 'lineup' || tab === 'roster') && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-[var(--text-sec)]">
          <span>Scheme fit ({SCHEME_LABELS[hcScheme]}):</span>
          {(['great', 'good', 'neutral', 'poor'] as const).map(label => (
            <span key={label} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: FIT_LEGEND_COLOR[label] }} />{label}</span>
          ))}
        </div>
      )}

      {/* ── LINEUP ── */}
      {tab === 'lineup' && (
        <>
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

          <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            <div className={`${ROW_GRID} bg-[var(--surface)] text-[10px] uppercase tracking-wide text-[var(--text-sec)] border-b font-semibold`} style={{ ...ROW_COLS, borderColor: 'var(--border)' }}>
              <span className={PIN_MIN} style={INHERIT_BG}>Min</span>
              <span className={`${PIN_NAME} flex items-center`} style={INHERIT_BG}>Name</span>
              <span>Pos</span><span className="text-right">Age</span><span className="text-right">OVR</span>
              <span className="text-right"><PotHeader /></span>
              <span className="text-right">Contract</span><span className="text-right">Acquired</span><span className="text-right">GP</span><span className="text-right">PPG/RPG/APG</span><span className="text-center">Mood</span><span className="text-right">Action</span>
            </div>

            {/* One list ranked by projected minutes — starters (most run) down to the
                deep bench (DNP). The Min column carries the ordering; Start/Bench and
                drag-to-slot editing are preserved per row. */}
            <div className="sticky left-0 px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>Starters</div>

            {/* Open starting slots first, so they stay easy to fill by drag. */}
            {sortedRoster.openSlots.map(slot => {
              const pos = POSITIONS[slot];
              return (
                <div
                  key={`open-${slot}`}
                  onDragOver={isReadOnly ? undefined : e => { e.preventDefault(); setDragOverSlot(slot); }}
                  onDragLeave={isReadOnly ? undefined : () => setDragOverSlot(s => (s === slot ? null : s))}
                  onDrop={isReadOnly ? undefined : e => onDropSlot(slot, e)}
                  className={`${ROW_GRID} border-t`}
                  style={{ ...ROW_COLS, borderColor: 'var(--border)', background: dragOverSlot === slot ? tint('var(--accent)', 14) : tint('var(--accent)', 5) }}
                  title={`Open starting slot (${pos})`}
                >
                  <span className={`${PIN_MIN} text-[10px] font-black`} style={{ ...INHERIT_BG, color: POS_COLORS[pos] }} title={`Starting ${pos}`}>{pos}</span>
                  <EmptyStarter />
                  {isReadOnly ? <span /> : <ActionCell toggle={null} />}
                </div>
              );
            })}

            {/* Every player, most projected minutes to fewest, with clear dividers
                marking the bench and the out-of-rotation deep bench. */}
            {(() => {
              const firstBench = sortedRoster.filled.findIndex(e => !e.isStarter);
              const firstDnp = sortedRoster.filled.findIndex(e => e.min <= 0);
              return sortedRoster.filled.map(({ p, isStarter, slot, min }, idx) => {
                // BUG-24: amber tint overrides the row background for expiring players.
                const isPending = pendingResignIds.has(p.id);
                const dragData = isStarter ? { id: p.id, from: 'starter', slot } : { id: p.id, from: 'bench', slot: -1 };
                const starterBg = dragOverSlot === slot ? tint('var(--accent)', 14) : tint('var(--accent)', 5);
                const benchDragBg = !isStarter && dragOverBenchId === p.id ? tint('var(--accent)', 14) : null;
                // null = a plain bench row: solid surface with a hover lift.
                const rowBg = isPending ? tint('#f59e0b', 12) : isStarter ? starterBg : benchDragBg;
                const dnp = min <= 0;
                return (
                  <Fragment key={p.id}>
                    {idx === firstBench && idx > 0 && (
                      <div className="sticky left-0 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-sec)', background: 'var(--surface-2)', borderTop: '2px solid var(--accent)' }}>
                        Bench <span className="font-semibold normal-case tracking-normal opacity-70">— drag a player up onto another to move him up the rotation</span>
                      </div>
                    )}
                    {idx === firstDnp && firstDnp !== firstBench && (
                      <div className="sticky left-0 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border-t" style={{ color: 'var(--text-sec)', background: 'var(--surface)', borderColor: 'var(--border)', opacity: 0.75 }}>
                        Out of rotation · projected DNP
                      </div>
                    )}
                    <div
                      draggable={!isReadOnly}
                      onDragStart={isReadOnly ? undefined : e => { e.dataTransfer.setData('application/json', JSON.stringify(dragData)); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={isReadOnly ? undefined : isStarter ? e => { e.preventDefault(); setDragOverSlot(slot); } : e => { e.preventDefault(); setDragOverBenchId(p.id); }}
                      onDragLeave={isReadOnly ? undefined : isStarter ? () => setDragOverSlot(s => (s === slot ? null : s)) : () => setDragOverBenchId(cur => (cur === p.id ? null : cur))}
                      onDrop={isReadOnly ? undefined : isStarter ? e => onDropSlot(slot, e) : e => onDropBench(p.id, e)}
                      className={`${ROW_GRID} border-t ${rowBg ? '' : 'bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors'} ${!isReadOnly ? 'cursor-grab' : ''}`}
                      style={{ ...ROW_COLS, borderColor: 'var(--border)', ...(rowBg ? { background: rowBg } : null) }}
                      title={isPending ? 'Expiring contract — re-sign or this player walks at season start' : (!isStarter && !isReadOnly ? 'Drag up onto another bench player to move up the rotation (more minutes)' : undefined)}
                    >
                      <span
                        className={`${PIN_MIN} text-[11px] font-bold tabular-nums`}
                        style={{ ...INHERIT_BG, color: dnp ? 'var(--text-sec)' : isStarter ? 'var(--accent)' : 'var(--text)', opacity: dnp ? 0.5 : 1 }}
                        title={dnp ? 'Out of the rotation — projected not to play' : `Projected ~${min} minutes/game`}
                      >
                        {dnp ? 'DNP' : `${min}′`}
                      </span>
                      {renderCells(p, isStarter, dragData)}
                      {isReadOnly ? <span /> : (
                        <ActionCell
                          playerId={p.id}
                          menuOpen={menu?.id === p.id}
                          toggle={isStarter ? { label: 'Bench', onClick: () => benchStarter(slot) } : { label: 'Start', onClick: () => startPlayer(p.id), accent: true }}
                          onMenu={toggleMenu}
                        />
                      )}
                    </div>
                  </Fragment>
                );
              });
            })()}
          </div>

          {validation.warnings.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: '#f59e0b' }}>⚠ {humanizeWarning(validation.warnings[0], roster)}</p>
          )}
        </>
      )}

      {/* ── ROSTER (sortable table) ── */}
      {tab === 'roster' && (
        <>
          <SegmentedControl<PosFilter>
            size="sm"
            className="mb-3 flex-wrap"
            value={filterPos}
            onChange={setFilterPos}
            options={[{ value: 'ALL', label: 'ALL' }, ...POSITIONS.map(pos => ({ value: pos, label: pos }))]}
          />
          <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm min-w-[860px] sticky-col">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <SortTh k="name" {...sortProps} className="text-left pl-3">Name</SortTh>
                  <SortTh k="pos" {...sortProps} className="text-center">Pos</SortTh>
                  <SortTh k="age" {...sortProps} className="text-center">Age</SortTh>
                  <SortTh k="ovr" {...sortProps} className="text-center">Ovr</SortTh>
                  <SortTh k="pot" {...sortProps} className="text-right"><PotHeader /></SortTh>
                  <SortTh k="contract" {...sortProps} className="text-right">Contract</SortTh>
                  <PlainTh className="text-center">Role</PlainTh>
                  <SortTh k="gp" {...sortProps} className="text-center">GP</SortTh>
                  <SortTh k="ppg" {...sortProps} className="text-right">PPG</SortTh>
                  <SortTh k="rpg" {...sortProps} className="text-right">RPG</SortTh>
                  <SortTh k="apg" {...sortProps} className="text-right">APG</SortTh>
                  <PlainTh className="text-left">Acquired</PlainTh>
                  <PlainTh className="text-center">Mood</PlainTh>
                  {!isReadOnly && <PlainTh className="text-right pr-3">Action</PlainTh>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ p, s }) => {
                  const isStarter = starters.includes(p.id);
                  const min = projMinutes.get(p.id) ?? 0;
                  const inj = injuryOf(p.id);
                  const fit = hcScheme ? schemeFit(p, hcScheme) : null;
                  const gp = s.gamesPlayed;
                  const last = gp === 0 ? lastSeasonLog(p) : null;
                  const pg = (k: 'points' | 'totalRebounds' | 'assists', lastVal: number | undefined) =>
                    gp > 0 ? perGame(s, k).toFixed(1) : lastVal != null ? lastVal.toFixed(1) : '—';
                  const statCls = `py-2 px-2 text-right tabular-nums text-xs ${gp > 0 ? '' : 'text-[var(--text-sec)]'}`;
                  const statTitle = gp === 0 && last ? `No games this season — last played '${String(last.season).slice(2)}` : undefined;
                  return (
                    <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 px-2 pl-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {fit && (
                            <span
                              className="shrink-0 w-1.5 h-1.5 rounded-full"
                              style={{ background: FIT_LEGEND_COLOR[fit.tier] }}
                              title={`Scheme fit: ${fit.tier}${fit.delta !== 0 ? ` (${fit.delta > 0 ? '+' : ''}${fit.delta} OVR)` : ''}`}
                            />
                          )}
                          <button onClick={() => setModalPlayerId(p.id)} className={`${NAME_CLS} text-left truncate`}>
                            <ResponsiveName firstName={p.firstName} lastName={p.lastName} />
                          </button>
                          <TwoWayChip player={p} />
                        </div>
                        {inj && (
                          <span className={`block text-[10px] ${inj.gtd ? 'text-amber-600' : 'text-red-600'}`}>
                            {inj.bodyPart} · {inj.text}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-center text-xs font-bold" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{p.age}</td>
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <OvrChip value={p.ratings.overall} />
                        <OvrTrend player={p} />
                      </td>
                      <td className="py-2 px-2 text-right"><PotValue pot={p.development.potential} /></td>
                      <td className="py-2 px-2 text-right text-xs"><ContractText player={p} season={season} /></td>
                      <td className="py-2 px-2 text-center">
                        <span className={`text-[10px] font-bold uppercase ${isStarter ? 'text-green-600' : 'text-[var(--text-sec)]'}`}>
                          {isStarter ? 'Starter' : min > 0 ? 'Bench' : 'DNP'}
                        </span>
                      </td>
                      <td className={`py-2 px-2 text-center tabular-nums text-xs ${gp > 0 ? '' : 'text-[var(--text-sec)]'}`} title={statTitle}>{gp || (last ? last.gamesPlayed : '—')}</td>
                      <td className={statCls} title={statTitle}>{pg('points', last?.ppg)}</td>
                      <td className={statCls} title={statTitle}>{pg('totalRebounds', last?.rpg)}</td>
                      <td className={statCls} title={statTitle}>{pg('assists', last?.apg)}</td>
                      <td className="py-2 px-2 text-xs text-[var(--text-sec)] whitespace-nowrap">{acquiredLabel(p)}</td>
                      <td className="py-2 px-2 text-center">{renderMood(p, isStarter)}</td>
                      {!isReadOnly && (
                        <td className="py-2 px-2 pr-3 text-right">
                          <ActionCell playerId={p.id} menuOpen={menu?.id === p.id} toggle={null} onMenu={toggleMenu} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tableRows.length === 0 && (
              <div className="text-center py-8 text-[var(--text-sec)] text-sm">No players at this position.</div>
            )}
          </div>
        </>
      )}

      {/* ── DEPTH ── */}
      {tab === 'depth' && <DepthChart roster={roster} starterIds={starters} onName={setModalPlayerId} />}

      {/* ── INJURIES ── */}
      {tab === 'injuries' && (
        injured.length === 0 ? (
          <div className="rounded-xl border bg-[var(--surface)] text-center py-12 text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
            <div className="text-4xl mb-3">💪</div>
            <p>No players currently injured. Keep it up!</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2.5 border-b text-sm font-bold" style={{ borderColor: 'var(--border)' }}>Injury Report ({injured.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px] sticky-col">
                <thead>
                  <tr>
                    <PlainTh className="text-left pl-3">Player</PlainTh>
                    <PlainTh className="text-center">Pos</PlainTh>
                    <PlainTh className="text-center">OVR</PlainTh>
                    <PlainTh className="text-left">Injury</PlainTh>
                    <PlainTh className="text-left">Severity</PlainTh>
                    <PlainTh className="text-right">Days left</PlainTh>
                    <PlainTh className="text-center pr-3">Status</PlainTh>
                  </tr>
                </thead>
                <tbody>
                  {injured.map(({ p, st }) => (
                    <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2.5 px-2 pl-3">
                        <button onClick={() => setModalPlayerId(p.id)} className={`${NAME_CLS} text-left`}>
                          <ResponsiveName firstName={p.firstName} lastName={p.lastName} />
                        </button>
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs font-bold" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</td>
                      <td className="py-2.5 px-2 text-center"><OvrChip value={p.ratings.overall} /></td>
                      <td className="py-2.5 px-2 capitalize">{st.bodyPart}</td>
                      <td className="py-2.5 px-2 text-xs text-[var(--text-sec)] capitalize">{st.severity}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{st.daysLeft == null ? 'Season' : `${st.daysLeft}d`}</td>
                      <td className="py-2.5 px-2 pr-3 text-center">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${st.gtd ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'}`}
                          title={st.gtd ? 'Game-time decision — can play through (elevated re-injury risk)' : 'Injured — unavailable'}
                        >
                          {st.gtd ? 'GTD' : 'OUT'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Actions menu (fixed, so the scroll container can't clip it) */}
      {menu && menuPlayer && (
        <ActionsMenu
          player={menuPlayer}
          season={season}
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onExtend={() => onExtend(menu.id)}
          onDetails={() => onDetails(menu.id)}
          onTrade={() => onTrade(menu.id)}
          onRelease={() => onRelease(menu.id)}
        />
      )}

      {/* FEAT-27: mood factor breakdown (fixed at the chip, viewport-clamped) */}
      {moodPop && moodPlayer && (
        <MoodPopover
          playerId={moodPlayer.id}
          mood={moodFor(moodPlayer, starters.includes(moodPlayer.id))}
          factors={moodFactorsFor(moodPlayer, starters.includes(moodPlayer.id))}
          left={moodPop.left}
          top={moodPop.top}
          bottom={moodPop.bottom}
          onClose={() => setMoodPop(null)}
        />
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} onReleased={onReleased} />
      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
      <ReleaseModal playerId={releaseId} onClose={() => setReleaseId(null)} onReleased={onReleased} />
    </Shell>
  );
}

// ===========================================================================
// Floating panels
// ===========================================================================

/** Close a floating panel on outside mousedown/touch, any scroll (capture),
 *  resize or Escape. Clicks on `ignoreSelector` (the panel's own trigger) are
 *  left to the trigger's toggle so it doesn't close-then-reopen. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void, ignoreSelector: string) {
  useEffect(() => {
    const onDown = (e: Event) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (ref.current?.contains(t)) return;
      if (t instanceof Element && t.closest(ignoreSelector)) return;
      onClose();
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose, ignoreSelector]);
}

function ActionsMenu({
  player, season, top, left, onClose, onExtend, onDetails, onTrade, onRelease,
}: {
  player: BasketballPlayer;
  season: number;
  top: number;
  left: number;
  onClose: () => void;
  onExtend: () => void;
  onDetails: () => void;
  onTrade: () => void;
  onRelease: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, `[data-menu-trigger="${player.id}"]`);
  const deadCap = releasePreview(player, season).waiveThisYear;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${player.firstName} ${player.lastName}`}
      className="fixed z-50 rounded-lg border bg-[var(--surface)] py-1.5 max-h-[80vh] overflow-y-auto"
      style={{ top, left, width: MENU_W, borderColor: 'var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)' }}
    >
      <MenuItem label="Extend Contract" sub="Lock in a new long-term deal" className="text-green-600" onClick={onExtend} />
      <MenuItem label="View Details" onClick={onDetails} />
      <MenuItem label="Add to Trade Block" sub="Solicit offers from other teams" className="text-blue-600" onClick={onTrade} />
      <div className="my-1 mx-3 border-t" style={{ borderColor: 'var(--border)' }} />
      <MenuItem
        label="Release"
        sub={deadCap > 0 ? `${fmtMoney(deadCap)} dead cap this season` : 'No dead cap'}
        className="text-red-600"
        onClick={onRelease}
      />
    </div>
  );
}

function MenuItem({ label, sub, onClick, className = '' }: { label: string; sub?: string; onClick: () => void; className?: string }) {
  return (
    <button role="menuitem" onClick={onClick} className={`w-full text-left px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] transition-colors ${className}`}>
      {label}
      {sub && <span className="block text-[11px] text-[var(--text-sec)] font-normal mt-0.5">{sub}</span>}
    </button>
  );
}

/** FEAT-27: click-to-expand explainer listing the contributing mood factors. */
function MoodPopover({
  playerId, mood, factors, left, top, bottom, onClose,
}: {
  playerId: string;
  mood: Mood;
  factors: MoodFactor[];
  left: number;
  top?: number;
  bottom?: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, `[data-mood-trigger="${playerId}"]`);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Mood: ${mood.label}`}
      className="fixed z-50 rounded-lg border bg-[var(--surface)] shadow-lg p-2.5 text-left max-h-[60vh] overflow-y-auto"
      style={{ left, top, bottom, width: MOOD_W, borderColor: 'var(--border)' }}
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
    </div>
  );
}

// ===========================================================================
// Cells
// ===========================================================================

function PlayerCells({
  p, stats, moodCell, fit, season, draggable, dragData, onName,
}: {
  p: BasketballPlayer;
  stats: BasketballStats;
  moodCell: React.ReactNode;
  fit: SchemeFit | null;
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
      {/* Pinned on phones (sticky) so the name stays put while the grid scrolls. */}
      <button
        draggable={draggable}
        onDragStart={draggable ? e => { e.dataTransfer.setData('application/json', JSON.stringify(dragData)); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onClick={() => onName(p.id)}
        className={`${PIN_NAME} ${NAME_CLS} text-left flex items-center gap-1.5 min-w-0 ${draggable ? 'cursor-grab' : 'cursor-pointer'}`}
        style={INHERIT_BG}
        title={draggable ? 'Drag to a starting slot, or click for details' : 'Click for details'}
      >
        {fit && (
          <span
            className="shrink-0 w-1.5 h-1.5 rounded-full"
            style={{ background: FIT_LEGEND_COLOR[fit.tier] }}
            title={`Scheme fit: ${fit.tier}${fit.delta !== 0 ? ` (${fit.delta > 0 ? '+' : ''}${fit.delta} OVR)` : ''}`}
          />
        )}
        <span className="truncate"><ResponsiveName firstName={p.firstName} lastName={p.lastName} /></span>
        <TwoWayChip player={p} />
      </button>
      <span className="text-xs font-mono" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</span>
      <span className="text-right tabular-nums text-sm">{p.age}</span>
      <span className="inline-flex items-center justify-end gap-0.5">
        <OvrChip value={p.ratings.overall} />
        <OvrTrend player={p} />
      </span>
      <span className="text-right"><PotValue pot={p.development.potential} /></span>
      <span className="text-right text-xs"><ContractText player={p} season={season} stacked /></span>
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
      {moodCell}
    </>
  );
}

/** Mood chip (opens the factor popover) — or the injury chip while hurt — plus
 *  any open trade-request flag. */
function MoodCell({
  p, mood, injury, season, open, onToggle,
}: {
  p: BasketballPlayer;
  mood: Mood;
  injury: InjuryStatus | null;
  season: number;
  open: boolean;
  onToggle: (id: string, el: HTMLElement) => void;
}) {
  const tradeReq = tradeRequestBadge(p, season);
  return (
    <span className="inline-flex flex-col items-center gap-0.5 justify-self-center">
      {injury ? (
        <span
          className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap"
          style={injury.gtd
            ? { background: 'color-mix(in srgb, #f59e0b 16%, transparent)', color: '#f59e0b' }
            : { background: 'color-mix(in srgb, #dc2626 16%, transparent)', color: '#dc2626' }}
          title={`${injury.bodyPart} (${injury.severity}) — ${injury.gtd ? 'game-time decision, can play through (elevated re-injury risk)' : 'injured, unavailable'}`}
        >
          {injury.gtd ? '🩹' : '🏥'} {injury.text}
        </span>
      ) : (
        <button
          data-mood-trigger={p.id}
          onClick={e => onToggle(p.id, e.currentTarget)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="text-[10px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap inline-flex items-center gap-1 hover:brightness-105"
          style={{ background: `color-mix(in srgb, ${mood.color} 24%, transparent)`, color: mood.color }}
          title={`${mood.reason} — click for the contributing factors`}
        >
          <span aria-hidden>{mood.emoji}</span>{mood.label}
        </button>
      )}
      {tradeReq && (
        <span
          className="text-[9px] font-bold rounded px-1 py-0.5 whitespace-nowrap inline-flex items-center gap-0.5"
          style={{ background: 'color-mix(in srgb, #dc2626 16%, transparent)', color: '#dc2626' }}
          title={`${p.firstName} ${p.lastName} has an open ${tradeReq.label.toLowerCase()}`}
        >
          <span aria-hidden>{tradeReq.emoji}</span>{tradeReq.label}
        </span>
      )}
    </span>
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
      className="ml-0.5 text-[9px] font-bold leading-none tabular-nums"
      style={{ color: up ? '#10b981' : '#dc2626' }}
      title={`${up ? '+' : ''}${delta} OVR since last season`}
    >
      {up ? '▲' : '▼'}{up ? '+' : ''}{delta}
    </span>
  );
}

function ActionCell({
  playerId, toggle, onMenu, menuOpen,
}: {
  playerId?: string;
  toggle: { label: string; onClick: () => void; accent?: boolean } | null;
  onMenu?: (id: string, el: HTMLElement) => void;
  menuOpen?: boolean;
}) {
  return (
    <span className="flex items-center justify-end gap-1">
      {toggle && (
        // MOBILE-5: bs-touch-target lifts this from ~20px → 44px min on
        // touch devices only — desktop stays compact.
        <button
          onClick={toggle.onClick}
          className="bs-touch-target text-[11px] font-semibold rounded border px-1.5 py-0.5 hover:bg-[var(--surface-2)] transition-colors"
          style={{ borderColor: toggle.accent ? 'var(--accent)' : 'var(--border)', color: toggle.accent ? 'var(--accent)' : 'var(--text-sec)' }}
        >
          {toggle.label}
        </button>
      )}
      {onMenu && playerId && (
        <button
          data-menu-trigger={playerId}
          onClick={e => onMenu(playerId, e.currentTarget)}
          aria-haspopup="menu"
          aria-expanded={!!menuOpen}
          className={`bs-touch-target px-2 py-0.5 text-[11px] rounded font-medium whitespace-nowrap transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] ${menuOpen ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-sec)]'}`}
        >
          Actions ▾
        </button>
      )}
    </span>
  );
}

function EmptyStarter() {
  // 10 cells to match PlayerCells: name, pos, age, ovr, pot, contract, acquired, gp, stats, mood.
  return (
    <>
      <span className={`${PIN_NAME} flex items-center text-sm`} style={{ ...INHERIT_BG, color: '#dc2626' }}>— empty —</span>
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
    case 'expansion': return `Expansion Draft${sd.acquiredSeason ? ` (${sd.acquiredSeason})` : ''}`;
    case 'initial': return sd.draftPick ? `Draft #${sd.draftPick}` : 'Original';
    default: return sd.draftPick ? `Draft #${sd.draftPick}` : sd.draftRound ? 'Drafted' : '—';
  }
}

// ===========================================================================
// Bits
// ===========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">{children}</main>;
}

function countByPos(roster: BasketballPlayer[]): Record<BasketballPosition, number> {
  const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const p of roster) c[p.sportData.position]++;
  return c;
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
