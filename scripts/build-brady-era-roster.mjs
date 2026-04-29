/**
 * Generates a "Tom Brady Era — 2007 Season" FBGM-format roster file by
 * transforming the existing 2026 PreDraft roster. v0 scope: shift seasons,
 * scale contracts to era-appropriate dollars, clear baked-in league history,
 * substitute ~60 iconic 2007 players onto their real-life teams.
 *
 * Run from repo root:
 *   node scripts/build-brady-era-roster.mjs
 *
 * Outputs: public/rosters/FBGM_NFL_Roster_BradyEra_2007.json
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join('public', 'rosters', 'FBGM_NFL_Roster_2026_PreDraft.json');
const OUT = path.join('public', 'rosters', 'FBGM_NFL_Roster_BradyEra_2007.json');

const SOURCE_SEASON = 2026;
const TARGET_SEASON = 2007;
const YEAR_SHIFT = TARGET_SEASON - SOURCE_SEASON; // -19

// 2007 NFL salary cap was $109M; 2026 file uses $353.85M.
// Scale all contract dollars + cap-related fields by this ratio so the
// economy feels era-appropriate instead of 2026-inflated 2007.
const CAP_2007 = 109000;       // $109M in $K units
const CAP_2026 = 353850;       // $353.85M in $K units
const CAP_SCALE = CAP_2007 / CAP_2026; // ≈ 0.308
const ERA_MIN_CONTRACT = 285;  // 2007 rookie minimum salary in $K
const ERA_MAX_CONTRACT = 18000; // rough 2007 top-of-market individual deal

/**
 * Iconic 2007 NFL player substitutions. For each team, picks the highest-OVR
 * roster player at the matching position and overwrites their identity. The
 * rest of the roster keeps its 2026-base names — that's the v0 trade-off.
 *
 * Uses FBGM-file abbrevs (NYJ, WSH, LAC, LAR, LV) which match real-NFL
 * abbrevs in the source file.
 */
