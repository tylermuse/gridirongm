'use client';

import { FeedbackModal, openFeedback } from '@bs/core/feedback/client';
import { useBoothStore } from '@/lib/engine/boothStore';

const DISCORD_URL = 'https://discord.gg/RMtusS2GKW';

/**
 * Mounts the shared "Feedback & questions" modal on every page, plus a labeled
 * floating button on pages without the Booth (marketing, blog, setup). In-game
 * screens give the Booth this corner, so they open the modal from the sidebar
 * entry and the mobile header button instead (see Sidebar / GameTicker).
 */
export function FeedbackWidget() {
  const boothMounted = useBoothStore(s => s.mounted);
  return (
    <>
      {!boothMounted && (
        <button
          onClick={() => openFeedback()}
          title="Feedback & questions"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 pl-3 pr-4 h-11 rounded-full bg-blue-600 text-white text-sm font-semibold shadow-lg hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Feedback</span>
        </button>
      )}
      <FeedbackModal appName="BS Football" discordUrl={DISCORD_URL} />
    </>
  );
}
