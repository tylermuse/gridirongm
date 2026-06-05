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
  measurables: Measurable[];
  devCurve: DevCurvePoint[];
  character: { grade: string; note: string };
  strengths: string[];
  weaknesses: string[];
  keyRatings: RatingLine[];
}

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

  // Character — basketball IQ + intangibles + a seeded work-ethic roll.
  const charScore = clamp((r.basketballIQ + r.intangibles) / 2 + (((seed >> 4) % 14) - 6));
  const charGrade = charScore >= 78 ? 'A' : charScore >= 68 ? 'B' : charScore >= 58 ? 'C' : 'D';
  const character = {
    grade: charGrade,
    note: pick([
      'Coaches rave about the work ethic and film study.',
      'High-character kid; vocal leader in the locker room.',
      'Steady temperament — plays within himself.',
      'Some maturity questions, but the talent is real.',
      'Competitive edge that shows up in the biggest moments.',
    ], seed >> 6 + charScore),
  };

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
    ceiling, ceilingNote,
    measurables, devCurve, character,
    strengths, weaknesses, keyRatings,
  };
}