const SUBS = {
  NE:  [
    { pos: 'QB', name: 'Tom Brady', college: 'Michigan', age: 30 },
    { pos: 'WR', name: 'Randy Moss', college: 'Marshall', age: 30 },
    { pos: 'WR', name: 'Wes Welker', college: 'Texas Tech', age: 26 },
    { pos: 'CB', name: 'Asante Samuel', college: 'Central Florida', age: 26 },
  ],
  IND: [
    { pos: 'QB', name: 'Peyton Manning', college: 'Tennessee', age: 31 },
    { pos: 'WR', name: 'Reggie Wayne', college: 'Miami', age: 29 },
    { pos: 'WR', name: 'Marvin Harrison', college: 'Syracuse', age: 35 },
    { pos: 'DL', name: 'Dwight Freeney', college: 'Syracuse', age: 27 },
  ],
  NYG: [
    { pos: 'QB', name: 'Eli Manning', college: 'Mississippi', age: 26 },
    { pos: 'DL', name: 'Michael Strahan', college: 'Texas Southern', age: 36 },
    { pos: 'WR', name: 'Plaxico Burress', college: 'Michigan State', age: 30 },
  ],
  DAL: [
    { pos: 'QB', name: 'Tony Romo', college: 'Eastern Illinois', age: 27 },
    { pos: 'WR', name: 'Terrell Owens', college: 'Tennessee-Chattanooga', age: 34 },
    { pos: 'TE', name: 'Jason Witten', college: 'Tennessee', age: 25 },
    { pos: 'LB', name: 'DeMarcus Ware', college: 'Troy', age: 25 },
  ],
  GB:  [
    { pos: 'QB', name: 'Brett Favre', college: 'Southern Mississippi', age: 38 },
    { pos: 'WR', name: 'Donald Driver', college: 'Alcorn State', age: 32 },
  ],
  NO:  [
    { pos: 'QB', name: 'Drew Brees', college: 'Purdue', age: 28 },
    { pos: 'RB', name: 'Reggie Bush', college: 'USC', age: 22 },
  ],
  PIT: [
    { pos: 'QB', name: 'Ben Roethlisberger', college: 'Miami (OH)', age: 25 },
    { pos: 'S',  name: 'Troy Polamalu', college: 'USC', age: 26 },
    { pos: 'LB', name: 'James Harrison', college: 'Kent State', age: 29 },
  ],
  CIN: [
    { pos: 'QB', name: 'Carson Palmer', college: 'USC', age: 28 },
    { pos: 'WR', name: 'Chad Johnson', college: 'Oregon State', age: 29 },
  ],
  PHI: [
    { pos: 'QB', name: 'Donovan McNabb', college: 'Syracuse', age: 31 },
    { pos: 'RB', name: 'Brian Westbrook', college: 'Villanova', age: 28 },
  ],
  WSH: [
    { pos: 'QB', name: 'Jason Campbell', college: 'Auburn', age: 26 },
    { pos: 'S',  name: 'Sean Taylor', college: 'Miami', age: 24 },
  ],
  CHI: [
    { pos: 'QB', name: 'Rex Grossman', college: 'Florida', age: 27 },
    { pos: 'LB', name: 'Brian Urlacher', college: 'New Mexico', age: 29 },
  ],
  DET: [
    { pos: 'QB', name: 'Jon Kitna', college: 'Central Washington', age: 35 },
    { pos: 'WR', name: 'Roy Williams', college: 'Texas', age: 26 },
  ],
  MIN: [
    { pos: 'RB', name: 'Adrian Peterson', college: 'Oklahoma', age: 22 },
    { pos: 'WR', name: 'Sidney Rice', college: 'South Carolina', age: 21 },
  ],
  BAL: [
    { pos: 'QB', name: 'Steve McNair', college: 'Alcorn State', age: 34 },
    { pos: 'LB', name: 'Ray Lewis', college: 'Miami', age: 32 },
    { pos: 'S',  name: 'Ed Reed', college: 'Miami', age: 29 },
  ],
  CLE: [
    { pos: 'QB', name: 'Derek Anderson', college: 'Oregon State', age: 24 },
    { pos: 'TE', name: 'Kellen Winslow', college: 'Miami', age: 24 },
  ],
  BUF: [
    { pos: 'QB', name: 'Trent Edwards', college: 'Stanford', age: 24 },
    { pos: 'RB', name: 'Marshawn Lynch', college: 'California', age: 21 },
  ],
  MIA: [
    { pos: 'QB', name: 'Cleo Lemon', college: 'Arkansas State', age: 28 },
    { pos: 'LB', name: 'Jason Taylor', college: 'Akron', age: 33 },
  ],
  NYJ: [
    { pos: 'QB', name: 'Chad Pennington', college: 'Marshall', age: 31 },
    { pos: 'CB', name: 'Darrelle Revis', college: 'Pittsburgh', age: 22 },
  ],
  JAX: [
    { pos: 'QB', name: 'David Garrard', college: 'East Carolina', age: 29 },
    { pos: 'RB', name: 'Maurice Jones-Drew', college: 'UCLA', age: 22 },
  ],
  TEN: [
    { pos: 'QB', name: 'Vince Young', college: 'Texas', age: 24 },
    { pos: 'DL', name: 'Albert Haynesworth', college: 'Tennessee', age: 26 },
  ],
  HOU: [
    { pos: 'QB', name: 'Matt Schaub', college: 'Virginia', age: 26 },
    { pos: 'WR', name: 'Andre Johnson', college: 'Miami', age: 26 },
    { pos: 'DL', name: 'Mario Williams', college: 'NC State', age: 22 },
  ],
  DEN: [
    { pos: 'QB', name: 'Jay Cutler', college: 'Vanderbilt', age: 24 },
    { pos: 'CB', name: 'Champ Bailey', college: 'Georgia', age: 29 },
  ],
  KC:  [
    { pos: 'TE', name: 'Tony Gonzalez', college: 'California', age: 31 },
    { pos: 'RB', name: 'Larry Johnson', college: 'Penn State', age: 28 },
    { pos: 'DL', name: 'Jared Allen', college: 'Idaho State', age: 25 },
  ],
  LV:  [
    { pos: 'QB', name: 'JaMarcus Russell', college: 'LSU', age: 22 },
    { pos: 'WR', name: 'Jerry Porter', college: 'West Virginia', age: 29 },
  ],
  LAC: [
    { pos: 'QB', name: 'Philip Rivers', college: 'NC State', age: 26 },
    { pos: 'RB', name: 'LaDainian Tomlinson', college: 'TCU', age: 28 },
    { pos: 'TE', name: 'Antonio Gates', college: 'Kent State', age: 27 },
    { pos: 'LB', name: 'Shawne Merriman', college: 'Maryland', age: 23 },
  ],
  LAR: [
    { pos: 'QB', name: 'Marc Bulger', college: 'West Virginia', age: 30 },
    { pos: 'RB', name: 'Steven Jackson', college: 'Oregon State', age: 24 },
  ],
  ARI: [
    { pos: 'QB', name: 'Kurt Warner', college: 'Northern Iowa', age: 36 },
    { pos: 'WR', name: 'Larry Fitzgerald', college: 'Pittsburgh', age: 24 },
    { pos: 'WR', name: 'Anquan Boldin', college: 'Florida State', age: 27 },
  ],
  SEA: [
    { pos: 'QB', name: 'Matt Hasselbeck', college: 'Boston College', age: 32 },
    { pos: 'RB', name: 'Shaun Alexander', college: 'Alabama', age: 30 },
  ],
  SF:  [
    { pos: 'QB', name: 'Alex Smith', college: 'Utah', age: 23 },
    { pos: 'RB', name: 'Frank Gore', college: 'Miami', age: 24 },
    { pos: 'LB', name: 'Patrick Willis', college: 'Mississippi', age: 22 },
  ],
  TB:  [
    { pos: 'QB', name: 'Jeff Garcia', college: 'San Jose State', age: 37 },
    { pos: 'DL', name: 'Warren Sapp', college: 'Miami', age: 35 },
  ],
  CAR: [
    { pos: 'WR', name: 'Steve Smith', college: 'Utah', age: 28 },
    { pos: 'LB', name: 'Jon Beason', college: 'Miami', age: 23 },
  ],
  ATL: [
    { pos: 'WR', name: 'Roddy White', college: 'UAB', age: 26 },
    { pos: 'TE', name: 'Alge Crumpler', college: 'North Carolina', age: 30 },
  ],
};

