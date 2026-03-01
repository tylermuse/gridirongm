'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BoxScore } from '@/components/game/BoxScore';
import type { GameResult } from '@/types';

export default function SchedulePage() {
  const { teams, schedule, userTeamId, players } = useGameStore();
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const teamGames = schedule
    .filter(g => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)
    .sort((a, b) => a.week - b.week);

  function teamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }

  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.primaryColor ?? '#666';
  }

  function teamFullName(id: string) {
    const t = teams.find(t => t.id === id);
    return t ? `${t.city} ${t.name}` : '???';
  }

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-black mb-6">Schedule</h2>

        <div className="space-y-2">
          {teamGames.map(game => {
            const isHome = game.homeTeamId === userTeamId;
            const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
            const userScore = isHome ? game.homeScore : game.awayScore;
            const oppScore = isHome ? game.awayScore : game.homeScore;
            const won = game.played && userScore > oppScore;

            return (
              <Card key={game.id} className="flex items-center justify-between py-3 px-5">
                <div className="flex items-center gap-4 w-32">
                  <span className="text-xs text-[var(--text-sec)] w-12">Wk {game.week}</span>
                  <Badge variant={isHome ? 'blue' : 'default'} size="sm">
                    {isHome ? 'HOME' : 'AWAY'}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
                    style={{ backgroundColor: teamColor(opponentId) }}
                  >
                    {teamAbbr(opponentId)}
                  </div>
                  <span className="font-semibold text-sm">
                    {isHome ? 'vs' : '@'} {teamFullName(opponentId)}
                  </span>
                </div>

                <div className="w-40 text-right">
                  {game.played ? (
                    <div className="flex items-center justify-end gap-3">
                      <span className="font-mono font-bold">
                        {userScore} - {oppScore}
                      </span>
                      <Badge variant={won ? 'green' : 'red'} size="sm">
                        {won ? 'W' : 'L'}
                      </Badge>
                      <button
                        onClick={() => setSelectedGame(game)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Box Score
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-sec)]">Upcoming</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {selectedGame && (
        <BoxScore
          game={selectedGame}
          players={players}
          homeTeamName={teamFullName(selectedGame.homeTeamId)}
          awayTeamName={teamFullName(selectedGame.awayTeamId)}
          onClose={() => setSelectedGame(null)}
        />
      )}
    </GameShell>
  );
}
