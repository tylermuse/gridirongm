/**
 * Full-word rating labels. The engine's uiMetadata labels are 3-letter codes
 * (PRM, ITG, VRT…) that read as cryptic on the player card; football's card
 * spells its ratings out, so Hoops does too.
 */
export const RATING_FULL_LABEL: Record<string, string> = {
  threePoint: 'Three-Point',
  midRange: 'Mid-Range',
  finishing: 'Finishing',
  freeThrow: 'Free Throw',
  postScoring: 'Post Scoring',
  handles: 'Handles',
  passing: 'Passing',
  perimeterDefense: 'Perimeter D',
  interiorDefense: 'Interior D',
  rebounding: 'Rebounding',
  steal: 'Steals',
  block: 'Blocks',
  speed: 'Speed',
  vertical: 'Vertical',
  strength: 'Strength',
  basketballIQ: 'Basketball IQ',
  intangibles: 'Intangibles',
};

export function ratingFullLabel(key: string, fallback: string): string {
  return RATING_FULL_LABEL[key] ?? fallback;
}
