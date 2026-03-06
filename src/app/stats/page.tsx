'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';

type StatCategory = 'passYards' | 'rushYards' | 'receivingYards' | 'passTDs' | 'rushTDs' | 'sacks' | 'defensiveINTs' | 'tackles' | 'tacklesForLoss' | 'passDeflections' | 'receptions' | 'forcedFumbles';
type Tab = 'leaders' | 'teams' | 'power';

const STAT_OPTIONS: { key: StatCategory; label: string }[] = [
  { key: 'passYards', label: 'Passing Yards' },
  { key: 'rushYards', label: 'Rushing Yards' },
  { key: 'receivingYards', label: 'Receiving Yards' },
  { key: 'receptions', label: 'Receptions' },
  { key: 'passTDs', label: 'Passing TDs' },
  { key: 'rushTDs', label: 'Rushing TDs' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'tacklesForLoss', label: 'Tackles for Loss' },
  { key: 'sacks', label: 'Sacks' },
  { key: 'defensiveINTs', label: 'Interceptions' },
  { key: 'passDeflections', label: 'Pass Deflections' },
  { key: 'forcedFumbles', label: 'Forced Fumbles' },
];

function ratingColor(val: number) {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  return 'text-[var(--text-sec)]';
}

export default function StatsPage() {
  const { players, teams, schedule, userTeamId, week } = useGameStore();
  const [tab, setTab] = useState<Tab>('leaders');
  const [statCat, setStatCat] = useState<StatCategory>('passYards');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);

  const activePlayers = players.filter(p => !p.retired && p.teamId && p.stats.gamesPlayed >= 1);

  // League Leaders
  const leaders = [...activePlayers]
    .filter(p => p.stats[statCat] != null)
    .sort((a, b) => (b.stats[statCat] as number) - (a.stats[statCat] as number))
    .slice(0, 20);

  // Compute opponent pass/rush yards allowed per game
  // For each played game, sum each team's per-game player stats from the schedule
  // (playerStats may be stripped for non-user games after reload, so fall back to player aggregate stats)
  const teamOffYards = new Map<string, { passYards: number; rushYards: number }>();
  for (const p of players) {
    if (!p.teamId || p.retired) continue;
    const entry = teamOffYards.get(p.teamId) ?? { passYards: 0, rushYards: 0 };
    entry.passYards += p.stats.passYards ?? 0;
    entry.rushYards += p.stats.rushYards ?? 0;
    teamOffYards.set(p.teamId, entry);
  }

  // Build opponent yards map: for each team, sum the offensive yards of all opponents they faced
  const oppYardsMap = new Map<string, { oppPassYards: number; oppRushYards: number; games: number }>();
  for (const t of teams) {
    const gp = Math.max(1, t.record.wins + t.record.losses + t.record.ties);
    // Sum opponents' per-game average yards for each game this team played
    const teamGames = schedule.filter(g => g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id));
    let oppPass = 0, oppRush = 0;
    for (const g of teamGames) {
      const oppId = g.homeTeamId === t.id ? g.awayTeamId : g.homeTeamId;
      const oppOff = teamOffYards.get(oppId);
      if (oppOff) {
        const oppTeam = teams.find(tm => tm.id === oppId);
        const oppGP = Math.max(1, (oppTeam?.record.wins ?? 0) + (oppTeam?.record.losses ?? 0) + (oppTeam?.record.ties ?? 0));
        oppPass += oppOff.passYards / oppGP;
        oppRush += oppOff.rushYards / oppGP;
      }
    }
    oppYardsMap.set(t.id, { oppPassYards: oppPass, oppRushYards: oppRush, games: gp });
  }

  // Team stats
  const teamStats = teams.map(t => {
    const opp = oppYardsMap.get(t.id);
    const gp = opp?.games ?? Math.max(1, t.record.wins + t.record.losses);
    return {
      team: t,
      pf: t.record.pointsFor,
      pa: t.record.pointsAgainst,
      diff: t.record.pointsFor - t.record.pointsAgainst,
      oppPassYPG: opp ? opp.oppPassYards / gp : 0,
      oppRushYPG: opp ? opp.oppRushYards / gp : 0,
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
                        <button onClick={() => setSelectedPlayerId(p.id)} className={`font-semibold hover:text-blue-600 transition-colors ${isUser ? 'text-blue-600' : ''}`}>
                          {p.firstName} {p.lastName}
                        </button>
                        {isUser && <span className="ml-1 text-xs text-blue-600">(You)</span>}
                      </td>
                      <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                      <td className="py-2.5 text-center">
                        {t && (
                          <button
                            onClick={() => setViewTeamId(t.id)}
                            className="text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: t.primaryColor + '33', color: t.primaryColor }}
                          >
                            {t.abbreviation}
                          </button>
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
                  <th className="text-center pb-3">DIFF</th>
                  <th className="text-center pb-3">Opp Pass YDS/G</th>
                  <th className="text-right pb-3 pr-2">Opp Rush YDS/G</th>
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
                        <button onClick={() => setViewTeamId(ts.team.id)} className="flex items-center gap-2 hover:text-blue-600 transition-colors">
                          <div
                            className="w-5 h-5 rounded text-[9px] font-black text-white flex items-center justify-center"
                            style={{ backgroundColor: ts.team.primaryColor }}
                          >
                            {ts.team.abbreviation.slice(0, 3)}
                          </div>
                          <span className={isUser ? 'text-blue-600' : ''}>{ts.team.city} {ts.team.name}</span>
                        </button>
                      </td>
                      <td className="py-2.5 text-center">{ts.team.record.wins}</td>
                      <td className="py-2.5 text-center">{ts.team.record.losses}</td>
                      <td className="py-2.5 text-center font-mono">{ts.pf}</td>
                      <td className="py-2.5 text-center font-mono">{ts.pa}</td>
                      <td className={`py-2.5 text-center font-mono ${ts.diff > 0 ? 'text-green-600' : ts.diff < 0 ? 'text-red-600' : ''}`}>
                        {ts.diff > 0 ? '+' : ''}{ts.diff}
                      </td>
                      <td className="py-2.5 text-center font-mono">{ts.oppPassYPG.toFixed(1)}</td>
                      <td className="py-2.5 text-right pr-2 font-mono">{ts.oppRushYPG.toFixed(1)}</td>
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
                        <span className={`text-sm font-bold ${i < 3 ? 'text-amber-600' : 'text-[var(--text-sec)]'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button onClick={() => setViewTeamId(pr.team.id)} className="flex items-center gap-2 hover:text-blue-600 transition-colors">
                          <div
                            className="w-5 h-5 rounded text-[9px] font-black text-white flex items-center justify-center"
                            style={{ backgroundColor: pr.team.primaryColor }}
                          >
                            {pr.team.abbreviation.slice(0, 3)}
                          </div>
                          <span className={isUser ? 'text-blue-600' : ''}>{pr.team.city} {pr.team.name}</span>
                        </button>
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
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
