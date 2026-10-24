import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact BS Football',
  description:
    'Get in touch with the BS Football team. Reach us by email at support@bs-football.com or join our Discord community.',
  alternates: { canonical: 'https://bs-football.com/contact' },
};

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
