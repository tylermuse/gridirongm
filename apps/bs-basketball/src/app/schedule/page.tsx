'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /schedule — alias for the Schedule tab of Standings & Schedule (football
 * keeps both on one page). Client-side replace so it works under static
 * export; no useSearchParams here, so no Suspense boundary is needed.
 */
export default function SchedulePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/standings?view=schedule');
  }, [router]);
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="opacity-60">Loading schedule…</p>
    </main>
  );
}
