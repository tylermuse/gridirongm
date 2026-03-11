'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Button } from '@/components/ui/Button';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/game/PlayerModal';
import { gradeColor, gradeBgColor } from '@/lib/engine/draftGrades';
import {
  computeAllTeamGrades,
  findHighlights,
  generatePressQuotes,
  type TeamDraftReport,
  type PickRecapEntry,
} from '@/lib/engine/draftRecap';
import type { Player, Team } from '@/types';

/* ─── Collapsible Section ─── */

function Section({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-lg">{icon}</span>
        <h3 className="text-base font-bold flex-1">{title}</h3>
        {badge && (
          <span className="text-xs bg-[var(--surface-2)] text-[var(--text-sec)] px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
        <span className="text-[var(--text-sec)] text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

/* ─── Grade Circle ─── */

function GradeCircle({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-16 h-16 text-2xl' : size === 'md' ? 'w-10 h-10 text-base' : 'w-7 h-7 text-xs';
  return (
    <div className={`${dims} rounded-full ${gradeBgColor(grade)} text-white font-black flex items-center justify-center shrink-0`}>
      {grade}
    </div>
  );
}

/* ─── Main Page ─── */

export default function DraftRecapPage() {
  const router = useRouter();
  const { draftResults, players, teams, userTeamId, season, phase, advanceToFreeAgency } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  // Compute all grades
  const allReports = useMemo(
    () => computeAllTeamGrades(draftResults, players, teams),
    [draftResults, players, teams],
  );

  const userReport = useMemo(
    () => allReports.find(r => r.teamId === userTeamId) ?? null,
    [allReports, userTeamId],
  );

  const highlights = useMemo(() => findHighlights(allReports), [allReports]);

  const pressQuotes = useMemo(() => {
    if (!userReport) return [];
    return generatePressQuotes(userReport.picks, players, teams, season);
  }, [userReport, players, teams, season]);

  const userTeam = teamMap.get(userTeamId ?? '');

  if (draftResults.length === 0) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-16">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-[var(--text-sec)]">No draft results available.</p>
          <p className="text-xs text-[var(--text-sec)] mt-2">
            Complete a draft to see the recap.
          </p>
        </div>
      </GameShell>
    );
  }

  const userRank = allReports.findIndex(r => r.teamId === userTeamId) + 1;

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">📋</span>
            <h2 className="text-2xl font-black">Draft Recap</h2>
          </div>
          <p className="text-sm text-[var(--text-sec)]">
            Season {season} Draft Results — Grades, analysis, and post-draft pressers.
          </p>
        </div>

        {/* ─── 1. Your Draft Class ─── */}
        {userReport && userReport.pickCount > 0 && (
          <Card>
            <div className="flex items-center gap-4">
              <GradeCircle grade={userReport.grade} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {userTeam && (
                    <TeamLogo
                      abbreviation={userTeam.abbreviation}
                      primaryColor={userTeam.primaryColor}
                      secondaryColor={userTeam.secondaryColor}
                      size="sm"
                    />
                  )}
                  <h3 className="text-lg font-bold">Your Draft Class</h3>
                  <span className="text-xs bg-[var(--surface-2)] text-[var(--text-sec)] px-2 py-0.5 rounded-full">
                    Ranked #{userRank} of {teams.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-[var(--text-sec)]">
                  <span>{userReport.pickCount} pick{userReport.pickCount !== 1 ? 's' : ''}</span>
                  <span>Avg Value: {userReport.avgValue.toFixed(1)}</span>
                  <span>Need Fit: {userReport.needFit}%</span>
                  <span>Rounds 1–7</span>
                </div>
              </div>
            </div>
            {/* Share to social */}
            <div className="flex gap-2 mt-3">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just drafted my class for the ${userTeam?.city} ${userTeam?.name}! Grade: ${userReport.grade} (Ranked #${userRank} of ${teams.length}) 🏈 Play Gridiron GM free:`)}&url=${encodeURIComponent('https://gmgridiron.com?ref=twitter')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-sec)] hover:text-[var(--text)] bg-[var(--surface-2)] hover:bg-[var(--border)] rounded-lg transition-colors"
              >
                Share on X
              </a>
              <a
                href={`https://reddit.com/submit?title=${encodeURIComponent(`My ${userTeam?.city} ${userTeam?.name} draft class got a ${userReport.grade} grade (#${userRank} of ${teams.length}) — Gridiron GM`)}&url=${encodeURIComponent('https://gmgridiron.com?ref=reddit')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-sec)] hover:text-[var(--text)] bg-[var(--surface-2)] hover:bg-[var(--border)] rounded-lg transition-colors"
              >
                Share on Reddit
              </a>
            </div>
          </Card>
        )}

        {/* ─── 2. Pick Recap ─── */}
        {userReport && userReport.picks.length > 0 && (
          <Section title="Pick Recap" icon="🎯" defaultOpen badge={`${userReport.picks.length} picks`}>
            <div className="space-y-2">
              {userReport.picks.map(pk => {
                const player = playerMap.get(pk.playerId);
                if (!player) return null;
                return (
                  <div
                    key={pk.overallPick}
                    className="flex items-center gap-3 rounded-lg bg-[var(--surface-2)] px-3 py-2"
                  >
                    <GradeCircle grade={pk.grade} size="sm" />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setSelectedPlayerId(player.id)}
                        className="text-sm font-bold text-blue-600 hover:underline truncate block"
                      >
                        {player.firstName} {player.lastName}
                      </button>
                      <div className="text-[11px] text-[var(--text-sec)] flex flex-wrap gap-x-2">
                        <span>Pick #{pk.overallPick} (R{pk.round} · P{pk.pickInRound})</span>
                        <span>{player.position}</span>
                        <span>{player.ratings.overall} OVR</span>
                        {player.college && <span>{player.college}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold ${pk.valueDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {pk.valueDelta >= 0 ? '+' : ''}{pk.valueDelta}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── 3. Post-Draft Pressers ─── */}
        {pressQuotes.length > 0 && (
          <Section title="Post-Draft Pressers" icon="🎤" defaultOpen badge={`${pressQuotes.length} quotes`}>
            <div className="space-y-3">
              {pressQuotes.map((q, i) => {
                const player = playerMap.get(q.playerId);
                return (
                  <div key={i} className="flex gap-3">
                    <span className="text-lg shrink-0 mt-0.5">🗣️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] leading-relaxed italic">
                        &ldquo;{q.quote}&rdquo;
                      </p>
                      <p className="text-[11px] text-[var(--text-sec)] mt-1">
                        — GM on drafting{' '}
                        {player && (
                          <button
                            onClick={() => setSelectedPlayerId(player.id)}
                            className="text-blue-600 hover:underline"
                          >
                            {player.firstName} {player.lastName}
                          </button>
                        )}{' '}
                        (Pick #{q.pickNumber})
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── 4. Post-Draft Highlights ─── */}
        {(highlights.biggestSteal || highlights.biggestReach) && (
          <Section title="Post-Draft Highlights" icon="⭐" defaultOpen>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {highlights.biggestSteal && (() => {
                const p = playerMap.get(highlights.biggestSteal!.playerId);
                const t = teamMap.get(highlights.biggestSteal!.teamId);
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Biggest Steal</div>
                    <button
                      onClick={() => setSelectedPlayerId(p.id)}
                      className="text-sm font-bold text-blue-600 hover:underline"
                    >
                      {p.firstName} {p.lastName}
                    </button>
                    <div className="text-xs text-[var(--text-sec)] mt-0.5">
                      Pick #{highlights.biggestSteal!.overallPick} · {p.position} · {p.ratings.overall} OVR
                      {t && ` · ${t.abbreviation}`}
                    </div>
                    <div className="text-sm font-bold text-green-600 mt-1">
                      +{highlights.biggestSteal!.valueDelta} over expected
                    </div>
                  </div>
                );
              })()}
              {highlights.biggestReach && (() => {
                const p = playerMap.get(highlights.biggestReach!.playerId);
                const t = teamMap.get(highlights.biggestReach!.teamId);
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Biggest Reach</div>
                    <button
                      onClick={() => setSelectedPlayerId(p.id)}
                      className="text-sm font-bold text-blue-600 hover:underline"
                    >
                      {p.firstName} {p.lastName}
                    </button>
                    <div className="text-xs text-[var(--text-sec)] mt-0.5">
                      Pick #{highlights.biggestReach!.overallPick} · {p.position} · {p.ratings.overall} OVR
                      {t && ` · ${t.abbreviation}`}
                    </div>
                    <div className="text-sm font-bold text-red-600 mt-1">
                      {highlights.biggestReach!.valueDelta} below expected
                    </div>
                  </div>
                );
              })()}
            </div>
          </Section>
        )}

        {/* ─── 5. All Team Rankings ─── */}
        <Section title="All Team Rankings" icon="🏅" defaultOpen badge={`${teams.length} teams`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-left pb-2 pl-2">#</th>
                  <th className="text-left pb-2">Team</th>
                  <th className="text-center pb-2">Grade</th>
                  <th className="text-center pb-2">Picks</th>
                  <th className="text-center pb-2 hidden sm:table-cell">Need Fit</th>
                </tr>
              </thead>
              <tbody>
                {allReports.map((report, idx) => {
                  const t = teamMap.get(report.teamId);
                  if (!t) return null;
                  const isUser = report.teamId === userTeamId;
                  const isExpanded = expandedTeam === report.teamId;

                  return (
                    <tr
                      key={report.teamId}
                      className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)] transition-colors ${isUser ? 'bg-blue-500/10' : ''}`}
                      onClick={() => setExpandedTeam(isExpanded ? null : report.teamId)}
                    >
                      <td className="py-2 pl-2 text-[var(--text-sec)] text-xs align-top">{idx + 1}</td>
                      <td className="py-2 align-top">
                        <div className="flex items-center gap-2">
                          <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-medium text-sm truncate ${isUser ? 'text-blue-600' : ''}`}>
                                {t.abbreviation}
                              </span>
                              {isUser && (
                                <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded">
                                  YOU
                                </span>
                              )}
                            </div>
                            {/* Expanded picks */}
                            {isExpanded && report.picks.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {report.picks.map(pk => {
                                  const pl = playerMap.get(pk.playerId);
                                  if (!pl) return null;
                                  return (
                                    <div key={pk.overallPick} className="flex items-center gap-2 text-[11px]">
                                      <span className={`font-bold ${gradeColor(pk.grade)}`}>{pk.grade}</span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedPlayerId(pl.id); }}
                                        className="text-blue-600 hover:underline truncate"
                                      >
                                        R{pk.round}P{pk.pickInRound} {pl.firstName} {pl.lastName}
                                      </button>
                                      <span className="text-[var(--text-sec)]">{pl.position} {pl.ratings.overall}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`py-2 text-center font-black text-lg align-top ${gradeColor(report.grade)}`}>
                        {report.grade}
                      </td>
                      <td className="py-2 text-center text-[var(--text-sec)] align-top">{report.pickCount}</td>
                      <td className="py-2 text-center text-[var(--text-sec)] align-top hidden sm:table-cell">{report.needFit}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Advance to Free Agency CTA — shown when draft phase hasn't advanced yet */}
        {phase === 'draft' && (
          <div className="text-center pt-2 pb-4">
            <Button
              onClick={() => {
                advanceToFreeAgency();
                router.push('/free-agency');
              }}
              size="lg"
            >
              Advance to Free Agency →
            </Button>
          </div>
        )}
      </div>

      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
