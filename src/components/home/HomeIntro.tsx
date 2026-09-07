import Link from 'next/link';

/**
 * Server-rendered content section for the homepage. Renders real, crawlable
 * HTML below the interactive game (which is client-rendered). This is what
 * gives "/" genuine content for search engines and the AdSense reviewer,
 * without changing the player experience above it.
 */
export default function HomeIntro() {
  return (
    <section className="border-t border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
          A free football GM game you can play in your browser
        </h2>
        <p className="text-lg text-gray-700 leading-relaxed max-w-3xl mb-8">
          BS Football is a browser-based American football management simulator. You take over a franchise
          as its general manager — draft rookies, scout prospects, negotiate contracts under a real salary
          cap, make trades, and sim season after season chasing a championship and building a dynasty. It is
          free, runs on desktop and mobile, and needs no download. You can be drafting your first roster in
          about a minute.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          {[
            ['Deep scouting & the draft', 'A three-tier scouting system means prospects carry real uncertainty. Invest scouting to unlock Deep Scout reports, then live with your picks as they develop or bust over the years.'],
            ['A real salary cap', 'A hard cap with dead-cap penalties makes every contract a trade-off. Overpay a free agent and feel it for seasons; cheap rookie deals are your most valuable assets.'],
            ['Trades & free agency', 'Negotiate with 31 AI front offices, work the trade market, and rebuild through free agency — each team runs its own strategy, so the league keeps evolving around you.'],
            ['Live game simulation', 'Sim a full season in minutes or watch drive-by-drive play-by-play, with box scores tracking passing, rushing, receiving, and defense.'],
            ['Multi-season dynasty', 'Player development, aging curves, awards, and full franchise history carry forward. Win now or tank and rebuild — the long game is the point.'],
            ['Historical & current rosters', 'Start from the current NFL rosters or jump into a historical era, all with authentic player identities and era-scaled caps.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border border-gray-200 p-5">
              <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-4">Explore BS Football</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/rosters/2026" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
            Browse 2026 team rosters
          </Link>
          <Link href="/rosters" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
            Roster downloads &amp; eras
          </Link>
          <Link href="/blog" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
            Strategy guides &amp; blog
          </Link>
          <Link href="/pricing" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
            Pricing &amp; Premium
          </Link>
          <Link href="/about" className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
            About
          </Link>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2">
          {[
            ['About', '/about'], ['Contact', '/contact'], ['Privacy Policy', '/privacy'],
            ['Terms of Service', '/terms'], ['Blog', '/blog'], ['Team Rosters', '/rosters/2026'],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-6 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} BS Sports GM LLC. BS Football is an independent football simulation
          and is not affiliated with or endorsed by the National Football League.
        </p>
      </div>
    </section>
  );
}
