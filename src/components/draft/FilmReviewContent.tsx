'use client';

import type { DraftScoutEvaluation } from '@/lib/engine/draftScoutEval';

function ProjectionBadge({ tier }: { tier: string }) {
  const color = tier === 'Starter' ? 'bg-green-100 text-green-700' : tier === 'Rotational' ? 'bg-blue-100 text-blue-700' : tier === 'Backup' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{tier}</span>;
}

function PotentialHint({ hint }: { hint: string }) {
  const color = hint === 'high' ? 'text-green-600' : hint === 'medium' ? 'text-amber-600' : 'text-red-600';
  return <span className={`text-[10px] font-medium ${color}`}>{hint.charAt(0).toUpperCase() + hint.slice(1)} Potential</span>;
}

function fitBadgeColor(badge: string): string {
  if (badge === 'Perfect Fit' || badge === 'Great Fit') return 'bg-green-100 text-green-700 border-green-200';
  if (badge === 'Good Fit' || badge === 'Solid Fit') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (badge === 'Roster Redundancy' || badge === 'Poor Fit') return 'bg-red-100 text-red-600 border-red-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

export function FilmReviewContent({ data, evaluation }: {
  data: { ovrRange: { low: number; high: number }; strength: string; weakness: string; projectionTier: string; potentialHint: string; blurb: string };
  evaluation?: DraftScoutEvaluation | null;
}) {
  return (
    <div className="space-y-2.5">
      {/* Strength / Weakness */}
      <div className="flex gap-4 text-sm">
        <span className="flex items-start gap-1"><span className="text-green-600 mt-0.5 text-xs">▲</span><span>{data.strength}</span></span>
        <span className="flex items-start gap-1"><span className="text-red-500 mt-0.5 text-xs">▼</span><span>{data.weakness}</span></span>
      </div>

      {/* Scout's Take (cohesive blurb) */}
      {data.blurb && (
        <p className="text-xs leading-relaxed text-[var(--text)]">{data.blurb}</p>
      )}

      {/* Evaluation data from scout eval system */}
      {evaluation && (
        <div className="space-y-2 pt-1 border-t border-black/5">
          {/* Fit badge + score */}

          {/* Risk factors + Combine measurables */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {evaluation.riskFactors && evaluation.riskFactors.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-0.5">Risk Factors</div>
                <ul className="space-y-0.5">
                  {evaluation.riskFactors.map((r, i) => (
                    <li key={i} className="flex items-start gap-1 text-amber-700">
                      <span className="mt-0.5">•</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {evaluation.combine && (
              <div>
                <div className="text-[10px] font-bold text-[var(--text-sec)] uppercase mb-0.5">Combine Measurables</div>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { k: '40-Yard', v: `${evaluation.combine.fortyYard}s` },
                    { k: 'Bench', v: String(evaluation.combine.benchPress) },
                    { k: 'Vertical', v: `${evaluation.combine.verticalJump}"` },
                    { k: 'Shuttle', v: `${evaluation.combine.shuttle}s` },
                  ].map(item => (
                    <div key={item.k} className="bg-[var(--surface-2)] rounded px-1.5 py-0.5 text-center">
                      <div className="text-[8px] text-[var(--text-sec)] uppercase">{item.k}</div>
                      <div className="font-bold text-[11px]">{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
