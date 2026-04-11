# Live Play Calling — Part B Plan

**Status:** Planning
**Estimated effort:** 1 focused session (~3-5 hours)
**Last updated:** 2026-04-11

Real-time play calling during Watch Live, with toggleable hybrid mode so
users can sim freely AND drop into manual control whenever they want.

---

## User-facing flow

1. User clicks **Watch Live** → existing pre-game GamePlanModal still works
2. Game starts in normal Watch Live mode (current behavior — auto-plays at chosen speed)
3. **NEW: "Live Coach" toggle button** on the playback control bar
4. When Live Coach is **OFF** → game runs as it does today
5. When Live Coach is **ON** → on every user-team offensive snap, the sim pauses and shows a play call menu
6. User picks play type → sim runs that play → may pause again on next snap
7. **At any time** the user can:
   - Toggle Live Coach OFF → game returns to auto-play
   - Click **"Auto-sim to End"** → exit Live Coach AND fast-forward to the final whistle
8. The user can ALSO toggle Live Coach ON mid-game (e.g. after watching the first half on auto, take over for Q4)

---

## Architecture change: resumable simulation

**Today:** `simulatePlayByPlay()` runs the entire game in a tight loop and returns a complete `LiveGameResult` with all events. The game page just plays back the events.

**New model:** Convert it into a **stateful generator** that can yield one play at a time, accept external input, and resume.

### New types

```ts
// src/lib/engine/playByPlay.ts

export interface PlayCallChoice {
  /** Which kind of play the user is calling */
  type: 'run' | 'pass_short' | 'pass_deep' | 'qb_run' | 'screen' | 'punt' | 'field_goal' | 'go_for_it';
  /** Optional intended target receiver index (0=WR1, 1=WR2, 2=WR3, 3=TE, 4=RB) */
  target?: number;
}

export interface LiveGameSimulator {
  /** Current state snapshot — game phase, score, possession, down/distance, field position */
  state: GameState;
  /** Run one play. If a userPlayCall is provided, the sim uses it; otherwise picks via AI/game plan. */
  runOneSnap: (userPlayCall?: PlayCallChoice) => PlayEvent[];
  /** Run plays until the next user-team offensive snap (for hybrid auto-then-manual). */
  runUntilUserSnap: () => PlayEvent[];
  /** Run all remaining plays to the end of the game. */
  runToEnd: () => PlayEvent[];
  /** Whether the game has ended. */
  isFinished: () => boolean;
}

export function createLiveGameSimulator(
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  isPlayoff: boolean,
  mcafeeMode: boolean,
  userGamePlan?: LiveGamePlan,
): LiveGameSimulator;
```

### Implementation

The current `simulatePlayByPlay` body becomes the internals of the simulator
class/object. Instead of a single big `for` loop, the play-running function is
extracted into `runOneSnap()`. State (`quarter`, `timeSecs`, `momentum`, etc.)
lives on the simulator object instead of a local variable.

`runOneSnap(userPlayCall)`:
- If `userPlayCall` is provided, override the AI play decision with the user's choice
- For `pass_short`/`pass_deep`/`pass`: bias completion math accordingly
- For `run`/`qb_run`/`screen`: bias yardage and big-play chance
- For `punt`/`field_goal`/`go_for_it`: short-circuit the 4th down decision
- Generate events for the play
- Advance state (clock, down, possession, etc.)
- Return the new events

`runUntilUserSnap()`:
- Loop calling `runOneSnap()` (with no user call — use AI)
- Stop as soon as it's the user team's next offensive snap
- Return all events generated along the way

`runToEnd()`:
- Loop calling `runOneSnap()` until the game ends
- Return all events generated along the way

### Backwards compatibility

Keep the existing `simulatePlayByPlay()` function for code paths that need a
complete one-shot simulation (e.g. simWeek's instant sim should NOT use the
live simulator). It can be a thin wrapper:

```ts
export function simulatePlayByPlay(...args): LiveGameResult {
  const sim = createLiveGameSimulator(...args);
  const events = sim.runToEnd();
  return liveResultFromSim(sim, events);
}
```

---

## UI: Play Call Menu

New component: `src/components/game/PlayCallMenu.tsx`

```tsx
interface PlayCallMenuProps {
  state: {
    quarter: number;
    timeStr: string;
    homeScore: number;
    awayScore: number;
    homeAbbr: string;
    awayAbbr: string;
    down: number;
    yardsToGo: number;
    fieldPos: number;
    fieldDescription: string; // e.g. "OPP 35" or "OWN 22"
  };
  onPlayCall: (choice: PlayCallChoice) => void;
  onAutoSimRest: () => void;
  onToggleOff: () => void;
}
```

