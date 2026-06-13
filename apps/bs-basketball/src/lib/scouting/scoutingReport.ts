/**
 * Full draft scouting report (parity 2.1).
 *
 * Football's ScoutingReportModal is fed by a deep report (combine measurables,
 * dev curve, character, an NBA comp, a draft grade). This builds the basketball
 * equivalent off a prospect's ratings + development. Pure + deterministic
 * (seeded off the player id) so the same prospect always reads the same.
 *
 * `scouted` controls confidence: unscouted reports project off the noisy
 * perceived ceiling and say so; scouted reports use the true ceiling.
 */

import type { BasketballPlayer, BasketballRatings, BasketballPosition } from '@bs/sport-basketball';

export interface Measurable { label: string; value: string; note?: string }
export interface DevCurvePoint { label: string; age: number; projected: number }
export interface RatingLine { label: string; value: number }

/** Team-fit at a prospect's position for the report's top summary tile. */
export interface TeamFit { abbr: string; label: string; color: string; count: number }
export function teamFitFor(count: number, abbr: string): TeamFit {
  if (count < 2) return { abbr, count, label: 'Critical Need', color: '#dc2626' };
  if (count < 3) return { abbr, count, label: 'Moderate Need', color: '#d97706' };
  return { abbr, count, label: 'Low Priority', color: '#16a34a' };
}

export interface BasketballScoutingReport {
  scouted: boolean;
  /** Overall draft grade, e.g. "A-", "B+". */
  grade: string;
  gradeColor: string;
  /** Archetype / NBA-style comp role, e.g. "3-and-D wing". */
  archetype: string;
  /** One-line scout summary. */
  summary: string;
  /** Ceiling (true if scouted, perceived projection otherwise). */
  ceiling: number;
  ceilingNote: string;
  /** Downside projection if development stalls. */
  floor: number;
  confidence: 'High' | 'Medium' | 'Low';
  riskLevel: 'Low' | 'Medium' | 'High';
  /** Development trajectory label. */
  trajectory: 'Rapid Riser' | 'Steady Climber' | 'Slow Developer' | 'Near Ceiling';
  peakAge: number;
  /** NBA-style player comparison. */
  nbaComparison: string;
  measurables: Measurable[];
  physicalTraits: RatingLine[];
  devCurve: DevCurvePoint[];
  character: { workEthic: number; leadership: number; coachability: number; competitiveness: number; notes: string };
  strengths: string[];
  weaknesses: string[];
  keyRatings: RatingLine[];
}

/**
 * NBA comparisons, keyed off a prospect's ARCHETYPE (not just raw position) and
 * TIERED by projected ceiling (FEAT-28). An elite-ceiling stretch four maps to a
 * star (KAT / Markkanen); a role-ceiling one maps to a bench spacer (Naz Reid /
 * Olynyk) — never the reverse. Each archetype carries ~9–12 names across tiers,
 * picked deterministically per prospect, so a given player's comp is stable while
 * a draft class reads with real variety.
 */
type CompTier = 'elite' | 'solid' | 'role';

