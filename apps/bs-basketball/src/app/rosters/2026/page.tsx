import Link from 'next/link';
import type { Metadata } from 'next';
import { CAP_TIER_LABEL, SITE, getLeague2026, money, type RosterTeam } from '@/lib/content/rosters2026';
import { Breadcrumbs, ContentFrame, JsonLd, PlayCta, breadcrumbJsonLd } from '@/components/content/ContentBits';

export const dynamic = 'force-static';

const DESCRIPTION =
  'All 30 basketball rosters for 2026-27 in BS Hoops: every team’s payroll, cap tier, average age, rotation strength and best players, with full depth charts, ratings and contracts.';

export const metadata: Metadata = {
  title: '2026-27 Basketball Rosters, Payrolls & Ratings — All 30 Teams',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/rosters/2026` },
  openGraph: { title: '2026-27 Basketball Rosters — All 30 Teams', description: DESCRIPTION, url: `${SITE}/rosters/2026` },
};

export default function Rosters2026Page() {
  const league = getLeague2026();
  const byConf = (c: string) => league.teams.filter(t => t.conference === c);
  const strongest = [...league.teams].sort((a, b) => a.strengthRank - b.strengthRank).slice(0, 5);
  const youngest = [...league.teams].sort((a, b) => a.avgAge - b.avgAge).slice(0, 5);
  const roomTeams = league.teams.filter(t => t.capTier === 'under-cap');
  const secondApron = league.teams.filter(t => t.capTier === 'second-apron');

  return (
    <ContentFrame wide>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: '2026-27 Basketball Rosters',
          url: `${SITE}/rosters/2026`,
          description: DESCRIPTION,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: league.teams.length,
            itemListElement: league.teams.map((t, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE}/rosters/2026/${t.slug}`,
              name: `${t.fullName} 2026-27 roster`,
            })),
          },
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', url: `${SITE}/` },
          { label: 'Rosters', url: `${SITE}/rosters` },
          { label: '2026-27', url: `${SITE}/rosters/2026` },
        ])}
      />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Rosters', href: '/rosters' }, { label: '2026-27' }]} />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          2026-27 Rosters: All 30 Teams
        </h1>
        <p className="text-[var(--text-sec)] text-lg leading-relaxed">
          {league.playerCount} rostered players, {league.starCount} of them rated 85 or higher, plus {league.freeAgentCount} unsigned
          free agents. Ratings, positions and contracts below are exactly what you get when you start a BS Hoops league from the real
          roster file — converted to the game’s 40-99 overall scale.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4 mb-10">
        <Stat label="Salary cap" value={money(league.cap)} />
        <Stat label="Luxury tax line" value={money(league.taxLine)} />
        <Stat label="First apron" value={money(league.firstApron)} />
        <Stat label="Second apron" value={money(league.secondApron)} />
      </section>

      <section className="grid gap-4 md:grid-cols-3 mb-10">
        <Callout title="Deepest rotations" note="Top-8 average OVR">
          {strongest.map(t => <TeamLine key={t.slug} t={t} value={t.top8.toFixed(1)} />)}
        </Callout>
        <Callout title="Youngest rosters" note="Average age">
          {youngest.map(t => <TeamLine key={t.slug} t={t} value={t.avgAge.toFixed(1)} />)}
        </Callout>
        <Callout title="Cap flexibility" note="Payroll">
          {roomTeams.map(t => <TeamLine key={t.slug} t={t} value={money(t.payroll)} />)}
          <p className="text-xs text-[var(--text-sec)] mt-2">
            {roomTeams.length} teams start under the cap; {secondApron.length} start above the second apron, where the Mid-Level is gone and trades must
            match salary 1-for-1. <Link href="/blog/salary-cap-aprons-and-exceptions" className="font-semibold text-[var(--accent)] hover:underline">How the aprons work →</Link>
          </p>
        </Callout>
      </section>

      {(['Eastern', 'Western'] as const).map(conf => (
        <section key={conf} className="mb-10">
          <h2 className="text-2xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>{conf} Conference</h2>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[var(--text-sec)] bg-[var(--muted)]">
                  <th className="px-3 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 font-semibold">Division</th>
                  <th className="px-3 py-2 font-semibold">2025-26</th>
                  <th className="px-3 py-2 font-semibold">Top-8 OVR</th>
                  <th className="px-3 py-2 font-semibold">Avg age</th>
                  <th className="px-3 py-2 font-semibold">Payroll</th>
                  <th className="px-3 py-2 font-semibold">Cap tier</th>
                  <th className="px-3 py-2 font-semibold">Best player</th>
                </tr>
              </thead>
              <tbody>
                {byConf(conf).map(t => {
                  const best = t.players[0];
                  return (
                    <tr key={t.slug} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <Link href={`/rosters/2026/${t.slug}`} className="inline-flex items-center gap-2 font-semibold hover:text-[var(--accent)]">
                          <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} aria-hidden />
                          {t.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-sec)]">{t.division}</td>
                      <td className="px-3 py-2 tabular-nums text-[var(--text-sec)]">{t.lastRecord ? `${t.lastRecord.won}-${t.lastRecord.lost}` : '—'}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{t.top8.toFixed(1)} <span className="text-[var(--text-sec)] font-normal">#{t.strengthRank}</span></td>
                      <td className="px-3 py-2 tabular-nums">{t.avgAge.toFixed(1)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(t.payroll)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{CAP_TIER_LABEL[t.capTier]}</td>
                      <td className="px-3 py-2">{best ? `${best.name} (${best.pos}, ${best.ovr})` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="max-w-3xl text-[15px] leading-relaxed space-y-3 text-[var(--foreground)]">
        <h2 className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)' }}>How to read these numbers</h2>
        <p>
          <strong>Top-8 OVR</strong> is the average overall of each team’s eight best players — the same rotation-quality measure the game’s AI uses
          to project where a team will finish when valuing its future draft picks. <strong>Cap tier</strong> is where 2026-27 payroll sits on the
          soft-cap ladder: under the cap, over it, in the tax, or past one of the two aprons. Each step up removes a tool, from cap-room signings to
          the Mid-Level Exception to flexible trade matching.
        </p>
        <p>
          Want to try one of these teams? <Link href="/rosters" className="font-semibold text-[var(--accent)] hover:underline">Load the real roster</Link> and
          pick a franchise, or read the <Link href="/blog/first-season-beginners-guide" className="font-semibold text-[var(--accent)] hover:underline">first-season guide</Link> first.
        </p>
      </section>

      <PlayCta
        title="Run any of these 30 front offices"
        body="Start a league from the real 2026 roster in one click — draft, trade, manage the cap and sim seasons, free in your browser."
        secondary={{ label: 'Load the real roster', href: '/rosters' }}
      />
    </ContentFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[var(--text-sec)]">{label}</div>
      <div className="text-2xl font-black tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{value}</div>
    </div>
  );
}

function Callout({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-[var(--text-sec)]">{note}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function TeamLine({ t, value }: { t: RosterTeam; value: string }) {
  return (
    <Link href={`/rosters/2026/${t.slug}`} className="flex items-center justify-between text-sm hover:text-[var(--accent)]">
      <span className="inline-flex items-center gap-2 min-w-0">
        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} aria-hidden />
        <span className="truncate">{t.fullName}</span>
      </span>
      <span className="tabular-nums font-semibold">{value}</span>
    </Link>
  );
}
