/**
 * @bs/core/analytics/track — batched, fire-and-forget event tracking.
 *
 * No React / Next imports so it can be called from anywhere on the client,
 * including the Zustand store and engine code that unit tests import.
 *
 * Events are queued in memory and sent to /api/analytics/track as ONE request
 * per batch instead of one request per event:
 *   - every FLUSH_INTERVAL_MS while the queue is non-empty
 *   - immediately once the queue reaches MAX_BATCH
 *   - on tab hide / pagehide via sendBeacon (survives navigation + close)
 *
 * Server side: see ./server.ts (createTrackHandler). It still accepts the old
 * single-event payload so a stale tab running the previous bundle keeps working.
 */

const DEVICE_ID_KEY = 'gg-device-id';
const ENDPOINT = '/api/analytics/track';
const FLUSH_INTERVAL_MS = 10_000;
const MAX_BATCH = 25;
/** Hard ceiling on what we hold in memory if the network is down. */
const MAX_QUEUE = 200;

export interface QueuedEvent {
  event: string;
  properties?: Record<string, unknown>;
  /** Client timestamp (ms). Preserves in-batch ordering for funnels. */
  ts: number;
}

let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

/** Stable anonymous device ID — persists across sessions via localStorage */
export function getDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch { return null; }
}

function send(events: QueuedEvent[], useBeacon: boolean) {
  if (events.length === 0) return;
  const body = JSON.stringify({ events, deviceId: getDeviceId() });
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      if (navigator.sendBeacon(ENDPOINT, body)) return;
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* analytics must never break the app */ });
  } catch { /* ignore */ }
}

/** Send everything queued right now. `beacon` = page is going away. */
export function flushEvents(beacon = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  while (queue.length > 0) {
    send(queue.splice(0, MAX_BATCH), beacon);
  }
}

function attachListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  const onHide = () => flushEvents(true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
  window.addEventListener('pagehide', onHide);
}

/** Fire-and-forget event tracking. Safe to call anywhere (no-op on server). */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  try {
    if (typeof window === 'undefined') return;
    attachListeners();
    queue.push({ event, properties, ts: Date.now() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= MAX_BATCH) {
      flushEvents();
    } else if (!timer) {
      timer = setTimeout(() => flushEvents(), FLUSH_INTERVAL_MS);
    }
  } catch {
    // Silently fail — analytics should never break the app
  }
}
