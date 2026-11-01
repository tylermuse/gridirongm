'use client';

/**
 * Player-card body sections shared by the PlayerModal popover and the full
 * /player/[playerId] page, so both read the same way (football parity —
 * F:components/game/PlayerModal.tsx rating rows, Rating History, Awards and
 * Career Stats).
 *
 * Pure presentation: everything is derived from the player record and the
 * league's season archive; nothing here writes state.
 */

import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballStats,
} from '@bs/sport-basketball';
import { getSeasonHistory, type HistoryAwardRef } from '@/lib/history';
import { ratingFullLabel } from '@/lib/ui/ratingLabels';
import { ratingHex, ratingTier } from '@/lib/ui/ratingColor';

type LeagueLike = Parameters<typeof getSeasonHistory>[0];

// ===========================================================================
// Ratings
// ===========================================================================

export interface RatingFieldRef {
  key: string;
  label: string;
}

/** Rating fields grouped by category, in basketballUiMetadata order. */
export function groupedRatingFields(): [string, RatingFieldRef[]][] {
  const grouped = new Map<string, RatingFieldRef[]>();
  for (const f of basketballUiMetadata.ratingFields) {
    if (!grouped.has(f.group)) grouped.set(f.group, []);
    grouped.get(f.group)!.push({ key: String(f.key), label: f.label });
  }
  return [...grouped.entries()];
}

/** One rating row: full-word label, tier-colored bar, tier word, value. */
export function RatingRow({ ratingKey, code, value }: { ratingKey: string; code: string; value: number }) {
  const full = ratingFullLabel(ratingKey, code);
  // EPIC-D: tier label + actual hex color on the bar so a new user can read
  // 'ELITE 86' rather than just decode 86.
  const hex = ratingHex(value);
  return (
    <li className="flex items-center gap-2 sm:gap-3" title={`${full} (${code})`}>
      <span className="w-24 shrink-0 text-xs text-[var(--text-sec)] truncate">{full}</span>
      <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-2 rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: hex }}
        />
      </div>
      <span
        className="w-10 shrink-0 text-[10px] uppercase tracking-wide font-bold text-right"
        style={{ color: hex }}
      >
        {ratingTier(value)}
      </span>
      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums">{value}</span>
    </li>
  );
}

