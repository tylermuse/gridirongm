'use client';

import { useEffect } from 'react';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BasketballScoutingReport } from '@/lib/scouting/scoutingReport';

/**
 * Full scouting report (parity 2.1) — combine measurables, a development curve,
 * a character read, an NBA-style archetype, strengths/weaknesses, and a draft
 * grade. Mirrors football's ScoutingReportModal. Unscouted reports are clearly
 * marked as projections.
 */
export function ScoutingReportModal({
  player, report, onClose, onScout, canScout,
}: {
  player: BasketballPlayer;
  report: BasketballScoutingReport;
  onClose: () => void;
  onScout?: () => void;
  canScout?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const maxProj = Math.max(...report.devCurve.map(d => d.projected), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Scouting Report</div>
            <div className="text-lg font-black truncate">{player.firstName} {player.lastName}</div>
            <div className="text-xs text-[var(--text-sec)]">
              {player.sportData.position} · Age {player.age} · {report.archetype}
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="text-3xl font-black leading-none" style={{ color: report.gradeColor }}>{report.grade}</div>
            <div className="text-[9px] uppercase tracking-widest opacity-60 mt-0.5">Grade</div>
          </div>
          <button onClick={onClose} className="text-[var(--text-sec)] hover:text-[var(--text)] text-lg leading-none px-1" title="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm">{report.summary}</p>

          <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2" style={{ background: 'var(--surface-2)' }}>
            <span>{report.scouted ? '🔍 ' : '📋 '}{report.ceilingNote}</span>
            {!report.scouted && onScout && (
              <button onClick={onScout} disabled={!canScout} className="shrink-0 px-2 py-1 rounded-md font-semibold disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>
                🔍 Scout
              </button>
            )}
          </div>

          {/* Draft grade matrix */}
          <Section title="Draft grade">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <GradeCell label="Grade" value={report.grade} color={report.gradeColor} />
              <GradeCell label="Floor" value={String(report.floor)} />
              <GradeCell label="Ceiling" value={String(report.ceiling)} />
              <GradeCell label="Confidence" value={report.confidence} />
              <GradeCell label="Risk" value={report.riskLevel} />
            </div>
          </Section>

          {/* NBA comparison */}
          <Section title="NBA comparison">
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)' }}>{report.nbaComparison}</div>
          </Section>

          {/* Physical traits */}
          <Section title="Physical traits">
            <div className="space-y-1.5">
              {report.physicalTraits.map(t => (
                <div key={t.label} className="flex items-center gap-2">
                  <span className="text-xs w-20 shrink-0 text-[var(--text-sec)]">{t.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${t.value}%`, background: 'var(--accent)' }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-7 text-right">{t.value}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Combine measurables */}
          <Section title="Combine">
            <div className="grid grid-cols-5 gap-2">
              {report.measurables.map(m => (
                <div key={m.label} className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5 text-center">
                  <div className="text-sm font-bold tabular-nums">{m.value}</div>
                  <div className="text-[8px] uppercase tracking-wide opacity-60">{m.label}</div>
                  {m.note && <div className="text-[8px] text-[var(--accent)]">{m.note}</div>}
                </div>
              ))}
            </div>
          </Section>

          {/* Development curve */}
          <Section title={`Projected development${report.scouted ? '' : ' (unconfirmed)'}`}>
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="font-bold px-2 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>{report.trajectory}</span>
              <span className="text-[var(--text-sec)]">peaks around age {report.peakAge}</span>
            </div>
            <div className="flex items-end gap-2 h-24">
              {report.devCurve.map(d => (
                <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <div className="text-[10px] font-bold tabular-nums">{d.projected}</div>
                  <div className="w-full rounded-t" style={{ height: `${(d.projected / maxProj) * 100}%`, background: 'var(--accent)', opacity: 0.35 + 0.65 * (d.projected / maxProj) }} />
                  <div className="text-[9px] opacity-60">{d.label}</div>
                  <div className="text-[8px] opacity-40">{d.age}y</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Key ratings */}
          <Section title="Position-key ratings">
            <div className="space-y-1.5">
              {report.keyRatings.map(k => (
                <div key={k.label} className="flex items-center gap-2">
                  <span className="text-xs w-24 shrink-0 text-[var(--text-sec)]">{k.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${k.value}%`, background: 'var(--accent)' }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-7 text-right">{k.value}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Strengths / weaknesses */}
          {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Strengths</div>
                <ul className="text-xs space-y-0.5">
                  {report.strengths.length ? report.strengths.map(s => <li key={s}>✅ {s}</li>) : <li className="opacity-50">—</li>}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Question marks</div>
                <ul className="text-xs space-y-0.5">
                  {report.weaknesses.length ? report.weaknesses.map(s => <li key={s}>⚠️ {s}</li>) : <li className="opacity-50">—</li>}
                </ul>
              </div>
            </div>
          )}

          {/* Character & intangibles */}
          <Section title="Character & intangibles">
            <div className="grid grid-cols-4 gap-2 mb-2">
              <GradeCell label="Work" value={String(report.character.workEthic)} />
              <GradeCell label="Lead" value={String(report.character.leadership)} />
              <GradeCell label="Coach" value={String(report.character.coachability)} />
              <GradeCell label="Compete" value={String(report.character.competitiveness)} />
            </div>
            <p className="text-xs italic text-[var(--text-sec)]">{report.character.notes}</p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-2">{title}</div>
      {children}
    </div>
  );
}

function GradeCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-2 py-2 text-center">
      <div className="text-lg font-black tabular-nums" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[8px] uppercase tracking-wide opacity-60">{label}</div>
    </div>
  );
}
