# BS Football — Design Implementation Specs v3

Follow-up specs from the second design audit (Season 2032 ATL save). Specs 1, 11, and 12 from v2 are still pending implementation — these are NEW additions.

**Stack:** Next.js (App Router), Tailwind CSS, CSS custom properties (`--bg`, `--surface`, `--accent`, etc.). Team color vars (`--team-primary`, `--team-secondary`, etc.) are set in `GameShell.tsx` via `getTeamColorVars()`.

---

## Spec 13 — Dashboard Progress Rings for Fan Pulse / Owner Approval

**Problem:** The Fan Pulse and Owner Approval gauges are the two numbers that determine whether you get fired. They're currently rendered as plain text percentages (`48% FAN PULSE`, `54% OWNER`) in `src/app/page.tsx` (lines ~686-696). For the most consequential metrics in the game, they have zero visual weight.

**File:** `src/app/page.tsx` (Dashboard function, around line 680-700)

**Current code:**
```tsx
<div className="text-center">
  <div className={`text-lg font-black ${userTeam.approval.fanApproval >= 65 ? 'text-green-600' : userTeam.approval.fanApproval >= 35 ? 'text-amber-600' : 'text-red-600'}`}>
    {userTeam.approval.fanApproval}%
  </div>
  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Fan Pulse</div>
</div>
```

**Replace with SVG progress rings.** Create `src/components/shared/ProgressRing.tsx`:

```tsx
'use client';

export function ProgressRing({ value, label, size = 72 }: { value: number; label: string; size?: number }) {
  const radius = (size / 2) - 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const color = value >= 65 ? '#16a34a' : value >= 35 ? '#d97706' : '#dc2626';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="var(--surface-2)" strokeWidth="5"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black" style={{ color }}>{value}%</span>
        </div>
      </div>
      <span className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">{label}</span>
    </div>
  );
}
```

**In `src/app/page.tsx`, replace the approval gauges block (lines ~684-696) with:**

```tsx
<div className="flex items-center gap-4">
  <ProgressRing value={userTeam.approval.fanApproval} label="Fan Pulse" />
  <ProgressRing value={userTeam.approval.ownerApproval} label="Owner" />
  {userTeam.approval.warningIssued && (
    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">Hot Seat</span>
  )}
</div>
```

### Files to modify:
| File | Change |
|------|--------|
| `src/components/shared/ProgressRing.tsx` | **CREATE** |
| `src/app/page.tsx` | Replace plain text percentages with `<ProgressRing>` components (~line 684) |

---

## Spec 14 — OVR Tier Breakpoint Adjustment

**Problem:** The current OVR breakpoints (80+ green, 65+ blue, 50+ amber, <50 red) put nearly every starter in the amber/orange zone. Arch Manning — a franchise QB in his 5th year at 68 OVR — renders the same color as a 51 OVR backup. In a league where starter average is roughly 60-75, the tiers should center on that range.

**Current code** (in `src/components/shared/OvrBadge.tsx` or wherever `getOvrColor` is defined):

```tsx
if (ovr >= 80) return 'text-green-600';   // Elite
if (ovr >= 65) return 'text-blue-600';    // Solid
if (ovr >= 50) return 'text-amber-600';   // Average
return 'text-red-600';                     // Below average
```

**New breakpoints — shifted down to match the sim's actual OVR distribution:**

```tsx
function getOvrColor(ovr: number): string {
  if (ovr >= 75) return 'text-green-600';   // Elite starter
  if (ovr >= 60) return 'text-blue-600';    // Solid starter
  if (ovr >= 45) return 'text-amber-600';   // Depth / developmental
  return 'text-red-600';                     // Roster bubble
}

function getOvrBg(ovr: number): string {
  if (ovr >= 75) return 'bg-green-100';
  if (ovr >= 60) return 'bg-blue-100';
  if (ovr >= 45) return 'bg-amber-100';
  return 'bg-red-100';
}

function getOvrTier(ovr: number): string {
  if (ovr >= 75) return 'Elite';
  if (ovr >= 60) return 'Solid';
  if (ovr >= 45) return 'Depth';
  return 'Poor';
}
```

This means:
- A 68 OVR QB → **blue (Solid)** instead of amber
- A 77 OVR WR → **green (Elite)** instead of amber
- A 42 OVR backup → **red (Poor)** instead of amber

**Also update the rating bar tiers** in the player modal (`RatingBar` component) to match:
```tsx
const tier = value >= 80 ? 'Elite' : value >= 65 ? 'Good' : value >= 50 ? 'Average' : 'Poor';
```
→ Change to:
```tsx
const tier = value >= 80 ? 'Elite' : value >= 65 ? 'Good' : value >= 50 ? 'Avg' : 'Poor';
```
(Rating bar tiers stay as-is since individual ratings 0-99 have a different distribution than composite OVR.)

### Files to modify:
| File | Change |
|------|--------|
| `src/components/shared/OvrBadge.tsx` (or wherever `getOvrColor` lives) | Shift breakpoints to 75/60/45 |
| Apply consistently across: roster, depth chart, draft board, FA, trade cards, player modal large OVR circle | Same function, just update the thresholds |

