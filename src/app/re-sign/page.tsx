'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { LEAGUE_MINIMUM_SALARY, computeLuxuryTax, LUXURY_TAX_RATE } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { initNegotiation, processOffer, type NegotiationState } from '@/lib/engine/negotiation';
import { POSITIONS, ROSTER_LIMITS } from '@/types';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function positionStats(p: { position: string; stats: { gamesPlayed: number; passYards: number; passTDs: number; interceptions: number; rushYards: number; rushTDs: number; receptions: number; receivingYards: number; receivingTDs: number; tackles: number; sacks: number; defensiveINTs: number; fieldGoalsMade: number; fieldGoalAttempts: number } }): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return 'No games played';
  switch (p.position) {
    case 'QB': return `${s.gamesPlayed} GP · ${s.passYards} YDS · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.gamesPlayed} GP · ${s.rushYards} YDS · ${s.rushTDs} TD · ${s.receptions} REC`;
    case 'WR': case 'TE': return `${s.gamesPlayed} GP · ${s.receptions} REC · ${s.receivingYards} YDS · ${s.receivingTDs} TD`;
    case 'OL': return `${s.gamesPlayed} GP`;
    case 'DL': case 'LB': return `${s.gamesPlayed} GP · ${s.tackles} TKL · ${s.sacks} SCK`;
    case 'CB': case 'S': return `${s.gamesPlayed} GP · ${s.tackles} TKL · ${s.defensiveINTs} INT`;
    case 'K': return `${s.gamesPlayed} GP · ${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG`;
    case 'P': return `${s.gamesPlayed} GP`;
    default: return `${s.gamesPlayed} GP`;
  }
}

type ReSignResult = 'accepted' | 'rejected' | 'passed';
type NegMode = 'extend' | 'restructure';

