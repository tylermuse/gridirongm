/**
 * The help sheet BS Hoops' instant-answer model is allowed to answer from
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
 * - This is the Hoops sheet. BS Football has its own (src/lib/feedback at the
 *   repo root) and the two games differ, so never copy a line across unchecked.
 *
 * Last checked against the code: 2026-11-15.
 */

const IN_SEASON = `
NAVIGATION
- The sidebar has: Dashboard, Standings, Stats, Player Search, Rankings, All-Star Game, Playoffs, News, The Show, Buzz (League); Roster & Lineup, Re-sign (My Team, only when you run a team); Staff, Finances, Draft Board, Free Agency, Trade, Transactions (Front Office); Awards, History, Rosters (History). Below them: "Settings" and "Join the Community" (the Discord).
- At the bottom of the sidebar: "Feedback & questions", the account area ("Sign In", or your email with "⚡ Upgrade to Premium" and "Sign out"), and "↔ Switch / New League".
- "Draft Board" becomes "Draft" from "Enter Offseason" until the new season starts. "Draft Recap" and "Expansion" appear only in the offseason after the draft. "Trade" and "Free Agency" are always in the sidebar.
- On a phone the sidebar is hidden: tap the three-line menu button at the top-left to open it. The sim buttons sit in a bar at the bottom of the screen (for example "Sim Day" and "Sim Week"), and the rest are in the "Sim ▾" (or "More ▾") menu at the top. The top-bar "Watch Live" is hidden on phones: use "▶ Watch Live" on the Dashboard's next-game card.
- Your team page: click your team card at the top of the sidebar.

ROSTER LIMIT
- The roster limit is 15 players by default. It can be set from 13 to 17 in Settings, "League Rules", "Roster", "Max roster size".
- In the regular season being over the limit does not stop simming, but you cannot sign a free agent with a full roster ("Roster full — release to make room").
- In the offseason you must be at or under the limit to start the next season: the top bar shows "Trim Roster to 15" and you cut players in the "Finalize Roster" box on the "Re-sign" page.
- Not in the game: two-way contracts, a G League team, an injured list (IR) or inactive list, a minimum roster size, and an automatic trim button.

CUTTING / RELEASING PLAYERS
- To release a player: open "Roster & Lineup", click "Actions ▾" at the right end of his row ("⋯" on phones), then "Release". Or click his name to open his "Player Card" and press "Release Player".
- A release window with his name opens. If he has guaranteed money left you choose "Waive" (each remaining year stays on your cap as dead money in its own season) or "Waive & stretch" (the total is spread evenly over twice the remaining years plus one), then "Confirm release". With no guaranteed money left it is a clean release with no dead cap.
- Dead cap counts against the salary cap. The released player goes straight to free agency, where any team can sign him.
- Not in the game: a waiver wire or claim period, buyouts, contract restructures, and an undo for a release.

LINEUP AND ROTATION
- To set your starters: "Roster & Lineup", "Lineup" tab. Drag a player onto a starting slot, or use the "Start" / "Bench" button on his row, then press "Save Lineup". On a phone, tap a player, then tap a slot or another player to swap. Nothing changes until you press "Save Lineup".
- "Save Lineup" needs all five starting slots filled. Any player can start at any slot; starting someone out of position only shows a "⚠" warning.
- Bench order is your rotation: drag a bench player up onto another to move him up. The first five bench players get minutes; anyone after them is listed under "Out of rotation · projected DNP".
- "Auto-fill" builds the best lineup and bench order by rating (it still needs "Save Lineup" to keep it). If you never save a lineup, the game uses that default.
- The "Min" column is projected minutes from your lineup order. Not in the game: setting a player's minutes by hand. The closest thing is the "Rotation" option in the Game Plan ("Ride starters", "Balanced", "Develop bench").
- Injured and suspended players are left out of games automatically and the next player on your bench order fills in. You do not need to bench them yourself.
- After a trade, signing or the draft, check the "Lineup" tab and press "Save Lineup": a new player is added at the end of your bench and may not get minutes until you move him up.
- The "Depth" tab only shows depth by position. You cannot reorder players there.
- Changing a player's position is only possible with God Mode on (his card's "🛠️ God Mode" editor, "Position", "Apply changes").

GAME PLAN (COACHING STRATEGY)
- "📋 Game Plan" is the small button on the Dashboard's next-game card. It sets "Pace" (Slow / Balanced / Up-tempo), "Offense" (Inside / Balanced / Perimeter & 3), "Shot selection" (Safe / Balanced / Hero-ball), "Defense" (Man / Zone / Switch), "Pressure" (Pack paint / Balanced / Full-court) and "Rotation" (Ride starters / Balanced / Develop bench). Press "Save Game Plan". It applies to every game until you change it.
- Not in the game: choosing your head coach's offensive scheme.

DURING A LIVE GAME
- Subbing players in, calling timeouts or calling plays during a live game: not in the game. Players rotate automatically from your saved lineup and bench order, and strategy and minutes cannot be changed mid-game. To change who plays, edit the "Lineup" tab (and the "📋 Game Plan") before the next game.
- Why: games are simulated before you watch them. "Watch Live" sims the league up to your game and then replays it play by play, so the result is already decided.
- To watch your game: the red "Watch Live" button in the top bar, or "▶ Watch Live" on the Dashboard's next-game card (the one that works on phones). The Playoffs page has its own "▶ Watch Live". Your games open with a pregame show: press "🏀 Tip Off".
- Live controls: "⏸ Pause" / "▶ Play", speeds "1×", "2×", "5×" and "Max", "Next quarter ⏭", "Skip to final →" and "Exit". At halftime press "Start the 2nd half ▶". At the end, "Box Score →".
- A finished game's box score page has a "▶ Replay" button (with "Watch" in front of it on wider screens) that replays the game.

SIMMING AND ADVANCING
- Regular season buttons in the top bar: "Sim Day", "Sim Week" (7 days), "Sim to All-Star Break", "Sim to Trade Deadline" and "Sim Rest of Season" (stops at the end of the regular season).
- To play only your own next game: open your team page and press "Sim Next Game →" on the "Next Game" card. The All-Star Game is played automatically when you sim past the break.
- Once the regular season is over, press "Start Playoffs". The top 6 in each conference are in and seeds 7 to 10 play a play-in; every round after that is best-of-7. Playoff buttons: "Sim Day", "Sim Round" and "Sim All Playoffs".
- After the Finals, "Enter Offseason" (top bar, or "Enter Offseason →" on the Dashboard) starts the offseason.
- Injuries can leave you with fewer than five healthy players; the game then plays short-handed instead of stopping.

INJURIES
- Injury report: "Roster & Lineup", "Injuries" tab ("GTD" or "OUT" and days left). The Dashboard shows a "🏥 Availability Report" card when someone is hurt or suspended.
- Every injured player sits out, including "GTD" ones, unless you use "Play through →" on the Dashboard's "🏥 Availability Report" card. It is offered only for day-to-day and minor injuries, puts him back right away, and raises his re-injury risk for 10 days.
- Not in the game: an injured reserve list or a medical staff. Settings, "League Rules", "Health & Development" has "Injury frequency" and "Injury duration".

PLAYER CARD, EXTENSIONS, MOOD
- Click a player's name to open his "Player Card". For your own players it has "Add to Trading Block", "Extend Contract" and "Release Player"; for other teams' players, "Trade for this player". "Open full player page →" goes to his full page.
- Extensions: "Extend Contract" (also in the roster's "Actions ▾" menu) opens a negotiation. You can extend any of your players at any time, for 1 to 5 years, starting after his current deal. "Make offer" or "Offer what he wants ($X)". He counters a few times; a lowball can end talks, after which only "Pay his price" keeps him.
- "Mood" on the roster runs from Thrilled to Angry; click it for the reasons. Stars who are not starting and good players in their last contract year get unhappy.
- A "📣 Trade request" badge means the player has been unhappy for several days. There is no button to answer it: it clears once his mood improves (start him or extend him) or when you trade him.
- "Ovr" is current overall; "Pot" is his projected ceiling, with a word under it (Elite, High, Average, Low). The small ▲/▼ number next to Ovr is the change since last season. The coloured dot before a name is scheme fit with your head coach.
- Ratings change in the offseason: young players grow toward their potential, older players decline. Your "Player Development Coach" affects growth for players under 25.
`;

