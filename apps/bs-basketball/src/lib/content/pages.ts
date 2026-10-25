/**
 * BS Hoops programmatic SEO landing pages (/vs, /alternatives, /best, /for,
 * /glossary). Mirrors the structure of BS Football's src/lib/content/pages.ts.
 *
 * Every BS Hoops claim here must be verifiable in the app: about/page.tsx,
 * pricing/page.tsx and lib/content/posts.ts (engine numbers). Competitor facts
 * stick to widely known, stable details — no prices or version numbers.
 */

export interface SEOPage {
  section: 'vs' | 'alternatives' | 'for' | 'glossary' | 'best';
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  content: string;
  internalLinks: { label: string; href: string }[];
  schema?: 'FAQ' | 'HowTo' | 'Article';
}

export const seoPages: SEOPage[] = [
  // ─── Page 1: vs/basketball-gm ─────────────────────────────────────────
  {
    section: 'vs',
    slug: 'basketball-gm',
    title: 'BS Hoops vs Basketball GM — Honest Comparison',
    seoTitle: 'BS Hoops vs Basketball GM — Honest Comparison (2026)',
    metaDescription:
      'How BS Hoops compares to Basketball GM: live possession-by-possession games, NBA-style cap aprons and exceptions, pick protections, scouting and customization. Both are free in your browser.',
    keywords: [
      'bs hoops vs basketball gm',
      'basketball gm comparison',
      'basketball gm alternative',
      'games like basketball gm',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'Basketball GM Alternative', href: '/alternatives/basketball-gm' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'What Is a Basketball GM Simulator?', href: '/glossary/basketball-gm-simulator' },
      { label: 'Salary Cap, Tax & Aprons Guide', href: '/blog/salary-cap-aprons-and-exceptions' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>

<h2>TL;DR</h2>
<p>Basketball GM is the game that defined the free browser basketball management genre. It is free, open source, remarkably deep, and backed by a huge, loyal community. BS Hoops is a newer free browser GM game that puts its effort into a live game viewer, a detailed NBA-style cap ladder with aprons and exceptions, protected draft picks, and a modern interface. Both cost nothing to play and run without a download, so the honest answer to "which is better" is: the one that fits how you like to play.</p>

<h2>At-a-Glance Comparison</h2>
<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th>BS Hoops</th>
      <th>Basketball GM</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Price</td><td>Free (optional Premium)</td><td>Free</td></tr>
    <tr><td>Platform</td><td>Browser, no download</td><td>Browser, no download</td></tr>
    <tr><td>Open source</td><td>No</td><td>Yes</td></tr>
    <tr><td>Interface</td><td>Modern, card-based</td><td>Dense, table-driven</td></tr>
    <tr><td>Watching games</td><td>Live viewer with shot chart, win probability and game flow</td><td>Text play-by-play and box scores</td></tr>
    <tr><td>Salary cap</td><td>Soft cap, luxury tax, first and second aprons, MLE / Bi-Annual / Room exceptions</td><td>Configurable cap and tax settings</td></tr>
    <tr><td>Draft picks in trades</td><td>Top-N protections with roll-over and conveyance rules</td><td>Standard pick trading</td></tr>
    <tr><td>Scouting</td><td>Three levels: quick look, workout, full evaluation</td><td>Ratings-forward</td></tr>
    <tr><td>AI commentary &amp; podcasts</td><td>Yes (Premium)</td><td>No</td></tr>
    <tr><td>Customization &amp; modding</td><td>Custom league settings</td><td>Extensive (God Mode, custom leagues, community files)</td></tr>
  </tbody>
</table>

<h2>Watching the Games</h2>
<p>Basketball GM simulates games quickly and lets you follow along through text play-by-play and detailed box scores. It is efficient, and many longtime players prefer to sim straight through.</p>
<p>BS Hoops simulates every game possession by possession and gives you a live game viewer for your own team: a shot chart that fills in as the game unfolds, a win probability line, and a game-flow view of runs and lead changes. You can also replay recent games from the box score. If you like to watch the moment a trade starts paying off, this is the biggest difference between the two games.</p>

<h2>The Salary Cap</h2>
<p>Basketball GM offers a configurable cap and tax setup that you can tune to taste. BS Hoops leans hard into modern NBA-style cap rules. In 2026-27 the cap is $165.0M, the luxury tax line is about $200.5M, and the first and second aprons sit at about $209.1M and $221.8M. As payroll climbs, the game takes tools away exactly the way a real front office feels it: above the tax the Mid-Level shrinks to the Taxpayer MLE, above the first apron the Bi-Annual disappears and trade matching tightens to 110% plus $250K, and above the second apron there is no Mid-Level at all and trades must match one-for-one. Full and Early Bird rights, the Room Exception, hard-capping from the Non-Tax MLE, dead money and the stretch provision are all modeled. Our <a href="/glossary/nba-salary-cap-aprons">cap aprons explainer</a> walks through each line.</p>

<h2>Trades and Draft Picks</h2>
<p>Both games have AI trade partners that evaluate value. BS Hoops converts every player and pick into a single trade-value number, adjusts it for age, potential and contract, and tilts acceptance by each team's disposition (Rebuilding, Contending, Win Now). It also supports <strong>pick protections</strong>: attach a top-N protection, choose how long it can roll forward, and decide whether it voids or converts to a second-rounder if it never conveys. A trade finder helps you build deals that pass salary matching.</p>

<h2>Draft and Scouting</h2>
<p>BS Hoops hides true potential behind noisy projections. Every draft you get a scouting budget to spend on quick looks, workouts and full evaluations, and a hidden boom/normal/bust development trait means some picks will surprise you either way. There is also a Mock Draft tab that projects every pick using the same logic AI teams use on the clock.</p>

<h2>Customization and Community</h2>
<p>This is where Basketball GM shines. It is open source, supports God Mode, custom leagues and a deep library of community-made files, and its community has refined the game for years. BS Hoops offers custom league settings and multiple leagues with unlimited saves, plus a real-roster league built from the current 2026-27 rosters, but it is more opinionated and has fewer knobs. If modding is the reason you play, Basketball GM is hard to beat.</p>

<h2>Who Should Choose Basketball GM</h2>
<ul>
  <li>You want maximum customization, God Mode and community-made leagues</li>
  <li>You love raw data density and fast, hands-off simming</li>
  <li>You want an open-source project with a long track record</li>
</ul>

<h2>Who Should Choose BS Hoops</h2>
<ul>
  <li>You want to watch your games live with a shot chart and win probability</li>
  <li>You want real NBA-style aprons, exceptions and Bird rights to shape every decision</li>
  <li>You want protected picks and scouting uncertainty on draft night</li>
  <li>You prefer a modern interface and a quick start with no account required</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Is BS Hoops a copy of Basketball GM?</h3>
<p>No. BS Hoops is part of the same genre that Basketball GM helped popularize, but it is built separately with its own engine, cap model, trade-value system and game viewer.</p>

<h3>Are both games really free?</h3>
<p>Yes. Basketball GM is free. BS Hoops is free with banner ads, including the full 82-game season, draft, free agency and trades; an optional Premium plan removes ads and adds AI commentary and podcast credits.</p>

<h3>Can I play with real players?</h3>
<p>In BS Hoops, the <a href="/rosters">Rosters</a> page imports the current 2026-27 rosters with contracts and future pick trades. BS Hoops is a parody and simulation and is not affiliated with the NBA.</p>

<h3>Do I need an account?</h3>
<p>No account is required to play BS Hoops. Signing in lets you sync saves across devices.</p>

<p><strong><a href="/">Play BS Hoops Now — Free in Your Browser</a></strong></p>
`,
  },

  // ─── Page 2: vs/nba-2k-myleague ───────────────────────────────────────
  {
    section: 'vs',
    slug: 'nba-2k-myleague',
    title: 'BS Hoops vs NBA 2K MyLeague — Which GM Mode Fits You?',
    seoTitle: 'BS Hoops vs NBA 2K MyLeague & MyGM — Free Browser Alternative (2026)',
    metaDescription:
      'Compare BS Hoops with NBA 2K MyLeague and MyGM: price, platform, time per season, cap rules, trades and draft. BS Hoops is a free browser basketball GM you can sim in minutes.',
    keywords: [
      'bs hoops vs nba 2k myleague',
      'nba 2k myleague alternative',
      'myleague vs basketball gm',
      'free myGM alternative',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'NBA 2K MyLeague Alternative', href: '/alternatives/nba-2k-myleague' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'Beginner’s Guide to Your First Season', href: '/blog/first-season-beginners-guide' },
      { label: 'Pricing', href: '/pricing' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>

<h2>TL;DR</h2>
<p>NBA 2K's MyLeague and MyGM modes are the most visually impressive way to run a basketball franchise. You get the official license, full 3D games you can play yourself, and an enormous number of settings. The cost is real, though: a paid annual console or PC release, big downloads, and seasons that take hours. BS Hoops is a free browser GM game focused on the front office. There is nothing to install, and you can sim a full season in minutes while still watching the games that matter.</p>

<h2>At-a-Glance Comparison</h2>
<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th>BS Hoops</th>
      <th>NBA 2K MyLeague / MyGM</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Price</td><td>Free (optional Premium)</td><td>Paid annual release</td></tr>
    <tr><td>Platform</td><td>Any modern browser</td><td>Console and PC</td></tr>
    <tr><td>Install</td><td>None</td><td>Large download</td></tr>
    <tr><td>On-court gameplay</td><td>Simulated; live viewer with shot chart and win probability</td><td>Full 3D games you can play</td></tr>
    <tr><td>Time per season</td><td>Minutes when simming</td><td>Hours, more if you play games</td></tr>
    <tr><td>License</td><td>Parody/simulation, not NBA-affiliated</td><td>Official NBA license</td></tr>
    <tr><td>Cap rules</td><td>Tax, two aprons, MLE, Bi-Annual, Room Exception, Bird rights</td><td>Deep, configurable rules</td></tr>
    <tr><td>Focus</td><td>Front office decisions</td><td>Gameplay plus franchise management</td></tr>
  </tbody>
</table>

<h2>Price and Platform</h2>
<p>NBA 2K is a full-price game released every year on consoles and PC. If you already own it and love it, MyLeague is a fantastic mode. If you just want to scratch the GM itch, BS Hoops is free to play in your browser with banner ads, and works on whatever device you have open. An optional Premium subscription removes ads and adds AI commentary, podcast credits, and extra scouting and free-agent intel, and it unlocks <a href="https://bs-football.com">BS Football</a> too.</p>

<h2>Time Per Season</h2>
<p>This is the biggest practical difference. A 2K franchise season, even with simming, involves loading screens, menus and long sim stretches. BS Hoops is built for fast decision loops: sim a week, react to injuries, check the trade market, sim again. The trade deadline lands on day 115 of a 170-day regular season, the top six seeds in each conference make the playoffs and seeds 7-10 go to the play-in, and the offseason runs straight through the draft, re-signings and a 30-day free-agency window. You can finish a full 82-game season, playoffs and offseason over a lunch break or two.</p>

<h2>Depth of the Front Office</h2>
<p>MyLeague has a deserved reputation for depth and customization. BS Hoops matches the parts of that depth that matter most to front-office players and models them precisely:</p>
<ul>
  <li><strong>The cap ladder:</strong> $165.0M cap, ~$200.5M tax, ~$209.1M first apron, ~$221.8M second apron, with tools removed at each line.</li>
  <li><strong>Exceptions:</strong> Non-Tax MLE (hard-caps you at the first apron), Taxpayer MLE, Bi-Annual, Room Exception and veteran minimums.</li>
  <li><strong>Trades:</strong> tiered salary matching, a trade-value model tied to age and contract, AI dispositions, and top-N pick protections.</li>
  <li><strong>Draft:</strong> a 14-team lottery, tiered scouting, a Mock Draft tab and hidden boom/bust development traits.</li>
  <li><strong>Free agency:</strong> bid against AI teams with prices that fall toward 50% of market value by the end of the 30-day window.</li>
</ul>

<h2>Gameplay vs Simulation</h2>
<p>If you want to play the games yourself with a controller, 2K is the obvious pick and BS Hoops does not try to compete there. BS Hoops simulates every possession and lets you shape outcomes through your rotation and Game Plan settings (pace, offensive focus, shot risk, defensive pressure and scheme). Then you watch it play out live with a shot chart, win probability and game flow.</p>

<h2>Who Should Choose NBA 2K MyLeague</h2>
<ul>
  <li>You want to play games on the court, not just manage</li>
  <li>You want the official license with real logos and likenesses</li>
  <li>You already own a console or gaming PC and the latest release</li>
</ul>

<h2>Who Should Choose BS Hoops</h2>
<ul>
  <li>You want the GM experience without buying a game</li>
  <li>You want a full season in minutes, not hours</li>
  <li>You want to play in a browser on any computer, no install</li>
  <li>You care most about the cap, trades and the draft</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Is BS Hoops a free alternative to MyGM?</h3>
<p>Yes. The full season, draft, lottery, free agency, trades, stats and league history are free. Premium is optional.</p>

<h3>Does BS Hoops have real players?</h3>
<p>The <a href="/rosters">Rosters</a> page imports the current 2026-27 rosters, contracts and future pick trades, converted to BS Hoops ratings. BS Hoops is a parody and simulation and is not affiliated with the NBA or any team or player.</p>

<h3>Can I play the games myself in BS Hoops?</h3>
<p>No. Games are simulated possession by possession. You control the rotation and game plan, and you can watch your games live.</p>

<h3>Do I need to download anything?</h3>
<p>No. BS Hoops runs in your browser with no download and no account required.</p>

<p><strong><a href="/">Start a Free BS Hoops League</a></strong></p>
`,
  },

  // ─── Page 3: alternatives/basketball-gm ───────────────────────────────
  {
    section: 'alternatives',
    slug: 'basketball-gm',
    title: 'Basketball GM Alternative — BS Hoops',
    seoTitle: 'Best Basketball GM Alternative — BS Hoops (Free, No Download)',
    metaDescription:
      'Looking for a game like Basketball GM? BS Hoops is a free browser basketball GM with a live game viewer, NBA-style cap aprons and exceptions, pick protections and tiered scouting.',
    keywords: [
      'basketball gm alternative',
      'games like basketball gm',
      'alternative to basketball gm',
      'basketball gm similar games',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'BS Hoops vs Basketball GM', href: '/vs/basketball-gm' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'Free Basketball Games Online', href: '/best/free-basketball-games-online' },
      { label: 'Rotation & Bench Order Guide', href: '/blog/rotation-bench-order-and-minutes' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>

<h2>Why Look for a Basketball GM Alternative?</h2>
<p>Basketball GM is one of the best free sports management games ever made, and plenty of people play it for years. Players usually go looking for something similar not because anything is wrong with it, but because they want a different flavor after hundreds of seasons. The most common reasons we hear:</p>
<ul>
  <li><strong>They want to watch games</strong>, not just read box scores</li>
  <li><strong>They want modern NBA cap rules</strong>, with aprons and exceptions that change what you can do</li>
  <li><strong>They want draft-night uncertainty</strong> from scouting instead of visible ratings</li>
  <li><strong>They want a different look</strong> after years of the same interface</li>
</ul>

<h2>BS Hoops: A Different Take on the Same Genre</h2>
<p>BS Hoops is a free basketball GM game that runs in your browser. Pick one of 30 franchises and run it: build the roster, manage the cap, and live with the results season after season. No download and no account required.</p>

<h3>Games You Can Watch</h3>
<p>Every game is simulated possession by possession. Watch your own games live with a shot chart, win probability and game flow, or replay recent games from the box score. It turns a trade or a rotation change into something you can actually see.</p>

<h3>A Real Cap Ladder</h3>
<p>The 2026-27 cap is $165.0M, with the luxury tax at about $200.5M and aprons at about $209.1M and $221.8M. Using the Non-Tax Mid-Level hard-caps you at the first apron. Crossing the second apron removes the Mid-Level entirely and forces one-for-one salary matching. Bird rights let you keep your own stars over the cap. The <a href="/blog/salary-cap-aprons-and-exceptions">cap guide</a> has every number.</p>

<h3>Protected Picks</h3>
<p>Trade first-rounders with top-N protections, choose how long they roll forward, and decide whether they void or become a second-rounder. A top-3 protection costs only about 9% of a pick's trade value; lottery protection costs about 42%.</p>

<h3>Scouting With Real Uncertainty</h3>
<p>Prospects show a perceived potential with noise. Spend scouting points on quick looks, workouts and full evaluations. Full evaluations can flag a <em>Gem</em> or <em>Bust risk</em>, since about 15% of players carry a hidden bust trait and about 15% a boom trait.</p>

<h3>Rotation That Actually Matters</h3>
<p>Starters are built as two guards, two forwards and a center, and the first five players on your bench form the second unit. Bench slot 6 and below barely play. Set it once and you will feel the difference. See <a href="/blog/rotation-bench-order-and-minutes">how bench order drives minutes</a>.</p>

<h2>Honest Comparison</h2>
<table>
  <thead>
    <tr>
      <th>Feature</th>
      <th>BS Hoops</th>
      <th>Basketball GM</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Price</td><td>Free (optional Premium)</td><td>Free</td></tr>
    <tr><td>Interface</td><td>Modern, card-based</td><td>Dense, table-driven</td></tr>
    <tr><td>Game viewing</td><td>Live viewer: shot chart, win probability, game flow</td><td>Text play-by-play, box scores</td></tr>
    <tr><td>Cap model</td><td>Tax + two aprons + exception ladder</td><td>Configurable cap and tax</td></tr>
    <tr><td>Pick protections</td><td>Yes</td><td>Standard pick trading</td></tr>
    <tr><td>Customization</td><td>Custom league settings</td><td>Extensive, God Mode</td></tr>
    <tr><td>Open source</td><td>No</td><td>Yes</td></tr>
  </tbody>
</table>

<h2>What Basketball GM Still Does Better</h2>
<p>Being fair matters. Basketball GM is open source, has God Mode and very deep customization, a large library of community-made leagues, and years of refinement from a big community. If you love tinkering with league files or running wild historical what-ifs, keep it installed in a tab. Many players happily run both.</p>

<h2>Your First Hour in BS Hoops</h2>
<ol>
  <li><strong>Pick a team.</strong> Click any team for a generated league, or import real rosters. For a first save, choose a team near or under the $165.0M cap so every tool works.</li>
  <li><strong>Set the rotation.</strong> Put your five best non-starters in bench slots 1-5.</li>
  <li><strong>Sim a week, watch a game.</strong> Open the live viewer and see where your team wins and loses possessions, then tune the Game Plan.</li>
  <li><strong>Check the deadline math.</strong> The deadline is day 115 of 170. Decide buyer or seller before then.</li>
  <li><strong>Plan the offseason.</strong> Re-sign Bird-rights players first, then shop the late days of the 30-day free-agency window, when prices fall toward 50% of market value.</li>
</ol>

<h2>Frequently Asked Questions</h2>
<h3>Is BS Hoops free like Basketball GM?</h3>
<p>Yes. The full game is free with banner ads: 82-game seasons, draft, lottery, free agency, trades, stats and league history. Premium is optional and removes ads.</p>

<h3>Can I start with real rosters?</h3>
<p>Yes. Use <a href="/rosters">Rosters</a> to import the current 2026-27 rosters with contracts and future pick trades, or browse every team on the <a href="/rosters/2026">2026 rosters</a> pages first.</p>

<h3>Will my saves stay in my browser?</h3>
<p>You can play without an account. Sign in if you want to sync saves across devices.</p>

<h3>Is there a football version?</h3>
<p>Yes. The same team makes <a href="https://bs-football.com">BS Football</a>, and a Premium subscription covers both games.</p>

<p><strong><a href="/">Try BS Hoops — Free in Your Browser</a></strong></p>
`,
  },

  // ─── Page 4: alternatives/nba-2k-myleague ─────────────────────────────
  {
    section: 'alternatives',
    slug: 'nba-2k-myleague',
    title: 'NBA 2K MyLeague Alternative — BS Hoops',
    seoTitle: 'Free NBA 2K MyLeague Alternative — BS Hoops Browser Basketball GM',
    metaDescription:
      'Want MyLeague or MyGM without buying a console game? BS Hoops is a free browser basketball GM: real-style cap aprons, trades, draft lottery and live sim games in minutes per season.',
    keywords: [
      'nba 2k myleague alternative',
      'myGM alternative free',
      'free alternative to nba 2k franchise',
      'browser basketball franchise mode',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'BS Hoops vs NBA 2K MyLeague', href: '/vs/nba-2k-myleague' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'Rebuild or Contend?', href: '/blog/rebuild-or-contend-timeline' },
      { label: '2026 Team Rosters', href: '/rosters/2026' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>

<h2>Why Look for a MyLeague Alternative?</h2>
<p>MyLeague and MyGM in NBA 2K are deep, polished franchise modes. But plenty of players love the front office far more than the gameplay, and for them the package can feel heavy:</p>
<ul>
  <li><strong>Cost:</strong> a paid release every year, plus the hardware to run it</li>
  <li><strong>Time:</strong> long sims and menus make a full season an evening project</li>
  <li><strong>Access:</strong> you cannot pick it up on a work laptop or a borrowed computer</li>
  <li><strong>Focus:</strong> a franchise mode is one part of a much bigger game</li>
</ul>
<p>If what you really want is to build a roster, work the cap and win trades, a dedicated GM game is a better fit.</p>

<h2>BS Hoops: The Front Office, Nothing Else in the Way</h2>
<p>BS Hoops is a free basketball GM game that runs entirely in your browser. There is no download and no account required. Click a team and the season is waiting.</p>

<h3>Real-Roster Start</h3>
<p>Import the current 2026-27 rosters, contracts and future pick trades from <a href="/rosters">Rosters</a>, converted to BS Hoops ratings. Each franchise has a public page under <a href="/rosters/2026">2026 rosters</a> showing payroll, cap tier, age profile and depth chart, so you can choose your project before you commit. Prefer something fresh? Start a generated 30-team league instead.</p>

<h3>The Cap Feels Like the Real Thing</h3>
<p>The cap is $165.0M in 2026-27 and grows about 7% a year. The tax line sits near $200.5M and the aprons at about $209.1M and $221.8M. Each line takes something away: the full Mid-Level, the Bi-Annual, flexible trade matching. In the real-roster league only four teams start under the cap, and several contenders start above the second apron, which is exactly why every save feels different.</p>

<h3>Trades That Make Sense</h3>
<p>Every asset has a trade value shaped by rating, age, potential and contract. AI teams are labeled by disposition: Win Now teams pay for veterans, while rebuilders discount players 31 and older. Protect your picks, use the trade finder, and watch salary matching rules change as you climb the cap ladder.</p>

<h3>A Draft Worth Watching</h3>
<p>A 14-team lottery where the three worst records each have a 14% chance at #1, tiered scouting with noisy projections, a Mock Draft tab, and hidden boom/bust traits. Then a 30-day free-agency window where prices fall to 50% of market value by the end.</p>

<h3>Watch the Games You Care About</h3>
<p>Every game is simulated possession by possession. Sim through the rest of the league and watch your own games live with a shot chart, win probability and game flow.</p>

<h2>Side-by-Side</h2>
<table>
  <thead>
    <tr>
      <th></th>
      <th>BS Hoops</th>
      <th>NBA 2K MyLeague / MyGM</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Price</td><td>Free</td><td>Paid annual release</td></tr>
    <tr><td>Where it runs</td><td>Browser</td><td>Console / PC</td></tr>
    <tr><td>Season length</td><td>Minutes when simming</td><td>Hours</td></tr>
    <tr><td>On-court play</td><td>Simulated, watchable live</td><td>Fully playable 3D games</td></tr>
    <tr><td>License</td><td>Parody/simulation</td><td>Official NBA license</td></tr>
  </tbody>
</table>

<h2>What You Give Up</h2>
<p>Be clear-eyed: BS Hoops has no controller gameplay, no 3D presentation, and no official license. If those are why you play 2K, stay with 2K. If you mostly sim anyway, you lose very little and gain a game that is free, instant and built entirely around front-office decisions.</p>

<h2>Three Saves Worth Trying</h2>
<ul>
  <li><strong>The cap-room project.</strong> Only four teams start the real-roster league under the cap: Charlotte, Milwaukee, Brooklyn and Memphis. Use the room plus the Room Exception to rebuild on your terms.</li>
  <li><strong>The second-apron contender.</strong> Take over a team already above $221.8M. No Mid-Level, one-for-one trade matching, and a title window that is closing. Every move has to be surgical.</li>
  <li><strong>The patient rebuild.</strong> Sell veterans at 29-30 before their trade value drops, collect lottery tickets, and lean on the three-season grace period before ownership can fire you. The <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend guide</a> lays out the timeline.</li>
</ul>

<h2>Frequently Asked Questions</h2>
<h3>Is BS Hoops really free?</h3>
<p>Yes. Free includes the full 82-game season, draft, lottery, free agency, trades, stats, league history, custom league settings and unlimited saves. <a href="/pricing">Premium</a> is optional: no ads, AI commentary on every game, and 5 studio-audio Team Spotlight episodes a month.</p>

<h3>Can I run multiple franchises?</h3>
<p>Yes. Free players get multiple leagues and unlimited saves.</p>

<h3>Is BS Hoops affiliated with the NBA or 2K?</h3>
<p>No. BS Hoops is a parody and simulation, not affiliated with the NBA, 2K, or any team or player.</p>

<h3>Where do I start?</h3>
<p>Read the <a href="/blog/first-season-beginners-guide">first-season guide</a>, then pick a team and sim your first week.</p>

<p><strong><a href="/">Play BS Hoops Free — No Console Needed</a></strong></p>
`,
  },

  // ─── Page 5: best/basketball-gm-games ─────────────────────────────────
  {
    section: 'best',
    slug: 'basketball-gm-games',
    title: 'Best Basketball GM Games in 2026',
    seoTitle: '5 Best Basketball GM Games in 2026 — Free & Paid Options Compared',
    metaDescription:
      'The best basketball GM and management games in 2026, compared honestly: Basketball GM, BS Hoops, NBA 2K MyLeague/MyGM, Hoop Land and Draft Day Sports: Pro Basketball.',
    keywords: [
      'best basketball gm games',
      'best basketball management games',
      'basketball gm games 2026',
      'best nba gm simulator',
    ],
    schema: 'Article',
    internalLinks: [
      { label: 'BS Hoops vs Basketball GM', href: '/vs/basketball-gm' },
      { label: 'BS Hoops vs NBA 2K MyLeague', href: '/vs/nba-2k-myleague' },
      { label: 'Free Basketball Games Online', href: '/best/free-basketball-games-online' },
      { label: 'What Is a Basketball GM Simulator?', href: '/glossary/basketball-gm-simulator' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>
<p>Basketball GM games range from free browser sims you can play between meetings to deep paid franchise modes on console. We compared five of the most popular options on price, platform, depth and who each one is really for. Yes, we make one of them; we have tried to be fair to the rest.</p>

<h2>1. Basketball GM</h2>
<p><strong>Price:</strong> Free | <strong>Platform:</strong> Browser</p>
<p>The standard-bearer of the genre. Basketball GM is free, open source and astonishingly deep, with God Mode, custom leagues, historical what-ifs and a large community creating league files. The interface is dense and table-driven, and games are followed through text play-by-play and box scores. It has been refined for years and has a huge, loyal player base.</p>
<p><strong>Best for:</strong> Players who want maximum depth and customization at no cost.</p>

<h2>2. BS Hoops</h2>
<p><strong>Price:</strong> Free (optional Premium) | <strong>Platform:</strong> Browser</p>
<p>A modern browser basketball GM focused on a live game viewer and real-style cap rules. Every game is simulated possession by possession; you can watch your own with a shot chart, win probability and game flow. The cap ladder includes the luxury tax, first and second aprons, the Mid-Level, Bi-Annual and Room exceptions, and Bird rights. Trades support pick protections, and the draft uses tiered scouting with hidden boom/bust traits. A real-roster league built from the current 2026-27 rosters is one click away. Premium adds AI commentary on every game and audio podcasts.</p>
<p><strong>Best for:</strong> Players who want to watch games and wrestle with NBA-style aprons in a modern interface.</p>

<h2>3. NBA 2K MyLeague / MyGM</h2>
<p><strong>Price:</strong> Paid annual release | <strong>Platform:</strong> Console, PC</p>
<p>The franchise modes inside NBA 2K combine front-office management with full 3D games you can play yourself, all with the official license. MyLeague offers an enormous number of settings for long-running leagues; MyGM adds a more narrative, role-playing layer. The trade-off is cost, hardware and time per season.</p>
<p><strong>Best for:</strong> Players who want official teams and the option to play games on the court.</p>

<h2>4. Hoop Land</h2>
<p><strong>Price:</strong> Varies by platform | <strong>Platform:</strong> Mobile, PC</p>
<p>A retro-styled 2D basketball game that blends playable arcade-style action with franchise management, including college and pro modes. It has a devoted following for its charm and its sandbox-style long-term leagues. Management depth is lighter than a dedicated sim, but you can actually play the games.</p>
<p><strong>Best for:</strong> Players who want a mix of playable games and franchise mode in a retro package.</p>

<h2>5. Draft Day Sports: Pro Basketball</h2>
<p><strong>Price:</strong> Paid | <strong>Platform:</strong> PC</p>
<p>A traditional text-based pro basketball management sim in the style of classic desktop sports sims. It offers detailed league management, scouting, finances and long-term play, and appeals to players who like the old-school desktop sim experience.</p>
<p><strong>Best for:</strong> PC players who want a classic, text-heavy management sim.</p>

<h2>Quick Comparison</h2>
<table>
  <thead>
    <tr>
      <th>Game</th>
      <th>Price</th>
      <th>Platform</th>
      <th>Watch / play games</th>
      <th>Best for</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Basketball GM</td><td>Free</td><td>Browser</td><td>Text play-by-play</td><td>Depth, customization</td></tr>
    <tr><td>BS Hoops</td><td>Free*</td><td>Browser</td><td>Live viewer: shot chart, win probability</td><td>Cap realism, modern UI</td></tr>
    <tr><td>NBA 2K MyLeague / MyGM</td><td>Paid</td><td>Console / PC</td><td>Fully playable 3D</td><td>Official license + gameplay</td></tr>
    <tr><td>Hoop Land</td><td>Varies</td><td>Mobile / PC</td><td>Playable 2D</td><td>Retro fun + franchise</td></tr>
    <tr><td>Draft Day Sports: Pro Basketball</td><td>Paid</td><td>PC</td><td>Text sim</td><td>Classic desktop sim</td></tr>
  </tbody>
</table>
<p>*BS Hoops is free with banner ads; Premium is optional.</p>

<h2>How to Choose</h2>
<ul>
  <li><strong>Maximum depth, free:</strong> Basketball GM</li>
  <li><strong>Watchable games and real apron rules, free:</strong> BS Hoops</li>
  <li><strong>Official NBA and controller gameplay:</strong> NBA 2K MyLeague / MyGM</li>
  <li><strong>Retro playable basketball with a franchise mode:</strong> Hoop Land</li>
  <li><strong>Old-school desktop sim:</strong> Draft Day Sports: Pro Basketball</li>
</ul>
<h2>What We Looked For</h2>
<p>We weighed each game on four things: how much it costs to start, how deep the front-office systems go (cap, trades, draft, development), how you experience the games themselves, and how long a season takes. No single game wins every category. Basketball GM is unmatched on customization, 2K on presentation, Hoop Land on playable charm, and Draft Day Sports on classic desktop depth. BS Hoops aims at a specific spot: modern NBA cap rules and a watchable live game viewer, free in a browser tab.</p>
<p>The two browser options cost nothing, so the easiest move is to try both and see which one keeps you up past midnight. New to the genre? Start with our <a href="/blog/first-season-beginners-guide">first-season guide</a>.</p>

<p><strong><a href="/">Try BS Hoops — Free in Your Browser</a></strong></p>
`,
  },

  // ─── Page 6: best/free-basketball-games-online ────────────────────────
  {
    section: 'best',
    slug: 'free-basketball-games-online',
    title: 'Best Free Basketball Games Online (No Download)',
    seoTitle: 'Best Free Basketball Games Online in 2026 — Play in Your Browser',
    metaDescription:
      'Free basketball games you can play online with no download, with a focus on GM and management games: BS Hoops, Basketball GM and quick arcade options for a short break.',
    keywords: [
      'free basketball games online',
      'basketball games no download',
      'free basketball gm game',
      'browser basketball games',
    ],
    schema: 'Article',
    internalLinks: [
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'Basketball GM Alternative', href: '/alternatives/basketball-gm' },
      { label: 'Beginner’s Guide to Your First Season', href: '/blog/first-season-beginners-guide' },
      { label: 'About BS Hoops', href: '/about' },
    ],
    content: `
<p><em>Last updated October 2026.</em></p>
<p>You do not need a console or a big download to play good basketball games. Your browser can handle full-season franchise sims and quick arcade games alike. This list leans toward management games, because that is where browser games really shine: deep, replayable and easy to pick up for ten minutes at a time.</p>

<h2>1. BS Hoops</h2>
<p><strong>Type:</strong> Basketball GM / franchise sim | <strong>Cost:</strong> Free with ads (optional Premium)</p>
<p>Pick one of 30 franchises and run it: draft, trade, sign free agents and coach the rotation. Every game is simulated possession by possession, and you can watch yours live with a shot chart, win probability and game flow. The cap follows modern NBA-style rules ($165.0M cap, ~$200.5M tax, aprons at ~$209.1M and ~$221.8M), with Bird rights, the Mid-Level and pick protections. Start with a generated league or import the current 2026-27 rosters from <a href="/rosters">Rosters</a>.</p>
<p>The free version includes the full 82-game season, draft and lottery, free agency, trades, all stats, standings and league history, custom league settings, multiple leagues and unlimited saves. No download and no account required.</p>
<p><strong>Best for:</strong> Front-office fans who want to watch their games and work a realistic cap.</p>

<h2>2. Basketball GM</h2>
<p><strong>Type:</strong> Basketball GM / franchise sim | <strong>Cost:</strong> Free</p>
<p>The classic free, open-source basketball management game. It is deep, fast to sim, and endlessly customizable with God Mode and community-made league files. The table-heavy interface rewards players who like numbers, and the community around it is large and active.</p>
<p><strong>Best for:</strong> Players who want deep customization and long-running dynasties.</p>

<h2>3. Arcade Shooting Games</h2>
<p><strong>Type:</strong> Arcade | <strong>Cost:</strong> Free (usually ad-supported)</p>
<p>Browser game portals host many quick basketball games: free-throw shooters, one-on-one arcade matchups and trick-shot puzzles. They are perfect for a two-minute break, but they have no seasons, rosters or long-term decisions. If you enjoy those and want more strategy, a GM game is the natural next step.</p>
<p><strong>Best for:</strong> Short, casual sessions.</p>

<h2>4. Fantasy Basketball</h2>
<p><strong>Type:</strong> Season-long fantasy | <strong>Cost:</strong> Usually free</p>
<p>Not a game you play in one sitting, but fantasy basketball scratches a similar roster-building itch, tied to the real season's box scores. Many fantasy players use a GM sim to keep playing in the offseason. See our page for <a href="/for/fantasy-basketball-players">fantasy basketball players</a>.</p>
<p><strong>Best for:</strong> Players who want stakes tied to the real NBA season.</p>

<h2>Comparison</h2>
<table>
  <thead>
    <tr>
      <th>Game</th>
      <th>Type</th>
      <th>Download?</th>
      <th>Seasons &amp; rosters</th>
      <th>Session length</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>BS Hoops</td><td>GM sim</td><td>No</td><td>Yes, multi-season</td><td>Minutes to hours</td></tr>
    <tr><td>Basketball GM</td><td>GM sim</td><td>No</td><td>Yes, multi-season</td><td>Minutes to hours</td></tr>
    <tr><td>Arcade games</td><td>Arcade</td><td>No</td><td>No</td><td>A few minutes</td></tr>
    <tr><td>Fantasy basketball</td><td>Fantasy</td><td>No</td><td>One real season</td><td>Daily check-ins</td></tr>
  </tbody>
</table>

<h2>Why Browser GM Games Are Worth a Try</h2>
<ul>
  <li><strong>Nothing to install:</strong> open a tab and play on whatever computer you are using.</li>
  <li><strong>Pause anytime:</strong> management sims wait for you, so ten minutes is a real session.</li>
  <li><strong>Huge replay value:</strong> every draft, trade and free-agency window changes the league.</li>
  <li><strong>Free:</strong> both major browser GM games cost nothing to play.</li>
</ul>

<h2>What You Get Free vs Premium in BS Hoops</h2>
<table>
  <thead>
    <tr><th>Free</th><th>Premium (optional)</th></tr>
  </thead>
  <tbody>
    <tr><td>Full 82-game season simulation</td><td>Ad-free experience</td></tr>
    <tr><td>Draft, lottery, free agency, trades</td><td>AI commentary on every game</td></tr>
    <tr><td>All stats, standings, league history</td><td>5 studio-audio Spotlight episodes a month</td></tr>
    <tr><td>Multiple leagues, unlimited saves</td><td>Also unlocks BS Football</td></tr>
  </tbody>
</table>
<p>Details are on the <a href="/pricing">pricing page</a>. The free tier has banner ads; everything that affects how you build a team is included.</p>

<h2>Getting Started in BS Hoops</h2>
<ol>
  <li>Pick a team that is not buried in salary. A team near or under the $165.0M cap can sign, trade and absorb contracts.</li>
  <li>Set your rotation: your five best non-starters belong in bench slots 1-5.</li>
  <li>Sim a week at a time for the first month and watch a couple of games.</li>
  <li>Decide buyer or seller before the deadline on day 115.</li>
</ol>
<p>Our <a href="/blog/first-season-beginners-guide">beginner's guide</a> covers each step. Prefer football? The same team makes <a href="https://bs-football.com">BS Football</a>, also free in your browser.</p>

<p><strong><a href="/">Play BS Hoops — Free, No Download</a></strong></p>
`,
  },

  // ─── Page 7: for/fantasy-basketball-players ───────────────────────────
  {
    section: 'for',
    slug: 'fantasy-basketball-players',
    title: 'A Basketball GM Game for Fantasy Basketball Players',
    seoTitle: 'BS Hoops for Fantasy Basketball Players — Run a Real Front Office',
    metaDescription:
      'Love fantasy basketball? BS Hoops lets you run a whole franchise year-round: draft with scouting, trade with real cap rules, sign free agents and set the rotation. Free in your browser.',
    keywords: [
      'game for fantasy basketball players',
      'fantasy basketball offseason game',
      'basketball gm for fantasy players',
      'dynasty basketball game',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'Rotation & Bench Order Guide', href: '/blog/rotation-bench-order-and-minutes' },
      { label: 'Rebuild or Contend?', href: '/blog/rebuild-or-contend-timeline' },
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: '2026 Team Rosters', href: '/rosters/2026' },
    ],
    content: `
<h2>Fantasy Basketball, Minus the Waiting</h2>
<p>Fantasy basketball is a grind you love: draft prep, waiver claims, trade negotiations, managing minutes. Then the real season ends and you have months of nothing. BS Hoops gives you the same decisions all year, with something fantasy can never offer: you are the real front office. You control the minutes, the contracts and the cap, and you live with the results across seasons.</p>

<h2>What Fantasy Players Will Recognize</h2>
<h3>Drafting With Imperfect Information</h3>
<p>You already know the feeling of a sleeper hitting or a lottery pick busting. In BS Hoops, prospects show a perceived potential with deliberate noise. You spend scouting points on quick looks, workouts and full evaluations. About 15% of players carry a hidden bust trait and about 15% a boom trait, and only a full evaluation hints at which is which. The Mock Draft tab projects what AI teams will do at every pick.</p>

<h3>Minutes Drive Production</h3>
<p>Fantasy managers obsess over minutes because minutes are stats. In BS Hoops you set them. Starters (two guards, two forwards, a center) play about 32 minutes. The first five players on your bench form the second unit, with the sixth man around 23-24 minutes and slot 5 around 10. Bench slot 6 and below barely play. The <a href="/blog/rotation-bench-order-and-minutes">rotation guide</a> explains the full split.</p>

<h3>Trades Are About Value and Fit</h3>
<p>The AI does not accept trades by mood. Every player and pick has a trade-value number based on rating, age, potential and contract. A cubed rating curve means an 85 is worth more than two 75s, so consolidation trades are hard to win, just like in a dynasty league. Each AI team has a disposition, and Win Now teams pay more for veterans while rebuilders discount players 31 and older.</p>

<h3>Dynasty Thinking</h3>
<p>If you play dynasty or keeper formats, you will feel at home. Players gain about 3.5 OVR a year at 21 and under, plateau from 26 to 28, and decline faster after 31. Trade value peaks at 22-23. The <a href="/blog/rebuild-or-contend-timeline">rebuild-or-contend framework</a> is basically a dynasty strategy guide.</p>

<h2>What Is New Compared to Fantasy</h2>
<ul>
  <li><strong>The salary cap.</strong> A $165.0M cap, a ~$200.5M tax line and two aprons. Over the cap, you sign players with exceptions. Hold Bird rights to keep your own stars.</li>
  <li><strong>Free agency as an auction.</strong> Bid against AI teams during a 30-day window. Asking prices fall to 50% of market value by the end, so the late days hide bargains.</li>
  <li><strong>Game plans.</strong> Set pace, offensive focus, shot risk, defensive pressure and scheme.</li>
  <li><strong>Watching games.</strong> Every game is simulated possession by possession, and you can watch yours live with a shot chart, win probability and game flow.</li>
  <li><strong>Job security.</strong> Ownership judges you against 41 wins. Fall below 20 approval for two straight seasons (after a three-season grace period) and you are out.</li>
</ul>

<h2>Fantasy vs BS Hoops</h2>
<table>
  <thead>
    <tr>
      <th></th>
      <th>Fantasy basketball</th>
      <th>BS Hoops</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Season</td><td>Tied to the real calendar</td><td>Play anytime, any pace</td></tr>
    <tr><td>Minutes</td><td>Out of your control</td><td>You set the rotation</td></tr>
    <tr><td>Contracts</td><td>Rare (salary-cap leagues only)</td><td>Every player, with real cap rules</td></tr>
    <tr><td>Draft</td><td>Real prospects, public rankings</td><td>Scouting with hidden traits</td></tr>
    <tr><td>Time horizon</td><td>One season (or dynasty)</td><td>As many seasons as you want</td></tr>
  </tbody>
</table>

<h2>Start With Real Players</h2>
<p>Want familiar names? Import the current 2026-27 rosters, contracts and future pick trades from <a href="/rosters">Rosters</a>, or browse each team's payroll, age profile and depth chart on the <a href="/rosters/2026">2026 rosters</a> pages before you pick. BS Hoops is a parody and simulation and is not affiliated with the NBA.</p>

<h2>Frequently Asked Questions</h2>
<h3>Is BS Hoops a fantasy basketball game?</h3>
<p>No. It is a basketball GM simulation. Instead of scoring points from real box scores, you run a simulated franchise and its games are simulated possession by possession.</p>

<h3>Is it free?</h3>
<p>Yes. The full season, draft, free agency, trades, stats and history are free with banner ads. Premium is optional.</p>

<h3>How long does a season take?</h3>
<p>As long as you want. Sim a week at a time or blow through to the playoffs. An 82-game season with playoffs and an offseason can be done in a single sitting.</p>

<h3>Do you have a football version for fantasy football players?</h3>
<p>Yes. <a href="https://bs-football.com">BS Football</a> is made by the same team, and one Premium subscription covers both games.</p>

<p><strong><a href="/">Start Your Franchise — Free</a></strong></p>
`,
  },

  // ─── Page 8: glossary/nba-salary-cap-aprons ───────────────────────────
  {
    section: 'glossary',
    slug: 'nba-salary-cap-aprons',
    title: 'NBA Salary Cap Aprons Explained (First Apron, Second Apron, Tax, MLE, Bird Rights)',
    seoTitle: 'NBA Salary Cap Aprons Explained — First & Second Apron, Tax, MLE, Bird Rights',
    metaDescription:
      'What the NBA first and second aprons, luxury tax, Mid-Level Exception and Bird rights are, and how BS Hoops models each one with exact 2026-27 numbers.',
    keywords: [
      'nba salary cap aprons explained',
      'first apron second apron',
      'mid-level exception explained',
      'bird rights explained',
      'nba luxury tax explained',
    ],
    schema: 'FAQ',
    internalLinks: [
      { label: 'Salary Cap, Tax & Aprons Guide', href: '/blog/salary-cap-aprons-and-exceptions' },
      { label: 'Rebuild or Contend?', href: '/blog/rebuild-or-contend-timeline' },
      { label: 'What Is a Basketball GM Simulator?', href: '/glossary/basketball-gm-simulator' },
      { label: 'BS Hoops vs Basketball GM', href: '/vs/basketball-gm' },
    ],
    content: `
<h2>The Short Version</h2>
<p>The NBA uses a <strong>soft cap</strong>. Teams can go over the salary cap, and most good ones do. What changes as payroll rises is which team-building tools are still available. The luxury tax adds a bill. The <strong>first apron</strong> and <strong>second apron</strong> are higher payroll lines that take tools away, such as the full Mid-Level Exception and flexible trade salary matching. Bird rights are the main way a team can stay over the cap and still keep its own stars.</p>
<p>BS Hoops models this whole ladder. Every number below is what the game uses for the 2026-27 season.</p>

<h2>The Ladder in BS Hoops (2026-27)</h2>
<table>
  <thead>
    <tr><th>Line</th><th>Amount</th><th>What changes above it</th></tr>
  </thead>
  <tbody>
    <tr><td>Salary cap</td><td>$165.0M</td><td>No cap-room signings; you need an exception.</td></tr>
    <tr><td>Luxury tax</td><td>~$200.5M (cap × 1.215)</td><td>Tax bill; the Mid-Level shrinks to the ~$6.1M Taxpayer MLE.</td></tr>
    <tr><td>First apron</td><td>~$209.1M (cap × 1.267)</td><td>No Bi-Annual; trade matching drops to 110% + $250K.</td></tr>
    <tr><td>Second apron</td><td>~$221.8M (cap × 1.344)</td><td>No Mid-Level at all; trades must match one-for-one.</td></tr>
  </tbody>
</table>
<p>Every line scales with the cap, which grows about 7% a year (to roughly $176.6M in 2027-28). A payroll that is a first-apron problem today can be merely a tax problem next season.</p>

<h2>Salary Cap</h2>
<p>Below the cap, the difference between payroll and the cap is <strong>cap room</strong>, and a team can sign any free agent whose first-year salary fits. After using its room, a team still gets the <strong>Room Exception</strong>, about 5.33% of the cap (roughly $8.8M), for one more signing.</p>

<h2>Luxury Tax</h2>
<p>The tax is charged on payroll above the tax line, and it is incremental. In BS Hoops you pay $1.50 per dollar on the first $5M over, $1.75 on the next $5M, $2.50 on the next, $3.25 on the next, and $3.75 per dollar beyond $20M over. Being $4M over costs $6M; being $25M over costs about $63.8M.</p>

<h2>First Apron</h2>
<p>The first apron is where teams start losing flexibility. Above it in BS Hoops, the Bi-Annual Exception is unavailable and trade salary matching tightens from the tiered rule (up to 200% + $250K, outgoing + $7.5M, or 125% + $250K depending on size) to 110% + $250K. Using the Non-Tax Mid-Level or the Bi-Annual <strong>hard-caps</strong> a team at the first apron for the rest of the season.</p>

<h2>Second Apron</h2>
<p>The second apron is the strictest line. Above it, a team cannot use any Mid-Level Exception and must match salaries one-for-one in trades. It cannot take back a dollar more than it sends. In the BS Hoops real-roster league, several contenders start above it, which is why they struggle to add at the deadline.</p>

<h2>Mid-Level Exception (MLE)</h2>
<p>The MLE lets an over-the-cap team sign a free agent without cap room. BS Hoops has two versions:</p>
<ul>
  <li><strong>Non-Tax MLE</strong> (~9.4% of cap, about $15.5M): over the cap but under the tax line. Using it hard-caps you at the first apron.</li>
  <li><strong>Taxpayer MLE</strong> (~3.68% of cap, about $6.1M): between the tax line and the second apron. It does not hard-cap.</li>
</ul>
<p>The <strong>Bi-Annual Exception</strong> (~3.32% of cap, about $5.5M) is available only below the first apron. Veteran minimums are always available and never use up an exception. The game picks the cheapest channel that covers a salary, so a minimum deal never burns your MLE.</p>

<h2>Bird Rights</h2>
<p>Bird rights let a team re-sign its own free agents over the cap. In BS Hoops, <strong>full Bird rights</strong> allow a re-signing for any amount up to the player's max, for up to five years with raises of up to 8% a season. <strong>Early Bird</strong> caps the starting salary at 175% of the previous salary or 10% of the cap, whichever is higher. Players also give a small loyalty discount, about four percentage points of market value, to the team holding their Bird rights. Over the cap, the best you can offer someone else's free agent is usually a Mid-Level, so re-signing is almost always cheaper than replacing.</p>

<h2>Max Contracts</h2>
<p>Max first-year salary depends on years of service: 25% of the cap for 0-6 years ($41.25M), 30% for 7-9 years ($49.5M) and 35% for 10+ years ($57.75M).</p>

<h2>Dead Money and the Stretch</h2>
<p>Waived players' guaranteed money stays on the books and counts against the cap, tax and aprons. The stretch option spreads it over twice the remaining years plus one, so a $20M expiring deal becomes about $6.7M a year for three seasons, a way to duck under an apron now at the cost of later flexibility.</p>

<h2>Frequently Asked Questions</h2>
<h3>What is the difference between the first and second apron?</h3>
<p>Both are payroll lines above the tax. Above the first apron you lose the Bi-Annual and trade matching tightens to 110% + $250K. Above the second apron you also lose every Mid-Level and must match salaries one-for-one.</p>

<h3>Does using the Mid-Level hard-cap a team?</h3>
<p>The Non-Tax MLE does. In BS Hoops it hard-caps you at the first apron for the rest of the season. The Taxpayer MLE does not.</p>

<h3>Do AI teams follow the same rules?</h3>
<p>Yes. AI front offices in BS Hoops are bound by exactly the same cap, apron and exception rules as you.</p>

<h3>Where can I learn cap strategy?</h3>
<p>Read the <a href="/blog/salary-cap-aprons-and-exceptions">salary cap, tax and aprons guide</a>, then <a href="/">start a league</a> and try it yourself.</p>

<p><strong><a href="/">Run a Front Office in BS Hoops — Free</a></strong></p>
`,
  },

  // ─── Page 9: glossary/basketball-gm-simulator ─────────────────────────
  {
    section: 'glossary',
    slug: 'basketball-gm-simulator',
    title: 'What Is a Basketball GM Simulator?',
    seoTitle: 'What Is a Basketball GM Simulator? — How Basketball Management Games Work',
    metaDescription:
      'A basketball GM simulator puts you in charge of a franchise: draft, trades, free agency, salary cap and rotation, while the games are simulated. Here is how they work and where to play free.',
    keywords: [
      'basketball gm simulator',
      'what is a basketball gm game',
      'basketball management simulator',
      'basketball franchise simulator',
    ],
    schema: 'Article',
    internalLinks: [
      { label: 'Best Basketball GM Games', href: '/best/basketball-gm-games' },
      { label: 'NBA Salary Cap Aprons Explained', href: '/glossary/nba-salary-cap-aprons' },
      { label: 'Beginner’s Guide to Your First Season', href: '/blog/first-season-beginners-guide' },
      { label: 'Free Basketball Games Online', href: '/best/free-basketball-games-online' },
    ],
    content: `
<h2>Definition</h2>
<p>A <strong>basketball GM simulator</strong> is a sports management game where you play as a team's general manager rather than as the players. You make front-office decisions (drafting, trading, signing free agents, managing the salary cap and setting the rotation) while a simulation engine plays out the games. The fun comes from building a roster, watching how it performs, and adjusting over many seasons.</p>

<h2>How a Basketball GM Sim Works</h2>
<p>Most basketball GM simulators share the same core loop:</p>
<ol>
  <li><strong>Pick a franchise.</strong> Choose a team in a fictional or real-roster league.</li>
  <li><strong>Set the rotation.</strong> Decide who starts and who comes off the bench.</li>
  <li><strong>Simulate games.</strong> The engine plays games using player ratings and your settings.</li>
  <li><strong>Make moves.</strong> Trade, sign and release players during the season.</li>
  <li><strong>Run the offseason.</strong> Players age, the draft happens, contracts expire and free agency opens.</li>
  <li><strong>Repeat.</strong> Build a dynasty, or tear it down and start again.</li>
</ol>

<h2>The Main Systems</h2>
<h3>Player Ratings</h3>
<p>Each player has ratings for skills like shooting, finishing, passing, defense and athleticism, rolled into an overall rating (OVR) and a potential rating (POT). Ratings change over time, usually rising for young players and falling for veterans.</p>

<h3>The Simulation Engine</h3>
<p>Engines range from quick statistical models to possession-by-possession simulation. BS Hoops simulates every possession, and the Game Plan (pace, offensive focus, shot risk, defensive pressure, scheme) changes the math on every trip down the floor.</p>

<h3>The Salary Cap</h3>
<p>Realistic sims model a cap that limits spending. BS Hoops uses an NBA-style soft cap with a luxury tax and two aprons, plus Mid-Level, Bi-Annual and Room exceptions and Bird rights. See the <a href="/glossary/nba-salary-cap-aprons">aprons explainer</a>.</p>

<h3>Draft and Scouting</h3>
<p>Drafting young players is the cheapest way to build long-term value. Good sims add uncertainty so you can miss on picks. BS Hoops uses a 14-team lottery, tiered scouting, and hidden boom/normal/bust development traits.</p>

<h3>Trades and Free Agency</h3>
<p>AI teams evaluate trades and compete for free agents. The best sims give AI front offices a consistent value model and the same rules you follow.</p>

<h2>Types of Basketball GM Games</h2>
<table>
  <thead>
    <tr><th>Type</th><th>Examples</th><th>What it is like</th></tr>
  </thead>
  <tbody>
    <tr><td>Browser GM sims</td><td>BS Hoops, Basketball GM</td><td>Free, no download, fast seasons</td></tr>
    <tr><td>Console franchise modes</td><td>NBA 2K MyLeague / MyGM</td><td>Paid, 3D gameplay plus management</td></tr>
    <tr><td>Desktop text sims</td><td>Draft Day Sports: Pro Basketball</td><td>Paid, classic and data-heavy</td></tr>
    <tr><td>Hybrid arcade + franchise</td><td>Hoop Land</td><td>Playable 2D games with a franchise mode</td></tr>
  </tbody>
</table>
<p>For a ranked look at each, see the <a href="/best/basketball-gm-games">best basketball GM games</a>.</p>

<h2>How BS Hoops Approaches It</h2>
<p>BS Hoops is a free basketball GM simulator that runs in your browser. Pick one of 30 franchises and:</p>
<ul>
  <li><strong>Draft</strong>: scout prospects, ride the lottery and trade picks on draft night.</li>
  <li><strong>Trade</strong>: build deals with salary matching, pick protections and a trade finder.</li>
  <li><strong>Sign free agents</strong>: bid against AI teams using Bird rights and cap exceptions.</li>
  <li><strong>Coach the rotation</strong>: set starters and bench order, and watch minutes follow.</li>
  <li><strong>Watch games live</strong>: a shot chart, win probability and game flow for your games.</li>
  <li><strong>Build a legacy</strong>: awards, playoff runs, franchise history and owner approval.</li>
</ul>
<p>A season runs 82 games over 170 days with a trade deadline on day 115, a play-in for seeds 7-10, and an offseason of draft, re-signings and a 30-day free-agency window. You can start a generated league or import the current 2026-27 rosters from <a href="/rosters">Rosters</a>. No download and no account required.</p>

<h2>Why People Love GM Sims</h2>
<ul>
  <li><strong>Strategy over reflexes.</strong> Success comes from decisions, not button timing.</li>
  <li><strong>Long-term stories.</strong> Draft a teenager and watch him become an MVP, or regret a trade for a decade.</li>
  <li><strong>Play at your pace.</strong> Pause anytime; ten minutes is a real session.</li>
  <li><strong>Endless replay value.</strong> Every league diverges after a single season.</li>
</ul>

<h2>Common GM Sim Terms</h2>
<ul>
  <li><strong>OVR / POT:</strong> a player's current overall rating and his projected ceiling.</li>
  <li><strong>Soft cap:</strong> a cap teams can exceed using exceptions and Bird rights.</li>
  <li><strong>Apron:</strong> a payroll line above the tax where team-building tools are removed.</li>
  <li><strong>Pick protection:</strong> a condition that lets the original team keep a traded pick if it lands high.</li>
  <li><strong>Play-in:</strong> the mini-tournament for seeds 7-10 that decides the last playoff spots.</li>
  <li><strong>Rotation:</strong> the starters and the bench players who actually get minutes.</li>
</ul>

<p>Same idea, different sport: <a href="https://bs-football.com">BS Football</a> is a free football GM simulator from the same team.</p>

<p><strong><a href="/">Try BS Hoops — A Free Basketball GM Simulator</a></strong></p>
`,
  },
];

export function getPageBySlug(section: string, slug: string): SEOPage | undefined {
  return seoPages.find(p => p.section === section && p.slug === slug);
}

export function getPagesBySection(section: string): SEOPage[] {
  return seoPages.filter(p => p.section === section);
}
