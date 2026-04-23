/** Dev-only telemetry captured on every game completion. Used to diagnose
 *  sim-balance issues — per-game OVR-delta vs score-delta histograms let us
 *  characterize the variance distribution instead of guessing.
 *
 *  Gated on leagueSettings.devPanels — the push helper early-returns when
 *  the flag is off so production playthroughs don't accumulate records. The
 *  store slice is capped at ~2000 rows with oldest-first eviction so we
 *  don't eat IndexedDB quota in a long-running tester save.
 */

export interface SimTelemetryRecord {
  gameId: string;
  week: number;
  season: number;
  /** Team abbreviations — easier to scan in logs than UUIDs. */
  homeTeam: string;
  awayTeam: string;
  homeOvr: number;
  awayOvr: number;
  /** home - away; positive = home favored */
  ovrDelta: number;
  homeScore: number;
  awayScore: number;
  /** home - away; positive = home won by */
  scoreDelta: number;
  simMode: 'fast' | 'live';
  /** winner had lower OVR by ≥ 4 */
  upset: boolean;
  createdAt: number;
}

export const SIM_TELEMETRY_CAP = 2000;

/** Module-level sink. The store wires this on init (in its persist rehydrate
 *  callback). simulate.ts + playByPlay.ts call pushSimTelemetryRecord at
 *  game completion; if no sink is set (e.g. in tests or before hydration)
 *  it's a no-op. Keeps simulate.ts pure from the store's perspective. */
let sink: ((r: SimTelemetryRecord) => void) | null = null;

export function setSimTelemetrySink(fn: ((r: SimTelemetryRecord) => void) | null): void {
  sink = fn;
}

export function pushSimTelemetryRecord(r: SimTelemetryRecord): void {
  try { sink?.(r); } catch { /* best-effort, never break a sim */ }
}

/** Compute mean starter OVR for a roster of players. Returns 0 when the
 *  input is empty so we never emit NaN records. */
export function meanStarterOvr(players: Array<{ ratings: { overall: number } }>): number {
  if (!players.length) return 0;
  const top = [...players]
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 22);
  const sum = top.reduce((s, p) => s + p.ratings.overall, 0);
  return Math.round(sum / top.length);
}
