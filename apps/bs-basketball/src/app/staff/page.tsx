'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { fmtMoney } from '@/lib/dashboard/summary';
import {
  getHeadCoach, getDevCoach, coachOverall, coachScheme, coachingMarket, coachData, devCoachMultiplier,
  schemeFit, SCHEME_LABELS, ROLE_LABELS, schemeDescription, type StaffRole,
} from '@/lib/coaching/coaches';
import {
  coachSalary, coachMarketSalary, coachContractSeason, contractEnd, yearsRemaining,
  firePreview, evaluateCoachExtension, teamCoachDeadMoney, type ExtensionResult,
} from '@/lib/coaching/contracts';
import { coachCareer } from '@/lib/coaching/career';
import type { BaseCoach } from '@bs/core/adapter';
import { resolveBasketballPDCEffect, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';

/**
 * /staff — the user's head coach + player-development coach (ratings,
 * scheme, contract, extend / fire), the hiring market for each slot, and a
 * sortable league-wide coaches table.
 */
export default function StaffPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { hireCoach, fireCoach, extendCoach, loading: busy } = useLeagueStore();
  const [marketRole, setMarketRole] = useState<StaffRole>('HC');
  const [pendingHire, setPendingHire] = useState<BaseCoach | null>(null);
  const [pendingFire, setPendingFire] = useState<StaffRole | null>(null);
  const [extendFor, setExtendFor] = useState<StaffRole | null>(null);
  const [extYears, setExtYears] = useState(3);
  const [extResult, setExtResult] = useState<ExtensionResult | null>(null);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const pool = useMemo(() => (league ? coachingMarket(league, marketRole, 6) : []), [league, marketRole]);

  if (loading && !league) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!team) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🧑‍🏫" title="No team yet" message="Pick a team from the League page to manage its staff." />
        </div>
        <LeagueCoachesTable />
      </Shell>
    );
  }

  const season = coachContractSeason(league);
  const hc = getHeadCoach(league, team.id);
  const pdc = getDevCoach(league, team.id);
  const roster = team.playerIds
    .map(id => (league.players as Record<string, BasketballPlayer>)[id])
    .filter((p): p is BasketballPlayer => !!p);
  const scheme = hc ? coachScheme(hc) : null;
  const fitCounts = scheme
    ? roster.reduce((acc, p) => { const t = schemeFit(p, scheme).tier; acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>)
    : null;
  const deadThisYear = teamCoachDeadMoney(team, season);
  const expiring = [hc, pdc].filter((c): c is BaseCoach => !!c && yearsRemaining(c, season) <= 1);
  const inOffseason = league.currentPhase === 'offseason';
  const incumbentFor = (role: StaffRole) => (role === 'HC' ? hc : pdc);

  async function confirmHire() {
    if (!pendingHire) return;
    await hireCoach(team!.id, pendingHire);
    setPendingHire(null);
  }
  async function confirmFire() {
    if (!pendingFire) return;
    await fireCoach(team!.id, pendingFire);
    setPendingFire(null);
  }
  async function submitExtension() {
    if (!extendFor) return;
    const r = await extendCoach(team!.id, extendFor, extYears);
    setExtResult(r);
  }

  const firing = pendingFire ? incumbentFor(pendingFire) : null;
  const firingPreview = firing ? firePreview(firing, season) : null;
  const hireIncumbent = pendingHire ? incumbentFor(pendingHire.role as StaffRole) : null;
  const hirePreview = hireIncumbent ? firePreview(hireIncumbent, season) : null;
  const extCoach = extendFor ? incumbentFor(extendFor) : null;
  const extQuote = extendFor ? evaluateCoachExtension(league, team.id, extendFor, extYears) : null;

  return (
    <Shell>
      <h1 className="text-2xl sm:text-3xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
        {team.city} {team.name} — Staff
      </h1>

      {expiring.length > 0 && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f59e0b', background: 'color-mix(in srgb, #f59e0b 10%, var(--surface))' }}>
          <span className="font-bold">Contract decision{expiring.length > 1 ? 's' : ''}: </span>
          {expiring.map(c => `${c.firstName} ${c.lastName} (${ROLE_LABELS[c.role as StaffRole]})`).join(', ')}
          {' '}{inOffseason ? 'has no deal for next season' : 'is in the final year'} — extend, or hire a replacement from the market.
          {inOffseason && ' Undecided deals roll over one year at market rate when the season starts.'}
        </div>
      )}

      {/* Head coach */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Head Coach</CardTitle>
          {hc && <StaffActions coach={hc} season={season} busy={busy} onExtend={() => { setExtendFor('HC'); setExtResult(null); }} onFire={() => setPendingFire('HC')} />}
        </CardHeader>
        {hc && scheme ? (
          <div>
            <CoachHeader coach={hc} season={season} badge={`${SCHEME_LABELS[scheme]} system`} />
            <p className="text-sm text-[var(--text-sec)] mt-2">{schemeDescription(scheme)}</p>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <RatingTile label="Offense" value={hc.ratings.offense} />
              <RatingTile label="Defense" value={hc.ratings.defense} />
              <RatingTile label="Development" value={hc.ratings.development} />
              <RatingTile label="Morale" value={hc.ratings.morale} />
            </div>
            {(() => {
              const boost = Math.round((resolveBasketballPDCEffect(hc.ratings.development, 21) - 1) * 100);
              return (
                <p className="mt-2 text-xs text-[var(--text-sec)]">
                  {boost > 0 ? `Head coach adds +${boost}% growth for under-25 players.` : 'No head-coach growth boost for young players.'}
                </p>
              );
            })()}
            {fitCounts && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-sec)]">Roster fit</span>
                <FitChip color="#10b981" count={fitCounts.great ?? 0} label="great" />
                <FitChip color="#84cc16" count={fitCounts.good ?? 0} label="good" />
                <FitChip color="#f59e0b" count={fitCounts.neutral ?? 0} label="neutral" />
                <FitChip color="#dc2626" count={fitCounts.poor ?? 0} label="poor" />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-sec)]">No head coach. Hire one from the market below.</p>
        )}
      </Card>

      {/* Dev coach */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Player Development Coach</CardTitle>
          {pdc && <StaffActions coach={pdc} season={season} busy={busy} onExtend={() => { setExtendFor('PDC'); setExtResult(null); }} onFire={() => setPendingFire('PDC')} />}
        </CardHeader>
        {pdc ? (
          <div>
            <CoachHeader coach={pdc} season={season} badge="Development" />
            <DevEffect rating={pdc.ratings.development} />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-sec)]">Vacant — young players develop at the neutral rate. Hire one from the market below.</p>
        )}
      </Card>

      {deadThisYear > 0 && (
        <p className="mb-4 text-xs text-[var(--text-sec)]">
          Paying <span className="font-bold" style={{ color: '#f59e0b' }}>{fmtMoney(deadThisYear)}</span> to fired coaches in {season}. Coach money is an owner expense — it never counts against the salary cap.
        </p>
      )}

      {/* Hiring market */}
      <Card className="!p-0 overflow-hidden mb-4">
        <CardHeader className="px-4 pt-3">
          <CardTitle>Coaching market</CardTitle>
          <div className="flex gap-1">
            {(['HC', 'PDC'] as StaffRole[]).map(r => (
              <button key={r} onClick={() => setMarketRole(r)}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: marketRole === r ? 'var(--accent)' : 'var(--surface-2)', color: marketRole === r ? '#fff' : 'var(--text-sec)' }}>
                {r === 'HC' ? 'Head coaches' : 'Dev coaches'}
              </button>
            ))}
          </div>
        </CardHeader>
        <div className="pb-2">
          {pool.map(c => {
            const sc = coachScheme(c);
            const fc = marketRole === 'HC'
              ? roster.reduce((acc, p) => { const t = schemeFit(p, sc).tier; acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>)
              : null;
            const rec = coachCareer(league, c);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-1.5">
                    <Link href={`/coach/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link>
                    {marketRole === 'HC' && <Chip tone="blue">{SCHEME_LABELS[sc]}</Chip>}
                    {rec.rows.length > 0 && <Chip tone="slate">Veteran {rec.wins}-{rec.losses}</Chip>}
                  </div>
                  <div className="text-xs text-[var(--text-sec)]">
                    Age {c.age} · {coachOverall(c)} {marketRole === 'HC' ? 'OVR' : 'DEV'}
                    {marketRole === 'PDC' && ` · ${fmtPct(devCoachMultiplier(c.ratings.development, 21))} young-player growth`}
                  </div>
                  {fc && (
                    <div className="text-[11px] text-[var(--text-sec)] mt-0.5">
                      Roster fit: <span style={{ color: '#10b981' }}>{fc.great ?? 0} great</span> · <span style={{ color: '#84cc16' }}>{fc.good ?? 0} good</span> · {fc.neutral ?? 0} neutral · <span style={{ color: '#dc2626' }}>{fc.poor ?? 0} poor</span>
                    </div>
                  )}
                </div>
                {marketRole === 'HC' && (
                  <div className="hidden sm:flex gap-2 text-[10px] text-[var(--text-sec)]">
                    <span>OFF {c.ratings.offense}</span>
                    <span>DEF {c.ratings.defense}</span>
                    <span>DEV {c.ratings.development}</span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm tabular-nums font-semibold">{fmtMoney(coachMarketSalary(c, season))}/yr</span>
                  <Button variant="secondary" disabled={busy} onClick={() => setPendingHire(c)}>Hire</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <LeagueCoachesTable />

      <p className="mt-3 text-xs text-[var(--text-sec)]">Per-player scheme fit shows on the <Link href="/roster" className="font-semibold" style={{ color: 'var(--accent)' }}>Roster</Link>. Coaching salaries and dead money appear in <Link href="/finances" className="font-semibold" style={{ color: 'var(--accent)' }}>Finances</Link>.</p>

      {/* Hire confirmation */}
      <ConfirmModal
        open={!!pendingHire}
        onClose={() => setPendingHire(null)}
        title={pendingHire ? `Hire ${pendingHire.firstName} ${pendingHire.lastName}?` : ''}
        confirmLabel="Hire"
        loading={busy}
        onConfirm={() => void confirmHire()}
        body={pendingHire && (
          <div className="space-y-2">
            <p>{ROLE_LABELS[pendingHire.role as StaffRole]} · {fmtMoney(coachMarketSalary(pendingHire, season))}/yr on a standard multi-year deal starting {season}.</p>
            {hireIncumbent && hirePreview && (
              <p>
                This replaces <b>{hireIncumbent.firstName} {hireIncumbent.lastName}</b>.{' '}
                {hirePreview.total > 0
                  ? <>His remaining <b style={{ color: '#f59e0b' }}>{fmtMoney(hirePreview.total)}</b> becomes dead money ({hirePreview.byYear.map(y => `${y.season}: ${fmtMoney(y.amount)}`).join(', ')}).</>
                  : 'No dead money — his deal is not guaranteed past this season.'}
              </p>
            )}
          </div>
        )}
      />

      {/* Fire confirmation */}
      <ConfirmModal
        open={!!pendingFire}
        onClose={() => setPendingFire(null)}
        title={firing ? `Fire ${firing.firstName} ${firing.lastName}?` : ''}
        confirmLabel="Fire"
        tone="danger"
        loading={busy}
        onConfirm={() => void confirmFire()}
        body={firing && firingPreview && (
          <div className="space-y-2">
            <p>
              {firingPreview.total > 0
                ? <>You still owe <b style={{ color: '#f59e0b' }}>{fmtMoney(firingPreview.total)}</b> — it stays on the books as dead money ({firingPreview.byYear.map(y => `${y.season}: ${fmtMoney(y.amount)}`).join(', ')}).</>
                : 'No dead money — his deal is not guaranteed.'}
            </p>
            <p className="text-[var(--text-sec)]">
              {pendingFire === 'HC' ? 'An interim head coach takes over until you hire a replacement.' : 'The slot stays vacant (neutral development) until you hire.'}
              {' '}Coach money is an owner expense, not a cap charge.
            </p>
          </div>
        )}
      />

      {/* Extension */}
      <ConfirmModal
        open={!!extendFor}
        onClose={() => { setExtendFor(null); setExtResult(null); }}
        title={extCoach ? `Extend ${extCoach.firstName} ${extCoach.lastName}` : ''}
        confirmLabel={extResult?.accepted ? 'Done' : 'Offer extension'}
        loading={busy}
        onConfirm={() => (extResult?.accepted ? (setExtendFor(null), setExtResult(null)) : void submitExtension())}
        body={extCoach && extQuote && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-sec)]">Years</span>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => { setExtYears(n); setExtResult(null); }}
                  className="w-8 h-8 rounded-lg text-sm font-bold"
                  style={{ background: extYears === n ? 'var(--accent)' : 'var(--surface-2)', color: extYears === n ? '#fff' : 'var(--foreground)' }}>
                  {n}
                </button>
              ))}
            </div>
            <p>
              Asking <b>{fmtMoney(extQuote.terms.salary)}/yr</b> for {extQuote.terms.years} year{extQuote.terms.years > 1 ? 's' : ''},{' '}
              {extQuote.terms.startSeason}–{extQuote.terms.startSeason + extQuote.terms.years - 1}. <span className="text-[var(--text-sec)]">{extQuote.accepted ? extQuote.reason : ''}</span>
            </p>
            {!extQuote.accepted && <p style={{ color: '#dc2626' }}>{extQuote.reason}</p>}
            {extResult && (
              <p className="font-semibold" style={{ color: extResult.accepted ? '#10b981' : '#dc2626' }}>
                {extResult.accepted ? `Signed — under contract through ${extResult.terms.startSeason + extResult.terms.years - 1}.` : extResult.reason}
              </p>
            )}
          </div>
        )}
      />
    </Shell>
  );
}

function fmtPct(mult: number): string {
  const p = Math.round((mult - 1) * 100);
  return p === 0 ? '±0%' : `${p > 0 ? '+' : ''}${p}%`;
}

function CoachHeader({ coach, season, badge }: { coach: BaseCoach; season: number; badge: string }) {
  const end = contractEnd(coach);
  const left = yearsRemaining(coach, season);
  const interim = coachData(coach).interim;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white shrink-0" style={{ background: 'var(--accent)' }}>
        {coach.firstName[0]}{coach.lastName[0]}
      </div>
      <div className="min-w-0">
        <Link href={`/coach/${coach.id}`} className="text-lg font-bold hover:underline">{coach.firstName} {coach.lastName}</Link>
        {interim && <span className="ml-2"><Chip tone="amber">Interim</Chip></span>}
        <div className="text-sm text-[var(--text-sec)]">
          Age {coach.age} · {coachOverall(coach)} {coach.role === 'PDC' ? 'DEV' : 'OVR'} · {fmtMoney(coachSalary(coach, season))}/yr
          {end != null && ` · through ${end} (${left} yr${left === 1 ? '' : 's'} left)`}
        </div>
      </div>
      <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>
        {badge}
      </span>
    </div>
  );
}

function StaffActions({ coach, season, busy, onExtend, onFire }: { coach: BaseCoach; season: number; busy: boolean; onExtend: () => void; onFire: () => void }) {
  const interim = coachData(coach).interim;
  const dead = firePreview(coach, season).total;
  return (
    <div className="flex items-center gap-2">
      {!interim && <Button size="sm" variant="secondary" disabled={busy} onClick={onExtend}>Extend</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onFire} title={dead > 0 ? `${fmtMoney(dead)} dead money` : 'No dead money'}>Fire</Button>
    </div>
  );
}

function DevEffect({ rating }: { rating: number }) {
  const mult = devCoachMultiplier(rating, 21);
  const pct = (mult - 1) * 100;
  const color = pct > 2 ? '#10b981' : pct < -2 ? '#dc2626' : 'var(--text-sec)';
  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <RatingTile label="Development" value={rating} />
        <div className="text-sm">
          <div className="font-bold" style={{ color }}>{fmtPct(mult)} growth for under-25 players</div>
          <div className="text-xs text-[var(--text-sec)]">Applied each offseason, on top of the head coach and League Rules progression. 65 is neutral; the range is ±15%.</div>
        </div>
      </div>
    </div>
  );
}

type SortKey = 'team' | 'record' | 'rating' | 'contract' | 'salary';

function LeagueCoachesTable() {
  const { league } = useLeagueOrHydrate();
  const [sort, setSort] = useState<SortKey>('record');
  const [dir, setDir] = useState<1 | -1>(-1);
  const rows = useMemo(() => {
    if (!league) return [];
    const season = coachContractSeason(league);
    return league.teams.map(t => {
      const hc = getHeadCoach(league, t.id);
      const pdc = getDevCoach(league, t.id);
      const career = hc ? coachCareer(league, hc) : null;
      return {
        team: t as BasketballTeam,
        hc,
        pdc,
        wins: career?.wins ?? 0,
        losses: career?.losses ?? 0,
        pct: career && career.wins + career.losses > 0 ? career.pct : -1,
        titles: career?.titles ?? 0,
        rating: hc ? coachOverall(hc) : 0,
        end: hc ? contractEnd(hc) ?? 0 : 0,
        salary: hc ? coachSalary(hc, season) : 0,
      };
    });
  }, [league]);
  if (!league) return null;
  const sorted = [...rows].sort((a, b) => {
    const v = (r: typeof a) =>
      sort === 'team' ? `${r.team.city}` : sort === 'record' ? r.pct : sort === 'rating' ? r.rating : sort === 'contract' ? r.end : r.salary;
    const av = v(a), bv = v(b);
    return (typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * dir;
  });
  const head = (key: SortKey, label: string, cls = '') => (
    <th className={`px-2 py-2 font-semibold cursor-pointer select-none ${cls}`} onClick={() => { if (sort === key) setDir(d => (d === 1 ? -1 : 1)); else { setSort(key); setDir(key === 'team' ? 1 : -1); } }}>
      {label}{sort === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  return (
    <Card className="!p-0 overflow-hidden">
      <CardHeader className="px-4 pt-3"><CardTitle>League coaches</CardTitle><span className="text-xs text-[var(--text-sec)]">Click a column to sort</span></CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>
              {head('team', 'Team', 'pl-4')}
              <th className="px-2 py-2 font-semibold">Head coach</th>
              {head('record', 'Career W-L')}
              {head('rating', 'OVR', 'text-right')}
              {head('salary', 'Salary', 'text-right')}
              {head('contract', 'Through', 'text-right')}
              <th className="px-2 py-2 font-semibold text-right pr-4">Dev coach</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.team.id} className="border-t" style={{ borderColor: 'var(--border)', background: r.team.id === league.userTeamId ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}>
                <td className="px-2 py-1.5 pl-4">
                  <Link href={`/team/${r.team.id}`} className="flex items-center gap-1.5 font-semibold">
                    <TeamLogo abbreviation={r.team.abbreviation} primaryColor={r.team.primaryColor} secondaryColor={r.team.secondaryColor} size="xs" />
                    {r.team.abbreviation}
                  </Link>
                </td>
                <td className="px-2 py-1.5">
                  {r.hc ? <Link href={`/coach/${r.hc.id}`} className="hover:underline">{r.hc.firstName} {r.hc.lastName}</Link> : '—'}
                  {r.hc && coachData(r.hc).interim && <span className="ml-1 text-[10px] font-bold" style={{ color: '#f59e0b' }}>INT</span>}
                  {r.titles > 0 && <span className="ml-1 text-[10px]" title={`${r.titles} title${r.titles > 1 ? 's' : ''}`}>🏆{r.titles > 1 ? r.titles : ''}</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{r.wins + r.losses > 0 ? `${r.wins}-${r.losses}` : '—'}</td>
                <td className="px-2 py-1.5 tabular-nums text-right">{r.rating}</td>
                <td className="px-2 py-1.5 tabular-nums text-right">{fmtMoney(r.salary)}</td>
                <td className="px-2 py-1.5 tabular-nums text-right">{r.end || '—'}</td>
                <td className="px-2 py-1.5 tabular-nums text-right pr-4">
                  {r.pdc ? <Link href={`/coach/${r.pdc.id}`} className="hover:underline" title={`${r.pdc.firstName} ${r.pdc.lastName}`}>{r.pdc.ratings.development}</Link> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FitChip({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      {count} {label}
    </span>
  );
}

function RatingTile({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? '#10b981' : value >= 72 ? '#84cc16' : value >= 60 ? '#eab308' : '#f97316';
  return (
    <div className="p-2 rounded-lg text-center min-w-16" style={{ background: 'var(--surface-2)' }}>
      <div className="text-lg font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