/** Mirrors the inverse of leagueImport.ts mapPosition() so we can match
 *  FBGM-format positions (DT/DE/NT/etc.) against our coarse target buckets
 *  (QB/RB/WR/TE/OL/DL/LB/CB/S/K/P). */
function fbgmPosMatches(fbgmPos, target) {
  const p = (fbgmPos || '').toUpperCase();
  switch (target) {
    case 'QB': return p === 'QB';
    case 'RB': return ['RB', 'HB', 'FB'].includes(p);
    case 'WR': return ['WR', 'KR', 'PR'].includes(p);
    case 'TE': return p === 'TE';
    case 'OL': return ['OL', 'C', 'G', 'T', 'OT', 'OG'].includes(p);
    case 'DL': return ['DL', 'DE', 'DT', 'NT'].includes(p);
    case 'LB': return ['LB', 'ILB', 'OLB', 'MLB'].includes(p);
    case 'CB': return p === 'CB';
    case 'S':  return ['S', 'FS', 'SS'].includes(p);
    case 'K':  return p === 'K';
    case 'P':  return p === 'P';
    default:   return false;
  }
}

function latestRating(player) {
  if (!player.ratings || player.ratings.length === 0) return null;
  return player.ratings.reduce((best, current) =>
    (current.season ?? 0) > (best?.season ?? -1) ? current : best,
  null);
}

function scaleContractAmount(amount) {
  if (typeof amount !== 'number') return amount;
  const scaled = Math.round(amount * CAP_SCALE);
  return Math.max(ERA_MIN_CONTRACT, Math.min(ERA_MAX_CONTRACT, scaled));
}

function shiftYear(year) {
  if (typeof year !== 'number') return year;
  return year + YEAR_SHIFT;
}

console.log(`Reading ${SRC}...`);
const start = Date.now();
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log(`Loaded in ${Date.now() - start}ms. ${data.players.length} players, ${data.teams.length} teams.`);

// --- 1. gameAttributes: shift seasons + scale cap fields. -------------------
const ga = data.gameAttributes ?? {};
ga.season = TARGET_SEASON;
ga.startingSeason = TARGET_SEASON;
ga.salaryCap = CAP_2007;
ga.minContract = ERA_MIN_CONTRACT;
ga.maxContract = ERA_MAX_CONTRACT;
ga.minPayroll = Math.round(0.7 * CAP_2007); // ~70% of cap floor
// Reset user team selection so the new-league flow lets the player pick.
delete ga.userTid;
delete ga.userTids;
data.gameAttributes = ga;
data.meta = { name: 'NFL Roster — Tom Brady Era 2007 (v0)' };

