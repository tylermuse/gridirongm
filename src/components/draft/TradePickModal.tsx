'use client';

import React, { useState, useMemo } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { pickTradeValue } from '@/lib/engine/store';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { DraftPick, Team } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Friendly label for a pick, e.g. "R1 #7 — SEA's pick" */
function pickLabel(
  pick: DraftPick,
  teams: Team[],
  draftOrder: string[],
  currentOverallPick: number,
): string {
  const origTeam = teams.find(t => t.id === pick.originalTeamId);
  const abbr = origTeam?.abbreviation ?? '???';

  // Try to find overall position in remaining draftOrder
  // For current-year picks that haven't been used yet, match by pick id in the
  // allCurrentYearPicks list mapped through draftOrder.
  const overallNum = estimatePickOverall(pick, teams);
  return `R${pick.round} #${overallNum} — ${abbr}'s pick`;
}

function estimatePickOverall(pick: DraftPick, teams: Team[]): number {
  const numTeams = teams.length || 32;
  const sorted = [...teams].sort((a, b) => {
    const aWp = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
    const bWp = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
    return aWp - bWp;
  });
  const posInRound = sorted.findIndex(t => t.id === pick.originalTeamId);
  const slot = posInRound >= 0 ? posInRound : Math.floor(numTeams / 2);
  return (pick.round - 1) * numTeams + slot + 1;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TradePickModalProps {
  onClose: () => void;
  currentPickTeamId: string | undefined;
  currentOverallPick: number;
  currentRound: number;
  currentPickInRound: number;
}

export function TradePickModal({
  onClose,
  currentPickTeamId,
  currentOverallPick,
  currentRound,
  currentPickInRound,
}: TradePickModalProps) {
  const {
    teams,
    userTeamId,
    season,
    draftOrder,
    executeTrade,
    currentDraftYear,
  } = useGameStore();
  const draftYear = currentDraftYear ?? season;

  const [partnerTeamId, setPartnerTeamId] = useState<string>('');
  const [selectedMyPicks, setSelectedMyPicks] = useState<Set<string>>(new Set());
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ success: boolean; reason?: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const userTeam = teams.find(t => t.id === userTeamId);
  const partnerTeam = teams.find(t => t.id === partnerTeamId);

  // Current year picks owned by user that haven't been used yet
  const myAvailablePicks = useMemo(() => {
    if (!userTeam) return [];
    return userTeam.draftPicks
      .filter(pk => pk.year === draftYear && !pk.playerId)
      .sort((a, b) => a.round - b.round || estimatePickOverall(a, teams) - estimatePickOverall(b, teams));
  }, [userTeam, draftYear, teams]);

  // Current year picks owned by partner that haven't been used yet
  const theirAvailablePicks = useMemo(() => {
    if (!partnerTeam) return [];
    return partnerTeam.draftPicks
      .filter(pk => pk.year === draftYear && !pk.playerId)
      .sort((a, b) => a.round - b.round || estimatePickOverall(a, teams) - estimatePickOverall(b, teams));
  }, [partnerTeam, draftYear, teams]);

  // Trade value calculations
  const myValue = useMemo(() => {
    let total = 0;
    for (const pickId of selectedMyPicks) {
      const pick = myAvailablePicks.find(p => p.id === pickId);
      if (pick) total += pickTradeValue(pick, teams);
    }
    return total;
  }, [selectedMyPicks, myAvailablePicks, teams]);

  const theirValue = useMemo(() => {
    let total = 0;
    for (const pickId of selectedTheirPicks) {
      const pick = theirAvailablePicks.find(p => p.id === pickId);
      if (pick) total += pickTradeValue(pick, teams);
    }
    return total;
  }, [selectedTheirPicks, theirAvailablePicks, teams]);

  // Other teams for dropdown (exclude user team)
  const otherTeams = useMemo(() => {
    return teams
      .filter(t => t.id !== userTeamId)
      .sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`));
  }, [teams, userTeamId]);

  const currentPickOwnerTeam = teams.find(t => t.id === currentPickTeamId);

  function toggleMyPick(pickId: string) {
    setResult(null);
    setSelectedMyPicks(prev => {
      const next = new Set(prev);
      if (next.has(pickId)) next.delete(pickId);
      else next.add(pickId);
      return next;
    });
  }

  function toggleTheirPick(pickId: string) {
    setResult(null);
    setSelectedTheirPicks(prev => {
      const next = new Set(prev);
      if (next.has(pickId)) next.delete(pickId);
      else next.add(pickId);
      return next;
    });
  }

  function handlePropose() {
    if (selectedMyPicks.size === 0 && selectedTheirPicks.size === 0) return;
    if (!partnerTeamId) return;

    const tradeResult = executeTrade(
      [],                                        // no players offered
      Array.from(selectedMyPicks),               // pick IDs offered
      [],                                        // no players received
      Array.from(selectedTheirPicks),            // pick IDs received
      partnerTeamId,
    );

    setResult(tradeResult);
    setSubmitted(true);

    if (tradeResult.success) {
      // Auto-close after brief delay so user sees the success message
      setTimeout(() => onClose(), 1500);
    }
  }

  const valueDiff = myValue > 0 || theirValue > 0
    ? Math.round(((myValue - theirValue) / Math.max(theirValue, 1)) * 100)
    : 0;

  const canPropose = partnerTeamId && (selectedMyPicks.size > 0 || selectedTheirPicks.size > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">Trade Draft Picks</h3>
            <p className="text-xs text-[var(--text-sec)]">
              On the clock: Pick #{currentOverallPick} (R{currentRound}.{currentPickInRound})
              {currentPickOwnerTeam ? ` — ${currentPickOwnerTeam.city} ${currentPickOwnerTeam.name}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-sec)] hover:bg-[var(--border)] transition-colors text-lg font-bold"
          >
            X
          </button>
        </div>

        {/* Success overlay */}
        {result?.success && (
          <div className="px-6 py-6 text-center">
            <div className="text-3xl mb-2">&#x2705;</div>
            <div className="text-lg font-bold text-green-700">Trade Accepted!</div>
            <p className="text-sm text-[var(--text-sec)] mt-1">Draft order has been updated.</p>
          </div>
        )}

        {!result?.success && (
          <div className="px-6 py-4 space-y-4">
            {/* Team selector */}
            <div>
              <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1.5">
                Trade Partner
              </label>
              <select
                value={partnerTeamId}
                onChange={e => {
                  setPartnerTeamId(e.target.value);
                  setSelectedTheirPicks(new Set());
                  setResult(null);
                }}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)]"
              >
                <option value="">Select a team...</option>
                {otherTeams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.city} {t.name} ({t.abbreviation})
                  </option>
                ))}
              </select>
            </div>

            {partnerTeamId && (
              <>
                {/* Two-column trade builder */}
                <div className="grid grid-cols-2 gap-4">
                  {/* You Send */}
                  <div>
                    <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2 flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black text-white"
                        style={{ backgroundColor: userTeam?.primaryColor ?? '#374151' }}
                      >
                        {userTeam?.abbreviation ?? '?'}
                      </div>
                      You Send
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {myAvailablePicks.length === 0 ? (
                        <p className="text-xs text-[var(--text-sec)] italic py-2">No available picks</p>
                      ) : (
                        myAvailablePicks.map(pk => {
                          const checked = selectedMyPicks.has(pk.id);
                          const overall = estimatePickOverall(pk, teams);
                          const origTeam = teams.find(t => t.id === pk.originalTeamId);
                          const value = pickTradeValue(pk, teams);
                          return (
                            <label
                              key={pk.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                                checked
                                  ? 'border-indigo-400 bg-indigo-50'
                                  : 'border-[var(--border)] hover:bg-[var(--bg)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMyPick(pk.id)}
                                className="accent-indigo-600"
                              />
                              <span className="font-semibold">R{pk.round} #{overall}</span>
                              <span className="text-[var(--text-sec)] text-xs">
                                {origTeam?.abbreviation ?? '???'}&apos;s
                              </span>
                              <span className="ml-auto text-xs text-[var(--text-sec)]">{value} pts</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* You Receive */}
                  <div>
                    <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2 flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-black text-white"
                        style={{ backgroundColor: partnerTeam?.primaryColor ?? '#374151' }}
                      >
                        {partnerTeam?.abbreviation ?? '?'}
                      </div>
                      You Receive
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {theirAvailablePicks.length === 0 ? (
                        <p className="text-xs text-[var(--text-sec)] italic py-2">No available picks</p>
                      ) : (
                        theirAvailablePicks.map(pk => {
                          const checked = selectedTheirPicks.has(pk.id);
                          const overall = estimatePickOverall(pk, teams);
                          const origTeam = teams.find(t => t.id === pk.originalTeamId);
                          const value = pickTradeValue(pk, teams);
                          return (
                            <label
                              key={pk.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                                checked
                                  ? 'border-green-400 bg-green-50'
                                  : 'border-[var(--border)] hover:bg-[var(--bg)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTheirPick(pk.id)}
                                className="accent-green-600"
                              />
                              <span className="font-semibold">R{pk.round} #{overall}</span>
                              <span className="text-[var(--text-sec)] text-xs">
                                {origTeam?.abbreviation ?? '???'}&apos;s
                              </span>
                              <span className="ml-auto text-xs text-[var(--text-sec)]">{value} pts</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Value summary bar */}
                {(myValue > 0 || theirValue > 0) && (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-bold">Trade Value</span>
                      <span className={`text-xs font-bold ${
                        valueDiff > 5 ? 'text-red-600' : valueDiff < -5 ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {valueDiff > 0 ? `You overpay by ${valueDiff}%` :
                         valueDiff < 0 ? `You gain ${Math.abs(valueDiff)}% value` :
                         'Even value'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-xs text-[var(--text-sec)] mb-1">You Send</div>
                        <div className="h-3 bg-indigo-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (myValue / Math.max(myValue, theirValue, 1)) * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs font-bold mt-0.5">{myValue} pts</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs text-[var(--text-sec)] mb-1">You Receive</div>
                        <div className="h-3 bg-green-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (theirValue / Math.max(myValue, theirValue, 1)) * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs font-bold mt-0.5">{theirValue} pts</div>
                      </div>
                    </div>
                    {myValue < theirValue * 0.95 && (
                      <p className="text-xs text-red-600 mt-2 font-medium">
                        AI will likely reject - your offer is below 95% of their value.
                      </p>
                    )}
                  </div>
                )}

                {/* Rejection reason */}
                {result && !result.success && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <div className="text-sm font-bold text-red-700">Trade Rejected</div>
                    <p className="text-xs text-red-600 mt-0.5">{result.reason ?? 'Unknown reason'}</p>
                  </div>
                )}

                {/* Propose button */}
                <div className="flex justify-end gap-3">
                  <Button variant="secondary" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!canPropose || submitted}
                    onClick={handlePropose}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Propose Trade
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
