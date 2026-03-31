// ---------------------------------------------------------------------------
// Formation definitions: dot positions for 11v11 player rendering
// ---------------------------------------------------------------------------
// Each formation is an array of 11 { label, yardOffset, lateral } entries.
// yardOffset: yards relative to the line of scrimmage
//   - negative = behind LOS (toward own endzone)
//   - positive = past LOS (toward opponent endzone)
// lateral: 0.0 = top sideline, 1.0 = bottom sideline, 0.5 = center
// ---------------------------------------------------------------------------

export type FormationType =
  | 'shotgun'
  | 'i_formation'
  | 'spread'
  | 'goal_line'
  | 'punt'
  | 'field_goal'
  | 'victory';

export type DefFormationType =
  | 'nickel'
  | 'base_43'
  | 'dime'
  | 'goal_line_d'
  | 'punt_return'
  | 'fg_block'
  | 'prevent';

export interface DotPosition {
  label: string;
  yardOffset: number;
  lateral: number;
}

// ---------------------------------------------------------------------------
// Offensive formations
// ---------------------------------------------------------------------------

const OL_BASE: DotPosition[] = [
  { label: 'C',  yardOffset: 0, lateral: 0.50 },
  { label: 'LG', yardOffset: 0, lateral: 0.42 },
  { label: 'RG', yardOffset: 0, lateral: 0.58 },
  { label: 'LT', yardOffset: 0, lateral: 0.34 },
  { label: 'RT', yardOffset: 0, lateral: 0.66 },
];

export const OFFENSE_FORMATIONS: Record<FormationType, DotPosition[]> = {
  shotgun: [
    ...OL_BASE,
    { label: 'QB', yardOffset: -5, lateral: 0.50 },
    { label: 'RB', yardOffset: -5, lateral: 0.58 },
    { label: 'WR', yardOffset: 1,  lateral: 0.08 },
    { label: 'WR', yardOffset: 1,  lateral: 0.92 },
    { label: 'TE', yardOffset: 0,  lateral: 0.74 },
    { label: 'WR', yardOffset: 1,  lateral: 0.22 },
  ],
  i_formation: [
    ...OL_BASE,
    { label: 'QB', yardOffset: -1, lateral: 0.50 },
    { label: 'FB', yardOffset: -4, lateral: 0.50 },
    { label: 'RB', yardOffset: -7, lateral: 0.50 },
    { label: 'WR', yardOffset: 1,  lateral: 0.08 },
    { label: 'WR', yardOffset: 1,  lateral: 0.92 },
    { label: 'TE', yardOffset: 0,  lateral: 0.74 },
  ],
  spread: [
    ...OL_BASE,
    { label: 'QB', yardOffset: -3, lateral: 0.50 },
    { label: 'RB', yardOffset: -5, lateral: 0.55 },
    { label: 'WR', yardOffset: 1,  lateral: 0.05 },
    { label: 'WR', yardOffset: 1,  lateral: 0.95 },
    { label: 'WR', yardOffset: 1,  lateral: 0.20 },
    { label: 'WR', yardOffset: 1,  lateral: 0.80 },
  ],
  goal_line: [
    { label: 'C',  yardOffset: 0, lateral: 0.50 },
    { label: 'LG', yardOffset: 0, lateral: 0.42 },
    { label: 'RG', yardOffset: 0, lateral: 0.58 },
    { label: 'LT', yardOffset: 0, lateral: 0.34 },
    { label: 'RT', yardOffset: 0, lateral: 0.66 },
    { label: 'TE', yardOffset: 0, lateral: 0.26 },
    { label: 'QB', yardOffset: -1, lateral: 0.50 },
    { label: 'FB', yardOffset: -3, lateral: 0.50 },
    { label: 'RB', yardOffset: -5, lateral: 0.50 },
    { label: 'TE', yardOffset: 0,  lateral: 0.74 },
    { label: 'WR', yardOffset: 1,  lateral: 0.08 },
  ],
  punt: [
    { label: 'LS', yardOffset: 0,   lateral: 0.50 },
    { label: 'LG', yardOffset: 0,   lateral: 0.42 },
    { label: 'RG', yardOffset: 0,   lateral: 0.58 },
    { label: 'LT', yardOffset: 0,   lateral: 0.34 },
    { label: 'RT', yardOffset: 0,   lateral: 0.66 },
    { label: 'P',  yardOffset: -15, lateral: 0.50 },
    { label: 'PP', yardOffset: -1,  lateral: 0.26 },
    { label: 'PP', yardOffset: -1,  lateral: 0.74 },
    { label: 'G',  yardOffset: 1,   lateral: 0.05 },
    { label: 'G',  yardOffset: 1,   lateral: 0.95 },
    { label: 'PP', yardOffset: -1,  lateral: 0.15 },
  ],
  field_goal: [
    { label: 'LS', yardOffset: 0,  lateral: 0.50 },
    { label: 'LG', yardOffset: 0,  lateral: 0.42 },
    { label: 'RG', yardOffset: 0,  lateral: 0.58 },
    { label: 'LT', yardOffset: 0,  lateral: 0.34 },
    { label: 'RT', yardOffset: 0,  lateral: 0.66 },
    { label: 'TE', yardOffset: 0,  lateral: 0.26 },
    { label: 'TE', yardOffset: 0,  lateral: 0.74 },
    { label: 'H',  yardOffset: -7, lateral: 0.52 },
    { label: 'K',  yardOffset: -9, lateral: 0.50 },
    { label: 'W',  yardOffset: -1, lateral: 0.20 },
    { label: 'W',  yardOffset: -1, lateral: 0.80 },
  ],
  victory: [
    ...OL_BASE,
    { label: 'QB', yardOffset: -1, lateral: 0.50 },
    { label: 'RB', yardOffset: -3, lateral: 0.42 },
    { label: 'RB', yardOffset: -3, lateral: 0.58 },
    { label: 'TE', yardOffset: 0,  lateral: 0.26 },
    { label: 'TE', yardOffset: 0,  lateral: 0.74 },
    { label: 'WR', yardOffset: 1,  lateral: 0.10 },
  ],
};

