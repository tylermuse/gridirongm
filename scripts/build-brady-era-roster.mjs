/**
 * Generates a "Tom Brady Era — 2007 Season" FBGM-format roster file by
 * transforming the existing 2026 PreDraft roster.
 *
 * v1 (CSV-driven): pulls real 2007 player names + birth dates + colleges +
 * draft years from nflverse-rosters (committed at scripts/data/nflverse_roster_2007.csv)
 * and stamps them onto the 2026 file's team-roster slots. The 2026 ratings
 * stay (so OVRs are a rough fit, not historically tuned), but every active
 * NFL player on every roster gets their real 2007 identity.
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
const CSV = path.join('scripts', 'data', 'nflverse_roster_2007.csv');

const SOURCE_SEASON = 2026;
const TARGET_SEASON = 2007;
const YEAR_SHIFT = TARGET_SEASON - SOURCE_SEASON; // -19

// 2007 NFL salary cap was $109M; 2026 file uses $353.85M.
// Scale all contract dollars + cap-related fields so the economy feels
// era-appropriate instead of 2026-inflated 2007.
const CAP_2007 = 109000;       // $109M in $K units
const CAP_2026 = 353850;       // $353.85M in $K units
const CAP_SCALE = CAP_2007 / CAP_2026; // ≈ 0.308
const ERA_MIN_CONTRACT = 285;  // 2007 rookie minimum salary in $K
const ERA_MAX_CONTRACT = 18000; // rough 2007 top-of-market individual deal

// nflverse uses different team codes than the FBGM file for a few teams.
// Map nflverse 2007-era codes to the FBGM 2026 abbrevs we need to match
// against the source roster file.
const TEAM_CODE_TO_FBGM_ABBREV = {
  ARZ: 'ARI',  ATL: 'ATL',  BLT: 'BAL',  BUF: 'BUF',
  CAR: 'CAR',  CHI: 'CHI',  CIN: 'CIN',  CLV: 'CLE',
  DAL: 'DAL',  DEN: 'DEN',  DET: 'DET',  GB:  'GB',
  HST: 'HOU',  IND: 'IND',  JAX: 'JAX',  KC:  'KC',
  MIA: 'MIA',  MIN: 'MIN',  NE:  'NE',   NO:  'NO',
  NYG: 'NYG',  NYJ: 'NYJ',  OAK: 'LV',   PHI: 'PHI',
  PIT: 'PIT',  SD:  'LAC',  SEA: 'SEA',  SF:  'SF',
  SL:  'LAR',  TB:  'TB',   TEN: 'TEN',  WAS: 'WSH',
};

/** Map an FBGM-format position (DT/DE/T/G/etc.) to one of our coarse
 *  position buckets used by mapPosition() in src/lib/data/leagueImport.ts.
 *  Same bucketing rules apply to the nflverse CSV positions, so we use this
 *  for both sides of the matching. */
function bucketPosition(rawPos) {
  const p = (rawPos || '').toUpperCase();
  if (p === 'QB') return 'QB';
  if (['RB', 'HB', 'FB'].includes(p)) return 'RB';
  if (['WR', 'KR', 'PR'].includes(p)) return 'WR';
  if (p === 'TE') return 'TE';
  if (['OL', 'C', 'G', 'T', 'OT', 'OG'].includes(p)) return 'OL';
  if (['DL', 'DE', 'DT', 'NT'].includes(p)) return 'DL';
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(p)) return 'LB';
  if (p === 'CB' || p === 'DB') return 'CB';
  if (['S', 'FS', 'SS'].includes(p)) return 'S';
  if (p === 'K') return 'K';
  if (p === 'P') return 'P';
  if (p === 'LS') return 'OL'; // long snapper — bucket as OL roster filler
  return null;
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

/** Lightweight CSV parser that handles quoted fields with commas. nflverse
 *  uses standard quoting. */
function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line) continue;
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { fields.push(cur); cur = ''; }
        else { cur += ch; }
      }
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

