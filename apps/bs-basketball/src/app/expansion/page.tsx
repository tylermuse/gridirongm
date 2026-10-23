'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Field, ColorField } from '@/components/settings/FranchiseFields';
import {
  expansionWindow,
  getExpansion,
  proposeRealignment,
  validateExpansionConfigs,
  protectablePlayers,
  autoProtect,
  availableForExpansion,
  recommendedExpansionPick,
  expansionTeamOnClock,
  CONFERENCE_DIVISIONS,
  PROTECTED_PER_TEAM,
  type ExpansionTeamConfig,
  type RealignmentPlan,
} from '@/lib/expansion';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BasketballConference, BasketballDivision } from '@/lib/data/teams';

/**
 * /expansion — grow the league to 31 or 32 teams in the offseason, between the
 * draft and the new season. Steps: Create → Realign → Protect → Draft → Done.
 * Light theme via the shared CSS variables only.
 */

type Step = 'create' | 'realign' | 'protect' | 'draft' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'create', label: '1. Create' },
  { key: 'realign', label: '2. Realign' },
  { key: 'protect', label: '3. Protect' },
  { key: 'draft', label: '4. Draft' },
  { key: 'done', label: '5. Done' },
];

const DEFAULTS: ExpansionTeamConfig[] = [
  { city: 'Seattle', name: 'Sound', abbreviation: 'SEA', primaryColor: '#00654B', secondaryColor: '#FFC200', conference: 'Western', division: 'Northwest' },
  { city: 'Las Vegas', name: 'Neon', abbreviation: 'LVN', primaryColor: '#2B2D42', secondaryColor: '#C4A24C', conference: 'Eastern', division: 'Southeast' },
];

const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

export default function ExpansionPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const exp = league ? getExpansion(league) : null;

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  // The expansion record lives until the next season starts, so a finished
  // expansion keeps showing its "done" summary for the rest of the offseason.
  const step: Step = exp?.stage ?? 'create';

  return (
    <Shell>
      <Stepper active={step} />
      {error && <ErrorLine message={error} />}
      {step === 'done' ? <DoneStep /> : step === 'protect' ? <ProtectStep /> : step === 'draft' ? <DraftStep /> : <CreateFlow />}
    </Shell>
  );
}

// ===========================================================================
// Create + realign (local state until the user confirms)
// ===========================================================================

