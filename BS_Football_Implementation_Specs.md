# BS Football — Design Implementation Specs

**Stack:** Next.js (App Router, Turbopack), Tailwind CSS, CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--text-sec`, `--accent`)
**Sidebar:** Fixed 260px, `bg-[var(--surface)]`, sticky `h-screen`
**Main area:** `flex-1 p-3 md:p-6 overflow-auto`
**Target:** Ship incrementally. Each spec is self-contained.

---

## Spec 1 — Team Color Theming System

**Priority: HIGH | Effort: Medium | Files: Layout root, CSS variables, team config**

### Problem
After selecting a franchise, the entire UI is identical regardless of team. A Jets user sees the same blue-gray chrome as a Chiefs user. There is no sense of team identity or ownership.

### Implementation

#### 1.1 Create a team color config

Create a file `lib/teamColors.ts` (or extend the existing team data) that maps each team abbreviation to a color palette:

```ts
export const teamColors: Record<string, {
  primary: string;       // main brand color (hex)
  secondary: string;     // accent color (hex)
  primaryLight: string;  // 10% opacity version for backgrounds
  primaryMuted: string;  // 20% opacity for hover states
  textOnPrimary: string; // white or dark text for contrast
}> = {
  NYJ: {
    primary: '#125740',
    secondary: '#ffffff',
    primaryLight: '#1257401a',
    primaryMuted: '#12574033',
    textOnPrimary: '#ffffff',
  },
  KC: {
    primary: '#E31837',
    secondary: '#FFB81C',
    primaryLight: '#E318371a',
    primaryMuted: '#E3183733',
    textOnPrimary: '#ffffff',
  },
  // ... all 32 teams
};
```

#### 1.2 Inject team colors as CSS custom properties

In the root layout component (likely `app/layout.tsx` or the league layout wrapper), when a league is loaded:

```tsx
// In the layout that wraps all in-game pages
const teamAbbr = league.userTeam; // e.g. 'NYJ'
const colors = teamColors[teamAbbr];

<div style={{
  '--team-primary': colors.primary,
  '--team-secondary': colors.secondary,
  '--team-primary-light': colors.primaryLight,
  '--team-primary-muted': colors.primaryMuted,
  '--team-text-on-primary': colors.textOnPrimary,
} as React.CSSProperties}>
  {children}
</div>
```

#### 1.3 Apply team colors to the sidebar

The sidebar currently uses `bg-[var(--surface)]` (white). Change it to show team identity:

- **Sidebar header area** (where team name + logo sits): Change background to `bg-[var(--team-primary)]` with `text-[var(--team-text-on-primary)]`. This is the single highest-impact change.
- **Active nav item**: Change from the current blue highlight to `bg-[var(--team-primary-light)]` with `text-[var(--team-primary)]` left border.
- **Left edge accent stripe**: Add a 3px left border on the entire sidebar: `border-l-[3px] border-l-[var(--team-primary)]`.

```tsx
// Sidebar header — currently something like:
<div className="p-4 border-b">
  <div className="w-8 h-8 bg-green-700 rounded" /> {/* tiny team square */}
  <span>New York Jets</span>
</div>

// Change to:
<div className="p-4 border-b bg-[var(--team-primary)] text-[var(--team-text-on-primary)]">
  <img src={teamLogo} className="w-10 h-10 rounded" alt={teamName} />
  <div>
    <div className="font-bold text-lg">{teamCity}</div>
    <div className="text-sm opacity-80">{teamName}</div>
  </div>
  <div className="text-xs opacity-60 mt-1">{record} · {season}</div>
</div>
```

#### 1.4 Apply team colors to page headers

On key pages (Dashboard, Roster, Draft), add a subtle top accent bar:

```tsx
<div className="h-1 w-full bg-[var(--team-primary)] rounded-t" />
```

#### 1.5 Apply team colors to the "On the Clock" / action banners

The orange `Round 1 · Pick #2 · NYJ on the clock` banner should use team colors:

```tsx
<div className="bg-[var(--team-primary)] text-[var(--team-text-on-primary)] px-4 py-2 text-sm font-medium">
  Round 1 · Pick #2 · NYJ on the clock
</div>
```

### Acceptance Criteria
- Selecting any of the 32 teams produces a visually distinct sidebar and header
- Team logo appears at minimum 40x40px in the sidebar
- Active nav items use the team's primary color
- "On the clock" and similar action banners use team color
- All text on team-colored backgrounds passes WCAG AA contrast (4.5:1)

---

## Spec 2 — Draft Page Urgency & Drama

**Priority: HIGH | Effort: Medium | Files: Draft page component, draft card components**

### Problem
The draft is the emotional climax of the off-season but it renders as three flat white cards with identical blue buttons. No urgency, no energy, no differentiation between picks.

### Implementation

#### 2.1 "On the Clock" hero section

Replace the current inline banner with a full-width hero card when it's the user's pick:

```tsx
{isUserPick && (
  <div className="relative overflow-hidden rounded-xl bg-[var(--team-primary)] text-[var(--team-text-on-primary)] p-6 mb-6">
    {/* Subtle animated gradient background */}
    <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 animate-pulse-slow" />

    <div className="relative flex items-center justify-between">
      <div className="flex items-center gap-4">
        <img src={teamLogo} className="w-16 h-16" alt="" />
        <div>
          <div className="text-sm font-medium uppercase tracking-wider opacity-80">
            You're On the Clock
          </div>
          <div className="text-3xl font-extrabold">
            Round {round}, Pick #{pick}
          </div>
          <div className="text-sm opacity-70 mt-1">
            Needs: {needs.join(', ')}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm opacity-70">Next pick</div>
        <div className="flex items-center gap-2 mt-1">
          <img src={nextTeamLogo} className="w-6 h-6" />
          <span className="font-medium">{nextTeamName}</span>
        </div>
      </div>
    </div>
  </div>
)}
```

Add the animation to your Tailwind config or a global CSS file:

```css
@keyframes pulse-slow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.15; }
}
.animate-pulse-slow {
  animation: pulse-slow 3s ease-in-out infinite;
}
```

#### 2.2 Differentiate the three recommendation cards

Currently: "BEST AVAILABLE," "BEST FIT," and "YOUR SCOUTS SAY" are identical white cards with identical blue "Draft Now" buttons.

**Best Available** — Keep as the default/neutral card. White background, standard blue button.

**Best Fit** — Add a green accent to indicate alignment with team needs:
```tsx
<div className="border-2 border-green-500 rounded-xl relative">
  <div className="absolute -top-3 left-4 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
    RECOMMENDED
  </div>
  {/* ... card content ... */}
  <button className="bg-green-600 hover:bg-green-700 text-white w-full py-3 rounded-lg font-bold">
    Draft Now
  </button>
</div>
```

**Your Scouts Say** — Add a subtle star/sparkle indicator if the scout confidence is high:
```tsx
<div className="bg-amber-50 border border-amber-200 rounded-xl">
  <div className="flex items-center gap-1 text-amber-700 text-xs font-bold mb-2">
    <StarIcon className="w-4 h-4" />
    YOUR SCOUTS SAY
  </div>
  {/* ... */}
</div>
```

#### 2.3 Player card enhancements

Each draft prospect card currently shows: headshot, name, age, position rank, projected pick, and OVR range.

Add:
- **Position badge color**: Use a consistent color per position group (QB = red, RB = blue, WR = yellow, etc.) — this likely already exists elsewhere in the app
- **Needs match indicator**: If the prospect fills a team need, show a small "FILLS NEED" tag:

```tsx
{teamNeeds.includes(prospect.position) && (
  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
    Fills Need
  </span>
)}
```

#### 2.4 Draft Lottery Results banner

Currently shows `#1 ARI →, #2 TEN →` in small pill badges. Add team logos:

```tsx
<div className="flex items-center gap-3 flex-wrap">
  {lotteryResults.map((pick, i) => (
    <div key={i} className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 shadow-sm border">
      <span className="text-xs font-bold text-[var(--text-sec)]">#{i + 1}</span>
      <img src={pick.teamLogo} className="w-5 h-5" alt="" />
      <span className="text-sm font-semibold">{pick.teamAbbr}</span>
    </div>
  ))}
</div>
```

#### 2.5 Draft Board integration

The Draft Board table below the fold feels disconnected. Convert it to a tabbed interface alongside the Draft Results:

```tsx
<div className="border rounded-xl overflow-hidden">
  <div className="flex border-b">
    <button className={`px-4 py-3 text-sm font-medium ${activeTab === 'board' ? 'bg-white border-b-2 border-[var(--accent)]' : 'bg-gray-50'}`}>
      Draft Board
    </button>
    <button className={`px-4 py-3 text-sm font-medium ${activeTab === 'results' ? 'bg-white border-b-2 border-[var(--accent)]' : 'bg-gray-50'}`}>
      Draft Results
    </button>
  </div>
  <div className="p-4">
    {activeTab === 'board' ? <DraftBoard /> : <DraftResults />}
  </div>
</div>
```

### Acceptance Criteria
- "On the Clock" card uses team colors with animated gradient when it's user's turn
- "Best Fit" card has green border and "RECOMMENDED" badge
- "Scouts Say" card has amber styling
- Needs match badges appear on prospects who fill a team need
- Lottery pills show team logos
- Draft Board and Results are combined into a single tabbed section

---

## Spec 3 — Dashboard Hierarchy & Next-Step Guidance

**Priority: HIGH | Effort: Medium | Files: Dashboard page component**

### Problem
The dashboard treats all six content cards (standings, finances, team stats, leaders, news) with equal visual weight. The most actionable information ("You're on the clock for pick #2") is a tiny unstyled strip.

### Implementation

#### 3.1 Action hero card

Replace the thin banner with a prominent action card at the top of the dashboard, full width:

```tsx
// Contextual hero — changes based on game phase
function DashboardHero({ phase, league, team }) {
  if (phase === 'draft' && isUserOnClock) {
    return (
      <div className="bg-[var(--team-primary)] text-[var(--team-text-on-primary)] rounded-xl p-6 mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-wider opacity-70 mb-1">You're On the Clock</div>
          <div className="text-2xl font-extrabold">Round {round}, Pick #{pick}</div>
          <div className="text-sm opacity-80 mt-2">
            Best available: {bestAvailable.name} ({bestAvailable.position}, {bestAvailable.ovr} OVR)
          </div>
        </div>
        <Link href="/draft" className="bg-white text-[var(--team-primary)] px-6 py-3 rounded-lg font-bold text-lg hover:bg-white/90 transition">
          Go to Draft →
        </Link>
      </div>
    );
  }

  if (phase === 'regular_season') {
    return (
      <div className="bg-[var(--team-primary)] text-[var(--team-text-on-primary)] rounded-xl p-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={teamLogo} className="w-14 h-14" />
          <div>
            <div className="text-2xl font-extrabold">{teamCity} {teamName}</div>
            <div className="text-lg opacity-80">{record} · Week {week}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-70">Next game</div>
          <div className="text-lg font-bold">vs {opponent}</div>
          <button className="mt-2 bg-white text-[var(--team-primary)] px-4 py-2 rounded-lg font-medium text-sm">
            Simulate Week →
          </button>
        </div>
      </div>
    );
  }

  // ... other phases (free agency, offseason, etc.)
}
```

#### 3.2 "Attention Needed" widget

Add a card below the hero that surfaces contextual alerts. This drives engagement by telling the player what to do next:

```tsx
function AttentionNeeded({ team, league }) {
  const alerts = [];

  if (team.incomingTradeOffers > 0) {
    alerts.push({
      icon: '🔄',
      text: `${team.incomingTradeOffers} incoming trade offer${team.incomingTradeOffers > 1 ? 's' : ''}`,
      link: '/trades',
      priority: 'high',
    });
  }

  if (team.rosterNeeds.length > 0) {
    alerts.push({
      icon: '⚠️',
      text: `Critical need at ${team.rosterNeeds[0]}`,
      link: '/roster',
      priority: 'medium',
    });
  }

  if (team.expiringContracts > 0) {
    alerts.push({
      icon: '📋',
      text: `${team.expiringContracts} contracts expiring this season`,
      link: '/finances',
      priority: 'low',
    });
  }

  if (team.injuredPlayers > 0) {
    alerts.push({
      icon: '🏥',
      text: `${team.injuredPlayers} player${team.injuredPlayers > 1 ? 's' : ''} on injured reserve`,
      link: '/roster?tab=injuries',
      priority: 'low',
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-4 mb-6">
      <h3 className="text-sm font-bold text-[var(--text-sec)] uppercase tracking-wider mb-3">
        Attention Needed
      </h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => (
          <Link key={i} href={alert.link}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-2)] transition">
            <span>{alert.icon}</span>
            <span className="text-sm font-medium flex-1">{alert.text}</span>
            <span className="text-xs text-[var(--accent)]">View →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

#### 3.3 Reorder dashboard cards by importance

Current order: Standings | Finances | Team Stats | League Leaders | Team Leaders | News

Proposed order:
1. **Hero card** (full width) — phase-dependent action prompt
2. **Attention Needed** (full width) — contextual alerts
3. **Team Stats** + **Standings** (row of 2) — your team performance + division race
4. **Team Leaders** + **Finances** (row of 2) — your best players + cap health
5. **Recent News** + **League Leaders** (row of 2) — league context

Use a responsive grid:

```tsx
<div className="space-y-6">
  <DashboardHero phase={phase} league={league} team={team} />
  <AttentionNeeded team={team} league={league} />

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <TeamStatsCard stats={teamStats} />
    <StandingsCard standings={divisionStandings} />
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <TeamLeadersCard leaders={teamLeaders} />
    <FinancesCard finances={finances} />
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <RecentNewsCard news={recentNews} />
    <LeagueLeadersCard leaders={leagueLeaders} />
  </div>
