export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K' | 'P';

/** Detailed position. Lives alongside the broad Position type so existing
 *  roster/cap/sim logic keeps working unchanged, but lets the UI and (later)
 *  scheme/depth-chart logic talk in terms of OT/OG/C, EDGE/DT, FS/SS, etc. */
export type SubPosition =
  | 'QB'
  | 'RB' | 'FB'
  | 'WR' | 'TE'
  | 'OT' | 'OG' | 'C'
  | 'EDGE' | 'DT'
  | 'MLB' | 'OLB'
  | 'CB' | 'FS' | 'SS'
  | 'K' | 'P';

/** BS Mode personality traits */
export type PersonalityTrait = 'irrational_confidence' | 'steady' | 'pressure_fold' | 'clutch';
export type QBTier = 'Elite' | 'Franchise' | 'Bridge' | 'Game Manager' | 'Backup' | 'Camp Arm';

export const POSITIONS: Position[] = [
  'QB', 'RB', 'WR', 'TE', 'OL',
  'DL', 'LB', 'CB', 'S',
  'K', 'P',
];

/** Derive a player's detailed sub-position from their broad Position +
 *  ratings. Pure function — used both at generation time (to seed the
 *  Player.subPosition field) and as a backfill for older saves. */
export function deriveSubPosition(player: {
  position: Position;
  ratings: {
    passRush: number; speed: number; tackling: number; coverage: number;
    strength: number; agility: number; blocking: number; awareness: number;
  };
}): SubPosition {
  if (player.position === 'QB') return 'QB';
  if (player.position === 'WR') return 'WR';
  if (player.position === 'TE') return 'TE';
  if (player.position === 'CB') return 'CB';
  if (player.position === 'K') return 'K';
  if (player.position === 'P') return 'P';

  // RB vs FB: speed+agility (RB) vs strength+blocking (FB). FBs are rare.
  if (player.position === 'RB') {
    const rbScore = player.ratings.speed + player.ratings.agility;
    const fbScore = player.ratings.strength + player.ratings.blocking;
    return fbScore > rbScore * 1.05 ? 'FB' : 'RB';
  }

  // NOTE: this single-player path is a *coarse fallback* — without the rest of
  // a team's roster you can't tell whether a given lineman is the team's most
  // athletic (an OT) or its strongest interior body (an OG). The authoritative
  // distribution comes from classifyTeamSubPositions() below, which ranks each
  // team's position group and splits it proportionally. The thresholds here are
  // calibrated against playerGen's position means (OL: agi~36 spd~35 str~66
  // blk~66 awa~56; DL: pr~67 spd~56 str~68 tkl~56; LB: pr~35 spd~57 cov~57
  // tkl~67 awa~58; S: cov~67 spd~56 tkl~67 str~35) so a lone generated player
  // lands on a sensible label instead of collapsing to the interior default.

  // OL: OT (athletic edge protectors) vs OG (power interior) vs C (smart pivot)
  if (player.position === 'OL') {
    const athletic = player.ratings.agility + player.ratings.speed;
    const power = player.ratings.strength + player.ratings.blocking;
    if (player.ratings.awareness >= 68 && athletic < 75) return 'C';
    return athletic > power * 0.55 ? 'OT' : 'OG';
  }

  // DL: EDGE (pass-rush + speed/agility) vs DT (interior strength)
  if (player.position === 'DL') {
    const edgeScore = player.ratings.passRush + player.ratings.speed + player.ratings.agility;
    const interiorScore = (player.ratings.strength + player.ratings.tackling) * 1.25;
    return edgeScore > interiorScore ? 'EDGE' : 'DT';
  }

  // LB: OLB (edge/cover) vs MLB (inside/run defense)
  if (player.position === 'LB') {
    const edgeScore = player.ratings.passRush + player.ratings.speed + player.ratings.coverage;
    const insideScore = player.ratings.tackling + player.ratings.strength + player.ratings.awareness;
    return edgeScore > insideScore ? 'OLB' : 'MLB';
  }

  // S: FS (cover/speed) vs SS (run support/strength)
  if (player.position === 'S') {
    const fsScore = player.ratings.coverage + player.ratings.speed;
    const ssScore = player.ratings.tackling + player.ratings.strength;
    return fsScore > ssScore + 20 ? 'FS' : 'SS';
  }

  return player.position as SubPosition;
}

/** Players accepted by the team-level sub-position classifier/backfill. A
 *  structural subset of Player so migration code (raw records) and the live
 *  engine can both call it. */
type SubPosClassifiable = {
  id: string;
  position: Position;
  subPosition?: SubPosition;
  firstName?: string;
  lastName?: string;
  ratings: {
    passRush: number; speed: number; tackling: number; coverage: number;
    strength: number; agility: number; blocking: number; awareness: number;
  };
};

/** Reporter-confirmed real-world OL sub-positions for IMPORTED NFL rosters.
 *  The FBGM source only carries the coarse "OL" group, and the ratings
 *  heuristic below cannot recover a lineman's true OT/OG/C identity from
 *  ratings alone — a slow, strong, smart center reads as interior, and a
 *  developmental tackle reads as a backup guard. classifyTeamSubPositions
 *  pins these names first (when useNameOverrides is set) and classifies only
 *  the remaining linemen, so a known center can't be re-labeled a tackle.
 *  Keyed by "First Last" (team in the comment for reference — real NFL OL
 *  names are unique). Extend from tofftanaut's multi-team audit (#bug-reports
 *  msgs 1512275710645899435 / 1512275801524146327 / 1512275857933336627 /
 *  1512275900576694522). Only applied to imported/loaded real rosters, never
 *  to synthetically generated players. */
export const OL_SUBPOSITION_OVERRIDES: Record<string, 'OT' | 'OG' | 'C'> = {
  'Aaron Brewer': 'C',       // MIA
  'Jonah Savaiinaea': 'OG',  // MIA
  'DJ Campbell': 'OG',       // MIA
  'Patrick Paul': 'OT',      // MIA
};

/** Authoritative sub-position assignment for a whole team's roster.
 *
 *  Unlike deriveSubPosition() (which judges a player in isolation and so
 *  collapses toward interior labels — the 5/29 bryangrove bug where every OL
 *  read OG and every DL read DT), this ranks each position group *within the
 *  team* and splits it into realistic proportions. Returns a Map<id,SubPosition>
 *  and does NOT mutate — callers apply it (or use backfillTeamSubPositions).
 *
 *  Splits (calibrated to real NFL position-group construction):
 *    OL  → ~45% OT, one C (the smartest non-tackle pivot), rest OG
 *    DL  → ~45% EDGE, rest DT
 *    LB  → ~55% OLB, rest MLB
 *    S   → ~50% FS, rest SS
 *  Positions with a 1:1 broad→detailed mapping pass straight through. */
