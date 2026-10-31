'use client';

import { useState } from 'react';

const round1 = (n: number) => Math.round(n * 10) / 10;

interface OfferSalaryInputProps {
  /** The player's current ask ($M/yr). Percentages are relative to this. */
  askingSalary: number;
  /** Current offer ($M/yr). */
  value: number;
  onChange: (salary: number) => void;
  minSalary: number;
  maxSalary: number;
}

/**
 * Salary offer controls shared by the Re-sign and Free Agency negotiation
 * panels: an exact $ field, an editable "% of ask" field and a slider, all
 * driving the same offer.
 *
 * Replaces the old 85% / 95% / 110% preset buttons — the top dead click on
 * both pages (`#%` in the click tracker). For the cheap players most people
 * sign, a preset often rounded to the offer already in the box (95% of a
 * $1.0M ask is $1.0M), so the click changed nothing.
 */
export function OfferSalaryInput({ askingSalary, value, onChange, minSalary, maxSalary }: OfferSalaryInputProps) {
  const ask = askingSalary > 0 ? askingSalary : minSalary;
  const clampSalary = (n: number) => Math.min(maxSalary, Math.max(minSalary, round1(n)));
  const pct = Math.round((value / ask) * 100);
  // Same rounding as `pct`, so an offer clamped to a bound displays in range.
  const minPct = Math.round((minSalary / ask) * 100);
  const maxPct = Math.round((maxSalary / ask) * 100);

  // While the % field is being edited it shows what was typed; otherwise it
  // shows the percent the actual (0.1M-rounded) offer works out to.
  const [pctDraft, setPctDraft] = useState<string | null>(null);
  const applyPct = (raw: string) => {
    const p = parseFloat(raw);
    if (Number.isFinite(p)) onChange(clampSalary((ask * p) / 100));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-sec)]">$</span>
          <input
            type="number"
            min={minSalary}
            max={maxSalary}
            step={0.1}
            value={value}
            aria-label="Offer salary ($M per year)"
            onChange={e => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) onChange(Math.round(val * 10) / 10);
            }}
            className="w-28 pl-6 pr-2 py-1.5 text-sm font-mono font-bold bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-sec)]">M/yr</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              min={minPct}
              max={maxPct}
              step={1}
              value={pctDraft ?? String(pct)}
              aria-label="Offer as % of asking salary"
              onChange={e => {
                setPctDraft(e.target.value);
                const p = parseFloat(e.target.value);
                // Apply live only when in range, so typing "1" on the way to
                // "110" doesn't clamp the offer to the floor mid-keystroke.
                if (p >= minPct && p <= maxPct) applyPct(e.target.value);
              }}
              onBlur={() => {
                if (pctDraft !== null) applyPct(pctDraft);
                setPctDraft(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-20 pl-2 pr-6 py-1.5 text-sm font-mono font-bold bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-sec)]">%</span>
          </div>
          <span className="text-[10px] text-[var(--text-sec)]">of ask</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(askingSalary)}
          disabled={value === askingSalary}
          className="px-2 py-1 text-[10px] rounded bg-amber-100 text-amber-700 font-medium hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-default disabled:hover:bg-amber-100"
        >
          Match
        </button>
      </div>
      <input
        type="range"
        min={minSalary}
        max={maxSalary}
        step="any"
        value={Math.min(maxSalary, Math.max(minSalary, value))}
        aria-label="Offer salary slider"
        onChange={e => onChange(clampSalary(parseFloat(e.target.value)))}
        className="w-full max-w-sm accent-blue-600"
      />
    </div>
  );
}