export default function ReSignPage() {
  const { phase, players, teams, userTeamId, resigningPlayers, resignPlayer, passOnResigning } = useGameStore();
  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);

  const [results, setResults] = useState<Record<string, ReSignResult>>({});
  const [negotiation, setNegotiation] = useState<NegotiationState | null>(null);
  const [negMode, setNegMode] = useState<NegMode>('extend');
  const [offerSalary, setOfferSalary] = useState(0);
  const [offerYears, setOfferYears] = useState(3);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  if (phase !== 'resigning') {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-5xl mb-4">✍️</div>
          <h2 className="text-2xl font-black mb-3">Re-signing Window</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'regular' ? 'Re-signing opens after the playoffs. Focus on the current season first.' :
             phase === 'playoffs' ? 'Re-signing opens after the Super Bowl.' :
             phase === 'draft' ? 'The re-signing window has closed. Check Free Agency for available players.' :
             phase === 'freeAgency' ? 'The re-signing window has closed. Sign free agents instead.' :
             "The re-signing window isn't open yet."}
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/" className="text-sm text-blue-400 hover:underline">Go to Dashboard</Link>
            <Link href="/roster" className="text-sm text-blue-400 hover:underline">View Roster</Link>
          </div>
        </div>
      </GameShell>
    );
  }

  const userTeam = teams.find(t => t.id === userTeamId);
  const capSpace = userTeam ? Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10 : 0;
  const luxuryTax = userTeam ? computeLuxuryTax(userTeam.totalPayroll, userTeam.salaryCap) : 0;

  function startNegotiation(playerId: string, mode: NegMode) {
    const entry = resigningPlayers.find(e => e.playerId === playerId);
    const player = players.find(p => p.id === playerId);
    if (!entry || !player) return;

    setNegMode(mode);
    setActivePlayerId(playerId);

    if (mode === 'extend') {
      // Extension: player wants askingSalary for askingYears
      const neg = initNegotiation(player, entry.askingSalary);
      // Override asking years from the entry
      neg.askingYears = entry.askingYears;
      neg.messages = [{
        sender: 'player',
        text: `I'm looking for around $${entry.askingSalary}M/yr for ${entry.askingYears} year${entry.askingYears > 1 ? 's' : ''}. What can you offer?`,
        type: 'neutral',
      }];
      setNegotiation(neg);
      setOfferSalary(entry.askingSalary);
      setOfferYears(entry.askingYears);
    } else {
      // Restructure: converts salary to signing bonus prorated over more years.
      // Player gets more total guaranteed money (security), team gets lower annual cap hit.
      // Total contract value increases ~15-25% because player demands extra years of security.
      const currentSalary = player.contract.salary;
      const currentYearsLeft = player.contract.yearsLeft;
      const addedYears = Math.max(1, Math.min(3, currentYearsLeft <= 1 ? 2 : 1));
      const newYears = currentYearsLeft + addedYears;
      // Player wants ~85-90% of current annual salary (slight discount for extra years/security)
      const discountPct = 0.85 + (addedYears === 1 ? 0.05 : 0);
      const newAnnual = Math.round(currentSalary * discountPct * 10) / 10;
      const capSaved = Math.round((currentSalary - newAnnual) * 10) / 10;

      const neg = initNegotiation(player, newAnnual);
      neg.askingYears = newYears;
      neg.messages = [{
        sender: 'player',
        text: `I'd consider restructuring. My current deal is $${currentSalary}M/yr with ${currentYearsLeft} year${currentYearsLeft > 1 ? 's' : ''} left. I'd take $${newAnnual}M/yr if you extend me to ${newYears} years — that saves you $${capSaved}M/yr in cap space.`,
        type: 'neutral',
      }];
      setNegotiation(neg);
      setOfferSalary(newAnnual);
      setOfferYears(newYears);
    }
  }

  function submitOffer() {
    if (!negotiation || negotiation.outcome !== 'pending' || !activePlayerId) return;
    const updated = processOffer(negotiation, offerSalary, offerYears);
    setNegotiation(updated);
    if (updated.outcome === 'accepted') {
      resignPlayer(activePlayerId, updated.currentOfferSalary, updated.currentOfferYears);
      setResults(prev => ({ ...prev, [activePlayerId]: 'accepted' }));
    } else if (updated.outcome === 'rejected') {
      setResults(prev => ({ ...prev, [activePlayerId]: 'rejected' }));
    }
  }

  function closeNegotiation() {
    // Walking away from negotiation = letting the player go
    if (activePlayerId && !results[activePlayerId]) {
      handlePass(activePlayerId);
    }
    setNegotiation(null);
    setActivePlayerId(null);
  }

  function handlePass(playerId: string) {
    passOnResigning(playerId);
    setResults(prev => ({ ...prev, [playerId]: 'passed' }));
  }

  const completedIds = new Set(Object.keys(results));
  const activeEntries = resigningPlayers.filter(e => !completedIds.has(e.playerId));

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black">Re-signing Window</h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">
              Extend or restructure your expiring contracts before they hit free agency.
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${capSpace > 10 ? 'text-green-400' : capSpace > 0 ? 'text-amber-400' : 'text-red-400'}`}>
              ${capSpace}M
            </div>
            <div className="text-xs text-[var(--text-sec)]">Cap Space</div>
            {luxuryTax > 0 && (
              <div className="text-xs text-red-400 mt-0.5">Luxury Tax: ${luxuryTax}M</div>
            )}
          </div>
        </div>

        {/* Negotiation panel */}
        {negotiation && (
          <Card className="mb-4">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-lg">
                    {negMode === 'extend' ? 'Extension' : 'Restructure'} — {negotiation.playerName}
                  </h3>
                  <div className="text-sm text-[var(--text-sec)]">
                    {negotiation.position} · {negotiation.playerOverall} OVR
                    {negMode === 'restructure' && (
                      <span className="ml-2 text-amber-400">
                        (Restructuring lowers annual hit, extends commitment)
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={closeNegotiation}>✕</Button>
              </div>

              {/* Message feed */}
              <div className="bg-[var(--surface-2)] rounded-lg p-3 mb-4 max-h-48 overflow-y-auto space-y-2">
                {negotiation.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-3 py-2 ${
                      msg.type === 'result' && negotiation.outcome === 'accepted'
                        ? 'bg-green-900/30 border border-green-700/50 text-green-300'
                        : msg.type === 'result' && negotiation.outcome === 'rejected'
                        ? 'bg-red-900/30 border border-red-700/50 text-red-300'
                        : msg.type === 'counter'
                        ? 'bg-amber-900/20 border border-amber-700/30 text-amber-200'
                        : msg.type === 'negative'
                        ? 'bg-red-900/10 border border-red-800/20 text-red-300/90'
                        : msg.sender === 'system'
                        ? 'bg-blue-900/10 border border-blue-800/20 text-blue-300/90'
                        : 'bg-[var(--surface)] text-[var(--text)]'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] block mb-0.5">
                      {msg.sender === 'player' ? negotiation.playerName : 'You'}
                    </span>
                    {msg.text}
                  </div>
                ))}
              </div>

              {/* Outcome banners */}
              {negotiation.outcome === 'accepted' && (
                <div className="bg-green-900/30 border border-green-600 rounded-lg p-4 text-center mb-3">
                  <div className="text-lg font-black text-green-400">
                    {negMode === 'extend' ? 'EXTENDED!' : 'RESTRUCTURED!'}
                  </div>
                  <div className="text-sm text-green-300">
                    {negotiation.playerName} agreed to ${negotiation.currentOfferSalary}M/yr for {negotiation.currentOfferYears} year{negotiation.currentOfferYears > 1 ? 's' : ''}
                  </div>
                  <Button size="sm" variant="secondary" onClick={closeNegotiation} className="mt-3">Done</Button>
                </div>
              )}

              {negotiation.outcome === 'rejected' && (
                <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 text-center mb-3">
                  <div className="text-lg font-black text-red-400">REJECTED</div>
                  <div className="text-sm text-red-300">
                    {negotiation.playerName} rejected your offer. They'll hit free agency.
                  </div>
                  <Button size="sm" variant="secondary" onClick={closeNegotiation} className="mt-3">Dismiss</Button>
                </div>
              )}

              {/* Offer controls */}
              {negotiation.outcome === 'pending' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-sec)] block mb-1">
                      Salary: <span className="font-mono font-bold text-[var(--text)]">${offerSalary.toFixed(1)}M/yr</span>
                    </label>
                    <input
                      type="range"
                      min={LEAGUE_MINIMUM_SALARY}
                      max={Math.max(negotiation.askingSalary * 1.3, 2)}
                      step={0.1}
                      value={offerSalary}
                      onChange={e => setOfferSalary(Math.round(parseFloat(e.target.value) * 10) / 10)}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-sec)]">
                      <span>${LEAGUE_MINIMUM_SALARY}M</span>
                      <span className="text-amber-400">Asking: ${negotiation.askingSalary}M</span>
                      <span>${(negotiation.askingSalary * 1.3).toFixed(1)}M</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-[var(--text-sec)] block mb-1">Years</label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6].map(yr => (
                        <button
                          key={yr}
                          onClick={() => setOfferYears(yr)}
                          className={`px-3 py-1.5 text-sm rounded font-medium transition-colors ${
                            offerYears === yr
                              ? 'bg-blue-600 text-white'
                              : 'bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)]'
                          }`}
                        >
                          {yr}yr
                        </button>
                      ))}
                    </div>
                  </div>

                  {negMode === 'restructure' && (
                    <div className="text-xs text-[var(--text-sec)] bg-[var(--surface-2)] rounded-lg p-2">
                      Cap impact: {(() => {
                        const player = players.find(p => p.id === activePlayerId);
                        if (!player) return '—';
                        const saving = player.contract.salary - offerSalary;
                        return saving > 0
                          ? <span className="text-green-400">Saves ${saving.toFixed(1)}M/yr cap space</span>
                          : <span className="text-red-400">Adds ${Math.abs(saving).toFixed(1)}M/yr cap hit</span>;
                      })()}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button onClick={submitOffer}>Make Offer</Button>
                    <Button variant="ghost" onClick={closeNegotiation}>Walk Away</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {activeEntries.length === 0 && Object.keys(results).length === 0 ? (
          <Card>
            <div className="text-center py-12 text-[var(--text-sec)]">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold">No expiring contracts this offseason.</p>
              <p className="text-sm mt-1">All your players have at least 2 years remaining.</p>
            </div>
          </Card>
        ) : (
          <div className="flex gap-4">
            {/* Roster Composition sidebar */}
            <div className="shrink-0 w-48">
              <Card className="sticky top-4">
                <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-3">Roster Composition</div>
                <div className="space-y-1.5">
                  {POSITIONS.map(pos => {
                    const count = roster.filter(p => p.position === pos).length;
                    const limits = ROSTER_LIMITS[pos];
                    const isBelowMin = count < limits.min;
                    const isAtMax = count >= limits.max;
                    // Count expiring players at this position
                    const expiringAtPos = resigningPlayers.filter(e => {
                      const pl = players.find(p => p.id === e.playerId);
                      return pl?.position === pos;
                    }).length;
                    const wouldHave = count - expiringAtPos + Object.entries(results).filter(([id, r]) => {
                      const pl = players.find(p => p.id === id);
                      return pl?.position === pos && r === 'accepted';
                    }).length;
                    return (
                      <div key={pos} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-sec)] w-6">{pos}</span>
                          <div className="w-16 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isBelowMin ? 'bg-red-500' : isAtMax ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, (count / limits.max) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-bold ${isBelowMin ? 'text-red-400' : isAtMax ? 'text-amber-400' : 'text-green-400'}`}>
                            {count}
                          </span>
                          <span className="text-[10px] text-[var(--text-sec)]">/{limits.max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-sec)]">
                  <div className="flex justify-between">
                    <span>Total</span>
                    <span className="font-bold text-[var(--text)]">{roster.length}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Expiring</span>
                    <span className="font-bold text-amber-400">{resigningPlayers.length}</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-sec)] space-y-0.5">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Below minimum</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Healthy</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> At maximum</div>
                  </div>
                </div>
              </Card>
            </div>

          <div className="flex-1 space-y-4">
            {/* Active re-signing entries */}
            {activeEntries.map(entry => {
              const player = players.find(p => p.id === entry.playerId);
              if (!player) return null;
              const isActive = activePlayerId === entry.playerId;

              return (
                <Card key={entry.playerId} className={isActive ? 'ring-1 ring-blue-500' : ''}>
                  <div className="flex gap-4 items-start">
                    {/* Player info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <button onClick={() => setSelectedPlayerId(player.id)} className="font-bold text-lg hover:text-blue-400 transition-colors">
                          {player.firstName} {player.lastName}
                        </button>
                        <Badge>{player.position}</Badge>
                        <span className={`font-bold ${ratingColor(player.ratings.overall)}`}>{player.ratings.overall} OVR</span>
                      </div>
                      <div className="flex gap-4 text-sm text-[var(--text-sec)]">
                        <span>Age {player.age}</span>
                        <span>{player.experience}yr exp</span>
                        <span className="text-amber-400">Current: ${player.contract.salary}M/yr · {player.contract.yearsLeft}yr left</span>
                        <span className={potentialColor(player.potential, player.experience)}>
                          {potentialLabel(player.potential, player.experience)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-[var(--text-sec)]">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]/60 mr-2">Last Season</span>
                        {positionStats(player)}
                      </div>
                      <div className="mt-2 p-2 bg-[var(--surface-2)] rounded-lg inline-flex items-center gap-2">
                        <span className="text-xs text-[var(--text-sec)]">Asking:</span>
                        <span className="text-sm font-bold text-amber-400">
                          ${entry.askingSalary}M/yr × {entry.askingYears}yr
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0 mt-1">
                      <Button
                        size="sm"
                        onClick={() => startNegotiation(entry.playerId, 'extend')}
                        disabled={!!negotiation && negotiation.outcome === 'pending'}
                      >
                        Extend
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => startNegotiation(entry.playerId, 'restructure')}
                        disabled={!!negotiation && negotiation.outcome === 'pending'}
                      >
                        Restructure
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePass(entry.playerId)}
                        disabled={!!negotiation && negotiation.outcome === 'pending'}
                      >
                        Let Walk
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* Completed entries */}
            {Object.entries(results).map(([playerId, result]) => {
              const player = players.find(p => p.id === playerId);
              if (!player) return null;
              return (
                <div
                  key={playerId}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    result === 'accepted' ? 'border-green-500/30 bg-green-500/5' :
                    result === 'rejected' ? 'border-red-500/30 bg-red-500/5' :
                    'border-[var(--border)] opacity-50'
                  }`}
                >
                  <span className="text-lg">
                    {result === 'accepted' ? '✅' : result === 'rejected' ? '❌' : '⏭️'}
                  </span>
                  <span className="font-semibold">{player.firstName} {player.lastName}</span>
                  <Badge>{player.position}</Badge>
                  <span className="text-sm text-[var(--text-sec)]">
                    {result === 'accepted'
                      ? `Re-signed — ${player.contract.salary}M/yr × ${player.contract.yearsLeft}yr`
                      : result === 'rejected'
                      ? 'Rejected offer — entering free agency'
                      : 'Passed — entering free agency'}
                  </span>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* Tips card */}
        {activeEntries.length > 0 && !negotiation && (
          <Card className="mt-6">
            <CardHeader><CardTitle>Tips</CardTitle></CardHeader>
            <ul className="text-sm text-[var(--text-sec)] space-y-1">
              <li>• <strong className="text-[var(--text)]">Extend</strong> — negotiate a new contract at or near their asking price.</li>
              <li>• <strong className="text-[var(--text)]">Restructure</strong> — spread their money over more years for a lower annual cap hit.</li>
              <li>• Veterans (32+) may accept a discount. Younger stars will push for market value.</li>
              <li>• <strong className="text-[var(--text)]">Let Walk</strong> to let them test free agency — but other teams may sign them.</li>
            </ul>
          </Card>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
