'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { AdSlot } from '@/components/AdSlot';
import { useGameStore } from '@/lib/engine/store';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { coarseOvrBucket } from '@/lib/subscription';
import { PlayerModal } from '@/components/game/PlayerModal';
import { LEAGUE_MINIMUM_SALARY, LUXURY_TAX_RATE, computeLuxuryTax, faPriceDecay, estimateSalary, capInflationFactor } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { SpectatorBanner } from '@/components/game/SpectatorBanner';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { getActiveRoster } from '@/lib/engine/roster';
import { initNegotiation, processOffer, type NegotiationState } from '@/lib/engine/negotiation';
import { generateFAEvaluation, type FAEvaluation } from '@/lib/engine/personnelReport';
import { POSITIONS, ROSTER_LIMITS, type Position, type Player } from '@/types';

/**
 * Determines if a free agent will accept a veteran minimum deal.
 * - Day 1-24: Only low-OVR players (≤55) accept minimums
 * - Day 25-27: Players ≤65 OVR start accepting
 * - Day 28-29: Players ≤75 OVR accept
 * - Day 30: ALL remaining players accept (end of FA, take what you can get)
 */
function willAcceptMinimum(player: Player, faDay: number): boolean {
  if (faDay >= 30) return true;
  if (faDay >= 28 && player.ratings.overall <= 75) return true;
  if (faDay >= 25 && player.ratings.overall <= 65) return true;
  if (player.ratings.overall <= 55) return true;
  // Players with age 33+ are more willing to accept minimums earlier
  if (player.age >= 33 && faDay >= 20) return true;
  return false;
}

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function positionStats(p: { position: string; stats: { gamesPlayed: number; passYards: number; passTDs: number; interceptions: number; rushYards: number; rushTDs: number; receptions: number; receivingYards: number; receivingTDs: number; tackles: number; sacks: number; defensiveINTs: number; fieldGoalsMade: number; fieldGoalAttempts: number; sacksAllowed: number; passBlocks: number } }): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return '—';
  switch (p.position) {
    case 'QB': return `${s.passYards} YDS / ${s.passTDs} TD / ${s.interceptions} INT`;
    case 'RB': return `${s.rushYards} YDS / ${s.rushTDs} TD`;
    case 'WR': case 'TE': return `${s.receptions} REC / ${s.receivingYards} YDS / ${s.receivingTDs} TD`;
    case 'OL': return `${s.gamesPlayed} GP / ${s.sacksAllowed ?? 0} SA / ${(s.passBlocks ?? 0) > 0 ? ((s.sacksAllowed ?? 0) / s.passBlocks * 100).toFixed(1) : '0.0'}%`;
    case 'DL': case 'LB': return `${s.tackles} TKL / ${s.sacks} SCK`;
    case 'CB': case 'S': return `${s.tackles} TKL / ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG${s.fieldGoalAttempts > 0 ? ` (${Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100)}%)` : ''}`;
    case 'P': return `${s.gamesPlayed} GP`;
    default: return `${s.gamesPlayed} GP`;
  }
}


function recColor(rec: FAEvaluation['recommendation']): string {
  switch (rec) {
    case 'Must Sign': return 'text-green-700 bg-green-50 border-green-200';
    case 'Strong Target': return 'text-blue-700 bg-blue-50 border-blue-200';
    case 'Worth Considering': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'Depth Only': return 'text-[var(--text-sec)] bg-[var(--surface-2)] border-[var(--border)]';
    case 'Pass': return 'text-red-600 bg-red-50 border-red-200';
  }
}

