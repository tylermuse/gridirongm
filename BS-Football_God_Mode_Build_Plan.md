# BS Football — God Mode Build Plan

**Project:** BS Football (formerly Gridiron GM / FBGM)
**Feature:** God Mode — a comprehensive sandbox/commissioner mode that gives users full control over players, teams, outcomes, trades, and league state
**Priority:** High (frequently requested feature, no current implementation exists)

---

## Current State

The Settings page (`/settings`) currently has:

- **Finances:** Salary Cap, Cap Growth Rate, Luxury Tax Rate, League Minimum Salary
- **Trades:** Trade Deadline (week slider)
- **Player Development:** Progression Rate, Regression Rate, Injury Frequency, Retirement Age
- **Modes:** BS Mode (toggle), McAfee Mode (toggle), Chaos Draft (toggle), AI Commentary (toggle)
- **Import:** Import League File from URL

**There is no God Mode, commissioner mode, or player editor.** The only way users can currently customize anything is through the Settings sliders, importing a modified league JSON file, or using the browser's developer console to run scripts against the game's worker. Users on Discord have been asking for position changes "without God Mode" — implying they want lightweight editing without needing a full sandbox toggle, but also want the full sandbox for deeper control.

---

## Design Philosophy

God Mode should be a single master toggle on the Settings page that unlocks a suite of editing powers across the entire game. When enabled, a persistent visual indicator (colored banner or badge) reminds the user that their league is in God Mode — this matters because some users track achievements or compete in Discord challenges, and God Mode leagues should be clearly marked.

**Two-tier approach:**
1. **God Mode OFF:** Normal gameplay, no editing powers, achievements track normally
2. **God Mode ON:** Full editing powers unlocked, achievements permanently disabled for this league save (even if God Mode is later turned off)

This matches how Basketball GM (the sibling ZenGM game) handles it — once you turn on God Mode, the league is forever flagged.

---

## Feature Specification

### 1. God Mode Toggle (Settings Page)

**Location:** Add a new section to `/settings`, positioned above the existing "BS Mode" section.

```
┌──────────────────────────────────────────────────────┐
│  God Mode  ⚡ COMMISSIONER                           │
│                                                      │
│  Full control over your league. Edit players, force  │
│  trades, set game outcomes, and modify any team.     │
│  WARNING: Enabling God Mode permanently disables     │
│  achievements for this league.                       │
│                                                      │
│  [Toggle: OFF]                                       │
│                                                      │
│  ☐ Enable without achievement penalty (debug only)   │
└──────────────────────────────────────────────────────┘
```

**Implementation:**
- Store `godMode: boolean` and `godModeAchievementsDisabled: boolean` in the league metadata object (the same object that stores salary cap, BS Mode, etc.)
- When toggling ON for the first time, show a confirmation dialog: "Enabling God Mode will permanently disable achievements for this league. Continue?"
- Once `godModeAchievementsDisabled` is set to `true`, it never reverts
- Add a persistent banner at the top of every page when God Mode is active: a small gold/yellow bar that says "⚡ God Mode Active" — similar to the existing "Re-signing Window" or "7 players to re-sign" banners

**Data model change:**
```javascript
// In league settings / metadata
{
  godMode: false,           // currently active?
  godModeInPast: false,     // ever been turned on?
  // godModeInPast permanently disables achievements
}
```

---

### 2. Player Editor

**The highest-value God Mode feature.** Users want to customize individual player attributes.

**Access point:** Add an "Edit Player" button to the player profile modal (the popup that currently shows Ratings, Season Stats, Release Player, Add to Trading Block).

**Editor UI — new modal or full page at `/player/:id/edit`:**

