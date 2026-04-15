'use client';

import type { Player, Position, PlayerRatings } from '@/types';
import { generateScoutingReport } from '@/lib/engine/scoutingReport';

const POSITION_KEY_RATINGS: Record<string, { key: keyof PlayerRatings; label: string }[]> = {
  QB: [{ key: 'throwing', label: 'Arm Talent' }, { key: 'awareness', label: 'Football IQ' }, { key: 'speed', label: 'Mobility' }, { key: 'agility', label: 'Pocket Movement' }],
  RB: [{ key: 'carrying', label: 'Ball Carrying' }, { key: 'speed', label: 'Speed' }, { key: 'agility', label: 'Elusiveness' }, { key: 'catching', label: 'Receiving' }],
  WR: [{ key: 'catching', label: 'Hands' }, { key: 'speed', label: 'Speed' }, { key: 'agility', label: 'Route Running' }, { key: 'awareness', label: 'Route IQ' }],
  TE: [{ key: 'catching', label: 'Receiving' }, { key: 'blocking', label: 'Blocking' }, { key: 'speed', label: 'Athleticism' }, { key: 'strength', label: 'Physicality' }],
  OL: [{ key: 'blocking', label: 'Technique' }, { key: 'strength', label: 'Power' }, { key: 'agility', label: 'Footwork' }, { key: 'awareness', label: 'Communication' }],
  DL: [{ key: 'passRush', label: 'Pass Rush' }, { key: 'strength', label: 'Power' }, { key: 'speed', label: 'First Step' }, { key: 'tackling', label: 'Run Defense' }],
  LB: [{ key: 'tackling', label: 'Tackling' }, { key: 'coverage', label: 'Coverage' }, { key: 'speed', label: 'Range' }, { key: 'awareness', label: 'Instincts' }],
  CB: [{ key: 'coverage', label: 'Coverage' }, { key: 'speed', label: 'Speed' }, { key: 'agility', label: 'Hip Fluidity' }, { key: 'awareness', label: 'Ball Skills' }],
  S: [{ key: 'coverage', label: 'Coverage' }, { key: 'tackling', label: 'Tackling' }, { key: 'speed', label: 'Range' }, { key: 'awareness', label: 'Instincts' }],
  K: [{ key: 'kicking', label: 'Leg Strength' }, { key: 'awareness', label: 'Accuracy' }],
  P: [{ key: 'kicking', label: 'Leg Strength' }, { key: 'awareness', label: 'Directional Control' }],
};

function RatingBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 65 ? 'bg-blue-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = value >= 80 ? 'text-green-600' : value >= 65 ? 'text-blue-600' : value >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-sec)] w-24 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} /></div>
      <span className={`text-xs font-bold w-7 text-right ${textColor}`}>{value}</span>
    </div>
  );
}