const ARCHETYPE_COMPS: Record<string, Record<CompTier, string[]>> = {
  'Floor general': {
    elite: ['a maestro in the prime Chris Paul mold', 'shades of Tyrese Haliburton', 'a young Luka Dončić as a lead creator'],
    solid: ['a steady orchestrator like Mike Conley', 'a pick-and-roll general à la Dejounte Murray', 'a table-setter like Tyus Jones'],
    role: ['a heady reserve like T.J. McConnell', 'a backup floor general like Cory Joseph', 'a game-managing backup like Raul Neto'],
  },
  'Scoring lead guard': {
    elite: ['a three-level scorer like Damian Lillard', "shades of Donovan Mitchell's shot-making", 'a bucket-getting lead guard à la Trae Young'],
    solid: ['a scoring punch like Jamal Murray', 'a shifty scorer like CJ McCollum', 'shades of Tyler Herro'],
    role: ['a microwave reserve like Malik Monk', 'instant offense à la Jordan Clarkson', 'a scoring spark like Bones Hyland'],
  },
  'Change-of-pace guard': {
    elite: ['a disruptive two-way guard like Jrue Holiday', 'shades of Derrick White', 'a momentum-swinging guard à la prime Rajon Rondo'],
    solid: ['a change-of-pace guard like Monte Morris', 'a steady backup à la Delon Wright', 'a connective reserve like Davion Mitchell'],
    role: ['a pesky reserve like Patty Mills', 'a spark off the bench like Jose Alvarado', 'a veteran backup like Cory Joseph'],
  },
  '3-and-D wing': {
    elite: ['an elite 3-and-D wing like Jaylen Brown', "shades of Kawhi Leonard's two-way game", 'a switchy stopper à la Jrue Holiday'],
    solid: ['a 3-and-D connector like OG Anunoby', 'shades of Mikal Bridges', 'a rock-solid wing like Herb Jones'],
    role: ['a 3-and-D role wing like Donte DiVincenzo', 'a corner-three stopper like Bruce Brown', 'a rotation wing à la Dorian Finney-Smith'],
  },
  'Microwave scorer': {
    elite: ['an elite shot-maker like Devin Booker', "shades of Anthony Edwards' scoring pop", 'a flamethrower à la Zach LaVine'],
    solid: ['a scoring punch like Bogdan Bogdanović', 'shades of Buddy Hield', 'a bigger Gary Trent Jr.'],
    role: ['a microwave scorer like Malik Monk', 'a streaky gunner like Cam Thomas', 'instant offense like Jordan Clarkson'],
  },
  'Slashing guard': {
    elite: ['a downhill force like Ja Morant', "shades of Anthony Edwards' explosion", "a slasher in prime Dwyane Wade's mold"],
    solid: ['a slashing scorer like RJ Barrett', 'a downhill guard like Jalen Green', 'shades of Austin Reaves'],
    role: ['a rim-attacking reserve like Talen Horton-Tucker', 'a driving spark like Quentin Grimes', 'an energy guard like Gary Payton II'],
  },
  'Two-way athlete': {
    elite: ['a two-way star like Jayson Tatum', 'shades of prime Paul George', 'an athletic force à la Scottie Barnes'],
    solid: ['a two-way wing like Franz Wagner', "shades of Aaron Nesmith's motor", 'a bouncy forward like Keldon Johnson'],
    role: ['an athletic role wing like Josh Green', 'a defensive sparkplug like Ziaire Williams', 'a high-energy reserve like Pat Connaughton'],
  },
  'Connector forward': {
    elite: ['a point-forward like Scottie Barnes', "shades of Andre Iguodala's peak versatility", 'a do-it-all forward à la Draymond Green'],
    solid: ['a connector forward like Mikal Bridges', 'shades of Harrison Barnes', 'a glue wing like Kyle Anderson'],
    role: ['a connective reserve like Torrey Craig', 'a glue-guy forward like Georges Niang', 'a rotation connector like Jae Crowder'],
  },
  'Stretch four': {
    elite: ['a stretch big like Karl-Anthony Towns', 'shades of Lauri Markkanen', 'a pick-and-pop star à la prime Kevin Love'],
    solid: ['a stretch four like Kyle Kuzma', 'shades of P.J. Washington', 'a floor-spacing four like Bobby Portis'],
    role: ['a spacing big off the bench like Naz Reid', 'a stretch-four reserve like Georges Niang', 'a pick-and-pop reserve like Kelly Olynyk'],
  },
  'Defensive forward': {
    elite: ['a defensive anchor like Draymond Green', 'shades of Jaren Jackson Jr.', 'an elite stopper à la prime Jonathan Isaac'],
    solid: ['a defensive forward like Herb Jones', 'shades of Jarred Vanderbilt', 'a switchy stopper like Jalen McDaniels'],
    role: ['a defensive reserve like Jae\'Sean Tate', 'a hustle forward like Torrey Craig', 'an energy stopper like Jalen Smith'],
  },
  'Energy big': {
    elite: ['an athletic four like Aaron Gordon', 'shades of prime Kenneth Faried\'s motor', 'a relentless force à la Montrezl Harrell'],
    solid: ['high-motor energy à la Jarred Vanderbilt', 'shades of Larry Nance Jr.', 'a glass-cleaning four like Nick Richards'],
    role: ['an energy big off the bench like JaMychal Green', 'a hustle reserve like Drew Eubanks', 'a garbage-man four like Thomas Bryant'],
  },
  'Stretch five': {
    elite: ['a stretch five like Karl-Anthony Towns', "shades of Brook Lopez's spacing + rim protection", 'a unicorn à la Kristaps Porziņģis'],
    solid: ['a stretch five like Myles Turner', 'shades of Naz Reid', 'a floor-spacing center like Kelly Olynyk'],
    role: ['a spacing reserve big like Dario Šarić', 'a pick-and-pop backup like Luke Kornet', 'a stretch-five reserve like Jeff Green'],
  },
  'Rim protector': {
    elite: ['an elite rim protector like Rudy Gobert', 'shades of Jaren Jackson Jr.', 'a defensive anchor à la prime Brook Lopez'],
    solid: ['rim protection à la Jarrett Allen', 'a shot-blocking center like Nic Claxton', 'shades of Walker Kessler'],
    role: ['a backup rim protector like Daniel Gafford', 'a shot-blocking reserve like Day\'Ron Sharpe', 'a defensive backup like Moses Brown'],
  },
  'Rim-running big': {
    elite: ['a lob-finishing force à la prime Clint Capela', 'a vertical-spacing big like Jarrett Allen', 'an athletic rim-runner like peak DeAndre Jordan'],
    solid: ['a rim-runner like Walker Kessler', 'a mobile big like Nic Claxton', 'shades of Mitchell Robinson'],
    role: ['a rim-running reserve like Daniel Gafford', 'a lob-catching backup like Mason Plumlee', 'an energy center like Drew Eubanks'],
  },
};