// ---------------------------------------------------------------------------
// Defensive formations
// ---------------------------------------------------------------------------

export const DEFENSE_FORMATIONS: Record<DefFormationType, DotPosition[]> = {
  nickel: [
    // DL (4)
    { label: 'DE', yardOffset: 1, lateral: 0.30 },
    { label: 'DT', yardOffset: 1, lateral: 0.44 },
    { label: 'DT', yardOffset: 1, lateral: 0.56 },
    { label: 'DE', yardOffset: 1, lateral: 0.70 },
    // LB (2)
    { label: 'LB', yardOffset: 4, lateral: 0.38 },
    { label: 'LB', yardOffset: 4, lateral: 0.62 },
    // DB (5)
    { label: 'CB', yardOffset: 3, lateral: 0.08 },
    { label: 'CB', yardOffset: 3, lateral: 0.92 },
    { label: 'NB', yardOffset: 4, lateral: 0.22 },
    { label: 'SS', yardOffset: 8, lateral: 0.42 },
    { label: 'FS', yardOffset: 10, lateral: 0.55 },
  ],
  base_43: [
    // DL (4)
    { label: 'DE', yardOffset: 1, lateral: 0.28 },
    { label: 'DT', yardOffset: 1, lateral: 0.44 },
    { label: 'DT', yardOffset: 1, lateral: 0.56 },
    { label: 'DE', yardOffset: 1, lateral: 0.72 },
    // LB (3)
    { label: 'WLB', yardOffset: 4, lateral: 0.30 },
    { label: 'MLB', yardOffset: 4, lateral: 0.50 },
    { label: 'SLB', yardOffset: 4, lateral: 0.70 },
    // DB (4)
    { label: 'CB', yardOffset: 3, lateral: 0.08 },
    { label: 'CB', yardOffset: 3, lateral: 0.92 },
    { label: 'SS', yardOffset: 8, lateral: 0.38 },
    { label: 'FS', yardOffset: 10, lateral: 0.55 },
  ],
  dime: [
    // DL (4)
    { label: 'DE', yardOffset: 1, lateral: 0.30 },
    { label: 'DT', yardOffset: 1, lateral: 0.44 },
    { label: 'DT', yardOffset: 1, lateral: 0.56 },
    { label: 'DE', yardOffset: 1, lateral: 0.70 },
    // LB (1)
    { label: 'MLB', yardOffset: 4, lateral: 0.50 },
    // DB (6)
    { label: 'CB', yardOffset: 3, lateral: 0.05 },
    { label: 'CB', yardOffset: 3, lateral: 0.95 },
    { label: 'NB', yardOffset: 4, lateral: 0.20 },
    { label: 'NB', yardOffset: 4, lateral: 0.80 },
    { label: 'SS', yardOffset: 8, lateral: 0.40 },
    { label: 'FS', yardOffset: 10, lateral: 0.58 },
  ],
  goal_line_d: [
    // DL (6)
    { label: 'DE', yardOffset: 1, lateral: 0.24 },
    { label: 'DT', yardOffset: 1, lateral: 0.36 },
    { label: 'NT', yardOffset: 1, lateral: 0.50 },
    { label: 'DT', yardOffset: 1, lateral: 0.64 },
    { label: 'DE', yardOffset: 1, lateral: 0.76 },
    { label: 'DE', yardOffset: 1, lateral: 0.14 },
    // LB (3)
    { label: 'LB', yardOffset: 3, lateral: 0.35 },
    { label: 'LB', yardOffset: 3, lateral: 0.50 },
    { label: 'LB', yardOffset: 3, lateral: 0.65 },
    // DB (2)
    { label: 'CB', yardOffset: 4, lateral: 0.08 },
    { label: 'SS', yardOffset: 5, lateral: 0.92 },
  ],
  punt_return: [
    // Rush (5)
    { label: 'DE', yardOffset: 1, lateral: 0.30 },
    { label: 'DT', yardOffset: 1, lateral: 0.44 },
    { label: 'C',  yardOffset: 1, lateral: 0.50 },
    { label: 'DT', yardOffset: 1, lateral: 0.56 },
    { label: 'DE', yardOffset: 1, lateral: 0.70 },
    // Contain (4)
    { label: 'LB', yardOffset: 5, lateral: 0.15 },
    { label: 'LB', yardOffset: 5, lateral: 0.85 },
    { label: 'CB', yardOffset: 8, lateral: 0.25 },
    { label: 'CB', yardOffset: 8, lateral: 0.75 },
    // Safety + Returner
    { label: 'S',  yardOffset: 15, lateral: 0.40 },
    { label: 'PR', yardOffset: 30, lateral: 0.50 },
  ],
  fg_block: [
    // Rush (7)
    { label: 'DE', yardOffset: 1, lateral: 0.24 },
    { label: 'DT', yardOffset: 1, lateral: 0.36 },
    { label: 'NT', yardOffset: 1, lateral: 0.50 },
    { label: 'DT', yardOffset: 1, lateral: 0.64 },
    { label: 'DE', yardOffset: 1, lateral: 0.76 },
    { label: 'LB', yardOffset: 1, lateral: 0.14 },
    { label: 'LB', yardOffset: 1, lateral: 0.86 },
    // Back (4)
    { label: 'CB', yardOffset: 4, lateral: 0.08 },
    { label: 'CB', yardOffset: 4, lateral: 0.92 },
    { label: 'S',  yardOffset: 6, lateral: 0.40 },
    { label: 'S',  yardOffset: 6, lateral: 0.60 },
  ],
  prevent: [
    // DL (3)
    { label: 'DE', yardOffset: 1, lateral: 0.35 },
    { label: 'DT', yardOffset: 1, lateral: 0.50 },
    { label: 'DE', yardOffset: 1, lateral: 0.65 },
    // LB (1)
    { label: 'MLB', yardOffset: 4, lateral: 0.50 },
    // DB (7)
    { label: 'CB', yardOffset: 6,  lateral: 0.05 },
    { label: 'CB', yardOffset: 6,  lateral: 0.95 },
    { label: 'NB', yardOffset: 8,  lateral: 0.20 },
    { label: 'NB', yardOffset: 8,  lateral: 0.80 },
    { label: 'SS', yardOffset: 12, lateral: 0.35 },
    { label: 'FS', yardOffset: 14, lateral: 0.55 },
    { label: 'S',  yardOffset: 16, lateral: 0.45 },
  ],
};

