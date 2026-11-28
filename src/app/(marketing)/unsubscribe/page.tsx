import Link from 'next/link';
import type { Metadata } from 'next';
import { getEmailPrefState } from '@/lib/server/emailPrefs';

export const metadata: Metadata = {
  title: 'Email preferences | BS Football',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ t?: string; error?: string }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const { t, error } = await searchParams;
  const token = typeof t === 'string' ? t : '';
  const state = token ? await getEmailPrefState(token) : 'unknown';
  const failed = error === '1' || state === 'unavailable';

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        {state === 'subscribed' && !failed && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Stop BS Football emails?</h1>
            <p className="text-gray-600 mb-6">
              You won&apos;t get game updates or roster news by email. Sign-in links and Premium receipts still
              arrive.
            </p>
            <form method="post" action="/api/email/unsubscribe">
              <input type="hidden" name="t" value={token} />
              <input type="hidden" name="from" value="page" />
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Unsubscribe
              </button>
            </form>
          </>
        )}

        {state === 'unsubscribed' && !failed && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">You&apos;re unsubscribed</h1>
            <p className="text-gray-600 mb-6">
              We won&apos;t send you game updates or roster news. Your account and saves are unchanged.
            </p>
            <form method="post" action="/api/email/unsubscribe">
              <input type="hidden" name="t" value={token} />
              <input type="hidden" name="from" value="page" />
              <input type="hidden" name="action" value="resubscribe" />
              <button type="submit" className="text-sm font-semibold text-blue-600 hover:underline">
                Resubscribe
              </button>
            </form>
          </>
        )}

        {(state === 'unknown' || failed) && (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              {failed ? 'We couldn’t update your email preferences' : 'This link didn’t work'}
            </h1>
            <p className="text-gray-600">
              {failed ? 'Try the link again in a few minutes, or email ' : 'Open the unsubscribe link from your most recent email, or email '}
              <a href="mailto:support@bs-football.com" className="text-blue-600 hover:underline">
                support@bs-football.com
              </a>{' '}
              and we&apos;ll take you off the list.
            </p>
          </>
        )}
      </div>

      <p className="mt-6 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-700">Back to BS Football</Link>
      </p>
    </div>
  );
}
