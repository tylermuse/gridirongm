# BS Football — Claude Code Build Instructions

**Project:** BS Football (formerly Gridiron GM / FBGM)
**URL:** https://bs-football.com
**Engine:** ZenGM-based football simulation (JavaScript/TypeScript, client-side browser app)
**Source of truth:** Community feedback from ZenGM Discord (~12,500 members) + firsthand game audit (April 2026)

---

## Context for Claude Code

BS Football is a browser-based football GM simulation built on the ZenGM engine (same codebase family as Basketball GM). The game runs entirely client-side. League data is stored in IndexedDB and can be imported/exported as JSON league files. The game simulation engine processes play-by-play football, and the UI is a React-based single-page application with sidebar navigation.

**Current game structure observed:**
- Sidebar nav: Dashboard, Standings, Playoffs, Stats, News, Recap, History, QB Pyramid, Roster, Discord
- Sub-nav pages: Roster, Finances, Standings, Trades, Stats (accessible from team context)
- Offseason phases: Re-signing → Free Agency → Draft (current order)
- Player attributes: OVR (Overall), POT (Potential), position-specific ratings (e.g., DL has Pass Rush, Strength, Tackling, Speed, Agility, Stamina)
- Player mood system with factors (e.g., "Losing record", "Underpaid")
- Trade system with point-based valuation (PTS column)
- Franchise Tag system in re-signing
- BS Mode: Special ruleset with Draft Lottery, QB Tiers, Ewing Theory, IC Guys

These instructions are ordered by priority. Each section contains the problem, what to build, and implementation guidance.

---

## 1. Fix Offensive & Defensive Line Impact on Game Outcomes

### Problem
After the Block Win Rate (BWR) update, OL/DL ratings were decoupled from game outcomes so heavily that elite offensive linemen make no measurable difference to team performance. Per-game PBW (Pass Block Win rate) and RBW (Run Block Win rate) only correlate with overall ability, not individual game impact. The developer acknowledged this was done because individual OL stats were "causing too many problems with game sim."

### What to Build

**A. Team-level OL/DL impact system (not individual play-by-play)**

Instead of tracking OL performance play-by-play, compute a **team-level offensive line grade** and **defensive line grade** before each game starts, then use those grades as multipliers on game sim outcomes.

```
TeamOLGrade = weightedAverage(starter_OL_ratings) // from depth chart OL starters
TeamDLGrade = weightedAverage(starter_DL_ratings) // from depth chart DL starters
```

**B. Apply OL/DL grades to these simulation outcomes:**

1. **Rushing efficiency:** `rushYardsPerCarry *= (teamOLGrade / leagueAvgOLGrade)` — elite OL should produce more rushing yards
2. **Sack rate:** `sackProbability *= (opposingDLGrade / teamOLGrade)` — bad OL vs. good DL = more sacks
3. **QB pressure rate:** Add a "pressure" concept that reduces QB completion percentage when DL grade outmatches OL grade
4. **Time to throw:** When OL grade is low relative to opposing DL, increase probability of hurried throws (lower completion %, more INTs)

**C. Specific ratings to weight:**

For OL grade calculation, weight these attributes (observed in player profiles):
- Pass Block Win Rate (PBW) — affects passing game
- Run Block Win Rate (RBW) — affects rushing game
- Strength — baseline for both
- Stamina — late-game fatigue factor

For DL grade:
- Pass Rush — affects sack rate and pressure
- Strength — affects run stopping
- Speed/Agility — affects containment

**D. Verification criteria:**
- Simulate 1,000 seasons and compare: teams with top-5 OL grades should average significantly more rushing yards and fewer sacks allowed than teams with bottom-5 OL grades
- The correlation between OL grade and rushing yards per game should be r > 0.3
- The correlation between DL grade and sacks per game should be r > 0.3

---

## 2. Rebalance QB Valuation & Award Logic

### Problem
QBs almost never win MVP. Users documented a QB going 15-2 with 4,286 yards, 39 TDs, 6 INT losing to an RB with 1,492 yards, 16 TDs. QB Approximate Value (AV) caps too low — 80+ OVR QBs can't break 17 AV. Additionally, rushing yard leaders sometimes miss All-Pro/Pro Bowl, and wrong players win positional awards.

### What to Build

**A. Overhaul the MVP formula:**

The MVP formula should heavily weight:
- Team wins (winning record is near-prerequisite)
- Passing TDs (strongest positive signal)
- Passing yards
- Passer rating / ANY/A (adjusted net yards per attempt)
- Interceptions (negative weight)
- Rushing TDs and yards for RBs/QBs

