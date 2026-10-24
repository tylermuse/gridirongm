import Link from 'next/link';
import type { Metadata } from 'next';
import { LegalPage, COMPANY, STATE, CONTACT_EMAIL, SITE } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using BS Hoops, a free browser-based basketball management game with an optional Premium subscription.',
  alternates: { canonical: `${SITE}/terms` },
};

const LAST_UPDATED = 'October 18, 2026';

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={LAST_UPDATED}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of <strong>bs-basketball.com</strong> and the BS
        Hoops game (the &ldquo;Service&rdquo;), operated by {COMPANY} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). By using the Service, you agree to these Terms. If you do not agree, please do not use the
        Service.
      </p>

      <h2>The Service</h2>
      <p>
        BS Hoops is a browser-based basketball management simulation and parody. Teams, players, simulations, and
        related content are fiction and simulation. BS Hoops is an independent product and is not affiliated with,
        endorsed by, or sponsored by the National Basketball Association (NBA), any professional league, team, or player,
        or any other basketball management game.
      </p>

      <h2>Accounts</h2>
      <p>
        Some features require an account. You are responsible for your login credentials and all activity under your
        account, and you must be at least 13 years old to create one.
      </p>

      <h2>Premium Subscriptions</h2>
      <ul>
        <li>The core game is free. Optional paid <strong>Premium</strong> features are billed through Stripe.</li>
        <li>
          Subscriptions renew automatically unless canceled before the renewal date. Cancellation takes effect at the end
          of the current billing period.
        </li>
        <li>
          Except where required by law, payments are non-refundable. Prices and features may change with reasonable
          notice of material changes.
        </li>
      </ul>

      <h2>Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Reverse engineer, scrape, or attempt to disrupt or gain unauthorized access to the Service.</li>
        <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
        <li>Resell, redistribute, or commercially exploit the Service without our written permission.</li>
      </ul>

      <h2>Roster Files and Imports</h2>
      <p>
        You may import roster files into your own leagues. You are responsible for having the right to use any file you
        import. Real-world names used within the game are for identification and simulation purposes only.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        The Service, including its software, design, text, and branding, is owned by {COMPANY}. We grant you a limited,
        non-exclusive, non-transferable license to use the Service for personal, non-commercial entertainment.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind. We
        do not warrant that the Service will be uninterrupted or error-free, or that game data will always be preserved.
        Browser saves can be lost if you clear your browser data; turn on Cloud Saves to keep a copy with your account.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, {COMPANY} is not liable for indirect, incidental, special,
        consequential, or punitive damages, or any loss of data, arising from your use of the Service. Our total
        liability for any claim will not exceed the amount you paid us, if any, in the twelve months before the claim.
      </p>

      <h2>Termination</h2>
      <p>
        We may suspend or terminate access if you violate these Terms or if we discontinue the Service. You may stop
        using the Service and delete your account at any time.
      </p>

      <h2>Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of {STATE}, United States, without regard to conflict-of-laws
        rules. Disputes will be resolved in the courts located in {STATE}.
      </p>

      <h2>Changes and Contact</h2>
      <p>
        We may update these Terms and will revise the &ldquo;Last updated&rdquo; date when we do. See also our{' '}
        <Link href="/privacy">Privacy Policy</Link>. Questions? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
