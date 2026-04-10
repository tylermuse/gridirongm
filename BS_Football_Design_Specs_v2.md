# BS Football — Design Implementation Specs v2

Self-contained implementation specs for Claude Code. Each spec includes the exact files to modify, the Tailwind/CSS to use, and TSX code ready to drop in. Ordered by impact.

**Stack:** Next.js (App Router), Tailwind CSS, CSS custom properties (`--bg: #f0f4f8`, `--surface: #fff`, `--surface-2: #e8edf4`, `--border: #d1d9e6`, `--text: #1a2332`, `--text-sec: #5a6a7e`, `--accent: #2563eb`).

---

## Spec 1 — Fix Live Sim Play-by-Play / Field Animation Sync

**Problem:** The play-by-play description text updates immediately when a new event is revealed, but the ScoreBug (score, down, distance, field position) waits until `animationComplete === true`. This creates a visible desync where the user reads what happened before seeing it on the field.

**Root cause in `src/app/game/[id]/page.tsx` (~lines 730-741):**

```tsx
// CURRENT: description shows instantly, but scores wait for animation
const displayEvent = animationComplete ? currentEvent : previousEvent;
const liveHomeScore = displayEvent?.homeScore ?? 0;
// ...
lastPlayDescription={currentEvent && !isSeparator(currentEvent.type) ? currentEvent.description : null}
```

The `displayEvent` conditional creates two timelines: text is on `currentEvent` (immediate), stats are on `displayEvent` (delayed).

**Fix:** Unify both timelines so NOTHING from the new play shows until the field animation completes. The play description should reveal alongside the score/stats update, not before.

### Changes to `src/app/game/[id]/page.tsx`:

**1. Use `displayEvent` for the play description too (~line 730):**

Replace:
```tsx
lastPlayDescription={currentEvent && !isSeparator(currentEvent.type) ? currentEvent.description : null}
```

With:
```tsx
lastPlayDescription={displayEvent && !isSeparator(displayEvent.type) ? displayEvent.description : null}
```

This ensures the description text only appears after the animation completes, perfectly synced with the scoreboard update.

**2. Add a "play resolving" indicator during animation (~line 730 area):**

During animation (when `animationComplete === false` and `revealedCount > 0`), show a subtle pulsing indicator where the play description normally appears:

```tsx
{!animationComplete && revealedCount > 0 ? (
  <div className="text-xs text-[var(--text-sec)] italic animate-pulse">
    Play in progress...
  </div>
) : null}
```

This gives the user something to look at while the field animation runs, making the wait feel intentional rather than laggy.

**3. Consider shortening animation durations at 1x speed.**

In `src/lib/game/animations.ts` (~line 77), the current formula:
```tsx
const baseDuration = speedMs * 0.35 + absYards * 12;
// capped at speedMs * 0.75
```

At 1x (4800ms), this gives animations of 1740-3600ms. This is long. Consider reducing the cap:
```tsx
// Tighten animation duration at all speeds
const baseDuration = speedMs * 0.25 + absYards * 8;
const maxDuration = speedMs * 0.55;
const duration = Math.min(baseDuration, maxDuration);
```

At 1x this gives 1200-2640ms — snappier without losing the visual.

**4. Reduce post-animation pause at 1x:**

In the page (~line 533-544):
```tsx
// CURRENT
const PAUSE_MS: Record<Speed, number> = { '1x': 2200, '2x': 800, '5x': 100, 'max': 0 };

// PROPOSED — 1x feels punchier
const PAUSE_MS: Record<Speed, number> = { '1x': 1400, '2x': 600, '5x': 80, 'max': 0 };
```

### Files to modify:
| File | Change |
|------|--------|
| `src/app/game/[id]/page.tsx` | Sync description with `displayEvent`, add "in progress" indicator, reduce PAUSE_MS |
| `src/lib/game/animations.ts` | Tighten duration formula |

---

## Spec 2 — OVR Color Tier System

**Problem:** OVR values on the roster table all use similar blue/orange styling regardless of value. A 71 and a 38 look nearly the same. There's no instant visual read on player quality.

**Fix:** Apply a consistent 4-tier color system everywhere OVR appears.

### The OVR tier system:

```tsx
function getOvrColor(ovr: number): string {
  if (ovr >= 80) return 'text-green-600';   // Elite
  if (ovr >= 65) return 'text-blue-600';    // Solid
  if (ovr >= 50) return 'text-amber-600';   // Average
  return 'text-red-600';                     // Below average
}

function getOvrBg(ovr: number): string {
  if (ovr >= 80) return 'bg-green-100';
  if (ovr >= 65) return 'bg-blue-100';
  if (ovr >= 50) return 'bg-amber-100';
  return 'bg-red-100';
}
```

### OVR badge component:

```tsx
function OvrBadge({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-6 text-sm',
    md: 'w-10 h-7 text-base',
    lg: 'w-14 h-10 text-xl',
  };

  return (
    <span className={`
      inline-flex items-center justify-center rounded-md font-extrabold
      ${getOvrBg(value)} ${getOvrColor(value)} ${sizeClasses[size]}
    `}>
      {value}
    </span>
  );
}
```

### Apply everywhere OVR appears:
| Location | File | Current | New |
|----------|------|---------|-----|
| Roster table | `src/app/roster/page.tsx` (or wherever roster table renders) | Static color | `<OvrBadge value={player.ovr} />` |
| Player modal | Player modal component | Plain number | `<OvrBadge value={player.ovr} size="lg" />` |
| Depth chart cards | Depth chart component | Number with one color | `<OvrBadge value={player.ovr} />` |
| Draft board | `src/app/draft/page.tsx` | Same | `<OvrBadge>` |
| FA player list | `src/app/free-agency/page.tsx` | Same | `<OvrBadge>` |
| Trade cards | Trade center component | Bold number | `<OvrBadge>` |
| QB Pyramid | `src/app/qb-pyramid/` | Number only | `<OvrBadge>` |

### Create shared component:
| File | Action |
|------|--------|
| `src/components/shared/OvrBadge.tsx` | **CREATE** — shared OVR badge with color tiers |

---

## Spec 3 — Dashboard Visual Hierarchy

**Problem:** The dashboard is a flat list of cards with no visual weight differentiation. Fan Pulse and Owner numbers are just floating percentages. Achievement badges are grayed-out text pills. The next-game card doesn't dominate.

### 3a. Fan Pulse + Owner as progress rings

Replace the plain "48% / 54%" numbers with circular progress indicators:

```tsx
function ProgressRing({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={radius} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-lg font-extrabold" style={{ color }}>{value}%</span>
      <span className="text-[11px] text-[var(--text-sec)] uppercase tracking-wider">{label}</span>
    </div>
  );
}
```

Usage on dashboard:
```tsx
<div className="flex items-center gap-6">
  <ProgressRing value={fanPulse} label="Fan Pulse" color={fanPulse >= 50 ? '#16a34a' : '#dc2626'} />
  <ProgressRing value={ownerApproval} label="Owner" color={ownerApproval >= 50 ? '#16a34a' : '#dc2626'} />
  <div className="text-xs text-[var(--text-sec)]">OWNER OBJECTIVES</div>
</div>
```

### 3b. Achievement badges as visual icons

Replace the grayed-out text pills with proper badge icons that light up when earned:

```tsx
function AchievementBadge({ name, icon, earned, progress }: {
  name: string; icon: string; earned: boolean; progress?: string;
}) {
  return (
    <div className={`
      flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-center
      ${earned
        ? 'bg-amber-50 border border-amber-200'
        : 'bg-gray-50 border border-transparent opacity-40'
      }
    `}>
      <span className={`text-2xl ${earned ? '' : 'grayscale'}`}>{icon}</span>
      <span className="text-[10px] font-bold leading-tight">{name}</span>
      {progress && <span className="text-[9px] text-[var(--text-sec)]">{progress}</span>}
    </div>
  );
}
```

Badge icon mapping:
```tsx
const ACHIEVEMENTS = [
  { name: 'Champion', icon: '🏆' },
  { name: 'Dynasty Builder', icon: '✏️' },
  { name: 'Perfect Season', icon: '💎' },
  { name: 'Cap Wizard', icon: '🧙' },
  { name: 'Rebuilder', icon: '🔨' },
  { name: 'Stat Stacker', icon: '📊' },
  { name: 'Trade Master', icon: '🤝' },
  { name: 'On Fire', icon: '🔥' },
  { name: 'Lockdown', icon: '🔒' },
  { name: 'All-Star Factory', icon: '⭐' },
];
```

### 3c. Next game card prominence

When there IS a next game, make it the hero element:

```tsx
<div className="bg-gradient-to-r from-[var(--surface)] to-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between">
  <div>
    <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-1">
      {isHome ? 'HOME' : 'AWAY'} · WEEK {week}
    </div>
    <div className="flex items-center gap-3">
      <img src={opponentLogo} className="w-10 h-10" />
      <div>
        <div className="text-xl font-extrabold">{isHome ? 'vs' : '@'} {opponentName}</div>
        <div className="text-sm text-[var(--text-sec)]">{opponentRecord}</div>
      </div>
    </div>
  </div>
  <button className="bg-[var(--accent)] text-white px-6 py-3 rounded-xl font-bold text-base hover:shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]">
    Watch Live
  </button>
</div>
```

When on BYE WEEK, show the injury report and a "Sim to Next Game" button instead.