/** Ceiling → comp tier. Stars sit at the top, rotation/role pieces below. */
export function compTier(ceiling: number): CompTier {
  return ceiling >= 86 ? 'elite' : ceiling >= 76 ? 'solid' : 'role';
}

/** Pick a deterministic, archetype- + tier-appropriate NBA comp (FEAT-28). */
export function nbaComparisonFor(archetype: string, ceiling: number, seed: number): string {
  const pools = ARCHETYPE_COMPS[archetype];
  if (!pools) return 'a versatile rotation piece'; // archetypeFor always maps, but stay safe
  const tier = compTier(ceiling);
  // Fall back across tiers only if a pool were ever empty (it isn't today).
  const pool = pools[tier].length ? pools[tier] : pools.solid.length ? pools.solid : pools.role;
  return pick(pool, seed);
}

export { ARCHETYPE_COMPS };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T { return arr[((seed % arr.length) + arr.length) % arr.length]; }
function clamp(n: number, lo = 0, hi = 99): number { return Math.max(lo, Math.min(hi, Math.round(n))); }

function inchesToFt(inches: number): string {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  return `${ft}'${inch}"`;
}

const RATING_LABELS: Partial<Record<keyof BasketballRatings, string>> = {
  threePoint: '3-point', midRange: 'Mid-range', finishing: 'Finishing', freeThrow: 'Free throw',
  postScoring: 'Post', handles: 'Handle', passing: 'Passing', perimeterDefense: 'Perimeter D',
  interiorDefense: 'Interior D', rebounding: 'Rebounding', steal: 'Steals', block: 'Blocks',
  speed: 'Speed', strength: 'Strength', vertical: 'Vertical', basketballIQ: 'Basketball IQ',
  intangibles: 'Intangibles',
};