</div>
```

### Acceptance Criteria
- Phase-dependent hero card appears at top of dashboard with primary CTA
- "Attention Needed" widget shows 1-4 contextual alerts with links
- Dashboard cards are ordered by actionability (team-first, league-second)
- Hero card uses team colors
- CTA button in hero takes user to the most logical next action

---

## Spec 4 — Trade Value Visualization

**Priority: HIGH | Effort: Small | Files: Trade offer card component**

### Problem
Evaluating incoming trades requires mental math. The OVR impact numbers are small, and there's no visual signal for whether a trade is favorable.

### Implementation

#### 4.1 Trade grade badge

Add a computed trade grade (A+ through F) to each offer card. The grade algorithm should factor in: pick value difference, player OVR delta, positional need, and cap impact.

```tsx
function TradeGrade({ offer }: { offer: TradeOffer }) {
  const grade = computeTradeGrade(offer); // returns { letter: 'A', color: 'green', label: 'Great deal' }

  const colorMap = {
    green:  'bg-green-100 text-green-800 border-green-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    red:    'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-lg ${colorMap[grade.color]}`}>
      <span>{grade.letter}</span>
      <span className="text-xs font-medium opacity-70">{grade.label}</span>
    </div>
  );
}
```

#### 4.2 Visual value bar

Below the "You Receive" / "You Send" columns, add a stacked bar chart showing relative value:

```tsx
function TradeValueBar({ yourValue, theirValue }: { yourValue: number; theirValue: number }) {
  const total = yourValue + theirValue;
  const yourPct = (yourValue / total) * 100;
  const favorsYou = yourValue > theirValue;

  return (
    <div className="mt-3 pt-3 border-t">
      <div className="flex justify-between text-xs text-[var(--text-sec)] mb-1">
        <span>You receive</span>
        <span>You send</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        <div
          className={`${favorsYou ? 'bg-green-500' : 'bg-red-400'} transition-all`}
          style={{ width: `${yourPct}%` }}
        />
        <div
          className={`${favorsYou ? 'bg-green-200' : 'bg-red-200'} transition-all`}
          style={{ width: `${100 - yourPct}%` }}
        />
      </div>
      <div className="text-xs text-center mt-1 font-medium" style={{ color: favorsYou ? 'var(--green)' : 'var(--red)' }}>
        {favorsYou ? `+${Math.round(yourPct - 50)}% in your favor` : `${Math.round(50 - yourPct)}% against you`}
      </div>
    </div>
  );
}
```

#### 4.3 Visual emphasis for lopsided trades

When a trade is heavily in one direction (e.g., 6 picks for 1), style the entire card:

```tsx
<div className={`border rounded-xl p-5 ${
  grade.letter.startsWith('A') ? 'border-green-400 bg-green-50/50' :
  grade.letter === 'F' ? 'border-red-300 bg-red-50/50' :
  'border-[var(--border)] bg-white'
}`}>
```

#### 4.4 OVR impact — make it bigger and colored

The current `Your OVR: 60 → 60` text is small and in the corner. Make it prominent:

```tsx
<div className="flex items-center gap-4">
  <div className="text-center">
    <div className="text-xs text-[var(--text-sec)]">Your OVR</div>
    <div className="flex items-center gap-1">
      <span className="text-lg font-bold">{currentOvr}</span>
      <span className="text-[var(--text-sec)]">→</span>
      <span className={`text-lg font-bold ${newOvr > currentOvr ? 'text-green-600' : newOvr < currentOvr ? 'text-red-600' : ''}`}>
        {newOvr}
      </span>
      {newOvr !== currentOvr && (
        <span className={`text-sm font-bold ${newOvr > currentOvr ? 'text-green-600' : 'text-red-600'}`}>
          ({newOvr > currentOvr ? '+' : ''}{newOvr - currentOvr})
        </span>
      )}
    </div>
  </div>
</div>
```

### Acceptance Criteria
- Every trade offer shows an A+ through F letter grade with color
- Value bar visualization shows relative weight of each side
- Lopsided offers (A+ or F) have colored card backgrounds
- OVR delta shows with green/red coloring and +/- notation
- Grade computation logic exists and considers pick value, OVR, needs, cap

---

## Spec 5 — Homepage "Continue League" CTA & Team Cards

**Priority: HIGH | Effort: Small | Files: Homepage / landing page component**

### Problem
The "Continue League" button is visually similar to the team cards below it. Returning players (highest-value users) have to scan to find the most important action on the page.

### Implementation

#### 5.1 Continue League — dominant CTA

Currently: a card with a blue border, team abbreviation circle, "Continue League" text, and a right arrow. It blends in.

```tsx
<Link href="/dashboard" className="block w-full max-w-2xl mx-auto group">
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--team-primary)] to-[var(--team-primary)]/80 text-white p-6 shadow-lg hover:shadow-xl transition-all hover:scale-[1.01]">
    {/* Subtle pattern overlay */}
    <div className="absolute inset-0 opacity-10 bg-[url('/patterns/grid.svg')]" />

    <div className="relative flex items-center gap-5">
      <img src={teamLogo} className="w-16 h-16 rounded-xl bg-white/20 p-2" alt="" />
      <div className="flex-1">
        <div className="text-xl font-extrabold">Continue Your Dynasty</div>
        <div className="text-sm opacity-80 mt-1">
          {teamCity} {teamName} · Season {season} · {record} · {phase}
        </div>
      </div>
      <div className="text-3xl group-hover:translate-x-1 transition-transform">→</div>
    </div>
  </div>
</Link>
```

If there are multiple saved leagues, stack them but keep the most recent one full-sized and others compact.

#### 5.2 Team cards — hover states

Currently: flat white cards with small logos. All identical on hover. Add team-colored hover:

```tsx
<button
  onClick={() => startNewLeague(team.abbr)}
  className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-white hover:border-transparent transition-all duration-200"
  style={{
    '--hover-bg': teamColors[team.abbr].primaryLight,
    '--hover-border': teamColors[team.abbr].primary,
  } as React.CSSProperties}
  onMouseEnter={(e) => {
    e.currentTarget.style.backgroundColor = teamColors[team.abbr].primaryLight;
    e.currentTarget.style.borderColor = teamColors[team.abbr].primary;
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.backgroundColor = '';
    e.currentTarget.style.borderColor = '';
  }}
>
  <img src={team.logo} className="w-10 h-10 group-hover:scale-110 transition-transform" alt="" />
  <div className="text-left">
    <div className="font-bold text-sm">{team.city}</div>
    <div className="text-xs text-[var(--text-sec)]">{team.name}</div>
  </div>
</button>
```

#### 5.3 Hero banner animation

The BS Mode hero image is static. Add a subtle Ken Burns-style zoom:

```css
@keyframes ken-burns {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}

.hero-banner img {
  animation: ken-burns 20s ease-in-out infinite alternate;
}
```

### Acceptance Criteria
- "Continue League" uses team colors, is full-width, and visually dominates the page
- Team cards show team-colored hover effects (border + background wash)
- Team logos scale up slightly on hover
- Hero banner has subtle zoom animation
- Multiple saved leagues show most recent as large card, others as compact list

---

## Spec 6 — Sidebar: Trades Link + Notification Badges

**Priority: MEDIUM | Effort: Small | Files: Sidebar/navigation component**

### Problem
The Trades page is only accessible via the sub-navigation on the Roster page. There's no sidebar entry for it despite it having 8 pending offers. Notification badges only exist on the News item.

### Implementation

#### 6.1 Add Trades to the sidebar

Under the "LEAGUE" section, add a "Trades" nav item between "Stats" and "News" (or create a dedicated "TRANSACTIONS" section):

```tsx
// In the sidebar nav items array
{ label: 'Trades', href: '/trades', icon: ArrowsRightLeftIcon, badge: incomingTradeOffers || null },
```

#### 6.2 Notification badge component

Create a reusable badge that works on any nav item:

```tsx
function NavBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
      {count > 99 ? '99+' : count}
    </span>
  );
}
```

#### 6.3 Contextual badge triggers

Add badges to sidebar items based on game state:

| Nav Item | Badge shows when |
|----------|-----------------|
| **Trades** | `incomingTradeOffers > 0` — red badge with count |
| **Draft** | `isUserOnClock === true` — pulsing dot (no number) |
| **News** | `unreadNewsCount > 0` — blue badge with count (already exists) |
| **Roster** | `rosterSize > maxRoster || rosterSize < minRoster` — amber warning dot |
| **Finances** | `capSpace < 0` — red warning dot |

For the Draft "on the clock" indicator, use a pulsing dot instead of a number:

```tsx
{isUserOnClock && (
  <span className="ml-auto relative flex h-3 w-3">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--team-primary)] opacity-75" />
    <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--team-primary)]" />
  </span>
)}
```

#### 6.4 Section header styling

The current section headers ("LEAGUE," "TEAM," "PLAYERS") are `text-[var(--text-sec)]` uppercase — too subtle. Increase contrast:

```tsx
<div className="text-xs font-bold uppercase tracking-wider text-[var(--text)] opacity-40 mb-2 mt-6 px-2">
  {sectionLabel}
</div>
```

Change from `text-[var(--text-sec)]` to `text-[var(--text)] opacity-40` — slightly darker, uses the primary text color with reduced opacity instead of the secondary gray.

### Acceptance Criteria
- "Trades" appears in sidebar with red badge showing pending offer count
- Draft nav item shows pulsing dot when user is on the clock
- Roster shows warning when over/under roster limits
- Finances shows warning when over the cap
- Section headers are marginally more visible

---

## Spec 7 — Player Modal Redesign

**Priority: MEDIUM | Effort: Medium | Files: Player detail modal/sheet component**

### Problem
The player modal is functional but makes players feel like database records. Small portrait, flat rating bars, no trend data.

### Implementation

#### 7.1 Enlarged header section

```tsx
<div className="flex gap-5 p-6 border-b">
  {/* Larger portrait with team color accent */}
  <div className="relative">
    <img src={player.headshot} className="w-24 h-24 rounded-2xl object-cover bg-gray-100" alt="" />
    <span className="absolute -bottom-1 -right-1 bg-[var(--team-primary)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
      {player.position}
    </span>
  </div>

  <div className="flex-1">
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-extrabold text-[var(--text)]">{player.name}</h2>
        <div className="text-sm text-[var(--text-sec)] mt-0.5">
          {team.city} {team.name} · Age {player.age} · Yr {player.experience}
        </div>
      </div>

      {/* OVR as a large circular badge */}
      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-extrabold text-2xl ${
        player.ovr >= 80 ? 'bg-green-600' :
        player.ovr >= 65 ? 'bg-yellow-500' :
        player.ovr >= 50 ? 'bg-orange-500' :
        'bg-red-500'
      }`}>
        {player.ovr}
      </div>
    </div>

    <div className="flex items-center gap-4 mt-3 text-sm">
      <span className="font-medium">${player.salary}/yr</span>
      <span className="text-[var(--text-sec)]">{player.contractYears} left</span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        player.mood === 'Thrilled' ? 'bg-green-100 text-green-700' :
        player.mood === 'Happy' ? 'bg-blue-100 text-blue-700' :
        player.mood === 'Content' ? 'bg-gray-100 text-gray-700' :
        'bg-red-100 text-red-700'
      }`}>
        {player.moodEmoji} {player.mood}
      </span>
    </div>
  </div>
</div>
```

