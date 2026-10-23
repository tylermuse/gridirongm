import Link from 'next/link';
import { getPublishedPosts } from '@/lib/content/posts';

/**
 * Server-rendered "what is BS Hoops" section for the homepage. Passed into the
 * client HomeApp as a slot and shown only on the pre-league splash (below the
 * team picker), so it's real crawlable HTML for search engines without adding
 * anything to the in-league dashboard.
 */

const FEATURES: [string, string][] = [
  ['Possession-by-possession sim', 'Every game is simulated one possession at a time — shot selection, turnovers, rebounds and fouls — and you can watch your own games live with a shot chart, win probability and game flow.'],
  ['A real soft cap', 'A $165M cap, a luxury tax, two aprons, Bird rights, the Mid-Level and Bi-Annual exceptions, and salary matching in trades. Every rung of the ladder removes a tool.'],
  ['Draft lottery & scouting', 'A 14-team lottery with flattened odds, eight scouts per draft to reveal hidden potential, and boom-or-bust development that makes every class a gamble.'],
  ['Trades with pick protections', 'Deal players and picks with 29 AI front offices that value youth, contracts and fit differently depending on whether they are rebuilding or chasing a title.'],
  ['Rotations that matter', 'Your bench order decides who plays and how many minutes they get. Game plans change pace, shot profile and defensive pressure.'],
  ['Seasons that carry forward', 'Players age and develop every offseason, ownership judges your results, and awards, records and franchise history accumulate over a long save.'],
];

export default function HomeIntro() {
  const posts = getPublishedPosts().slice(0, 3);
  return (
    <section aria-labelledby="home-intro-title" className="w-full border-t border-[var(--border)] bg-[var(--surface)] mt-4">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12">
        <h2 id="home-intro-title" className="text-3xl sm:text-4xl font-black tracking-tight mb-3" style={{ fontFamily: 'var(--font-display)' }}>
          A free basketball GM game that runs in your browser
        </h2>
        <p className="text-[var(--text-sec)] text-base sm:text-lg leading-relaxed max-w-3xl mb-8">
          BS Hoops puts you in charge of a 30-team basketball league as general manager. Draft prospects, trade for stars, sign free
          agents under a realistic soft cap, set your rotation, and sim season after season chasing a banner. There is nothing to
          download and no account needed — your league saves in your browser, and you can sign in to sync it across devices.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
              <h3 className="font-bold mb-1.5">{title}</h3>
              <p className="text-sm text-[var(--text-sec)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-8 md:grid-cols-2 mb-10">
          <div>
            <h2 className="text-xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>How to start</h2>
            <ol className="list-decimal pl-5 space-y-2 text-[15px] leading-relaxed">
              <li><strong>Pick a franchise</strong> above to start a generated league, or <Link href="/rosters" className="font-semibold text-[var(--accent)] hover:underline">import the real roster</Link> to play with real players and contracts.</li>
              <li><strong>Check your cap sheet</strong> in Finances — are you under the cap, in the tax, or past an apron?</li>
              <li><strong>Set your rotation</strong>: five starters, then your best five reserves in bench slots one through five.</li>
              <li><strong>Sim, adjust, decide</strong> — buyer or seller by the trade deadline, then the lottery, draft and free agency.</li>
            </ol>
          </div>
          <div>
            <h2 className="text-xl font-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>Strategy guides</h2>
            <ul className="space-y-2">
              {posts.map(p => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="font-semibold hover:text-[var(--accent)]">{p.title}</Link>
                </li>
              ))}
            </ul>
            <Link href="/blog" className="inline-block mt-3 text-sm font-semibold text-[var(--accent)] hover:underline">All guides →</Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ['/rosters/2026', '2026-27 team rosters'],
            ['/blog', 'Strategy blog'],
            ['/rosters', 'Roster files & import'],
            ['/about', 'About BS Hoops'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
