# Gridiron GM — Product Requirements Document
*10-Season Analysis: UX & Gameplay Improvements*

Based on a full audit of the current codebase (Next.js/Zustand engine, six pages) and the Football GM reference game, the following PRDs document every gap discovered across a simulated 10-season playthrough. They are ordered roughly by impact and dependency.

---

## PRD-01: Playoff Bracket UI & Simulation

### Problem
The current "playoffs" phase is completely hollow. When the regular season ends, the TopBar shows an "Advance to Draft" button and the phase label says "Playoffs" — but there is zero content: no bracket, no matchups, no scores, no champion. The user advances blindly through a critical phase of every season.

### User Stories
- As a GM, I want to see which 14 teams made the playoffs and what seed my team earned, so I understand the stakes.
- As a GM, I want to simulate each round of the playoff bracket and see scores, so the championship feels earned.
- As a GM whose team made the playoffs, I want to have a path to the Super Bowl displayed, so I feel tension on each game.
- As a GM who missed the playoffs, I want to see who won the championship, so the league feels alive.

### Functional Requirements

**Bracket Construction**
- On entering the playoff phase, compute the 14-team bracket (7 per conference): 4 division winners seeded 1-4 by record, 3 wild cards seeded 5-7 by record among non-division-winners. Apply NFL tiebreaker logic (division record → conference record → point differential).
- Display a 3-round elimination bracket per conference culminating in a Super Bowl matchup.
- Store the bracket in `LeagueState.playoffBracket` (the `PlayoffMatchup[]` type already exists).

**Bracket Page (`/playoffs`)**
- Visual bracket component: each matchup card shows team abbreviations, seeds, records, and after simulation, the score and winner.
- Use team `primaryColor` as accent for each card.
- Highlight the user's team path through the bracket with a distinct border/glow.
- Show "BYE" for top-2 seeds in round 1 (wild card round skips them per NFL format).

**Simulation Controls**
- "Sim Next Game" button: simulate one matchup at a time. If the user's team is playing, show the final score with a WON/LOST banner before moving on.
- "Sim All Remaining" button: instantly resolve the rest of the bracket.
- Reuse `simulateGame()` from the existing engine — no changes needed to the core logic.

**Championship Screen**
- After the Super Bowl, display a full-screen championship card with the winning team's name, color, record, and "Season [X] Champions" text.
- If the user won, add a trophy icon and distinct congratulations state.
- Season champion is stored in a new `LeagueState.champions: { season: number; teamId: string }[]` array for history.

**Navigation**
- Add `/playoffs` to `NAV_ITEMS` in Sidebar, visible only when `phase === 'playoffs'`.
- TopBar in playoffs phase: "Sim Next Game" and "Sim All" replace "Advance to Draft"; "Advance to Draft" appears only after the Super Bowl is decided.

### Out of Scope
- Play-by-play logs for playoff games (see PRD-05).
- Playoff stats are tracked in the same `playerStats` structure as regular season.

---

## PRD-02: Player Development & Aging System

### Problem
Between seasons, `startNewSeason()` increments player ages and decrements contract years, but **ratings never change**. A 22-year-old rookie drafted in Season 1 still has the same OVR in Season 10. Veterans never decline. There is no development arc — the core loop of long-term roster building is entirely missing.

### User Stories
- As a GM, I want young players to improve over time so drafting high-potential rookies has long-term payoff.
- As a GM, I want aging veterans to decline so I must make hard decisions about releasing or extending them.
- As a GM, I want to see a player's season-over-season rating history on their profile so I understand their trajectory.

### Functional Requirements

**Development Engine (`/lib/engine/development.ts`)**

Create a `developPlayers(players: Player[], season: number): Player[]` function called inside `startNewSeason()`.

**Youth Progression (age 22-25)**
- Each offseason, players aged 22-25 with potential > overall gain ratings:
  - `growthAmount = gaussian(4, 3)` clamped to [0, 8].
  - Primary position-relevant ratings (weight ≥ 2 in `POSITION_WEIGHTS`) each increase by `growthAmount * 0.6`.
  - Overall recalculated from weighted ratings.
  - Max overall caps at `potential`.

**Peak (age 26-29)**
- Very small changes: `gaussian(0.5, 2)` per primary rating — can still go up or down slightly.

**Decline (age 30+)**
- Each year after 30, apply `declineAmount = gaussian(2 + (age - 30) * 0.8, 1.5)` clamped to [0, 6].
- Primary ratings decrease by `declineAmount * 0.5`.
- Speed always declines starting at age 28 regardless of position.
- Overall recalculated. Potential does not change.

**Retirement**
- Players ≥ 35 have a `retirementChance = 0.15 + (age - 35) * 0.12` probability of retiring each offseason.
- Retired players: set `retired = true`, `teamId = null`, removed from all rosters. They remain in `players[]` for historical stat reference.
- If a key starter retires and the user's team has no backup, the TopBar or News Feed (PRD-08) surfaces a warning.

