'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { trackEvent } from '@bs/core/analytics/track';
import {
  encodeShareQuery,
  parseQuickStart,
  parseShareQuery,
  parseTeamPreselect,
  randomSeed,
  replayDraft,
  type DraftSettings,
  type MockDraftData,
  type MockRounds,
} from '@/lib/mockDraft/engine';
import { Button } from '@/components/ui/Button';
import { DraftScreen } from './DraftScreen';
import { ResultsScreen } from './ResultsScreen';
import { SetupScreen, type Speed } from './SetupScreen';

const AI_PICK_MS: Record<Exclude<Speed, 'instant'>, number> = { fast: 150, slow: 700 };

interface SetupState {
  screen: 'setup';
  notice: string | null;
  rounds: MockRounds;
  userTids: number[];
  speed: Speed;
}

interface DraftState {
  screen: 'draft';
  settings: DraftSettings;
  speed: Speed;
  userPicks: number[];
  /** How many of the replay's picks are on screen. The rest are AI picks still "on the clock". */
  revealed: number;
  paused: boolean;
  /** Opened from a share link, so it shouldn't count as a completed mock. */
  fromShare: boolean;
  /** One-line note above the board, e.g. the prospect picked on a team page was already gone. */
  notice: string | null;
  /** Opened straight from a team page (`go=1`), tracked once on mount. */
  quickStart: { team: string; prefilled: boolean } | null;
}

type State = SetupState | DraftState;

type Action =
  | { type: 'start'; settings: DraftSettings; speed: Speed }
  | { type: 'pick'; pid: number; picksSoFar: number }
  | { type: 'tick' }
  | { type: 'simToUser'; picksSoFar: number }
  | { type: 'togglePause' }
  | { type: 'undo'; revealed: number }
  | { type: 'restart' };

function reducer(state: State, action: Action): State {
  if (action.type === 'start') {
    return { screen: 'draft', settings: action.settings, speed: action.speed, userPicks: [], revealed: 0, paused: false, fromShare: false, notice: null, quickStart: null };
  }
  if (state.screen !== 'draft') return state;
  switch (action.type) {
    case 'pick':
      return { ...state, userPicks: [...state.userPicks, action.pid], revealed: action.picksSoFar + 1 };
    case 'tick':
      return { ...state, revealed: state.revealed + 1 };
    case 'simToUser':
      return { ...state, revealed: action.picksSoFar, paused: false };
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'undo':
      return { ...state, userPicks: state.userPicks.slice(0, -1), revealed: action.revealed, paused: false };
    case 'restart':
      return {
        screen: 'setup',
        notice: null,
        rounds: state.settings.rounds,
        userTids: state.settings.userTids,
        speed: state.speed,
      };
  }
}

function initialState(data: MockDraftData, initialQuery: string): State {
  const setup: SetupState = { screen: 'setup', notice: null, rounds: 1, userTids: [], speed: 'fast' };
  const params = new URLSearchParams(initialQuery);
  const share = parseShareQuery(data, params);
  if (share.kind === 'ok') {
    return {
      screen: 'draft',
      settings: share.settings,
      speed: 'instant',
      userPicks: share.userPicks,
      revealed: share.replay.picks.length,
      paused: false,
      fromShare: true,
      notice: null,
      quickStart: null,
    };
  }
  if (share.kind === 'stale') {
    return {
      ...setup,
      notice: 'This mock used an older draft order, so it can’t be replayed. Your settings are ready below if you want to run it again.',
      rounds: share.hint.rounds ?? setup.rounds,
      userTids: share.hint.userTids,
    };
  }
  // `?team=bears&go=1[&pick=<pid>]` from a team page: straight into the draft, no setup screen.
  const quick = parseQuickStart(data, params, randomSeed());
  if (quick) {
    return {
      screen: 'draft',
      settings: quick.settings,
      speed: 'fast',
      userPicks: quick.userPicks,
      revealed: 0,
      paused: false,
      fromShare: false,
      notice: quick.goneNotice,
      quickStart: { team: params.get('team') ?? '', prefilled: quick.prefilled },
    };
  }
  // `?team=bears` (older links): open setup with that team picked.
  const preselect = parseTeamPreselect(data, params);
  return preselect ? { ...setup, ...preselect } : setup;
}