#### 7.2 Rating bars with proper color scale

Replace the current red/orange bars with a consistent gradient from red (0-39) → orange (40-59) → yellow (60-74) → green (75-100):

```tsx
function RatingBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 75 ? 'bg-green-500' :
    value >= 60 ? 'bg-yellow-500' :
    value >= 40 ? 'bg-orange-500' :
    'bg-red-500';

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--text-sec)] w-20 text-right">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-sm font-bold w-8 text-right ${
        value >= 75 ? 'text-green-600' :
        value >= 60 ? 'text-yellow-600' :
        value >= 40 ? 'text-orange-600' :
        'text-red-600'
      }`}>
        {value}
      </span>
    </div>
  );
}
```

#### 7.3 OVR trend sparkline (if historical data exists)

If the game tracks OVR over seasons, add a small sparkline next to the OVR badge:

```tsx
function OvrTrend({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const max = Math.max(...history);
  const min = Math.min(...history);
  const range = max - min || 1;
  const width = 60;
  const height = 20;

  const points = history.map((val, i) =>
    `${(i / (history.length - 1)) * width},${height - ((val - min) / range) * height}`
  ).join(' ');

  const trending = history[history.length - 1] > history[history.length - 2] ? 'text-green-500' : 'text-red-500';

  return (
    <svg width={width} height={height} className={trending}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

#### 7.4 Action buttons — better hierarchy

Currently: "Release Player" and "Add to Trading Block" are side-by-side buttons of equal weight. Restructure:

```tsx
<div className="flex gap-2 mt-4">
  <button className="flex-1 bg-[var(--accent)] text-white py-2.5 rounded-lg font-medium hover:opacity-90 transition">
    Add to Trading Block
  </button>
  <button className="px-4 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text-sec)] hover:bg-[var(--surface-2)] transition">
    Restructure
  </button>
  <button className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition">
    Release
  </button>
</div>
```

### Acceptance Criteria
- Player headshot is 96x96px with position badge overlay
- OVR displayed as colored circular badge (green/yellow/orange/red scale)
- Rating bars follow a standardized 4-tier color system
- Action buttons have clear visual hierarchy (primary, secondary, destructive)
- Mood badges are color-differentiated (not all similar blues)

---

## Spec 8 — Empty States with Personality & CTAs

**Priority: MEDIUM | Effort: Small | Files: Stats, Playoffs, History, Recap page components**

### Problem
Empty pages show minimal text and vast whitespace. They're missed opportunities to guide the player and reinforce the brand's personality.

### Implementation

Create a reusable empty state component:

```tsx
function EmptyState({
  icon,
  title,
  description,
  cta,
  ctaHref
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center max-w-md mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mb-6 text-4xl">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-[var(--text)] mb-2">{title}</h2>
      <p className="text-[var(--text-sec)] text-sm leading-relaxed mb-6">{description}</p>
      {cta && ctaHref && (
        <Link href={ctaHref} className="bg-[var(--accent)] text-white px-6 py-2.5 rounded-lg font-medium hover:opacity-90 transition">
          {cta}
        </Link>
      )}
    </div>
  );
}
```

Apply to each page:

| Page | Icon | Title | Description | CTA |
|------|------|-------|-------------|-----|
| **Stats** | 📊 | "No stats yet" | "Stats populate once games are played. Sim your first week to see who's balling out." | "Simulate Week 1" → `/schedule` |
| **Playoffs** | 🏆 | "The road to the title" | "Finish the regular season to see who makes the playoffs. Your team's destiny awaits." | "View Standings" → `/standings` |
| **History** | 📜 | "Your dynasty starts now" | "Complete your first season to start building your franchise's legacy. Every great dynasty has a Chapter 1." | "Go to Dashboard" → `/dashboard` |
| **Recap** | 🎙️ | "Gridiron Tonight" | "Your weekly recap show — storylines, standout performances, and league trends. Simulate games to generate your first episode." | "Simulate Week 1" → `/schedule` |

### Acceptance Criteria
- All four empty state pages use the shared `EmptyState` component
- Each has a unique icon, title with personality, descriptive text, and a CTA button
- CTA links to the most logical next action
- Empty state is vertically centered in the available space

---

## Spec 9 — Schedule Ticker Improvements

**Priority: MEDIUM | Effort: Small | Files: Schedule ticker/header component**

### Problem
The horizontal schedule bar at the top shows matchups as `LV / NYJ` with tiny colored dots. No context for what the dots mean, no scores, no week numbers.

### Implementation

#### 9.1 Add tooltips on hover

```tsx
function ScheduleMatchup({ game, userTeam }: { game: Game; userTeam: string }) {
  const isUserGame = game.away === userTeam || game.home === userTeam;
  const isPlayed = game.status === 'final';

  return (
    <div className="group relative">
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default ${
        isUserGame ? 'bg-[var(--team-primary-light)] font-semibold' : ''
      }`}>
        <span className={`w-2 h-2 rounded-full ${
          !isPlayed ? 'bg-gray-300' :
          game.userWon ? 'bg-green-500' :
          game.userLost ? 'bg-red-500' :
          'bg-gray-400'
        }`} />
        <span>{game.away}</span>
        <span className="text-[var(--text-sec)]">/</span>
        <span>{game.home}</span>
      </div>

      {/* Tooltip */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-[var(--text)] text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50 shadow-lg">
        <div className="font-bold">Week {game.week}</div>
        {isPlayed ? (
          <div className="mt-0.5">
            {game.awayTeam} {game.awayScore} - {game.homeScore} {game.homeTeam}
          </div>
        ) : (
          <div className="mt-0.5">{game.awayTeam} @ {game.homeTeam}</div>
        )}
        {/* Arrow */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--text)] rotate-45" />
      </div>
    </div>
  );
}
```

#### 9.2 Highlight user's games

User's matchups should be visually distinct from other games:

```tsx
// User's games: team color light background + bold text
className={isUserGame ? 'bg-[var(--team-primary-light)] font-bold' : 'opacity-60'}
```

#### 9.3 Add a legend dot

At the start of the ticker, add a small legend:

```tsx
<div className="flex items-center gap-2 text-xs text-[var(--text-sec)] pr-3 border-r border-[var(--border)]">
  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> W</span>
  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> L</span>
