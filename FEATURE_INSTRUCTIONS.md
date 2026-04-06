# GridironGM Feature Instructions for Claude Code

These are detailed plain-English instructions for implementing seven major features. Each section tells you exactly which files to modify, what logic to add, and how it connects to existing systems. Implement them one at a time in order — later features reference earlier ones.

---

## Feature 1: Expansion Teams

### Overview
Let the user add 1–2 expansion teams to the league mid-save. They pick a city, team name, colors, conference, and division. The expansion team starts with a weak roster built from an expansion draft.

### Types Changes (`src/types/index.ts`)

Add a new interface for expansion team configuration:

```
interface ExpansionTeamConfig {
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
}
```

Add to `LeagueSettings`:
```
maxExpansionTeams: number;  // default 2
```

Add a new field to `LeagueState`:
```
expansionDraft: {
  active: boolean;
  newTeamIds: string[];
  protectedPlayers: Record<string, string[]>;  // teamId -> array of protected playerIds
  availablePlayers: string[];  // playerIds exposed in expansion draft
} | null;
```

### Team Data Changes (`src/lib/data/teams.ts`)

Don't modify LEAGUE_TEAMS directly. Instead, the expansion system will dynamically add teams to the state's `teams` array at runtime. LEAGUE_TEAMS stays as the default 32-team template.

Add a new exported constant with available expansion cities that aren't already in the league:

```
export const EXPANSION_CITIES = [
  { city: 'Portland', suggestedName: 'Timber', abbreviation: 'POR' },
  { city: 'San Antonio', suggestedName: 'Spurs', abbreviation: 'SA' },
  { city: 'Salt Lake City', suggestedName: 'Altitude', abbreviation: 'SLC' },
  { city: 'Oklahoma City', suggestedName: 'Twisters', abbreviation: 'OKC' },
  { city: 'St. Louis', suggestedName: 'Archers', abbreviation: 'STL' },
  { city: 'San Diego', suggestedName: 'Surf', abbreviation: 'SD' },
  { city: 'Austin', suggestedName: 'Bats', abbreviation: 'AUS' },
  { city: 'Memphis', suggestedName: 'Blues', abbreviation: 'MEM' },
  { city: 'Orlando', suggestedName: 'Thunder', abbreviation: 'ORL' },
  { city: 'Sacramento', suggestedName: 'Kings', abbreviation: 'SAC' },
  { city: 'Columbus', suggestedName: 'Crew', abbreviation: 'COL' },
  { city: 'Toronto', suggestedName: 'Voyageurs', abbreviation: 'TOR' },
  { city: 'London', suggestedName: 'Monarchs', abbreviation: 'LON' },
  { city: 'Mexico City', suggestedName: 'Aztecs', abbreviation: 'MEX' },
];
```

The user can also type a fully custom city/name/abbreviation — the list is just suggestions.

### Expansion Draft Logic (`src/lib/engine/expansionDraft.ts`) — NEW FILE

Create a new file for expansion draft logic. The expansion draft works like the real NFL:

**Protection rules:**
- Each existing team protects a set number of players. Use these limits:
  - If the team has been in the league 3+ seasons: protect 15 players
  - If the team has been in the league 1-2 seasons: protect 18 players (new teams get more protection)
- Players on rookie contracts (experience <= 2) are automatically protected and don't count against the limit
- Players currently on IR are NOT automatically protected (teams must choose)

**AI protection logic (for CPU teams):**
Write a function `generateProtectionList(team, players)` that has CPU teams protect in this priority order:
1. Franchise-tagged players (always protected)
2. Players sorted by: `(overall * 2) + potential + (yearsLeft on contract * 3) - (age - 26) * 2`
3. Fill up to the protection limit

