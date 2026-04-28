'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { CustomHCModal } from '@/components/game/CustomHCModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  OFFENSIVE_SCHEME_LABELS,
  DEFENSIVE_SCHEME_LABELS,
  calculateSchemeFit,
  schemeFitDot,
  generateCoach,
  COACH_ROLE_LABELS,
  positionCoachDevMultiplier,
  type SchemeFit,
} from '@/lib/engine/coaching';
import type { Coach, Player } from '@/types';
import { COACH_ROLE_POSITIONS, POSITION_COACH_ROLES } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  ...COACH_ROLE_LABELS,
};

const ROLE_COLORS: Record<string, string> = {
  HC: 'bg-blue-600',
  OC: 'bg-green-600',
  DC: 'bg-red-600',
  QB: 'bg-purple-600',
  RB: 'bg-orange-600',
  WR: 'bg-cyan-600',
  OL: 'bg-amber-600',
  DL: 'bg-rose-600',
  DB: 'bg-teal-600',
};

function ovrColor(ovr: number): string {
  if (ovr >= 80) return 'text-green-600';
  if (ovr >= 65) return 'text-blue-600';
  if (ovr >= 50) return 'text-amber-600';
  return 'text-red-600';
}

/** Tier label that hides the exact OVR number on the hiring market. */
function coachOvrTier(ovr: number): { label: string; cls: string } {
  if (ovr >= 80) return { label: 'Elite', cls: 'bg-green-100 text-green-700 border-green-300' };
  if (ovr >= 70) return { label: 'Above Average', cls: 'bg-blue-100 text-blue-700 border-blue-300' };
  if (ovr >= 60) return { label: 'Average', cls: 'bg-[var(--surface-2)] text-[var(--text-sec)] border-[var(--border)]' };
  if (ovr >= 50) return { label: 'Below Average', cls: 'bg-amber-100 text-amber-700 border-amber-300' };
  return { label: 'Poor', cls: 'bg-red-100 text-red-700 border-red-300' };
}

/** Scheme-fit chip for a hiring candidate vs the team's existing HC scheme.
 *  HC candidates compare against the current HC (which they'd replace) so
 *  the user can see whether a swap would mean a scheme change. OC/DC
 *  candidates compare against the HC's scheme on their side of the ball. */
