/**
 * Diagnostic instrumentation for the season-rollover auto-cut loop.
 *
 * bige08676's post-PR-#143 /diagnostics captures (msgs 1510428338920099993,
 * 1510428509418422343, 1510967921961205861, 1511323919460601947,
 * 1511380883087560875, and 1512156441962877038) showed the rollover wedging
 * INSIDE autoCutToRosterLimit at the *tail* of the per-team iteration — three
 * captures at tick:31:WAS, one at tick:30:TEN. The failing tick sliding across
 * teams rules out a single malformed team and points at per-iteration cost
 * accumulating across the loop (every per-team call rebuilds the whole-league
 * players[] via .map, so the loop is O(teams × all-players)).
 *
 * Existing breadcrumbs only named the *tick index + abbr*. These add the two
 * signals that discriminate the cumulative-cost hypothesis in a single capture:
 *   - per-tick elapsed ms      (gg-rollover-tick-timings)
 *   - per-tick roster size      (gg-rollover-tick-rostersize)
 * plus finer-grained sub-op breadcrumbs written into gg-rollover-substep so the
 * next paste names WHICH sub-op (read-roster / sort / select / write-back) the
 * tail team is stuck in.
 *
 * Pure observation: localStorage writes only. No engine state, no SAVE_VERSION
 * bump. Every write is best-effort and must never throw into the rollover path.
 */

const SUBSTEP_KEY = 'gg-rollover-substep';
const TIMINGS_KEY = 'gg-rollover-tick-timings';
const ROSTERSIZE_KEY = 'gg-rollover-tick-rostersize';
// 32 NFL teams + headroom; cap so a runaway never bloats localStorage.
const MAX_ENTRIES = 40;

function readArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendCapped(key: string, entry: unknown): void {
  try {
    const arr = readArray(key);
    arr.push(entry);
    if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    /* best-effort — instrumentation must never break the rollover */
  }
}

/** Drop the per-tick arrays so each rollover attempt starts from a clean slate. */
export function clearRolloverTickInstrumentation(): void {
  try {
    localStorage.removeItem(TIMINGS_KEY);
    localStorage.removeItem(ROSTERSIZE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Write a fine-grained autocut sub-op breadcrumb, but ONLY while a season
 * rollover is actually in progress. autoCutToRosterLimit is also called from the
 * fresh-league init path; gating on the rollover entry/exit beacons keeps those
 * calls from leaving a stale gg-rollover-substep that would confuse /diagnostics.
 */
export function setAutocutSubstep(substep: string): void {
  try {
    const inRollover =
      !!localStorage.getItem('gg-rollover-entry') && !localStorage.getItem('gg-rollover-exit');
    if (!inRollover) return;
    localStorage.setItem(SUBSTEP_KEY, substep);
  } catch {
    /* best-effort */
  }
}

/** Append one per-tick elapsed-time record (ms, rounded to 0.01ms). */
export function recordTickTiming(tid: string, abbr: string, deltaMs: number): void {
  appendCapped(TIMINGS_KEY, { tid, abbr, deltaMs: Math.round(deltaMs * 100) / 100 });
}

/** Append one per-tick active-roster-size record (size at iteration entry). */
export function recordTickRosterSize(tid: string, abbr: string, size: number): void {
  appendCapped(ROSTERSIZE_KEY, { tid, abbr, size });
}
