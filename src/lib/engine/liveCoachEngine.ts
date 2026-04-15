/**
 * Live Coach Engine — a stateful, lazy simulator for real-time play calling.
 *
 * Unlike `simulatePlayByPlay()` which pre-computes the entire game upfront,
 * this engine generates one play at a time and accepts user play call
 * overrides. It produces `PlayEvent` objects that are visually compatible
 * with the existing live game playback UI.
 *
 * The play physics here are intentionally simpler than playByPlay.ts — we
 * favor responsiveness and clear cause-and-effect over the full feature set
 * (no penalties, no momentum, no McAfee Mode). Stats can be reconciled with
 * the regular sim later.
 */

import type { Player, Team } from '@/types';
import type { PlayEvent } from './playByPlay';
import type { PlayCallType } from '@/components/game/PlayCallMenu';

export interface LiveEngineState {
  quarter: number;
  timeSecs: number;
  possession: 'home' | 'away';
  fieldPos: number;        // yards from own end zone
  down: number;
  yardsToGo: number;
  homeScore: number;
  awayScore: number;
  isGameOver: boolean;
  twoMinWarningQ2Fired: boolean;
  twoMinWarningQ4Fired: boolean;
  overtime: boolean;
  /** When true, the engine is waiting for an XP/2PT choice after a user TD */
  awaitingXpChoice: boolean;
  /** Timeouts remaining per team per half */
  homeTimeouts: number;
  awayTimeouts: number;
}

export interface LiveCoachEngine {
  /** Run one play (or several if continuation like TD → XP → kickoff). Returns new events. */
  runOnePlay: (userCall?: PlayCallType) => PlayEvent[];
  /** True when the user team has the ball on offense AND it's a regular play (not kickoff/XP). */
  isUserOffense: () => boolean;
  isFinished: () => boolean;
  getState: () => LiveEngineState;
}