---

## Spec 15 — History Win-Loss Sparkline

**Problem:** With 6+ seasons of data, the history timeline shows individual cards but there's no at-a-glance visual of the franchise arc. A 14-3 followed by a 4-7 tells a dramatic story that needs an instant visual.

**File:** `src/app/history/page.tsx`

**Add a sparkline bar chart above the timeline.** Place it between the "X seasons completed" text and the first season card:

```tsx
function WinLossSparkline({ seasons }: { seasons: { year: number; wins: number; losses: number }[] }) {
  if (seasons.length < 2) return null;
  const maxGames = 18; // max regular season games

  return (
    <div className="mb-6">
      <div className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2">Franchise Arc</div>
      <div className="flex items-end gap-1.5 h-16">
        {seasons.map(s => {
          const total = s.wins + s.losses;
          const pct = total > 0 ? s.wins / total : 0;
          const barH = Math.max(4, pct * 56); // 56px max bar height
          return (
            <div key={s.year} className="flex flex-col items-center gap-1" title={`S${s.year}: ${s.wins}-${s.losses}`}>
              <div className="text-[9px] font-bold text-[var(--text-sec)]">{s.wins}-{s.losses}</div>
              <div
                className={`w-8 rounded-sm transition-all ${pct >= 0.5 ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ height: `${barH}px` }}
              />
              <span className="text-[9px] text-[var(--text-sec)]">'{String(s.year).slice(-2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Extract the data from the existing `seasons` array (the same data that renders the timeline cards — each should already have `wins`, `losses`, or a `record` string that can be parsed).

### Files to modify:
| File | Change |
|------|--------|
| `src/app/history/page.tsx` | Add `WinLossSparkline` component above the timeline |

---

## Spec 16 — Dashboard Layout Gap Fix

**Problem:** There's a large empty vertical space between the next-game/injury section and the bottom cards (standings, finances, team stats). The content doesn't fill the viewport.

**File:** `src/app/page.tsx` (Dashboard function)

**Fix:** The gap likely comes from a flex/grid layout with extra space. The fix depends on the exact cause but the approach is:

1. **Add a "Recent Activity" or "Quick Links" section** in the gap between the game card row and the bottom cards:

```tsx
{/* Recent news snippet — fills the dashboard gap */}
{recentNews.length > 0 && (
  <Card>
    <div className="flex items-center justify-between mb-3">
      <span className="font-bold text-sm">Recent Activity</span>
      <Link href="/news" className="text-xs text-[var(--accent)] hover:underline">View All →</Link>
    </div>
    <div className="space-y-2">
      {recentNews.slice(0, 3).map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="text-[var(--text-sec)]">Wk{item.week}</span>
          <span className="truncate">{item.headline}</span>
        </div>
      ))}
    </div>
  </Card>
)}
```

2. **Alternatively**, ensure the bottom cards row uses `mt-auto` or remove any `flex-1` / `space-y-*` that creates unwanted spacing. Check if `<div className="max-w-6xl mx-auto space-y-4">` (line ~650) should use `space-y-3` instead.

3. **Best option: add the Recent News feed AND tighten spacing.** The dashboard should have zero dead space — every pixel should tell the GM something useful.

### Files to modify:
| File | Change |
|------|--------|
| `src/app/page.tsx` | Add recent activity section, tighten `space-y-*` gaps |

---

## Spec 17 — Game Ticker Current Week Highlight

**Problem:** The current week's game in the top ticker has a subtle `ring-1 ring-inset ring-blue-500` outline that's hard to spot at a glance. Past games use `bg-green-50` / `bg-red-50` which is very light. The ticker is the primary at-a-glance season progress indicator — it should be more scannable.

**File:** `src/components/game/GameTicker.tsx` (line ~108)

**Changes:**

1. **Stronger current week highlight** — replace the subtle ring with a solid accent border and label:

```tsx
// Replace: ${isCurrentWeek ? 'ring-1 ring-inset ring-blue-500' : ''}
// With:
${isCurrentWeek ? 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/5' : ''}
```

2. **Stronger W/L colors** — the `bg-green-50` and `bg-red-50` are nearly invisible. Bump them up:

```tsx
// Replace
bgClass = 'bg-green-50';  // wins
bgClass = 'bg-red-50';    // losses

// With
bgClass = 'bg-green-100'; // wins - more visible
bgClass = 'bg-red-100';   // losses - more visible
```

3. **Add W/L letter overlay** — the `result` variable is computed but currently only used in the title attribute. Show it visually:

```tsx
{game.played && result && (
  <div className={`absolute top-0 right-0 text-[8px] font-black px-0.5 rounded-bl ${
    result === 'W' ? 'text-green-700 bg-green-200' : result === 'L' ? 'text-red-700 bg-red-200' : 'text-amber-700 bg-amber-200'
  }`}>
    {result}
  </div>
)}
```

Add `relative` to the game tile wrapper className if not already present.

### Files to modify:
| File | Change |
|------|--------|
| `src/components/game/GameTicker.tsx` | Stronger current-week ring, bump W/L background colors, add W/L letter badge |

---

## Spec 18 — Standings Streak Column Fix

