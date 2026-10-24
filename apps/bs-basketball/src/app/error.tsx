'use client';

import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-3" aria-hidden>🏀</div>
      <h2 className="text-2xl font-black mb-2">Something went wrong</h2>
      <p className="text-sm text-[var(--text-sec)] max-w-sm mb-5">
        This page hit an error. Your league is still saved in this browser.
      </p>
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-lg px-5 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
          Try again
        </button>
        <Link href="/" className="rounded-lg px-5 py-2 text-sm font-bold border border-[var(--border)] bg-[var(--surface)]">
          Home
        </Link>
      </div>
      {error.digest && <p className="text-[10px] text-[var(--text-sec)] mt-4">Error ref: {error.digest}</p>}
    </main>
  );
}