function BustBoomBadge({ result, player }: { result: string; player: Player }) {
  if (result === 'normal') return null;
  // Sanity check: the scout's bust/boom read can be wrong (35% mislabel rate),
  // but the potential number shown alongside is accurate. Don't render a label
  // that flatly contradicts the visible potential — it confuses users.
  const potentialDelta = player.potential - player.ratings.overall;
  if (result === 'boom' && potentialDelta < 5) return null;   // no real upside to see
  if (result === 'bust' && potentialDelta > 5) return null;   // no real downside
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${result === 'bust' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{result === 'bust' ? '⚠ High Bust Risk' : '✦ Hidden Upside'}</span>;
}

export function FullEvalContent({ evalData, player, fitBadge }: {
  evalData: { exactOvr: number; bustBoomResult: string };
  player: Player;
  fitBadge?: string;
}) {
  const report = generateScoutingReport(player);
  const keyRatings = POSITION_KEY_RATINGS[player.position] ?? [];
  const ovrColor = evalData.exactOvr >= 80 ? 'text-green-600' : evalData.exactOvr >= 65 ? 'text-blue-600' : evalData.exactOvr >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-4">
        <div className="text-center"><div className="text-[11px] text-[var(--text-sec)]">True OVR</div><div className={`text-2xl font-extrabold ${ovrColor}`}>{evalData.exactOvr}</div></div>
        <div className="text-center"><div className="text-[11px] text-[var(--text-sec)]">Potential</div><span className="text-lg font-extrabold">{player.potential}</span></div>
        <BustBoomBadge result={evalData.bustBoomResult} player={player} />
        {fitBadge && (
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
            fitBadge === 'Strong Target' ? 'bg-green-50 text-green-700 border-green-200' :
            fitBadge === 'Worth a Look' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            fitBadge === 'Not a Fit' ? 'bg-red-50 text-red-600 border-red-200' :
            'bg-amber-50 text-amber-700 border-amber-200'
          }`}>{fitBadge}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {keyRatings.map(r => <RatingBar key={r.key} label={r.label} value={player.ratings[r.key]} />)}
      </div>

      {report.draftGrade && (
        <div className="grid grid-cols-5 gap-1.5 text-xs">
          {[{ l: 'Grade', v: report.draftGrade.overall }, { l: 'Floor', v: report.draftGrade.floor }, { l: 'Ceiling', v: report.draftGrade.ceiling }, { l: 'Confidence', v: report.draftGrade.confidence }, { l: 'Risk', v: report.draftGrade.riskLevel }].map(i => (
            <div key={i.l} className="bg-white/50 rounded px-2 py-1 text-center"><div className="text-[9px] text-[var(--text-sec)]">{i.l}</div><div className="font-bold">{i.v}</div></div>
          ))}
        </div>
      )}

      {(report.strengths || report.weaknesses) && (
        <div className="grid grid-cols-2 gap-3">
          {report.strengths && <div><div className="text-[11px] font-bold text-green-700 mb-1">Strengths</div><ul className="text-xs space-y-0.5">{report.strengths.map((s, i) => <li key={i}>+ {s}</li>)}</ul></div>}
          {report.weaknesses && <div><div className="text-[11px] font-bold text-red-600 mb-1">Weaknesses</div><ul className="text-xs space-y-0.5">{report.weaknesses.map((w, i) => <li key={i}>− {w}</li>)}</ul></div>}
        </div>
      )}

      {report.nflComparison && <div className="bg-white/50 rounded-md p-2"><div className="text-[11px] font-bold text-[var(--text-sec)]">NFL Comparison</div><div className="text-sm font-medium">{report.nflComparison}</div></div>}

      {report.developmentCurve && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${report.developmentCurve.trajectory === 'Rapid Riser' ? 'bg-green-100 text-green-700' : report.developmentCurve.trajectory === 'Steady Climber' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{report.developmentCurve.trajectory}</span>
            <span className="text-[10px] text-[var(--text-sec)]">Peak at age {report.developmentCurve.peakAge}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            {[{ l: 'Now', v: player.ratings.overall }, { l: 'Yr 1', v: report.developmentCurve.year1 }, { l: 'Yr 2', v: report.developmentCurve.year2 }, { l: 'Yr 3', v: report.developmentCurve.year3 }].map(y => (
              <div key={y.l} className="bg-white/50 rounded px-2 py-1 text-center"><div className="text-[9px] text-[var(--text-sec)]">{y.l}</div><div className="font-bold">{y.v}</div></div>
            ))}
          </div>
        </div>
      )}

      {/* Character & Intangibles */}
      {report.characterReport && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">Character & Intangibles</div>
          <div className="grid grid-cols-4 gap-1.5 text-xs mb-2">
            {[
              { l: 'Work Ethic', v: report.characterReport.workEthic, c: report.characterReport.workEthic === 'Elite' ? 'text-green-600' : report.characterReport.workEthic === 'Strong' ? 'text-blue-600' : report.characterReport.workEthic === 'Questionable' ? 'text-red-600' : '' },
              { l: 'Leadership', v: report.characterReport.leadership, c: '' },
              { l: 'Coachability', v: report.characterReport.coachability, c: '' },
              { l: 'Compete', v: report.characterReport.competitiveness, c: report.characterReport.competitiveness === 'Alpha Competitor' ? 'text-green-600' : report.characterReport.competitiveness === 'Competitive' ? 'text-blue-600' : 'text-red-600' },
            ].map(i => (
              <div key={i.l} className="bg-white/50 rounded px-2 py-1 text-center">
                <div className="text-[9px] text-[var(--text-sec)]">{i.l}</div>
                <div className={`font-bold ${i.c}`}>{i.v}</div>
              </div>
            ))}
          </div>
          {report.characterReport.notes && (
            <p className="text-xs italic text-[var(--text-sec)] leading-relaxed">{report.characterReport.notes}</p>
          )}
        </div>
      )}

      {/* Development Projection header */}
      {report.developmentCurve && (
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-0">Development Projection</div>
      )}

      {report.overview && <p className="text-xs text-[var(--text)] leading-relaxed">{report.overview}</p>}
    </div>
  );
}
