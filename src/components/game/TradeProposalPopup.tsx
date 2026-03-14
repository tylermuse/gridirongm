'use client';

import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { TradeProposal } from '@/types';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function statLine(p: { position: string; stats: { gamesPlayed: number; passYards: number; passTDs: number; interceptions: number; rushYards: number; rushTDs: number; receptions: number; receivingYards: number; receivingTDs: number; tackles: number; sacks: number; defensiveINTs: number; fieldGoalsMade: number; fieldGoalAttempts: number } }): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return '';
  switch (p.position) {
    case 'QB': return `${s.passYards} YDS · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.rushYards} YDS · ${s.rushTDs} TD`;
    case 'WR': case 'TE': return `${s.receptions} REC · ${s.receivingYards} YDS · ${s.receivingTDs} TD`;
    case 'DL': case 'LB': return `${s.tackles} TKL · ${s.sacks.toFixed(1)} SCK`;
    case 'CB': case 'S': return `${s.tackles} TKL · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG`;
    default: return `${s.gamesPlayed} GP`;
  }
}

interface TradeProposalPopupProps {
  proposalIds: string[];
  onClose: () => void;
}

export function TradeProposalPopup({ proposalIds, onClose }: TradeProposalPopupProps) {
  const router = useRouter();
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
    const success = respondToTradeProposal(proposalId, true);
    if (!success) {
      alert('Trade failed — you may be over the salary cap or the players are no longer available.');
    }
    // Auto-close if this was the last pending proposal
    const remaining = proposalIds
      .map(id => tradeProposals.find(p => p.id === id))
      .filter(p => p && p.status === 'pending' && p.id !== proposalId);
    if (remaining.length === 0) onClose();
  }

  function handleReject(proposalId: string) {
    respondToTradeProposal(proposalId, false);
    // Auto-close if this was the last pending proposal
    const remaining = proposalIds
      .map(id => tradeProposals.find(p => p.id === id))
      .filter(p => p && p.status === 'pending' && p.id !== proposalId);
    if (remaining.length === 0) onClose();
  }

  function handleRejectAll() {
    proposals.forEach(p => respondToTradeProposal(p.id, false));
    onClose();
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
                  {aiTeam ? <TeamLogo abbreviation={aiTeam.abbreviation} primaryColor={aiTeam.primaryColor} secondaryColor={aiTeam.secondaryColor} size="md" /> : <div className="w-8 h-8 rounded-lg bg-gray-400" />}
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
                  <div className="text-[10px] uppercase tracking-wider text-green-600 font-bold mb-1">You Receive</div>
                  {proposal.offeredPlayerIds.map(id => {
                    const p = getPlayer(id);
                    if (!p) return null;
                    const stats = statLine(p);
                    return (
                      <div key={id} className="py-1">
                        <div className="flex items-center gap-2">
                          <Badge size="sm">{p.position}</Badge>
                          <span className="text-sm font-semibold">{p.firstName} {p.lastName}</span>
                          <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          <span className="text-[10px] text-[var(--text-sec)]">Age {p.age}</span>
                          <span className="text-[10px] text-[var(--text-sec)]">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                        </div>
                        {stats && <div className="text-[10px] text-[var(--text-sec)] ml-7 mt-0.5">{stats}</div>}
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
                  <div className="text-[10px] uppercase tracking-wider text-red-600 font-bold mb-1">You Send</div>
                  {proposal.requestedPlayerIds.map(id => {
                    const p = getPlayer(id);
                    if (!p) return null;
                    const stats = statLine(p);
                    return (
                      <div key={id} className="py-1">
                        <div className="flex items-center gap-2">
                          <Badge size="sm">{p.position}</Badge>
                          <span className="text-sm font-semibold">{p.firstName} {p.lastName}</span>
                          <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          <span className="text-[10px] text-[var(--text-sec)]">Age {p.age}</span>
                          <span className="text-[10px] text-[var(--text-sec)]">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                        </div>
                        {stats && <div className="text-[10px] text-[var(--text-sec)] ml-7 mt-0.5">{stats}</div>}
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
                <Button size="sm" variant="secondary" onClick={() => {
                  onClose();
                  router.push(`/trades?counter=${proposal.id}`);
                }}>
                  Counter
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
          <div className="flex gap-2">
            {proposals.length > 1 && (
              <Button size="sm" variant="danger" onClick={handleRejectAll}>
                Reject All
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