console.log(`Reading ${SRC}...`);
const start = Date.now();
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log(`Loaded in ${Date.now() - start}ms. ${data.players.length} players, ${data.teams.length} teams.`);

console.log(`Reading ${CSV}...`);
const csvText = fs.readFileSync(CSV, 'utf8');
const csvRows = parseCsv(csvText);
const csvHeader = csvRows[0];
const colIdx = Object.fromEntries(csvHeader.map((name, i) => [name, i]));
console.log(`  CSV columns: ${csvHeader.length}, rows: ${csvRows.length - 1}`);

// Filter the CSV to active+reserve+developmental roster spots; drop CUTs.
// Group by FBGM_ABBREV → bucketed position → array of CSV records.
const csvByTeamPos = new Map(); // 'NE' → 'QB' → [csvRow, csvRow, ...]
let csvUsableRows = 0;
for (let r = 1; r < csvRows.length; r++) {
  const row = csvRows[r];
  if (row.length < csvHeader.length - 1) continue;
  const status = row[colIdx.status];
  if (!['ACT', 'RES', 'DEV'].includes(status)) continue;
  const csvTeam = row[colIdx.team];
  const fbgmAbbrev = TEAM_CODE_TO_FBGM_ABBREV[csvTeam];
  if (!fbgmAbbrev) continue;
  const bucket = bucketPosition(row[colIdx.position]);
  if (!bucket) continue;
  if (!csvByTeamPos.has(fbgmAbbrev)) csvByTeamPos.set(fbgmAbbrev, new Map());
  const teamMap = csvByTeamPos.get(fbgmAbbrev);
  if (!teamMap.has(bucket)) teamMap.set(bucket, []);
  teamMap.get(bucket).push(row);
  csvUsableRows++;
}
console.log(`  CSV usable rows after status/team/pos filter: ${csvUsableRows}`);

// --- 1. gameAttributes: shift seasons + scale cap fields. -------------------
const ga = data.gameAttributes ?? {};
ga.season = TARGET_SEASON;
ga.startingSeason = TARGET_SEASON;
ga.salaryCap = CAP_2007;
ga.minContract = ERA_MIN_CONTRACT;
ga.maxContract = ERA_MAX_CONTRACT;
ga.minPayroll = Math.round(0.7 * CAP_2007);
delete ga.userTid;
delete ga.userTids;
data.gameAttributes = ga;
data.meta = { name: 'NFL Roster — Tom Brady Era 2007 (v1, nflverse-driven)' };

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

// --- 3a. Per-player: shift years, scale contracts, clear history fields. ---
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
  player.awards = [];
  player.injuries = [];
  player.transactions = [];
  player.stats = [];
  player.salaries = [];
  player.statsTids = player.tid >= 0 ? [player.tid] : [];
  if (typeof player.retiredYear === 'number') {
    player.retiredYear = shiftYear(player.retiredYear);
  }
  // 2026 ESPN headshot URLs reference 2026-era ESPN player IDs that won't
  // resolve to a sensible 2007-era headshot. Clear all so portraits fall
  // back to the engine's autogen path on import.
  if (player.imgURL) {
    player.imgURL = '';
  }
  if (Array.isArray(player.ratings)) {
    for (const r of player.ratings) {
      if (typeof r.season === 'number') {
        r.season = shiftYear(r.season);
      }
    }
  }
}

// --- 3b. CSV-driven name/college/born/draft overlay. -----------------------
// For each team, group its 2026 roster by bucketed position, sort by latest
// OVR descending, and pair each slot with a 2007 nflverse CSV row. Top-OVR
// 2026 player gets first CSV row at that position, and so on. Players that
// don't get a CSV match (team has more roster slots than the CSV provides
// for that position bucket) fall through to the random-name pool below.
const teamByAbbrev = new Map(data.teams.map((t) => [t.abbrev, t]));
const playersByTid = new Map();
for (const p of data.players) {
  if (p.tid >= 0) {
    if (!playersByTid.has(p.tid)) playersByTid.set(p.tid, []);
    playersByTid.get(p.tid).push(p);
  }
}