function FAEvaluationPanel({ player, roster, capSpace, marketSalary }: {
  player: Player;
  roster: Player[];
  capSpace: number;
  marketSalary: number;
}) {
  const evaluation = generateFAEvaluation(player, roster, capSpace, marketSalary);

  return (
    <div className="space-y-3">
      {/* Header: recommendation badge + fit score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border ${recColor(evaluation.recommendation)}`}>
            {evaluation.recommendation === 'Must Sign' && '🎯'}
            {evaluation.recommendation === 'Strong Target' && '✅'}
            {evaluation.recommendation === 'Worth Considering' && '🤔'}
            {evaluation.recommendation === 'Depth Only' && '📋'}
            {evaluation.recommendation === 'Pass' && '❌'}
            {' '}{evaluation.recommendation}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">Fit Score</span>
            <div className="w-20 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${evaluation.fitScore >= 70 ? 'bg-green-500' : evaluation.fitScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${evaluation.fitScore}%` }}
              />
            </div>
            <span className="text-xs font-bold">{evaluation.fitScore}</span>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)]">Front Office Evaluation</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Impact */}
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Impact Assessment</div>
          <p className="text-sm leading-relaxed">{evaluation.impactDescription}</p>
        </div>

        {/* Roster comparison */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Roster Comparison</div>
          <p className="text-sm text-[var(--text)]">{evaluation.comparisons}</p>
        </div>
      </div>

      {/* Contract verdict + concerns */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Contract Analysis</div>
          <p className="text-sm">{evaluation.contractVerdict}</p>
        </div>
        {evaluation.concerns.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1">Concerns</div>
            <ul className="space-y-0.5">
              {evaluation.concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-amber-600">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* GM Quote */}
      <div className="border-l-2 border-blue-400 pl-3">
        <p className="text-sm italic text-[var(--text)]">{evaluation.foQuote}</p>
        <span className="text-[10px] text-[var(--text-sec)]">— Front Office</span>
      </div>
    </div>
  );
}

export default function FreeAgencyPage() {
  const { phase, players, freeAgents, signFreeAgent, teams, userTeamId, faDay, faRefusals, advanceFADay, advanceFAWeek, pursuitState, intelReportFA } = useGameStore();
  const isSpectator = useGameStore(s => s.isSpectator ?? false);
  const { hasScouting, scoutingAllocations, tier } = useSubscription();

  // Also support regular season FA (no pursuit during regular season)
  const effectivePursuitState = phase === 'freeAgency'
    ? (pursuitState ?? { pursuitPoints: scoutingAllocations.intelReports, maxPursuitPoints: scoutingAllocations.intelReports, intelReports: {} })
    : null;

  const [affordableOnly, setAffordableOnly] = useState(false);
  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [negotiation, setNegotiation] = useState<NegotiationState | null>(null);
  const [offerSalary, setOfferSalary] = useState(0);
  const [offerYears, setOfferYears] = useState(3);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [walkedAwayIds, setWalkedAwayIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'salary'>('ovr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const msgFeedRef = useRef<HTMLDivElement>(null);

  // Auto-initialize pursuitState for existing saves that entered FA before
  // this feature was added. Per-tier allocation: free=3, premium=9,
  // founder/admin=unlimited (sentinel value, see subscription.ts).
  useEffect(() => {
    if (phase === 'freeAgency' && !pursuitState) {
      useGameStore.setState({
        pursuitState: {
          pursuitPoints: scoutingAllocations.intelReports,
          maxPursuitPoints: scoutingAllocations.intelReports,
          intelReports: {},
        },
      });
    }
  }, [phase, pursuitState, scoutingAllocations.intelReports]);

  // Auto-scroll message feed to bottom when new messages arrive
  useEffect(() => {
    if (msgFeedRef.current && negotiation?.messages.length) {
      msgFeedRef.current.scrollTop = msgFeedRef.current.scrollHeight;
    }
  }, [negotiation?.messages.length]);

  // Auto-dismiss rejected negotiations after 2 seconds and block re-negotiation.
  // Declared with all other hooks — the early return below would otherwise
  // trip React's hook-order rule (#310) when the page mounts while phase
  // isn't yet 'freeAgency' and then transitions into it.
  useEffect(() => {
    if (negotiation?.outcome === 'rejected') {
      const timer = setTimeout(() => {
        setWalkedAwayIds(prev => new Set(prev).add(negotiation.playerId));
        setNegotiation(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [negotiation?.outcome, negotiation?.playerId]);

  if (isSpectator) {
    // Spectator: read-only FA view, but still let the user advance days/weeks
    // so the offseason actually progresses. Without these buttons the league
    // gets stuck in FA forever (.akrav 4/30 03:18, somedude4759 4/30 08:02).
    const inFa = phase === 'freeAgency';
    const recentSignings = useGameStore.getState().newsItems
      .filter(n => n.type === 'signing')
      .slice(-12)
      .reverse();
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto">
          <SpectatorBanner />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center">
            <div className="text-3xl mb-3">✍️</div>
            <h2 className="text-xl font-black mb-1">Free Agency — Read-only</h2>
            <p className="text-sm text-[var(--text-sec)] max-w-md mx-auto mb-4">
              AI teams handle all FA signings in spectator mode. Advance days or weeks to watch the league move.
            </p>
            {inFa ? (
              <div className="flex flex-wrap gap-2 justify-center mb-2">
                <Button onClick={advanceFADay} disabled={faDay >= 30}>
                  Advance Day {faDay >= 30 ? '(FA closed)' : `(${faDay}/30)`}
                </Button>
                <Button onClick={advanceFAWeek} disabled={faDay >= 30} variant="secondary">
                  Advance Week
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-sec)]">
                Free agency opens after the Draft phase ends.
              </p>
            )}
          </div>
          {recentSignings.length > 0 && (
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-sec)] mb-2">
                Recent Signings
              </div>
              <ul className="space-y-1.5 text-sm">
                {recentSignings.map(n => (
                  <li key={n.id} className="text-[var(--text)]">
                    {n.headline}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </GameShell>
    );
  }

  // Allow free agent signings during regular season and freeAgency phase (teams can sign FAs anytime)
  const canSignFreeAgents = phase === 'freeAgency' || phase === 'regular';

  if (!canSignFreeAgents) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-5xl mb-4">✍️</div>
          <h2 className="text-2xl font-black mb-3">Free Agency</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'playoffs' ? 'Free agency opens after the Draft phase.' :
             phase === 'draft' ? 'Free agency opens after the Draft. Finish your picks first.' :
             "Free agency isn't available right now."}
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="text-sm text-blue-600 hover:underline">Go to Dashboard</a>
            <a href="/roster" className="text-sm text-blue-600 hover:underline">View Roster</a>
          </div>
        </div>
      </GameShell>
    );
  }

  const userTeam = teams.find(t => t.id === userTeamId);
  const ci = userTeam ? capInflationFactor(userTeam.salaryCap) : 1.0;
  const capSpace = userTeam ? Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10 : 0;
  // "overCap" used to mean strictly negative cap space. The engine already
  // exempts league-minimum signings from the cap check, but with $0.5M of
  // cap space the slider was defaulting to the player's full asking salary
  // and the cap check rejected anything above $0.75M (Tyler 4/28 report).
  // Treat capSpace < league min as the same locked-at-minimum experience
  // that strictly-over-cap teams get.
  const overCap = capSpace < LEAGUE_MINIMUM_SALARY;
  const luxuryTax = userTeam ? computeLuxuryTax(userTeam.totalPayroll, userTeam.salaryCap) : 0;

  // Roster composition — intersect with team.roster so PS (and later IR)
  // don't inflate the active-53 count that gates signings.
  const roster = userTeam ? getActiveRoster(userTeam, players) : [];
  const positionCounts: Record<Position, number> = {} as Record<Position, number>;
  for (const pos of POSITIONS) {
    positionCounts[pos] = roster.filter(p => p.position === pos).length;
  }

  // Free agents list
  const decay = phase === 'freeAgency' ? faPriceDecay(faDay) : 1.0;

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'pos' ? 'asc' : 'desc'); }
  }
  function sortArrow(key: typeof sortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const allAgents = (freeAgents ?? [])
    .map(id => players.find(p => p.id === id)!)
    .filter(Boolean)
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * (`${a.lastName} ${a.firstName}`).localeCompare(`${b.lastName} ${b.firstName}`);
        case 'pos': return dir * a.position.localeCompare(b.position);
        case 'age': return dir * (a.age - b.age);
        case 'ovr': return dir * (a.ratings.overall - b.ratings.overall);
        case 'pot': return dir * (a.potential - b.potential);
        case 'salary': {
          const aSal = estimateSalary(a.ratings.overall, a.position, a.age, a.potential, ci) * decay;
          const bSal = estimateSalary(b.ratings.overall, b.position, b.age, b.potential, ci) * decay;
          return dir * (aSal - bSal);
        }
        default: return 0;
      }
    });

  let filteredAgents = allAgents.filter(p => !walkedAwayIds.has(p.id));
  if (filterPos !== 'ALL') {
    filteredAgents = filteredAgents.filter(p => p.position === filterPos);
  }
  if (affordableOnly) {
    // Over the cap → only show players whose asking price (market * decay)
    // is at or near the league minimum, since that's all you can offer.
    // Under the cap → show players whose market fits within actual space.
    const maxAffordable = capSpace <= LEAGUE_MINIMUM_SALARY
      ? LEAGUE_MINIMUM_SALARY * 1.5  // tight: only players asking ~$1.1M or less
      : capSpace;
    filteredAgents = filteredAgents.filter(p => {
      const market = estimateSalary(p.ratings.overall, p.position, p.age, p.potential, ci) * decay;
      return market <= maxAffordable;
    });
    // When over the cap, sort cheapest first so signable players are at the top.
    // When under the cap, keep the user's selected sort order (default: OVR desc).
    if (capSpace <= LEAGUE_MINIMUM_SALARY) {
      filteredAgents.sort((a, b) => {
        const aM = estimateSalary(a.ratings.overall, a.position, a.age, a.potential, ci) * decay;
        const bM = estimateSalary(b.ratings.overall, b.position, b.age, b.potential, ci) * decay;
        return aM - bM;
      });
    }
  }
  // Show up to 300 — enough to surface low-OVR depth bodies that would
  // otherwise sit below the top-60 cutoff when sorted by OVR descending.
  const agents = filteredAgents.slice(0, 300);

  function startNegotiation(player: typeof agents[0]) {
    if (faRefusals.includes(player.id)) return;
    const baseSal = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
    const salary = Math.round(baseSal * decay * 10) / 10;
    const hasIntel = !!effectivePursuitState?.intelReports[player.id];
    const userTeamData = teams.find(t => t.id === userTeamId);
    const totalGames = userTeamData ? userTeamData.record.wins + userTeamData.record.losses + (userTeamData.record.ties ?? 0) : 0;
    const winPct = totalGames > 0 ? (userTeamData!.record.wins + (userTeamData!.record.ties ?? 0) * 0.5) / totalGames : 0.5;
    const rosterAtPos = players.filter(p => p.teamId === userTeamId && p.position === player.position && !p.retired);
    const wouldStart = rosterAtPos.length === 0 || rosterAtPos.every(p => p.ratings.overall < player.ratings.overall);
    const wasOnTeam = (player as any).draftTeamId === userTeamId || (player as any).acquiredVia === 'draft';
    const neg = initNegotiation(player, salary, 'freeAgency', {
      hasIntelReport: hasIntel,
      userTeamContext: { winPct, wouldStart, wasOnTeam },
    });
    setNegotiation(neg);
    // Default offer to asking price (or league minimum if over cap)
    setOfferSalary(overCap ? LEAGUE_MINIMUM_SALARY : neg.askingSalary);
    setOfferYears(neg.askingYears);
  }

  function submitOffer() {
    if (!negotiation || negotiation.outcome !== 'pending') return;
    const updated = processOffer(negotiation, offerSalary, offerYears);
    setNegotiation(updated);
    // If accepted, sign the player
    if (updated.outcome === 'accepted') {
      const error = signFreeAgent(updated.playerId, updated.currentOfferSalary, updated.currentOfferYears);
      if (error) {
        // Signing blocked — surface the specific reason so users know
        // whether it's a cap, roster, or ask-too-high issue.
        setNegotiation({
          ...updated,
          outcome: 'rejected',
          messages: [...updated.messages, { sender: 'system', text: `Signing blocked — ${error}`, type: 'negative' }],
        });
        return;
      }
      // Auto-dismiss after a brief moment so the user sees the confirmation
      setTimeout(() => setNegotiation(null), 1500);
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
        {!hasScouting && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
            <div className="text-xs text-blue-800">
              🔒 <strong>Premium</strong> reveals exact OVR, potential, contract estimates, and pursuit intel for every free agent. Free shows name, position, age, and a coarse OVR bucket.
            </div>
            <Link href="/pricing" className="text-xs font-bold text-blue-700 hover:underline whitespace-nowrap">
              Upgrade →
            </Link>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-black">{phase === 'regular' ? 'Sign Free Agents' : 'Free Agency'}</h2>
            <div className="text-sm text-[var(--text-sec)]">
              {phase === 'freeAgency' && (
                <span className="font-semibold text-blue-600 mr-2">Day {faDay} of 30</span>
              )}
              {allAgents.length} free agents available
              {phase === 'regular' ? ' · In-season signings' : ''}
              {phase === 'freeAgency' && decay < 1.0 && (
                <span className="text-amber-600 ml-2">· Prices at {Math.round(decay * 100)}%</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {phase === 'freeAgency' && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={advanceFADay}
                  disabled={faDay >= 30}
                >
                  Skip Day →
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={advanceFAWeek}
                  disabled={faDay >= 30}
                >
                  Skip Week ⏩
                </Button>
              </div>
            )}
            {effectivePursuitState && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--text-sec)]">Intel:</span>
                {scoutingAllocations.isUnlimited ? (
                  <span className="text-sm font-bold text-purple-700">∞</span>
                ) : (
                  <>
                    <span className="text-sm font-bold">{effectivePursuitState.pursuitPoints}/{effectivePursuitState.maxPursuitPoints}</span>
                    {(effectivePursuitState.pursuitPoints ?? 0) === 0 && tier === 'free' && (
                      <Link href="/pricing" className="ml-1 text-[10px] font-bold text-blue-600 hover:underline">
                        Need more? →
                      </Link>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="text-right">
              <div className={`text-2xl font-black ${capSpace > 10 ? 'text-green-600' : capSpace > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                ${capSpace}M
              </div>
              <div className="text-xs text-[var(--text-sec)]">Cap Space</div>
            </div>
          </div>
        </div>

        {/* Free-tier ad slot. Hidden for premium. */}
        <AdSlot size="leaderboard" slotId="fa-top" />

        {/* FA Day progress bar */}
        {phase === 'freeAgency' && (
          <div className="mb-4">
            <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${(faDay / 30) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-sec)] mt-1">
              <span>Day 1</span>
              <span>{faDay <= 5 ? 'Full Market' : faDay <= 15 ? 'Market Cooling' : faDay <= 25 ? 'Prices Dropping' : 'Bargain Hunting'}</span>
              <span>Day 30</span>
            </div>
          </div>
        )}

        {/* Cap-strapped warning — fires for both strictly-over-cap and
            cap-space-below-league-min cases. Both reduce signings to the
            league-minimum exemption. */}
        {overCap && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-sm font-bold text-red-600">
              {capSpace < 0 ? 'Over the Salary Cap' : 'Cap-Strapped'}
            </div>
            <div className="text-xs text-red-600/80 mt-1">
              {capSpace < 0
                ? `$${Math.abs(capSpace).toFixed(1)}M over the cap · Luxury tax: $${luxuryTax}M (${LUXURY_TAX_RATE}x penalty) · `
                : `Only $${capSpace.toFixed(1)}M cap space — `}
              Can only sign at league minimum (${LEAGUE_MINIMUM_SALARY}M/yr)
            </div>
            <div className="text-xs text-red-600/60 mt-1">
              You can still negotiate — offer league minimum (${LEAGUE_MINIMUM_SALARY}M/yr). As FA progresses, more players will accept lower offers.
            </div>
          </div>
        )}

        {/* Roster Composition — top-level on mobile, hidden on md+ (sidebar has it) */}
        <div className="md:hidden mb-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold">Roster: {roster.length}/53</span>
              <span className={`text-sm font-mono font-bold ${capSpace > 0 ? 'text-green-600' : 'text-red-600'}`}>
                Cap: ${capSpace}M
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {POSITIONS.map(pos => {
                const count = positionCounts[pos];
                const limits = ROSTER_LIMITS[pos];
                const belowMin = count < limits.min;
                const ideal = Math.ceil((limits.min + limits.max) / 2);
                const belowIdeal = count < ideal;
                const bgColor = belowMin ? 'bg-red-50 border-red-300' : belowIdeal ? 'bg-amber-50 border-amber-300' : 'bg-green-50/50 border-[var(--border)]';
                const textColor = belowMin ? 'text-red-600' : belowIdeal ? 'text-amber-600' : 'text-[var(--text-sec)]';

                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setFilterPos(filterPos === pos ? 'ALL' : pos)}
                    className={`touch-manipulation flex items-center justify-between px-2 py-1.5 rounded border text-xs transition-colors ${
                      filterPos === pos ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : bgColor
                    }`}
                  >
                    <span className="font-bold">{pos}</span>
                    <span className={`tabular-nums ${filterPos === pos ? 'text-blue-600 font-bold' : textColor}`}>
                      {count}<span className="text-[10px] opacity-60">/{limits.max}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {(() => {
              const needPositions = POSITIONS.filter(pos => positionCounts[pos] < ROSTER_LIMITS[pos].min);
              return needPositions.length > 0 ? (
                <div className="mt-2 text-xs text-red-600 font-medium">
                  Needs: {needPositions.map(pos => `${pos} (${positionCounts[pos]}/${ROSTER_LIMITS[pos].min})`).join(' · ')}
                </div>
              ) : null;
            })()}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
          {/* ── Left sidebar: Roster Composition — hidden on mobile ─────── */}
          <div className="hidden md:block space-y-4">
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
                  const textColor = belowMin ? 'text-red-600 font-bold' : belowIdeal ? 'text-amber-600' : 'text-[var(--text-sec)]';

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
                      {belowMin && <span className="text-[10px] text-red-600">NEED</span>}
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
                  <span className={`font-mono font-bold ${capSpace > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${capSpace}M
                  </span>
                </div>
                {luxuryTax > 0 && (
                  <div className="flex justify-between text-red-600">
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
              {/* §1.3 5/12 evening (agarre3552 mobile FA filter): iOS Safari
                  can swallow inner button taps inside `overflow-x-auto`
                  horizontal-scroll containers, manifesting as "the FA pool
                  isn't adjusting when I tap a position". Add explicit
                  type="button" + touch-action: manipulation to every pill so
                  the tap registers instantly even on touch (no 300ms delay)
                  and doesn't get re-interpreted as a horizontal-scroll
                  gesture. Same fix on the cap-summary 4-col grid above. */}
              <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setFilterPos('ALL')}
                  className={`touch-manipulation px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  ALL
                </button>
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setFilterPos(filterPos === pos ? 'ALL' : pos)}
                    className={`touch-manipulation px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
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
                <span className="hidden sm:inline">{affordableOnly ? 'Showing affordable' : 'Show affordable only'}</span>
                <span className="sm:hidden">{affordableOnly ? 'Affordable' : 'All prices'}</span>
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
                        {negotiation.position} · {negotiation.playerOverall} OVR · Age {negotiation.playerAge}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={closeNegotiation}>✕</Button>
                  </div>

                  {/* Message feed */}
                  <div ref={msgFeedRef} className="bg-[var(--surface-2)] rounded-lg p-3 mb-4 max-h-48 overflow-y-auto space-y-2">
                    {negotiation.messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`text-sm rounded-lg px-3 py-2 ${
                          msg.type === 'result' && negotiation.outcome === 'accepted'
                            ? 'bg-green-50 border border-green-200 text-green-700'
                            : msg.type === 'result' && negotiation.outcome === 'rejected'
                            ? 'bg-red-50 border border-red-200 text-red-700'
                            : msg.type === 'counter'
                            ? 'bg-amber-50 border border-amber-200 text-amber-700'
                            : msg.type === 'negative'
                            ? 'bg-red-50 border border-red-200 text-red-600'
                            : msg.sender === 'system'
                            ? 'bg-blue-50 border border-blue-200 text-blue-600'
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
                    <div className="bg-green-50 border border-green-600 rounded-lg p-4 text-center mb-3">
                      <div className="text-lg font-black text-green-600">SIGNED!</div>
                      <div className="text-sm text-green-600">
                        {negotiation.playerName} signed for ${negotiation.currentOfferSalary}M/yr for {negotiation.currentOfferYears} year{negotiation.currentOfferYears > 1 ? 's' : ''}
                      </div>
                      <Button size="sm" variant="secondary" onClick={closeNegotiation} className="mt-3">Done</Button>
                    </div>
                  )}

                  {negotiation.outcome === 'rejected' && (
                    <div className="bg-red-50 border border-red-600 rounded-lg p-4 text-center mb-3">
                      <div className="text-lg font-black text-red-600">REJECTED</div>
                      <div className="text-sm text-red-600">
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
                          {overCap && (
                            <span className="text-red-600 ml-2">(over cap — league min only)</span>
                          )}
                        </label>
                        {overCap ? (
                          <div className="text-xs text-[var(--text-sec)] py-1">
                            Locked at league minimum (${LEAGUE_MINIMUM_SALARY}M/yr) while over the salary cap.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-sec)]">$</span>
                                <input
                                  type="number"
                                  min={LEAGUE_MINIMUM_SALARY}
                                  max={Math.max(negotiation.askingSalary * 2, 5)}
                                  step={0.1}
                                  value={offerSalary}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) setOfferSalary(Math.round(val * 10) / 10);
                                  }}
                                  className="w-28 pl-6 pr-2 py-1.5 text-sm font-mono font-bold bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-sec)]">M/yr</span>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setOfferSalary(Math.round(negotiation.askingSalary * 0.85 * 10) / 10)}
                                  className="px-2 py-1 text-[10px] rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                                >
                                  85%
                                </button>
                                <button
                                  onClick={() => setOfferSalary(Math.round(negotiation.askingSalary * 0.95 * 10) / 10)}
                                  className="px-2 py-1 text-[10px] rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                                >
                                  95%
                                </button>
                                <button
                                  onClick={() => setOfferSalary(negotiation.askingSalary)}
                                  className="px-2 py-1 text-[10px] rounded bg-amber-100 text-amber-700 font-medium hover:bg-amber-200 transition-colors"
                                >
                                  Match
                                </button>
                                <button
                                  onClick={() => setOfferSalary(Math.round(negotiation.askingSalary * 1.1 * 10) / 10)}
                                  className="px-2 py-1 text-[10px] rounded bg-[var(--surface-2)] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
                                >
                                  110%
                                </button>
                              </div>
                            </div>
                            <div className="text-[10px] text-[var(--text-sec)]">
                              Asking: <span className="text-amber-600 font-medium">${negotiation.askingSalary}M/yr</span>
                            </div>
                          </div>
                        )}
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
              <div className="overflow-x-auto">
              <table className="w-full text-sm sticky-col sticky-action">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pl-2 cursor-pointer select-none hover:text-[var(--text)]" onClick={() => toggleSort('name')}>Player{sortArrow('name')}</th>
                    <th className="text-center pb-3 cursor-pointer select-none hover:text-[var(--text)]" onClick={() => toggleSort('pos')}>Pos{sortArrow('pos')}</th>
                    <th className="text-center pb-3 cursor-pointer select-none hover:text-[var(--text)]" onClick={() => toggleSort('age')}>Age{sortArrow('age')}</th>
                    <th className="text-center pb-3 cursor-pointer select-none hover:text-[var(--text)]" onClick={() => toggleSort('ovr')}>OVR{sortArrow('ovr')}</th>
                    <th className="text-center pb-3 cursor-pointer select-none hover:text-[var(--text)] hidden sm:table-cell" onClick={() => toggleSort('pot')} title="Potential — a player's ceiling. Young players show as Elite/High/Average/Low until 3+ seasons played. A declining player's POT may be lower than their OVR.">POT <span className="inline-block w-3 h-3 text-[10px] rounded-full bg-[var(--surface-2)] text-[var(--text-sec)]">?</span>{sortArrow('pot')}</th>
                    <th className="text-left pb-3 hidden md:table-cell">Last Season</th>
                    <th className="text-right pb-3 cursor-pointer select-none hover:text-[var(--text)]" onClick={() => toggleSort('salary')}>Market{sortArrow('salary')}</th>
                    <th className="text-right pb-3 pr-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(p => {
                    const baseSal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential, ci);
                    const salary = Math.round(baseSal * decay * 10) / 10;
                    const isRefused = faRefusals.includes(p.id);
                    const isExpanded = expandedPlayerId === p.id;
                    return (
                      <React.Fragment key={p.id}>
                      <tr
                        className={`border-t border-[var(--border)] transition-colors duration-150 cursor-pointer ${
                          negotiation?.playerId === p.id ? 'bg-blue-50' : isRefused ? 'opacity-60' : isExpanded ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'
                        }`}
                        onClick={() => setExpandedPlayerId(isExpanded ? null : p.id)}
                      >
                        <td className="py-2.5 pl-2">
                          <div className="flex items-center gap-2">
                            <svg className={`w-3 h-3 shrink-0 text-[var(--text-sec)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedPlayerId(p.id); }} className="font-semibold hover:text-blue-600 transition-colors truncate">
                              <span className="sm:hidden">{p.firstName[0]}. {p.lastName}</span>
                              <span className="hidden sm:inline">{p.firstName} {p.lastName}</span>
                            </button>
                            {effectivePursuitState?.intelReports[p.id] && (
                              <span className="text-[9px] ml-0.5">
                                {({'money':'💰','winning':'🏆','role':'🎯','loyalty':'🏠'} as Record<string, string>)[effectivePursuitState!.intelReports[p.id].priority]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                        <td className="py-2.5 text-center">{p.age}</td>
                        <td className={`py-2.5 text-center font-bold ${hasScouting ? ratingColor(p.ratings.overall) : 'text-[var(--text-sec)]'}`}>
                          {hasScouting ? p.ratings.overall : (
                            <span className="text-[10px] uppercase tracking-wide">{coarseOvrBucket(p.ratings.overall)}</span>
                          )}
                        </td>
                        <td className={`py-2.5 text-center text-xs hidden sm:table-cell ${hasScouting ? potentialColor(p.potential, p.experience) : 'text-[var(--text-sec)]'}`}>
                          {hasScouting ? potentialLabel(p.potential, p.experience) : '—'}
                        </td>
                        <td className="py-2.5 text-left text-xs text-[var(--text-sec)] hidden md:table-cell">
                          {hasScouting ? positionStats({ position: p.position, stats: p.previousSeasonStats ?? p.stats }) : (p.college ?? '—')}
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs sm:text-sm">
                          {hasScouting ? (
                            <>
                              <span className="hidden sm:inline">${salary}M/yr</span>
                              <span className="sm:hidden">${Math.round(salary)}M</span>
                              {decay < 1.0 && (
                                <span className="text-[10px] text-amber-600 ml-1">↓</span>
                              )}
                            </>
                          ) : (
                            <span className="text-[var(--text-sec)] text-xs">🔒</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right pr-2" onClick={e => e.stopPropagation()}>
                          {isRefused ? (
                            <span
                              className="inline-block px-2 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded cursor-help"
                              title={
                                (p.mood ?? 70) < 40
                                  ? 'Unhappy with the organization'
                                  : 'Only considering contenders'
                              }
                            >
                              Refuses
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                size="sm"
                                disabled={!!negotiation && negotiation.outcome === 'pending'}
                                onClick={() => startNegotiation(p)}
                              >
                                Negotiate
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-[var(--border)]">
                          <td colSpan={8} className="px-4 py-3 bg-[var(--surface-2)]/50">
                            {/* Intel Report — no report yet. */}
                            {effectivePursuitState && !effectivePursuitState.intelReports[p.id] && (() => {
                              const points = effectivePursuitState.pursuitPoints ?? 0;
                              const outOfPoints = points < 1;
                              const isFreeTier = tier === 'free';
                              return (
                                <div className="mt-3 border-t border-[var(--border)] pt-3">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider">Intel Report</span>
                                    {!outOfPoints ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); intelReportFA(p.id); }}
                                        className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                                      >
                                        Run Intel Report (1 pt)
                                      </button>
                                    ) : isFreeTier ? (
                                      <Link
                                        href="/pricing"
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700 inline-flex items-center gap-1"
                                        title="You've used all 3 free intel reports. Upgrade to get 9 per period."
                                      >
                                        Upgrade for 9 intel reports →
                                      </Link>
                                    ) : (
                                      <span className="px-3 py-1.5 text-xs font-bold text-[var(--text-sec)] bg-[var(--surface-2)] rounded-lg cursor-not-allowed">
                                        Out of intel reports
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Intel Report — full content. Only renders for premium since
                                free users can never trigger intelReportFA. */}
                            {effectivePursuitState?.intelReports[p.id] && (() => {
                              const report = effectivePursuitState.intelReports[p.id];
                              const priorityIcons: Record<string, string> = { money: '💰', winning: '🏆', role: '🎯', loyalty: '🏠' };
                              return (
                                <div className="mt-3 border-t border-[var(--border)] pt-3 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider">Intel Report</span>
                                    <span className="text-green-600 text-xs">✅</span>
                                  </div>

                                  {/* Front Office Evaluation — top of report */}
                                  <FAEvaluationPanel player={p} roster={roster} capSpace={capSpace} marketSalary={salary} />

                                  {/* Priority */}
                                  <div className="border-t border-[var(--border)] pt-3">
                                    <span className="text-sm font-bold">{priorityIcons[report.priority]} {report.priorityLabel}</span>
                                    <p className="text-xs text-[var(--text-sec)] mt-0.5 italic">{report.priorityDetail}</p>
                                  </div>

                                  {/* Closing Offer — the golden payoff */}
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="text-[10px] font-bold text-amber-700 uppercase mb-1">Closing Offer</div>
                                    <div className="text-lg font-black">${report.closingOffer.salary}M/yr · {report.closingOffer.years}yr</div>
                                    <p className="text-xs text-amber-700 italic mt-1">{report.closingOfferDetail}</p>
                                    <div className="flex gap-2 mt-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); signFreeAgent(p.id, report.closingOffer.salary, report.closingOffer.years); }}
                                        className="px-4 py-2 text-sm font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 active:scale-[0.98]"
                                      >
                                        Sign at ${report.closingOffer.salary}M
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); startNegotiation(p); }}
                                        className="px-4 py-2 text-sm font-medium text-[var(--text-sec)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-2)]"
                                      >
                                        Negotiate
                                      </button>
                                    </div>
                                  </div>

                                  {/* Two-column grid: asking price + willingness, market + competing teams */}
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">True Asking Price</div>
                                      <div className="font-bold">${report.trueAskingSalary}M/yr, {report.trueAskingYears}yr</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Willingness</div>
                                      <div className={`font-bold ${report.willingness === 'eager' ? 'text-green-600' : report.willingness === 'open' ? 'text-amber-600' : 'text-red-600'}`}>
                                        {report.willingness === 'eager' ? '🟢' : report.willingness === 'open' ? '🟡' : report.willingness === 'reluctant' ? '🟠' : '🔴'} {report.willingness.replace('_', ' ')}
                                      </div>
                                      <div className="text-[var(--text-sec)] italic mt-0.5">{report.willingnessReason}</div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Market Heat</div>
                                      <div className="font-bold">{report.marketHeat === 'bidding_war' ? '⚡ Bidding War' : report.marketHeat === 'hot' ? '🔥 Hot' : report.marketHeat === 'moderate' ? '📊 Moderate' : '❄️ Cold'}</div>
                                      <div className="text-[var(--text-sec)] italic mt-0.5">{report.marketHeatDetail}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Also Interested</div>
                                      <div className="font-bold">{report.competingTeams.length > 0 ? report.competingTeams.join(', ') : 'None identified'}</div>
                                    </div>
                                  </div>

                                  {/* Agent profile */}
                                  <div className="bg-[var(--surface-2)] rounded-lg p-2.5">
                                    <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Agent: {report.agentStyle.replace('_', ' ')}</div>
                                    <p className="text-xs text-[var(--text)] mt-0.5">{report.agentStyleDetail}</p>
                                    <p className="text-xs text-blue-600 mt-1">💡 {report.agentTip}</p>
                                  </div>

                                  {/* Fit + Deal Path */}
                                  <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Fit Assessment</div>
                                      <p className="text-[var(--text)]">{report.fitAssessment}</p>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Path to a Deal: {report.dealPath}</div>
                                      <p className="text-[var(--text)]">{report.dealPathDetail}</p>
                                    </div>
                                  </div>

                                  {/* Concerns */}
                                  {report.concerns.length > 0 && (
                                    <div>
                                      <div className="text-[10px] font-bold text-amber-600 uppercase">⚠ Concerns</div>
                                      {report.concerns.map((c: string, i: number) => <p key={i} className="text-xs text-amber-700 mt-0.5">• {c}</p>)}
                                    </div>
                                  )}

                                  {/* Negotiation edge */}
                                  <div className="text-[10px] text-[var(--text-sec)] space-y-0.5">
                                    <div>✅ Asking price reduced 12%</div>
                                    <div>✅ +1 negotiation round</div>
                                    {report.overridesRefusal && <div>✅ Refusal overridden</div>}
                                  </div>

                                  {/* Front office blurb */}
                                  <p className="text-xs italic text-[var(--text)]">&ldquo;{report.intelBlurb}&rdquo; — Front Office</p>

                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-[var(--text-sec)]">
                        {affordableOnly && capSpace < LEAGUE_MINIMUM_SALARY * 2 ? (
                          <div className="space-y-2">
                            <div>No cheap FAs match your filters.</div>
                            <div className="text-xs">
                              You have ${capSpace}M cap space — you can only sign players at the league minimum (${LEAGUE_MINIMUM_SALARY}M).
                            </div>
                            <button
                              onClick={() => setAffordableOnly(false)}
                              className="text-xs font-bold text-blue-600 hover:underline"
                            >
                              Show all free agents
                            </button>
                          </div>
                        ) : (
                          'No free agents match your filters.'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
