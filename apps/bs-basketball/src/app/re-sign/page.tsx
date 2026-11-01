'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { lastSeasonStatLine } from '@/lib/stats/statLine';
import { ratingChipClass } from '@/lib/ui/ratingColor';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { extensionMarket } from '@/lib/roster/extension';
import { openTalk, currentAsk } from '@/lib/roster/negotiation';
import { keepValueOf } from '@/lib/season/advanceSeason';
import { getMaxRoster } from '@/lib/rules/leagueRules';
import { getDraft } from '@/lib/draft';
import { resignProjection, hasSalaryForSeason, salaryForSeason } from '@/lib/roster/resignProjection';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /re-sign — the offseason roster hub (parity with football). Each expiring
 * player can be Re-signed or Let Walk; the projected NEXT-season cap space
 * depletes as you commit money. "Let Walk" releases the player to free agency
 * immediately (it persists — they come off the roster and the books now, and
 * won't reappear in the roster-trim list). Once your roster is at the league's
 * roster limit, "Sign Free Agents" opens the FA window; over the limit it's a
 * hard gate with inline cuts (shown first once nothing is left to re-sign).
 */
export default function ReSignPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [extendId, setExtendId] = useState<string | null>(null);
  // Players released this session, for "what I just did" feedback (they're already
  // off the roster, so we keep a local note rather than re-deriving it).
  const [walked, setWalked] = useState<{ id: string; name: string }[]>([]);
  // R2-1: themed ConfirmModals instead of native window.confirm() prompts
  // (resign-all, let-all-walk, let-walk on a 78+ OVR vet, roster cuts) so the
  // page stops thread-blocking and the dialogs match the rest of the app.
  const [confirmResignAll, setConfirmResignAll] = useState(false);
  const [confirmLetAllWalk, setConfirmLetAllWalk] = useState(false);
  const [pendingWalk, setPendingWalk] = useState<BasketballPlayer | null>(null);
  const [pendingCut, setPendingCut] = useState<BasketballPlayer | null>(null);
  // Only the clicked "Sign Free Agents" button spins (not on every store op).
  const [advancing, setAdvancing] = useState(false);

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
  // The season being built (what FA signs for) — the cut list prices it.
  const capSeason = proj.nextSeason;

  const active = candidates.filter(p => !hasSalaryForSeason(p, nextSeason));
  const resigned = candidates.filter(p => hasSalaryForSeason(p, nextSeason));

  const maxRoster = getMaxRoster(league);
  const over = roster.length - maxRoster;
  const doneResigning = active.length === 0;
  // Nothing left to decide but still over the limit → the cuts are the only
  // thing standing between the user and free agency, so they lead the page.
  const cutsFirst = doneResigning && over > 0;
  const showCompletion = doneResigning && over <= 0;
  const nothingExpiring = candidates.length === 0 && walked.length === 0;

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
    // Each player at his CURRENT ask from negotiation (his full price if he
    // ended talks) — the bulk version of "Offer what he wants".
    const signings = active.map(p => ({ playerId: p.id, offer: currentAsk(openTalk(league!, p)) }));
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
    setAdvancing(true);
    try {
      await openFreeAgency();
    } finally {
      setAdvancing(false);
    }
  }
  async function openFreeAgency() {
    // An inaugural (imported) draft — or a post-draft roster import that opened
    // straight at the re-sign window with no draft state — tips into the CURRENT
    // season with no year roll, so it finishes via finishInauguralDraft rather
    // than startNextSeason (which rolls the year, re-ages the league, and demands
    // a completed draft a post-draft import never had → "Finish the draft before
    // starting the season."). Both route on to FA.
    const postDraftImport = (league?.sportData as { postDraftImport?: boolean } | undefined)?.postDraftImport;
    if (draft?.inaugural || (postDraftImport && !draft)) {
      await store.finishInauguralDraft();
      router.push('/free-agency');
      return;
    }
    const next = await store.startNextSeason();
    if (next) router.push('/free-agency');
  }

  const spaceColor = proj.projectedSpace > 10_000_000 ? '#10b981' : proj.projectedSpace > 0 ? '#d97706' : '#dc2626';

  // Finalize roster — hard roster-limit gate before free agency, with the
  // whole roster listed (lowest keep-value first) so any player can be cut.
  const finalizeSection = (
    <section id="finalize" className={`scroll-mt-32 rounded-xl border bg-[var(--surface)] overflow-hidden ${cutsFirst ? 'mb-4' : 'mt-6'}`} style={{ borderColor: 'var(--border)' }}>
      <header className="flex flex-wrap items-baseline gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <h2 className="text-sm font-black uppercase tracking-tight">Finalize Roster</h2>
        {over > 0
          ? <span className="text-xs font-bold text-red-600">Trim {over} — {roster.length}/{maxRoster}</span>
          : <span className="text-xs font-bold text-green-600">At the limit — {roster.length}/{maxRoster} ✓</span>}
      </header>
      {over > 0 && (
        <>
          <p className="text-xs text-[var(--text-sec)] px-4 pt-3 pb-1">
            Over the {maxRoster}-man limit — cut {over} more to open free agency. Sorted by keep-value, lowest first; the
            {' '}<span className="text-red-600 font-semibold">highlighted</span> rows are the suggested cuts.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">
                  <th className="py-2 pl-4 text-left">Player</th>
                  <th className="py-2 text-center">Pos</th>
                  <th className="py-2 text-center">Age</th>
                  <th className="py-2 text-center" title={`Contract years left from ${capSeason}`}>Yrs</th>
                  <th className="py-2 text-right" title={`${capSeason} salary`}>Salary</th>
                  <th className="py-2 text-center">OVR</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p, i) => {
                  const yrs = contractYearsLeft(p, capSeason);
                  const salary = salaryForSeason(p, capSeason);
                  return (
                    <tr
                      key={p.id}
                      className={`border-t transition-colors ${i < over ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-[var(--surface-2)]'}`}
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <td className="py-1.5 pl-4 pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} photoUrl={p.sportData.photoUrl} size="sm" />
                          <PlayerName playerId={p.id} firstName={p.firstName} lastName={p.lastName} className="font-semibold truncate hover:text-[var(--accent)] transition-colors" />
                        </div>
                      </td>
                      <td className="text-center"><Chip>{p.sportData.position}</Chip></td>
                      <td className="text-center tabular-nums text-[var(--text-sec)]">{p.age}</td>
                      <td className="text-center tabular-nums text-[var(--text-sec)]">
                        {yrs > 0 ? yrs : <span className="text-amber-600 text-xs font-semibold" title="Expiring — no deal for next season">Exp</span>}
                      </td>
                      <td className="text-right tabular-nums">{salary > 0 ? money(salary) : <span className="text-[var(--text-sec)]">—</span>}</td>
                      <td className="text-center">
                        <span className={`font-black text-sm px-1.5 py-0.5 rounded tabular-nums ${ratingChipClass(p.ratings.overall)}`}>{p.ratings.overall}</span>
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        <Button size="sm" variant="danger" disabled={store.loading} onClick={() => setPendingCut(p)}>Cut</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <Button variant="primary" disabled={over > 0 || store.loading} busy={advancing} onClick={() => void startSeason()}>
          Sign Free Agents →
        </Button>
        {over > 0 && <span className="text-sm text-[var(--text-sec)]">Cut {over} more to continue.</span>}
      </div>
    </section>
  );

  // Nothing left to re-sign and the roster is legal → one clear next step.
  const completionCard = (
    <section id="finalize" className="scroll-mt-32 rounded-xl border bg-[var(--surface)] px-4 py-8 text-center" style={{ borderColor: 'var(--border)' }}>
      <div className="text-4xl mb-2" aria-hidden>✅</div>
      <p className="font-semibold">All re-signing decisions complete.</p>
      <p className="text-xs text-[var(--text-sec)] mt-1 mb-4">
        {nothingExpiring ? 'Nobody was in a walk year. ' : ''}Roster {roster.length}/{maxRoster} — ready for free agency.
      </p>
      <Button variant="primary" disabled={store.loading} busy={advancing} onClick={() => void startSeason()}>
        Sign Free Agents →
      </Button>
    </section>
  );

  return (
    <Shell stepper>
      {cutsFirst && finalizeSection}

      {/* Live cap — what you have to spend on the upcoming season, recomputed every
          render from the actual roster. Drops as you re-sign, frees up as you walk. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <CapTile label={proj.projectedSpace < 0 ? `Over the cap (${proj.nextSeason})` : `Cap space to spend (${proj.nextSeason})`} value={money(proj.projectedSpace)} color={spaceColor} big />
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
          <p className="text-sm font-semibold mr-auto rounded-lg px-3 py-1.5 bg-amber-500/15 text-amber-600">
            ⚠ Decide on {active.length} expiring player{active.length === 1 ? '' : 's'} — Let Walk releases them to free agency now.
          </p>
          <Button size="sm" variant="primary" disabled={store.loading} onClick={() => setConfirmResignAll(true)}>Re-sign All ({active.length})</Button>
          <Button size="sm" variant="danger" disabled={store.loading} onClick={() => setConfirmLetAllWalk(true)}>Let All Walk ({active.length})</Button>
        </div>
      )}

      {/* Active decisions */}
      {active.length > 0 && (
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {active.map(p => {
            const talk = openTalk(league, p);
            const asked = currentAsk(talk);
            const ask = { marketSalary: asked.salaryPerYear, desiredYears: asked.years };
            const stance = talk.status === 'ended'
              ? { label: 'Ended talks', bg: 'color-mix(in srgb,#dc2626 14%,transparent)', fg: '#dc2626' }
              : talk.rounds.length > 0
                ? { label: `Talking · ${talk.patienceLeft}/${talk.profile.patience} patience`, bg: 'color-mix(in srgb,#3b82f6 14%,transparent)', fg: '#2563eb' }
                : willingness(p, userTeam, season);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} photoUrl={p.sportData.photoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerName playerId={p.id} firstName={p.firstName} lastName={p.lastName} className="font-semibold truncate hover:text-[var(--accent)] transition-colors" />
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
                    Asks {money(ask.marketSalary)}/yr · {ask.desiredYears}y · <span className="text-red-600">−{money(ask.marketSalary)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">asks · costs next yr</div>
                  <div className="text-sm font-semibold tabular-nums">{money(ask.marketSalary)}/yr · {ask.desiredYears}y · <span className="text-red-600">−{money(ask.marketSalary)}</span></div>
                </div>
                {/* Stacked on mobile (narrower, more room for the name), side-by-side on desktop. */}
                <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                  <Button size="sm" variant="primary" disabled={store.loading} onClick={() => setExtendId(p.id)}>
                    {talk.rounds.length ? 'Negotiate' : 'Re-sign'}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={store.loading} onClick={() => letWalk(p)}>Let Walk</Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {showCompletion && completionCard}

      {/* Resolved decisions */}
      {(resigned.length > 0 || walked.length > 0) && (
        <section className="mt-4">
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-2">Decisions ({resigned.length + walked.length})</h2>
          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {resigned.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm bg-green-500/5" style={{ borderColor: 'var(--border)' }}>
                <span className="text-green-600 font-bold">✓</span>
                <PlayerName playerId={p.id} firstName={p.firstName} lastName={p.lastName} className="font-semibold flex-1 truncate hover:text-[var(--accent)] transition-colors" />
                <span className="text-xs text-[var(--text-sec)] tabular-nums">Re-signed · −{money(salaryForSeason(p, nextSeason))}/yr</span>
              </div>
            ))}
            {walked.map(w => (
              <div key={w.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm bg-red-500/5" style={{ borderColor: 'var(--border)' }}>
                <span className="text-red-600 font-bold">↪</span>
                <PlayerName playerId={w.id} className="font-semibold flex-1 truncate hover:text-[var(--accent)] transition-colors">{w.name}</PlayerName>
                <span className="text-xs text-red-600">Released to FA</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!doneResigning && finalizeSection}

      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />

      <ConfirmModal
        open={confirmResignAll}
        onClose={() => setConfirmResignAll(false)}
        title="Re-sign all expiring players?"
        body={
          <>
            All <b>{active.length}</b> expiring players will be re-signed at their
            current ask (no haggling). You can still walk individuals afterward.
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
      <ConfirmModal
        open={!!pendingCut}
        onClose={() => setPendingCut(null)}
        title="Waive this player?"
        body={
          pendingCut ? (
            <>
              Waive <b>{pendingCut.firstName} {pendingCut.lastName}</b> ({pendingCut.sportData.position} · {pendingCut.ratings.overall} OVR)?
              {' '}He becomes a free agent immediately.
            </>
          ) : null
        }
        confirmLabel="Cut him"
        tone="danger"
        loading={store.loading}
        onConfirm={() => {
          const p = pendingCut;
          setPendingCut(null);
          if (p) void store.releasePlayer(p.id);
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
  if (!teamGood && p.ratings.overall >= 76) return { label: 'Wants to test FA', bg: 'color-mix(in srgb,#d97706 16%,transparent)', fg: '#d97706' };
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

function Shell({ children, stepper = false }: { children: React.ReactNode; stepper?: boolean }) {
  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      {stepper && <OffseasonStepper active="resign" />}
      <PageHeader
        title="Re-signing Window"
        subtitle="Extend your expiring contracts before they hit free agency."
      />
      {children}
    </main>
  );
}
