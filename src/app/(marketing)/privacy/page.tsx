import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — BS Football',
  description:
    'How BS Football collects, uses, and protects your information, including account data, payments, and advertising cookies.',
  alternates: { canonical: 'https://bs-football.com/privacy' },
};

// TODO: replace the two placeholders below with the registered entity details.
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

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Privacy Policy</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

      <div className={PROSE}>
        <p>
          This Privacy Policy explains how {COMPANY} (&ldquo;BS Football,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) collects, uses, and safeguards your information when you visit{' '}
          <strong>bs-football.com</strong> and use our football management game and related pages (the
          &ldquo;Service&rdquo;). By using the Service, you agree to the practices described here.
        </p>

        <h2>Information We Collect</h2>
        <p>We collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Account information.</strong> When you create an account, our authentication and database
            provider (Supabase) stores your email address, a securely hashed password or third-party sign-in
            identifier, and basic profile details.
          </li>
          <li>
            <strong>Game data.</strong> Your leagues, teams, saves, settings, and in-game progress are stored so
            you can return to them across sessions and devices.
          </li>
          <li>
            <strong>Payment information.</strong> If you purchase a Premium subscription, payments are processed by
            Stripe. We do not store your full card number; Stripe handles card data under its own privacy policy
            and provides us with limited details such as your subscription status and the last four digits of your
            card.
          </li>
          <li>
            <strong>Usage and device information.</strong> Like most websites, we automatically receive standard log
            data such as your IP address, browser type, pages visited, and timestamps, used to operate, secure, and
            improve the Service.
          </li>
          <li>
            <strong>Cookies and similar technologies.</strong> We and our partners use cookies and local browser
            storage for sign-in, preferences, analytics, and advertising, as described below.
          </li>
        </ul>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>To provide, maintain, and improve the Service and your saved game data.</li>
          <li>To authenticate you and keep your account secure.</li>
          <li>To process subscriptions and prevent fraud.</li>
          <li>To generate in-game content. Some features use third-party AI providers (such as OpenAI and Google) to produce simulated news, recaps, and commentary. Game context is sent to these providers to generate that content; we do not send them your password or payment details.</li>
          <li>To respond to your support requests.</li>
          <li>To display advertising that helps keep the core game free.</li>
        </ul>

        <h2>Advertising and Google AdSense</h2>
        <p>
          We use Google AdSense to display advertisements. Third-party vendors, including Google, use cookies to
          serve ads based on your prior visits to this and other websites.
        </p>
        <ul>
          <li>
            Google&rsquo;s use of advertising cookies enables it and its partners to serve ads to you based on your
            visits to our Service and/or other sites on the Internet.
          </li>
          <li>
            You may opt out of personalized advertising by visiting{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
              Google Ads Settings
            </a>
            .
          </li>
          <li>
            You can also opt out of a third-party vendor&rsquo;s use of cookies for personalized advertising by
            visiting{' '}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
              aboutads.info
            </a>
            .
          </li>
        </ul>

        <h2>Third-Party Service Providers</h2>
        <p>We rely on trusted providers who process data on our behalf, each under its own privacy policy:</p>
        <ul>
          <li><strong>Supabase</strong> — authentication and database storage.</li>
          <li><strong>Stripe</strong> — payment processing.</li>
          <li><strong>Vercel</strong> — website hosting and delivery.</li>
          <li><strong>Google</strong> — AdSense advertising and AI content generation.</li>
          <li><strong>OpenAI</strong> — AI content generation.</li>
        </ul>

        <h2>Data Retention</h2>
        <p>
          We retain your account and game data for as long as your account is active. You may request deletion of
          your account and associated data at any time by contacting us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Your Rights and Choices</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, export, or delete your personal
          information, and to opt out of certain processing. To exercise these rights, email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can control cookies through your browser
          settings, though disabling some cookies may affect sign-in and gameplay.
        </p>

        <h2>Children&rsquo;s Privacy</h2>
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect personal information
          from children under 13. If you believe a child has provided us with personal information, please contact
          us so we can remove it.
        </p>

        <h2>Data Security</h2>
        <p>
          We use industry-standard measures to protect your information, including encryption in transit and
          reputable infrastructure providers. No method of transmission or storage is completely secure, so we
          cannot guarantee absolute security.
        </p>

        <h2>International Users</h2>
        <p>
          We operate from the United States. If you access the Service from outside the United States, your
          information may be transferred to, stored, and processed in the United States and other countries where
          our providers operate.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will revise the &ldquo;Last
          updated&rdquo; date above. Your continued use of the Service after changes take effect constitutes
          acceptance of the revised policy.
        </p>

        <h2>Contact Us</h2>
        <p>
          Questions about this Privacy Policy? Contact {COMPANY} at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This Service is governed by the laws of the
          State of {STATE}, United States.
        </p>
      </div>
    </div>
  );
}
