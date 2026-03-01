'use client';

import type { GameResult, Player, PlayerStats } from '@/types';

interface BoxScoreProps {
  game: GameResult;
  players: Player[];
  homeTeamName: string;
  awayTeamName: string;
  onClose: () => void;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-[var(--text-sec)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function qbRating(stats: Partial<PlayerStats>): number {
  const att = stats.passAttempts ?? 0;
  if (att === 0) return 0;
  const cmp = stats.passCompletions ?? 0;
  const yds = stats.passYards ?? 0;
  const td = stats.passTDs ?? 0;
  const int = stats.interceptions ?? 0;
  const pct = cmp / att;
  const ypa = yds / att;
  const tdRate = td / att;
  const intRate = int / att;
  return Math.round(Math.min(158.3, Math.max(0, (pct + ypa + tdRate - intRate) * 25)));
}

export function BoxScore({ game, players, homeTeamName, awayTeamName, onClose }: BoxScoreProps) {
  const allStats = game.playerStats;

  function getPlayer(pid: string): Player | undefined {
    return players.find(p => p.id === pid);
  }

  // Gather passers
  const passers = Object.entries(allStats)
    .filter(([, s]) => (s.passAttempts ?? 0) > 0)
    .map(([pid, s]) => ({ player: getPlayer(pid), stats: s }))
    .filter(e => e.player)
    .sort((a, b) => (b.stats.passYards ?? 0) - (a.stats.passYards ?? 0));

  // Rushers
  const rushers = Object.entries(allStats)
    .filter(([, s]) => (s.rushAttempts ?? 0) > 0)
    .map(([pid, s]) => ({ player: getPlayer(pid), stats: s }))
    .filter(e => e.player)
    .sort((a, b) => (b.stats.rushYards ?? 0) - (a.stats.rushYards ?? 0))
    .slice(0, 6);

  // Receivers
  const receivers = Object.entries(allStats)
    .filter(([, s]) => (s.targets ?? 0) > 0)
    .map(([pid, s]) => ({ player: getPlayer(pid), stats: s }))
    .filter(e => e.player)
    .sort((a, b) => (b.stats.receivingYards ?? 0) - (a.stats.receivingYards ?? 0))
    .slice(0, 8);

  // Defenders
  const defenders = Object.entries(allStats)
    .filter(([, s]) => (s.tackles ?? 0) > 0 || (s.sacks ?? 0) > 0)
    .map(([pid, s]) => ({ player: getPlayer(pid), stats: s }))
    .filter(e => e.player)
    .sort((a, b) => (b.stats.tackles ?? 0) - (a.stats.tackles ?? 0))
    .slice(0, 8);

  // Auto-generated recap
  const topPasser = passers[0];
  const topRusher = rushers[0];
  const winner = game.homeScore > game.awayScore ? homeTeamName : awayTeamName;
  const loser = game.homeScore > game.awayScore ? awayTeamName : homeTeamName;
  const winScore = Math.max(game.homeScore, game.awayScore);
  const loseScore = Math.min(game.homeScore, game.awayScore);

  const recap: string[] = [
    `The ${winner} defeated the ${loser} ${winScore}-${loseScore}.`,
  ];
  if (topPasser?.player && (topPasser.stats.passYards ?? 0) > 100) {
    recap.push(`${topPasser.player.firstName} ${topPasser.player.lastName} threw for ${topPasser.stats.passYards} yards and ${topPasser.stats.passTDs ?? 0} TDs.`);
  }
  if (topRusher?.player && (topRusher.stats.rushYards ?? 0) > 50) {
    recap.push(`${topRusher.player.firstName} ${topRusher.player.lastName} led the ground attack with ${topRusher.stats.rushYards} rushing yards.`);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-[var(--text-sec)]">Week {game.week} · Season {game.season}</div>
            <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] transition-colors text-xl">×</button>
          </div>
          <div className="flex items-center justify-center gap-12">
            <div className="text-right">
              <div className="text-sm text-[var(--text-sec)]">{homeTeamName}</div>
              <div className="text-5xl font-black">{game.homeScore}</div>
            </div>
            <div className="text-[var(--text-sec)] text-xl">-</div>
            <div className="text-left">
              <div className="text-sm text-[var(--text-sec)]">{awayTeamName}</div>
              <div className="text-5xl font-black">{game.awayScore}</div>
            </div>
          </div>
        </div>

        {/* Recap */}
        <div className="p-4 bg-[var(--surface-2)] border-b border-[var(--border)]">
          {recap.map((s, i) => <p key={i} className="text-sm text-[var(--text-sec)]">{s}</p>)}
        </div>

        <div className="p-6 space-y-6">
          {/* Passing */}
          {passers.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Passing</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs">
                    <th className="text-left pb-1">Player</th>
                    <th className="text-center pb-1">CMP</th>
                    <th className="text-center pb-1">ATT</th>
                    <th className="text-center pb-1">YDS</th>
                    <th className="text-center pb-1">TD</th>
                    <th className="text-center pb-1">INT</th>
                    <th className="text-right pb-1">RTG</th>
                  </tr>
                </thead>
                <tbody>
                  {passers.map(({ player, stats }, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{player!.firstName} {player!.lastName}</td>
                      <td className="py-1.5 text-center">{stats.passCompletions ?? 0}</td>
                      <td className="py-1.5 text-center">{stats.passAttempts ?? 0}</td>
                      <td className="py-1.5 text-center font-mono">{stats.passYards ?? 0}</td>
                      <td className="py-1.5 text-center text-green-400">{stats.passTDs ?? 0}</td>
                      <td className="py-1.5 text-center text-red-400">{stats.interceptions ?? 0}</td>
                      <td className="py-1.5 text-right font-mono">{qbRating(stats)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rushing */}
          {rushers.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Rushing</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs">
                    <th className="text-left pb-1">Player</th>
                    <th className="text-center pb-1">ATT</th>
                    <th className="text-center pb-1">YDS</th>
                    <th className="text-center pb-1">AVG</th>
                    <th className="text-right pb-1">TD</th>
                  </tr>
                </thead>
                <tbody>
                  {rushers.map(({ player, stats }, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{player!.firstName} {player!.lastName}</td>
                      <td className="py-1.5 text-center">{stats.rushAttempts ?? 0}</td>
                      <td className="py-1.5 text-center font-mono">{stats.rushYards ?? 0}</td>
                      <td className="py-1.5 text-center text-[var(--text-sec)]">
                        {stats.rushAttempts ? (((stats.rushYards ?? 0) / stats.rushAttempts).toFixed(1)) : '—'}
                      </td>
                      <td className="py-1.5 text-right text-green-400">{stats.rushTDs ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Receiving */}
          {receivers.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Receiving</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs">
                    <th className="text-left pb-1">Player</th>
                    <th className="text-center pb-1">TGT</th>
                    <th className="text-center pb-1">REC</th>
                    <th className="text-center pb-1">YDS</th>
                    <th className="text-right pb-1">TD</th>
                  </tr>
                </thead>
                <tbody>
                  {receivers.map(({ player, stats }, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{player!.firstName} {player!.lastName}</td>
                      <td className="py-1.5 text-center">{stats.targets ?? 0}</td>
                      <td className="py-1.5 text-center">{stats.receptions ?? 0}</td>
                      <td className="py-1.5 text-center font-mono">{stats.receivingYards ?? 0}</td>
                      <td className="py-1.5 text-right text-green-400">{stats.receivingTDs ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Defense */}
          {defenders.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">Defense</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs">
                    <th className="text-left pb-1">Player</th>
                    <th className="text-center pb-1">TKL</th>
                    <th className="text-center pb-1">SCK</th>
                    <th className="text-right pb-1">INT</th>
                  </tr>
                </thead>
                <tbody>
                  {defenders.map(({ player, stats }, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{player!.firstName} {player!.lastName}</td>
                      <td className="py-1.5 text-center">{stats.tackles ?? 0}</td>
                      <td className="py-1.5 text-center">{stats.sacks ?? 0}</td>
                      <td className="py-1.5 text-right">{stats.defensiveINTs ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
