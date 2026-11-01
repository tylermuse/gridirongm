'use client';

import { useMemo, useState } from 'react';
import { basketballSalaryCap } from '@bs/sport-basketball';
import { useLeagueStore } from '@/lib/store/leagueStore';
import {
  getLeagueRules,
  DEFAULT_LEAGUE_RULES,
  RULE_RANGES,
  type CommissionerSettings,
  type LeagueRules,
} from '@/lib/rules/leagueRules';
import { Section } from './Section';
import { SettingsChoice } from './SettingsControls';
import { Button } from '@/components/ui/Button';

/**
 * League Rules (parity with BS Football's league settings). Edits a local draft
 * of the league's commissioner settings; Save persists only the values that
 * differ from stock (a key at its default is removed), so a league reset to
 * defaults is byte-identical to one that never touched these.
 *
 * Always available — like Football's settings these are league configuration,
 * not God Mode powers.
 */

type Draft = Omit<LeagueRules, 'capGrowthAnchor' | 'salaryCap'> & { salaryCapM: number | null };

type SliderKey = Exclude<keyof Draft, 'salaryCapM'>;

function toDraft(r: LeagueRules): Draft {
  const { salaryCap, capGrowthAnchor: _anchor, ...rest } = r;
  void _anchor;
  return { ...rest, salaryCapM: salaryCap != null ? Math.round(salaryCap / 1_000_000) : null };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const fmtPct = (v: number) => `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`;
const fmtMult = (v: number) => `${v.toFixed(2)}×`;
const fmtDay = (v: number) => `Day ${v}`;
const fmtYears = (v: number) => (v === 0 ? '±0 yrs' : `${v > 0 ? '+' : ''}${v} yr${Math.abs(v) === 1 ? '' : 's'}`);
const fmtInt = (v: number) => `${v}`;

interface SliderSpec {
  key: SliderKey;
  label: string;
  fmt: (v: number) => string;
  hint: string;
  /** "Takes effect" note. */
  when?: string;
}

const GROUPS: { title: string; desc: string; sliders: SliderSpec[] }[] = [
  {
    title: 'Cap & Contracts',
    desc: 'How much teams can spend and what it costs to go over.',
    sliders: [
      { key: 'capGrowthPct', label: 'Annual cap growth', fmt: fmtPct, hint: 'Yearly rise in the salary cap (ignored while a flat cap is set).', when: 'Takes effect next season — this season\'s cap is locked in.' },
      { key: 'taxLinePct', label: 'Luxury-tax line', fmt: v => `cap + ${fmtPct(v)}`, hint: 'Payroll above this owes luxury tax.' },
      { key: 'firstApronPct', label: 'First apron', fmt: v => `cap + ${fmtPct(v)}`, hint: 'Over it: taxpayer MLE only. Also where AI teams stop re-signing role players.' },
      { key: 'secondApronPct', label: 'Second apron', fmt: v => `cap + ${fmtPct(v)}`, hint: 'Over it: minimum deals only, harsher trade limits.' },
      { key: 'taxRateMult', label: 'Luxury-tax rate', fmt: fmtMult, hint: 'Scales every tax bracket ($1.50–$3.75 per $1 over at 1×). 0 = no tax bill.' },
      { key: 'maxContractPct', label: 'Max contract', fmt: v => `${fmtPct(v)} of cap`, hint: 'Max for 10+ year vets; the 7–9 and 0–6 year tiers scale with it.', when: 'Applies to new offers and signings.' },
      { key: 'minSalaryMult', label: 'Minimum salary', fmt: fmtMult, hint: 'Scales the service-time minimum scale ($1.35M rookie – $3.87M vet at 1×).', when: 'Applies to new offers and signings.' },
    ],
  },
  {
    title: 'Calendar',
    desc: 'The regular season runs Day 1–170.',
    sliders: [
      { key: 'tradeDeadlineDay', label: 'Trade deadline', fmt: fmtDay, hint: 'Last day trades are allowed. Drives the trade window, AI offers, the rumor mill and the deadline banners.' },
    ],
  },
  {
    title: 'Health & Development',
    desc: 'Injuries during games and player growth/decline at each offseason.',
    sliders: [
      { key: 'injuryRateMult', label: 'Injury frequency', fmt: fmtMult, hint: 'Per-game injury chance. 0 = no new injuries.', when: 'Applies to games from now on; existing injuries are unchanged.' },
      { key: 'injuryDurationMult', label: 'Injury duration', fmt: fmtMult, hint: 'Days missed per injury (season-ending stays season-ending).', when: 'Applies to new injuries.' },
      { key: 'progressionMult', label: 'Progression speed', fmt: fmtMult, hint: 'How fast young players grow each offseason.', when: 'Takes effect at the next offseason rollover.' },
      { key: 'regressionMult', label: 'Aging / regression', fmt: fmtMult, hint: 'How fast veterans decline each offseason.', when: 'Takes effect at the next offseason rollover.' },
      { key: 'retirementAgeOffset', label: 'Retirement age', fmt: fmtYears, hint: 'Shifts every retirement threshold. + = longer careers.', when: 'Takes effect at the next offseason rollover.' },
    ],
  },
  {
    title: 'Roster',
    desc: 'Roster size limits.',
    sliders: [
      { key: 'maxRoster', label: 'Max roster size', fmt: fmtInt, hint: 'Free-agent signing gate, the start-of-season trim gate, and AI roster targets.', when: 'Signing gate applies now; AI teams trim to it when the next season starts.' },
    ],
  },
];

export function LeagueRulesPanel() {
  const league = useLeagueStore(s => s.league);
  const update = useLeagueStore(s => s.updateLeagueRules);
  const reset = useLeagueStore(s => s.resetLeagueRules);
  const saved = useMemo(() => toDraft(getLeagueRules(league)), [league]);
  const defaults = useMemo(() => toDraft(DEFAULT_LEAGUE_RULES as LeagueRules), []);
  const [draft, setDraft] = useState<Draft>(saved);
  const [syncedFrom, setSyncedFrom] = useState(saved);
  const [status, setStatus] = useState<'' | 'saved' | 'reset'>('');

  // Re-sync the draft when the saved rules change underneath us (league switch,
  // save, reset) — the "adjust state during render" pattern, not an effect.
  if (syncedFrom !== saved) {
    setSyncedFrom(saved);
    setDraft(saved);
  }

  if (!league) return null;

  const dirty = (Object.keys(draft) as (keyof Draft)[]).some(k => draft[k] !== saved[k]);
  const atDefaults = (Object.keys(defaults) as (keyof Draft)[]).every(k => saved[k] === defaults[k]);
  const currentCap = basketballSalaryCap(league.currentSeason);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v }));
    setStatus('');
  }

  async function save() {
    const patch: Partial<CommissionerSettings> = {};
    for (const g of GROUPS) {
      for (const s of g.sliders) {
        if (draft[s.key] === saved[s.key]) continue;
        // A value back at stock is removed (undefined) rather than stored.
        (patch as Record<string, number | undefined>)[s.key] =
          near(draft[s.key], defaults[s.key]) ? undefined : draft[s.key];
      }
    }
    if (draft.salaryCapM !== saved.salaryCapM) {
      patch.salaryCap = draft.salaryCapM != null && draft.salaryCapM > 0 ? draft.salaryCapM * 1_000_000 : undefined;
    }
    await update(patch);
    setStatus('saved');
  }

  async function resetAll() {
    await reset();
    setStatus('reset');
  }

  return (
    <>
      <Section
        title="League Rules"
        desc="Commissioner settings for this league — saved with the save file. Changes apply once you press Save."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={!dirty}>Save rules</Button>
          <Button variant="secondary" onClick={() => setDraft(saved)} disabled={!dirty}>Discard changes</Button>
          <Button variant="ghost" onClick={() => void resetAll()} disabled={atDefaults && !dirty}>Reset to defaults</Button>
          <span className="text-xs text-[var(--text-sec)]">
            {status === 'saved' ? 'Saved ✓' : status === 'reset' ? 'Back to stock rules ✓' : dirty ? 'Unsaved changes' : atDefaults ? 'Using stock rules' : 'Custom rules active'}
          </span>
        </div>
      </Section>

      {GROUPS.map(g => (
        <Section key={g.title} title={g.title} desc={g.desc}>
          {g.title === 'Cap & Contracts' && (
            <SalaryCapControl
              valueM={draft.salaryCapM}
              savedM={saved.salaryCapM}
              currentCap={currentCap}
              season={league.currentSeason}
              onChange={v => set('salaryCapM', v)}
            />
          )}
          <div className="space-y-5">
            {g.sliders.map(s => (
              <RuleSlider
                key={s.key}
                spec={s}
                value={draft[s.key]}
                savedValue={saved[s.key]}
                defaultValue={defaults[s.key]}
                onChange={v => set(s.key, v)}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

function RuleSlider({
  spec, value, savedValue, defaultValue, onChange,
}: {
  spec: SliderSpec;
  value: number;
  savedValue: number;
  defaultValue: number;
  onChange: (v: number) => void;
}) {
  const range = RULE_RANGES[spec.key];
  const changed = !near(value, savedValue);
  const custom = !near(value, defaultValue);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`rule-${spec.key}`} className="text-sm font-semibold">{spec.label}</label>
        <span className="text-sm font-bold tabular-nums" style={{ color: custom ? 'var(--accent)' : 'var(--foreground)' }}>
          {spec.fmt(value)}
        </span>
      </div>
      <input
        id={`rule-${spec.key}`}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="bs-range w-full mt-1"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-[var(--text-sec)]">
        <span>{spec.hint}</span>
        <span className="whitespace-nowrap">
          Default {spec.fmt(defaultValue)}
          {custom && (
            <button onClick={() => onChange(defaultValue)} className="ml-2 underline opacity-80 hover:opacity-100">reset</button>
          )}
        </span>
      </div>
      {changed && spec.when && (
        <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--accent)' }}>{spec.when}</p>
      )}
    </div>
  );
}

function SalaryCapControl({
  valueM, savedM, currentCap, season, onChange,
}: {
  valueM: number | null;
  savedM: number | null;
  currentCap: number;
  season: number;
  onChange: (v: number | null) => void;
}) {
  const flat = valueM != null;
  const range = RULE_RANGES.salaryCap;
  const minM = range.min / 1_000_000;
  const maxM = range.max / 1_000_000;
  const curM = Math.round(currentCap / 1_000_000);
  return (
    <div className="mb-5 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Salary cap</span>
        <span className="text-xs text-[var(--text-sec)]">{season} cap in force: ${curM}M</span>
      </div>
      <div className="flex gap-2 mt-2">
        <SettingsChoice active={!flat} onClick={() => onChange(null)} label="Grows yearly" />
        <SettingsChoice active={flat} onClick={() => onChange(savedM ?? curM)} label="Flat cap" />
      </div>
      {flat && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="rule-salaryCap" className="text-xs text-[var(--text-sec)]">Flat cap for every season (${minM}M–${maxM}M)</label>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>${valueM}M</span>
          </div>
          <input
            id="rule-salaryCap"
            type="range"
            min={minM}
            max={maxM}
            step={1}
            value={valueM ?? curM}
            onChange={e => onChange(Number(e.target.value))}
            className="bs-range w-full mt-1"
          />
        </div>
      )}
      <p className="text-xs text-[var(--text-sec)] mt-2">
        Default: grows yearly from $165M (2026). A flat cap applies immediately to every season; the tax line and aprons scale from it.
        {valueM !== savedM && <span className="font-semibold" style={{ color: 'var(--accent)' }}> Applies immediately on save.</span>}
      </p>
    </div>
  );
}
