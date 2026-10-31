/**
 * BS Hoops blog — strategy guides grounded in how the game actually works.
 *
 * Every number in these posts comes from the live engine (packages/sport-basketball
 * + apps/bs-basketball/src/lib): cap/apron multipliers, exception sizes, the
 * lottery table, the aging curve, the trade-value formula, rotation stints and
 * game-plan multipliers. If those constants change, update the affected post.
 *
 * Publishing cadence: `getPublishedPosts()` hides anything dated in the future,
 * and the blog routes revalidate daily, so a post goes live on its publishDate
 * without a deploy.
 */

export interface BlogPost {
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  /** YYYY-MM-DD. Posts dated after today are hidden everywhere. */
  publishDate: string;
  category: 'getting-started' | 'salary-cap' | 'roster' | 'strategy' | 'draft' | 'trades' | 'development';
  readingTime: number;
  /** One-paragraph summary shown on the index and used as the excerpt. */
  summary: string;
  content: string;
  /** Slugs of related posts (only published ones are linked). */
  related: string[];
}

export const CATEGORY_LABELS: Record<BlogPost['category'], string> = {
  'getting-started': 'Getting Started',
  'salary-cap': 'Salary Cap',
  roster: 'Rotation',
  strategy: 'Team Building',
  draft: 'Draft & Scouting',
  trades: 'Trades',
  development: 'Player Development',
};

export const blogPosts: BlogPost[] = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'first-season-beginners-guide',
    title: 'Your First Season in BS Hoops: A Beginner’s Guide to Running a Basketball Franchise',
    seoTitle: 'Basketball GM Beginner’s Guide — Your First Season in BS Hoops',
    metaDescription:
      'New to BS Hoops? A step-by-step walkthrough of your first season: picking a team, reading the cap sheet, setting a rotation, the trade deadline, playoffs, and the offseason loop.',
    keywords: ['basketball gm beginner guide', 'how to play basketball gm', 'bs hoops tips', 'basketball management game guide'],
    publishDate: '2026-10-14',
    category: 'getting-started',
    readingTime: 7,
    summary:
      'Everything you need to survive year one: which team to pick, the three numbers on your cap sheet that matter, how to set a rotation, when to trade, and what happens in the offseason.',
    related: ['salary-cap-aprons-and-exceptions', 'rotation-bench-order-and-minutes', 'rebuild-or-contend-timeline'],
    content: `
<p>BS Hoops drops you into a front office with 30 teams, an 82-game schedule, and a real-style soft cap. There is no tutorial wall: you pick a team and the season is waiting. This guide walks through the first year in the order you will actually hit each decision, with the specific numbers the game uses so you are not guessing.</p>

<h2>Step 1: Pick the right team for how you want to play</h2>
<p>You have two ways to start. <strong>A generated league</strong> (click any team on the home screen) gives you a fictional 30-team league with randomly built rosters. <strong>The real-roster league</strong> (via <a href="/rosters">Rosters</a>) imports the 2025-26 NBA player pool, contracts and future pick trades, converted to BS Hoops ratings. If you want to see how a specific franchise looks before committing, every team has a public page under <a href="/rosters/2026">2026 rosters</a> with its payroll, cap tier, age profile and full depth chart.</p>
<p>For a first save, pick a team that is <em>not</em> buried in salary. A team over the second apron has almost no tools: no Mid-Level Exception and strict one-for-one salary matching in trades. A team near or under the $165.0M cap can sign, trade and absorb contracts. You learn the systems faster when every button works.</p>

<h2>Step 2: Read your cap sheet (three numbers)</h2>
<p>Open <strong>Finances</strong>. You only need three lines at first:</p>
<ul>
<li><strong>Payroll vs. the cap ($165.0M in 2026-27).</strong> Under it, you can sign free agents with cap room. Over it, you need an exception.</li>
<li><strong>The luxury tax line (~$200.5M).</strong> Every dollar above it is taxed at $1.50 for the first $5M, rising in steps to $3.75 per dollar beyond $20M over.</li>
<li><strong>The aprons (~$209.1M and ~$221.8M).</strong> These are where the rules start taking tools away. Our <a href="/blog/salary-cap-aprons-and-exceptions">cap and aprons guide</a> covers exactly what each line removes.</li>
</ul>
<p>The cap grows about 7% a year (to roughly $176.6M in 2027-28), so a contract that looks heavy today gets lighter every season it runs.</p>

<h2>Step 3: Set your rotation before game one</h2>
<p>The game auto-builds a lineup: two guards, two forwards and a center start, chosen by overall rating (OVR), and everyone else is ordered on the bench. That default is reasonable, but it is not tuned to you. The sim runs a two-unit rotation — the starters play stretches of four possessions, then the second unit plays two — which works out to about 32 minutes for a starter. Only the <strong>first five players on your bench</strong> form that second unit. Whoever sits at bench slot six or lower is effectively a reserve. The full mechanics are in <a href="/blog/rotation-bench-order-and-minutes">how bench order drives minutes</a>, but the beginner rule is simple: put your five best non-starters in bench slots 1 through 5, and put the young player you want to develop at slot 4 or 5 rather than 11.</p>

<h2>Step 4: Sim in chunks, watch a few games</h2>
<p>Use <strong>Sim Week</strong> for the first month so you can react to injuries and slumps. Watch a couple of your own games live: the viewer shows a shot chart, win probability and game flow, and it is the fastest way to see whether your team is getting buried on the boards or turning it over. Then open the <strong>Game Plan</strong> from the next-matchup card. Pace, shot selection and defensive pressure all change the possession math; <a href="/blog/game-plans-and-pace">our game-plan guide</a> lists the exact multipliers.</p>

<h2>Step 5: Decide your direction by the trade deadline</h2>
<p>The deadline falls on day 115 of the 170-day regular season, about two thirds of the way through. By then you have roughly 55 games of evidence. Look at two things: your record, and how your roster's top-8 average OVR compares to the league. If you are a fringe team with an old core, the deadline is the best window you will get to sell veterans before they age; trade value for a 32-year-old is already only 60% of what an identical 28-year-old fetches. If you are a top-four seed, the deadline is when a rental is worth the most. The <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend guide</a> lays out the decision tree.</p>

<h2>Step 6: Playoffs and owner approval</h2>
<p>The top six seeds in each conference go straight to the playoffs; seeds 7-10 go to the play-in. Ownership judges you against a baseline of 41 wins. Each win above or below 41 moves owner approval by 0.6 points, and the playoff result adds a bonus: +25 for a title, +16 for a Finals loss, +10 for the conference finals, +5 for the second round, 0 for a first-round exit and −12 for missing entirely. You start at 50. Nobody gets fired in their first three seasons, and it takes two consecutive seasons below 20 approval to lose the job, so a planned rebuild is survivable if you are honest about it.</p>

<h2>Step 7: The offseason loop</h2>
<p>When the playoffs end, the league ages. Every player gains or loses ratings based on age (young players rise, players past 28 start to decline) and some retire. Then you run the draft (lottery first), handle re-signings, and enter a 30-day free-agency window. Prices fall as the window ages: on day 0 a player asks his full market rate, and by day 30 he will take 50% of it. Big names get signed early by AI teams, but the late "Bargain Bin" days (24-30) are where cheap rotation depth lives.</p>

<h2>A first-season checklist</h2>
<table>
<thead><tr><th>When</th><th>Do this</th></tr></thead>
<tbody>
<tr><td>Before game 1</td><td>Check cap tier in Finances; set starters and bench slots 1-5.</td></tr>
<tr><td>First month</td><td>Sim by week; watch two games; adjust the game plan.</td></tr>
<tr><td>Day ~100</td><td>Decide buyer or seller; shop expiring contracts.</td></tr>
<tr><td>Day 115</td><td>Trade deadline — last chance to move salary until summer.</td></tr>
<tr><td>Offseason</td><td>Scout the draft (30-point budget), re-sign Bird-rights players, shop the late FA window.</td></tr>
</tbody>
</table>
<p>That is the whole loop. Everything else in BS Hoops — pick protections, apron management, development curves — is a refinement of these seven steps.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'salary-cap-aprons-and-exceptions',
    title: 'The Salary Cap, Luxury Tax and Aprons in BS Hoops: How to Use Every Exception',
    seoTitle: 'Basketball GM Salary Cap Guide — Aprons, MLE, Bird Rights & Tax',
    metaDescription:
      'A practical guide to the BS Hoops soft cap: the $165M cap, tax line, first and second aprons, the Mid-Level, Bi-Annual and Room exceptions, Bird rights, and trade salary matching.',
    keywords: ['basketball gm salary cap', 'nba apron explained game', 'mid-level exception strategy', 'bird rights basketball gm'],
    publishDate: '2026-10-16',
    category: 'salary-cap',
    readingTime: 8,
    summary:
      'The soft cap is a ladder, not a wall. Here is what each rung costs you — cap room, the Mid-Level, the Bi-Annual, Bird rights — and how the two aprons quietly take tools away.',
    related: ['first-season-beginners-guide', 'trade-value-and-pick-protections', 'rebuild-or-contend-timeline'],
    content: `
<p>BS Hoops uses a soft cap. You can go over it, and most good teams do. What changes as payroll climbs is <em>which tools you have left</em>. Understanding that ladder is the single biggest edge you can have over the AI front offices, because they are bound by exactly the same rules.</p>

<h2>The five lines on the ladder (2026-27)</h2>
<table>
<thead><tr><th>Line</th><th>Amount</th><th>What changes above it</th></tr></thead>
<tbody>
<tr><td>Salary cap</td><td>$165.0M</td><td>No more cap-room signings; you need an exception.</td></tr>
<tr><td>Luxury tax</td><td>$200.5M (cap × 1.215)</td><td>Tax bill; Mid-Level shrinks to the ~$6.1M Tax MLE.</td></tr>
<tr><td>First apron</td><td>$209.1M (cap × 1.267)</td><td>No Bi-Annual; trade matching drops to 110% + $250K.</td></tr>
<tr><td>Second apron</td><td>$221.8M (cap × 1.344)</td><td>No Mid-Level at all; trades must match 1-for-1.</td></tr>
</tbody>
</table>
<p>All four lines scale with the cap, which grows about 7% a year. A team at $205M today is a first-apron team; the same payroll next season (cap ≈ $176.6M, first apron ≈ $223.7M) is only a taxpayer. Patience is a cap tool.</p>

<h2>Under the cap: room first, then the Room Exception</h2>
<p>If your payroll is below $165.0M, the difference is cap room, and you can sign any free agent whose first-year salary fits inside it. After the room is used, you still get the <strong>Room Exception</strong> — about 5.33% of the cap, roughly $8.8M — for one more signing. It does not hard-cap you. In the real-roster league only four teams start under the line — Charlotte, Milwaukee, Brooklyn and Memphis — which is exactly why they are interesting saves.</p>

<h2>Over the cap: the Mid-Level and the Bi-Annual</h2>
<p>Once you are over the cap, signings run through exceptions. BS Hoops tracks each one as a once-per-offseason resource:</p>
<ul>
<li><strong>Non-Tax Mid-Level</strong> (~9.4% of cap, about $15.5M): available if you are over the cap but under the tax line. <strong>Using it hard-caps you at the first apron for the rest of the season.</strong></li>
<li><strong>Tax / Taxpayer Mid-Level</strong> (~3.68% of cap, about $6.1M): what you get between the tax line and the second apron. It does not hard-cap.</li>
<li><strong>Bi-Annual Exception</strong> (~3.32% of cap, about $5.5M): only below the first apron, and it also hard-caps you there.</li>
<li><strong>Veteran minimum</strong>: always available, never consumed. Minimums scale with service time, from $1.35M for a rookie to $3.87M for a 10-year veteran.</li>
</ul>
<p>The game picks the cheapest channel that covers a salary. A minimum deal never burns your Mid-Level, and a $5M signing uses the Bi-Annual before the MLE if both fit. The trap is the hard cap: if you use the full Mid-Level in July, you cannot take on salary in a February trade that would push you past $209.1M. Plan your deadline before you spend in free agency.</p>

<h2>Bird rights: the only way to keep a star over the cap</h2>
<p>Your own free agents are special. With <strong>full Bird rights</strong> you can re-sign a player for any amount up to his max, regardless of the cap, for up to five years with raises of up to 8% per season. <strong>Early Bird</strong> caps the starting salary at 175% of his previous salary or 10% of the cap, whichever is higher. Players also give their own team a small loyalty discount: the price they will accept drops by about four percentage points of market value when you hold their Bird rights.</p>
<p>The practical lesson: an over-the-cap team that lets a good player walk cannot replace him with an equal free agent. The best it can offer anyone else is a Mid-Level. Re-signing is almost always cheaper than replacing.</p>

<h2>Max contracts and raises</h2>
<p>A player's maximum first-year salary depends on his years in the league: 25% of the cap for 0-6 years ($41.25M), 30% for 7-9 years ($49.5M), and 35% for 10+ years ($57.75M). Contracts can run five years with year-over-year raises capped at 8%. Free agents decide on the <em>total</em> value of an offer, so a shorter deal at a higher annual number can win the same player as a longer, cheaper one — useful when you need the money back in two years.</p>

<h2>The luxury tax bill</h2>
<p>The tax is incremental. On the portion of payroll above the tax line you pay $1.50 per dollar on the first $5M, $1.75 on the next $5M, $2.50 on the next, $3.25 on the next, and $3.75 per dollar beyond $20M over. Being $4M over costs $6M. Being $25M over costs about $63.8M. That curve is why the second $10M of overspending hurts far more than the first.</p>

<h2>Trade salary matching</h2>
<p>Trades are where the aprons bite hardest. If you are under the cap you can take back your outgoing salary plus your room. Over the cap but below the first apron, the tiered rule applies:</p>
<ul>
<li>Sending out $7.5M or less: take back up to 200% + $250K.</li>
<li>Sending out $7.5M-$29M: take back up to outgoing + $7.5M.</li>
<li>Sending out more than $29M: take back up to 125% + $250K.</li>
</ul>
<p>Above the first apron, the limit drops to 110% + $250K. Above the second apron, you cannot take back a dollar more than you send. In the real-roster league several contenders start well above $221.8M, which is why they struggle to add at the deadline without sending out matching money.</p>

<h2>Dead money and the stretch</h2>
<p>Releasing a player does not erase his salary. Guaranteed money stays on your books as dead cap and counts against the cap, tax and aprons. A straight waive keeps the remaining years as they were; the stretch option spreads the total over twice the remaining years plus one, so a $20M expiring deal becomes roughly $6.7M a year for three seasons. Stretching is a tool for getting under an apron this season at the cost of flexibility later.</p>

