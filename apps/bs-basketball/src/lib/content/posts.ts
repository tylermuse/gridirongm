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
