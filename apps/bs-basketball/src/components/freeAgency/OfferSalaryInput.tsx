'use client';

import { useState } from 'react';

const round1 = (n: number) => Math.round(n * 10) / 10;

interface OfferSalaryInputProps {
  /** The player's current ask, in $M/yr. Percentages are relative to this. */
  askingSalary: number;
  /** Current offer, in $M/yr (one decimal). */
  value: number;
  onChange: (salaryM: number) => void;
  /** Slider / clamp bounds, in $M/yr. */
  minSalary: number;
  maxSalary: number;
}

/**
 * Salary offer controls shared by the Free Agency offer panel and the
 * re-sign / extension negotiation modal (port of football's
 * OfferSalaryInput): an exact $ field, an editable "% of ask" field, a Match
 * button that snaps to the ask, and a slider — all driving the same offer.
 *
 * Hoops stores salaries in dollars; this control works in $M with one
 * decimal, so callers convert at the edge (`$M * 1_000_000`).
 *
 * Both text fields are string-backed while focused so mobile users can clear
 * and retype them; the value only clamps on blur, never mid-keystroke.
 */
export function OfferSalaryInput({ askingSalary, value, onChange, minSalary, maxSalary }: OfferSalaryInputProps) {
  const ask = askingSalary > 0 ? askingSalary : minSalary;
  const askM = round1(askingSalary);
  const clampSalary = (n: number) => Math.min(maxSalary, Math.max(minSalary, round1(n)));
  const pct = Math.round((value / ask) * 100);
  // Same rounding as `pct`, so an offer clamped to a bound displays in range.
  const minPct = Math.round((minSalary / ask) * 100);
  const maxPct = Math.round((maxSalary / ask) * 100);

  const [salaryDraft, setSalaryDraft] = useState<string | null>(null);
  const [pctDraft, setPctDraft] = useState<string | null>(null);

  const applyPct = (raw: string) => {
    const p = parseFloat(raw);
    if (Number.isFinite(p)) onChange(clampSalary((ask * p) / 100));
  };

  const fieldCls = 'py-1.5 text-sm font-mono font-bold bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--text-sec)] focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none transition-colors';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-sec)]">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={minSalary}
            max={maxSalary}
            step={0.1}
            value={salaryDraft ?? value.toFixed(1)}
            aria-label="Offer salary ($M per year)"
            onChange={e => {
              setSalaryDraft(e.target.value);
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) onChange(round1(v));
            }}
            onBlur={() => {
              if (salaryDraft !== null) {
                const v = parseFloat(salaryDraft);
                onChange(clampSalary(Number.isFinite(v) ? v : value));
              }
              setSalaryDraft(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className={`w-32 pl-6 pr-11 ${fieldCls}`}
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
              className={`w-20 pl-2 pr-6 ${fieldCls}`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-sec)]">%</span>
          </div>
          <span className="text-[10px] text-[var(--text-sec)]">of ask</span>
        </div>
        <button
          type="button"
          onClick={() => { setSalaryDraft(null); onChange(askM); }}
          disabled={value === askM}
          title={`Match his ask ($${askM.toFixed(1)}M/yr)`}
          className="px-2.5 py-1.5 text-xs rounded-lg font-semibold bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-default disabled:hover:bg-amber-500/15"
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
        onChange={e => { setSalaryDraft(null); onChange(clampSalary(parseFloat(e.target.value))); }}
        className="w-full accent-[var(--accent)] cursor-pointer"
      />
    </div>
  );
}

/**
 * Contract-length chips (1–5 years) — football's year picker, shared by the
 * Free Agency panel and the negotiation modal. `preferred` marks the length
 * the player asked for.
 */
export function OfferYearsPicker({
  value, onChange, preferred, max = 5,
}: {
  value: number;
  onChange: (years: number) => void;
  preferred?: number;
  max?: number;
}) {
  const options = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Contract years">
      {options.map(yr => (
        <button
          key={yr}
          type="button"
          role="radio"
          aria-checked={value === yr}
          onClick={() => onChange(yr)}
          title={preferred === yr ? 'His preferred length' : undefined}
          className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
            value === yr
              ? 'bg-[var(--accent)] text-white'
              : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
          }`}
        >
          {yr}yr{preferred === yr && value !== yr ? ' •' : ''}
        </button>
      ))}
    </div>
  );
}
