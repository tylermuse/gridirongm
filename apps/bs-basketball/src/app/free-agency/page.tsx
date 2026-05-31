'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import {
  freeAgentPool,
  capRoom,
  rosterCount,
  acceptanceProbability,
  bestCompetingOffer,
  MAX_ROSTER,
  type FreeAgentInfo,
} from '@/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [years, setYears] = useState(2);
  const [salaryM, setSalaryM] = useState(5);
  const [releaseId, setReleaseId] = useState<string>('');
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pool = useMemo<FreeAgentInfo[]>(() => (league ? freeAgentPool(league) : []), [league]);
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
  const count = userTeamId ? rosterCount(league, userTeamId) : 0;
  const rosterFull = count >= MAX_ROSTER;

  const selected = selectedId ? pool.find(f => f.player.id === selectedId) ?? null : null;
  const offer = { years, salaryPerYear: Math.round(salaryM * 1_000_000) };
  const competing = selected ? bestCompetingOffer(league, selected) : null;
  const acceptPct = selected ? Math.round(acceptanceProbability(selected, offer, competing?.total ?? 0) * 100) : 0;

  function selectFa(f: FreeAgentInfo) {
    setSelectedId(f.player.id);
    setYears(f.desiredYears);
    setSalaryM(Math.round((f.marketSalary / 1_000_000) * 10) / 10);
    setReleaseId('');
    setResultMsg(null);
  }

  async function makeOffer() {
    if (!selected) return;
    const res = await store.signFreeAgent(selected.player.id, offer, rosterFull ? releaseId || undefined : undefined);
    if (!res) return;
    setResultMsg({ ok: res.outcome === 'signed', text: res.message });
    if (res.outcome !== 'rejected') setSelectedId(null);
  }

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>Free Agency</h1>
        {userTeam && (
          <p className="text-sm opacity-70">
            {userTeam.city} · roster {count}/{MAX_ROSTER} · cap room {money(room)}
          </p>
        )}
      </header>

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

      {pool.length === 0 ? (
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
          <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              Available ({pool.length})
            </h2>
            <ul className="max-h-[36rem] overflow-y-auto">
              {pool.map(f => {
                const last = f.lastTeamId ? teamById.get(f.lastTeamId) : null;
                const isSel = selectedId === f.player.id;
                return (
                  <li key={f.player.id}>
                    <button
                      onClick={() => selectFa(f)}
                      className="w-full flex items-center gap-2 px-3 py-2 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
                      style={{ borderColor: 'var(--border)', background: isSel ? 'var(--surface-2)' : undefined }}
                    >
                      <PlayerAvatar
                        firstName={f.player.firstName}
                        lastName={f.player.lastName}
                        primaryColor={last?.primaryColor ?? '#555'}
                        secondaryColor={last?.secondaryColor ?? '#fff'}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{f.player.firstName} {f.player.lastName}</div>
                        <div className="text-xs text-[var(--text-sec)] flex items-center gap-1.5">
                          {f.player.sportData.position} · Age {f.player.age}
                          {last && (
                            <>
                              · <TeamLogo abbreviation={last.abbreviation} primaryColor={last.primaryColor} secondaryColor={last.secondaryColor} size="xs" />
                            </>
                          )}
                          <BirdBadge tier={f.birdRights} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black tabular-nums" style={{ color: 'var(--accent)' }}>{f.player.ratings.overall}</div>
                        <div className="text-[10px] text-[var(--text-sec)]">asks {money(f.marketSalary)}/yr</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Offer panel */}
          <section>
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

                <Button
                  variant="primary"
                  className="w-full"
                  disabled={store.loading || (rosterFull && !releaseId)}
                  onClick={() => void makeOffer()}
                >
                  {store.loading ? 'Submitting…' : 'Make Offer'}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
      <div className="font-bold tabular-nums" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
    </div>
  );
}

function BirdBadge({ tier }: { tier: 'full' | 'early' | 'none' }) {
  if (tier === 'none') return null;
  return (
    <span
      className="text-[9px] font-bold px-1 py-0.5 rounded"
      style={{ background: 'var(--surface-2)', color: 'var(--text-sec)' }}
      title={`${tier} Bird rights`}
    >
      🐦 {tier}
    </span>
  );
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
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
