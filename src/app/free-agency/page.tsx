'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { LEAGUE_MINIMUM_SALARY, LUXURY_TAX_RATE, computeLuxuryTax } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { initNegotiation, processOffer, type NegotiationState } from '@/lib/engine/negotiation';
import { POSITIONS, ROSTER_LIMITS, type Position } from '@/types';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function estimateSalary(overall: number, position?: string): number {
  const POSITION_SALARY_MULT: Record<string, number> = {
    QB: 1.6, WR: 1.0, CB: 1.0, DL: 1.05, LB: 0.95, OL: 1.0,
    S: 0.9, TE: 0.85, RB: 0.8, K: 0.25, P: 0.25,
  };
  const normalized = Math.max(0, (overall - 40) / 60);
  const baseSalary = Math.max(LEAGUE_MINIMUM_SALARY, Math.pow(normalized, 1.6) * 38);
  const posMult = position ? (POSITION_SALARY_MULT[position] ?? 1.0) : 1.0;
  let salary = baseSalary * posMult;
  if (position === 'K' || position === 'P') salary = Math.min(salary, 5.0);
  return Math.round(salary * 10) / 10;
}

export default function FreeAgencyPage() {
  const { phase, players, freeAgents, signFreeAgent, teams, userTeamId } = useGameStore();
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [negotiation, setNegotiation] = useState<NegotiationState | null>(null);
  const [offerSalary, setOfferSalary] = useState(0);
  const [offerYears, setOfferYears] = useState(3);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [walkedAwayIds, setWalkedAwayIds] = useState<Set<string>>(new Set());

  if (phase !== 'freeAgency') {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-5xl mb-4">✍️</div>
          <h2 className="text-2xl font-black mb-3">Free Agency</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'regular' ? 'Free agency opens in the offseason. Focus on the current season first.' :
             phase === 'playoffs' ? 'Free agency opens after the Draft phase.' :
             phase === 'draft' ? 'Free agency opens after the Draft. Finish your picks first.' :
             "Free agency hasn't started yet."}
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="text-sm text-blue-400 hover:underline">Go to Dashboard</a>
            <a href="/roster" className="text-sm text-blue-400 hover:underline">View Roster</a>
          </div>
        </div>
      </GameShell>
    );
  }

  const userTeam = teams.find(t => t.id === userTeamId);
  const capSpace = userTeam ? Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10 : 0;
  const overCap = capSpace < 0;
  const luxuryTax = userTeam ? computeLuxuryTax(userTeam.totalPayroll, userTeam.salaryCap) : 0;

  // Roster composition
  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);
  const positionCounts: Record<Position, number> = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    positionCounts[pos] = roster.filter(p => p.position === pos).length;
  }

  // Free agents list
  const allAgents = freeAgents
    .map(id => players.find(p => p.id === id)!)
    .filter(Boolean)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  let filteredAgents = allAgents.filter(p => !walkedAwayIds.has(p.id));
  if (filterPos !== 'ALL') {
    filteredAgents = filteredAgents.filter(p => p.position === filterPos);
  }
  if (affordableOnly) {
    filteredAgents = filteredAgents.filter(p => estimateSalary(p.ratings.overall, p.position) <= Math.max(capSpace, LEAGUE_MINIMUM_SALARY));
  }
  const agents = filteredAgents.slice(0, 60);

  function startNegotiation(player: typeof agents[0]) {
    const salary = estimateSalary(player.ratings.overall, player.position);
    const neg = initNegotiation(player, salary);
    setNegotiation(neg);
    setOfferSalary(salary);
    setOfferYears(neg.askingYears);
  }

  function submitOffer() {
    if (!negotiation || negotiation.outcome !== 'pending') return;
    const updated = processOffer(negotiation, offerSalary, offerYears);
    setNegotiation(updated);
    // If accepted, sign the player
    if (updated.outcome === 'accepted') {
      signFreeAgent(updated.playerId, updated.currentOfferSalary, updated.currentOfferYears);
    }
  }

  function walkAway() {
    if (negotiation) {
      setWalkedAwayIds(prev => new Set(prev).add(negotiation.playerId));
    }
    setNegotiation(null);
  }

  function closeNegotiation() {
    setNegotiation(null);
  }

  return (
    <GameShell>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-black">Free Agency</h2>
            <div className="text-sm text-[var(--text-sec)]">
              {allAgents.length} free agents available
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${capSpace > 10 ? 'text-green-400' : capSpace > 0 ? 'text-amber-400' : 'text-red-400'}`}>
              ${capSpace}M
            </div>
            <div className="text-xs text-[var(--text-sec)]">Cap Space</div>
          </div>
        </div>

        {/* Over-cap warning */}
        {overCap && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg">
            <div className="text-sm font-bold text-red-400">Over the Salary Cap</div>
            <div className="text-xs text-red-300/80 mt-1">
              ${Math.abs(capSpace).toFixed(1)}M over the cap · Luxury tax: ${luxuryTax}M ({LUXURY_TAX_RATE}x penalty) · Can only sign at league minimum (${LEAGUE_MINIMUM_SALARY}M/yr)
            </div>
          </div>
        )}

        <div className="grid grid-cols-[240px_1fr] gap-6">
          {/* ── Left sidebar: Roster Composition ─────── */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Roster ({roster.length})</CardTitle></CardHeader>
              <div className="space-y-1.5">
                {POSITIONS.map(pos => {
                  const count = positionCounts[pos];
                  const limits = ROSTER_LIMITS[pos];
                  const ideal = Math.ceil((limits.min + limits.max) / 2);
                  const belowMin = count < limits.min;
                  const belowIdeal = count < ideal;
                  const barPct = Math.min(100, (count / limits.max) * 100);
                  const barColor = belowMin ? 'bg-red-500' : belowIdeal ? 'bg-amber-500' : 'bg-green-500';
                  const textColor = belowMin ? 'text-red-400 font-bold' : belowIdeal ? 'text-amber-400' : 'text-[var(--text-sec)]';

                  return (
                    <button
                      key={pos}
                      onClick={() => setFilterPos(filterPos === pos ? 'ALL' : pos)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                        filterPos === pos ? 'bg-blue-600/20 border border-blue-500/40' : 'hover:bg-[var(--surface-2)] border border-transparent'
                      }`}
                    >
                      <span className="w-7 text-xs font-bold shrink-0">{pos}</span>
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                      <span className={`text-xs tabular-nums w-10 text-right ${textColor}`}>
                        {count}/{limits.max}
                      </span>
                      {belowMin && <span className="text-[10px] text-red-400">NEED</span>}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader><CardTitle>Cap Info</CardTitle></CardHeader>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-sec)]">Payroll</span>
                  <span className="font-mono">${userTeam?.totalPayroll.toFixed(1)}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-sec)]">Cap</span>
                  <span className="font-mono">${userTeam?.salaryCap}M</span>
                </div>
                <div className="border-t border-[var(--border)] pt-2 flex justify-between">
                  <span className="text-[var(--text-sec)]">Space</span>
                  <span className={`font-mono font-bold ${capSpace > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${capSpace}M
                  </span>
                </div>
                {luxuryTax > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Luxury Tax</span>
                    <span className="font-mono">${luxuryTax}M</span>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Right: Free agent table + negotiation ── */}
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 flex-wrap">
                <button
                  onClick={() => setFilterPos('ALL')}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  ALL
                </button>
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setFilterPos(filterPos === pos ? 'ALL' : pos)}
                    className={`px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setAffordableOnly(!affordableOnly)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                  affordableOnly
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)]'
                }`}
              >
                {affordableOnly ? 'Showing affordable' : 'Show affordable only'}
              </button>
            </div>

            {/* Negotiation panel */}
            {negotiation && (
              <Card>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">
                        Negotiating with {negotiation.playerName}
                      </h3>
                      <div className="text-sm text-[var(--text-sec)]">
                        {negotiation.position} · {negotiation.playerOverall} OVR
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
                      <div className="text-lg font-black text-green-400">SIGNED!</div>
                      <div className="text-sm text-green-300">
                        {negotiation.playerName} signed for ${negotiation.currentOfferSalary}M/yr for {negotiation.currentOfferYears} year{negotiation.currentOfferYears > 1 ? 's' : ''}
                      </div>
                      <Button size="sm" variant="secondary" onClick={closeNegotiation} className="mt-3">Done</Button>
                    </div>
                  )}

                  {negotiation.outcome === 'rejected' && (
                    <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 text-center mb-3">
                      <div className="text-lg font-black text-red-400">REJECTED</div>
                      <div className="text-sm text-red-300">
                        {negotiation.playerName} rejected your offer and walked away.
                      </div>
                      <Button size="sm" variant="secondary" onClick={walkAway} className="mt-3">Dismiss</Button>
                    </div>
                  )}

                  {/* Offer controls */}
                  {negotiation.outcome === 'pending' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-[var(--text-sec)] block mb-1">
                          Salary: <span className="font-mono font-bold text-[var(--text)]">${offerSalary.toFixed(1)}M/yr</span>
                          {overCap && offerSalary > LEAGUE_MINIMUM_SALARY && (
                            <span className="text-red-400 ml-2">(over cap — min only)</span>
                          )}
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
                          {[1, 2, 3, 4, 5].map(yr => (
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

                      <div className="flex gap-2 pt-1">
                        <Button onClick={submitOffer}>
                          Make Offer
                        </Button>
                        <Button variant="ghost" onClick={walkAway}>Walk Away</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Free agent table */}
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pl-2">Player</th>
                    <th className="text-center pb-3">Pos</th>
                    <th className="text-center pb-3">Age</th>
                    <th className="text-center pb-3">OVR</th>
                    <th className="text-center pb-3">POT</th>
                    <th className="text-right pb-3">Market</th>
                    <th className="text-right pb-3 pr-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(p => {
                    const salary = estimateSalary(p.ratings.overall, p.position);
                    const canAfford = !overCap || salary <= LEAGUE_MINIMUM_SALARY;
                    return (
                      <tr
                        key={p.id}
                        className={`border-t border-[var(--border)] transition-colors ${
                          negotiation?.playerId === p.id ? 'bg-blue-900/20' : 'hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <td className="py-2.5 pl-2">
                          <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-400 transition-colors">
                            {p.firstName} {p.lastName}
                          </button>
                        </td>
                        <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                        <td className="py-2.5 text-center">{p.age}</td>
                        <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>
                          {p.ratings.overall}
                        </td>
                        <td className={`py-2.5 text-center text-xs ${potentialColor(p.potential, p.experience)}`}>
                          {potentialLabel(p.potential, p.experience)}
                        </td>
                        <td className="py-2.5 text-right font-mono">${salary}M/yr</td>
                        <td className="py-2.5 text-right pr-2">
                          <Button
                            size="sm"
                            disabled={!!negotiation && negotiation.outcome === 'pending'}
                            onClick={() => startNegotiation(p)}
                          >
                            Negotiate
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-[var(--text-sec)]">
                        No free agents match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
