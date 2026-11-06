/**
 * The Hoops broadcast loop. Football's suite covers the shared behaviour in
 * depth; this pins what matters for Hoops: Court Cam holds the voice, a bad clip
 * doesn't end the broadcast, and running out of credits stops it cleanly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGameBroadcast, type GameBroadcast, type StartOpts } from '../../apps/bs-basketball/src/lib/broadcast/useGameBroadcast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeAudio {
  static played: string[] = [];
  private listeners: Record<string, Set<() => void>> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private srcValue = '';
  ended = false;
  currentTime = 0;
  get src() { return this.srcValue; }
  set src(v: string) { this.srcValue = v; this.ended = false; this.currentTime = 0; if (this.timer) clearTimeout(this.timer); }
  removeAttribute() { this.src = ''; }
  addEventListener(t: string, fn: () => void) { (this.listeners[t] ??= new Set()).add(fn); }
  removeEventListener(t: string, fn: () => void) { this.listeners[t]?.delete(fn); }
  play(): Promise<void> {
    if (this.srcValue.startsWith('data:')) return Promise.resolve();
    FakeAudio.played.push(this.srcValue);
    this.timer = setTimeout(() => { this.ended = true; this.listeners.ended?.forEach(fn => fn()); }, 10);
    return Promise.resolve();
  }
  pause() { if (this.timer) clearTimeout(this.timer); }
}

const flush = (ms = 0) => act(() => new Promise<void>(r => setTimeout(r, ms)));
async function until(cond: () => boolean, label: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await flush(5);
  }
}

describe('Hoops useGameBroadcast', () => {
  let root: Root;
  let b: GameBroadcast;
  let fetchMock: ReturnType<typeof vi.fn>;
  let shown: number[];
  let done: boolean;
  const calls = ['one', 'two', 'three'];
  const start = (over: Partial<StartOpts> = {}) => act(async () => {
    b.start({
      count: calls.length,
      fromIndex: 0,
      linesFor: i => [{ speaker: 'marcus', text: calls[i] }],
      onShowPlay: i => { shown.push(i); },
      onDone: () => { done = true; },
      silentBeatMs: () => 1,
      ...over,
    });
  });

  beforeEach(async () => {
    FakeAudio.played = []; shown = []; done = false;
    vi.stubGlobal('Audio', FakeAudio);
    fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:clip-${++n}`);
    URL.revokeObjectURL = vi.fn();
    function Harness({ onValue }: { onValue: (v: GameBroadcast) => void }) {
      const value = useGameBroadcast();
      useEffect(() => { onValue(value); });
      return null;
    }
    root = createRoot(document.createElement('div'));
    await act(async () => { root.render(createElement(Harness, { onValue: v => { b = v; } })); });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    vi.unstubAllGlobals();
  });

  it('holds the call until Court Cam has played the possession', async () => {
    let simRunning = true;
    await start({ willAnimate: () => true, gate: () => !simRunning });
    await until(() => shown.length === 1, 'first reveal');
    await flush(300);
    expect(FakeAudio.played).toHaveLength(0); // shot still in the air: no spoilers
    simRunning = false;
    await until(() => done, 'done');
    expect(shown).toEqual([0, 1, 2]);
    expect(FakeAudio.played).toHaveLength(3);
  }, 6000);

  it('does not reveal an event until its call is ready', async () => {
    let release = () => {};
    fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>(r => { release = r; });
      return new Response('x');
    });
    await start();
    await flush(30);
    expect(shown).toEqual([]);
    release();
    await until(() => done, 'done');
  });

  it('survives one bad clip', async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const { lines } = JSON.parse(init.body as string);
      return lines[0].text === 'two' ? new Response('boom', { status: 500 }) : new Response('ok');
    });
    await start();
    await until(() => done, 'done', 4000);
    expect(shown).toEqual([0, 1, 2]);
    expect(FakeAudio.played).toHaveLength(2);
  }, 6000);

  it('stops on exhausted credits with the code, without retrying', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'quota', code: 'tts_quota' }), { status: 402 }));
    await start();
    await until(() => b.status === 'error', 'error');
    expect(b.errorCode).toBe('tts_quota');
    expect(shown).toEqual([]);
  });
});
