# BS Football GM — Implementation Instructions (April 8, 2026)

Work through these in order. Bugs first, then features. Each item includes what to fix, where to look, and acceptance criteria.

---

## BUG FIXES (do these first)

### BUG 1: Draft pick labels all show "Pick #1"

**Problem:** When trading during the draft, every pick displays as "2026 Round 1, Pick #1" regardless of actual pick number. User tries to move down from pick #6 and all options say Pick #1.

**Where to look:** Draft trade UI component. The pick label is likely hardcoded or the actual pick number isn't being passed to the display component.

**Fix:** Ensure the trade modal / draft trade interface passes and renders the real pick number (e.g., "2026 Round 1, Pick #6", "2026 Round 2, Pick #14") for every pick shown.

**Acceptance criteria:**
- When trading during a draft, each pick displays its correct round and pick number
- This applies to both the user's picks and the picks being offered by AI teams
- Test by starting a draft sim and initiating a trade from multiple pick positions

---

### BUG 2: Rushing QBs don't run the ball

**Problem:** QBs with a rushing archetype are not generating rushing stats in the simulation. Makes the rushing QB archetype meaningless.

**Where to look:** Sim engine play-calling logic. Check how QB archetype affects play selection — rushing QBs should have designed runs and scrambles factored into their stat output.

**Fix:** When a QB has a rushing archetype (or high speed/agility ratings), the sim should:
- Include designed QB runs in the play mix
- Generate scramble attempts on passing plays
- Produce rushing yards, rushing TDs, and rushing attempts in their stat line

**Acceptance criteria:**
- A rushing QB (e.g., Lamar Jackson type) should average 5-8 rushing attempts per game
- Rushing QBs should accumulate 500-1000+ rushing yards per season depending on rating
- Pocket passers should still occasionally scramble but at much lower rates (1-3 attempts/game)

---

### BUG 3: Client-side crash ("Something went wrong")

**Problem:** User (Camare) hit a client-side exception: "Application error: a client-side exception has occurred while loading football.com." Screenshot shows a white error page with a "Try Again" button.

**Where to look:** Check Vercel/Next.js error logs around 3:59 PM ET on April 8. Look for unhandled exceptions. This might be a null reference in a specific game state.

**Fix:** Identify the component throwing the error from logs, add proper null checks / error boundaries, and handle the edge case gracefully.

**Acceptance criteria:**
- The specific crash scenario no longer produces a white error screen
- Error boundaries catch component-level failures and show a recovery UI instead of a full-page crash

---

## HIGH PRIORITY FEATURES

### FEATURE 1: Add missing career stats to player bios

**Problem:** OL career stats are completely missing from player bios. TFL (tackles for loss) is also missing from defensive player career stats.

**What to build:**
- Add OL stats to bio: games played, starts, sacks allowed, penalties (if tracked)
- Add TFL to defensive player bio stats
- Make sure all position groups have appropriate career stat displays

**Acceptance criteria:**
- OL player bios show career stats relevant to their position
- Defensive player bios include TFL alongside existing stats (tackles, sacks, INTs, etc.)
- No position group has a blank or missing career stats section

---

### FEATURE 2: Save management (delete and rename)

**Problem:** Users cannot delete or rename their saved games.

**What to build:**
- Add a "Rename" option on each save slot (inline edit or modal)
- Add a "Delete" option with a confirmation dialog ("Are you sure you want to delete this save? This cannot be undone.")
- Both should be accessible from the save/load screen

**Acceptance criteria:**
- User can rename any save and the new name persists
- User can delete any save after confirming
- Deleting a save removes it from the save list permanently
- UI updates immediately after rename/delete without requiring page refresh

---

### FEATURE 3: Stat simulation tuning

**Problem:** Multiple users report stats feel unrealistic. Specifically:
- DL sack numbers are too high
- Any player regardless of rating can put up crazy numbers
- Player progression and regression feels too slow

**What to tune:**
1. **QB interceptions:** INTs are way too high across the board. Reduce base INT rate, especially for high-rated QBs. An elite QB should throw 8-14 INTs/season, not 20+. Factor in QB accuracy/decision-making ratings more heavily.
2. **DL sacks:** Reduce base sack rate for DL. Elite pass rushers should get 10-16 sacks/season, average DL should be 3-7. Currently too many DL are hitting unrealistic numbers.
3. **Rating-to-stat correlation:** Tighten the relationship between player OVR/attributes and output. A 65-rated WR should not be putting up 1200-yard seasons. Add more variance dampening for low-rated players and slight boosts for elite players.
4. **Progression/regression speed:** Review the yearly OVR change formula. Users feel players develop too slowly. Consider increasing the magnitude of development jumps for young players (21-25) and making regression more noticeable for players 30+.

**Acceptance criteria:**
- Elite QBs throw 8-14 INTs/season, average QBs throw 14-20, bad QBs throw 20+
- League-wide sack leader is typically 14-20 sacks, not 25+
- Top-rated players consistently outperform low-rated players in stats
- A 22-year-old with high potential can jump 3-5 OVR in a good development year
- Players 31+ show noticeable decline over 2-3 seasons

---

## MEDIUM PRIORITY (if time allows)

### FEATURE 4: AI trade frequency improvements

**Problem:** AI teams don't trade with each other enough, but users don't want nonsensical trades either.

**What to build:**
- Increase the frequency of AI-to-AI trades during the season and at the trade deadline
- Ensure trade logic validates that both sides get reasonable value (no lopsided deals)
- Consider adding a trade frequency setting (Low / Medium / High) in game settings

**Acceptance criteria:**
- AI teams make 5-15 trades per season across the league (realistic NFL-like volume)
- No trade is wildly lopsided (e.g., a 1st round pick for a 60-rated backup)
- Trade deadline generates a flurry of activity from contending teams

---

## LOW PRIORITY (backlog)

### BACKLOG: Position rank clarity in UI
The position group rankings page confuses some users who think "Rank 1" means overall #1 instead of #1 at their position. Add a label clarifying "Position Rank" vs "Overall Rank."

### BACKLOG: Records page (all-time, season, game)
Users want a records page showing all-time leaders, single-season records, and single-game records. Scope depends on what historical stat data is currently stored. Investigate data availability before committing.

### BACKLOG: Coach aging and retirement
Coaches should age, potentially get hired away by other teams, and eventually retire. Coaching profiles are currently being built out — layer lifecycle mechanics on top once profiles are stable.

### BACKLOG: Draft capital valuation review
Some users feel trade returns for players with expiring contracts are too generous. Gather more data before adjusting. Monitor but don't change yet.
