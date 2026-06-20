'use client';

import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { isScouted } from '@/lib/scouting';
import { ratingColor, getContrastText } from '@/lib/ui/ratingColor';
import type { DraftState } from '@/lib/draft';
import type { BasketballPlayer } from '@bs/sport-basketball';

/**
 * A single Best Available / Best Fit / Your Scouts Say card in the On-The-Clock
 * band (parity §A.1). Shows the prospect with position rank, projected draft
 * rank, and an OVR (unscouted) or upside Range (scouted), plus an optional
 * Draft Now button when the user is on the clock.
 */
export function ProspectCard({
  label, subtitle, prospect, draft, teamColor, projRank, posRank, canDraft, onOpen, onDraft,
}: {
  label: string;
  subtitle?: string;
  prospect: BasketballPlayer;
  draft: DraftState;
  teamColor: string;
  /** Overall board rank (1 = top prospect). */
  projRank: number;
  /** Rank among same-position prospects. */
  posRank: number;
  canDraft: boolean;
  onOpen: () => void;
  onDraft?: () => void;
}) {
  const r = prospect.ratings;
  const scouted = isScouted(draft, prospect.id);
  const pos = prospect.sportData.position;

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]">{label}</div>
        {subtitle && <div className="text-[10px] text-[var(--text-sec)] opacity-70">{subtitle}</div>}
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <PlayerAvatar firstName={prospect.firstName} lastName={prospect.lastName} primaryColor={teamColor} secondaryColor="#fff" photoUrl={prospect.sportData.photoUrl} size="lg" />
          <div className="min-w-0">
            <button onClick={onOpen} className="font-bold text-base truncate hover:text-[var(--accent)] text-left block max-w-full">
              {prospect.firstName} {prospect.lastName}
            </button>
            <div className="text-xs text-[var(--text-sec)]">Age {prospect.age} · {prospect.sportData.starTier}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0" style={{ background: teamColor, color: getContrastText(teamColor) }}>{pos}</span>
          <Stat caption={`${pos} Rk`} value={`#${posRank}`} />
          <Stat caption="Proj" value={`#${projRank}`} />
          {scouted ? (
            <Stat caption="Range" value={`${r.overall}–${prospect.development.potential}`} valueClass="text-[var(--accent-alt)]" />
          ) : (
            <Stat caption="OVR" value={String(r.overall)} valueClass={ratingColor(r.overall)} />
          )}
        </div>

        {canDraft && onDraft && (
          <button onClick={onDraft} className="mt-3 w-full py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold">
            Draft Now
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ caption, value, valueClass }: { caption: string; value: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-black tabular-nums ${valueClass ?? ''}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60">{caption}</div>
    </div>
  );
}
