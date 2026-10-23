'use client';

import { ratingHex } from '@/lib/ui/ratingColor';
import type { ScoutLevel } from '@/lib/draft';
import type { TieredScoutReport } from '@/lib/scouting';

/**
 * Tiered scouting report panel: shows exactly what the user's scouting tier has
 * unlocked on a prospect — the potential range bar (wide → narrow → exact),
 * skill bands (L1), combine + strengths/question marks (L2), and the true
 * ceiling, gem/bust verdict, and comp (L3) — plus buttons to scout further with
 * their marginal point cost. Theme variables only; light by default.
 */

const VERDICT_STYLE: Record<string, { color: string; label: string }> = {
  Gem: { color: '#16a34a', label: '💎 Gem — better than his projection' },
  'As advertised': { color: '#2563eb', label: '✔ As advertised' },
  'Bust risk': { color: '#dc2626', label: '⚠ Bust risk' },
};

/** Scale for the range bar (draft ceilings live in roughly this band). */
const BAR_MIN = 40;
const BAR_MAX = 99;

export function TieredScoutPanel({
  report, onScout, disabled,
}: {
  report: TieredScoutReport;
  onScout?: (level: Exclude<ScoutLevel, 0>) => void;
  disabled?: boolean;
}) {
  const { range, level } = report;
  const pct = (v: number) => ((v - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;
  const exact = report.truePotential != null;

  return (
    <div className="space-y-3">
      {/* Tier header + range bar */}
      <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <span className="font-bold">
            <TierPips level={level} /> <span className="ml-1">{report.levelName}</span>
          </span>
          <span className="text-[var(--text-sec)]">
            Projected {report.projected} ({report.projectedGrade})
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">
          Potential {exact ? '(confirmed)' : 'range'}
        </div>
        <div className="relative h-3 rounded-full" style={{ background: 'var(--surface-2)' }}>
          <div
            className="absolute top-0 h-3 rounded-full"
            style={{
              left: `${pct(range.low)}%`,
              width: `${Math.max(1.5, pct(range.high) - pct(range.low))}%`,
              background: exact ? ratingHex(range.low) : 'color-mix(in srgb, var(--accent) 45%, transparent)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1 tabular-nums">
          <span className="text-[var(--text-sec)]">{BAR_MIN}</span>
          <span className="font-black">{exact ? report.truePotential : `${range.low}–${range.high}`}</span>
          <span className="text-[var(--text-sec)]">{BAR_MAX}</span>
        </div>
      </div>

      {/* L3: verdict + comp */}
      {report.verdict && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)' }}>
          <div className="font-bold" style={{ color: VERDICT_STYLE[report.verdict].color }}>{VERDICT_STYLE[report.verdict].label}</div>
          {report.archetype && (
            <div className="text-xs mt-0.5">
              <span className="font-semibold">{report.archetype}</span>
              {report.comparison && <span className="text-[var(--text-sec)]"> — {report.comparison}</span>}
            </div>
          )}
        </div>
      )}

      {/* L1: skill bands */}
      {report.skills && (
        <Section title={level === 3 ? 'Skill grades' : 'Skill grades (scout estimate)'}>
          <div className="grid grid-cols-5 gap-1.5">
            {report.skills.map(s => (
              <div key={s.label} className="rounded-md text-center py-1.5" style={{ background: 'var(--surface-2)' }}>
                <div className="text-sm font-black" style={{ color: ratingHex(s.value) }}>{s.grade}</div>
                <div className="text-[9px] uppercase tracking-wide opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* L2: combine + strengths/weaknesses */}
      {report.combine && (
        <Section title="Workout / combine">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {report.combine.map(m => (
              <div key={m.label} className="rounded-md text-center px-1 py-1.5" style={{ background: 'var(--surface-2)' }}>
                <div className="text-xs font-bold tabular-nums">{m.value}</div>
                <div className="text-[8px] uppercase tracking-wide opacity-60 leading-tight">{m.label}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {report.strengths && report.weaknesses && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Strengths</div>
            {report.strengths.length ? report.strengths.map(s => <div key={s} className="text-green-700">+ {s}</div>) : <div className="opacity-50">—</div>}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Question marks</div>
            {report.weaknesses.length ? report.weaknesses.map(s => <div key={s} className="text-amber-700">– {s}</div>) : <div className="opacity-50">—</div>}
          </div>
        </div>
      )}

      {/* Scout further */}
      {report.upgrades.length > 0 && onScout && (
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1.5">
            <span>Scout further</span>
            <span className="tabular-nums">{report.pointsLeft} pts left</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {report.upgrades.map(u => (
              <button
                key={u.level}
                onClick={() => onScout(u.level)}
                disabled={disabled || !u.affordable}
                title={u.reveals}
                className="text-xs font-semibold rounded-md border px-2 py-1 disabled:opacity-40"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--surface)' }}
              >
                {u.name} · {u.costFromHere} pt{u.costFromHere === 1 ? '' : 's'}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-[var(--text-sec)] mt-1.5">{report.upgrades[0].reveals}.</div>
        </div>
      )}
    </div>
  );
}

/** ●●○ style tier indicator. */
export function TierPips({ level }: { level: ScoutLevel }) {
  return (
    <span className="inline-flex gap-0.5 align-middle" aria-label={`Scouting tier ${level} of 3`}>
      {[1, 2, 3].map(i => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: i <= level ? 'var(--accent)' : 'var(--border)' }} />
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1.5">{title}</div>
      {children}
    </div>
  );
}
