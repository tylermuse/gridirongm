'use client';

import { OwnerObjectivesCard } from '@/components/owner/OwnerObjectivesCard';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Dashboard owner objectives — the season's generated owner goals with live
 * progress bars + the job-security chip (lib/owner/objectives.ts). Replaces the
 * old static three-item checklist (playoffs / .500 / tax).
 */
export function OwnerObjectives({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  return <OwnerObjectivesCard league={league} team={team} className="mb-6" />;
}
