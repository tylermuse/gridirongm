'use client';

/**
 * Phone contract-offer sheet (Free Agency and Re-signing).
 *
 * Slides up over the page when a negotiation starts on a phone. It drives the
 * same negotiation state as the desktop panel on each page, so the engine,
 * the counters and the outcome are unchanged; only the controls differ:
 * a salary slider (tap the amount to type one), 85% / 95% / Ask / 110%
 * presets, year chips, cap after signing, and an interest read-out.
 *
 * Renders below `sm` only; the desktop panel stays as it was.
 */

import { useEffect, useState } from 'react';
import type { NegotiationState } from '@/lib/engine/negotiation';

const round1 = (n: number) => Math.round(n * 10) / 10;

type Preset = '85' | '95' | 'ask' | '110';
const PRESETS: { id: Preset; label: string; pct: number }[] = [
  { id: '85', label: '85%', pct: 0.85 },
  { id: '95', label: '95%', pct: 0.95 },
  { id: 'ask', label: 'Ask', pct: 1 },
  { id: '110', label: '110%', pct: 1.1 },
];

function ovrTile(ovr: number): string {
  if (ovr >= 80) return 'bg-green-500/15 text-green-600';
  if (ovr >= 65) return 'bg-blue-500/15 text-blue-600';
  if (ovr >= 50) return 'bg-amber-500/15 text-amber-600';
  return 'bg-red-500/15 text-red-600';
}

export interface OfferSheetProps {
  negotiation: NegotiationState | null;
  /** False hides the sheet without ending the talks (e.g. while the player card is open). */
  open: boolean;
  /** Backdrop, ✕ handle or Escape. */
  onClose: () => void;

  offerSalary: number;
  onSalaryChange: (salary: number) => void;
  offerYears: number;
  onYearsChange: (years: number) => void;
  maxYears?: number;
  minSalary: number;
  maxSalary: number;
  /** When set, the salary is fixed (e.g. over the cap) and this explains why. */
  salaryLockedNote?: React.ReactNode;
  /** Cap space left if this offer is signed; omitted hides the line. */
  capAfter?: number;

  /** Small line above the name, e.g. "Extension". */
  kicker?: string;
  /** What the player cares about, if known (intel report). */
  wants?: string | null;
  /** Free-tier: show this instead of the exact rating. */
  ovrText?: string;
  /** Extra line under the controls (e.g. restructure cap impact). */
  note?: React.ReactNode;

  acceptedTitle: string;
  acceptedText: string;
  rejectedText: string;

  onSubmit: () => void;
  onWalkAway: () => void;
  walkAwayLabel?: string;
  onDone: () => void;
  onDismiss: () => void;
  /** Opens the player card; the name becomes tappable too. */
  onPlayerCard?: () => void;
  /** Extra content at the bottom of the sheet (e.g. intel report). */
  children?: React.ReactNode;
}

