'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { fmtMoney } from '@/lib/dashboard/summary';
import {
  coachData, coachOverall, coachScheme, devCoachMultiplier, schemeDescription,
  SCHEME_LABELS, ROLE_LABELS, type StaffRole,
} from '@/lib/coaching/coaches';
import { coachContractSeason, coachMarketSalary, contractEnd, yearsRemaining } from '@/lib/coaching/contracts';
import { coachCareer, PLAYOFF_ROUND_LABEL } from '@/lib/coaching/career';
import type { BaseCoach } from '@bs/core/adapter';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /coach/[coachId] — a coach's profile: ratings, scheme, contract, career
 * record by season (W-L, playoff finish, titles, COY), and teams coached.
 */
export default function CoachPage() {
  const params = useParams<{ coachId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();

  const coach = useMemo<BaseCoach | null>(
    () => (league ? ((league.coaches as Record<string, BaseCoach>)[params.coachId] ?? null) : null),
    [league, params.coachId],
  );
  const teamById = useMemo(
    () => new Map(((league?.teams ?? []) as BasketballTeam[]).map(t => [t.id as string, t])),
    [league],
  );

  if (loading && !league) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!coach) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🧑‍🏫" title="Coach not found" message="This coach isn't in the league (market candidates only exist once hired)." />
        </div>
      </Shell>
    );
  }

  const role = (coach.role === 'PDC' ? 'PDC' : 'HC') as StaffRole;
  const data = coachData(coach);
  const career = coachCareer(league, coach);
  const team = coach.teamId ? teamById.get(coach.teamId) : undefined;
  const season = coachContractSeason(league);
  const end = contractEnd(coach);
  const scheme = role === 'HC' ? coachScheme(coach) : null;
  const status = data.retired ? 'Retired' : team ? `${team.city} ${team.name}` : 'Free agent';

  return (
    <Shell>
      {/* Header */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white shrink-0" style={{ background: team?.primaryColor ?? 'var(--accent)' }}>
            {coach.firstName[0]}{coach.lastName[0]}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>{coach.firstName} {coach.lastName}</h1>
            <div className="text-sm text-[var(--text-sec)] flex flex-wrap items-center gap-2 mt-0.5">
              <span>{ROLE_LABELS[role]}</span>·<span>Age {coach.age}</span>·
              {team ? (
                <Link href={`/team/${team.id}`} className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--accent)' }}>
                  <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
                  {team.city} {team.name}
                </Link>
              ) : <span>{status}</span>}
              {data.interim && <Chip tone="amber">Interim</Chip>}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{coachOverall(coach)}</div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">{role === 'HC' ? 'Overall' : 'Development'}</div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Ratings + scheme */}
        <Card>
          <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
          <div className="space-y-2">
            <Bar label="Offense" value={coach.ratings.offense} />
            <Bar label="Defense" value={coach.ratings.defense} />
            <Bar label="Development" value={coach.ratings.development} />
            <Bar label="Morale" value={coach.ratings.morale} />
          </div>
          {scheme ? (
            <p className="mt-3 text-sm">
              <span className="font-bold">{SCHEME_LABELS[scheme]}</span>{' '}
              <span className="text-[var(--text-sec)]">— {schemeDescription(scheme)}</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--text-sec)]">
              Under-25 growth: <span className="font-bold" style={{ color: 'var(--foreground)' }}>
                {(() => { const p = Math.round((devCoachMultiplier(coach.ratings.development, 21) - 1) * 100); return p === 0 ? '±0%' : `${p > 0 ? '+' : ''}${p}%`; })()}
              </span> per offseason.
            </p>
          )}
        </Card>

        {/* Contract */}
        <Card>
          <CardHeader><CardTitle>Contract</CardTitle></CardHeader>
          {coach.contract && end != null ? (
            <>
              <div className="text-sm text-[var(--text-sec)] mb-2">
                Through {end} · {yearsRemaining(coach, season)} year{yearsRemaining(coach, season) === 1 ? '' : 's'} left
                {coach.contract.years.some(y => !y.guaranteed) && ' · non-guaranteed'}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {coach.contract.years.map(y => (
                    <tr key={y.season} className="border-t" style={{ borderColor: 'var(--border)', opacity: y.season < season ? 0.5 : 1 }}>
                      <td className="py-1">{y.season}</td>
                      <td className="py-1 text-right tabular-nums font-semibold">{fmtMoney(y.baseSalary + y.proratedBonus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {coach.contract.modifications.length > 0 && (
                <ul className="mt-2 text-xs text-[var(--text-sec)] space-y-0.5">
                  {coach.contract.modifications.map((m, i) => <li key={i}>{m.date}: {m.description}</li>)}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--text-sec)]">
              {data.retired ? 'Retired.' : <>Unsigned. Market value about <b style={{ color: 'var(--foreground)' }}>{fmtMoney(coachMarketSalary(coach, season))}/yr</b>.</>}
            </p>
          )}
        </Card>
      </div>

      {/* Career summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <Stat label="Career W-L" value={career.wins + career.losses > 0 ? `${career.wins}-${career.losses}` : '—'} />
        <Stat label="Win %" value={career.wins + career.losses > 0 ? career.pct.toFixed(3).replace(/^0/, '') : '—'} />
        <Stat label="Playoffs" value={String(career.playoffApps)} />
        <Stat label="Titles" value={String(career.titles)} />
        <Stat label={role === 'HC' ? 'COY' : 'Seasons'} value={String(role === 'HC' ? career.coys : career.rows.length)} />
      </div>

      {/* By season */}
      <Card className="!p-0 overflow-hidden mb-4">
        <CardHeader className="px-4 pt-3"><CardTitle>Season by season</CardTitle></CardHeader>
        {career.rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-[var(--text-sec)]">No seasons coached in this league yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>
                  <th className="px-4 py-2 font-semibold">Season</th>
                  <th className="px-2 py-2 font-semibold">Team</th>
                  <th className="px-2 py-2 font-semibold text-right">W-L</th>
                  <th className="px-2 py-2 font-semibold text-right">Pct</th>
                  <th className="px-2 py-2 font-semibold pr-4">Playoffs</th>
                </tr>
              </thead>
              <tbody>
                {[...career.rows].reverse().map(r => {
                  const t = teamById.get(r.teamId);
                  const gp = r.wins + r.losses;
                  return (
                    <tr key={`${r.season}-${r.teamId}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 py-1.5 tabular-nums">{r.season}{r.live && <span className="ml-1 text-[10px] text-[var(--text-sec)]">(in progress)</span>}</td>
                      <td className="px-2 py-1.5">
                        {t ? (
                          <Link href={`/team/${t.id}`} className="inline-flex items-center gap-1.5 font-semibold">
                            <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />
                            {t.abbreviation}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-right">{r.wins}-{r.losses}</td>
                      <td className="px-2 py-1.5 tabular-nums text-right">{gp > 0 ? (r.wins / gp).toFixed(3).replace(/^0/, '') : '—'}</td>
                      <td className="px-2 py-1.5 pr-4">
                        <span className="text-[var(--text-sec)]">{r.live ? '' : PLAYOFF_ROUND_LABEL[r.playoffRound] ?? '—'}</span>
                        {r.champion && <span className="ml-1.5"><Chip tone="amber">🏆 Champion</Chip></span>}
                        {r.coy && <span className="ml-1.5"><Chip tone="violet">Coach of the Year</Chip></span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Teams coached */}
      {career.teams.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Teams coached</CardTitle></CardHeader>
          <ul className="space-y-1.5 text-sm">
            {career.teams.map((s, i) => {
              const t = teamById.get(s.teamId);
              return (
                <li key={`${s.teamId}-${i}`} className="flex items-center gap-2">
                  {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />}
                  <span className="font-semibold">{t ? `${t.city} ${t.name}` : 'Unknown team'}</span>
                  <span className="text-[var(--text-sec)]">{s.from === s.to ? s.from : `${s.from}–${s.to}`}</span>
                  <span className="ml-auto tabular-nums">{s.wins}-{s.losses}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="mt-3 text-xs text-[var(--text-sec)]">
        <Link href="/staff" className="font-semibold" style={{ color: 'var(--accent)' }}>Staff &amp; league coaches →</Link>
      </p>
    </Shell>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const color = value >= 85 ? '#10b981' : value >= 72 ? '#84cc16' : value >= 60 ? '#eab308' : '#f97316';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-[var(--text-sec)]">{label}</span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="w-8 text-right tabular-nums font-bold">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="text-xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-8">
      <Link href="/staff" className="text-sm font-semibold opacity-70 hover:opacity-100">← Staff</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