Target distribution (reflecting real NFL patterns):
- QBs should win MVP ~70-80% of seasons
- RBs should win ~10-15%
- Other positions: ~5-10%

**B. Fix QB AV calculation:**

QB Approximate Value should scale higher. In the real NFL, elite QBs regularly have AV of 20+. The current formula likely underweights passing stats relative to other positions. Increase the passing component:

```
QB_AV = base + (passingYards / X) + (passingTDs * Y) - (INTs * Z) + (wins * W)
```

Tune X, Y, Z, W so that a 4,500-yard, 35-TD, 10-INT QB on a 12-win team produces AV ~20-22.

**C. Fix All-Pro / Pro Bowl selection logic:**

- Ensure the league rushing yards leader is at minimum a Pro Bowl selection at RB
- Ensure the league passing yards leader is at minimum a Pro Bowl selection at QB
- Review positional award logic: "Protector of the Year" should go to the OL with the best blocking grades, not a random player

**D. Fix award race display bugs:**

Review the award determination code to ensure the correct position eligibility filters are applied (e.g., only OL players eligible for Protector of the Year, only defensive players for DPOY).

---

## 3. Reorder Offseason: Free Agency Before Draft

### Problem
The current offseason order is Re-signing → Draft → Free Agency. In the real NFL, it's Re-signing → Free Agency → Draft. This matters because teams need to address roster needs via free agency before deciding what to draft.

### What to Build

**A. Change the offseason phase sequence:**

Current order:
```
Re-signing → Draft → Free Agency → Regular Season
```

New order:
```
Re-signing → Free Agency → Draft → Regular Season
```

This is a phase reordering in the game loop. The re-signing window (which I observed — Extend/Tag/Let Walk for expiring contracts) stays first. Then free agency opens. Then the draft.

**B. Fix free agent salary demands:**

Users report all free agents asking for minimum contracts even when teams have $50M+ in cap space. The salary demand algorithm should factor in:
- Player OVR and age
- League-wide cap space availability
- Supply/demand at the position
- Previous contract as a baseline
- Market competition (multiple teams bidding)

A 75 OVR 26-year-old WR should be demanding $12-18M/year, not the minimum.

**C. Add age-based contract length caps:**

Observed issue: 39-year-old Calais Campbell asking for a 2-year deal at $7.1M/year. Add contract length limits:

```
Age 30-32: Max 4 years
Age 33-35: Max 3 years
Age 36+:   Max 2 years
Age 38+:   Max 1 year
```

Players should also prefer shorter deals as they age (weight toward 1-year deals for 35+).

---

## 4. Add Defensive Player Stats (DB Coverage Stats)

### Problem
The Stats page currently tracks 12 categories: Passing Yards, Rushing Yards, Receiving Yards, Receptions, Passing TDs, Rushing TDs, Tackles, Tackles for Loss, Sacks, Interceptions, Pass Deflections, Forced Fumbles. There are zero coverage stats for defensive backs. This is the single most-requested stat addition.

### What to Build

**A. Add these stat categories to the game simulation engine:**

Track per-play when a pass targets a defender's coverage assignment:
1. **Targets** — number of times the CB/S was the primary coverage defender on a pass attempt
2. **Completions Allowed** — passes completed against this defender
3. **Yards Allowed** — receiving yards gained against this defender
4. **TDs Allowed** — receiving TDs allowed in coverage
5. **Passer Rating Allowed** — passer rating of QBs throwing against this defender

**B. Add these to the Stats page dropdown:**

Add new options to the League Leaders combobox (currently `ref_29` with options like `passYards`, `rushYards`, etc.):
- `targetsAllowed`
- `completionsAllowed`
- `yardsAllowed`
- `tdsAllowed`
- `passerRatingAllowed`

**C. Add to player profile:**

In the player profile modal (the popup shown when clicking a player name), add these stats to the "Season Stats" section for CB and S positions.

**D. Secondary stat additions (lower priority):**

- **First Downs** — track as a team and individual stat
- **3rd Down Efficiency** — team stat: 3rd down conversions / 3rd down attempts
- **4th Down Efficiency** — team stat
- **Snap Counts** — per player, per game
- **Incomplete Pass Intended Yardage** — in play-by-play, show where the pass was aimed even on incompletions

---

## 5. Implement Coaching System