```
┌─ Edit Player: Patrick Mahomes ──────────────────────┐
│                                                      │
│  BASIC INFO                                          │
│  Name:     [Patrick Mahomes    ]                     │
│  Position: [QB ▼]                                    │
│  Age:      [29]     Height: [6'3"]  Weight: [230]    │
│  Team:     [Kansas City ▼]                           │
│                                                      │
│  CONTRACT                                            │
│  Salary:   [$45.0M /yr]                              │
│  Years:    [4]                                       │
│                                                      │
│  RATINGS                          Current → New      │
│  Pass Rush:    [===|=========] 61  →  [  ]           │
│  Strength:     [========|====] 84  →  [  ]           │
│  Tackling:     [==|==========] 28  →  [  ]           │
│  Speed:        [=|===========] 24  →  [  ]           │
│  Agility:      [=|===========] 20  →  [  ]           │
│  Stamina:      [=====|=======] 62  →  [  ]           │
│                                                      │
│  OVERALL:  58 → [  ]  (auto-calc from ratings)       │
│  POTENTIAL: 61 → [  ]                                │
│                                                      │
│  MOOD                                                │
│  Mood Override: [-- Use Default -- ▼]                │
│    Options: Content, Happy, Unhappy, Angry           │
│                                                      │
│  INJURY                                              │
│  Status: [Healthy ▼]                                 │
│    Options: Healthy, Day-to-Day, Out 1w, Out 2w,     │
│             Out 4w, Out 8w, Out Season, Torn ACL...  │
│                                                      │
│           [Save Changes]    [Cancel]                  │
└──────────────────────────────────────────────────────┘
```

**What's editable:**

| Field | Type | Notes |
|-------|------|-------|
| Name (first, last) | Text input | |
| Position | Dropdown | All positions: QB, RB, WR, TE, OL, DL, LB, CB, S, K, P |
| Age | Number input | Min 18, Max 50 |
| Team | Dropdown | All 32 teams + Free Agent |
| Contract salary | Number input ($/yr) | |
| Contract years | Number input | 0 = free agent after season |
| Each rating attribute | Slider or number (0-100) | Position-specific ratings vary (QB has different attrs than DL) |
| Overall (OVR) | Number (0-100) | Can be auto-calculated or manually overridden |
| Potential (POT) | Number (0-100) | |
| Mood | Dropdown | Override the calculated mood |
| Injury status | Dropdown | Set or clear injuries |
| Experience (years) | Number | |
| Draft info | Text | Pick number, year (display only or editable) |

**Implementation notes:**
- Ratings are position-specific. When the user changes a player's position, the rating categories should update to show that position's attributes (e.g., switching from DL to QB swaps Pass Rush/Strength for Arm Strength/Accuracy/etc.)
- When individual ratings change, auto-recalculate OVR using the existing OVR formula for that position
- Allow OVR override — if the user manually sets OVR, flag it as a manual override that won't recalculate
- Write changes directly to the player object in IndexedDB

**Position change flow (addresses the "position change without God Mode" request):**
- Could also expose a lightweight "Convert Position" button on the player profile even when God Mode is OFF
- With God Mode ON: instant position change, all ratings preserved
- With God Mode OFF: position change has a development period (1 offseason) and success probability based on athletic ratings

---

### 3. Create Player

**Access point:** Button on the Roster page: "+ Create Player"

**UI:** Same editor as Player Editor but with all fields blank / defaulted.

**Defaults for new player:**
```javascript
{
  name: "",              // user enters
  position: "QB",        // dropdown
  age: 22,
  ratings: { /* all at 50 */ },
  ovr: 50,
  pot: 65,
  contract: { salary: leagueMinimum, years: 4 },
  team: userTeamId,
  mood: "Content",
  injury: "Healthy",
  experience: 0,
  draftPick: "Undrafted",
}
```

**Also support:** "Clone Player" — duplicate an existing player's ratings but with a new name. Useful for "what if" scenarios.

---

### 4. Force Trade

**Access point:** New button on the Trade Center page (alongside existing Incoming Offers / Trading Block / Propose Trade / Trade Finder tabs): "Force Trade"

**Current trade flow:** User proposes a trade → AI evaluates → accepts or rejects based on trade points.

**God Mode trade flow:** Same UI as Propose Trade, but with an additional button: **"Force Trade"** (in addition to the existing "Propose Trade" button).

