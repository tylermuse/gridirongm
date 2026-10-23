/**
 * In-game win probability for the live viewer (parity with BS Football's WP
 * chart). Classic random-walk model: the final margin is the current margin
 * plus a normal draw whose spread shrinks with the time left. ~13 points of
 * full-game standard deviation and a ~2.5-point home edge match NBA data well
 * enough for a broadcast graphic.
 */

const GAME_SECONDS = 2880;
const FULL_GAME_SD = 13;
const HOME_EDGE = 2.5;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** P(home wins) given home margin (home − away) and seconds left in regulation/OT. */
export function winProbability(homeMargin: number, secondsLeft: number): number {
  if (secondsLeft <= 0) return homeMargin > 0 ? 1 : homeMargin < 0 ? 0 : 0.5;
  const frac = Math.min(1, secondsLeft / GAME_SECONDS);
  const sd = FULL_GAME_SD * Math.sqrt(frac);
  const expected = homeMargin + HOME_EDGE * frac;
  return Math.min(0.999, Math.max(0.001, phi(expected / sd)));
}

/** Seconds left in the game from a period number + "m:ss" clock. OT counts as 5:00 periods. */
export function secondsLeftInGame(quarter: number, clock: string): number {
  const [m, s] = clock.split(':').map(Number);
  const inPeriod = (m || 0) * 60 + (s || 0);
  if (quarter >= 5) return inPeriod;
  return inPeriod + (4 - quarter) * 720;
}
