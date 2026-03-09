'use client';

import { useState, useMemo } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { generateDebateTranscript, COMMENTATORS } from '@/lib/engine/debate';
import { generateWeeklyRecap } from '@/lib/engine/recap';
import { DebateBubble } from '@/components/game/DebateBubble';
import type { RecapSegmentData, Player, Team } from '@/types';

const SEGMENT_TYPE_LABELS: Record<RecapSegmentData['type'], string> = {
  headline: 'Headlines',
  upset: 'Upset',
  comeback: 'Comeback',
  blowout: 'Blowout',
  shootout: 'Shootout',
  defensive: 'Defensive Battle',
  performance: 'Performance',
  streak: 'Streak Watch',
  rivalry: 'Division Rivalry',
  milestone: 'Milestone',
  summary: 'League Summary',
};

const SEGMENT_TYPE_COLORS: Record<RecapSegmentData['type'], string> = {
  headline: 'bg-blue-600',
  upset: 'bg-red-500',
  comeback: 'bg-orange-500',
  blowout: 'bg-purple-600',
  shootout: 'bg-amber-500',
  defensive: 'bg-emerald-600',
  performance: 'bg-yellow-500',
  streak: 'bg-indigo-500',
  rivalry: 'bg-rose-600',
  milestone: 'bg-teal-500',
  summary: 'bg-gray-500',
};

type TabId = 'recap' | 'show';

const PLAYOFF_ROUND_LABELS: Record<number, string> = {
  101: 'Wild Card',
  102: 'Divisional',
  103: 'Conf. Championship',
  104: 'Championship',
};

function weekLabel(week: number): string {
  if (week >= 101) return PLAYOFF_ROUND_LABELS[week] ?? `Playoff Rd ${week - 100}`;
  return `Week ${week}`;
}

/* ─── Main Page ─── */