```
┌─ Trade Proposal ─────────────────────────────────────┐
│                                                      │
│  Your Offer          │  You Receive                  │
│  ☑ Player A          │  ☑ Player X                   │
│  ☑ 2027 1st Rd       │  ☑ Player Y                   │
│                       │                               │
│  0 trade pts          │  0 trade pts                  │
│                                                      │
│  [Propose Trade]    [⚡ Force Trade]                  │
│                                                      │
│  Force Trade bypasses AI trade evaluation.            │
│  The other team will accept regardless of value.     │
└──────────────────────────────────────────────────────┘
```

**Implementation:**
- "Force Trade" skips the trade evaluation function entirely
- Executes the trade immediately: moves players, adjusts rosters, transfers draft picks, updates cap
- Log the trade in the transaction log with a "[Forced]" tag so the user knows which trades were forced when reviewing history
- Allow forcing trades that would normally be salary-cap-illegal too (God Mode overrides cap rules)

**Also support: Force Trade Between Two AI Teams**
- New UI: pick Team A and Team B, select players/picks from each, force the trade
- This lets users play commissioner and reshape the whole league

---

### 5. Set Game Outcomes

**Access point:** On the Schedule page, before a game is played, add a "Set Outcome" option next to each upcoming game.

**UI:**
```
┌─ Set Game Outcome ───────────────────────────────────┐
│                                                      │
│  Week 5: Arizona Cardinals vs. Seattle Seahawks      │
│                                                      │
│  Winner: [Arizona Cardinals ▼]                       │
│                                                      │
│  Score (optional):                                   │
│  ARI: [   ]    SEA: [   ]                            │
│                                                      │
│  ☐ Auto-generate realistic box score for this result │
│  ☐ Set as forfeit (0-1 / 1-0)                       │
│                                                      │
│           [Confirm Outcome]    [Cancel]               │
└──────────────────────────────────────────────────────┘
```

**Implementation:**

