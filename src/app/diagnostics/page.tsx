'use client';

import { useEffect, useState } from 'react';

/**
 * Rollover diagnostics surface. Reads the six localStorage breadcrumb keys
 * that startNewSeason + the three call-site outer catches (post-draft-cuts,
 * draft-recap, TopBar) + the window-level error/rejection beacon write
 * whenever the offseason rollover runs.
 *
 * Breadcrumb keys:
 *   gg-rollover-entry        — written at the top of startNewSeason
 *   gg-rollover-exit         — written at the bottom of a successful rollover
 *   gg-rollover-error        — inner-catch in startNewSeason
 *   gg-rollover-outer-error  — call-site outer catches (TopBar / draft-recap / cuts)
 *   gg-rollover-step         — 5/22 silent-failure catcher; last setStep() name
 *   gg-rollover-async-error  — 5/22 silent-failure catcher; window-level
 *                              error / unhandledrejection captured mid-rollover
 *
 * bige08676 (5/18) spent 3 messages trying to retrieve these via browser
 * devtools and got blocked — bookmark URLs, address-bar code injection,
 * "eruda" extensions all failed for his environment. This page removes the
 * devtools requirement entirely: testers visit /diagnostics on the same
 * browser/device where the soft-lock happens, hit "Copy all diagnostics",
 * and paste the block into #bug-reports.
 *
 * Read-only — no engine state mutation. No SAVE_VERSION bump.
 */

const ROLLOVER_KEYS = [
  'gg-rollover-entry',
  'gg-rollover-exit',
  'gg-rollover-error',
  'gg-rollover-outer-error',
  'gg-rollover-outer-throw',
  'gg-rollover-step',
  'gg-rollover-async-error',
  'gg-rollover-recoverable-error',
] as const;

type RolloverKey = (typeof ROLLOVER_KEYS)[number];

function readBreadcrumb(key: RolloverKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function formatValue(raw: string | null): string {
  if (raw === null) return '(not set)';
  // Pretty-print JSON so the paste block in Discord is readable.
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function buildPasteBlock(values: Record<RolloverKey, string | null>): string {
  const lines: string[] = ['BS Football — rollover diagnostics'];
  lines.push(`Captured: ${new Date().toISOString()}`);
  lines.push(`Browser: ${typeof navigator === 'undefined' ? '(unknown)' : navigator.userAgent}`);
  lines.push('');
  for (const key of ROLLOVER_KEYS) {
    lines.push(`--- ${key} ---`);
    lines.push(formatValue(values[key]));
    lines.push('');
  }
  return lines.join('\n');
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to textarea fallback */
  }
  // Fallback for browsers without Clipboard API or with a blocked permission.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function DiagnosticsPage() {
  const [values, setValues] = useState<Record<RolloverKey, string | null>>(
    () => ({
      'gg-rollover-entry': null,
      'gg-rollover-exit': null,
      'gg-rollover-error': null,
      'gg-rollover-outer-error': null,
      'gg-rollover-outer-throw': null,
      'gg-rollover-step': null,
      'gg-rollover-async-error': null,
      'gg-rollover-recoverable-error': null,
    }),
  );
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Read after mount — avoids SSR/client mismatch since localStorage isn't
    // available during prerender.
    const next: Record<RolloverKey, string | null> = {
      'gg-rollover-entry': readBreadcrumb('gg-rollover-entry'),
      'gg-rollover-exit': readBreadcrumb('gg-rollover-exit'),
      'gg-rollover-error': readBreadcrumb('gg-rollover-error'),
      'gg-rollover-outer-error': readBreadcrumb('gg-rollover-outer-error'),
      'gg-rollover-outer-throw': readBreadcrumb('gg-rollover-outer-throw'),
      'gg-rollover-step': readBreadcrumb('gg-rollover-step'),
      'gg-rollover-async-error': readBreadcrumb('gg-rollover-async-error'),
      'gg-rollover-recoverable-error': readBreadcrumb('gg-rollover-recoverable-error'),
    };
    setValues(next);
    setHydrated(true);
  }, []);

  async function handleCopy() {
    const ok = await copyToClipboard(buildPasteBlock(values));
    setCopyStatus(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  }

  function handleClear() {
    for (const key of ROLLOVER_KEYS) {
      try { localStorage.removeItem(key); } catch { /* private mode — ignore */ }
    }
    window.location.reload();
  }

  const allEmpty = hydrated && ROLLOVER_KEYS.every(k => values[k] === null);

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-[var(--bg)] text-[var(--text)]">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Rollover diagnostics</h1>
          <p className="text-sm text-[var(--text-sec)] leading-relaxed">
            Paste this in <code className="text-xs">#bug-reports</code> if you&rsquo;ve hit a soft-lock at the &ldquo;Start New Season&rdquo; step.
            These values are written automatically when the game tries to advance to a new season. They contain only the names of internal steps the rollover went through, plus any error message and the timestamp &mdash; no personal information.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 sticky top-0 bg-[var(--bg)] py-2 z-10">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!hydrated}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-semibold disabled:opacity-50 hover:opacity-90"
          >
            Copy all diagnostics
          </button>
          {copyStatus === 'ok' && (
            <span className="text-sm text-green-600">Copied — paste in Discord.</span>
          )}
          {copyStatus === 'fail' && (
            <span className="text-sm text-red-600">Copy failed. Select &amp; copy manually below.</span>
          )}
          <button
            type="button"
            onClick={handleClear}
            disabled={!hydrated}
            className="ml-auto text-xs text-[var(--text-sec)] hover:text-[var(--text)] underline disabled:opacity-50"
          >
            Clear diagnostic data
          </button>
        </div>

        {hydrated && allEmpty && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm">
            All breadcrumbs are empty &mdash; either the game has never tried to roll over a season on this browser, or you cleared them. Try to reproduce the soft-lock and come back to this page; the breadcrumbs will populate automatically.
          </div>
        )}

        <div className="space-y-3">
          {ROLLOVER_KEYS.map(key => (
            <section key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] font-mono text-xs text-[var(--text-sec)]">
                {key}
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">
                {hydrated ? formatValue(values[key]) : '(loading…)'}
              </pre>
            </section>
          ))}
        </div>

        <footer className="pt-4 text-xs text-[var(--text-sec)]">
          Page is read-only. Save data lives separately in IndexedDB; nothing here can affect your franchise.
        </footer>
      </div>
    </div>
  );
}