export function classifyTeamSubPositions(
  players: SubPosClassifiable[],
  useNameOverrides = false,
): Map<string, SubPosition> {
  const map = new Map<string, SubPosition>();
  const byPos = (pos: Position) => players.filter(p => p.position === pos);

  for (const p of players) {
    switch (p.position) {
      case 'QB': map.set(p.id, 'QB'); break;
      case 'WR': map.set(p.id, 'WR'); break;
      case 'TE': map.set(p.id, 'TE'); break;
      case 'CB': map.set(p.id, 'CB'); break;
      case 'K': map.set(p.id, 'K'); break;
      case 'P': map.set(p.id, 'P'); break;
    }
  }

  // RB vs FB — FBs are rare, so keep the per-player heuristic rather than
  // force a proportion (most teams carry zero true fullbacks).
  for (const p of byPos('RB')) {
    const rb = p.ratings.speed + p.ratings.agility;
    const fb = p.ratings.strength + p.ratings.blocking;
    map.set(p.id, fb > rb * 1.15 ? 'FB' : 'RB');
  }

  // OL: rank by athleticism → OT; carve the smartest interior pivot as C; rest OG.
  // Reporter-confirmed real-world labels (OL_SUBPOSITION_OVERRIDES) are pinned
  // first and removed from the proportional split so a known C/OG can't be
  // re-labeled OT by the heuristic. With useNameOverrides=false the pinned set
  // is empty and this block is identical to the prior pure-heuristic behavior.
  {
    const ol = byPos('OL');
    const n = ol.length;
    if (n > 0) {
      const pinned = new Map<string, 'OT' | 'OG' | 'C'>();
      if (useNameOverrides) {
        for (const p of ol) {
          const key = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
          const ov = OL_SUBPOSITION_OVERRIDES[key];
          if (ov) { map.set(p.id, ov); pinned.set(p.id, ov); }
        }
      }
      let pinnedOT = 0, pinnedC = 0;
      for (const v of pinned.values()) { if (v === 'OT') pinnedOT++; else if (v === 'C') pinnedC++; }

      const pool = ol.filter(p => !pinned.has(p.id));
      const otScore = (p: SubPosClassifiable) =>
        p.ratings.agility + p.ratings.speed + p.ratings.blocking * 0.5;
      const sorted = [...pool].sort((a, b) => otScore(b) - otScore(a));
      // ~45% OT across the whole group (less any pinned OTs), but always leave
      // room for at least one C + the OGs among the unpinned pool.
      let otCount = Math.round(n * 0.45) - pinnedOT;
      otCount = Math.max(n >= 4 ? Math.max(0, 2 - pinnedOT) : 0, Math.min(otCount, Math.max(0, pool.length - 2)));
      const tackles = sorted.slice(0, otCount);
      const interior = sorted.slice(otCount);
      for (const p of tackles) map.set(p.id, 'OT');
      const cCount = Math.max(0, (n >= 12 ? 2 : n >= 4 ? 1 : 0) - pinnedC);
      const centers = [...interior]
        .sort((a, b) =>
          (b.ratings.awareness + b.ratings.blocking - b.ratings.agility) -
          (a.ratings.awareness + a.ratings.blocking - a.ratings.agility))
        .slice(0, cCount);
      const centerIds = new Set(centers.map(p => p.id));
      for (const p of centers) map.set(p.id, 'C');
      for (const p of interior) if (!centerIds.has(p.id)) map.set(p.id, 'OG');
    }
  }

  // DL: rank by pass-rush/burst → EDGE; rest DT (~45% EDGE).
  {
    const dl = byPos('DL');
    const n = dl.length;
    if (n > 0) {
      const edgeScore = (p: SubPosClassifiable) =>
        p.ratings.passRush + p.ratings.speed + p.ratings.agility * 0.5 - p.ratings.strength * 0.5;
      const sorted = [...dl].sort((a, b) => edgeScore(b) - edgeScore(a));
      let edgeCount = Math.round(n * 0.45);
      edgeCount = Math.max(n >= 2 ? 1 : 0, Math.min(edgeCount, n));
      sorted.forEach((p, i) => map.set(p.id, i < edgeCount ? 'EDGE' : 'DT'));
    }
  }

  // LB: rank by edge/coverage → OLB; rest MLB (~55% OLB — most fronts run more
  // OLB-type bodies than true thumpers).
  {
    const lb = byPos('LB');
    const n = lb.length;
    if (n > 0) {
      const olbScore = (p: SubPosClassifiable) =>
        p.ratings.passRush + p.ratings.coverage * 0.5 + p.ratings.speed * 0.5 - p.ratings.tackling * 0.6;
      const sorted = [...lb].sort((a, b) => olbScore(b) - olbScore(a));
      const olbCount = Math.max(n >= 2 ? 1 : 0, Math.round(n * 0.55));
      sorted.forEach((p, i) => map.set(p.id, i < olbCount ? 'OLB' : 'MLB'));
    }
  }

  // S: rank by coverage/speed → FS; rest SS (~50%).
  {
    const s = byPos('S');
    const n = s.length;
    if (n > 0) {
      const fsScore = (p: SubPosClassifiable) =>
        p.ratings.coverage + p.ratings.speed - p.ratings.tackling - p.ratings.strength;
      const sorted = [...s].sort((a, b) => fsScore(b) - fsScore(a));
      const fsCount = Math.round(n / 2);
      sorted.forEach((p, i) => map.set(p.id, i < fsCount ? 'FS' : 'SS'));
    }
  }

  // Any position not handled above (shouldn't happen) → broad position.
  for (const p of players) {
    if (!map.has(p.id)) map.set(p.id, p.position as SubPosition);
  }

  return map;
}

/** Apply classifyTeamSubPositions() in place — sets player.subPosition on every
 *  player in the given roster. Idempotent; safe to re-run after any roster
 *  mutation (trade/sign/release) or at load time. */
export function backfillTeamSubPositions(
  players: SubPosClassifiable[],
  useNameOverrides = false,
): void {
  const map = classifyTeamSubPositions(players, useNameOverrides);
  for (const p of players) {
    const sub = map.get(p.id);
    if (sub) p.subPosition = sub;
  }
}

/** Auto-assign OL slot positions (LT/LG/C/RG/RT) to a team's offensive
 *  linemen by their derived sub-position + ratings. Centers go to C; the two
 *  best OTs split between LT (highest pass-protection — agility+blocking) and
 *  RT (next-best); the two best OGs split between LG and RG by strength.
 *  Returns a Map<playerId, olSlot> rather than mutating; callers apply it. */
export function assignOlSlots(rosterPlayers: {
  id: string;
  position: Position;
  subPosition?: SubPosition;
  ratings: { agility: number; blocking: number; strength: number; awareness: number };
}[]): Map<string, 'LT' | 'LG' | 'C' | 'RG' | 'RT'> {
  const result = new Map<string, 'LT' | 'LG' | 'C' | 'RG' | 'RT'>();
  const ol = rosterPlayers.filter(p => p.position === 'OL');
  const centers = ol.filter(p => p.subPosition === 'C').sort((a, b) => (b.ratings.awareness + b.ratings.blocking) - (a.ratings.awareness + a.ratings.blocking));
  const tackles = ol.filter(p => p.subPosition === 'OT').sort((a, b) => (b.ratings.agility + b.ratings.blocking) - (a.ratings.agility + a.ratings.blocking));
  const guards = ol.filter(p => p.subPosition === 'OG').sort((a, b) => (b.ratings.strength + b.ratings.blocking) - (a.ratings.strength + a.ratings.blocking));

  if (centers[0]) result.set(centers[0].id, 'C');
  if (tackles[0]) result.set(tackles[0].id, 'LT');
  if (tackles[1]) result.set(tackles[1].id, 'RT');
  if (guards[0]) result.set(guards[0].id, 'LG');
  if (guards[1]) result.set(guards[1].id, 'RG');
  return result;
}

/**
 * Legacy display helper — kept for callers that read the old string-typed
 * sub-position label. New code should use Player.subPosition (typed) directly,
 * which is set at generation time and backfilled on load.
 */