### Problem
There is no coaching system. The sidebar shows no coaching-related pages (I saw Dashboard, Standings, Playoffs, Stats, News, Recap, History, QB Pyramid, Roster, Discord — but no "Staff" or "Coaches" page visible to users, though a `/staff` URL exists in the nav). Users want coaches that affect team performance and game-day decisions.

### What to Build

**A. Coaching staff data model:**

Each team should have:
```javascript
{
  headCoach: {
    name: String,
    age: Number,
    experience: Number,     // years as HC
    overallRating: Number,  // 0-100
    offenseRating: Number,
    defenseRating: Number,
    // Tendency ratings (0-100 scale)
    aggressiveness: Number,      // 4th down decisions, trick plays
    runPassBalance: Number,      // 0 = run-heavy, 100 = pass-heavy
    playerDevelopment: Number,   // affects young player growth rate
    clockManagement: Number,     // affects timeout usage, end-of-half strategy
    // Personality
    personality: String,         // e.g., "aggressive", "conservative", "balanced"
  },
  offensiveCoordinator: {
    name: String,
    rating: Number,
    // Affects: play calling, offensive scheme
  },
  defensiveCoordinator: {
    name: String,
    rating: Number,
    // Affects: defensive scheme, blitz frequency
  }
}
```

**B. Coaching impact on game simulation:**

1. **4th down decisions:** `aggressiveness` rating determines go-for-it threshold. High aggressiveness (80+) = go for it on 4th-and-3 or less from midfield. Low aggressiveness (20-) = punt on 4th-and-1 at the opponent 40.
   - Also factor game state: score differential, time remaining, field position
   - Users specifically want a "Dan Campbell" archetype who goes for it on every 4th down

2. **Run/Pass balance:** `runPassBalance` shifts play calling. A 30-rated coach calls ~60% run plays. A 70-rated calls ~60% pass plays.

3. **Clock management:** `clockManagement` rating affects:
   - Timeout usage (bad coaches waste timeouts)
   - End-of-half strategy (good coaches manage the 2-minute drill)
   - Currently, CPU clock management is described as "pretty bad" — losing teams take timeouts after scores

4. **Player development:** `playerDevelopment` rating creates a multiplier on young player (age < 26) offseason improvement:
   ```
   developmentBonus = (coachPlayerDev - 50) / 100 * 0.2  // ±20% development speed
   ```

**C. Coaching market / hiring:**

- After each season, fired coaches enter the coaching market
- Generate new coaching candidates each offseason
- Teams with coaching vacancies hold interviews and hire
- Coaching contracts: 3-5 year terms
- Fire coach option (with dead money / buyout)
- User team: present a coaching candidates screen during offseason if HC slot is vacant

**D. UI: Add a "Coaches" or "Staff" page to the sidebar**

Show the current coaching staff with ratings, tendencies, contract info. There appears to already be a `/staff` route — build it out fully.

---

## 6. Tune Game Simulation Realism

### Problem
Multiple simulation realism issues compound to break immersion. These are individual tuning fixes, not architectural changes.

### What to Build

**A. Cap outlier performances from low-rated players:**

A 46 OVR QB should never throw 11 TDs in a single game. Add performance ceilings based on OVR:

```
maxTDsInGame = floor(playerOVR / 10) + randomVariance(0, 2)
// 46 OVR: max ~6 TDs (4 + 2 variance)
// 80 OVR: max ~10 TDs (8 + 2 variance)
// 95 OVR: max ~11 TDs (9 + 2 variance)
```

Apply similar logic to prevent absurd single-game stat lines for low-OVR players across all positions.

**B. Bring passing yard totals closer to NFL averages:**

Currently, multiple 5,000+ yard passers appear in the same season. In the real NFL, 5,000 yards is rare (happens 1-3 times per season). Reduce the baseline passing yards per game:
- Target league average: ~230 passing yards/game per team (NFL average)
- Target: 1-3 QBs exceeding 4,800 yards per season, not 8-10

**C. Fix completion percentage decay:**

Top QBs drop from 66-70% to 60-63% after a few seasons, which is too aggressive. Completion percentage should decline gradually:
- Peak (age 26-32): 65-70% for elite QBs
- Age 33-36: decline ~1% per year
- Age 37+: decline ~1.5% per year

**D. Overhaul CPU clock/timeout management:**

Build a proper clock management AI:
1. **Trailing in 4th quarter:** Use timeouts on defensive stops to preserve time
2. **Leading in 4th quarter:** Run the ball, use the play clock, DON'T take unnecessary timeouts
3. **2-minute warning scenarios:** Manage the clock properly — spike the ball, take timeouts strategically
4. **Never take a timeout after scoring when trailing** — this is a specific bug users reported