<h2>A cap plan you can actually follow</h2>
<ol>
<li>Before free agency, decide whether you will be a room team, a Mid-Level team, or a taxpayer. Don't drift into the tax by accident.</li>
<li>Re-sign Bird-rights players first; you cannot replace them on the open market.</li>
<li>If you use the full Mid-Level, write down your first-apron headroom — that is your deadline budget.</li>
<li>Keep at least one mid-sized expiring contract as matching salary for a February trade.</li>
</ol>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'rotation-bench-order-and-minutes',
    title: 'How Bench Order Drives Minutes in BS Hoops: Building a Rotation That Wins',
    seoTitle: 'Basketball GM Rotation Guide — Starters, Bench Order & Minutes',
    metaDescription:
      'How the BS Hoops sim decides who plays: positional starters, the two-unit rotation, why bench slots 1-5 matter most, how minutes are split by order, and how to give a rookie real development minutes.',
    keywords: ['basketball gm rotation', 'bench order minutes', 'basketball sim lineup tips', 'how to set rotation basketball gm'],
    publishDate: '2026-10-18',
    category: 'roster',
    readingTime: 7,
    summary:
      'Your starters play about 32 minutes, your first five bench players share the rest, and anyone at bench slot six or lower barely sees the floor. Here is how to use that.',
    related: ['game-plans-and-pace', 'player-development-and-aging', 'first-season-beginners-guide'],
    content: `
<p>Most basketball GM games treat minutes as a slider. BS Hoops does not. It simulates every possession, and who is on the floor for each one is decided by a small set of rules. Once you know them, your depth chart stops being a list and becomes a lever.</p>

<h2>Rule 1: Starters are two guards, two forwards, one center</h2>
<p>Lineups are built from position groups, not five exact positions. The five starter slots are G, G, F, F and C. The best two guards start even if both are shooting guards; a point guard is not forced into the lineup just because of the label on his card. Players have a primary and sometimes a secondary position, and a start inside your own group (a small forward at power forward) is "in position". Only a start outside it — a center playing guard — is flagged.</p>
<p>When the auto-builder picks starters it fills each group with the highest-OVR natural players, then borrows from the nearest group if one is short: a guard slot borrows a forward first, a forward slot borrows a center, and a center slot borrows a forward. If you change starters yourself, keep the 2-2-1 shape unless you have a reason not to.</p>

<h2>Rule 2: The game alternates two five-man units</h2>
<p>During a game the sim rotates between your starting five and a second unit. By default the starters play four possessions, then the second unit plays two, and the pattern repeats. Starters end up on the floor about two thirds of the game — roughly 32 minutes each — and the second unit gets the remaining third, about 16 minutes each.</p>
<p>The second unit is <strong>the first five players in your bench order</strong>. That is the most important sentence in this article. Bench slot 6 and below do not form part of the rotation; they only see the floor if someone ahead of them is injured and the lineup is rebuilt. If your best backup is sitting at bench slot 7, he is not playing.</p>

<h2>Rule 3: Order inside the second unit sets the minute split</h2>
<p>Inside each unit, credited minutes are reshaped so the box score looks like real basketball rather than five identical lines. Starters are reshaped by rating — a 90-OVR star logs more minutes than the 78 next to him. The bench is reshaped mainly by <em>order</em>: each slot gets about 80% of the weight of the slot above it, with rating as a small tiebreaker. Across a typical 80 bench minutes that works out to roughly:</p>
<table>
<thead><tr><th>Bench slot</th><th>Approx. minutes</th></tr></thead>
<tbody>
<tr><td>1 (sixth man)</td><td>23-24</td></tr>
<tr><td>2</td><td>~19</td></tr>
<tr><td>3</td><td>~15</td></tr>
<tr><td>4</td><td>~12</td></tr>
<tr><td>5</td><td>~10</td></tr>
<tr><td>6+</td><td>DNP unless injuries</td></tr>
</tbody>
</table>
<p>So bench order does two jobs: slots 1-5 decide <em>who</em> is in the second unit (which affects results), and the order within those five decides how the minutes and per-game stats are distributed.</p>

<h2>Rule 4: The game plan can lean the rotation</h2>
<p>The Game Plan has a rotation setting. "Ride the starters" stretches starter stints to six possessions and cuts bench stints to one, pushing your starting five well past 36 minutes. "Spread minutes" shortens starter stints to three possessions with two-possession bench stints, so the second unit plays about 40% of the game. Use "ride the starters" in close playoff series where your top five is clearly better than your bench; use "spread minutes" when your bench is deep or you are trying to get young players reps.</p>

<h2>Giving a rookie real minutes</h2>
<p>Young players with upside get a small, capped boost when the game auto-orders the bench: up to +6 rating points of "development priority", fully applied at age 21 and under, 60% at 22-23 and 30% at 24-25. That nudges a promising rookie into bench slots 1-5 over a replacement-level veteran without letting him jump genuine rotation players.</p>
<p>If you want more than that, do it manually. The rookie does not need 30 minutes; he needs to be in the second unit. A 19-year-old at bench slot 4 plays about 12 minutes a night across 82 games — real stats, real awards eligibility. At slot 9 he plays nothing. (Development in BS Hoops is driven by age and potential at each offseason rather than by minutes, but playing time is what produces the stat line that feeds trade value and awards. See <a href="/blog/player-development-and-aging">the development guide</a>.)</p>

<h2>Common rotation mistakes</h2>
<ul>
<li><strong>Burying your sixth man.</strong> Trades and signings change the roster under your saved rotation, and a new arrival will not necessarily land in the top five. Always re-check slots 1-5 after a deal.</li>
<li><strong>Three centers in the second unit.</strong> The bench unit is the first five names, in whatever positions they are. Five bigs will get killed on the perimeter. Keep the second unit roughly balanced too.</li>
<li><strong>Ignoring injuries.</strong> When a starter goes down, the lineup is repaired from bench order. Whoever is at bench slot 1 effectively becomes your sixth starter, so make sure he can actually start.</li>
<li><strong>Carrying 15 players you cannot use.</strong> Roster spots 11-15 are insurance, not rotation. That is the right place for a two-way flier or a cheap veteran, not a player you are paying $15M.</li>
</ul>

<h2>A quick rotation template</h2>
<ol>
<li>Start your best two guards, best two forwards and best center.</li>
<li>Bench slot 1: your best remaining player regardless of position — he plays nearly 24 minutes.</li>
<li>Bench slots 2-5: a guard, a wing and a big, plus your highest-upside young player.</li>
<li>Bench 6-10: injury cover by position (one guard, one wing, one big).</li>
<li>Re-check after every trade, signing and injury.</li>
</ol>
<p>Twenty seconds of depth-chart housekeeping is worth more wins than most trades. Set it, then <a href="/blog/game-plans-and-pace">tune the game plan</a> to match the roster you built.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'rebuild-or-contend-timeline',
    title: 'Rebuild or Contend? A Timeline-Based Framework for Basketball GMs',
    seoTitle: 'Basketball GM Rebuild vs Contend — When to Tank, Retool or Go All-In',
    metaDescription:
      'How to decide whether to rebuild or contend in BS Hoops, using real game mechanics: the aging curve, trade-value age multipliers, lottery odds, owner approval and the grace period.',
    keywords: ['basketball gm rebuild', 'when to tank basketball gm', 'contending strategy basketball gm', 'bs hoops rebuild guide'],
    publishDate: '2026-10-23',
    category: 'strategy',
    readingTime: 8,
    summary:
      'The worst place in BS Hoops is the middle. A framework for picking a lane based on your core’s age, your cap tier, and how much rope ownership will give you.',
    related: ['trade-value-and-pick-protections', 'draft-lottery-and-scouting', 'player-development-and-aging'],
    content: `
<p>Every franchise in BS Hoops is on a clock, and the clock is mostly your players' birthdays. The game's aging curve, trade-value model and lottery all reward teams that commit to a direction and punish teams that try to be a 42-win team forever. This framework turns that into a decision you can make in five minutes.</p>

<h2>The clock: how the game ages players</h2>
<p>At each offseason, every player's ratings move by an expected amount for his age plus noise. The expected change, in OVR points per season:</p>
<table>
<thead><tr><th>Age (new season)</th><th>Expected change</th></tr></thead>
<tbody>
<tr><td>21 and under</td><td>+3.5</td></tr>
<tr><td>22-23</td><td>+2.0</td></tr>
<tr><td>24-25</td><td>+1.0</td></tr>
<tr><td>26-28</td><td>0 (peak)</td></tr>
<tr><td>29-31</td><td>−1.2</td></tr>
<tr><td>32-34</td><td>−2.2</td></tr>
<tr><td>35-37</td><td>−3.0</td></tr>
<tr><td>38+</td><td>−3.5</td></tr>
</tbody>
</table>
<p>Young players below their ceiling also get an extra pull toward their potential. A core whose best players are 31-33 will lose roughly two OVR points each per year. Over three seasons that is the difference between a 58-win team and a play-in team.</p>

<h2>The market: what that age is worth in a trade</h2>
<p>Trade value in BS Hoops is a "PTS" number. It starts from a steep curve on OVR — an 85 is worth far more than two 70s — and then applies an age multiplier. At 22-23 it is ×1.25 (the peak), 28-29 is ×1.0, 30-31 drops to ×0.82, 32-33 is ×0.6, 34-35 is ×0.4, and 36+ is ×0.25. Contract value then adjusts the number: cheap-and-good players get up to a 55% premium; overpaid multi-year deals lose value quickly and can go negative.</p>
<p>The implication is blunt: if you are going to sell a 30-year-old star, sell him at 30, not at 32. Waiting two years cuts his age multiplier from 0.82 to 0.6 <em>and</em> he will probably have lost a few rating points.</p>

<h2>Lane 1: Contend</h2>
<p>Contend when at least three of your top five players are 24-29 and your top-8 average OVR is in the league's top six. In the 2026 real-roster league the top-8 averages run from about 76.5 to 80.6, so even a one-point edge is meaningful. Contending teams should:</p>
<ul>
<li>Trade future picks rather than young rotation players. A pick in the 20s is worth about 700 PTS; a good 23-year-old on a rookie deal is worth several times that.</li>
<li>Use Bird rights aggressively — you cannot replace your own free agents over the cap.</li>
<li>Buy veterans on expiring deals at the deadline. An expiring overpay is barely penalized in trade value, so they are cheap to acquire.</li>
<li>Watch the second apron. A contender above $221.8M cannot use the Mid-Level and must match salaries one-for-one.</li>
</ul>

<h2>Lane 2: Rebuild</h2>
<p>Rebuild when your best players are 30+, your cap sheet is heavy, and you are outside the top eight in rotation quality. A real rebuild in BS Hoops has three phases:</p>
<ol>
<li><strong>Sell early.</strong> Move veterans 29+ before the deadline to Contending or Win-Now teams. The AI classifies teams by record, age and payroll: a team at .600 or better with payroll above 90% of the cap is "Win Now" and will pay a premium for proven veterans. Rebuilding AI teams actually <em>discount</em> incoming players 31 and older by 30% of their value, so do not try to sell a veteran to another rebuilder.</li>
<li><strong>Collect lottery tickets.</strong> The worst three records each have a 14% chance at the #1 pick, and none of them can fall below #4. A #1 pick is worth 3,000 PTS in trade terms; #14 is about 1,130. See <a href="/blog/draft-lottery-and-scouting">the lottery guide</a> for the full odds table.</li>
<li><strong>Get under the cap.</strong> Let bad contracts expire, use the stretch sparingly, and arrive at the summer where your young core is 22-24 with cap room to add a veteran star.</li>
</ol>

<h2>Lane 3 (the trap): the middle</h2>
<p>A 40-44 win team with an older core is the worst position in the game. It is not good enough to win a series, the pick lands around #12-16, the cap sheet is full, and ownership's approval barely moves because the baseline expectation is 41 wins. Every year in the middle the core ages about a point or two and its trade value shrinks. If you find yourself here, pick a lane by the deadline.</p>

<h2>How much rope does ownership give you?</h2>
<p>Owner approval changes by 0.6 points per win above or below 41, plus a playoff score (−12 for missing, up to +25 for a title), capped at ±30 per season. You start at 50. The rules that protect a rebuild:</p>
<ul>
<li>No firing during your first three seasons with a team.</li>
<li>A firing requires <strong>two consecutive</strong> seasons with approval below 20.</li>
</ul>
<p>A 25-win season costs about 0.6 × (25 − 41) − 12 ≈ −22 points. Two of those in a row from a 50 start puts you around 6 — fine inside the grace period, dangerous right after it. Plan for the third season of a rebuild to look like progress (35+ wins) and the fourth to be a playoff push.</p>

<h2>A five-minute decision checklist</h2>
<table>
<thead><tr><th>Question</th><th>Contend if…</th><th>Rebuild if…</th></tr></thead>
<tbody>
<tr><td>Age of top 3 players</td><td>Mostly 24-29</td><td>Mostly 30+</td></tr>
<tr><td>Top-8 OVR rank</td><td>Top 6</td><td>Outside top 10</td></tr>
<tr><td>Cap tier</td><td>Under second apron</td><td>Taxpayer with no path down</td></tr>
<tr><td>Young assets (23 and under, 85+ POT)</td><td>Not required</td><td>At least one to build around</td></tr>
<tr><td>Ownership</td><td>Approval above 45</td><td>Inside grace window</td></tr>
</tbody>
</table>
<p>Whichever lane you pick, the <a href="/blog/trade-value-and-pick-protections">trade value guide</a> explains how to get the best price for what you are selling.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'trade-value-and-pick-protections',
    title: 'Trade Value and Pick Protections in BS Hoops: How the AI Prices a Deal',
    seoTitle: 'Basketball GM Trade Value Guide — Picks, Protections & AI Acceptance',
    metaDescription:
      'How BS Hoops values players and picks: the OVR curve, age multipliers, contract surplus and overpay penalties, pick values by slot, protection discounts, and what makes the AI accept.',
    keywords: ['basketball gm trade value', 'pick protections explained', 'how to win trades basketball gm', 'bs hoops trade tips'],
    publishDate: '2026-10-28',
    category: 'trades',
    readingTime: 8,
    summary:
      'A walk through the actual trade-value model: why an 85 is worth more than two 75s, how contracts move the price, what a #5 pick costs, and how much a top-10 protection takes off.',
    related: ['rebuild-or-contend-timeline', 'salary-cap-aprons-and-exceptions', 'draft-lottery-and-scouting'],
    content: `
<p>The AI front offices in BS Hoops do not accept trades by mood. Every player and pick is converted into a single trade-value number (the game calls it PTS), and a team accepts when what it receives is close enough to what it gives up — with adjustments for what kind of team it is. If you understand how PTS is built, you stop sending offers that get rejected and start finding the ones that work.</p>

<h2>Player value, step 1: a steep OVR curve</h2>
<p>The base value is <strong>((OVR − 50) / 45)³ × 4,500</strong>. Cubing the rating is what makes stars special:</p>
<table>
<thead><tr><th>OVR</th><th>Base PTS (before age/contract)</th></tr></thead>
<tbody>
<tr><td>70</td><td>~395</td></tr>
<tr><td>75</td><td>~770</td></tr>
<tr><td>80</td><td>~1,330</td></tr>
<tr><td>85</td><td>~2,120</td></tr>
<tr><td>90</td><td>~3,160</td></tr>
</tbody>
</table>
<p>Two 75s (about 1,540 combined) do not get you an 85 (about 2,120). Consolidation trades — two good players for one great one — favor the side receiving the star, which is why AI teams will rarely give you one.</p>

<h2>Step 2: age and potential</h2>
<p>The base is multiplied by an age factor: ×1.22 at 21 and under, ×1.25 at 22-23, ×1.18 at 24-25, ×1.08 at 26-27, ×1.0 at 28-29, ×0.82 at 30-31, ×0.6 at 32-33, ×0.4 at 34-35 and ×0.25 beyond. Unrealized potential adds a bonus too: each point between a player's OVR and potential is worth 6 PTS if he is 23 or younger, 3 PTS at 24-27, and 1 PTS after that.</p>
<p>A productive veteran also gets a floor based on last season's box score, so a 21-points-per-game 33-year-old is not valued like a bench player. That floor also decays with age.</p>

<h2>Step 3: the contract</h2>
<p>Salary modifies value; it is not the value. The game compares a player's salary to his market value (what he would ask as a free agent):</p>
<ul>
<li><strong>Underpaid:</strong> value is multiplied by up to ×1.55. Rookie-scale deals for good young players are the most valuable assets in the game.</li>
<li><strong>Overpaid:</strong> value drops by 70 PTS for every $1M above market — scaled by years remaining. With one year left only 35% of that penalty applies; with two years 60%; three years 85%; four or more, the full amount. A player can go as low as −1,200 PTS, which is why a team will attach picks to dump a bad multi-year deal.</li>
<li><strong>Expiring and positive:</strong> a modest ×0.9 "rental" discount.</li>
</ul>
<p>This is why an aging star on a big expiring deal is cheap to acquire at the deadline, and why the same player on a three-year extension is close to untradeable.</p>

<h2>Pick value</h2>
<p>A pick at a known slot is worth <strong>3,000 × e^(−0.075 × (pick − 1))</strong>. Some reference points: #1 = 3,000, #3 ≈ 2,580, #5 ≈ 2,220, #10 ≈ 1,530, #14 ≈ 1,130, #20 ≈ 720, #30 ≈ 340, #45 ≈ 110. Future picks are valued from where the original team is projected to finish, regressed toward roster quality early in the season (the game trusts standings fully only after about 41 games) and discounted for distance. A bad team's 2028 first is worth far more than a contender's.</p>

<h2>Pick protections</h2>
<p>When you trade a first-round pick you can attach a protection: "top-N protected" means if the pick lands at N or higher, the original team keeps it. You also choose how long the obligation can roll forward and what happens if it never conveys — it can void, or convert into that season's second-round pick.</p>
<p>The trade-value discount for a protection is <strong>1 − (N / 30) × 0.9</strong>, with a floor of 0.4:</p>
<table>
<thead><tr><th>Protection</th><th>Value multiplier</th></tr></thead>
<tbody>
<tr><td>Unprotected</td><td>1.00</td></tr>
<tr><td>Top-3</td><td>0.91</td></tr>
<tr><td>Top-5</td><td>0.85</td></tr>
<tr><td>Top-10</td><td>0.70</td></tr>
<tr><td>Lottery (top-14)</td><td>0.58</td></tr>
</tbody>
</table>
<p>Use protections when you are trading your own pick and are not sure how good you will be. A top-3 protection costs you only 9% of the pick's value but removes the nightmare scenario of handing a rival the #1 pick. Lottery protection, on the other hand, nearly halves the value; the AI will want a lot more for it.</p>

<h2>How the AI decides</h2>
<p>A team accepts when its net value (incoming minus outgoing PTS) is no worse than a tolerance of the larger of 150 PTS or 12% of what it is giving up. That tolerance is then tilted by the team's disposition:</p>
<ul>
<li><strong>Rebuilding / Developing</strong> teams get extra tolerance for taking on assets, but subtract 30% of the value of any incoming player 31 or older.</li>
<li><strong>Win Now</strong> teams pay a premium for proven veterans.</li>
<li><strong>Contending and Win Now</strong> teams discount raw prospects aged 20 and under by 15%.</li>
</ul>
<p>The trade screen shows each partner's disposition. Sell veterans to Win Now teams, sell prospects to rebuilders, and you capture the tilt instead of paying it.</p>

<h2>Don't forget salary matching</h2>
<p>A deal can be value-positive for both sides and still be illegal. Over-the-cap teams must match salary (see the <a href="/blog/salary-cap-aprons-and-exceptions">cap guide</a>), and teams above the second apron must match one-for-one. When a trade fails on salary, add an expiring contract — expiring overpays carry the smallest value penalty, so they are the cheapest filler.</p>

<h2>Five trade habits that work</h2>
<ol>
<li>Buy players aged 22-25 on rookie or below-market deals; they sit at the top of both the age and contract multipliers.</li>
<li>Sell players at 29-30, before the multiplier drops from 1.0 to 0.82 and then 0.6.</li>
<li>Prefer giving picks in the 20s over young rotation players — they are worth far less than they feel.</li>
<li>Protect your own picks top-3 or top-5 when you are uncertain; avoid giving lottery protection when you are the buyer.</li>
<li>Check the partner's disposition chip before building the offer.</li>
</ol>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'draft-lottery-and-scouting',
    title: 'Drafting in the Lottery Era: Odds, Scouting and Rookie Contracts in BS Hoops',
    seoTitle: 'Basketball GM Draft Guide — Lottery Odds, Scouting & Rookie Scale',
    metaDescription:
      'How the BS Hoops draft works: 14-team lottery odds, how far the worst team can fall, the 30-point tiered scouting system and projection grades, boom/bust development, and rookie-scale contract values.',
    keywords: ['basketball gm draft strategy', 'nba lottery odds game', 'basketball gm scouting', 'rookie scale contract'],
    publishDate: '2026-11-02',
    category: 'draft',
    readingTime: 8,
    summary:
      'The lottery is flatter than you think, scouting reports are noisy on purpose, and about one prospect in seven is a hidden bust. How to draft well anyway.',
    related: ['player-development-and-aging', 'trade-value-and-pick-protections', 'rebuild-or-contend-timeline'],
    content: `
