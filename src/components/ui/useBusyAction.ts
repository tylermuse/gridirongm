'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * One app-wide lock for the heavy, synchronous "sim" actions (Sim Week, Sim
 * Next Game, Sim Pick, Refresh Proposals …). They all mutate the same game
 * store, so while one runs every button wired through this hook is disabled —
 * including a twin of the same button elsewhere on the page (TopBar + /draft
 * both render Sim Pick).
 *
 * Why this exists: the sims run on the main thread. Setting React state and
 * then simming in the same tick never paints the pressed state, so the click
 * looked dead for a second or more, people clicked again, and those queued
 * clicks were dispatched after the sim — firing a second sim (Sim Week 5 →
 * Sim Week 6) and showing up as rage clicks. `run` paints the busy state
 * first, runs the action, then keeps the controls disabled until input that
 * queued during the sim has been delivered (and dropped by the disabled
 * buttons).
 */

let running: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const getSnapshot = () => running;
const getServerSnapshot = (): string | null => null;

/** Resolves once the browser has had a chance to paint the current DOM
 *  (rAF → next task). The timer fallback covers background tabs, where rAF
 *  is paused. */
export function afterPaint(): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 150);
  });
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Minimum time a control stays busy. Long enough to read as "working", and
 * ≥ 500ms means even steady clicking can't land three clicks inside the
 * tracker's 1s rage window.
 */
const MIN_BUSY_MS = 500;

export function useBusyAction() {
  /** Key of the action in flight anywhere in the app, or null. */
  const busy = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const run = useCallback(async (key: string, action: () => unknown) => {
    if (running !== null) return;
    running = key;
    emit();
    const started = Date.now();
    let failed = false;
    let failure: unknown;
    try {
      await afterPaint();
      await action();
    } catch (err) {
      failed = true;
      failure = err;
    } finally {
      const left = MIN_BUSY_MS - (Date.now() - started);
      if (left > 0) await sleep(left);
      await afterPaint();
      running = null;
      emit();
    }
    // Re-throw after releasing the lock so the global error beacons still see it.
    if (failed) throw failure;
  }, []);

  return { busy, run };
}
