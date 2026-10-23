import type { Metadata } from 'next';
import { LegalPage, COMPANY, STATE, CONTACT_EMAIL, SITE } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How BS Hoops collects, uses, and protects your information, including account data, saves, payments, and analytics.',
  alternates: { canonical: `${SITE}/privacy` },
};

const LAST_UPDATED = 'October 18, 2026';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={LAST_UPDATED}>
      <p>
        This Privacy Policy explains how {COMPANY} (&ldquo;BS Hoops,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) collects, uses, and safeguards your information when you visit <strong>bs-basketball.com</strong>{' '}
        and use our basketball management game (the &ldquo;Service&rdquo;). By using the Service, you agree to the
        practices described here.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> If you create an account, our authentication and database provider
          (Supabase) stores your email address, a securely hashed password or third-party sign-in identifier, and basic
          profile details. Playing without an account is supported.
        </li>
        <li>
          <strong>Game data.</strong> Your leagues and saves are stored in your browser. If you are signed in and turn on
          Cloud Saves, a copy of your saves is stored with your account so you can continue on another device.
        </li>
        <li>
          <strong>Payment information.</strong> If you purchase Premium, payments are processed by Stripe. We do not
          store your full card number; Stripe provides us limited details such as your subscription status.
        </li>
        <li>
          <strong>Usage and device information.</strong> We receive standard log data (IP address, browser type, pages
          visited, timestamps) and anonymous gameplay events (for example, that a season was simulated) to operate,
          secure, and improve the Service. We use Vercel Web Analytics, which does not use cookies.
        </li>
        <li>
          <strong>Local storage.</strong> We use your browser&rsquo;s local storage and IndexedDB for saves and
          preferences such as theme and sound.
        </li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service and your saved game data.</li>
        <li>To authenticate you and keep your account secure.</li>
        <li>To process subscriptions and prevent fraud.</li>
        <li>
          To generate in-game content. Some features use third-party AI providers (such as OpenAI and Google) to produce
          simulated recaps and commentary. Game context is sent to generate that content; we never send your password or
          payment details.
        </li>
        <li>To respond to your support requests.</li>
      </ul>

      <h2>Third-Party Service Providers</h2>
      <ul>
        <li><strong>Supabase</strong> — authentication, database, and cloud save storage.</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>Vercel</strong> — hosting, delivery, and privacy-friendly analytics.</li>
        <li><strong>OpenAI</strong> and <strong>Google</strong> — AI content generation.</li>
      </ul>

      <h2>Data Retention and Deletion</h2>
      <p>
        Browser saves stay on your device until you delete them in the game or clear your browser data. Account and cloud
        save data are kept while your account is active. You can request deletion of your account and associated data at
        any time at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Your Rights and Choices</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export, or delete your personal
        information. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> to exercise these rights.
      </p>

      <h2>Children&rsquo;s Privacy</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect personal information from
        children under 13. If you believe a child has provided us personal information, contact us so we can remove it.
      </p>

      <h2>Data Security</h2>
      <p>
        We use industry-standard measures, including encryption in transit and reputable infrastructure providers. No
        method of transmission or storage is completely secure.
      </p>

      <h2>International Users</h2>
      <p>
        We operate from the United States. If you use the Service from elsewhere, your information may be processed in
        the United States and other countries where our providers operate.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this policy from time to time and will revise the &ldquo;Last updated&rdquo; date when we do.
        Continued use of the Service after changes take effect means you accept the revised policy.
      </p>

      <h2>Contact Us</h2>
      <p>
        Questions? Contact {COMPANY} at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. This Service is governed
        by the laws of the State of {STATE}, United States.
      </p>
    </LegalPage>
  );
}
