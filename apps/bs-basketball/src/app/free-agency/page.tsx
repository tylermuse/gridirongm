'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { FreeAgentTable } from '@/components/freeAgency/FreeAgentTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import {
  freeAgentPool,
  capRoom,
  signingBudget,
  teamAppeal,
  rosterCount,
  acceptanceProbability,
  bestCompetingOffer,
  getFaDay,
  isSeasonUnderway,
  faPhase,
  faPriceDecay,
  FA_DAYS,
  MAX_ROSTER,
  type FreeAgentInfo,
  type CounterOffer,
} from '@/lib/freeAgency';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { positionNeeds } from '@/lib/draft/needs';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * /free-agency — sign players from the free-agent pool (Phase 2D-5).
 *
 * Pool list (last team, OVR, pos, age, Bird rights, market ask) on the left;
 * an offer panel on the right with years + salary, a projected acceptance
 * estimate, competing-interest note, and a release selector when the roster is
 * full. Offers resolve against simplified multi-team bidding.
 */
export default function FreeAgencyPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [years, setYears] = useState(2);
  const [salaryM, setSalaryM] = useState(5);
  const [releaseId, setReleaseId] = useState<string>('');
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [counter, setCounter] = useState<CounterOffer | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | BasketballPosition>('ALL');
  const [affordableOnly, setAffordableOnly] = useState(false);

  const allPool = useMemo<FreeAgentInfo[]>(() => (league ? freeAgentPool(league) : []), [league]);
  // Who the user can realistically sign: anyone whose ask fits the signing
  // budget. `signingBudget` already returns at least LEAGUE_MINIMUM_SALARY for
  // any team (BUG-17 — minimum-exception availability is always guaranteed),
  // so an over-cap team still sees their minimum-tier players in this filter.
  //
  // BUG-23: previously the predicate also added `(openSpot && uncontested)` as
  // a "vet-minimum safety valve". At Day 0 every player is uncontested, so
  // any team with an open roster spot saw EVERY free agent (including $45M
  // superstars) flagged as affordable — making the filter a no-op. The vet-
  // minimum signing path in resolveUserOffer still works at sign-time; the
  // filter just shouldn't claim a $45M ask is affordable on a $10M budget.
  const affordableIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!league?.userTeamId) return set;
    const bud = signingBudget(league, league.userTeamId);
    for (const f of allPool) {
      if (f.marketSalary <= bud) set.add(f.player.id);
    }
    return set;
  }, [league, allPool]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  const userTeamId = league.userTeamId;
  const userTeam = userTeamId ? (teamById.get(userTeamId) ?? null) : null;
  const room = userTeamId ? capRoom(league, userTeamId) : 0;
  // What the team can actually spend on one signing — cap room, or a Mid-Level /
  // minimum exception when over the cap. Over-cap teams can ALWAYS sign minimums
  // with an open roster spot (BUG-17), so "affordable" keys off this, not raw room.
  const budget = userTeamId ? signingBudget(league, userTeamId) : 0;
  const appeal = userTeamId ? teamAppeal(league, userTeamId) : 0.5;
  const count = userTeamId ? rosterCount(league, userTeamId) : 0;
  const rosterFull = count >= MAX_ROSTER;
  const faDay = getFaDay(league);
  const phase = faPhase(faDay);
  const faClosed = faDay >= FA_DAYS;

  const pool = allPool.filter(f =>
    (posFilter === 'ALL' || f.player.sportData.position === posFilter) &&
    (!affordableOnly || affordableIds.has(f.player.id)),
  );

  const selected = selectedId ? pool.find(f => f.player.id === selectedId) ?? null : null;
  const offer = { years, salaryPerYear: Math.round(salaryM * 1_000_000) };
  const competing = selected ? bestCompetingOffer(league, selected) : null;
  const acceptPct = selected ? Math.round(acceptanceProbability(selected, offer, competing?.total ?? 0, appeal) * 100) : 0;

  function selectFa(f: FreeAgentInfo) {
    setSelectedId(f.player.id);
    setYears(f.desiredYears);
    setSalaryM(Math.round((f.marketSalary / 1_000_000) * 10) / 10);
    setReleaseId('');
    setResultMsg(null);
    setCounter(null);
  }

  async function makeOffer() {
    if (!selected) return;
    const neg = await store.negotiateFreeAgent(selected.player.id, offer, rosterFull ? releaseId || undefined : undefined);
    if (!neg) return;
    if (neg.kind === 'counter') {
      setCounter(neg.counter);
      setResultMsg({ ok: false, text: neg.counter.message });
    } else {
      setCounter(null);
      setResultMsg({ ok: neg.result.outcome === 'signed', text: neg.result.message });
      if (neg.result.outcome !== 'rejected') setSelectedId(null);
    }
  }

  function meetDemand() {
    if (!counter) return;
    setYears(counter.years);
    setSalaryM(Math.round(counter.salaryPerYear / 100_000) / 10);
    setCounter(null);
    setResultMsg(null);
  }

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <OffseasonStepper active="fa" />
      <header className="flex flex-wrap items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Free Agency</h1>
          {userTeam && <p className="text-sm text-[var(--text-sec)]">{userTeam.city} · roster {count}/{MAX_ROSTER}</p>}
        </div>
        {userTeam && (
          <div className="text-right">
            <div className="text-2xl font-black tabular-nums" style={{ color: room > 10_000_000 ? '#10b981' : room > 0 ? '#d97706' : '#dc2626' }}>{money(room)}</div>
            <div className="text-[10px] uppercase tracking-wide opacity-60">Cap Space</div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" disabled={store.loading || faClosed} onClick={() => { void store.advanceFreeAgency(1); }}>Skip Day →</Button>
          <Button variant="secondary" disabled={store.loading || faClosed} onClick={() => { void store.advanceFreeAgency(7); }}>Skip Week ⏩</Button>
          {!isSeasonUnderway(league) && !league.games.some(g => g.status === 'played') && (
            <Button
              variant="primary"
              disabled={store.loading}
              onClick={() => { void store.beginRegularSeason().then(ok => { if (ok) router.push('/'); }); }}
            >
              {store.loading ? 'Tipping off…' : 'Start the Season →'}
            </Button>
          )}
        </div>
      </header>

      {/* Roster needs — count gaps + quality (upgrade) gaps, so you don't have to
          flip back to Roster & Lineup to see where you're thin. */}
      {userTeam && <RosterNeeds players={league.players as Record<string, BasketballPlayer>} team={userTeam} />}

      {/* FA day clock + price-decay phase */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-bold tabular-nums" style={{ color: 'var(--accent)' }}>Day {faDay} of {FA_DAYS}</span>
          <span className="font-bold" style={{ color: phase.color }}>
            {phase.label} · prices at {Math.round(faPriceDecay(faDay) * 100)}%{faClosed ? ' · window closed' : ''}
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${(faDay / FA_DAYS) * 100}%`, background: phase.color }} />
        </div>
      </div>

      {resultMsg && (
        <div
          className="mb-5 px-4 py-2 rounded-lg text-sm border"
          style={{
            borderColor: resultMsg.ok ? 'var(--accent)' : 'var(--border)',
            background: resultMsg.ok ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)',
          }}
        >
          {resultMsg.text}
        </div>
      )}

      {/* Position filters + affordable toggle */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {(['ALL', 'PG', 'SG', 'SF', 'PF', 'C'] as const).map(p => (
          <button key={p} onClick={() => setPosFilter(p)} className="text-xs font-bold rounded-md px-2.5 py-1" style={posFilter === p ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-sec)' }}>{p}</button>
        ))}
        {userTeam && (
          <button onClick={() => setAffordableOnly(v => !v)} className="ml-2 text-xs font-bold rounded-md px-2.5 py-1 border" style={affordableOnly ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : { background: 'var(--surface-2)', color: 'var(--text-sec)', borderColor: 'transparent' }}>
            Show affordable only
          </button>
        )}
      </div>

      {allPool.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="🧑‍💼"
            title="Camp's quiet right now"
            message="The pool fills up in the offseason — waived vets and undrafted prospects wash up here after the draft. Check back."
          />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
          {/* Pool */}
          <section className="rounded-xl border bg-[var(--surface)] overflow-hidden self-start" style={{ borderColor: 'var(--border)' }}>
            <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              Available ({pool.length})
            </h2>
            <div className="max-h-[36rem] overflow-y-auto">
              <FreeAgentTable league={league} pool={pool} room={room} budget={budget} appeal={appeal} selectedId={selectedId} onSelect={selectFa} />
            </div>
          </section>

          {/* Offer panel — a bottom sheet on mobile (so tapping Offer brings it up
              in place), the static side column on desktop. */}
          {selected && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedId(null)} />}
          <section
            className={selected
              ? 'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t shadow-2xl p-4 bg-[var(--surface)] lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:shadow-none lg:p-0 lg:bg-transparent'
              : ''}
            style={selected ? { borderColor: 'var(--border)' } : undefined}
          >
            {selected && (
              <button onClick={() => setSelectedId(null)} className="lg:hidden absolute right-3 top-3 z-10 text-[var(--text-sec)] hover:text-[var(--text)] text-xl leading-none" aria-label="Close">✕</button>
            )}
            {!selected ? (
              <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
                Select a free agent to make an offer.
              </div>
            ) : !userTeamId ? (
              <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
                You&apos;re spectating — pick a team to sign free agents.
              </div>
            ) : (
              <div className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <PlayerAvatar firstName={selected.player.firstName} lastName={selected.player.lastName} primaryColor="#444" secondaryColor="#fff" size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{selected.player.firstName} {selected.player.lastName}</div>
                    <div className="text-xs text-[var(--text-sec)]">
                      {selected.player.sportData.position} · Age {selected.player.age} · {selected.player.ratings.overall} OVR
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--text-sec)]">asking</div>
                    <div className="font-bold">{money(selected.marketSalary)}/yr · {selected.desiredYears}y</div>
                  </div>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Years: {years}</label>
                <input type="range" min={1} max={5} step={1} value={years} onChange={e => setYears(Number(e.target.value))} className="w-full mb-3" />

                <label className="block text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Salary: {salaryM.toFixed(1)}M / yr</label>
                <input type="range" min={1} max={Math.max(60, Math.ceil(selected.marketSalary / 1_000_000) + 10)} step={0.5} value={salaryM} onChange={e => setSalaryM(Number(e.target.value))} className="w-full mb-3" />

                <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                  <Stat label="Total offer" value={money(offer.salaryPerYear * years)} />
                  <Stat label="Projected accept" value={`${acceptPct}%`} accent={acceptPct >= 50} />
                </div>

                {competing && (
                  <div className="text-xs text-[var(--text-sec)] mb-3">
                    🔥 {teamById.get(competing.teamId)?.city ?? 'A rival'} is also interested (~{money(competing.total)} total).
                  </div>
                )}
                {offer.salaryPerYear > room && (
                  <div className="text-xs mb-3" style={{ color: '#dc2626' }}>
                    Over your cap room ({money(room)}) — allowed in v1, but it&apos;ll matter once the cap is enforced.
                  </div>
                )}

                {rosterFull && (
                  <div className="mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">
                      Roster full — release to make room
                    </label>
                    <select
                      value={releaseId}
                      onChange={e => setReleaseId(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <option value="">Select a player…</option>
                      {[...(userTeam?.playerIds ?? [])]
                        .map(id => league.players[id] as BasketballPlayer)
                        .filter(Boolean)
                        .sort((a, b) => a.ratings.overall - b.ratings.overall)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.firstName} {p.lastName} ({p.sportData.position} · {p.ratings.overall})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {counter && (
                  <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                    <div className="text-xs font-semibold mb-2">🗣 {counter.message}</div>
                    <button
                      onClick={meetDemand}
                      className="text-xs font-bold rounded-md px-2.5 py-1.5"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      Meet their ask — {counter.years}yr · {money(counter.salaryPerYear)}/yr
                    </button>
                    <span className="text-[11px] text-[var(--text-sec)] ml-2">or adjust your offer and counter back.</span>
                  </div>
                )}

                <Button
                  variant="primary"
                  className="w-full"
                  disabled={store.loading || (rosterFull && !releaseId)}
                  onClick={() => void makeOffer()}
                >
                  {store.loading ? 'Submitting…' : counter ? 'Counter Offer' : 'Make Offer'}
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

/**
 * Roster-needs strip: per-position depth + best OVR, flagging count gaps (thin)
 * and quality gaps (enough bodies but no starter-grade option). Count side reuses
 * the draft's positionNeeds; quality is best-OVR < starter threshold.
 */
const STARTER_OVR = 75;
function RosterNeeds({ players, team }: { players: Record<string, BasketballPlayer>; team: BasketballTeam }) {
  const POS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const needs = positionNeeds(team, players);
  const countByPos = new Map(needs.map(n => [n.position, n.count] as const));
  const bestOvr: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of team.playerIds) {
    const p = players[id];
    if (p) bestOvr[p.sportData.position] = Math.max(bestOvr[p.sportData.position], p.ratings.overall);
  }

  const items = POS.map(pos => {
    const count = countByPos.get(pos) ?? 0;
    const best = bestOvr[pos];
    let kind: 'count' | 'quality' | 'ok';
    let note: string;
    if (count <= 1) { kind = 'count'; note = count === 0 ? 'empty' : 'thin'; }
    else if (count === 2) { kind = 'count'; note = 'shallow'; }
    else if (best < STARTER_OVR) { kind = 'quality'; note = 'upgrade'; }
    else { kind = 'ok'; note = 'set'; }
    const color = kind === 'count' ? (count <= 1 ? '#dc2626' : '#d97706') : kind === 'quality' ? '#2563eb' : '#10b981';
    const bg = kind === 'ok' ? 'var(--surface-2)' : `color-mix(in srgb, ${color} 14%, transparent)`;
    return { pos, count, best, kind, note, color, bg };
  });
  const gaps = items.filter(i => i.kind !== 'ok');

  return (
    <div className="rounded-xl border bg-[var(--surface)] px-4 py-3 mb-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Roster needs</span>
        <span className="text-xs text-[var(--text-sec)]">
          {gaps.length === 0
            ? 'balanced across all five spots'
            : gaps.map(g => g.kind === 'quality' ? `${g.pos} (upgrade)` : g.pos).join(' · ')}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {items.map(i => (
          <div key={i.pos} className="rounded-lg px-2 py-1.5 text-center" style={{ background: i.bg }}>
            <div className="text-xs font-black" style={{ color: i.kind === 'ok' ? 'var(--text)' : i.color }}>{i.pos}</div>
            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-sec)' }}>{i.count} · {i.best || '—'} OVR</div>
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: i.kind === 'ok' ? 'var(--text-sec)' : i.color }}>{i.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
      <div className="font-bold tabular-nums" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
    </div>
  );
}

function money(n: number): string {
  // Format on the magnitude so negatives (over-cap) still convert to millions
  // and the sign sits outside the $ — e.g. -$35.0M, not $-35039K.
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}$${Math.round(abs / 1000)}K`;
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