export function getSubPosition(player: {
  position: Position;
  subPosition?: SubPosition;
  ratings: { passRush: number; speed: number; tackling: number; coverage: number; strength: number; agility: number; blocking: number; carrying: number; awareness: number };
}): string {
  // Prefer the stored sub-position (set at generation, backfilled per team on
  // load, and re-derived after roster moves) — it reflects the team-relative
  // classification, not the coarse per-player guess. Fall back to deriving only
  // when an older save hasn't populated the field yet.
  if (player.subPosition) return player.subPosition;
  return deriveSubPosition(player);
}

/** NFL Passer Rating (scale 0-158.3). Pass attempts must be > 0. */
export function calcPasserRating(comp: number, att: number, yds: number, td: number, int: number): number {
  if (att === 0) return 0;
  const a = Math.min(2.375, Math.max(0, ((comp / att) - 0.3) * 5));
  const b = Math.min(2.375, Math.max(0, ((yds / att) - 3) * 0.25));
  const c = Math.min(2.375, Math.max(0, (td / att) * 20));
  const d = Math.min(2.375, Math.max(0, 2.375 - ((int / att) * 25)));
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

// Roster position caps aligned to real NFL 53-man construction:
//   OL typically 9-10, DL 8-10, LB 6-8, WR 5-6. Undersized DL/OL/LB caps
//   were starving the draft AI — imported rosters entered the draft
//   already at/above the old max (7 DL, 8 OL, 6 LB), so the draft AI's
//   "if count >= max, crush score" gate fired on every team and top DL
//   prospects lingered to late rounds.
export const ROSTER_LIMITS: Record<Position, { min: number; max: number }> = {
  QB: { min: 1, max: 3 },
  RB: { min: 2, max: 4 },
  WR: { min: 3, max: 6 },
  TE: { min: 1, max: 3 },
  OL: { min: 5, max: 10 },
  DL: { min: 4, max: 10 },
  LB: { min: 3, max: 8 },
  CB: { min: 3, max: 6 },
  S: { min: 2, max: 5 },
  K: { min: 1, max: 1 },
  P: { min: 1, max: 1 },
};

export interface PlayerRatings {
  overall: number;
  speed: number;
  strength: number;
  agility: number;
  awareness: number;
  stamina: number;
  // Offense
  throwing: number;
  catching: number;
  carrying: number;
  blocking: number;
  // Defense
  tackling: number;
  coverage: number;
  passRush: number;
  // Special
  kicking: number;
}

/** Auto-generated college career stats for draft prospect scouting */
export interface CollegeStats {
  /** Number of college seasons played */
  seasons: number;
  /** Total games played */
  gamesPlayed: number;
  // Offense
  passYards?: number;
  passTDs?: number;
  passINTs?: number;
  rushYards?: number;
  rushTDs?: number;
  recYards?: number;
  recTDs?: number;
  receptions?: number;
  // Defense
  tackles?: number;
  sacks?: number;
  interceptions?: number;
  forcedFumbles?: number;
  // Special
  fieldGoalPct?: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  // Passing
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  // Rushing
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  fumbles: number;
  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  // Defense
  tackles: number;
  tacklesForLoss: number;
  sacks: number;
  defensiveINTs: number;
  passDeflections: number;
  forcedFumbles: number;
  // Offensive line
  sacksAllowed: number;
  passBlocks: number;
  // Kicking
  fieldGoalAttempts: number;
  fieldGoalsMade: number;
  extraPointAttempts: number;
  extraPointsMade: number;
  // Punting
  puntAttempts: number;
  puntYards: number;
  puntsInside20: number;
  touchbacks: number;
  // Kick/Punt Returns
  kickReturns: number;
  kickReturnYards: number;
  kickReturnTDs: number;
  puntReturns: number;
  puntReturnYards: number;
  puntReturnTDs: number;
  // Snap tracking
  snaps: number;
}

/** Per-year contract breakdown used for restructured contracts */
export interface ContractYear {
  baseSalary: number;      // Base salary for this year ($M)
  proratedBonus: number;   // Accumulated prorated signing bonus ($M), 0 by default
  isVoidYear: boolean;     // true = dummy year added for spreading proration
}

/** Log entry for a single contract restructure */
export interface ContractRestructure {
  season: number;          // When the restructure happened
  amountConverted: number; // How much base salary was converted to bonus
  voidYearsAdded: number;  // How many void years were added (0-3)
  proratedPerYear: number; // The per-year prorated charge created
}

export interface Contract {
  salary: number;
  yearsLeft: number;
  /** Total guaranteed money remaining on the contract (dead cap if released) */
  guaranteed: number;
  /** Original total years of the contract (for dead-cap proration) */
  totalYears?: number;
  /** Per-year breakdown — populated on first restructure, undefined for simple contracts */
  contractYears?: ContractYear[];
  /** Total void years added to this contract (max 3 lifetime) */
  voidYears?: number;
  /** History of all restructures on this contract */
  restructureHistory?: ContractRestructure[];
  /** Set true when signed during offseason — prevents first startNewSeason decrement */
  offseasonSigned?: boolean;
}

/** Shape for user-imported draft prospects (Import Draft Class feature). */
export interface ImportedProspect {
  firstName: string;
  lastName: string;
  position: Position;
  college?: string;
  age?: number;
  overall?: number;      // 40-99, defaults to random 55-80
  potential?: number;     // 40-99, defaults to overall + random 5-15
  /** Optional detailed ratings — if not provided, generated from overall. */
  ratings?: Partial<PlayerRatings>;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  /** Detailed sub-position derived from ratings (Phase 1 — Apr 11 2026).
   *  Optional during the rollout to allow lazy backfill on existing saves. */
  subPosition?: SubPosition;
  /** OL-specific slot assignment (LT/LG/C/RG/RT). Phase 2 of the depth-chart
   *  work — lets users assign a specific tackle to the LT slot vs the RT slot
   *  rather than treating all OTs as interchangeable. */
  olSlot?: 'LT' | 'LG' | 'C' | 'RG' | 'RT';
  age: number;
  experience: number;
  ratings: PlayerRatings;
  potential: number;
  /** Season-end OVR snapshots recorded each offseason before development runs. */
  ratingHistory: { season: number; overall: number }[];
  stats: PlayerStats;
  careerStats: PlayerStats;
  contract: Contract;
  teamId: string | null;
  draftYear: number | null;
  draftPick: number | null;
  retired: boolean;
  injury: { type: string; weeksLeft: number } | null;
  /** User opted to start this player despite an active injury. Accepts an OVR
   *  penalty and an elevated re-injury chance; only settable when weeksLeft ≤ 3. */
  playingThroughInjury?: boolean;
  /** Currently on Injured Reserve */
  onIR: boolean;
  /** Projected draft rank (noisy media perception, set at draft class creation) */
  projectedRank?: number;
  /** Whether the player is holding out for a new contract */
  holdout?: boolean;
  /** BS Mode: personality trait affecting performance variance */
  personality?: PersonalityTrait;
  /** How this player was acquired by their current team (set once on first joining) */
  acquiredVia?: 'draft' | 'free-agency' | 'trade' | 'initial';
  /** Season when the player was acquired by their current team */
  acquiredSeason?: number;
  /** Scouting label assigned at draft (cosmetic flavor) */
  scoutingLabel?: string;
  /** Deterministic seed for scouting report generation (set at draft class creation) */
  scoutingSeed?: number;
  /** Draft prospect archetype — affects post-draft development.
   *  boom: late bloomer who can dramatically exceed expectations (potential jumps)
   *  bust: high-profile prospect who fails to develop (potential drops sharply)
   *  normal: standard development curve */
  draftProfile?: 'boom' | 'bust' | 'normal';
  /**
   * Player sentiment / mood (0-100).
   * Affected by: team winning, playing time (depth chart), contract satisfaction, team location.
   * Low sentiment → holdouts, locker room problems, unlikely to re-sign.
   */
  mood: number;
  /** Season when the player last had their contract restructured (prevents repeat restructures) */
  lastRestructuredSeason?: number;
  /** Optional photo URL (populated from imported league files) */
  photoUrl?: string;
  /** God Mode override: forces a custom seed for the auto-generated avatar.
   *  When set, PlayerAvatar uses this in place of `id` so users can re-roll
   *  a portrait they don't like. */
  portraitSeedOverride?: string;
  /** User-flagged "starred" draft prospect — keep tabs across the scouting
   *  window. Cleared when the player gets drafted (no longer a prospect).
   *  milkytoad 4/27 ask. */
  isStarred?: boolean;
  /** Combine measurables (40-yard dash, bench press, vertical jump) */
  combineStats?: { fortyYard: number; benchPress: number; verticalJump: number };
  /** College / university the player attended (flavor text for draft) */
  college?: string;
  /** Auto-generated college stats for draft scouting flavor */
  collegeStats?: CollegeStats;
  /** Heisman winner flag (top prospect in the class) */
  heismanWinner?: boolean;
  /** Heisman finalist flag (top ~3 offensive prospects in the class). The
   *  winner is also a finalist — check heismanWinner first when rendering. */
  heismanFinalist?: boolean;
  /** Height string e.g. "6'3\"" */
  height?: string;
  /** Weight in lbs */
  weight?: number;
  /** Round the player was drafted in */
  draftRound?: number;
  /** Team ID that originally drafted this player */
  draftTeamId?: string;
  /** Free agency priority — what matters most to this player in FA */
  faPriority?: 'money' | 'winning' | 'role' | 'loyalty';
  /** Stats from the previous completed season (for free agency display) */
  previousSeasonStats?: PlayerStats;
  /** Season-by-season stat history */
  seasonLog?: { season: number; teamId: string; stats: PlayerStats }[];
  /** Career awards earned */
  awards?: { award: string; season: number }[];
  /** Discipline rating (0-100). Low = more likely to get suspended. */
  discipline?: number;
  /** Active suspension: games remaining, reason, and fine amount */
  suspension?: { gamesLeft: number; reason: string; fine: number };
  /** Jersey number on the player's current team. Auto-assigned from the
   *  position's valid range on team join; kept across seasons unless the
   *  player changes teams or the new team has already retired that number. */
  jerseyNumber?: number;
  /** Season-week number (e.g., 7) when the player was placed on IR. Used to
   *  enforce the 3-week designated-to-return rule. */
  irPlacedWeek?: number;
}

/** Valid jersey-number ranges per position, traditional NFL rules. Each range
 *  is an inclusive pair [lo, hi]. The assigner walks the union in order,
 *  picking the lowest unused number not in the team's retiredNumbers list. */
export const JERSEY_RANGES: Record<Position, [number, number][]> = {
  QB: [[1, 19]],
  RB: [[20, 49]],
  WR: [[10, 19], [80, 89]],
  TE: [[40, 49], [80, 89]],
  OL: [[50, 79]],
  DL: [[50, 79], [90, 99]],
  LB: [[40, 59], [90, 99]],
  CB: [[20, 49]],
  S: [[20, 49]],
  K: [[1, 19]],
  P: [[1, 19]],
};

/** Assign a jersey number to a player joining `takenNumbers` on a team with
 *  the given retired-number set. Returns the lowest valid unused number for
 *  the player's position, or 0 as a last-resort fallback if everything in
 *  the allowed ranges is taken (practically shouldn't happen — 30+ numbers
 *  per position vs 53-man roster). */
export function assignJerseyNumber(
  position: Position,
  takenNumbers: Set<number>,
  retiredNumbers: Set<number>,
): number {
  const ranges = JERSEY_RANGES[position] ?? [[0, 99]];
  for (const [lo, hi] of ranges) {
    for (let n = lo; n <= hi; n++) {
      if (takenNumbers.has(n) || retiredNumbers.has(n)) continue;
      return n;
    }
  }
  // Fallback: any unused 0-99 not retired
  for (let n = 0; n <= 99; n++) {
    if (!takenNumbers.has(n) && !retiredNumbers.has(n)) return n;
  }
  return 0;
}

/** Walk every team and ensure each player has a unique valid jersey number.
 *  Preserves existing valid numbers; reassigns duplicates or retired-number
 *  conflicts; fills in any that are missing. Pure — returns a new players
 *  array; call whenever state is loaded or rosters are generated to cover
 *  edge cases that slipped past the per-acquisition assigners. */
export function reconcileJerseys(players: Player[], teams: Team[]): Player[] {
  const patches = new Map<string, number>();
  const byTeam = new Map<string, Player[]>();
  for (const p of players) {
    if (!p.teamId) continue;
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  for (const [tid, teamPlayers] of byTeam) {
    const team = teams.find(t => t.id === tid);
    const retired = new Set<number>((team?.retiredNumbers ?? []).map(r => r.number));
    const taken = new Set<number>();
    // Stable order so a rerun produces the same assignment.
    const sorted = [...teamPlayers].sort((a, b) => {
      const ap = a.draftPick ?? 9999;
      const bp = b.draftPick ?? 9999;
      if (ap !== bp) return ap - bp;
      return a.lastName.localeCompare(b.lastName);
    });
    for (const p of sorted) {
      const num = p.jerseyNumber;
      if (typeof num === 'number' && !taken.has(num) && !retired.has(num)) {
        // Existing number is still unique + not retired — keep it.
        taken.add(num);
        continue;
      }
      const n = assignJerseyNumber(p.position, taken, retired);
      patches.set(p.id, n);
      taken.add(n);
    }
  }
  if (patches.size === 0) return players;
  return players.map(p => patches.has(p.id) ? { ...p, jerseyNumber: patches.get(p.id) } : p);
}

/** Format a team record as "W-L" or "W-L-T" if ties > 0 */
export function formatRecord(r: { wins: number; losses: number; ties?: number }): string {
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: number;
  divisionWins: number;
  divisionLosses: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  /** Against the spread wins (betting) */
  atsWins?: number;
  /** Against the spread losses (betting) */
  atsLosses?: number;
  /** Against the spread pushes (betting) */
  atsPushes?: number;
}

export interface DeadCapEntry {
  playerName: string;
  amount: number;
  yearsLeft: number;
  /** Source of the dead cap charge */
  source?: 'release' | 'trade' | 'void' | 'extension' | 'coach-fire';
  /** Season the dead cap was created */
  season?: number;
  /** True when the entry sits on the coaching budget instead of the salary cap. */
  isCoaching?: boolean;
}

// ---------------------------------------------------------------------------
// Coaching types
// ---------------------------------------------------------------------------

export type CoachRole = 'HC' | 'OC' | 'DC' | 'QB' | 'RB' | 'WR' | 'OL' | 'DL' | 'DB';
/** The 6 position-coach roles added in Phase 1 coaching tree */
export const POSITION_COACH_ROLES: CoachRole[] = ['QB', 'RB', 'WR', 'OL', 'DL', 'DB'];
/** Which player positions each coach role develops */
export const COACH_ROLE_POSITIONS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR', 'TE'],
  OL: ['OL'],
  DL: ['DL'],
  DB: ['CB', 'S', 'LB'],
};
export type OffensiveScheme = 'spread' | 'west_coast' | 'power_run' | 'air_raid' | 'rpo';
export type DefensiveScheme = 'cover_3' | 'man_press' | 'tampa_2' | 'blitz_34' | 'zone_blitz';

export interface CoachHistory {
  teamId: string;
  teamName: string;
  role: CoachRole;
  seasonStart: number;
  seasonEnd: number;
  wins: number;
  losses: number;
  playoffAppearances: number;
  championships: number;
}

export interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  role: CoachRole;
  ovr: number;
  age: number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  trait: string;
  yearsWithTeam: number;
  careerWins: number;
  careerLosses: number;
  bio?: string;
  history?: CoachHistory[];
  ratingHistory?: { season: number; ovr: number }[];
  personality?: string;
  specialties?: string[];
  contractYears?: number;
  salary?: number;
  /** Guaranteed money owed if the coach is fired before contract expires.
   *  Drives dead-cap math on the coaching budget. Defaults to ~60% of
   *  total remaining contract value when generated. */
  guaranteed?: number;
}

