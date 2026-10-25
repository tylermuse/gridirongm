import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE, getLeague2026, money, type RosterPlayer, type RosterTeam } from '@/lib/content/rosters2026';
import { Breadcrumbs, ContentFrame, JsonLd, PlayCta, breadcrumbJsonLd } from '@/components/content/ContentBits';

/**
 * /player-tiers — public tier pyramid of the 2026-27 player pool, built at
 * compile time from the same roster file as /rosters/2026. The Hoops answer to
 * BS Football's QB pyramid, which is that site's #2 organic landing page.
 */

export const dynamic = 'force-static';

const DESCRIPTION =
  'The top 60 basketball players of 2026-27 ranked into a six-tier pyramid by BS Hoops overall rating, plus the best five at every position and the top young players by potential.';

export const metadata: Metadata = {
  title: '2026-27 Basketball Player Tiers — The Top 60 Pyramid',
  description: DESCRIPTION,
  keywords: ['nba player tiers 2026', 'nba tier list', 'best nba players 2026-27', 'nba player rankings', 'basketball gm ratings'],
  alternates: { canonical: `${SITE}/player-tiers` },
  openGraph: { title: '2026-27 Basketball Player Tiers — The Top 60 Pyramid', description: DESCRIPTION, url: `${SITE}/player-tiers` },
};

/** Rank-based tiers, top to bottom. Sizes sum to 60. */
const TIERS = [
  { name: 'The Throne', blurb: 'The best player in the league.', size: 1 },
  { name: 'MVP Tier', blurb: 'Franchise-altering talents who can carry a team.', size: 3 },
  { name: 'All-League', blurb: 'Every contender wants one of these at the top of its rotation.', size: 6 },
  { name: 'All-Stars', blurb: 'No-doubt All-Star calibre.', size: 10 },
  { name: 'Borderline All-Stars', blurb: 'Elite starters a step from the top.', size: 15 },
  { name: 'Quality Starters', blurb: 'The players who turn a good team into a deep one.', size: 25 },
];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

type RankedPlayer = RosterPlayer & { team: RosterTeam };

function PlayerChip({ p, rank, big }: { p: RankedPlayer; rank: number; big?: boolean }) {
  return (
    <Link
      href={`/rosters/2026/${p.team.slug}`}
      className={`flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] transition-colors ${big ? 'px-4 py-3' : 'px-3 py-2'}`}
      style={{ borderLeft: `4px solid ${p.team.color}` }}
    >
      <span className="text-[11px] font-mono text-[var(--text-sec)] w-5 text-right">{rank}</span>
      <span className="min-w-0">
        <span className={`block font-bold leading-tight ${big ? 'text-base' : 'text-sm'}`}>{p.name}</span>
        <span className="block text-[11px] text-[var(--text-sec)]">{p.pos} · {p.team.abbrev} · {p.age}</span>
      </span>
      <span className={`ml-auto font-black tabular-nums ${big ? 'text-xl' : 'text-base'}`} style={{ color: 'var(--accent)' }}>{p.ovr}</span>
    </Link>
  );
}

