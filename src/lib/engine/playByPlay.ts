import type { Player, PlayerStats, GameResult, Team } from '@/types';
import { computeQBTier, getQBTierModifier } from './qbTierPyramid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Defensive timeouts auto-called when trailing at end of half/game.
 *  Emitted as a play event so the UI can display "Defense calls timeout!"
 *  and so the play-by-play makes sense in context. */
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
  | 'final'
  | 'timeout';

export interface PlayEvent {
  id: number;
  type: PlayType;
  /** Timeouts remaining per team after this event. Optional for backwards
   *  compatibility with older saved LiveGameResults. */
  homeTimeouts?: number;
  awayTimeouts?: number;
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
  /** Cumulative bucket snapshots taken when this event was pushed. Used by
   *  the live-game UI to render running per-play box-score stats (tofftanaut
   *  + woahitsholly 4/27 — stats should refresh as plays go in, not just at
   *  end of game). Optional for backwards compatibility with older saves. */
  homeBucketSnap?: StatBucket;
  awayBucketSnap?: StatBucket;
}

export interface LiveGameResult {
  events: PlayEvent[];
  homeScore: number;
  awayScore: number;
  playerStats: Record<string, Partial<PlayerStats>>;
  /** Per-quarter snapshots captured before each quarter's first play. Used by
   *  resimulateFromPoint() to rewind the sim to a quarter boundary, swap in a
   *  new game plan, and re-sim the rest of the game from there. */
  quarterSnapshots?: LiveGameSnapshot[];
}

/** Snapshot of game state + cumulative buckets at a quarter boundary. */
export interface LiveGameSnapshot {
  /** Quarter number (1-4 regular, 5+ for OT periods). */
  quarter: number;
  /** Index into the events[] array marking the first event of this quarter
   *  (or just after the kickoff for Q1/Q3/OT). All events at index < eventIndex
   *  are kept verbatim when rewinding to this snapshot. */
  eventIndex: number;
  /** Internal sim state at the snapshot point. Opaque to callers. */
  state: GameStateSnapshot;
  homeBucket: StatBucket;
  awayBucket: StatBucket;
}

/** Plain serializable copy of GameState — interface kept separate so the
 *  internal mutable GameState can keep its existing definition. */
export interface GameStateSnapshot {
  quarter: number;
  timeSecs: number;
  momentum: number;
  possession: 'home' | 'away';
  fieldPos: number;
  down: number;
  yardsToGo: number;
  homeScore: number;
  awayScore: number;
  twoMinWarningQ2Fired: boolean;
  twoMinWarningQ4Fired: boolean;
  overtime: boolean;
  /** Timeouts remaining per team (3 per half in the NFL). Reset at halftime. */
  homeTimeouts: number;
  awayTimeouts: number;
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
  // Position pools — used by the play loop to rotate carries / sacks / INTs
  // across the depth chart instead of piling everything on the first starter
  // (and making RB2/CB2/DL2/etc. invisible in the boxscore).
  rbs: Player[];
  wrs: Player[];
  tes: Player[];
  dls: Player[];
  lbs: Player[];
  cbs: Player[];
  safeties: Player[];
}

function extractKeyPlayers(players: Player[], depthChart?: Record<string, string[]>): KeyPlayers {
  // Order each position pool by the team's depth chart (the user's
  // intended starter ordering) instead of by creation order. Without
  // this, rbs[0] / wrs[0] / etc. is whichever player happened to be
  // generated first — which on imported rosters often puts the WRONG
  // player at index 0. Tofftanaut + Tyler confirmed RB2 was getting
  // ~2x RB1 carries (4/24); pickRusher weights index-0 at 1.0 and
  // index-1 at 0.35, so flipping the order flips the carry split.
  const byPos = (pos: string): Player[] => {
    const available = players.filter(p => p.position === pos && (!p.injury || p.injury.weeksLeft === 0));
    const order = depthChart?.[pos];
    if (!order || order.length === 0) return available;
    const idMap = new Map(available.map(p => [p.id, p]));
    const ordered: Player[] = [];
    const seen = new Set<string>();
    for (const id of order) {
      const p = idMap.get(id);
      if (p) { ordered.push(p); seen.add(id); }
    }
    // Append any available players not in the depth chart at the end (e.g.,
    // newly-signed FAs the user hasn't slotted yet).
    for (const p of available) {
      if (!seen.has(p.id)) ordered.push(p);
    }
    return ordered;
  };
  const wrs = byPos('WR');
  const cbs = byPos('CB');
  const safeties = byPos('S');
  const rbs = byPos('RB');
  const dls = byPos('DL');
  const lbs = byPos('LB');
  const tes = byPos('TE');
  return {
    qb: byPos('QB')[0] ?? null,
    rb: rbs[0] ?? null,
    wr1: wrs[0] ?? null,
    wr2: wrs[1] ?? null,
    wr3: wrs[2] ?? null,
    te: tes[0] ?? null,
    ols: byPos('OL'),
    dl1: dls[0] ?? null,
    lb1: lbs[0] ?? null,
    cb1: cbs[0] ?? safeties[0] ?? null,
    cb2: cbs[1] ?? safeties[0] ?? null,
    s1: safeties[0] ?? null,
    k: byPos('K')[0] ?? null,
    rbs,
    wrs,
    tes,
    dls,
    lbs,
    cbs,
    safeties,
  };
}

/** Pick a player from the pool weighted by a caller-provided score. Higher
 *  score → higher probability. All-zero weights degrade to uniform. */
function pickWeighted<T>(pool: T[], weight: (p: T) => number): T | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const weights = pool.map(p => Math.max(0.01, weight(p)));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Pick the rusher for a carry. RB1 still gets the lion's share (workhorse
 *  back logic) but RB2/RB3 see real touches. OVR-biased so better backs get
 *  more carries even within the pool. */
