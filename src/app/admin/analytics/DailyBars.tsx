'use client';

import { useState } from 'react';

export interface DailyBar {
  /** YYYY-MM-DD */
  day: string;
  /** The solid foreground bar. */
  value: number;
  /** Optional taller, lighter bar drawn behind `value` (e.g. raw vs engaged). */
  backdrop?: number;
}

/** Whole-number axis ticks from 0 up to a round value at or above `max`. */
export function niceTicks(max: number): number[] {
  const safeMax = Math.max(1, max);
  const rough = safeMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitude)
    .find((s) => s >= rough && Number.isInteger(s)) ?? Math.ceil(rough);
  const count = Math.ceil(safeMax / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

/** Bar indexes that get an x-axis date label: evenly spaced, always first and last. */
export function xLabelIndexes(barCount: number): number[] {
  if (barCount <= 1) return barCount === 1 ? [0] : [];
  const labelCount = barCount <= 7 ? barCount : 6;
  return Array.from({ length: labelCount }, (_, i) => Math.round((i * (barCount - 1)) / (labelCount - 1)));
}

function shortDate(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}`;
}

function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DailyBars({
  bars,
  valueLabel,
  backdropLabel,
}: {
  bars: DailyBar[];
  valueLabel: string;
  backdropLabel?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(0, ...bars.map((b) => Math.max(b.value, b.backdrop ?? 0))));
  const axisMax = ticks[ticks.length - 1];
  const pct = (n: number) => (n / axisMax) * 100;
  const active = hovered === null ? undefined : bars[hovered];

  return (
    <div className="flex gap-2">
      {/* Y-axis */}
      <div className="relative h-32 w-8 shrink-0 text-[10px] text-gray-400">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${pct(t)}%` }}>
            {t.toLocaleString()}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-32" onPointerLeave={() => setHovered(null)}>
          {/* Gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? 'border-gray-200' : 'border-gray-100'}`}
              style={{ bottom: `${pct(t)}%` }}
            />
          ))}

          {/* Each column is full height so short and zero-value days can still be hovered */}
          <div className={`absolute inset-0 flex items-end ${bars.length > 45 ? 'gap-px' : 'gap-[3px]'}`}>
            {bars.map((b, i) => (
              <div
                key={b.day}
                role="img"
                aria-label={`${longDate(b.day)}: ${b.value} ${valueLabel}${
                  backdropLabel ? `, ${b.backdrop ?? 0} ${backdropLabel}` : ''
                }`}
                className={`relative flex-1 min-w-0 h-full flex items-end rounded-t-sm ${hovered === i ? 'bg-gray-100' : ''}`}
                onPointerEnter={() => setHovered(i)}
              >
                {backdropLabel && (
                  <div
                    className="absolute bottom-0 w-full rounded-t-sm bg-blue-100"
                    style={{ height: `${pct(b.backdrop ?? 0)}%` }}
                  />
                )}
                <div
                  className={`relative w-full rounded-t-sm ${hovered === i ? 'bg-blue-700' : 'bg-blue-600'}`}
                  style={{ height: `${pct(b.value)}%`, minHeight: b.value > 0 ? '2px' : undefined }}
                />
              </div>
            ))}
          </div>

          {/* Tooltip sits beside the hovered column, flipping sides past the midpoint */}
          {active && hovered !== null && (
            <div
              className="absolute top-0 z-10 pointer-events-none whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={
                (hovered + 0.5) / bars.length < 0.5
                  ? { left: `calc(${((hovered + 1) / bars.length) * 100}% + 6px)` }
                  : { right: `calc(${(1 - hovered / bars.length) * 100}% + 6px)` }
              }
            >
              <div className="font-semibold mb-0.5">{longDate(active.day)}</div>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-gray-300">
                  <span className="w-2 h-2 rounded-sm bg-blue-500" />
                  {valueLabel}
                </span>
                <span className="font-semibold tabular-nums">{active.value.toLocaleString()}</span>
              </div>
              {backdropLabel && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-gray-300">
                    <span className="w-2 h-2 rounded-sm bg-blue-100" />
                    {backdropLabel}
                  </span>
                  <span className="font-semibold tabular-nums">{(active.backdrop ?? 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* X-axis */}
        <div className="relative h-3 mt-1.5 text-[10px] text-gray-400">
          {xLabelIndexes(bars.length).map((i) => (
            <span
              key={bars[i].day}
              className="absolute -translate-x-1/2 whitespace-nowrap leading-none"
              style={{ left: `${((i + 0.5) / bars.length) * 100}%` }}
            >
              {shortDate(bars[i].day)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
