'use client';

import { useMemo, useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { EDITABLE_RATING_KEYS, type PlayerEdit, type CreatePlayerOpts } from '@/lib/godMode/godMode';
import { getInjuries } from '@/lib/injuries';
import {
  computeOverall, basketballUiMetadata, BASKETBALL_POSITIONS,
  type BasketballPlayer, type BasketballPosition, type BasketballRatings, type BasketballTeam,
} from '@bs/sport-basketball';

const RATING_LABEL: Record<string, string> = Object.fromEntries(
  basketballUiMetadata.ratingFields.map(f => [String(f.key), f.label]),
);
const EXTRA_LABEL: Record<string, string> = { height: 'HGT (in)', wingspan: 'WING (in)', speed: 'SPD', strength: 'STR', vertical: 'VERT', intangibles: 'INT' };

type RatingDraft = Omit<BasketballRatings, 'overall'>;

function pickRatings(r: BasketballRatings): RatingDraft {
  const out = {} as RatingDraft;
  for (const k of EDITABLE_RATING_KEYS) (out as Record<string, number>)[k] = r[k];
  return out;
}

const inputCls = 'w-full rounded-md border px-2 py-1 text-sm tabular-nums bg-[var(--surface)] text-[var(--foreground)]';

/**
 * God-Mode full player editor: every rating (live OVR preview via the real
 * computeOverall), age, potential, position, contract, injury, trade request.
 */
export function GodModePlayerEditor({ player }: { player: BasketballPlayer }) {
  const league = useLeagueStore(s => s.league);
  const godEditPlayer = useLeagueStore(s => s.godEditPlayer);
  const season = league?.currentSeason ?? 0;
  const day = league?.currentTick ?? 0;
  const injury = league ? getInjuries(league)[player.id] : undefined;
  const injured = !!injury && injury.returnDay > day;
  const yearsLeft = player.contract ? player.contract.years.filter(y => y.season >= season).length : 0;
  const salaryNow = player.contract?.years.find(y => y.season >= season)?.baseSalary ?? 0;

  const [ratings, setRatings] = useState<RatingDraft>(() => pickRatings(player.ratings));
  const [position, setPosition] = useState<BasketballPosition>(player.sportData.position);
  const [age, setAge] = useState(player.age);
  const [pot, setPot] = useState(player.development.potential);
  const [salaryM, setSalaryM] = useState((salaryNow / 1_000_000).toFixed(1));
  const [years, setYears] = useState(yearsLeft);
  const [injDays, setInjDays] = useState(10);
  const [open, setOpen] = useState(false);

  const previewOvr = useMemo(
    () => computeOverall({ ...player.ratings, ...ratings, overall: 0 }, position),
    [player.ratings, ratings, position],
  );

  const ratingsDirty = EDITABLE_RATING_KEYS.some(k => ratings[k as keyof RatingDraft] !== player.ratings[k]);
  const contractDirty = years !== yearsLeft || Math.round(parseFloat(salaryM) * 1_000_000) !== salaryNow;
  const dirty = ratingsDirty || contractDirty || position !== player.sportData.position || age !== player.age || pot !== player.development.potential;

  function apply() {
    const patch: PlayerEdit = { age, potential: Math.max(pot, previewOvr) };
    if (ratingsDirty) patch.ratings = ratings;
    if (position !== player.sportData.position) patch.position = position;
    if (contractDirty) patch.contract = { salaryPerYear: Math.max(0, parseFloat(salaryM) || 0) * 1_000_000, years };
    void godEditPlayer(player.id, patch);
  }

  /** Quick OVR scale (uniform shift of all skills) — reuses the old stepper path. */
  function scaleTo(target: number) {
    void godEditPlayer(player.id, { setOverall: target });
  }

  const tr = player.sportData.tradeRequest;
  const hasRequest = !!tr && tr.season === season;

  return (
    <section className="mt-5 rounded-lg border p-4" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))' }}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>🛠️ God Mode</h3>
        <span className="ml-auto text-xs text-[var(--text-sec)]">OVR preview</span>
        <span className="text-lg font-black tabular-nums" style={{ color: 'var(--accent)' }}>{previewOvr}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Field label="Position">
          <select value={position} onChange={e => setPosition(e.target.value as BasketballPosition)} className={inputCls} style={{ borderColor: 'var(--border)' }}>
            {BASKETBALL_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Age"><NumInput value={age} min={18} max={44} onChange={setAge} /></Field>
        <Field label="Potential"><NumInput value={Math.max(pot, previewOvr)} min={previewOvr} max={99} onChange={setPot} /></Field>
        <Field label="Scale OVR to">
          <div className="flex gap-1">
            {[60, 75, 85, 95].map(t => (
              <button key={t} onClick={() => scaleTo(t)} className="flex-1 rounded-md border text-xs font-bold py-1 hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>{t}</button>
            ))}
          </div>
        </Field>
      </div>

      <button onClick={() => setOpen(o => !o)} className="text-xs font-bold mb-2 hover:underline" style={{ color: 'var(--accent)' }}>
        {open ? '▾' : '▸'} Ratings ({EDITABLE_RATING_KEYS.length})
      </button>
      {open && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
          {EDITABLE_RATING_KEYS.map(k => (
            <Field key={k} label={EXTRA_LABEL[k] ?? RATING_LABEL[k] ?? k}>
              <NumInput
                value={ratings[k as keyof RatingDraft]}
                min={k === 'height' || k === 'wingspan' ? 66 : 0}
                max={k === 'height' ? 92 : k === 'wingspan' ? 98 : 99}
                onChange={v => setRatings(r => ({ ...r, [k]: v }))}
              />
            </Field>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Field label="Salary ($M / yr)">
          <input type="number" step={0.1} min={0} value={salaryM} onChange={e => setSalaryM(e.target.value)} className={inputCls} style={{ borderColor: 'var(--border)' }} />
        </Field>
        <Field label="Years left (0 = void)"><NumInput value={years} min={0} max={5} onChange={setYears} /></Field>
      </div>

      <button
        disabled={!dirty}
        onClick={apply}
        className="w-full text-sm font-bold rounded-lg py-2 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        {dirty ? 'Apply changes' : 'No changes'}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {injured ? (
          <button onClick={() => void godEditPlayer(player.id, { injury: null })} className="rounded-md border px-2.5 py-1 font-semibold hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
            🩹 Heal injury
          </button>
        ) : (
          <span className="inline-flex items-center gap-1">
            <input type="number" min={1} max={400} value={injDays} onChange={e => setInjDays(Number(e.target.value) || 1)} className="w-16 rounded-md border px-2 py-1 tabular-nums bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }} />
            <button onClick={() => void godEditPlayer(player.id, { injury: { days: injDays } })} className="rounded-md border px-2.5 py-1 font-semibold hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
              🤕 Injure (days)
            </button>
          </span>
        )}
        {hasRequest ? (
          <button onClick={() => void godEditPlayer(player.id, { tradeRequest: null })} className="rounded-md border px-2.5 py-1 font-semibold hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
            😊 Clear trade request
          </button>
        ) : (
          <button onClick={() => void godEditPlayer(player.id, { tradeRequest: 'requested' })} className="rounded-md border px-2.5 py-1 font-semibold hover:border-[var(--accent)]" style={{ borderColor: 'var(--border)' }}>
            📣 File trade request
          </button>
        )}
      </div>
    </section>
  );
}

/** God-Mode "create player" panel (Settings). */
export function GodModeCreatePlayer() {
  const league = useLeagueStore(s => s.league);
  const create = useLeagueStore(s => s.godCreatePlayer);
  const [position, setPosition] = useState<BasketballPosition>('SF');
  const [age, setAge] = useState(24);
  const [ovr, setOvr] = useState(75);
  const [teamId, setTeamId] = useState<string>('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!league) return null;
  const teams = [...(league.teams as BasketballTeam[])].sort((a, b) => a.city.localeCompare(b.city));

  async function go() {
    const opts: CreatePlayerOpts = { position, age, targetOverall: ovr, teamId: teamId || null, firstName: first, lastName: last };
    const id = await create(opts);
    setMsg(id ? `Created ${position} (${ovr} OVR) → ${teamId ? teams.find(t => t.id === teamId)?.city : 'free agency'}.` : 'Could not create player.');
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="First name"><input value={first} onChange={e => setFirst(e.target.value)} placeholder="Random" className={inputCls} style={{ borderColor: 'var(--border)' }} /></Field>
        <Field label="Last name"><input value={last} onChange={e => setLast(e.target.value)} placeholder="Random" className={inputCls} style={{ borderColor: 'var(--border)' }} /></Field>
        <Field label="Position">
          <select value={position} onChange={e => setPosition(e.target.value as BasketballPosition)} className={inputCls} style={{ borderColor: 'var(--border)' }}>
            {BASKETBALL_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Age"><NumInput value={age} min={18} max={44} onChange={setAge} /></Field>
        <Field label="Target OVR"><NumInput value={ovr} min={40} max={99} onChange={setOvr} /></Field>
        <Field label="Destination">
          <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputCls} style={{ borderColor: 'var(--border)' }}>
            <option value="">Free agency</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
        </Field>
      </div>
      <button onClick={() => void go()} className="text-sm font-bold rounded-lg px-4 py-2" style={{ background: 'var(--accent)', color: '#fff' }}>Create player</button>
      {msg && <p className="text-xs text-[var(--text-sec)]">{msg}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-[var(--text-sec)] mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={e => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
      className={inputCls}
      style={{ borderColor: 'var(--border)' }}
    />
  );
}