Two modes:
1. **Winner-only mode:** User picks the winner. The game sim runs normally but with a heavy thumb on the scale (massively boost the chosen winner's performance). The resulting stats and box score look organic but the winner is guaranteed.
2. **Score-override mode:** User sets the exact final score. The game sim generates a realistic box score that produces that score (distribute yards, TDs, FGs to reach the target score).

**Data model:**
```javascript
// Per-game override (stored in schedule array)
{
  gameId: "week5-ARI-SEA",
  overrideWinner: "ARI",       // null if no override
  overrideScore: { home: 31, away: 17 },  // null if auto
  forceBoxScore: true,          // generate matching stats
}
```

**Also support: Playoff bracket manipulation**
- In the Playoffs page, allow God Mode users to manually seed teams or force specific matchups
- "Send to Playoffs" — force a team into the playoff bracket regardless of record

---

### 6. Edit Team Attributes

**Access point:** New "Edit Team" button on each team's page (Roster page header, Standings page team rows, etc.)

**Editable fields:**

| Field | Type | Notes |
|-------|------|-------|
| Team name | Text | e.g., "Cardinals" |
| City/Region | Text | e.g., "Arizona" |
| Abbreviation | Text (3 char) | e.g., "ARI" |
| Logo/Color | Color picker | Primary and secondary team color |
| Conference/Division | Dropdown | Move teams between divisions |
| Budget / Revenue | Number | Set team financials |
| Cap space override | Number | Manually set available cap |
| Stadium capacity | Number | Affects revenue |
| Coaching staff ratings | Sliders | If coaching system exists (see build instructions doc) |

**Also support:**
- **Relocate team** — change city + name + abbreviation in one action
- **Expand league** — add a 33rd, 34th team (generate new roster via draft/FA pool)
- **Contract league** — remove a team, dispersal draft for their players

---

### 7. Control Draft

**Access point:** During the draft phase, God Mode unlocks additional controls.

**Features:**
1. **Pick any player:** Override the auto-pick. Instead of the CPU drafting based on its board, the user clicks a player and assigns them to that pick slot.
2. **Reorder the draft board:** Drag-and-drop to change the pick order for any/all teams.
3. **Rig the lottery:** In BS Mode (which has a Draft Lottery), manually set the lottery results — choose which team gets pick #1, #2, etc.
4. **Edit prospects before draft:** Open the Player Editor for any draft prospect to change their ratings, potential, or position before they're drafted.
5. **Re-do a pick:** After a pick is made, undo it and choose a different player.

**UI for draft manipulation:**
```
┌─ Draft Control Panel (God Mode) ─────────────────────┐
│                                                      │
│  Pick #1 — Seattle Seahawks                          │
│  Auto pick: [ON/OFF]                                 │
│  Override: [-- Select Player -- ▼]                   │
│                                                      │
│  Pick #2 — New England Patriots                      │
│  Auto pick: [ON/OFF]                                 │
│  Override: [-- Select Player -- ▼]                   │
│                                                      │
│  [Reorder Picks]  [Edit Prospects]  [Rig Lottery]    │
└──────────────────────────────────────────────────────┘
```

---

### 8. Manipulate Free Agency

**Access point:** During the Free Agency phase, God Mode unlocks:

1. **Sign any free agent to any team:** Not just your own team — assign a free agent to any CPU team at whatever salary
2. **Override salary demands:** Change what a free agent is asking for (address the "everyone wants minimum" bug in a manual way)
3. **Force a player to re-sign:** Skip the negotiation — the player accepts whatever you offer
4. **Release any player from any team:** Cut a player from a CPU team's roster to make them a free agent
5. **Set contract terms directly:** Bypass the negotiation UI — type in exact salary and years

---

### 9. Time & Phase Control

**Access point:** A "Commissioner Controls" panel accessible from a new sidebar item or a floating toolbar when God Mode is active.

**Features:**
1. **Jump to any phase:** Skip directly to Draft, Free Agency, Regular Season Week X, Playoffs, etc.
2. **Rewind:** Go back to a previous week (requires auto-save snapshots — save league state at the start of each week)
3. **Sim to specific date:** "Simulate until Week 8" without clicking through each week
4. **Skip offseason:** Jump from end of season directly to Week 1 of next season (auto-handle re-signing, FA, draft with CPU defaults)
5. **Change season length:** Modify the number of regular season games (e.g., 18 games instead of 17)

**Auto-save for rewind:**
```javascript
// At the start of each phase/week, snapshot the league state
const snapshot = {
  season: 2026,
  phase: "regular_season",
  week: 5,
  data: serializeLeagueState(),  // full IndexedDB dump
  timestamp: Date.now(),
};
// Store last 20 snapshots (ring buffer to manage storage)
```

---

### 10. Award & Record Override

**Access point:** On the Awards page (end of season) and History page.

**Features:**
1. **Manually select award winners:** Override MVP, DPOY, OROY, etc. — pick the player you want
2. **Edit league records:** Change the all-time records (most passing yards in a season, etc.)
3. **Edit Hall of Fame:** Add or remove players from the HoF
4. **Edit season results:** Change the final standings or playoff results retroactively (history rewrite)

---

### 11. Financial Controls (God Mode Enhancements)

**Expand existing Settings sliders and add new ones when God Mode is active:**

| Setting | Description |
|---------|-------------|
| Unlimited cap space | Toggle to remove salary cap entirely |
| Set any team's budget | Override revenue/payroll for any team |
| Adjust individual contracts | Change any player's salary mid-season |
| Void a contract | Release a player with no dead cap |
| Restructure any contract | Convert salary to bonus, extend years |
| Toggle luxury tax | On/off |
| Set draft pick compensation | Customize compensatory pick rules |

---

### 12. Scenario/Sandbox Tools

**Advanced God Mode features for power users:**

1. **"What If" Mode:** Fork the current league state, make changes, sim forward, then discard or keep the result. Lets users test scenarios without committing.
2. **Import/Export Player:** Export a single player as JSON, import into another league
3. **Batch Edit:** Select multiple players, change an attribute for all of them (e.g., +5 speed to all RBs)
4. **League Reset:** Reset the league to a specific season while keeping custom rosters
5. **Custom Events:** Trigger an injury, retirement, holdout, or trade demand for any player

---

## UI Architecture

### God Mode Activation Flow

```
User opens /settings
  → Scrolls to "God Mode" section
  → Flips toggle ON
  → Confirmation dialog appears
  → User confirms
  → godMode = true, godModeInPast = true saved to league DB
  → Gold "⚡ God Mode Active" banner appears on all pages
  → New controls unlock across the app
```

### Where God Mode Controls Appear

| Page | New Controls (God Mode ON) |
|------|---------------------------|
| Settings | God Mode toggle + expanded financial controls |
| Player Profile Modal | "Edit Player" button |
| Roster | "+ Create Player" button, "Edit" on each row |
| Trade Center | "Force Trade" button, AI-to-AI trade forcing |
| Schedule | "Set Outcome" on upcoming games |
| Draft | Draft control panel (pick override, lottery rig) |
| Free Agency | Sign-to-any-team, salary override, force sign |
| Standings / Playoffs | Seed manipulation, force playoff entry |
| Awards / History | Override winners, edit records, HoF management |
| Sidebar | New "Commissioner" panel for time/phase control |

### Visual Treatment

- All God Mode buttons should be **gold/yellow colored** with a ⚡ icon to distinguish them from normal UI
- The persistent banner uses the same color scheme
- God Mode controls should feel powerful but clearly labeled — users should never accidentally force a trade thinking they're proposing one

---

## Implementation Priority

Build in this order, shipping each piece incrementally:

| Phase | Features | Effort | Value |
|-------|----------|--------|-------|
| **Phase 1** | God Mode toggle + Player Editor + Position Change | 2-3 weeks | Highest — the #1 request |
| **Phase 2** | Force Trade + Financial overrides | 1-2 weeks | High — lets users reshape league |
| **Phase 3** | Create Player + Set Game Outcomes | 1-2 weeks | High — sandbox essentials |
| **Phase 4** | Draft manipulation + FA controls | 1-2 weeks | Medium — offseason power tools |
| **Phase 5** | Edit Team + Award overrides | 1 week | Medium — commissioner tools |
| **Phase 6** | Time/Phase control + Rewind | 2-3 weeks | Medium — requires auto-save system |
| **Phase 7** | Scenario tools (What-If, Batch Edit, Custom Events) | 2-3 weeks | Lower — power user features |

**Total estimate:** 10-16 weeks for full implementation. Phase 1-3 (the core) can ship in 4-7 weeks and covers 80% of what users are asking for.

---

## Technical Considerations

### Data Persistence
- All God Mode edits write directly to IndexedDB (the same store the game engine uses)
- Changes should trigger a re-render of any affected UI components
- The league export (JSON) should include all God Mode modifications — so importing a league file preserves custom edits

### Undo/Redo
- Implement a simple undo stack for God Mode actions (last 50 actions)
- Each action is stored as a diff: `{ type: "editPlayer", playerId: 123, before: {...}, after: {...} }`
- Ctrl+Z / Cmd+Z to undo when on a God Mode edit screen

### Game Sim Integration
- Forced game outcomes need to integrate with the play-by-play engine — the simplest approach is to run the sim normally but check for outcome overrides before finalizing
- Player edits mid-season should take effect for the next game (not retroactively change stats)

### Achievement System
- Add a `godModeInPast` flag to the league
- All achievement checks should early-return `false` if `godModeInPast === true`
- Display "(God Mode was used)" on the Achievements section of the dashboard when applicable

### Worker Console Compatibility
- Power users currently use the worker console (browser dev tools) to make edits. God Mode should provide a proper UI for the most common console operations
- Consider exposing a "Run Script" text box in God Mode settings for advanced users who want to execute custom JS against the league database

---

## Relationship to Basketball GM

Basketball GM (BBGM) already has a God Mode implementation. The FBGM/BS Football version should follow the same patterns where applicable but extend them for football-specific features:

- BBGM has player editor, force trade, create player — port these concepts
- Football adds: depth chart manipulation, position changes with eligibility rules, coaching overrides, draft lottery rigging (BS Mode specific), game outcome forcing (football's weekly schedule makes this more natural than basketball's 82-game season)

---

*Document compiled: April 3, 2026*
*Companion document: BS-Football_Claude_Code_Build_Instructions.md (covers non-God-Mode improvements)*
