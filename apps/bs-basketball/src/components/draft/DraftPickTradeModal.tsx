'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { getDraft } from '@/lib/draft';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { basketballPickTradeValue, basketballTradeValue, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';

/**
 * Trade picks AND players within the current draft (trade up / down / acquire),
 * updating the live on-clock order. Only un-made picks are tradeable; value is on
 * the same PTS scale as the main trade center, and the AI partner won't accept a
 * clear loss. Mirrors football's draft-board trading.
 */
export function DraftPickTradeModal({ onClose }: { onClose: () => void }) {
  const { league, tradeDraftPicks, loading } = useLeagueStore();
  const [partner, setPartner] = useState<string>('');
  const [sendPicks, setSendPicks] = useState<Set<number>>(new Set());
  const [getPicks, setGetPicks] = useState<Set<number>>(new Set());
  const [sendPlayers, setSendPlayers] = useState<Set<string>>(new Set());
  const [getPlayers, setGetPlayers] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const draft = league ? getDraft(league) : null;
  const userId = league?.userTeamId ?? null;
  const season = league?.currentSeason ?? 0;
  const players = (league?.players ?? {}) as Record<string, BasketballPlayer>;
  const teamById = useMemo(() => new Map((league?.teams as BasketballTeam[] | undefined ?? []).map(t => [t.id as string, t])), [league]);
  const partners = useMemo(
    () => (league ? (league.teams as BasketballTeam[]).filter(t => t.id !== userId).sort((a, b) => a.city.localeCompare(b.city)) : []),
    [league, userId],
  );

  if (!league || !draft || !userId) return null;

  const userTeam = teamById.get(userId);
  const partnerTeam = partner ? teamById.get(partner) : undefined;
  const remaining = draft.picks.filter(p => p.prospectId === null);
  const myPicks = remaining.filter(p => p.teamId === userId);
  const partnerPicks = partner ? remaining.filter(p => p.teamId === partner) : [];
  const rosterOf = (t?: BasketballTeam) => (t ? t.playerIds.map(id => players[id]).filter(Boolean).sort((a, b) => b.ratings.overall - a.ratings.overall) : []);

  const pv = (overall: number) => Math.round(basketballPickTradeValue(overall));
  const tv = (p: BasketballPlayer) => Math.round(basketballTradeValue(p, { season }));
  const sendTotal = [...sendPicks].reduce((s, o) => s + pv(o), 0) + [...sendPlayers].reduce((s, id) => s + (players[id] ? tv(players[id]) : 0), 0);
  const getTotal = [...getPicks].reduce((s, o) => s + pv(o), 0) + [...getPlayers].reduce((s, id) => s + (players[id] ? tv(players[id]) : 0), 0);
  const ratio = sendTotal > 0 ? getTotal / sendTotal : getTotal > 0 ? 2 : 1;
  const verdict = sendTotal === 0 && getTotal === 0 ? 'Add assets to both sides.'
    : ratio >= 1.05 ? `You gain ~${Math.round((ratio - 1) * 100)}% in value`
    : ratio <= 0.95 ? `You overpay by ~${Math.round((1 - ratio) * 100)}%`
    : 'Roughly even value';
  const verdictColor = ratio >= 1.05 ? '#10b981' : ratio <= 0.95 ? '#dc2626' : 'var(--text-sec)';
  const maxBar = Math.max(sendTotal, getTotal, 1);

  function toggleNum(setFn: React.Dispatch<React.SetStateAction<Set<number>>>, v: number) {
    setResult(null);
    setFn(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }
  function toggleStr(setFn: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) {
    setResult(null);
    setFn(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }

  async function submit() {
    if (!partner) return;
    const res = await tradeDraftPicks(partner, [...sendPicks], [...getPicks], [...sendPlayers], [...getPlayers]);
    setResult({ ok: res.accepted, msg: res.reason });
    if (res.accepted) { setSendPicks(new Set()); setGetPicks(new Set()); setSendPlayers(new Set()); setGetPlayers(new Set()); }
  }

  const pickRows = (picks: typeof myPicks, set: Set<number>, side: 'send' | 'get') => (
    <div className="space-y-1">
      {picks.length === 0 && <p className="text-[11px] text-[var(--text-sec)]">No un-made picks.</p>}
      {[...picks].sort((a, b) => a.overall - b.overall).map(p => {
        const on = set.has(p.overall);
        const color = side === 'send' ? 'var(--accent-alt)' : '#10b981';
        return (
          <label key={p.overall} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm cursor-pointer" style={{ borderColor: on ? color : 'var(--border)', background: on ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined }}>
            <input type="checkbox" checked={on} onChange={() => toggleNum(side === 'send' ? setSendPicks : setGetPicks, p.overall)} />
            <span className="font-semibold">{`🎟️ '${String(draft!.season).slice(-2)} #${p.overall}`}</span>
            <span className="ml-auto text-[11px] tabular-nums text-[var(--text-sec)]">{pv(p.overall)}</span>
          </label>
        );
      })}
    </div>
  );

  const playerRows = (roster: BasketballPlayer[], set: Set<string>, side: 'send' | 'get') => (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {roster.length === 0 && <p className="text-[11px] text-[var(--text-sec)]">—</p>}
      {roster.map(p => {
        const on = set.has(p.id);
        const color = side === 'send' ? 'var(--accent-alt)' : '#10b981';
        return (
          <label key={p.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm cursor-pointer" style={{ borderColor: on ? color : 'var(--border)', background: on ? `color-mix(in srgb, ${color} 8%, transparent)` : undefined }}>
            <input type="checkbox" checked={on} onChange={() => toggleStr(side === 'send' ? setSendPlayers : setGetPlayers, p.id)} />
            <span className="truncate">{p.firstName} {p.lastName}</span>
            <span className="text-[10px] text-[var(--text-sec)]">{p.sportData.position} · {p.ratings.overall}</span>
            <span className="ml-auto text-[11px] tabular-nums text-[var(--text-sec)]">{tv(p)}</span>
          </label>
        );
      })}
    </div>
  );

  const side = (label: string, team: BasketballTeam | undefined, picks: typeof myPicks, pickSet: Set<number>, playerSet: Set<string>, dir: 'send' | 'get') => (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-sec)] mb-1.5 flex items-center gap-1.5">
        {label}{team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />}
      </div>
      {team ? (
        <>
          <div className="text-[9px] uppercase tracking-wide text-[var(--text-sec)] mb-1">Picks</div>
          {pickRows(picks, pickSet, dir)}
          <div className="text-[9px] uppercase tracking-wide text-[var(--text-sec)] mt-2 mb-1">Players</div>
          {playerRows(rosterOf(team), playerSet, dir)}
        </>
      ) : <p className="text-xs text-[var(--text-sec)]">Pick a team first.</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center gap-2 sticky top-0" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <span className="font-black text-lg">Trade in the Draft</span>
          <span className="text-xs text-[var(--text-sec)]">— picks &amp; players, move up or down</span>
          <button onClick={onClose} className="ml-auto text-[var(--text-sec)] hover:text-[var(--text)] text-lg px-1">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Trade with</span>
            <select value={partner} onChange={e => { setPartner(e.target.value); setGetPicks(new Set()); setGetPlayers(new Set()); setResult(null); }} className="px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm" style={{ borderColor: 'var(--border)' }}>
              <option value="">Select a team…</option>
              {partners.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            {side('You send', userTeam, myPicks, sendPicks, sendPlayers, 'send')}
            {side('You get', partnerTeam, partnerPicks, getPicks, getPlayers, 'get')}
          </div>

          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-xs"><span className="w-12 text-[var(--text-sec)]">Send</span><div className="flex-1 h-2 rounded-full" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${(sendTotal / maxBar) * 100}%`, background: 'var(--accent-alt)' }} /></div><span className="w-12 text-right tabular-nums">{sendTotal}</span></div>
            <div className="flex items-center gap-2 text-xs"><span className="w-12 text-[var(--text-sec)]">Get</span><div className="flex-1 h-2 rounded-full" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${(getTotal / maxBar) * 100}%`, background: '#10b981' }} /></div><span className="w-12 text-right tabular-nums">{getTotal}</span></div>
            <div className="text-sm font-bold text-center" style={{ color: verdictColor }}>{verdict}</div>
          </div>

          {result && (
            <div className="rounded-lg p-3 text-sm border" style={{ borderColor: result.ok ? 'var(--accent)' : '#dc2626', background: result.ok ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'color-mix(in srgb, #dc2626 8%, transparent)' }}>
              {result.ok ? '✅ ' : '🚫 '}{result.msg}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-semibold border" style={{ borderColor: 'var(--border)' }}>{result?.ok ? 'Done' : 'Cancel'}</button>
            <button onClick={() => void submit()} disabled={loading || !partner} className="rounded-lg px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              {loading ? 'Working…' : 'Propose Trade'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
