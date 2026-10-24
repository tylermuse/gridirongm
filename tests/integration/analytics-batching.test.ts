/**
 * @bs/core/analytics/track — events are queued and sent in batches instead of
 * one request per event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('analytics batching', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve(new Response('{"ok":true}')));
    vi.stubGlobal('fetch', fetchMock);
    // Force the fetch path (happy-dom's sendBeacon support varies).
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const bodies = () => fetchMock.mock.calls.map(c => JSON.parse((c[1] as RequestInit).body as string));

  it('queues events and sends them as one request after the flush interval', async () => {
    const { trackEvent } = await import('../../packages/core/src/analytics/track');
    trackEvent('live_coach_started', { trigger: 'default' });
    trackEvent('live_coach_play_called', { play: 'run_inside' });
    trackEvent('live_coach_play_called', { play: 'pass_deep' });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies();
    expect(body.events.map((e: { event: string }) => e.event)).toEqual([
      'live_coach_started', 'live_coach_play_called', 'live_coach_play_called',
    ]);
    expect(typeof body.deviceId).toBe('string');
    expect(typeof body.events[0].ts).toBe('number');
  });

  it('flushes immediately once the batch is full', async () => {
    const { trackEvent } = await import('../../packages/core/src/analytics/track');
    for (let i = 0; i < 25; i++) trackEvent('week_simmed', { week: i + 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies()[0].events).toHaveLength(25);
  });

  it('flushes when the tab is hidden', async () => {
    const { trackEvent } = await import('../../packages/core/src/analytics/track');
    trackEvent('season_completed', { season: 2026 });
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
