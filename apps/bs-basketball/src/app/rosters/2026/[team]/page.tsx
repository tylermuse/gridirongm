import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  CAP_TIER_LABEL,
  SITE,
  getLeague2026,
  getTeam2026,
  money,
  teamOutlook,
} from '@/lib/content/rosters2026';
import { Breadcrumbs, ContentFrame, JsonLd, PlayCta, breadcrumbJsonLd } from '@/components/content/ContentBits';

export const dynamicParams = false;

interface Props {
  params: Promise<{ team: string }>;
}

export function generateStaticParams() {
  return getLeague2026().teams.map(t => ({ team: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team } = await params;
  const t = getTeam2026(team);
  if (!t) return {};
  const lead = t.players.slice(0, 2).map(p => p.name).join(' and ');
  const title = `${t.fullName} 2026-27 Roster, Ratings & Payroll`;
  const description = `The ${t.fullName} 2026-27 roster in BS Hoops: ${t.players.length} players led by ${lead}, with overall and potential ratings, ages, contracts, a ${money(t.payroll)} payroll and cap outlook.`;
  const url = `${SITE}/rosters/2026/${t.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

export default async function TeamRosterPage({ params }: Props) {
  const { team } = await params;
  const t = getTeam2026(team);
  if (!t) notFound();

  const url = `${SITE}/rosters/2026/${t.slug}`;
  const outlook = teamOutlook(t);
  const conf = getLeague2026().teams.filter(x => x.conference === t.conference && x.slug !== t.slug);
  const leaders = t.players.slice(0, 3);
  const capPct = Math.min(100, (t.payroll / t.secondApron) * 100);
  const mark = (n: number) => `${Math.min(100, (n / t.secondApron) * 100)}%`;

  return (
    <ContentFrame wide>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SportsTeam',
          name: t.fullName,
          sport: 'Basketball',
          url,
          memberOf: { '@type': 'SportsOrganization', name: `${t.conference} Conference (BS Hoops simulation)` },
          athlete: t.players.map(p => ({ '@type': 'Person', name: p.name })),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', url: `${SITE}/` },
          { label: 'Rosters', url: `${SITE}/rosters` },
          { label: '2026-27', url: `${SITE}/rosters/2026` },
          { label: t.fullName, url },
        ])}
      />
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Rosters', href: '/rosters' },
          { label: '2026-27', href: '/rosters/2026' },
          { label: t.fullName },
        ]}
      />

      <header className="flex items-center gap-4 mb-4">
        <span className="inline-block h-12 w-12 rounded-xl shrink-0 border border-[var(--border)]" style={{ background: t.color }} aria-hidden />
        <div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {t.fullName} 2026-27 Roster
          </h1>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            {t.conference} Conference · {t.division} Division{t.lastRecord ? ` · ${t.lastRecord.won}-${t.lastRecord.lost} in 2025-26` : ''}
          </p>
        </div>
      </header>

      <p className="text-lg text-[var(--text-sec)] max-w-3xl mb-8 leading-relaxed">
        {t.players.length} players, led by{' '}
        {leaders.map((p, i) => (
          <span key={p.id}>
            {i > 0 ? (i === leaders.length - 1 ? ' and ' : ', ') : ''}
            <strong className="text-[var(--foreground)]">{p.name}</strong> ({p.pos}, {p.ovr} OVR)
          </span>
        ))}
        . Ratings and contracts match what you get when you start a BS Hoops league from the real roster.
      </p>

      <section className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
        <Stat label="Payroll" value={money(t.payroll)} sub={CAP_TIER_LABEL[t.capTier]} />
        <Stat label="Top-8 OVR" value={t.top8.toFixed(1)} sub={`#${t.strengthRank} of 30`} />
        <Stat label="Average age" value={t.avgAge.toFixed(1)} sub={`${t.players.filter(p => p.age <= 23).length} players 23 or younger`} />
        <Stat label="Expiring salary" value={money(t.expiringMoney)} sub="after 2026-27" />
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 mb-8">
        <div className="flex justify-between text-xs text-[var(--text-sec)] mb-1.5">
          <span>Payroll vs. the cap ladder</span>
          <span className="tabular-nums">{money(t.payroll)}</span>
        </div>
        <div className="relative h-3 rounded-full bg-[var(--surface-2)]" role="img" aria-label={`Payroll ${money(t.payroll)}; cap ${money(t.cap)}; tax ${money(t.taxLine)}; aprons ${money(t.firstApron)} and ${money(t.secondApron)}`}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${capPct}%`, background: 'var(--accent)' }} />
          {[t.cap, t.taxLine, t.firstApron].map(n => (
            <span key={n} className="absolute -top-1 -bottom-1 w-px bg-[var(--foreground)]/50" style={{ left: mark(n) }} />
          ))}
        </div>
        <div className="relative h-4 mt-1 text-[10px] text-[var(--text-sec)] hidden sm:block">
          <span className="absolute -translate-x-1/2" style={{ left: mark(t.cap) }}>Cap</span>
          <span className="absolute -translate-x-1/2" style={{ left: mark(t.taxLine) }}>Tax</span>
          <span className="absolute -translate-x-1/2" style={{ left: mark(t.firstApron) }}>1st</span>
          <span className="absolute right-0">2nd apron</span>
        </div>
      </section>

      <section className="mb-10 max-w-3xl">
        <h2 className="text-2xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>Front office outlook</h2>
        <ul className="list-disc pl-5 space-y-2 text-[15px] leading-relaxed">
          {outlook.map(line => <li key={line}>{line}</li>)}
        </ul>
        {(t.picksIn.length > 0 || t.picksOut.length > 0) && (
          <p className="text-sm text-[var(--text-sec)] mt-3">
            {t.picksIn.length > 0 && <>Owns: {t.picksIn.join(', ')}. </>}
            {t.picksOut.length > 0 && <>Owes: {t.picksOut.join(', ')}.</>}
          </p>
        )}
      </section>

      <section className="mb-4">
        <h2 className="text-2xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>Full roster</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-[var(--text-sec)] bg-[var(--muted)]">
                <th className="px-3 py-2 font-semibold">Player</th>
                <th className="px-3 py-2 font-semibold">Pos</th>
                <th className="px-3 py-2 font-semibold">Age</th>
                <th className="px-3 py-2 font-semibold">Ht</th>
                <th className="px-3 py-2 font-semibold" title="Overall rating">OVR</th>
                <th className="px-3 py-2 font-semibold" title="Potential">POT</th>
                <th className="px-3 py-2 font-semibold" title="Three-point">3PT</th>
                <th className="px-3 py-2 font-semibold" title="Finishing">FIN</th>
                <th className="px-3 py-2 font-semibold" title="Passing">PAS</th>
                <th className="px-3 py-2 font-semibold" title="Defense (perimeter + interior)">DEF</th>
                <th className="px-3 py-2 font-semibold" title="Rebounding">REB</th>
                <th className="px-3 py-2 font-semibold">2026-27 salary</th>
                <th className="px-3 py-2 font-semibold">Through</th>
              </tr>
            </thead>
            <tbody>
              {t.players.map(p => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.isRookie && <span className="ml-1.5 text-[10px] font-bold uppercase text-[var(--accent)]">Rookie</span>}
                    {p.injury && <span className="ml-1.5 text-[10px] font-semibold text-red-600">{p.injury}</span>}
                    <div className="text-[11px] text-[var(--text-sec)]">{[p.college, p.draft ? `Drafted ${p.draft}` : null].filter(Boolean).join(' · ') || 'Undrafted'}</div>
                  </td>
                  <td className="px-3 py-2">{p.pos}{p.secondaryPos ? `/${p.secondaryPos}` : ''}</td>
                  <td className="px-3 py-2 tabular-nums">{p.age}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-sec)]">{p.height}</td>
                  <td className="px-3 py-2 tabular-nums font-bold">{p.ovr}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-sec)]">{p.pot}</td>
                  <td className="px-3 py-2 tabular-nums">{p.threePoint}</td>
                  <td className="px-3 py-2 tabular-nums">{p.finishing}</td>
                  <td className="px-3 py-2 tabular-nums">{p.passing}</td>
                  <td className="px-3 py-2 tabular-nums">{p.defense}</td>
                  <td className="px-3 py-2 tabular-nums">{p.rebounding}</td>
                  <td className="px-3 py-2 tabular-nums">{money(p.salary)}</td>
                  <td className="px-3 py-2 tabular-nums text-[var(--text-sec)]">{p.through ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-sec)] mt-2">
          Overall and potential use the BS Hoops 40-99 scale. Contracts are rounded to the nearest $100K. Player names belong to the real players;
          ratings are this simulation’s own estimates.
        </p>
      </section>

      <PlayCta
        title={`Take over the ${t.name}`}
        body={`Load the real 2026 roster, pick the ${t.fullName}, and run the cap, the draft and the rotation yourself — free, in your browser.`}
        secondary={{ label: 'Load the real roster', href: '/rosters' }}
      />

      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-sec)] mb-3">Other {t.conference} Conference rosters</h2>
        <div className="flex flex-wrap gap-2">
          {conf.map(x => (
            <Link
              key={x.slug}
              href={`/rosters/2026/${x.slug}`}
              className="text-sm px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {x.fullName}
            </Link>
          ))}
          <Link href="/rosters/2026" className="text-sm px-3 py-1.5 rounded-full font-semibold text-[var(--accent)]">All 30 teams →</Link>
        </div>
      </section>
    </ContentFrame>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-sec)]">{label}</div>
      <div className="text-2xl font-black tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
      <div className="text-xs text-[var(--text-sec)]">{sub}</div>
    </div>
  );
}
