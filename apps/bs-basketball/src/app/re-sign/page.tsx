'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { lastSeasonStatLine } from '@/lib/stats/statLine';
import { ratingColor } from '@/lib/ui/ratingColor';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { extensionMarket } from '@/lib/roster/extension';
import { keepValueOf } from '@/lib/season/advanceSeason';
import { MAX_ROSTER } from '@/lib/freeAgency';
import { getDraft } from '@/lib/draft';
import { resignProjection, hasSalaryForSeason, salaryForSeason } from '@/lib/roster/resignProjection';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /re-sign — the offseason roster hub (parity with football). Each expiring
 * player can be Re-signed or Let Walk; the projected NEXT-season cap space
 * depletes as you commit money. "Let Walk" releases the player to free agency
 * immediately (it persists — they come off the roster and the books now, and
 * won't reappear in the roster-trim list). Once your roster is at the 15-man
 * limit, "Start Season" tips off; over the limit it's a hard gate with inline cuts.
 */
export default function ReSignPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [extendId, setExtendId] = useState<string | null>(null);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  // Players released this session, for "what I just did" feedback (they're already
  // off the roster, so we keep a local note rather than re-deriving it).
  const [walked, setWalked] = useState<{ id: string; name: string }[]>([]);
  // R2-1: replace the three native window.confirm() prompts (resign-all,
  // let-all-walk, let-walk on a 78+ OVR vet) with ConfirmModal so the page
  // stops thread-blocking and the dialogs are themed like the rest of the app.
  const [confirmResignAll, setConfirmResignAll] = useState(false);
  const [confirmLetAllWalk, setConfirmLetAllWalk] = useState(false);
  const [pendingWalk, setPendingWalk] = useState<BasketballPlayer | null>(null);

  const season = league?.currentSeason ?? 0;
  const userTeam = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  // Candidate pool = expiring players flagged when the offseason began, narrowed
  // to those still on the roster (a Let Walk releases them, so they drop off).
  const candidates = useMemo(() => {
    if (!league || !userTeam) return [] as BasketballPlayer[];
    const rosterSet = new Set<string>(userTeam.playerIds);
    const flagged = (league.sportData as { pendingResign?: string[] }).pendingResign;
    const ids = (flagged?.length
      ? flagged
      : userTeam.playerIds.filter(id => {
          const p = league.players[id] as BasketballPlayer | undefined;
          return !!p && !!p.contract && contractYearsLeft(p, season) <= 1;
        })
    ).filter(id => rosterSet.has(id));
    const byId = league.players as Record<string, BasketballPlayer>;
    return ids
      .map(id => byId[id])
      .filter((p): p is BasketballPlayer => !!p)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
  }, [league, userTeam, season]);

  // Full roster (for the trim gate), sorted by keep-value (lowest first = cut first).
  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !userTeam) return [];
    return userTeam.playerIds
      .map(id => league.players[id] as BasketballPlayer)
      .filter(Boolean)
      .sort((a, b) => keepValueOf(a.ratings.overall, a.development.potential) - keepValueOf(b.ratings.overall, b.development.potential));
  }, [league, userTeam]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!userTeam) return <Shell><p className="text-sm text-[var(--text-sec)]">You&apos;re spectating — pick a team to manage contracts.</p></Shell>;

  // The season re-sign extensions commit to. Extensions append years AFTER the
  // player's current deal expires (`extensionMarket.startSeason = expiringSeason
  // + 1`), so for an expiring 1-year-left candidate that's currentSeason + 1
  // regardless of inaugural status. Using the DRAFT year (`upcomingSeason`)
  // was wrong for inaugural — it equals currentSeason there, which the
  // candidate's existing contract already covered, so every expiring player
  // showed as already re-signed before any user action (BUG-21).
  const draft = getDraft(league);
  const nextSeason = league.currentSeason + 1;
  // Walked players are released immediately, so the projection reads straight from
  // the live roster — no pending-decision bookkeeping needed.
  const proj = resignProjection(league, userTeam, {});

  const active = candidates.filter(p => !hasSalaryForSeason(p, nextSeason));
  const resigned = candidates.filter(p => hasSalaryForSeason(p, nextSeason));

  const over = roster.length - MAX_ROSTER;

  // R2-1: walk is gated by ConfirmModal for 78+ OVR vets, immediate otherwise.
  async function performLetWalk(p: BasketballPlayer) {
    const ok = await store.releasePlayer(p.id);
    if (ok) setWalked(w => [...w, { id: p.id, name: `${p.firstName} ${p.lastName}` }]);
  }
  function letWalk(p: BasketballPlayer) {
    if (p.ratings.overall >= 78) { setPendingWalk(p); return; }
    void performLetWalk(p);
  }
  // R2-1: single bulk store call instead of N sequential extendPlayer awaits.
  // The old loop visibly stalled the page through a class of 8+ expiring deals.
  async function performResignAll() {
    setConfirmResignAll(false);
    const signings = active.map(p => {
      const m = extensionMarket(p, season);
      return { playerId: p.id, offer: { years: m.desiredYears, salaryPerYear: m.marketSalary } };
    });
    await store.extendPlayersBulk(signings);
  }
  async function performLetAllWalk() {
    setConfirmLetAllWalk(false);
    const ids = active.map(p => p.id);
    const names = active.map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }));
    const count = await store.releasePlayersBulk(ids);
    if (count > 0) setWalked(w => [...w, ...names.slice(0, count)]);
  }
  async function startSeason() {
    // An inaugural (imported) draft tips into the current season with no year
    // roll, so it finishes via finishInauguralDraft rather than startNextSeason
    // (which would roll the year and re-age the league). Both route on to FA.
    if (draft?.inaugural) {
      await store.finishInauguralDraft();
      router.push('/free-agency');
      return;
    }
    const next = await store.startNextSeason();
    if (next) router.push('/free-agency');
  }

  const spaceColor = proj.projectedSpace > 10_000_000 ? '#10b981' : proj.projectedSpace > 0 ? '#d97706' : '#dc2626';

  return (
    <Shell>
      <OffseasonStepper active="resign" />

      {/* Live cap — what you have to spend on the upcoming season, recomputed every
          render from the actual roster. Drops as you re-sign, frees up as you walk. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <CapTile label={`Cap space to spend (${nextSeason})`} value={money(proj.projectedSpace)} color={spaceColor} big />
        <CapTile label="Committed payroll" value={money(proj.committed)} color="var(--text)" />
        <CapTile label="Room if all re-signed" value={money(proj.roomIfAllReSigned)} color={proj.roomIfAllReSigned >= 0 ? '#10b981' : '#dc2626'} />
        <CapTile label={proj.apron.text} value={proj.overTaxBy > 0 ? `tax +${money(proj.overTaxBy)}` : '—'} color={proj.apron.color} />
      </div>

      {/* Roster composition — depth per position (released players are already off). */}
      {(() => {
        const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
        const depth: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
        for (const id of userTeam.playerIds) {
          const p = league.players[id] as BasketballPlayer | undefined;
          if (p) depth[p.sportData.position]++;
        }
        const kept = Object.values(depth).reduce((a, b) => a + b, 0);
        return (
          <div className="rounded-xl border bg-[var(--surface)] px-4 py-3 mb-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Roster composition</span>
              <span className="text-xs text-[var(--text-sec)]">{kept} players</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {POS.map(pos => {
                const n = depth[pos];
                const color = n >= 3 ? '#10b981' : n >= 2 ? '#d97706' : '#dc2626';
                return (
                  <div key={pos}>
                    <div className="flex justify-between text-xs mb-0.5"><span className="font-bold">{pos}</span><span className="tabular-nums" style={{ color }}>{n}</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (n / 3) * 100)}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-sm font-semibold mr-auto rounded-lg px-3 py-1.5" style={{ background: 'color-mix(in srgb, #d97706 14%, transparent)', color: '#b45309' }}>
            ⚠ Decide on {active.length} expiring player{active.length === 1 ? '' : 's'} — Let Walk releases them to free agency now.
          </p>
          <button onClick={() => setConfirmResignAll(true)} disabled={store.loading} className="text-xs font-bold rounded-lg px-3 py-1.5 text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Re-sign All ({active.length})</button>
          <button onClick={() => setConfirmLetAllWalk(true)} disabled={store.loading} className="text-xs font-bold rounded-lg px-3 py-1.5 border disabled:opacity-40" style={{ borderColor: '#dc2626', color: '#dc2626' }}>Let All Walk ({active.length})</button>
        </div>
      )}

      {/* Active decisions */}
      {active.length === 0 && resigned.length === 0 && walked.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🖊️" title="No expiring contracts" message="Nobody's in their walk year — your books are settled for now." />
        </div>
      ) : (
        active.length > 0 && (
          <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {active.map(p => {
              const ask = extensionMarket(p, season);
              const stance = willingness(p, userTeam, season);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                  <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} photoUrl={p.sportData.photoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={() => setModalPlayerId(p.id)} className="font-semibold truncate hover:underline text-left" style={{ color: 'var(--text)' }}>{p.firstName} {p.lastName}</button>
                      {/* MOBILE-1b: keep the stance chip visible on phone too —
                          previously hidden under sm: so the user couldn't tell
                          if the player even wanted to stay. */}
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: stance.bg, color: stance.fg }}>{stance.label}</span>
                    </div>
                    <div className="text-xs text-[var(--text-sec)]">{p.sportData.position} · Age {p.age} · {p.ratings.overall} OVR{lastSeasonStatLine(p) ? ` · ${lastSeasonStatLine(p)}` : ''}</div>
                    {/* MOBILE-1b: surface the cost on phone too — previously the
                        whole asks block was `hidden sm:block` so phone users tapped
                        Re-sign / Let Walk without seeing the salary / years / cap
                        hit. Reflow under the name on mobile; the side-right block
                        below still wins on >=sm. */}
                    <div className="sm:hidden text-xs font-semibold tabular-nums mt-0.5">
                      Asks {money(ask.marketSalary)}/yr · {ask.desiredYears}y · <span style={{ color: '#dc2626' }}>−{money(ask.marketSalary)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">asks · costs next yr</div>
                    <div className="text-sm font-semibold tabular-nums">{money(ask.marketSalary)}/yr · {ask.desiredYears}y · <span style={{ color: '#dc2626' }}>−{money(ask.marketSalary)}</span></div>
                  </div>
                  {/* Stacked on mobile (narrower, more room for the name), side-by-side on desktop. */}
                  <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                    <button onClick={() => setExtendId(p.id)} disabled={store.loading} className="text-sm font-bold rounded-lg px-3 py-1.5 disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>Re-sign</button>
                    <button onClick={() => void letWalk(p)} disabled={store.loading} className="text-sm font-semibold rounded-lg px-2.5 py-1.5 border disabled:opacity-40" style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}>Let Walk</button>
                  </div>
                </div>
              );
            })}
          </section>
        )
      )}

      {/* Resolved decisions */}
      {(resigned.length > 0 || walked.length > 0) && (
        <section className="mt-4">
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-2">Decisions ({resigned.length + walked.length})</h2>
          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {resigned.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, #10b981 7%, transparent)' }}>
                <span className="text-[#059669] font-bold">✓</span>
                <span className="font-semibold flex-1 truncate">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-[var(--text-sec)] tabular-nums">Re-signed · −{money(salaryForSeason(p, nextSeason))}/yr</span>
              </div>
            ))}
            {walked.map(w => (
              <div key={w.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, #dc2626 6%, transparent)' }}>
                <span className="text-[#dc2626] font-bold">↪</span>
                <span className="font-semibold flex-1 truncate">{w.name}</span>
                <span className="text-xs text-[#dc2626]">Released to FA</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Finalize roster — hard 15-man gate before the season (cuts folded in here). */}
      <section className="mt-6 rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <header className="flex flex-wrap items-baseline gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <h2 className="text-sm font-black uppercase tracking-tight">Finalize Roster</h2>
          {over > 0
            ? <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Trim {over} — {roster.length}/{MAX_ROSTER}</span>
            : <span className="text-xs font-bold" style={{ color: '#10b981' }}>At the limit — {roster.length}/{MAX_ROSTER} ✓</span>}
        </header>
        {over > 0 && (
          <div className="px-2 py-1">
            <p className="text-xs text-[var(--text-sec)] px-2 py-2">Over the 15-man limit — cut {over} more to start the season. Lowest keep-value first.</p>
            {roster.slice(0, over + 3).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" style={{ background: i < over ? 'color-mix(in srgb, #dc2626 6%, transparent)' : undefined }}>
                <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} photoUrl={p.sportData.photoUrl} size="sm" />
                <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
                <Chip>{p.sportData.position}</Chip>
                <span className={`text-sm font-bold tabular-nums ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                <button
                  onClick={() => { if (confirm(`Waive ${p.firstName} ${p.lastName}? They become a free agent.`)) void store.releasePlayer(p.id); }}
                  disabled={store.loading}
                  className="text-xs font-bold rounded-md px-2.5 py-1 text-white disabled:opacity-40"
                  style={{ background: '#dc2626' }}
                >
                  Cut
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="primary" disabled={over > 0 || store.loading} onClick={() => void startSeason()}>
            {store.loading ? 'Opening free agency…' : 'Sign Free Agents in the Preseason →'}
          </Button>
          {over > 0 && <span className="text-sm text-[var(--text-sec)]">Cut {over} more to continue.</span>}
        </div>
      </section>

      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />

      {/* R2-1: themed confirms replacing the prior native window.confirm() calls. */}
      <ConfirmModal
        open={confirmResignAll}
        onClose={() => setConfirmResignAll(false)}
        title="Re-sign all expiring players?"
        body={
          <>
            All <b>{active.length}</b> expiring players will be re-signed at their
            market ask. You can still walk individuals afterward.
          </>
        }
        confirmLabel={`Re-sign ${active.length}`}
        loading={store.loading}
        onConfirm={() => void performResignAll()}
      />
      <ConfirmModal
        open={confirmLetAllWalk}
        onClose={() => setConfirmLetAllWalk(false)}
        title="Let all expiring players walk?"
        body={
          <>
            All <b>{active.length}</b> expiring players will hit free agency
            immediately. This frees their roster spots and salary.
          </>
        }
        confirmLabel={`Let ${active.length} walk`}
        tone="danger"
        loading={store.loading}
        onConfirm={() => void performLetAllWalk()}
      />
      <ConfirmModal
        open={!!pendingWalk}
        onClose={() => setPendingWalk(null)}
        title="Let a starter walk?"
        body={
          pendingWalk ? (
            <>
              <b>{pendingWalk.firstName} {pendingWalk.lastName}</b> ({pendingWalk.ratings.overall} OVR)
              {' '}is a starting-caliber player. He goes to free agency immediately —
              his roster spot and salary clear today.
            </>
          ) : null
        }
        confirmLabel="Let him walk"
        tone="danger"
        loading={store.loading}
        onConfirm={() => {
          const p = pendingWalk;
          setPendingWalk(null);
          if (p) void performLetWalk(p);
        }}
      />
    </Shell>
  );
}

function CapTile({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className={`${big ? 'text-xl' : 'text-lg'} font-black tabular-nums`} style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
    </div>
  );
}


/** Real re-sign posture from team success + ask vs current pay + role/age. */
function willingness(p: BasketballPlayer, team: BasketballTeam, season: number): { label: string; bg: string; fg: string } {
  const cur = (p.contract?.years.find(y => y.season === season)?.baseSalary ?? 0) + (p.contract?.years.find(y => y.season === season)?.proratedBonus ?? 0);
  const ask = extensionMarket(p, season).marketSalary;
  const teamGood = team.record.wins >= 41;
  if (!teamGood && p.ratings.overall >= 76) return { label: 'Wants to test FA', bg: 'color-mix(in srgb,#d97706 16%,transparent)', fg: '#b45309' };
  if (ask > cur * 1.25) return { label: 'Seeking a raise', bg: 'color-mix(in srgb,#3b82f6 16%,transparent)', fg: '#2563eb' };
  if (teamGood || (p.age <= 24 && (p.development?.potential ?? 0) - p.ratings.overall >= 4)) return { label: 'Eager to stay', bg: 'color-mix(in srgb,#10b981 16%,transparent)', fg: '#059669' };
  return { label: 'Open to staying', bg: 'var(--surface-2)', fg: 'var(--text-sec)' };
}

function money(n: number): string {
  if (n === 0) return '$0';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(1)}M` : `${sign}$${Math.round(a / 1000)}K`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-2xl font-black uppercase tracking-tight mt-2 mb-4">Re-signing Window</h1>
      {children}
    </main>
  );
}