const overlaidPids = new Set();
let overlaidCount = 0;
const overlayLog = [];

for (const [teamAbbrev, team] of teamByAbbrev) {
  const csvTeamMap = csvByTeamPos.get(teamAbbrev);
  if (!csvTeamMap) continue;
  const roster = playersByTid.get(team.tid) ?? [];

  // Group 2026 roster by bucketed position.
  const fbgmByPos = new Map();
  for (const p of roster) {
    const r = latestRating(p);
    if (!r) continue;
    const bucket = bucketPosition(r.pos);
    if (!bucket) continue;
    if (!fbgmByPos.has(bucket)) fbgmByPos.set(bucket, []);
    fbgmByPos.get(bucket).push({ p, r });
  }

  for (const [bucket, fbgmList] of fbgmByPos) {
    const csvList = csvTeamMap.get(bucket);
    if (!csvList || csvList.length === 0) continue;
    // Sort 2026 by OVR desc; CSV stays in file order (roughly depth-aligned).
    fbgmList.sort((a, b) => (b.r.ovr ?? 0) - (a.r.ovr ?? 0));
    const pairs = Math.min(fbgmList.length, csvList.length);
    for (let i = 0; i < pairs; i++) {
      const target = fbgmList[i].p;
      const csv = csvList[i];
      const wasName = `${target.firstName} ${target.lastName}`;
      target.firstName = csv[colIdx.first_name] || target.firstName;
      target.lastName = csv[colIdx.last_name] || target.lastName;
      const college = csv[colIdx.college];
      if (college && college.trim() !== '') target.college = college;
      const birthDate = csv[colIdx.birth_date];
      if (birthDate && /^\d{4}-/.test(birthDate)) {
        const birthYear = parseInt(birthDate.slice(0, 4), 10);
        if (Number.isFinite(birthYear)) {
          target.born = { ...(target.born ?? {}), year: birthYear };
        }
      }
      const entryYear = parseInt(csv[colIdx.entry_year], 10);
      if (Number.isFinite(entryYear) && target.draft) {
        target.draft.year = entryYear;
      }
      const draftNumber = parseInt(csv[colIdx.draft_number], 10);
      if (Number.isFinite(draftNumber) && target.draft) {
        target.draft.pick = draftNumber;
      }
      // 2026 ESPN URLs already cleared above; nflverse has 2007-NFL.com
      // headshot URLs — but those are 2007-vintage and may not resolve.
      // Leave imgURL empty for portrait autogen.
      overlaidPids.add(target.pid);
      overlaidCount++;
      if (overlayLog.length < 30) {
        overlayLog.push(`  ${teamAbbrev} ${bucket}: ${target.firstName} ${target.lastName} (was ${wasName})`);
      }
    }
  }
}
console.log(`Overlaid ${overlaidCount} players from nflverse CSV.`);
console.log('Sample overlays:');
overlayLog.forEach((line) => console.log(line));