// --- 2. Top-level history: clear so the league boots clean in 2007. --------
data.releasedPlayers = [];
data.awards = [];
data.events = [];
data.playerFeats = [];
data.seasonLeaders = [];
data.playoffSeries = [];
data.headToHeads = [];
data.allStars = [];
data.trade = [];

// --- 3a. Per-player: shift years, scale contracts, clear history fields.
//        Run this FIRST so the substitution pass below can stamp era-correct
//        born.year values without being double-shifted.
for (const player of data.players) {
  if (player.born?.year != null) {
    player.born.year = shiftYear(player.born.year);
  }
  if (player.draft?.year != null) {
    player.draft.year = shiftYear(player.draft.year);
  }
  if (player.contract) {
    if (player.contract.exp != null) {
      player.contract.exp = shiftYear(player.contract.exp);
    }
    if (player.contract.amount != null) {
      player.contract.amount = scaleContractAmount(player.contract.amount);
    }
  }
  // Clear history arrays — these reference 2026-era seasons and stat IDs.
  player.awards = [];
  player.injuries = [];
  player.transactions = [];
  player.stats = [];
  player.salaries = [];
  player.statsTids = player.tid >= 0 ? [player.tid] : [];
  // Reset retirement marker on retired players so the league treats them as
  // historical record only (tid stays -2). gamesUntilTradable kept as-is.
  if (typeof player.retiredYear === 'number') {
    player.retiredYear = shiftYear(player.retiredYear);
  }
  // 2026 ESPN headshot URLs reference 2026-era ESPN player IDs that won't
  // resolve to a sensible 2007-era headshot. Clear all so portraits fall
  // back to the engine's autogen path on import.
  if (player.imgURL) {
    player.imgURL = '';
  }
  // Multi-season ratings keep their `season` field; shift those too so
  // age-curve math in convertFbgmLeague picks the right "latest" rating.
  if (Array.isArray(player.ratings)) {
    for (const r of player.ratings) {
      if (typeof r.season === 'number') {
        r.season = shiftYear(r.season);
      }
    }
  }
}

// --- 3b. Iconic-player substitutions. Runs AFTER the global shift so
//         born.year stamps are era-correct (no double-shift).
let substitutionsApplied = 0;
const substitutionsLog = [];

const teamByAbbrev = new Map(data.teams.map((t) => [t.abbrev, t]));
const playersByTid = new Map();
for (const p of data.players) {
  if (p.tid >= 0) {
    if (!playersByTid.has(p.tid)) playersByTid.set(p.tid, []);
    playersByTid.get(p.tid).push(p);
  }
}

for (const [abbrev, subs] of Object.entries(SUBS)) {
  const team = teamByAbbrev.get(abbrev);
  if (!team) {
    console.warn(`  [WARN] team abbrev ${abbrev} not found in source file`);
    continue;
  }
  const roster = playersByTid.get(team.tid) ?? [];
  // Track which pids we've already substituted so the same player isn't
  // overwritten twice (e.g. when two QB subs target the same team).
  const usedPids = new Set();
  for (const sub of subs) {
    const candidates = roster
      .filter((p) => !usedPids.has(p.pid))
      .map((p) => ({ p, r: latestRating(p) }))
      .filter(({ r }) => r && fbgmPosMatches(r.pos, sub.pos))
      .sort((a, b) => (b.r.ovr ?? 0) - (a.r.ovr ?? 0));
    if (candidates.length === 0) {
      console.warn(`  [WARN] no ${sub.pos} found on ${abbrev} for ${sub.name}`);
      continue;
    }
    const target = candidates[0].p;
    const wasName = `${target.firstName} ${target.lastName}`;
    const wasOvr = candidates[0].r.ovr;
    usedPids.add(target.pid);
    const [firstName, ...rest] = sub.name.split(' ');
    target.firstName = firstName;
    target.lastName = rest.join(' ');
    target.college = sub.college;
    target.born = { ...(target.born ?? {}), year: TARGET_SEASON - sub.age };
    // Reset draft.year on substituted players so age math stays coherent —
    // assume they entered the league when typical (age 22). This avoids
    // 80-year-old "rookies" if the original player's draft year shifted way
    // out of band.
    if (target.draft) {
      target.draft.year = TARGET_SEASON - Math.max(0, sub.age - 22);
    }
    // Substituted players' 2026 ESPN URLs are wrong for 2007 namesakes.
    target.imgURL = '';
    substitutionsApplied += 1;
    substitutionsLog.push(`${abbrev} ${sub.pos}: ${sub.name} (replaced ${wasName} OVR ${wasOvr}, tid ${target.tid})`);
  }
}
console.log(`Applied ${substitutionsApplied} iconic-player substitutions.`);

