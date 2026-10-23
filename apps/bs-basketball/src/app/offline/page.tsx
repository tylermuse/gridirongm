import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false },
};

/** Offline fallback served by the service worker when a navigation has no
 *  network and no cached copy. Leagues live in this browser's IndexedDB, so
 *  the (precached) home shell can still open the saved league offline. */
export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div
        className="max-w-md w-full text-center space-y-4 rounded-2xl border p-8"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="text-5xl" aria-hidden>🏀</div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">You&rsquo;re offline</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          This page wasn&rsquo;t saved for offline use yet. Your leagues are stored
          in this browser, not on our servers, so they&rsquo;re safe — and once
          BS Hoops has loaded here before, you can keep playing without a
          connection.
        </p>
        <p className="text-xs text-[var(--text-sec)]">
          AI features (spotlight, recaps) and cloud sync come back when you reconnect.
        </p>
        {/* Full document load on purpose: the SW serves the precached "/" shell. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-block mt-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-90"
        >
          Open my saved league
        </a>
      </div>
    </div>
  );
}
