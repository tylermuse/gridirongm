'use client';

import { useEffect, useState } from 'react';
import { listLeagues, type LeagueSaveMeta } from '@/lib/persistence/db';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { clearCrashes, readCrashes, type CrashBreadcrumb } from '@/lib/diagnostics/breadcrumbs';

/**
 * /diagnostics — one copy-paste block for #bug-reports, no devtools needed
 * (parity with BS Football's /diagnostics). Football's page reads breadcrumbs
 * its rollover/expansion flows write; Hoops collects what a bug report needs
 * instead: build, browser, storage health, every saved league's season/phase,
 * subscription tier, and the last crashes recorded by the error boundaries.
 *
 * Read-only apart from "Clear crash log". Never touches league saves.
 */

interface Snapshot {
  captured: string;
  build: string;
  userAgent: string;
  viewport: string;
  online: boolean;
  serviceWorker: string;
  storage: string;
  indexedDb: string;
  leagues: LeagueSaveMeta[];
  crashes: CrashBreadcrumb[];
}

const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local';

function mb(bytes?: number): string {
  return bytes === undefined ? '?' : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

async function collect(): Promise<Snapshot> {
  let storage = 'unavailable';
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    if (est) storage = `${mb(est.usage)} used of ${mb(est.quota)}${persisted ? ' (persistent)' : ''}`;
  } catch { /* ignore */ }

  let leagues: LeagueSaveMeta[] = [];
  let indexedDb = 'ok';
  try {
    leagues = await listLeagues();
  } catch (err) {
    indexedDb = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  let serviceWorker = 'unsupported';
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      serviceWorker = reg ? (reg.active ? 'active' : 'installing') : 'not registered';
    }
  } catch { /* ignore */ }

  return {
    captured: new Date().toISOString(),
    build: BUILD,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
    online: navigator.onLine,
    serviceWorker,
    storage,
    indexedDb,
    leagues,
    crashes: readCrashes(),
  };
}

function pasteBlock(s: Snapshot, tier: string): string {
  const lines = [
    'BS Hoops — diagnostics',
    `Captured: ${s.captured}`,
    `Build: ${s.build}`,
    `Browser: ${s.userAgent}`,
    `Viewport: ${s.viewport} · ${s.online ? 'online' : 'offline'} · SW ${s.serviceWorker}`,
    `Storage: ${s.storage} · IndexedDB ${s.indexedDb}`,
    `Tier: ${tier}`,
    '',
    `# Saved leagues (${s.leagues.length})`,
    ...(s.leagues.length
      ? s.leagues.map(l => `- ${l.displayName} [${l.id.slice(0, 8)}] · season ${l.currentSeason} · ${l.currentPhase} · ${l.teamCount} teams / ${l.playerCount} players · saved ${new Date(l.updatedAt).toISOString()}`)
      : ['(none)']),
    '',
    `# Recent crashes (${s.crashes.length})`,
    ...(s.crashes.length
      ? s.crashes.flatMap(c => [
          `--- ${c.at} · ${c.where} · ${c.path}${c.digest ? ` · ref ${c.digest}` : ''} ---`,
          c.message,
          // A stack's first line usually repeats the message.
          ...(c.stack ? [c.stack.split('\n').filter((l, i) => i > 0 || !l.includes(c.message)).join('\n')] : []),
          '',
        ])
      : ['(none)']),
  ];
  return lines.join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API missing or blocked — textarea fallback.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export default function DiagnosticsPage() {
  const { tier, isAdmin, isFoundingMember } = useSubscription();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [copy, setCopy] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    let alive = true;
    void collect().then(s => { if (alive) setSnap(s); });
    return () => { alive = false; };
  }, []);

  const tierLabel = `${tier}${isAdmin ? ' (admin)' : ''}${isFoundingMember ? ' (founder)' : ''}`;
  const block = snap ? pasteBlock(snap, tierLabel) : '';

  async function onCopy() {
    const ok = await copyText(block);
    setCopy(ok ? 'ok' : 'fail');
    window.setTimeout(() => setCopy('idle'), 2500);
  }

  function onClearCrashes() {
    clearCrashes();
    setSnap(s => (s ? { ...s, crashes: [] } : s));
  }

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <header className="space-y-1">
        <h1 className="text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>Diagnostics</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          Hit a bug? Open this page on the same device, tap <strong>Copy diagnostics</strong> and paste it into{' '}
          <code className="text-xs">#bug-reports</code> on Discord or the feedback box. It lists your browser, storage, saved
          leagues (name, season, phase) and recent crash messages — no personal information.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 sticky top-0 py-2 z-10 bg-[var(--background,var(--bg))]">
        <button
          type="button"
          onClick={onCopy}
          disabled={!snap}
          className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          Copy diagnostics
        </button>
        {copy === 'ok' && <span className="text-sm text-green-600">Copied — paste it in Discord.</span>}
        {copy === 'fail' && <span className="text-sm text-red-600">Copy failed — select the text below.</span>}
        <button
          type="button"
          onClick={onClearCrashes}
          disabled={!snap?.crashes.length}
          className="ml-auto text-xs underline text-[var(--text-sec)] disabled:opacity-40"
        >
          Clear crash log
        </button>
      </div>

      <pre className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed select-all">
        {snap ? block : 'Collecting…'}
      </pre>

      <p className="text-xs text-[var(--text-sec)]">Read-only: nothing here can change or delete your leagues.</p>
    </main>
  );
}
