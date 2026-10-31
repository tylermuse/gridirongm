/**
 * WI-3 — BS Hoops live viewer telemetry (live_game_view / live_game_finished),
 * emitted by useLiveGameTelemetry inside components/live/LiveViewer.tsx.
 *
 * Renders the hook under React StrictMode (effects double-run) and re-renders
 * it many times to prove each event fires once per viewing.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn(), flushEvents: vi.fn() }));

import { act, createElement, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { trackEvent } from '@bs/core/analytics/track';
import {
  useLiveGameTelemetry,
  type LiveGameTelemetryInput,
} from '@/../apps/bs-basketball/src/lib/telemetry/useLiveGameTelemetry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tracked = vi.mocked(trackEvent);
const eventsNamed = (name: string) =>
  tracked.mock.calls.filter(c => c[0] === name).map(c => c[1] as Record<string, unknown>);

/** The viewer's handle on the hook (what LiveViewer's skip buttons call). */
const viewer = { markSkipped: () => {} };
function Probe(props: LiveGameTelemetryInput) {
  const { markSkipped } = useLiveGameTelemetry(props);
  useEffect(() => { viewer.markSkipped = markSkipped; }, [markSkipped]);
  return null;
}

function mountViewer() {
  const root = createRoot(document.createElement('div'));
  return {
    render: (p: LiveGameTelemetryInput) =>
      act(() => { root.render(createElement(StrictMode, null, createElement(Probe, p))); }),
    unmount: () => act(() => { root.unmount(); }),
  };
}

const base: LiveGameTelemetryInput = {
  gameId: 'g1', ready: true, atEnd: false, mode: 'live', playoff: false, realLog: true,
};

describe('BS Hoops live viewer telemetry', () => {
  it('one view and one played-out finish per viewing, however often it re-renders', async () => {
    const v = mountViewer();
    await v.render({ ...base, ready: false }); // game not resolved yet → nothing
    expect(tracked).not.toHaveBeenCalled();

    for (let i = 0; i < 5; i++) await v.render(base);
    for (let i = 0; i < 5; i++) await v.render({ ...base, atEnd: true });
    await v.render(base); // seek back…
    await v.render({ ...base, atEnd: true }); // …and replay to the end again

    expect(eventsNamed('live_game_view')).toEqual([
      { game_id: 'g1', mode: 'live', playoff: false, real_log: true },
    ]);
    expect(eventsNamed('live_game_finished')).toEqual([
      { game_id: 'g1', mode: 'live', playoff: false, ended_by: 'played' },
    ]);
    await v.unmount();
  });

  it('Skip to final / Max speed reports ended_by skipped; exiting early sends no finish', async () => {
    const v = mountViewer();
    await v.render({ ...base, gameId: 'g2', mode: 'replay', playoff: true });
    viewer.markSkipped();
    await v.render({ ...base, gameId: 'g2', mode: 'replay', playoff: true, atEnd: true });
    expect(eventsNamed('live_game_finished')).toEqual([
      { game_id: 'g2', mode: 'replay', playoff: true, ended_by: 'skipped' },
    ]);
    await v.unmount();

    tracked.mockClear();
    const w = mountViewer(); // reopening is a new viewing
    await w.render({ ...base, gameId: 'g2' });
    await w.unmount(); // closed before the final
    expect(eventsNamed('live_game_view')).toHaveLength(1);
    expect(eventsNamed('live_game_finished')).toHaveLength(0);
  });
});
