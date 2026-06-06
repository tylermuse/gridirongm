'use client';

import { buildDraftRecap, buildTeamDraftGrades } from '@/lib/draft/recap';
import type { BasketballLeagueState } from '@/lib/persistence/db';

/**
 * Inline Draft Recap — Team Grades (parity §E). Shown on the draft page once the
 * draft completes: every front office graded on the value it got vs. where it
 * picked, best to worst, with each team's best pick. The user row is highlighted.
 */
export function DraftRecapInline({ league }: { league: BasketballLeagueState }) {
  const recap = buildDraftRecap(league);
  if (!recap) return null;
  const grades = buildTeamDraftGrades(recap);
  if (grades.length === 0) return null;

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mt-4" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2.5 font-bold text-sm border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>🎬 Draft Recap — Team Grades</h2>
      <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
        <table className="w-full text-sm sticky-col">
          <thead className="text-[var(--text-sec)] text-[10px] uppercase tracking-wider sticky top-0" style={{ background: 'var(--surface)' }}>
            <tr>
              <th className="w-8 text-center py-2">#</th>
              <th className="text-left">Team</th>
              <th className="text-center">Grade</th>
              <th className="text-center">Picks</th>
              <th className="text-left pr-3">Best pick</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g, i) => (
              <tr key={g.teamId} className="border-t" style={{ borderColor: 'var(--border)', background: g.isUser ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}>
                <td className="text-center text-xs tabular-nums text-[var(--text-sec)] py-2">{i + 1}</td>
                <td className="font-semibold truncate">{g.teamLabel}{g.isUser && <span className="ml-1 text-[10px] font-bold" style={{ color: 'var(--accent)' }}>YOU</span>}</td>
                <td className="text-center text-lg font-black" style={{ color: g.gradeColor }}>{g.grade}</td>
                <td className="text-center tabular-nums text-[var(--text-sec)]">{g.pickCount}</td>
                <td className="pr-3 text-xs truncate">
                  {g.bestPick ? <>{g.bestPick.player.firstName[0]}. {g.bestPick.player.lastName} <span className="text-[var(--text-sec)]">#{g.bestPick.overall}</span></> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