**Problem:** The rightmost column in the standings table (appears to be win/loss streak) is clipped on the right edge of the NC division tables.

**File:** Standings page component (wherever the standings table is rendered)

**Fix:** Either:
1. Add `overflow-x-auto` to the table container so it scrolls horizontally on narrow viewports
2. Reduce the min-width of the Streak column or abbreviate it
3. Make the standings card wider by reducing the gap between AC and NC columns

The simplest fix:
```tsx
<div className="overflow-x-auto">
  <table>...</table>
</div>
```

### Files to modify:
| File | Change |
|------|--------|
| Standings page component | Wrap tables in `overflow-x-auto` div |

---

## Spec 19 — Expiring Contract Visual Urgency

**Problem:** "expiring" in orange text is easy to miss in the dense roster table. Expiring contracts on starters are decision-critical — you need to re-sign, trade, or plan to lose them.

**File:** Roster page component (wherever contracts are rendered)

**Add a subtle row tint + icon for expiring starters:**

```tsx
// In the roster table row
<tr className={`
  ${player.role === 'STARTER' && isExpiring(player) ? 'bg-amber-50/50' : ''}
`}>
  ...
  <td>
    {isExpiring(player) ? (
      <span className="text-amber-600 font-medium flex items-center gap-1">
        <span className="text-[10px]">⚠️</span>
        {formatMoney(player.salary)} expiring
      </span>
    ) : (
      <span>{formatMoney(player.salary)} {player.contractYears}yr left</span>
    )}
  </td>
```

The ⚠️ icon draws the eye without being obnoxious. The row tint creates scannable "bands" of urgency across the full roster.

### Files to modify:
| File | Change |
|------|--------|
| Roster page component | Add amber row tint for expiring starters, add ⚠️ icon to contract cell |

---

## Spec 20 — Player Modal Scheme Fit Info

**Problem:** The roster table shows FIT dots (green/yellow/red) but the player modal — where you actually make re-sign/trade/cut decisions — doesn't show scheme fit at all. You have to cross-reference the roster table to know if a player fits your scheme.

**File:** Player modal component (`src/components/game/PlayerModal.tsx`)

**Add a FIT indicator next to the contract info in the modal header:**

```tsx
{/* Add after the contract/POT line */}
{fitScore !== undefined && (
  <div className="flex items-center gap-2 mt-1">
    <span className={`w-2.5 h-2.5 rounded-full ${
      fitScore >= 70 ? 'bg-green-500' : fitScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
    }`} />
    <span className="text-xs text-[var(--text-sec)]">
      {fitScore >= 70 ? 'Great' : fitScore >= 40 ? 'Neutral' : 'Poor'} Scheme Fit
      <span className={`ml-1 font-bold ${
        fitScore >= 70 ? 'text-green-600' : fitScore < 40 ? 'text-red-600' : 'text-[var(--text-sec)]'
      }`}>
        {fitScore >= 70 ? '(+2 OVR in games)' : fitScore < 40 ? '(-1 OVR in games)' : ''}
      </span>
    </span>
  </div>
)}
```

The fit score should be computed using whatever logic the roster table uses. If it's derived from player ratings vs. team scheme, pass the same calculation into the modal.

### Files to modify:
| File | Change |
|------|--------|
| `src/components/game/PlayerModal.tsx` | Add scheme fit indicator in the header section |

---

## Spec 21 — Power Rankings Overall Team Rank + Fix "Top N" Label

**Problem:** Two issues on the Power Rankings page: (1) No composite "Your team is ranked #X overall" number. (2) The "(Top 1)" / "(Top 2)" / "(Top 5)" labels next to each position are confusing — users read "Top 1" as "top-ranked" and wonder why their "Top 1" QB is ranked #23. It actually means "we're averaging your top 1 starter at this position."

**File:** Power Rankings page component

**Add a hero banner at the top:**

```tsx
{/* Overall team rank — computed as average of position group ranks */}
{(() => {
  const ranks = positionGroups.map(g => g.rank);
  const avgRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
  const tier = avgRank <= 8 ? 'Elite' : avgRank <= 16 ? 'Above Avg' : avgRank <= 24 ? 'Below Avg' : 'Bottom';
  const tierColor = avgRank <= 8 ? 'text-green-600' : avgRank <= 16 ? 'text-blue-600' : avgRank <= 24 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="text-center mb-6">
      <div className="text-5xl font-black">{avgRank}</div>
      <div className="text-sm text-[var(--text-sec)]">Overall Power Ranking</div>
      <div className={`text-sm font-bold mt-1 ${tierColor}`}>{tier}</div>
    </div>
  );
})()}
```

This gives the instant gut-check number. The position group breakdown below provides the "why."

### 21b. Fix "Top N" label confusion

In the POSITION column, change the label format from `(Top 1)` / `(Top 2)` / `(Top 5)` to something unambiguous:

```tsx
// Replace:
<span className="text-[var(--text-sec)]">(Top {count})</span>

// With:
<span className="text-[var(--text-sec)]">({count} starter{count > 1 ? 's' : ''})</span>
```

So instead of `QB (Top 1)` → it reads `QB (1 starter)`, and `OL (Top 5)` → `OL (5 starters)`.