</div>
```

### Acceptance Criteria
- Hovering any matchup shows a tooltip with week number and score (if played)
- User's games have distinct background color and bolder text
- Non-user games are slightly dimmed (opacity-60)
- Win/Loss dot legend appears at the left edge of the ticker

---

## Spec 10 — OVR Color Gradient System

**Priority: MEDIUM | Effort: Small | Files: Shared utility or component**

### Problem
OVR numbers across the roster table, draft board, and player modals use inconsistent coloring. Some are all orange-red regardless of value.

### Implementation

Create a shared utility and component:

```tsx
// lib/ovrColor.ts
export function getOvrColor(ovr: number): string {
  if (ovr >= 85) return 'text-green-600';
  if (ovr >= 75) return 'text-emerald-600';
  if (ovr >= 65) return 'text-yellow-600';
  if (ovr >= 55) return 'text-orange-500';
  if (ovr >= 45) return 'text-orange-600';
  return 'text-red-600';
}

export function getOvrBgColor(ovr: number): string {
  if (ovr >= 85) return 'bg-green-600';
  if (ovr >= 75) return 'bg-emerald-600';
  if (ovr >= 65) return 'bg-yellow-500';
  if (ovr >= 55) return 'bg-orange-500';
  if (ovr >= 45) return 'bg-orange-600';
  return 'bg-red-600';
}

