'use client';

import { useState, useCallback } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { GameResult, PlayerStats } from '@/types';

type Tab = 'scoring' | 'passing' | 'rushing' | 'receiving' | 'defense';
type SortDir = 'asc' | 'desc';

interface BoxScoreModalProps {
  game: GameResult | null;
  onClose: () => void;
  onPlayerClick?: (id: string) => void;
}

export function BoxScoreModal({ game, onClose, onPlayerClick }: BoxScoreModalProps) {
  const { teams, players } = useGameStore();
  const [tab, setTab] = useState<Tab>('scoring');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  if (!game || !game.played) return null;

  const homeTeam = teams.find(t => t.id === game.homeTeamId);
  const awayTeam = teams.find(t => t.id === game.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const teamColor = (id: string) => teams.find(t => t.id === id)?.primaryColor ?? '#666';
  const teamAbbr = (id: string) => teams.find(t => t.id === id)?.abbreviation ?? '???';

  const homeWon = game.homeScore > game.awayScore;

  const getTeamPlayerStats = (teamId: string) => {
    return Object.entries(game.playerStats)
      .map(([pid, stats]) => {
        const player = players.find(p => p.id === pid);
        if (!player) return null;
        if (player.teamId !== teamId) return null;
        return { player, stats };
      })
      .filter(Boolean) as { player: typeof players[0]; stats: Partial<PlayerStats> }[];
  };

  const homePlayerStats = getTeamPlayerStats(game.homeTeamId);
  const awayPlayerStats = getTeamPlayerStats(game.awayTeamId);

  const scoringPlays = game.scoringPlays ?? [];
  const quarters = [1, 2, 3, 4, 5].filter(q => scoringPlays.some(sp => sp.quarter === q));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'scoring', label: 'Scoring' },
    { key: 'passing', label: 'Passing' },
    { key: 'rushing', label: 'Rushing' },
    { key: 'receiving', label: 'Receiving' },
    { key: 'defense', label: 'Defense' },
  ];

  const PlayerName = ({ player }: { player: typeof players[0] }) => (
    <button
      onClick={() => onPlayerClick?.(player.id)}
      className="font-semibold hover:text-blue-600 transition-colors text-left"
    >
      {player.firstName[0]}. {player.lastName}
    </button>
  );

  function renderStatTable(
    teamStats: { player: typeof players[0]; stats: Partial<PlayerStats> }[],
    teamId: string,
    columns: { key: string; label: string; getValue: (s: Partial<PlayerStats>) => number | string }[],
    filterFn: (s: Partial<PlayerStats>) => boolean,
  ) {
    let filtered = teamStats.filter(ps => filterFn(ps.stats));

    // Apply sorting
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey);
      if (col) {
        filtered = [...filtered].sort((a, b) => {
          const aVal = col.getValue(a.stats);
          const bVal = col.getValue(b.stats);
          const aNum = typeof aVal === 'number' ? aVal : parseFloat(String(aVal)) || 0;
          const bNum = typeof bVal === 'number' ? bVal : parseFloat(String(bVal)) || 0;
          return sortDir === 'desc' ? bNum - aNum : aNum - bNum;
        });
      }
    } else {
      // Default sort by first column descending
      filtered.sort((a, b) => {
        const aVal = columns[0]?.getValue(a.stats);
        const bVal = columns[0]?.getValue(b.stats);
        return (typeof bVal === 'number' ? bVal : 0) - (typeof aVal === 'number' ? aVal : 0);
      });
    }

    if (filtered.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: teamColor(teamId) }} />
          <span className="text-xs font-bold uppercase text-[var(--text-sec)]">{teamAbbr(teamId)}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-sec)] text-xs">
              <th className="text-left pb-1">Player</th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className="text-right pb-1 px-1 cursor-pointer hover:text-[var(--text)] transition-colors select-none"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-0.5 text-blue-600">{sortDir === 'desc' ? '↓' : '↑'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(ps => (
              <tr key={ps.player.id} className="border-t border-[var(--border)]">
                <td className="py-1">
                  <PlayerName player={ps.player} />
                  <span className="text-xs text-[var(--text-sec)] ml-1">{ps.player.position}</span>
                </td>
                {columns.map(col => (
                  <td key={col.key} className="py-1 text-right px-1 font-mono text-xs">
                    {col.getValue(ps.stats)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const passingCols = [
    { key: 'cmp', label: 'CMP', getValue: (s: Partial<PlayerStats>) => `${s.passCompletions ?? 0}/${s.passAttempts ?? 0}` },
    { key: 'yds', label: 'YDS', getValue: (s: Partial<PlayerStats>) => s.passYards ?? 0 },
    { key: 'td', label: 'TD', getValue: (s: Partial<PlayerStats>) => s.passTDs ?? 0 },
    { key: 'int', label: 'INT', getValue: (s: Partial<PlayerStats>) => s.interceptions ?? 0 },
  ];

  const rushingCols = [
    { key: 'att', label: 'ATT', getValue: (s: Partial<PlayerStats>) => s.rushAttempts ?? 0 },
    { key: 'yds', label: 'YDS', getValue: (s: Partial<PlayerStats>) => s.rushYards ?? 0 },
    { key: 'td', label: 'TD', getValue: (s: Partial<PlayerStats>) => s.rushTDs ?? 0 },
    { key: 'fum', label: 'FUM', getValue: (s: Partial<PlayerStats>) => s.fumbles ?? 0 },
  ];

  const receivingCols = [
    { key: 'rec', label: 'REC', getValue: (s: Partial<PlayerStats>) => `${s.receptions ?? 0}/${s.targets ?? 0}` },
    { key: 'yds', label: 'YDS', getValue: (s: Partial<PlayerStats>) => s.receivingYards ?? 0 },
    { key: 'td', label: 'TD', getValue: (s: Partial<PlayerStats>) => s.receivingTDs ?? 0 },
  ];

  const defenseCols = [
    { key: 'tkl', label: 'TKL', getValue: (s: Partial<PlayerStats>) => s.tackles ?? 0 },
    { key: 'tfl', label: 'TFL', getValue: (s: Partial<PlayerStats>) => s.tacklesForLoss ?? 0 },
    { key: 'sck', label: 'SCK', getValue: (s: Partial<PlayerStats>) => s.sacks ?? 0 },
    { key: 'int', label: 'INT', getValue: (s: Partial<PlayerStats>) => s.defensiveINTs ?? 0 },
    { key: 'pd', label: 'PD', getValue: (s: Partial<PlayerStats>) => s.passDeflections ?? 0 },
    { key: 'ff', label: 'FF', getValue: (s: Partial<PlayerStats>) => s.forcedFumbles ?? 0 },
  ];

  const isPlayoffGame = game.week === 99;

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="lg">
      {/* Score header */}
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <div className="text-xs text-[var(--text-sec)] text-center mb-3">
          {isPlayoffGame ? `Playoffs · Season ${game.season}` : `Week ${game.week} · Season ${game.season}`}
        </div>
        <div className="flex items-center justify-center gap-8">
          {/* Away team */}
          <div className={`flex items-center gap-3 ${!homeWon ? '' : 'opacity-60'}`}>
            <div className="text-right">
              <div className="text-xs text-[var(--text-sec)]">{awayTeam.city}</div>
              <div className="font-bold">{awayTeam.name}</div>
            </div>
            <TeamLogo abbreviation={awayTeam.abbreviation} primaryColor={awayTeam.primaryColor} secondaryColor={awayTeam.secondaryColor} logoUrl={awayTeam.logoUrl} size="lg" />
          </div>

          {/* Score */}
          <div className="flex items-center gap-3">
            <span className={`text-4xl font-black ${!homeWon ? 'text-[var(--text)]' : 'text-[var(--text-sec)]'}`}>
              {game.awayScore}
            </span>
            <span className="text-[var(--text-sec)] text-lg">-</span>
            <span className={`text-4xl font-black ${homeWon ? 'text-[var(--text)]' : 'text-[var(--text-sec)]'}`}>
              {game.homeScore}
            </span>
          </div>

          {/* Home team */}
          <div className={`flex items-center gap-3 ${homeWon ? '' : 'opacity-60'}`}>
            <TeamLogo abbreviation={homeTeam.abbreviation} primaryColor={homeTeam.primaryColor} secondaryColor={homeTeam.secondaryColor} logoUrl={homeTeam.logoUrl} size="lg" />
            <div>
              <div className="text-xs text-[var(--text-sec)]">{homeTeam.city}</div>
              <div className="font-bold">{homeTeam.name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSortKey(null); }}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
              tab === t.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-6 py-4">
        {tab === 'scoring' && (
          <div>
            {scoringPlays.length === 0 ? (
              <div className="text-sm text-[var(--text-sec)] text-center py-6">
                No scoring play data available for this game.
              </div>
            ) : (
              <div className="space-y-4">
                {quarters.map(q => (
                  <div key={q}>
                    <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">
                      {q <= 4 ? `${q}${q === 1 ? 'st' : q === 2 ? 'nd' : q === 3 ? 'rd' : 'th'} Quarter` : 'Overtime'}
                    </div>
                    <div className="space-y-1.5">
                      {scoringPlays.filter(sp => sp.quarter === q).map((sp, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-sm bg-[var(--surface-2)] rounded-lg px-3 py-2"
                        >
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white shrink-0"
                            style={{ backgroundColor: teamColor(sp.teamId) }}
                          >
                            {teamAbbr(sp.teamId)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{sp.description}</div>
                          </div>
                          {sp.timeLeft && (
                            <div className="text-[10px] text-[var(--text-sec)] font-mono shrink-0">
                              {sp.timeLeft}
                            </div>
                          )}
                          <div className="text-xs font-mono font-bold shrink-0">
                            {teamAbbr(game.awayTeamId)} {sp.score[0]} – {sp.score[1]} {teamAbbr(game.homeTeamId)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'passing' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              {renderStatTable(awayPlayerStats, game.awayTeamId, passingCols, s => (s.passAttempts ?? 0) > 0)}
            </div>
            <div>
              {renderStatTable(homePlayerStats, game.homeTeamId, passingCols, s => (s.passAttempts ?? 0) > 0)}
            </div>
          </div>
        )}

        {tab === 'rushing' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              {renderStatTable(awayPlayerStats, game.awayTeamId, rushingCols, s => (s.rushAttempts ?? 0) > 0)}
            </div>
            <div>
              {renderStatTable(homePlayerStats, game.homeTeamId, rushingCols, s => (s.rushAttempts ?? 0) > 0)}
            </div>
          </div>
        )}

        {tab === 'receiving' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              {renderStatTable(awayPlayerStats, game.awayTeamId, receivingCols, s => (s.targets ?? 0) > 0)}
            </div>
            <div>
              {renderStatTable(homePlayerStats, game.homeTeamId, receivingCols, s => (s.targets ?? 0) > 0)}
            </div>
          </div>
        )}

        {tab === 'defense' && (
          <div className="grid grid-cols-2 gap-6">
            <div>
              {renderStatTable(awayPlayerStats, game.awayTeamId, defenseCols, s => (s.tackles ?? 0) + (s.sacks ?? 0) + (s.defensiveINTs ?? 0) > 0)}
            </div>
            <div>
              {renderStatTable(homePlayerStats, game.homeTeamId, defenseCols, s => (s.tackles ?? 0) + (s.sacks ?? 0) + (s.defensiveINTs ?? 0) > 0)}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
