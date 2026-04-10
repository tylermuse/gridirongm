# BS Football GM - Claude Code Implementation Spec
**Date:** April 9, 2026

**Stack:** Next.js 16 / React 19 / TypeScript / Zustand / Supabase
**Core Store:** src/lib/engine/store.ts (368KB Zustand store)
**Sim Engine:** src/lib/engine/simulate.ts + playByPlay.ts
**Coaching:** src/lib/engine/coaching.ts
**AI/Commentary:** src/lib/engine/aiSpotlight.ts + debate.ts + recap.ts
**Field Viz:** src/lib/game/fieldState.ts + GameFieldCanvas.tsx
**Scope:** 3 features + 4 bug fixes

---

## Feature 1: Fix Playing Time Complaints for Starters

### Problem
Players who are listed as starters in the depth chart are receiving playing time complaints and refusing to re-sign. Example: a 4th offensive lineman who IS a starter gets angry about not getting enough playing time. This breaks contract negotiations and makes the game feel unfair.

### User Reports
- tofftanaut: "I'm a bit confused why players who r starters will be angry at me for not giving them playing time when they r literally a starter. Like my 4th olinemen will never resign because he doesn't get enough playing time when he does cos he is a starter"
- Milkytoad: "Most of my complaints are playing time / underpaid. An option to be able to offer new contracts would help with this"
- BS Football Commish confirmed: "You are right this needs to be fixed"

### Relevant Files
| File | Role |
|------|------|
| src/lib/engine/store.ts | Zustand store - mood calculation, depth chart management, contract logic |
| src/types/index.ts (lines 216-221) | Player interface - mood property (0-100 scale) |
| src/lib/engine/develop.ts | Player development - playing time affects progression |
| src/lib/engine/simulate.ts | Game sim - stat accumulation determines playing time credit |

### Implementation Steps

**Step 1: Find the mood/playing time calculation**
Search store.ts for where player mood is calculated. Look for references to depth chart position, playing time satisfaction, or mood adjustments. The mood property is 0-100 and factors in: team winning/losing, playing time, contract satisfaction, team location.

**Step 2: Fix the playing time satisfaction logic**
The bug is likely in how "playing time" is determined. The system should check whether a player is in the starting lineup (top of the depth chart for their position) and grant full playing time satisfaction to all starters. Current logic may be checking snap counts, stat accumulation, or some other metric that doesn't properly account for positional starters (especially OL who don't accumulate flashy stats).

Proposed fix:
```ts
// For each player, check if they are a starter at their position
const depthChart = team.depthChart[player.position];
const isStarter = depthChart && depthChart.indexOf(player.id) === 0;
// OL has 5 starters, so check top 5 for OL positions
const starterSlots = ['LT','LG','C','RG','RT'].includes(pos) ? 5 :
  ['WR'].includes(pos) ? 3 : ['CB'].includes(pos) ? 2 : 1;
const isStarter = depthChart.indexOf(player.id) < starterSlots;
if (isStarter) { playingTimeSatisfaction = 100; }
```

**Step 3: Handle backup and rotational player expectations**
Backups should have lower playing time expectations. A 2nd string QB shouldn't be mad about playing time. Scale expectations by depth chart position:
- Starter (depth 1): expects 100% playing time satisfaction
- Backup (depth 2): expects 50% playing time satisfaction
- 3rd string+ (depth 3+): expects 25% playing time satisfaction
- Practice squad / deep bench: no playing time expectation

**Step 4: Test**
- Sim a full season with a team. No starter should have playing time complaints.
- Verify OL starters (all 5) are properly recognized as starters.
- Verify backups have lower mood impact from playing time.
- Verify that mood still drops for non-playing-time reasons (losing, underpaid, etc.).

---

## Feature 2: Team Switching

### Problem
Users can only play as the team they selected at league creation. There is no way to switch teams mid-save. Multiple users want this for variety and for playing with friends/family.

### User Reports
- BmoreOriole: "add ability to switch teams"
- Camare: "can you add it to where we can tap a team name to play as many teams and we can switch teams by pressing an arrow like in football gm just in case you wanna play with family and friends?"

### Relevant Files
| File | Role |
|------|------|
| src/lib/engine/store.ts | Zustand store - userTeamId state, newLeague() function |
| src/app/team/[id]/page.tsx | Team detail page - good place for switch button |
| src/app/rosters/page.tsx | All teams roster view - alternative placement |
| src/types/index.ts | Team interface definition |

### Implementation Steps

**Step 1: Add switchTeam action to the Zustand store**
In store.ts, add a new action that changes the userTeamId. This is the core of the feature since the entire app already reads from userTeamId to determine what team the user controls.

```ts
switchTeam: (newTeamId: string) => {
  set({ userTeamId: newTeamId });
  // Persist to IndexedDB/Supabase if needed
}
```

**Step 2: Add UI for team switching**
Two options (implement both):

