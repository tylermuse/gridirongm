'use client';

import { useEffect } from 'react';
import type { Player, Position, PlayerRatings } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { generateScoutingReport } from '@/lib/engine/scoutingReport';
import type { PhysicalTraitEntry, DraftGrade, DevelopmentCurve, CombineMeasurables, CharacterReport } from '@/lib/engine/scoutingReport';
import { potentialLabel, potentialColor } from '@/lib/engine/development';

// Position-specific key ratings to show in the scouted ratings section
const POSITION_KEY_RATINGS: Record<Position, { key: keyof PlayerRatings; label: string }[]> = {
  QB: [
    { key: 'throwing', label: 'Arm Talent' },
    { key: 'awareness', label: 'Football IQ' },
    { key: 'speed', label: 'Mobility' },
    { key: 'agility', label: 'Pocket Movement' },
  ],
  RB: [
    { key: 'carrying', label: 'Ball Carrying' },
    { key: 'speed', label: 'Speed' },
    { key: 'agility', label: 'Elusiveness' },
    { key: 'catching', label: 'Receiving' },
    { key: 'blocking', label: 'Pass Protection' },
  ],
  WR: [
    { key: 'catching', label: 'Hands' },
    { key: 'speed', label: 'Speed' },
    { key: 'agility', label: 'Route Running' },
    { key: 'awareness', label: 'Route IQ' },
    { key: 'strength', label: 'Physicality' },
  ],
  TE: [
    { key: 'catching', label: 'Receiving' },
    { key: 'blocking', label: 'Blocking' },
    { key: 'speed', label: 'Athleticism' },
    { key: 'strength', label: 'Physicality' },
  ],
  OL: [
    { key: 'blocking', label: 'Technique' },
    { key: 'strength', label: 'Power' },
    { key: 'agility', label: 'Footwork' },
    { key: 'awareness', label: 'Communication' },
  ],
  DL: [
    { key: 'passRush', label: 'Pass Rush' },
    { key: 'strength', label: 'Power' },
    { key: 'speed', label: 'First Step' },
    { key: 'tackling', label: 'Run Defense' },
  ],
  LB: [
    { key: 'tackling', label: 'Tackling' },
    { key: 'coverage', label: 'Coverage' },
    { key: 'speed', label: 'Range' },
    { key: 'awareness', label: 'Instincts' },
    { key: 'passRush', label: 'Blitzing' },
  ],
  CB: [
    { key: 'coverage', label: 'Coverage' },
    { key: 'speed', label: 'Speed' },
    { key: 'agility', label: 'Hip Fluidity' },
    { key: 'awareness', label: 'Ball Skills' },
    { key: 'tackling', label: 'Tackling' },
  ],
  S: [
    { key: 'coverage', label: 'Coverage' },
    { key: 'tackling', label: 'Tackling' },
    { key: 'speed', label: 'Range' },
    { key: 'awareness', label: 'Instincts' },
  ],
  K: [
    { key: 'kicking', label: 'Leg Strength' },
    { key: 'awareness', label: 'Accuracy' },
  ],
  P: [
    { key: 'kicking', label: 'Leg Strength' },
    { key: 'awareness', label: 'Directional Control' },
  ],
};