This makes it immediately clear: "we're averaging 5 starters at OL and ranking that average against other teams."

Alternatively, add a one-line explainer below the page title:
```tsx
<p className="text-sm text-[var(--text-sec)] mb-4">
  Average OVR of top starters at each position, ranked across all 32 teams.
</p>
```

(This line may already exist — if so, keep it. The label change is the primary fix.)

### Files to modify:
| File | Change |
|------|--------|
| Power Rankings page component | Add overall rank hero number at top, change "(Top N)" to "(N starter/starters)" |

---

## Spec 22 — Sidebar Direct Finances Link

**Problem:** Finances is only accessible through the top sub-navigation tabs on certain pages (Roster, Standings). Cap management is a core GM activity — it deserves a direct sidebar link.

**File:** `src/components/game/Sidebar.tsx` (wherever `NAV_SECTIONS` is defined)

**Add Finances to the TEAM section:**

```tsx
// In the NAV_SECTIONS definition, under the 'Team' section items:
{ href: '/finances', label: 'Finances', icon: '💰' },
```

Place it between Staff and Discord (or wherever makes logical sense in the TEAM section).

### Files to modify:
| File | Change |
|------|--------|
| `src/components/game/Sidebar.tsx` (or wherever NAV_SECTIONS is defined) | Add Finances link to TEAM section |

---

## Spec 23 — News Badge Read State

**Problem:** The "My Team (17)" badge count persists even after viewing the My Team tab. There's no way to tell which news items are new.

**File:** News page component + game store

**Two-part fix:**

1. **Track last-read week in the store:**
```tsx
// In store state, add:
newsLastReadWeek: number; // default to 0
```

2. **Clear the badge when My Team tab is selected:**
```tsx
// When "My Team" tab is clicked:
useGameStore.setState({ newsLastReadWeek: week });
```

3. **Compute unread count from items after lastReadWeek:**
```tsx
const unreadCount = newsItems.filter(n =>
  n.teamId === userTeamId &&
  (n.season > lastReadSeason || (n.season === lastReadSeason && n.week > newsLastReadWeek))
).length;
```

4. **Use `unreadCount` for the badge instead of total count.**

### Files to modify:
| File | Change |
|------|--------|
| `src/lib/engine/store.ts` | Add `newsLastReadWeek` and `newsLastReadSeason` to state |
| News page component | Update badge to use unread count, set last-read on tab click |
| `src/components/game/Sidebar.tsx` | Update badge count computation to use unread logic |

---

## Spec 24 — Roster Composition Caution Colors

**Problem:** The Roster Composition row at the top of the roster page shows position counts with ideal ranges (e.g., "OL 8, 5-8"). Positions below minimum are red, but positions exactly AT minimum don't differentiate from those well above. At minimum = one injury away from trouble.

**File:** Roster page component (wherever Roster Composition renders)

**Three-tier coloring:**
```tsx
function getCompositionColor(count: number, min: number, max: number): string {
  if (count < min) return 'text-red-600';        // Below minimum — critical
  if (count === min) return 'text-amber-600';     // At minimum — one injury away
  if (count > max) return 'text-blue-600';        // Over max — consider cutting
  return 'text-green-600';                         // Healthy range
}
```

### Files to modify:
| File | Change |
|------|--------|
| Roster page component | Update position count color logic to three tiers |

---

## Recommended Implementation Order

Ship in this order to maximize impact with minimum blast radius:

1. **Spec 14 — OVR Breakpoints** (one function change, instant visual improvement across entire app)
2. **Spec 13 — Progress Rings** (one new component, isolated to dashboard)
3. **Spec 22 — Sidebar Finances Link** (one line, instant QoL)
4. **Spec 17 — Game Ticker Highlight** (small CSS change, better scannability)
5. **Spec 21 — Power Rankings Overall Rank** (small addition, high value)
6. **Spec 15 — Win-Loss Sparkline** (new component, isolated to history)
7. **Spec 16 — Dashboard Layout Gap** (layout fix + content addition)
8. **Spec 20 — Player Modal Fit Info** (small addition, better decision-making)
9. **Spec 19 — Expiring Contract Urgency** (visual enhancement, roster only)
10. **Spec 18 — Standings Streak Column** (one-line CSS fix)
11. **Spec 24 — Roster Composition Colors** (small logic change)
12. **Spec 23 — News Badge Read State** (requires store change, test carefully)

---

## Spec 25 — My Team News Feed Overhaul (Post-Game Report Cards)

**Problem:** The My Team news feed is dominated by generic coach quotes pulled from a pool of just 16 templates (8 win / 8 loss). They barely reference game context — just W/L and opponent abbreviation. Players see the same quotes cycle every ~8 weeks. The game outcome (score) is nowhere in the news card. Meanwhile, rich per-game player stats (`game.playerStats`) are fully available but completely unused by the quote system. Users described the feed as "pretty worthless."

**Goal:** Replace the `'quote'` type news items with **Post-Game Report Cards** — rich, multi-section news items that show the score, highlight key player performances from actual game stats, and deliver contextual reactions from multiple voices (coach, players, fans, beat reporter). Each game week should produce one high-value card per user team game instead of one throwaway quote.

