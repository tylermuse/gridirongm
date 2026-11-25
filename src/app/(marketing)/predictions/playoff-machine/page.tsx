import Link from 'next/link';
import type { Metadata } from 'next';
import { getNflOdds } from '@/lib/predictions/nflOdds';
import { teamSlug } from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import PlayoffMachine, { type PlayoffMachineTeam } from '@/components/predictions/PlayoffMachine';
import type { MachineGame } from '@/lib/predictions/playoffMachine';

/**
 * /predictions/playoff-machine — pick winners for the rest of the NFL season
 * and re-simulate playoff odds in the browser. Uses the same weekly build-time
 * data as /predictions (game win probabilities + team ratings from nflOdds.ts);
 * the simulation itself runs client-side (src/lib/predictions/playoffMachine.ts).
 * Scenarios are shareable: ?p=13BUF.14KC (week + winner) & ?team=buf.
 */

export const dynamic = 'force-static';

const URL = 'https://bs-football.com/predictions/playoff-machine';

export async function generateMetadata(): Promise<Metadata> {
  const odds = await getNflOdds();
  const title = `NFL Playoff Machine ${odds.season}: Pick the Winners, See Your Team's Playoff Odds`;
  const description = `Pick winners for the remaining ${odds.season} NFL games and instantly re-simulate every team's playoff, division, #1 seed and Super Bowl odds. Free, updated every week, shareable scenarios.`;
  return {
    title: `${title} | BS Football`,
    description,
    keywords: ['nfl playoff machine', 'nfl playoff simulator', 'nfl playoff scenarios', 'playoff picture simulator', 'can my team make the playoffs', `nfl playoff machine ${odds.season}`],
    alternates: { canonical: URL },
    openGraph: { title, description, url: URL, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PlayoffMachinePage() {
  const odds = await getNflOdds();
  const colors = new Map(getMockDraftData().teams.map((t) => [t.abbrev, t.colors[0] ?? '']));
  const teams: PlayoffMachineTeam[] = odds.teams.map((t) => ({
    abbrev: t.abbrev,
    city: t.city,
    name: t.name,
    conference: t.conference,
    division: t.division,
    rating: t.rating,
    slug: teamSlug(t),
    color: colors.get(t.abbrev) ?? '',
  }));
  const games: MachineGame[] = (odds.games ?? []).map((g) => ({
    week: g.week, date: g.date, home: g.home, away: g.away, neutral: g.neutral,
    done: g.done, homePts: g.homePts, awayPts: g.awayPts, homeWinProb: g.homeWinProb,
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'BS Football', item: 'https://bs-football.com' },
          { '@type': 'ListItem', position: 2, name: 'NFL Playoff Odds', item: 'https://bs-football.com/predictions' },
          { '@type': 'ListItem', position: 3, name: 'NFL Playoff Machine', item: URL },
        ],
      },
      {
        '@type': 'WebApplication',
        name: `NFL Playoff Machine ${odds.season}`,
        url: URL,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        dateModified: odds.generatedAt,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <article className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/predictions" className="hover:text-gray-700">NFL Playoff Odds</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Playoff Machine</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-3">NFL Playoff Machine {odds.season}</h1>
        <p className="text-lg text-gray-700 max-w-3xl mb-2">
          Pick the winners of any of the {odds.remainingGames} games left, and we re-simulate the rest of the season on the spot. You&apos;ll see
          every team&apos;s playoff, division, #1 seed and Super Bowl chances under your scenario.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Week {odds.week} edition · real results and schedule, updated every Tuesday · <Link href="/predictions" className="text-blue-600 hover:underline">see the no-picks odds</Link>
        </p>

        {games.length ? (
          <PlayoffMachine teams={teams} games={games} />
        ) : (
          <p className="text-gray-600">The schedule is updating. Check back shortly, or see the <Link href="/predictions" className="text-blue-600 hover:underline">current playoff odds</Link>.</p>
        )}

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Don&apos;t like how it plays out? Run the team yourself.</h2>
          <p className="text-gray-600 mb-5">Take over any NFL team with its real, current roster. Make the trades, set the lineup and play out the rest of the season, in 3D if you want. Free, in your browser.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Take Over a Team — It&apos;s Free
          </Link>
        </div>

        <section className="mt-12 max-w-3xl prose prose-gray prose-p:text-gray-700 prose-li:text-gray-700 prose-headings:text-gray-900">
          <h2>How the playoff machine works</h2>
          <p>
            Every game you pick is locked in. Every game you leave open is simulated using the same win chances as our{' '}
            <Link href="/predictions">weekly NFL playoff odds</Link>. Those chances come from BS Football&apos;s player ratings for each team&apos;s
            healthy starters, blended with each team&apos;s real point differential. We then play out the rest of the season{' '}
            {(2000).toLocaleString('en-US')} times in your browser and count how often each team gets in.
          </p>
          <ul>
            <li><strong>Seeding</strong> follows the NFL format: four division winners and three wild cards per conference. The #1 seed gets a bye, and the bracket reseeds after the wild-card round.</li>
            <li><strong>Tiebreakers are simplified:</strong> win percentage, then head-to-head, then division record (for division rivals), then conference record, then a coin flip. The NFL&apos;s full procedure has more steps, so razor-thin races can differ.</li>
            <li><strong>Playoff games</strong> use each team&apos;s current strength, with about two points for home field. The Super Bowl is neutral.</li>
            <li>A team at 100% or 0% got in, or missed, in every one of your simulated seasons. That doesn&apos;t mean it has officially clinched or been eliminated.</li>
          </ul>

          <h2>Frequently asked questions</h2>
          <h3>Can I share my scenario?</h3>
          <p>Yes. Your picks are saved in the page address as you go. Hit <strong>Share scenario</strong> to copy the link, and anyone who opens it sees the same picks.</p>
          <h3>What does &quot;Win out&quot; do?</h3>
          <p>Pick your team, then <strong>Win out</strong> marks them as the winner of every game they have left, so you can see if that gets them in.</p>
          <h3>How is this different from the playoff odds page?</h3>
          <p>
            The <Link href="/predictions">playoff odds page</Link> is our straight forecast with no picks, run 10,000 times. Each team also has its own page, like the{' '}
            <Link href={`/predictions/${teams[0]?.slug ?? ''}`}>{teams[0]?.city} {teams[0]?.name} playoff chances</Link>. The playoff machine starts from the same forecast and lets you change the results.
          </p>
        </section>

        <p className="mt-10 text-xs text-gray-400 max-w-3xl">
          BS Football is an independent simulation and is not affiliated with or endorsed by the National Football League. For fun, not betting advice.
        </p>
      </article>
    </>
  );
}