function pickRusher(rbs: Player[]): Player | null {
  return pickWeighted(rbs, (p, i = rbs.indexOf(p)) => {
    const depthWeight = i === 0 ? 1.0 : i === 1 ? 0.35 : i === 2 ? 0.12 : 0.05;
    const ovrScale = 0.5 + p.ratings.overall / 100;
    return depthWeight * ovrScale;
  });
}

/** Pick the sacker. DL disproportionately get pressure, LBs contribute too. */
function pickSacker(dls: Player[], lbs: Player[]): Player | null {
  const pool = [...dls, ...lbs];
  return pickWeighted(pool, p => {
    const base = p.position === 'DL' ? 2.5 : 1.0;
    const skill = (p.ratings.passRush ?? 60) + (p.ratings.strength ?? 60) * 0.4;
    return base * skill;
  });
}

/** Pick the interceptor. CBs most likely, safeties second, LBs rare. */
function pickInterceptor(cbs: Player[], safeties: Player[], lbs: Player[]): Player | null {
  const pool = [...cbs, ...safeties, ...lbs];
  return pickWeighted(pool, p => {
    const base = p.position === 'CB' ? 3.0 : p.position === 'S' ? 1.5 : 0.3;
    const skill = (p.ratings.coverage ?? 60) + (p.ratings.awareness ?? 60) * 0.5;
    return base * skill;
  });
}

/** Pick a pass target. WRs are weighted by depth-chart slot, TEs and the
 *  receiving back get a fixed share. Mirrors the slot-percentage logic that
 *  existed before but uses pickWeighted so the exact same player isn't
 *  targeted every single play — variety within the WR pool is now real. */
function pickReceiver(wrs: Player[], tes: Player[], rbs: Player[]): Player | null {
  const entries: { p: Player; w: number }[] = [];
  const depthWeights = [1.0, 0.75, 0.50, 0.15];
  wrs.slice(0, 4).forEach((p, i) => {
    entries.push({ p, w: depthWeights[i] * (0.5 + (p.ratings.catching ?? 60) / 100) });
  });
  if (tes[0]) entries.push({ p: tes[0], w: 0.65 });
  if (rbs[0]) entries.push({ p: rbs[0], w: 0.43 });
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.p; }
  return entries[entries.length - 1].p;
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
  /** Timeouts remaining per team (3 per half in the NFL). Reset at halftime. */
  homeTimeouts: number;
  awayTimeouts: number;
}

// ---------------------------------------------------------------------------
// Stat tracking (accumulated during simulation)
// ---------------------------------------------------------------------------

export interface PerReceiverStat {
  targets: number;
  receptions: number;
  yards: number;
  tds: number;
}

export interface PerRusherStat {
  attempts: number;
  yards: number;
  tds: number;
  fumbles: number;
}

export interface StatBucket {
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  // QB-specific rushing — tracked separately so designed runs and scrambles
  // get credited to the QB instead of being lumped into the RB stat line.
  qbRushAttempts: number;
  qbRushYards: number;
  qbRushTDs: number;
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
  // Per-receiver accumulator, keyed by player id. Credited as each pass event
  // fires so the sum across all receivers matches QB passing totals exactly
  // (no share-based distribution drift, no ghost TDs).
  perReceiver: Record<string, PerReceiverStat>;
  // Per-rusher accumulator — each run play picks an RB from the pool and
  // credits here, so RB2/RB3 see carries proportional to depth weighting.
  perRusher: Record<string, PerRusherStat>;
  // Defensive per-player accumulators: the sim picks the sacker / interceptor
  // from the position pool when the play fires, so the live feed and the
  // boxscore both reflect real rotation instead of piling onto DL1/CB1.
  perSacker: Record<string, number>;
  perInterceptor: Record<string, number>;
}

function emptyBucket(): StatBucket {
  return {
    passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
    rushAttempts: 0, rushYards: 0, rushTDs: 0,
    qbRushAttempts: 0, qbRushYards: 0, qbRushTDs: 0,
    receivingTargets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    sacks: 0, defensiveINTs: 0, tackles: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0,
    extraPointAttempts: 0, extraPointsMade: 0,
    perReceiver: {},
    perRusher: {},
    perSacker: {},
    perInterceptor: {},
  };
}

/** Deep-clone a bucket so snapshot/resume spreads don't alias the per-player maps. */
function cloneBucket(b: StatBucket): StatBucket {
  const perReceiver: Record<string, PerReceiverStat> = {};
  for (const [id, rec] of Object.entries(b.perReceiver)) perReceiver[id] = { ...rec };
  const perRusher: Record<string, PerRusherStat> = {};
  for (const [id, rec] of Object.entries(b.perRusher)) perRusher[id] = { ...rec };
  return {
    ...b,
    perReceiver,
    perRusher,
    perSacker: { ...b.perSacker },
    perInterceptor: { ...b.perInterceptor },
  };
}

function creditReceiver(
  bucket: StatBucket,
  receiverId: string,
  patch: Partial<PerReceiverStat>,
): void {
  const cur = bucket.perReceiver[receiverId] ?? { targets: 0, receptions: 0, yards: 0, tds: 0 };
  bucket.perReceiver[receiverId] = {
    targets: cur.targets + (patch.targets ?? 0),
    receptions: cur.receptions + (patch.receptions ?? 0),
    yards: cur.yards + (patch.yards ?? 0),
    tds: cur.tds + (patch.tds ?? 0),
  };
}