<p>The draft is where cheap, long-term value is created in BS Hoops. A first-round pick arrives on a four-year rookie-scale contract that is almost always below his market value, which is the most valuable kind of asset in the game's trade model. But the draft is also designed to be uncertain: the lottery is flat at the top, the scouting reports are noisy, and some prospects simply will not develop. Here is how each part works.</p>

<h2>The lottery: 14 teams, three draws</h2>
<p>The 14 teams that miss the playoffs enter the lottery, seeded worst-to-best. The first three picks are drawn by weighted odds; picks 4-14 then follow the remaining reverse-standings order. Picks 15-30 go in reverse order of the playoff teams' records, and the second round runs in reverse standings across all 30 teams.</p>
<table>
<thead><tr><th>Lottery seed</th><th>Chance at #1</th></tr></thead>
<tbody>
<tr><td>1-3 (worst three)</td><td>14.0% each</td></tr>
<tr><td>4</td><td>12.5%</td></tr>
<tr><td>5</td><td>10.5%</td></tr>
<tr><td>6</td><td>9.0%</td></tr>
<tr><td>7</td><td>7.5%</td></tr>
<tr><td>8</td><td>6.0%</td></tr>
<tr><td>9</td><td>4.5%</td></tr>
<tr><td>10</td><td>3.0%</td></tr>
<tr><td>11</td><td>2.0%</td></tr>
<tr><td>12-14</td><td>1.5%, 1.0%, 0.5%</td></tr>
</tbody>
</table>
<p>Because only three picks are drawn, no team can fall more than three spots: the worst record picks no lower than #4, the fifth-worst no lower than #8. That flatness matters for strategy. Finishing worst instead of third-worst buys you nothing at #1 — the odds are identical — so there is no reason to strip a roster bare in March to win the race to the bottom.</p>

<h2>What a pick is worth</h2>
<p>In trade terms the #1 pick is worth 3,000 PTS — roughly the value of a 90-OVR player in his late twenties. Value falls about 7% per slot: #5 is about 2,220, #10 about 1,530, #20 about 720 and #30 about 340. Second-rounders are small: #45 is about 110.</p>

<h2>Rookie-scale contracts</h2>
<p>First-round picks sign four-year deals. Years one and two are guaranteed; years three and four are team options. The first-year salary is a fixed share of the cap by slot — 5.5% at #1, falling to about 1.2% at #30 — and rises about 7% per year. On the 2026-27 cap of $165.0M that is about $9.1M for the #1 pick, rising to about $11.1M in year four. Even a solid starter is usually worth several times that, which is why rookie deals carry a large surplus premium in trade value. Second-round picks sign two-year minimum deals.</p>

<h2>Scouting: a 30-point budget and three levels</h2>
<p>Before you scout a prospect, you see a <em>perceived</em> potential: his true ceiling plus deterministic noise with a standard deviation of about 5.5 points, shown as a range about ±12 points wide. It is converted into a grade:</p>
<ul>
<li><strong>A</strong> — star upside (perceived 85+)</li>
<li><strong>B</strong> — future starter (78-84)</li>
<li><strong>C</strong> — rotation (70-77)</li>
<li><strong>D</strong> — fringe (below 70)</li>
</ul>
<p>A 5.5-point standard deviation means a prospect shown as an 84 could genuinely be anywhere from the low 70s to the mid 90s — a rotation player or a franchise cornerstone. That is where busts and steals come from, and it is what your scouting budget is for. Each draft you get <strong>30 scouting points</strong>, spent in three levels (upgrading only costs the difference):</p>
<ul>
<li><strong>Quick look (1 point)</strong> — narrows the potential range to about ±8 and adds rough letter grades for shooting, finishing, playmaking, defense and athleticism.</li>
<li><strong>Workout (3 points)</strong> — narrows the range to about ±4, sharpens those grades, and adds combine-style measurables (height, wingspan, reach, verticals, agility, sprint) plus strengths and question marks.</li>
<li><strong>Full evaluation (6 points)</strong> — the exact ceiling, an archetype and comparison, and a verdict: <em>Gem</em>, <em>As advertised</em> or <em>Bust risk</em>.</li>
</ul>
<p>Thirty points buys four full evaluations plus six quick looks, so you cannot fully vet everyone. Ranges only ever narrow and always contain the true ceiling, so even a quick look is honest information.</p>

<h3>Where to spend your points</h3>
<ol>
<li><strong>Quick-look the whole range around your pick.</strong> At 1 point each, a sweep of the ten players likely to be there when you pick tells you which grades are soft.</li>
<li><strong>Full-evaluate the finalists.</strong> If you pick at #7 and three players graded B+ survive the sweep, spend 6 on each — the verdict is the tiebreaker.</li>
<li><strong>Players you are considering reaching for.</strong> Confirm the ceiling before you take someone ten spots early.</li>
<li><strong>Not the consensus top two.</strong> If you hold #1, you are taking one of them anyway. In the real-roster league, the top of each class is anchored to a consensus big board, so the AI drafts the obvious names in order.</li>
<li><strong>Keep a few points for a trade-up.</strong> If you trade into the top ten on draft night, you want to know who you are buying.</li>
</ol>
<p>The draft room's <strong>Mock Draft</strong> tab projects every pick using the same logic the AI teams use when they are on the clock, so it shows who is realistically left at your slot — scout those players, not the ones who will be gone.</p>

<h2>The hidden trait: boom, normal or bust</h2>
<p>Every player carries a hidden development trait that is fixed for his whole career in your save. It multiplies how much he grows each offseason:</p>
<ul>
<li>About 15% are <strong>busts</strong>: they grow at 35-70% of the normal rate.</li>
<li>About 70% are <strong>normal</strong>: 80-120%.</li>
<li>About 15% are <strong>booms</strong>: 125-170%, often blowing past their listed potential.</li>
</ul>
<p>A full evaluation is the only way to read the trait before draft night: the <em>Gem</em> verdict flags a boom trait (or a ceiling well above his public grade), and <em>Bust risk</em> flags a bust trait (or a ceiling well below it). Everyone you did not fully evaluate is a coin flip you find out about only by watching his ratings move after his first offseason or two. That is why multiple first-rounders in one class are far more reliable than betting everything on one pick.</p>

<h2>Draft-night tactics</h2>
<ul>
<li><strong>Draft for upside early, need late.</strong> Positional need matters less than you think: starters are picked by position group (two guards, two forwards, a center), and wings and combo players fit almost anywhere.</li>
<li><strong>Trade down when your board has a tier break.</strong> If five players share the same grade and you are at the front of that tier, moving back three spots costs about 20% of the pick's value and you still get a player from the tier.</li>
<li><strong>Use young players' rotation boost.</strong> The auto-built bench gives young, high-upside players a small priority bump so they crack the ten-man rotation. See the <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a> to give them more.</li>
<li><strong>Remember the team options.</strong> Years three and four of a rookie deal are cheap control. Don't trade a 21-year-old who is improving before you have seen what a boom trait does to him.</li>
</ul>
<p>Drafting well is less about picking the right name at #3 and more about collecting enough good bets that two or three of them hit. The <a href="/blog/player-development-and-aging">development guide</a> covers what happens to them next.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'player-development-and-aging',
    title: 'Player Development and Aging Curves: When to Sell a Veteran in BS Hoops',
    seoTitle: 'Basketball GM Player Development — Aging Curve, Potential & Retirement',
    metaDescription:
      'How players develop and decline in BS Hoops: expected OVR change by age, the potential pull, boom and bust traits, which ratings age first, retirement rules, and the right time to sell.',
    keywords: ['basketball gm player development', 'aging curve basketball gm', 'when to trade veterans', 'potential rating basketball gm'],
    publishDate: '2026-11-07',
    category: 'development',
    readingTime: 7,
    summary:
      'Young players climb about 3.5 OVR a year, peaks are flat from 26 to 28, and decline speeds up after 31. Athleticism goes first. Here is how to time every decision around it.',
    related: ['draft-lottery-and-scouting', 'rebuild-or-contend-timeline', 'trade-value-and-pick-protections'],
    content: `
<p>Ratings in BS Hoops change once a year, at the offseason rollover. There is no mid-season development; what you see on opening night is what you get until the summer. That makes every offseason a checkpoint — and makes it possible to plan a roster several years ahead with surprising accuracy.</p>

<h2>The expected change by age</h2>
<p>Each player's yearly OVR change is an expected drift for his new age plus random noise. The noise is wider for young players (a standard deviation of about 2.5 OVR through age 22) than for veterans (about 1.5-1.8).</p>
<table>
<thead><tr><th>Age</th><th>Expected OVR change per year</th><th>What it feels like</th></tr></thead>
<tbody>
<tr><td>≤21</td><td>+3.5</td><td>Steep rise</td></tr>
<tr><td>22-23</td><td>+2.0</td><td>Still climbing</td></tr>
<tr><td>24-25</td><td>+1.0</td><td>Approaching peak</td></tr>
<tr><td>26-28</td><td>0</td><td>Peak plateau</td></tr>
<tr><td>29-31</td><td>−1.2</td><td>Subtle decline</td></tr>
<tr><td>32-34</td><td>−2.2</td><td>Clear decline</td></tr>
<tr><td>35-37</td><td>−3.0</td><td>Steep decline</td></tr>
<tr><td>38+</td><td>−3.5</td><td>Final years</td></tr>
</tbody>
</table>
<p>Add those up and a 19-year-old typically gains around 11-12 OVR by 24 before any potential effects. A 30-year-old typically loses about 1-2 per year until 31, then accelerates.</p>

<h2>The potential pull</h2>
<p>Potential (POT) is not just a label. Young players below their ceiling get an extra upward pull each year: at 23 and younger it is 16% of the gap between OVR and POT (capped at +2.2 per year), and at 24-26 it is 8% of the gap (capped at +1.0). After 26 it disappears. A 19-year-old at 78 OVR with 90 potential has a 12-point gap, so he gets about +1.9 on top of his +3.5 age drift — an expected jump of more than five points in his first offseason, before his hidden trait is applied.</p>
<p>That hidden trait (bust, normal or boom) scales growth only, by anywhere from 0.35× to 1.7×. It never changes how a veteran declines. The <a href="/blog/draft-lottery-and-scouting">draft guide</a> explains how often each occurs.</p>

<h2>Which ratings age first</h2>
<p>Decline is not uniform. After 30:</p>
<ul>
<li><strong>Speed and vertical</strong> decline at 1.4× the overall drift — athleticism goes first.</li>
<li><strong>Shooting and handles</strong> decline at only 0.6× — skills hold.</li>
<li><strong>Free throws</strong> move at 0.4× the drift, and <strong>passing</strong> at 0.5×.</li>
<li><strong>Blocks</strong> decline faster (1.2×) after 30.</li>
<li><strong>Basketball IQ</strong> actually ticks <em>up</em> slightly every year from 24 through 33.</li>
</ul>
<p>So an elite shooter or passer ages much more gracefully than an athletic slasher or a shot-blocking center with the same overall. If you are choosing which veteran to keep, keep the shooter.</p>

<h2>Retirement</h2>
<p>Players retire automatically at 40, at 35+ with an OVR below 60, or at 33+ below 55. There are also voluntary retirements: a 15% chance each summer for a 35+ player below 75 OVR, and 25% for a 37+ player below 80. A 38-year-old on a multi-year deal is a real retirement risk — and his contract is a trade liability while it lasts.</p>

<h2>When to sell a veteran</h2>
<p>Combine the aging curve with the trade-value model and a clear rule emerges: <strong>sell between 29 and 30</strong>, ideally at the trade deadline of a season you are not contending in. At that age:</p>
<ul>
<li>His OVR is still near peak (decline only just started).</li>
<li>His trade-value age multiplier is 1.0 (28-29) or 0.82 (30-31). At 32-33 it is 0.6.</li>
<li>Contenders and Win-Now teams still value him; rebuilders discount anyone 31 or older by 30%.</li>
</ul>
<p>The real-roster league shows the cliff clearly. Several 36-to-41-year-old stars still rate in the mid-80s, but on large expiring or multi-year contracts they register <em>negative</em> trade value — their salaries exceed what the market would pay at their age. They are worth far more on the court for a contender than on the trade market.</p>

<h2>When to extend a young player</h2>
<p>A player on a rookie deal who is 22-23 and still well below his potential is about to get more expensive. Each offseason he grows and his market value rises (market salary is a percentage of the cap tied to OVR — a 76 asks about 9% of the cap, an 82 about 20%). Extending him a year early, before his next jump, locks in a lower number. Players also accept a small discount to re-sign with the team that holds their Bird rights.</p>

<h2>A worked example: two 19-year-olds</h2>
<p>The 2026 draft class in the real-roster league includes several 19-year-olds rated around 80 OVR with potential in the low-90s. Take a prospect at 80 OVR with 92 potential and follow the expected path, ignoring noise:</p>
<ul>
<li><strong>Age 20:</strong> +3.5 age drift plus a potential pull of 16% of the 12-point gap (+1.9) ≈ <strong>85</strong>.</li>
<li><strong>Age 21:</strong> +3.5 plus 16% of a 7-point gap (+1.1) ≈ <strong>90</strong>.</li>
<li><strong>Age 22:</strong> +2.0 plus a small pull ≈ <strong>92</strong>, essentially at his ceiling.</li>
</ul>
<p>That is a normal-trait player. A boom trait (up to 1.7× growth) can reach the same level a year earlier and then keep pushing his potential up; a bust trait (as low as 0.35×) might be stuck near 84 at 22. You cannot see which one you have on draft night, so the first offseason is the real scouting report. If the player gains five or more points in his first summer, he is at least normal. If he gains one or two, recalibrate before you build around him — and remember his trade value is still driven by his age, his potential and his rookie contract, so other teams may value him more than his trajectory deserves.</p>

<h2>A development calendar</h2>
<table>
<thead><tr><th>Player age</th><th>Default action</th></tr></thead>
<tbody>
<tr><td>19-21</td><td>Get him into bench slots 1-5; never sell unless he's a clear bust after two offseasons.</td></tr>
<tr><td>22-24</td><td>Extend early if he's on track; peak trade value window.</td></tr>
<tr><td>25-28</td><td>Core years — build the contention window here.</td></tr>
<tr><td>29-30</td><td>Sell unless you're a contender this season.</td></tr>
<tr><td>31+</td><td>Short deals only; prefer shooters and passers.</td></tr>
</tbody>
</table>
<p>The best franchises in BS Hoops are built by aligning three or four players' age curves so their 25-28 plateaus overlap. The <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend framework</a> shows how to engineer that overlap.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'game-plans-and-pace',
    title: 'Game Plans and Pace in BS Hoops: What Every Setting Actually Does',
    seoTitle: 'Basketball GM Game Plan Guide — Pace, Three-Point Focus, Press & Zone',
    metaDescription:
      'The exact effect of every BS Hoops game-plan setting: pace in seconds per possession, perimeter vs. inside focus, hero ball, the full-court press, packing the paint, zone defense, and coaching schemes.',
    keywords: ['basketball gm game plan', 'basketball sim pace strategy', 'full court press basketball gm', 'basketball gm tactics'],
    publishDate: '2026-11-12',
    category: 'strategy',
    readingTime: 7,
    summary:
      'Fast pace means more possessions, perimeter focus means 40% more threes, and the press forces 40% more turnovers — at a price. The real numbers behind each game-plan dial.',
    related: ['rotation-bench-order-and-minutes', 'first-season-beginners-guide', 'rebuild-or-contend-timeline'],
    content: `
