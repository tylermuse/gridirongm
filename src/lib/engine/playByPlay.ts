import type { Player, PlayerStats, GameResult, Team } from '@/types';
import { computeQBTier, getQBTierModifier } from './qbTierPyramid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayType =
  | 'kickoff'
  | 'run'
  | 'pass_complete'
  | 'pass_incomplete'
  | 'sack'
  | 'interception'
  | 'fumble'
  | 'punt'
  | 'field_goal_good'
  | 'field_goal_miss'
  | 'touchdown'
  | 'extra_point'
  | 'penalty'
  | 'quarter_end'
  | 'halftime'
  | 'two_minute_warning'
  | 'overtime'
  | 'final';

export interface PlayEvent {
  id: number;
  type: PlayType;
  description: string;
  quarter: number;
  timeStr: string;
  possession: 'home' | 'away';
  fieldPos: number;     // yards from own end zone (1-99; 99 = opp 1 yd line)
  down: number;
  yardsToGo: number;
  yardsGained: number;
  homeScore: number;
  awayScore: number;
  isScoring: boolean;
}

export interface LiveGameResult {
  events: PlayEvent[];
  homeScore: number;
  awayScore: number;
  playerStats: Record<string, Partial<PlayerStats>>;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function gaussian(mean: number, std: number): number {
  const u = Math.max(1e-10, Math.random());
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Field position formatting
// ---------------------------------------------------------------------------

function fieldPosLabel(pos: number, poss: 'home' | 'away'): string {
  // pos is yards from OWN end zone (1=own goal line, 99=opp 1)
  if (pos >= 50) {
    const oppYard = 100 - pos;
    return `OPP ${oppYard}`;
  }
  return `OWN ${pos}`;
}

// ---------------------------------------------------------------------------
// Player key extraction
// ---------------------------------------------------------------------------

interface KeyPlayers {
  qb: Player | null;
  rb: Player | null;
  wr1: Player | null;
  wr2: Player | null;
  wr3: Player | null;
  te: Player | null;
  ols: Player[];
  dl1: Player | null;
  lb1: Player | null;
  cb1: Player | null;
  cb2: Player | null;
  s1: Player | null;
  k: Player | null;
}

function extractKeyPlayers(players: Player[]): KeyPlayers {
  const byPos = (pos: string) => players.filter(p => p.position === pos && (!p.injury || p.injury.weeksLeft === 0));
  const wrs = byPos('WR');
  const cbs = byPos('CB');
  const safeties = byPos('S');
  return {
    qb: byPos('QB')[0] ?? null,
    rb: byPos('RB')[0] ?? null,
    wr1: wrs[0] ?? null,
    wr2: wrs[1] ?? null,
    wr3: wrs[2] ?? null,
    te: byPos('TE')[0] ?? null,
    ols: byPos('OL'),
    dl1: byPos('DL')[0] ?? null,
    lb1: byPos('LB')[0] ?? null,
    cb1: cbs[0] ?? safeties[0] ?? null,
    cb2: cbs[1] ?? safeties[0] ?? null,
    s1: safeties[0] ?? null,
    k: byPos('K')[0] ?? null,
  };
}

function playerTag(p: Player | null, fallback: string): string {
  if (!p) return fallback;
  const initial = p.firstName ? p.firstName[0] + '.' : '';
  return `${initial} ${p.lastName} ${p.position}`;
}

function rating(p: Player | null, key: keyof Player['ratings'], fallback = 70): number {
  return p ? p.ratings[key] : fallback;
}

// ---------------------------------------------------------------------------
// Description templates
// ---------------------------------------------------------------------------

function descRun(rb: Player | null, yards: number, fieldPosLabel_: string): string {
  const name = playerTag(rb, 'the running back');
  const abs = Math.abs(yards);
  if (yards <= 0) {
    return pick([
      `${name} stuffed at the line for no gain.`,
      `${name} stopped for a loss of ${abs} yard${abs !== 1 ? 's' : ''}.`,
      `Stack at the line — ${name} gains nothing.`,
      `Nowhere to go. ${name} gets swallowed up behind the line.`,
      `The defense blows this one up. ${name} loses ${abs}.`,
    ]);
  }
  if (yards >= 15) {
    return pick([
      `${name} breaks free for a big gain of ${yards} yards!`,
      `${name} takes it ${yards} yards, weaving through traffic!`,
      `Explosive run — ${name} rumbles ${yards} yards!`,
      `Patience from ${name}... finds a crease... bursts through for ${yards} yards!`,
      `Spin move! ${name} makes a defender miss and rips off ${yards}!`,
    ]);
  }
  if (yards >= 8) {
    return pick([
      `${name} grinds forward for ${yards} yards.`,
      `Nice carry by ${name} — ${yards} yards.`,
      `${name} picks up ${yards} on the carry.`,
    ]);
  }
  return pick([
    `${name} runs for ${yards} yard${yards !== 1 ? 's' : ''}.`,
    `${name} pushes ahead for ${yards}.`,
    `Short gain — ${name} gets ${yards}.`,
  ]);
}

function descPassComplete(
  qb: Player | null,
  receiver: Player | null,
  yards: number,
  isLong: boolean,
): string {
  const qbName = playerTag(qb, 'the quarterback');
  const recName = playerTag(receiver, 'the receiver');
  const star = isLong ? ' 🎯' : '';
  if (yards >= 30) {
    return pick([
      `${qbName} airs it out — ${recName} hauls in a massive ${yards}-yard strike!${star}`,
      `Deep ball! ${recName} catches a ${yards}-yarder from ${qbName}!${star}`,
      `${qbName} finds ${recName} deep for ${yards} yards!${star}`,
      `Beautiful throw by ${qbName} — drops it in the bucket to ${recName} for ${yards} yards!${star}`,
      `${recName} gets behind the secondary! ${qbName} delivers a ${yards}-yard bomb!${star}`,
    ]);
  }
  if (yards >= 20) {
    return pick([
      `${qbName} hits ${recName} for ${yards} yards!${star}`,
      `${recName} with the catch, picks up ${yards} yards!${star}`,
      `Big play — ${recName} hauls in a ${yards}-yard pass from ${qbName}.${star}`,
      `Play-action works perfectly. ${qbName} finds ${recName} wide open for ${yards}.${star}`,
      `${qbName} with the touch pass — ${recName} secures it for ${yards}.${star}`,
    ]);
  }
  if (yards >= 10) {
    return pick([
      `${qbName} connects with ${recName} for ${yards} yards.`,
      `Solid gain — ${recName} catches it for ${yards}.`,
      `${recName} grabs the pass and picks up ${yards} yards.`,
      `Timing route — ${qbName} to ${recName} on the out cut. Clean ${yards}-yard pickup.`,
      `${qbName} fires over the middle to ${recName}. ${yards} yards.`,
    ]);
  }
  return pick([
    `${qbName} dumps off to ${recName} for ${yards} yards.`,
    `Short pass — ${recName} gains ${yards}.`,
    `${recName} with the reception, ${yards} yards.`,
  ]);
}

function descPassIncomplete(qb: Player | null, receiver: Player | null): string {
  const qbName = playerTag(qb, 'the quarterback');
  const recName = playerTag(receiver, 'the receiver');
  return pick([
    `Incomplete — ${qbName} misses ${recName} downfield.`,
    `${qbName} overthrows ${recName}. Incomplete.`,
    `Pass falls incomplete, ${recName} couldn't hold on.`,
    `${qbName} intended for ${recName} but it's batted down.`,
  ]);
}

function descSack(qb: Player | null, dl: Player | null, yards: number): string {
  const qbName = playerTag(qb, 'the quarterback');
  const dlName = playerTag(dl, 'the defender');
  return pick([
    `💥 ${dlName} gets home — ${qbName} sacked for ${Math.abs(yards)} yards!`,
    `💥 Sack! ${dlName} brings down ${qbName} for a ${Math.abs(yards)}-yard loss!`,
    `💥 ${qbName} has no time — taken down by ${dlName} for a loss of ${Math.abs(yards)}.`,
    `💥 ${dlName} beats the tackle off the edge and buries ${qbName}!`,
    `💥 Interior pressure! ${dlName} collapses the pocket — ${Math.abs(yards)}-yard loss.`,
    `💥 ${qbName} holds it too long — ${dlName} cleans up for the sack!`,
  ]);
}

function descInterception(qb: Player | null, cb: Player | null): string {
  const qbName = playerTag(qb, 'the quarterback');
  const cbName = playerTag(cb, 'the defender');
  return pick([
    `🚨 Intercepted! ${cbName} picks off ${qbName}!`,
    `🚨 ${qbName} throws into coverage — ${cbName} makes the pick!`,
    `🚨 Turnover! ${cbName} intercepts the pass from ${qbName}!`,
    `🚨 ${cbName} reads ${qbName}'s eyes the whole way — easy interception!`,
    `🚨 ${qbName} forces it into double coverage — ${cbName} makes him pay!`,
    `🚨 Tipped at the line! ${cbName} comes down with the pick!`,
  ]);
}

function descFumble(rb: Player | null, lb: Player | null): string {
  const rbName = playerTag(rb, 'the ball carrier');
  const lbName = playerTag(lb, 'the defender');
  return pick([
    `Fumble! ${rbName} loses the ball — recovered by ${lbName}!`,
    `${lbName} strips ${rbName} — turnover on the field!`,
    `Ball is out! ${rbName} fumbles and ${lbName} pounces on it!`,
  ]);
}

function descPunt(yards: number): string {
  return pick([
    `Punt — ${yards} yards net.`,
    `Kicks it ${yards} yards. The offense takes over.`,
    `Booming ${yards}-yard punt flips the field.`,
  ]);
}

function descFieldGoalGood(yards: number, k: Player | null): string {
  const kName = playerTag(k, 'the kicker');
  return pick([
    `${kName} hits the ${yards}-yard field goal — it's good! 🏈`,
    `Field goal from ${yards} — ${kName} splits the uprights! 🏈`,
    `${kName} boots a ${yards}-yarder through — 3 points! 🏈`,
  ]);
}

function descFieldGoalMiss(yards: number, k: Player | null): string {
  const kName = playerTag(k, 'the kicker');
  return pick([
    `${kName} misses the ${yards}-yard attempt. Wide right!`,
    `No good — ${kName}'s ${yards}-yarder is off the mark.`,
    `${kName} pulls the ${yards}-yard field goal. No good.`,
  ]);
}

function descTouchdown(
  isRush: boolean,
  scorer: Player | null,
  qb: Player | null,
  yards: number,
): string {
  const scorerName = playerTag(scorer, 'the ball carrier');
  const qbName = playerTag(qb, 'the quarterback');
  if (isRush) {
    return pick([
      `🏈 TOUCHDOWN! ${scorerName} punches it in from ${yards} yard${yards !== 1 ? 's' : ''} out!`,
      `🏈 TOUCHDOWN! ${scorerName} crosses the goal line!`,
      `🏈 ${scorerName} scores on the ${yards}-yard rush! TOUCHDOWN!`,
      `🏈 ${scorerName} stretches across the goal line! ${yards}-yard TD!`,
      `🏈 Dive to the pylon by ${scorerName}! TOUCHDOWN!`,
    ]);
  }
  return pick([
    `🏈 TOUCHDOWN! ${qbName} hits ${scorerName} for the ${yards}-yard score!`,
    `🏈 ${scorerName} hauls in the ${yards}-yard pass — TOUCHDOWN!`,
    `🏈 ${qbName} to ${scorerName} — ${yards}-yard TOUCHDOWN! What a throw!`,
    `🏈 ${qbName} rolls right, fires — ${scorerName} makes the grab in the end zone! TOUCHDOWN!`,
    `🏈 END ZONE! ${scorerName} gets in! ${yards}-yard score from ${qbName}!`,
  ]);
}

function descExtraPoint(good: boolean, k: Player | null): string {
  const kName = playerTag(k, 'the kicker');
  return good
    ? `${kName} nails the extra point. PAT is good.`
    : `Extra point is no good — ${kName} misses!`;
}

function descKickoff(): string {
  return pick([
    'Kickoff to start the drive.',
    'Ball put into play on the kickoff.',
    'Kicking team lines up — kickoff.',
  ]);
}

function descPenalty(penaltyName: string, yards: number, side: string): string {
  const dir = yards > 0 ? `${yards}-yard gain` : `${Math.abs(yards)}-yard loss`;
  return pick([
    `🚩 Penalty — ${penaltyName} on the ${side}. ${dir}.`,
    `🚩 Flag on the play! ${penaltyName}. ${dir}.`,
    `🚩 ${penaltyName} called — ${dir} for the offense.`,
  ]);
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

interface GameState {
  quarter: number;
  timeSecs: number;       // seconds left in quarter (starts at 900)
  momentum: number;       // -100 to +100 (negative=away, positive=home)
  possession: 'home' | 'away';
  fieldPos: number;       // yards from own end zone
  down: number;
  yardsToGo: number;
  homeScore: number;
  awayScore: number;
  twoMinWarningQ2Fired: boolean;
  twoMinWarningQ4Fired: boolean;
  overtime: boolean;
}

// ---------------------------------------------------------------------------
// Stat tracking (accumulated during simulation)
// ---------------------------------------------------------------------------

interface StatBucket {
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  receivingTargets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  sacks: number;
  defensiveINTs: number;
  tackles: number;
  fieldGoalAttempts: number;
  fieldGoalsMade: number;
  extraPointAttempts: number;
  extraPointsMade: number;
}

function emptyBucket(): StatBucket {
  return {
    passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
    rushAttempts: 0, rushYards: 0, rushTDs: 0,
    receivingTargets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    sacks: 0, defensiveINTs: 0, tackles: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0,
    extraPointAttempts: 0, extraPointsMade: 0,
  };
}

// ---------------------------------------------------------------------------
// Main simulator
// ---------------------------------------------------------------------------

export function simulatePlayByPlay(
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  isPlayoff: boolean = false,
  mcafeeMode: boolean = false,
): LiveGameResult {
  const homeKey = extractKeyPlayers(homePlayers);
  const awayKey = extractKeyPlayers(awayPlayers);

  // QB tier modifiers: ±3% on completion probability
  const homeQBTierMod = homeKey.qb ? getQBTierModifier(computeQBTier(homeKey.qb)) : 0;
  const awayQBTierMod = awayKey.qb ? getQBTierModifier(computeQBTier(awayKey.qb)) : 0;

  const homeBucket = emptyBucket();
  const awayBucket = emptyBucket();

  const events: PlayEvent[] = [];
  let playId = 0;

  const state: GameState = {
    quarter: 1,
    timeSecs: 900,
    momentum: 0,
    possession: Math.random() < 0.5 ? 'home' : 'away',
    fieldPos: 25,
    down: 1,
    yardsToGo: 10,
    homeScore: 0,
    awayScore: 0,
    twoMinWarningQ2Fired: false,
    twoMinWarningQ4Fired: false,
    overtime: false,
  };

  // Helpers to get current offense/defense key players
  function offKey(): KeyPlayers { return state.possession === 'home' ? homeKey : awayKey; }
  function defKey(): KeyPlayers { return state.possession === 'home' ? awayKey : homeKey; }
  function offBucket(): StatBucket { return state.possession === 'home' ? homeBucket : awayBucket; }
  function defBucket(): StatBucket { return state.possession === 'home' ? awayBucket : homeBucket; }

  function addEvent(
    type: PlayType,
    description: string,
    yardsGained: number,
    isScoring: boolean,
    overrideFieldPos?: number,
  ): PlayEvent {
    const ev: PlayEvent = {
      id: playId++,
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
    events.push(ev);
    return ev;
  }

  function switchPossession(newFieldPos = 25) {
    state.possession = state.possession === 'home' ? 'away' : 'home';
    state.fieldPos = newFieldPos;
    state.down = 1;
    state.yardsToGo = 10;
  }

  function doKickoff() {
    if (mcafeeMode) {
      // Onside kick check: if kicking team is trailing in Q4 with < 5 min
      const kickScore = state.possession === 'home' ? state.homeScore : state.awayScore;
      const recvScore = state.possession === 'home' ? state.awayScore : state.homeScore;
      const shouldOnside = state.quarter >= 4 && state.timeSecs <= 300 && kickScore < recvScore;

      if (shouldOnside && Math.random() < 0.10) {
        // Onside kick recovered!
        addEvent('kickoff', 'ONSIDE KICK — RECOVERED by the kicking team!', 0, false);
        state.fieldPos = 45 + Math.floor(Math.random() * 10);
        state.down = 1;
        state.yardsToGo = 10;
        advanceClock(10);
        return;
      } else if (shouldOnside) {
        addEvent('kickoff', 'Onside kick attempt — receiving team recovers.', 0, false);
        switchPossession(45);
        advanceClock(10);
        return;
      }

      // Normal kickoff with return
      const baseReturn = 20 + Math.floor(Math.random() * 10);
      const returnYards = Math.min(99, baseReturn + Math.floor(Math.random() * 8));

      // 1% kick return TD chance
      if (Math.random() < 0.01) {
        addEvent('kickoff', 'Kick return TOUCHDOWN! Taken all the way back!', 100, true);
        if (state.possession === 'home') state.awayScore += 7;
        else state.homeScore += 7;
        doKickoff(); // re-kick after TD
        return;
      }

      addEvent('kickoff', `Kicking team lines up — kickoff. Returned to the ${returnYards}.`, 0, false);
      switchPossession(returnYards);
      advanceClock(10);
      return;
    }

    addEvent('kickoff', descKickoff(), 0, false, 25);
    // receiving team starts at own 25
    switchPossession(25);
  }

  function shiftMomentum(amount: number) {
    // Positive = toward home, negative = toward away
    const dir = state.possession === 'home' ? 1 : -1;
    state.momentum = Math.max(-100, Math.min(100, state.momentum + amount * dir));
  }

  function decayMomentum() {
    state.momentum *= 0.95; // regress 5% toward zero each play
  }

  function doTouchdown(isRush: boolean, scorer: Player | null, yards: number) {
    const ok = offKey();
    const desc = descTouchdown(isRush, scorer, ok.qb, yards);
    addEvent('touchdown', desc, yards, true);
    shiftMomentum(25); // big momentum swing
    if (state.possession === 'home') {
      state.homeScore += 6;
      homeBucket.passTDs += isRush ? 0 : 1;
      homeBucket.rushTDs += isRush ? 1 : 0;
      if (scorer && !isRush) {
        const recBucket = state.possession === 'home' ? homeBucket : awayBucket;
        recBucket.receivingTDs += 1;
      }
    } else {
      state.awayScore += 6;
      awayBucket.passTDs += isRush ? 0 : 1;
      awayBucket.rushTDs += isRush ? 1 : 0;
    }

    // Extra point or 2-point conversion decision
    const k = ok.k;
    const scoreDiffAfterTD = state.possession === 'home'
      ? state.homeScore - state.awayScore
      : state.awayScore - state.homeScore;

    // Go for 2 when: down by 2 (ties it), down by 5 (makes it 3), down by 8+ late, or up by 1 late (go up 3)
    const goFor2 = scoreDiffAfterTD === -2 || scoreDiffAfterTD === -5 ||
      (scoreDiffAfterTD <= -8 && state.quarter >= 4) ||
      (scoreDiffAfterTD === 1 && state.quarter >= 4 && state.timeSecs <= 300);

    if (goFor2) {
      const twoPointSuccess = Math.random() < 0.48; // NFL average ~48%
      if (twoPointSuccess) {
        if (state.possession === 'home') state.homeScore += 2;
        else state.awayScore += 2;
        addEvent('extra_point', `Two-point conversion is GOOD! ${state.possession === 'home' ? homeTeam.abbreviation : awayTeam.abbreviation} goes for two and gets it!`, 0, false);
      } else {
        addEvent('extra_point', `Two-point conversion FAILS. ${state.possession === 'home' ? homeTeam.abbreviation : awayTeam.abbreviation} comes up short.`, 0, false);
      }
    } else {
      const epGood = Math.random() < 0.95;
      offBucket().extraPointAttempts += 1;
      if (epGood) {
        offBucket().extraPointsMade += 1;
        if (state.possession === 'home') state.homeScore += 1;
        else state.awayScore += 1;
      }
      addEvent('extra_point', descExtraPoint(epGood, k), 0, false);
    }

    // Kick off
    doKickoff();
  }

  function doFieldGoal(distanceYards: number) {
    const ok = offKey();
    const kickerRating = rating(ok.k, 'kicking', 70);
    // Success probability: base 95% from 20yd, decreasing by ~2% per yard beyond 30
    const successProb = clamp(0.95 - Math.max(0, distanceYards - 30) * 0.025 + (kickerRating - 70) / 100 * 0.15, 0.35, 0.98);
    const good = Math.random() < successProb;
    offBucket().fieldGoalAttempts += 1;
    if (good) {
      offBucket().fieldGoalsMade += 1;
      addEvent('field_goal_good', descFieldGoalGood(distanceYards, ok.k), 0, true);
      if (state.possession === 'home') state.homeScore += 3;
      else state.awayScore += 3;
      doKickoff();
    } else {
      addEvent('field_goal_miss', descFieldGoalMiss(distanceYards, ok.k), 0, false);
      // Missed FG: opposing team gets the ball at the line of scrimmage (or their 20)
      const returnPos = Math.max(20, state.fieldPos);
      switchPossession(100 - returnPos);
    }
  }

  function doPunt() {
    const puntYards = clamp(Math.round(gaussian(43, 7)), 25, 65);
    // New field pos for receiving team: 100 - (100 - state.fieldPos - puntYards) but clamped
    const returnTeamFieldPos = clamp(100 - state.fieldPos - puntYards, 5, 50);
    addEvent('punt', descPunt(puntYards), puntYards, false);

    if (mcafeeMode) {
      // 1.5% muffed punt — turnover, punting team keeps the ball
      if (Math.random() < 0.015) {
        addEvent('punt', 'Muffed punt! The kicking team recovers!', 0, false);
        state.fieldPos = clamp(100 - returnTeamFieldPos, 20, 90);
        state.down = 1;
        state.yardsToGo = 10;
        return;
      }

      // 0.5% punt return TD
      if (Math.random() < 0.005) {
        addEvent('punt', 'Punt return TOUCHDOWN! He takes it all the way!', 100, true);
        if (state.possession === 'home') state.awayScore += 7;
        else state.homeScore += 7;
        switchPossession(25); // set up for kickoff position
        doKickoff();
        return;
      }

      // Normal punt return: 0-15 yards
      const returnYds = Math.floor(Math.random() * 16);
      const adjustedFieldPos = clamp(returnTeamFieldPos + returnYds, 5, 75);
      if (returnYds > 0) {
        addEvent('punt', `Punt returned ${returnYds} yards.`, returnYds, false);
      }
      switchPossession(adjustedFieldPos);
      return;
    }

    switchPossession(returnTeamFieldPos);
  }

  function applyPenalty(): boolean {
    // Returns true if down replays, updates state
    const penaltyRoll = Math.random();
    interface PenaltyDef {
      name: string;
      yards: number;
      autoFirstDown: boolean;
      replay: boolean;
      side: string;
    }
    const penaltyTypes: PenaltyDef[] = [
      { name: 'Holding', yards: -10, autoFirstDown: false, replay: true, side: 'offense' },
      { name: 'False Start', yards: -5, autoFirstDown: false, replay: true, side: 'offense' },
      { name: 'Offsides', yards: 5, autoFirstDown: false, replay: true, side: 'defense' },
      { name: 'Pass Interference', yards: 15, autoFirstDown: true, replay: false, side: 'defense' },
    ];
    const pen = penaltyTypes[Math.floor(penaltyRoll * penaltyTypes.length)];
    const displayYards = pen.yards;
    addEvent('penalty', descPenalty(pen.name, displayYards, pen.side), displayYards, false);

    if (pen.yards < 0) {
      // Offense penalty: push back
      state.fieldPos = clamp(state.fieldPos + pen.yards, 1, 99);
      state.yardsToGo = Math.min(state.yardsToGo - pen.yards, 10 + state.fieldPos - 1);
    } else {
      // Defense penalty: advance ball
      state.fieldPos = clamp(state.fieldPos + pen.yards, 1, 99);
      state.yardsToGo = Math.max(1, state.yardsToGo - pen.yards);
      if (pen.autoFirstDown || state.yardsToGo <= 0) {
        state.down = 1;
        state.yardsToGo = 10;
      }
    }

    return pen.replay;
  }

  function advanceClock(baseSecs: number) {
    let secs = baseSecs;

    // ── Hurry-up / clock-killing adjustments in Q4 ──
    if (state.quarter === 4 && state.timeSecs <= 300) {
      const diff = state.possession === 'home'
        ? state.homeScore - state.awayScore
        : state.awayScore - state.homeScore;

      if (diff <= -1 && state.timeSecs <= 120) {
        // Behind in Q4 < 2 min: hurry-up — reduce clock drain
        secs = Math.round(baseSecs * 0.5); // ~15-20s instead of 30-38s
      } else if (diff >= 1) {
        // Ahead in Q4 < 5 min: burn clock — increase drain
        secs = Math.round(baseSecs * 1.2); // ~38-43s instead of 30-38s
      }
    }

    state.timeSecs = Math.max(0, state.timeSecs - secs);
  }

  function checkTwoMinWarning(): boolean {
    if (state.quarter === 2 && !state.twoMinWarningQ2Fired && state.timeSecs <= 120) {
      state.twoMinWarningQ2Fired = true;
      addEvent('two_minute_warning', 'Two-minute warning — offense must hurry.', 0, false);
      return true;
    }
    if (state.quarter === 4 && !state.twoMinWarningQ4Fired && state.timeSecs <= 120) {
      state.twoMinWarningQ4Fired = true;
      addEvent('two_minute_warning', 'Two-minute warning in the fourth quarter!', 0, false);
      return true;
    }
    return false;
  }

  function runPlay(): boolean {
    // Returns false if game is over
    if (events.length >= 400) return false;

    decayMomentum();

    // Two-minute warning check
    checkTwoMinWarning();

    if (state.timeSecs <= 0) return false;

    // Momentum effects on gameplay
    const possessionMomentum = state.possession === 'home' ? state.momentum : -state.momentum;
    const momentumCompBonus = possessionMomentum > 50 ? 0.02 : possessionMomentum > 75 ? 0.04 : 0;
    const momentumRushBonus = possessionMomentum > 50 ? 0.5 : possessionMomentum > 75 ? 1.0 : 0;

    const ok = offKey();
    const dk = defKey();
    const ob = offBucket();
    const db = defBucket();

    // Penalty check (9% of plays)
    if (Math.random() < 0.09) {
      const replayed = applyPenalty();
      advanceClock(5);
      if (replayed) return true;
    }

    // Victory formation: kneel the ball when winning late
    const kneelScoreDiff = state.possession === 'home'
      ? state.homeScore - state.awayScore
      : state.awayScore - state.homeScore;
    if (kneelScoreDiff > 0 && state.quarter >= 4 && state.timeSecs <= 120 && state.down <= 3) {
      const offQb = ok.qb;
      const desc = offQb
        ? `${offQb.firstName[0]}. ${offQb.lastName} takes a knee. Victory formation.`
        : 'Quarterback kneels. Victory formation.';
      events.push({
        id: playId++,
        type: 'run',
        description: desc,
        quarter: state.quarter,
        timeStr: formatTime(state.timeSecs),
        possession: state.possession,
        fieldPos: state.fieldPos,
        down: state.down,
        yardsToGo: state.yardsToGo,
        yardsGained: -1,
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        isScoring: false,
      });
      state.fieldPos = Math.max(1, state.fieldPos - 1);
      state.down++;
      state.yardsToGo++;
      advanceClock(40);
      return state.timeSecs > 0;
    }

    // ── End-of-half / end-of-game field goal logic ──
    // If time is critically low and we're in FG range, kick it regardless of down
    {
      const distToGoal = 100 - state.fieldPos;
      const fgDist = distToGoal + 17;
      const inFGRange = fgDist <= 58; // reasonable FG range
      const offScoreDiff = state.possession === 'home'
        ? state.homeScore - state.awayScore
        : state.awayScore - state.homeScore;
      const isEndOfHalf = (state.quarter === 2 && state.timeSecs <= 10) ||
                          (state.quarter >= 4 && state.timeSecs <= 10);
      const isLateAndClose = state.quarter >= 4 && state.timeSecs <= 30 && state.down >= 2;

      // Kick FG if: in range AND (time expiring OR trailing by ≤3 with <30s left)
      const shouldKickNow = inFGRange && (
        (isEndOfHalf && offScoreDiff <= 0) || // end of half, tied or trailing → kick
        (isLateAndClose && offScoreDiff >= -3 && offScoreDiff <= 0) // late Q4, within FG range of tying/winning
      );

      if (shouldKickNow) {
        // Spike the ball first if clock is running and we have time
        if (state.timeSecs > 5 && state.timeSecs <= 15) {
          const offQb = ok.qb;
          addEvent('run', offQb ? `${offQb.firstName[0]}. ${offQb.lastName} spikes the ball to stop the clock!` : 'Quarterback spikes the ball!', 0, false);
          advanceClock(2);
        }
        doFieldGoal(fgDist);
        advanceClock(5);
        return true;
      }
    }

    // 4th down decision
    if (state.down === 4) {
      const distanceToGoal = 100 - state.fieldPos;
      const fgDistance = distanceToGoal + 17; // snap + post spacing

      // Score differential & time check for "go for it" override
      const scoreDiff = state.possession === 'home'
        ? state.homeScore - state.awayScore
        : state.awayScore - state.homeScore;
      // Go for it when trailing late: any deficit with < 3 min, or big deficit with < 5 min
      const desperationGo = state.quarter >= 4 && scoreDiff < 0 && (
        state.timeSecs <= 180 ||                           // any deficit, < 3 min
        (scoreDiff <= -8 && state.timeSecs <= 300) ||      // down 8+, < 5 min
        (scoreDiff <= -16 && state.timeSecs <= 600)        // down 16+, < 10 min
      );

      // BUT: if a FG would tie or win and we're in range, kick it instead of going for it
      const fgWouldTieOrWin = scoreDiff >= -3 && scoreDiff <= 0 && fgDistance <= 55;
      const smartFG = fgWouldTieOrWin && state.quarter >= 4;

      if (smartFG) {
        // Kick the FG — it ties or wins the game
        doFieldGoal(fgDistance);
        advanceClock(30);
        return true;
      } else if (state.yardsToGo <= 2 || desperationGo || (state.yardsToGo <= 4 && state.fieldPos >= 60)) {
        // Go for it — short yardage, desperation, or in opponent territory with manageable distance
      } else if (state.fieldPos >= 55) {
        // Attempt field goal (up to ~62-yard attempts)
        doFieldGoal(fgDistance);
        advanceClock(30);
        return true;
      } else {
        // McAfee Mode: 3% fake punt chance
        if (mcafeeMode && Math.random() < 0.03) {
          const isRun = Math.random() < 0.60;
          if (isRun) {
            const fakeYards = 2 + Math.floor(Math.random() * 5); // 2-6 yards
            const success = fakeYards >= state.yardsToGo;
            addEvent('run', `FAKE PUNT! The punter takes off and gains ${fakeYards} yard${fakeYards !== 1 ? 's' : ''}!${success ? ' First down!' : ' Comes up short!'}`, fakeYards, false);
            state.fieldPos = clamp(state.fieldPos + fakeYards, 1, 99);
            state.yardsToGo -= fakeYards;
            advanceClock(30);
            if (success) {
              state.down = 1;
              state.yardsToGo = 10;
            } else {
              // Turnover on downs
              switchPossession(clamp(100 - state.fieldPos, 10, 90));
            }
            return true;
          } else {
            // Fake punt pass
            const complete = Math.random() < 0.45;
            if (complete) {
              const passYards = 10 + Math.floor(Math.random() * 16); // 10-25 yards
              addEvent('pass_complete', `FAKE PUNT PASS! Completed for ${passYards} yards! First down!`, passYards, false);
              state.fieldPos = clamp(state.fieldPos + passYards, 1, 99);
              state.down = 1;
              state.yardsToGo = 10;
              advanceClock(30);
            } else {
              addEvent('pass_incomplete', `FAKE PUNT PASS! Incomplete — turnover on downs!`, 0, false);
              switchPossession(clamp(100 - state.fieldPos, 10, 90));
              advanceClock(30);
            }
            return true;
          }
        }

        // Punt
        doPunt();
        advanceClock(35);
        return true;
      }
    }

    // Decide run vs pass — base on down & distance
    const isThirdLong = state.down === 3 && state.yardsToGo >= 7;
    const isFirstOrSecondShort = (state.down <= 2 && state.yardsToGo <= 4);
    let runChance = isThirdLong ? 0.22 : isFirstOrSecondShort ? 0.50 : 0.40;

    // ── Clock-aware modifier (Q4 < 5 min) ──
    const scoreDiffForClock = state.possession === 'home'
      ? state.homeScore - state.awayScore
      : state.awayScore - state.homeScore;
    if (state.quarter === 4 && state.timeSecs <= 300) {
      if (scoreDiffForClock >= 7) {
        runChance = Math.max(runChance, 0.70);        // milk the clock
      } else if (scoreDiffForClock >= 1) {
        runChance = Math.max(runChance, 0.55);        // protect the lead
      } else if (scoreDiffForClock <= -7) {
        runChance = Math.min(runChance, 0.15);         // air it out
      } else if (scoreDiffForClock <= -1) {
        runChance = Math.min(runChance, 0.30);         // pass-heavy comeback
      }
    }

    const isRun = Math.random() < runChance;

    if (isRun) {
      // RUN play
      const rbCarrying = rating(ok.rb, 'carrying', 70);
      const rbSpeed = rating(ok.rb, 'speed', 70);
      const lbTackling = rating(dk.lb1, 'tackling', 70);
      let yardsGained = Math.round(gaussian(4.5, 3.0) + (rbCarrying - lbTackling) / 60 * 2 + (rbSpeed - 70) / 100);
      yardsGained = clamp(yardsGained, -5, 25);

      // Red zone / goal-line rush boost
      if (state.fieldPos >= 95 && Math.random() < 0.45) {
        yardsGained = 100 - state.fieldPos; // score!
      } else if (state.fieldPos >= 90) {
        yardsGained = Math.max(yardsGained, Math.round(1 + Math.random() * 4));
      }

      ob.rushAttempts += 1;
      ob.rushYards += yardsGained;
      db.tackles += 1;

      const isTD = state.fieldPos + yardsGained >= 100;
      if (isTD) {
        const tdYards = 100 - state.fieldPos;
        doTouchdown(true, ok.rb, tdYards);
        advanceClock(Math.floor(Math.random() * 8) + 30);
        return true;
      }

      const desc = descRun(ok.rb, yardsGained, fieldPosLabel(state.fieldPos, state.possession));
      addEvent('run', desc, yardsGained, false);

      state.fieldPos = clamp(state.fieldPos + yardsGained, 1, 99);
      state.yardsToGo -= yardsGained;
      advanceClock(Math.floor(Math.random() * 8) + 30);

      // Skill-based fumble rate (Bug 3 fix)
      const fumbleChance = clamp(0.015 - (rbCarrying / 100) * 0.008, 0.003, 0.02);
      if (Math.random() < fumbleChance) {
        const desc2 = descFumble(ok.rb, dk.lb1);
        addEvent('fumble', desc2, 0, false);
        shiftMomentum(-20); // turnover momentum
        const newPos = clamp(100 - state.fieldPos, 15, 75);
        switchPossession(newPos);
        return true;
      }

    } else {
      // PASS play
      const qbThrowing = rating(ok.qb, 'throwing', 70);
      const dlPassRush = rating(dk.dl1, 'passRush', 70);
      // Bug 1 fix: use actual OL blocking ratings instead of WR1 proxy
      const olBlocking = ok.ols.length > 0
        ? ok.ols.reduce((s, p) => s + p.ratings.blocking * 1.2 + p.ratings.strength, 0) / ok.ols.length
        : 50;

      const cbCoverage = rating(dk.cb1, 'coverage', 70);
      const wr1Catching = rating(ok.wr1, 'catching', 70);
      const wr1Speed = rating(ok.wr1, 'speed', 70);

      const sackChance = clamp(0.07 + (dlPassRush - olBlocking) / 120 * 0.04, 0.03, 0.12);
      // Bug 2 fix: INT rate scales with QB vs coverage matchup
      const intChance = clamp((cbCoverage - qbThrowing) / 700 + 0.020, 0.010, 0.032);
      // Missing 5 fix: completion % uses QB, receiver catching, and CB coverage
      const tierMod = (state.possession === 'home' ? homeQBTierMod : awayQBTierMod) * 0.03;
      const compBase = clamp(
        0.54 + (qbThrowing / 100) * 0.20 + (wr1Catching / 100) * 0.10 - (cbCoverage / 100) * 0.10 + tierMod,
        0.45, 0.78,
      );

      const roll = Math.random();

      if (roll < sackChance) {
        // SACK
        const sackYards = clamp(Math.round(gaussian(-7, 2.5)), -15, -2);
        ob.passAttempts += 1;
        db.sacks += 1;

        const desc = descSack(ok.qb, dk.dl1, sackYards);
        addEvent('sack', desc, sackYards, false);
        shiftMomentum(-8); // momentum shifts to defense

        state.fieldPos = clamp(state.fieldPos + sackYards, 1, 99);
        state.yardsToGo -= sackYards;
        advanceClock(8);

      } else if (roll < sackChance + intChance) {
        // INTERCEPTION
        ob.passAttempts += 1;
        ob.interceptions += 1;
        db.defensiveINTs += 1;

        const desc = descInterception(ok.qb, dk.cb1);
        addEvent('interception', desc, 0, false);
        shiftMomentum(-20); // big momentum shift to defense

        const returnPos = clamp(100 - state.fieldPos + Math.floor(Math.random() * 20) - 10, 10, 60);
        switchPossession(returnPos);
        advanceClock(5);

      } else if (roll < sackChance + intChance + (1 - sackChance - intChance) * compBase) {
        // COMPLETION — yards per completion targeting NFL avg ~11.8
        const baseYards = 5 + Math.random() * 12; // 5-17 base (avg 11)
        const bonusYards = (qbThrowing / 100) * 3.0 + (wr1Speed / 100) * 2.0;
        let yardsGained = Math.round(baseYards + bonusYards * Math.random());

        // Big play chance (~5% of completions for average, higher for fast WRs)
        if (Math.random() < 0.02 + (wr1Speed / 100) * 0.03) {
          yardsGained += 15 + Math.floor(Math.random() * 20);
        }
        yardsGained = clamp(yardsGained, 1, 60); // completions never lose yards

        // Red zone pass boost (Missing 1)
        if (state.fieldPos >= 80) {
          yardsGained = Math.max(yardsGained, Math.round(3 + Math.random() * 8));
        }
        if (state.fieldPos >= 95 && Math.random() < 0.55) {
          yardsGained = 100 - state.fieldPos; // score!
        }

        const isLong = yardsGained >= 20;

        // Expanded receiver targeting: WR1 28%, WR2 21%, WR3 14%, TE 18%, RB 12%, other 7%
        const recRoll = Math.random();
        let receiver: Player | null;
        if (recRoll < 0.28) receiver = ok.wr1;
        else if (recRoll < 0.49) receiver = ok.wr2;
        else if (recRoll < 0.63) receiver = ok.wr3 ?? ok.wr2;
        else if (recRoll < 0.81) receiver = ok.te;
        else receiver = ok.rb; // RB catches (screens, check-downs)

        ob.passAttempts += 1;
        ob.passCompletions += 1;
        ob.passYards += yardsGained;
        ob.receivingTargets += 1;
        ob.receptions += 1;
        ob.receivingYards += yardsGained;
        db.tackles += 1;

        const isTD = state.fieldPos + yardsGained >= 100;
        if (isTD) {
          const tdYards = 100 - state.fieldPos;
          doTouchdown(false, receiver, tdYards);
          advanceClock(Math.floor(Math.random() * 10) + 25);
          return true;
        }

        const desc = descPassComplete(ok.qb, receiver, yardsGained, isLong);
        addEvent('pass_complete', desc, yardsGained, false);
        if (isLong) shiftMomentum(12); // big play momentum

        state.fieldPos = clamp(state.fieldPos + yardsGained, 1, 99);
        state.yardsToGo -= yardsGained;
        advanceClock(Math.floor(Math.random() * 10) + 25);

      } else {
        // INCOMPLETE
        ob.passAttempts += 1;

        const recRoll2 = Math.random();
        let receiver: Player | null;
        if (recRoll2 < 0.28) receiver = ok.wr1;
        else if (recRoll2 < 0.49) receiver = ok.wr2;
        else if (recRoll2 < 0.63) receiver = ok.wr3 ?? ok.wr2;
        else if (recRoll2 < 0.81) receiver = ok.te;
        else receiver = ok.rb;

        ob.receivingTargets += 1;

        const desc = descPassIncomplete(ok.qb, receiver);
        addEvent('pass_incomplete', desc, 0, false);

        // Clock stops on incomplete
        advanceClock(5);
      }
    }

    // Update down & distance
    if (state.yardsToGo <= 0) {
      // First down achieved
      state.down = 1;
      state.yardsToGo = 10;
    } else {
      state.down = clamp(state.down + 1, 1, 4);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Main game loop
  // ---------------------------------------------------------------------------

  // Kickoff to start
  doKickoff();

  while (state.quarter <= 4 || state.overtime) {
    if (events.length >= 400) break;

    // Run a play
    const continueGame = runPlay();
    if (!continueGame) break;

    // Quarter management
    if (state.timeSecs <= 0 && !state.overtime) {
      if (state.quarter === 2) {
        addEvent('quarter_end', `End of the second quarter.`, 0, false);
        addEvent('halftime', `Halftime — ${homeTeam.abbreviation} ${state.homeScore}, ${awayTeam.abbreviation} ${state.awayScore}.`, 0, false);
        state.quarter = 3;
        state.timeSecs = 900;
        state.twoMinWarningQ2Fired = false;
        // Second half kickoff — coin flip winner typically defers, losing team kicks
        doKickoff();
      } else if (state.quarter === 4) {
        addEvent('quarter_end', `End of the fourth quarter.`, 0, false);
        // Check for tie
        if (state.homeScore === state.awayScore) {
          state.overtime = true;
          state.timeSecs = 600; // 10-min OT
          addEvent('overtime', `Overtime! First score wins. Coin flip — ${Math.random() < 0.5 ? homeTeam.abbreviation : awayTeam.abbreviation} gets possession.`, 0, false);
          doKickoff();
        } else {
          break;
        }
      } else {
        const qLabel = `End of Q${state.quarter}.`;
        addEvent('quarter_end', qLabel, 0, false);
        state.quarter += 1;
        state.timeSecs = 900;
      }
    }

    // OT end conditions
    if (state.overtime && state.homeScore !== state.awayScore) {
      break;
    }
    if (state.overtime && state.timeSecs <= 0) {
      if (state.homeScore === state.awayScore && isPlayoff) {
        // Playoff OT: reset clock for another OT period until someone scores
        state.timeSecs = 600;
        addEvent('overtime', `Another overtime period! The game continues until someone scores.`, 0, false);
        doKickoff();
      } else {
        // Regular season: game ends as a tie
        break;
      }
    }
  }

  // Final event
  addEvent(
    'final',
    `Final Score — ${homeTeam.abbreviation} ${state.homeScore}, ${awayTeam.abbreviation} ${state.awayScore}.`,
    0,
    false,
  );

  // ---------------------------------------------------------------------------
  // Build player stats from buckets
  // ---------------------------------------------------------------------------

  const playerStats: Record<string, Partial<PlayerStats>> = {};

  function applyBucketToStats(
    bucket: StatBucket,
    keyPlayers: KeyPlayers,
    teamPlayers: Player[],
  ) {
    // QB
    if (keyPlayers.qb) {
      playerStats[keyPlayers.qb.id] = {
        gamesPlayed: 1,
        passAttempts: bucket.passAttempts,
        passCompletions: bucket.passCompletions,
        passYards: bucket.passYards,
        passTDs: bucket.passTDs,
        interceptions: bucket.interceptions,
      };
    }

    // RB
    if (keyPlayers.rb) {
      playerStats[keyPlayers.rb.id] = {
        gamesPlayed: 1,
        rushAttempts: bucket.rushAttempts,
        rushYards: bucket.rushYards,
        rushTDs: bucket.rushTDs,
      };
    }

    // Receivers — distribute by target share matching play selection
    const totalRecYards = bucket.receivingYards;
    const totalRec = bucket.receptions;
    const totalTgts = bucket.receivingTargets;
    const passTDs = bucket.passTDs;

    const recShares: { player: Player | null; share: number }[] = [
      { player: keyPlayers.wr1, share: 0.28 },
      { player: keyPlayers.wr2, share: 0.21 },
      { player: keyPlayers.wr3, share: 0.14 },
      { player: keyPlayers.te, share: 0.18 },
      { player: keyPlayers.rb, share: 0.12 },
    ];
    let assignedTDs = 0;
    for (const { player, share } of recShares) {
      if (!player) continue;
      const tds = assignedTDs < passTDs && share >= 0.14 ? Math.round(passTDs * share) : 0;
      assignedTDs += tds;
      const existing = playerStats[player.id];
      playerStats[player.id] = {
        ...existing,
        gamesPlayed: 1,
        targets: (existing?.targets ?? 0) + Math.round(totalTgts * share),
        receptions: (existing?.receptions ?? 0) + Math.round(totalRec * share),
        receivingYards: (existing?.receivingYards ?? 0) + Math.round(totalRecYards * share),
        receivingTDs: (existing?.receivingTDs ?? 0) + tds,
      };
    }

    // Defenders — position-based tackle/sack/INT distribution
    const defenders = teamPlayers.filter(p =>
      ['DL', 'LB', 'CB', 'S'].includes(p.position) && (!p.injury || p.injury.weeksLeft === 0),
    );
    const totalTackles = Math.max(bucket.tackles, 30 + Math.floor(Math.random() * 20));
    // Position weights: LB ~57%, DB ~28%, DL ~15%
    const defWeights = defenders.map(d => {
      const posW = d.position === 'LB' ? 3.5 : (d.position === 'CB' || d.position === 'S') ? 1.8 : 0.8;
      return posW * (d.ratings.tackling / 70);
    });
    const totalWeight = defWeights.reduce((s, w) => s + w, 0) || 1;
    let remainingSacks = bucket.sacks;
    let remainingINTs = bucket.defensiveINTs;
    for (let i = 0; i < defenders.length; i++) {
      const share = defWeights[i] / totalWeight;
      const tackles = Math.round(totalTackles * share * (0.85 + Math.random() * 0.3));
      // Sacks: DL ~70%, LB ~25%, DB ~5%
      let sacks = 0;
      if (remainingSacks > 0) {
        const sackChance = defenders[i].position === 'DL' ? 0.35 : defenders[i].position === 'LB' ? 0.15 : 0.03;
        if (Math.random() < sackChance) { sacks = 1; remainingSacks--; }
      }
      // INTs: CB ~65%, S ~25%, LB ~10%
      let ints = 0;
      if (remainingINTs > 0) {
        const intChance = defenders[i].position === 'CB' ? 0.20 : defenders[i].position === 'S' ? 0.10 : 0.03;
        if (Math.random() < intChance) { ints = 1; remainingINTs--; }
      }
      playerStats[defenders[i].id] = {
        gamesPlayed: 1,
        tackles,
        sacks,
        defensiveINTs: ints,
      };
    }

    // Kicker
    if (keyPlayers.k) {
      playerStats[keyPlayers.k.id] = {
        gamesPlayed: 1,
        fieldGoalAttempts: bucket.fieldGoalAttempts,
        fieldGoalsMade: bucket.fieldGoalsMade,
        extraPointAttempts: bucket.extraPointAttempts,
        extraPointsMade: bucket.extraPointsMade,
      };
    }

    // All others get gamesPlayed = 1
    for (const p of teamPlayers) {
      if (!playerStats[p.id]) {
        playerStats[p.id] = { gamesPlayed: 1 };
      }
    }
  }

  applyBucketToStats(homeBucket, homeKey, homePlayers);
  applyBucketToStats(awayBucket, awayKey, awayPlayers);

  return {
    events,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    playerStats,
  };
}

/**
 * Convert a LiveGameResult into a full GameResult for committing to the store.
 */
export function liveGameToGameResult(
  live: LiveGameResult,
  baseGame: GameResult,
): GameResult {
  return {
    ...baseGame,
    homeScore: live.homeScore,
    awayScore: live.awayScore,
    played: true,
    playerStats: live.playerStats,
  };
}