interface ScoutingReportModalProps {
  player: Player;
  isScouted: boolean;
  onClose: () => void;
  onDraft?: () => void;
  onScout?: () => void;
  isUserPick: boolean;
  scoutsRemaining: number;
  teamNeeds?: { position: Position; needScore: number; count: number; starterOvr: number }[];
  userTeamAbbr?: string;
}

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function ratingBgColor(val: number): string {
  if (val >= 80) return 'bg-green-500';
  if (val >= 65) return 'bg-blue-500';
  if (val >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function ratingGrade(val: number): string {
  if (val >= 90) return 'A+';
  if (val >= 80) return 'A';
  if (val >= 70) return 'B+';
  if (val >= 60) return 'B';
  if (val >= 50) return 'C+';
  if (val >= 40) return 'C';
  return 'D';
}

function traitBarColor(label: string): string {
  switch (label) {
    case 'Elite': return 'bg-green-500';
    case 'Above Average': return 'bg-blue-500';
    case 'Average': return 'bg-amber-500';
    default: return 'bg-red-500';
  }
}

function traitTextColor(label: string): string {
  switch (label) {
    case 'Elite': return 'text-green-600';
    case 'Above Average': return 'text-blue-600';
    case 'Average': return 'text-amber-600';
    default: return 'text-red-600';
  }
}

function TraitBar({ name, trait }: { name: string; trait: PhysicalTraitEntry }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs text-[var(--text-sec)]">{name}</div>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${traitBarColor(trait.label)}`}
          style={{ width: trait.value != null ? `${trait.value}%` : '50%' }}
        />
      </div>
      {trait.value != null ? (
        <div className={`text-xs font-bold w-8 text-right ${traitTextColor(trait.label)}`}>
          {trait.value}
        </div>
      ) : (
        <div className={`text-xs font-medium w-16 text-right ${traitTextColor(trait.label)}`}>
          {trait.label}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-t border-[var(--border)] pt-4 mt-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-2">
        {title}
      </h3>
    </div>
  );
}

function ScoutedRatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 text-xs text-[var(--text-sec)] truncate">{label}</div>
      <div className="flex-1 h-3 rounded-full bg-[var(--surface-2)] overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${ratingBgColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <div className={`text-xs font-bold w-10 text-right ${ratingColor(value)}`}>
        {value} <span className="text-[var(--text-sec)] font-normal">{ratingGrade(value)}</span>
      </div>
    </div>
  );
}

function DraftGradeCard({ grade }: { grade: DraftGrade }) {
  const gradeClr = grade.overall.startsWith('A') ? 'text-green-600' : grade.overall.startsWith('B') ? 'text-blue-600' : 'text-amber-600';
  const riskColor = grade.riskLevel === 'Low' ? 'text-green-600' : grade.riskLevel === 'Medium' ? 'text-amber-600' : 'text-red-600';
  const confColor = grade.confidence === 'High' ? 'text-green-600' : grade.confidence === 'Medium' ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Grade</div>
        <div className={`text-2xl font-black ${gradeClr}`}>{grade.overall}</div>
      </div>
      <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Floor</div>
        <div className="text-xs font-bold mt-1">{grade.floor}</div>
      </div>
      <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Ceiling</div>
        <div className="text-xs font-bold mt-1">{grade.ceiling}</div>
      </div>
      <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Confidence</div>
        <div className={`text-xs font-bold mt-1 ${confColor}`}>{grade.confidence}</div>
      </div>
      <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
        <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Risk</div>
        <div className={`text-xs font-bold mt-1 ${riskColor}`}>{grade.riskLevel}</div>
      </div>
    </div>
  );
}