**Rating History**
- Add `ratingHistory: { season: number; overall: number }[]` to the `Player` type.
- Populated each offseason before development runs, so season N's pre-development OVR is recorded.

**Potential Revelation**
- Potential is a hidden ceiling. The UI currently shows it directly — this eliminates scouting tension. Instead, show potential as a range: "High (85-90)", "Above Avg (75-84)", "Average (65-74)", "Low (55-64)", "Unknown". The exact number is revealed after 3+ seasons of experience or with maximum scouting budget.

### Out of Scope
- Practice squad or scheme-fit modifiers.
- Mid-season training/development actions.

---

## PRD-03: Contract Re-signing & Negotiation

### Problem
The current free agency flow allows signing any player for a flat estimated salary with a hardcoded 3-year term. There is no:
- Pre-free-agency re-signing window.
- Player interest/demand system (players always accept at the estimated price).
- Contract term negotiation.
- Competing offers from AI teams.
- Salary floor enforcement.

This makes cap management trivially easy and removes all strategic tension from roster construction.

### User Stories
- As a GM, I want to re-sign my key players before free agency opens so I can retain players I've developed.
- As a GM, I want players to sometimes demand more money than I want to pay, forcing hard choices.
- As a GM, I want AI teams to compete for free agents, so the market feels real and unpredictable.
- As a GM, I want to negotiate term length as well as annual salary.

### Functional Requirements

**New Phase: "Re-signing" (between playoffs and draft)**
- After the Super Bowl, phase transitions to `'resigning'` before `'draft'`.
- `LeagueState.phase` type gains `'resigning'`.
- Players on the user's team with `contract.yearsLeft === 1` are "expiring" and appear in the Re-signing page.

**Re-signing Page (`/re-sign`)**
- List expiring players with: name, position, age, OVR, current salary, and a "Market Value" range showing the expected FA ask (e.g., "$8–12M/yr").
- Two inputs per player: years (1–5 slider) and annual salary (number input).
- "Offer" button: player accepts if offer ≥ their asking price × interest multiplier (see below).
- "Pass" button: player enters free agency.
- Sidebar shows remaining cap space in real time.

**Player Interest Multiplier**
- Base: 1.0 (player accepts fair market value).
- Modifiers (applied multiplicatively):
  - Team record: < .400 win% → ×1.15 (player wants a premium to stay on a loser).
  - Team record: > .650 win% → ×0.90 (player discounts to stay on a winner).
  - Player age ≥ 32 → ×0.85 (veteran accepts below market for job security).
  - Player experience with team > 4 seasons → ×0.92 (loyalty discount).
- If player rejects the offer, show a toast: "[Player] rejected your offer of $X/yr."

**AI Team Re-signing**
- At the end of the re-signing phase, AI teams also re-sign their own expiring players using `autoDraftPlayerId`-style need scoring against market value.

**Free Agency Market Competition**
- After re-signing phase, `advanceToFreeAgency()` compiles the full FA pool.
- Each "day" of free agency (simulated in batch on "Sim FA Day" button), AI teams make offers to free agents based on need and cap space.
- If a player receives an AI offer, they are removed from the pool. User gets 1 "sim day" to make competitive offers before AI teams act.
- Users can bid over the AI offer (shown as "competing offer: $X/yr from [TEAM]").

**Salary Floor**
- Teams must maintain ≥ $130M total payroll. Warning badge on cap display if below floor.
- Cannot advance to new season if below floor; user must sign minimum-contract players.

### Out of Scope
- Franchise tag mechanic.
- Restructured/incentive-based contracts.

---

## PRD-04: Trade System

### Problem
There is no trade mechanic. A GM game without trades loses its single most important strategic lever. Trading players, draft picks, and future assets is how real GMs rebuild, retool, and make championship runs. The `DraftPick` type already includes `ownerTeamId` and `originalTeamId`, suggesting trades were anticipated but never built.

### User Stories
- As a GM, I want to propose trades to AI teams so I can acquire the pieces I need to win now.
- As a GM, I want AI teams to sometimes propose trades to me, so I must evaluate incoming offers.
- As a GM, I want to trade future draft picks, so I can mortgage the future for a Super Bowl run.
- As a GM, I want to see a trade value chart so I understand whether a trade is fair.

### Functional Requirements

**Trade UI (`/trades`)**

*Propose Trade Panel*
- Two-column interface: "Your Offer" (left) and "Receiving" (right).
- "Select Team" dropdown: choose any AI team.
- Drag-and-drop or checkbox player/pick selector from each team's roster + draft picks.
- "Trade Value" score shown for each side in real time (see Trade Value below).
- "Send Offer" button: if value is within ±20% and team need is met, AI accepts. Otherwise, AI counter-offers or rejects with a reason string.