// --- 3c. Fallback: randomize firstName / lastName / college on every active
//         or FA player NOT overlaid by the CSV. This catches the long tail
//         where the 2026 file has more roster slots at a given position than
//         the 2007 nflverse CSV provides for that team (rare but happens).
const FILLER_FIRST_NAMES = [
  'Mike', 'Joe', 'Jim', 'John', 'Bill', 'Bob', 'Tim', 'Tom', 'Steve', 'Mark',
  'Brian', 'Kevin', 'Chris', 'Jason', 'Greg', 'Andre', 'Marcus', 'Anthony',
  'Eric', 'Jeff', 'Kenny', 'Tony', 'Sean', 'Pat', 'Ryan', 'Matt', 'Kyle',
  'Dan', 'Rob', 'Rich', 'Ray', 'Carl', 'Wayne', 'Curtis',
];
const FILLER_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller',
  'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Robinson', 'Clark', 'Lewis', 'Walker',
  'Hall', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker',
  'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Roberts', 'Carter',
  'Phillips', 'Evans', 'Turner', 'Parker', 'Edwards', 'Stewart', 'Morris',
  'Murphy', 'Cook', 'Rogers', 'Morgan', 'Peterson', 'Cooper', 'Reed',
];
const FILLER_COLLEGES = [
  'USC', 'Oklahoma', 'Alabama', 'Texas', 'Florida', 'Michigan', 'Ohio State',
  'LSU', 'Penn State', 'Notre Dame', 'Miami', 'Florida State', 'Tennessee',
  'Auburn', 'Georgia', 'Pittsburgh', 'Iowa', 'Wisconsin', 'NC State',
  'North Carolina', 'Clemson', 'Stanford', 'California', 'UCLA', 'Oregon',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

let fallbackCount = 0;
for (const player of data.players) {
  if (player.tid < -1) continue; // skip retired (-2) and prospects (-3)
  if (overlaidPids.has(player.pid)) continue;
  player.firstName = pick(FILLER_FIRST_NAMES);
  player.lastName = pick(FILLER_LAST_NAMES);
  player.college = pick(FILLER_COLLEGES);
  fallbackCount++;
}
console.log(`Randomized ${fallbackCount} unmatched names from filler pool.`);

// --- 4. Per-team: clear depth chart + scale ticket prices to era. ---------
for (const team of data.teams) {
  team.depth = undefined;
  if (team.budget) {
    if (typeof team.budget.ticketPrice === 'number') {
      team.budget.ticketPrice = Math.round(team.budget.ticketPrice * CAP_SCALE * 100) / 100;
    }
  }
}

// --- 5. Draft picks: shift season + drop pre-2007 picks. ------------------
if (Array.isArray(data.draftPicks)) {
  for (const dp of data.draftPicks) {
    if (typeof dp.season === 'number') {
      dp.season = shiftYear(dp.season);
    }
  }
  data.draftPicks = data.draftPicks.filter((dp) => (dp.season ?? 0) >= TARGET_SEASON);
}

// --- 6. Write output. -----------------------------------------------------
console.log(`Writing ${OUT}...`);
const outStart = Date.now();
fs.writeFileSync(OUT, JSON.stringify(data));
const outStat = fs.statSync(OUT);
console.log(`Wrote ${(outStat.size / (1024 * 1024)).toFixed(1)} MB in ${Date.now() - outStart}ms.`);

console.log('\n--- Sanity checks ---');
console.log('  season:', data.gameAttributes.season);
console.log('  startingSeason:', data.gameAttributes.startingSeason);
console.log('  salaryCap:', data.gameAttributes.salaryCap);
console.log('  team count:', data.teams.length);
console.log('  player count:', data.players.length);
console.log('  active-roster player count:', data.players.filter((p) => p.tid >= 0).length);

const NE_TID = data.teams.find((t) => t.abbrev === 'NE').tid;
const IND_TID = data.teams.find((t) => t.abbrev === 'IND').tid;
const SD_TID = data.teams.find((t) => t.abbrev === 'LAC').tid;
const sampleNE = data.players.find(
  (p) => p.firstName === 'Tom' && p.lastName === 'Brady' && p.tid === NE_TID,
);
if (sampleNE) {
  console.log('  Tom Brady on NE: born', sampleNE.born?.year, '(age', TARGET_SEASON - sampleNE.born.year, ')');
} else {
  console.log('  [WARN] Tom Brady not on NE — overlay may have skipped him');
}
const sampleIND = data.players.find(
  (p) => p.firstName === 'Peyton' && p.lastName === 'Manning' && p.tid === IND_TID,
);
if (sampleIND) {
  console.log('  Peyton Manning on IND: born', sampleIND.born?.year);
}
const sampleSD = data.players.find(
  (p) => p.firstName === 'LaDainian' && p.lastName === 'Tomlinson' && p.tid === SD_TID,
);
if (sampleSD) {
  console.log('  LaDainian Tomlinson on LAC: born', sampleSD.born?.year);
}