// Component
export function OvrBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-sm font-bold',
    md: 'text-base font-extrabold',
    lg: 'text-2xl font-extrabold',
  };

  return (
    <span className={`${getOvrColor(value)} ${sizeClasses[size]} tabular-nums`}>
      {value}
    </span>
  );
}
```

Apply `<OvrBadge>` everywhere OVR appears: roster table, depth chart, draft board, player modal, QB Pyramid, staff page, trade offers.

Similarly, create a `<PotBadge>` for potential ratings that uses the same scale.

### Acceptance Criteria
- All OVR numbers across the app use the same 6-tier color scale
- 85+ is green, 75-84 is emerald, 65-74 is yellow, 55-64 is orange, 45-54 is dark orange, below 45 is red
- Potential ratings use the same system
- Numbers use `tabular-nums` for alignment in tables

---

## Spec 11 — Display Font for Headings

**Priority: LOW | Effort: Small | Files: Tailwind config, global CSS, layout**

### Problem
All text uses the same clean sans-serif. Page titles like "Draft," "Roster," "QB Tier Pyramid" lack sports energy.

### Implementation

Add a condensed display font for major headings. Options: `"Barlow Condensed"`, `"Oswald"`, or `"Bebas Neue"`.

```tsx
// app/layout.tsx — add Google Font
import { Barlow_Condensed, Inter } from 'next/font/google';

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