const POSITION_KEY_RATINGS: Record<BasketballPosition, (keyof BasketballRatings)[]> = {
  PG: ['handles', 'passing', 'threePoint', 'perimeterDefense', 'basketballIQ'],
  SG: ['threePoint', 'midRange', 'finishing', 'perimeterDefense', 'handles'],
  SF: ['threePoint', 'finishing', 'perimeterDefense', 'rebounding', 'basketballIQ'],
  PF: ['finishing', 'rebounding', 'interiorDefense', 'postScoring', 'threePoint'],
  C: ['finishing', 'rebounding', 'interiorDefense', 'block', 'postScoring'],
};

function archetypeFor(p: BasketballPlayer): string {
  const r = p.ratings;
  const pos = p.sportData.position;
  const shooter = r.threePoint >= 75;
  const defender = (r.perimeterDefense + r.interiorDefense) / 2 >= 72;
  const playmaker = r.passing >= 75;
  const athletic = (r.speed + r.vertical) / 2 >= 75;
  switch (pos) {
    case 'PG': return playmaker ? 'Floor general' : shooter ? 'Scoring lead guard' : 'Change-of-pace guard';
    case 'SG': return shooter && defender ? '3-and-D wing' : shooter ? 'Microwave scorer' : 'Slashing guard';
    case 'SF': return shooter && defender ? '3-and-D wing' : athletic ? 'Two-way athlete' : 'Connector forward';
    case 'PF': return shooter ? 'Stretch four' : defender ? 'Defensive forward' : 'Energy big';
    case 'C': return shooter ? 'Stretch five' : defender ? 'Rim protector' : 'Rim-running big';
  }
}

function draftGrade(ceiling: number, overall: number): { grade: string; color: string } {
  const score = ceiling * 0.7 + overall * 0.3;
  const grade =
    score >= 88 ? 'A+' : score >= 84 ? 'A' : score >= 80 ? 'A-' :
    score >= 76 ? 'B+' : score >= 72 ? 'B' : score >= 68 ? 'B-' :
    score >= 64 ? 'C+' : score >= 60 ? 'C' : score >= 56 ? 'C-' : 'D';
  const color = grade.startsWith('A') ? '#10b981' : grade.startsWith('B') ? '#2563eb' : grade.startsWith('C') ? '#d97706' : '#dc2626';
  return { grade, color };
}

export function perceivedCeiling(player: BasketballPlayer, season: number): number {
  // Mirrors scouting.perceivedPotential's shape without importing the RNG: a
  // deterministic ± wobble around the true ceiling.
  const seed = hash(`scout-${player.id}-${season}`);
  const wobble = ((seed % 1100) / 100) - 5.5; // ~[-5.5, +5.5]
  return clamp(player.development.potential + wobble, 40, 99);
}

