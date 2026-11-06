/**
 * The broadcast loop: the voice is the clock, so anything that stops it freezes
 * the game. Drives the real hook with a fake audio element and fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createElement, useEffect } from 'react';
import { useGameBroadcast, type GameBroadcast, type StartOpts } from '@/lib/engine/useGameBroadcast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** How long a fake call "plays". */
const CALL_MS = 15;

class FakeAudio {
  static instances: FakeAudio[] = [];
  static blockNext = 0;
  static played: string[] = [];
  private listeners: Record<string, Set<() => void>> = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private srcValue = '';
  paused = true;
  ended = false;
  currentTime = 0;
  constructor() { FakeAudio.instances.push(this); }
  get src() { return this.srcValue; }
  set src(v: string) { this.srcValue = v; this.ended = false; this.currentTime = 0; if (this.timer) clearTimeout(this.timer); }
  getAttribute() { return this.srcValue || null; }
  removeAttribute() { this.src = ''; }
  load() {}
  addEventListener(t: string, fn: () => void) { (this.listeners[t] ??= new Set()).add(fn); }
  removeEventListener(t: string, fn: () => void) { this.listeners[t]?.delete(fn); }
  play(): Promise<void> {
    if (this.srcValue.startsWith('data:')) return Promise.resolve();
    if (FakeAudio.blockNext > 0) {
      FakeAudio.blockNext--;
      const e = new Error('blocked'); e.name = 'NotAllowedError';
      return Promise.reject(e);
    }
    if (this.currentTime === 0) FakeAudio.played.push(this.srcValue);
    this.paused = false;
    this.timer = setTimeout(() => {
      this.ended = true; this.paused = true; this.currentTime = 1;
      this.listeners.ended?.forEach(fn => fn());
    }, CALL_MS);
    return Promise.resolve();
  }
  pause() { this.paused = true; if (this.timer) clearTimeout(this.timer); this.currentTime = this.currentTime || 0.5; }
}

const flush = (ms = 0) => act(() => new Promise<void>(r => setTimeout(r, ms)));
async function until(cond: () => boolean, label: string, ms = 1500) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await flush(5);
  }
}