**E. Reduce turnover clustering:**

"3 turnovers within 10 seconds" suggests turnovers are independent random events without cooldown. Add a brief turnover cooldown — after a turnover, reduce turnover probability for the next 3-5 plays.

**F. Fix player stat regression curves:**

"After the 2022 season, literally everything ended up depleting like crazy" — the year-over-year regression is too aggressive. Use gentler decline curves:

```
// Current (too aggressive):
ratingDecay = baseDecay * age_factor  // all attributes decline together

// Target (more realistic):
// Physical attributes (speed, agility) decline faster
physicalDecay = baseDecay * 1.2 * age_factor
// Mental/skill attributes (accuracy, awareness) decline slower
mentalDecay = baseDecay * 0.6 * age_factor
// Strength peaks later and declines slower
strengthDecay = baseDecay * 0.8 * age_factor
```

---

## 7. Fix AI Team Management & Trade Logic

### Problem
CPU teams make unrealistic roster and trade decisions: playing WRs at RB, overvaluing veterans in trades, poor draft board logic, and not meeting minimum roster requirements.

### What to Build

**A. Fix AI depth chart — prevent WRs at RB:**

Add position eligibility constraints to the auto-depth-chart function:
```javascript
const positionEligibility = {
  QB: ['QB'],
  RB: ['RB', 'FB'],        // Only RBs and FBs can play RB
  WR: ['WR'],
  TE: ['TE'],
  OL: ['OL', 'OT', 'OG', 'C'],
  DL: ['DL', 'DE', 'DT'],
  LB: ['LB', 'OLB', 'ILB', 'MLB'],
  CB: ['CB'],
  S: ['S', 'FS', 'SS'],
  K: ['K'],
  P: ['P'],
};
```

Never place a player at a position outside their eligibility group, regardless of speed or OVR. Currently, the CPU places fast WRs at RB because the algorithm sees high speed and doesn't enforce position locks.

**B. Fix trade value curves:**

Current issue: veterans are overvalued ("offered 2 firsts for a 28-year-old safety"). Implement NFL-realistic trade value:

```javascript
function tradeValue(player) {
  let value = baseValueFromOVR(player.ovr);

  // Age penalty — value drops steeply after 28
  if (player.age > 28) {
    value *= Math.pow(0.88, player.age - 28);  // ~12% per year after 28
  }

  // Contract penalty — bad contracts reduce value
  if (player.salary > marketValue(player)) {
    value -= (player.salary - marketValue(player)) * player.yearsLeft;
  }

  // Position scarcity — QBs are worth more
  value *= positionMultiplier[player.pos];  // QB: 1.5, EDGE: 1.2, S: 0.8, etc.

  return value;
}
```

Also increase draft pick value — first-round picks should be worth more than most veterans over 27.

**C. Enforce minimum roster composition for AI teams:**

The roster composition panel (observed on re-signing screen) shows thresholds like QB 2/3, RB 6/4, etc. — the first number is current count, second is minimum/target. AI teams should:
- Always maintain at least 2 QBs (ideally 3)
- Always maintain at least 3 RBs
- Never have fewer than the position minimums shown in roster composition
- Prioritize filling gaps in free agency and the draft

**D. Improve CPU draft board:**

Players projected for top-10 picks shouldn't fall to pick 35. The CPU draft logic should:
- Generate a draft board based on prospect OVR + POT + positional value
- Add small random variance (±3-5 picks) but not large swings
- Factor team needs (if a CPU team has 0 QBs, they should draft one)
- Match user expectations from scouting reports / mock drafts

---

## 8. Add Practice Squad & Injured Reserve (IR)

### Problem
There's no practice squad or IR designation. The roster page (observed) shows a flat list of all players with no distinction. Users want to manage roster spots more realistically.

### What to Build

**A. Practice Squad:**
- 16-player practice squad (matching current NFL rules)
- Players on PS don't count toward the 53-man active roster
- PS players can be promoted to the active roster at any time
- Other teams can sign your PS players (with a window for you to match)
- PS eligibility: players with < 3 accrued seasons, or who cleared waivers

**B. Injured Reserve (IR):**
- Place injured players on IR to free up the active roster spot
- IR players are out for a minimum of 4 games (matching current NFL rules)
- Can designate up to 8 players per season for return from IR
- IR return: after 4 games, player can practice for 21 days before activation

**C. UI changes:**

