import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * UI state for the Booth (Marcus & Tony call-in panel). Kept apart from the
 * game store so opening the panel never touches the saved league.
 *
 * `episode` is the latest Team Spotlight the dashboard rendered; the Booth
 * sends it as grounding so the hosts stay consistent with what they said on
 * air. Pages that never mounted the dashboard fall back to the AI cache.
 *
 * `logs` holds the call history per in-game week key. It lives here (not in
 * the panel) so closing the Booth or changing pages keeps the conversation,
 * and it's persisted to sessionStorage so a refresh does too.
 */

export interface BoothEpisodeTopic {
  headline: string;
  exchanges: { speakerId: string; text: string; playerName?: string }[];
}

export type BoothHost = 'marcus' | 'tony';
export interface BoothMsg { role: 'user' | BoothHost; text: string; verdict?: string; }
export interface BoothLog {
  messages: BoothMsg[];
  /** Typed (LLM) turns only — chips are free. */
  turns: number;
  /** Who the caller sided with, by call index. */
  votes: Record<number, BoothHost>;
}

export const EMPTY_BOOTH_LOG: BoothLog = { messages: [], turns: 0, votes: {} };

// Only the current week matters for the free-turn cap; keep a couple of
// recent weeks so stepping back and forth doesn't wipe a call.
const MAX_LOGS = 4;

interface BoothState {
  open: boolean;
  /** True while a GameShell has the Booth mounted (hides the feedback bubble). */
  mounted: boolean;
  episode: BoothEpisodeTopic[] | null;
  logs: Record<string, BoothLog>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setMounted: (mounted: boolean) => void;
  setEpisode: (episode: BoothEpisodeTopic[]) => void;
  updateLog: (weekKey: string, fn: (log: BoothLog) => BoothLog) => void;
}

export const useBoothStore = create<BoothState>()(
  persist(
    set => ({
      open: false,
      mounted: false,
      episode: null,
      logs: {},
      setOpen: open => set({ open }),
      toggle: () => set(s => ({ open: !s.open })),
      setMounted: mounted => set({ mounted }),
      setEpisode: episode => set({ episode }),
      updateLog: (weekKey, fn) => set(s => {
        const { [weekKey]: current, ...rest } = s.logs;
        // Re-insert last so the most recently used weeks survive the trim.
        const kept = Object.entries(rest).slice(-(MAX_LOGS - 1));
        return { logs: { ...Object.fromEntries(kept), [weekKey]: fn(current ?? EMPTY_BOOTH_LOG) } };
      }),
    }),
    {
      name: 'gg-booth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: s => ({ logs: s.logs }),
    },
  ),
);
