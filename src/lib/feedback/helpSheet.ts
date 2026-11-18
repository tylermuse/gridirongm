/**
 * The help sheet the instant-answer model is allowed to answer from
 * (see ./answer.ts). It rides whole in every prompt, so keep it short.
 *
 * RULES FOR EDITING
 * - Every line must be true of the shipped game, with labels quoted exactly as
 *   they appear on screen. A confident wrong answer is worse than no answer.
 * - When a page, button or rule changes, change the line here in the same PR.
 * - "Not in the game" lines matter as much as how-tos: they stop the model
 *   from inventing a feature.
 * - Leave out anything you are not sure of. The model returns no answer for
 *   what the sheet does not cover, and the developer answers it by hand.
 *
 * Last checked against the code: 2026-11-14 (award winners, create player, draft class and spectating lines added 2026-11-17 from player questions).
 */

const IN_SEASON = `
NAVIGATION
- The sidebar has: Dashboard, Standings, Playoffs, Stats, Rankings, Player Search, News, History (League); Roster, Staff, Finances (Team); Re-signing, Draft Preview, Draft, Draft Recap, Free Agency, Trades (Players); Settings (Other). At the bottom: "Feedback & questions", the account area, "Save/Load" and "New League".
- On a phone the sidebar is hidden: tap the three-line menu button at the top-left to open it. In the regular season the sim buttons sit in a bar at the bottom of the screen, and many labels are shortened ("Sim Wk", "To Deadline", "Live", "Depth", "Practice").
- "Trades" disappears from the sidebar after the trade deadline and during the playoffs. "Draft Recap" appears only after a draft. "Expansion" appears only in the offseason.

CUTTING / RELEASING PLAYERS
- To cut a player: open "Roster" in the sidebar, stay on the "Roster" tab, click "Actions ▾" at the right end of the player's row, then "Cut Player". The row then shows a red "Cut (save $XM, $YM dead)" button: click it to confirm, or "✕" to back out. On a phone the roster table scrolls sideways and "Actions ▾" is at the far right of the row.
- Or click the player's name to open his card and press "Release Player", then "Confirm Release?".
- A cut player goes straight to free agency. His remaining guaranteed money becomes dead cap. There is no undo.
- Practice squad players: Roster, "Practice Squad" tab, "Cut" on his row. No dead cap.
- Over 53 players: a red "✂️ Trim to 53" button appears at the top of the Roster page. It moves long-term injured players to IR, fills the practice squad with the lowest-rated eligible players, and releases only whoever is left over, after a confirm.

ROSTER LIMITS, PRACTICE SQUAD, IR
- The active roster limit is 53. Practice squad and IR players do not count toward it.
- You cannot sim the first week of a league while over 53: "Sim Week" is disabled and the top bar says "Roster N/53 · cut X to sim". Cut or demote players, or use "✂️ Trim to 53".
- Teams run by the AI start at 53. Your own team starts at 53 only when you start from the real current NFL season; with other starts it can be over 53 and you trim it yourself.
- Practice squad: Roster, "Practice Squad" tab. 16 slots, players rated 80 OVR or lower, salary does not count against the cap. "Demote to PS" there, or "Actions ▾" then "Demote to Practice Squad" on the Roster tab (shown only for eligible players). "Promote" brings a player back and needs an open spot on the 53.
- After each draft the "Post-Draft Cuts" page makes you "Demote to PS" or "Cut" until you are at the limit.
- The "Roster Composition" box on the Roster tab shows how many players you have at each position against a recommended range.

DEPTH CHART / WHO STARTS
- To change who starts: Roster, "Depth Chart" tab ("Depth" on phones). Drag a player's tile to a new spot in his position row, or use the small "▲" / "▼" buttons on the tile (the buttons are the way to do it on a phone). The first tile in a row is the "Starter".
- To bench your QB for the backup: in the "QB" row, move the backup up until he is the first tile, labelled "Starter". Do this before the game.
- OL, DL, LB and S are split into sub-rows (Tackles, Guards, Centers; Edge, Interior DL; Outside LB, Inside LB; Free Safety, Strong Safety). You can only reorder inside a sub-row.
- There is no auto depth chart button for the whole team. Each position has "↺ Reset" to restore its default order.
- Simming does not reorder your depth chart. But completing a trade rebuilds your whole chart by overall rating, and signing a free agent, promoting from the practice squad or activating a player from IR re-sorts that position. Re-check the chart after any of those.
- Injured players are skipped automatically in games, so the next healthy player at the position plays.

DURING A LIVE GAME
- You cannot substitute players by hand during a game. Not in the game: a mid-game substitution or bench button. The lineup comes from your depth chart. To change who plays (for example a QB who is throwing interceptions), reorder the depth chart on the Roster page before your next game.
- "🔄 Auto-subs" only changes what the "On the Field" display shows. It never swaps the QB.
- To watch your game instead of simming it: press the red "Watch Live" button in the top bar ("Live" on phones), then "🏈 Kick Off" on the pregame show.
- Live game controls: "▶ Play" / "⏸ Pause", "⏩ Skip Qtr", "⏭ End Game" (finishes the game now), and "Speed" of 0.5x, 1x, 2x, 5x or max.
- Calling plays: "🎯 Live Coach" in the controls (on by default in your own games). Before each of your offensive snaps you choose "Run", "Short Pass", "Deep Shot", "QB Scramble" or "Screen"; on 4th down "Field Goal", "Punt" or "Go For It"; after a touchdown "Extra Point" or "Go for 2"; on kickoffs "Regular Kickoff" or "Onside Kick". "Turn off" in that panel stops play calling, and "Auto-sim to End ⏭" sims the rest.
- Calling defense is off by default: with Live Coach on, turn on "🛡️ Call Defense" to pick "Blitz", "Stacked Box", "Two-High", "Man Press" or "Soft Zone" before opponent snaps.
- "📋 Game Plan" in the live game controls sets run/pass tendency, risk, red zone strategy, blitz rate, coverage and tempo.

SIMMING AND ADVANCING
- "Sim Week N" in the top bar sims every unplayed game that week, including yours. If you watched your game live first, it sims the rest.
- "Sim Season" sims to the end of the regular season and stops at the playoffs. Trade offers that arrive during it are rejected automatically.
- "Sim to Deadline" sims up to the last week trades are allowed.
- Not in the game: a button that sims only your own regular-season game (use "Watch Live" and then "⏭ End Game"), and a button that sims straight through the playoffs.
- Playoffs: "Sim Next Game", "Sim Round" and "Sim Remaining" in the top bar, plus "Watch Live" for your game. After the championship, "Advance to Re-signing →" starts the offseason.

INJURIES
- Roster, "Injuries" tab shows the injury report with weeks left. The Dashboard also has an "Injury Report" card.
- "Place on IR" appears for players with 4 or more weeks left. It frees his roster spot and takes his salary off your payroll. "Activate" needs him to have spent at least 3 weeks on IR and be within 2 weeks of healthy, and needs an open spot on the 53.
- A player with 3 or fewer weeks left can play hurt: "Play through ➜" under his name on the Roster tab. He plays at a lower rating with a chance of re-injury.

TRADES
- Open "Trades" in the sidebar. Tabs: "Incoming Offers", "Trading Block", "Propose Trade", "🔍 Trade Finder".
- To propose: "Propose Trade", pick a team under "Select Trade Partner", tick players and draft picks under "Your Offer" and "You Receive", then "Send Offer". The answer is immediate. "What makes this work?" fills in a package the other team would accept.
- Trading block: "Trading Block" tab, tick players or picks, choose what you want under "Seeking in Return", then "Ask for Proposals". Or Roster, "Actions ▾", "Add to Trade Block".
- AI teams send you offers too: a count appears on "Trades". Answer with "Accept Trade", "Counter" or "Reject".
- Draft picks can be traded (current season or later, unused).
- Trade deadline: set in Settings under "Trades" (default Week 12); trading stays open through the week after. After that, and during the playoffs, no trades until the offseason.
- A "📣 Trade request" badge on the Roster means the player has been unhappy for several weeks and wants out. There is no button to answer it: trade him or fix what is lowering his mood.

POSITIONS AND CONTRACTS
- Changing position: open your player's card. OL, DL, LB and S have a "Position:" row of buttons (OT / OG / C, EDGE / DT, MLB / OLB, FS / SS), plus "Auto" to undo a pin. The game picks left or right side for tackles and guards itself.
- Moving a lineman to a specific spot such as LT or RG: you cannot choose the exact spot. The closest thing is to pin him on his card's "Position:" row (for example pin a tackle to "OG" to make him a guard); the game then decides left or right.
- Not in the game: moving a player to a different position group (for example WR to CB) in normal play.
- Extend a contract: Roster, "Actions ▾", "Extend Contract" (or "Extend Contract" on the player's card). He needs at least 1 year left, and you get 3 extensions per season.
- Restructure: Roster, "Actions ▾", "Restructure Contract". Needs 2 or more years left; once per player per season.
- Franchise tag: only on the "Re-signing" page in the offseason, the "Tag ($XM)" button next to an expiring player. One tag per season, 1-year fully guaranteed deal.

RATINGS
- "Ovr" is a player's current overall rating; "Pot" is his ceiling. For players in their first two seasons potential shows as a label: Elite (90+), Above Average (80-89), Average (65-79), Below Average (50-64), Poor (under 50). From the third season it shows as a number.
- Ratings change in the offseason: young players grow toward their potential, players hold steady in their prime, then decline with age (running backs earliest, quarterbacks and kickers latest). Settings, "Player Development" has "Progression Rate" and "Regression Rate".
- "Fit" on the Roster is scheme fit with your coaches: "Great Fit" gives a small rating boost in games, "Poor Fit" a small penalty.
- "Mood" runs from Thrilled to Angry; hover it for the reason.
`;