function coachSchemeFit(
  candidate: Coach,
  currentHc: Coach | undefined,
): { icon: string; label: string; cls: string } {
  if (!currentHc) return { icon: '·', label: 'No baseline', cls: 'bg-[var(--surface-2)] text-[var(--text-sec)] border-[var(--border)]' };
  const sameOff = candidate.offensiveScheme && currentHc.offensiveScheme && candidate.offensiveScheme === currentHc.offensiveScheme;
  const sameDef = candidate.defensiveScheme && currentHc.defensiveScheme && candidate.defensiveScheme === currentHc.defensiveScheme;
  if (candidate.role === 'OC') {
    return sameOff
      ? { icon: '✅', label: 'Scheme match', cls: 'bg-green-50 text-green-700 border-green-200' }
      : { icon: '⚠️', label: 'Scheme change', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (candidate.role === 'DC') {
    return sameDef
      ? { icon: '✅', label: 'Scheme match', cls: 'bg-green-50 text-green-700 border-green-200' }
      : { icon: '⚠️', label: 'Scheme change', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  // HC: both sides
  if (sameOff && sameDef) return { icon: '✅', label: 'Same scheme', cls: 'bg-green-50 text-green-700 border-green-200' };
  if (sameOff || sameDef) return { icon: '⚠️', label: 'Partial match', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { icon: '❌', label: 'New scheme', cls: 'bg-red-50 text-red-700 border-red-200' };
}

function CoachCard({ coach, roster, userTeam, onReplace }: { coach: Coach; roster: Player[]; userTeam: import('@/types').Team; onReplace?: () => void }) {
  const offSchemeLabel = coach.offensiveScheme ? OFFENSIVE_SCHEME_LABELS[coach.offensiveScheme] : null;
  const defSchemeLabel = coach.defensiveScheme ? DEFENSIVE_SCHEME_LABELS[coach.defensiveScheme] : null;
  const winPct = coach.careerWins + coach.careerLosses > 0
    ? ((coach.careerWins / (coach.careerWins + coach.careerLosses)) * 100).toFixed(1)
    : '0.0';

  // Calculate scheme fit breakdown for this coach's side
  const relevantPlayers = roster.filter(p => {
    if (coach.role === 'OC') return ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position);
    if (coach.role === 'DC') return ['DL', 'LB', 'CB', 'S'].includes(p.position);
    return true; // HC sees all
  });

  const fitCounts = { great: 0, neutral: 0, poor: 0 };
  for (const p of relevantPlayers) {
    const fit = calculateSchemeFit(p, userTeam);
    fitCounts[fit]++;
  }

  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs text-white px-2 py-0.5 rounded font-bold ${ROLE_COLORS[coach.role]}`}>
                {coach.role}
              </span>
              <span className="text-xs text-[var(--text-sec)]">{ROLE_LABELS[coach.role]}</span>
            </div>
            <h3 className="text-xl font-bold">
              <Link href={`/coach/${coach.id}`} className="hover:text-blue-500 transition-colors">
                {coach.firstName} {coach.lastName}
              </Link>
            </h3>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${ovrColor(coach.ovr)}`}>{coach.ovr}</div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">OVR</div>
            {onReplace && (
              <button
                onClick={onReplace}
                className="mt-2 text-[10px] px-2.5 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors border border-red-200"
              >
                Replace
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <span className="text-[var(--text-sec)]">Age</span>
            <span className="ml-2 font-medium">{coach.age}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Trait</span>
            <span className="ml-2 font-medium">{coach.trait}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Tenure</span>
            <span className="ml-2 font-medium">{coach.yearsWithTeam} yr{coach.yearsWithTeam !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Record</span>
            <span className="ml-2 font-medium">{coach.careerWins}-{coach.careerLosses} ({winPct}%)</span>
          </div>
        </div>

        {/* Schemes */}
        <div className="space-y-2 mb-4">
          {offSchemeLabel && (
            <div className="flex items-center gap-2">
              <Badge variant="green" size="sm">OFF</Badge>
              <span className="text-sm font-medium">{offSchemeLabel}</span>
            </div>
          )}
          {defSchemeLabel && (
            <div className="flex items-center gap-2">
              <Badge variant="red" size="sm">DEF</Badge>
              <span className="text-sm font-medium">{defSchemeLabel}</span>
            </div>
          )}
        </div>

        {/* Contract Info */}
        <div className="text-xs text-[var(--text-sec)] mb-1">
          {coach.contractYears ?? '?'} years &middot; ${coach.salary != null ? `${coach.salary.toFixed(1)}M/yr` : '?'}
        </div>

        {/* Specialties */}
        {coach.specialties && coach.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {coach.specialties.map((s: string, i: number) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Scheme Fit Summary */}
        {relevantPlayers.length > 0 && (
          <div className="border-t border-[var(--border)] pt-3">
            <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-2">Roster Scheme Fit</div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">{fitCounts.great} Great</span>
              <span className="text-[var(--text-sec)]">{fitCounts.neutral} Neutral</span>
              <span className="text-red-500 font-medium">{fitCounts.poor} Poor</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

const STARTER_COUNTS: Record<string, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 3, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

function isStarter(player: Player, roster: Player[]): boolean {
  const atPos = roster
    .filter(p => p.position === player.position)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const count = STARTER_COUNTS[player.position] ?? 1;
  return atPos.indexOf(player) < count;
}

function generateRecommendations(
  playerFits: { player: Player; fit: SchemeFit }[],
): string[] {
  const tips: string[] = [];

  // Count poor fits by position
  const poorByPos: Record<string, number> = {};
  const greatByPos: Record<string, number> = {};
  let replaceableCount = 0;

  for (const { player, fit } of playerFits) {
    if (fit === 'poor') {
      poorByPos[player.position] = (poorByPos[player.position] ?? 0) + 1;
      if (player.ratings.overall < 60) replaceableCount++;
    }
    if (fit === 'great') {
      greatByPos[player.position] = (greatByPos[player.position] ?? 0) + 1;
    }
  }

  // Positions with many poor fits
  for (const [pos, count] of Object.entries(poorByPos)) {
    if (count >= 3) {
      tips.push(`Your ${pos} corps has ${count} poor fits. Target scheme-fit ${pos}s in the draft or free agency.`);
    }
  }

  // Positions with great fit strength
  for (const [pos, count] of Object.entries(greatByPos)) {
    if (count >= 2) {
      tips.push(`Your ${pos} group has ${count} great fits — scheme is working well here. Protect those guys.`);
    }
  }

  // Replaceable poor fits
  if (replaceableCount >= 2) {
    tips.push(`Replacing your ${replaceableCount} lowest-OVR poor fits with average neutral fits would boost your effective team OVR by ~${replaceableCount} points.`);
  }

  // All good
  if (Object.keys(poorByPos).length === 0) {
    tips.push('Your roster fits the scheme well. No major changes needed.');
  }

  return tips.slice(0, 3);
}

export default function StaffPage() {
  const { teams, userTeamId, players, replaceCoach, leagueSettings } = useGameStore();
  const customizeHeadCoach = useGameStore(s => s.customizeHeadCoach);
  const showCoachOVR = leagueSettings?.showCoachOVR === true;
  const [confirmReplace, setConfirmReplace] = useState<import('@/types').CoachRole | null>(null);
  const [candidates, setCandidates] = useState<import('@/types').Coach[]>([]);
  const [customizingHC, setCustomizingHC] = useState(false);
  const userTeam = teams.find(t => t.id === userTeamId);
  const coaches = userTeam?.coaches ?? [];
  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);

  if (!userTeam) return null;

  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  const orderedCoaches = [hc, oc, dc].filter(Boolean) as Coach[];
  const positionCoaches = POSITION_COACH_ROLES
    .map(role => coaches.find(c => c.role === role))
    .filter(Boolean) as Coach[];
  const totalCoachSalary = coaches.reduce((sum, c) => sum + (c.salary ?? 0), 0);

  // Player scheme fits for the detailed table
  const playerFits: { player: Player; fit: SchemeFit }[] = roster
    .map(p => ({ player: p, fit: calculateSchemeFit(p, userTeam) }))
    .sort((a, b) => {
      const order: Record<SchemeFit, number> = { great: 0, poor: 1, neutral: 2 };
      return order[a.fit] - order[b.fit] || b.player.ratings.overall - a.player.ratings.overall;
    });

  const greatFits = playerFits.filter(f => f.fit === 'great');
  const poorFits = playerFits.filter(f => f.fit === 'poor');
  const poorReplace = poorFits.filter(f => f.player.ratings.overall < 65);
  const poorKeep = poorFits.filter(f => f.player.ratings.overall >= 65);
  const recommendations = generateRecommendations(playerFits);

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-black">Coaching Staff</h2>
            {hc && (
              <button
                onClick={() => setCustomizingHC(true)}
                className="text-xs font-bold px-2.5 py-1 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                ✏️ Customize My HC
              </button>
            )}
          </div>
          {userTeam.ownerPersonality && (() => {
            const op = userTeam.ownerPersonality;
            const label = op === 'win-now' ? 'Win-Now' : op === 'frugal' ? 'Frugal' : 'Balanced';
            const desc = op === 'win-now'
              ? "Expects playoff contention every year — quick to fire if you miss win targets."
              : op === 'frugal'
              ? "Keeps payroll in check — patient with rebuilds, lower win expectations."
              : "Tempered expectations. Win games, stay near the cap, keep the fans happy.";
            const tone = op === 'win-now' ? 'bg-red-50 border-red-200 text-red-800'
              : op === 'frugal' ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]';
            return (
              <div className={`text-xs px-3 py-2 rounded-lg border ${tone} max-w-sm`} title={desc}>
                <span className="font-bold uppercase tracking-wider text-[10px] opacity-80">Owner</span>
                <div className="font-bold">{label}</div>
                <div className="text-[11px] opacity-90 leading-snug mt-0.5">{desc}</div>
              </div>
            );
          })()}
        </div>

        {coaches.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-[var(--text-sec)]">
              No coaching staff assigned. Start a new league to generate coaches.
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {orderedCoaches.map(coach => (
                confirmReplace === coach.role ? (
                  <Card key={coach.id} className="md:col-span-3">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-bold">Replace {ROLE_LABELS[coach.role]}: Choose a candidate</p>
                        <button onClick={() => { setConfirmReplace(null); setCandidates([]); }} className="text-xs text-[var(--text-sec)] hover:text-[var(--text)]">Cancel</button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3">
                        {candidates.map((c, i) => {
                          const tier = coachOvrTier(c.ovr);
                          const fit = coachSchemeFit(c, hc);
                          return (
                          <button
                            key={i}
                            onClick={() => { replaceCoach(coach.role, c); setConfirmReplace(null); setCandidates([]); }}
                            className="text-left border border-[var(--border)] rounded-lg p-3 hover:border-blue-500 hover:bg-blue-50 transition-all"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-sm">{c.firstName} {c.lastName}</span>
                              {showCoachOVR ? (
                                <span className={`text-lg font-black ${ovrColor(c.ovr)}`}>{c.ovr}</span>
                              ) : (
                                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tier.cls}`}>
                                  {tier.label}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mb-1.5">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${fit.cls}`}>
                                {fit.icon} {fit.label}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-sec)] space-y-0.5">
                              <div>Age {c.age} · {c.trait}</div>
                              {c.offensiveScheme && <div>Offense: <span className="font-medium text-[var(--text)]">{OFFENSIVE_SCHEME_LABELS[c.offensiveScheme]}</span></div>}
                              {c.defensiveScheme && <div>Defense: <span className="font-medium text-[var(--text)]">{DEFENSIVE_SCHEME_LABELS[c.defensiveScheme]}</span></div>}
                              <div className="text-[10px]">{c.careerWins}-{c.careerLosses} career</div>
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                ) :
                <CoachCard key={coach.id} coach={coach} roster={roster} userTeam={userTeam} onReplace={() => {
                  const pool: import('@/types').Coach[] = [];
                  // Generate extra candidates to ensure variety, then pick 6 with spread OVRs
                  for (let i = 0; i < 18; i++) pool.push(generateCoach(coach.role));
                  pool.sort((a, b) => b.ovr - a.ovr);
                  // Pick 6 spread evenly across the pool
                  const picked: import('@/types').Coach[] = [];
                  const step = Math.max(1, Math.floor(pool.length / 6));
                  for (let i = 0; i < 6 && i * step < pool.length; i++) {
                    picked.push(pool[i * step]);
                  }
                  // Fill remaining if needed
                  for (const c of pool) {
                    if (picked.length >= 6) break;
                    if (!picked.includes(c)) picked.push(c);
                  }
                  picked.sort((a, b) => b.ovr - a.ovr);
                  setCandidates(picked);
                  setConfirmReplace(coach.role);
                }} />
              ))}
            </div>

            {/* Candidate count notice */}
            {candidates.length > 0 && (
              <div className="text-xs text-[var(--text-sec)] text-center mt-2">
                {candidates.length} candidates available — {showCoachOVR ? 'sorted by OVR' : 'evaluate by tier + scheme fit'}
              </div>
            )}

            {/* Position Coaches */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Position Coaches</CardTitle>
                  <span className="text-xs text-[var(--text-sec)]">
                    Total staff payroll: ${totalCoachSalary.toFixed(1)}M/yr
                  </span>
                </div>
                <p className="text-xs text-[var(--text-sec)] mt-1">
                  Position coaches affect player development. Higher-rated coaches accelerate growth for their position group.
                  Empty slots apply a 10% development penalty.
                </p>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {POSITION_COACH_ROLES.map(role => {
                  const coach = positionCoaches.find(c => c.role === role);
                  const posPlayers = roster.filter(p =>
                    (COACH_ROLE_POSITIONS[role] ?? []).includes(p.position),
                  );

                  if (confirmReplace === role && coach) {
                    return (
                      <div key={role} className="sm:col-span-2 lg:col-span-3 border border-[var(--border)] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-bold text-sm">Replace {ROLE_LABELS[role]}: Choose a candidate</p>
                          <button onClick={() => { setConfirmReplace(null); setCandidates([]); }} className="text-xs text-[var(--text-sec)] hover:text-[var(--text)]">Cancel</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {candidates.map((c, i) => (
                            (() => {
                              const tier = coachOvrTier(c.ovr);
                              return (
                              <button
                                key={i}
                                onClick={() => { replaceCoach(role, c); setConfirmReplace(null); setCandidates([]); }}
                                className="text-left border border-[var(--border)] rounded-lg p-2 hover:border-blue-500 hover:bg-blue-50 transition-all"
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-bold text-sm">{c.firstName} {c.lastName}</span>
                                  {showCoachOVR ? (
                                    <span className={`text-lg font-black ${ovrColor(c.ovr)}`}>{c.ovr}</span>
                                  ) : (
                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tier.cls}`}>
                                      {tier.label}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[var(--text-sec)]">
                                  Age {c.age} · {c.trait} · ${c.salary?.toFixed(1)}M/yr
                                </div>
                                {c.specialties && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {c.specialties.map((s, j) => (
                                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{s}</span>
                                    ))}
                                  </div>
                                )}
                              </button>
                              );
                            })()
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={role} className="border border-[var(--border)] rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className={`text-[10px] text-white px-1.5 py-0.5 rounded font-bold ${ROLE_COLORS[role]}`}>
                            {role}
                          </span>
                          <span className="text-[10px] text-[var(--text-sec)] ml-1">{ROLE_LABELS[role]}</span>
                        </div>
                        {coach && (
                          <div className={`text-lg font-black ${ovrColor(coach.ovr)}`}>{coach.ovr}</div>
                        )}
                      </div>
                      {coach ? (
                        <>
                          <div className="font-bold text-sm mb-1">{coach.firstName} {coach.lastName}</div>
                          <div className="text-[10px] text-[var(--text-sec)] space-y-0.5 mb-2">
                            <div>Age {coach.age} · {coach.trait}</div>
                            <div>{coach.contractYears ?? '?'}yr · ${coach.salary?.toFixed(1)}M/yr</div>
                          </div>
                          {coach.specialties && coach.specialties.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {coach.specialties.map((s, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{s}</span>
                              ))}
                            </div>
                          )}
                          <div className="text-[10px] text-[var(--text-sec)] mb-2">
                            Develops: {posPlayers.length} player{posPlayers.length !== 1 ? 's' : ''}
                            {' · '}
                            <span className={coach.ovr >= 65 ? 'text-green-600' : coach.ovr >= 50 ? 'text-amber-600' : 'text-red-500'}>
                              {coach.ovr >= 65 ? '+' : ''}{((positionCoachDevMultiplier([coach], posPlayers[0]?.position ?? 'QB') - 1) * 100).toFixed(0)}% dev rate
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              const pool: Coach[] = [];
                              for (let i = 0; i < 12; i++) pool.push(generateCoach(role));
                              pool.sort((a, b) => b.ovr - a.ovr);
                              const picked = pool.slice(0, 6);
                              setCandidates(picked);
                              setConfirmReplace(role);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 font-medium border border-red-200"
                          >
                            Replace
                          </button>
                        </>
                      ) : (
                        <div className="text-xs text-[var(--text-sec)]">
                          <p className="mb-2">No coach assigned. -10% development for {(COACH_ROLE_POSITIONS[role] ?? []).join(', ')} players.</p>
                          <button
                            onClick={() => {
                              const pool: Coach[] = [];
                              for (let i = 0; i < 12; i++) pool.push(generateCoach(role));
                              pool.sort((a, b) => b.ovr - a.ovr);
                              setCandidates(pool.slice(0, 6));
                              setConfirmReplace(role);
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium border border-blue-200"
                          >
                            Hire
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Scheme Fit Details */}
            <Card>
              <CardHeader>
                <CardTitle>Scheme Fit Breakdown</CardTitle>
                <p className="text-xs text-[var(--text-sec)] mt-1">
                  Great Fit players get <span className="text-green-600 font-bold">+2 OVR</span> in games.
                  Poor Fit players get <span className="text-red-500 font-bold">-1 OVR</span>.
                  Building a roster that fits your coach&apos;s scheme makes your team play above its ratings.
                </p>
              </CardHeader>

              <div className="space-y-6">
                {/* Great Fits */}
                {greatFits.length > 0 && (
                  <div>
                    <div className="text-xs text-green-600 font-bold uppercase tracking-wider mb-2">
                      Great Fits ({greatFits.length})
                    </div>
                    <div className="space-y-1">
                      {greatFits.map(({ player }) => (
                        <div key={player.id} className="flex items-center gap-2 text-sm">
                          <span className="text-green-600">{schemeFitDot('great')}</span>
                          <Badge variant="default" size="sm">{player.position}</Badge>
                          <span className="font-medium">{player.firstName} {player.lastName}</span>
                          <span className="text-green-600 text-[10px] font-medium">+2 OVR</span>
                          <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Poor Fits — Consider Replacing (OVR < 65) */}
                {poorReplace.length > 0 && (
                  <div>
                    <div className="text-xs text-red-500 font-bold uppercase tracking-wider mb-2">
                      Poor Fits — Consider Replacing ({poorReplace.length})
                    </div>
                    <div className="space-y-1.5">
                      {poorReplace.map(({ player }) => {
                        const starter = isStarter(player, roster);
                        return (
                          <div key={player.id}>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-red-500">{schemeFitDot('poor')}</span>
                              <Badge variant="default" size="sm">{player.position}</Badge>
                              <span className="font-medium">{player.firstName} {player.lastName}</span>
                              <span className="text-red-500 text-[10px] font-medium">-1 OVR</span>
                              <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                            </div>
                            <div className={`text-[10px] ml-7 mt-0.5 ${starter ? 'text-amber-600' : 'text-[var(--text-sec)]'}`}>
                              {starter
                                ? `\u26A0\uFE0F Upgrade priority \u2014 starting at ${player.position} despite poor fit`
                                : 'Low priority \u2014 bench player'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Poor Fits — Keep Anyway (OVR >= 65) */}
                {poorKeep.length > 0 && (
                  <div>
                    <div className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-2">
                      Poor Fits — Keep Anyway ({poorKeep.length})
                    </div>
                    <div className="space-y-1.5">
                      {poorKeep.map(({ player }) => (
                        <div key={player.id}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-amber-500">{schemeFitDot('poor')}</span>
                            <Badge variant="default" size="sm">{player.position}</Badge>
                            <span className="font-medium">{player.firstName} {player.lastName}</span>
                            <span className="text-red-500 text-[10px] font-medium">-1 OVR</span>
                            <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                          </div>
                          <div className="text-[10px] ml-7 mt-0.5 text-[var(--text-sec)]">
                            Too talented to move. Scheme penalty is minor compared to production.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {greatFits.length === 0 && poorFits.length === 0 && (
                  <p className="text-sm text-[var(--text-sec)]">All players have a neutral scheme fit.</p>
                )}
              </div>
            </Card>

            {/* Recommended Moves */}
            {recommendations.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Recommended Moves</CardTitle></CardHeader>
                <div className="space-y-2">
                  {recommendations.map((tip, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-blue-500 shrink-0">&#x2022;</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      {hc && (
        <CustomHCModal
          open={customizingHC}
          teamLabel={`${userTeam.city} ${userTeam.name}`}
          initial={{
            firstName: hc.firstName,
            lastName: hc.lastName,
            age: hc.age,
            offensiveScheme: hc.offensiveScheme ?? 'west_coast',
            defensiveScheme: hc.defensiveScheme ?? 'cover_3',
            ovr: hc.ovr,
          }}
          onCancel={() => setCustomizingHC(false)}
          onConfirm={(input) => {
            const err = customizeHeadCoach(input);
            if (err) alert(err);
            setCustomizingHC(false);
          }}
        />
      )}
    </GameShell>
  );
}