---

### Part A — New `NewsItem` Type: `'recap'`

**File:** `src/types/index.ts`

Add `'recap'` to the `type` union:

```typescript
export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system' | 'quote' | 'rumor' | 'recap';
  teamId?: string;
  playerIds?: string[];
  headline: string;
  body?: string;
  isUserTeam: boolean;
}
```

The `'recap'` type uses the existing `body` field (currently unused by quotes) for a structured multi-line string containing the full report card content. The `headline` becomes a punchy one-liner with the score.

---

### Part B — Engine: Replace Quote Generation with Recap Generation

**File:** `src/lib/engine/store.ts`, inside `generateWeekNews()` (lines 434-482)

**Delete** the entire coach quote block — the `coachWinQuotes` array, `coachLossQuotes` array, and the `for (const game of updatedGames)` loop that generates them (lines 434-482).

**Replace with** a recap generator that pulls from `game.playerStats`. The new code goes in the same location:

```typescript
// ── Post-game recap for user team games ─────────────────────────
for (const game of updatedGames) {
  if (!game.played) continue;
  const isUserHome = game.homeTeamId === userTeamId;
  const isUserAway = game.awayTeamId === userTeamId;
  if (!isUserHome && !isUserAway) continue;

  const ut = teams.find(t => t.id === userTeamId);
  const oppId = isUserHome ? game.awayTeamId : game.homeTeamId;
  const ot = teams.find(t => t.id === oppId);
  if (!ut || !ot) continue;

  const userScore = isUserHome ? game.homeScore : game.awayScore;
  const oppScore = isUserHome ? game.awayScore : game.homeScore;
  const margin = Math.abs(userScore - oppScore);
  const won = userScore > oppScore;
  const tied = userScore === oppScore;
  const resultWord = won ? 'defeat' : tied ? 'tie' : 'fall to';

  // ── Headline: always shows the score ──
  const headline = won
    ? `${ut.abbreviation} ${resultWord} ${ot.abbreviation} ${userScore}–${oppScore}`
    : tied
      ? `${ut.abbreviation} ${resultWord} ${ot.abbreviation} ${userScore}–${oppScore}`
      : `${ut.abbreviation} ${resultWord} ${ot.abbreviation} ${oppScore}–${userScore}`;

  // ── Gather key performers from user team ──
  const performers: { name: string; line: string }[] = [];
  for (const [pid, stats] of Object.entries(game.playerStats)) {
    const p = players.find(pl => pl.id === pid);
    if (!p || p.teamId !== userTeamId) continue;
    const s = stats as Record<string, number>;

    if (p.position === 'QB' && (s.passYards ?? 0) > 0) {
      const tds = s.passTDs ?? 0;
      const ints = s.interceptions ?? 0;
      performers.push({
        name: `${p.firstName} ${p.lastName}`,
        line: `${s.passYards} yds, ${tds} TD${tds !== 1 ? 's' : ''}${ints > 0 ? `, ${ints} INT${ints !== 1 ? 's' : ''}` : ''} passing`,
      });
    }
    if ((s.rushYards ?? 0) >= 40) {
      const tds = s.rushTDs ?? 0;
      performers.push({
        name: `${p.firstName} ${p.lastName}`,
        line: `${s.rushYards} yds${tds > 0 ? `, ${tds} TD${tds !== 1 ? 's' : ''}` : ''} rushing`,
      });
    }
    if ((s.receivingYards ?? 0) >= 40) {
      const rec = s.receptions ?? 0;
      const tds = s.receivingTDs ?? 0;
      performers.push({
        name: `${p.firstName} ${p.lastName}`,
        line: `${rec} rec, ${s.receivingYards} yds${tds > 0 ? `, ${tds} TD${tds !== 1 ? 's' : ''}` : ''}`,
      });
    }
    if ((s.sacks ?? 0) >= 1) {
      performers.push({
        name: `${p.firstName} ${p.lastName}`,
        line: `${s.sacks} sack${(s.sacks ?? 0) !== 1 ? 's' : ''}`,
      });
    }
    if ((s.defensiveINTs ?? 0) >= 1) {
      performers.push({
        name: `${p.firstName} ${p.lastName}`,
        line: `${s.defensiveINTs} INT${(s.defensiveINTs ?? 0) !== 1 ? 's' : ''}`,
      });
    }
  }
  // Deduplicate: if a player has both rush + receiving, combine into one entry
  // Keep top 4 performers max
  const topPerformers = performers.slice(0, 4);

  // ── Contextual coach quote ──
  // Use margin + record + season context for richer quotes
  const record = ut.record;
  const seed = season * 10000 + week * 100 + (won ? 1 : 0);

  const coachQuotes = won
    ? margin >= 21
      ? [
          `"Complete performance on both sides of the ball."`,
          `"That's our standard. We brought it tonight."`,
          `"Dominant effort. Proud of these guys."`,
          `"Everything clicked today. That's championship football."`,
        ]
      : margin >= 10
        ? [
            `"Solid win. We controlled the game from start to finish."`,
            `"Really pleased with how we executed the game plan."`,
            `"The guys came out focused. That's what good teams do."`,
            `"Good complementary football. Defense and offense both showed up."`,
          ]
        : [
            `"Gutsy win. These close ones build character."`,
            `"That was a dogfight. Respect to ${ot.abbreviation} — they made us earn it."`,
            `"Finding ways to win tight games — that's growth."`,
            `"We kept our composure in a tough environment."`,
          ]
    : tied
      ? [
          `"Frustrating not to close that out."`,
          `"A tie feels like a loss when you had chances to win."`,
        ]
      : margin >= 21
        ? [
            `"That's on me. I have to put our guys in better positions."`,
            `"Embarrassing. We got outcoached and outplayed."`,
            `"No excuses. We weren't prepared and it showed."`,
            `"Unacceptable. We'll be making changes this week."`,
          ]
        : margin >= 10
          ? [
              `"We were outmatched today. Back to the drawing board."`,
              `"${ot.abbreviation} was the better team. We have to respond."`,
              `"Too many mistakes. Can't beat good teams playing like that."`,
              `"Disappointing. We're better than what we showed today."`,
            ]
          : [
              `"We were in it until the end but couldn't finish. That stings."`,
              `"Close loss. We need to learn how to win these."`,
              `"Just didn't make the plays when it mattered."`,
              `"A few plays away. We'll get it corrected."`,
            ];

  const coachLine = coachQuotes[seed % coachQuotes.length];

  // ── Fan reaction based on record + margin ──
  const totalGames = record.wins + record.losses;
  const winPct = totalGames > 0 ? record.wins / totalGames : 0.5;
  const fanReactions = won
    ? winPct >= 0.7
      ? [`Fans chanting "Super Bowl!" as the stadium empties.`, `Electric atmosphere. Season ticket renewals are through the roof.`]
      : winPct >= 0.4
        ? [`A much-needed win gives the fanbase a reason for optimism.`, `Solid crowd energy today. Fans are starting to believe.`]
        : [`Fans relieved to finally see a W. "About time," one longtime season-ticket holder said.`, `A rare bright spot in a tough season. Fans will take it.`]
    : winPct <= 0.3
      ? [`Boos rain down as the clock hits zero.`, `Sections of empty seats by the fourth quarter tell the story.`, `Fan frustration boiling over. Social media calling for changes.`]
      : winPct <= 0.5
        ? [`A quiet crowd files out. Patience is wearing thin.`, `Mixed reactions from a fanbase searching for answers.`]
        : [`Stunned silence from a crowd that expected more.`, `Disappointing result for a team with higher aspirations.`];

  const fanLine = fanReactions[seed % fanReactions.length];

  // ── Build body ──
  const bodyLines: string[] = [];

  // Key performers section
  if (topPerformers.length > 0) {
    bodyLines.push('KEY PERFORMERS:');
    for (const perf of topPerformers) {
      bodyLines.push(`• ${perf.name}: ${perf.line}`);
    }
    bodyLines.push('');
  }

  // Coach quote
  bodyLines.push(`POSTGAME: ${coachLine} — ${ut.abbreviation} HC`);
  bodyLines.push('');

  // Fan reaction
  bodyLines.push(`FANS: ${fanLine}`);

  // Collect playerIds for linking
  const recapPlayerIds = topPerformers
    .map(perf => {
      const match = players.find(p =>
        p.teamId === userTeamId && `${p.firstName} ${p.lastName}` === perf.name
      );
      return match?.id;
    })
    .filter((id): id is string => !!id);

  news.push(makeNews({
    season, week, type: 'recap',
    teamId: userTeamId!,
    playerIds: recapPlayerIds,
    headline,
    body: bodyLines.join('\n'),
    isUserTeam: true,
  }));
}
```

