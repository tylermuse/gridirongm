import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — BS Football',
  description:
    'The terms and conditions for using BS Football, a free browser-based football management game with an optional Premium subscription.',
  alternates: { canonical: 'https://bs-football.com/terms' },
};

const COMPANY = 'BS Sports GM LLC';
const STATE = 'Texas';
const CONTACT_EMAIL = 'support@bs-football.com';
const LAST_UPDATED = 'August 28, 2026';

const PROSE = `prose prose-gray prose-lg max-w-none
  prose-headings:font-bold prose-headings:text-gray-900
  prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
  prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
  prose-p:text-gray-700 prose-p:leading-relaxed
  prose-li:text-gray-700
  prose-strong:text-gray-900
  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline`;

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Terms of Service</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

      <div className={PROSE}>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of <strong>bs-football.com</strong>{' '}
          and the BS Football game and related pages (the &ldquo;Service&rdquo;), operated by {COMPANY}
          (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using the Service, you agree to
          be bound by these Terms. If you do not agree, please do not use the Service.
        </p>

        <h2>The Service</h2>
        <p>
          BS Football is a browser-based football management simulation game. The teams, players, simulations, and
          related content are a work of fiction and simulation. BS Football is an independent product and is not
          affiliated with, endorsed by, or sponsored by the National Football League (NFL), any professional sports
          league, team, or player, or any other football management game.
        </p>

        <h2>Accounts</h2>
        <p>
          Some features require an account. You are responsible for maintaining the confidentiality of your login
          credentials and for all activity under your account. You agree to provide accurate information and to
          notify us promptly of any unauthorized use. You must be at least 13 years old to create an account.
        </p>

        <h2>Premium Subscriptions</h2>
        <ul>
          <li>
            The core game is free to play. We also offer an optional paid <strong>Premium</strong> subscription with
            additional features, billed through our payment processor, Stripe.
          </li>
          <li>
            Subscriptions renew automatically for the applicable billing period unless canceled before the renewal
            date. You can cancel at any time, and cancellation takes effect at the end of the current billing period.
          </li>
          <li>
            Except where required by law, payments are non-refundable. Prices and features may change; we will give
            reasonable notice of material changes.
          </li>
        </ul>

        <h2>Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Reverse engineer, scrape, or attempt to disrupt or gain unauthorized access to the Service.</li>
          <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
          <li>Resell, redistribute, or commercially exploit the Service without our written permission.</li>
          <li>Interfere with advertising, security features, or other users&rsquo; use of the Service.</li>
        </ul>

        <h2>Intellectual Property</h2>
        <p>
          The Service, including its software, design, text, and branding, is owned by {COMPANY} and protected by
          intellectual property laws. We grant you a limited, non-exclusive, non-transferable license to use the
          Service for personal, non-commercial entertainment. Real-world names used within the game are used for
          identification and simulation purposes only.
        </p>

        <h2>Advertising</h2>
        <p>
          The Service is supported in part by advertising, including Google AdSense. Your use of the Service is also
          subject to our{' '}
          <Link href="/privacy">Privacy Policy</Link>, which explains how advertising cookies are used.
        </p>

        <h2>Disclaimers</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any
          kind, whether express or implied. We do not warrant that the Service will be uninterrupted, error-free, or
          that game data will always be preserved. You are encouraged to keep your own backups of important saves
          where the game allows.
        </p>

        <h2>Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, {COMPANY} will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or any loss of data, arising out of or related to your use of
          the Service. Our total liability for any claim relating to the Service will not exceed the amount you paid
          us, if any, in the twelve months before the claim.
        </p>

        <h2>Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time if you violate these Terms or if we
          discontinue the Service. You may stop using the Service and delete your account at any time.
        </p>

        <h2>Governing Law</h2>
        <p>
          These Terms are governed by the laws of the State of {STATE}, United States, without regard to its
          conflict-of-laws rules. Any disputes will be resolved in the courts located in {STATE}.
        </p>

        <h2>Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. When we do, we will revise the &ldquo;Last updated&rdquo;
          date above. Your continued use of the Service after changes take effect constitutes acceptance of the
          revised Terms.
        </p>

        <h2>Contact Us</h2>
        <p>
          Questions about these Terms? Contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