const TRADES_AND_OFFSEASON = `
TRADES
- Open "Trade" in the sidebar (the page is the "Trade Center"). Tabs: "Incoming Offers", "Trading Block", "Propose Trade", "Trade Finder" ("Offers", "Block", "Propose", "Finder" on phones).
- To propose: "Propose Trade", choose a team in "Select a trade partner…", click players and picks under "Your Offer" and "You Receive", then press the button under the "Evaluation" panel. It reads "Propose Trade" when they would accept and "Send Offer" when they would likely decline. The answer is immediate.
- Not in the game: a button that fills in a deal for you. The closest thing is the "Trade Finder" tab: pick one of your players and it lists deals other teams would accept, with "Load & tweak".
- Salaries must match: a team over the cap can only take back a limited amount of salary for what it sends (less when it is over the first or second apron). If not, the button reads "Salary doesn't match" and a hint says how much salary to trim or add. A team under the cap can absorb salary up to its cap room.
- Trading block: "Trading Block" tab, click players under "Players on the Block" (and picks if you like), choose what you want under "Seeking in return", then "Ask for Proposals". Or "Add to Trade Block" in the roster's "Actions ▾" menu, or "Add to Trading Block" on a player's card.
- AI teams send offers during the regular season up to the deadline (a red count appears on "Trade"). Answer with "Accept", "Counter" or "Decline"; offers expire after 6 days. A counter gets an instant answer: a deal, one "Final offer", or a walk-away.
- Draft picks: both rounds of the next 3 drafts can be traded, plus picks not yet made while the draft is running.
- Pick protections (first-round picks only): add the pick to the deal, then use the "protection:" dropdown that appears under it ("Unprotected", "Top-1 protected" to "Top-5 protected", "Top-10 protected", "Lottery protected"), how many extra years it rolls over, and whether it then "becomes a 2nd" or "expires". If the pick lands inside the protection, the original team keeps it and it rolls to the next year.
- Trade deadline: Day 115 by default. Change it in Settings, "League Rules", "Calendar", "Trade deadline", then "Save rules". After the deadline (the status line under the top bar then reads "Trade window closed") and during the playoffs you can browse the Trade page but not make trades. Trading opens again in the offseason, including during the draft, re-signing and free agency.
- "📰 Trade Rumors" at the top of the Trade page shows rumoured deals around the league.
- Not in the game: three-team trades, cash in trades, trade exceptions, sign-and-trade, pick swaps and no-trade clauses.

OFFSEASON ORDER
- The order is: Regular Season, Playoffs, then the offseason: Draft (with the lottery first), Re-sign, Free Agency, then the new season. The draft comes before free agency.
- Buttons, in order: "Enter Offseason" after the Finals; "Go to Draft" (then "Start the Lottery Reveal →" or "Skip — reveal instantly →" on the Draft page); "Re-sign N Players" once the draft is done; "Sign Free Agents" when re-signing is done; "Start the Season" (or "Start the Season →" on the Free Agency page) to tip off.
- "Skip to season" skips re-signing: your undecided players leave as free agents, and you land in preseason free agency, where you still press "Start the Season".

RE-SIGNING
- After the draft, open "Re-sign" in the sidebar (the "Re-signing Window" page). Each expiring player has "Re-sign" (opens a negotiation) and "Let Walk" (he becomes a free agent right away). "Re-sign All" signs everyone at their asking price; "Let All Walk" releases them all. Letting an expiring player walk leaves no dead cap.
- Anyone still undecided when you move on to free agency leaves as a free agent. Nobody is re-signed automatically.
- Re-signing your own players has no cap check, so you can always go over the cap to keep them. A player who has ended talks can still be kept with "Pay his price".
- Not in the game: a franchise tag, restricted free agency, qualifying offers and offer sheets.

FREE AGENCY
- To sign a free agent: open "Free Agency" (titled "Sign Free Agents" during the season), click "Offer" on a player, set "Salary" and "Years" (1 to 5), then "Make Offer". The answer is immediate: he signs, signs elsewhere if a rival offers more, counters ("Counter Offer", or "Meet their ask"), or rejects.
- Offseason free agency lasts 30 days. Each signing uses a day; "Skip Day →" and "Skip Week ⏩" pass time. AI teams sign players every day and asking prices fall as the days go by.
- Why an offer fails: it is far below his asking price, a rival team offered more, it is above your cap room or remaining exceptions ("Over budget"), it is above his max salary, or your roster is full (choose a player to release in the offer panel).
- Over the cap you sign through exceptions, shown as "Signs via …" in the offer panel: "Non-Tax MLE", "Tax MLE", "Bi-Annual Exception" and "Veteran minimum" (under the cap: "Cap room", then "Room Exception"). Each exception can be used once per offseason; the Non-Tax MLE and Bi-Annual hard-cap you at the first apron. Over the second apron only minimum deals are left. You never press a separate button to use an exception; the game picks it.
- Signing budget is the most you can offer one free agent right now: your cap room when under the cap, otherwise roughly what your best remaining exception allows. "Show affordable only" filters the list to players you can afford.
- You can also sign free agents during the regular season on the same page.
- "🕵️ Suitor intel": expand a player's row and press "Pull report" to see which teams are interested and roughly what they offer. Free accounts get 3 reports per free agency, Premium 9.
- Not in the game: bringing back retired players, waiver claims and buyouts.

SALARY CAP AND FINANCES
- "Finances" in the sidebar shows revenue, expenses, profit, and a "Cap & Apron" card with the salary cap, payroll, cap room, luxury tax line, 1st apron, 2nd apron and tax bill.
- It is a soft cap: $165M in 2026 by default, growing 7% a year. Going over the luxury tax line costs a tax bill; the aprons limit trades and signings.

DRAFT
- 2 rounds. Before the picks there is a lottery for the 14 non-playoff teams.
- Open "Draft" in the sidebar. When the header says "⏰ YOU'RE ON THE CLOCK", press "Draft" on a prospect's row (or "Draft Now" on a suggestion card). There is no pick timer.
- "Sim Pick", "Sim to My Pick" and "Auto-Draft All" (lets the AI finish the whole draft, your picks included); in the top bar "Sim to My Pick", "Sim One Pick" and "Auto Draft All".
- Trading during the draft: "Trade Pick" in the on-the-clock header.
- Rookie contracts are set automatically: first-rounders get 4 years, second-rounders 2 years.
- Scouting: press "Scout" on a prospect. Each level costs more points: "Quick look" (1), "Workout" (3) and "Full evaluation" (6, shows his exact potential). "Scout Pts" shows what you have left and "Auto-scout" spends points on quick looks. Free accounts get 5 points per draft, Premium 30.
- "Draft Board" in the sidebar (the "Draft Big Board", with "Big Board" and "Mock Draft" tabs) shows the class during the season. "Draft Recap" ("Draft Report") appears after the draft.
- Not in the game: more than 2 rounds, draft-and-stash, and team options on rookie deals.
`;