<p>The Game Plan in BS Hoops is not cosmetic. Each setting is a multiplier inside the possession simulator, applied to every trip down the floor. Leave everything on "balanced" and the sim runs neutral; change a dial and you change shot selection, turnover rates and shooting percentages. This guide lists what each one does and when it helps.</p>

<h2>Pace: how many possessions</h2>
<p>Pace sets the average length of a possession: about 12 seconds for fast, 14.5 for balanced and 17 for slow. Over a 48-minute game that is the difference between roughly 120 and 85 possessions per team. The game's pace is the <em>average</em> of both teams' settings, rounded, so a fast team playing a slow team ends up at balanced.</p>
<p>Your head coach's scheme then nudges it further: a five-out scheme plays about 4% faster, the "flow" scheme 10% faster, a Princeton motion scheme 5% slower and the triangle 12% slower.</p>
<h3>When to change it</h3>
<ul>
<li><strong>Play fast when you are the better team.</strong> More possessions means less variance — the talent edge has more chances to show up.</li>
<li><strong>Play slow when you are the underdog.</strong> Fewer possessions means more randomness, which is what an underdog wants. Combine slow pace with a conservative shot profile to shorten the game.</li>
</ul>

<h2>Offensive focus: where the shots come from</h2>
<p>"Perimeter" multiplies the three-point attempt rate by 1.4; "inside" multiplies it by 0.6 and pushes those shots to the rim and post. Your coach's scheme stacks on top — five-out adds another 15% to three-point attempts and cuts post-ups by 30%, while the triangle cuts threes by 20% and adds 30% more post-ups.</p>
<p>Look at your personnel. If your rotation's three-point ratings are in the 70s, perimeter focus is free efficiency. If your best players are a post-scoring center and a slashing forward with weak shooting, "inside" puts the ball where they are good.</p>

<h2>Shot risk: hero ball vs. conservative</h2>
<table>
<thead><tr><th>Setting</th><th>3PA rate</th><th>Turnovers</th><th>Make rate</th></tr></thead>
<tbody>
<tr><td>Conservative</td><td>×0.92</td><td>×0.92</td><td>×1.02</td></tr>
<tr><td>Balanced</td><td>×1.00</td><td>×1.00</td><td>×1.00</td></tr>
<tr><td>Hero</td><td>×1.12</td><td>×1.08</td><td>×0.97</td></tr>
</tbody>
</table>
<p>Hero ball is a variance play: more threes, slightly worse shots, slightly more turnovers. It makes sense late in a game you are losing, or for an underdog that needs a hot shooting night. Conservative is the favorite's setting: fewer giveaways and slightly better looks.</p>

<h2>Pressure: press vs. pack the paint</h2>
<p>The base turnover rate in BS Hoops is about 12.8% of possessions. Defensive pressure changes it:</p>
<ul>
<li><strong>Full-court press:</strong> opponents turn it over 40% more often (about 17.9% of possessions instead of 12.8%) — but when the press is beaten, they shoot 5% better.</li>
<li><strong>Pack the paint:</strong> opponents shoot 4% worse, but force 8% fewer turnovers.</li>
</ul>
<p>The press pays off when your roster has high steal ratings (steals are credited to defenders weighted by their steal rating) and the opponent's ball-handlers have weak handles — turnovers are assigned by usage minus handles, so a team with a shaky primary ball-handler bleeds possessions. Pack the paint against interior-heavy teams that rely on finishing at the rim.</p>

<h2>Defensive scheme: man, zone, switch</h2>
<p>A set zone lowers the opponent's make rate by 2%. That is a small, steady edge with no turnover trade-off, which makes zone a reasonable default against teams without great shooters. Your head coach's own defensive intensity multiplies turnovers forced on top of this; horns and triangle coaches play about 5% more intense defense.</p>

<h2>Rotation: ride the starters or spread minutes</h2>
<p>Covered in depth in the <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a>: "ride the starters" plays your top five in six-possession stints with one-possession bench breaks; "spread minutes" uses three-and-two. Riding the starters is the single biggest in-game edge for a top-heavy team in a playoff series.</p>

<h2>Your coach's scheme is a permanent game plan</h2>
<p>The game plan is something you set per game. Your head coach's scheme is always on, and it stacks with whatever you choose. The four schemes you will meet most often:</p>
<table>
<thead><tr><th>Scheme</th><th>Pace</th><th>3PA rate</th><th>Post-ups</th><th>Defensive intensity</th></tr></thead>
<tbody>
<tr><td>Five-out</td><td>×1.04</td><td>×1.15</td><td>×0.70</td><td>×1.00</td></tr>
<tr><td>Horns</td><td>×1.00</td><td>×1.00</td><td>×0.95</td><td>×1.05</td></tr>
<tr><td>Princeton</td><td>×0.95</td><td>×1.05</td><td>×0.90</td><td>×1.00</td></tr>
<tr><td>Triangle</td><td>×0.88</td><td>×0.80</td><td>×1.30</td><td>×1.05</td></tr>
</tbody>
</table>
<p>Because these multiply, a five-out coach with a "perimeter" game plan takes threes at about 1.6× the neutral rate (1.15 × 1.4), and adding hero ball pushes it to about 1.8×. A triangle coach on "inside" focus takes barely half the neutral number of threes. If your roster and your coach disagree — a triangle coach with a roster of shooters — either the game plan has to fight the scheme every night or it is time to change coaches in the offseason. The cheapest fix is the one that lines all three up: personnel, scheme and plan.</p>

<h2>Home court</h2>
<p>Home teams get about 2.5 points of expected advantage in the regular season and 3.5 in the playoffs. That is worth knowing when you decide whether to rest players late in the season: a top seed is worth roughly a point a game more in the playoffs than in March.</p>

<h2>Three game plans to try</h2>
<table>
<thead><tr><th>Situation</th><th>Pace</th><th>Focus</th><th>Risk</th><th>Pressure</th><th>Rotation</th></tr></thead>
<tbody>
<tr><td>Heavy favorite</td><td>Fast</td><td>Match personnel</td><td>Conservative</td><td>Balanced</td><td>Balanced</td></tr>
<tr><td>Big underdog</td><td>Slow</td><td>Perimeter</td><td>Hero</td><td>Press</td><td>Starters</td></tr>
<tr><td>Playoff series, top-heavy roster</td><td>Balanced</td><td>Match personnel</td><td>Balanced</td><td>Pack</td><td>Starters</td></tr>
</tbody>
</table>
<p>None of these settings will turn a 30-win roster into a contender — talent still dominates. But over 82 games a few percentage points on turnovers and shooting is worth several wins, and in a seven-game series it can be the difference.</p>
`,
  },
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'free-basketball-gm-games-browser',
    title: 'Free Basketball GM Games You Can Play in Your Browser (No Download)',
    seoTitle: 'Free Basketball GM Games in Your Browser (No Download) — 2026 Guide',
    metaDescription:
      'The best free basketball GM and management games you can play in a browser with no download: what BS Hoops, Basketball GM and others offer, how they differ, and which one fits how you like to play.',
    keywords: ['free basketball gm games', 'basketball gm browser game', 'free basketball management game no download', 'basketball general manager game online', 'play basketball gm free'],
    publishDate: '2026-10-24',
    category: 'getting-started',
    readingTime: 6,
    summary:
      'You do not need a console, a $70 game or an install to run an NBA-style front office. A guide to the free basketball GM games that run in a browser tab, what each does best, and how to pick one.',
    related: ['first-season-beginners-guide', 'basketball-gm-tips-for-beginners', 'nba-2k-myleague-alternative'],
    content: `
<p>Basketball GM games have a simple promise: you are the front office. You draft, trade, sign free agents, manage the cap, and live with the results for decades of simulated seasons. For a long time the deepest versions of that fantasy lived inside console games or paid PC sims. Today you can get most of it in a browser tab, for free, with nothing to install. This guide covers what to look for and how the main free options compare.</p>

<h2>What makes a good browser basketball GM game?</h2>
<p>Before comparing games, it helps to know which features actually matter once you are 20 seasons into a save:</p>
<ul>
<li><strong>A real salary cap.</strong> A hard number with no exceptions makes every team the same. A soft cap with Bird rights, exceptions and aprons forces real trade-offs.</li>
<li><strong>A trade AI that can say no.</strong> If the computer accepts lopsided deals, the game is over in one offseason.</li>
<li><strong>Player development that is uncertain.</strong> Prospects should boom and bust. If every rookie hits his ceiling, drafting is a formality.</li>
<li><strong>A sim you can watch.</strong> Box scores are fine; seeing why you lost is better.</li>
<li><strong>Saves you will not lose.</strong> Browser games store data locally, so look for unlimited saves and a way to sync across devices.</li>
<li><strong>Real or realistic rosters.</strong> Some players want fictional leagues; others want to fix their favorite franchise.</li>
</ul>

<h2>BS Hoops</h2>
<p><a href="/">BS Hoops</a> is a free basketball GM game that runs entirely in your browser, with no download and no account required to start. You pick one of 30 franchises and run a full 82-game season, then the draft, free agency and the next season, as long as you want.</p>
<p>What it does differently:</p>
<ul>
<li><strong>Possession-by-possession simulation.</strong> Every game is simulated possession by possession, and you can watch your own games live with a shot chart, win probability and game flow, or replay recent games from the box score.</li>
<li><strong>A real-style soft cap.</strong> The 2026-27 cap is $165.0M, with a luxury tax line, two aprons, the Mid-Level, Bi-Annual and Room exceptions, and Bird rights. Our <a href="/blog/salary-cap-aprons-and-exceptions">cap guide</a> breaks down each rung.</li>
<li><strong>Trades with teeth.</strong> Salary matching, pick protections, a trade finder, and an AI that values players by rating, age and contract. See <a href="/blog/trade-value-and-pick-protections">how the AI prices a deal</a>.</li>
<li><strong>A noisy draft.</strong> A 14-team lottery, tiered scouting, and hidden boom/bust development traits.</li>
<li><strong>Real rosters, optional.</strong> Start a generated league, or <a href="/rosters">import a real roster</a> converted to BS Hoops ratings. Every team's payroll, cap tier and depth chart is browsable under <a href="/rosters/2026">2026 rosters</a> before you commit.</li>
<li><strong>Coaching levers.</strong> Starters, bench order and game plans (pace, shot profile, press or pack the paint) all feed the sim.</li>
</ul>
<p>The free tier includes the full season sim, draft, lottery, free agency, trades, all stats and history, custom league settings, and multiple leagues with unlimited saves. An optional <a href="/pricing">Premium plan</a> removes ads and adds AI game commentary, audio podcasts and extra scouting and free-agent intel. Sign in if you want saves synced across devices. BS Hoops is a parody and simulation, not affiliated with the NBA.</p>

<h2>Basketball GM</h2>
<p>Basketball GM is the long-running, open-source browser basketball manager and the game many people picture when they hear the term. It is free, text-and-table driven, and famously deep, with random-player leagues by default, a large modding and custom-roster community, and a huge amount of historical and statistical detail. If you love spreadsheets and long dynasties, it has earned its reputation. If you want to see games play out visually or want NBA-style cap mechanics like aprons front and center, you may prefer something else. We wrote a fair side-by-side at <a href="/vs/basketball-gm">BS Hoops vs Basketball GM</a>, and a broader list at <a href="/alternatives/basketball-gm">Basketball GM alternatives</a>.</p>

<h2>What about NBA 2K MyLeague and MyGM?</h2>
<p>NBA 2K's franchise modes are the deepest licensed option, with official players, presentation and the ability to play the games yourself. They are not browser games, though: they come with the paid annual release on console or PC. If that is the depth you want without the hardware, our <a href="/blog/nba-2k-myleague-alternative">MyLeague alternative guide</a> and the <a href="/vs/nba-2k-myleague">BS Hoops vs NBA 2K MyLeague</a> comparison cover what carries over and what does not.</p>

<h2>Other names you will see</h2>
<ul>
<li><strong>Hoop Land</strong> is a retro-styled basketball game where you can play the games yourself as well as run a franchise; it is built as a downloadable app rather than a browser game.</li>
<li><strong>Draft Day Sports: Pro Basketball</strong> is a long-running, text-based PC simulation for players who want a traditional desktop sim. It is a paid download.</li>
</ul>
<p>Both are good at what they do; neither is a free, open-a-tab-and-play browser game. Our roundup of the <a href="/best/basketball-gm-games">best basketball GM games</a> covers the whole field, including paid ones.</p>

<h2>Quick comparison</h2>
<table>
<thead><tr><th>Game</th><th>Platform</th><th>Free to play</th><th>Watch your games</th></tr></thead>
<tbody>
<tr><td>BS Hoops</td><td>Any browser, no download</td><td>Yes (optional Premium)</td><td>Yes, possession by possession with shot chart and win probability</td></tr>
<tr><td>Basketball GM</td><td>Any browser, no download</td><td>Yes</td><td>Box score and play-by-play</td></tr>
<tr><td>NBA 2K MyLeague / MyGM</td><td>Console and PC</td><td>No</td><td>Yes, fully playable</td></tr>
<tr><td>Hoop Land</td><td>Downloadable app</td><td>Varies by platform</td><td>Yes, playable</td></tr>
<tr><td>Draft Day Sports Pro Basketball</td><td>PC download</td><td>No</td><td>Text play-by-play</td></tr>
</tbody>
</table>