// ---------------------------------------------------------------------------
// Formation selection logic based on PlayEvent data
// ---------------------------------------------------------------------------

export interface FormationPair {
  offense: FormationType;
  defense: DefFormationType;
}

export function selectFormation(
  playType: string,
  down: number,
  yardsToGo: number,
  fieldPos: number,
): FormationPair {
  // Special teams
  if (playType === 'punt') {
    return { offense: 'punt', defense: 'punt_return' };
  }
  if (playType === 'field_goal_good' || playType === 'field_goal_miss' || playType === 'extra_point') {
    return { offense: 'field_goal', defense: 'fg_block' };
  }

  // Goal line (inside the 5)
  if (fieldPos >= 95) {
    return { offense: 'goal_line', defense: 'goal_line_d' };
  }

  // 3rd/4th & long (7+ yards)
  if ((down === 3 || down === 4) && yardsToGo >= 7) {
    return { offense: 'spread', defense: 'dime' };
  }

  // 3rd/4th & short or goal line approach
  if ((down === 3 || down === 4) && yardsToGo <= 2) {
    return { offense: 'i_formation', defense: 'base_43' };
  }

  // Run plays tend toward I-formation
  if (playType === 'run') {
    return { offense: 'i_formation', defense: 'base_43' };
  }

  // Default passing
  return { offense: 'shotgun', defense: 'nickel' };
}