Layout:
- **Header**: down/distance + field position + score + clock
- **Body**: 6 big buttons in a grid:
  - 🏃 Run
  - 🎯 Short Pass
  - 🚀 Deep Pass
  - ⚡ QB Scramble
  - 🛡️ Screen
  - 🏈 (4th down only) Field Goal / Punt / Go For It
- **Footer**: "Auto-sim Rest of Game" button + "Turn off Live Coach" button

The menu replaces the playback bar when Live Coach is on AND it's a user
offensive snap. When the user picks, the menu collapses, the sim runs the
play, the play animates, then the menu re-opens for the next snap (unless
the drive ended via TD/turnover/punt — then it auto-runs until the next
user offensive snap).

---

## Game page state changes

`src/app/game/[id]/page.tsx`

Replace the `simRef: useRef<LiveGameResult>` with:

```ts
const simulatorRef = useRef<LiveGameSimulator | null>(null);
const [revealedEvents, setRevealedEvents] = useState<PlayEvent[]>([]);
const [liveCoachMode, setLiveCoachMode] = useState(false);
const [waitingForCall, setWaitingForCall] = useState(false);
```

Initial sim: build the simulator object (cheap — no plays yet).

Auto-play loop (when Live Coach is OFF): repeatedly call `runOneSnap()` and
append events to `revealedEvents`, with the existing speed-based delays.

When Live Coach is ON: instead of auto-running, check if it's the user team's
offensive snap. If yes, set `waitingForCall = true` and stop. If no, run one
snap (auto) and continue.

When user picks: call `runOneSnap(choice)`, append events, then check again.

When user clicks "Auto-sim Rest": call `runToEnd()`, append all events, set
`liveCoachMode = false`.

When user toggles Live Coach OFF mid-game: just resume the auto-play loop.

---

## Settings toggle (optional)

A user setting `liveCoachOnByDefault: boolean` so power users can have it
auto-enabled when they click Watch Live. Default OFF for new users.

---

## Edge cases to handle

- **User team on defense**: never pause for play call (defense is auto-coached)
- **Special teams (punts, kickoffs, FG attempts on user team)**: don't pause
  unless it's a 4th-down decision the user controls
- **Two-minute drill**: optional smart pause that auto-enables Live Coach
  when entering the 2-minute warning of a close game (future enhancement,
  not required for v1)
- **Game ends mid-drive**: ensure the simulator doesn't stall waiting for a
  call after the final whistle
- **Toggle off during waiting state**: clear `waitingForCall`, resume auto

---

## Suggested implementation order

1. **Refactor playByPlay.ts into resumable simulator** (~90 min)
   - Extract `runOneSnap()` from the current loop body
   - Add state object, `isFinished()`, `runToEnd()`, `runUntilUserSnap()`
   - Keep `simulatePlayByPlay()` as a thin wrapper for backwards compat
   - Verify simWeek's instant sim still works identically

2. **Add user play call override to runOneSnap** (~45 min)
   - Accept optional `PlayCallChoice` param
   - Map each choice to the existing simulation paths (skip the AI decision)

3. **Build PlayCallMenu component** (~45 min)
   - Header with situational data
   - 6-button grid
   - Footer with auto-sim and toggle-off

4. **Wire up game page state** (~60 min)
   - Replace the `simRef` and `revealedCount` model with simulator + revealedEvents
   - Auto-play loop driven by `runOneSnap()` instead of pre-computed array
   - Live Coach toggle on the playback control bar
   - Pause-on-user-snap logic

5. **Test paths** (~30 min)
   - Watch full game with Live Coach OFF (should match current behavior)
   - Watch with Live Coach ON from start
   - Toggle on mid-game, then off
   - Auto-sim to end mid-drive
   - User team on defense (no pause)
   - 4th down decisions

---

## What I'd want from you before starting

- Confirm the play type list (Run / Short Pass / Deep Pass / QB Scramble / Screen + 4th down options) — too many or too few?
- Confirm Live Coach mode should be **OFF by default**, with toggle, vs on by default
- Confirm "Auto-sim Rest" should also exit Live Coach mode (recommended) or just sim to end with Live Coach still on for the next game

When you're ready to start, ping me with **"Start Live Play Calling"** and I'll begin with the playByPlay refactor.
