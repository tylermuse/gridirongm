'use client';

import { useEffect, useState } from 'react';

/**
 * Diagnostics surface. Reads localStorage breadcrumb keys written by
 * instrumented flows so testers can paste a full failure picture into
 * #bug-reports without needing browser devtools.
 *
 * Currently covers:
 *   - Season rollover (startNewSeason + call-site outer catches + window beacon)
 *   - Expansion-takeover (5/27 — "Play as [expansion team]" handler + window beacon)
 *
 * bige08676 (5/18) spent 3 messages trying to retrieve breadcrumbs via
 * browser devtools and got blocked — bookmark URLs, address-bar code
 * injection, "eruda" extensions all failed for his environment. This page
 * removes the devtools requirement entirely: testers visit /diagnostics on
 * the same browser/device where the soft-lock or fatal happens, hit
 * "Copy all diagnostics", and paste the block into #bug-reports.
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
  'gg-rollover-substep',
  'gg-rollover-async-error',
  'gg-rollover-recoverable-error',
] as const;

const EXPANSION_TAKEOVER_KEYS = [
  'gg-expansion-takeover-entry',
  'gg-expansion-takeover-step',
  'gg-expansion-takeover-exit',
  'gg-expansion-takeover-outer-error',
  'gg-expansion-takeover-async-error',
] as const;

const ALL_KEYS = [...ROLLOVER_KEYS, ...EXPANSION_TAKEOVER_KEYS] as const;

type DiagnosticKey = (typeof ALL_KEYS)[number];

function readBreadcrumb(key: DiagnosticKey): string | null {
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

function buildPasteBlock(values: Record<DiagnosticKey, string | null>): string {
  const lines: string[] = ['BS Football — diagnostics'];
  lines.push(`Captured: ${new Date().toISOString()}`);
  lines.push(`Browser: ${typeof navigator === 'undefined' ? '(unknown)' : navigator.userAgent}`);
  lines.push('');
  lines.push('# Rollover');
  for (const key of ROLLOVER_KEYS) {
    lines.push(`--- ${key} ---`);
    lines.push(formatValue(values[key]));
    lines.push('');
  }
  lines.push('# Expansion takeover');
  for (const key of EXPANSION_TAKEOVER_KEYS) {
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

function emptyValues(): Record<DiagnosticKey, string | null> {
  const out = {} as Record<DiagnosticKey, string | null>;
  for (const key of ALL_KEYS) out[key] = null;
  return out;
}

export default function DiagnosticsPage() {
  const [values, setValues] = useState<Record<DiagnosticKey, string | null>>(emptyValues);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Read after mount — avoids SSR/client mismatch since localStorage isn't
    // available during prerender.
    const next = emptyValues();
    for (const key of ALL_KEYS) next[key] = readBreadcrumb(key);
    setValues(next);
    setHydrated(true);
  }, []);

  async function handleCopy() {
    const ok = await copyToClipboard(buildPasteBlock(values));
    setCopyStatus(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  }

  function handleClear() {
    for (const key of ALL_KEYS) {
      try { localStorage.removeItem(key); } catch { /* private mode — ignore */ }
    }
    window.location.reload();
  }

  const allEmpty = hydrated && ALL_KEYS.every(k => values[k] === null);

  return (
    <div className="min-h-screen p-4 sm:p-6 bg-[var(--bg)] text-[var(--text)]">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold">Diagnostics</h1>
          <p className="text-sm text-[var(--text-sec)] leading-relaxed">
            Paste this in <code className="text-xs">#bug-reports</code> if you&rsquo;ve hit a soft-lock on &ldquo;Start New Season&rdquo; or a fatal after the expansion draft.
            These values are written automatically when the game runs these flows. They contain only the names of internal steps, any error message, and the timestamp &mdash; no personal information.
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
            All breadcrumbs are empty &mdash; either the game has never run an instrumented flow on this browser, or you cleared them. Try to reproduce the issue and come back to this page; the breadcrumbs will populate automatically.
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-sec)]">Rollover</h2>
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
          <h2 className="text-lg font-semibold text-[var(--text-sec)] pt-2">Expansion takeover</h2>
          {EXPANSION_TAKEOVER_KEYS.map(key => (
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
