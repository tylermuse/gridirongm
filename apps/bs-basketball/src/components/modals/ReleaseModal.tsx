'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { releasePreview } from '@/lib/roster/release';
import { fmtMoney } from '@/lib/dashboard/summary';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * Release modal with a cap-aware dead-money preview (parity audit #7).
 *
 * Releasing a guaranteed player leaves the money on the books as dead cap. The
 * user chooses a straight waive (full remaining hit this year) or a stretch
 * (total spread over 2·years + 1 seasons to soften the annual charge).
 */
export function ReleaseModal({ playerId, onClose, onReleased }: { playerId: string | null; onClose: () => void; onReleased?: (id: string) => void }) {
  const { league, releasePlayer, loading } = useLeagueStore();
  const player = playerId && league ? (league.players[playerId as keyof typeof league.players] as BasketballPlayer | undefined) ?? null : null;
  const season = league?.currentSeason ?? 2026;
  const preview = useMemo(() => (player ? releasePreview(player, season) : null), [player, season]);
  const [stretch, setStretch] = useState(false);

  if (!player || !preview) return <Modal open={false} onClose={onClose}><span /></Modal>;

  const guaranteed = preview.remainingGuaranteed;
  const thisYear = stretch ? preview.stretchThisYear : preview.waiveThisYear;

  async function confirm() {
    const id = player!.id;
    const ok = await releasePlayer(id, stretch);
    if (ok) { onReleased?.(id); onClose(); }
  }

  return (
    <Modal open={!!playerId} onClose={onClose} title={`Release ${player.firstName} ${player.lastName}`} maxWidthClass="max-w-md">
      <div className="space-y-4 p-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--text-sec)]">{player.sportData.position} · Age {player.age} · {player.ratings.overall} OVR</span>
          <span className="text-[var(--text-sec)]">{preview.years}y guaranteed left</span>
        </div>

        {guaranteed > 0 ? (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
              <span className="opacity-70">Releasing him keeps </span>
              <span className="font-bold">{fmtMoney(guaranteed)}</span>
              <span className="opacity-70"> of guaranteed money on your books as dead cap.</span>
            </div>

            <div className="space-y-2">
              <ChoiceRow
                active={!stretch}
                onClick={() => setStretch(false)}
                label="Waive"
                detail={`${fmtMoney(preview.waiveThisYear)} dead cap this season`}
              />
              <ChoiceRow
                active={stretch}
                onClick={() => setStretch(true)}
                label={'Waive & stretch'}
                detail={`${fmtMoney(preview.stretchThisYear)}/yr over ${preview.stretchYears} seasons`}
              />
            </div>

            <div className="flex justify-between text-sm border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <span className="opacity-70">Dead cap this season</span>
              <span className="font-bold tabular-nums" style={{ color: thisYear > 0 ? '#f59e0b' : '#10b981' }}>{fmtMoney(thisYear)}</span>
            </div>
          </>
        ) : (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
            No guaranteed money remaining — this is a clean release with no dead cap.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={loading} onClick={() => void confirm()}>
            {loading ? 'Working…' : 'Confirm release'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChoiceRow({ active, onClick, label, detail }: { active: boolean; onClick: () => void; label: string; detail: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors"
      style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)' }}
    >
      <span className="flex items-center gap-2">
        <span className="inline-block h-3.5 w-3.5 rounded-full border" style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', background: active ? 'var(--accent)' : 'transparent' }} />
        <span className="font-semibold">{label}</span>
      </span>
      <span className="text-xs text-[var(--text-sec)]">{detail}</span>
    </button>
  );
}