Option A - Team page button: On the team detail page (src/app/team/[id]/page.tsx), add a "Switch to this Team" button that appears when viewing any team that is NOT your current team. When clicked, call switchTeam(teamId) and redirect to the dashboard.

Option B - Settings/menu: Add a "Switch Team" option in the game settings or main navigation. Show a grid of all 32 team logos. Clicking one calls switchTeam(teamId). This is the more discoverable option.

**Step 3: Handle edge cases**
- If mid-season, switching should work immediately. The user takes over the new team in its current state (record, roster, cap, etc.).
- The previous team becomes AI-controlled again.
- Any pending user actions (unsigned draft picks, pending trades) on the old team should be auto-resolved or cancelled.
- Notifications/news feed should update to reflect the new team perspective.

**Step 4: Persist the switch**
Make sure the team switch persists across page reloads and sessions. Check if userTeamId is stored in IndexedDB via Dexie or in Supabase, and update accordingly.

**Step 5: Test**
- Switch teams mid-season. Verify the dashboard shows the new team's data.
- Switch back to the original team. Verify nothing is lost.
- Sim a game after switching. Verify user controls the correct team.
- Verify draft, free agency, and trade flows work after switching.

---

## Feature 3: More Coach Options When Hiring

### Problem
When replacing a coach, the user only gets 3 candidates to choose from. Users want more variety and choice.

### User Reports
- TimNation: "Also when replacing coachs, maybe have more choices, I only had 3"

### Relevant Files
| File | Role |
|------|------|
| src/lib/engine/coaching.ts | Coach generation (generateCoach()), hiring logic, coach attributes |
| src/lib/engine/store.ts | replaceCoach() action in Zustand store |
| src/app/staff/page.tsx | Coaching staff management UI |
| src/app/coach/[id]/page.tsx | Individual coach detail page |

### Implementation Steps

**Step 1: Find where candidate count is set**
In coaching.ts or store.ts, find where coach candidates are generated for hiring. There is likely a loop or array that generates exactly 3 coaches via generateCoach(). Change this number to 6.

```ts
// Find something like:
const candidates = Array.from({ length: 3 }, () => generateCoach(...));
// Change to:
const candidates = Array.from({ length: 6 }, () => generateCoach(...));
```