function creditRusher(
  bucket: StatBucket,
  rusherId: string,
  patch: Partial<PerRusherStat>,
): void {
  const cur = bucket.perRusher[rusherId] ?? { attempts: 0, yards: 0, tds: 0, fumbles: 0 };
  bucket.perRusher[rusherId] = {
    attempts: cur.attempts + (patch.attempts ?? 0),
    yards: cur.yards + (patch.yards ?? 0),
    tds: cur.tds + (patch.tds ?? 0),
    fumbles: cur.fumbles + (patch.fumbles ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Main simulator
// ---------------------------------------------------------------------------

export interface LiveGamePlan {
  passRate: number;
  aggressiveness: 'conservative' | 'balanced' | 'aggressive';
  redZoneStrategy: 'run' | 'balanced' | 'pass';
  userTeamSide: 'home' | 'away';
}

export function simulatePlayByPlay(
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  isPlayoff: boolean = false,
  mcafeeMode: boolean = false,
  /** Optional user game plan applied only when the user's team is on offense. */
  userGamePlan?: LiveGamePlan,
  /** Optional rewind hooks. When provided, the sim starts from the given state
   *  and bucket totals instead of running from kickoff. Used by
   *  resimulateFromPoint() to splice a new game plan into a partially-played
   *  game without losing the events the user has already watched. */
  resumeFrom?: {
    state: GameStateSnapshot;
    homeBucket: StatBucket;
    awayBucket: StatBucket;
    /** Existing event id counter to continue from (so re-sim event ids don't collide). */
    nextEventId: number;
  },
): LiveGameResult {
  const homeKey = extractKeyPlayers(homePlayers, homeTeam.depthChart);
  const awayKey = extractKeyPlayers(awayPlayers, awayTeam.depthChart);

  // QB tier modifiers: ±3% on completion probability
  const homeQBTierMod = homeKey.qb ? getQBTierModifier(computeQBTier(homeKey.qb)) : 0;
  const awayQBTierMod = awayKey.qb ? getQBTierModifier(computeQBTier(awayKey.qb)) : 0;

  const homeBucket = resumeFrom ? cloneBucket(resumeFrom.homeBucket) : emptyBucket();
  const awayBucket = resumeFrom ? cloneBucket(resumeFrom.awayBucket) : emptyBucket();

  const events: PlayEvent[] = [];
  let playId = resumeFrom ? resumeFrom.nextEventId : 0;

  const state: GameState = resumeFrom
    ? { ...resumeFrom.state, homeTimeouts: resumeFrom.state.homeTimeouts ?? 3, awayTimeouts: resumeFrom.state.awayTimeouts ?? 3 }
    : {
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
        homeTimeouts: 3,
        awayTimeouts: 3,
      };

  // Quarter snapshots — captured before each quarter's first play.
  const quarterSnapshots: LiveGameSnapshot[] = [];
  function captureSnapshot() {
    quarterSnapshots.push({
      quarter: state.quarter,
      eventIndex: events.length,
      state: { ...state },
      homeBucket: cloneBucket(homeBucket),
      awayBucket: cloneBucket(awayBucket),
    });
  }

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
      homeTimeouts: state.homeTimeouts,
      awayTimeouts: state.awayTimeouts,
    };
    // Snapshot the cumulative buckets onto this event so the live-game UI
    // can render running per-play box-score stats. cloneBucket is shallow
    // on the simple counters but copies the per-player maps so later plays
    // don't mutate this snapshot.
    ev.homeBucketSnap = cloneBucket(homeBucket);
    ev.awayBucketSnap = cloneBucket(awayBucket);
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
    const scoringBucket = state.possession === 'home' ? homeBucket : awayBucket;
    if (state.possession === 'home') state.homeScore += 6;
    else state.awayScore += 6;
    // Rush TD credit split by position: QB scrambles/designed runs live in
    // qbRushTDs (already bumped by the caller), RBs land on rushTDs +
    // perRusher. Without this split the same TD would count in both
    // qbRushTDs and rushTDs, tripping the Σ-per-rusher invariant.
    scoringBucket.passTDs += isRush ? 0 : 1;
    if (isRush && scorer?.position !== 'QB') {
      scoringBucket.rushTDs += 1;
    }
    if (scorer && !isRush) {
      scoringBucket.receivingTDs += 1;
      creditReceiver(scoringBucket, scorer.id, { tds: 1 });
    }
    if (scorer && isRush && scorer.position === 'RB') {
      creditRusher(scoringBucket, scorer.id, { tds: 1 });
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

    // 4th-down loop guard: an offensive penalty on 4th down used to replay
    // the down (pen.replay=true) — letting the offense keep snapping until
    // they got a first down. NFL: defense almost always declines and takes
    // the turnover. Force a turnover on downs in that case.
    if (state.down === 4 && pen.side === 'offense' && pen.replay) {
      const newPos = clamp(100 - state.fieldPos, 1, 99);
      switchPossession(newPos);
      return false;
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

    // ── Auto defensive timeouts ──
    // If the defensive team is trailing at end of half or end of game and the
    // offense is burning the clock, the defense burns a timeout to stop the
    // clock. Mirrors real NFL coaching decisions automatically.
    const defSide: 'home' | 'away' = state.possession === 'home' ? 'away' : 'home';
    const defTimeouts = defSide === 'home' ? state.homeTimeouts : state.awayTimeouts;
    const defScore = defSide === 'home' ? state.homeScore : state.awayScore;
    const offScore = state.possession === 'home' ? state.homeScore : state.awayScore;
    const defTrailing = defScore < offScore;
    const defTiedLate = defScore === offScore && state.quarter === 4 && state.timeSecs <= 60;
    const inQ2Minute = state.quarter === 2 && state.timeSecs <= 120 && state.timeSecs > 10;
    const inQ4Minute = state.quarter === 4 && state.timeSecs <= 150 && state.timeSecs > 10;
    const shouldCallTimeout =
      defTimeouts > 0 &&
      secs > 10 && // only meaningful if clock was actually going to drain
      (defTrailing || defTiedLate) &&
      (inQ2Minute || inQ4Minute);

    if (shouldCallTimeout) {
      if (defSide === 'home') state.homeTimeouts -= 1;
      else state.awayTimeouts -= 1;
      const defAbbr = defSide === 'home' ? homeTeam.abbreviation : awayTeam.abbreviation;
      const remaining = defSide === 'home' ? state.homeTimeouts : state.awayTimeouts;
      addEvent(
        'timeout',
        `${defAbbr} calls timeout. ${remaining} timeout${remaining === 1 ? '' : 's'} remaining.`,
        0,
        false,
      );
      // Clock gets 2-3 seconds of admin time but doesn't drain the full play clock
      secs = 3;
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

    // ── User Game Plan: apply baseline pass rate when user team is on offense ──
    const isUserOffense = userGamePlan && state.possession === userGamePlan.userTeamSide;
    if (isUserOffense && userGamePlan) {
      const userRunChance = 1 - (userGamePlan.passRate / 100);
      // Blend user baseline with situational adjustments (down/distance still matter)
      runChance = isThirdLong ? Math.max(0.1, userRunChance - 0.18) :
                  isFirstOrSecondShort ? Math.min(0.85, userRunChance + 0.10) :
                  userRunChance;
      // Red zone override
      if (state.fieldPos >= 80) {
        if (userGamePlan.redZoneStrategy === 'run') runChance = Math.min(0.9, runChance + 0.20);
        else if (userGamePlan.redZoneStrategy === 'pass') runChance = Math.max(0.05, runChance - 0.20);
      }
    }

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

    // ── QB designed run check ──
    const qbSpeed = rating(ok.qb, 'speed', 50);
    const qbDesignedRunChance = qbSpeed >= 80 ? 0.20 :
                                qbSpeed >= 70 ? 0.15 :
                                0;
    if (ok.qb && qbDesignedRunChance > 0 && Math.random() < qbDesignedRunChance) {
      const qbAgility = rating(ok.qb, 'agility', 60);
      const qbCarrying = rating(ok.qb, 'carrying', 55);
      const lbTackling = rating(dk.lb1, 'tackling', 70);
      const rushSkill = qbSpeed * 0.5 + qbAgility * 0.3 + qbCarrying * 0.2;
      let yardsGained = Math.round(gaussian(3.5, 3.0) + (rushSkill - lbTackling) / 60 * 2);
      yardsGained = clamp(yardsGained, -4, 25);

      if (state.fieldPos >= 95 && Math.random() < 0.35) {
        yardsGained = 100 - state.fieldPos;
      } else if (state.fieldPos >= 90) {
        yardsGained = Math.max(yardsGained, Math.round(1 + Math.random() * 3));
      }

      ob.qbRushAttempts += 1;
      ob.qbRushYards += yardsGained;
      db.tackles += 1;

      const isTD = state.fieldPos + yardsGained >= 100;
      if (isTD) {
        const tdYards = 100 - state.fieldPos;
        ob.qbRushTDs += 1;
        doTouchdown(true, ok.qb, tdYards);
        advanceClock(Math.floor(Math.random() * 8) + 30);
        return true;
      }

      const desc = descRun(ok.qb, yardsGained, fieldPosLabel(state.fieldPos, state.possession));
      addEvent('run', desc, yardsGained, false);

      state.fieldPos = clamp(state.fieldPos + yardsGained, 1, 99);
      state.yardsToGo -= yardsGained;
      advanceClock(Math.floor(Math.random() * 8) + 30);

      const fumbleChance = clamp(0.018 - (qbCarrying / 100) * 0.006, 0.005, 0.025);
      if (Math.random() < fumbleChance) {
        const desc2 = descFumble(ok.qb, dk.lb1);
        addEvent('fumble', desc2, 0, false);
        shiftMomentum(-20);
        const newPos = clamp(100 - state.fieldPos, 15, 75);
        switchPossession(newPos);
        return true;
      }
    } else {

    const isRun = Math.random() < runChance;

    if (isRun) {
      // RUN play — rotate the rusher from the RB pool so RB2/RB3 see touches.
      const rusher = pickRusher(ok.rbs) ?? ok.rb;
      const rbCarrying = rating(rusher, 'carrying', 70);
      const rbSpeed = rating(rusher, 'speed', 70);
      const lbTackling = rating(dk.lb1, 'tackling', 70);
      let yardsGained = Math.round(gaussian(4.0, 3.0) + (rbCarrying - lbTackling) / 60 * 2 + (rbSpeed - 70) / 100);
      yardsGained = clamp(yardsGained, -5, 25);

      // Red zone / goal-line rush boost
      if (state.fieldPos >= 95 && Math.random() < 0.35) {
        yardsGained = 100 - state.fieldPos; // score!
      } else if (state.fieldPos >= 90) {
        yardsGained = Math.max(yardsGained, Math.round(1 + Math.random() * 3));
      }

      ob.rushAttempts += 1;
      ob.rushYards += yardsGained;
      if (rusher) creditRusher(ob, rusher.id, { attempts: 1, yards: yardsGained });
      db.tackles += 1;

      const isTD = state.fieldPos + yardsGained >= 100;
      if (isTD) {
        const tdYards = 100 - state.fieldPos;
        doTouchdown(true, rusher, tdYards);
        advanceClock(Math.floor(Math.random() * 8) + 30);
        return true;
      }

      const desc = descRun(rusher, yardsGained, fieldPosLabel(state.fieldPos, state.possession));
      addEvent('run', desc, yardsGained, false);

      state.fieldPos = clamp(state.fieldPos + yardsGained, 1, 99);
      state.yardsToGo -= yardsGained;
      advanceClock(Math.floor(Math.random() * 8) + 30);

      // Skill-based fumble rate (Bug 3 fix)
      const fumbleChance = clamp(0.015 - (rbCarrying / 100) * 0.008, 0.003, 0.02);
      if (Math.random() < fumbleChance) {
        const desc2 = descFumble(rusher, dk.lb1);
        addEvent('fumble', desc2, 0, false);
        if (rusher) creditRusher(ob, rusher.id, { fumbles: 1 });
        shiftMomentum(-20); // turnover momentum
        const newPos = clamp(100 - state.fieldPos, 15, 75);
        switchPossession(newPos);
        return true;
      }

    } else {
      // PASS play

      // ── QB scramble on pass plays ──
      const scrambleChance = qbSpeed >= 80 ? 0.12 :
                             qbSpeed >= 70 ? 0.10 :
                             qbSpeed >= 60 ? 0.08 :
                             0.02;
      if (ok.qb && Math.random() < scrambleChance) {
        const qbAgility = rating(ok.qb, 'agility', 60);
        const qbCarrying = rating(ok.qb, 'carrying', 55);
        const lbTackling = rating(dk.lb1, 'tackling', 70);
        const rushSkill = qbSpeed * 0.5 + qbAgility * 0.3 + qbCarrying * 0.2;
        let yardsGained = Math.round(gaussian(3.5, 2.5) + (rushSkill - lbTackling) / 60 * 2);
        yardsGained = clamp(yardsGained, -4, 20);

        if (state.fieldPos >= 95 && Math.random() < 0.35) {
          yardsGained = 100 - state.fieldPos;
        }

        ob.qbRushAttempts += 1;
        ob.qbRushYards += yardsGained;
        db.tackles += 1;

        const isTD = state.fieldPos + yardsGained >= 100;
        if (isTD) {
          const tdYards = 100 - state.fieldPos;
          ob.qbRushTDs += 1;
          doTouchdown(true, ok.qb, tdYards);
          advanceClock(Math.floor(Math.random() * 8) + 25);
          return true;
        }

        const desc = descRun(ok.qb, yardsGained, fieldPosLabel(state.fieldPos, state.possession));
        addEvent('run', desc, yardsGained, false);

        state.fieldPos = clamp(state.fieldPos + yardsGained, 1, 99);
        state.yardsToGo -= yardsGained;
        advanceClock(Math.floor(Math.random() * 8) + 25);

      } else {

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
        // SACK — pick the sacker from the DL/LB pool so the same DL1 doesn't
        // rack up every sack in the game.
        const sacker = pickSacker(dk.dls, dk.lbs) ?? dk.dl1;
        const sackYards = clamp(Math.round(gaussian(-7, 2.5)), -15, -2);
        ob.passAttempts += 1;
        db.sacks += 1;
        if (sacker) db.perSacker[sacker.id] = (db.perSacker[sacker.id] ?? 0) + 1;

        const desc = descSack(ok.qb, sacker, sackYards);
        addEvent('sack', desc, sackYards, false);
        shiftMomentum(-8); // momentum shifts to defense

        state.fieldPos = clamp(state.fieldPos + sackYards, 1, 99);
        state.yardsToGo -= sackYards;
        advanceClock(8);

      } else if (roll < sackChance + intChance) {
        // INTERCEPTION — pick interceptor from CB/S/LB pool; CBs still far
        // more likely but safeties and rare LB picks show up.
        const interceptor = pickInterceptor(dk.cbs, dk.safeties, dk.lbs) ?? dk.cb1;
        ob.passAttempts += 1;
        ob.interceptions += 1;
        db.defensiveINTs += 1;
        if (interceptor) db.perInterceptor[interceptor.id] = (db.perInterceptor[interceptor.id] ?? 0) + 1;

        const desc = descInterception(ok.qb, interceptor);
        addEvent('interception', desc, 0, false);
        shiftMomentum(-20); // big momentum shift to defense

        const returnPos = clamp(100 - state.fieldPos + Math.floor(Math.random() * 20) - 10, 10, 60);
        switchPossession(returnPos);
        advanceClock(5);

      } else if (roll < sackChance + intChance + (1 - sackChance - intChance) * compBase) {
        // COMPLETION — yards per completion targeting NFL avg ~10.5
        const baseYards = 3 + Math.random() * 9; // 3-12 base (avg 7)
        const bonusYards = (qbThrowing / 100) * 1.8 + (wr1Speed / 100) * 1.3;
        let yardsGained = Math.round(baseYards + bonusYards * Math.random());

        // Big play chance — aggressive plan boosts, conservative reduces
        const userAggMult = isUserOffense && userGamePlan
          ? (userGamePlan.aggressiveness === 'aggressive' ? 1.5 :
             userGamePlan.aggressiveness === 'conservative' ? 0.6 : 1.0)
          : 1.0;
        if (Math.random() < (0.011 + (wr1Speed / 100) * 0.014) * userAggMult) {
          yardsGained += 10 + Math.floor(Math.random() * 14);
        }
        yardsGained = clamp(yardsGained, 1, 55); // completions never lose yards

        // Red zone pass boost
        if (state.fieldPos >= 80) {
          yardsGained = Math.max(yardsGained, Math.round(2 + Math.random() * 6));
        }
        if (state.fieldPos >= 95 && Math.random() < 0.42) {
          yardsGained = 100 - state.fieldPos; // score!
        }

        const isLong = yardsGained >= 20;

        const receiver = pickReceiver(ok.wrs, ok.tes, ok.rbs);

        ob.passAttempts += 1;
        ob.passCompletions += 1;
        ob.passYards += yardsGained;
        ob.receivingTargets += 1;
        ob.receptions += 1;
        ob.receivingYards += yardsGained;
        if (receiver) {
          creditReceiver(ob, receiver.id, { targets: 1, receptions: 1, yards: yardsGained });
        }
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

        const receiver = pickReceiver(ok.wrs, ok.tes, ok.rbs);

        ob.receivingTargets += 1;
        if (receiver) creditReceiver(ob, receiver.id, { targets: 1 });

        const desc = descPassIncomplete(ok.qb, receiver);
        addEvent('pass_incomplete', desc, 0, false);

        // Clock stops on incomplete
        advanceClock(5);
      }

      } // end QB scramble else block
    }

    } // end QB designed run else block

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

  // Kickoff to start (skipped on resume — caller's snapshot is already mid-game)
  if (!resumeFrom) {
    captureSnapshot(); // Q1 start, empty buckets
    doKickoff();
  }

  while (state.quarter <= 4 || state.overtime) {
    if (events.length >= 400) {
      // Bailout to stop runaway games. If we hit the cap mid-OT in a playoff
      // tie, the loop would otherwise exit with state.homeScore === state.awayScore,
      // and downstream commit paths would silently default the winnerId to home
      // (store.ts:8787 used `>=` historically — even after the fix, a tied
      // playoff result is a degenerate state). Force a deterministic walk-off
      // FG to whichever team currently has possession so the bracket gets a
      // clean winner. Reporter: anonymous tester via Tyler-shared 5/2 ~20:10
      // UTC screenshot ("Won the Super Bowl in OT as the bears (jets ran
      // out of time) but it says jets won" — final shown 21-21 with the
      // away team named champion).
      if (state.overtime && state.homeScore === state.awayScore && isPlayoff) {
        const fgWinner = state.possession ?? (Math.random() < 0.5 ? 'home' : 'away');
        if (fgWinner === 'home') state.homeScore += 3;
        else state.awayScore += 3;
        addEvent('field_goal_good', `Walk-off field goal — game over.`, 3, true);
        console.warn('[playByPlay] OT events-cap bailout — synthesized walk-off FG for', fgWinner);
      }
      break;
    }

    // Run a play
    const continueGame = runPlay();
    if (!continueGame) break;

    // Quarter management
    if (state.timeSecs <= 0 && !state.overtime) {
      if (state.quarter === 2) {
        addEvent('quarter_end', `End of the second quarter.`, 0, false);
        addEvent('halftime', `Halftime — ${homeTeam.abbreviation} ${state.homeScore}, ${awayTeam.abbreviation} ${state.awayScore}.`, 0, false);
        state.quarter = 3;
        // NFL rule: timeouts reset to 3 per team at halftime
        state.homeTimeouts = 3;
        state.awayTimeouts = 3;
        state.timeSecs = 900;
        state.twoMinWarningQ2Fired = false;
        captureSnapshot(); // Q3 start (post-halftime)
        // Second half kickoff — coin flip winner typically defers, losing team kicks
        doKickoff();
      } else if (state.quarter === 4) {
        addEvent('quarter_end', `End of the fourth quarter.`, 0, false);
        // Check for tie
        if (state.homeScore === state.awayScore) {
          state.overtime = true;
          state.timeSecs = 600; // 10-min OT
          addEvent('overtime', `Overtime! First score wins. Coin flip — ${Math.random() < 0.5 ? homeTeam.abbreviation : awayTeam.abbreviation} gets possession.`, 0, false);
          captureSnapshot(); // OT start
          doKickoff();
        } else {
          break;
        }
      } else {
        const qLabel = `End of Q${state.quarter}.`;
        addEvent('quarter_end', qLabel, 0, false);
        state.quarter += 1;
        state.timeSecs = 900;
        captureSnapshot(); // Q2 or Q4 start
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
        captureSnapshot(); // additional OT period
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
    // QB — passing + scramble/designed-run rushing stats
    if (keyPlayers.qb) {
      playerStats[keyPlayers.qb.id] = {
        gamesPlayed: 1,
        passAttempts: bucket.passAttempts,
        passCompletions: bucket.passCompletions,
        passYards: bucket.passYards,
        passTDs: bucket.passTDs,
        interceptions: bucket.interceptions,
        rushAttempts: bucket.qbRushAttempts,
        rushYards: bucket.qbRushYards,
        rushTDs: bucket.qbRushTDs,
      };
    }

    // Rushers — read exact per-player totals. Every carry was credited to a
    // specific rusher's bucket at play time, so RB2/RB3 show real stats.
    for (const [pid, run] of Object.entries(bucket.perRusher)) {
      const existing = playerStats[pid];
      playerStats[pid] = {
        ...existing,
        gamesPlayed: 1,
        rushAttempts: (existing?.rushAttempts ?? 0) + run.attempts,
        rushYards: (existing?.rushYards ?? 0) + run.yards,
        rushTDs: (existing?.rushTDs ?? 0) + run.tds,
        fumbles: (existing?.fumbles ?? 0) + run.fumbles,
      };
    }

    // Receivers — read exact per-player totals accumulated during the sim.
    // No share-based distribution: sum(targets/receptions/yards/tds) across
    // receivers matches the QB's totals exactly (invariant asserted below).
    for (const [pid, rec] of Object.entries(bucket.perReceiver)) {
      const existing = playerStats[pid];
      playerStats[pid] = {
        ...existing,
        gamesPlayed: 1,
        targets: (existing?.targets ?? 0) + rec.targets,
        receptions: (existing?.receptions ?? 0) + rec.receptions,
        receivingYards: (existing?.receivingYards ?? 0) + rec.yards,
        receivingTDs: (existing?.receivingTDs ?? 0) + rec.tds,
      };
    }

    // Defenders — tackles distributed by position/rating weight (no per-play
    // tackler tracking yet); sacks + INTs use the exact per-player maps the
    // play loop credited so the live feed matches the final boxscore.
    const defenders = teamPlayers.filter(p =>
      ['DL', 'LB', 'CB', 'S'].includes(p.position) && (!p.injury || p.injury.weeksLeft === 0),
    );
    const totalTackles = Math.max(bucket.tackles, 30 + Math.floor(Math.random() * 20));
    const defWeights = defenders.map(d => {
      const posW = d.position === 'LB' ? 3.5 : (d.position === 'CB' || d.position === 'S') ? 1.8 : 0.8;
      return posW * (d.ratings.tackling / 70);
    });
    const totalWeight = defWeights.reduce((s, w) => s + w, 0) || 1;
    for (let i = 0; i < defenders.length; i++) {
      const share = defWeights[i] / totalWeight;
      const tackles = Math.round(totalTackles * share * (0.85 + Math.random() * 0.3));
      const did = defenders[i].id;
      const existing = playerStats[did];
      playerStats[did] = {
        ...existing,
        gamesPlayed: 1,
        tackles: (existing?.tackles ?? 0) + tackles,
        sacks: (existing?.sacks ?? 0) + (bucket.perSacker[did] ?? 0),
        defensiveINTs: (existing?.defensiveINTs ?? 0) + (bucket.perInterceptor[did] ?? 0),
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

  // Invariant: per-team passing totals must equal the sum of per-receiver
  // totals. If this trips we've silently dropped credit somewhere (ghost TDs,
  // drifting yards) — fail loud in dev, log+continue in prod so saves don't
  // break for end users.
  assertReceivingInvariants('home', homeBucket);
  assertReceivingInvariants('away', awayBucket);

  return {
    events,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    playerStats,
    quarterSnapshots,
  };
}

function assertReceivingInvariants(side: 'home' | 'away', bucket: StatBucket): void {
  let tgts = 0, recs = 0, yds = 0, tds = 0;
  for (const rec of Object.values(bucket.perReceiver)) {
    tgts += rec.targets; recs += rec.receptions; yds += rec.yards; tds += rec.tds;
  }
  let rushAtt = 0, rushYds = 0, rushTds = 0;
  for (const run of Object.values(bucket.perRusher)) {
    rushAtt += run.attempts; rushYds += run.yards; rushTds += run.tds;
  }
  let sacks = 0;
  for (const n of Object.values(bucket.perSacker)) sacks += n;
  let ints = 0;
  for (const n of Object.values(bucket.perInterceptor)) ints += n;

  const mismatches: string[] = [];
  if (tgts !== bucket.receivingTargets) mismatches.push(`tgts qb=${bucket.receivingTargets}/Σ=${tgts}`);
  if (recs !== bucket.receptions) mismatches.push(`rec qb=${bucket.receptions}/Σ=${recs}`);
  if (yds !== bucket.receivingYards) mismatches.push(`rec-yd qb=${bucket.receivingYards}/Σ=${yds}`);
  if (yds !== bucket.passYards) mismatches.push(`pass-yd=${bucket.passYards}/Σrec=${yds}`);
  if (tds !== bucket.receivingTDs || tds !== bucket.passTDs) {
    mismatches.push(`TD pass=${bucket.passTDs}/rec=${bucket.receivingTDs}/Σ=${tds}`);
  }
  if (rushAtt !== bucket.rushAttempts) mismatches.push(`rush-att=${bucket.rushAttempts}/Σ=${rushAtt}`);
  if (rushYds !== bucket.rushYards) mismatches.push(`rush-yd=${bucket.rushYards}/Σ=${rushYds}`);
  if (rushTds !== bucket.rushTDs) mismatches.push(`rush-td=${bucket.rushTDs}/Σ=${rushTds}`);
  if (sacks !== bucket.sacks) mismatches.push(`sacks bucket=${bucket.sacks}/Σ=${sacks}`);
  if (ints !== bucket.defensiveINTs) mismatches.push(`ints bucket=${bucket.defensiveINTs}/Σ=${ints}`);

  if (mismatches.length === 0) return;
  const msg = `[stat-invariant] ${side} boxscore drift: ${mismatches.join(', ')}`;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    throw new Error(msg);
  }
  console.warn(msg);
}

/**
 * Re-simulate a game from a quarter boundary with a (possibly new) game plan.
 *
 * Used when the user opens the mid-game game-plan modal and confirms changes
 * — we rewind to the most recent quarter snapshot at-or-before the user's
 * current playback index, swap in the new plan, and re-run the rest of the
 * game from there. The events the user has already watched (everything before
 * the snapshot) are preserved verbatim. Stats are merged because we resume
 * with the bucket totals from the snapshot.
 *
 * Returns a new LiveGameResult with the spliced events + merged stats.
 */
export function resimulateFromPoint(
  original: LiveGameResult,
  currentEventIndex: number,
  homeTeam: Team,
  awayTeam: Team,
  homePlayers: Player[],
  awayPlayers: Player[],
  isPlayoff: boolean,
  mcafeeMode: boolean,
  newGamePlan: LiveGamePlan,
): LiveGameResult {
  const snapshots = original.quarterSnapshots ?? [];
  if (snapshots.length === 0) {
    // No snapshots — fall back to running a fresh full game with the new plan.
    return simulatePlayByPlay(
      homeTeam, awayTeam, homePlayers, awayPlayers, isPlayoff, mcafeeMode, newGamePlan,
    );
  }

  // Find the latest snapshot at or before the current event index.
  let chosen = snapshots[0];
  for (const snap of snapshots) {
    if (snap.eventIndex <= currentEventIndex) chosen = snap;
    else break;
  }

  const keptEvents = original.events.slice(0, chosen.eventIndex);
  const lastKeptEvent = keptEvents[keptEvents.length - 1];
  const nextEventId = (lastKeptEvent?.id ?? -1) + 1;

  const tail = simulatePlayByPlay(
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,
    isPlayoff,
    mcafeeMode,
    newGamePlan,
    {
      state: chosen.state,
      homeBucket: chosen.homeBucket,
      awayBucket: chosen.awayBucket,
      nextEventId,
    },
  );

  return {
    events: [...keptEvents, ...tail.events],
    homeScore: tail.homeScore,
    awayScore: tail.awayScore,
    playerStats: tail.playerStats,
    quarterSnapshots: tail.quarterSnapshots,
  };
}

/**
 * Convert a LiveGameResult into a full GameResult for committing to the store.
 */
/** Walk PlayEvents in order, scoring-flagged events get rolled up as
 *  ScoringPlay entries. Points are derived from the score delta vs. the
 *  previous event, and teamId from which side's score increased — that
 *  handles defensive scores (pick-six, fumble-six, safety) correctly even
 *  though the offensive `possession` field is the team that turned it over.
 *  Used by liveGameToGameResult AND the live-game commit path so the Box
 *  Score modal's Scoring tab shows real data after a live-played game. */
export function deriveScoringPlaysFromEvents(
  events: PlayEvent[],
  homeTeamId: string,
  awayTeamId: string,
): import('@/types').ScoringPlay[] {
  const out: import('@/types').ScoringPlay[] = [];
  let prevHome = 0;
  let prevAway = 0;
  for (const ev of events) {
    if (!ev.isScoring) {
      // Score still tracks even if event isn't flagged scoring — so the next
      // scoring event gets the correct delta even if there are skipped flags.
      prevHome = ev.homeScore;
      prevAway = ev.awayScore;
      continue;
    }
    const homeDelta = ev.homeScore - prevHome;
    const awayDelta = ev.awayScore - prevAway;
    const points = homeDelta + awayDelta;
    if (points <= 0) {
      // Defensive guard against duplicate-flagged or zero-delta events.
      prevHome = ev.homeScore;
      prevAway = ev.awayScore;
      continue;
    }
    const teamId = homeDelta > 0 ? homeTeamId : awayTeamId;
    out.push({
      quarter: ev.quarter,
      timeLeft: ev.timeStr,
      teamId,
      points,
      description: ev.description,
      score: [ev.awayScore, ev.homeScore],
    });
    prevHome = ev.homeScore;
    prevAway = ev.awayScore;
  }
  return out;
}

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
    scoringPlays: deriveScoringPlaysFromEvents(live.events, baseGame.homeTeamId, baseGame.awayTeamId),
  };
}

/**
 * Derive a partial per-player stats map from a single bucket snapshot.
 * Used by the live-game UI to render running box-score numbers as plays
 * tick in. Tackles are skipped because the final tackle distribution is
 * randomized at end-of-game in applyBucketToStats — running tackle counts
 * pop in once the game finishes. Everything else (passing, rushing,
 * receiving, sacks, INTs) accumulates deterministically per play.
 */
export function livePlayerStatsAtEvent(
  event: PlayEvent | undefined,
  homePlayers: Player[],
  awayPlayers: Player[],
): Record<string, Partial<PlayerStats>> {
  const out: Record<string, Partial<PlayerStats>> = {};
  if (!event || !event.homeBucketSnap || !event.awayBucketSnap) return out;

  function applySide(bucket: StatBucket, sidePlayers: Player[]) {
    const qb = sidePlayers.find(p => p.position === 'QB' && (!p.injury || p.injury.weeksLeft === 0))
      ?? sidePlayers.find(p => p.position === 'QB');
    if (qb && (bucket.passAttempts > 0 || bucket.qbRushAttempts > 0)) {
      out[qb.id] = {
        gamesPlayed: 1,
        passAttempts: bucket.passAttempts,
        passCompletions: bucket.passCompletions,
        passYards: bucket.passYards,
        passTDs: bucket.passTDs,
        interceptions: bucket.interceptions,
        rushAttempts: bucket.qbRushAttempts,
        rushYards: bucket.qbRushYards,
        rushTDs: bucket.qbRushTDs,
      };
    }
    for (const [pid, run] of Object.entries(bucket.perRusher)) {
      const existing = out[pid];
      out[pid] = {
        ...existing,
        gamesPlayed: 1,
        rushAttempts: (existing?.rushAttempts ?? 0) + run.attempts,
        rushYards: (existing?.rushYards ?? 0) + run.yards,
        rushTDs: (existing?.rushTDs ?? 0) + run.tds,
        fumbles: (existing?.fumbles ?? 0) + run.fumbles,
      };
    }
    for (const [pid, rec] of Object.entries(bucket.perReceiver)) {
      const existing = out[pid];
      out[pid] = {
        ...existing,
        gamesPlayed: 1,
        targets: (existing?.targets ?? 0) + rec.targets,
        receptions: (existing?.receptions ?? 0) + rec.receptions,
        receivingYards: (existing?.receivingYards ?? 0) + rec.yards,
        receivingTDs: (existing?.receivingTDs ?? 0) + rec.tds,
      };
    }
    for (const [pid, sacks] of Object.entries(bucket.perSacker)) {
      const existing = out[pid];
      out[pid] = { ...existing, gamesPlayed: 1, sacks: (existing?.sacks ?? 0) + sacks };
    }
    for (const [pid, ints] of Object.entries(bucket.perInterceptor)) {
      const existing = out[pid];
      out[pid] = { ...existing, gamesPlayed: 1, defensiveINTs: (existing?.defensiveINTs ?? 0) + ints };
    }
    const k = sidePlayers.find(p => p.position === 'K');
    if (k && (bucket.fieldGoalAttempts > 0 || bucket.extraPointAttempts > 0)) {
      out[k.id] = {
        gamesPlayed: 1,
        fieldGoalAttempts: bucket.fieldGoalAttempts,
        fieldGoalsMade: bucket.fieldGoalsMade,
        extraPointAttempts: bucket.extraPointAttempts,
        extraPointsMade: bucket.extraPointsMade,
      };
    }
  }
  applySide(event.homeBucketSnap, homePlayers);
  applySide(event.awayBucketSnap, awayPlayers);
  return out;
}
