'use client';

import { useLeagueStore } from '@/lib/store/leagueStore';
import {
  faIntelReport, intelRemaining, isIntelRevealed, INTEL_REPORTS_PER_WINDOW,
  type Interest,
} from '@/lib/freeAgency/intel';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';

const INTEREST: Record<Interest, { label: string; color: string }> = {
  hot: { label: 'Hot', color: '#dc2626' },
  warm: { label: 'Warm', color: '#d97706' },
  lukewarm: { label: 'Lukewarm', color: 'var(--text-sec)' },
};

const VIA: Record<string, string> = { open_spot: 'open roster spot', waive_upgrade: 'would waive to add', bird_rights: 'Bird rights' };

function m(n: number): string { return `$${(n / 1_000_000).toFixed(1)}M`; }

/**
 * Per-free-agent suitor intel: which AI teams are in, fuzzed offer ranges, and
 * the player's priorities. Costs one of the window's limited intel reports.
 */
export function SuitorIntel({ league, playerId, teamById }: { league: BasketballLeagueState; playerId: string; teamById: Map<string, BasketballTeam> }) {
  const reveal = useLeagueStore(s => s.revealFaIntel);
  const revealed = isIntelRevealed(league, playerId);
  const left = intelRemaining(league);

  if (!revealed) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 flex flex-wrap items-center gap-3 text-xs" style={{ borderColor: 'var(--border)' }}>
        <span className="font-semibold">🕵️ Suitor intel</span>
        <span className="text-[var(--text-sec)]">Who&apos;s bidding, rough offers, and what he wants.</span>
        <button
          disabled={left <= 0}
          onClick={e => { e.stopPropagation(); void reveal(playerId); }}
          className="ml-auto rounded-md px-2.5 py-1 font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {left > 0 ? `Pull report (${left}/${INTEL_REPORTS_PER_WINDOW} left)` : 'No reports left this window'}
        </button>
      </div>
    );
  }

  const report = faIntelReport(league, playerId);
  if (!report) return null;

  return (
    <div className="rounded-lg border bg-[var(--surface)] p-3 text-xs space-y-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        <span className="font-bold">🕵️ Suitor intel</span>
        <span className="text-[var(--text-sec)]">Top priority: <span className="font-semibold text-[var(--foreground)]">{report.headline}</span></span>
        {report.userAskHigh > 0 && (
          <span className="ml-auto text-[var(--text-sec)]">Your price: <span className="font-semibold text-[var(--foreground)] tabular-nums">{m(report.userAskLow)}–{m(report.userAskHigh)}</span> total</span>
        )}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">Interested teams</div>
        {report.suitors.length === 0 ? (
          <div className="text-[var(--text-sec)]">No AI team is in on him right now.</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {report.suitors.slice(0, 6).map(s => {
              const t = teamById.get(s.teamId);
              const i = INTEREST[s.interest];
              return (
                <li key={s.teamId} className="flex items-center gap-2 py-1">
                  <span className="font-bold w-16 shrink-0" style={{ color: i.color }}>{i.label}</span>
                  <span className="font-semibold truncate">{t ? `${t.city} ${t.name}` : s.teamId}</span>
                  {s.frontRunner && <span className="text-[9px] font-bold px-1 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>front-runner</span>}
                  <span className="text-[var(--text-sec)] hidden sm:inline">· {VIA[s.via]}</span>
                  <span className="ml-auto tabular-nums">{m(s.offerLow)}–{m(s.offerHigh)} <span className="text-[var(--text-sec)]">/ {s.years}y</span></span>
                </li>
              );
            })}
            {report.suitors.length > 6 && <li className="py-1 text-[var(--text-sec)]">+{report.suitors.length - 6} more</li>}
          </ul>
        )}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">What he wants</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {report.priorities.map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="w-16 font-semibold shrink-0">{p.label}</span>
              <div className="h-1.5 w-16 rounded-full bg-[var(--surface-2)] overflow-hidden shrink-0">
                <div className="h-full rounded-full" style={{ width: `${Math.round(p.weight * 100)}%`, background: 'var(--accent)' }} />
              </div>
              <span className="text-[var(--text-sec)] truncate" title={p.note}>{p.note}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-[var(--text-sec)]">Offer ranges are scout estimates, not exact figures.</div>
    </div>
  );
}
