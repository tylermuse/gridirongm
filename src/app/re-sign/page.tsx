'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export default function ReSignPage() {
  const { phase, players, teams, userTeamId, resigningPlayers, resignPlayer, passOnResigning } = useGameStore();

  const [offers, setOffers] = useState<Record<string, { salary: string; years: string }>>({});
  const [results, setResults] = useState<Record<string, 'accepted' | 'rejected' | 'passed'>>({});

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
  const capSpace = userTeam ? userTeam.salaryCap - userTeam.totalPayroll : 0;

  const getOffer = (playerId: string) => ({
    salary: offers[playerId]?.salary ?? '',
    years: offers[playerId]?.years ?? '3',
  });

  function setOffer(playerId: string, field: 'salary' | 'years', value: string) {
    setOffers(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? { salary: '', years: '3' }), [field]: value },
    }));
  }

  function handleOffer(playerId: string) {
    const offer = getOffer(playerId);
    const salary = parseFloat(offer.salary);
    const years = parseInt(offer.years, 10);
    if (isNaN(salary) || salary <= 0 || isNaN(years) || years < 1) return;

    const accepted = resignPlayer(playerId, salary, years);
    setResults(prev => ({ ...prev, [playerId]: accepted ? 'accepted' : 'rejected' }));
  }

  function handlePass(playerId: string) {
    passOnResigning(playerId);
    setResults(prev => ({ ...prev, [playerId]: 'passed' }));
  }

  const completedIds = Object.keys(results);
  const activeEntries = resigningPlayers.filter(e => !completedIds.includes(e.playerId));

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black">Re-signing Window</h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">
              Extend your expiring contracts before they hit free agency.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-green-400">${Math.round(capSpace * 10) / 10}M</div>
            <div className="text-xs text-[var(--text-sec)]">Cap Space Remaining</div>
          </div>
        </div>

        {activeEntries.length === 0 && Object.keys(results).length === 0 ? (
          <Card>
            <div className="text-center py-12 text-[var(--text-sec)]">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold">No expiring contracts this offseason.</p>
              <p className="text-sm mt-1">All your players have at least 2 years remaining.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Active re-signing entries */}
            {activeEntries.map(entry => {
              const player = players.find(p => p.id === entry.playerId);
              if (!player) return null;
              const offer = getOffer(entry.playerId);
              const offerSalary = parseFloat(offer.salary);
              const meetsAsking = !isNaN(offerSalary) && offerSalary >= entry.askingSalary;

              return (
                <Card key={entry.playerId}>
                  <div className="flex gap-4 items-start">
                    {/* Player info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Link href={`/player/${player.id}`} className="font-bold text-lg hover:text-blue-400 transition-colors">
                          {player.firstName} {player.lastName}
                        </Link>
                        <Badge>{player.position}</Badge>
                        <span className={`font-bold ${ratingColor(player.ratings.overall)}`}>{player.ratings.overall} OVR</span>
                      </div>
                      <div className="flex gap-4 text-sm text-[var(--text-sec)]">
                        <span>Age {player.age}</span>
                        <span>{player.experience}yr exp</span>
                        <span className="text-amber-400">Current: ${player.contract.salary}M/yr</span>
                        <span className={potentialColor(player.potential, player.experience)}>
                          {potentialLabel(player.potential, player.experience)}
                        </span>
                      </div>
                      <div className="mt-2 p-2 bg-[var(--surface-2)] rounded-lg inline-flex items-center gap-2">
                        <span className="text-xs text-[var(--text-sec)]">Asking:</span>
                        <span className="text-sm font-bold text-amber-400">
                          ${entry.askingSalary}M/yr × {entry.askingYears}yr
                        </span>
                      </div>
                    </div>

                    {/* Offer inputs */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <label className="text-xs text-[var(--text-sec)] block mb-1">$/yr</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={offer.salary}
                          onChange={e => setOffer(entry.playerId, 'salary', e.target.value)}
                          className="w-24 px-2 py-1.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-right focus:outline-none focus:border-blue-500"
                          placeholder={String(entry.askingSalary)}
                        />
                      </div>
                      <div className="text-right">
                        <label className="text-xs text-[var(--text-sec)] block mb-1">Years</label>
                        <select
                          value={offer.years}
                          onChange={e => setOffer(entry.playerId, 'years', e.target.value)}
                          className="w-16 px-2 py-1.5 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          {[1, 2, 3, 4, 5].map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 mt-4">
                        <Button
                          size="sm"
                          onClick={() => handleOffer(entry.playerId)}
                          disabled={!meetsAsking || isNaN(offerSalary)}
                        >
                          Offer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePass(entry.playerId)}
                        >
                          Pass
                        </Button>
                      </div>
                    </div>
                  </div>
                  {!meetsAsking && !isNaN(offerSalary) && offerSalary > 0 && (
                    <p className="text-xs text-red-400 mt-2">
                      Offer too low — player asking ${entry.askingSalary}M/yr minimum.
                    </p>
                  )}
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
                    {result === 'accepted' ? 'Re-signed' :
                     result === 'rejected' ? 'Rejected offer — entering free agency' :
                     'Passed — entering free agency'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary card */}
        {activeEntries.length > 0 && (
          <Card className="mt-6">
            <CardHeader><CardTitle>Tips</CardTitle></CardHeader>
            <ul className="text-sm text-[var(--text-sec)] space-y-1">
              <li>• Players ask for more if your team has a losing record. Win more, pay less.</li>
              <li>• Veterans (32+) accept a hometown discount. They don&apos;t need the money.</li>
              <li>• You can still sign them in free agency — but other teams may bid too.</li>
              <li>• Use <strong className="text-[var(--text)]">Pass</strong> to let them hit FA without making an offer.</li>
            </ul>
          </Card>
        )}
      </div>
    </GameShell>
  );
}