**Key improvements over the old system:**
- **24 coach quote templates** (4 per margin tier × 3 tiers × W/L) instead of 16 generic ones, plus tie quotes
- Quotes are **margin-aware** — blowout wins get different flavor than nail-biters
- **Fan reactions** are dynamic based on season win% — a bad team winning gets "about time" energy, a good team losing gets "stunned silence"
- **Player stat lines** pulled from actual `game.playerStats`, so the recap is never generic
- **Score always visible** in the headline

---

### Part C — News Page UI: Recap Card Rendering

**File:** `src/app/news/page.tsx`

**1. Add recap badge** to `NEWS_BADGE` (after the `rumor` entry, ~line 18):

```typescript
recap: { label: 'Recap', color: 'text-sky-700', bg: 'bg-sky-50', icon: '🏟️', border: 'border-l-sky-400' },
```

**2. Replace the card rendering** inside `filtered.map(item => ...)` (lines 111-158) to handle the `body` field for recap items. Add a body section below the headline:

```tsx
<p className="text-sm">{item.headline}</p>

{/* Recap body with structured sections */}
{item.body && (
  <div className="mt-2 text-xs text-[var(--text-sec)] space-y-1 leading-relaxed whitespace-pre-line">
    {item.body.split('\n').map((line, i) => {
      if (line.startsWith('KEY PERFORMERS:'))
        return <div key={i} className="font-bold text-[var(--text)] uppercase text-[10px] tracking-wider mt-1">{line}</div>;
      if (line.startsWith('• '))
        return <div key={i} className="ml-2">{line}</div>;
      if (line.startsWith('POSTGAME:'))
        return <div key={i} className="italic text-[var(--text)] mt-1">{line.replace('POSTGAME: ', '')}</div>;
      if (line.startsWith('FANS:'))
        return <div key={i} className="text-[var(--text-sec)] mt-1">{line.replace('FANS: ', '📣 ')}</div>;
      if (line.trim() === '') return null;
      return <div key={i}>{line}</div>;
    })}
  </div>
)}
```