export interface OwnerObjective {
  id: string;
  description: string;
  type: 'wins' | 'playoffs' | 'cap' | 'development' | 'championship';
  target: number | string;
  season: number;
  status: 'active' | 'completed' | 'failed';
}

export interface ApprovalState {
  fanApproval: number;
  ownerApproval: number;
  objectives: OwnerObjective[];
  tenureSeasons: number;
  warningIssued: boolean;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
  /** Team logo URL (from imported league files, e.g. FBGM imgURL) */
  logoUrl?: string;
  record: TeamRecord;
  salaryCap: number;
  totalPayroll: number;
  roster: string[];
  draftPicks: DraftPick[];
  /** Ordered player IDs per position; index 0 = starter */
  depthChart: Record<Position, string[]>;
  /** Dead cap charges from released players */
  deadCap: DeadCapEntry[];
  /** Whether the franchise tag has been used this season */
  franchiseTagUsed: boolean;
  /** Coaching staff (HC, OC, DC) */
  coaches?: Coach[];
  /** Defensive base formation. Used by the depth chart to render position
   *  group slots (4-3 has 4 DL/3 LB; 3-4 has 3 DL/4 LB; Nickel adds a 5th DB).
   *  Default '4-3' for existing teams via migration. */
  baseFormation?: '3-4' | '4-3' | 'Nickel';
  /** Owner personality affecting expectations + financial appetite.
   *    'frugal'   — low payroll tolerance, modest win targets, slow to fire
   *    'balanced' — median expectations, default behavior
   *    'win-now'  — aggressive win targets, quicker fire trigger, higher cap tolerance */
  ownerPersonality?: 'frugal' | 'balanced' | 'win-now';
  /** BS Mode: Ewing Theory active */
  ewingTheory?: { injuredPlayerId: string; teamPowerBoost: number };
  /** Revenue breakdown (computed at start of each season) */
  revenue: {
    tickets: number;
    merchandise: number;
    tvDeal: number;
    total: number;
  };
  /** Fan and owner approval + seasonal objectives */
  approval?: ApprovalState;
  /** Jersey numbers the franchise has retired. Blocks future auto-assigns
   *  and rendered on the team honors page. Only retirable via an explicit
   *  owner action on a retired or HoF-track player. */
  retiredNumbers?: { number: number; playerId: string; playerName: string; season: number }[];
  /** Practice squad roster — player ids held on a developmental tier beneath
   *  the active 53. Cap of PRACTICE_SQUAD_LIMIT; contracts are flat league
   *  minimum and don't count against the team's main salary cap. */
  practiceSquad?: string[];
  /** Injured reserve — player ids parked off the active 53 so their roster
   *  slot can be filled by another signing. Placing a player on IR requires
   *  an injury with weeks-left >= 4; activation requires at least 3 weeks
   *  elapsed since placement (NFL designated-to-return rule). */
  injuredReserve?: string[];
}

