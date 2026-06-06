'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { getTeamPicks, pickValue, pickLabel } from '@/lib/trade/picks';
import type { TradeSideInput } from '@/lib/trade';
import type { TeamId } from '@bs/core/adapter';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * Trade Pick (parity §G): a pick-only trade builder launched from the draft's
 * On-The-Clock bar. Pick a partner, check picks to send / receive, see the value
 * balance + verdict, and propose — the CPU accepts or explains why not.
 */
export function TradePickModal({ onClose }: { onClose: () => void }) {
  const league = useLeagueStore(s => s.league);
  const propose = useLeagueStore(s => s.proposeTrade);
  const loading = useLeagueStore(s => s.loading);

  const userId = league?.userTeamId as TeamId | null;
  const [partner, setPartner] = useState<string>('');
  const [send, setSend] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const partners = useMemo(
    () => (league ? (league.teams as BasketballTeam[]).filter(t => t.id !== userId).sort((a, b) => a.city.localeCompare(b.city)) : []),
    [league, userId],
  );

  if (!league || !userId) return null;
  const userPicks = getTeamPicks(league, userId);
  const partnerPicks = partner ? getTeamPicks(league, partner as TeamId) : [];

  const sendTotal = userPicks.filter(p => send.has(p.id)).reduce((s, p) => s + pickValue(league, p), 0);
  const getTotal = partnerPicks.filter(p => get.has(p.id)).reduce((s, p) => s + pickValue(league, p), 0);
  const ratio = sendTotal > 0 ? getTotal / sendTotal : getTotal > 0 ? 2 : 1;
  const verdict = sendTotal === 0 && getTotal === 0 ? 'Add picks to both sides.'
    : ratio >= 1.05 ? `You gain ~${Math.round((ratio - 1) * 100)}% in value`
    : ratio <= 0.95 ? `You overpay by ~${Math.round((1 - ratio) * 100)}%`
    : 'Roughly even value';
  const verdictColor = ratio >= 1.05 ? '#10b981' : ratio <= 0.95 ? '#dc2626' : 'var(--text-sec)';
  const maxBar = Math.max(sendTotal, getTotal, 1);

  function toggle(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setResult(null);
    setFn(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function submit() {
    if (!partner || (send.size === 0 && get.size === 0)) return;
    const sides: TradeSideInput[] = [
      { teamId: userId as TeamId, playerIds: [], pickIds: [...send] },
      { teamId: partner as TeamId, playerIds: [], pickIds: [...get] },
    ];
    const res = await propose(sides);
    if (!res) { setResult({ ok: false, msg: 'Trade failed.' }); return; }
    setResult({ ok: res.accepted, msg: res.accepted ? 'Trade accepted! Picks swapped.' : (res.reason ?? 'The other team passed.') });
    if (res.accepted) { setSend(new Set()); setGet(new Set()); }
  }

  const renderPicks = (picks: typeof userPicks, set: Set<string>, side: 'send' | 'get') => (
    <div className="space-y-1.5">
      {picks.length === 0 && <p className="text-xs text-[var(--text-sec)]">No tradeable picks.</p>}
      {picks.map(p => {
        const on = set.has(p.id);
        const color = side === 'send' ? 'var(--accent-alt)' : '#10b981';
        return (
          <label key={p.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer" style={{ borderColor: on ? color : 'var(--border)', background: on ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined }}>
            <input type="checkbox" checked={on} onChange={() => toggle(side === 'send' ? setSend : setGet, p.id)} />
            <span className="font-semibold">{pickLabel(league, p)}</span>
            <span className="ml-auto text-xs tabular-nums text-[var(--text-sec)]">{pickValue(league, p)} pts</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <h2 className="font-bold">Trade Picks</h2>
          <select value={partner} onChange={e => { setPartner(e.target.value); setGet(new Set()); setResult(null); }} className="ml-auto h-8 px-2 text-sm rounded border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
            <option value="">Select a partner…</option>
            {partners.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
          </select>
          <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-lg px-1">✕</button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">You send</div>
              {renderPicks(userPicks, send, 'send')}
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">You receive</div>
              {partner ? renderPicks(partnerPicks, get, 'get') : <p className="text-xs text-[var(--text-sec)]">Pick a partner first.</p>}
            </div>
          </div>

          {/* Value summary */}
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="text-sm font-bold mb-2" style={{ color: verdictColor }}>{verdict}</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2"><span className="w-14 text-[var(--text-sec)]">Send</span><div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full" style={{ width: `${(sendTotal / maxBar) * 100}%`, background: 'var(--accent-alt)' }} /></div><span className="w-12 text-right tabular-nums">{sendTotal}</span></div>
              <div className="flex items-center gap-2"><span className="w-14 text-[var(--text-sec)]">Receive</span><div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${(getTotal / maxBar) * 100}%` }} /></div><span className="w-12 text-right tabular-nums">{getTotal}</span></div>
            </div>
          </div>

          {result && <p className="mt-3 text-sm font-semibold" style={{ color: result.ok ? '#10b981' : '#dc2626' }}>{result.ok ? '✅ ' : '✗ '}{result.msg}</p>}

          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold border" style={{ borderColor: 'var(--border)' }}>{result?.ok ? 'Done' : 'Cancel'}</button>
            <button onClick={() => void submit()} disabled={loading || !partner || (send.size === 0 && get.size === 0)} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent-alt)' }}>
              {loading ? 'Proposing…' : 'Propose Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