**Step 2: Ensure variety in generated candidates**
With more candidates, ensure the generation produces meaningful variety:
- Mix of OVR ratings (don't generate 6 coaches all rated 60-65). Spread them: 1-2 elite (75-89), 2-3 average (60-74), 1-2 budget (45-59).
- Mix of scheme types (spread, west_coast, power_run, air_raid, etc.). Avoid duplicates when possible.
- Mix of specialties (QB Development, Play Design, Pass Rush Schemes, etc.).
- Mix of personalities (fiery, cerebral, innovator, etc.).

**Step 3: Update the hiring UI**
In staff/page.tsx, the coach selection UI currently shows 3 candidates. Update the layout to accommodate 6. If it uses a grid, switch to a 2x3 or 3x2 grid. If it uses a list, it should scroll naturally. Each candidate card should show: name, OVR, scheme, specialty, personality, and salary demand.

**Step 4: Test**
- Fire a coach and verify 6 candidates appear.
- Check that candidates have varied ratings, schemes, and specialties.
- Hire a coach from the expanded list and verify they are properly assigned.
- Verify the UI is not cramped or broken with 6 cards.

---

## Bug 1: AI Commentary Not Working / Slow to Load

**Reported by:** BmoreOriole
**Symptom:** AI Commentary takes forever to load and sometimes doesn't work at all.
**Root cause:** Tyler confirmed this is an LLM API cost issue. Credits are being consumed too fast.

### Relevant Files
- src/lib/engine/aiSpotlight.ts - AI spotlight generation (calls Anthropic Claude API)
- src/lib/engine/debate.ts (108KB) - Debate/discussion generation (likely the biggest credit consumer)
- src/lib/engine/recap.ts - Weekly recap generation
- src/app/api/spotlight/route.ts - API route for spotlight calls
- src/app/api/spotlight-audio/route.ts - API route for audio generation

### Implementation
1. **Add a loading spinner and timeout:** Show a spinner while AI commentary loads. If it takes more than 10 seconds, show a fallback message like "Commentary unavailable" instead of hanging.
2. **Cache commentary results:** Store generated commentary in IndexedDB keyed by game ID + week. If the user revisits a game recap, serve the cached version instead of making a new API call.
3. **Add a rate limiter:** Limit AI commentary to 1 call per game simulation, not per page view. Debounce or dedup requests in the API routes.
4. **Consider Haiku for non-critical commentary:** debate.ts at 108KB is likely generating complex multi-speaker exchanges. For routine weekly recaps, use Claude Haiku instead of Sonnet/Opus to reduce cost. Reserve the larger model for playoff games or milestone moments.

---

## Bug 2: Podcast Inaccuracies and Repetitiveness

**Reported by:** TimNation
**Symptoms:** (1) Podcast gets repetitive after 1-2 listens. (2) Podcast says user has 2 first round picks when they only have 1.

### Relevant Files
- src/lib/engine/debate.ts - Main debate/podcast script generation
- generate_podcast.py - Python TTS generation via ElevenLabs
- src/lib/engine/recap.ts - Recap narrative generation

### Fix 2a: Draft pick count accuracy
Search debate.ts and recap.ts for where draft pick counts are referenced. The podcast likely pulls draft pick data from the team object. Verify it reads team.draftPicks (the current actual picks array) rather than a default value or cached count.

```ts
// Ensure this reads the ACTUAL picks, not a hardcoded/assumed count
const firstRoundPicks = team.draftPicks.filter(p => p.round === 1);
const pickCount = firstRoundPicks.length;
```

Check if there's a trade that moved a pick away but the podcast script still references the original count. The data source for the podcast prompt must query the live state.

### Fix 2b: Reduce repetitiveness
In debate.ts, look at the system prompt and templates used for podcast generation. Add more variety by:
- Adding more diverse prompt templates. Rotate between 5-10 different commentary styles/angles per week.
- Including recent transactions, injuries, or milestones as dynamic context so each podcast has unique talking points.
- Varying the speaker personalities between episodes. Don't always lead with the same hot take format.
- Adding a "previously discussed" tracker so the AI avoids repeating the same narratives week to week.

---

## Bug 3: Gamecast Ball Animation Mismatch

**Reported by:** TimNation
**Symptom:** A 10 yard run on the play-by-play looked like an 80 yard run on the field visualization.

### Relevant Files
- src/lib/game/fieldState.ts - Game field state (ballYard, scrimmageYard tracking)
- src/components/game/GameFieldCanvas.tsx - Canvas rendering of the field
- src/components/game/AnimatedField.tsx - Animation logic
- src/lib/engine/playByPlay.ts - Play-by-play event generation with yard values

### Implementation
1. **Check ballYard calculation:** fieldState.ts tracks ballYard on a 0-100 scale (0 = away endzone, 100 = home endzone). When a play results in a 10-yard gain, verify the ballYard is incremented by exactly 10, not by a larger value. Look for cases where the ball position is being set absolutely rather than relatively.
2. **Check possession direction:** If the home team is driving left-to-right and the away team right-to-left, a 10-yard gain should move the ball +10 for home or -10 for away. A sign error here could cause the ball to jump to the wrong side of the field.
3. **Check animation interpolation:** In AnimatedField.tsx or GameFieldCanvas.tsx, if the ball animates between positions, verify the start position is the previous scrimmage line and the end position is scrimmage + yards gained. An incorrect start position would make the animation cover the wrong distance.
4. **Test:** Sim a game and watch the gamecast. Compare the play-by-play text ("10 yard run to the 35") against the ball position on the field. The ball should be at the 35 yard line after the play.

---

## Bug 4: Scoring Appears Too High

**Reported by:** Milkytoad (with screenshots)
**Symptom:** Game scores seem unrealistically high compared to real NFL averages (NFL average is about 21-23 points per team per game).

### Relevant Files
- src/lib/engine/simulate.ts - Core game simulation, scoring logic, teamPower() calculation
- src/lib/engine/playByPlay.ts - Individual play generation, touchdown/scoring probabilities

### Implementation
1. **Audit scoring probabilities in playByPlay.ts:** Look for touchdown probability per play, field goal attempt rates, and big play frequency. Compare against NFL averages: NFL teams score ~3.5 TDs per game, ~1.5 FGs per game, and average ~65 plays per game. If your sim generates more scoring plays per game than this, reduce the TD probability or increase incompletion/stop rates.
2. **Check defensive effectiveness:** In simulate.ts, teamPower() computes offensive and defensive ratings. Verify that defense properly reduces opponent scoring. If the defensive modifier is too weak, offense will dominate and scores will be inflated.
3. **Check turnover rates:** NFL teams average ~1.5 turnovers per game. If your sim has fewer turnovers, teams get more possessions and more scoring opportunities. Verify interception and fumble rates match NFL averages.
4. **Add a scoring sanity check:** After simulating a game, check if the total score exceeds a threshold (say 80 combined points). If so, log it for review. Run 100 simulated games and check the average score per team. It should be 20-24 points.
5. **Consider Gaussian variance:** simulate.ts uses Gaussian distribution for variance. Check the standard deviation. If it's too high, you'll get wild score swings. NFL scoring standard deviation is about 10 points per team.

---

## Recommended Build Order

| # | Item | Type | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Fix playing time complaints for starters | Bug Fix | Small | Critical |
| 2 | AI Commentary timeout + caching | Bug Fix | Small | High |
| 3 | Podcast draft pick count accuracy | Bug Fix | Small | Medium |
| 4 | More coach hiring options (3 to 6) | Feature | Small | Medium |
| 5 | Gamecast ball animation fix | Bug Fix | Medium | Medium |
| 6 | Team switching | Feature | Medium | High |
| 7 | Scoring balance audit + tuning | Bug Fix | Large | High |
