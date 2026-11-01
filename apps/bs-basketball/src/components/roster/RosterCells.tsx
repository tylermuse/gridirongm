'use client';

/**
 * Shared roster-table cells (football parity): the OVR chip, POT number + word,
 * contract AAV with the amber "expiring" flag, the TW (two-way) chip, phone
 * short names, injury status, and football's sortable column header. Used by
 * /roster, the depth chart, /team/[id] and the team roster modal so every
 * roster surface reads the same.
 */

import { useState, type ReactNode } from 'react';
import { ratingChipClass, potentialLabel, ratingHex } from '@/lib/ui/ratingColor';
import { fmtMoney } from '@/lib/dashboard/summary';
import { canPlayThrough, SEVERITY_LABEL, type InjuryRecord } from '@/lib/injuries';
import type { BasketballPlayer } from '@bs/sport-basketball';

/** Neutral table-name style (football): plain text, accent on hover. */
export const NAME_CLS = 'font-semibold hover:text-[var(--accent)] transition-colors';

/** Explainer for the POT column header's `?`. */
export const POT_TOOLTIP =
  "Potential — the player's projected ceiling (Elite / High / Average / Low). Young players grow toward it; a veteran's POT can sit below his current OVR as he declines.";

/** Football's OVR chip: tinted fill + tier text. */
export function OvrChip({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`font-black text-sm px-1.5 py-0.5 rounded tabular-nums ${ratingChipClass(value)} ${className}`}>
      {value}
    </span>
  );
}

/** POT as its number (tier-colored) with the Elite/High/Average/Low word under it. */
export function PotValue({ pot }: { pot: number }) {
  const label = potentialLabel(pot);
  return (
    <span className="inline-flex flex-col items-end leading-none tabular-nums" title={`Potential ${pot} — ${label} ceiling`}>
      <span className="font-bold text-sm" style={{ color: ratingHex(pot) }}>{pot}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-sec)] mt-0.5">{label}</span>
    </span>
  );
}

/** Header label for POT with football's `?` help bubble. */
export function PotHeader() {
  return (
    <span className="cursor-help inline-flex items-center gap-0.5" title={POT_TOOLTIP}>
      Pot
      <span className="inline-flex items-center justify-center w-3 h-3 text-[8px] leading-none rounded-full bg-[var(--surface-2)] normal-case">?</span>
    </span>
  );
}

/** A deal's AAV over its remaining years + how many years are left. */
export function contractInfo(p: BasketballPlayer, season: number): { aav: number; years: number } | null {
  if (!p.contract) return null;
  // AAV over the remaining years, not just this season's salary — after an
  // extension the raise lands in future years, so the current-season figure
  // made a freshly re-signed player read at his old number.
  const remaining = p.contract.years.filter(y => y.season >= season);
  if (remaining.length === 0) return null;
  const aav = remaining.reduce((s, y) => s + y.baseSalary + y.proratedBonus, 0) / remaining.length;
  if (aav <= 0) return null;
  return { aav, years: remaining.length };
}

/** Contract cell body: AAV · years, with football's amber "⚠ expiring" on the last year. */
export function ContractText({ player, season, stacked = false }: { player: BasketballPlayer; season: number; stacked?: boolean }) {
  const c = contractInfo(player, season);
  if (!c) return <span className="text-[var(--text-sec)]">—</span>;
  const expiring = c.years <= 1;
  const yrs = (
    <span className={`${stacked ? 'block text-[10px]' : 'ml-1'} ${expiring ? 'font-bold text-amber-600' : 'text-[var(--text-sec)]'}`}>
      {expiring ? '⚠ expiring' : `${c.years}y left`}
    </span>
  );
  return (
    <span className={`tabular-nums ${stacked ? 'leading-tight' : 'whitespace-nowrap'}`} title={expiring ? 'Final contract year — extend or he hits free agency' : undefined}>
      <span className={`font-semibold ${stacked ? 'block' : ''}`}>{fmtMoney(c.aav)}</span>
      {yrs}
    </span>
  );
}

/** TW chip for players on a two-way deal. */
export function TwoWayChip({ player }: { player: BasketballPlayer }) {
  if (!player.sportData.isTwoWay) return null;
  return (
    <span className="shrink-0 text-[9px] font-bold px-1 rounded bg-amber-500/15 text-amber-600" title="Two-way contract — doesn't count against the cap">
      TW
    </span>
  );
}

/** "F. Lastname" on phones, full name from sm up. */
export function ResponsiveName({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <>
      <span className="sm:hidden">{firstName ? `${firstName[0]}. ` : ''}{lastName}</span>
      <span className="hidden sm:inline">{firstName} {lastName}</span>
    </>
  );
}

export interface InjuryStatus {
  /** Short status, e.g. "GTD 2d", "OUT 9d", "OUT (season)". */
  text: string;
  /** Can play through it (day-to-day / minor) — a game-time decision, not OUT. */
  gtd: boolean;
  /** Days until available, or null when out for the season. */
  daysLeft: number | null;
  bodyPart: string;
  severity: string;
}

/** Active injury status for a player on `today`, or null when healthy. */
export function injuryStatus(inj: InjuryRecord | undefined, today: number): InjuryStatus | null {
  if (!inj || inj.returnDay <= today) return null;
  const seasonOut = inj.returnDay >= 50_000;
  const daysLeft = seasonOut ? null : inj.returnDay - today;
  const gtd = canPlayThrough(inj);
  const text = seasonOut ? (gtd ? 'GTD' : 'OUT (season)') : `${gtd ? 'GTD' : 'OUT'} ${daysLeft}d`;
  return { text, gtd, daysLeft, bodyPart: inj.bodyPart, severity: SEVERITY_LABEL[inj.severity] };
}

export type SortDir = 'asc' | 'desc';

/** Sort state with football's toggle: same column flips, a new one starts desc (text columns asc). */
export function useRosterSort<K extends string>(initial: K, initialDir: SortDir = 'desc', ascKeys: readonly K[] = []) {
  const [sortKey, setSortKey] = useState<K>(initial);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  function onSort(k: K) {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(ascKeys.includes(k) ? 'asc' : 'desc');
    }
  }
  return { sortKey, sortDir, onSort };
}

/** Football's SortHeader: hover lift, accent when active, ↑/↓ arrow. */
export function SortTh<K extends string>({
  k, sortKey, sortDir, onSort, children, className = '', title,
}: {
  k: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (k: K) => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      className={`py-2 px-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-[var(--text)] transition-colors ${active ? 'text-[var(--accent)]' : 'text-[var(--text-sec)]'} ${className}`}
      onClick={() => onSort(k)}
      title={title}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {children}
      {active && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

/** Plain (non-sortable) header cell with the same type treatment as SortTh. */
export function PlainTh({ children, className = '', title }: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <th className={`py-2 px-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] ${className}`} title={title}>
      {children}
    </th>
  );
}