export function buildScoutingReport(
  player: BasketballPlayer,
  opts: { season: number; scouted: boolean },
): BasketballScoutingReport {
  const r = player.ratings;
  const seed = hash(player.id);
  const ceiling = opts.scouted ? player.development.potential : perceivedCeiling(player, opts.season);
  const { grade, color } = draftGrade(ceiling, r.overall);

  // Combine measurables (ratings → flavor numbers).
  const vertIn = Math.round(24 + (r.vertical / 100) * 18);
  const sprint = (3.95 - (r.speed / 100) * 0.55).toFixed(2);
  const benchReps = Math.round((r.strength / 100) * 22);
  const reach = r.wingspan - r.height;
  const measurables: Measurable[] = [
    { label: 'Height', value: inchesToFt(r.height) },
    { label: 'Wingspan', value: inchesToFt(r.wingspan), note: reach > 0 ? `+${reach}" reach` : undefined },
    { label: 'Max vert', value: `${vertIn}"` },
    { label: '¾ sprint', value: `${sprint}s` },
    { label: 'Bench', value: `${benchReps} reps` },
  ];

  // Dev curve: close the gap to the ceiling over the next four seasons.
  const gap = ceiling - r.overall;
  const progress = [0, 0.35, 0.62, 0.82, 0.95];
  const devCurve: DevCurvePoint[] = progress.map((f, i) => ({
    label: i === 0 ? 'Now' : `+${i}y`,
    age: player.age + i,
    projected: clamp(r.overall + gap * f, 40, 99),
  }));

  // Character — basketball IQ + intangibles, split into four seeded sub-scores.
  const charScore = clamp((r.basketballIQ + r.intangibles) / 2 + (((seed >> 4) % 14) - 6));
  const wob = (shift: number) => clamp(charScore + (((seed >> shift) % 12) - 6));
  const character = {
    workEthic: wob(6),
    leadership: wob(9),
    coachability: wob(12),
    competitiveness: wob(15),
    notes: pick([
      'Coaches rave about the work ethic and film study.',
      'High-character kid; vocal leader in the locker room.',
      'Steady temperament — plays within himself.',
      'Some maturity questions, but the talent is real.',
      'Competitive edge that shows up in the biggest moments.',
    ], (seed >> 6) + charScore),
  };

  // Floor / risk / trajectory / peak / comp.
  const floor = clamp(r.overall - Math.round(gap * 0.2) - 3, 40, ceiling);
  const confidence: BasketballScoutingReport['confidence'] = opts.scouted ? 'High' : gap >= 12 ? 'Low' : gap >= 6 ? 'Medium' : 'High';
  const riskLevel: BasketballScoutingReport['riskLevel'] = gap >= 12 ? 'High' : gap >= 6 ? 'Medium' : 'Low';
  const trajectory: BasketballScoutingReport['trajectory'] = gap >= 12 ? 'Rapid Riser' : gap >= 5 ? 'Steady Climber' : gap >= 1 ? 'Slow Developer' : 'Near Ceiling';
  const peakAge = player.age + (gap >= 10 ? 5 : gap >= 5 ? 4 : 3);
  const nbaComparison = nbaComparisonFor(archetypeFor(player), ceiling, seed >> 3);
  const physicalTraits: RatingLine[] = [
    { label: 'Speed', value: r.speed },
    { label: 'Strength', value: r.strength },
    { label: 'Vertical', value: r.vertical },
    { label: 'Length', value: clamp(50 + (r.wingspan - r.height) * 5) },
  ];

  // Strengths / weaknesses from the skill ratings.
  const skills = (Object.keys(RATING_LABELS) as (keyof BasketballRatings)[])
    .map(k => ({ k, label: RATING_LABELS[k]!, v: r[k] as number }))
    .sort((a, b) => b.v - a.v);
  const strengths = skills.slice(0, 3).filter(s => s.v >= 65).map(s => s.label);
  const weaknesses = skills.slice(-2).filter(s => s.v < 60).map(s => s.label);

  const keyRatings: RatingLine[] = POSITION_KEY_RATINGS[player.sportData.position]
    .map(k => ({ label: RATING_LABELS[k] ?? k, value: r[k] as number }));

  const archetype = archetypeFor(player);
  const ceilingNote = opts.scouted
    ? `Confirmed ceiling ${ceiling} OVR.`
    : `Projected ceiling ~${ceiling} OVR — scout to confirm.`;
  const summary = `${archetype} with a ${grade} draft grade. ` +
    (gap >= 10 ? 'Long runway to grow into his frame and role.' : gap >= 4 ? 'Some upside left to tap.' : 'Close to a finished product.');

  return {
    scouted: opts.scouted,
    grade, gradeColor: color,
    archetype, summary,
    ceiling, ceilingNote, floor, confidence, riskLevel, trajectory, peakAge, nbaComparison,
    measurables, physicalTraits, devCurve, character,
    strengths, weaknesses, keyRatings,
  };
}