function CreateFlow() {
  const league = useLeagueStore(s => s.league)!;
  const startExpansion = useLeagueStore(s => s.startExpansion);
  const win = expansionWindow(league);
  const [count, setCount] = useState(1);
  const [configs, setConfigs] = useState<ExpansionTeamConfig[]>(DEFAULTS.map(d => ({ ...d })));
  const [phase, setPhase] = useState<'create' | 'realign'>('create');
  const [plan, setPlan] = useState<RealignmentPlan | null>(null);
  const [takeOver, setTakeOver] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = configs.slice(0, count);
  const validation = win.open ? validateExpansionConfigs(league, chosen) : win.reason;

  if (!win.open) {
    return (
      <Card>
        <h2 className="font-bold mb-1">Expansion is closed right now</h2>
        <p className="text-sm text-[var(--text-sec)] mb-4">{win.reason}</p>
        <p className="text-sm text-[var(--text-sec)]">
          The window opens each offseason once the draft is complete, and stays open until you start the next season. The league can grow to 32 teams.
        </p>
        <div className="mt-4 flex gap-3">
          <Link href="/draft" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Go to Draft →</Link>
          <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Home →</Link>
        </div>
      </Card>
    );
  }

  function update(i: number, patch: Partial<ExpansionTeamConfig>) {
    setConfigs(cs => cs.map((c, k) => k === i ? { ...c, ...patch } : c));
  }

  if (phase === 'realign' && plan) {
    return (
      <div className="space-y-4">
        <Card>
          <h2 className="font-bold mb-1">Proposed realignment</h2>
          <p className="text-sm text-[var(--text-sec)] mb-4">
            Conferences must stay balanced (15/16 or 16/16) with divisions of 5–6 so the 82-game schedule works.
            {plan.moves.length === 0 ? ' Your placement already fits — no existing teams move.' : ` ${plan.moves.length} existing team${plan.moves.length === 1 ? '' : 's'} would move.`}
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {(['Eastern', 'Western'] as const).map(conf => (
              <div key={conf} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <div className="text-xs font-black uppercase tracking-widest mb-2">{conf} · {plan.sizes[conf]} teams</div>
                {CONFERENCE_DIVISIONS[conf].map(d => (
                  <div key={d} className="text-sm flex justify-between py-0.5">
                    <span>{d}</span>
                    <span className="tabular-nums text-[var(--text-sec)]">{plan.divisionSizes[d]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {chosen.map((c, i) => (
              <li key={i}><span className="font-semibold">{c.city} {c.name}</span> (new) → {plan.newTeams[i].conference} / {plan.newTeams[i].division}</li>
            ))}
            {plan.moves.map(m => (
              <li key={m.teamId}><span className="font-semibold">{m.label}</span>: {m.from.conference} / {m.from.division} → {m.to.conference} / {m.to.division}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="font-bold mb-1">Who do you run?</h2>
          <p className="text-sm text-[var(--text-sec)] mb-3">Keep your current team (you&apos;ll set its 8 protected players), or take over an expansion franchise and make its picks live.</p>
          <div className="flex flex-wrap gap-2">
            <Choice active={takeOver === null} onClick={() => setTakeOver(null)} label="Keep my current team" />
            {chosen.map((c, i) => (
              <Choice key={i} active={takeOver === i} onClick={() => setTakeOver(i)} label={`Take over ${c.city} ${c.name}`} />
            ))}
          </div>
        </Card>

        {confirming ? (
          <Card>
            <h2 className="font-bold mb-1">This is permanent</h2>
            <p className="text-sm text-[var(--text-sec)] mb-4">
              Expansion can&apos;t be undone: the league grows to {league.teams.length + count} teams, the realignment applies, and every team loses up to one unprotected player.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await startExpansion(chosen, plan, takeOver);
                  setBusy(false);
                }}
              >
                {busy ? 'Creating…' : 'Confirm expansion'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </Card>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPhase('create')}>← Back</Button>
            <Button onClick={() => setConfirming(true)}>Accept realignment</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-bold mb-1">New franchises</h2>
        <p className="text-sm text-[var(--text-sec)] mb-3">{win.reason}</p>
        <div className="flex gap-2 mb-4">
          {Array.from({ length: win.maxNewTeams }, (_, i) => i + 1).map(n => (
            <Choice key={n} active={count === n} onClick={() => setCount(n)} label={`${n} team${n === 1 ? '' : 's'} → ${league.teams.length + n}`} />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {chosen.map((c, i) => (
            <div key={i} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2 mb-3">
                <TeamLogo abbreviation={c.abbreviation.toUpperCase() || '?'} primaryColor={c.primaryColor} secondaryColor={c.secondaryColor} size="md" />
                <div className="font-bold">{c.city || 'City'} {c.name || 'Name'}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="City" value={c.city} onChange={v => update(i, { city: v })} />
                <Field label="Name" value={c.name} onChange={v => update(i, { name: v })} />
                <Field label="Abbrev" value={c.abbreviation} onChange={v => update(i, { abbreviation: v.toUpperCase().slice(0, 4) })} />
                <div />
                <ColorField label="Primary" value={c.primaryColor} onChange={v => update(i, { primaryColor: v })} />
                <ColorField label="Secondary" value={c.secondaryColor} onChange={v => update(i, { secondaryColor: v })} />
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide opacity-60">Conference</span>
                  <select
                    value={c.conference}
                    onChange={e => {
                      const conf = e.target.value as BasketballConference;
                      update(i, { conference: conf, division: CONFERENCE_DIVISIONS[conf][0] });
                    }}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="Eastern">Eastern</option>
                    <option value="Western">Western</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide opacity-60">Division</span>
                  <select
                    value={c.division}
                    onChange={e => update(i, { division: e.target.value as BasketballDivision })}
                    className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {CONFERENCE_DIVISIONS[c.conference].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        {validation && <p className="text-sm mt-3" style={{ color: '#b45309' }}>{validation}</p>}
      </Card>
      <Rules />
      <Button
        disabled={!!validation}
        onClick={() => { setPlan(proposeRealignment(league, chosen)); setPhase('realign'); }}
      >
        Next: realignment →
      </Button>
    </div>
  );
}

// ===========================================================================
// Protect
// ===========================================================================

function ProtectStep() {
  const league = useLeagueStore(s => s.league)!;
  const protectPlayers = useLeagueStore(s => s.protectPlayers);
  const beginDraft = useLeagueStore(s => s.beginExpansionDraft);
  const exp = getExpansion(league)!;
  const uid = league.userTeamId;
  const userProtects = !!uid && exp.existingTeamIds.includes(uid);
  const eligible = useMemo(
    () => (userProtects ? protectablePlayers(league, uid!, exp.season).sort((a, b) => b.ratings.overall - a.ratings.overall) : []),
    [league, uid, userProtects, exp.season],
  );
  const initial = exp.protected[uid ?? ''] ?? [];
  const [picked, setPicked] = useState<string[]>(initial.length ? initial : uid && userProtects ? autoProtect(league, uid, exp.season) : []);
  const [busy, setBusy] = useState(false);
  const userTeam = league.teams.find(t => t.id === uid);
  const rosterIds = new Set(userTeam?.playerIds ?? []);
  const exempt = userProtects ? [...rosterIds].filter(id => !eligible.some(p => p.id === id)) : [];

  function toggle(id: string) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= PROTECTED_PER_TEAM ? p : [...p, id]);
  }

  return (
    <div className="space-y-4">
      {userProtects ? (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold">Protect your players</h2>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{picked.length}/{PROTECTED_PER_TEAM}</span>
          </div>
          <p className="text-sm text-[var(--text-sec)] mb-3">
            Choose up to {PROTECTED_PER_TEAM}. Anyone left unprotected can be taken — but you&apos;ll lose at most one player. This year&apos;s draftees and expiring contracts are exempt automatically.
          </p>
          <div className="divide-y rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            {eligible.map(p => (
              <PlayerRow key={p.id} p={p} season={exp.season}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} disabled={!picked.includes(p.id) && picked.length >= PROTECTED_PER_TEAM} />
              </PlayerRow>
            ))}
          </div>
          {exempt.length > 0 && (
            <p className="text-xs text-[var(--text-sec)] mt-3">
              Exempt: {exempt.map(id => { const p = league.players[id] as BasketballPlayer | undefined; return p ? `${p.firstName} ${p.lastName}` : ''; }).filter(Boolean).join(', ')}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); await protectPlayers(picked); setBusy(false); }}>Save list</Button>
            <Button disabled={busy} onClick={async () => { setBusy(true); if (await protectPlayers(picked)) await beginDraft(); setBusy(false); }}>Lock protections & start draft →</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <h2 className="font-bold mb-1">Protection lists are in</h2>
          <p className="text-sm text-[var(--text-sec)] mb-4">Every existing team protected its best {PROTECTED_PER_TEAM} by value. You&apos;re running an expansion franchise — start the draft when ready.</p>
          <Button disabled={busy} onClick={async () => { setBusy(true); await beginDraft(); setBusy(false); }}>Start expansion draft →</Button>
        </Card>
      )}
      <Rules />
    </div>
  );
}

// ===========================================================================
// Draft
// ===========================================================================

function DraftStep() {
  const league = useLeagueStore(s => s.league)!;
  const pick = useLeagueStore(s => s.expansionPick);
  const sim = useLeagueStore(s => s.simExpansionDraft);
  const finish = useLeagueStore(s => s.finishExpansion);
  const exp = getExpansion(league)!;
  const onClock = expansionTeamOnClock(exp);
  const userOnClock = !!onClock && onClock === league.userTeamId;
  const pool = onClock ? availableForExpansion(league, onClock).sort((a, b) => b.ratings.overall - a.ratings.overall) : [];
  const rec = userOnClock ? recommendedExpansionPick(league) : null;
  const [busy, setBusy] = useState(false);
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id, t] as const));
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-4">
        <Card>
          {onClock ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <TeamLogoFor team={teamById.get(onClock)} />
                <div>
                  <div className="text-xs uppercase tracking-widest text-[var(--text-sec)]">Pick {exp.currentPick + 1} of {exp.order.length}</div>
                  <div className="font-bold">{teamName(teamById.get(onClock))} {userOnClock ? '— you\'re on the clock' : 'on the clock'}</div>
                  <div className="text-xs text-[var(--text-sec)]">Payroll {fmtM(payroll(league, onClock, exp.season))} · {teamById.get(onClock)?.playerIds.length ?? 0} players</div>
                </div>
              </div>
              <div className="flex gap-2">
                {!userOnClock && <Button disabled={busy} onClick={() => run(() => sim(false))}>Sim to my pick</Button>}
                <Button variant="secondary" disabled={busy} onClick={() => run(() => sim(true))}>Sim rest of draft</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">Expansion draft complete</h2>
                <p className="text-sm text-[var(--text-sec)]">New teams will fill out to 13 players from free agency.</p>
              </div>
              <Button disabled={busy} onClick={() => run(finish)}>Finish expansion →</Button>
            </div>
          )}
        </Card>

        {userOnClock && (
          <Card>
            <h2 className="font-bold mb-2">Available players</h2>
            <p className="text-xs text-[var(--text-sec)] mb-3">Unprotected, under contract, from teams that haven&apos;t lost a player yet, and affordable under the first apron.</p>
            <div className="divide-y rounded-lg border max-h-[32rem] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
              {pool.map(p => (
                <PlayerRow key={p.id} p={p} season={exp.season} from={teamName(p.rosterSlot ? teamById.get(p.rosterSlot.teamId) : undefined)} highlight={p.id === rec}>
                   <Button size="sm" disabled={busy} onClick={() => run(() => pick(p.id))}>Select</Button>
                </PlayerRow>
              ))}
              {pool.length === 0 && <p className="p-3 text-sm text-[var(--text-sec)]">Nobody legal left — sim to pass.</p>}
            </div>
          </Card>
        )}
      </div>

      <Card>
        <h2 className="font-bold mb-2">Selections</h2>
        <ol className="space-y-1.5 text-sm">
          {exp.picks.map(pk => {
            const p = pk.playerId ? league.players[pk.playerId] as BasketballPlayer | undefined : undefined;
            return (
              <li key={pk.overall} className="flex gap-2">
                <span className="w-6 tabular-nums text-[var(--text-sec)]">{pk.overall}</span>
                <span className="font-semibold w-10">{teamById.get(pk.expansionTeamId)?.abbreviation}</span>
                <span className="flex-1 truncate">{p ? `${p.firstName} ${p.lastName}` : 'Pass'}</span>
                {pk.fromTeamId && <span className="text-xs text-[var(--text-sec)]">{teamById.get(pk.fromTeamId)?.abbreviation}</span>}
              </li>
            );
          })}
          {exp.picks.length === 0 && <li className="text-[var(--text-sec)]">No picks yet.</li>}
        </ol>
      </Card>
    </div>
  );
}

// ===========================================================================
// Done
// ===========================================================================

function DoneStep() {
  const league = useLeagueStore(s => s.league)!;
  const exp = getExpansion(league)!;
  return (
    <Card>
      <h2 className="font-bold mb-1">Welcome to a {league.teams.length}-team league</h2>
      <p className="text-sm text-[var(--text-sec)] mb-4">
        The new franchises own their own picks from next year&apos;s draft on, start with full cap room for free agency, and get a full 82-game schedule when you start the season.
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        {exp.newTeamIds.map(id => {
          const t = league.teams.find(x => x.id === id) as BasketballTeam | undefined;
          return t ? (
            <Link key={id} href={`/team/${id}`} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <TeamLogoFor team={t} />
              <span className="font-semibold">{t.city} {t.name}</span>
              <span className="text-xs text-[var(--text-sec)]">{t.playerIds.length} players</span>
            </Link>
          ) : null;
        })}
      </div>
      <div className="flex gap-3">
        <Link href="/free-agency" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Free Agency →</Link>
        <Link href="/standings" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Standings →</Link>
      </div>
    </Card>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

function payroll(league: NonNullable<ReturnType<typeof useLeagueStore.getState>['league']>, teamId: string, season: number): number {
  const team = league.teams.find(t => t.id === teamId);
  let total = 0;
  for (const id of team?.playerIds ?? []) {
    const y = (league.players[id] as BasketballPlayer | undefined)?.contract?.years.find(x => x.season === season);
    if (y) total += y.baseSalary + y.proratedBonus;
  }
  return total;
}

function teamName(t: BasketballTeam | undefined): string {
  return t ? `${t.city} ${t.name}` : '—';
}

function TeamLogoFor({ team }: { team: BasketballTeam | undefined }) {
  if (!team) return null;
  return <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="sm" />;
}

function PlayerRow({ p, season, from, highlight, children }: { p: BasketballPlayer; season: number; from?: string; highlight?: boolean; children: React.ReactNode }) {
  const y = p.contract?.years.find(x => x.season === season);
  const yearsLeft = p.contract?.years.filter(x => x.season >= season).length ?? 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm" style={highlight ? { background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : undefined}>
      <span className="w-8 font-bold tabular-nums">{p.ratings.overall}</span>
      <span className="w-8 text-xs text-[var(--text-sec)]">{p.sportData.position}</span>
      <span className="flex-1 min-w-0 truncate font-semibold">
        {p.firstName} {p.lastName}
        {highlight && <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>AI pick</span>}
        {from && <span className="ml-2 text-xs font-normal text-[var(--text-sec)]">{from}</span>}
      </span>
      <span className="w-10 text-xs text-[var(--text-sec)] tabular-nums">{p.age}y</span>
      <span className="w-24 text-right text-xs tabular-nums text-[var(--text-sec)]">{y ? `${fmtM(y.baseSalary)} × ${yearsLeft}` : '—'}</span>
      <span className="w-16 flex justify-end">{children}</span>
    </div>
  );
}

function Rules() {
  return (
    <Card>
      <h2 className="font-bold mb-1">How expansion works</h2>
      <ul className="text-sm text-[var(--text-sec)] list-disc pl-5 space-y-0.5">
        <li>Each existing team protects {PROTECTED_PER_TEAM} players; AI teams protect their most valuable.</li>
        <li>This year&apos;s draftees and expiring contracts are exempt.</li>
        <li>Each existing team loses at most one player. Contracts carry over.</li>
        <li>New teams start with full cap room (first apron is the ceiling during the draft) and fill to 13 from free agency.</li>
        <li>New teams get their own draft picks from next year; the lottery grows to every non-playoff team.</li>
      </ul>
    </Card>
  );
}

function Stepper({ active }: { active: Step }) {
  return (
    <div className="flex items-center gap-1 flex-wrap mb-5 text-xs font-bold">
      {STEPS.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span className="px-2.5 py-1 rounded-md" style={s.key === active ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-sec)' }}>
            {s.label}
          </span>
          {i < STEPS.length - 1 && <span className="opacity-40">→</span>}
        </span>
      ))}
    </div>
  );
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95"
      style={active
        ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }
        : { borderColor: 'var(--border)', color: 'var(--text-sec)', background: 'var(--surface)' }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border p-5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>{children}</section>;
}

function ErrorLine({ message }: { message: string }) {
  return <p className="mb-4 text-sm rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)', color: '#b91c1c' }}>{message}</p>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-5 sm:p-8" style={{ color: 'var(--foreground)' }}>
      <Link href="/settings" className="text-sm font-semibold opacity-70 hover:opacity-100">← Settings</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-1" style={{ color: 'var(--accent)' }}>League Expansion</h1>
      <p className="text-sm text-[var(--text-sec)] mb-5">Add one or two franchises between the draft and the new season.</p>
      {children}
    </main>
  );
}