*Incoming Trade Proposals*
- Up to 3 AI-initiated trade proposals can queue during any regular-season week (30% chance per week per team with an unmet need).
- Proposals appear as a notification badge on the Trades nav item and in the News Feed (PRD-08).
- Each proposal shows the offer, what the AI wants back, and a value assessment ("Fair", "Lopsided — they win", "Lopsided — you win").

**Trade Value Formula**
- Player value: `(OVR * 2 + potential * 0.5) * ageMultiplier` where `ageMultiplier = 1.2` for age ≤ 25, `1.0` for 26-29, `0.7` for 30-33, `0.3` for 34+.
- Draft pick value: Round 1 pick → 150 pts, Round 2 → 90 pts, Round 3 → 55 pts, Rounds 4-7 descending from 35 to 5. Future picks (not current year) are discounted by 15%.
- This mirrors a simplified Jimmy Johnson trade chart.

**AI Evaluation**
- AI team accepts if: (a) incoming value ≥ outgoing value × 0.90, and (b) the acquired player/pick fills a team need as defined by `getTeamNeeds()`.
- AI counters (proposes modification) if value is 70–89% match.
- AI rejects if < 70% match.

**Store Actions**
```typescript
executeTrade(
  offeredPlayerIds: string[],
  offeredPickIds: string[],
  receivedPlayerIds: string[],
  receivedPickIds: string[],
  counterpartTeamId: string
): boolean
```

**Trade Deadline**
- Trades are only allowed during the regular season, weeks 1–12 (out of 18). After Week 12, trades are locked. Sidebar shows "Trade Deadline: X weeks away" or "Trade Window Closed."

### Out of Scope
- Multi-team trades (3+ teams).
- Conditional picks (e.g., "top-5 protected").

---

## PRD-05: Box Score, Game Log & Sim Experience

### Problem
Simulating a week produces nothing but a final score. The user has no idea how the game unfolded, which players performed, whether their star QB had a career day or threw 3 interceptions. The `playerStats` record is computed correctly per game but is never surfaced. The season's most engaging content — game-by-game drama — is completely invisible.

### User Stories
- As a GM, I want to see a box score for any game so I understand how my team performed.
- As a GM, I want to see a game log recap (key moments) so I feel like the game actually happened.
- As a GM, I want to click a result on my schedule to see that game's stats.
- As a GM, I want a post-game summary notification after each week sim.

### Functional Requirements

**Box Score Modal / Page**

Clicking any played game in the Schedule page opens a box score view (modal or `/game/[id]` route).

*Header:* Team names, final score, Week/Season, Home/Away indicators.

*Passing Stats Table:*
| Player | Cmp | Att | Yds | TD | INT | Rating |
- QB Rating formula: `(Cmp% + Yds/Att + TD/Att - INT/Att) * 25`, clamped to 0–158.3.

*Rushing Stats Table:*
| Player | Att | Yds | Avg | TD | FUM |

*Receiving Stats Table:*
| Player | Tgt | Rec | Yds | Avg | TD |

*Defense Stats Table:*
| Player | TKL | SCK | INT | FF |

*Game Recap Text (auto-generated):*
- Template-driven sentence generation based on stats:
  - "[QB] threw for [yards] yards and [TDs] TDs."
  - "[TOP RB] rushed for [yards] yards, leading the ground attack."
  - Result sentence: "The [team] won [X-Y] to improve to [W-L]."
- 3-5 sentences total. Generated client-side from `playerStats`.

**Post-Week Toast Notification**
- After `simWeek()` resolves, a toast appears for 4 seconds:
  - Win: "✅ Week [N]: You defeated [OPP] [SCORE]–[OPP_SCORE]"
  - Loss: "❌ Week [N]: You lost to [OPP] [SCORE]–[OPP_SCORE]"

**Schedule Enhancements**
- Each played game row in the Schedule page gains a "Box Score" button/link.
- Upcoming games show the opponent's current record and point differential rank.

**Season Sim Mode**
- "Sim Season" button (already in TopBar) triggers games week by week, pausing 200ms between weeks to show progress. A progress bar "Simulating week X of 18..." replaces the static label.

### Out of Scope
- Play-by-play engine (each play simulated individually). Stats remain retroactively allocated.
- Video highlights.

---

## PRD-06: Player Profile & Career Hub

### Problem
Players are rows in a table. There is no way to click a player's name to see their full stat history, career stats, contract details, or development trajectory. Users cannot evaluate players they're considering signing or trading for without building the entire picture from fragmented data across multiple pages.

### User Stories
- As a GM, I want to click any player to see their full profile: bio, ratings breakdown, career stats, contract, and history.
- As a GM, I want to compare two players side-by-side so I can make informed roster decisions.
- As a GM, I want to see a player's season-by-season stat line so I understand their trajectory.

### Functional Requirements

**Player Profile Page (`/player/[id]`)**

*Header Card:*
- Name, position, age, experience ("3rd year"), team (or "Free Agent"), jersey number (generate once, store in Player type).
- OVR rating large display with color coding. Potential range (per PRD-02 obfuscation).
- Contract: "$X.XM / yr, [N] years remaining" or "Free Agent."