function CombineMeasurablesCard({ data }: { data: CombineMeasurables }) {
  const items = [
    { label: 'Height', value: data.height },
    { label: 'Weight', value: data.weight },
    { label: '40-Yard', value: `${data.fortyYard}s` },
    { label: 'Vertical', value: data.vertical },
    { label: 'Bench', value: data.benchPress },
    { label: 'Broad Jump', value: data.broadJump },
    { label: '3-Cone', value: `${data.threeCone}s` },
    { label: 'Shuttle', value: `${data.shuttle}s` },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(item => (
        <div key={item.label} className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2 text-center">
          <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">{item.label}</div>
          <div className="text-sm font-bold font-mono mt-0.5">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function DevCurveCard({ curve, currentOvr }: { curve: DevelopmentCurve; currentOvr: number }) {
  const maxOvr = Math.max(currentOvr, curve.year1, curve.year2, curve.year3, 80);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Badge variant={curve.trajectory === 'Rapid Riser' ? 'green' : curve.trajectory === 'Steady Climber' ? 'blue' : 'amber'}>
          {curve.trajectory}
        </Badge>
        <span className="text-xs text-[var(--text-sec)]">Projected peak at age {curve.peakAge}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Now', value: currentOvr },
          { label: 'Year 1', value: curve.year1 },
          { label: 'Year 2', value: curve.year2 },
          { label: 'Year 3', value: curve.year3 },
        ].map((item, i) => (
          <div key={item.label} className="text-center">
            <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mb-1">{item.label}</div>
            <div className="relative h-20 flex items-end justify-center">
              <div
                className={`w-8 rounded-t transition-all ${i === 0 ? 'bg-gray-400' : ratingBgColor(item.value)}`}
                style={{ height: `${(item.value / maxOvr) * 100}%` }}
              />
            </div>
            <div className={`text-sm font-bold font-mono mt-1 ${i === 0 ? 'text-[var(--text-sec)]' : ratingColor(item.value)}`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CharacterReportCard({ report }: { report: CharacterReport }) {
  const workEthicColor = report.workEthic === 'Elite' ? 'text-green-600' : report.workEthic === 'Strong' ? 'text-blue-600' : report.workEthic === 'Questionable' ? 'text-red-600' : 'text-amber-600';
  const compColor = report.competitiveness === 'Alpha Competitor' ? 'text-green-600' : report.competitiveness === 'Competitive' ? 'text-blue-600' : 'text-red-600';

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2 text-center">
          <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Work Ethic</div>
          <div className={`text-xs font-bold mt-0.5 ${workEthicColor}`}>{report.workEthic}</div>
        </div>
        <div className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2 text-center">
          <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Leadership</div>
          <div className="text-xs font-bold mt-0.5">{report.leadership}</div>
        </div>
        <div className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2 text-center">
          <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Coachability</div>
          <div className="text-xs font-bold mt-0.5">{report.coachability}</div>
        </div>
        <div className="bg-[var(--surface-2)] rounded-lg px-2.5 py-2 text-center">
          <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Compete</div>
          <div className={`text-xs font-bold mt-0.5 ${compColor}`}>{report.competitiveness}</div>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-[var(--text)] italic">{report.notes}</p>
    </div>
  );
}

/* ─── Main Modal ──────────────────────────────────────────── */

export function ScoutingReportModal({
  player,
  isScouted,
  onClose,
  onDraft,
  onScout,
  isUserPick,
  scoutsRemaining,
  teamNeeds,
  userTeamAbbr,
}: ScoutingReportModalProps) {
  const report = isScouted ? generateScoutingReport(player) : null;

  // Team need assessment
  const posNeed = teamNeeds?.find(n => n.position === player.position);
  const needLevel = posNeed
    ? posNeed.needScore >= 40 ? 'critical' : posNeed.needScore >= 25 ? 'moderate' : 'low'
    : 'unknown';
  const needText = needLevel === 'critical' ? 'Critical Need'
    : needLevel === 'moderate' ? 'Moderate Need'
    : needLevel === 'low' ? 'Low Priority'
    : 'Unknown';

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const keyRatings = POSITION_KEY_RATINGS[player.position];

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[5vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-start justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-xl font-black">
              {player.firstName} {player.lastName}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge>{player.position}</Badge>
              <span className="text-sm text-[var(--text-sec)]">Age {player.age}</span>
              {isScouted ? (
                <span className={`text-sm font-medium ${potentialColor(player.potential, player.experience)}`}>
                  {potentialLabel(player.potential, player.experience)} Potential
                </span>
              ) : (
                <span className="text-sm font-medium text-[var(--text-sec)]">? Potential</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-sec)] hover:text-[var(--text)] transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-0 overflow-y-auto flex-1 min-h-0">
          {/* Top summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">OVR</div>
              {isScouted ? (
                <div className={`text-2xl font-black ${ratingColor(player.ratings.overall)}`}>
                  {player.ratings.overall}
                </div>
              ) : (
                <div className="text-2xl font-black text-[var(--text-sec)]">?</div>
              )}
            </div>
            <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">
                Team Fit {userTeamAbbr ? `(${userTeamAbbr})` : ''}
              </div>
              <div className="text-sm font-bold mt-1">
                {needLevel === 'critical' ? <span className="text-red-600">Critical Need</span>
                  : needLevel === 'moderate' ? <span className="text-amber-600">Moderate Need</span>
                  : needLevel === 'low' ? <span className="text-green-600">Low Priority</span>
                  : <span className="text-[var(--text-sec)]">Unknown</span>}
              </div>
              {posNeed && (
                <div className="text-[10px] text-[var(--text-sec)]">
                  {posNeed.count} on roster
                </div>
              )}
            </div>
          </div>

          {/* Scouting Label */}
          {player.scoutingLabel && (
            <div className="mt-3">
              <Badge variant={
                player.scoutingLabel === 'Injury history' || player.scoutingLabel === 'Character concerns'
                  ? 'amber'
                  : player.scoutingLabel === 'Pro-ready' || player.scoutingLabel === 'Combine standout'
                    ? 'green'
                    : 'default'
              }>
                {player.scoutingLabel}
              </Badge>
            </div>
          )}

          {/* ─── UNSCOUTED: Show scout prompt ─── */}
          {!isScouted && (
            <div className="border-t border-[var(--border)] pt-4 mt-4">
              <div className="text-center py-6">
                <div className="text-4xl mb-3">?</div>
                <p className="text-sm font-bold text-[var(--text)]">Unscouted Prospect</p>
                <p className="text-xs text-[var(--text-sec)] mt-1 max-w-xs mx-auto">
                  Scout this player to reveal their OVR, potential, ratings, and full scouting report.
                </p>
                {onScout && (
                  <button
                    onClick={onScout}
                    disabled={scoutsRemaining <= 0}
                    className="mt-4 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Scout Player ({scoutsRemaining} remaining)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── SCOUTED: Full report ─── */}
          {isScouted && report && (
            <>
              {/* Physical Traits */}
              {report.physicalTraits && (
                <>
                  <SectionHeader title="Physical Traits" />
                  <div className="space-y-2">
                    <TraitBar name="Speed" trait={report.physicalTraits.speed} />
                    <TraitBar name="Strength" trait={report.physicalTraits.strength} />
                    <TraitBar name="Agility" trait={report.physicalTraits.agility} />
                    <TraitBar name="Stamina" trait={report.physicalTraits.stamina} />
                  </div>
                </>
              )}

              {/* Combine Measurables */}
              {report.combineMeasurables && (
                <>
                  <SectionHeader title="Combine Measurables" />
                  <CombineMeasurablesCard data={report.combineMeasurables} />
                </>
              )}

              {/* Scouted Ratings */}
              <SectionHeader title="Scouted Ratings" />
              <div className="space-y-2">
                {keyRatings.map(r => (
                  <ScoutedRatingBar
                    key={r.key}
                    label={r.label}
                    value={player.ratings[r.key]}
                  />
                ))}
              </div>

              {/* Strengths */}
              {report.strengths && (
                <>
                  <SectionHeader title="Strengths" />
                  <ul className="space-y-1.5">
                    {report.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Weaknesses */}
              {report.weaknesses && (
                <>
                  <SectionHeader title="Weaknesses" />
                  <ul className="space-y-1.5">
                    {report.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* Player Comparison */}
              {report.nflComparison && (
                <>
                  <SectionHeader title="Player Comparison" />
                  <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-4 py-3">
                    <div className="text-sm font-bold">{report.nflComparison}</div>
                  </div>
                </>
              )}

              {/* Draft Grade */}
              {report.draftGrade && (
                <>
                  <SectionHeader title="Draft Grade" />
                  <DraftGradeCard grade={report.draftGrade} />
                </>
              )}

              {/* Development Projection */}
              {report.developmentCurve && (
                <>
                  <SectionHeader title="Development Projection" />
                  <DevCurveCard curve={report.developmentCurve} currentOvr={player.ratings.overall} />
                </>
              )}

              {/* Character & Intangibles */}
              {report.characterReport && (
                <>
                  <SectionHeader title="Character & Intangibles" />
                  <CharacterReportCard report={report.characterReport} />
                </>
              )}

              {/* Overview */}
              {report.overview && (
                <>
                  <SectionHeader title="Scout&apos;s Overview" />
                  <p className="text-sm leading-relaxed text-[var(--text)]">{report.overview}</p>
                </>
              )}

              {/* Scout's Take */}
              {report.scoutsTake && (
                <>
                  <SectionHeader title="Scout&apos;s Take" />
                  <div className="border-l-2 border-blue-500 pl-4">
                    <p className="text-sm leading-relaxed italic text-[var(--text)]">
                      &ldquo;{report.scoutsTake}&rdquo;
                    </p>
                  </div>
                </>
              )}
            </>
          )}

        </div>

        {/* Draft Button — sticky footer on mobile */}
        {isUserPick && onDraft && (
          <div className="sticky bottom-0 border-t border-[var(--border)] px-6 py-3 bg-[var(--surface)] rounded-b-2xl">
            <button
              onClick={onDraft}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg active:bg-blue-700 touch-manipulation"
            >
              Draft {player.firstName} {player.lastName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
