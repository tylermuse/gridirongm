# BS-Football (formerly Gridiron GM) — Community Feedback & Key Recommendations

**Source:** Basketball GM and ZenGM Discord Server (~12,500 members)
**Channels reviewed:** #football-gm-discussion, #feature-requests, #bug-reports, #game-updates, #announcements
**Date compiled:** April 3, 2026

---

## Executive Summary

After a thorough review of every relevant channel and thread in the Discord server, the community feedback clusters around **7 major themes**, ranked below by how frequently and passionately users raise them. The single loudest signal is that the game simulation engine needs tuning — specifically around offensive/defensive line impact, QB valuation, and stat realism. The second biggest area is feature depth: users want coaching systems, more defensive stats, and NFL-accurate offseason structure.

---

## 1. Offensive & Defensive Line Impact Is Broken (CRITICAL — #1 Issue)

**Evidence:** 83-comment bug report thread titled "Offensive and Defensive Lines no longer matter," plus extensive discussion in #football-gm-discussion. Mixed reactions (thumbs down + crying emojis) on the OL stats update in #game-updates.

**What users are saying:**
- After the BWR (Block Win Rate) update, OL/DL impact was tuned down so much that the positions feel irrelevant to game outcomes
- PBW/RBW per-game performance no longer matters — only correlates with overall ability, which users find unsatisfying
- The developer (dumbmatter) acknowledged this is "unfortunate and hopefully will be fixed in the future" but said individual game OL stats were "causing too many problems with game sim"
- BS Football Commish (gridirongm) noted that in their own version, they tied OL impact to team-level rushing/passing efficiency rather than individual play-by-play stats, which felt more realistic

**Recommendation:** Find a middle ground where OL/DL ratings meaningfully affect team performance (rushing yards, sack rates, QB pressure) without requiring individual play-by-play tracking. The current state where elite OL makes no difference is the community's top frustration.

---

## 2. QB Valuation & Award Logic Needs a Major Overhaul

**Evidence:** Multiple threads and discussions across channels, with specific examples and screenshots.

**What users are saying:**
- "QBs literally can't win MVP" — users showed a QB going 15-2 with 4,286 yards, 39 TDs, 6 INT losing MVP to an RB with 1,492 yards and 16 TDs
- QB Approximate Value (AV) is too low — "Even my 80+ overall QBs can't even break 17 AV on a season"
- Award race bugs — wrong players winning positional awards (e.g., "How did Will Campbell win Protector of the Year?")
- RBs leading the league in rushing yards don't make All-Pro or Pro Bowl — rushing yard leaders getting overlooked in awards

**Recommendation:** Rebalance the MVP/award formula to properly weight QB contributions (wins, passing TDs, yards, efficiency). QBs should be the most frequent MVP winners, reflecting real NFL patterns. Also review All-Pro/Pro Bowl selection logic for RBs and other positions.

---

## 3. Coaching System (Most Requested Feature)

**Evidence:** "Adding Coaching Staff" — 13 upvotes, 11 comments (highest-voted feature request). "Coaching Tendencies (FBGM)" — 6 upvotes. Extensive discussion in #football-gm-discussion about coaching personality modeling.

**What users are saying:**
- Want a full coaching staff market: HC, OC, DC, Special Teams Coach, Health Staff
- Want coaching tendencies/personality: aggressiveness, 4th-down decision-making, QB development philosophy, draft tendencies
- Users specifically reference wanting a "Dan Campbell" style coach who goes for it on every 4th down vs. a conservative approach
- BS Football Commish discussed the design challenge: "Do you give coaches an 'aggression' rating and just let chaos happen? Or tie it to game state — score differential, time remaining, field position?"

**Recommendation:** Implement a coaching system with at minimum: (a) hireable coaches with ratings affecting team performance, and (b) coaching tendencies that influence game-day decisions (4th down aggressiveness, run/pass balance, timeout usage). This is the community's most-wanted new feature by a wide margin.

---

## 4. Offseason Structure: Free Agency Before the Draft

**Evidence:** "FBGM Draft Should be after Free Agency" — 10 upvotes. "Free Agency before draft FBGM" — 4 upvotes (separate post). Discussed in #football-gm-discussion as well.

**What users are saying:**
- In the real NFL, free agency occurs before the draft — the current game order is backwards
- This affects draft strategy since teams can't address needs through free agency first
- Related: free agent salary logic appears broken — "all the free agents are only asking for minimum contracts" even when teams have $50M+ in cap space
- Older players demanding unrealistic contract lengths (e.g., Aaron Rodgers asking for a 5-year deal)

**Recommendation:** Reorder the offseason to match the real NFL: Free Agency → Draft. Also fix the free agent salary calculation so players demand market-appropriate contracts, and add age-based contract length logic.

---

## 5. More & Better Stats (Especially Defensive)

**Evidence:** "Day 1 of asking for Cornerback/Defensive Stats" — 10 upvotes, 13 comments. "Day 1 of asking for DB stats" — 7 upvotes, 7 comments. "More FBGM Stats!!!" — 5 upvotes. "Show Incompleted Pass/yds in Game Simulation" — 8 upvotes. "First downs stats" — multiple comments. "Oline Stats Pls!!" — 4 upvotes.

