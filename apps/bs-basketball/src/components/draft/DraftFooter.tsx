'use client';

import { TeamLogo } from '@/components/ui/TeamLogo';
import { positionNeeds, TARGET_DEPTH } from '@/lib/draft/needs';
import { ratingBgColor } from '@/lib/ui/ratingColor';
import type { DraftState } from '@/lib/draft';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * Your Needs + Recent Picks (parity §D): a two-up footer under the board. Needs
 * shows the user team's depth per position vs target; Recent Picks lists the
 * latest selections league-wide.
 */
const POS_ORDER: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export function DraftFooter({
  league, draft, teamById, playerById,
}: {
  league: { userTeamId: string | null };
  draft: DraftState;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
}) {
  const userTeam = league.userTeamId ? teamById.get(league.userTeamId) : undefined;
  const needs = userTeam
    ? positionNeeds(userTeam, playerById).slice().sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))
    : [];

  const recent = draft.picks
    .filter(p => p.prospectId)
    .slice(-8)
    .reverse();

  return (
    <div className="grid md:grid-cols-2 gap-4 mt-4">
      {userTeam && (
        <section className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-bold text-sm mb-3">Your Needs</h2>
          <div className="space-y-1.5">
            {needs.map(n => (
              <div key={n.position} className="flex items-center gap-2 text-xs">
                <span className="w-6 font-bold">{n.position}</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div className={ratingBgColor(100 - n.needScore)} style={{ width: `${Math.max(8, 100 - n.needScore)}%`, height: '100%' }} />
                </div>
                <span className="tabular-nums text-[var(--text-sec)] w-10 text-right">{n.count}/{TARGET_DEPTH}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-bold text-sm mb-3">Recent Picks</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--text-sec)]">No picks yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recent.map(p => {
              const t = teamById.get(p.teamId);
              const pr = p.prospectId ? playerById[p.prospectId] : null;
              if (!pr) return null;
              return (
                <li key={p.overall} className="flex items-center gap-2">
                  {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />}
                  <span className="font-semibold">#{p.overall} {t?.abbreviation}</span>
                  <span className="truncate">— {pr.lastName}</span>
                  <span className="ml-auto text-xs text-[var(--text-sec)] tabular-nums">{pr.sportData.position} · {pr.ratings.overall} · Pot {pr.development.potential}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
