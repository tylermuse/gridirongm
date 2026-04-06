# Scouting & Pursuit — Progressive Disclosure UX Spec (v2)

**The core UX problem:** Both Draft Scouting and FA Pursuit have 3 tiers of depth, but the current UI either dumps all action buttons in a flat horizontal row (Draft) or shows results as indistinguishable text lines (FA). There's no sense of progression, no visual reward for going deeper, and no clear "funnel" guiding the user from surface-level to deep investment.

**Design goal:** Make it dead-simple to dig deeper into a player one step at a time. Each step should feel like peeling back a layer — not navigating a menu. One button, one decision: "Do I want to know more?"

**Stack context:** Next.js, Tailwind CSS, CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--text-sec`, `--accent`). Expanded content sits inside draft board rows (draft) and FA player list rows (free agency).

---

## The Design: Stacked Depth Cards with Left-Edge Depth Indicator

Each tier is a **full-width card** stacked vertically below the previous one. Instead of nesting (which eats horizontal space), visual depth is communicated through:

1. **A colored left border** that gets thicker and more saturated at each tier
2. **Background color** that shifts from light → medium → rich
3. **A single "Go Deeper" CTA** at the bottom of the stack — always just one button, for the next tier

The mental model: a vertical stack that grows downward as you invest. Data accumulates — Tier 1 data stays visible when you unlock Tier 2. The whole thing reads top-to-bottom like a document getting longer and more detailed.

```
┌─────────────────────────────────────────────────┐
│▌ TIER 1 — Film Review                    ✓ Done │  ← thin left accent, lightest bg
│▌ OVR: 68–80  ▲ Elite arm  ▼ Accuracy           │
│▌ Starter · High Potential                        │
├─────────────────────────────────────────────────┤
│██ TIER 2 — In-Person Eval                ✓ Done │  ← medium left accent, medium bg
│██ OVR: 72–78  Ratings bars  Character           │
│██ Scout's Take quote                             │
├─────────────────────────────────────────────────┤
│▓▓▓ TIER 3 — Full Evaluation             ✓ Done │  ← thick left accent, richest bg
│▓▓▓ OVR: 76  All ratings  Draft grade            │
│▓▓▓ NFL Comp  Dev Curve  Full character           │
└─────────────────────────────────────────────────┘
```

When a tier is **not yet unlocked**, it appears as a single dashed-border CTA bar below the last completed tier:

```
┌─────────────────────────────────────────────────┐
│▌ TIER 1 — Film Review                    ✓ Done │
│▌ [data]                                          │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│  👁 In-Person Eval          [Unlock · 3pts]      │  ← dashed border, muted
│  6 of 8 remaining                                │
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

---

## Shared Component: `<TieredScoutCard>`

### File: `src/components/shared/TieredScoutCard.tsx`

```tsx
interface TierConfig {
  id: string;                    // 'tier1' | 'tier2' | 'tier3'
  label: string;                 // "Film Review" / "Intel Report"
  icon: string;                  // "📋" / "👁" / "🎯"
  cost: number;                  // 1 / 3 / 5 points
  unlocked: boolean;
  content: React.ReactNode;      // rendered data for this tier
  capLabel?: string;             // "6 of 8 remaining"
  capReached?: boolean;
}

interface TieredScoutCardProps {
  tiers: [TierConfig, TierConfig, TierConfig];
  pointsRemaining: number;
  maxPoints: number;
  pointLabel: string;            // "Scout Points" / "Pursuit Points"
  onUnlock: (tierId: string) => void;
  colorScheme: 'draft' | 'fa';
}
```

### Color Schemes