export default function PlayerTiersPage() {
  const league = getLeague2026();
  const all: RankedPlayer[] = league.teams
    .flatMap(team => team.players.map(p => ({ ...p, team })))
    .sort((a, b) => b.ovr - a.ovr || b.pot - a.pot || a.age - b.age);

  let cursor = 0;
  const tiers = TIERS.map(t => {
    const players = all.slice(cursor, cursor + t.size).map((p, i) => ({ p, rank: cursor + i + 1 }));
    cursor += t.size;
    return { ...t, players };
  });
  const top = all.slice(0, cursor);

  const byPosition = POSITIONS.map(pos => ({ pos, players: all.filter(p => p.pos === pos).slice(0, 5) }));
  const risers = [...all].filter(p => p.age <= 22).sort((a, b) => b.pot - a.pot || b.ovr - a.ovr).slice(0, 10);
  const teamCounts = Object.entries(
    top.reduce<Record<string, { team: RosterTeam; n: number }>>((acc, p) => {
      (acc[p.team.slug] ??= { team: p.team, n: 0 }).n++;
      return acc;
    }, {}),
  ).map(([, v]) => v).sort((a, b) => b.n - a.n).slice(0, 5);

  return (
    <ContentFrame wide>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: '2026-27 Basketball Player Tiers',
          description: DESCRIPTION,
          url: `${SITE}/player-tiers`,
          numberOfItems: top.length,
          itemListElement: top.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: `${p.name} (${p.team.fullName}, ${p.ovr} OVR)`,
            url: `${SITE}/rosters/2026/${p.team.slug}`,
          })),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { label: 'Home', url: `${SITE}/` },
          { label: 'Player Tiers', url: `${SITE}/player-tiers` },
        ])}
      />
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Rosters', href: '/rosters/2026' }, { label: 'Player Tiers' }]} />

      <header className="mb-8 max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          2026-27 Player Tiers: The Top 60
        </h1>
        <p className="text-[var(--text-sec)] text-lg leading-relaxed">
          Every player in the 2026-27 pool ({league.playerCount.toLocaleString()} of them), ranked by BS Hoops overall rating and
          stacked into a six-tier pyramid. Ratings come from the same real-roster file you can import and play with —
          ties break on potential, then youth. Tap any player to see his team&apos;s full depth chart, cap sheet and contracts.
        </p>
      </header>

      <section aria-label="Tier pyramid" className="space-y-6">
        {tiers.map((tier, ti) => (
          <div key={tier.name}>
            <div className="text-center mb-2">
              <h2 className="text-lg font-black uppercase tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
                Tier {ti + 1}: {tier.name}
              </h2>
              <p className="text-xs text-[var(--text-sec)]">
                {tier.blurb} {tier.players.length > 0 && `${tier.players[tier.players.length - 1].p.ovr}–${tier.players[0].p.ovr} OVR`}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {tier.players.map(({ p, rank }) => (
                <div key={p.id} className={`w-full ${ti < 2 ? 'sm:w-[240px]' : 'sm:w-[200px]'}`}>
                  <PlayerChip p={p} rank={rank} big={ti < 2} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-black mb-1" style={{ fontFamily: 'var(--font-display)' }}>Best five at every position</h2>
        <p className="text-sm text-[var(--text-sec)] mb-4">Listed by primary position.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {byPosition.map(({ pos, players }) => (
            <div key={pos} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="font-black text-lg mb-2">{pos}</h3>
              <ol className="space-y-1.5">
                {players.map((p, i) => (
                  <li key={p.id} className="flex items-baseline gap-2 text-sm">
                    <span className="text-[var(--text-sec)] font-mono text-xs w-3">{i + 1}</span>
                    <Link href={`/rosters/2026/${p.team.slug}`} className="font-semibold hover:underline truncate">{p.name}</Link>
                    <span className="ml-auto font-bold tabular-nums">{p.ovr}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="text-2xl font-black mb-1" style={{ fontFamily: 'var(--font-display)' }}>Rising: best young players by potential</h2>
          <p className="text-sm text-[var(--text-sec)] mb-4">Age 22 and under. Potential (POT) is the rating a player is projected to grow toward.</p>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-sec)] text-xs uppercase">
                  <th className="px-3 py-2">Player</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2 text-right">OVR</th><th className="px-3 py-2 text-right">POT</th><th className="px-3 py-2 text-right">Salary</th>
                </tr>
              </thead>
              <tbody>
                {risers.map(p => (
                  <tr key={p.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{p.name} <span className="text-[var(--text-sec)] font-normal">{p.pos}</span></td>
                    <td className="px-3 py-2"><Link href={`/rosters/2026/${p.team.slug}`} className="hover:underline">{p.team.abbrev}</Link></td>
                    <td className="px-3 py-2">{p.age}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.ovr}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--accent)' }}>{p.pot}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(p.salary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black mb-1" style={{ fontFamily: 'var(--font-display)' }}>Most top-60 players</h2>
          <p className="text-sm text-[var(--text-sec)] mb-4">Where the talent is concentrated.</p>
          <ol className="space-y-2">
            {teamCounts.map(({ team, n }) => (
              <li key={team.slug}>
                <Link
                  href={`/rosters/2026/${team.slug}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 hover:border-[var(--accent)] transition-colors"
                  style={{ borderLeft: `4px solid ${team.color}` }}
                >
                  <span className="font-semibold">{team.fullName}</span>
                  <span className="font-black tabular-nums">{n}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <PlayCta
        title="Think the ratings are wrong? Prove it."
        body="Import the real 2026-27 rosters into BS Hoops, trade for the players you believe in, and sim the season. Free, in your browser, no account needed."
        secondary={{ label: 'Browse all 30 rosters', href: '/rosters/2026' }}
      />
    </ContentFrame>
  );
}