/** Rating groups grid. `modal` = tinted tiles; `page` = bordered cards. */
export function RatingGroups({ player, variant }: { player: BasketballPlayer; variant: 'modal' | 'page' }) {
  const ratings = player.ratings as unknown as Record<string, number>;
  return (
    <section className="grid sm:grid-cols-2 gap-4">
      {groupedRatingFields().map(([group, fields]) => (
        <div
          key={group}
          className={variant === 'page' ? 'p-4 rounded-xl border' : 'p-4 rounded-lg'}
          style={
            variant === 'page'
              ? { borderColor: 'var(--border)', background: 'var(--surface)' }
              : { background: 'var(--surface-2)' }
          }
        >
          <h3 className="text-xs font-bold uppercase tracking-wide mb-3 text-[var(--text-sec)]">{group}</h3>
          <ul className="space-y-2">
            {fields.map(f => {
              const v = ratings[f.key];
              if (typeof v !== 'number') return null;
              return <RatingRow key={f.key} ratingKey={f.key} code={f.label} value={v} />;
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ===========================================================================
// Rating History (OVR by season)
// ===========================================================================

export interface OvrPoint {
  season: number;
  overall: number;
  current: boolean;
}

/** OVR by logged season (oldest first) plus the current rating. */
export function ovrHistoryPoints(player: BasketballPlayer): OvrPoint[] {
  const log = [...(player.sportData.seasonLog ?? [])].sort((a, b) => a.season - b.season);
  return [
    ...log.map(e => ({ season: e.season, overall: e.overall, current: false })),
    { season: Number.NaN, overall: player.ratings.overall, current: true },
  ];
}

const SPARK_W = 200;
const SPARK_H = 48;
const SPARK_PAD = 4;

/** Sparkline + per-season OVR values with ±deltas. Render only when
 *  `points.length >= 2` (the caller decides, so it can drop its heading). */
export function OvrHistory({ points }: { points: OvrPoint[] }) {
  const overalls = points.map(p => p.overall);
  const min = Math.min(...overalls);
  const max = Math.max(...overalls);
  const span = max - min;
  const coords = points.map((p, i) => {
    const x = SPARK_PAD + (i / Math.max(1, points.length - 1)) * (SPARK_W - SPARK_PAD * 2);
    const y = span === 0
      ? SPARK_H / 2
      : SPARK_PAD + (1 - (p.overall - min) / span) * (SPARK_H - SPARK_PAD * 2);
    return { x, y };
  });
  const last = coords[coords.length - 1];
  const now = points[points.length - 1];

  return (
    <div>
      <div className="flex justify-center pb-2">
        <svg
          width={SPARK_W}
          height={SPARK_H}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          role="img"
          aria-label={`OVR by season: ${overalls.join(', ')}`}
        >
          <polyline
            points={coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && <circle cx={last.x} cy={last.y} r={3} fill={ratingHex(now.overall)} />}
        </svg>
      </div>
      <div className="flex items-end gap-3 pt-1 overflow-x-auto">
        {points.map((p, i) => {
          const delta = i > 0 ? p.overall - points[i - 1].overall : 0;
          return (
            <div key={p.current ? 'now' : p.season} className="flex-1 min-w-[2.25rem] text-center">
              <div
                className={`text-base font-black tabular-nums ${p.current ? 'opacity-60' : ''}`}
                style={{ color: ratingHex(p.overall) }}
              >
                {p.overall}
              </div>
              {i > 0 && delta !== 0 && (
                <div className={`text-[10px] tabular-nums ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {delta > 0 ? '+' : ''}{delta}
                </div>
              )}
              <div
                className={`text-[10px] mt-0.5 tabular-nums ${p.current ? 'font-semibold' : 'text-[var(--text-sec)]'}`}
                style={p.current ? { color: 'var(--accent)' } : undefined}
              >
                {p.current ? 'Now' : p.season}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Awards (derived from the league's season archive)
// ===========================================================================

type PlayerAwardKey = 'mvp' | 'finalsMvp' | 'dpoy' | 'roy' | 'sixthMan' | 'mip';

const AWARD_CHIP: Record<PlayerAwardKey, { label: string; icon: string }> = {
  mvp: { label: 'MVP', icon: '🏆' },
  finalsMvp: { label: 'Finals MVP', icon: '🏅' },
  dpoy: { label: 'DPOY', icon: '🛡️' },
  roy: { label: 'ROY', icon: '🌟' },
  sixthMan: { label: '6MOY', icon: '⚡' },
  mip: { label: 'MIP', icon: '📈' },
};
const AWARD_ORDER: PlayerAwardKey[] = ['mvp', 'finalsMvp', 'dpoy', 'roy', 'sixthMan', 'mip'];

const HONOR_ICON: Record<string, string> = {
  'All-League': '⭐',
  'All-Defensive': '🔒',
  'All-Rookie': '🔰',
};

export interface PlayerAwardChip {
  key: string;
  label: string;
  icon: string;
  /** Seasons won, oldest first. */
  seasons: number[];
  /** Display order (titles, then individual awards, then honors teams). */
  rank: number;
}

/** "All-League First Team" → "All-League 1st". */
function honorLabel(teamName: string): string {
  return teamName
    .replace(/\s+Team$/, '')
    .replace(/\bFirst\b/, '1st')
    .replace(/\bSecond\b/, '2nd')
    .replace(/\bThird\b/, '3rd');
}

/**
 * Every award / honor / title this player has won, counted across the season
 * archive. Championships come from the champion's season-end player lines, so
 * legacy archive entries (no `playerLines`) can't credit a ring.
 */
export function playerAwardChips(league: LeagueLike, playerId: string): PlayerAwardChip[] {
  const chips = new Map<string, PlayerAwardChip>();
  const add = (key: string, label: string, icon: string, rank: number, season: number) => {
    const chip = chips.get(key) ?? { key, label, icon, seasons: [], rank };
    if (!chip.seasons.includes(season)) chip.seasons.push(season);
    chips.set(key, chip);
  };

  const history = [...getSeasonHistory(league)].sort((a, b) => a.season - b.season);
  for (const e of history) {
    if (e.champion && e.playerLines?.some(l => l.id === playerId && l.teamId === e.champion)) {
      add('champion', 'Champion', '💍', 0, e.season);
    }

    // Extended entries carry `awards`; legacy ones only the top-level MVP /
    // Finals MVP refs.
    const awardMap: Partial<Record<PlayerAwardKey, HistoryAwardRef | null>> = {
      mvp: e.mvp,
      finalsMvp: e.finalsMvp,
      ...(e.awards ?? {}),
    };
    AWARD_ORDER.forEach((k, i) => {
      if (awardMap[k]?.id === playerId) add(k, AWARD_CHIP[k].label, AWARD_CHIP[k].icon, 10 + i, e.season);
    });

    const honorLists: [string, typeof e.allLeague][] = [
      ['All-League', e.allLeague],
      ['All-Defensive', e.allDefensive],
      ['All-Rookie', e.allRookie],
    ];
    honorLists.forEach(([prefix, teams], li) => {
      (teams ?? []).forEach((team, ti) => {
        if (team.players.some(p => p.playerId === playerId)) {
          add(team.name, honorLabel(team.name), HONOR_ICON[prefix] ?? '🏅', 100 + li * 10 + ti, e.season);
        }
      });
    });
  }

  return [...chips.values()].sort((a, b) => a.rank - b.rank);
}

/** Amber award chips ("2x MVP"); the tooltip lists the seasons. */
export function AwardChipList({ chips }: { chips: PlayerAwardChip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(c => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border bg-amber-500/10 border-amber-500/30 text-amber-600"
          title={c.seasons.join(', ')}
        >
          <span aria-hidden>{c.icon}</span>
          {c.seasons.length > 1 ? `${c.seasons.length}x ` : ''}{c.label}
        </span>
      ))}
    </div>
  );
}

// ===========================================================================
// Career Stats (seasonLog + the in-progress season)
// ===========================================================================

/** Per-game efficiency, the same NBA "EFF" formula the rollover writes into
 *  `seasonLog[].per` — so the in-progress row matches the logged ones. */
export function effPerGame(s: BasketballStats): number {
  if (!s.gamesPlayed) return 0;
  const total = s.points + s.totalRebounds + s.assists + s.steals + s.blocks
    - (s.fieldGoalsAttempted - s.fieldGoalsMade)
    - (s.freeThrowsAttempted - s.freeThrowsMade)
    - s.turnovers;
  return total / s.gamesPlayed;
}

export interface CareerRow {
  season: number;
  age: number;
  overall: number;
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  per?: number;
  current: boolean;
}

export function careerStatRows(
  player: BasketballPlayer,
  current: { season: number; stats: BasketballStats | null } | null,
): CareerRow[] {
  const log = [...(player.sportData.seasonLog ?? [])].sort((a, b) => b.season - a.season);
  const rows: CareerRow[] = log.map(e => ({
    season: e.season,
    age: e.age,
    overall: e.overall,
    gp: e.gamesPlayed,
    ppg: e.ppg,
    rpg: e.rpg,
    apg: e.apg,
    per: e.per,
    current: false,
  }));
  const s = current?.stats;
  if (current && s && s.gamesPlayed > 0 && !log.some(e => e.season === current.season)) {
    rows.unshift({
      season: current.season,
      age: player.age,
      overall: player.ratings.overall,
      gp: s.gamesPlayed,
      ppg: s.points / s.gamesPlayed,
      rpg: s.totalRebounds / s.gamesPlayed,
      apg: s.assists / s.gamesPlayed,
      per: effPerGame(s),
      current: true,
    });
  }
  return rows;
}

/** Compact year-by-year table, newest first. Render only when rows exist. */
export function CareerStatsTable({ rows }: { rows: CareerRow[] }) {
  const showPer = rows.some(r => typeof r.per === 'number');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[var(--text-sec)] uppercase tracking-wider">
            <th className="text-left font-semibold pb-1.5">Season</th>
            <th className="text-right font-semibold pb-1.5">Age</th>
            <th className="text-right font-semibold pb-1.5">OVR</th>
            <th className="text-right font-semibold pb-1.5">GP</th>
            <th className="text-right font-semibold pb-1.5">PPG</th>
            <th className="text-right font-semibold pb-1.5">RPG</th>
            <th className="text-right font-semibold pb-1.5">APG</th>
            {showPer && <th className="text-right font-semibold pb-1.5" title="Per-game efficiency">PER</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.season} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="py-1 font-semibold">
                {r.season}
                {r.current && <span className="ml-1 text-[10px] font-normal text-[var(--text-sec)]">now</span>}
              </td>
              <td className="py-1 text-right">{r.age}</td>
              <td className="py-1 text-right font-bold" style={{ color: ratingHex(r.overall) }}>{r.overall}</td>
              <td className="py-1 text-right">{r.gp}</td>
              <td className="py-1 text-right">{r.ppg.toFixed(1)}</td>
              <td className="py-1 text-right">{r.rpg.toFixed(1)}</td>
              <td className="py-1 text-right">{r.apg.toFixed(1)}</td>
              {showPer && (
                <td className="py-1 text-right">{typeof r.per === 'number' ? r.per.toFixed(1) : '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
