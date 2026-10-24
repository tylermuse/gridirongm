'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { isCloudSyncEnabled, setCloudSyncEnabled, getLastSyncedAt } from '@bs/core/supabase/cloud-saves';
import { useSupabaseUser } from '@/lib/auth/useSupabaseUser';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { listLeagues, getLeagueJson, importLeagueJson, type LeagueSaveMeta } from '@/lib/persistence/db';
import { readCloudIndex, pushLeagueNow, pullLeagueJson, removeCloudLeague, type CloudLeagueMeta } from '@/lib/persistence/cloud';

/**
 * Cloud Saves (parity with BS Football's CloudSyncCard, extended for Hoops'
 * multiple leagues): opt-in mirror of every local league to the user's account,
 * plus a list of cloud leagues to restore on this device or remove.
 */
export function CloudSavesPanel() {
  const { user, configured, loading } = useSupabaseUser();
  const loadLeague = useLeagueStore(s => s.loadLeague);
  const [enabled, setEnabled] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudLeagueMeta[] | null>(null);
  const [local, setLocal] = useState<LeagueSaveMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLocal(await listLeagues());
    setCloud(user ? await readCloudIndex() : null);
    setLastSynced(getLastSyncedAt());
  }, [user]);

  useEffect(() => {
    const id = window.setTimeout(() => { setEnabled(isCloudSyncEnabled()); void refresh(); }, 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  async function syncAll() {
    setBusy('sync');
    setMsg(null);
    let ok = 0, fail = 0;
    for (const l of await listLeagues()) {
      const row = await getLeagueJson(l.id);
      if (!row) continue;
      const res = await pushLeagueNow(row.json, { id: l.id, displayName: l.displayName, currentSeason: l.currentSeason, currentPhase: l.currentPhase, updatedAt: l.updatedAt });
      if (res.ok) ok++; else fail++;
    }
    setMsg(fail ? `Synced ${ok}, ${fail} failed — check your connection and try again.` : `Synced ${ok} league${ok === 1 ? '' : 's'}.`);
    setBusy(null);
    await refresh();
  }

  async function toggle(next: boolean) {
    setEnabled(next);
    setCloudSyncEnabled(next);
    if (next) await syncAll();
  }

  async function restore(meta: CloudLeagueMeta) {
    const localCopy = local.find(l => l.id === meta.id);
    if (localCopy && localCopy.updatedAt > meta.updatedAt
      && !window.confirm(`This device has a NEWER copy of "${meta.displayName}". Replace it with the cloud copy?`)) return;
    setBusy(meta.id);
    setMsg(null);
    const json = await pullLeagueJson(meta.id);
    const id = json ? await importLeagueJson(json) : null;
    setBusy(null);
    if (!id) { setMsg(`Couldn't restore "${meta.displayName}".`); return; }
    await loadLeague(id);
    setMsg(`Restored "${meta.displayName}" — it's now your active league.`);
    await refresh();
  }

  async function remove(meta: CloudLeagueMeta) {
    if (!window.confirm(`Remove the cloud copy of "${meta.displayName}"? Copies on your devices are not affected.`)) return;
    setBusy(meta.id);
    const ok = await removeCloudLeague(meta.id);
    setBusy(null);
    setMsg(ok ? `Removed "${meta.displayName}" from the cloud.` : 'Remove failed.');
    await refresh();
  }

  if (!configured) return null;

  return (
    <section className="mb-4 rounded-xl border bg-[var(--surface)] p-5" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-bold">Cloud Saves</h2>
          <p className="text-sm text-[var(--text-sec)] mt-0.5">
            {user
              ? 'Keep a copy of your leagues on your account and pick them up on another device. This browser stays the source of truth; sync runs in the background.'
              : 'Sign in to back up your leagues and continue on another device. Without an account, saves stay in this browser.'}
          </p>
          {user && enabled && (
            <p className="text-[11px] text-[var(--text-sec)] mt-1">
              {busy === 'sync' ? 'Syncing…' : `Last synced: ${lastSynced ? new Date(lastSynced).toLocaleString() : 'not yet'}`}
            </p>
          )}
        </div>
        {user ? (
          <button
            onClick={() => void toggle(!enabled)}
            disabled={!!busy}
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? 'Turn off cloud saves' : 'Turn on cloud saves'}
            className="shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-60"
            style={{ background: enabled ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        ) : !loading && (
          <Link href="/login" className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>Sign in</Link>
        )}
      </div>

      {user && enabled && (
        <button onClick={() => void syncAll()} disabled={!!busy} className="mt-3 text-xs font-semibold underline opacity-70 hover:opacity-100 disabled:opacity-40">
          Sync all leagues now
        </button>
      )}

      {user && cloud && cloud.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-sec)] mb-1.5">In your cloud</div>
          <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {cloud.map(m => {
              const here = local.find(l => l.id === m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{m.displayName}</div>
                    <div className="text-[11px] text-[var(--text-sec)]">
                      {m.currentSeason} · {m.currentPhase.replace(/_/g, ' ')} · saved {new Date(m.updatedAt).toLocaleDateString()}
                      {here ? ' · on this device' : ''}
                    </div>
                  </div>
                  <button onClick={() => void restore(m)} disabled={!!busy} className="rounded-md px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                    {busy === m.id ? '…' : here ? 'Replace local' : 'Restore'}
                  </button>
                  <button onClick={() => void remove(m)} disabled={!!busy} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-sec)] hover:text-[var(--foreground)] disabled:opacity-50" title="Remove cloud copy">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {msg && <p className="text-xs mt-3 font-semibold">{msg}</p>}
    </section>
  );
}
