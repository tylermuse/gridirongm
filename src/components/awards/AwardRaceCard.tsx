'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { AwardWinnerBadge } from './AwardWinnerBadge';
import type { AwardRaceEntry, CoachAwardRaceEntry } from '@/lib/engine/awards';
import type { Team, Player, Coach } from '@/types';

type Entry = AwardRaceEntry | CoachAwardRaceEntry;

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
  entries: Entry[];
  teams: Team[];
  players: Player[];
  /** Render the top entry with a 🏆 (used after season-end). */
  showWinnerCrown?: boolean;
}

function isPlayerEntry(e: Entry): e is AwardRaceEntry {
  return (e as AwardRaceEntry).playerId !== undefined;
}

export function AwardRaceCard({ emoji, title, subtitle, entries, teams, players, showWinnerCrown }: Props) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2"><span>{emoji}</span> {title}</span>
          </CardTitle>
        </CardHeader>
        <div className="px-4 pb-4 text-sm text-[var(--text-sec)] text-center py-6">
          No qualified candidates yet.
        </div>
      </Card>
    );
  }

  const topScore = Math.max(...entries.map(e => e.score));
  const minScore = Math.min(...entries.map(e => e.score));
  const range = Math.max(1, topScore - minScore);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2"><span>{emoji}</span> {title}</span>
        </CardTitle>
        {subtitle && <div className="text-[10px] text-[var(--text-sec)] mt-0.5">{subtitle}</div>}
      </CardHeader>
      <div className="px-3 pb-3 space-y-1.5">
        {entries.map((e, i) => {
          const team = teams.find(t => t.id === e.teamId);
          const isPlayer = isPlayerEntry(e);
          let label = '';
          let positionLabel = '';
          let href: string | null = null;
          if (isPlayer) {
            const p = players.find(pl => pl.id === e.playerId);
            label = p ? `${p.firstName} ${p.lastName}` : 'Unknown';
            positionLabel = e.position;
            href = p ? `/player/${p.id}` : null;
          } else {
            const ce = e as CoachAwardRaceEntry;
            const coach: Coach | undefined = team?.coaches?.find(c => c.id === ce.coachId);
            label = coach ? `${coach.firstName} ${coach.lastName}` : 'Unknown HC';
            positionLabel = ce.role;
          }
          // 0-100 normalized bar width relative to the leader
          const barPct = topScore <= 0
            ? 0
            : Math.max(4, Math.round(((e.score - minScore) / range) * 100));
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <div className="w-5 shrink-0 text-xs font-bold text-[var(--text-sec)] tabular-nums text-right">
                {i + 1}
              </div>
              {team && (
                <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {href ? (
                    <Link href={href} className="text-sm font-bold truncate hover:text-blue-600 transition-colors">
                      {label}
                    </Link>
                  ) : (
                    <span className="text-sm font-bold truncate">{label}</span>
                  )}
                  {showWinnerCrown && i === 0 && <AwardWinnerBadge />}
                  <span className="text-[10px] text-[var(--text-sec)] shrink-0">{positionLabel}</span>
                  {team && <span className="text-[10px] text-[var(--text-sec)] shrink-0 hidden sm:inline">{team.abbreviation}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-blue-500/60'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[var(--text-sec)] tabular-nums shrink-0 w-10 text-right">
                    {Math.round(e.score)}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-sec)] truncate mt-0.5">
                  {e.keyStatLine}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