*Ratings Radar / Bar Chart:*
- Show all 14 ratings as horizontal bars colored by value tier.
- Group: Physical (speed, strength, agility, stamina, awareness), Skill (throwing/catching/carrying/blocking/kicking), Defense (tackling, coverage, passRush).
- Show only relevant skill bars for each position (e.g., hide `throwing` for RB).
- Rating history sparkline (if ≥ 2 seasons) from `ratingHistory[]`.

*Season Stats Table:*
- Current season stats relevant to position (e.g., for QB: Att/Cmp/Yds/TD/INT; for DL: TKL/SCK).
- Career totals row at the bottom.

*Contract History:*
- Draft info: "[Year] Draft, Round [R], Pick [P] (overall #[N])" or "Undrafted."
- Current contract details.

*Actions (roster players only):*
- "Release Player" button → removes from roster, adds to FA pool, reduces payroll. Confirmation dialog with dead cap warning.
- "Offer Extension" button (if contract.yearsLeft ≤ 2) → opens re-sign modal.

**Player Comparison Tool**
- "Compare" button on every player row opens a side-by-side modal showing two players' ratings as mirrored bar charts.
- Available from Roster, Draft, and Free Agency pages.

**Clickable Names Everywhere**
- Every `{player.firstName} {player.lastName}` text across all pages becomes a `<Link href="/player/[id]">` element.

### Out of Scope
- Player social media, personality system.
- Photo/avatar generation.

---

## PRD-07: Draft Scouting & Uncertainty System

### Problem
Draft prospects show exact OVR and potential numbers. There is zero scouting tension — the user always knows exactly who the best player available is and picks accordingly. In reality (and in the original Football GM), scouting produces uncertain estimates that improve with investment. The current system makes the draft a trivial exercise of clicking the top number.

### User Stories
- As a GM, I want prospect ratings to appear as uncertain estimates so I must invest in scouting to reduce that uncertainty.
- As a GM, I want to discover a late-round gem whose true rating was hidden, rewarding good scouting.
- As a GM, I want to invest in scouting during the offseason to improve my draft board accuracy.

### Functional Requirements

**Scouting Budget**
- Add `scoutingLevel: 0 | 1 | 2 | 3 | 4` to `LeagueState` (0 = default/cheap, 4 = maximum).
- Team Finances page (or sidebar widget) allows changing scouting level, costing $2M–$10M/yr from payroll.
- Level takes effect at the start of the following season's draft.

**Scouting Uncertainty**
- Each draft prospect has a hidden true `ratings.overall` (stored internally).
- The displayed value is `scoutedOvr = trueOvr + gaussian(0, scoutingError)` where:
  - Level 0 → `scoutingError = 12`
  - Level 1 → `scoutingError = 8`
  - Level 2 → `scoutingError = 5`
  - Level 3 → `scoutingError = 3`
  - Level 4 → `scoutingError = 1`
- Scouted OVR is displayed as a range: `scoutedOvr ± scoutingError` (e.g., "68–82" at level 0, "76–78" at level 3).
- After a player is drafted and plays their first season, their true OVR is revealed.

**Prospect Notes / Labels**
- Each prospect randomly gets a scouting label that provides qualitative flavor:
  - "High motor," "Raw but explosive," "Pro-ready," "Injury history," "Combine standout," "Character concerns."
- Labels are cosmetic but affect immersion. "Injury history" → 20% higher first-year injury chance.

**Pre-Draft Scouting Actions**
- During the offseason (before draft), user can "Deep Scout" up to 5 prospects (at no extra cost).
- Deep-scouted players have their range halved: `scoutedOvr ± (scoutingError / 2)`.

**Mock Draft Board**
- Prospects panel in the Draft page can be sorted by: Scouted OVR (default), Position, Age, Scouting Label.
- "Big board" column shows user's personal ranking (drag to reorder, stored in local state).

### Out of Scope
- Combine event mini-games.
- Region-based scouting allocation.

---

## PRD-08: League News Feed & Notifications

### Problem
The game is silent. Between weeks, the user receives no information about what's happening across the league — no trades, no signings, no injuries, no big performances. The league feels like a ghost town with 31 AI teams that exist only as schedule opponents. Narrative immersion is zero.

### User Stories
- As a GM, I want a news feed that shows me major league events so the world feels alive.
- As a GM, I want to be notified about my own team events (injuries, contract expirations) so I don't miss critical information.
- As a GM, I want to see weekly headlines about top performances.

### Functional Requirements

**News Feed State**
- Add `newsItems: NewsItem[]` to `LeagueState`.
```typescript
interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system';
  teamId?: string;
  playerIds?: string[];
  headline: string;
  body?: string;
  isUserTeam: boolean;
}
```

**News Generation Triggers**