// ── Helpers ──

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function gaussian(mean: number, std: number): number {
  const u = Math.max(1e-10, Math.random());
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface KeyOff {
  qb: Player | null;
  rb: Player | null;
  wr1: Player | null;
  wr2: Player | null;
  te: Player | null;
  k: Player | null;
}
interface KeyDef {
  dl1: Player | null;
  lb1: Player | null;
  cb1: Player | null;
}

function extractOff(players: Player[]): KeyOff {
  const byPos = (pos: string) => players.find(p => p.position === pos && (!p.injury || p.injury.weeksLeft === 0)) ?? null;
  const wrs = players.filter(p => p.position === 'WR' && (!p.injury || p.injury.weeksLeft === 0));
  return {
    qb: byPos('QB'),
    rb: byPos('RB'),
    wr1: wrs[0] ?? null,
    wr2: wrs[1] ?? null,
    te: byPos('TE'),
    k: byPos('K'),
  };
}

function extractDef(players: Player[]): KeyDef {
  const byPos = (pos: string) => players.find(p => p.position === pos && (!p.injury || p.injury.weeksLeft === 0)) ?? null;
  return {
    dl1: byPos('DL'),
    lb1: byPos('LB'),
    cb1: byPos('CB'),
  };
}

function rating(p: Player | null, key: keyof Player['ratings'], fallback = 70): number {
  return p ? p.ratings[key] : fallback;
}

function nameOrFallback(p: Player | null, fallback: string): string {
  if (!p) return fallback;
  return `${p.firstName[0]}. ${p.lastName}`;
}

// ── Engine factory ──

export function createLiveCoachEngine(
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  initialState: LiveEngineState,
  /** Which side the user controls — needed to determine user TDs for XP choice */
  userSide: 'home' | 'away' = 'home',
): LiveCoachEngine {
  const homeOff = extractOff(homePlayers);
  const awayOff = extractOff(awayPlayers);
  const homeDef = extractDef(homePlayers);
  const awayDef = extractDef(awayPlayers);

  const state: LiveEngineState = {
    ...initialState,
    awaitingXpChoice: initialState.awaitingXpChoice ?? false,
    homeTimeouts: initialState.homeTimeouts ?? 3,
    awayTimeouts: initialState.awayTimeouts ?? 3,
  };
  let nextEventId = 100000; // start high to avoid colliding with pre-computed event ids

  // ── Event constructor ──
  function makeEvent(
    type: PlayEvent['type'],
    description: string,
    yardsGained: number,
    isScoring: boolean,
    overrideFieldPos?: number,
  ): PlayEvent {
    return {
      id: nextEventId++,
      type,
      description,
      quarter: state.quarter,
      timeStr: formatTime(state.timeSecs),
      possession: state.possession,
      fieldPos: overrideFieldPos ?? state.fieldPos,
      down: state.down,
      yardsToGo: state.yardsToGo,
      yardsGained,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      isScoring,
    };
  }

  function offKey(): KeyOff { return state.possession === 'home' ? homeOff : awayOff; }
  function defKey(): KeyDef { return state.possession === 'home' ? awayDef : homeDef; }

  function advanceClock(secs: number) {
    state.timeSecs = Math.max(0, state.timeSecs - secs);
  }

  function switchPossession(newFieldPos = 25) {
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.fieldPos = newFieldPos;
    state.down = 1;
    state.yardsToGo = 10;
  }

  function addScore(points: number) {
    if (state.possession === 'home') state.homeScore += points;
    else state.awayScore += points;
  }

  function checkQuarterEnd(events: PlayEvent[]) {
    if (state.timeSecs > 0 || state.overtime) return;
    if (state.quarter === 2) {
      events.push(makeEvent('quarter_end', 'End of the second quarter.', 0, false));
      events.push(makeEvent('halftime', `Halftime — ${homeTeam.abbreviation} ${state.homeScore}, ${awayTeam.abbreviation} ${state.awayScore}.`, 0, false));
      state.quarter = 3;
      state.timeSecs = 900;
      state.twoMinWarningQ2Fired = false;
      // Reset timeouts for the second half
      state.homeTimeouts = 3;
      state.awayTimeouts = 3;
      // Second-half kickoff
      doKickoffEvents(events);
    } else if (state.quarter === 4) {
      events.push(makeEvent('quarter_end', 'End of the fourth quarter.', 0, false));
      if (state.homeScore === state.awayScore) {
        state.overtime = true;
        state.timeSecs = 600;
        events.push(makeEvent('overtime', 'Overtime! First score wins.', 0, false));
        doKickoffEvents(events);
      } else {
        endGame(events);
      }
    } else {
      events.push(makeEvent('quarter_end', `End of Q${state.quarter}.`, 0, false));
      state.quarter += 1;
      state.timeSecs = 900;
    }
  }

  function endGame(events: PlayEvent[]) {
    if (state.isGameOver) return;
    state.isGameOver = true;
    events.push(makeEvent(
      'final',
      `Final Score — ${homeTeam.abbreviation} ${state.homeScore}, ${awayTeam.abbreviation} ${state.awayScore}.`,
      0,
      false,
    ));
  }

  function doKickoffEvents(events: PlayEvent[]) {
    events.push(makeEvent('kickoff', 'Kickoff fielded at the 25.', 0, false, 25));
    switchPossession(25);
  }

  function checkTwoMinWarning(events: PlayEvent[]) {
    if (state.quarter === 2 && !state.twoMinWarningQ2Fired && state.timeSecs <= 120) {
      state.twoMinWarningQ2Fired = true;
      events.push(makeEvent('two_minute_warning', 'Two-minute warning.', 0, false));
    } else if (state.quarter === 4 && !state.twoMinWarningQ4Fired && state.timeSecs <= 120) {
      state.twoMinWarningQ4Fired = true;
      events.push(makeEvent('two_minute_warning', 'Two-minute warning in the fourth quarter!', 0, false));
    }
  }

  // ── Play execution ──

  function runRunPlay(events: PlayEvent[], rusherOverride?: 'rb' | 'qb', callPrefix = '') {
    const ok = offKey();
    const dk = defKey();
    const isQb = rusherOverride === 'qb' || (!rusherOverride && Math.random() < 0.10);
    const rusher = isQb ? ok.qb : ok.rb;
    const skill = isQb
      ? rating(rusher, 'speed', 60) * 0.5 + rating(rusher, 'agility', 60) * 0.3 + rating(rusher, 'carrying', 50) * 0.2
      : rating(rusher, 'carrying', 70) * 0.5 + rating(rusher, 'speed', 70) * 0.3 + rating(rusher, 'agility', 70) * 0.2;
    const defStop = rating(dk.lb1, 'tackling', 70) * 0.5 + rating(dk.dl1, 'strength', 70) * 0.5;

    let yards = Math.round((skill - defStop) / 12 + gaussian(3, 2));
    // Big run chance
    if (Math.random() < 0.06) yards += 8 + Math.floor(Math.random() * 12);
    // Loss chance
    if (Math.random() < 0.12 && yards > 0) yards = -(1 + Math.floor(Math.random() * 3));
    yards = clamp(yards, -5, 60);

    // Goal line
    if (state.fieldPos >= 95 && Math.random() < 0.50) yards = 100 - state.fieldPos;

    const newPos = state.fieldPos + yards;
    const isTD = newPos >= 100;
    const finalYards = isTD ? 100 - state.fieldPos : yards;

    const name = nameOrFallback(rusher, 'the back');
    const prefix = callPrefix ? `${callPrefix} — ` : '';
    const desc = isTD
      ? `${prefix}${name} runs it in for a ${finalYards}-yard TOUCHDOWN!`
      : finalYards > 10
        ? `${prefix}${name} breaks free for ${finalYards} yards!`
        : finalYards > 0
          ? `${prefix}${name} runs for ${finalYards} yard${finalYards !== 1 ? 's' : ''}.`
          : finalYards === 0
            ? `${prefix}${name} stuffed at the line for no gain.`
            : `${prefix}${name} loses ${Math.abs(finalYards)} on the play.`;

    events.push(makeEvent('run', desc, finalYards, isTD));

    if (isTD) {
      handleTouchdown(events, state.possession === userSide);
    } else {
      state.fieldPos = clamp(newPos, 1, 99);
      state.yardsToGo -= finalYards;
      if (advanceDown() === 'turnover_on_downs') {
        handleTurnoverOnDowns(events);
        return;
      }
      advanceClock(35);
    }
  }

  function runPassPlay(events: PlayEvent[], depth: 'short' | 'deep' | 'screen' = 'short', callPrefix = '') {
    const ok = offKey();
    const dk = defKey();
    const target = depth === 'screen' ? ok.rb : (Math.random() < 0.6 ? ok.wr1 : (ok.wr2 ?? ok.te));

    // Sack chance based on depth and pass rush
    const sackChance = depth === 'deep' ? 0.10 : depth === 'short' ? 0.05 : 0.02;
    const prefix = callPrefix ? `${callPrefix} — ` : '';
    if (Math.random() < sackChance) {
      const sackYards = -(3 + Math.floor(Math.random() * 5));
      const qbName = nameOrFallback(ok.qb, 'the QB');
      events.push(makeEvent('sack', `${prefix}${qbName} is sacked for a loss of ${Math.abs(sackYards)}.`, sackYards, false));
      state.fieldPos = clamp(state.fieldPos + sackYards, 1, 99);
      state.yardsToGo -= sackYards;
      if (advanceDown() === 'turnover_on_downs') {
        handleTurnoverOnDowns(events);
        return;
      }
      advanceClock(35);
      return;
    }

    // INT chance — higher for deep shots
    const intChance = depth === 'deep' ? 0.06 : depth === 'short' ? 0.025 : 0.015;
    if (Math.random() < intChance) {
      const qbName = nameOrFallback(ok.qb, 'the QB');
      const cbName = nameOrFallback(dk.cb1, 'the corner');
      events.push(makeEvent('interception', `${prefix}INTERCEPTED! ${cbName} picks off ${qbName}.`, 0, false));
      const returnPos = clamp(100 - state.fieldPos + Math.floor(Math.random() * 20) - 10, 10, 60);
      switchPossession(returnPos);
      advanceClock(8);
      return;
    }

    // Completion check
    const compRate = depth === 'deep' ? 0.45 : depth === 'short' ? 0.70 : 0.78;
    const isComplete = Math.random() < compRate;

    if (isComplete) {
      let yards: number;
      if (depth === 'deep') yards = Math.round(15 + gaussian(8, 6));
      else if (depth === 'short') yards = Math.round(7 + gaussian(2, 3));
      else yards = Math.round(4 + gaussian(2, 2)); // screen
      yards = clamp(yards, 1, 75);

      // Big play
      if (Math.random() < 0.05) yards += 10 + Math.floor(Math.random() * 15);

      const newPos = state.fieldPos + yards;
      const isTD = newPos >= 100;
      const finalYards = isTD ? 100 - state.fieldPos : yards;

      const qbName = nameOrFallback(ok.qb, 'the QB');
      const recName = nameOrFallback(target, 'the receiver');
      const desc = isTD
        ? `${prefix}${qbName} hits ${recName} for a ${finalYards}-yard TOUCHDOWN!`
        : finalYards >= 20
          ? `${prefix}${qbName} fires deep to ${recName} — ${finalYards} yards!`
          : `${prefix}${qbName} completes to ${recName} for ${finalYards} yard${finalYards !== 1 ? 's' : ''}.`;

      events.push(makeEvent('pass_complete', desc, finalYards, isTD));

      if (isTD) {
        handleTouchdown(events, state.possession === userSide);
      } else {
        state.fieldPos = clamp(newPos, 1, 99);
        state.yardsToGo -= finalYards;
        if (advanceDown() === 'turnover_on_downs') {
          handleTurnoverOnDowns(events);
          return;
        }
        advanceClock(28);
      }
    } else {
      const qbName = nameOrFallback(ok.qb, 'the QB');
      const recName = nameOrFallback(target, 'the receiver');
      events.push(makeEvent('pass_incomplete', `${prefix}${qbName}'s pass to ${recName} falls incomplete.`, 0, false));
      if (advanceDown() === 'turnover_on_downs') {
        handleTurnoverOnDowns(events);
        return;
      }
      advanceClock(6); // clock stops on incomplete
    }
  }

  function handleTouchdown(events: PlayEvent[], isUserTd = false) {
    addScore(6);
    if (isUserTd) {
      // User scored — set flag so the engine pauses for XP/2PT choice
      state.awaitingXpChoice = true;
      // Don't do XP or kickoff yet — wait for user's call
    } else {
      // Opponent scored — auto-pick XP
      const k = offKey().k;
      const epGood = Math.random() < 0.95;
      if (epGood) addScore(1);
      events.push(makeEvent('extra_point', epGood ? 'Extra point is GOOD.' : 'Extra point is no good!', 0, false));
      doKickoffEvents(events);
    }
  }

  function runExtraPoint(events: PlayEvent[]) {
    const k = offKey().k;
    const epGood = Math.random() < 0.95;
    if (epGood) addScore(1);
    events.push(makeEvent('extra_point', epGood ? 'Extra point is GOOD.' : 'Extra point is no good!', 0, false));
    state.awaitingXpChoice = false;
    doKickoffEvents(events);
  }

  function runTwoPointConversion(events: PlayEvent[]) {
    const ok = offKey();
    const success = Math.random() < 0.48; // NFL average ~48%
    if (success) {
      addScore(2);
      const qbName = nameOrFallback(ok.qb, 'the QB');
      events.push(makeEvent('extra_point', `Two-point conversion is GOOD! ${qbName} finds the end zone!`, 0, false));
    } else {
      const qbName = nameOrFallback(ok.qb, 'the QB');
      events.push(makeEvent('extra_point', `Two-point conversion FAILS. ${qbName} comes up short.`, 0, false));
    }
    state.awaitingXpChoice = false;
    doKickoffEvents(events);
  }

  function callTimeout(events: PlayEvent[]) {
    const isUser = state.possession === (initialState as LiveEngineState).possession; // approximate
    if (state.possession === 'home' && state.homeTimeouts > 0) {
      state.homeTimeouts--;
      events.push(makeEvent('run', `⏱️ Timeout called by ${homeTeam.abbreviation}. (${state.homeTimeouts} remaining)`, 0, false));
    } else if (state.possession === 'away' && state.awayTimeouts > 0) {
      state.awayTimeouts--;
      events.push(makeEvent('run', `⏱️ Timeout called by ${awayTeam.abbreviation}. (${state.awayTimeouts} remaining)`, 0, false));
    }
  }

  function runFieldGoal(events: PlayEvent[]) {
    const ok = offKey();
    const distance = (100 - state.fieldPos) + 17;
    const k = ok.k;
    const kickerRating = rating(k, 'kicking', 70);
    const successProb = clamp(0.95 - Math.max(0, distance - 30) * 0.025 + (kickerRating - 70) / 100 * 0.15, 0.35, 0.98);
    const good = Math.random() < successProb;
    const kName = nameOrFallback(k, 'the kicker');
    if (good) {
      events.push(makeEvent('field_goal_good', `🏹 Field Goal — ${kName} drills the ${distance}-yarder! ✅`, 0, true));
      addScore(3);
      doKickoffEvents(events);
    } else {
      events.push(makeEvent('field_goal_miss', `🏹 Field Goal — ${kName}'s ${distance}-yard attempt is no good.`, 0, false));
      const returnPos = Math.max(20, state.fieldPos);
      switchPossession(100 - returnPos);
    }
    advanceClock(15);
  }

  function runPunt(events: PlayEvent[]) {
    const puntYards = clamp(Math.round(gaussian(43, 7)), 25, 65);
    const returnPos = clamp(100 - state.fieldPos - puntYards, 5, 50);
    const receivingAbbr = state.possession === 'home' ? awayTeam.abbreviation : homeTeam.abbreviation;
    const returnYds = Math.floor(Math.random() * 8);
    const finalPos = Math.min(returnPos + returnYds, 50);
    events.push(makeEvent('punt', `🥾 Punt — ${puntYards} yards, ${receivingAbbr} fields at their own ${returnPos}${returnYds > 0 ? `, returns to the ${finalPos}` : ', fair catch'}.`, puntYards, false));
    switchPossession(finalPos);
    advanceClock(15);
  }

  function advanceDown(): 'continue' | 'turnover_on_downs' {
    if (state.yardsToGo <= 0) {
      state.down = 1;
      state.yardsToGo = Math.min(10, 100 - state.fieldPos);
      return 'continue';
    } else {
      state.down++;
      if (state.down > 4) {
        // Turnover on downs — flip possession at the current spot
        return 'turnover_on_downs';
      }
      return 'continue';
    }
  }

  function handleTurnoverOnDowns(events: PlayEvent[]) {
    const newFieldPos = Math.max(20, 100 - state.fieldPos);
    events.push(makeEvent('run', 'Turnover on downs! The defense takes over.', 0, false));
    switchPossession(newFieldPos);
  }

  // ── Main runOnePlay ──
  function runOnePlay(userCall?: PlayCallType): PlayEvent[] {
    const events: PlayEvent[] = [];
    if (state.isGameOver) return events;

    // Handle XP/2PT choice first if awaiting
    if (state.awaitingXpChoice) {
      if (userCall === 'extra_point' as PlayCallType) {
        runExtraPoint(events);
        return events;
      } else if (userCall === 'two_point' as PlayCallType) {
        runTwoPointConversion(events);
        return events;
      } else if (!userCall) {
        // AI auto-picks XP
        runExtraPoint(events);
        return events;
      }
      // If user sent a different call while awaiting XP, default to XP
      runExtraPoint(events);
      return events;
    }

    // Handle timeout call
    if (userCall === 'timeout' as PlayCallType) {
      callTimeout(events);
      return events;
    }

    checkTwoMinWarning(events);
    if (state.timeSecs <= 0) {
      checkQuarterEnd(events);
      return events;
    }

    // 4th down — handle user override or default decision
    if (state.down === 4 && !userCall) {
      // Default AI 4th down logic
      const distanceToGoal = 100 - state.fieldPos;
      const fgDist = distanceToGoal + 17;
      if (state.yardsToGo <= 2 || (state.yardsToGo <= 4 && state.fieldPos >= 60)) {
        // go for it (fall through to play call)
      } else if (state.fieldPos >= 55 && fgDist <= 55) {
        runFieldGoal(events);
        checkQuarterEnd(events);
        return events;
      } else {
        runPunt(events);
        checkQuarterEnd(events);
        return events;
      }
    }

    // User 4th down override
    if (state.down === 4 && userCall === 'field_goal') {
      runFieldGoal(events);
      checkQuarterEnd(events);
      return events;
    }
    if (state.down === 4 && userCall === 'punt') {
      runPunt(events);
      checkQuarterEnd(events);
      return events;
    }
    // 'go_for_it' falls through to a normal play (default to pass_short)

    // Determine play type
    let playType: 'run' | 'pass_short' | 'pass_deep' | 'qb_run' | 'screen';
    if (userCall === 'run') playType = 'run';
    else if (userCall === 'pass_short') playType = 'pass_short';
    else if (userCall === 'pass_deep') playType = 'pass_deep';
    else if (userCall === 'qb_run') playType = 'qb_run';
    else if (userCall === 'screen') playType = 'screen';
    else if (userCall === 'go_for_it') playType = 'pass_short'; // default for 'go for it'
    else {
      // No user call — pick by down/distance
      const isThirdLong = state.down === 3 && state.yardsToGo >= 7;
      const isShortYardage = state.yardsToGo <= 3;
      const passChance = isThirdLong ? 0.85 : isShortYardage ? 0.45 : 0.58;
      playType = Math.random() < passChance
        ? (Math.random() < 0.25 ? 'pass_deep' : 'pass_short')
        : 'run';
    }

    // Play-call-aware icon prefixes for descriptions
    const CALL_ICONS: Record<string, string> = {
      run: '🏃 Run', pass_short: '🎯 Short Pass', pass_deep: '🚀 Deep Shot',
      qb_run: '⚡ QB Scramble', screen: '🛡️ Screen',
    };
    const callPrefix = userCall ? (CALL_ICONS[playType] ?? '') : '';

    // Execute the play
    if (playType === 'run') runRunPlay(events, undefined, callPrefix);
    else if (playType === 'qb_run') runRunPlay(events, 'qb', callPrefix);
    else if (playType === 'pass_short') runPassPlay(events, 'short', callPrefix);
    else if (playType === 'pass_deep') runPassPlay(events, 'deep', callPrefix);
    else runPassPlay(events, 'screen', callPrefix);

    checkQuarterEnd(events);

    // OT end check
    if (state.overtime && state.homeScore !== state.awayScore) {
      endGame(events);
    }
    if (state.overtime && state.timeSecs <= 0 && state.homeScore === state.awayScore) {
      // Regular season tie after OT
      endGame(events);
    }

    // Safety: if Q4 is over with tied score and OT wasn't triggered, force it
    if (!state.overtime && !state.isGameOver && state.quarter === 4 && state.timeSecs <= 0 && state.homeScore === state.awayScore) {
      state.overtime = true;
      state.timeSecs = 600;
      state.quarter = 5;
      events.push(makeEvent('overtime', 'Overtime! First score wins.', 0, false));
      doKickoffEvents(events);
    }

    return events;
  }

  return {
    runOnePlay,
    isUserOffense: () => false, // caller knows; this is here for completeness
    isFinished: () => state.isGameOver,
    getState: () => ({ ...state }),
  };
}