const ACCOUNT_AND_OTHER = `
COACHES
- Open "Staff" in the sidebar. There are two jobs: "Head Coach" and "Player Development Coach".
- "Fire" on a coach's card, then confirm. Firing the head coach puts in an interim coach until you hire someone; firing the development coach leaves the job empty.
- To hire: in the "Coaching market" card switch between "Head coaches" and "Dev coaches" and press "Hire". Hiring replaces the current coach in one step. "Extend" offers your coach 1 to 5 more years (he can refuse).
- Coach salaries and the money owed to a fired coach never count against the salary cap.
- Not in the game: assistant coaches, scouts or trainers, and picking the coach's scheme.

JOB SECURITY
- The Dashboard shows "Fan Pulse", "Owner" approval and an "Owner objectives" card with your job status ("Safe", "On Notice", "Hot Seat", "Final Warning"). Approval changes once a year at the end of the season, from wins, playoff results and the objectives.
- You can be fired after a second season in a row with very low owner approval, never in your first three seasons with a team. If that happens, a red banner offers "Pick a new GM job →" in the same league.

SETTINGS
- "Settings" in the sidebar. Sections: "Account", "Cloud Saves", "Appearance" (Light / Dark), "Sound" (Muted / On, off by default; no volume control), "God Mode", "Switch Team", "League Rules" and "League Expansion".
- "League Rules" changes apply only after "Save rules" ("Reset to defaults" restores them). It has "Cap & Contracts", "Calendar" ("Trade deadline"), "Health & Development" (injuries, progression, aging, retirement age) and "Roster" ("Max roster size"). No God Mode needed.
- The salary cap can be changed but not turned off: "League Rules", "Cap & Contracts", "Salary cap" ("Grows yearly" or a "Flat cap" from $80M to $400M) and "Annual cap growth". The same section has the luxury tax line and rate, the aprons, the max contract and the minimum salary.
- "God Mode" (commissioner mode, for editing ratings and more): Settings, "God Mode", "On". It adds a "🛠️ God Mode" editor on every player's card (position, age, potential, ratings, contract, heal or injure, trade request), "Force Win" / "Force Loss" for your next game on the Dashboard, and the "Create Player" and "Relocate / rebrand a franchise" sections in Settings. A league that has ever had God Mode on never counts on the Global GM Board, even after you turn it off.
- "Switch Team": click a team, then "Take over". Your old team is run by the AI.
- Not in the game: a difficulty setting.

SAVES
- The game saves automatically in this browser after every action. There is no save button and no save slots.
- You can keep several leagues. "↔ Switch / New League" at the bottom of the sidebar goes back to the start screen without deleting anything; from there "Continue League" or "Or browse N saved leagues" and "Load". Each saved league has "✎" (rename) and "✕" (delete, cannot be undone).
- Starting a new league does not delete your current one; it is added as another save.
- Backing up a league: there is no export or import of a save file (not in the game). The only backup is Cloud Saves, below. "Upload file" on the Rosters page starts a new league from a Basketball GM file; it does not restore a BS Hoops save.
- Playing on another device (or moving a league to your phone): sign in, then turn on the switch in Settings, "Cloud Saves" (off by default, and set per browser). It uploads all your leagues and keeps them synced. On the other device, sign in and press "Restore" on the league in Settings, "Cloud Saves" (the start screen also offers "Restore").
- Clearing your browser data deletes your local leagues. Only a cloud save can bring one back.

STARTING A LEAGUE
- To start a new league: press "↔ Switch / New League" at the bottom of the sidebar to get back to the start screen (your current league stays saved), then choose how to start.
- On the start screen, clicking any team in the grid starts a fictional league right away (made-up teams and players). "Spectator (no team)" lets you watch an all-AI league.
- Yes, you can play with the real NBA rosters: "Import a real roster" on the start screen (or "Rosters" in the sidebar), then "Start a league with this roster →" on the NBA 2026-27 roster, and pick your team. It starts at the current point of the real season.
- Your own file: on the Rosters page, "Use your own file": paste a link and press "Load URL", or "Upload file". It takes Basketball GM / ZenGM league files.
- Not in the game: historic or past-season rosters (only the current NBA roster is offered), and a setup screen with options before the league starts (use "League Rules" in Settings afterwards).
- Expansion: "Expansion" in the sidebar during the offseason after the draft, or Settings, "League Expansion", "Open expansion →". Up to 2 new teams per offseason, 32 teams at most. It does not need God Mode and cannot be undone.

ACCOUNT AND PREMIUM
- You do not need an account to play. Sign in ("Sign In" in the sidebar: Google, Discord, or email and password) for Premium, cloud saves and the Global GM Board.
- Free includes the whole game. Premium adds 30 scout points per draft (free: 5), 9 free-agent intel reports (free: 3), 5 Team Spotlight episodes a month, and open questions in the Booth (free accounts get 3 a week). The full list and current price are on the Pricing page.
- Subscribe with "⚡ Upgrade to Premium" in the sidebar or "Upgrade to Premium" on the Pricing page or in Settings, "Account". Manage or cancel under Settings, "Account", "Manage subscription".
- One Premium subscription covers both BS Hoops and BS Football.

OTHER PAGES
- "Rankings": "Power Rankings", "Award Race", "Awards" and "GM Rankings". "GM Rankings" has the "🌍 Global GM Board" (an online board of signed-in players; your season is sent when you press "Enter Offseason"; leagues started from an imported roster and spectator leagues are not included) and a ranking of every GM in your league.
- "Stats": league leaders and team stats. "Player Search" finds any player and has "⚖️ Compare". "News" has league news and the season recap. "History": past champions, awards, stat leaders and retired players. "Transactions": every trade, signing and release.
- "The Show" is the weekly two-host show about your league, and "The Booth" button at the bottom-right of in-game screens lets you ask the hosts questions. "Buzz" is a social-media-style feed.
- Seeing what changed in an update: updates are announced in the Discord (https://discord.gg/RMtusS2GKW, "Join the Community" in the sidebar). A "What's new in BS Hoops" window also pops up once when you open your league after an update. Not in the game: a changelog page you can reopen.
`;

export const HELP_SHEET = [IN_SEASON, TRADES_AND_OFFSEASON, ACCOUNT_AND_OTHER].map(s => s.trim()).join('\n\n');