function MockDraftSession({ data, asOf, initialQuery }: { data: MockDraftData; asOf: string; initialQuery: string }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(data, initialQuery));
  const drafting = state.screen === 'draft' ? state : null;
  const settings = drafting?.settings;
  const userPicks = drafting?.userPicks;

  const replay = useMemo(
    () => (settings && userPicks ? replayDraft(data, settings, userPicks) : null),
    [data, settings, userPicks],
  );

  const picksSoFar = replay?.picks.length ?? 0;
  const visibleCount = drafting ? (drafting.speed === 'instant' ? picksSoFar : Math.min(drafting.revealed, picksSoFar)) : 0;
  const animating = visibleCount < picksSoFar;
  const finished = Boolean(replay?.complete && !animating);

  // Reveal AI picks one at a time. The picks are already decided, so speed and
  // pausing only change what's on screen, never the results.
  const speed = drafting?.speed;
  const paused = drafting?.paused;
  useEffect(() => {
    if (!animating || paused || !speed || speed === 'instant') return;
    const timer = setTimeout(() => dispatch({ type: 'tick' }), AI_PICK_MS[speed]);
    return () => clearTimeout(timer);
  }, [animating, paused, speed, visibleCount]);

  // A finished mock lives in the URL, so a reload keeps it and the address bar is shareable.
  const shareQuery = finished && settings && userPicks ? encodeShareQuery(data, settings, userPicks) : null;
  useEffect(() => {
    if (shareQuery) window.history.replaceState(null, '', `/mock-draft?${shareQuery}`);
  }, [shareQuery]);

  // A team-page quick start skips handleStart, so log its start here, once.
  const quickStart = drafting?.quickStart ?? null;
  const trackedQuickStart = useRef(false);
  useEffect(() => {
    if (!quickStart || !settings || trackedQuickStart.current) return;
    trackedQuickStart.current = true;
    trackEvent('mock_draft_start', {
      rounds: settings.rounds,
      teams: settings.userTids.length,
      speed: 'fast',
      source: 'team_page',
      team: quickStart.team,
      prefilled: quickStart.prefilled,
      pick_gone: Boolean(drafting?.notice),
    });
  }, [quickStart, settings, drafting?.notice]);

  const fromShare = drafting?.fromShare;
  const trackedCompletion = useRef<string | null>(null);
  useEffect(() => {
    if (!shareQuery || !settings || fromShare || trackedCompletion.current === shareQuery) return;
    trackedCompletion.current = shareQuery;
    trackEvent('mock_draft_complete', { rounds: settings.rounds, teams: settings.userTids.length });
  }, [shareQuery, settings, fromShare]);

  function handleStart(next: { rounds: MockRounds; userTids: number[]; speed: Speed }) {
    const nextSettings: DraftSettings = { seed: randomSeed(), rounds: next.rounds, userTids: next.userTids };
    trackEvent('mock_draft_start', { rounds: next.rounds, teams: next.userTids.length, speed: next.speed });
    window.history.replaceState(null, '', '/mock-draft');
    dispatch({ type: 'start', settings: nextSettings, speed: next.speed });
  }

  function handleRestart() {
    window.history.replaceState(null, '', '/mock-draft');
    dispatch({ type: 'restart' });
  }

  function handleUndo() {
    if (!replay || !settings || !userPicks?.length) return;
    // Index of the last user pick: replaying without it puts that same slot back on the clock.
    const revealed = replay.picks.findLastIndex((p) => p.isUser);
    dispatch({ type: 'undo', revealed });
  }

  if (state.screen === 'setup') {
    return (
      <SetupScreen
        data={data}
        notice={state.notice}
        initialRounds={state.rounds}
        initialUserTids={state.userTids}
        initialSpeed={state.speed}
        onStart={handleStart}
      />
    );
  }

  if (!replay || replay.invalid) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-[var(--text)] mb-3">Something went wrong replaying this draft.</p>
        <Button onClick={handleRestart}>Start over</Button>
      </div>
    );
  }

  if (finished && shareQuery) {
    return (
      <ResultsScreen
        data={data}
        settings={state.settings}
        replay={replay}
        asOf={asOf}
        shareQuery={shareQuery}
        onRunAnother={handleRestart}
      />
    );
  }

  return (
    <>
      {state.notice && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{state.notice}</p>
      )}
      <DraftScreen
      data={data}
      settings={state.settings}
      replay={replay}
      visibleCount={visibleCount}
      speed={state.speed}
      paused={state.paused}
      canUndo={state.userPicks.length > 0}
      onDraft={(pid) => dispatch({ type: 'pick', pid, picksSoFar })}
      onSimToUser={() => dispatch({ type: 'simToUser', picksSoFar })}
      onTogglePause={() => dispatch({ type: 'togglePause' })}
      onUndo={handleUndo}
      onRestart={handleRestart}
      />
    </>
  );
}

/** Loads the data file, then hands off to the session. This is the only data the tool fetches. */
export function MockDraftTool({ asOf, initialQuery }: { asOf: string; initialQuery: string }) {
  const [data, setData] = useState<MockDraftData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/mock/nfl-2027.json?v=${encodeURIComponent(asOf)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<MockDraftData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [asOf, attempt]);

  if (data) return <MockDraftSession data={data} asOf={asOf} initialQuery={initialQuery} />;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]">
      {failed ? (
        <>
          <p className="mb-3">We couldn&apos;t load the draft board. Check your connection and try again.</p>
          <Button
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </>
      ) : (
        'Loading the draft board…'
      )}
    </div>
  );
}
