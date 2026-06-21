'use client';

import { useState } from 'react';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Chip } from '@/components/ui/Chip';
import { ratingColor } from '@/lib/ui/ratingColor';
import type { DraftState } from '@/lib/draft';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * Draft Results (parity §C): the running board — every pick with team + the
 * player taken, filterable by team and (in all-teams view) by round. The user's
 * picks are highlighted; the slot on the clock reads "On the clock".
 */
export function DraftResultsCard({
  league, draft, teamById, playerById,
}: {
  league: { userTeamId: string | null };
  draft: DraftState;
  teamById: Map<string, BasketballTeam>;
  playerById: Record<string, BasketballPlayer>;
}) {
  const [team, setTeam] = useState<string>('ALL');
  const [round, setRound] = useState<1 | 2 | 'ALL'>('ALL');

  const teamsForFilter = [...teamById.values()].sort((a, b) => {
    if (a.id === league.userTeamId) return -1;
    if (b.id === league.userTeamId) return 1;
    return `${a.city}`.localeCompare(b.city);
  });

  const picks = draft.picks.filter(p => {
    if (team !== 'ALL' && p.teamId !== team) return false;
    if (team === 'ALL' && round !== 'ALL' && p.round !== round) return false;
    return true;
  });

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2.5 border-b flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
        <h2 className="font-bold text-sm mr-1">Draft Results</h2>
        <select value={team} onChange={e => setTeam(e.target.value)} className="h-8 px-2 text-xs rounded border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
          <option value="ALL">All Teams</option>
          {teamsForFilter.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTeamId ? ' (You)' : ''}</option>)}
        </select>
        {team === 'ALL' && (
          <div className="flex gap-1">
            {(['ALL', 1, 2] as const).map(r => (
              <button key={r} onClick={() => setRound(r)} className="px-2 py-1 text-xs rounded font-medium" style={round === r ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-sec)' }}>
                {r === 'ALL' ? 'All' : `R${r}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FEAT-3 + STYLE-2: bump the scroll window so a clean number of full
          rows is visible. The previous 28rem cap clipped the 11th row mid-cell
          (Tyler's screenshot of the half-visible OKC #12). 40rem now shows ~14
          clean rows with thead, matches the eyeline of the Draft Board next to
          it without either table dead-ending the user before the lottery picks
          finish. */}
      <div className="overflow-x-auto max-h-[40rem] overflow-y-auto">
        <table className="w-full text-sm sticky-col">
          <thead className="text-[var(--text-sec)] text-[10px] uppercase tracking-wider sticky top-0" style={{ background: 'var(--surface)' }}>
            <tr>
              <th className="w-10 text-center py-2">Pick</th>
              <th className="text-left">Team</th>
              <th className="text-left">Player</th>
              <th className="text-center">Pos</th>
              <th className="text-center pr-3">OVR</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p, i) => {
              const t = teamById.get(p.teamId);
              const prospect = p.prospectId ? playerById[p.prospectId] : null;
              const isCurrent = !draft.complete && p.overall === draft.picks[draft.currentPick]?.overall;
              const isUser = p.teamId === league.userTeamId;
              return (
                <tr
                  key={p.overall}
                  className="border-t"
                  style={{
                    borderColor: 'var(--border)',
                    background: isCurrent ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : isUser ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : undefined,
                    animation: p.isLottery ? 'bs-fade-in 0.4s ease both' : undefined,
                    animationDelay: p.isLottery ? `${i * 40}ms` : undefined,
                  }}
                >
                  <td className="text-center tabular-nums text-xs text-[var(--text-sec)] py-2">{p.overall}</td>
                  <td className="py-2">
                    {/* FEAT-3: surface the original team for traded picks
                        with a "via XXX" tag. Mirrors the lottery board treatment
                        added in #282 — gives the user immediate context for
                        a pick that doesn't match the team's own seed. */}
                    {(() => {
                      const origId = p.originalTeamId ?? p.teamId;
                      const orig = origId !== p.teamId ? teamById.get(origId) : null;
                      return (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {t && <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="xs" />}
                          <span className="text-xs font-semibold">{t?.abbreviation}</span>
                          {orig && <span className="text-[10px] text-[var(--text-sec)]">(via {orig.abbreviation})</span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2">
                    {prospect
                      ? <span className="font-semibold truncate">{prospect.firstName[0]}. {prospect.lastName}</span>
                      : isCurrent ? <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>On the clock</span>
                      : <span className="text-xs opacity-30">—</span>}
                  </td>
                  <td className="text-center">{prospect ? <Chip>{prospect.sportData.position}</Chip> : <span className="opacity-30">—</span>}</td>
                  <td className={`text-center pr-3 font-bold tabular-nums ${prospect ? ratingColor(prospect.ratings.overall) : ''}`}>{prospect ? prospect.ratings.overall : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
