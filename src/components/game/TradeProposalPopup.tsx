'use client';

import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { TradeProposal } from '@/types';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

interface TradeProposalPopupProps {
  proposalIds: string[];
  onClose: () => void;
}

export function TradeProposalPopup({ proposalIds, onClose }: TradeProposalPopupProps) {
  const {
    tradeProposals, players, teams, userTeamId,
    respondToTradeProposal, suppressTradePopups, setSuppressTradePopups,
  } = useGameStore();

  const proposals = proposalIds
    .map(id => tradeProposals.find(p => p.id === id))
    .filter((p): p is TradeProposal => !!p && p.status === 'pending');

  if (proposals.length === 0) {
    return null;
  }

  const userTeam = teams.find(t => t.id === userTeamId);

  function getPlayer(id: string) {
    return players.find(p => p.id === id);
  }

  function getTeam(id: string) {
    return teams.find(t => t.id === id);
  }

  function handleAccept(proposalId: string) {
    respondToTradeProposal(proposalId, true);
  }

  function handleReject(proposalId: string) {
    respondToTradeProposal(proposalId, false);
  }

  const assessmentBadge = (assessment: string) => {
    if (assessment === 'fair') return <Badge variant="green" size="sm">Fair</Badge>;
    if (assessment === 'lopsided-you-win') return <Badge variant="blue" size="sm">You Win</Badge>;
    return <Badge variant="red" size="sm">They Win</Badge>;
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`Trade Proposal${proposals.length > 1 ? 's' : ''}`} maxWidth="md">
      <div className="p-4 space-y-4">
        {proposals.map(proposal => {
          const aiTeam = getTeam(proposal.proposingTeamId);
          return (
            <div
              key={proposal.id}
              className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg)]"
            >
              {/* Team header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white"
                    style={{ backgroundColor: aiTeam?.primaryColor ?? '#666' }}
                  >
                    {aiTeam?.abbreviation ?? '???'}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{aiTeam?.city} {aiTeam?.name}</div>
                    <div className="text-xs text-[var(--text-sec)]">wants to trade</div>
                  </div>
                </div>
                {assessmentBadge(proposal.valueAssessment)}
              </div>

              {/* Trade details - two columns */}
              <div className="grid grid-cols-2 gap-3">
                {/* You receive */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-green-400 font-bold mb-1">You Receive</div>
                  {proposal.offeredPlayerIds.map(id => {
                    const p = getPlayer(id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 py-1">
                        <Badge size="sm">{p.position}</Badge>
                        <span className="text-sm font-semibold">{p.firstName} {p.lastName}</span>
                        <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                      </div>
                    );
                  })}
                  {proposal.offeredPickIds.map(id => {
                    const pk = aiTeam?.draftPicks.find(d => d.id === id);
                    if (!pk) return null;
                    return (
                      <div key={id} className="text-sm py-1 text-[var(--text-sec)]">
                        Rd {pk.round} Pick ({pk.year})
                      </div>
                    );
                  })}
                </div>

                {/* You send */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-red-400 font-bold mb-1">You Send</div>
                  {proposal.requestedPlayerIds.map(id => {
                    const p = getPlayer(id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 py-1">
                        <Badge size="sm">{p.position}</Badge>
                        <span className="text-sm font-semibold">{p.firstName} {p.lastName}</span>
                        <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                      </div>
                    );
                  })}
                  {proposal.requestedPickIds.map(id => {
                    const pk = userTeam?.draftPicks.find(d => d.id === id);
                    if (!pk) return null;
                    return (
                      <div key={id} className="text-sm py-1 text-[var(--text-sec)]">
                        Rd {pk.round} Pick ({pk.year})
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                <Button size="sm" onClick={() => handleAccept(proposal.id)}>
                  Accept
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleReject(proposal.id)}>
                  Reject
                </Button>
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <label className="flex items-center gap-2 text-xs text-[var(--text-sec)] cursor-pointer">
            <input
              type="checkbox"
              checked={suppressTradePopups}
              onChange={e => setSuppressTradePopups(e.target.checked)}
              className="accent-blue-500"
            />
            Don&apos;t show trade popups
          </label>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      </div>
    </Modal>
  );
}
