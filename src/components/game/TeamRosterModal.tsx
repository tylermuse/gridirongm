'use client';

import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';

interface TeamRosterModalProps {
  teamId: string | null;
  onClose: () => void;
  onPlayerClick?: (playerId: string) => void;
}

export function TeamRosterModal({ teamId, onClose, onPlayerClick }: TeamRosterModalProps) {
  const { teams, players } = useGameStore();

  if (!teamId) return null;

  const team = teams.find(t => t.id === teamId);
  if (!team) return null;

  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as const;
  const teamRoster = players
    .filter(p => p.teamId === teamId && !p.retired)
    .sort((a, b) => {
      const pi = (POS_ORDER as readonly string[]).indexOf(a.position) - (POS_ORDER as readonly string[]).indexOf(b.position);
      return pi !== 0 ? pi : b.ratings.overall - a.ratings.overall;
    });

  const avgOvr = teamRoster.length > 0
    ? Math.round(teamRoster.reduce((s, p) => s + p.ratings.overall, 0) / teamRoster.length)
    : 0;

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="lg">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black text-white"
            style={{ backgroundColor: team.primaryColor }}
          >
            {team.abbreviation}
          </div>
          <div>
            <h3 className="text-lg font-black">{team.city} {team.name}</h3>
            <div className="text-xs text-[var(--text-sec)]">
              {team.record.wins}-{team.record.losses} · OVR {avgOvr} · Cap: ${Math.round(team.totalPayroll)}M / ${team.salaryCap}M
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-[var(--text-sec)] hover:text-white text-xl">✕</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[var(--text-sec)] text-xs border-b border-[var(--border)]">
            <th className="text-left px-4 py-2">Player</th>
            <th className="text-center px-2 py-2">POS</th>
            <th className="text-center px-2 py-2">AGE</th>
            <th className="text-center px-2 py-2">OVR</th>
            <th className="text-right px-4 py-2">Contract</th>
          </tr>
        </thead>
        <tbody>
          {teamRoster.map(p => (
            <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
              <td className="px-4 py-1.5">
                {onPlayerClick ? (
                  <button onClick={() => { onClose(); onPlayerClick(p.id); }} className="hover:text-blue-400 transition-colors font-medium">
                    {p.firstName} {p.lastName}
                  </button>
                ) : (
                  <span className="font-medium">{p.firstName} {p.lastName}</span>
                )}
              </td>
              <td className="text-center px-2 py-1.5"><Badge variant="default" size="sm">{p.position}</Badge></td>
              <td className="text-center px-2 py-1.5">{p.age}</td>
              <td className="text-center px-2 py-1.5">
                <span className={`font-bold ${p.ratings.overall >= 80 ? 'text-green-400' : p.ratings.overall >= 65 ? 'text-blue-400' : p.ratings.overall >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {p.ratings.overall}
                </span>
              </td>
              <td className="text-right px-4 py-1.5 text-[var(--text-sec)]">${p.contract.salary}M × {p.contract.yearsLeft}yr</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