This goes directly after the existing `<p className="text-sm">{item.headline}</p>` line (line 140).

---

### Part D — Dashboard: Recent News Enhancement

**File:** `src/app/page.tsx` (lines ~1077-1098)

The dashboard "Recent News" card currently shows only headlines. For recap items, also show a truncated body preview:

Inside the `recentNews.map(item => ...)` block, after `<p className="leading-tight">{item.headline}</p>` (line 1095), add:

```tsx
{item.body && item.type === 'recap' && (
  <p className="text-[10px] text-[var(--text-sec)] mt-0.5 line-clamp-2 leading-tight">
    {item.body.split('\n').filter(l => l.startsWith('• ')).slice(0, 2).join(' | ')}
  </p>
)}
```

This shows at most 2 performer stat lines in a compact format on the dashboard card, giving an at-a-glance preview without bloating the compact layout.

---

### Part E — Backward Compatibility

The old `'quote'` type items already in `newsItems` arrays from existing saves should continue to render normally — they still match `NEWS_BADGE.quote` and display their headline text. No migration needed. New weeks just stop generating `'quote'` type and generate `'recap'` instead.

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `'recap'` to NewsItem type union |
| `src/lib/engine/store.ts` | Delete lines 434-482 (quote templates + generation loop), replace with recap generator |
| `src/app/news/page.tsx` | Add `recap` to `NEWS_BADGE`, add body rendering below headline |
| `src/app/page.tsx` | Add recap body preview in dashboard Recent News card |

**Estimated effort:** Medium. The engine change is the bulk of the work, but it's a self-contained replacement within `generateWeekNews()`. The UI changes are small additions to existing rendering loops.

---

## Spec 26 — Team Spotlight Layout & Structure Overhaul

**Problem:** The Team Spotlight section at the bottom of the dashboard has three compounding issues:

1. **Width breakout:** The `<div ref={spotlightRef}>` wrapper (line 1116 of `page.tsx`) sits as a sibling to the `<div className="max-w-6xl mx-auto space-y-4">` container. Every other dashboard element is constrained to `max-w-6xl` (1152px), but the Spotlight card renders at full GameShell content width (1606px). This creates a jarring width mismatch — the card is ~450px wider than everything above it.

2. **Excessive height:** `generateTeamSpotlight()` in `debate.ts` has no topic cap. It pushes every matching topic (record overview, QB analysis, positional weaknesses, trade deadline, cap analysis, etc.), and each topic has 3-5 debate exchanges + optional fan reaction + optional player tweet. On a mid-season 4-7 save, this produces 4 topics totaling ~2,073px of height — **longer than the entire rest of the dashboard** (1,298px). The Spotlight is flavor content, but it physically dominates the page.

3. **No collapsibility:** All topics are fully expanded at all times. Users must scroll through ~2,000px of debate text to reach the bottom of the page. There's no way to skim topic headlines or skip to a topic of interest.

---

### Part A — Fix Width: Move Spotlight Inside `max-w-6xl` Wrapper

**File:** `src/app/page.tsx` (lines ~1113-1116)

**Current structure:**
```tsx
      </div>  {/* end of max-w-6xl */}

      {/* Team Spotlight */}
      <div ref={spotlightRef}>
        <TeamSpotlightSection ... />
      </div>
```

**Move the Spotlight div inside the `max-w-6xl` wrapper:**
```tsx
        {/* Team Spotlight */}
        <div ref={spotlightRef}>
          <TeamSpotlightSection ... />
        </div>

      </div>  {/* end of max-w-6xl */}
```

This is a one-line structural change (move the closing `</div>` tag). The Spotlight card will now inherit the same `max-w-6xl mx-auto` constraint as standings, finances, team stats, etc.

---

### Part B — Cap Topic Count in the Engine

**File:** `src/lib/engine/debate.ts`, inside `generateTeamSpotlight()` (~line 1622)

Just before the `return topics;` at line 1622 (and before the fan/player social media injection loop at line 1604), add a topic cap:

```typescript
// Cap at 3 topics max to keep the Spotlight scannable
const MAX_TOPICS = 3;
if (topics.length > MAX_TOPICS) {
  // Keep the first topic (always the record overview) plus the 2 most relevant others
  // Prioritize: trade deadline, QB-specific, then whatever else
  const priority = ['Trade Deadline', 'QB', 'Draft', 'Playoff'];
  const first = topics[0];
  const rest = topics.slice(1).sort((a, b) => {
    const aScore = priority.findIndex(p => a.headline.includes(p));
    const bScore = priority.findIndex(p => b.headline.includes(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });
  topics.length = 0;
  topics.push(first, ...rest.slice(0, MAX_TOPICS - 1));
}
```

