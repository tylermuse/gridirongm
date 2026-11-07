import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, COMPANY, CONTACT_EMAIL, SITE } from '@/components/legal/LegalPage';

const DISCORD_INVITE = 'https://discord.gg/RMtusS2GKW';
// Stripe-hosted Customer Portal login (shared Stripe account with BS Football).
// Rendered only when set in Vercel env.
const PORTAL_LOGIN_URL = process.env.NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL;

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the BS Hoops team. Email ${CONTACT_EMAIL} or join our Discord community.`,
  alternates: { canonical: `${SITE}/contact` },
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact Us">
      <p>
        We would love to hear from you — whether it&apos;s a bug, a feature idea, a billing question, or just feedback on the game.
      </p>
      <h2>Email</h2>
      <p>
        For support, billing, privacy requests, or anything else, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and
        we&apos;ll get back to you as soon as we can.
      </p>
      <h2>Community</h2>
      <p>
        Join our <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">Discord</a> to talk strategy with other GMs,
        report bugs, and help shape what we build next. It&apos;s the fastest way to reach the team.
      </p>
      <h2>Manage or cancel your Premium subscription</h2>
      <p>
        You can cancel at any time — no email required. Sign in, open <Link href="/settings">Settings</Link>, and click{' '}
        <strong>Manage subscription</strong> to cancel, update your card, or download invoices. Cancellation takes effect at
        the end of the current billing period, so you keep Premium until then.
      </p>
      {PORTAL_LOGIN_URL && (
        <p>
          Can&apos;t sign in, or not sure which account you subscribed with? Use the{' '}
          <a href={PORTAL_LOGIN_URL} target="_blank" rel="noopener noreferrer">billing portal</a> — enter the email on your
          receipt and we&apos;ll send you a secure link.
        </p>
      )}
      <p>
        Charged when you didn&apos;t expect it? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with the email on
        your receipt and we&apos;ll take care of it.
      </p>
      <h2>Business &amp; legal</h2>
      <p>
        BS Hoops is operated by <strong>{COMPANY}</strong>, the team behind BS Football. For privacy or data requests, see our{' '}
        <Link href="/privacy">Privacy Policy</Link>; for terms of use, see our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