**What users are saying:**
- Defensive back stats are the most-requested stat addition: targets, catches allowed, yards allowed, TDs allowed
- Want first down stats and 3rd/4th down efficiency
- Want snap counts and snaps by position
- Want incomplete passes to show intended yardage in game sim for immersion
- Want OL grades/stats displayed more prominently
- Sack slider reportedly doesn't work — "players still have a high amount of sacks even when the slider is at 0"

**Recommendation:** Prioritize adding DB coverage stats (targets, completions allowed, yards allowed, TDs allowed). Secondary priority: first down tracking, down-and-distance efficiency, and snap counts. Fix the sack rate slider.

---

## 6. Game Simulation Realism Tuning

**Evidence:** Spread across dozens of messages in #football-gm-discussion and #bug-reports.

**What users are saying:**
- **Passing yards too high** — multiple 5,000+ yard passers in the same season; suggestion to "slightly lower the passing yards"
- **Completion percentage declining unrealistically** — top QBs dropping from 66-70% to 60-63% after a few seasons
- **Low-OVR QBs having outlier games** — "my QB just threw 11 TDs in one game... he's a 46 OVR"
- **CPU clock management is bad** — losing team taking timeouts after scores in playoff games; described as "pretty bad"
- **Timeout logic makes no sense** — identified as a specific bug
- **Turnovers may be too frequent** — "3 turnovers within 10 seconds"
- **Player stat regression too aggressive** — "after the 2022 season, literally everything ended up depleting like crazy"

**Recommendation:** Tune the simulation engine to: cap outlier performances from low-rated players, bring passing yard totals closer to NFL averages, fix completion percentage decay curves, and overhaul CPU clock/timeout management logic. These are immersion-breaking issues.

---

## 7. AI Team Management & Trade Logic

**Evidence:** Multiple discussions in #football-gm-discussion and #feature-requests.

**What users are saying:**
- **CPU draft logic needs work** — players mocked for top 10 going at pick 35; draft board not matching expected value
- **AI roster construction is unrealistic** — "not every team follows the requirements of 3 QBs, 3 TEs, etc. on normal difficulty"
- **CPU plays WRs as RBs** — community member noted they keep WR speed ratings artificially low specifically "to prevent them from being played as RBs on the depth chart, as the CPU so often does in FBGM"
- **Trade value logic overvalues veterans** — "I was offered 2 firsts for a 28-year-old safety. Would never happen"
- **Practice Squad/IR missing** — 7 upvotes, 3 comments — want practice squad and IR designation to manage roster spots realistically

**Recommendation:** Fix AI depth chart logic so it doesn't play WRs at RB. Improve trade value curves to devalue older players and increase draft pick value. Add Practice Squad and IR roster designations. Improve CPU draft board to better reflect prospect rankings.

---

## Additional Notable Requests (Lower Priority but Recurring)

| Request | Upvotes | Notes |
|---------|---------|-------|
| Customize/rename awards | 8 | Custom trophy names |
| Draft Prospect Average Skill Modifier | 9 | Control average draft class quality |
| Game start times (1 PM, 4 PM, SNF, MNF) | 3 | Immersion/flavor feature |
| Contract restructuring | — | Developer declined ("don't want to make things too complex") |
| Team rivalries system | 2 | 2-3 rivalries per team |
| Jersey color customization | 1 | Decouple jersey colors from team color box |
| Protected draft picks in trades | 4 | Lottery/top-5 protections |
| College league features | — | Conference games, tournament, polls |
| Position change without God Mode | 6+ | Multiple requests across channels |
| Keyboard shortcut "Play One Day" removed | — | Regression from recent update |

---

## What's Working Well (Positive Feedback)

Users are genuinely enthusiastic about the game. Notable praise:
- The recent award formula update was well-received (24+ fire emojis)
- RBW/PBW tracking for TE and RB was very popular (15 thumbs up, 21 fire, 8 hearts)
- The trade/FA mood fix was celebrated (26 fire emojis)
- The scouting inaccuracy mechanic was praised as "actually a pretty realistic mechanic"
- Active roster file community (bs-football.com/rosters) with 1,300+ contract corrections
- Multiple users expressing long-term love for the game: "discovered your game sophomore year, loved it ever since"

---

## Recommended Priority Order

1. **Fix OL/DL impact on game outcomes** (critical — biggest complaint)
2. **Rebalance QB MVP/award formulas** (high visibility, easy win)
3. **Reorder offseason: FA before Draft** (high demand, structural fix)
4. **Add defensive player stats (DB coverage stats)** (most-requested stat feature)
5. **Implement coaching system** (most-requested new feature overall)
6. **Tune game sim realism** (passing yards, completion %, clock management)
7. **Fix AI roster management** (depth chart, trade logic, draft board)
8. **Add Practice Squad/IR** (popular quality-of-life request)
