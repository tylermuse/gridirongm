/** Offline fallback shown by the service worker when a fresh navigation
 *  request has no cached version AND there's no network. The in-progress
 *  league save lives in IndexedDB, so re-opening the dashboard URL after
 *  reconnecting picks the season back up. */
export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)] text-[var(--text)]">
      <div className="max-w-md text-center space-y-4">
        <div className="text-6xl">🏈</div>
        <h1 className="text-2xl font-bold">You&rsquo;re offline</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          BS Football works fully offline once you&rsquo;ve loaded the app, but
          this specific page wasn&rsquo;t cached yet. Your save is safe in
          local storage — head back to the dashboard or reconnect and reload.
        </p>
        <a
          href="/"
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold hover:opacity-90"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