On the Roster page, add tabs or sections:
- **Active Roster** (53 players)
- **Practice Squad** (16 players)
- **Injured Reserve** (variable)

Add buttons on player rows: "Move to PS", "Place on IR", "Activate from IR"

---

## 9. Fix the Sack Rate Slider

### Problem
The sack rate slider in game settings reportedly doesn't work — "players still have a high amount of sacks even when the slider is at 0." This is a bug fix.

### What to Build

Find the sack slider implementation and ensure it actually multiplies the sack probability:

```javascript
// The slider value should directly scale sack probability
sackProbability = baseSackProbability * (sackSliderValue / defaultSliderValue)

// When slider = 0, sackProbability should = 0
// When slider = default (e.g., 100), sackProbability = baseSackProbability
// When slider = 200, sackProbability = 2x baseSackProbability
```

Test: set slider to 0, simulate 100 games, verify zero sacks occur. Set slider to 200, verify roughly double the default sack count.

---

## 10. Additional Quality-of-Life Improvements

### A. Customizable Award Names
Allow users to rename awards (e.g., rename "MVP" to a custom trophy name). Store in league settings JSON.

### B. Draft Prospect Quality Modifier
Add a setting to control the average quality of each draft class. A slider from "Weak" to "Loaded" that shifts the OVR/POT distribution of generated prospects.

### C. Game Start Times
Add flavor text for game scheduling: 1 PM, 4:25 PM, Sunday Night, Monday Night, Thursday Night designations. Affects display only (no gameplay impact) but adds immersion.

### D. Position Change Without God Mode
Allow users to change a player's position (e.g., move a college TE to OL, convert a safety to CB) without enabling God Mode. Add a "Convert Position" button on the player profile with a success probability based on the player's physical attributes.

### E. Restore "Play One Day" Keyboard Shortcut
Users report this keyboard shortcut was removed in a recent update. Re-add it (likely was bound to a key like `P` or `Space`).

### F. Protected Draft Picks in Trades
Allow conditional picks in trades: "1st round pick (top-5 protected)" — if the pick lands in the top 5, it conveys the following year instead.

---

## Implementation Priority & Estimated Effort

| # | Feature | Priority | Effort | Dependencies |
|---|---------|----------|--------|--------------|
| 1 | OL/DL impact fix | CRITICAL | Medium | Game sim engine |
| 2 | QB MVP/award rebalance | High | Low | Award calculation logic |
| 3 | FA before Draft | High | Medium | Offseason phase controller |
| 4 | DB coverage stats | High | High | Game sim play-by-play + Stats UI |
| 5 | Coaching system | High | High | New data model + game sim + UI |
| 6 | Game sim tuning | Medium | Medium | Game sim engine (multiple fixes) |
| 7 | AI team management | Medium | Medium | AI decision logic |
| 8 | Practice Squad / IR | Medium | Medium | Roster management + UI |
| 9 | Sack slider bug fix | Low | Low | Slider → sim connection |
| 10 | QoL improvements | Low | Low-Medium | Various |

**Suggested build order:** Start with #2 (quick win, high visibility), then #1 (critical fix), then #3 (structural), then #9 (bug fix). These four changes address the loudest community complaints with manageable effort. Then tackle #4-#8 as larger feature work.

---

## Key Files to Look For (ZenGM Codebase Guidance)

If working from the ZenGM/FBGM open-source codebase:

- **Game simulation engine:** Look for the play-by-play simulation loop — likely in `src/worker/core/GameSim/` or similar. This is where rushing yards, passing yards, sacks, turnovers, and all in-game events are calculated.
- **Award calculation:** Search for MVP, All-Pro, Pro Bowl calculation functions — likely in `src/worker/core/season/` or `src/worker/core/awards/`.
- **Offseason flow:** The phase controller that sequences Re-signing → FA → Draft — likely in `src/worker/core/phase/`.
- **Stats tracking:** Where per-player stats are accumulated — likely in the GameSim output handler and a stats module.
- **AI trade logic:** Trade value functions — look for trade evaluation in `src/worker/core/trade/`.
- **Depth chart / roster management:** Auto-lineup logic — likely in `src/worker/core/team/`.
- **UI components:** React components for Stats page, Roster page, Trade Center — in `src/ui/views/` or similar.
- **Sliders/settings:** Game setting sliders — look for where slider values are read during simulation.

---

*Document compiled: April 3, 2026*
*Based on: ZenGM Discord community feedback analysis + firsthand game audit of bs-football.com*