<h2>Which one should you play?</h2>
<ul>
<li><strong>You want to start in 30 seconds on any computer:</strong> a browser game. BS Hoops or Basketball GM.</li>
<li><strong>You want the cap to feel like the real thing:</strong> BS Hoops, where second-apron teams lose the Mid-Level and must match salaries one-for-one.</li>
<li><strong>You want to see your team play:</strong> BS Hoops' live game viewer, or a console game if you want to control players.</li>
<li><strong>You want maximum modding and historical leagues:</strong> Basketball GM's community is hard to beat.</li>
</ul>

<h2>Getting started in BS Hoops</h2>
<p>Open the <a href="/">home page</a>, click a team, and your first season is waiting. If you would rather run a real franchise, start from <a href="/rosters">Rosters</a>. Not sure which team? Our data breakdown of the <a href="/blog/best-nba-teams-to-rebuild-2026">best and hardest teams to take over</a> ranks all 30 by cap room, young talent and draft capital. Then read the <a href="/blog/first-season-beginners-guide">first-season guide</a> and the <a href="/blog/basketball-gm-tips-for-beginners">15 tips every new GM should know</a>, and you will be ahead of most AI front offices by the trade deadline.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'best-nba-teams-to-rebuild-2026',
    title: 'Best (and Hardest) NBA Teams to Take Over in 2026-27',
    seoTitle: 'Best NBA Teams to Rebuild in 2026-27 — Easiest & Hardest GM Saves',
    metaDescription:
      'Which NBA franchise should you take over in a basketball GM game? We ranked all 30 2026-27 rosters by cap room, young high-potential talent, future picks and second-apron pain. The five easiest and five hardest saves.',
    keywords: ['best nba teams to rebuild', 'best team to rebuild basketball gm', 'nba teams cap space 2026', 'hardest nba team to rebuild', 'nba second apron teams 2026'],
    publishDate: '2026-10-25',
    category: 'strategy',
    readingTime: 7,
    summary:
      'Four teams start under the $165.0M cap and nine start above the second apron. Using the real 2026-27 roster data in BS Hoops, here are the five friendliest franchises to take over and the five that will test you.',
    related: ['rebuild-or-contend-timeline', 'salary-cap-aprons-and-exceptions', 'draft-lottery-and-scouting'],
    content: `
<p>Picking a team is the first and most consequential decision in any basketball GM save. Pick a team buried above the second apron with an aging core and no picks, and you spend three seasons fighting the cap instead of building. Pick a team with room, young talent and extra draft capital, and every system in the game works for you. We pulled the numbers for all 30 franchises from the real-roster league in BS Hoops, using the same ratings and contracts you get when you import it, and ranked them.</p>

<h2>How we ranked them</h2>
<p>For each team we looked at five things, all straight from the <a href="/rosters/2026">2026 roster pages</a>:</p>
<ul>
<li><strong>Payroll and cap tier</strong> against the 2026-27 lines: a $165.0M cap, $200.5M tax line, $209.1M first apron and $221.8M second apron.</li>
<li><strong>Average roster age.</strong></li>
<li><strong>Top-8 average OVR</strong> and its rank among the 30 teams.</li>
<li><strong>Future picks</strong> owned from other teams versus own picks owed away (first and second round).</li>
<li><strong>Young upside</strong>: players 23 and under with 80+ potential.</li>
</ul>
<p>Across the league, only four teams start under the cap (Charlotte, Milwaukee, Brooklyn and Memphis) and nine start above the second apron. That spread is why team choice matters so much: the <a href="/blog/salary-cap-aprons-and-exceptions">cap and aprons guide</a> explains exactly which tools each tier takes away.</p>

<h2>The five easiest teams to take over</h2>
<table>
<thead><tr><th>Team</th><th>Payroll</th><th>Cap tier</th><th>Avg age</th><th>Top-8 OVR (rank)</th><th>Picks in / out</th><th>Young 80+ POT</th></tr></thead>
<tbody>
<tr><td><a href="/rosters/2026/bkn">Brooklyn Nets</a></td><td>$156.8M</td><td>Under the cap</td><td>23.8</td><td>76.6 (#28)</td><td>19 / 1</td><td>6</td></tr>
<tr><td><a href="/rosters/2026/cha">Charlotte Hornets</a></td><td>$151.8M</td><td>Under the cap</td><td>24.8</td><td>78.5 (#19)</td><td>14 / 2</td><td>5</td></tr>
<tr><td><a href="/rosters/2026/mem">Memphis Grizzlies</a></td><td>$159.7M</td><td>Under the cap</td><td>24.8</td><td>78.0 (#22)</td><td>5 / 3</td><td>5</td></tr>
<tr><td><a href="/rosters/2026/uta">Utah Jazz</a></td><td>$180.5M</td><td>Over the cap</td><td>25.3</td><td>80.3 (#5)</td><td>10 / 4</td><td>6</td></tr>
<tr><td><a href="/rosters/2026/sas">San Antonio Spurs</a></td><td>$209.1M</td><td>Taxpayer</td><td>26.0</td><td>79.9 (#6)</td><td>8 / 1</td><td>7</td></tr>
</tbody>
</table>

<h3>1. Brooklyn Nets: the draft-capital mountain</h3>
<p><a href="/rosters/2026/bkn">Brooklyn</a> is the purest rebuild in the league. Payroll is $156.8M, $8.3M under the cap, the roster averages 23.8 years old, and the Nets own 19 future picks from other teams while owing just one of their own. Six players 23 and under carry 80+ potential, led by 20-year-old point guard Mikel Brown Jr. (75 OVR, 87 POT). The current rotation ranks #28, so year one will be rough, but you have more trade ammunition than anyone. Julius Randle (31) is exactly the kind of veteran the <a href="/blog/rebuild-or-contend-timeline">rebuild framework</a> says to sell before his age multiplier drops again.</p>

<h3>2. Charlotte Hornets: room, youth and picks</h3>
<p><a href="/rosters/2026/cha">Charlotte</a> has the lowest payroll in the league at $151.8M, $13.3M of cap room, 14 future picks in against two out, and $52.8M of expiring salary. The top three are all 24 or younger: Ryan Kalkbrenner (83/85) and Moussa Diabate (82/84) on cheap deals, plus Brandon Miller (23, 79/84). Kon Knueppel (20, 77/89) is the long-term centerpiece. This is the friendliest save for learning every system, because you can sign a free agent outright and still use the Room Exception afterward.</p>

<h3>3. Memphis Grizzlies: a 19-year-old cornerstone and room</h3>
<p><a href="/rosters/2026/mem">Memphis</a> sits $5.3M under the cap at $159.7M with an average age of 24.8. The prize is Cameron Boozer, a 19-year-old center at 81 OVR with 93 potential, next to 24-year-old Zach Edey (84/86) on a $6.8M deal. Five young players have 80+ potential and $65.5M expires after the season. It is the best combination of a present-day frontcourt and a future star among the under-cap teams.</p>

<h3>4. Utah Jazz: a superstar prospect and a full Mid-Level</h3>
<p><a href="/rosters/2026/uta">Utah</a> is over the cap at $180.5M, but $41.3M below the second apron, so the full Non-Tax Mid-Level is available. More importantly, the Jazz have Darryn Peterson, a 19-year-old shooting guard at 86 OVR with 98 potential, on a $12.1M rookie-scale deal. The top-8 already ranks #5, six young players have 80+ potential, and Utah owns 10 future picks against four owed. Few saves let you contend and stockpile at the same time.</p>

<h3>5. San Antonio Spurs: build around Wembanyama</h3>
<p><a href="/rosters/2026/sas">San Antonio</a> is the one team on this list in the tax, at $209.1M, but it earns its spot. Victor Wembanyama is 22, rated 94 OVR with 99 potential, and paid $15.1M. Stephon Castle (21, 81/89) is the second piece, seven young players carry 80+ potential, the Spurs own eight future picks while owing one, and $81.3M expires after the season. The cap gets easy fast; the challenge is simply not wasting the window.</p>

<h2>The five hardest teams to take over</h2>
<table>
<thead><tr><th>Team</th><th>Payroll</th><th>Over 2nd apron by</th><th>Avg age</th><th>Top-8 OVR (rank)</th><th>Picks in / out</th><th>Young 80+ POT</th></tr></thead>
<tbody>
<tr><td><a href="/rosters/2026/gsw">Golden State Warriors</a></td><td>$225.0M</td><td>$3.2M</td><td>28.6</td><td>78.9 (#15)</td><td>0 / 5</td><td>2</td></tr>
<tr><td><a href="/rosters/2026/den">Denver Nuggets</a></td><td>$233.8M</td><td>$12.0M</td><td>26.8</td><td>79.3 (#13)</td><td>0 / 9</td><td>2</td></tr>
<tr><td><a href="/rosters/2026/cle">Cleveland Cavaliers</a></td><td>$243.0M</td><td>$21.2M</td><td>27.3</td><td>79.4 (#11)</td><td>0 / 8</td><td>0</td></tr>
<tr><td><a href="/rosters/2026/nyk">New York Knicks</a></td><td>$240.7M</td><td>$18.9M</td><td>26.3</td><td>80.3 (#4)</td><td>4 / 7</td><td>1</td></tr>
<tr><td><a href="/rosters/2026/mia">Miami Heat</a></td><td>$217.1M</td><td>($4.8M under)</td><td>26.9</td><td>79.8 (#8)</td><td>0 / 7</td><td>0</td></tr>
</tbody>
</table>

<h3>1. Golden State Warriors: the oldest roster in the league</h3>
<p><a href="/rosters/2026/gsw">Golden State</a> has the highest average age of any team, 28.6, and the top three average 32.3: Stephen Curry (38, 85 OVR, $61.1M) and Jimmy Butler (36, 83 OVR, $55.5M) around 23-year-old Yaxel Lendeborg. Payroll is $225.0M, $3.2M over the second apron, with no extra picks and five owed. The silver lining is enormous: $199.3M expires after the season. Survive one year and the cap sheet resets.</p>

<h3>2. Denver Nuggets: the best player, the thinnest cupboard</h3>
<p><a href="/rosters/2026/den">Denver</a> has Nikola Jokic, the highest-rated player in the league at 97 OVR, but he is 31 and five of the top eight are 30 or older. Payroll is $233.8M, $12.0M over the second apron, and the Nuggets own no extra picks while owing nine of their own. With no Mid-Level and one-for-one matching, every upgrade has to come from a trade you can barely make.</p>

<h3>3. Cleveland Cavaliers: elite now, no runway</h3>
<p><a href="/rosters/2026/cle">Cleveland</a> won 64 games last season and its core is in its prime: Jarrett Allen (28) and Donovan Mitchell (29) are both 87s, with Evan Mobley (25, 83/85). But payroll is $243.0M, $21.2M over the second apron, the Cavs owe eight picks and own none, and not one player 23 or under has 80+ potential. You are contending on a clock with no replacement parts.</p>

<h3>4. New York Knicks: top-four talent, second-apron handcuffs</h3>
<p><a href="/rosters/2026/nyk">New York</a> has the league's #4 top-eight at 80.3, led by Karl-Anthony Towns (30, 87 OVR). Payroll is $240.7M, $18.9M over the second apron, and only $35.9M expires. The Knicks own four future picks but owe seven, and just one young player carries 80+ potential. Good enough to win now, very hard to improve at the deadline.</p>

<h3>5. Miami Heat: a superstar and nothing in reserve</h3>
<p><a href="/rosters/2026/mia">Miami</a> is technically $4.8M under the second apron at $217.1M, but it has the profile of a hard save: Giannis Antetokounmpo (31, 94 OVR) and Bam Adebayo (28, 87), four of the top eight aged 30+, no young players with 80+ potential, and seven picks owed with none coming in. The out is $135.7M of expiring salary; the risk is a slow slide while you wait for it.</p>

<h2>Honorable mentions</h2>
<p><a href="/rosters/2026/okc">Oklahoma City</a> has the highest payroll in the league, $265.0M and $43.2M over the second apron, but owns 12 future picks and averages 24.4 years old, so it is expensive rather than hopeless. <a href="/rosters/2026/was">Washington</a> has 10 players 23 and under with 80+ potential, including 19-year-old AJ Dybantsa (82/94), and would be on the easy list if not for a $195.3M payroll.</p>

<h2>Pick your challenge</h2>
<p>Browse every franchise on the <a href="/rosters/2026">2026 rosters index</a>, then start from <a href="/rosters">Rosters</a> to import the league. If you take an easy save, the <a href="/blog/draft-lottery-and-scouting">draft guide</a> and <a href="/blog/player-development-and-aging">development guide</a> will help you turn picks into stars. If you take a hard one, start with the <a href="/blog/trade-value-and-pick-protections">trade value guide</a>, because you will need every edge.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'nba-2k-myleague-alternative',
    title: 'Want NBA 2K MyLeague Depth Without a Console? Try a Browser GM Game',
    seoTitle: 'NBA 2K MyLeague Alternative — Free Browser Basketball GM (No Console)',
    metaDescription:
      'Love NBA 2K MyLeague or MyGM but not the console, the price or the load times? What a free browser basketball GM game like BS Hoops gives you, what it does not, and how to set it up like a MyLeague save.',
    keywords: ['nba 2k myleague alternative', 'myleague without console', 'free alternative to nba 2k mygm', 'basketball franchise mode browser', 'nba gm game free'],
    publishDate: '2026-10-27',
    category: 'strategy',
    readingTime: 6,
    summary:
      'MyLeague and MyGM are the deepest licensed franchise modes around, but they need a console or gaming PC and a new purchase each year. Here is what a free browser GM game keeps, what it trades away, and how to recreate a MyLeague-style save.',
    related: ['free-basketball-gm-games-browser', 'salary-cap-aprons-and-exceptions', 'best-nba-teams-to-rebuild-2026'],
    content: `
<p>NBA 2K's MyLeague and MyGM modes are, for a lot of players, the reason to buy the game. Decades-long saves, real cap rules, trades, the draft, and the ability to jump into any game and play it yourself. The catch is the setup: you need a console or a capable PC, a new copy each year to stay current, and patience with menus and load times. If what you actually love is the front-office half, a browser GM game can give you most of that for free.</p>

<h2>What MyLeague and MyGM do best</h2>
<p>To be fair about the comparison, here is what the 2K franchise modes do that a browser game will not match:</p>
<ul>
<li><strong>Official licensing.</strong> Real player names, likenesses, logos and arenas.</li>
<li><strong>Playable games.</strong> You can take the sticks for any game, not just watch.</li>
<li><strong>Presentation.</strong> Full broadcast visuals and commentary.</li>
<li><strong>Story and role-play layers</strong> in MyGM, built around running the organization.</li>
</ul>
<p>If those are the reasons you play, keep playing 2K. If you mostly sim games and live in the trade, cap and draft screens, read on.</p>

<h2>What you keep in a browser GM game</h2>
<p><a href="/">BS Hoops</a> is a free basketball GM game that runs in any browser tab with no download and no account required. Here is how its front-office systems line up with what MyLeague players care about:</p>
<table>
<thead><tr><th>MyLeague habit</th><th>In BS Hoops</th></tr></thead>
<tbody>
<tr><td>Real cap rules</td><td>Soft cap of $165.0M in 2026-27, luxury tax, first and second aprons, Non-Tax and Tax Mid-Level, Bi-Annual, Room Exception, minimums</td></tr>
<tr><td>Re-signing your stars</td><td>Full and Early Bird rights, five-year deals with raises up to 8%</td></tr>
<tr><td>Trade logic</td><td>Salary matching by tier, pick protections, trade finder, AI that values rating, age and contract</td></tr>
<tr><td>Draft</td><td>14-team lottery, tiered scouting, mock draft, hidden boom/bust traits</td></tr>
<tr><td>Free agency</td><td>Bid against AI teams with Bird rights and exceptions over a 30-day window</td></tr>
<tr><td>Simming games</td><td>Possession-by-possession sim, watch any of your games live with a shot chart, win probability and game flow</td></tr>
<tr><td>Coaching</td><td>Starters, bench order and game plans for pace, shot profile, pressure and defense</td></tr>
<tr><td>Long saves</td><td>Aging, retirement, awards, franchise history, owner approval; multiple leagues and unlimited saves</td></tr>
</tbody>
</table>
<p>The cap rules are where MyLeague veterans tend to feel at home. Above the second apron you lose the Mid-Level entirely and have to match salaries one-for-one in trades; using the Non-Tax Mid-Level hard-caps you at the first apron for the season. Our <a href="/blog/salary-cap-aprons-and-exceptions">cap and aprons guide</a> has every number.</p>