describe('useGameBroadcast', () => {
  let root: Root;
  let b: GameBroadcast;
  let fetchMock: ReturnType<typeof vi.fn>;
  let shown: number[];
  let events: string[];
  let done: boolean;
  let finished: boolean;

  const opts = (over: Partial<StartOpts> = {}): StartOpts => ({
    fromIndex: 0,
    count: () => events.length,
    linesFor: i => (events[i] ? [{ speaker: 'marcus', text: events[i] }] : []),
    isFinished: () => finished,
    onShowPlay: i => { shown.push(i); },
    onDone: () => { done = true; },
    ...over,
  });
  const start = (over?: Partial<StartOpts>) => act(async () => { b.start(opts(over)); });

  beforeEach(async () => {
    FakeAudio.instances = []; FakeAudio.blockNext = 0; FakeAudio.played = [];
    shown = []; events = ['one', 'two', 'three']; done = false; finished = true;
    vi.stubGlobal('Audio', FakeAudio);
    fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { lines } = JSON.parse(init.body as string);
      return new Response(lines[0].text, { status: 200 });
    });
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

  it('calls every play in order, then hands the game back', async () => {
    await start();
    await until(() => done, 'done');
    expect(shown).toEqual([0, 1, 2]);
    expect(b.status).toBe('done');
    expect(FakeAudio.played).toHaveLength(3);
  });

  it('does not reveal a play until its call is ready', async () => {
    let release = () => {};
    fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>(r => { release = r; });
      return new Response('x');
    });
    await start();
    await flush(30);
    expect(shown).toEqual([]);
    release();
    await until(() => shown.length > 0, 'first reveal');
    await act(async () => { b.stop(); });
  });

  it('waits for a Live Coach engine instead of ending the broadcast', async () => {
    finished = false;
    events = ['one'];
    await start();
    await until(() => b.status === 'waiting', 'waiting');
    expect(done).toBe(false);
    expect(shown).toEqual([0]);

    events = ['one', 'two'];
    await act(async () => { b.notify(); });
    await until(() => shown.length === 2, 'second play');
    await until(() => b.status === 'waiting', 'waiting again');

    finished = true;
    await act(async () => { b.notify(); });
    await until(() => done, 'done');
    expect(b.status).toBe('done');
  });

  it('calls a play that had no event yet when it was first looked ahead to', async () => {
    finished = false;
    events = ['one'];
    await start();
    await until(() => b.status === 'waiting', 'waiting');
    events = ['one', 'two'];
    await act(async () => { b.notify(); });
    await until(() => FakeAudio.played.length === 2, 'second call played');
  });

  it('really holds on pause, even between calls', async () => {
    await start({ postClipDelayMs: () => 60 });
    await until(() => shown.length === 1 && FakeAudio.instances[0].ended, 'first call over');
    await act(async () => { b.pause(); });
    expect(b.status).toBe('paused');
    await flush(120);
    expect(shown).toEqual([0]);

    const plays = FakeAudio.played.length;
    await act(async () => { b.resume(); });
    await until(() => shown.length === 2, 'second play');
    expect(FakeAudio.played.length).toBe(plays + 1); // moved on; didn't replay the old call
    await act(async () => { b.stop(); });
  });

  it('stops for good on a fatal error and reports the code', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'quota', code: 'tts_quota' }), { status: 402 }));
    await start();
    await until(() => b.status === 'error', 'error');
    expect(b.errorCode).toBe('tts_quota');
    expect(shown).toEqual([]);
  });

  it('survives one bad clip: that play goes unsaid and the game moves on', async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      const { lines } = JSON.parse(init.body as string);
      return lines[0].text === 'two' ? new Response('boom', { status: 500 }) : new Response('ok');
    });
    await start();
    await until(() => done, 'done', 4000);
    expect(shown).toEqual([0, 1, 2]);
    expect(FakeAudio.played).toHaveLength(2);
    expect(b.status).toBe('done');
  });

  it('gives up after repeated failures, so the page can take the reveal back', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    await start();
    await until(() => b.status === 'error', 'error', 6000);
    expect(b.errorCode).toBeNull();
  }, 8000);

  it('keeps going after an autoplay block once the user taps', async () => {
    FakeAudio.blockNext = 1;
    await start();
    await until(() => b.status === 'blocked', 'blocked');
    await act(async () => { b.resume(); });
    await until(() => done, 'done');
    expect(shown).toEqual([0, 1, 2]);
    expect(FakeAudio.played).toHaveLength(3);
  });

  it('starts cleanly after a stop', async () => {
    await start();
    await until(() => shown.length === 1, 'first play');
    await act(async () => { b.stop(); });
    expect(b.status).toBe('idle');
    shown = [];
    await start();
    await flush(2);
    expect(b.status).not.toBe('blocked');
    await until(() => done, 'done');
    expect(shown).toEqual([0, 1, 2]);
  });

  it('holds the call while a 3D sim runs, and the next play until it finishes', async () => {
    let simRunning = true;
    let whistle = false;
    await start({
      willAnimate: () => true,
      gate: stage => !simRunning || (stage === 'call' && whistle),
    });
    await until(() => shown.length === 1, 'first reveal');
    await flush(300);
    expect(FakeAudio.played).toHaveLength(0); // play still running: no spoilers

    whistle = true;
    await until(() => FakeAudio.played.length === 1, 'call at the whistle');
    await flush(100);
    expect(shown).toEqual([0]); // call over, sim still finishing

    simRunning = false;
    await until(() => done, 'done', 3000);
    expect(shown).toEqual([0, 1, 2]);
  }, 6000);

  it('seek cuts off the current call and carries on from the new spot', async () => {
    await start({ postClipDelayMs: () => 40 });
    await until(() => shown.length === 1, 'first play');
    await act(async () => { b.seek(2); });
    await until(() => done, 'done');
    expect(shown).toEqual([0, 2]);
  });
});
