'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import { OfferSalaryInput, OfferYearsPicker } from '@/components/freeAgency/OfferSalaryInput';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { openTalk, currentAsk, offerTemperature, validateOffer, type OfferResponse } from '@/lib/roster/negotiation';
import { extensionMarket } from '@/lib/roster/extension';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { fmtMoney } from '@/lib/dashboard/summary';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * Contract negotiation modal — re-sign window AND in-season extensions.
 *
 * Multi-round talks (lib/roster/negotiation.ts): each offer is a round. He
 * accepts, counters (his counter is shown and can be loaded into the form),
 * or is offended by a lowball (patience drops; a second insult ends talks and
 * he tests free agency). "Offer what he wants" signs at his current ask.
 * Talk state persists on the save, so closing + reopening keeps the history.
 */
export function ExtendModal({ playerId, onClose }: { playerId: string | null; onClose: () => void }) {
  const { league, negotiateExtension, acceptExtensionAsk, loading } = useLeagueStore();
  const player = playerId && league ? (league.players[playerId as keyof typeof league.players] as BasketballPlayer | undefined) ?? null : null;
  const season = league?.currentSeason ?? 2026;

  const talk = useMemo(() => (league && player ? openTalk(league, player) : null), [league, player]);
  const market = useMemo(() => (player ? extensionMarket(player, season) : null), [player, season]);
  // Offer form state ($M/yr for salary). OfferSalaryInput keeps its own
  // string drafts so mobile users can clear + retype; the derived offer below
  // still clamps exactly as before.
  const [yearsSel, setYearsSel] = useState(2);
  const [salarySel, setSalarySel] = useState(5);
  const [last, setLast] = useState<OfferResponse | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the inputs to his current ask — only when a *different* player opens.
  useEffect(() => {
    if (!playerId || !league) return;
    const p = league.players[playerId as keyof typeof league.players] as BasketballPlayer | undefined;
    if (!p) return;
    const ask = currentAsk(openTalk(league, p));
    setYearsSel(ask.years);
    setSalarySel(Math.round((ask.salaryPerYear / 1e6) * 10) / 10);
    setLast(null);
    // Intentionally keyed on playerId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  if (!playerId) return null;
  if (!player || !talk || !market) {
    return <Modal open onClose={onClose} title="Negotiate" maxWidthClass="max-w-md"><p className="p-2 text-sm text-[var(--text-sec)]">Player unavailable.</p></Modal>;
  }

  const years = Math.min(5, Math.max(1, Math.round(yearsSel || 1)));
  const salaryM = Math.min(80, Math.max(0.5, salarySel || 0.5));
  const offer = { years, salaryPerYear: Math.round(salaryM * 10) * 100_000 };
  const illegal = validateOffer(talk.profile, offer);
  const temp = offerTemperature(talk, offer);
  const tempPct = Math.round(temp * 100);
  const meterColor = temp >= 1 ? '#059669' : temp >= 0.45 ? '#d97706' : '#dc2626';
  const tempLabel = temp >= 1 ? 'He’ll sign this' : temp > 0 ? 'He’ll counter' : 'Lowball — he’ll be offended';
  const ask = currentAsk(talk);
  const open = talk.status === 'open';
  const name = `${player.firstName} ${player.lastName}`;

  async function propose() {
    setBusy(true);
    const res = await negotiateExtension(player!.id, offer);
    setBusy(false);
    if (!res) return;
    if (res.kind === 'accepted') { onClose(); return; }
    setLast(res);
  }
  async function takeAsk() {
    setBusy(true);
    const res = await acceptExtensionAsk(player!.id);
    setBusy(false);
    if (!res) return;
    if (res.kind === 'accepted') { onClose(); return; }
    setLast(res);
  }
  function loadCounter(o: { years: number; salaryPerYear: number }) {
    setYearsSel(o.years);
    setSalarySel(Math.round((o.salaryPerYear / 1e6) * 10) / 10);
  }
  // Slider / clamp band for the salary control: his legal range (league
  // minimum → max salary), inside the same 0.5–80 $M rails the offer clamps to.
  const minM = Math.max(0.5, Math.ceil(talk.profile.minSalary / 100_000) / 10);
  const maxM = Math.max(minM, Math.min(80, Math.floor(talk.profile.maxSalary / 100_000) / 10));

  const lastTone = last?.kind === 'countered' ? 'var(--accent)' : last?.kind === 'invalid' ? 'var(--border)' : '#dc2626';

  return (
    <Modal open onClose={onClose} title={`Negotiate with ${name}`} maxWidthClass="max-w-md">
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-sec)]">{player.sportData.position} · Age {player.age} · {player.ratings.overall} OVR · {talk.profile.moodLabel}</span>
          <span className="text-[var(--text-sec)]">{contractYearsLeft(player, season)}y left</span>
        </div>

        {/* His stance: ask + patience + what drives him */}
        <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: 'var(--surface-2)' }}>
          <div>
            <span className="opacity-70">{open ? 'Asking ' : 'To keep him: '}</span>
            <span className="font-bold">{fmtMoney(ask.salaryPerYear)}/yr</span>
            <span className="opacity-70"> over </span>
            <span className="font-bold">{ask.years} years</span>
            <span className="opacity-70"> · new years begin {market.startSeason}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-70">Patience</span>
            <span className="flex gap-1" aria-label={`${talk.patienceLeft} of ${talk.profile.patience} rounds left`}>
              {Array.from({ length: talk.profile.patience }).map((_, i) => (
                <span key={i} className="inline-block w-3 h-3 rounded-full" style={{ background: i < talk.patienceLeft ? 'var(--accent)' : 'var(--border)' }} />
              ))}
            </span>
            <span className="opacity-70 tabular-nums">{talk.patienceLeft}/{talk.profile.patience} rounds</span>
            {talk.offenses > 0 && <span className="font-bold" style={{ color: '#dc2626' }}>· offended</span>}
          </div>
          {talk.profile.traits.length > 0 && (
            <div className="text-xs text-[var(--text-sec)]">{talk.profile.traits.join(' · ')}</div>
          )}
        </div>

        {!open && (
          <div className="rounded-lg p-3 text-sm border" style={{ borderColor: '#dc2626', background: 'color-mix(in srgb, #dc2626 6%, transparent)' }}>
            {name} has ended talks and plans to test free agency. You can still keep him by meeting his full price.
          </div>
        )}

        {last && (
          <div className="rounded-lg p-3 text-sm border" style={{ borderColor: lastTone, background: 'var(--surface)' }}>
            <div>{last.message}</div>
            {last.counter && open && (
              <button type="button" onClick={() => loadCounter(last.counter!)} className="mt-2 text-xs font-bold underline hover:no-underline hover:opacity-80 transition-opacity" style={{ color: 'var(--accent)' }}>
                Load his counter into the offer
              </button>
            )}
          </div>
        )}

        {talk.rounds.length > 0 && (
          <ol className="text-xs space-y-1 text-[var(--text-sec)]">
            {talk.rounds.map((r, i) => (
              <li key={i} className="flex justify-between gap-2 tabular-nums">
                <span>R{i + 1}: you {r.offer.years}y · {fmtMoney(r.offer.salaryPerYear)}</span>
                <span>{r.response === 'countered' && r.counter ? `counter ${fmtMoney(r.counter.salaryPerYear)}` : r.response}</span>
              </li>
            ))}
          </ol>
        )}

        {open && (
          <>
            <div className="space-y-3">
              <div>
                <span className="block text-xs uppercase tracking-widest opacity-60 mb-1">Salary</span>
                <OfferSalaryInput
                  askingSalary={ask.salaryPerYear / 1e6}
                  value={salarySel}
                  onChange={setSalarySel}
                  minSalary={minM}
                  maxSalary={maxM}
                />
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest opacity-60 mb-1">Years</span>
                <OfferYearsPicker value={yearsSel} onChange={setYearsSel} preferred={ask.years} max={5} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="opacity-70">{illegal ?? tempLabel}</span>
                <span className="font-bold tabular-nums" style={{ color: illegal ? '#dc2626' : meterColor }}>{illegal ? '—' : `${tempPct}%`}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${illegal ? 0 : tempPct}%`, background: meterColor }} />
              </div>
              <div className="mt-1 text-xs text-[var(--text-sec)]">
                {offer.years} yrs · {fmtMoney(offer.salaryPerYear)}/yr · {fmtMoney(offer.salaryPerYear * offer.years)} total
              </div>
            </div>
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" disabled={loading || busy} onClick={() => void takeAsk()}>
            {open ? `Offer what he wants (${fmtMoney(ask.salaryPerYear)})` : `Pay his price (${fmtMoney(ask.salaryPerYear)})`}
          </Button>
          {open && (
            <Button variant="primary" disabled={loading || busy || !!illegal} onClick={() => void propose()}>
              {busy ? 'Working…' : 'Make offer'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
