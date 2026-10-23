import Link from 'next/link';
import type { Metadata } from 'next';
import { LegalPage, COMPANY, CONTACT_EMAIL, SITE } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'About',
  description:
    'BS Hoops is a free browser-based basketball GM game: draft, trade, sign free agents, and simulate seasons possession by possession. No download, no account required.',
  alternates: { canonical: `${SITE}/about` },
};

export default function AboutPage() {
  return (
    <LegalPage title="About BS Hoops">
      <p>
        <strong>BS Hoops</strong> is a free basketball general-manager game that runs in your browser. Pick one of 30
        franchises and run it: build the roster, manage the cap, and live with the results season after season.
      </p>

      <h2>What you do</h2>
      <ul>
        <li><strong>Draft</strong> — scout prospects, ride the lottery, and trade picks on draft night.</li>
        <li><strong>Trade</strong> — build deals with salary matching, pick protections, and a trade finder.</li>
        <li><strong>Free agency</strong> — bid against AI teams using Bird rights and cap exceptions.</li>
        <li><strong>Coach the rotation</strong> — set starters and bench order, and watch minutes follow.</li>
        <li>
          <strong>Watch games live</strong> — every game is simulated possession by possession; watch yours with a shot
          chart, win probability, and game flow, or replay recent games from the box score.
        </li>
        <li><strong>Build a legacy</strong> — awards, playoff runs, franchise history, and owner approval.</li>
      </ul>

      <h2>Play now</h2>
      <p>
        No download and no account required — <Link href="/">start a league</Link> or{' '}
        <Link href="/rosters">import a real roster</Link>. Sign in to sync saves across devices.
      </p>

      <h2>Who makes it</h2>
      <p>
        BS Hoops is built by {COMPANY}, the team behind <a href="https://bs-football.com">BS Football</a>. Feature ideas
        and bug reports come straight from the community on Discord. Reach us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p className="text-sm">
        BS Hoops is a parody and simulation, not affiliated with the NBA or any team or player.
      </p>
    </LegalPage>
  );
}