export function OfferSheet({
  negotiation, open, onClose,
  offerSalary, onSalaryChange, offerYears, onYearsChange, maxYears = 5,
  minSalary, maxSalary, salaryLockedNote, capAfter,
  kicker, wants, ovrText, note,
  acceptedTitle, acceptedText, rejectedText,
  onSubmit, onWalkAway, walkAwayLabel = 'Walk Away', onDone, onDismiss, onPlayerCard,
  children,
}: OfferSheetProps) {
  // Which preset chip is lit. Cleared when the slider or the typed amount
  // moves, when the player counters, and when talks switch to someone else.
  const [preset, setPreset] = useState<Preset | null>('ask');
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const playerId = negotiation?.playerId;
  const round = negotiation?.round ?? 0;
  const ask = negotiation?.askingSalary ?? 0;

  useEffect(() => {
    // Light "Ask" only when the opening offer really is the ask (Re-signing
    // can open at the player's stated number, which differs from it).
    setPreset(!salaryLockedNote && Math.abs(offerSalary - round1(ask)) < 0.05 ? 'ask' : null);
    setAmountDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  useEffect(() => {
    if (round > 0) setPreset(null);
  }, [round]);

  useEffect(() => {
    if (!open) return;
    // The Escape that closed the player card is still being dispatched when
    // the sheet comes back; only keys pressed after it reappears count.
    const openedAt = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.timeStamp >= openedAt) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!negotiation || !open) return null;

  const clamp = (n: number) => Math.min(maxSalary, Math.max(minSalary, round1(n)));
  const fillPct = Math.max(0, Math.min(100, ((offerSalary - minSalary) / Math.max(0.1, maxSalary - minSalary)) * 100));

  // The same score the player's side uses to judge an offer (negotiation.ts).
  const satisfaction = (offerSalary / (ask || 1)) * 0.7
    + (negotiation.askingYears > 0 ? offerYears / negotiation.askingYears : 1) * 0.3;
  const interest = satisfaction >= 0.95 ? { label: 'Likely', bar: 'bg-green-500', text: 'text-green-600' }
    : satisfaction >= 0.88 ? { label: 'Maybe', bar: 'bg-amber-500', text: 'text-amber-600' }
    : satisfaction >= 0.75 ? { label: 'Unlikely', bar: 'bg-red-500', text: 'text-red-600' }
    : { label: 'Long shot', bar: 'bg-red-500', text: 'text-red-600' };
  const interestPct = Math.max(4, Math.min(100, ((satisfaction - 0.6) / 0.45) * 100));

  const lastPlayerMsg = [...negotiation.messages].reverse().find(m => m.sender === 'player');
  const lastNegative = [...negotiation.messages].reverse().find(m => m.type === 'negative');

  const commitDraft = () => {
    if (amountDraft === null) return;
    const v = parseFloat(amountDraft.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(v)) { onSalaryChange(clamp(v)); setPreset(null); }
    setAmountDraft(null);
  };

  const nameEl = onPlayerCard
    ? (
      <button type="button" onClick={onPlayerCard} className="block max-w-full text-left">
        <span className="block font-display text-2xl leading-none truncate">{negotiation.playerName}</span>
      </button>
    )
    : <div className="font-display text-2xl leading-none truncate">{negotiation.playerName}</div>;

  return (
    <div className="fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" aria-label={`Offer to ${negotiation.playerName}`}>
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className="offer-sheet absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-2xl bg-[var(--surface)] shadow-2xl px-4 pt-2 offer-sheet-safe-bottom">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="mx-auto mb-2 flex h-4 w-16 items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-[var(--border)]" aria-hidden="true" />
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {kicker && <div className="offer-label mb-1">{kicker}</div>}
            {nameEl}
            <div className="mt-1 text-xs text-[var(--text-sec)]">
              {negotiation.position} · {negotiation.playerAge}
              {wants && <> · Wants: <span className="font-bold text-[var(--text)]">{wants}</span></>}
            </div>
          </div>
          {ovrText ? (
            <span className="shrink-0 inline-flex items-center justify-center rounded-md px-2 h-8 text-[10px] font-bold uppercase tracking-wide bg-[var(--surface-2)] text-[var(--text-sec)]">
              {ovrText}
            </span>
          ) : (
            <span className={`shrink-0 inline-flex items-center justify-center rounded-md min-w-9 h-8 px-1.5 text-[15px] font-extrabold tabular-nums ${ovrTile(negotiation.playerOverall)}`}>
              {negotiation.playerOverall}
            </span>
          )}
        </div>

        {lastPlayerMsg && negotiation.outcome === 'pending' && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            lastPlayerMsg.type === 'counter' ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : lastPlayerMsg.type === 'negative' ? 'bg-red-50 border border-red-200 text-red-600'
              : 'bg-[var(--surface-2)] text-[var(--text)]'
          }`}>
            {lastPlayerMsg.text}
          </div>
        )}

        {negotiation.outcome === 'accepted' && (
          <div className="mt-4 bg-green-50 border border-green-600 rounded-xl p-4 text-center">
            <div className="font-display text-2xl text-green-600">{acceptedTitle}</div>
            <div className="text-sm text-green-600">{acceptedText}</div>
            <button type="button" onClick={onDone} className="mt-3 h-11 w-full rounded-lg bg-[var(--surface)] border border-green-600/40 text-sm font-bold text-green-700">
              Done
            </button>
          </div>
        )}

        {negotiation.outcome === 'rejected' && (
          <div className="mt-4 bg-red-50 border border-red-600 rounded-xl p-4 text-center">
            <div className="font-display text-2xl text-red-600">Rejected</div>
            <div className="text-sm text-red-600">{lastNegative?.text ?? lastPlayerMsg?.text ?? rejectedText}</div>
            <button type="button" onClick={onDismiss} className="mt-3 h-11 w-full rounded-lg bg-[var(--surface)] border border-red-600/40 text-sm font-bold text-red-700">
              Dismiss
            </button>
          </div>
        )}

        {negotiation.outcome === 'pending' && (
          <>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="offer-label pb-1.5">Salary / yr</div>
              {salaryLockedNote ? (
                <div className="offer-num text-[32px] leading-none">${offerSalary.toFixed(1)}M</div>
              ) : (
                <label className="offer-num text-[32px] leading-none flex items-baseline">
                  <span>$</span>
                  {/* Tap the amount to type one. The hidden copy sizes the field
                      to exactly what it shows. */}
                  <span className="inline-grid">
                    <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
                      {amountDraft ?? offerSalary.toFixed(1)}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      size={1}
                      aria-label="Offer salary ($M per year)"
                      value={amountDraft ?? offerSalary.toFixed(1)}
                      onFocus={e => { setAmountDraft(offerSalary.toFixed(1)); e.currentTarget.select(); }}
                      onChange={e => setAmountDraft(e.target.value)}
                      onBlur={commitDraft}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className="offer-num col-start-1 row-start-1 w-full min-w-[2ch] bg-transparent outline-none p-0 border-0 border-b-2 border-dashed border-transparent focus:border-blue-600"
                    />
                  </span>
                  <span>M</span>
                </label>
              )}
            </div>

            {salaryLockedNote ? (
              <div className="mt-2 text-xs text-red-600">{salaryLockedNote}</div>
            ) : (
              <>
                <input
                  type="range"
                  className="offer-range mt-1"
                  min={minSalary}
                  max={maxSalary}
                  step={0.1}
                  value={offerSalary}
                  aria-label="Offer salary slider"
                  style={{ '--offer-fill': `${fillPct}%` } as React.CSSProperties}
                  onChange={e => { onSalaryChange(clamp(parseFloat(e.target.value))); setPreset(null); }}
                />
                <div className="flex items-center justify-between text-xs text-[var(--text-sec)]">
                  <span>Asking <span className="font-bold text-amber-600">${round1(ask)}M</span></span>
                  {capAfter !== undefined && (
                    <span>
                      Cap after:{' '}
                      <span className={`font-bold ${capAfter >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {capAfter < 0 ? '−' : ''}${Math.abs(capAfter).toFixed(1)}M
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={preset === p.id}
                      onClick={() => { onSalaryChange(clamp(ask * p.pct)); setPreset(p.id); }}
                      className={`h-11 flex-1 min-w-0 rounded-lg text-sm font-bold tabular-nums touch-manipulation transition-colors ${
                        preset === p.id ? 'bg-blue-600/15 text-blue-600' : 'bg-[var(--surface-2)] text-[var(--text)] active:bg-[var(--border)]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="offer-label mt-4 mb-2">Years</div>
            <div className="flex gap-2">
              {Array.from({ length: maxYears }, (_, i) => i + 1).map(yr => (
                <button
                  key={yr}
                  type="button"
                  aria-pressed={offerYears === yr}
                  onClick={() => onYearsChange(yr)}
                  className={`h-11 flex-1 min-w-0 rounded-lg text-sm font-bold tabular-nums touch-manipulation transition-colors ${
                    offerYears === yr ? 'bg-[var(--text)] text-[var(--surface)]' : 'bg-[var(--surface-2)] text-[var(--text)] active:bg-[var(--border)]'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            {note && <div className="mt-3 text-xs">{note}</div>}

            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs text-[var(--text-sec)]">Interest</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className={`h-full rounded-full transition-all ${interest.bar}`} style={{ width: `${interestPct}%` }} />
              </div>
              <span className={`text-xs font-bold ${interest.text}`}>{interest.label}</span>
            </div>

            <button
              type="button"
              onClick={onSubmit}
              className="mt-4 h-12 w-full rounded-lg bg-blue-600 text-white text-[15px] font-bold shadow-sm shadow-blue-600/30 active:bg-blue-700 touch-manipulation"
            >
              Make Offer · {offerYears} yr{offerYears > 1 ? 's' : ''} / ${(offerSalary * offerYears).toFixed(1)}M
            </button>
            <div className="mt-1 flex items-center justify-between">
              <button type="button" onClick={onWalkAway} className="h-10 px-1 text-sm font-semibold text-[var(--text-sec)]">
                {walkAwayLabel}
              </button>
              {onPlayerCard && (
                <button type="button" onClick={onPlayerCard} className="h-10 px-1 text-sm font-semibold text-blue-600">
                  Player card →
                </button>
              )}
            </div>
            {children}
          </>
        )}
      </div>
    </div>
  );
}