Insert this block just **before** line 1604 (the fan reactions loop), so the fan/player posts only get appended to the 3 topics that survive the cap.

This reduces height from ~2,000px to ~1,200-1,400px — still substantial but no longer dwarfing the dashboard.

---

### Part C — Accordion Collapse for Topics

**File:** `src/app/page.tsx`, inside `TeamSpotlightSection` (lines 482-506)

Replace the current fully-expanded topic rendering with an accordion pattern. First topic expanded by default, others collapsed showing just headline + icon.

**Add state for expanded topics** at the top of `TeamSpotlightSection`:

```typescript
const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set([0]));

const toggleTopic = (idx: number) => {
  setExpandedTopics(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    return next;
  });
};
```

**Replace the topic rendering** (lines 484-505) with:

```tsx
<div className="space-y-3">
  {topics.map((topic, topicIdx) => {
    const isExpanded = expandedTopics.has(topicIdx);
    return (
      <div key={topicIdx} className="border border-[var(--border)] rounded-lg overflow-hidden">
        {/* Clickable header — always visible */}
        <button
          onClick={() => toggleTopic(topicIdx)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
        >
          <span className="text-base">{topic.icon}</span>
          <h4 className="text-sm font-bold flex-1">{topic.headline}</h4>
          <span className={`text-xs text-[var(--text-sec)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {/* Collapsible body */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-2.5">
            {topic.exchanges.map((exchange, exIdx) => (
              <DebateBubble
                key={exIdx}
                exchange={exchange}
                onPlayerClick={onPlayerClick}
                playerIds={topic.playerIds}
                players={allPlayers}
              />
            ))}
          </div>
        )}
      </div>
    );
  })}
</div>
```

**Key differences from current implementation:**
- Each topic gets its own bordered container (visual separation — currently they just have a thin `border-b` divider)
- Headline is a clickable button that toggles expand/collapse
- Chevron indicator rotates to show state
- Only topic 0 is expanded by default
- Collapsed topics take ~48px each instead of ~500px

**Combined height reduction:** 3 topics × 1 expanded (~500px) + 2 collapsed (~48px each) = ~596px total, down from ~2,073px. That's a **71% reduction** in vertical space consumed.

---

### Part D — "Expand All / Collapse All" Toggle

Add a convenience toggle in the card header, next to the podcast button:

```tsx
<button
  onClick={() => {
    if (expandedTopics.size === topics.length) {
      setExpandedTopics(new Set([0]));
    } else {
      setExpandedTopics(new Set(topics.map((_, i) => i)));
    }
  }}
  className="text-xs text-[var(--text-sec)] hover:text-[var(--text)] transition-colors"
>
  {expandedTopics.size === topics.length ? 'Collapse All' : 'Expand All'}
</button>
```

Place this inside the `<CardHeader>` flex container (line ~460), between the commentator subtitle and the podcast player.

---

### Part E — Topic Badge Labels (Optional Enhancement)

Add a small colored badge to each topic header to help users skim at a glance:

```typescript
function getTopicBadge(headline: string): { label: string; color: string } | null {
  const h = headline.toLowerCase();
  if (h.includes('trade')) return { label: 'Trade', color: 'text-purple-600 bg-purple-50' };
  if (h.includes('draft')) return { label: 'Draft', color: 'text-indigo-600 bg-indigo-50' };
  if (h.includes('playoff') || h.includes('postseason')) return { label: 'Playoffs', color: 'text-amber-600 bg-amber-50' };
  if (h.includes('qb') || h.includes('quarterback')) return { label: 'QB Watch', color: 'text-blue-600 bg-blue-50' };
  if (h.includes('free agent') || h.includes('signing')) return { label: 'Free Agency', color: 'text-teal-600 bg-teal-50' };
  if (h.includes('cap') || h.includes('salary')) return { label: 'Cap', color: 'text-green-600 bg-green-50' };
  if (h.includes('record') || h.includes('overview')) return { label: 'Overview', color: 'text-gray-600 bg-gray-100' };
  return null;
}
```

Render in the accordion header between the icon and the headline:

```tsx
{(() => {
  const badge = getTopicBadge(topic.headline);
  return badge ? (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badge.color}`}>
      {badge.label}
    </span>
  ) : null;
})()}
```

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/app/page.tsx` | Move `spotlightRef` div inside `max-w-6xl` wrapper |
| `src/app/page.tsx` | Add `expandedTopics` state + accordion rendering in `TeamSpotlightSection` |
| `src/app/page.tsx` | Add "Expand All / Collapse All" toggle in card header |
| `src/app/page.tsx` | Add `getTopicBadge()` helper for topic labels (optional) |
| `src/lib/engine/debate.ts` | Add `MAX_TOPICS = 3` cap before fan reaction injection (~line 1604) |

**Estimated effort:** Small-Medium. The width fix is a one-line move. The accordion is ~40 lines of JSX refactoring. The topic cap is ~10 lines of engine logic. No new dependencies, no type changes.
