import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact BS Football',
  description:
    'Get in touch with the BS Football team. Reach us by email at support@bs-football.com or join our Discord community.',
  alternates: { canonical: 'https://bs-football.com/contact' },
};

// Stripe-hosted Customer Portal login (Stripe Dashboard → Settings → Billing →
// Customer portal → "Login page"). Lets a subscriber who can't sign in to the
// game cancel by entering the email on their receipt. Rendered only when set.
const PORTAL_LOGIN_URL = process.env.NEXT_PUBLIC_STRIPE_PORTAL_LOGIN_URL;

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Contact</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Contact Us</h1>
      <p className="text-lg text-gray-600 mb-10">
        We would love to hear from you &mdash; whether it&apos;s a bug, a feature idea, a billing question, or just
        feedback on the game.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Email</h2>
          <p className="text-gray-600 mb-4">
            For support, billing, privacy requests, or anything else, email us and we&apos;ll get back to you as soon
            as we can.
          </p>
          <a
            href="mailto:support@bs-football.com"
            className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            support@bs-football.com
          </a>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Community</h2>
          <p className="text-gray-600 mb-4">
            Join our Discord to talk strategy with other GMs, report bugs, and help shape what we build next. It&apos;s
            the fastest way to reach the team.
          </p>
          <a
            href="https://discord.gg/RMtusS2GKW"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Join our Discord
          </a>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Manage or cancel your Premium subscription</h2>
        <p className="text-gray-600 mb-3">
          You can cancel at any time &mdash; no email required. Sign in, open{' '}
          <Link href="/settings" className="text-blue-600 hover:underline">Settings</Link>, and click{' '}
          <strong>Manage subscription</strong> to cancel, update your card, or download invoices. Cancellation takes
          effect at the end of the current billing period, so you keep Premium until then.
        </p>
        {PORTAL_LOGIN_URL && (
          <p className="text-gray-600 mb-3">
            Can&apos;t sign in, or not sure which account you subscribed with? Use the{' '}
            <a href={PORTAL_LOGIN_URL} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
              billing portal
            </a>{' '}
            &mdash; enter the email on your receipt and we&apos;ll send you a secure link.
          </p>
        )}
        <p className="text-gray-600">
          Charged when you didn&apos;t expect it? Email{' '}
          <a href="mailto:support@bs-football.com" className="text-blue-600 hover:underline">support@bs-football.com</a>{' '}
          with the email on your receipt and we&apos;ll take care of it.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Business & Legal</h2>
        <p className="text-gray-600">
          BS Football is operated by <strong>BS Sports GM LLC</strong>. For privacy or data requests, see our{' '}
          <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>; for terms of use, see
          our <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