const OFFSEASON_AND_ACCOUNT = `
OFFSEASON ORDER
- The order is: Regular Season, Playoffs, Re-signing, Free Agency, Draft, then the new season. Free agency comes before the draft.
- You move on with the top bar button: "Advance to Re-signing →" after the championship, "Advance to Free Agency →" (or "Skip to Free Agency"), "End Free Agency Early" or "Advance to Draft →" on day 30, and "Start New Season →" after the last draft pick.

RE-SIGNING
- In the Re-signing phase, open "Re-signing" in the sidebar. Each expiring player has "Extend" (negotiate), "Tag ($XM)" and "Let Walk". "Re-sign All" signs everyone at their asking price. Anyone left undecided when you advance becomes a free agent.
- A player marked as refusing to re-sign can only be tagged or let go.

FREE AGENCY
- To sign a free agent: open "Free Agency", click "Negotiate" on a player, set salary and years, then "Make Offer". If he accepts he signs on the spot. There is no bidding round against other teams and no waiting period.
- Offseason free agency lasts 30 days. Each signing you make uses a day; "Skip Day →" and "Skip Week ⏩" pass time without signing. AI teams sign players every day, and asking prices fall as the days go by, so waiting is cheaper but riskier.
- Why an offer fails: it is too far below his asking price (he may counter a few times, then walk away), you do not have the cap space, or he shows a red "Refuses" badge and will not talk to your team (some of those soften later in free agency).
- If you are over the salary cap you can only sign players at the league minimum.
- You can also sign free agents during the regular season on the same page (titled "Sign Free Agents"). The page is closed during the playoffs, re-signing and the draft.
- Intel Reports (offseason free agency): expand a player's row and click "Run Intel Report (1 pt)" to see his true asking price and who else is interested. Free accounts get 3 per free agency, Premium 9.
- Retired players: Free Agency page, "Retired Players" tab, "Bring Back". It is a 1-year minimum deal, limited to one player per season.

DRAFT
- Open "Draft" in the sidebar. When the header says "YOU'RE ON THE CLOCK", click "Draft" on a prospect's row. Seven rounds. There is no timer that picks for you.
- "Sim Pick" sims one pick, "Sim to My Pick" jumps to your next pick, and "Auto-Draft All" lets the AI finish the whole draft including your picks.
- Trading picks during the draft: "Trade Pick" in the on-the-clock header.
- Scouting: click "Scout" on a prospect to spend 1 scout point and unlock his full report. "Scout Pts" shows what you have left, and "Auto-scout" spends the rest. Free accounts get 10 points per draft, Premium 30.
- "Draft Preview" in the sidebar shows the upcoming class. It unlocks after the trade deadline.
- Editing or replacing the draft class: on the "Draft" page, "📥 Import Draft Class" loads your own class from a file, and "📤 Export Current Class" downloads the current one so you can edit it and import it back. With "God Mode" on you can also use "Edit Player" on any player's card.
- A drafted rookie is slotted into your depth chart by overall rating, so he starts right away if he is your best player at the position. Rookies get a 4-year contract.
- Not in the game: scouting tiers such as "pro-level scouting". There is one "Scout" action.

SALARY CAP AND FINANCES
- "Finances" in the sidebar shows the salary cap, your cap space and dead cap. A player's card shows the dead cap and savings before you release him.
- The cap cannot be turned off, but you can change it: Settings, "Finances", "Salary Cap" slider and "Cap Growth Rate". It applies to every team.

COACHES
- Open "Staff" in the sidebar. "Replace" on a coach shows candidates; picking one fires the old coach and hires the new one. Empty assistant slots have "Hire". There is no fire-only button.
- Firing a coach mid-contract costs a buyout of his remaining guaranteed money. Coach salaries and buyouts do not count against the salary cap.

SETTINGS
- "Settings" in the sidebar. League options save with "Save Changes".
- Creating a player: yes, with "God Mode". Turn on "God Mode" in Settings, then use "+ Create Player" at the top of the Roster page.
- "God Mode" (commissioner): adds "Edit Player" on player cards and "+ Create Player" on the Roster page, and can force trades. Turning it on permanently marks the league as modified and removes it from GM Rankings.
- "Switch Team" lets you take over a different team; the AI runs your old one.
- "Dark Mode" is under "Appearance".
- Not in the game: a difficulty setting, and sound or volume settings.

SAVES
- The game saves automatically in this browser. No save button is needed.
- "Save/Load" at the bottom of the sidebar has 5 save slots, each with "Save", "Load" and delete.
- Backup file: Settings, "Save Backup", "Export Save" downloads your current league as a file, and "Import Save" loads one (it replaces the league in this browser).
- Playing on another device: sign in, then turn on Settings, "Cloud Saves", "Sync saves to my account" (off by default). It syncs your current league, not the 5 slots. On the other device, sign in and the start screen offers to load the newer save.
- Clearing your browser data deletes local saves. Only an exported file or the cloud copy can bring a league back.
- New league: "New League" at the bottom of the sidebar, then "Confirm?". This wipes the current league, so save it to a slot first if you want to keep it.

STARTING A LEAGUE
- The start screen offers "Real 2026 NFL season" (real rosters and records, picking up at the current week) or "Fictional league" (made-up teams and players from Week 1), then you pick a team. "Spectator (no team)" lets you watch an all-AI league.
- Just watching (spectating): choose "Spectator (no team)" on the start screen when you start a league. A league you are already running as a GM cannot be switched to spectator, so start a new one with "New League".
- Historic rosters (1994, 1999 and 2007 seasons): go to bs-football.com/rosters and click "Play in BS Football →".
- Your own roster or league file: on the start screen open "Import League File" and upload a Football GM league file or paste its link.
- Expansion teams: "Expansion" appears in the sidebar during the offseason. It only works with "God Mode" turned on.

ACCOUNT AND PREMIUM
- You do not need an account to play. Sign in (Google, Discord, or email and password) for Premium, cloud saves and GM Rankings.
- Free includes the whole game. Premium removes ads and adds more scout points and intel reports, AI-written Spotlight and weekly recaps, Team Spotlight episodes, and open questions in the Booth. Current price and details are on the Pricing page.
- Subscribe with "⚡ Upgrade to Premium" in the sidebar or on the Pricing page. Manage or cancel under Settings, "Account", "Manage subscription".
- One Premium subscription covers both BS Football and BS Hoops.

OTHER PAGES
- Past award winners and champions: "History" in the sidebar, "Seasons" tab. Pick a season to see its champion, award winners, stat leaders and retired players. The "Records" tab has career and single-season records.
- "Rankings": "Power Rankings", "Award Race" and "GM Rankings" (an online leaderboard of signed-in players; set your name in Settings, "Display Name").
- "Stats": league leaders and team stats. "Player Search" finds any player. "News" has league news and the weekly recap.
- Team Spotlight is the show on the Dashboard where two hosts talk about your team. "The Booth" button at the bottom-right of in-game screens lets you ask them questions.
- Not in the game: a changelog or "what's new" page. Updates are announced in the Discord: https://discord.gg/RMtusS2GKW
`;

export const HELP_SHEET = `${IN_SEASON.trim()}\n\n${OFFSEASON_AND_ACCOUNT.trim()}`.trim();
