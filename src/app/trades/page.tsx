'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Player, DraftPick, Position } from '@/types';
import { POSITIONS } from '@/types';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function playerTradeValue(player: Player): number {
  const ageMultiplier =
    player.age <= 25 ? 1.2 :
    player.age <= 29 ? 1.0 :
    player.age <= 33 ? 0.7 : 0.3;
  return Math.round((player.ratings.overall * 2 + player.potential * 0.5) * ageMultiplier);
}

const PICK_VALUES = [150, 90, 55, 35, 20, 10, 5];
function pickTradeValue(pick: DraftPick): number {
  return PICK_VALUES[(pick.round - 1)] ?? 5;
}

function ValueAssessmentBadge({ assessment }: { assessment: string }) {
  if (assessment === 'fair') return <Badge variant="green">Fair</Badge>;
  if (assessment === 'lopsided-you-win') return <Badge variant="blue">You Win</Badge>;
  return <Badge variant="red">They Win</Badge>;
}

export default function TradesPage() {
  const {
    phase, week, players, teams, userTeamId,
    tradeProposals, executeTrade, respondToTradeProposal,
    solicitTradingBlockProposals,
  } = useGameStore();

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [offeredPlayerIds, setOfferedPlayerIds] = useState<string[]>([]);
  const [offeredPickIds, setOfferedPickIds] = useState<string[]>([]);
  const [receivedPlayerIds, setReceivedPlayerIds] = useState<string[]>([]);
  const [receivedPickIds, setReceivedPickIds] = useState<string[]>([]);
  const [tradeResult, setTradeResult] = useState<'accepted' | 'rejected' | null>(null);
  const [activeTab, setActiveTab] = useState<'incoming' | 'propose' | 'block'>('incoming');

  // Trading block state
  const [blockedPlayerIds, setBlockedPlayerIds] = useState<string[]>([]);
  const [blockedPickIds, setBlockedPickIds] = useState<string[]>([]);
  const [seekPositions, setSeekPositions] = useState<Position[]>([]);
  const [blockSolicited, setBlockSolicited] = useState(false);

  const userTeam = teams.find(t => t.id === userTeamId);
  const aiTeams = teams.filter(t => t.id !== userTeamId).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  const selectedAITeam = teams.find(t => t.id === selectedTeamId);

  const userRoster = players
    .filter(p => p.teamId === userTeamId && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  const aiRoster = selectedAITeam
    ? players.filter(p => p.teamId === selectedAITeam.id && !p.retired)
        .sort((a, b) => b.ratings.overall - a.ratings.overall)
    : [];

  // Trades allowed during regular season (before deadline) and all offseason phases
  const offseasonPhases = ['resigning', 'draft', 'freeAgency', 'offseason', 'preseason'];
  const isTradeOpen = offseasonPhases.includes(phase) || (phase === 'regular' && week <= 12);
  const userTeamObj = teams.find(t => t.id === userTeamId);
  const pendingProposals = tradeProposals.filter(p => {
    if (p.status !== 'pending') return false;
    // Hide stale proposals: requested players must still be on user's team
    const playersValid = p.requestedPlayerIds.every(pid => {
      const player = players.find(pl => pl.id === pid);
      return player && player.teamId === userTeamId;
    });
    // Requested picks must still be owned
    const picksValid = p.requestedPickIds.every(pkId =>
      userTeamObj?.draftPicks.some(pk => pk.id === pkId),
    );
    return playersValid && picksValid;
  });

  function togglePlayerSelect(
    playerId: string,
    list: string[],
    setter: (ids: string[]) => void,
  ) {
    if (list.includes(playerId)) setter(list.filter(id => id !== playerId));
    else setter([...list, playerId]);
  }

  function togglePickSelect(
    pickId: string,
    list: string[],
    setter: (ids: string[]) => void,
  ) {
    if (list.includes(pickId)) setter(list.filter(id => id !== pickId));
    else setter([...list, pickId]);
  }

  const offeredValue = offeredPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + offeredPickIds.reduce((sum, id) => {
    const pick = userTeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const receivedValue = receivedPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + receivedPickIds.reduce((sum, id) => {
    const pick = selectedAITeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const valueDiff = offeredValue - receivedValue;
  const valueLabel =
    Math.abs(valueDiff) < offeredValue * 0.1 ? 'Fair trade' :
    valueDiff < 0 ? `You lose ~${Math.abs(valueDiff)} pts` :
    `You gain ~${valueDiff} pts`;

  function handleSendTrade() {
    if (!selectedTeamId) return;
    const success = executeTrade(
      offeredPlayerIds, offeredPickIds,
      receivedPlayerIds, receivedPickIds,
      selectedTeamId,
    );
    setTradeResult(success ? 'accepted' : 'rejected');
    if (success) {
      setOfferedPlayerIds([]);
      setOfferedPickIds([]);
      setReceivedPlayerIds([]);
      setReceivedPickIds([]);
    }
  }

  function handleSolicitProposals() {
    solicitTradingBlockProposals(blockedPlayerIds, blockedPickIds, seekPositions);
    setBlockSolicited(true);
    setActiveTab('incoming');
  }

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Trade Center</h2>
          <div className="text-sm text-[var(--text-sec)]">
            {isTradeOpen
              ? `Trade deadline: Week 12 (${12 - week} week${12 - week !== 1 ? 's' : ''} away)`
              : 'Trade window closed'}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-6 w-fit">
          {(['incoming', 'block', 'propose'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {tab === 'incoming' ? (
                <span>
                  Incoming Offers
                  {pendingProposals.length > 0 && (
                    <span className="ml-1.5 bg-red-600 text-white rounded-full px-1.5 text-[10px]">
                      {pendingProposals.length}
                    </span>
                  )}
                </span>
              ) : tab === 'block' ? 'Trading Block' : 'Propose Trade'}
            </button>
          ))}
        </div>

        {/* ─── Incoming offers ─── */}
        {activeTab === 'incoming' && (
          <div className="space-y-4">
            {pendingProposals.length === 0 ? (
              <Card>
                <div className="text-center py-12 text-[var(--text-sec)]">
                  <p>No incoming trade proposals.</p>
                  {isTradeOpen && (
                    <p className="text-sm mt-1">Use the Trading Block to solicit offers, or AI teams may propose trades during the season.</p>
                  )}
                </div>
              </Card>
            ) : (
              pendingProposals.map(proposal => {
                const proposingTeam = teams.find(t => t.id === proposal.proposingTeamId);
                const offPlayers = proposal.offeredPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                const reqPlayers = proposal.requestedPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                const offPicks = proposal.offeredPickIds.map(id =>
                  proposingTeam?.draftPicks.find(pk => pk.id === id),
                ).filter(Boolean) as DraftPick[];
                const reqPicks = proposal.requestedPickIds.map(id =>
                  userTeam?.draftPicks.find(pk => pk.id === id),
                ).filter(Boolean) as DraftPick[];

                const proposedOfferedValue = offPlayers.reduce((s, p) => s + playerTradeValue(p), 0)
                  + offPicks.reduce((s, pk) => s + pickTradeValue(pk), 0);
                const proposedRequestedValue = reqPlayers.reduce((s, p) => s + playerTradeValue(p), 0)
                  + reqPicks.reduce((s, pk) => s + pickTradeValue(pk), 0);

                return (
                  <Card key={proposal.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center text-xs font-black text-white"
                          style={{ backgroundColor: proposingTeam?.primaryColor ?? '#374151' }}
                        >
                          {proposingTeam?.abbreviation?.[0]}
                        </div>
                        <span className="font-bold">{proposingTeam?.city} {proposingTeam?.name}</span>
                        <span className="text-xs text-[var(--text-sec)]">Week {proposal.week}</span>
                      </div>
                      <ValueAssessmentBadge assessment={proposal.valueAssessment} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs font-bold text-green-400 mb-2">You Receive ({proposedOfferedValue} pts)</div>
                        {offPlayers.map(p => (
                          <div key={p.id} className="flex items-center gap-2 mb-1">
                            <Badge size="sm">{p.position}</Badge>
                            <Link href={`/player/${p.id}`} className="text-sm hover:text-blue-400">
                              {p.firstName} {p.lastName}
                            </Link>
                            <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          </div>
                        ))}
                        {offPicks.map(pk => (
                          <div key={pk.id} className="text-sm text-[var(--text-sec)]">
                            Round {pk.round} Pick ({pickTradeValue(pk)} pts)
                          </div>
                        ))}
                        {offPlayers.length === 0 && offPicks.length === 0 && (
                          <span className="text-sm text-[var(--text-sec)]">Nothing</span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-red-400 mb-2">You Send ({proposedRequestedValue} pts)</div>
                        {reqPlayers.map(p => (
                          <div key={p.id} className="flex items-center gap-2 mb-1">
                            <Badge size="sm">{p.position}</Badge>
                            <Link href={`/player/${p.id}`} className="text-sm hover:text-blue-400">
                              {p.firstName} {p.lastName}
                            </Link>
                            <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          </div>
                        ))}
                        {reqPicks.map(pk => (
                          <div key={pk.id} className="text-sm text-[var(--text-sec)]">
                            Round {pk.round} Pick ({pickTradeValue(pk)} pts)
                          </div>
                        ))}
                        {reqPlayers.length === 0 && reqPicks.length === 0 && (
                          <span className="text-sm text-[var(--text-sec)]">Nothing</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => respondToTradeProposal(proposal.id, true)}
                        disabled={!isTradeOpen}
                      >
                        Accept Trade
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => respondToTradeProposal(proposal.id, false)}
                      >
                        Reject
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}

            {/* Rejected/accepted history */}
            {tradeProposals.filter(p => p.status !== 'pending').length > 0 && (
              <details className="text-sm">
                <summary className="text-[var(--text-sec)] cursor-pointer py-2">
                  Past proposals ({tradeProposals.filter(p => p.status !== 'pending').length})
                </summary>
                <div className="space-y-2 mt-2">
                  {tradeProposals.filter(p => p.status !== 'pending').map(proposal => {
                    const t = teams.find(tm => tm.id === proposal.proposingTeamId);
                    return (
                      <div key={proposal.id} className="flex items-center gap-2 text-[var(--text-sec)] p-2 rounded border border-[var(--border)]">
                        <span>{proposal.status === 'accepted' ? '✅' : '❌'}</span>
                        <span>{t?.abbreviation} — Week {proposal.week}</span>
                        <Badge size="sm" variant={proposal.status === 'accepted' ? 'green' : 'default'}>
                          {proposal.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ─── Trading Block ─── */}
        {activeTab === 'block' && (
          <div>
            {!isTradeOpen ? (
              <Card>
                <div className="text-center py-8 text-[var(--text-sec)]">
                  <p className="font-semibold">Trade window is closed.</p>
                  <p className="text-sm mt-1">Trades are allowed during Weeks 1-12 of the regular season.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-sec)]">
                  Select players and picks to put on the trading block, choose what you want in return, then ask for proposals.
                </p>

                <div className="grid grid-cols-[1fr_280px] gap-4">
                  {/* Left: Players + Picks to put on block */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Players &amp; Picks on the Block</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">
                        {blockedPlayerIds.length} player{blockedPlayerIds.length !== 1 ? 's' : ''},
                        {' '}{blockedPickIds.length} pick{blockedPickIds.length !== 1 ? 's' : ''}
                      </span>
                    </CardHeader>

                    <div className="mb-3">
                      <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                      <div className="max-h-[400px] overflow-y-auto space-y-0">
                        {userRoster.map(p => (
                          <label key={p.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={blockedPlayerIds.includes(p.id)}
                              onChange={() => togglePlayerSelect(p.id, blockedPlayerIds, setBlockedPlayerIds)}
                              className="accent-blue-500"
                            />
                            <Badge size="sm">{p.position}</Badge>
                            <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                            <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                            <span className="text-xs text-[var(--text-sec)] w-10 text-right">{p.age}y</span>
                            <span className="text-xs text-[var(--text-sec)] w-14 text-right">${(p.contract.salary / 1_000_000).toFixed(1)}M</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {userTeam && userTeam.draftPicks.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                        {userTeam.draftPicks
                          .filter(pk => pk.year >= (useGameStore.getState().season))
                          .sort((a, b) => a.year - b.year || a.round - b.round)
                          .map(pk => (
                          <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={blockedPickIds.includes(pk.id)}
                              onChange={() => togglePickSelect(pk.id, blockedPickIds, setBlockedPickIds)}
                              className="accent-blue-500"
                            />
                            <span className="text-sm flex-1">{pk.year} Round {pk.round}</span>
                            <span className="text-xs text-[var(--text-sec)]">~{pickTradeValue(pk)} pts</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Right: Seek preferences + Submit */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle>Seeking in Return</CardTitle></CardHeader>
                      <p className="text-xs text-[var(--text-sec)] mb-3">
                        Select positions you want. AI teams will prioritize offering these.
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {POSITIONS.map(pos => (
                          <label key={pos} className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={seekPositions.includes(pos)}
                              onChange={() => {
                                if (seekPositions.includes(pos)) {
                                  setSeekPositions(seekPositions.filter(p => p !== pos));
                                } else {
                                  setSeekPositions([...seekPositions, pos]);
                                }
                              }}
                              className="accent-blue-500"
                            />
                            <span className="text-xs font-medium">{pos}</span>
                          </label>
                        ))}
                      </div>
                    </Card>

                    <Card>
                      <div className="text-center">
                        <div className="text-sm text-[var(--text-sec)] mb-3">
                          {blockedPlayerIds.length + blockedPickIds.length === 0
                            ? 'Select players or picks to put on the block'
                            : `${blockedPlayerIds.length + blockedPickIds.length} asset${blockedPlayerIds.length + blockedPickIds.length !== 1 ? 's' : ''} on the block`}
                        </div>
                        <Button
                          onClick={handleSolicitProposals}
                          disabled={blockedPlayerIds.length === 0 && blockedPickIds.length === 0}
                          className="w-full"
                        >
                          Ask for Proposals
                        </Button>
                        {blockSolicited && (
                          <p className="text-xs text-green-400 mt-2">
                            Proposals generated! Check Incoming Offers.
                          </p>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Propose trade ─── */}
        {activeTab === 'propose' && (
          <div>
            {!isTradeOpen && (
              <Card>
                <div className="text-center py-8 text-[var(--text-sec)]">
                  <p className="font-semibold">Trade window is closed.</p>
                  <p className="text-sm mt-1">Trades are allowed during Weeks 1-12 of the regular season.</p>
                </div>
              </Card>
            )}

            {isTradeOpen && (
              <>
                {/* Team selector */}
                <Card className="mb-4">
                  <CardHeader><CardTitle>Select Trade Partner</CardTitle></CardHeader>
                  <select
                    value={selectedTeamId}
                    onChange={e => {
                      setSelectedTeamId(e.target.value);
                      setReceivedPlayerIds([]);
                      setReceivedPickIds([]);
                      setTradeResult(null);
                    }}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Choose a team —</option>
                    {aiTeams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.city} {t.name} ({t.record.wins}-{t.record.losses})
                      </option>
                    ))}
                  </select>
                </Card>

                {/* Trade panels */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Your offer */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Offer</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">{offeredValue} trade pts</span>
                    </CardHeader>
                    <div className="mb-3">
                      <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                      {userRoster.map(p => (
                        <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                          <input
                            type="checkbox"
                            checked={offeredPlayerIds.includes(p.id)}
                            onChange={() => togglePlayerSelect(p.id, offeredPlayerIds, setOfferedPlayerIds)}
                            className="accent-blue-500"
                          />
                          <Badge size="sm">{p.position}</Badge>
                          <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                          <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          <span className="text-xs text-[var(--text-sec)]">~{playerTradeValue(p)}</span>
                        </label>
                      ))}
                    </div>
                    {userTeam && userTeam.draftPicks.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                        {userTeam.draftPicks.map(pk => (
                          <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={offeredPickIds.includes(pk.id)}
                              onChange={() => togglePickSelect(pk.id, offeredPickIds, setOfferedPickIds)}
                              className="accent-blue-500"
                            />
                            <span className="text-sm flex-1">Round {pk.round} ({pk.year})</span>
                            <span className="text-xs text-[var(--text-sec)]">~{pickTradeValue(pk)}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Receiving */}
                  <Card>
                    <CardHeader>
                      <CardTitle>You Receive</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">{receivedValue} trade pts</span>
                    </CardHeader>
                    {!selectedAITeam ? (
                      <p className="text-sm text-[var(--text-sec)]">Select a trade partner first.</p>
                    ) : (
                      <>
                        <div className="mb-3">
                          <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                          {aiRoster.map(p => (
                            <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                              <input
                                type="checkbox"
                                checked={receivedPlayerIds.includes(p.id)}
                                onChange={() => togglePlayerSelect(p.id, receivedPlayerIds, setReceivedPlayerIds)}
                                className="accent-blue-500"
                              />
                              <Badge size="sm">{p.position}</Badge>
                              <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                              <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                              <span className="text-xs text-[var(--text-sec)]">~{playerTradeValue(p)}</span>
                            </label>
                          ))}
                        </div>
                        {selectedAITeam.draftPicks.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                            {selectedAITeam.draftPicks.map(pk => (
                              <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={receivedPickIds.includes(pk.id)}
                                  onChange={() => togglePickSelect(pk.id, receivedPickIds, setReceivedPickIds)}
                                  className="accent-blue-500"
                                />
                                <span className="text-sm flex-1">Round {pk.round} ({pk.year})</span>
                                <span className="text-xs text-[var(--text-sec)]">~{pickTradeValue(pk)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                </div>

                {/* Trade summary */}
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        Value: {offeredValue} → {receivedValue} pts
                        <span className={`ml-2 text-xs ${
                          Math.abs(valueDiff) < offeredValue * 0.1 ? 'text-green-400' :
                          valueDiff < 0 ? 'text-blue-400' : 'text-amber-400'
                        }`}>
                          ({valueLabel})
                        </span>
                      </div>
                      {tradeResult === 'rejected' && (
                        <p className="text-sm text-red-400 mt-1">
                          Trade rejected — offer more value or adjust your asks.
                        </p>
                      )}
                      {tradeResult === 'accepted' && (
                        <p className="text-sm text-green-400 mt-1">Trade accepted!</p>
                      )}
                    </div>
                    <Button
                      onClick={handleSendTrade}
                      disabled={
                        !selectedTeamId ||
                        (offeredPlayerIds.length === 0 && offeredPickIds.length === 0 &&
                         receivedPlayerIds.length === 0 && receivedPickIds.length === 0)
                      }
                    >
                      Send Offer
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </GameShell>
  );
}