// In <html>:
<html className={`${display.variable} ${body.variable}`}>
```

```css
/* tailwind.config / global CSS */
.page-title {
  font-family: var(--font-display);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: -0.01em;
}
```

Apply `.page-title` (or a Tailwind utility like `font-display`) to: page titles ("Draft," "Roster," "Standings & Schedule"), section headers ("Trade Rumors," "League Leaders"), and the BS Football wordmark.

Do NOT apply to body text, table data, nav items, or small labels.

### Acceptance Criteria
- Major page titles use the display font
- Body text, data, and navigation remain in the body font
- The display font loads efficiently via `next/font`
- Page titles are uppercase with tight letter-spacing

---

## Spec 12 — Hover Micro-Animations

**Priority: LOW | Effort: Small | Files: Roster table, news cards, trade cards, any list rows**

### Problem
Interactive rows and cards lack hover feedback, making the interface feel static and spreadsheet-like.

### Implementation

#### 12.1 Table rows (Roster, Draft Board, Standings)

```tsx
<tr className="hover:bg-[var(--surface-2)] transition-colors duration-150 cursor-pointer">
```

If not already present, add this to all data table rows that are clickable.

#### 12.2 Cards (News, Trade Offers, Dashboard widgets)

```tsx
<div className="border rounded-xl p-4 hover:shadow-md hover:border-[var(--accent)]/30 transition-all duration-200">
```

#### 12.3 Nav items

The sidebar nav items should have a slight left-slide on hover:

```tsx
<Link className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-2)] hover:translate-x-0.5 transition-all duration-150">
```

#### 12.4 Buttons

All primary buttons should have a subtle scale effect:

```tsx
<button className="... hover:opacity-90 active:scale-[0.98] transition-all">
```

### Acceptance Criteria
- All clickable table rows highlight on hover
- Cards elevate slightly (shadow) on hover
- Nav items have subtle rightward shift on hover
- Primary buttons depress on click (scale 0.98)
- All transitions are 150-200ms, never jarring

---

## Spec 13 — Fit & Mood Indicator Clarity

**Priority: LOW | Effort: Small | Files: Roster table component, tooltip component**

### Problem
The "Fit" column shows colored circles (green/yellow/red) with no label. "Mood" tags use similar blue shades. New players don't know what these mean.

### Implementation

#### 13.1 Fit indicator with tooltip

```tsx
function FitIndicator({ fit }: { fit: 'great' | 'neutral' | 'poor' }) {
  const config = {
    great:   { color: 'bg-green-500',  label: 'Great Fit',   desc: '+2 OVR in games' },
    neutral: { color: 'bg-yellow-400', label: 'Neutral Fit', desc: 'No scheme bonus' },
    poor:    { color: 'bg-red-500',    label: 'Poor Fit',    desc: '-1 OVR in games' },
  };

  const { color, label, desc } = config[fit];

  return (
    <div className="group relative flex items-center justify-center">
      <div className={`w-4 h-4 rounded-full ${color}`} />

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[var(--text)] text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-50">
        <div className="font-bold">{label}</div>
        <div className="opacity-70">{desc}</div>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--text)] rotate-45" />
      </div>
    </div>
  );
}
```

#### 13.2 Mood tags with distinct colors

```tsx
const moodConfig = {
  'Thrilled':    { bg: 'bg-green-100',  text: 'text-green-700',  emoji: '😄' },
  'Happy':       { bg: 'bg-blue-100',   text: 'text-blue-700',   emoji: '😊' },
  'Content':     { bg: 'bg-gray-100',   text: 'text-gray-600',   emoji: '😐' },
  'Unhappy':     { bg: 'bg-orange-100', text: 'text-orange-700', emoji: '😟' },
  'Disgruntled': { bg: 'bg-red-100',    text: 'text-red-700',    emoji: '😠' },
};
```

The key change: "Thrilled" becomes green (not blue), "Content" becomes gray (not blue), so they're instantly distinguishable from "Happy" (blue).

#### 13.3 Column header tooltip for "FIT" and "POT"

Add a `?` icon next to ambiguous column headers:

```tsx
<th>
  FIT
  <span className="group relative inline-block ml-1">
    <span className="text-[var(--text-sec)] cursor-help text-xs">?</span>
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[var(--text)] text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
      Scheme fit with your coaching staff
    </span>
  </span>
</th>
```

### Acceptance Criteria
- Fit circles show descriptive tooltip on hover explaining the OVR impact
- Mood tags use distinct colors per mood level (green, blue, gray, orange, red)
- "FIT" and "POT" column headers have `?` tooltips explaining what they mean
- Column header "POT ?" already partially exists — ensure tooltip works and is informative

---

## Implementation Order

For maximum impact with minimum disruption, ship in this order:

1. **Spec 10** (OVR colors) — tiny change, instant visual improvement across every page
2. **Spec 12** (hover animations) — CSS-only, no logic changes, everything feels better
3. **Spec 8** (empty states) — one shared component, four pages improved
4. **Spec 13** (Fit/Mood clarity) — small component, removes confusion
5. **Spec 6** (sidebar trades + badges) — one nav item + badge logic
6. **Spec 5** (homepage CTA) — high impact, focused scope
7. **Spec 1** (team theming) — the biggest single improvement, but touches many files
8. **Spec 9** (schedule ticker) — contained scope, nice polish
9. **Spec 4** (trade value) — new component + grading logic
10. **Spec 3** (dashboard hero) — restructures the main page
11. **Spec 7** (player modal) — redesign of a key interaction
12. **Spec 2** (draft drama) — multiple component changes
13. **Spec 11** (display font) — design polish, do last
