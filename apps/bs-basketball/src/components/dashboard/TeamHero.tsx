'use client';

import { TeamLogo } from '@/components/ui/TeamLogo';
import { conferenceOf, divisionOf, teamCap, fmtMoney } from '@/lib/dashboard/summary';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Team-themed dashboard hero (P0.2). A full-width panel in the team's colors
 * with the logo, "City Name", a record badge, conference/division, and a
 * cap-room chip — replacing the generic orange "BS Hoops" wordmark.
 */
export function TeamHero({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const cap = teamCap(league, team);
  const room = cap.capRoom;
  const capChip = room >= 0
    ? { text: `${fmtMoney(room)} room`, color: '#10b981' }
    : { text: `${fmtMoney(-room)} over`, color: '#f97316' };
  const { wins, losses } = team.record;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 sm:p-7 mb-6"
      style={{
        background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.primaryColor} 55%, color-mix(in srgb, ${team.primaryColor}, #000 32%) 100%)`,
      }}
    >
      {/* Faint diagonal court-line texture in the secondary color. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.06,
          backgroundImage: `repeating-linear-gradient(135deg, ${team.secondaryColor} 0, ${team.secondaryColor} 2px, transparent 2px, transparent 22px)`,
        }}
      />
      <div className="relative flex flex-wrap items-center gap-5">
        <div className="shrink-0 rounded-2xl bg-black/15 p-2">
          <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xl" />
        </div>
        <div className="min-w-0 flex-1 text-white">
          <div className="text-[11px] uppercase tracking-[0.25em] text-white/70">You manage</div>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {team.city} {team.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-bold tabular-nums">{wins}–{losses}</span>
            <span className="text-white/80">{conferenceOf(team)} · {divisionOf(team)}</span>
            <span className="rounded-full px-2.5 py-0.5 font-bold" style={{ background: `color-mix(in srgb, ${capChip.color} 30%, transparent)`, color: '#fff' }}>
              {capChip.text}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
