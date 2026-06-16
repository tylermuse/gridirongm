'use client';

import { getContrastText } from '@/lib/ui/ratingColor';
import type {
  UserDraftReport,
  ReportPick,
  SkillBadge,
  BadgeTone,
  DraftTradeView,
  StartingFiveSlot,
} from '@/lib/draft';

/**
 * The No-Ceilings-style team Draft Report: a team-colored header with the
 * overall grade, every selection (badges + scouting blurb + board rank + grade),
 * a Trade Activity panel, the narrative analysis sections, and the projected new
 * starting five. Rows open the player modal via onSelectPlayer.
 */

const BADGE_BG: Record<BadgeTone, string> = {
  offense: '#7c3aed',
  playmaking: '#2563eb',
  physical: '#d97706',
  defense: '#10b981',
  upside: '#db2777',
};

export function DraftReportCard({
  report,
  onSelectPlayer,
}: {
  report: UserDraftReport;
  onSelectPlayer: (playerId: string) => void;
}) {
  const headText = getContrastText(report.primaryColor);

  return (
    <section className="rounded-2xl border overflow-hidden mb-6" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {/* Header band */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ background: `linear-gradient(135deg, ${report.primaryColor}, ${report.secondaryColor})`, color: headText }}
      >
        <div
          className="flex items-center justify-center font-black text-sm rounded-lg shrink-0"
          style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.18)', color: headText }}
        >
          {report.teamAbbrev}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold tracking-widest opacity-80">DRAFT REPORT</div>
          <div className="text-lg sm:text-xl font-black leading-tight truncate">{report.teamLabel}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold tracking-widest opacity-80">OVERALL</div>
          <div
            className="flex items-center justify-center font-black text-xl rounded-full mt-0.5"
            style={{ width: 48, height: 48, background: report.overallGradeColor, color: '#fff' }}
          >
            {report.overallGrade}
          </div>
        </div>
      </div>

      {/* Selections */}
      <div className="px-4 pt-4">
        <SectionLabel>Your selections</SectionLabel>
        <div className="flex flex-col gap-3 mt-2">
          {report.picks.map(pick => (
            <SelectionRow key={pick.overall} pick={pick} onClick={() => onSelectPlayer(pick.player.id)} />
          ))}
        </div>
      </div>

      {/* Trade activity */}
      {report.trades.length > 0 && (
        <div className="px-4 pt-5">
          <SectionLabel>Trade activity</SectionLabel>
          <div className="flex flex-col gap-3 mt-2">
            {report.trades.map(t => <TradeRow key={t.index} trade={t} />)}
          </div>
        </div>
      )}

      {/* Narrative analysis */}
      {report.sections.length > 0 && (
        <div className="px-4 pt-5">
          <SectionLabel>Draft analysis</SectionLabel>
          <div className="flex flex-col gap-4 mt-3">
            {report.sections.map(s => (
              <div key={s.heading}>
                <h4 className="text-xs font-black tracking-wider mb-1" style={{ color: 'var(--accent)' }}>{s.heading}</h4>
                <p className="text-sm leading-relaxed text-[var(--text)]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New starting five */}
      {report.startingFive.length > 0 && (
        <div className="px-4 py-5">
          <SectionLabel>Your new starting five</SectionLabel>
          <div className="grid grid-cols-5 gap-2 mt-2">
            {report.startingFive.map(slot => <StarterCell key={slot.position} slot={slot} onClick={() => onSelectPlayer(slot.player.id)} />)}
          </div>
        </div>
      )}
    </section>
  );
}

function SelectionRow({ pick, onClick }: { pick: ReportPick; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-3 hover:bg-[var(--surface-2)] transition-colors"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-3">
        <div className="font-black tabular-nums text-lg shrink-0 w-10" style={{ color: 'var(--accent)' }}>#{pick.overall}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold truncate">{pick.player.firstName} {pick.player.lastName}</span>
            <PositionBadge position={pick.position} />
            <span className="text-xs text-[var(--text-sec)]">Board rank #{pick.boardRank}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {pick.badges.map(b => <Badge key={b.label} badge={b} />)}
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-sec)] mt-2 italic">&ldquo;{pick.blurb}&rdquo;</p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-base font-black tabular-nums" style={{ color: 'var(--accent)' }}>{pick.player.ratings.overall}</span>
          <span className="w-9 text-center text-sm font-black px-1 py-0.5 rounded" style={{ color: pick.gradeColor, border: `1px solid ${pick.gradeColor}` }}>{pick.grade}</span>
        </div>
      </div>
    </button>
  );
}

function TradeRow({ trade }: { trade: DraftTradeView }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
      <div className="text-xs font-black tracking-wider mb-2" style={{ color: 'var(--accent)' }}>TRADE {trade.index}: {trade.partnerLabel.toUpperCase()}</div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <AssetColumn title="You sent" assets={trade.sent} accent="#dc2626" />
        <span className="text-[var(--text-sec)] text-lg">⇄</span>
        <AssetColumn title="You received" assets={trade.received} accent="#10b981" />
      </div>
    </div>
  );
}

function AssetColumn({ title, assets, accent }: { title: string; assets: string[]; accent: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-wider mb-1" style={{ color: accent }}>{title.toUpperCase()}</div>
      <div className="flex flex-col gap-1">
        {assets.length === 0 && <span className="text-xs text-[var(--text-sec)]">—</span>}
        {assets.map((a, i) => (
          <span key={i} className="text-xs rounded px-2 py-1 border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

function StarterCell({ slot, onClick }: { slot: StartingFiveSlot; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border p-2 text-center hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] font-bold text-[var(--text-sec)]">{slot.position}</div>
      <div className="text-xs font-bold truncate leading-tight mt-0.5">{slot.player.lastName}</div>
      <div className="text-sm font-black tabular-nums" style={{ color: 'var(--accent)' }}>{slot.player.ratings.overall}</div>
      {slot.isRookie && <div className="text-[9px] font-black tracking-wide" style={{ color: '#10b981' }}>ROOKIE</div>}
    </button>
  );
}

function Badge({ badge }: { badge: SkillBadge }) {
  return (
    <span className="text-[10px] font-bold tracking-wide rounded px-1.5 py-0.5" style={{ background: BADGE_BG[badge.tone], color: '#fff' }}>
      {badge.label}
    </span>
  );
}

function PositionBadge({ position }: { position: string }) {
  return (
    <span className="text-[10px] font-black tracking-wide rounded px-1.5 py-0.5" style={{ background: 'var(--muted)', color: 'var(--text-sec)', border: '1px solid var(--border)' }}>
      {position}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-black tracking-widest uppercase text-[var(--text-sec)]">{children}</h3>;
}