<h2>What you give up</h2>
<p>Honesty matters here. BS Hoops is a parody and simulation, not affiliated with the NBA. You will not get licensed likenesses, logos or arenas, and you cannot control players on the court; you coach through lineups and game plans, then watch the sim. If playing the games yourself is essential, a browser GM game is a complement to 2K, not a replacement.</p>
<p>Plenty of players run both: a 2K save on the couch for playing marquee games, and a browser save on a laptop for the front-office grind, where a full season of trades, drafts and free agency takes minutes instead of evenings.</p>

<h2>What you gain</h2>
<ul>
<li><strong>Cost.</strong> The full game, including the season sim, draft, lottery, free agency, trades, stats, history and custom league settings, is free. An optional <a href="/pricing">Premium plan</a> removes ads and adds AI game commentary, audio podcasts and extra scouting and free-agent intel.</li>
<li><strong>Speed.</strong> A whole season sims in the time a console takes to load a menu, so you get through more seasons, more drafts and more trade deadlines per hour.</li>
<li><strong>Any device with a browser.</strong> Work laptop, old desktop, Chromebook. Sign in to sync saves across devices.</li>
<li><strong>Transparency.</strong> We publish how the engine works. The <a href="/blog/trade-value-and-pick-protections">trade value formula</a>, the <a href="/blog/player-development-and-aging">aging curve</a> and the <a href="/blog/game-plans-and-pace">game-plan multipliers</a> are all documented, so you can plan instead of guessing.</li>
</ul>

<h2>How to recreate a MyLeague-style save</h2>
<ol>
<li><strong>Start from real rosters.</strong> Go to <a href="/rosters">Rosters</a> to import a real player pool, with contracts and future pick trades, converted to BS Hoops ratings. You can preview every team's payroll, cap tier and depth chart under <a href="/rosters/2026">2026 rosters</a> first.</li>
<li><strong>Pick a team with a story.</strong> Our breakdown of the <a href="/blog/best-nba-teams-to-rebuild-2026">best and hardest teams to take over</a> ranks all 30 by cap room, young upside and draft capital. A second-apron contender is the closest thing to a MyGM "win now" scenario.</li>
<li><strong>Tune your league.</strong> Custom league settings let you shape the league the way you would in MyLeague.</li>
<li><strong>Coach the rotation.</strong> Only your first five bench players form the second unit, so bench order is your minutes slider. See the <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a>.</li>
<li><strong>Watch the big games.</strong> Sim the regular season in chunks, then watch playoff games live to see how your game plan holds up.</li>
<li><strong>Play the long game.</strong> Ownership judges you against a 41-win baseline, but nobody is fired in their first three seasons, so a real rebuild is survivable.</li>
</ol>

<h2>How it compares to other options</h2>
<p>If you want a deeper look, we put together a direct <a href="/vs/nba-2k-myleague">BS Hoops vs NBA 2K MyLeague</a> comparison, a <a href="/vs/basketball-gm">BS Hoops vs Basketball GM</a> breakdown, and a roundup of the <a href="/best/basketball-gm-games">best basketball GM games</a> across browser, PC and mobile. For other free browser options, see <a href="/blog/free-basketball-gm-games-browser">free basketball GM games you can play in your browser</a> and our list of <a href="/alternatives/basketball-gm">Basketball GM alternatives</a>.</p>

<h2>The bottom line</h2>
<p>MyLeague is the best licensed franchise experience. But if your favorite part of 2K is the trade screen at 1 a.m., you can get that loop, with real cap rules and a sim you can watch, in a browser tab for free. <a href="/">Start a league</a> and see how far you get by the first trade deadline.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'basketball-gm-tips-for-beginners',
    title: '15 Basketball GM Tips Every New GM Should Know',
    seoTitle: '15 Basketball GM Tips for Beginners — Cap, Trades, Draft & Rotation',
    metaDescription:
      'Fifteen practical basketball GM tips for new players: picking a team, the cap and aprons, Bird rights, bench order, game plans, trade value, pick protections, the lottery, scouting, aging and owner approval.',
    keywords: ['basketball gm tips', 'basketball gm tips for beginners', 'how to get better at basketball gm', 'basketball gm strategy', 'bs hoops tips'],
    publishDate: '2026-10-29',
    category: 'getting-started',
    readingTime: 7,
    summary:
      'The fifteen lessons most new GMs learn the hard way, each backed by how the BS Hoops engine actually works, with links to the full guides.',
    related: ['first-season-beginners-guide', 'rebuild-or-contend-timeline', 'trade-value-and-pick-protections'],
    content: `
<p>Most new basketball GMs make the same handful of mistakes: they drift into the luxury tax, bury their best backup at bench slot seven, trade a young star for two good veterans, and hold a 32-year-old two years too long. Every tip below comes from how the <a href="/">BS Hoops</a> engine actually works, with a link to the guide that goes deeper.</p>

<h2>Team building</h2>

<h3>1. Do not start with a second-apron team</h3>
<p>A team above the second apron has no Mid-Level and must match salaries one-for-one in trades. For a first save, pick a team near or under the $165.0M cap so every tool works. Our ranking of the <a href="/blog/best-nba-teams-to-rebuild-2026">best and hardest teams to take over</a> does the homework, and the <a href="/blog/first-season-beginners-guide">first-season guide</a> walks through year one.</p>

<h3>2. Pick a lane by the trade deadline</h3>
<p>The worst place in the game is a 40-44 win team with an older core: not good enough to win a series, with a pick around #12-16 and a full cap sheet. Decide to contend or rebuild by the deadline on day 115. The <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend framework</a> has a five-minute checklist.</p>

<h3>3. Use the grace period</h3>
<p>Ownership judges you against 41 wins, but no one is fired in their first three seasons, and a firing takes two consecutive seasons below 20 approval. A planned two-year rebuild is survivable; make year three look like progress.</p>

<h2>The salary cap</h2>

<h3>4. Know the five lines</h3>
<p>The 2026-27 cap is $165.0M, the tax line about $200.5M, the first apron about $209.1M and the second about $221.8M. Each line takes tools away. The <a href="/blog/salary-cap-aprons-and-exceptions">cap and aprons guide</a> lists exactly which.</p>

<h3>5. The Mid-Level can hard-cap you</h3>
<p>Using the Non-Tax Mid-Level (about $15.5M) or the Bi-Annual hard-caps you at the first apron for the rest of the season. If you spend it in July, you cannot take on salary in a February trade that pushes you past that line. Plan the deadline before free agency.</p>

<h3>6. Re-sign with Bird rights before you shop</h3>
<p>Over the cap, the best you can offer another team's free agent is an exception. With full Bird rights you can re-sign your own player up to his max regardless of the cap, and he gives you a small loyalty discount. Re-signing is almost always cheaper than replacing.</p>

<h3>7. Patience is a cap tool</h3>
<p>The cap grows about 7% a year, and the aprons scale with it. A payroll that is a first-apron problem this season can be a mere taxpayer next season. And the late days of free agency (24-30) are where asking prices fall toward 50% of market value.</p>

<h2>Rotation and coaching</h2>

<h3>8. Only bench slots 1-5 play</h3>
<p>The sim alternates your starters with a second unit made of the first five players in your bench order. Starters play about 32 minutes; slot 6 and below barely see the floor. Re-check slots 1-5 after every trade, signing and injury. Details in the <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a>.</p>

<h3>9. Give rookies slot 4 or 5, not 30 minutes</h3>
<p>A 19-year-old at bench slot 4 plays about 12 minutes a night and builds a real stat line. At slot 9 he plays nothing. Development itself is driven by age and potential each offseason, but minutes produce the stats that feed trade value and awards.</p>

<h3>10. Match pace to your odds</h3>
<p>Play fast when you are the better team, because more possessions mean less variance. Play slow when you are the underdog. Perimeter focus multiplies three-point attempts by 1.4, and the full-court press forces 40% more turnovers at the cost of better shots when it is beaten. The <a href="/blog/game-plans-and-pace">game-plan guide</a> has every multiplier.</p>

<h2>Trades</h2>

<h3>11. One star beats two good players</h3>
<p>Trade value is built on a cubed OVR curve, so two 75s (about 1,540 PTS combined) do not get you an 85 (about 2,120). Consolidating talent costs more than you expect, and the AI rarely gives up a star for depth. See the <a href="/blog/trade-value-and-pick-protections">trade value guide</a>.</p>

<h3>12. Sell at 29-30, buy at 22-25</h3>
<p>The trade-value age multiplier is 1.25 at 22-23, 1.0 at 28-29, 0.82 at 30-31 and 0.6 at 32-33. Sell veterans to Win Now teams before the drop; rebuilding AI teams discount incoming players 31 and older by 30%.</p>

<h3>13. Protect your own picks top-3 or top-5</h3>
<p>A top-3 protection costs only about 9% of a pick's trade value but removes the nightmare of handing a rival the #1 pick. Lottery protection nearly halves the value, so avoid asking for it when you are the buyer.</p>

<h2>Draft and development</h2>

<h3>14. Do not tank for the worst record</h3>
<p>The worst three records each have a 14% chance at the #1 pick, and only three picks are drawn, so the worst team picks no lower than #4. There is no reason to strip a roster bare in March. Spend your scouting points on the players likely to be there at your pick. The <a href="/blog/draft-lottery-and-scouting">draft guide</a> covers the full odds table and scouting levels.</p>

<h3>15. Read the first offseason</h3>
<p>Every player has a hidden development trait: about 15% are busts, 70% normal and 15% booms. Young players gain about 3.5 OVR a year at 21 and under, peaks are flat from 26 to 28, and decline speeds up after 31, with athleticism going first. If a rookie gains five or more points in his first summer, he is at least normal. The <a href="/blog/player-development-and-aging">development guide</a> shows how to time every decision around the curve.</p>

<h2>Put it into practice</h2>
<p>None of this requires a download. Open <a href="/">BS Hoops</a>, pick a team, or <a href="/rosters">import a real roster</a> and browse every franchise under <a href="/rosters/2026">2026 rosters</a>. Coming from another game? See <a href="/vs/basketball-gm">BS Hoops vs Basketball GM</a>, <a href="/vs/nba-2k-myleague">BS Hoops vs NBA 2K MyLeague</a>, our <a href="/alternatives/basketball-gm">Basketball GM alternatives</a> list, and the roundup of the <a href="/best/basketball-gm-games">best basketball GM games</a>. Then apply tip 1, and you are already ahead of most first-time GMs.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'owner-objectives-approval-and-job-security',
    title: 'Owner Objectives, Approval and the Hot Seat: How Ownership Grades You in BS Hoops',
    seoTitle: 'Basketball GM Owner Approval Guide — Objectives, Job Security & Getting Fired',
    metaDescription:
      'Exactly how BS Hoops grades your season: the 41-win baseline, playoff bonuses, the 2–3 owner objectives and their +4/+1/−4 weights, the 20-point firing line, the three-season grace period, and how to survive a rebuild.',
    keywords: ['basketball gm owner approval', 'basketball gm getting fired', 'owner objectives basketball gm', 'gm job security sim game'],
    publishDate: '2026-11-05',
    category: 'strategy',
    readingTime: 7,
    summary:
      'Your owner scores every season with one formula: wins against a 41-win baseline, a playoff bonus, and 2–3 objectives worth up to ±10. Here is the math, the firing rule, and how to plan a rebuild that keeps your job.',
    related: ['rebuild-or-contend-timeline', 'first-season-beginners-guide', 'salary-cap-aprons-and-exceptions'],
    content: `
<p>Ignore the owner in BS Hoops and every save ends the same way: a note on the Awards page that ownership has let you go. The grading is not a black box. It is a short formula with fixed weights, and once you know them you can plan a three-year rebuild that never gets near the line.</p>

<h2>The approval score: results first</h2>
<p>You start every tenure at <strong>50 owner approval</strong> on a 0–100 scale. At the end of each season the owner applies one swing based on results:</p>
<ul>
<li><strong>Wins:</strong> every win above or below 41 is worth 0.6 points. A 51-win season is +6; a 31-win season is −6.</li>
<li><strong>Playoffs:</strong> a flat bonus by how far you went — +25 for a title, +16 for losing the Finals, +10 for a conference-finals exit, +5 for the second round, 0 for a first-round loss, and <strong>−12 for missing</strong> entirely (a play-in loss counts as missing).</li>
</ul>
<p>The two are added, rounded, and clamped to ±30. A 50-win team that loses in the second round earns about +10. A 25-win team that misses the playoffs takes −22. A 60-win champion would compute to +36, but the clamp caps it at +30. The floor is reached at 11 wins or fewer with no playoffs.</p>
<p>Fan approval moves on a slightly different formula (0.5 per win, 1.3× the playoff bonus, clamped from −30 to +35), but in the current build it only affects the number you see. Job security is owner approval alone.</p>

<h2>Where the objectives come from</h2>
<p>Before each season the owner hands you two or three objectives. They are generated from your team's context, not at random, and they are frozen once the season starts. The engine first decides your <strong>posture</strong>:</p>
<ol>
<li>It ranks all 30 teams by the average OVR of their top eight players. Your rank becomes a 0–1 roster score (1st = 1.0, 30th = 0.0).</li>
<li>If you have a previous season, your wins are converted to a 0–1 score as (wins − 20) ÷ 45, so 20 wins is 0 and 65 is 1.</li>
<li>The blended score is 65% roster and 35% last season. At or above 0.66 you are a <strong>contender</strong>; below 0.36 you are a <strong>rebuild</strong>; anything between is <strong>balanced</strong> — unless your top eight average 24.5 years old or younger and the score is under 0.5, in which case you are treated as a rebuild.</li>
</ol>
<p>Your expected wins are 41 + (score − 0.5) × 44, which runs from about 19 for the worst context to about 63 for the best. The objectives are then built from the posture:</p>
<table>
<thead><tr><th>Posture</th><th>Objective 1</th><th>Objective 2</th><th>Objective 3</th></tr></thead>
<tbody>
<tr><td>Contend</td><td>Win X+ games (expected ±2, clamped 48–62)</td><td>Win a playoff round — or reach the Conference Finals if you rank top three and went that deep last year</td><td>Stay under the tax if payroll is within 3% of the tax line; otherwise a coin-flip between developing a young player and nothing</td></tr>
<tr><td>Balanced</td><td>Win X+ games (clamped 38–50)</td><td>Make the playoffs</td><td>Stay under the tax if near it; otherwise develop a young player</td></tr>
<tr><td>Rebuild</td><td>Improve by 8 wins (last season +8, max 50) — or win X+ (clamped 22–36) if you won 43 or more</td><td>Develop a young player</td><td>Stay under the tax if near it; otherwise stay within a budget</td></tr>
</tbody>
</table>
<p>The <strong>develop</strong> objective picks your best candidate who is 24 or younger, rated under 75, and at least four points below his potential. If he is already 70+ the target is 75; otherwise it is his current OVR plus four. The <strong>budget</strong> objective is your current payroll plus coach dead money, rounded up to the next $5M, and never below the cap.</p>
<p>A worked example: you rank 26th of 30 in top-eight talent (roster score 0.14) and won 28 games last year (season score 0.18). Blended, that is 0.15 — a rebuild. Your objectives will be "Improve by 8+ wins (36+)", "Develop [your best prospect] to X OVR", and a budget or tax line. Rank fifth with 50 wins instead, and the blend is 0.79: a contender with a win target around 54 and a playoff-round objective.</p>