/** Practice squad cap — standard 16 slots. */
export const PRACTICE_SQUAD_LIMIT = 16;

/** Minimum weeks remaining on the injury clock to qualify for IR. */
export const IR_MIN_WEEKS_OUT = 4;

/** Minimum weeks a player must spend on IR before activation. */
export const IR_RETURN_CLOCK_WEEKS = 3;

/** Maximum OVR allowed on the PS. Keeps it a developmental tier rather than
 *  a cap-dodging stash for active starters. Anyone above this must be on the
 *  active 53 or be a free agent. */
export const PRACTICE_SQUAD_MAX_OVR = 80;

/** Max accrued seasons (experience) before a player becomes veteran-eligible
 *  only. Players with experience > this can still be PS-eligible but only in
 *  a limited number of "vet" slots. */
export const PRACTICE_SQUAD_VET_THRESHOLD = 2;

/** A player is eligible for the practice squad if they're not starter-grade
 *  and either a young player or slotted into a vet-eligible slot. The caller
 *  passes the current PS so we can check the vet-slot cap dynamically. */
export function isPracticeSquadEligible(
  player: Player,
  currentPsPlayers: Player[],
  vetSlotCap = 4,
): { eligible: boolean; reason: string } {
  if (player.retired) return { eligible: false, reason: 'Retired player.' };
  if (player.onIR) return { eligible: false, reason: 'On IR.' };
  if (player.ratings.overall > PRACTICE_SQUAD_MAX_OVR) {
    return { eligible: false, reason: `Too good for PS (${player.ratings.overall} OVR > ${PRACTICE_SQUAD_MAX_OVR}).` };
  }
  if (player.experience > PRACTICE_SQUAD_VET_THRESHOLD) {
    const vetCount = currentPsPlayers.filter(p => p.experience > PRACTICE_SQUAD_VET_THRESHOLD).length;
    if (vetCount >= vetSlotCap) {
      return { eligible: false, reason: `Veteran PS slots full (${vetCount}/${vetSlotCap}).` };
    }
  }
  return { eligible: true, reason: '' };
}

/**
 * Calculates the dead cap hit when releasing a player.
 * Uses the formula directly to avoid stale stored guaranteed values.
 * Dead cap is always < salary, so cutting always saves cap space.
 */
export function calculateDeadCap(contract: Contract): number {
  // Compute guaranteed from formula — never trust stored value (may be from old buggy formula)
  const formulaGuaranteed = generateGuaranteed(contract.salary, contract.yearsLeft);
  // Use whichever is lower: stored value or formula (handles both old inflated values AND correctly reduced values)
  const stored = contract.guaranteed ?? Infinity;
  const guaranteed = Math.min(stored, formulaGuaranteed);
  return Math.round(guaranteed * 10) / 10;
}

/**
 * Calculates the actual cap savings from releasing a player.
 * Savings = annual salary - dead cap hit (can be negative in year 1 of big deals!)
 */
export function calculateCapSavings(contract: Contract): number {
  const deadCap = calculateDeadCap(contract);
  const savings = contract.salary - deadCap;
  return Math.round(savings * 10) / 10;
}