export default function RecapPage() {
  const { weeklyRecaps, teams, players, season, week, playoffBracket, schedule } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('show');

  // Generate playoff recaps on the fly if they're missing from weeklyRecaps
  // (handles saves from before playoff recap generation was added)
  const allRecaps = useMemo(() => {
    const recaps = [...weeklyRecaps];
    if (!playoffBracket) return recaps;

    // Find played playoff matchups grouped by round
    const playedMatchups = playoffBracket.filter(m => m.winnerId);
    if (playedMatchups.length === 0) return recaps;

    const rounds = [...new Set(playedMatchups.map(m => m.round))];
    for (const round of rounds) {
      const playoffWeek = 100 + round;
      // Skip if we already have a recap for this playoff round
      if (recaps.some(r => r.season === season && r.week === playoffWeek)) continue;

      // Find matching game results in schedule
      const roundMatchups = playedMatchups.filter(m => m.round === round);
      const matchupIds = new Set(roundMatchups.map(m => m.id));
      const gameResults = schedule.filter(g => matchupIds.has(g.id) && g.played);

      if (gameResults.length > 0) {
        const recap = generateWeeklyRecap(gameResults, teams, players, season, playoffWeek);
        recaps.push(recap);
      }
    }
    return recaps;
  }, [weeklyRecaps, playoffBracket, schedule, teams, players, season]);

  // Get recaps for current season, sorted by week descending
  const seasonRecaps = allRecaps
    .filter(r => r.season === season)
    .sort((a, b) => b.week - a.week);

  // Default to most recent week
  const activeWeek = selectedWeek ?? (seasonRecaps.length > 0 ? seasonRecaps[0].week : null);
  const activeRecap = seasonRecaps.find(r => r.week === activeWeek);

  // Generate debate transcript (memoized — derived from recap data)
  const debateTranscript = useMemo(() => {
    if (!activeRecap) return null;
    return generateDebateTranscript(activeRecap, teams, players);
  }, [activeRecap, teams, players]);

  function teamAbbr(teamId: string) {
    return teams.find(t => t.id === teamId)?.abbreviation ?? '???';
  }

  function teamColor(teamId: string) {
    return teams.find(t => t.id === teamId)?.primaryColor ?? '#666';
  }

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'show', label: 'The Show', icon: '🎬' },
    { id: 'recap', label: 'Recap', icon: '📋' },
  ];

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🎙️</span>
            <h2 className="text-2xl font-black">Gridiron Tonight</h2>
          </div>
          <p className="text-sm text-[var(--text-sec)]">
            Your weekly recap show — storylines, standout performances, and league trends.
          </p>
        </div>

        {/* Week Selector + Tab Toggle */}
        {seasonRecaps.length > 0 ? (
          <>
            {/* Week buttons */}
            <div className="flex gap-1 flex-wrap mb-4">
              {seasonRecaps.map(recap => (
                <button
                  key={recap.week}
                  onClick={() => setSelectedWeek(recap.week)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    activeWeek === recap.week
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {weekLabel(recap.week)}
                </button>
              ))}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'show' ? (
              /* ─── The Show (Debate) ─── */
              debateTranscript && debateTranscript.topics.length > 0 ? (
                <div className="space-y-6">
                  {/* Show header */}
                  <div className="text-center mb-4">
                    <div className="text-sm font-bold text-[var(--text-sec)] uppercase tracking-widest">
                      Season {debateTranscript.season} — {weekLabel(debateTranscript.week)}
                    </div>
                    <div className="flex items-center justify-center gap-4 mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{COMMENTATORS.stats.avatar}</span>
                        <div className="text-left">
                          <div className="text-xs font-bold">{COMMENTATORS.stats.name}</div>
                          <div className="text-[10px] text-blue-600">{COMMENTATORS.stats.title}</div>
                        </div>
                      </div>
                      <span className="text-lg font-black text-[var(--text-sec)]">vs</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{COMMENTATORS.hottake.avatar}</span>
                        <div className="text-left">
                          <div className="text-xs font-bold">{COMMENTATORS.hottake.name}</div>
                          <div className="text-[10px] text-red-600">{COMMENTATORS.hottake.title}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Topics */}
                  {debateTranscript.topics.map((topic, topicIdx) => (
                    <div key={topicIdx}>
                      {/* Topic divider */}
                      <div className="mb-4">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{topic.icon}</span>
                          <h4 className="text-sm font-bold flex-1">{topic.headline}</h4>
                          {/* Team badges */}
                          <div className="flex gap-1">
                            {topic.teamIds.slice(0, 3).map(tid => (
                              <span
                                key={tid}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: teamColor(tid) + '33', color: teamColor(tid) }}
                              >
                                {teamAbbr(tid)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {/* Context line — stat lines, scores, etc. */}
                        {topic.context && (
                          <p className="text-xs text-[var(--text-sec)] mt-1.5 ml-8 leading-relaxed italic">
                            {topic.context}
                          </p>
                        )}
                      </div>

                      {/* Exchanges */}
                      <div className="space-y-3 pl-2 pr-2">
                        {topic.exchanges.map((exchange, exIdx) => (
                          <DebateBubble
                            key={exIdx}
                            exchange={exchange}
                            onPlayerClick={setSelectedPlayerId}
                            playerIds={topic.playerIds}
                            players={players}
                            teams={teams}
                          />
                        ))}
                      </div>

                      {/* Separator between topics (not after last) */}
                      {topicIdx < debateTranscript.topics.length - 1 && (
                        <div className="border-b border-[var(--border)] mt-6" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-[var(--text-sec)]">
                  <div className="text-4xl mb-4">😴</div>
                  <p>Nothing to debate this week — even Marcus and Tony agreed it was boring.</p>
                </div>
              )
            ) : (
              /* ─── Classic Recap ─── */
              activeRecap && activeRecap.segments.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold">Season {activeRecap.season} — {weekLabel(activeRecap.week)} Recap</h3>
                    <span className="text-xs text-[var(--text-sec)] bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
                      {activeRecap.segments.length} stories
                    </span>
                  </div>

                  {activeRecap.segments.map((segment, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                    >
                      {/* Segment header */}
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <span className="text-lg">{segment.icon}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded-full ${SEGMENT_TYPE_COLORS[segment.type]}`}>
                          {SEGMENT_TYPE_LABELS[segment.type]}
                        </span>
                        {/* Team badges */}
                        <div className="flex gap-1 ml-auto">
                          {segment.teamIds.slice(0, 3).map(tid => (
                            <span
                              key={tid}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: teamColor(tid) + '33', color: teamColor(tid) }}
                            >
                              {teamAbbr(tid)}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Segment content */}
                      <div className="p-4">
                        <h4 className="text-sm font-bold mb-1">{segment.title}</h4>
                        <p className="text-sm text-[var(--text-sec)] leading-relaxed">{segment.body}</p>

                        {/* Player links */}
                        {segment.playerIds.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {segment.playerIds.map(pid => {
                              const p = players.find(pl => pl.id === pid);
                              if (!p) return null;
                              return (
                                <button
                                  key={pid}
                                  onClick={() => setSelectedPlayerId(pid)}
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  <span
                                    className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[8px] font-bold"
                                    style={{ backgroundColor: teamColor(p.teamId ?? '') }}
                                  >
                                    {p.firstName[0]}
                                  </span>
                                  {p.firstName} {p.lastName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 text-[var(--text-sec)]">
                  No storylines detected for this week.
                </div>
              )
            )}
          </>
        ) : (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🎙️</div>
            <p className="text-[var(--text-sec)]">
              No recaps yet. Simulate games to generate your weekly show!
            </p>
            <p className="text-xs text-[var(--text-sec)] mt-2">
              Season {season} · Week {week}
            </p>
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