<h2>How objectives are graded</h2>
<p>Each objective grades <em>met</em>, <em>partial</em> or <em>missed</em>, worth <strong>+4, +1 and −4</strong> owner approval. The total is clamped to ±10 and added on top of the results swing, which is why the header comment in the engine calls objectives "meaningful but never dominant": they decide borderline seasons.</p>
<table>
<thead><tr><th>Objective</th><th>Met</th><th>Partial</th></tr></thead>
<tbody>
<tr><td>Win X+</td><td>Hit the number</td><td>Within 4 wins</td></tr>
<tr><td>Improve by 8</td><td>Hit the number</td><td>Any improvement on last season</td></tr>
<tr><td>Make the playoffs</td><td>In the 16-team bracket</td><td>Lost in the play-in</td></tr>
<tr><td>Win a playoff round</td><td>One series win</td><td>Made the bracket</td></tr>
<tr><td>Reach the Conference Finals</td><td>Two series wins</td><td>One series win</td></tr>
<tr><td>Stay under the tax</td><td>Payroll at or under the line</td><td>Within $5M over</td></tr>
<tr><td>Stay within budget</td><td>At or under</td><td>Within 5% over</td></tr>
<tr><td>Develop to X OVR</td><td>Post-offseason OVR hits X</td><td>Gained 3+ or finished within 2 of X</td></tr>
</tbody>
</table>
<p>Two traps: the develop objective is graded on the player's rating <em>after</em> offseason development (trade him and it grades as missed), and the budget objective counts dead money owed to coaches you fired.</p>

<h2>The firing rule</h2>
<p>Job security tiers are read straight off your approval: 60+ is <em>safe</em>, 45–59 <em>warm</em>, 30–44 <em>hot</em>, and under 30 a <em>final warning</em>. The line that matters is <strong>20</strong>. A season that ends with approval below 20 is a strike. Two consecutive strikes fires you — but <strong>never in your first three seasons</strong> with a team. Any season that ends at 20 or above resets the count.</p>
<p>Put together, the earliest you can be fired is at the end of season four, and only if seasons three and four both finished below 20. When you are fired, the save clears your team and offers the five teams with the worst records as openings; take one and your tenure clock restarts, so the three-season grace applies again.</p>

<h2>Planning a rebuild that keeps the job</h2>
<p>Here is a deliberate three-year teardown, starting at 50 approval:</p>
<ul>
<li><strong>Year 1, 25 wins, missed playoffs:</strong> results −22. Rebuild objectives: develop met (+4), improve partial (+1), budget met (+4) = +9. Net −13 → <strong>37</strong> (hot).</li>
<li><strong>Year 2, 28 wins:</strong> results −20, objectives +9 again → <strong>26</strong> (final warning, but above 20 — no strike).</li>
<li><strong>Year 3, 36 wins:</strong> results −15; improve met this time (+4), develop met (+4), tax met (+4) = +12, clamped to +10 → <strong>21</strong>. Still above the line.</li>
<li><strong>Year 4, 46 wins, first-round exit:</strong> results +3, objectives +9 → <strong>33</strong>. Out of danger and the grace period no longer matters.</li>
</ul>
<p>Miss every objective instead and the same seasons run 50 → 18 → 0 → 0: below the line after year one, spared by the grace period through year three, fired after year four. The objectives are the entire margin between those paths, and they are built to be achievable — "improve by 8" from 25 wins is 33 wins.</p>

<h3>Rules of thumb</h3>
<ul>
<li>A deep playoff run forgives a mediocre regular season: 44 wins plus a conference-finals trip is +12, better than 55 wins and a first-round exit (+8).</li>
<li>Missing the playoffs costs 12 — the same as 20 wins. The play-in does not help the owner score; it only helps the "make the playoffs" objective grade as partial.</li>
<li>The tax objective has a $5M partial band; the budget objective's band is 5% of the target (about $8–10M). If you are going to miss one, miss it by less than that.</li>
</ul>
<p>The owner asks a contender to win and a rebuild to grow; the <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend framework</a> is how you decide which one you want to be before he decides for you.</p>
<p><a href="/">Start a franchise in BS Hoops</a> and see what your owner asks for in year one.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'coaching-staff-schemes-contracts-and-carousel',
    title: 'Your Coaching Staff in BS Hoops: What a Head Coach Actually Changes, What He Costs, and When to Fire Him',
    seoTitle: 'Basketball GM Coaching Guide — Schemes, Development Coaches, Contracts & the Carousel',
    metaDescription:
      'How coaches work in BS Hoops: the two ratings that actually matter, how a development coach adds up to 15% growth, coach salaries from $4M to $12M, dead money when you fire one, extension discounts, and how the AI carousel decides who gets fired.',
    keywords: ['basketball gm coaching staff', 'basketball gm hire coach', 'player development coach sim', 'coaching carousel basketball gm'],
    publishDate: '2026-11-12',
    category: 'development',
    readingTime: 7,
    summary:
      'A head coach brings a scheme and a development rating; a development coach adds up to ±15% to young players’ growth. Everything else on his card is price. Here is how to hire, extend and fire with the real numbers.',
    related: ['game-plans-and-pace', 'player-development-and-aging', 'owner-objectives-approval-and-job-security'],
    content: `
<p>Every team in BS Hoops carries exactly two coaches: a <strong>head coach</strong> and a <strong>player-development coach</strong>. Both have contracts, both can be fired, and both are an owner expense rather than a cap charge. The Staff page lists four ratings for each; the engine reads only some of them. Here is which numbers do something, what a coach costs, and how the AI carousel decides when a good coach hits the market.</p>

<h2>What a head coach actually does</h2>
<p>A head coach has four ratings — offense, defense, development and morale — and his overall is their average. In the current engine, two things about him feed the simulation:</p>
<ol>
<li><strong>His scheme.</strong> Five-Out, Horns, Princeton, Triangle or Flow. Each is a fixed set of multipliers on pace, three-point rate, post-ups and defensive intensity that is always on, stacking with whatever game plan you set. The full table is in the <a href="/blog/game-plans-and-pace">game-plan guide</a>; the short version is that Five-Out plays 4% faster with 15% more threes, Flow plays 10% faster, Triangle plays 12% slower with 30% more post-ups and 20% fewer threes, and Horns and Triangle both play 5% more intense defense.</li>
<li><strong>His development rating.</strong> At the offseason rollover, every player on his roster who is 24 or younger has his growth multiplied by 1 + (development − 70) ÷ 100 × 0.5, floored at 1. That is nothing at 70 or below, +5% at 80, +10% at 90, and +13% at the 96 cap.</li>
</ol>
<p>The offense, defense and morale ratings do not currently alter any possession, shot or turnover. They matter only through the coach's overall, which sets his salary. So a 60-offense, 60-defense, 90-development coach is a bargain for a rebuilding team, and an 85-across-the-board coach is paying for two ratings that do not do anything yet.</p>

<h3>The scheme-fit badge</h3>
<p>The roster page shows a ±OVR "fit" next to each player under your coach's scheme — Five-Out wants a three-point rating of 81+ for a "great" fit and marks anyone under 60 as poor; Triangle wants post scoring and a big; Flow wants speed and handles; Princeton wants IQ and passing; Horns is nearly neutral. The badge does not change ratings in the sim. It tells you whether the scheme will generate the shots he is good at.</p>

<h2>What a development coach does</h2>
<p>The player-development coach has one rating that matters, also called development, on a 40–90 scale centered on 65. For players 24 and younger it multiplies offseason growth by 0.85 at 40, 1.0 at 65, and 1.15 at 90. It applies only to upward drift: a 31-year-old declines the same whether your development coach is a 40 or a 90.</p>
<p>The two coaches multiply. A 96-development head coach (×1.13) plus a 90 development coach (×1.15) gives a young player about <strong>30% more growth</strong> every summer: a 20-year-old expecting +5.4 (age drift plus potential pull, per the <a href="/blog/player-development-and-aging">development guide</a>) gets roughly +7 instead. A vacant slot is neutral, so a development coach below 65 is worse than none.</p>

<h2>Where coaches come from and what they cost</h2>
<p>Generated head coaches come in three tiers: about 15% <em>elite</em> (ratings built around 82), 35% <em>solid</em> (around 71) and 50% <em>journeymen</em> (around 61), each rating jittered −8 to +12. The hiring market shows every unemployed coach plus six fresh candidates, sorted by overall, and is re-rolled each season and phase — check it at the draft and again in free agency.</p>
<p>Head-coach pay runs <strong>$4M to $12M</strong> a year on the $165M cap, and scales with the cap. The formula is 80% overall (on a 55–92 scale) plus 35% reputation, capped at 1.0 of the $8M range above the $4M floor. Reputation comes from the résumé: career win percentage above .450 counts double, each title adds 0.25, each Coach of the Year 0.15, each conference-finals run 0.06. A 92-overall coach with no history asks about $10.4M; a 70 asks about $6.6M; a 61 about $5.0M. Development coaches cost $0.5M to $2M by their development rating.</p>
<p>Standard deals: head coaches sign 3 years (4 if 82+ overall), with a 45% chance of one extra year, maximum 5. Development coaches sign 2 or 3. Salaries rise 3% a year and every year is guaranteed.</p>

<h2>Firing a coach: dead money and the interim</h2>
<p>You can fire either coach at any time from the Staff page. Every remaining guaranteed year becomes dead money on your Finances page. It is an owner expense, so it does not touch the cap or the luxury tax — but it does count against the owner's <em>stay within budget</em> objective, as the <a href="/blog/owner-objectives-approval-and-job-security">owner guide</a> explains. Firing a $10M coach with three years left books about $30.9M of dead money across those seasons.</p>
<p>A fired head coach is replaced immediately by an <strong>interim</strong>: a fresh coach with 6 points shaved off every rating, on a one-year, non-guaranteed deal at 60% of his market rate. Because it is non-guaranteed, replacing the interim costs nothing — so firing a bad coach midseason is a two-step move: eat his dead money now, hire the real replacement when the market refreshes in the offseason.</p>
<p>If a coach's deal lapses and you do nothing, he stays on a one-year market deal at season start — you will not lose him by accident, but you pay full price.</p>

<h2>Extensions: the hometown discount</h2>
<p>Extending a coach prices his next deal at market times a situation premium based on your team's success — win percentage plus 0.03 per playoff round reached:</p>
<ul>
<li>Success of .600 or better: <strong>0.95× market</strong> (he likes it here).</li>
<li>.450 to .599: 1.05× market.</li>
<li>Below .450: <strong>1.15× market</strong> — a premium to stay with a loser.</li>
</ul>
<p>Three refusals exist. An 80+ overall coach will not take two or more years from a team under .400. No coach takes a five-year deal from a team under .300. And no coach signs past age 74. The practical rule: extend your good coach <em>during</em> a winning season, before his deal expires, and never try to lock up an elite coach while you are tanking.</p>

<h2>The AI carousel</h2>
<p>After every season (and after development, so the staff that coached the year gets credit for it), the 29 AI teams run their own staff decisions. Your team is never touched. For head coaches:</p>
<table>
<thead><tr><th>Situation</th><th>What the AI does</th></tr></thead>
<tbody>
<tr><td>Interim</td><td>Always let go</td></tr>
<tr><td>Contract expiring</td><td>Re-signed if under 70 years old and (won 50%+, or 75+ overall and won 40%+, or made the playoffs); otherwise let go</td></tr>
<tr><td>Under contract, won under 30%</td><td>Fired 55% of the time (25% if it was his first season)</td></tr>
<tr><td>Under contract, won 30–39%</td><td>Fired 35% (12% in his first season)</td></tr>
<tr><td>Under contract, 40–49% and missed the playoffs</td><td>Fired 18%, but only after three seasons</td></tr>
</tbody>
</table>
<p>All of those odds are multiplied by 0.6 for a coach rated 82 or better. Development coaches are re-signed if they rate 60+ and are under 70; a sub-50 development coach on a sub-.400 team is fired 30% of the time. Vacancies are filled from the market by picking the best overall with a little noise. Coaches retire at 68 if unemployed; the market keeps the 12 best unemployed coaches per role and retires the rest.</p>
<p>Good coaches do hit the market: a 20-win team fires its 84-overall coach about a third of the time (55% × 0.6). Check unemployed coaches before fresh candidates — but a fired coach keeps his résumé, so a strong one may ask more than a fresh candidate with the same overall.</p>

<h2>The staffing rule</h2>
<p>Rebuilding: buy the highest development ratings you can find in both slots, and pick the scheme that fits your two best prospects — an 80+ development coach is the best $2M you will spend. Contending: match the scheme to your top three players and ignore overall; your core is past 24 and the development ratings do nothing for them. Either way, a 90-development pair costs about $12M of owner money, never touches the cap, and compounds across a rookie contract.</p>
<p><a href="/">Open BS Hoops</a>, check your Staff page, and see what your coaches are actually rated.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 're-signing-negotiation-mood-and-bird-rights',
    title: 'Re-Signing Your Own Players in BS Hoops: Mood, Negotiation Patience and Bird Rights',
    seoTitle: 'Basketball GM Re-Sign Guide — Player Mood, Contract Negotiation & Bird Rights',
    metaDescription:
      'How re-sign talks work in BS Hoops: the market-salary table by OVR, the six moods and what drives them, loyalty, the 2–4 rounds of patience, lowball penalties, the final-round midpoint rule, Bird rights, and how the free-agent acceptance bar differs.',
    keywords: ['basketball gm re-sign players', 'basketball gm contract negotiation', 'bird rights basketball gm', 'player mood basketball sim'],
    publishDate: '2026-11-19',
    category: 'salary-cap',
    readingTime: 8,
    summary:
      'A player’s ask is market salary times a loyalty multiplier, his floor is 80–95% of market, and you get two to four rounds before he walks. Here is the arithmetic, and why the free-agent bar is a different formula.',
    related: ['salary-cap-aprons-and-exceptions', 'player-development-and-aging', 'rotation-bench-order-and-minutes'],
    content: `
<p>The offseason in BS Hoops runs Draft → Re-sign → Cuts → Free Agency, and the Re-sign step is where most of your payroll gets decided. Anyone you do not re-sign walks to the free-agent pool when the season starts. Talks are not a coin flip: each player builds a negotiation profile from his market value, mood, tenure and your record, then responds to offers by fixed rules. Learn them and you stop overpaying loyal starters and stop insulting the ones who are leaving anyway.</p>

<h2>Step 1: his market salary</h2>
<p>Everything starts from a market salary that is a percentage of the cap by OVR, times an age multiplier, times a position multiplier, with ±5% noise fixed per player and season.</p>
<table>
<thead><tr><th>OVR</th><th>% of cap</th><th>On a $165M cap</th></tr></thead>
<tbody>
<tr><td>94+</td><td>36%</td><td>$59.4M (clamped to his max)</td></tr>
<tr><td>91–93</td><td>33%</td><td>$54.5M</td></tr>
<tr><td>88–90</td><td>30%</td><td>$49.5M</td></tr>
<tr><td>85–87</td><td>25.5%</td><td>$42.1M</td></tr>
<tr><td>82–84</td><td>20.5%</td><td>$33.8M</td></tr>
<tr><td>80–81</td><td>15.5%</td><td>$25.6M</td></tr>
<tr><td>78–79</td><td>11.5%</td><td>$19.0M</td></tr>
<tr><td>76–77</td><td>9%</td><td>$14.9M</td></tr>
<tr><td>74–75</td><td>6.5%</td><td>$10.7M</td></tr>
<tr><td>72–73</td><td>4.5%</td><td>$7.4M</td></tr>
<tr><td>70–71</td><td>3%</td><td>$5.0M</td></tr>
<tr><td>67–69</td><td>1.8%</td><td>$3.0M</td></tr>
<tr><td>Under 67</td><td>1.2%</td><td>$2.0M</td></tr>
</tbody>
</table>
<p>Age multiplies that: 0.85 at 21 and under, 0.95 at 22–24, 1.0 at 25–28, 0.92 at 29–31, 0.78 at 32–34, 0.55 at 35–37, 0.35 at 38+. Position nudges it: centers 1.08, small forwards 1.05, point guards 1.0, power forwards 0.98, shooting guards 0.95. The result is clamped to his service-time band — minimum $1.35M for a rookie up to $3.87M for a ten-year veteran, maximum 25%, 30% or 35% of the cap at 0–6, 7–9 and 10+ years.</p>
<p>He also has a preferred length: 88+ OVR players want 5 years (4 at 30+, 3 at 33+); 72–87 want 4 (3 at 30+, 2 at 33+ for the lower band); fringe players want 2 (1 at 30+). Extensions run 1–5 years.</p>
<p>Example: an 82-OVR, 27-year-old small forward is 20.5% × 1.0 × 1.05 × $165M ≈ <strong>$35.5M a year for 4 years</strong>; a 76-OVR, 30-year-old point guard is 9% × 0.92 × $165M ≈ <strong>$13.7M for 3 years</strong>. Extensions are priced on the cap of the season they start, which <a href="/blog/first-season-beginners-guide">grows about 7% a year</a>.</p>