/**
 * Generates a guaranteed amount for a new contract.
 * Pro-style: guaranteed money is roughly 1-2 years of salary, NOT a % of total value.
 * This ensures releasing a player always saves cap space (dead cap < annual salary).
 * Guaranteed $ is prorated across years, so dead cap = guaranteed * (yearsLeft/totalYears).
 * For savings to be positive: salary > guaranteed * (yearsLeft/totalYears)
 * → guaranteed must be < salary * totalYears (always true with these values).
 */
export function generateGuaranteed(salary: number, years: number): number {
  // Realistic guaranteed money:
  // - Star players (high salary) get more guaranteed
  // - Short deals get higher % guaranteed but lower total
  // - Cutting a player should almost always save SOME cap space
  //
  // Examples:
  //   1-year $1M deal: ~$0.2-0.5M guaranteed (signing bonus only)
  //   1-year $10M deal: ~$5-7M guaranteed
  //   3-year $15M/yr deal: ~$25-30M total guaranteed (~55-65%)
  //   5-year $50M/yr deal: ~$100-125M total guaranteed (~40-50%)
  //
  // Dead cap = guaranteed * (yearsLeft / totalYears)
  // Cap savings = salary - deadCap
  // We want savings > 0 almost always, especially for depth players.

  if (salary <= 1) {
    // Minimum/low salary: small signing bonus only
    return Math.round(salary * 0.25 * 10) / 10;
  }

  // Base guaranteed fraction decreases with contract length
  // But total guaranteed $ increases with salary (stars get more guaranteed)
  const baseFraction = years <= 1 ? 0.40 : years <= 2 ? 0.55 : years <= 3 ? 0.50 : years <= 4 ? 0.45 : 0.40;

  // Higher-paid players get slightly more guaranteed (as % of salary)
  // A $20M/yr player might get 60% guaranteed, a $2M/yr player gets 35%
  const salaryBonus = Math.min(0.15, (salary / 100) * 0.5);

  const fraction = Math.min(0.70, baseFraction + salaryBonus);
  return Math.round(salary * fraction * 10) / 10;
}

// ── Contract Restructuring Helpers ──────────────────────────────────

/**
 * Get the current-year cap hit for a contract.
 * If contractYears exists, use index 0 (baseSalary + proratedBonus).
 * Otherwise fall back to the flat salary field.
 */
export function getCapHit(contract: Contract): number {
  if (contract.contractYears && contract.contractYears.length > 0) {
    const yr = contract.contractYears[0];
    return Math.round((yr.baseSalary + yr.proratedBonus) * 100) / 100;
  }
  return contract.salary;
}

/**
 * Get the total unamortized prorated bonus remaining across ALL years.
 * This is the dead money that accelerates on cut/trade.
 */
export function getUnamortizedBonus(contract: Contract): number {
  if (!contract.contractYears) return 0;
  return Math.round(
    contract.contractYears.reduce((sum, yr) => sum + yr.proratedBonus, 0) * 100
  ) / 100;
}

/**
 * Calculate dead cap for a contract, handling both restructured and legacy contracts.
 * Restructured: all unamortized prorated bonus accelerates.
 * Legacy: falls back to the original calculateDeadCap formula.
 */
export function calculateDeadCapV2(contract: Contract): number {
  if (contract.contractYears) {
    return getUnamortizedBonus(contract);
  }
  return calculateDeadCap(contract);
}

/**
 * Calculate cap savings from releasing a player.
 * Savings = current year cap hit - dead money charge.
 */
export function calculateCapSavingsV2(contract: Contract): number {
  const capHit = getCapHit(contract);
  const deadCap = calculateDeadCapV2(contract);
  return Math.round((capHit - deadCap) * 100) / 100;
}

/**
 * Create a ContractYear[] from a flat contract model.
 * Called on first restructure to materialize the per-year breakdown.
 * All years get the same baseSalary = contract.salary, proratedBonus = 0.
 */
export function materializeContractYears(contract: Contract): ContractYear[] {
  const years: ContractYear[] = [];
  for (let i = 0; i < contract.yearsLeft; i++) {
    years.push({ baseSalary: contract.salary, proratedBonus: 0, isVoidYear: false });
  }
  return years;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalTeamId: string;
  ownerTeamId: string;
  pick?: number;
  playerId?: string;
}

export interface ScoringPlay {
  /** Which quarter (1-4, 5 for OT) */
  quarter: number;
  /** Time remaining in the quarter (e.g. "12:34") */
  timeLeft?: string;
  /** Team that scored */
  teamId: string;
  /** Points scored on this play */
  points: number;
  /** Description of the scoring play */
  description: string;
  /** Running score after this play: [away, home] */
  score: [number, number];
}

export interface BettingLine {
  spread: number;        // negative = home favored
  overUnder: number;
  homeML: number;        // e.g. -175
  awayML: number;        // e.g. +155
}

export interface GameResult {
  id: string;
  week: number;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  played: boolean;
  playerStats: Record<string, Partial<PlayerStats>>;
  /** Scoring play log for box score display */
  scoringPlays?: ScoringPlay[];
  bettingLine?: BettingLine;
  /** ATS result after game played */
  spreadCover?: 'home' | 'away' | 'push';
  /** Whether total went over the O/U */
  overHit?: boolean;
}

export interface SocialPost {
  id: string;
  author: {
    type: 'player' | 'fan' | 'media' | 'team';
    playerId?: string;
    personId?: 'tony_blaze' | 'marcus_cole';
    teamId?: string;
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  text: string;
  timestamp: { season: number; week: number };
  likes: number;
  reposts: number;
  replies: number;
  action?: {
    label: string;
    type: 'extend' | 'trade' | 'viewPlayer' | 'viewRoster' | 'negotiate';
    playerId?: string;
  };
  category: 'player' | 'fan' | 'media' | 'team';
}

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system' | 'quote' | 'rumor' | 'recap';
  teamId?: string;
  playerIds?: string[];
  headline: string;
  body?: string;
  isUserTeam: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedSeason?: number;
  unlockedWeek?: number;
}

export interface AllLeagueEntry {
  position: Position;
  playerId: string;
  teamId: string;
}

export interface RetiredPlayerEntry {
  playerId: string;
  name: string;
  position: Position;
  teamId: string;
  age: number;
}

export interface SeasonSummary {
  season: number;
  championTeamId: string;
  finalsMvpId: string;
  /** Championship game stats for the MVP */
  finalsMvpGameStats?: Partial<PlayerStats>;
  awards: { award: string; playerId: string; teamId: string }[];
  bestRecord: {
    ac: { teamId: string; wins: number; losses: number };
    nc: { teamId: string; wins: number; losses: number };
  };
  allLeagueFirst: AllLeagueEntry[];
  allLeagueSecond: AllLeagueEntry[];
  allRookieTeam: AllLeagueEntry[];
  retiredPlayers: RetiredPlayerEntry[];
  statLeaders: Record<string, { playerId: string; value: number }>;
  userRecord: { wins: number; losses: number };
  userPlayoffResult: 'missed' | 'wildcard' | 'divisional' | 'conference' | 'runnerup' | 'champion';
}

export interface TradeProposal {
  id: string;
  season: number;
  week: number;
  /** The AI team proposing the trade */
  proposingTeamId: string;
  /** What the AI offers to the user */
  offeredPlayerIds: string[];
  offeredPickIds: string[];
  /** What the AI wants from the user */
  requestedPlayerIds: string[];
  requestedPickIds: string[];
  /** 'pending' | 'accepted' | 'rejected' */
  status: 'pending' | 'accepted' | 'rejected';
  valueAssessment: 'fair' | 'lopsided-you-win' | 'lopsided-they-win';
}