*After each simWeek():*
- Top offensive performer (most yards): "[Player] threw for [N] yards in [Team]'s [X-Y] win."
- Injury events: "[Player] left the game with a [type] injury. Expected to miss [N] weeks." (injury is already in the data model; just needs news generation)
- Upsets: any game where the lower-OVR team wins by 10+ → "Upset alert: [Team] beats [Team] [X-Y]."

*After each phase transition:*
- Draft picks (user's picks and top-5 overall): "[Team] selects [Player] ([Pos]) with the #[N] pick."
- FA signings by AI teams: "[Team] signs [Player] to a $X/yr deal."
- AI releases: "[Team] releases [Player]. He is now a free agent."
- Player retirements: "[Player] announces retirement after [N] seasons."
- Champion: "[Team] wins Super Bowl [Season]!"

*User-team events always include `isUserTeam: true`.*

**News Feed Page (`/news`)**
- Reverse-chronological feed of all `newsItems[]`.
- Filter tabs: "All", "My Team", "Transactions", "Injuries", "Scores."
- Each item rendered as a compact card with type icon, headline, team color accent, and timestamp (Season X, Week Y).
- "Your Team" items highlighted with a subtle blue border.

**Sidebar Badge**
- Red dot badge on the News nav item when new unread items exist since last visit.
- Cleared on visit to `/news`.

**Notification Toast**
- Critical user-team events (injury to starter, contract expiry warning, championship win) show as 5-second toasts.

### Out of Scope
- User-written notes or custom tags on news items.
- Push notifications.

---

## PRD-09: Injury Management System

### Problem
Injuries exist in the `Player` type (`injury: { type: string; weeksLeft: number } | null`) and are partially respected in `simulateGame()` (injured players skipped in teamPower). But:
- Injuries are never actually generated during season simulation.
- There is no Injury Report page.
- There is no IR (injured reserve) designation.
- When a starter is injured, the user has no idea — no notification, no roster alert.

### User Stories
- As a GM, I want my players to sustain injuries during the season so I face real roster challenges.
- As a GM, I want an Injury Report page so I can see who is out and plan around it.
- As a GM, I want to place players on IR to free active roster space when they're out long-term.

### Functional Requirements

**Injury Generation in `simWeek()`**
- Each game, each player has a base injury chance: `0.012` (≈ 1.2% per game, realistic for NFL starters).
- Chance modified by: age ≥ 30 → ×1.3; stamina < 60 → ×1.2; previously injured same season → ×1.1.
- On injury, roll injury type and duration:
  - Sprain/Strain (1-2 weeks): 50% probability.
  - Muscle Pull (2-4 weeks): 25%.
  - Fracture (4-8 weeks): 15%.
  - Torn Ligament / ACL (rest of season): 10%.
- Set `player.injury = { type: string; weeksLeft: number }`.
- Each week, `weeksLeft` decrements by 1. When it reaches 0, `player.injury = null`.

**Injury Report Page (add to Roster page, not a separate route)**
- Tab or section: "Injury Report."
- Lists all injured players: name, position, injury type, weeks remaining.
- Color coded: red for 4+ weeks, amber for 2-3 weeks, yellow for 1 week.

**IR Designation**
- Add `onIR: boolean` to `Player` type.
- "Place on IR" button in player row (only for injury.weeksLeft ≥ 4).
- Player on IR counts as roster spot free (doesn't count against active 53 limit) but can't return until `weeksLeft ≤ 2`.
- "Activate from IR" button appears when `weeksLeft ≤ 2`.

**Healthy Scratch**
- Players with OVR more than 15 below a teammate at same position can be marked "Healthy Scratch" — they won't play but remain on active roster.

**News Feed Integration**
- Any injury to a player with OVR ≥ 75 generates a news item (PRD-08).

### Out of Scope
- Individual play collision physics.
- Injury-specific stat penalties during partial-game injuries.

---

## PRD-10: Season Summary, Awards & History

### Problem
At the end of each season, nothing happens. The TopBar shows "Advance to Draft" during playoffs (with no bracket), and then free agency begins immediately. There is no:
- Season-end wrap-up.
- League awards (MVP, DPOY, Rookie of the Year, etc.).
- Season champion celebration.
- Season history log to look back on.

The lack of closure means each season feels like the previous — there's no narrative payoff.

### User Stories
- As a GM who just won the Super Bowl, I want a championship moment so winning feels meaningful.
- As a GM, I want to see league award winners each season so I can assess my team against the league's best.
- As a GM, I want to look back at past season results so I can track my dynasty's progress.

### Functional Requirements

**Season Summary Screen (`/season-summary`)**
Automatically navigated to after the Super Bowl is decided (before phase transitions to 'resigning').

*Section 1 — Champion:*
- Full-width card: champion team name, record, primary color background.
- "Your team's season" summary: record, playoff result (Round 1 exit / Conference Final / Runner-Up / CHAMPION).

*Section 2 — League Awards:*
Award selection logic:

| Award | Selection Rule |
|---|---|
| MVP | Highest OVR among offensive players with ≥ 14 games played |
| Offensive POY | Highest passing + rushing + receiving yards among skill players |
| Defensive POY | Highest `tackles + sacks*5 + defensiveINTs*4` among defensive players |
| Rookie of the Year | Highest OVR among players with `experience === 1` and ≥ 10 games |
| Coach of the Year | GM whose team overachieved vs. preseason projected record (computed from average OVR vs. actual wins) |

- Each award card shows: award name, player/team name, key stat, team abbreviation chip.
- Award winners stored in `LeagueState.awardHistory[]`.

*Section 3 — Stat Leaders:*
- Passing yards leader, rushing yards leader, receiving yards leader, sack leader, INT leader.
- Top 3 shown per category.

*Section 4 — My Team Review:*
- Roster changes this season (who was signed, released, drafted).
- Record vs. last season comparison (if ≥ Season 2).
- Young players who showed the most improvement (OVR gained from PRD-02 ratingHistory).

**History Page (`/history`)**
- Table of all completed seasons: Season, Champion, User Team Record, User Team Playoff Result.
- Click any season row to see that season's award winners and stat leaders (from stored `awardHistory`).

**Data Model Additions**
```typescript
interface SeasonSummary {
  season: number;
  championTeamId: string;
  awards: { award: string; playerId: string; teamId: string }[];
  statLeaders: Record<string, { playerId: string; value: number }>;
  userRecord: { wins: number; losses: number };
  userPlayoffResult: 'missed' | 'wildcard' | 'divisional' | 'conference' | 'runnerup' | 'champion';
}
```
Add `seasonHistory: SeasonSummary[]` to `LeagueState`.

### Out of Scope
- Pro Bowl selection and game.
- Hall of Fame induction (post-retirement honors).

---

## PRD-11: Cap Management & Contract Cutting

### Problem
The salary cap display exists ("Cap: $X / $225M") but has no real consequence. Users can sign players even when over the cap (no hard enforcement in `signFreeAgent()`). Players can never be released. Contract years exist but players on expiring contracts are never shown as a planning concern. The financial layer is purely decorative.

### User Stories
- As a GM, I want the salary cap to be a hard constraint so I must make real trade-offs.
- As a GM, I want to release players to clear cap space so I can pursue free agents.
- As a GM, I want to see my full salary structure (by year and by position) so I can plan ahead.

### Functional Requirements

**Hard Cap Enforcement**
- `signFreeAgent()` must fail (return early + toast error) if `userTeam.totalPayroll + salary > salaryCap`.
- Same enforcement in `draftPlayer()` for rookie contracts.
- TopBar cap display turns red when within $5M of the cap.

**Player Release System**
- Add `releasePlayer(playerId: string): void` to the store.
  - Removes player from team's roster array.
  - Sets `player.teamId = null`.
  - Reduces `totalPayroll` by `player.contract.salary`.
  - Adds player to `freeAgents[]`.
  - Generates a news item.
- Release button available in Roster table view and Player Profile (PRD-06).
- Confirmation dialog: "Are you sure you want to release [Name]? He will become a free agent."

**Cap Page (`/finances`)**

*Cap Summary Card:*
- Total cap: $225M, used: $X, remaining: $Y.
- Dead cap: $0 (no dead cap in this version — simplified).
- Cap space by year: Year 1 (current) and Year 2 (projected based on contracts with ≥ 2 years remaining).

*Salary by Position Breakdown:*
- Horizontal bar chart: each position group's total payroll as % of cap.
- Helps user identify over-invested positions.

*Expiring Contracts Table:*
- List of players with `contract.yearsLeft ≤ 1`, sorted by OVR desc.
- "Re-sign" quick link → goes to re-sign modal (PRD-03).
- "Release" button directly in this table.

*Cap Penalties:*
- If team is below salary floor ($130M) at the start of the season, $5M is deducted from cap space the following year as a "floor penalty."

**totalPayroll Auto-Calculation**
- Currently, `totalPayroll` is a stored value that must be manually updated. Replace with a derived value: `teams.map(t => t.roster.reduce((sum, pid) => sum + getPlayer(pid)?.contract.salary ?? 0, sum), 0)`. Compute on render, not stored state, to avoid sync bugs.

### Out of Scope
- Signing bonuses, guaranteed money, restructured contracts.
- Franchise tag.

---

## PRD-12: League-wide Stats & Leaderboards

### Problem
There are no stat leaderboards. The user has no way to know if their QB is having a league-best season, or if a rival team's RB is breaking records. League context is crucial for evaluating player value, setting contract prices, and feeling like a part of a living league.

### User Stories
- As a GM, I want to see passing yards leaders so I know how my QB ranks league-wide.
- As a GM, I want to see team power rankings so I know where my team stands in the full league.
- As a GM, I want to see the leaders update weekly as the season progresses.

### Functional Requirements

**Stats Page (`/stats`)**

*Tab 1 — League Leaders (Season)*
- Dropdown: Passing Yards | Rushing Yards | Receiving Yards | TDs | Sacks | INTs | Tackles.
- Table showing top 20 players for selected stat: Rank, Player Name, Team, Position, Value.
- User's players highlighted. Filtered to players with ≥ 6 games played.
- Sort by clicking column headers.

*Tab 2 — Team Stats*
- Table of all 32 teams ranked by: Points For (default), Points Against, Point Differential, Record.
- User's team highlighted. Sortable columns.

*Tab 3 — Power Rankings*
- Weekly power ranking: teams sorted by a composite score of record (60%), point differential (25%), recent form (last 3 games, 15%).
- "↑3", "↓2" arrows showing week-over-week movement.
- Available during regular season only; frozen after Week 18.

*Tab 4 — Historical Records (after Season 2+)*
- Single-season records in major categories that have been set in the user's league: "[Player], [Team], [Year]: [stat]."

**Integration**
- Stats Page linked from Sidebar nav.
- Dashboard adds "League Leaders" mini-widget: Top 3 passing yards, top 3 rushing yards.

### Out of Scope
- All-time career records across multiple leagues.
- Advanced stats (EPA, DVOA-style metrics).

---

## PRD-13: Depth Chart Editor & Lineup Management

### Problem
The Roster page's Depth Chart view is read-only. Players are automatically ordered by OVR, with no ability for the user to make tactical choices. Real GMs set starting lineups and depth chart order. Without editing, the user cannot:
- Start a young player over a veteran to develop them.
- Adjust for matchups.
- Specify which RB gets goal-line carries.

### User Stories
- As a GM, I want to drag players up and down the depth chart so I control my starting lineup.
- As a GM, I want to mark a player as "starter" even if their OVR is lower, to develop them.
- As a GM, I want my depth chart decisions to affect simulation outcomes.

### Functional Requirements

**Depth Chart Data Model**
- Add `depthChart: Record<Position, string[]>` to `Team` — ordered array of player IDs per position.
- Default: auto-generated from OVR ranking when team is first created and whenever a player is added/removed.
- Persisted in game state.

**Depth Chart Editor (Roster page, Depth Chart view)**
- Each position row becomes drag-and-drop reorderable (using native HTML5 drag-and-drop or a lightweight library like `@dnd-kit/core`).
- Up/Down arrow buttons as a drag alternative for accessibility.
- "Reset to Auto" button per position row: reverts to OVR-ranked order.
- Visual indicator: "Starter" badge on [0], "2nd" on [1], etc.

**Simulation Impact**
- `teamPower()` in `simulate.ts` must respect the depth chart order instead of using arbitrary roster iteration.
- Starter is the player at `depthChart[position][0]`.
- If starter is injured, fall through to the next healthy player in the depth chart.

**Formation / Emphasis**
- Optional: position group weighting slider for offense vs. defense. A "Run-heavy" team weights OL/RB ratings more in `teamPower()`; "Pass-first" weights QB/WR/TE. Three presets: Balanced, Run-heavy, Pass-first.
- Stored as `Team.schemeType: 'balanced' | 'run' | 'pass'`.

### Out of Scope
- Specific play calling or in-game strategy adjustments.
- Individual coverage assignments for DBs.

---

## PRD-14: Persistence, Save & New League Management

### Problem
Game state lives in Zustand (in-memory). Refreshing the browser wipes everything. There is no save system, no way to have multiple simultaneous leagues, and no way to return to a game in progress. This is a critical gap for a game meant to be played across 10+ sessions.

### User Stories
- As a GM, I want my game to auto-save so I don't lose progress if I close the tab.
- As a GM, I want to start a new league without destroying my current one.
- As a GM, I want to load a previous save so I can pick up where I left off.

### Functional Requirements

**Auto-Save to LocalStorage**
- On every state mutation (after `set()`), persist the full `LeagueState` to `localStorage` under key `gridiron-gm-autosave`.
- Use Zustand's `subscribeWithSelector` middleware with a debounce of 500ms to avoid excessive writes.
- On app load (`newLeague` check), if `localStorage` has a saved state, offer "Continue" button alongside team selection.
- "Continue" restores the full state from localStorage. "New League" shows team picker and overwrites on selection (with a warning: "This will overwrite your current save").

**Manual Save Slots (2 slots)**
- Under a "File" or settings menu (gear icon in sidebar footer):
  - "Save to Slot 1 / Slot 2" — serializes current state to `localStorage` under `gridiron-gm-save-1` / `-2`.
  - "Load Slot 1 / Slot 2" — restores. Each slot shows the team name, season, and record of the last save. "Empty" if unused.
- Confirmation dialog on load: "This will replace your current progress."

**State Versioning**
- Add `saveVersion: number` (starts at 1) to `LeagueState`.
- On load, if `saveVersion` doesn't match current app version, show a warning: "This save may be from an older version and could behave unexpectedly."

**Export / Import**
- "Export Save" button: downloads the current state as `gridiron-gm-save.json`.
- "Import Save" button: file picker that loads a `.json` save file.

### Out of Scope
- Cloud save / user accounts.
- Server-side persistence.

---

## PRD-15: Onboarding, Phase Guidance & UX Polish

### Problem
The game starts immediately after team selection with no tutorial, no explanation of the season flow, and no contextual help. First-time users see a dashboard with "Sim Week" and "Sim Season" buttons and no context about what happens next, when they should visit which pages, or what decisions await them. Navigation items appear for phases that aren't active (Draft shows "hasn't started yet"). The overall UX lacks guidance cues.

### User Stories
- As a first-time player, I want to understand the season cycle so I know what actions to take each phase.
- As a GM, I want navigation items to indicate when they require my attention so I don't miss critical decisions.
- As a GM, I want clear phase transition guidance so I always know what to do next.

### Functional Requirements

**Phase-Aware Sidebar Navigation**
- Navigation items show state-based badges:
  - Draft: red badge with "Your Pick!" when `phase === 'draft' && draftOrder[0] === userTeamId`.
  - Free Agency: orange badge "FA Open" when `phase === 'freeAgency'` and FAs remain.
  - Re-sign: orange badge "Action Needed" when `phase === 'resigning'` and expiring players > 0.
  - Finances: red badge "Over Cap" when payroll > cap.
  - Trades: number badge showing pending incoming offers.
- Items for inactive phases are grayed (reduced opacity, non-clickable) rather than navigating to a "not yet" message.

**Phase Summary Banner**
- Below the TopBar on every page, a thin contextual banner for the current phase:
  - Regular Season: "Week [N] of 18 — Next game: vs [OPP] (Week [N+1]). [X wins needed for playoff berth]."
  - Playoffs: "You are [seeded #N]. Next matchup: vs [OPP]."
  - Draft: "Round [R], Pick [P]. [N picks until your next pick]."
  - Free Agency: "[X] free agents remain. $[Y]M cap space available."
  - Re-signing: "[X] players with expiring contracts. [N] days left."
- Dismissible per session.

**Welcome Modal (first launch only)**
- On first `newLeague()`, show a modal with 5 slides:
  1. "Welcome to Gridiron GM" — overview.
  2. "Regular Season" — sim weeks, watch results.
  3. "Playoffs & Draft" — compete for a title, then rebuild.
  4. "Free Agency & Re-signing" — build your roster.
  5. "Your Goal" — win the Super Bowl, build a dynasty.
- "Got it!" dismisses and sets `localStorage['gridiron-gm-tutorial-seen'] = true`.

**Empty State Messaging**
- Replace all "hasn't started yet" static pages with active guidance:
  - Draft page during regular season: "The draft begins after the playoffs. Sim the season and compete for a title first." + quick links to Dashboard and Schedule.
  - Free Agency during regular season: "Free agency opens in the offseason. Focus on this season first." + link to Roster to evaluate your depth.

**TopBar Action Hierarchy**
- The primary action button (green/blue) should always be the most contextually appropriate next step. Currently both "Sim Week" and "Sim Season" are styled the same — "Sim Week" should be primary (blue), "Sim Season" should be secondary (ghost).
- Add a "What's Next?" persistent helper tooltip on the primary TopBar button for new users (first 3 sessions).

**Loading & Error States**
- `newLeague()` is async and can fail (fbgmRoster fetch). Show a loading spinner during initialization and a proper error message with "Try Again" if it fails, rather than silently falling back.

### Out of Scope
- Contextual help popups for every UI element.
- Accessibility audit beyond keyboard navigation of form elements.

---

## Implementation Priority Matrix

| PRD | Title | Impact | Effort | Priority |
|-----|-------|--------|--------|----------|
| PRD-01 | Playoff Bracket UI | Critical | Low | P0 |
| PRD-14 | Persistence & Save | Critical | Low | P0 |
| PRD-15 | Onboarding & UX Polish | High | Low | P0 |
| PRD-05 | Box Score & Game Log | High | Low | P1 |
| PRD-06 | Player Profile | High | Medium | P1 |
| PRD-09 | Injury System | High | Medium | P1 |
| PRD-02 | Player Development | High | Medium | P1 |
| PRD-11 | Cap Management | High | Medium | P1 |
| PRD-08 | News Feed | Medium | Medium | P2 |
| PRD-03 | Contract Negotiation | Medium | High | P2 |
| PRD-04 | Trade System | High | High | P2 |
| PRD-10 | Season Summary & Awards | Medium | Medium | P2 |
| PRD-12 | Stats & Leaderboards | Medium | Low | P2 |
| PRD-13 | Depth Chart Editor | Medium | Medium | P3 |
| PRD-07 | Scouting Uncertainty | Medium | Medium | P3 |