<h2>Step 2: his mood</h2>
<p>The Mood chip on the roster is derived live from role, contract and team form. The six states, in the order the engine checks them:</p>
<ul>
<li><strong>Angry</strong> — 80+ OVR and not in the starting five.</li>
<li><strong>Unhappy</strong> — one of the five best OVRs on the roster but not starting.</li>
<li><strong>Restless</strong> — 72+ OVR with one year or less on his deal.</li>
<li><strong>Thrilled</strong> — 23 or younger, 8+ points below his potential, and starting.</li>
<li><strong>Happy</strong> — 23 or younger with 6+ points of upside, or starting despite not being top-five in talent.</li>
<li><strong>Content</strong> — everyone else.</li>
</ul>
<p>The biggest input is the starting lineup you set. Restless is normal in a contract year; Angry is a lineup problem you can fix before talks open.</p>

<h2>Step 3: loyalty, patience and the two numbers that matter</h2>
<p>From mood and tenure the engine builds a <strong>loyalty</strong> score from 0 to 1:</p>
<ul>
<li>+0.09 per season with the team, up to +0.35</li>
<li>+0.10 for full Bird rights</li>
<li>+0.15 if the team is at or above .500</li>
<li>+0.10 if he is a starter</li>
<li>+0.15 if Thrilled or Happy; −0.20 if Unhappy; −0.35 if Angry</li>
</ul>
<p>Loyalty sets three things. His <strong>patience</strong> is 2 + 2 × loyalty, plus 0.5 for a veteran (32+) and minus 0.5 for a young star (26 or younger and 78+), rounded and clamped to 2–4 rounds. His <strong>anchor</strong> (opening ask) is market × (1 + 0.10 × (1 − loyalty)), plus 4% if he is a young star and another 4% if Angry. His <strong>reservation</strong> (walk-away floor) is market × (0.80 + 0.12 × (1 − loyalty)), plus 3% for a young star and minus 3% for a veteran. Both get ±2% jitter and are clamped to his legal min and max. The <strong>lowball line</strong> is 80% of the reservation.</p>
<p>Two archetypes make it concrete, on a $20M market player:</p>
<table>
<thead><tr><th></th><th>Loyal starter (loyalty ≈ 0.85)</th><th>Angry star, year one, losing team (loyalty 0)</th></tr></thead>
<tbody>
<tr><td>Patience</td><td>4 rounds</td><td>2 rounds</td></tr>
<tr><td>Opening ask</td><td>≈ $20.3M</td><td>≈ $23.6M (×1.18)</td></tr>
<tr><td>Walk-away floor</td><td>≈ $16.4M (×0.82)</td><td>≈ $19.0M (×0.95)</td></tr>
<tr><td>Lowball line</td><td>≈ $13.1M</td><td>≈ $15.2M</td></tr>
</tbody>
</table>
<p>That is the whole value of loyalty: a loyal player signs for 18% under market with four chances to get there; a disgruntled one will not go below 95% and gives you two.</p>

<h2>Step 4: the round rules</h2>
<p>Each offer is one round. Your offer's <strong>effective value</strong> is the salary times a years-fit factor — 5% off for every year away from his preferred length, floored at 80%. Then:</p>
<ol>
<li><strong>Accept</strong> if effective value ≥ the higher of his reservation and 97% of his current ask. On his <em>final</em> round of patience, the bar drops to the midpoint between his reservation and his current ask.</li>
<li><strong>Lowball</strong> if effective value is below the lowball line: patience −1, his floor hardens 3%, his ask does not move. A second lowball ends talks.</li>
<li><strong>Counter</strong> otherwise: patience −1, and his ask concedes (0.35 + 0.2 × loyalty) of the gap toward your offer, never below his floor. Running out of patience on a counter also ends talks.</li>
</ol>
<p>Once talks end, "Offer what he wants" still works — at <strong>110% of his anchor</strong>. For the angry star above, that is about $26M a year to undo a failed negotiation.</p>
<h3>The efficient path</h3>
<p>Against a loyal player, open just above his floor (around 85% of market) and let him counter: he concedes about half the gap each round and you have four, so your third offer near 90% of market lands. Against a low-loyalty player, do not fish: open above his lowball line, then on round two offer the midpoint of his floor and current ask — the final-round rule accepts exactly that. Fewer years than he wants costs 5% per year in effective value.</p>

<h2>Bird rights: what they do here</h2>
<p>Bird rights do three things here: a full-Bird player gets +0.10 loyalty in re-sign talks; if he reaches free agency, your offer bypasses the cap and the exceptions entirely (capped at his market ask) and his acceptance bar drops 4 points; and the AI treats his old team as the favorite to keep him. One honest caveat: in the current build Bird rights exist only on real-roster imports — players with two or more seasons left on their deal at import carry full rights — and are not earned over time in a generated league. Check the tag on the free-agent board before you count on them.</p>
<p>The re-sign step itself has no cap gate. An extension can take you over the cap, the tax or the aprons; the only limits are his service-time minimum and maximum and the 1–5 year range. What the aprons take away is covered in the <a href="/blog/salary-cap-aprons-and-exceptions">cap guide</a>.</p>

<h2>If he reaches free agency, the math changes</h2>
<p>A free agent does not negotiate round by round. He has one acceptance total: market × a tier fraction (1.02 for 80+, 0.96 for 74–79, 0.90 for 68–73, 0.82 below), adjusted by your team's appeal — a .700 team gets about 3.6 points off, a .300 team pays 3.6 more — minus 4 points if you hold his Bird rights, clamped to 72–120%. At or above that total he signs on the spot; a fair-but-short offer draws a counter; anything under 45% of market is brushed off. Asks decay to 50% by day 30 of the window, but his old team's AI fights for him the whole time. The Re-sign step is almost always the cheaper room.</p>

<h2>Re-sign checklist</h2>
<ul>
<li>Fix the lineup first: a top-five talent on the bench costs 20–35 points of loyalty.</li>
<li>Extend a year early — market is priced on OVR, so a 22-year-old gets more expensive every summer.</li>
<li>Never lowball twice. Getting a player back after talks end costs 110% of his anchor.</li>
<li>Veterans (32+) settle 3% lower with an extra half-round of patience — that is where the discounts are.</li>
</ul>
<p><a href="/">Open BS Hoops</a> and check the Mood column on your roster before your next re-sign window.</p>
`,
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'injuries-suspensions-and-roster-depth',
    title: 'Injuries in BS Hoops: The Real Odds, How Long Players Miss, and When to Play Through',
    seoTitle: 'Basketball GM Injuries Guide — Injury Odds, Severity, Playing Through & Depth',
    metaDescription:
      'The exact injury model in BS Hoops: a 1.2% per-game base rate scaled by minutes, the 68/21/9/2 severity split, how many games each tier costs, the 2.2× risk of playing through, foul-out suspensions and fines, and how to build a roster that absorbs it.',
    keywords: ['basketball gm injuries', 'basketball sim injury rate', 'play through injury basketball gm', 'roster depth basketball gm'],
    publishDate: '2026-11-26',
    category: 'roster',
    readingTime: 7,
    summary:
      'A 32-minute starter has about a 59% chance of getting hurt at some point in an 82-game season; two in three injuries cost a game or two, one in fifty ends the year. The real numbers, and how to build around them.',
    related: ['rotation-bench-order-and-minutes', 'game-plans-and-pace', 'rebuild-or-contend-timeline'],
    content: `
<p>Injuries in BS Hoops are rolled after every game for every player who logged minutes, with a fixed base rate scaled by how much he played. The model is small enough to hold in your head, and once you do, decisions that feel like luck — how deep to go, whether to play a banged-up starter, what a ninth man is worth — turn into arithmetic.</p>

<h2>The per-game roll</h2>
<p>The base chance of an injury is <strong>1.2% per game at 36 minutes</strong>. Minutes scale it linearly — a 24-minute player is at two thirds of the rate, an 18-minute player at half — capped at 1.4× for overtime nights of 50+ minutes. Players already hurt are skipped, and a player who did not play cannot get hurt.</p>
<p>In the default rotation a starter plays about 32 minutes (see the <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a>), so his per-game chance is about 1.07%. A second-unit player at 16 minutes is around 0.53%. Over 82 games:</p>
<table>
<thead><tr><th>Role</th><th>Minutes</th><th>Per game</th><th>Expected injuries / season</th><th>Chance of at least one</th></tr></thead>
<tbody>
<tr><td>Starter</td><td>32</td><td>1.07%</td><td>0.87</td><td>≈ 59%</td></tr>
<tr><td>Starter, "ride the starters"</td><td>~41</td><td>1.37%</td><td>1.12</td><td>≈ 68%</td></tr>
<tr><td>Second unit</td><td>16</td><td>0.53%</td><td>0.44</td><td>≈ 35%</td></tr>
</tbody>
</table>
<p>Add it up across a ten-man rotation and a team takes roughly <strong>six to seven injuries a season</strong>. That is the planning number: not "will someone get hurt" but "which six or seven games' worth of absences will I absorb, and who covers them."</p>

<h2>Severity: what an injury costs you</h2>
<p>When the roll hits, a second roll sets the severity. The return date is in days of the season calendar; at about 3.5 games a week, one day is roughly half a game.</p>
<table>
<thead><tr><th>Severity</th><th>Share</th><th>Days out</th><th>Games missed (approx.)</th></tr></thead>
<tbody>
<tr><td>Day-to-day</td><td>68%</td><td>2–5</td><td>1–2</td></tr>
<tr><td>Minor</td><td>21%</td><td>7–14</td><td>3–7</td></tr>
<tr><td>Major</td><td>9%</td><td>21–45</td><td>10–22</td></tr>
<tr><td>Season-ending</td><td>2%</td><td>Rest of the year, including playoffs</td><td>All</td></tr>
</tbody>
</table>
<p>Multiply through: of a team's six or seven injuries a year, about 0.6 are major and about 0.13 are season-ending. In plain terms, roughly one team in eight loses a rotation player for the year each season, and most teams see one long absence. Nearly 90% of injuries are gone within two weeks of the calendar. The body part (ankle, knee, hamstring and so on) is flavor; severity is what is rolled.</p>
<p>In the real-roster league the same rates apply to everyone, so a 36-year-old star is no more fragile than a rookie. Age shows up in the <a href="/blog/player-development-and-aging">decline curve</a>, not the injury table.</p>

<h2>What happens to your lineup</h2>
<p>An injured player is removed from the pool before the lineup is built for each game. He does not play and he is not auto-slotted. The sim then resolves your lineup from the healthy players in your bench order: if a starter is out, the next player at his position group steps up and everyone below shifts. That is why bench slots 6 through 10 matter even though they rarely play when healthy — they are the players who become your second unit the week your sixth man goes down.</p>
<p>If injuries leave you with fewer than five healthy bodies, the engine presses day-to-day and minor cases back into service automatically. Players with a major or season-ending injury never suit up, so with 13 or more on the roster you will essentially always field a team.</p>
<p>Two places injuries do <em>not</em> reach: ratings and trade value. An injured player's OVR is unchanged, and the trade evaluator prices OVR, age, potential and contract without reading the injury list. The power rankings, by contrast, are computed from healthy players, so a 55-win roster with a major injury will drop in the rankings before it drops in the standings.</p>

<h2>Playing through an injury</h2>
<p>For day-to-day and minor injuries you can choose to <strong>play through</strong>: the injury is cleared and he is available immediately, but for the next <strong>10 days</strong> his injury roll is multiplied by <strong>2.2</strong>. For a 32-minute starter that is about 2.35% per game instead of 1.07% — roughly 11% odds of a new injury over the five or so games in the window, versus about 5% if he had been healthy. And the new injury rolls severity fresh: a 9% chance it is major, 2% that it ends his season.</p>
<p>So the trade is about 6 extra percentage points of injury risk in exchange for one to seven games of availability. Because severity is re-rolled, that extra 6% carries roughly a 1-in-185 added chance of a major injury and about 1-in-800 of a season-ender. The expected cost is small; the tail is not. Three rules follow:</p>
<ul>
<li><strong>Play through day-to-day injuries in the playoffs</strong> and in any late-season game that decides seeding. Two games of a star is worth the risk when the games are worth more — home court is worth about a point a game more in the playoffs than in the regular season.</li>
<li><strong>Sit minor injuries in November.</strong> Three to seven regular-season games are not worth doubling a starter's injury odds for ten days when one new injury in nine is a 10-to-22-game absence.</li>
<li><strong>Weigh the replacement, not the star.</strong> The cost of sitting him is the gap between him and the next player in his position group on your bench. If that gap is three OVR points, sit him every time; if it is fifteen and the game matters, the 2.2× is worth paying.</li>
</ul>

<h2>Suspensions and fines</h2>
<p>Discipline uses the same availability system as injuries. After every game, each player who <strong>fouled out</strong> (six personal fouls) is rolled: a 5% chance of a suspension — one game three quarters of the time, two games otherwise — and an 8% chance of a fine between $15,000 and $110,000. Fines are news only and never bench anyone. A suspended player is unavailable exactly like an injured one and cannot be played through. Foul-outs are rare enough that suspensions are a once-a-season event for most teams, but the one time it lands on your starting center before a back-to-back, the same bench-order logic decides who starts.</p>

<h2>League Rules: tuning the model</h2>
<p>League Rules expose two dials: an injury rate multiplier from 0 to 3 (0 switches injuries off; at 3 a starter is at 3.2% per game) and a duration multiplier from 0.25 to 3 that stretches every return date except season-enders. Both default to 1.</p>

<h2>Building a roster that absorbs it</h2>
<ul>
<li><strong>Pay for the ninth and tenth men, not the fourteenth.</strong> Six to seven injuries a year means your second unit will start real games. A 72-OVR ninth man on a $7M market deal is insurance you will use; the 13th through 15th spots can be minimums.</li>
<li><strong>Position coverage over raw OVR at the bottom.</strong> The starter who gets hurt is replaced by the next player in his position group. Three guards, four forwards and two centers in your top nine means no injury forces a 65-OVR center into 30 minutes.</li>
<li><strong>Riding the starters costs about 0.25 injuries a season per starter.</strong> It is worth it in a playoff series and not worth it in January.</li>
<li><strong>Do not trade for a player because he is "due" to stay healthy.</strong> Every game is an independent roll. Last year's injuries tell you nothing about this year's.</li>
</ul>
<p>The distribution is narrow: six or seven injuries a year, most of them short, one long one most seasons. Build the bench for that and set the order so the right players step up, and the week your sixth man goes down is a footnote instead of a lost month.</p>
<p><a href="/">Open BS Hoops</a> and check your injury report before you sim the next week.</p>
`,
  },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isPublished(post: BlogPost, today = todayIso()): boolean {
  return post.publishDate <= today;
}

/** Published posts, newest first. Future-dated posts are hidden so they go
 *  live on their publishDate (the routes revalidate daily). */
export function getPublishedPosts(): BlogPost[] {
  const today = todayIso();
  return blogPosts
    .filter(p => isPublished(p, today))
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate));
}

/** A post by slug — only if published. */
export function getPublishedPostBySlug(slug: string): BlogPost | undefined {
  const post = blogPosts.find(p => p.slug === slug);
  return post && isPublished(post) ? post : undefined;
}

/** Related posts that are already live, padded with the newest others. */
export function getRelatedPosts(post: BlogPost, max = 3): BlogPost[] {
  const live = getPublishedPosts().filter(p => p.slug !== post.slug);
  const picked = post.related
    .map(s => live.find(p => p.slug === s))
    .filter((p): p is BlogPost => !!p);
  for (const p of live) {
    if (picked.length >= max) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked.slice(0, max);
}

export function formatPostDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}