export interface ResigningEntry {
  playerId: string;
  askingSalary: number;
  askingYears: number;
  /** Player refuses to negotiate — mood too low */
  refusesToResign?: boolean;
}

export interface LeagueSettings {
  salaryCap: number;         // Starting cap (default 300)
  capGrowthRate: number;     // % annual growth (default 5)
  luxuryTaxRate: number;     // Penalty multiplier (default 1.5)
  leagueMinSalary: number;   // Minimum salary (default 0.75)
  tradeDeadlineWeek: number; // Week trades close (default 12)
  injuryRate: number;        // 0-200, 100 = normal (default 100)
  progressionRate: number;   // 0-200, 100 = normal (default 100)
  regressionRate: number;    // 0-200, 100 = normal (default 100)
  retirementAge: number;     // Min age for retirement consideration (default 32)
  bsMode: boolean;           // BS Mode: adds drama and variance
  mcafeeMode: boolean;       // McAfee Mode: special teams matter
  /** Chaos Draft mode: top picks bust, late picks boom (JaMarcus Russell / Brock Purdy League) */
  chaosDraft: boolean;
  /** Use Claude AI to generate unique Team Spotlight commentary */
  aiCommentary: boolean;
  /** God Mode: full commissioner control — edit players, force trades, etc. */
  godMode: boolean;
  /** Permanently set once God Mode is enabled — disables achievements */
  godModeUsed: boolean;
  /** Roster management depth (Apr 11 2026) */
  rosterLimitEnabled: boolean;       // default true — enforces 53-man active
  practiceSquadEnabled: boolean;     // default false — adds PS slots and logic (Phase 2)
  irEnabled: boolean;                // default false — IR designated-for-return rules (Phase 2)
  practiceSquadSize: number;         // default 16 (only meaningful if practiceSquadEnabled)
  /** Suspension frequency multiplier (0.0–2.0, default 1.0). 0 = off, 2 = double rate */
  suspensionFrequency: number;
  /** Number of preseason games (0-4, default 3). 0 = skip preseason. */
  preseasonGames: number;
  /** Enables dev-only diagnostic panels + sim-balance telemetry recording.
   *  Off by default; no user-facing panels today, but turning this on starts
   *  capturing per-game OVR-delta vs score-delta records into store.simTelemetry. */
  devPanels: boolean;
  /** Show predicted-favorite indicator (win % badge) on schedule + matchup
   *  cards for upcoming games. Default true; off for testers who prefer a
   *  blind viewing experience. */
  showPredictedFavorite?: boolean;
  /** Reveal the raw coach OVR number on the hiring market. Default false —
   *  hiring shows a tier label + scheme-fit chip instead. tofftanaut 4/27
   *  ask: hiring should require evaluation, not just a number to chase. */
  showCoachOVR?: boolean;
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  salaryCap: 300,
  capGrowthRate: 7,
  luxuryTaxRate: 1.5,
  leagueMinSalary: 0.75,
  tradeDeadlineWeek: 12,
  injuryRate: 100,
  progressionRate: 100,
  regressionRate: 100,
  retirementAge: 32,
  bsMode: false,
  mcafeeMode: false,
  chaosDraft: false,
  aiCommentary: true,
  godMode: false,
  godModeUsed: false,
  rosterLimitEnabled: true,
  practiceSquadEnabled: false,
  irEnabled: false,
  practiceSquadSize: 16,
  suspensionFrequency: 1.0,
  preseasonGames: 0,
  devPanels: false,
  showPredictedFavorite: true,
  showCoachOVR: false,
};