// --- 4. Per-team: clear depth chart references (pids may shuffle on
//        import) + zero out budget snapshot so 2007-era cap math runs fresh.
for (const team of data.teams) {
  team.depth = undefined;
  if (team.budget) {
    // Ticket prices in 2007 were ~$60-$80; scale down from 2026 baseline.
    if (typeof team.budget.ticketPrice === 'number') {
      team.budget.ticketPrice = Math.round(team.budget.ticketPrice * CAP_SCALE * 100) / 100;
    }
  }
}

// --- 5. Draft picks: shift season + clear pick numbers so the engine
//        regenerates them based on prior-season standings. ----------------
if (Array.isArray(data.draftPicks)) {
  for (const dp of data.draftPicks) {
    if (typeof dp.season === 'number') {
      dp.season = shiftYear(dp.season);
    }
  }
  // Drop draft picks for seasons that would now be in the past — the
  // engine doesn't need historical pick records on a clean-start file.
  data.draftPicks = data.draftPicks.filter((dp) => (dp.season ?? 0) >= TARGET_SEASON);
}

// --- 6. Write output. ------------------------------------------------------
console.log(`Writing ${OUT}...`);
const outStart = Date.now();
fs.writeFileSync(OUT, JSON.stringify(data));
const outStat = fs.statSync(OUT);
console.log(`Wrote ${(outStat.size / (1024 * 1024)).toFixed(1)} MB in ${Date.now() - outStart}ms.`);

console.log('\n--- Substitution log ---');
substitutionsLog.forEach((line) => console.log(line));

console.log('\n--- Sanity checks ---');
console.log('  season:', data.gameAttributes.season);
console.log('  startingSeason:', data.gameAttributes.startingSeason);
console.log('  salaryCap:', data.gameAttributes.salaryCap);
console.log('  team count:', data.teams.length);
console.log('  player count:', data.players.length);
console.log('  active-roster player count:', data.players.filter((p) => p.tid >= 0).length);
// Sanity-check the iconic substitutions landed on the right teams.
const NE_TID = data.teams.find((t) => t.abbrev === 'NE').tid;
const IND_TID = data.teams.find((t) => t.abbrev === 'IND').tid;
const SD_TID = data.teams.find((t) => t.abbrev === 'LAC').tid;
const sampleNE = data.players.find(
  (p) => p.firstName === 'Tom' && p.lastName === 'Brady' && p.tid === NE_TID,
);
if (sampleNE) {
  console.log('  Tom Brady on NE: born', sampleNE.born?.year, '(age', TARGET_SEASON - sampleNE.born.year, '),', 'contract', sampleNE.contract?.amount, '$K, OVR', latestRating(sampleNE)?.ovr);
} else {
  console.log('  [WARN] Tom Brady not on NE — substitution may have failed');
}
const sampleIND = data.players.find(
  (p) => p.firstName === 'Peyton' && p.lastName === 'Manning' && p.tid === IND_TID,
);
if (sampleIND) {
  console.log('  Peyton Manning on IND: born', sampleIND.born?.year, '(age', TARGET_SEASON - sampleIND.born.year, '),', 'contract', sampleIND.contract?.amount, '$K, OVR', latestRating(sampleIND)?.ovr);
}
const sampleSD = data.players.find(
  (p) => p.firstName === 'LaDainian' && p.lastName === 'Tomlinson' && p.tid === SD_TID,
);
if (sampleSD) {
  console.log('  LaDainian Tomlinson on LAC: born', sampleSD.born?.year, '(age', TARGET_SEASON - sampleSD.born.year, '),', 'contract', sampleSD.contract?.amount, '$K, OVR', latestRating(sampleSD)?.ovr);
}
