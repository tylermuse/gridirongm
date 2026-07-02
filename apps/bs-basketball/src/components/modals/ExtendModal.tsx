'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { extensionMarket, extensionAcceptance } from '@/lib/roster/extension';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { fmtMoney } from '@/lib/dashboard/summary';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * Contract extension negotiation modal. Set years + salary; a live acceptance
 * meter shows how the player feels vs his market ask. Propose to get an accept
 * or a polite no with what he's actually after.
 */
export function ExtendModal({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const { league, extendPlayer, loading } = useLeagueStore();
  const player = playerId && league ? (league.players[playerId as keyof typeof league.players] as BasketballPlayer | undefined) ?? null : null;
  const season = league?.currentSeason ?? 2026;

  const market = useMemo(() => (player ? extensionMarket(player, season) : null), [player, season]);
  // Inputs are string-backed so mobile users can fully clear + retype the field.
  // The old code forced the numeric value to a min (1) on every keystroke, which
  // left a leading "1" you couldn't delete on mobile (no highlight-to-replace) —
  // e.g. a 31 → 26 edit was impossible. We clamp only for the derived offer/meter
  // and on blur, never mid-keystroke.
  const [yearsDraft, setYearsDraft] = useState('2');
  const [salaryDraft, setSalaryDraft] = useState('5');
  const [result, setResult] = useState<{ accepted: boolean; message: string } | null>(null);

  // Seed the inputs to the player's ask — only when a *different* player opens,
  // so re-signing (which mutates the player object) doesn't reset the result or
  // re-trigger the modal. Re-seeding on every player-ref change is what made the
  // modal flicker closed-then-open after Propose.
  useEffect(() => {
    if (!playerId || !league) return;
    const p = league.players[playerId as keyof typeof league.players] as BasketballPlayer | undefined;
    if (!p) return;
    const m = extensionMarket(p, season);
    setYearsDraft(String(m.desiredYears));
    setSalaryDraft(String(Math.round((m.marketSalary / 1e6) * 10) / 10));
    setResult(null);
    // Intentionally keyed on playerId only — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // The modal's open state is driven solely by playerId, so it never flips
  // closed when the player object changes mid-extension.
  if (!playerId) return null;

  // Clamp only here (for the offer + acceptance meter) and on blur — never on
  // each keystroke, so the raw input string can be empty/partial while editing.
  const years = Math.min(5, Math.max(1, Math.round(Number(yearsDraft) || 1)));
  const salaryM = Math.min(60, Math.max(1, Number(salaryDraft) || 1));
  const offer = { years, salaryPerYear: Math.round(salaryM * 1e6) };
  const acceptPct = player && market ? Math.round(extensionAcceptance(market, offer) * 100) : 0;
  const meterColor = acceptPct >= 50 ? '#10b981' : acceptPct >= 25 ? '#f59e0b' : '#dc2626';

  async function propose() {
    if (!player) return;
    const res = await extendPlayer(player.id, offer);
    if (!res) return;
    // Accepted → close immediately (the page shows a toast). This prevents the
    // form re-rendering and stacking another year on each extra click. Rejected
    // → keep the modal open with what he's actually after so the user can adjust.
    if (res.accepted) onClose();
    else setResult(res);
  }

  if (!player || !market) {
    return <Modal open onClose={onClose} title="Extend" maxWidthClass="max-w-md"><p className="p-2 text-sm text-[var(--text-sec)]">Player unavailable.</p></Modal>;
  }

  return (
    <Modal open onClose={onClose} title={`Extend ${player.firstName} ${player.lastName}`} maxWidthClass="max-w-md">
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-sec)]">{player.sportData.position} · Age {player.age} · {player.ratings.overall} OVR</span>
          <span className="text-[var(--text-sec)]">{contractYearsLeft(player, season)}y left</span>
        </div>

        <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
          <span className="opacity-70">Looking for </span>
          <span className="font-bold">{fmtMoney(market.marketSalary)}/yr</span>
          <span className="opacity-70"> over </span>
          <span className="font-bold">{market.desiredYears} years</span>
          <span className="opacity-70"> · new years begin {market.startSeason}</span>
        </div>

        {result ? (
          <div className="rounded-lg p-3 text-sm border" style={{ borderColor: result.accepted ? 'var(--accent)' : 'var(--border)', background: result.accepted ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)' }}>
            {result.accepted ? '✅ ' : '🤝 '}{result.message}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-widest opacity-60 mb-1">Years</span>
                <input type="number" inputMode="numeric" min={1} max={5} step={1} value={yearsDraft}
                  onChange={e => setYearsDraft(e.target.value)} onBlur={() => setYearsDraft(String(years))}
                  className="w-full rounded-lg border px-3 py-2 bg-[var(--bg)]" style={{ borderColor: 'var(--border)' }} />
              </label>
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-widest opacity-60 mb-1">Salary ($M/yr)</span>
                <input type="number" inputMode="decimal" min={1} max={60} step={0.5} value={salaryDraft}
                  onChange={e => setSalaryDraft(e.target.value)} onBlur={() => setSalaryDraft(String(salaryM))}
                  className="w-full rounded-lg border px-3 py-2 bg-[var(--bg)]" style={{ borderColor: 'var(--border)' }} />
              </label>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="opacity-70">Projected acceptance</span>
                <span className="font-bold tabular-nums" style={{ color: meterColor }}>{acceptPct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${acceptPct}%`, background: meterColor }} />
              </div>
              <div className="mt-1 text-xs text-[var(--text-sec)]">
                {offer.years} yrs · {fmtMoney(offer.salaryPerYear)}/yr · {fmtMoney(offer.salaryPerYear * offer.years)} total
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {result ? (
            <Button variant="primary" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {/* Extensions stack new years AFTER the current deal (see
                  buildExtension), so a player with years left is exactly who you
                  extend — never disable on "years left". */}
              <Button variant="primary" disabled={loading} onClick={() => void propose()}>
                {loading ? 'Working…' : 'Propose extension'}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
