/**
 * Crash breadcrumbs for /diagnostics (parity with BS Football's gg-* keys).
 *
 * The error boundaries write the last few crashes to localStorage so a tester
 * can open /diagnostics on the same device and paste the details into
 * #bug-reports without devtools. Holds only the error message, a trimmed stack,
 * the page path and a timestamp — no league data or personal information.
 */

export const CRASH_KEY = 'bshoops-diag-crashes';
const MAX_CRASHES = 5;

export interface CrashBreadcrumb {
  at: string;
  where: 'page' | 'root';
  path: string;
  message: string;
  digest?: string;
  stack?: string;
}

export function readCrashes(): CrashBreadcrumb[] {
  try {
    const raw = localStorage.getItem(CRASH_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordCrash(error: Error & { digest?: string }, where: CrashBreadcrumb['where']): void {
  try {
    const entry: CrashBreadcrumb = {
      at: new Date().toISOString(),
      where,
      path: window.location.pathname,
      message: String(error?.message ?? error).slice(0, 500),
      ...(error?.digest ? { digest: error.digest } : {}),
      ...(error?.stack ? { stack: error.stack.split('\n').slice(0, 12).join('\n') } : {}),
    };
    localStorage.setItem(CRASH_KEY, JSON.stringify([entry, ...readCrashes()].slice(0, MAX_CRASHES)));
  } catch {
    /* private mode / quota — diagnostics are best-effort */
  }
}

export function clearCrashes(): void {
  try { localStorage.removeItem(CRASH_KEY); } catch { /* ignore */ }
}
