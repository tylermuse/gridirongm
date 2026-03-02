'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

type StatCategory = 'passYards' | 'rushYards' | 'receivingYards' | 'passTDs' | 'rushTDs' | 'sacks' | 'defensiveINTs' | 'tackles';
type Tab = 'leaders' | 'teams' | 'power';

const STAT_OPTIONS: { key: StatCategory; label: string }[] = [
  { key: 'passYards', label: 'Passing Yards' },
  { key: 'rushYards', label: 'Rushing Yards' },
  { key: 'receivingYards', label: 'Receiving Yards' },
  { key: 'passTDs', label: 'Passing TDs' },
  { key: 'rushTDs', label: 'Rushing TDs' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'defensiveINTs', label: 'Interceptions' },
  { key: 'tackles', label: 'Tackles' },
];

function ratingColor(val: number) {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  return 'text-[var(--text-sec)]';
}

export default function StatsPage() {
  const { players, teams, userTeamId, week } = useGameStore();
  const [tab, setTab] = useState<Tab>('leaders');
  const [statCat, setStatCat] = useState<StatCategory>('passYards');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const activePlayers = players.filter(p => !p.retired && p.teamId && p.stats.gamesPlayed >= 1);

  // League Leaders
  const leaders = [...activePlayers]
    .filter(p => p.stats[statCat] != null)
    .sort((a, b) => (b.stats[statCat] as number) - (a.stats[statCat] as number))
    .slice(0, 20);

  // Team stats
  const teamStats = teams.map(t => {
    const teamPlayers = players.filter(p => p.teamId === t.id);
    return {
      team: t,
      pf: t.record.pointsFor,
      pa: t.record.pointsAgainst,
      diff: t.record.pointsFor - t.record.pointsAgainst,
    };
  }).sort((a, b) => b.pf - a.pf);

  // Power rankings
  const powerRankings = teams.map(t => {
    const wp = t.record.wins / Math.max(1, t.record.wins + t.record.losses);
    const diff = (t.record.pointsFor - t.record.pointsAgainst) / Math.max(1, t.record.wins + t.record.losses);
    const score = wp * 60 + diff * 0.25;
    return { team: t, score, wp };
  }).sort((a, b) => b.score - a.score);

  const tabs = [
    { key: 'leaders' as Tab, label: 'League Leaders' },
    { key: 'teams' as Tab, label: 'Team Stats' },
    { key: 'power' as Tab, label: 'Power Rankings' },
  ];

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-black mb-6">Stats & Standings</h2>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-6 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-xs rounded font-medium transition-colors ${
                tab === t.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* League Leaders */}
        {tab === 'leaders' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>League Leaders</CardTitle>
                <select
                  value={statCat}
                  onChange={e => setStatCat(e.target.value as StatCategory)}
                  className="text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text)]"
                >
                  {STAT_OPTIONS.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-center pb-3 w-8">#</th>
                  <th className="text-left pb-3">Player</th>
                  <th className="text-center pb-3">Pos</th>
                  <th className="text-center pb-3">Team</th>
                  <th className="text-center pb-3">G</th>
                  <th className="text-right pb-3 pr-2">{STAT_OPTIONS.find(o => o.key === statCat)?.label}</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((p, i) => {
                  const t = teams.find(t => t.id === p.teamId);
                  const isUser = p.teamId === userTeamId;
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-[var(--border)] ${isUser ? 'bg-blue-500/5' : 'hover:bg-[var(--surface-2)]'} transition-colors`}
                    >
                      <td className="py-2.5 text-center text-[var(--text-sec)] text-xs">{i + 1}</td>
                      <td className="py-2.5">
                        <button onClick={() => setSelectedPlayerId(p.id)} className={`font-semibold hover:text-blue-400 transition-colors ${isUser ? 'text-blue-300' : ''}`}>
                          {p.firstName} {p.lastName}
                        </button>
                        {isUser && <span className="ml-1 text-xs text-blue-400">(You)</span>}
                      </td>
                      <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                      <td className="py-2.5 text-center">
                        {t && (
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: t.primaryColor + '33', color: t.primaryColor }}
                          >
                            {t.abbreviation}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-[var(--text-sec)]">{p.stats.gamesPlayed}</td>
                      <td className="py-2.5 text-right pr-2 font-mono font-bold">
                        {(p.stats[statCat] as number ?? 0).toFixed(statCat === 'sacks' ? 1 : 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Team Stats */}
        {tab === 'teams' && (
          <Card>
            <CardHeader><CardTitle>Team Statistics</CardTitle></CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-center pb-3 w-8">#</th>
                  <th className="text-left pb-3">Team</th>
                  <th className="text-center pb-3">W</th>
                  <th className="text-center pb-3">L</th>
                  <th className="text-center pb-3">PF</th>
                  <th className="text-center pb-3">PA</th>
                  <th className="text-right pb-3 pr-2">DIFF</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((ts, i) => {
                  const isUser = ts.team.id === userTeamId;
                  return (
                    <tr
                      key={ts.team.id}
                      className={`border-t border-[var(--border)] ${isUser ? 'bg-blue-500/5 font-semibold' : 'hover:bg-[var(--surface-2)]'} transition-colors`}
                    >
                      <td className="py-2.5 text-center text-[var(--text-sec)] text-xs">{i + 1}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded text-[9px] font-black text-white flex items-center justify-center"
                            style={{ backgroundColor: ts.team.primaryColor }}
                          >
                            {ts.team.abbreviation.slice(0, 3)}
                          </div>
                          <span className={isUser ? 'text-blue-400' : ''}>{ts.team.city} {ts.team.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">{ts.team.record.wins}</td>
                      <td className="py-2.5 text-center">{ts.team.record.losses}</td>
                      <td className="py-2.5 text-center font-mono">{ts.pf}</td>
                      <td className="py-2.5 text-center font-mono">{ts.pa}</td>
                      <td className={`py-2.5 text-right pr-2 font-mono ${ts.diff > 0 ? 'text-green-400' : ts.diff < 0 ? 'text-red-400' : ''}`}>
                        {ts.diff > 0 ? '+' : ''}{ts.diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Power Rankings */}
        {tab === 'power' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Power Rankings</CardTitle>
                <span className="text-xs text-[var(--text-sec)]">Week {week} · Record 60% + Diff 25% + Form 15%</span>
              </div>
            </CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                  <th className="text-center pb-3 w-8">#</th>
                  <th className="text-left pb-3">Team</th>
                  <th className="text-center pb-3">Record</th>
                  <th className="text-center pb-3">Win%</th>
                  <th className="text-right pb-3 pr-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {powerRankings.map((pr, i) => {
                  const isUser = pr.team.id === userTeamId;
                  return (
                    <tr
                      key={pr.team.id}
                      className={`border-t border-[var(--border)] ${isUser ? 'bg-blue-500/5 font-semibold' : 'hover:bg-[var(--surface-2)]'} transition-colors`}
                    >
                      <td className="py-2.5 text-center">
                        <span className={`text-sm font-bold ${i < 3 ? 'text-amber-400' : 'text-[var(--text-sec)]'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded text-[9px] font-black text-white flex items-center justify-center"
                            style={{ backgroundColor: pr.team.primaryColor }}
                          >
                            {pr.team.abbreviation.slice(0, 3)}
                          </div>
                          <span className={isUser ? 'text-blue-400' : ''}>{pr.team.city} {pr.team.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-center text-[var(--text-sec)]">
                        {pr.team.record.wins}-{pr.team.record.losses}
                      </td>
                      <td className="py-2.5 text-center font-mono">{(pr.wp * 100).toFixed(1)}%</td>
                      <td className="py-2.5 text-right pr-2 font-mono text-[var(--text-sec)]">
                        {pr.score.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
