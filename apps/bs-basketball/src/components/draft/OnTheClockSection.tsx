'use client';

import { TeamLogo } from '@/components/ui/TeamLogo';
import { Button } from '@/components/ui/Button';
import { ProspectCard } from '@/components/draft/ProspectCard';
import { currentSlot, recommendedProspectId } from '@/lib/draft';
import { positionNeeds, needBonus } from '@/lib/draft/needs';
import { getContrastText } from '@/lib/ui/ratingColor';
import type { DraftState } from '@/lib/draft';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * The On-The-Clock hero (parity §A): a vertically-joined stack of bands sharing
 * the on-clock team's color — clock header (timer when it's you), roster Needs,
 * the Best Available / Best Fit / Your Scouts Say cards, and a Next-Pick preview
 * (or Draft Complete). The #1 thing that makes the draft read like football's.
 */
export function OnTheClockSection({
  league, draft, teamById, loading,
  onSimPick, onSimToUser, onSimAll, onOpenTrade, onSelectProspect, onDraftProspect,
}: {
  league: BasketballLeagueState;
  draft: DraftState;
  teamById: Map<string, BasketballTeam>;
  loading: boolean;
  onSimPick: () => void;
  onSimToUser: () => void;
  onSimAll: () => void;
  onOpenTrade: () => void;
  onSelectProspect: (id: string) => void;
  onDraftProspect: (id: string) => void;
}) {
  const players = league.players as Record<string, BasketballPlayer>;
  const slot = currentSlot(draft);

  if (!slot) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 text-center">
        <div className="font-bold text-green-600">🏁 Draft Complete!</div>
      </div>
    );
  }

  const onClock = teamById.get(slot.teamId);
  if (!onClock) return null;
  const userOnClock = slot.teamId === league.userTeamId;
  const teamColor = onClock.primaryColor;
  const secondaryColor = onClock.secondaryColor;

  // Board ordering for ranks + the three feature cards.
  const pool = draft.poolIds.map(id => players[id]).filter(Boolean) as BasketballPlayer[];
  const board = [...pool].sort((a, b) => b.ratings.overall - a.ratings.overall);
  const projRank = new Map<string, number>();
  const posRank = new Map<string, number>();
  const posSeen: Record<string, number> = {};
  board.forEach((p, i) => {
    projRank.set(p.id, i + 1);
    const pos = p.sportData.position;
    posSeen[pos] = (posSeen[pos] ?? 0) + 1;
    posRank.set(p.id, posSeen[pos]);
  });

  const needs = positionNeeds(onClock, players);
  const bestAvailable = board[0] ?? null;
  const bestFit = pool.length
    ? [...pool].sort((a, b) =>
        (b.ratings.overall + needBonus(needs, b.sportData.position) * 0.3) -
        (a.ratings.overall + needBonus(needs, a.sportData.position) * 0.3))[0]
    : null;
  const recId = userOnClock ? recommendedProspectId(league, draft) : null;
  const recommended = recId ? players[recId] : null;

  const nextSlot = draft.picks[draft.currentPick + 1] ?? null;
  const nextTeam = nextSlot ? teamById.get(nextSlot.teamId) : null;

  const card = (label: string, subtitle: string | undefined, p: BasketballPlayer, color: string) => (
    <ProspectCard
      label={label} subtitle={subtitle} prospect={p} draft={draft} teamColor={color}
      projRank={projRank.get(p.id) ?? board.length} posRank={posRank.get(p.id) ?? 0}
      canDraft={userOnClock} onOpen={() => onSelectProspect(p.id)} onDraft={() => onDraftProspect(p.id)}
    />
  );

  return (
    <div className="space-y-0">
      {/* Band A — clock header */}
      <div
        className="rounded-t-xl border border-[var(--border)] px-5 py-4"
        style={userOnClock
          ? { background: `linear-gradient(135deg, ${teamColor}, ${secondaryColor})`, borderColor: 'transparent' }
          : { borderLeft: `4px solid ${teamColor}` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xs sm:text-sm font-black text-white shrink-0 ${userOnClock ? 'ring-4 ring-white/30 shadow-lg scale-110' : ''}`}
              style={{ background: userOnClock ? 'rgba(255,255,255,0.2)' : teamColor }}
            >
              {onClock.abbreviation}
            </span>
            <div className="min-w-0">
              {userOnClock ? (
                <div className="font-black text-xl sm:text-2xl flex items-center gap-2" style={{ color: getContrastText(teamColor), textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                  <span className="animate-pulse">⏰</span> YOU&apos;RE ON THE CLOCK
                </div>
              ) : (
                <div className="font-black text-base sm:text-lg">On The Clock</div>
              )}
              <div className="text-xs sm:text-sm truncate" style={userOnClock ? { color: getContrastText(teamColor) } : undefined}>{onClock.city} {onClock.name}</div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs sm:text-sm font-bold mb-1" style={userOnClock ? { color: getContrastText(teamColor) } : undefined}>Round {slot.round}, Pick {slot.overall}</div>
            <div className="flex flex-wrap gap-2 items-center">
              {!userOnClock && <Button size="sm" variant="secondary" disabled={loading} onClick={onSimPick} className="flex-1 min-w-[80px]">Sim Pick</Button>}
              {!userOnClock && league.userTeamId && <Button size="sm" variant="secondary" disabled={loading} onClick={onSimToUser} className="flex-1 min-w-[80px]">Sim to My Pick</Button>}
              <Button size="sm" variant="ghost" disabled={loading} onClick={onSimAll} className="flex-1 min-w-[80px]">Auto-Draft All</Button>
              <button onClick={onOpenTrade} className="flex-1 min-w-[80px] rounded-md px-2 py-1 text-sm font-bold text-white" style={{ background: 'var(--accent-alt)' }}>Trade Pick</button>
            </div>
          </div>
        </div>
        {userOnClock && (
          <div className="h-1 bg-white/20 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-white/60 rounded-full" style={{ animation: 'shrink 30s linear forwards' }} />
          </div>
        )}
      </div>

      {/* Band B — needs */}
      <div className="border-x border-[var(--border)] px-5 py-3 bg-[var(--surface)] flex flex-wrap items-center gap-2" style={{ borderLeft: `4px solid ${teamColor}` }}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]">Needs</span>
        {needs.filter(n => n.needScore > 0).slice(0, 4).map(n => (
          <span key={n.position} className="min-h-[28px] min-w-[36px] px-2 inline-flex items-center justify-center rounded-md text-xs font-bold"
            style={{
              background: n.needScore >= 40 ? 'color-mix(in srgb, #dc2626 16%, transparent)' : n.needScore >= 25 ? 'color-mix(in srgb, #d97706 16%, transparent)' : 'var(--surface-2)',
              color: n.needScore >= 40 ? '#dc2626' : n.needScore >= 25 ? '#d97706' : 'var(--text-sec)',
            }}>
            {n.position}
          </span>
        ))}
        <span className="ml-auto text-xs text-[var(--text-sec)]">{onClock.record.wins}-{onClock.record.losses}</span>
      </div>

      {/* Band C — best available / fit / scouts (hidden when complete) */}
      {!draft.complete && (
        <div className="border-x border-[var(--border)] px-5 py-4 bg-[var(--surface-2)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" style={{ borderLeft: `4px solid ${teamColor}` }}>
          {bestAvailable && card('Best Available', 'Top of the board', bestAvailable, '#6b7280')}
          {bestFit && card('Best Fit', 'Need-weighted', bestFit, teamColor)}
          {recommended && card('Your Scouts Say', 'Staff recommendation', recommended, 'var(--accent-alt)')}
        </div>
      )}

      {/* Band D — next pick / complete */}
      {draft.complete ? (
        <div className="rounded-b-xl border border-[var(--border)] px-5 py-3 bg-[var(--surface)] text-center font-bold text-green-600">Draft Complete!</div>
      ) : nextTeam ? (
        <div className="rounded-b-xl border border-[var(--border)] px-5 py-3 bg-[var(--surface)] flex items-center gap-2 text-sm" style={{ borderLeft: `4px solid ${nextTeam.primaryColor}` }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-sec)]">Next Pick</span>
          <TeamLogo abbreviation={nextTeam.abbreviation} primaryColor={nextTeam.primaryColor} secondaryColor={nextTeam.secondaryColor} size="xs" />
          <span className="font-semibold truncate">{nextTeam.city} {nextTeam.name}</span>
          <span className="ml-auto text-xs text-[var(--text-sec)]">Round {nextSlot!.round}, Pick {nextSlot!.overall}</span>
        </div>
      ) : (
        <div className="rounded-b-xl border border-[var(--border)] px-5 py-2 bg-[var(--surface)]" style={{ borderLeft: `4px solid ${teamColor}` }} />
      )}
    </div>
  );
}
