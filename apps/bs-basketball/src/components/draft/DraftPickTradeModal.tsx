'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { getDraft } from '@/lib/draft';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { basketballPickValue, type BasketballTeam } from '@bs/sport-basketball';

/**
 * Trade picks WITHIN the current draft (trade up / down / acquire a pick),
 * updating the live on-clock order. Only un-made picks are tradeable; value uses
 * the standard pick-value curve and the AI partner won't accept a clear loss.
 */
export function DraftPickTradeModal({ onClose }: { onClose: () => void }) {
  const { league, tradeDraftPicks, loading } = useLeagueStore();
  const [partner, setPartner] = useState<string>('');
  const [send, setSend] = useState<Set<number>>(new Set());
  const [get, setGet] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const draft = league ? getDraft(league) : null;
  const userId = league?.userTeamId ?? null;
  const teamById = useMemo(() => new Map((league?.teams as BasketballTeam[] | undefined ?? []).map(t => [t.id as string, t])), [league]);

  const partners = useMemo(
    () => (league ? (league.teams as BasketballTeam[]).filter(t => t.id !== userId).sort((a, b) => a.city.localeCompare(b.city)) : []),
    [league, userId],
  );

  if (!league || !draft || !userId) return null;

  const remaining = draft.picks.filter(p => p.prospectId === null);
  const myPicks = remaining.filter(p => p.teamId === userId);
  const partnerPicks = partner ? remaining.filter(p => p.teamId === partner) : [];

  const sendTotal = [...send].reduce((s, o) => s + basketballPickValue(o), 0);
  const getTotal = [...get].reduce((s, o) => s + basketballPickValue(o), 0);
  const ratio = sendTotal > 0 ? getTotal / sendTotal : getTotal > 0 ? 2 : 1;
  const verdict = sendTotal === 0 && getTotal === 0 ? 'Add picks to both sides.'
    : ratio >= 1.05 ? `You gain ~${Math.round((ratio - 1) * 100)}% in value`
    : ratio <= 0.95 ? `You overpay by ~${Math.round((1 - ratio) * 100)}%`
    : 'Roughly even value';
  const verdictColor = ratio >= 1.05 ? '#10b981' : ratio <= 0.95 ? '#dc2626' : 'var(--text-sec)';
  const maxBar = Math.max(sendTotal, getTotal, 1);

  function toggle(setFn: React.Dispatch<React.SetStateAction<Set<number>>>, overall: number) {
    setResult(null);
    setFn(prev => { const n = new Set(prev); if (n.has(overall)) n.delete(overall); else n.add(overall); return n; });
  }

  async function submit() {
    if (!partner || (send.size === 0 && get.size === 0)) return;
    const res = await tradeDraftPicks(partner, [...send], [...get]);
    setResult({ ok: res.accepted, msg: res.reason });
    if (res.accepted) { setSend(new Set()); setGet(new Set()); }
  }

  const renderPicks = (picks: typeof myPicks, set: Set<number>, side: 'send' | 'get') => (
    <div className="space-y-1.5 max-h-56 overflow-y-auto">
      {picks.length === 0 && <p className="text-xs text-[var(--text-sec)]">No un-made picks.</p>}
      {[...picks].sort((a, b) => a.overall - b.overall).map(p => {
        const on = set.has(p.overall);
        const color = side === 'send' ? 'var(--accent-alt)' : '#10b981';
        return (
          <label key={p.overall} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer" style={{ borderColor: on ? color : 'var(--border)', background: on ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined }}>
            <input type="checkbox" checked={on} onChange={() => toggle(side === 'send' ? setSend : setGet, p.overall)} />
            <span className="font-semibold">Pick #{p.overall}</span>
            <span className="text-[10px] text-[var(--text-sec)]">R{p.round}{p.isLottery ? ' · lottery' : ''}</span>
            <span className="ml-auto text-xs tabular-nums text-[var(--text-sec)]">{Math.round(basketballPickValue(p.overall))} pts</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <span className="font-black text-lg">Trade Draft Picks</span>
          <span className="text-xs text-[var(--text-sec)]">— move up, down, or stack picks in this draft</span>
          <button onClick={onClose} className="ml-auto text-[var(--text-sec)] hover:text-[var(--text)] text-lg px-1">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Trade with</span>
            <select value={partner} onChange={e => { setPartner(e.target.value); setGet(new Set()); setResult(null); }} className="px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm" style={{ borderColor: 'var(--border)' }}>
              <option value="">Select a team…</option>
              {partners.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-sec)] mb-1.5">You send</div>
              {renderPicks(myPicks, send, 'send')}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-sec)] mb-1.5 flex items-center gap-1.5">
                You get{partner && teamById.get(partner) && <TeamLogo abbreviation={teamById.get(partner)!.abbreviation} primaryColor={teamById.get(partner)!.primaryColor} secondaryColor={teamById.get(partner)!.secondaryColor} size="xs" />}
              </div>
              {partner ? renderPicks(partnerPicks, get, 'get') : <p className="text-xs text-[var(--text-sec)]">Pick a team first.</p>}
            </div>
          </div>

          {/* Value bars + verdict */}
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-xs"><span className="w-12 text-[var(--text-sec)]">Send</span><div className="flex-1 h-2 rounded-full" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${(sendTotal / maxBar) * 100}%`, background: 'var(--accent-alt)' }} /></div><span className="w-10 text-right tabular-nums">{Math.round(sendTotal)}</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="w-12 text-[var(--text-sec)]">Get</span><div className="flex-1 h-2 rounded-full" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${(getTotal / maxBar) * 100}%`, background: '#10b981' }} /></div><span className="w-10 text-right tabular-nums">{Math.round(getTotal)}</span></div>
            <div className="text-sm font-bold text-center" style={{ color: verdictColor }}>{verdict}</div>
          </div>

          {result && (
            <div className="rounded-lg p-3 text-sm border" style={{ borderColor: result.ok ? 'var(--accent)' : '#dc2626', background: result.ok ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'color-mix(in srgb, #dc2626 8%, transparent)' }}>
              {result.ok ? '✅ ' : '🚫 '}{result.msg}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold border" style={{ borderColor: 'var(--border)' }}>{result?.ok ? 'Done' : 'Cancel'}</button>
            <button onClick={() => void submit()} disabled={loading || !partner || (send.size === 0 && get.size === 0)} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              {loading ? 'Working…' : 'Propose Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
