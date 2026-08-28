import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About BS Football — Our Story and Mission',
  description:
    'BS Football is a free, browser-based football management game built by an independent team. Learn who we are, why we built it, and what makes it different.',
  alternates: { canonical: 'https://bs-football.com/about' },
};

const PROSE = `prose prose-gray prose-lg max-w-none
  prose-headings:font-bold prose-headings:text-gray-900
  prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
  prose-p:text-gray-700 prose-p:leading-relaxed
  prose-li:text-gray-700
  prose-strong:text-gray-900
  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline`;

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">About</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">About BS Football</h1>
      <p className="text-lg text-gray-600 mb-10">
        A free, modern football management game you can play right in your browser.
      </p>

      <div className={PROSE}>
        <h2>What BS Football Is</h2>
        <p>
          BS Football is a browser-based American football management simulation. You take control of a franchise as
          its general manager: draft rookies, scout talent, manage the salary cap, make trades, sign free agents,
          and sim season after season as you chase a championship and build a dynasty. There is nothing to download
          and nothing to install &mdash; you can be drafting your first roster within about a minute of loading the
          page.
        </p>

        <h2>Why We Built It</h2>
        <p>
          We are lifelong fans of football and of management sims. Over the years we played the text-based classics,
          the spreadsheet-heavy desktop games, and the big-budget console franchise modes &mdash; and we always felt
          the same tension: the deepest games were clunky or expensive, and the most polished games were shallow
          when it came to the GM decisions we actually cared about. We built BS Football to close that gap: a game
          with genuine roster-building depth &mdash; three-tier scouting, real salary-cap math, multi-season dynasty
          planning &mdash; wrapped in a clean, fast, modern interface that runs anywhere.
        </p>

        <h2>What Makes It Different</h2>
        <ul>
          <li><strong>Deep, honest GM decisions.</strong> Scouting has uncertainty, the cap is unforgiving, and every draft pick and contract matters across seasons.</li>
          <li><strong>A living league.</strong> All teams are simulated with their own strategies, so the world around your franchise keeps evolving.</li>
          <li><strong>Dynamic storytelling.</strong> Our news desk and podcast segments generate fresh headlines and commentary based on what actually happens in your league, so no two seasons read the same way.</li>
          <li><strong>Free and accessible.</strong> The core game is free and runs in any modern browser on desktop or mobile. An optional Premium subscription supports development and unlocks extra features.</li>
        </ul>

        <h2>Who We Are</h2>
        <p>
          BS Football is operated by <strong>BS Sports GM LLC</strong>, an independent studio. We are a small team
          that ships improvements constantly &mdash; new features, balance changes, and fixes land regularly, very
          often in direct response to feedback from our players. This is a game built in the open, with its
          community.
        </p>

        <h2>Join the Community</h2>
        <p>
          The best way to shape where BS Football goes next is to jump into our{' '}
          <a href="https://discord.gg/RMtusS2GKW" target="_blank" rel="noopener noreferrer">Discord community</a>,
          where players share strategies, report bugs, and request features. You can also reach us any time at{' '}
          <a href="mailto:support@bs-football.com">support@bs-football.com</a>.
        </p>
      </div>

      <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Ready to build your dynasty?</h2>
        <p className="text-gray-600 mb-5">BS Football is free, runs in your browser, and you&apos;ll be drafting in 60 seconds.</p>
        <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          Play Now — It&apos;s Free
        </Link>
      </div>
    </div>
  );
}