```tsx
const COLOR_SCHEMES = {
  draft: {
    tier1: { bg: 'bg-sky-50',    border: 'border-sky-300',    accent: 'text-sky-700',    leftBorder: 'border-l-sky-400' },
    tier2: { bg: 'bg-indigo-50', border: 'border-indigo-300', accent: 'text-indigo-700', leftBorder: 'border-l-indigo-500' },
    tier3: { bg: 'bg-violet-50', border: 'border-violet-300', accent: 'text-violet-700', leftBorder: 'border-l-violet-600' },
  },
  fa: {
    tier1: { bg: 'bg-emerald-50', border: 'border-emerald-300', accent: 'text-emerald-700', leftBorder: 'border-l-emerald-400' },
    tier2: { bg: 'bg-purple-50',  border: 'border-purple-300',  accent: 'text-purple-700',  leftBorder: 'border-l-purple-500' },
    tier3: { bg: 'bg-amber-50',   border: 'border-amber-300',   accent: 'text-amber-700',   leftBorder: 'border-l-amber-500' },
  },
};
```

### Visual Structure

```tsx
export function TieredScoutCard({ tiers, pointsRemaining, maxPoints, pointLabel, onUnlock, colorScheme }: TieredScoutCardProps) {
  const [tier1, tier2, tier3] = tiers;
  const colors = COLOR_SCHEMES[colorScheme];
  const allTiers = [
    { tier: tier1, colors: colors.tier1, leftWidth: 'border-l-2' },
    { tier: tier2, colors: colors.tier2, leftWidth: 'border-l-[3px]' },
    { tier: tier3, colors: colors.tier3, leftWidth: 'border-l-4' },
  ];

  // Find the first locked tier (the "next step")
  const nextLockedIdx = allTiers.findIndex(t => !t.tier.unlocked);

  return (
    <div className="space-y-0">
      {/* ─── Budget bar ─── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-2)] rounded-t-lg text-xs">
        <span className="text-[var(--text-sec)] font-medium">{pointLabel}</span>
        <PointsBudget remaining={pointsRemaining} max={maxPoints} />
      </div>

      {/* ─── Completed tier cards ─── */}
      <div className="rounded-b-lg overflow-hidden border border-[var(--border)]">
        {allTiers.map(({ tier, colors: c, leftWidth }, idx) => {
          if (!tier.unlocked) return null;
          return (
            <div key={tier.id} className={`${c.bg} ${leftWidth} ${c.leftBorder} border-b border-[var(--border)] last:border-b-0`}>
              {/* Tier header */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-black/5">
                <span className="text-sm">{tier.icon}</span>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${c.accent}`}>{tier.label}</span>
                <span className="text-[10px] text-[var(--text-sec)]">✓</span>
              </div>
              {/* Tier content */}
              <div className="px-3 py-2">
                {tier.content}
              </div>
            </div>
          );
        })}

        {/* ─── Next unlock CTA (if any tier is still locked) ─── */}
        {nextLockedIdx !== -1 && nextLockedIdx < 3 && (
          <LockedTierCTA
            tier={allTiers[nextLockedIdx].tier}
            colors={allTiers[nextLockedIdx].colors}
            pointsRemaining={pointsRemaining}
            onUnlock={onUnlock}
          />
        )}
      </div>
    </div>
  );
}
```

### Locked Tier CTA — the "Go Deeper" button

```tsx
function LockedTierCTA({
  tier,
  colors,
  pointsRemaining,
  onUnlock,
}: {
  tier: TierConfig;
  colors: { bg: string; border: string; accent: string };
  pointsRemaining: number;
  onUnlock: (id: string) => void;
}) {
  const canAfford = pointsRemaining >= tier.cost;
  const blocked = tier.capReached;

  return (
    <div className={`border-t-2 border-dashed ${colors.border} ${colors.bg} bg-opacity-50 px-3 py-2.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{tier.icon}</span>
          <div>
            <span className={`text-sm font-bold ${colors.accent}`}>{tier.label}</span>
            {tier.capLabel && (
              <span className="text-[11px] text-[var(--text-sec)] ml-2">({tier.capLabel})</span>
            )}
          </div>
        </div>

        <button
          onClick={() => onUnlock(tier.id)}
          disabled={!canAfford || blocked}
          className={`
            px-4 py-1.5 rounded-lg text-sm font-bold transition-all
            ${canAfford && !blocked
              ? `bg-white ${colors.accent} border ${colors.border} shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {blocked
            ? 'Cap reached'
            : `Unlock · ${tier.cost} pt${tier.cost > 1 ? 's' : ''}`
          }
        </button>
      </div>

      {!canAfford && !blocked && (
        <p className="text-[11px] text-[var(--text-sec)] mt-1 ml-7">
          Need {tier.cost} pts, only {pointsRemaining} remaining
        </p>
      )}
    </div>
  );
}
```

### Points Budget — compact visual

```tsx
function PointsBudget({ remaining, max }: { remaining: number; max: number }) {
  const pct = (remaining / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono font-bold text-[var(--text)]">{remaining}</span>
      <span className="text-[var(--text-sec)]">pts</span>
    </div>
  );
}
```

---

## Draft Scouting: Tier Content Blocks

### Tier 1 — Film Review Content

Compact, scannable. Answers: "Is this player worth my time?"

Data source: `scoutingState.filmReviews[playerId]`

```tsx
function FilmReviewContent({ data }: {
  data: { ovrRange: { low: number; high: number }; strength: string; weakness: string; projectionTier: string; potentialHint: string }
}) {
  return (
    <div className="space-y-2">
      {/* Row 1: OVR range + badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <span className="text-[11px] text-[var(--text-sec)]">OVR </span>
          <span className="text-lg font-extrabold">{data.ovrRange.low}–{data.ovrRange.high}</span>
        </div>
        <ProjectionBadge tier={data.projectionTier} />
        <PotentialHint hint={data.potentialHint} />
      </div>

      {/* Row 2: Strength + Weakness one-liners */}
      <div className="flex gap-4 text-sm">
        <span className="flex items-start gap-1">
          <span className="text-green-600 mt-0.5 text-xs">▲</span>
          <span>{data.strength}</span>
        </span>
        <span className="flex items-start gap-1">
          <span className="text-red-500 mt-0.5 text-xs">▼</span>
          <span>{data.weakness}</span>
        </span>
      </div>
    </div>
  );
}
```

### Tier 2 — In-Person Evaluation Content

More detail. Answers: "Is this player worth my draft pick?"

Data sources: `scoutingState.inPersonEvals[playerId]`, `generateScoutingReport(player)`

```tsx
function InPersonEvalContent({
  evalData,
  filmData,
  player,
  report,
}: {
  evalData: {
    ovrRange: { low: number; high: number };
    personality: string;
    characterNotes: string;
    revealedBustBoom: boolean;
    bustBoomResult?: string;
    revealedRatingKeys: string[];
  };
  filmData: { ovrRange: { low: number; high: number } };
  player: Player;
  report: ScoutingReport;
}) {
  return (
    <div className="space-y-2.5">
      {/* Refined OVR + Bust/Boom */}
      <div className="flex items-center gap-3">
        <div>
          <span className="text-[11px] text-[var(--text-sec)]">OVR </span>
          <span className="text-lg font-extrabold">{evalData.ovrRange.low}–{evalData.ovrRange.high}</span>
          <span className="text-[10px] text-[var(--text-sec)] ml-1">(was {filmData.ovrRange.low}–{filmData.ovrRange.high})</span>
        </div>
        {evalData.revealedBustBoom && evalData.bustBoomResult && (
          <BustBoomBadge result={evalData.bustBoomResult} />
        )}
      </div>

      {/* Top 3 position ratings — horizontal bars */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">Scouted Ratings</div>
        <div className="space-y-1">
          {evalData.revealedRatingKeys.map(key => (
            <RatingBar key={key} label={formatRatingKey(key)} value={player.ratings[key]} />
          ))}
        </div>
      </div>

      {/* Physical traits (2x2 grid) */}
      {report.physicalTraits && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">Physical Traits</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(report.physicalTraits).map(([k, v]) => (
              <RatingBar key={k} label={k} value={v.value} compact />
            ))}
          </div>
        </div>
      )}

      {/* Character snippet */}
      <div className="flex items-start gap-2 bg-white/50 rounded-md p-2">
        <PersonalityBadge type={evalData.personality} />
        <p className="text-xs text-[var(--text-sec)] leading-relaxed">{evalData.characterNotes}</p>
      </div>

      {/* Combine measurables (compact) */}
      {report.combineMeasurables && <MeasurablesRow data={report.combineMeasurables} />}

      {/* Scout's Take */}
      {report.scoutsTake && (
        <blockquote className="border-l-2 border-[var(--accent)] pl-2.5 py-1 text-xs italic text-[var(--text-sec)]">
          "{report.scoutsTake}" <span className="not-italic text-[10px]">— Scout</span>
        </blockquote>
      )}
    </div>
  );
}
```

### Tier 3 — Full Evaluation Content

Everything unlocked. Answers: "Is this player worth building around?"

Data sources: `scoutingState.fullEvals[playerId]`, `generateScoutingReport(player)`, all `POSITION_KEY_RATINGS`

```tsx
function FullEvalContent({
  evalData,
  player,
  report,
}: {
  evalData: { exactOvr: number; bustBoomResult: string };
  player: Player;
  report: ScoutingReport;
}) {
  return (
    <div className="space-y-2.5">
      {/* Exact OVR + Potential + Bust/Boom */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-[11px] text-[var(--text-sec)]">True OVR</div>
          <OvrBadge value={evalData.exactOvr} size="lg" />
        </div>
        <div className="text-center">
          <div className="text-[11px] text-[var(--text-sec)]">Potential</div>
          <span className="text-lg font-extrabold">{player.potential}</span>
        </div>
        <BustBoomBadge result={evalData.bustBoomResult} />
      </div>

      {/* ALL position-specific ratings (2-col grid) */}
      <RatingsGrid player={player} keys={POSITION_KEY_RATINGS[player.position]} />

      {/* Draft Grade card */}
      {report.draftGrade && <DraftGradeCard grade={report.draftGrade} />}

      {/* Strengths & Weaknesses side-by-side */}
      {(report.strengths || report.weaknesses) && (
        <div className="grid grid-cols-2 gap-3">
          {report.strengths && (
            <div>
              <div className="text-[11px] font-bold text-green-700 mb-1">Strengths</div>
              <ul className="text-xs space-y-0.5">
                {report.strengths.map((s, i) => <li key={i}>+ {s}</li>)}
              </ul>
            </div>
          )}
          {report.weaknesses && (
            <div>
              <div className="text-[11px] font-bold text-red-600 mb-1">Weaknesses</div>
              <ul className="text-xs space-y-0.5">
                {report.weaknesses.map((w, i) => <li key={i}>− {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* NFL Comparison */}
      {report.nflComparison && (
        <div className="bg-white/50 rounded-md p-2">
          <div className="text-[11px] font-bold text-[var(--text-sec)]">NFL Comparison</div>
          <div className="text-sm font-medium">{report.nflComparison}</div>
        </div>
      )}

      {/* Development Curve */}
      {report.developmentCurve && <DevelopmentCurveChart curve={report.developmentCurve} />}

      {/* Full Character & Intangibles */}
      {report.characterReport && <CharacterReportCard report={report.characterReport} />}

      {/* Scout's Overview (long-form writeup) */}
      {report.overview && (
        <div className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{report.overview}</div>
      )}
    </div>
  );
}
```

---

## FA Pursuit: Tier Content Blocks

### Tier 1 — Intel Report Content

Data source: `pursuitState.intelReports[playerId]`

```tsx
function IntelReportContent({ data }: {
  data: {
    priority: 'money' | 'winning' | 'role' | 'loyalty';
    askingSalary: number;
    askingYears: number;
    willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
  }
}) {
  const priorityMap = {
    money:   { emoji: '💰', label: 'Wants to Get Paid',       bg: 'bg-green-100',  text: 'text-green-700' },
    winning: { emoji: '🏆', label: 'Chasing a Ring',          bg: 'bg-amber-100',  text: 'text-amber-700' },
    role:    { emoji: '🎯', label: 'Wants a Starting Role',   bg: 'bg-blue-100',   text: 'text-blue-700' },
    loyalty: { emoji: '🏠', label: 'Values Stability',        bg: 'bg-purple-100', text: 'text-purple-700' },
  };
  const willMap = {
    eager:          { label: 'Eager to talk',       color: 'text-green-600',  dot: 'bg-green-500' },
    open:           { label: 'Open to discussions',  color: 'text-yellow-600', dot: 'bg-yellow-500' },
    reluctant:      { label: 'Reluctant',            color: 'text-orange-600', dot: 'bg-orange-500' },
    not_interested: { label: 'Not interested',       color: 'text-red-600',    dot: 'bg-red-500' },
  };

  const p = priorityMap[data.priority];
  const w = willMap[data.willingness];

  return (
    <div className="space-y-2">
      {/* Priority badge */}
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${p.bg} ${p.text}`}>
        {p.emoji} {p.label}
      </span>

      {/* Asking price + Willingness */}
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-[11px] text-[var(--text-sec)]">Asking </span>
          <span className="font-bold">${data.askingSalary.toFixed(1)}M/yr · {data.askingYears}yr</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${w.dot}`} />
          <span className={`text-xs font-medium ${w.color}`}>{w.label}</span>
        </div>
      </div>
    </div>
  );
}
```

### Tier 2 — Agent Meeting Content

Data source: `pursuitState.agentMeetings[playerId]`

```tsx
function AgentMeetingContent({ data }: {
  data: {
    schemeFit: string;
    marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
    competingTeams: string[];
    fitAssessment: string;
  }
}) {
  const heatMap = {
    cold:        { label: 'Cold Market',      emoji: '❄️',  color: 'text-blue-600' },
    moderate:    { label: 'Moderate Interest', emoji: '🌤',  color: 'text-yellow-600' },
    hot:         { label: 'Hot Market',        emoji: '🔥',  color: 'text-orange-600' },
    bidding_war: { label: 'Bidding War',       emoji: '⚡',  color: 'text-red-600' },
  };
  const h = heatMap[data.marketHeat];

  return (
    <div className="space-y-2">
      {/* Market heat + Competing teams */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className={`text-xs font-bold ${h.color}`}>{h.emoji} {h.label}</span>
        {data.competingTeams.length > 0 && (
          <span className="text-xs text-[var(--text-sec)]">
            Competing: <b>{data.competingTeams.join(', ')}</b>
          </span>
        )}
      </div>

      {/* Fit assessment quote */}
      <p className="text-xs italic bg-white/50 rounded-md p-2 text-[var(--text)]">
        "{data.fitAssessment}"
      </p>

      {/* Mechanical benefits */}
      <div className="flex gap-3 text-[10px] text-[var(--text-sec)]">
        <span>✓ Asking price reduced ~8%</span>
        <span>✓ +1 negotiation round</span>
      </div>
    </div>
  );
}
```

### Tier 3 — Full Courtship Content

Data source: `pursuitState.fullCourtships[playerId]`

```tsx
function FullCourtshipContent({
  data,
  onSignAtClosing,
}: {
  data: {
    closingOffer: { salary: number; years: number };
    insight: string;
  };
  onSignAtClosing: () => void;
}) {
  return (
    <div className="space-y-2.5">
      {/* The golden closing offer — the big payoff */}
      <div className="bg-white rounded-lg border border-amber-300 p-3 text-center shadow-sm">
        <div className="text-[11px] text-[var(--text-sec)] mb-1">Guaranteed Closing Offer</div>
        <div className="text-xl font-extrabold text-[var(--text)]">
          ${data.closingOffer.salary.toFixed(1)}M/yr · {data.closingOffer.years}yr
        </div>
        <button
          onClick={onSignAtClosing}
          className="mt-2 w-full bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-lg font-bold text-sm transition-all hover:shadow-md active:scale-[0.98]"
        >
          Sign at Closing Offer
        </button>
      </div>

      {/* Insight quote */}
      <blockquote className="border-l-2 border-amber-400 pl-2.5 py-1 text-xs italic text-[var(--text)]">
        "{data.insight}"
      </blockquote>

      {/* Mechanical benefits */}
      <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-sec)]">
        <span>✓ ~17% salary discount</span>
        <span>✓ +2 negotiation rounds</span>
        <span>✓ Protected from AI signing 2 days</span>
        <span>✓ All refusals overridden</span>
      </div>
    </div>
  );
}
```

---

## Integration: Draft Board

### What to replace in `src/app/draft/page.tsx`

**Remove (~lines 1192-1230):** The current three side-by-side add-on buttons (Scout Trip, Interview, Pro Day) and their inline result cards.

**Remove (~lines 1131-1142):** The current "Scout" button that calls `deepScoutPlayer`.

**Replace with:**

1. **Inline table button** — contextual to current tier:

```tsx
function ScoutStatusCell({ playerId, scoutingState, scoutPoints, onAction }: Props) {
  const hasTier1 = !!scoutingState?.filmReviews?.[playerId];
  const hasTier2 = !!scoutingState?.inPersonEvals?.[playerId];
  const hasTier3 = !!scoutingState?.fullEvals?.[playerId];

  if (hasTier3) {
    return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Scouted</span>;
  }
  if (hasTier2) {
    return (
      <button onClick={() => onAction('tier3', playerId)} disabled={scoutPoints < 5}
        className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium hover:bg-violet-200 transition disabled:opacity-40">
        Full Eval · 5pt
      </button>
    );
  }
  if (hasTier1) {
    return (
      <button onClick={() => onAction('tier2', playerId)} disabled={scoutPoints < 3}
        className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium hover:bg-indigo-200 transition disabled:opacity-40">
        In-Person · 3pt
      </button>
    );
  }
  return (
    <button onClick={() => onAction('tier1', playerId)} disabled={scoutPoints < 1}
      className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium hover:bg-sky-200 transition disabled:opacity-40">
      Film Review · 1pt
    </button>
  );
}
```

2. **Expanded row content** — replace the old add-on buttons area with `<TieredScoutCard>`:

```tsx
// Inside the expanded prospect row:
<TieredScoutCard
  colorScheme="draft"
  pointsRemaining={scoutingState.scoutPoints}
  maxPoints={scoutingState.maxScoutPoints}
  pointLabel="Scout Points"
  onUnlock={(tierId) => {
    if (tierId === 'tier1') filmReviewPlayer(player.id);
    if (tierId === 'tier2') inPersonEvalPlayer(player.id);
    if (tierId === 'tier3') fullEvalPlayer(player.id);
  }}
  tiers={[
    {
      id: 'tier1', label: 'Film Review', icon: '📋', cost: 1,
      unlocked: !!filmReview,
      content: filmReview ? <FilmReviewContent data={filmReview} /> : null,
    },
    {
      id: 'tier2', label: 'In-Person Eval', icon: '👁', cost: 3,
      unlocked: !!inPersonEval,
      content: inPersonEval ? <InPersonEvalContent evalData={inPersonEval} filmData={filmReview} player={player} report={report} /> : null,
      capLabel: `${8 - scoutingState.inPersonEvalCount} of 8 remaining`,
      capReached: scoutingState.inPersonEvalCount >= 8,
    },
    {
      id: 'tier3', label: 'Full Evaluation', icon: '🎯', cost: 5,
      unlocked: !!fullEval,
      content: fullEval ? <FullEvalContent evalData={fullEval} player={player} report={report} /> : null,
      capLabel: `${3 - scoutingState.fullEvalCount} of 3 remaining`,
      capReached: scoutingState.fullEvalCount >= 3,
    },
  ]}
/>
```

3. **Below the TieredScoutCard**, keep showing the **Fit Score + Recommendation badge** from the existing `ScoutEvaluationPanel` — this is derived from your roster, not from scouting data, so it's always visible regardless of tier.

4. **Page-level budget bar** (replace the old scouts-remaining progress bar near ~line 1046):

```tsx
<div className="flex items-center gap-4 text-sm">
  <span className="text-[var(--text-sec)]">Scout Points:</span>
  <span className="font-bold font-mono">{scoutPoints}/{maxScoutPoints}</span>
  <PointsBudget remaining={scoutPoints} max={maxScoutPoints} />
  <span className="text-[var(--border)]">|</span>
  <span className="text-xs text-[var(--text-sec)]">In-Person: <b>{8 - inPersonEvalCount}/8</b></span>
  <span className="text-xs text-[var(--text-sec)]">Full Eval: <b>{3 - fullEvalCount}/3</b></span>
</div>
```

### ScoutingReportModal updates (`src/components/draft/ScoutingReportModal.tsx`)

The modal currently takes `isScouted: boolean` and shows either placeholder or full report. Update it to accept a `scoutTier: 0|1|2|3` and progressively reveal sections:

- **Tier 0:** Show "?" OVR, combine measurables (public), scouting label badge. CTA: "Film Review (1pt)"
- **Tier 1:** Show OVR range, strength/weakness, projection tier. Rest of sections show as blurred placeholders. CTA: "In-Person Eval (3pts)"
- **Tier 2:** Show tighter OVR range, physical traits, top 3 ratings, character, scout's take. Remaining sections blurred. CTA: "Full Eval (5pts)"
- **Tier 3:** Show everything. No more CTA.

---

## Integration: FA Player List

### What to replace in `src/app/free-agency/page.tsx`

**Current state:** Clicking the chevron expands to show `FAEvaluationPanel` directly (recommendation badge, fit score, impact assessment, etc.). There's no pursuit system — just a direct "Negotiate" button.

**New behavior:** The chevron-expanded area now shows the `<TieredScoutCard>` for FA Pursuit **above** the existing FAEvaluationPanel content.

```tsx
// Inside the expanded FA player row:

{/* Pursuit funnel */}
<TieredScoutCard
  colorScheme="fa"
  pointsRemaining={pursuitState.pursuitPoints}
  maxPoints={pursuitState.maxPursuitPoints}
  pointLabel="Pursuit Points"
  onUnlock={(tierId) => {
    if (tierId === 'tier1') gatherIntel(player.id);
    if (tierId === 'tier2') agentMeeting(player.id);
    if (tierId === 'tier3') fullCourtship(player.id);
  }}
  tiers={[
    {
      id: 'tier1', label: 'Intel Report', icon: '🔍', cost: 1,
      unlocked: !!intel,
      content: intel ? <IntelReportContent data={intel} /> : null,
    },
    {
      id: 'tier2', label: 'Agent Meeting', icon: '🤝', cost: 3,
      unlocked: !!agentMtg,
      content: agentMtg ? <AgentMeetingContent data={agentMtg} /> : null,
      capLabel: `${6 - pursuitState.agentMeetingCount} of 6 remaining`,
      capReached: pursuitState.agentMeetingCount >= 6,
    },
    {
      id: 'tier3', label: 'Full Courtship', icon: '⭐', cost: 5,
      unlocked: !!courtship,
      content: courtship ? <FullCourtshipContent data={courtship} onSignAtClosing={() => signAtClosing(player.id)} /> : null,
      capLabel: `${2 - pursuitState.fullCourtshipCount} of 2 remaining`,
      capReached: pursuitState.fullCourtshipCount >= 2,
    },
  ]}
/>

{/* Existing FA evaluation panel stays below — always visible */}
<FAEvaluationPanel player={player} ... />
```

### Negotiate button behavior changes

The "Negotiate" button in the table row should visually reflect pursuit status:

- **No pursuit:** Standard blue "Negotiate" button (works exactly as today)
- **Intel done:** "Negotiate" with small text: "Asking $X.XM" visible
- **Agent Meeting done:** "Negotiate" with green accent, tooltip: "8% discount + 1 extra round"
- **Full Courtship done:** Show TWO buttons:
  - "Negotiate (Best Terms)" — green accent
  - "Sign at Closing Offer" — golden amber, prominent

### FA page budget bar

Add alongside the existing cap space display:

```tsx
<div className="flex items-center gap-4 text-sm">
  <span className="text-[var(--text-sec)]">Pursuit Points:</span>
  <span className="font-bold font-mono">{pursuitPoints}/{maxPursuitPoints}</span>
  <PointsBudget remaining={pursuitPoints} max={maxPursuitPoints} />
  <span className="text-[var(--border)]">|</span>
  <span className="text-xs text-[var(--text-sec)]">Agent Meetings: <b>{6 - agentMeetingCount}/6</b></span>
  <span className="text-xs text-[var(--text-sec)]">Courtships: <b>{2 - courtshipCount}/2</b></span>
</div>
```

---

## Compact Tier Indicator (for table rows)

Show in the player table row, next to the player name or in a dedicated column:

```tsx
function ScoutTierDots({ tier }: { tier: 0 | 1 | 2 | 3 }) {
  const colors = ['bg-sky-400', 'bg-indigo-500', 'bg-violet-600'];
  return (
    <div className="flex gap-0.5">
      {[0, 1, 2].map(i => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < tier ? colors[i] : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}
```

---

## Unscouted/No-Pursuit State

When a player has zero tiers completed and the user expands their row, the `<TieredScoutCard>` naturally handles this — it shows no completed tier cards, just the locked CTA for Tier 1:

```
┌─────────────────────────────────────────────────┐
│  Scout Points: ████████████░░░░  12 pts         │
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
│  📋 Film Review                 [Unlock · 1pt]  │
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

This is the simplest possible state — one button, one decision. Clean.

---

## Animation (Optional Polish)

When a tier unlocks, animate the new content sliding in:

```css
@keyframes tier-reveal {
  from { opacity: 0; max-height: 0; transform: translateY(-4px); }
  to   { opacity: 1; max-height: 600px; transform: translateY(0); }
}
.tier-reveal { animation: tier-reveal 0.25s ease-out forwards; }
```

---

## Key UX Principles

1. **One button, one decision.** Only show the NEXT tier's unlock CTA. Never show all three simultaneously. The user decides: "Do I want to know more?" — that's it.

2. **Data accumulates.** Unlocking Tier 2 doesn't replace Tier 1 — it adds below it. The stack grows. You can always see everything you've learned.

3. **Locked tiers tease.** The dashed-border CTA bar says "there's more here if you invest." It feels like a door, not a wall.

4. **Costs always visible.** Budget bar at top, cost on unlock button, cap limits labeled. Zero guessing.

5. **Quick-action from table rows.** The inline tier button lets you do cheap Tier 1 scouting across many players without expanding rows. Deeper tiers require expanding to see context.

6. **The golden payoff.** FA's "Sign at Closing Offer" and Draft's exact OVR reveal are the culmination of the funnel. They should feel earned and satisfying — prominent, centered, celebratory.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/shared/TieredScoutCard.tsx` | **CREATE** | Shared progressive disclosure component + LockedTierCTA + PointsBudget |
| `src/components/shared/ScoutTierDots.tsx` | **CREATE** | Compact 3-dot tier indicator for table rows |
| `src/components/draft/FilmReviewContent.tsx` | **CREATE** | Tier 1 draft content block |
| `src/components/draft/InPersonEvalContent.tsx` | **CREATE** | Tier 2 draft content block |
| `src/components/draft/FullEvalContent.tsx` | **CREATE** | Tier 3 draft content block |
| `src/components/fa/IntelReportContent.tsx` | **CREATE** | Tier 1 FA content block |
| `src/components/fa/AgentMeetingContent.tsx` | **CREATE** | Tier 2 FA content block |
| `src/components/fa/FullCourtshipContent.tsx` | **CREATE** | Tier 3 FA content block |
| `src/app/draft/page.tsx` | **MODIFY** | Replace old scout buttons/add-ons with TieredScoutCard, update budget display |
| `src/app/free-agency/page.tsx` | **MODIFY** | Add TieredScoutCard for pursuit above FAEvaluationPanel, update budget display |
| `src/components/draft/ScoutingReportModal.tsx` | **MODIFY** | Tier-aware progressive reveal (0→1→2→3) instead of binary scouted/unscouted |
| `src/types/index.ts` | **MODIFY** | Update scoutingState type per SCOUTING_REDESIGN.md, add pursuitState type per FA_PURSUIT_REDESIGN.md |
| `src/lib/engine/store.ts` | **MODIFY** | Replace old 4 scouting actions with 3 new tiered actions; add 3 pursuit actions |