### Files to modify:
| File | Change |
|------|--------|
| Dashboard page component | Replace Fan Pulse numbers with ProgressRing, update achievement rendering, update next-game card |
| `src/components/shared/ProgressRing.tsx` | **CREATE** |
| `src/components/shared/AchievementBadge.tsx` | **CREATE** |

---

## Spec 4 — Player Modal Upgrade

**Problem:** The player modal is functional but utilitarian. Silhouette placeholder, plain rating bars, two-point rating history, no personality flavor.

### 4a. Rating bars with tier labels

Replace plain colored bars with labeled rating bars:

```tsx
function RatingBar({ label, value }: { label: string; value: number }) {
  const tier = value >= 85 ? 'Elite' : value >= 70 ? 'Good' : value >= 55 ? 'Average' : 'Poor';
  const color = value >= 85 ? 'bg-green-500' : value >= 70 ? 'bg-blue-500' : value >= 55 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-sec)] w-20 text-right">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-bold w-7 text-right ${getOvrColor(value)}`}>{value}</span>
      <span className="text-[10px] text-[var(--text-sec)] w-12">{tier}</span>
    </div>
  );
}
```

### 4b. Rating History as sparkline

Replace the two-number display with a mini line chart:

```tsx
function RatingSparkline({ history }: { history: { season: string; ovr: number }[] }) {
  if (history.length < 2) return <span className="text-xs text-[var(--text-sec)]">No history</span>;

  const min = Math.min(...history.map(h => h.ovr)) - 5;
  const max = Math.max(...history.map(h => h.ovr)) + 5;
  const width = 200;
  const height = 48;

  const points = history.map((h, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((h.ovr - min) / (max - min)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {history.map((h, i) => {
          const x = (i / (history.length - 1)) * width;
          const y = height - ((h.ovr - min) / (max - min)) * height;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3" fill="var(--accent)" />
              <text x={x} y={y - 8} textAnchor="middle" className="text-[10px] fill-[var(--text)]" fontWeight="bold">
                {h.ovr}
              </text>
              <text x={x} y={height + 12} textAnchor="middle" className="text-[9px] fill-[var(--text-sec)]">
                {h.season}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

### 4c. Player personality / archetype badge

Add a one-line personality flavor below the player header:

```tsx
// Derive from player's top rating + mood + role
function getPlayerArchetype(player: Player): { label: string; emoji: string } {
  const topRating = Object.entries(player.ratings)
    .sort(([,a], [,b]) => b - a)[0][0];

  const archetypes: Record<string, { label: string; emoji: string }> = {
    throwing: { label: 'Gunslinger', emoji: '🎯' },
    awareness: { label: 'Field General', emoji: '🧠' },
    speed: { label: 'Speedster', emoji: '⚡' },
    strength: { label: 'Power Player', emoji: '💪' },
    catching: { label: 'Reliable Hands', emoji: '🙌' },
    blocking: { label: 'Trench Warrior', emoji: '🛡️' },
    tackling: { label: 'Heat Seeker', emoji: '💥' },
    coverage: { label: 'Lockdown', emoji: '🔒' },
    passRush: { label: 'Edge Rusher', emoji: '🌪️' },
    carrying: { label: 'Workhorse', emoji: '🐎' },
    agility: { label: 'Elusive', emoji: '🦎' },
    kicking: { label: 'Clutch Leg', emoji: '🦵' },
  };

  return archetypes[topRating] || { label: 'Versatile', emoji: '🔄' };
}
```

Display below the player name in the modal:
```tsx
<span className="text-xs text-[var(--text-sec)]">
  {archetype.emoji} {archetype.label}
</span>
```

### Files to modify:
| File | Change |
|------|--------|
| Player modal component | Upgrade rating bars, add sparkline, add archetype badge |
| `src/components/shared/RatingBar.tsx` | **CREATE** |
| `src/components/shared/RatingSparkline.tsx` | **CREATE** |

---

## Spec 5 — News Event Type Differentiation

**Problem:** Every news item uses the same "Signing" badge and yellow card. Coaching firings, hirings, injuries, trades, draft picks — they all look identical.

### Event type badge system:

```tsx
const NEWS_TYPES: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  fired:       { label: 'Fired',       color: 'text-red-700',    bg: 'bg-red-50',    icon: '🚫' },
  hired:       { label: 'Hired',       color: 'text-green-700',  bg: 'bg-green-50',  icon: '✅' },
  signing:     { label: 'Signing',     color: 'text-blue-700',   bg: 'bg-blue-50',   icon: '✍️' },
  trade:       { label: 'Trade',       color: 'text-purple-700', bg: 'bg-purple-50', icon: '🔄' },
  injury:      { label: 'Injury',      color: 'text-orange-700', bg: 'bg-orange-50', icon: '🏥' },
  draft:       { label: 'Draft',       color: 'text-indigo-700', bg: 'bg-indigo-50', icon: '🎯' },
  retirement:  { label: 'Retired',     color: 'text-gray-700',   bg: 'bg-gray-50',   icon: '👋' },
  award:       { label: 'Award',       color: 'text-amber-700',  bg: 'bg-amber-50',  icon: '🏅' },
  cut:         { label: 'Released',    color: 'text-red-600',    bg: 'bg-red-50',    icon: '✂️' },
  restructure: { label: 'Restructure', color: 'text-teal-700',   bg: 'bg-teal-50',   icon: '📝' },
  record:      { label: 'Record',      color: 'text-amber-700',  bg: 'bg-amber-50',  icon: '⭐' },
  default:     { label: 'News',        color: 'text-gray-700',   bg: 'bg-gray-50',   icon: '📰' },
};
```

### Detection logic:

The news generation code likely already has event types. If not, detect from the text content:

```tsx
function detectNewsType(headline: string): string {
  const lower = headline.toLowerCase();
  if (lower.includes('fires') || lower.includes('fired')) return 'fired';
  if (lower.includes('hires') || lower.includes('hired') || lower.includes('names')) return 'hired';
  if (lower.includes('signs') || lower.includes('signing')) return 'signing';
  if (lower.includes('trades') || lower.includes('traded')) return 'trade';
  if (lower.includes('injur') || lower.includes('out for')) return 'injury';
  if (lower.includes('draft') || lower.includes('selects')) return 'draft';
  if (lower.includes('retires') || lower.includes('retired')) return 'retirement';
  if (lower.includes('parts ways') || lower.includes('also parts')) return 'fired';
  if (lower.includes('releases') || lower.includes('cuts')) return 'cut';
  if (lower.includes('restructure')) return 'restructure';
  if (lower.includes('record') || lower.includes('mvp') || lower.includes('award')) return 'award';
  return 'default';
}
```

### Card styling per type:

```tsx
function NewsCard({ item }: { item: NewsItem }) {
  const type = detectNewsType(item.headline);
  const config = NEWS_TYPES[type] || NEWS_TYPES.default;

  return (
    <div className={`${config.bg} border border-opacity-30 rounded-lg p-4 ${config.color.replace('text-', 'border-')}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${config.bg} ${config.color}`}>
          {config.icon} {config.label}
        </span>
        <span className="text-xs text-[var(--text-sec)]">{item.season}</span>
      </div>
      <p className="text-sm text-[var(--text)]">{item.headline}</p>
    </div>
  );
}
```

### Files to modify:
| File | Change |
|------|--------|
| News page component | Replace uniform card styling with type-aware NewsCard |
| News generation code (if news items have a `type` field) | Ensure type is stored, not just derived from text |

---

## Spec 6 — FIT Column Tooltip + Legend

**Problem:** The green/yellow/red dots in the Roster table's FIT column are cryptic. No explanation of what "fit" means.

### Add tooltip on hover:

```tsx
function FitDot({ fitScore, schemeName }: { fitScore: number; schemeName: string }) {
  const tier = fitScore >= 70 ? 'Great' : fitScore >= 40 ? 'Neutral' : 'Poor';
  const color = fitScore >= 70 ? 'bg-green-500' : fitScore >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  const bonus = fitScore >= 70 ? '+2 OVR' : fitScore >= 40 ? '—' : '-1 OVR';

  return (
    <div className="group relative inline-flex">
      <span className={`w-3 h-3 rounded-full ${color}`} />
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
        <div className="bg-[var(--text)] text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
          <div className="font-bold">{tier} Fit</div>
          <div className="text-white/70">{schemeName} scheme</div>
          <div className={fitScore >= 70 ? 'text-green-300' : fitScore < 40 ? 'text-red-300' : 'text-white/70'}>
            {bonus} in games
          </div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[var(--text)] rotate-45" />
      </div>
    </div>
  );
}
```

### Add column header tooltip:

```tsx
<th className="group relative cursor-help">
  FIT
  <div className="absolute ... hidden group-hover:block">
    Scheme fit affects OVR in games. Great = +2, Poor = -1.
  </div>
</th>
```

### Files to modify:
| File | Change |
|------|--------|
| Roster page component | Replace plain dots with `<FitDot>` component |
| `src/components/shared/FitDot.tsx` | **CREATE** |

---

## Spec 7 — Standings Enhancements

**Problem:** Standings page is a raw data dump with no storytelling — no playoff picture, no "your team" highlight, no context.

### 7a. Highlight user's team row:

```tsx
<tr className={team.id === userTeamId
  ? 'bg-blue-50 border-l-4 border-l-[var(--accent)]'
  : ''
}>
```

### 7b. Add playoff indicators:

```tsx
function PlayoffIndicator({ status }: { status: 'clinched' | 'in_hunt' | 'eliminated' | null }) {
  if (!status) return null;
  const config = {
    clinched:   { label: 'x', title: 'Clinched Playoff Berth', color: 'text-green-600' },
    in_hunt:    { label: '•', title: 'In the Hunt',            color: 'text-amber-600' },
    eliminated: { label: 'e', title: 'Eliminated',             color: 'text-red-400' },
  };
  const c = config[status];
  return <span className={`text-xs font-bold ${c.color}`} title={c.title}>{c.label}</span>;
}
```

### 7c. Add division leader indicator:

Show a small crown or "1st" badge next to the division leader in each group.

### Files to modify:
| File | Change |
|------|--------|
| Standings page component | Add row highlighting, playoff indicators, division leader badges |

---

## Spec 8 — History Page Timeline

**Problem:** History page shows one card per season with minimal info. For a dynasty game, this is a missed opportunity.

### Add a visual timeline:

```tsx
function SeasonTimeline({ seasons }: { seasons: SeasonSummary[] }) {
  return (
    <div className="space-y-4">
      {seasons.map((season, idx) => (
        <div key={season.year} className="flex items-start gap-4">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={`w-4 h-4 rounded-full ${
              season.wonChampionship ? 'bg-amber-500' :
              season.madePlayoffs ? 'bg-green-500' :
              'bg-gray-300'
            }`} />
            {idx < seasons.length - 1 && <div className="w-0.5 h-16 bg-gray-200" />}
          </div>

          {/* Season card */}
          <div className={`flex-1 p-4 rounded-lg border ${
            season.wonChampionship ? 'bg-amber-50 border-amber-200' :
            season.madePlayoffs ? 'bg-green-50 border-green-200' :
            'bg-[var(--surface)] border-[var(--border)]'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-extrabold">Season {season.year}</span>
                <span className="ml-3 text-sm text-[var(--text-sec)]">{season.record}</span>
              </div>
              {season.wonChampionship && <span className="text-xl">🏆</span>}
              {season.madePlayoffs && !season.wonChampionship && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                  Playoffs
                </span>
              )}
              {!season.madePlayoffs && (
                <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  Missed Playoffs
                </span>
              )}
            </div>

            {/* Key stats row */}
            <div className="flex gap-6 mt-2 text-xs text-[var(--text-sec)]">
              <span>PPG: {season.ppg}</span>
              <span>Opp PPG: {season.oppPpg}</span>
              <span>Cap Space: ${season.capSpace}M</span>
            </div>

            {/* Notable events */}
            {season.notableEvents && season.notableEvents.length > 0 && (
              <div className="mt-2 text-xs text-[var(--text-sec)]">
                {season.notableEvents.join(' · ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### W-L sparkline across seasons:

```tsx
function WinLossSparkline({ seasons }: { seasons: { year: string; wins: number; losses: number }[] }) {
  const maxGames = 18;
  return (
    <div className="flex gap-1 items-end h-12">
      {seasons.map(s => {
        const pct = s.wins / (s.wins + s.losses);
        return (
          <div key={s.year} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-4 rounded-sm ${pct >= 0.5 ? 'bg-green-400' : 'bg-red-400'}`}
              style={{ height: `${pct * 48}px` }}
            />
            <span className="text-[8px] text-[var(--text-sec)]">{s.year.slice(-2)}</span>
          </div>
        );
      })}
    </div>
  );
}
```

### Files to modify:
| File | Change |
|------|--------|
| History page component | Replace simple cards with timeline layout + sparkline |

---

## Spec 9 — Consistent Sidebar Navigation

**Problem:** The sidebar completely rearranges when navigating between certain pages. The main sidebar has Dashboard/Standings/etc., but clicking Trades shows a different sidebar with TEAM/PLAYERS/OTHER sections. This context-switch is disorienting.

### Fix:

Keep ONE consistent sidebar structure across all pages:

```
BS Football

[Team Logo + Name]
Record

Season X · Week Y

LEAGUE
  Dashboard
  Standings
  Playoffs
  Stats
  News (badge)
  Recap
  History
  QB Pyramid

TEAM
  Roster
  Staff
  Finances

PLAYERS
  Re-signing
  Draft
  Free Agency
  Trades (badge)

OTHER
  Settings
  Discord

[User section]
```

The "Roster/Finances/Standings/Trades/Stats" top tabs that appear on some pages are fine as sub-navigation — they provide quick access between related views. But the sidebar itself should never rearrange.

### Files to modify:
| File | Change |
|------|--------|
| Sidebar/layout component | Unify to single consistent nav structure |

---

## Spec 10 — Trade Value Visualization

**Problem:** Trade fairness bar is a good start but "4% against you" is abstract. The red/green gradient works visually but lacks context.

### Enhanced trade value display:

```tsx
function TradeValueBar({ yourValue, theirValue }: { yourValue: number; theirValue: number }) {
  const total = yourValue + theirValue;
  const yourPct = (yourValue / total) * 100;
  const diff = yourPct - 50;
  const label = diff > 5 ? 'Great Deal' : diff > -5 ? 'Fair Trade' : diff > -15 ? 'Slight Overpay' : 'Bad Deal';
  const labelColor = diff > 5 ? 'text-green-600' : diff > -5 ? 'text-[var(--text-sec)]' : diff > -15 ? 'text-amber-600' : 'text-red-600';

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-green-400 transition-all" style={{ width: `${yourPct}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${100 - yourPct}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px]">
        <span className="text-green-600 font-medium">You get: {yourPct.toFixed(0)}%</span>
        <span className={`font-bold ${labelColor}`}>{label}</span>
        <span className="text-red-600 font-medium">They get: {(100 - yourPct).toFixed(0)}%</span>
      </div>
    </div>
  );
}
```

### Files to modify:
| File | Change |
|------|--------|
| Trade center component | Replace basic bar with labeled TradeValueBar |

---

## Recommended Implementation Order

Ship in this order to maximize impact with minimum blast radius:

1. **Spec 1 — Live Sim Sync Fix** (highest user-reported pain point, isolated fix)
2. **Spec 2 — OVR Color System** (visual polish, touches many files but low risk)
3. **Spec 5 — News Event Types** (quick win, isolated to news page)
4. **Spec 6 — FIT Tooltip** (quick win, isolated to roster)
5. **Spec 3 — Dashboard Hierarchy** (high impact, but more complex)
6. **Spec 4 — Player Modal** (medium impact, isolated)
7. **Spec 10 — Trade Value Bar** (quick enhancement)
8. **Spec 7 — Standings** (small improvement)
9. **Spec 8 — History Timeline** (nice-to-have, good for long-term players)
10. **Spec 9 — Sidebar Consistency** (structural, test carefully)
11. **Spec 11 — Team Color Branding** (high immersion impact, infrastructure already exists)
12. **Spec 12 — Draft "On the Clock" Prominence** (high drama impact during draft phase)

---

## Spec 11 — Team Color Branding

**Problem:** The `--team-primary`, `--team-secondary`, `--team-primary-light`, `--team-primary-muted`, and `--team-text-on-primary` CSS custom properties are already being SET in `GameShell.tsx` via `getTeamColorVars()` — but **zero components reference them**. Every accent color in the app is hardcoded `blue-600`. Whether you're the New York Guardians (black/teal), Kansas City Marshals (teal/silver), or Dallas Wranglers (green/gold), everything looks the same. This kills franchise immersion.

**Goal:** Replace hardcoded `blue-600` accent references with `var(--team-primary)` so the UI automatically adopts the user's team colors. The team's identity should be felt throughout the experience — sidebar, dashboard header, active nav states, buttons, badges.

### Key source files:
- `src/lib/teamColors.ts` — already generates the CSS vars (no changes needed)
- `src/components/game/GameShell.tsx` — already applies vars to root div (no changes needed)
- `src/components/game/Sidebar.tsx` — needs to consume `--team-primary`
- `src/app/page.tsx` (Dashboard) — needs team-colored header area
- `src/app/globals.css` — `--accent: #2563eb` should become the fallback

### 11a. Update `globals.css` — set `--accent` as the fallback, let team color override

In `src/app/globals.css`, add a comment explaining the override pattern:

```css
:root {
  --bg: #f0f4f8;
  --surface: #ffffff;
  --surface-2: #e8edf4;
  --border: #d1d9e6;
  --text: #1a2332;
  --text-sec: #5a6a7e;
  --accent: #2563eb;              /* default, overridden by --team-primary when a team is loaded */
  --accent-glow: rgba(37, 99, 235, 0.12);
  --green: #16a34a;
  --red: #dc2626;
  --amber: #d97706;
}
```

### 11b. Update `getTeamColorVars()` to also override `--accent`

In `src/lib/teamColors.ts`, add `--accent` and `--accent-glow` to the returned vars so every component using `var(--accent)` automatically picks up team color:

```tsx
export function getTeamColorVars(team: { primaryColor: string; secondaryColor: string }): Record<string, string> {
  return {
    '--team-primary': team.primaryColor,
    '--team-secondary': team.secondaryColor,
    '--team-primary-light': team.primaryColor + '1a',
    '--team-primary-muted': team.primaryColor + '33',
    '--team-text-on-primary': getContrastText(team.primaryColor),
    // Override the global accent so all var(--accent) references pick up team color
    '--accent': team.primaryColor,
    '--accent-glow': team.primaryColor + '1f',
  };
}
```

**This single change** means every component already using `var(--accent)` — buttons, links, active states — will automatically adopt the team's primary color without touching those components.

### 11c. Replace hardcoded `blue-600` in Sidebar active states

In `src/components/game/Sidebar.tsx`, the active nav item (line ~292) uses:
```tsx
'bg-blue-600/15 text-blue-600'
```

Replace with:
```tsx
'bg-[var(--team-primary-light)] text-[var(--team-primary)]'
// fallback: these vars are always set when GameShell renders
```

Also line ~222, the "BS" brand text:
```tsx
<span className="text-blue-600">BS</span>
```
Leave this as-is — the BS Football brand should stay blue regardless of team.

Also line ~250, the phase label:
```tsx
<span className="text-blue-600">{PHASE_LABELS[phase] ?? phase}</span>
```

Replace with:
```tsx
<span style={{ color: 'var(--team-primary)' }}>{PHASE_LABELS[phase] ?? phase}</span>
```

### 11d. Dashboard team header — add team-colored gradient banner

In `src/app/page.tsx` (~line 650-677), the team header area is plain. Wrap it in a subtle team-colored banner:

Replace the team header block:
```tsx
{/* Team header */}
<div className="flex items-center gap-4">
```

With:
```tsx
{/* Team header with team-colored gradient */}
<div
  className="flex items-center gap-4 -mx-3 md:-mx-6 -mt-3 md:-mt-6 px-3 md:px-6 pt-4 pb-5 mb-2"
  style={{
    background: `linear-gradient(135deg, var(--team-primary) 0%, ${userTeam.secondaryColor} 100%)`,
  }}
>
```

Then update the text inside to use white/contrast text:
```tsx
<h2 className="text-2xl font-black" style={{ color: 'var(--team-text-on-primary)' }}>
  {userTeam.city} {userTeam.name}
</h2>
```

And the record badge and secondary text should also be light-on-dark:
```tsx
<span className="text-sm" style={{ color: 'var(--team-text-on-primary)', opacity: 0.8 }}>
  {userTeam.conference} {userTeam.division}
</span>
```

### 11e. Other places to update (lower priority)

These are secondary locations where `blue-600` appears and could be team-colored:

| Location | File | Current | Change to |
|----------|------|---------|-----------|
| Standings user team highlight | Standings page | `bg-blue-50 border-l-[var(--accent)]` | Already works if 11b is done |
| Schedule bar active game | `src/components/game/GameTicker.tsx` | Check for hardcoded blue | Use `var(--team-primary)` |
| Sim buttons | `TopBar` or wherever Sim Week lives | `bg-blue-600` | `bg-[var(--accent)]` |
| Player modal OVR ring | Player modal | Large OVR circle | Use `var(--team-primary)` for the circle bg |

### Important: handle dark team colors gracefully

Some teams have very dark primaries (NYG is `#1A1A1A`). The `getContrastText()` function handles text-on-primary, but for **backgrounds and borders** used in light UI areas (active sidebar, badges), the `--team-primary-light` (10% opacity) and `--team-primary-muted` (20% opacity) variants ensure dark colors still look good as subtle tints.

If a team's primary is near-black, you may want to use `--team-secondary` as the accent instead. Consider adding this logic:

```tsx
function getEffectiveAccent(team: { primaryColor: string; secondaryColor: string }): string {
  // If primary is too dark (< 15% luminance), use secondary for UI accents
  const r = parseInt(team.primaryColor.slice(1, 3), 16);
  const g = parseInt(team.primaryColor.slice(3, 5), 16);
  const b = parseInt(team.primaryColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.15 ? team.secondaryColor : team.primaryColor;
}
```

Then use this in `getTeamColorVars` for `--accent`:
```tsx
'--accent': getEffectiveAccent(team),
```

This way NYG (black primary, teal secondary) would get teal accents instead of near-invisible black ones.

### Files to modify:
| File | Change |
|------|--------|
| `src/lib/teamColors.ts` | Add `--accent` and `--accent-glow` overrides, add `getEffectiveAccent()` |
| `src/components/game/Sidebar.tsx` | Replace `blue-600` with `var(--team-primary)` for active states and phase label |
| `src/app/page.tsx` | Add team-colored gradient header banner on dashboard |
| `src/app/globals.css` | Add comment about override pattern (optional) |

---

## Spec 12 — Draft "On the Clock" Prominence

**Problem:** The `OnTheClockSection` in `src/app/draft/page.tsx` (lines 119-432) exists and shows the current pick, but when it's YOUR pick, the visual difference is subtle — just a small green "Your Pick" badge. This is the single most dramatic moment in a franchise sim. It should feel like the NFL Draft broadcast cutting to your war room.

**Goal:** When `isUserPick === true`, the On The Clock section should transform into a high-drama, team-branded banner that makes the player feel the weight of the moment. When it's NOT your pick, it stays subdued.

### 12a. Full-width team-branded "YOUR PICK" banner

When `isUserPick === true`, replace the subtle left-border styling with a full team-colored background:

In `src/app/draft/page.tsx`, update the OnTheClockSection header (lines 184-232):

```tsx
{/* On The Clock Header */}
<div
  className={`rounded-t-xl border border-[var(--border)] px-5 py-4 transition-all duration-500 ${
    isUserPick
      ? 'border-none shadow-lg'
      : ''
  }`}
  style={isUserPick ? {
    background: `linear-gradient(135deg, ${teamColor} 0%, ${currentTeam?.secondaryColor ?? teamColor} 100%)`,
    borderLeft: 'none',
  } : {
    borderLeft: `4px solid ${teamColor}`,
  }}
>
```

### 12b. Animated "ON THE CLOCK" text when it's your pick

When it's the user's turn, add a pulsing clock icon and larger text:

```tsx
<div className="flex items-center gap-2">
  {isUserPick ? (
    <>
      <span className="text-xl animate-pulse">⏰</span>
      <span
        className="font-black text-xl sm:text-2xl tracking-tight"
        style={{ color: 'var(--team-text-on-primary)' }}
      >
        YOU&apos;RE ON THE CLOCK
      </span>
    </>
  ) : (
    <span className="font-black text-base sm:text-lg">On The Clock</span>
  )}
  {isUserPick && (
    <Badge variant="green" size="sm">Your Pick</Badge>
  )}
</div>
```

### 12c. Team name and pick info in contrasting text

When `isUserPick`, the secondary text should use the team's contrast color:

```tsx
<div className={`text-xs sm:text-sm ${isUserPick ? '' : 'text-[var(--text-sec)]'}`}
  style={isUserPick ? { color: 'var(--team-text-on-primary)', opacity: 0.85 } : undefined}
>
  {currentTeam ? `${currentTeam.city} ${currentTeam.name}` : 'Draft Complete'}
</div>
```

And the Round/Pick info:
```tsx
<div className={`text-xs sm:text-sm font-bold mb-1 hidden sm:block ${isUserPick ? '' : ''}`}
  style={isUserPick ? { color: 'var(--team-text-on-primary)' } : undefined}
>
  Round {currentRound}, Pick {currentPickInRound}
</div>
```

### 12d. Team badge glow effect

The team abbreviation circle should glow when it's your pick:

```tsx
<div
  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xs sm:text-sm font-black shrink-0 transition-all ${
    isUserPick ? 'ring-4 ring-white/30 shadow-lg scale-110' : 'text-white'
  }`}
  style={{
    backgroundColor: isUserPick ? 'rgba(255,255,255,0.2)' : teamColor,
    color: isUserPick ? 'var(--team-text-on-primary)' : '#fff',
    border: isUserPick ? '2px solid rgba(255,255,255,0.5)' : 'none',
  }}
>
  {currentTeam?.abbreviation ?? '--'}
</div>
```

### 12e. Needs row — team-color treatment when your pick

The needs row below the header (line ~235) should also pick up team styling:

```tsx
<div
  className={`border-x border-[var(--border)] px-5 py-3 ${isUserPick ? '' : 'bg-[var(--surface)]'}`}
  style={isUserPick ? {
    borderLeft: 'none',
    borderRight: 'none',
    background: `${teamColor}0d`, // 5% opacity team color
  } : {
    borderLeft: `4px solid ${teamColor}`,
  }}
>
```

### 12f. Draft button prominence when your pick

When it's the user's pick, the player cards in the board below should show a prominent "DRAFT" button. The current `onDraft` callback exists — ensure the button stands out:

```tsx
{isUserPick && (
  <button
    onClick={() => onDraft?.(player.id)}
    className="px-4 py-2 rounded-lg font-black text-sm text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
    style={{ backgroundColor: teamColor }}
  >
    Draft {player.lastName}
  </button>
)}
```

### 12g. Optional: countdown timer feel

For extra drama, add a visual timer bar that counts down during the user's pick window (purely cosmetic — the pick isn't actually timed, but it creates urgency):

```tsx
{isUserPick && (
  <div className="h-1 bg-white/20 rounded-full overflow-hidden mt-3">
    <div
      className="h-full bg-white/60 rounded-full animate-[shrink_30s_linear_forwards]"
      style={{ width: '100%' }}
    />
  </div>
)}
```

Add to globals.css:
```css
@keyframes shrink {
  from { width: 100%; }
  to { width: 0%; }
}
```

This is purely cosmetic — it just creates the NFL Draft broadcast feel of "time is ticking."

### Files to modify:
| File | Change |
|------|--------|
| `src/app/draft/page.tsx` | Update OnTheClockSection for team-branded isUserPick state |
| `src/app/globals.css` | Add `@keyframes shrink` for optional timer animation |