**Draft mechanics:**
- The expansion team(s) draft in snake order if there are 2 expansion teams
- Each expansion team selects 1 player from each existing team (32 picks for a 32-team league)
- A team can only lose 1 player to the expansion draft (once picked from, they're done)
- The expansion team cannot pick from the same division more than 2 times in a row (forces roster diversity)

**Post-expansion draft:**
- After the expansion draft, fill remaining roster spots using `generatePlayer()` from `playerGen.ts` with a mean OVR of 55-62 (below-average players representing free agent scraps)
- Assign 7 rounds × 3 years of draft picks to the new team
- Set the expansion team's salary cap to the league default
- Give the expansion team the #1 overall pick in the next draft (or #1 and #2 if two expansion teams)

### Store Changes (`src/lib/engine/store.ts`)

Add these new actions to the Zustand store:

**`createExpansionTeam(config: ExpansionTeamConfig)`**
- Validate: league can't exceed 34 teams, abbreviation must be unique, city+name combo must be unique
- Create a new Team object with empty roster, default salary cap, and empty draft picks
- Add to `state.teams`
- Trigger expansion draft phase (set `state.expansionDraft.active = true`)

**`protectPlayers(teamId: string, playerIds: string[])`**
- User protects their players. Validate count against protection limit.
- Store in `state.expansionDraft.protectedPlayers`

**`runExpansionDraft()`**
- Auto-generate protection lists for all CPU teams
- For each expansion team pick: find highest-OVR unprotected player from the next eligible team
- Add a small amount of randomness: the AI expansion team picks from the top 3 available players randomly (weighted by OVR) to avoid being perfectly optimal
- After all picks, fill remaining roster spots with generated players
- Set `state.expansionDraft.active = false`
- Regenerate the schedule with `generateSchedule()` including the new teams

### Schedule Changes (`src/lib/engine/schedule.ts`)

The schedule generator already uses `teams.length` dynamically, but verify these things:
- It requires an even number of teams. If expansion creates an odd number (33), the system should either require 2 expansion teams at once OR implement a bye-week system where one team sits out each week
- The simplest approach: require expansion in pairs (add 2 teams at once, going from 32 to 34). If the user only wants 1, add a "ghost" bye team that gives every opponent a bye when scheduled against it. Actually, the easier fix: the existing schedule already handles byes (2 per week across 18 weeks). Just make sure the algorithm can handle 33 or 34 teams — it distributes byes evenly, so 33 teams means 33 byes across 18 weeks. Check that the greedy matching in `generateSchedule` doesn't assume an even count.

### Playoff Changes

Currently assumes 16 teams per conference. With expansion:
- If conferences are uneven (e.g., 17 AC vs 16 NC after 1 expansion team joins AC), keep 7 playoff seeds per conference. The extra regular season team just means more competition for the same 7 spots.
- No structural playoff changes needed — the seeding logic already sorts by record within each conference.

### UI: New Expansion Page (`src/app/expansion/page.tsx`) — NEW FILE

Create a new page accessible from the settings or main menu during the offseason phase only. The page should have:
1. A form to pick city (dropdown of EXPANSION_CITIES + custom text input), team name, abbreviation, and two color pickers for primary/secondary colors
2. Conference and division dropdowns
3. A "Create Team" button that triggers `createExpansionTeam()`
4. After creation: show the expansion draft board. If this is the user's NEW team, let them make picks. If the user is keeping their existing team, show the expansion draft auto-sim with results.
5. A protection screen if the user's existing team needs to protect players (show roster with checkboxes, protection limit counter)

### Logo for New Teams (`src/components/ui/TeamLogo.tsx`)

The ICONS record in TeamLogo.tsx has hand-drawn SVGs for each abbreviation. For expansion teams, the component should fall back to the existing text-based logo (just the abbreviation letters on the primary color background) when no SVG icon exists for the abbreviation. This fallback already exists in the component — just make sure it works for any arbitrary abbreviation string.

---

## Feature 2: Team Relocation

### Overview
Let the user relocate any team (theirs or, in God Mode, any team) to a new city with a new name and identity. This is separate from expansion — it keeps the same roster, records, and history but changes the branding.

### Types Changes (`src/types/index.ts`)

Add to the Team interface:
```
relocationHistory?: {
  season: number;
  fromCity: string;
  fromName: string;
  toCity: string;
  toName: string;
}[];
```

### Store Changes (`src/lib/engine/store.ts`)

Add a new action:

**`relocateTeam(teamId: string, newCity: string, newName: string, newAbbreviation: string, newPrimaryColor: string, newSecondaryColor: string)`**
- Can only be done during offseason phase
- Validates abbreviation uniqueness
- Updates the team's city, name, abbreviation, primaryColor, secondaryColor
- Appends to `relocationHistory`
- Generates a news item: "[Old City] [Old Name] relocating to [New City] as the [New Name]"
- All player contracts, draft picks, and historical records stay with the team (tied to teamId, which doesn't change)
- Rivalries stay attached (they reference teamId)

**Fan backlash effect (optional but adds flavor):**
- After relocation, all players on the team get a mood penalty of -10 for one season (disruption)
- The team's home field advantage in `generateBettingLine()` drops from 3 points to 1 point for the first season (new city, no established fanbase)
- These effects reset after the first season in the new city

### UI

Add a "Relocate Team" button to the team management page (or settings page). It should:
- Show the same city/name/color picker form as the expansion page
- Show a confirmation dialog: "Are you sure you want to relocate the [City] [Name]? This will change the team's identity but keep all players, picks, and history."
- Only available during offseason
- In God Mode, allow relocating any team. Otherwise, only the user's team.

---

## Feature 3: Customize Logos

### Overview
Let users upload a custom logo image for any team they control (or all teams in God Mode). The image replaces the SVG icon in TeamLogo.tsx.

### Types Changes (`src/types/index.ts`)

The Team interface already has an optional `logoUrl?: string` field (used by the league import system). Use this same field for custom logos.

### Implementation

**Option A (simpler, recommended): Data URL approach**
- Let the user upload an image file (PNG, JPG, SVG) through a file input
- Convert it to a base64 data URL on the client side using FileReader
- Store the data URL string in `team.logoUrl`
- This persists in the Zustand store (which saves to localStorage)
- Size limit: warn the user if the image exceeds 50KB after base64 encoding (localStorage has limits)

**Option B (better for large images): Local storage with IndexedDB**
- Store the image blob in IndexedDB keyed by teamId
- Store just a reference flag in `team.logoUrl` like `"idb://teamId"`
- TeamLogo.tsx checks for the prefix and loads from IndexedDB
- More complex but handles larger images

Go with Option A for now. Option B can be added later if users hit localStorage limits.

### TeamLogo.tsx Changes

The component already checks for `logoUrl` and renders an `<img>` tag when present. Verify this works with data URLs. The existing code (around the early return in the component) should handle it — if `logoUrl` is set, render the image instead of the SVG. Make sure:
- The `<img>` tag has the same size classes as the SVG (uses SIZE_CLASSES)
- It has `object-fit: contain` so logos don't stretch
- It falls back to the SVG/text logo if the image fails to load (add an `onError` handler)

### UI

Add a "Customize Logo" button on the team profile page. When clicked:
- Show a file upload input (accept: .png, .jpg, .jpeg, .svg)
- Show a preview of the uploaded image at team logo size
- Show a "Save" button that stores the data URL in `team.logoUrl`
- Show a "Reset to Default" button that clears `logoUrl` back to undefined

In God Mode, this should be available for every team from the team list page.

### Color Picker Enhancement

While you're at it, add the ability to change team colors (primaryColor, secondaryColor) from the same UI. This is a simple store update — change `team.primaryColor` and `team.secondaryColor`. Show a pair of color picker inputs next to the logo upload.

---

## Feature 4: Fan Reactions & Atmosphere

### Overview
Add a fan engagement system that tracks crowd energy, stadium atmosphere, and generates fan reaction text during games and after big events. This affects home field advantage and adds flavor text throughout the UI.

### Types Changes (`src/types/index.ts`)

Add to the Team interface:
```
fanBase: {
  loyalty: number;        // 0-100, how devoted fans are (affects attendance, patience)
  energy: number;         // 0-100, current crowd energy (resets each game, decays over season)
  satisfaction: number;   // 0-100, based on recent results vs expectations
  marketSize: 'small' | 'medium' | 'large';  // affects revenue, FA appeal
  stadiumNoise: number;   // 0-100, base noise level (large market + winning = louder)
};
```

### Fan Satisfaction Logic (`src/lib/engine/fanReactions.ts`) — NEW FILE

Create a new file with these functions:

**`updateFanSatisfaction(team, season, wins, losses, playoffResult)`**
Called at end of each week and end of season. Logic:

- `winPct = wins / (wins + losses)`
- If winPct >= 0.75: satisfaction += 5 (capped at 95)
- If winPct >= 0.5 and < 0.75: satisfaction += 2 (capped at 80)
- If winPct >= 0.35 and < 0.5: satisfaction -= 3 (floor at 20)
- If winPct < 0.35: satisfaction -= 8 (floor at 10)
- Playoff win: +10 satisfaction
- Championship win: satisfaction = 100, loyalty += 10
- First-round playoff exit: -5 satisfaction
- Missing playoffs after making them last year: -15 satisfaction
- Expansion teams start at satisfaction 50, loyalty 30 (building a fanbase)
- Relocated teams start at satisfaction 40, loyalty 20 (skeptical new city)

**`computeStadiumNoise(team)`**
Returns a 0-100 noise level for home games:
```
base = 50
+ (loyalty * 0.2)           // loyal fans are louder
+ (satisfaction * 0.15)     // happy fans show up
+ (marketSize bonus: small=0, medium=5, large=10)
+ (rivalry game? +10)
+ (playoff game? +15)
- (losing streak 3+? -10)
- (relocated in last 2 seasons? -15)
```
Clamp to 0-100.

**`generateFanReaction(event, team, context)`**
Returns a flavor text string for different events. Use template pools like the commentary system:

Events and example reactions:
- **Big win**: "The [city] faithful are on their feet! Electric atmosphere at the stadium."
- **Blowout loss**: "Boos rain down from the upper deck. Fans are heading for the exits early."
- **Comeback win**: "This crowd just went from dead silent to absolutely deafening! What a turnaround!"
- **Star player traded away**: "Social media is in meltdown. [City] fans are NOT happy about the [Player] trade."
- **Draft pick (high rated)**: "The building erupts! [City] fans love this pick."
- **Draft pick (reach/bust profile)**: "Confused murmurs in the crowd. Nobody had [Player] going this high."
- **Winning streak 5+**: "[City] has the hottest ticket in football right now."
- **Losing streak 5+**: "Paper bags spotted in the stands. [City] faithful are losing patience."
- **Expansion team first win**: "History! [City] gets their first franchise victory! The crowd storms the field."
- **Relocated team first home game**: "Mixed emotions in [New City] as the [New Name] take the field for the first time."

### Game Impact (`src/lib/engine/simulate.ts`)

Currently, home field advantage is a flat 3 points in the betting line. Make it dynamic:

In `generateBettingLine()`, replace the hardcoded `-3` with:
```
homeFieldAdvantage = 1.5 + (stadiumNoise / 100) * 3.0
```
This gives a range of 1.5 (dead stadium) to 4.5 (raucous playoff crowd), with 3.0 as the baseline for an average team. The current 3-point default maps to a stadiumNoise of ~50.

In `simulatePlay()`, add a small crowd noise effect on passing:
- Away team passing in a loud stadium (noise >= 70): +0.01 to sack chance, -0.01 to completion rate
- These are tiny effects but make the atmosphere system feel connected to gameplay

### UI Integration

Show fan satisfaction as a small bar or emoji indicator on the team dashboard. Show fan reaction text:
- In the weekly recap alongside game results
- In the draft UI when a pick is made
- In trade confirmation screens
- In the live game view (see Feature 7) as crowd atmosphere flavor text between plays

---

## Feature 5: Rivalry System Improvements

### Overview
The existing rivalry system in `store.ts` (lines 1674-1762) tracks intensity, events, and types. Improve it to feel more dynamic and have bigger gameplay impact.

### Current State
Rivalries already exist with:
- intensity (0-100), events array, type (divisional/playoff/trade/emerging)
- Intensity delta from game results (close games, blowouts, upsets)
- Decay of 15 points per offseason
- News headlines for intense rivalry games

### Changes to Store (`src/lib/engine/store.ts`)

**Expand rivalry event types.** In the `updateRivalries` function, add detection for:
- **Player poaching**: When a team signs a rival's free agent (especially a starter), add a "player_poaching" event with +8 intensity. Check during free agency when a player signs: was their previous team a rival of the signing team?
- **Draft revenge**: When a team drafts a player that a rival reportedly wanted (if a trade rumor existed about that player + rival team), add "draft_steal" event with +5 intensity
- **Season sweep**: If one team beats a rival in both regular season matchups, add "sweep" event with +10 intensity at the end of the season
- **Playoff elimination**: Already partially tracked, but make it worth +20 intensity (currently folded into generic blowout/upset logic). Detect when a playoff game involves two rivals and the loser is eliminated.

**Add rivalry tiers based on intensity:**
- 0-30: "Budding Rivalry" — minimal effects
- 31-60: "Heated Rivalry" — moderate gameplay effects
- 61-85: "Fierce Rivalry" — major effects
- 86-100: "Blood Feud" — maximum effects, special commentary

**Gameplay impact of rivalry intensity in `simulatePlay()`:**
Currently, rivalryIntensity is passed to `simulateGame()` but its effect is minimal. Make it meaningful:
- Fumble chance increases by `rivalryIntensity / 5000` for both teams (more intense games = harder hits = more fumbles). At intensity 100, that's +2% fumble chance.
- Penalty chance increases by `rivalryIntensity / 3000` (more chippy games). Add a new penalty type "unnecessary roughness" that only triggers in rivalry games with intensity > 50.
- Injury risk increases slightly: `rivalryIntensity / 10000` added to injury check probability
- Scoring tends to be lower in high-intensity rivalry games: reduce big play chance by `rivalryIntensity / 8000`

**Rivalry-aware AI trade logic:**
In `generateAITradeProposals`, CPU teams should refuse to trade star players (OVR >= 75) to a rival team with intensity >= 50. Add a check: if the trade target's team has an active rivalry with intensity >= 50 against the proposing team, skip the proposal.

### UI Enhancement

Create a "Rivalries" tab or section on the league overview page that shows:
- All active rivalries sorted by intensity
- The rivalry tier name and a heat indicator (color gradient from blue to red based on intensity)
- Recent rivalry events (last 5) with descriptions
- Head-to-head record between the two teams
- Next scheduled matchup date/week

In the schedule view, highlight rivalry games with a special icon or border color.

In the game preview (before simming), if the matchup is a rivalry game, show a rivalry banner with the intensity tier and a flavor quote like "These two teams don't like each other. Expect fireworks."

---

## Feature 6: Better Scouting

### Overview
Make scouting deeper and more interactive. Add scouting trips, combine events, pro days, and interview mechanics. Make information progressive — you learn more as you invest more.

### Types Changes (`src/types/index.ts`)

Add to LeagueState:
```
scoutingState: {
  scoutPoints: number;         // replenish each offseason, spend on scouting activities
  maxScoutPoints: number;      // default 20
  combineResults: Record<string, CombineResult>;  // playerId -> combine data
  proDayResults: Record<string, ProDayResult>;
  interviewResults: Record<string, InterviewResult>;
  scoutingTrips: ScoutingTrip[];
};
```

New interfaces:
```
interface CombineResult {
  fortyYard: number;
  benchPress: number;
  verticalJump: number;
  shuttle: number;
  broadJump: number;
  threeConeDrill: number;
  overall: 'elite' | 'above_average' | 'average' | 'below_average' | 'poor';
}

interface ProDayResult {
  playerId: string;
  impression: 'impressive' | 'solid' | 'unremarkable' | 'concerning';
  notes: string;   // 1-2 sentence flavor text
  revealedRating?: string;  // reveals one hidden rating category (e.g., "awareness" or "agility")
}

interface InterviewResult {
  playerId: string;
  personality: 'high_character' | 'confident' | 'reserved' | 'red_flag';
  notes: string;
  revealsBustBoom: boolean;  // 60% chance the interview reveals bust/boom status
}

interface ScoutingTrip {
  id: string;
  targetPlayerId: string;
  weekSent: number;
  weeksRemaining: number;  // takes 1-2 weeks to complete
  completed: boolean;
  result?: {
    ovrEstimate: number;    // ±3 of true OVR
    potentialHint: 'high' | 'medium' | 'low';
    strengthNote: string;   // "Elite arm talent" or "Quick first step"
    weaknessNote: string;   // "Struggles in man coverage" or "Inconsistent hands"
  };
}
```

### Scouting Mechanics (`src/lib/engine/draftScoutEval.ts`)

Restructure scouting into a multi-layered system:

**Layer 1 — Free (always available):**
- Public consensus ranking (projectedRank, already exists)
- Position, school, height/weight, age
- Combine results (generated for all prospects, visible to everyone)
- OVR estimate with wide error range (±15-23 based on scouting level, already exists)

**Layer 2 — Scout Trip (costs 1 scout point, takes 1 week):**
- Narrows OVR estimate to ±5
- Reveals one strength and one weakness
- Gives a potential hint (high/medium/low) — not the exact number
- Can send unlimited trips but limited by scout points

**Layer 3 — Deep Scout (costs 2 scout points, already partially exists):**
- Narrows OVR to ±2 (already exists)
- Reveals exact potential number
- Unlocks full scouting report with all details (already exists)
- Reveals bust/boom status with the detection rates from the previous feature set (35/50/65% by scouting level)

**Layer 4 — Interview (costs 1 scout point, available for top 60 prospects only):**
- Reveals personality/character assessment
- 60% chance to correctly identify bust/boom status (independent of scout detection)
- Flavor text notes that give hints about work ethic, coachability, maturity

**Layer 5 — Pro Day Visit (costs 1 scout point, limited to 5 per draft):**
- Visit a specific prospect's pro day workout
- Reveals one hidden rating (randomly chosen from the prospect's ratings)
- Gives an impression rating
- Higher chance to reveal boom potential (70% if the prospect is a boom)

**Scout Point Economy:**
- Start of each draft season: get `10 + (scoutingLevel * 5)` scout points
  - Level 0: 10 points
  - Level 1: 15 points
  - Level 2: 20 points
- Points don't carry over between seasons
- Upgrading scouting level still costs whatever it currently costs in the game

### Combine Generation (`src/lib/engine/playerGen.ts`)

When generating the draft class, also generate combine results for every prospect. Map player ratings to combine numbers with noise:

- 40-yard dash: `5.2 - (speed / 100) * 0.8 + gaussian(0, 0.05)` → range ~4.3 to 5.2 seconds
- Bench press: `10 + (strength / 100) * 25 + gaussian(0, 2)` → range ~10 to 35 reps
- Vertical jump: `25 + (agility / 100) * 15 + gaussian(0, 1.5)` → range ~25 to 42 inches
- Broad jump: `8.5 + (agility / 100) * 2.5 + gaussian(0, 0.3)` → range ~9 to 11.5 feet
- 3-cone drill: `7.5 - (agility / 100) * 1.2 + gaussian(0, 0.08)` → range ~6.3 to 7.5 seconds
- Shuttle: already generated in draftScoutEval.ts, keep that

Rate the overall combine as: elite (top 10%), above_average (10-35%), average (35-65%), below_average (65-90%), poor (bottom 10%) — based on a composite score.

### UI Changes to Draft Page (`src/app/draft/page.tsx`)

Add a "Scouting Center" panel/tab to the draft page:
- Shows scout points remaining
- List of all prospects with their current scouting status (layers unlocked)
- Buttons: "Send Scout" (1 pt), "Deep Scout" (2 pts), "Interview" (1 pt, top 60 only), "Pro Day" (1 pt, 5 max)
- For each prospect, show a scouting progress indicator (which layers are unlocked)
- Combine results should be in a sortable table (sort by 40 time, bench, etc.)

Show scouting results inline on each prospect's card:
- Layer 1: basic info + combine + wide OVR range
- Layer 2: adds strength/weakness notes + narrower OVR + potential hint
- Layer 3: adds exact potential + bust/boom flag + full report
- Layer 4: adds personality/character + independent bust/boom detection
- Layer 5: adds one revealed rating + pro day impression

---

## Feature 7: Better Commentary & Live Game Experience

### Overview
The live game sim currently generates play-by-play descriptions from template pools. Improve this with: momentum system, situational awareness, player storylines during the game, richer descriptions, and a more broadcast-like presentation.

### Momentum System (`src/lib/engine/playByPlay.ts`)

Add a momentum variable to GameState:
```
momentum: number;  // -100 to +100, negative = away team momentum, positive = home team
```

Momentum shifts based on events:
- Touchdown: +25 momentum toward scoring team
- Turnover: +20 momentum toward recovering team
- Sack: +8 momentum toward defense
- 3-and-out: +10 momentum toward defense
- Big play (20+ yards): +12 momentum toward offense
- Penalty: +5 momentum toward non-penalized team
- Each play, momentum decays 5% toward zero (regression to mean)

**Momentum effects on gameplay:**
- When momentum > 50 (or < -50): the team with momentum gets +0.02 completion rate, +0.5 average rush yards, -0.01 fumble chance
- When momentum > 75 (or < -75): double the above bonuses
- This creates realistic hot/cold streaks and comeback mechanics

**Momentum in descriptions:**
Add momentum-aware commentary. When momentum swings hard, insert contextual lines:
- Momentum > 60: "The [team] are rolling now! This crowd is on their feet!"
- Momentum swing of 30+ in one play: "Just like that, the momentum has completely shifted!"
- Momentum < -60 for home team: "You can feel the energy draining out of this stadium."

### Situational Awareness in Descriptions (`src/lib/engine/playByPlay.ts`)

The current description functions don't know about game context. Pass game state to them and add context-aware variants:

**Score-aware commentary:**
- When a team scores to tie: "We're all knotted up!"
- When a team takes the lead: "[Team] takes the lead for the first time since the [quarter]!"
- When trailing team scores in Q4: "They're not done yet! [Team] cuts the deficit to [X]!"

**Time-aware commentary:**
- Under 2 minutes, Q4, close game: "Clock is winding down, every snap matters now."
- Under 30 seconds, team needs a score: "This could be the last play of the game..."
- Two-minute warning in a close game: "Two-minute warning. This is where legends are made."

**Player-tracking commentary:**
Track individual player performance during the game. When a player has a big game:
- 3rd TD by same player: "[Player] with the HAT TRICK! That's three touchdowns today!"
- 100+ rushing yards: "[Player] just cracked 100 yards on the ground. Dominant performance."
- QB with 300+ passing yards: "[Player] is carving up this defense — over 300 yards through the air."
- Defensive player with 2+ sacks: "[Player] is living in the backfield today. Another sack!"

Add a `gameNarrative` tracker to the live game state:
```
gameNarrative: {
  leadChanges: number;
  largestLead: { team: 'home' | 'away'; points: number };
  scoringSummary: { quarter: number; team: 'home' | 'away'; points: number; description: string }[];
  playerHighlights: Record<string, string[]>;  // playerId -> array of highlight descriptions
}
```

### Enhanced Description Templates (`src/lib/engine/playByPlay.ts`)

Expand the template pools for each play type. Currently there are 3-4 variants per play type. Increase to 8-10 each. Add variety in tone:

**For `descRun()`**, add:
- "Patience from [RB]... finds a crease... bursts through for [X] yards!"
- "[RB] hits the hole and gets what the offensive line gives him. [X] yards."
- "Power run by [RB], dragging [Tackler] for an extra [2-3] yards."
- "Spin move! [RB] makes [Tackler] miss and picks up [X]."

**For `descPassComplete()`**, add:
- "Beautiful throw by [QB] — drops it in the bucket to [WR] for [X] yards."
- "[QB] with the touch pass over the middle. [TE] secures it for [X]."
- "Play-action works perfectly. [QB] finds [WR] wide open for [X] yards."
- "Timing route — [QB] to [WR] on the out cut. Clean [X]-yard pickup."

**For `descSack()`**, add:
- "[DL] beats the tackle off the edge and buries [QB] for a [X]-yard loss!"
- "Interior pressure! [DL] collapses the pocket and [QB] has nowhere to go."
- "[QB] holds it too long — [LB] cleans up for the sack."
- "Speed rush by [DL]! [QB] never saw him coming."

**For `descInterception()`**, add:
- "[CB] reads [QB]'s eyes the whole way — easy interception!"
- "Tipped at the line! [S] comes down with it for the pick!"
- "[QB] forces it into double coverage — [CB] makes him pay."
- "What a play by [CB]! Undercuts the route and picks it off."

**For `descTouchdown()`**, add:
- "END ZONE! [Scorer] gets in untouched! [X]-yard [rush/reception] for six!"
- "[QB] rolls right, fires — [Scorer] makes the grab in the end zone! TOUCHDOWN!"
- "[Scorer] stretches across the goal line! The ref signals touchdown!"
- "Dive to the pylon by [Scorer]! What an effort for the score!"

### Pre-Game and Post-Game Content

**Pre-game intro** (shown before the first play in the live game view):
Generate a 2-3 sentence preview based on:
- Team records
- Rivalry status (if applicable)
- Key player matchups (best offensive player vs best defensive player)
- Betting line
Example: "The 8-3 Buffalo Blizzard host the 6-5 Pittsburgh Rivermen in a key AC matchup. All eyes on BUF QB [Name] against PIT's fearsome pass rush led by [Name]. Buffalo favored by 4.5."

**Halftime summary:**
After Q2 ends, generate a halftime summary:
- Score
- Leading rusher and passer for each team
- Key play of the first half
- If one team is dominating: "Complete domination by [Team] in the first half."
- If close: "We've got a ballgame! Neither team willing to give an inch."

**Post-game summary:**
After the final whistle, generate a 3-4 sentence game recap:
- Final score
- Game MVP (player with most combined impact — TDs, yards, sacks)
- Key storyline (comeback, blowout, rivalry, upset, etc.)
- What it means for standings

### Live Game UI Improvements

These are UI instructions for whoever works on `src/app/schedule/page.tsx` or wherever the live game viewer is:

**Broadcast-style scoreboard:**
- Show team logos, scores, quarter, time remaining, down & distance, field position
- Animate score changes (flash or highlight when a team scores)
- Show possession indicator (arrow or football icon next to the team with the ball)

**Momentum bar:**
- Show a horizontal bar below the scoreboard
- Centered at 0 (neutral), fills left (away) or right (home) based on momentum value
- Color-coded: home team color fills right, away team color fills left
- Animate shifts smoothly

**Play-by-play feed:**
- Show the last 8-10 plays in a scrollable feed
- Color-code plays: touchdowns highlighted in gold, turnovers in red, big plays in team color
- Show down/distance and field position for each play
- Auto-scroll to latest play

**Drive summary:**
- Show a mini drive chart after each scoring drive
- Horizontal bar showing field position progress from start to score
- Number of plays and time elapsed for the drive

**Box score tab:**
- Available during and after the game
- Show full passing, rushing, receiving, defensive stats
- Sortable by category
- Highlight stat leaders with a small star icon

---

## Implementation Priority

Features are split into two tiers. **Build Tier 1 first** — these deepen the core draft-develop-sim loop and add real stakes. **Tier 2 is "someday"** — nice for a v2.0 but not essential and risks feature bloat if done too early.

### Tier 1: Core Improvements (build these)

1. **Owner Approval & Objectives** (Feature 8, simplified) — gives the game real stakes
2. **Scouting Improvements** (Feature 6) — makes the draft more engaging
3. **Commentary & Live Game** (Feature 7) — polish that makes everything feel alive
4. **Rivalry Improvements** (Feature 5) — extends existing system with more gameplay bite
5. **Coach Identity** (Feature 9) — real NFL coaches + coaching carousel adds personality

### Tier 2: Width Features (defer these)

6. **Expansion Teams** (Feature 1) — big structural change, most players won't use in first 5 seasons
7. **Relocation** (Feature 2) — depends on expansion's city picker, low gameplay impact
8. **Fan Reactions & Atmosphere** (Feature 4) — folded into the simplified approval system; the full standalone version with stadiumNoise, crowd energy, and dynamic home field is Tier 2
9. **Logo Customization** (Feature 3) — cosmetic, near-zero gameplay impact, 30-minute polish task

Each feature should be implemented as a complete unit — don't leave half-finished systems. Test each feature before moving to the next.

---

## Feature 8: Fan Approval & Owner Approval with Objectives (SIMPLIFIED)

### Overview
Add two visible approval percentages — Fan Approval and Owner Approval — plus 2-3 seasonal objectives from the owner. If owner approval stays too low, the user gets a warning and then fired. This is the single most impactful new feature because it gives every decision real consequences.

### Design Philosophy
Keep this lean. One approval number for fans, one for the owner, a short list of objectives, and a firing threshold. No owner personality types, no honeymoon periods, no multiplier system. Those can be layered on later if the base system feels too simple — but it probably won't. The objectives do the heavy lifting.

### Types Changes (`src/types/index.ts`)

```
interface OwnerObjective {
  id: string;
  description: string;                    // "Make the playoffs"
  type: 'wins' | 'playoffs' | 'cap' | 'development' | 'championship';
  target: number | string;                // e.g., 10 for "win 10 games", "divisional" for playoff round
  season: number;                         // season this objective applies to
  status: 'active' | 'completed' | 'failed';
}

interface ApprovalState {
  fanApproval: number;                    // 0-100, starts at 50
  ownerApproval: number;                  // 0-100, starts at 55
  objectives: OwnerObjective[];
  tenureSeasons: number;                  // how many seasons the user has managed this team
  warningIssued: boolean;                 // true if owner has given a warning
}
```

Add `approval: ApprovalState` to the Team interface.

### Objective Generation (`src/lib/engine/objectives.ts`) — NEW FILE

**`generateSeasonObjectives(team, players, season)`**

Runs at start of each season. Generates exactly 2-3 objectives based on team state. The logic should read the roster and recent history, then pick the most appropriate objectives:

**Always generate a win target:**
- Roster avg OVR 72+: "Win [10-12] games"
- Roster avg OVR 64-71: "Win [7-9] games"
- Roster avg OVR below 64: "Win [4-6] games"

**Then pick 1-2 more from context:**
- Good team (OVR 72+): "Make the [conference championship / championship]"
- Average team (OVR 64-71): "Make the playoffs"
- Made playoffs last year: "Match or exceed last year's playoff result"
- Over the salary cap: "Get under the salary cap"
- Team with young QB (age ≤ 25, OVR < 72): "Develop the starting QB to [current OVR + 5]"
- Bad team with young roster (avg age < 26): "Develop [2] players by 5+ OVR points"
- Team that's been bad 3+ years: "Draft and start a rookie"

Don't over-generate. 2-3 objectives is plenty. The player should be able to glance at them and immediately understand what the owner expects.

### Approval Update Logic (`src/lib/engine/approval.ts`) — NEW FILE

**`updateApprovalAfterGame(team, won, margin, isRivalry, state)`**
Called after each game:

Fan Approval:
- Win: +2
- Loss: -2
- Win vs rival: +4 (instead of +2)
- Loss vs rival: -4 (instead of -2)
- Blowout win (21+ margin): extra +2
- Blowout loss (21+ margin): extra -2

Owner Approval:
- Win: +1
- Loss: -1
- Win against a team with a better record: extra +1
- Loss against a team with a worse record: extra -1

Clamp both to 0-100 after every update.

**`updateApprovalEndOfSeason(team, seasonResult, objectives)`**
Called at end of season during `advanceToResigning()`:

Evaluate each objective:
- Completed: +10 owner approval, +5 fan approval
- Failed: -15 owner approval, -8 fan approval

Season result bonuses (on top of objective results):
- Championship win: +25 owner, fan set to 95
- Runner-up: +10 owner, +12 fan
- Playoff appearance: +5 owner, +5 fan
- Missing playoffs after making them last year: -10 owner, -12 fan
- Worst record in the league: -8 owner, -15 fan

Between seasons, both values regress 10% toward 50 (prevents runaway highs or lows).

**`updateApprovalForMove(team, moveType, context)`**
Called when the user makes a significant roster move:

- Trading away a star (OVR 80+): -5 fan approval
- Trading for a star (OVR 80+): +5 fan approval
- Signing a big free agent (OVR 78+): +4 fan approval
- Going over the salary cap: -3 owner approval
- Making a lopsided trade (value assessment says "lopsided-they-win"): -4 owner approval

### Firing Logic

Simple two-strike system:
1. End of season: if owner approval is below 25:
   - First time: set `warningIssued = true`. Generate news: "Sources say [Team] ownership is losing patience with GM. One more bad season could mean changes."
   - Second consecutive time (warningIssued was already true): FIRED.
2. If owner approval goes above 40 at any end-of-season check: reset `warningIssued = false`

**When fired:**
- Show a "You've Been Fired" screen with tenure stats (seasons managed, overall record, best playoff finish)
- Two options:
  1. "Take a new job" — pick a different team to manage. The league continues, old team goes to AI.
  2. "Walk away" — return to main menu.

### Store Changes (`src/lib/engine/store.ts`)

**`initializeApproval(teamId)`** — called on new league creation. Sets fan/owner approval to 50/55, generates first objectives.

**`processApprovalAfterGame(teamId, gameResult)`** — called after each simmed game.

**`processEndOfSeasonApproval(teamId)`** — called during `advanceToResigning()`. Evaluates objectives, applies season bonuses, checks firing threshold, generates new objectives for next season.

### UI

**Dashboard indicator:** Two small gauges on the team dashboard — "Fan Pulse: 72%" and "Owner Confidence: 58%". Green above 65, yellow 35-65, red below 35.

**Objectives panel:** Show on the dashboard or a "Front Office" tab. Each objective is one line: description + status icon (checkmark, X, or in-progress dot). That's it — no priority colors, no deadline formatting, no reward/penalty numbers visible to the user. Keep it clean.

**Warning modal:** When the owner issues a warning at end of season, show a brief modal: "The owner has put you on notice. Meet next season's objectives or face the consequences."

**Fired screen:** Full-screen overlay with your record, then the two buttons (new job / walk away).

---

## Feature 9: Coach Identity & AI Coaching Carousel (SIMPLIFIED)

### Overview
The coaching system already exists (`src/lib/engine/coaching.ts`) with generated coaches, schemes, traits, and the `replaceCoach` action. This feature adds three things: (1) real NFL coach names when using a real roster, (2) coach career progression so they feel like persistent characters, and (3) an AI coaching carousel so bad teams fire coaches like real NFL teams do.

### Real NFL 2026 Coaches (`src/lib/data/nfl2026Coaches.ts`) — NEW FILE

Create a data file with real 2026 NFL coaching staffs. The game already has `isNfl2026Roster()` in `nfl2026Draft.ts` that detects real rosters. Use the same detection.

Structure each entry to match the existing Coach interface:

```
export const NFL_2026_COACHES: Record<string, { hc: CoachData; oc: CoachData; dc: CoachData }> = {
  'KC':  { hc: { firstName: 'Andy', lastName: 'Reid', ovr: 92, age: 68, trait: 'Offensive Guru', offensiveScheme: 'west_coast', defensiveScheme: 'cover_3' },
           oc: { firstName: 'Matt', lastName: 'Nagy', ovr: 68, age: 48, trait: 'Innovator', offensiveScheme: 'west_coast' },
           dc: { firstName: 'Steve', lastName: 'Spagnuolo', ovr: 82, age: 67, trait: 'Aggressive', defensiveScheme: 'man_press' } },
  'DET': { hc: { firstName: 'Dan', lastName: 'Campbell', ovr: 85, age: 50, trait: 'Motivator', offensiveScheme: 'power_run', defensiveScheme: 'cover_3' },
           oc: { firstName: 'Ben', lastName: 'Johnson', ovr: 80, age: 39, trait: 'Offensive Guru', offensiveScheme: 'spread' },
           dc: { firstName: 'Aaron', lastName: 'Glenn', ovr: 75, age: 54, trait: 'Defensive Mastermind', defensiveScheme: 'man_press' } },
  // ... fill in all 32 NFL teams
};
```

Include all 32 NFL team staffs. OVR guidelines:
- Elite HC (Reid, McVay, Shanahan, Harbaugh, Campbell): 85-95
- Good HC (McDaniel, LaFleur, Tomlin, Payton): 75-84
- Average HC: 65-74
- New / below average HC: 55-64
- OC/DC: typically 5-15 points below their HC unless they're a known elite coordinator

The team abbreviations in `teams.ts` are custom (not real NFL). The data file should use real NFL abbreviations, and `leagueImport.ts` should map them during import. When `isNfl2026Roster()` returns true, use these real coaches instead of generating random ones.

### Coach Career Progression (`src/lib/engine/coaching.ts`)

Add a function called during offseason development:

**`progressCoaches(teams)`**
For every coach in the league:
- Update `careerWins` and `careerLosses` from the completed season
- Winning season (10+ wins): coach OVR += random 1-2 (capped at 95)
- Losing season (5 or fewer wins): coach OVR -= random 1-3 (floor at 40)
- Middle ground: coach OVR += random -1 to +1
- Age the coach by 1 year
- Retirement check: age 65+ has 10% retirement chance, age 70+ has 25%. If retiring, generate a news item and auto-replace with a new generated coach.

### AI Coaching Carousel

Add to the offseason flow (call during `advanceToResigning()` or `startNewSeason()`):

**`processCoachingCarousel(teams)`**
For each AI team, check if the HC should be fired:
- Won 4 or fewer games: 75% chance of firing
- Won 5 games AND HC tenure 3+ years: 50% chance of firing
- Missed playoffs 3 consecutive years: 40% chance of firing

When an AI team fires a coach:
- Generate a news item: "[City] fires HC [Name] after [X] seasons."
- Replace with a newly generated coach via `generateCoach('HC')`
- 40% chance they also replace the OC or DC (coordinators often go with the HC)

That's it — no free agent coach pool, no coaching tree system. Those are nice but not essential. A fired coach just disappears. The news item and the coaching change itself are what create the narrative.

### Commentary Integration

In the debate system (`src/lib/engine/debate.ts`) and weekly recaps, reference coaches by name where templates currently say generic things:
- "Coach [HC Name]'s decision to go for it on fourth down paid off"
- "This win should take some heat off Coach [HC Name]"
- "Fans are calling for Coach [HC Name]'s head after another loss"

This is a small change — just look up `team.coaches.find(c => c.role === 'HC')` and insert the name into existing template strings where appropriate.

---

## Final Implementation Order

### Tier 1 — Build These (in order)

1. **Owner Approval & Objectives** (Feature 8) — most impactful single feature, gives every decision stakes
2. **Scouting Improvements** (Feature 6) — deepens the draft, the core gameplay loop
3. **Coach Identity & Carousel** (Feature 9) — real NFL coaches + AI firings add persistent narrative
4. **Rivalry Improvements** (Feature 5) — gameplay effects make divisional games matter more
5. **Commentary & Live Game** (Feature 7) — polish layer that ties everything together

### Tier 2 — Defer These

6. **Fan Reactions & Atmosphere** (Feature 4) — the full stadium noise / crowd energy system; the simplified fan approval in Feature 8 covers the essential need
7. **Expansion Teams** (Feature 1) — big structural lift, low early-game impact
8. **Relocation** (Feature 2) — depends on expansion infrastructure
9. **Logo Customization** (Feature 3) — cosmetic only
