'use client';

import { ratingBgColor, ratingColor, ratingGrade, ratingHex } from '@/lib/ui/ratingColor';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { BasketballScoutingReport, TeamFit } from '@/lib/scouting/scoutingReport';

/**
 * The full scouting report body (parity with football's modal): a top summary
 * row (OVR / Team Fit / Potential), grade matrix, NBA comp, color-tiered trait &
 * key-rating bars with letter grades, combine, dev curve, strengths/weaknesses,
 * character, plus Film Review / In-Person collapsibles. Shared by the
 * ScoutingReportModal and the Draft Board's inline row expansion.
 */
export function ScoutingReportBody({
  player, report, teamFit, onScout, canScout,
}: {
  player: BasketballPlayer;
  report: BasketballScoutingReport;
  teamFit?: TeamFit | null;
  onScout?: () => void;
  canScout?: boolean;
}) {
  const maxProj = Math.max(...report.devCurve.map(d => d.projected), 1);
  const ovr = player.ratings.overall;
  const confColor = report.confidence === 'High' ? '#16a34a' : report.confidence === 'Medium' ? '#d97706' : '#dc2626';
  const riskColor = report.riskLevel === 'Low' ? '#16a34a' : report.riskLevel === 'Medium' ? '#d97706' : '#dc2626';

  return (
    <div className="space-y-4">
      {/* Top summary — OVR / Team Fit / Potential */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Overall"><span className={`text-2xl font-black tabular-nums ${ratingColor(ovr)}`}>{ovr}</span></SummaryTile>
        <SummaryTile label={teamFit ? `Team Fit · ${teamFit.abbr}` : 'Team Fit'}>
          {teamFit
            ? <><span className="text-sm font-black" style={{ color: teamFit.color }}>{teamFit.label}</span><div className="text-[10px] text-[var(--text-sec)]">{teamFit.count} on roster</div></>
            : <span className="text-sm text-[var(--text-sec)]">—</span>}
        </SummaryTile>
        <SummaryTile label="Potential"><span className={`text-2xl font-black tabular-nums ${ratingColor(report.ceiling)}`}>{report.ceiling}</span></SummaryTile>
      </div>

      <p className="text-sm">{report.summary}</p>

      <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2" style={{ background: 'var(--surface-2)' }}>
        <span>{report.scouted ? '🔍 ' : '📋 '}{report.ceilingNote}</span>
        {!report.scouted && onScout && (
          <button onClick={onScout} disabled={!canScout} className="shrink-0 px-2 py-1 rounded-md font-semibold disabled:opacity-40" style={{ background: 'var(--accent)', color: '#fff' }}>🔍 Scout</button>
        )}
      </div>

      <Section title="Draft grade">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <GradeCell label="Grade" value={report.grade} color={report.gradeColor} />
          <GradeCell label="Floor" value={String(report.floor)} />
          <GradeCell label="Ceiling" value={String(report.ceiling)} color={ratingHex(report.ceiling)} />
          <GradeCell label="Confidence" value={report.confidence} color={confColor} />
          <GradeCell label="Risk" value={report.riskLevel} color={riskColor} />
        </div>
      </Section>

      <Section title="NBA comparison">
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface-2)' }}>{report.nbaComparison}</div>
      </Section>

      <Section title="Physical traits">
        <div className="space-y-1.5">
          {report.physicalTraits.map(t => <Bar key={t.label} label={t.label} value={t.value} w="w-20" />)}
        </div>
      </Section>

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

      <Section title={`Projected development${report.scouted ? '' : ' (unconfirmed)'}`}>
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="font-bold px-2 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>{report.trajectory}</span>
          <span className="text-[var(--text-sec)]">peaks around age {report.peakAge}</span>
        </div>
        <div className="flex items-end gap-2 h-24">
          {report.devCurve.map((d, i) => (
            <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="text-[10px] font-bold tabular-nums">{d.projected}</div>
              <div className={`w-full rounded-t ${i === 0 ? 'bg-gray-400' : ratingBgColor(d.projected)}`} style={{ height: `${(d.projected / maxProj) * 100}%` }} />
              <div className="text-[9px] opacity-60">{d.label}</div>
              <div className="text-[8px] opacity-40">{d.age}y</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Position-key ratings">
        <div className="space-y-1.5">
          {report.keyRatings.map(k => <Bar key={k.label} label={k.label} value={k.value} w="w-28" grade />)}
        </div>
      </Section>

      {(report.strengths.length > 0 || report.weaknesses.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Strengths</div>
            <ul className="text-xs space-y-1">{report.strengths.length ? report.strengths.map(s => <Bullet key={s} color="#16a34a">{s}</Bullet>) : <li className="opacity-50">—</li>}</ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-1">Question marks</div>
            <ul className="text-xs space-y-1">{report.weaknesses.length ? report.weaknesses.map(s => <Bullet key={s} color="#f59e0b">{s}</Bullet>) : <li className="opacity-50">—</li>}</ul>
          </div>
        </div>
      )}

      <Section title="Character & intangibles">
        <div className="grid grid-cols-4 gap-2 mb-2">
          <GradeCell label="Work" value={String(report.character.workEthic)} color={ratingHex(report.character.workEthic)} />
          <GradeCell label="Lead" value={String(report.character.leadership)} color={ratingHex(report.character.leadership)} />
          <GradeCell label="Coach" value={String(report.character.coachability)} color={ratingHex(report.character.coachability)} />
          <GradeCell label="Compete" value={String(report.character.competitiveness)} color={ratingHex(report.character.competitiveness)} />
        </div>
        <p className="text-xs italic text-[var(--text-sec)]">{report.character.notes}</p>
      </Section>

      <details className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <summary className="px-3 py-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--accent-alt)' }}>🎞️ Film Review</summary>
        <p className="px-3 pb-3 text-xs text-[var(--text-sec)]">
          {report.strengths[0] ? `On tape: ${report.strengths.join(', ').toLowerCase()} jump out` : 'A projectable frame and feel'}{report.weaknesses[0] ? `; the questions are ${report.weaknesses.join(' and ').toLowerCase()}.` : '.'} {player.firstName} reads as a {report.trajectory.toLowerCase()} with a {report.grade} grade.
        </p>
      </details>
      <details className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <summary className="px-3 py-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--accent-alt)' }}>👁️ In-Person Observations</summary>
        <p className="px-3 pb-3 text-xs text-[var(--text-sec)]">
          Work ethic {report.character.workEthic}, compete {report.character.competitiveness}. {report.character.notes} Measures out at {report.measurables[0]?.value ?? '—'} with the tools to {report.confidence === 'High' ? 'contribute early' : 'develop with reps'}.
        </p>
      </details>
    </div>
  );
}

function SummaryTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-center">
      {children}
      <div className="text-[9px] uppercase tracking-wide opacity-60 mt-0.5">{label}</div>
    </div>
  );
}

function Bullet({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span>{children}</span>
    </li>
  );
}

function Bar({ label, value, w, grade }: { label: string; value: number; w: string; grade?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${w} shrink-0 text-[var(--text-sec)]`}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div className={`h-full rounded-full ${ratingBgColor(value)}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-12 text-right">
        {value}{grade && <span className="text-[var(--text-sec)] font-normal"> {ratingGrade(value)}</span>}
      </span>
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