export interface LeagueState {
  season: number;
  week: number;
  phase: 'preseason' | 'regular' | 'playoffs' | 'resigning' | 'draft' | 'freeAgency' | 'offseason';
  userTeamId: string;
  /** Spectator-only league: user has no team, all 32 teams are AI-controlled,
   *  league sims forward autonomously while user observes. */
  isSpectator?: boolean;
  teams: Team[];
  players: Player[];
  schedule: GameResult[];
  /** Preseason schedule (separate from regular season) */
  preseasonSchedule?: GameResult[];
  /** Current preseason game number (1-based, 0 = not in preseason) */
  preseasonWeek?: number;
  draftOrder: string[];
  /** Canonical pick-id sequence for the current draft. Stays constant across trades —
   *  draftOrder is derived from this by looking up each pick's current ownerTeamId.
   *  Length matches the original draftOrder length. Cleared when draft ends. */
  draftPickOrder?: string[];
  /** Year the current draft is for. Set in advanceToDraft, cleared when draft
   *  ends. Used by draftPlayer/simRound/simToEndDraft to mark the correct
   *  team.draftPicks slot — without this, leftover unused picks from prior
   *  drafts can be wrongly consumed by current-draft picks. */
  currentDraftYear?: number;
  draftResults: DraftSelection[];
  freeAgents: string[];
  /** Current day within the 30-day free agency window (0 = not in FA) */
  faDay: number;
  /** Player IDs that refuse to negotiate with the user's team */
  faRefusals: string[];
  playoffBracket: PlayoffMatchup[] | null;
  /** Per-conference seed order: index 0 = seed 1, index 6 = seed 7 (array of team IDs) */
  playoffSeeds: { AC: string[]; NC: string[] } | null;
  /** Last playoff round for which injury timers were decremented. Prevents
   *  double-decrements when a round has a mix of live-commit + auto-sim games. */
  playoffInjuryRound?: number;
  /** Championship history across all seasons */
  champions: { season: number; teamId: string }[];
  /** News feed items */
  newsItems: NewsItem[];
  /** Last-read news marker (week) */
  newsLastReadWeek: number;
  /** Last-read news marker (season) */
  newsLastReadSeason: number;
  /** Season-end summaries for history */
  seasonHistory: SeasonSummary[];
  /** Save version for migration detection */
  saveVersion: number;
  /** Players up for re-signing (user team, yearsLeft === 1) */
  resigningPlayers: ResigningEntry[];
  /** Incoming AI trade proposals */
  tradeProposals: TradeProposal[];
  /** DEPRECATED: scouting is now binary via hasScouting in
   *  SubscriptionProvider. Field kept for save compatibility, no longer
   *  read by UI. */
  scoutingLevel?: 0 | 1 | 2;
  /** Scouting data keyed by prospect player ID */
  draftScoutingData: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }>;
  /** DEPRECATED: scouting is now binary via hasScouting in
   *  SubscriptionProvider. Field kept for save compatibility, no longer
   *  read by UI. */
  scoutingState?: {
    scoutPoints: number;
    maxScoutPoints: number;
    filmReviews: Record<string, {
      ovrRange: { low: number; high: number };
      strength: string;
      weakness: string;
      projectionTier: 'Starter' | 'Rotational' | 'Backup' | 'Project';
      potentialHint: 'high' | 'medium' | 'low';
      blurb: string;
    }>;
    inPersonEvals: Record<string, {
      ovrRange: { low: number; high: number };
      personality: string;
      characterNotes: string;
      revealedBustBoom: boolean;
      bustBoomResult?: 'bust' | 'boom' | 'normal';
      revealedRatingKeys: string[];
      /** In-person observations */
      bodyType: string;
      footballIQ: string;
      competitiveness: string;
      medicalFlag: string | null;
      motivation: string;
    }>;
    inPersonEvalCount: number;
    fullEvals: Record<string, {
      exactOvr: number;
      bustBoomResult: 'bust' | 'boom' | 'normal';
    }>;
    fullEvalCount: number;
  };
  /** NFL 2026 hardcoded first-round mock draft (empty if not NFL roster or past first draft) */
  nflMockDraft?: { pickNum: number; teamAbbr: string; playerId: string; firstName: string; lastName: string; position: string; college: string; blurb: string }[];
  /** Game plan for the user team's NEXT regular-season game. Cleared after that game is simulated. */
  nextGamePlan?: {
    passRate: number;
    aggressiveness: 'conservative' | 'balanced' | 'aggressive';
    redZoneStrategy: 'run' | 'balanced' | 'pass';
    blitzRate?: number;
    coverage?: 'man' | 'zone' | 'balanced';
    tempo?: 'fast' | 'normal' | 'slow';
  };
  /** Per-position scouting preview of the upcoming draft class. Generated at trade deadline. */
  draftClassPreview?: {
    season: number;
    groups: { position: string; grade: string; depthNote: string; ovrLow: number; ovrHigh: number; topOvr: number }[];
  };
  /** BS Mode: QB tier assignments */
  qbTiers?: Record<string, { playerId: string; tier: QBTier }>;
  /** BS Mode: opponent selection for top seeds */
  // Reserved for future use
  /** BS Mode: draft lottery results */
  draftLotteryResults?: { teamId: string; abbr: string; originalRank: number; lotteryPick: number }[];
  /** Player ID of the Championship MVP (set when championship is played, consumed when season summary is created) */
  finalsMvpPlayerId: string | null;
  /** All-Pro Game result — played between conference championships and the big game */
  allStarGame: { played: boolean; acScore: number; ncScore: number; mvpPlayerId: string | null } | null;
  /** Configurable league settings */
  leagueSettings: LeagueSettings;
  /** Suppress trade proposal popup notifications */
  suppressTradePopups: boolean;
  /** Weekly recap show data generated after each sim week */
  weeklyRecaps: WeeklyRecapData[];
  /** Unlocked achievements */
  achievements: Achievement[];
  /** Dynamic rivalries between teams */
  rivalries: Rivalry[];
  /** Trade rumors generated during the season */
  tradeRumors: TradeRumor[];
  /** Social media feed posts */
  socialPosts: SocialPost[];
  /** Underpaid stars demanding new deals during re-signing */
  holdoutDemands: HoldoutEntry[];
  /** Game over state when owner fires the GM */
  firedState: { fired: boolean; season: number; reason: string } | null;
  /** Expansion draft state (null when not active) */
  expansionDraft: ExpansionDraftState | null;
  /** Number of contract extensions used this season (max 3) */
  extensionsUsedThisSeason?: number;
  /** Free agency intel report pursuit state */
  pursuitState?: {
    pursuitPoints: number;
    maxPursuitPoints: number;
    intelReports: Record<string, {
      priority: 'money' | 'winning' | 'role' | 'loyalty';
      priorityLabel: string;
      priorityDetail: string;
      trueAskingSalary: number;
      trueAskingYears: number;
      closingOffer: { salary: number; years: number };
      closingOfferDetail: string;
      willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
      willingnessReason: string;
      competingTeams: string[];
      marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
      marketHeatDetail: string;
      agentStyle: 'hardball' | 'collaborative' | 'impatient' | 'relationship';
      agentStyleDetail: string;
      agentTip: string;
      priorityAligned: boolean;
      fitAssessment: string;
      dealPath: 'strong' | 'possible' | 'uphill' | 'unlikely';
      dealPathDetail: string;
      concerns: string[];
      intelBlurb: string;
      salaryDiscount: number;
      patienceBonus: number;
      overridesRefusal: boolean;
    }>;
  };
}

export interface ExpansionTeamConfig {
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
}

export interface ExpansionDraftState {
  phase: 'setup' | 'protection' | 'drafting' | 'complete';
  configs: ExpansionTeamConfig[];
  expansionTeamIds: string[];
  protectedPlayers: Record<string, string[]>;
  picks: { expansionTeamId: string; fromTeamId: string; playerId: string }[];
  currentPickIndex: number;
}

export interface Rivalry {
  id: string;
  team1Id: string;
  team2Id: string;
  intensity: number;
  formed: number;
  events: RivalryEvent[];
  type: 'divisional' | 'playoff' | 'trade' | 'emerging';
}

export interface RivalryEvent {
  season: number;
  week: number;
  description: string;
  type: 'blowout' | 'comeback' | 'upset' | 'playoff_elimination' | 'trade_steal' | 'sweep';
}

export interface TradeRumor {
  id: string;
  season: number;
  week: number;
  type: 'star_available' | 'shopping_pick' | 'position_need' | 'blockbuster' | 'deadline_buzz';
  teamId: string;
  targetTeamId?: string;
  playerIds: string[];
  pickIds?: string[];
  headline: string;
  detail: string;
  resolved: boolean;
  outcome?: 'accurate' | 'false_alarm';
  resolvedWeek?: number;
  /** Hidden flag set at generation — determines if this rumor is "destined" to come true */
  _accurate?: boolean;
}

export interface HoldoutEntry {
  playerId: string;
  demandedSalary: number;
  demandedYears: number;
  resolved: boolean;
}

export interface WeeklyRecapData {
  season: number;
  week: number;
  segments: RecapSegmentData[];
}

export interface RecapSegmentData {
  type: 'headline' | 'upset' | 'comeback' | 'blowout' | 'shootout' | 'defensive' | 'performance' | 'streak' | 'rivalry' | 'milestone' | 'trade' | 'summary';
  title: string;
  body: string;
  teamIds: string[];
  playerIds: string[];
  priority: number;
  icon: string;
}

export interface DraftSelection {
  overallPick: number;
  round: number;
  pickInRound: number;
  teamId: string;
  playerId: string;
}

export interface PlayoffMatchup {
  id: string;
  /** 1 = Wild Card, 2 = Divisional, 3 = Conference Championship, 4 = Championship */
  round: number;
  conference: 'AC' | 'NC' | 'Championship';
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSeed: number | null;
  awaySeed: number | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  /** ID of a prior matchup whose winner fills the home slot */
  homeFeedsFrom?: string;
  /** ID of a prior matchup whose winner fills the away slot */
  awayFeedsFrom?: string;
  /** When true, the lower seed (better team) is assigned home field once both teams are known */
  seedDeterminesHome?: boolean;
}

export function emptyStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
    rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0,
    targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    tackles: 0, tacklesForLoss: 0, sacks: 0, defensiveINTs: 0, passDeflections: 0, forcedFumbles: 0,
    sacksAllowed: 0, passBlocks: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0,
    puntAttempts: 0, puntYards: 0, puntsInside20: 0, touchbacks: 0,
    kickReturns: 0, kickReturnYards: 0, kickReturnTDs: 0,
    puntReturns: 0, puntReturnYards: 0, puntReturnTDs: 0,
    snaps: 0,
  };
}

export function emptyRecord(): TeamRecord {
  return {
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    streak: 0, divisionWins: 0, divisionLosses: 0,
    homeWins: 0, homeLosses: 0,
    awayWins: 0, awayLosses: 0,
    conferenceWins: 0, conferenceLosses: 0,
  };
}
