/**
 * Shown the moment a player clicks Watch Live (TopBar, roster, playoffs,
 * standings, dashboard), while the live-game route loads. Before this the
 * click changed nothing on screen for a second or more: 142 devices logged
 * dead "Watch Live" clicks in 30 days, and 93% of those clicks did reach the
 * game within 20 seconds (Tyler 11/14), so players were just left waiting.
 */
export default function LiveGameLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-red-600/25">
        <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
        LIVE
      </div>
      <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-medium text-[var(--text-sec)]">Heading to the stadium…</p>
    </div>
  );
}
