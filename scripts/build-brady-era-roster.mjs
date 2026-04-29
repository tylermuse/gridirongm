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

// nflverse CSV is sorted alphabetically by last name, so backups whose
// last names start with earlier letters (Brad Johnson) end up before
// starters whose last names start later (Tony Romo). Since we pair
// CSV-order against 2026-OVR-descending, the alphabetically-first CSV
// player gets the top-OVR slot — burying real 2007 starters behind their
// alphabetically-luckier backups (Tyler 4/29: "Tony Romo and DeMarcus
// Ware are backups to other players I've never heard of").
//
// Fix: explicitly name the actual 2007 starters at each team-position
// using full_name. Before the OVR-pairing loop, we look up these names
// in the CSV list and promote them to the front in declared order.
// First name in each list gets the highest-OVR slot, second gets the
// second-highest, etc.
//
// Coverage: QB1 for all 32 teams (highest visibility), plus the most
// iconic skill + defender stars per team where the alphabetic accident
// would otherwise bury them.
const STARTER_OVERRIDES = {
  'NE/QB': ['Tom Brady'],
  'NE/WR': ['Randy Moss', 'Wes Welker'],
  'NE/CB': ['Asante Samuel'],
  'NE/S':  ['Rodney Harrison'],
  'NE/LB': ['Tedy Bruschi', 'Mike Vrabel', 'Adalius Thomas', 'Junior Seau'],
  'NE/DL': ['Vince Wilfork', 'Ty Warren', 'Richard Seymour'],

  'IND/QB': ['Peyton Manning'],
  'IND/WR': ['Reggie Wayne', 'Marvin Harrison'],
  'IND/RB': ['Joseph Addai'],
  'IND/TE': ['Dallas Clark'],
  'IND/DL': ['Dwight Freeney', 'Robert Mathis'],
  'IND/S':  ['Bob Sanders'],

  'NYG/QB': ['Eli Manning'],
  'NYG/WR': ['Plaxico Burress', 'Amani Toomer'],
  'NYG/RB': ['Brandon Jacobs'],
  'NYG/TE': ['Jeremy Shockey'],
  'NYG/DL': ['Michael Strahan', 'Justin Tuck', 'Osi Umenyiora'],

  'DAL/QB': ['Tony Romo'],
  'DAL/WR': ['Terrell Owens'],
  'DAL/TE': ['Jason Witten'],
  'DAL/RB': ['Marion Barber', 'Julius Jones'],
  'DAL/LB': ['DeMarcus Ware', 'Bradie James'],
  'DAL/CB': ['Terence Newman'],

  'GB/QB': ['Brett Favre'],
  'GB/WR': ['Donald Driver', 'Greg Jennings'],
  'GB/RB': ['Ryan Grant'],
  'GB/CB': ['Charles Woodson', 'Al Harris'],
  'GB/DL': ['Aaron Kampman'],

  'NO/QB': ['Drew Brees'],
  'NO/RB': ['Reggie Bush', 'Deuce McAllister'],
  'NO/WR': ['Marques Colston'],

  'PIT/QB': ['Ben Roethlisberger'],
  'PIT/RB': ['Willie Parker'],
  'PIT/WR': ['Hines Ward'],
  'PIT/TE': ['Heath Miller'],
  'PIT/S':  ['Troy Polamalu'],
  'PIT/LB': ['James Harrison', 'James Farrior', 'Larry Foote'],
  'PIT/DL': ['Aaron Smith', 'Casey Hampton', 'Brett Keisel'],
  'PIT/CB': ['Ike Taylor'],

  'CIN/QB': ['Carson Palmer'],
  'CIN/WR': ['Chad Johnson', 'T.J. Houshmandzadeh'],
  'CIN/RB': ['Rudi Johnson'],
  'CIN/DL': ['Justin Smith'],

  'PHI/QB': ['Donovan McNabb'],
  'PHI/RB': ['Brian Westbrook'],
  'PHI/S':  ['Brian Dawkins'],
  'PHI/CB': ['Lito Sheppard'],
  'PHI/DL': ['Trent Cole'],

  'WSH/QB': ['Jason Campbell'],
  'WSH/RB': ['Clinton Portis'],
  'WSH/WR': ['Santana Moss'],
  'WSH/TE': ['Chris Cooley'],
  'WSH/S':  ['Sean Taylor', 'LaRon Landry'],
  'WSH/LB': ['London Fletcher'],

  'CHI/QB': ['Rex Grossman'],
  'CHI/RB': ['Cedric Benson'],
  'CHI/LB': ['Brian Urlacher', 'Lance Briggs'],
  'CHI/DL': ['Tommie Harris', 'Adewale Ogunleye'],
  'CHI/CB': ['Charles Tillman'],

  'DET/QB': ['Jon Kitna'],
  'DET/WR': ['Roy Williams', 'Calvin Johnson'],

  'MIN/QB': ['Tarvaris Jackson'],
  'MIN/RB': ['Adrian Peterson', 'Chester Taylor'],
  'MIN/DL': ['Kevin Williams', 'Pat Williams'],
  'MIN/CB': ['Antoine Winfield'],
  'MIN/S':  ['Darren Sharper'],
  'MIN/OL': ['Steve Hutchinson', 'Bryant McKinnie'],

  'BAL/QB': ['Steve McNair'],
  'BAL/RB': ['Willis McGahee'],
  'BAL/WR': ['Derrick Mason'],
  'BAL/TE': ['Todd Heap'],
  'BAL/OL': ['Jonathan Ogden'],
  'BAL/LB': ['Ray Lewis', 'Terrell Suggs', 'Bart Scott'],
  'BAL/DL': ['Haloti Ngata'],
  'BAL/S':  ['Ed Reed'],
  'BAL/CB': ['Chris McAlister'],

  'CLE/QB': ['Derek Anderson'],
  'CLE/RB': ['Jamal Lewis'],
  'CLE/WR': ['Braylon Edwards'],
  'CLE/TE': ['Kellen Winslow'],
  'CLE/OL': ['Joe Thomas', 'Eric Steinbach'],

  'BUF/QB': ['Trent Edwards'],
  'BUF/RB': ['Marshawn Lynch'],
  'BUF/WR': ['Lee Evans'],
  'BUF/OL': ['Jason Peters'],
  'BUF/DL': ['Aaron Schobel'],

  'MIA/QB': ['Cleo Lemon'],
  'MIA/RB': ['Ronnie Brown', 'Ricky Williams'],
  'MIA/LB': ['Jason Taylor', 'Joey Porter'],

  'NYJ/QB': ['Chad Pennington'],
  'NYJ/RB': ['Thomas Jones'],
  'NYJ/WR': ['Laveranues Coles', 'Jerricho Cotchery'],
  'NYJ/OL': ["D'Brickashaw Ferguson", 'Nick Mangold'],
  'NYJ/CB': ['Darrelle Revis'],
  'NYJ/S':  ['Kerry Rhodes'],

  'JAX/QB': ['David Garrard'],
  'JAX/RB': ['Maurice Jones-Drew', 'Fred Taylor'],
  'JAX/DL': ['Marcus Stroud', 'John Henderson'],
  'JAX/CB': ['Rashean Mathis'],

  'TEN/QB': ['Vince Young'],
  'TEN/RB': ['LenDale White'],
  'TEN/DL': ['Albert Haynesworth'],
  'TEN/LB': ['Keith Bulluck'],
  'TEN/CB': ['Cortland Finnegan'],

  'HOU/QB': ['Matt Schaub'],
  'HOU/WR': ['Andre Johnson'],
  'HOU/RB': ['Ahman Green'],
  'HOU/DL': ['Mario Williams'],
  'HOU/LB': ['DeMeco Ryans'],

  'DEN/QB': ['Jay Cutler'],
  'DEN/RB': ['Travis Henry'],
  'DEN/WR': ['Brandon Marshall', 'Rod Smith'],
  'DEN/DL': ['Elvis Dumervil'],
  'DEN/CB': ['Champ Bailey'],
  'DEN/S':  ['John Lynch'],

  'KC/QB': ['Damon Huard', 'Brodie Croyle'],
  'KC/RB': ['Larry Johnson'],
  'KC/WR': ['Dwayne Bowe', 'Eddie Kennison'],
  'KC/TE': ['Tony Gonzalez'],
  'KC/DL': ['Jared Allen'],
  'KC/LB': ['Derrick Johnson'],

  'LV/QB': ['Daunte Culpepper', 'JaMarcus Russell'],
  'LV/WR': ['Jerry Porter'],
  'LV/RB': ['LaMont Jordan', 'Justin Fargas'],
  'LV/CB': ['Nnamdi Asomugha'],
  'LV/DL': ['Warren Sapp'],

  'LAC/QB': ['Philip Rivers'],
  'LAC/RB': ['LaDainian Tomlinson'],
  'LAC/WR': ['Vincent Jackson', 'Chris Chambers'],
  'LAC/TE': ['Antonio Gates'],
  'LAC/LB': ['Shawne Merriman', 'Stephen Cooper'],
  'LAC/DL': ['Jamal Williams', 'Igor Olshansky'],
  'LAC/CB': ['Quentin Jammer'],

  'LAR/QB': ['Marc Bulger'],
  'LAR/RB': ['Steven Jackson'],
  'LAR/WR': ['Torry Holt', 'Isaac Bruce'],
  'LAR/OL': ['Orlando Pace'],
  'LAR/DL': ['Leonard Little'],

  'ARI/QB': ['Kurt Warner'],
  'ARI/WR': ['Larry Fitzgerald', 'Anquan Boldin'],
  'ARI/RB': ['Edgerrin James'],
  'ARI/LB': ['Karlos Dansby'],
  'ARI/S':  ['Adrian Wilson'],

  'SEA/QB': ['Matt Hasselbeck'],
  'SEA/RB': ['Shaun Alexander'],
  'SEA/WR': ['Bobby Engram', 'Deion Branch'],
  'SEA/OL': ['Walter Jones'],
  'SEA/LB': ['Lofa Tatupu'],
  'SEA/CB': ['Marcus Trufant'],

  'SF/QB': ['Alex Smith'],
  'SF/RB': ['Frank Gore'],
  'SF/TE': ['Vernon Davis'],
  'SF/LB': ['Patrick Willis'],
  'SF/CB': ['Nate Clements'],

  'TB/QB': ['Jeff Garcia'],
  'TB/RB': ['Earnest Graham', 'Cadillac Williams'],
  'TB/WR': ['Joey Galloway'],
  'TB/LB': ['Derrick Brooks', 'Cato June', 'Barrett Ruud'],
  'TB/CB': ['Ronde Barber'],

  'CAR/QB': ['David Carr', 'Vinny Testaverde'],
  'CAR/RB': ['DeAngelo Williams'],
  'CAR/WR': ['Steve Smith'],
  'CAR/DL': ['Julius Peppers'],
  'CAR/LB': ['Jon Beason', 'Thomas Davis'],

  'ATL/QB': ['Joey Harrington', 'Byron Leftwich'],
  'ATL/RB': ['Warrick Dunn'],
  'ATL/WR': ['Roddy White'],
  'ATL/TE': ['Alge Crumpler'],
  'ATL/CB': ['DeAngelo Hall'],
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
    // Sort 2026 by OVR desc.
    fbgmList.sort((a, b) => (b.r.ovr ?? 0) - (a.r.ovr ?? 0));

    // Apply STARTER_OVERRIDES: promote known 2007 starters to the front
    // of the CSV list so they get the highest-OVR slots in the pairing
    // below. Iterate the override list in REVERSE so the first-named
    // starter ends up at index 0, second at index 1, etc.
    const overrideKey = `${teamAbbrev}/${bucket}`;
    const overrideNames = STARTER_OVERRIDES[overrideKey];
    if (overrideNames && overrideNames.length > 0) {
      for (let oi = overrideNames.length - 1; oi >= 0; oi--) {
        const wantedName = overrideNames[oi];
        const idx = csvList.findIndex((row) => row[colIdx.full_name] === wantedName);
        if (idx > 0) {
          const [starter] = csvList.splice(idx, 1);
          csvList.unshift(starter);
        }
      }
    }

    const pairs = Math.min(fbgmList.length, csvList.length);
    for (let i = 0; i < pairs; i++) {
      const target = fbgmList[i].p;
      const csv = csvList[i];
      const wasName = `${target.firstName} ${target.lastName}`;
      // Prefer football_name (jersey/displayed name like "Brad" for Brad
      // Johnson), fall back to first_name (legal first like "James"),
      // fall back to splitting full_name on the first space, fall back
      // to keeping existing 2026 firstName.
      const footballName = csv[colIdx.football_name];
      const fullName = csv[colIdx.full_name];
      let newFirst = footballName && footballName.trim() !== ''
        ? footballName.trim()
        : (csv[colIdx.first_name] || '').trim();
      const newLast = (csv[colIdx.last_name] || '').trim();
      // If first_name and football_name are both empty but full_name is
      // populated (e.g. "T.J. Houshmandzadeh"), parse full_name as the
      // last fallback.
      if (!newFirst && fullName) {
        const parts = fullName.split(' ');
        newFirst = parts.slice(0, -1).join(' ') || parts[0];
      }
      target.firstName = newFirst || target.firstName;
      target.lastName = newLast || target.lastName;
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
  // Skip retired (-3) only. tid=-1 (FA pool) and tid=-2 (draft class) both
  // get filler names so we don't ship the 2026 draft class shifted to
  // 2008 with their real 2026 names (its.camare + 50_sm + agarre3552
  // 4/29: "Mendoza in 07", "real 2026 picks in FA / draft").
  if (player.tid <= -3) continue;
  if (overlaidPids.has(player.pid)) continue;
  player.firstName = pick(FILLER_FIRST_NAMES);
  player.lastName = pick(FILLER_LAST_NAMES);
  player.college = pick(FILLER_COLLEGES);
  fallbackCount++;
}
console.log(`Randomized ${fallbackCount} unmatched names from filler pool.`);

// --- 4. Per-team: clear depth chart + scale ticket prices to era. ---------
//
// Era-correct team identity: 4 franchises had different cities/abbrevs/
// names in 2007. The FBGM 2026 file uses 2026 abbrevs (LAR / LAC / LV /
// WSH) which mapped 2007 stars correctly via TEAM_CODE_TO_FBGM_ABBREV at
// load time, but the rendered city/abbrev in the UI was still 2026.
// Override here so the league reads as 2007. (somedude4759 + its.camare
// 4/29.) Logos cleared so the engine falls back to text-based team
// chrome with the existing colors — wrong 2026 logos are worse than no
// logo. Real era logos are v2.
const TEAM_ERA_OVERRIDES = {
  LAR: { region: 'St. Louis', name: 'Rams', abbrev: 'STL' },
  LAC: { region: 'San Diego', name: 'Chargers', abbrev: 'SD' },
  LV:  { region: 'Oakland', name: 'Raiders', abbrev: 'OAK' },
  WSH: { region: 'Washington', name: 'Redskins', abbrev: 'WAS' },
};
for (const team of data.teams) {
  team.depth = undefined;
  if (team.budget) {
    if (typeof team.budget.ticketPrice === 'number') {
      team.budget.ticketPrice = Math.round(team.budget.ticketPrice * CAP_SCALE * 100) / 100;
    }
  }
  const override = TEAM_ERA_OVERRIDES[team.abbrev];
  if (override) {
    team.region = override.region;
    team.name = override.name;
    team.abbrev = override.abbrev;
    team.imgURL = '';
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
// Era-renamed teams: LAC → SD, LAR → STL, LV → OAK, WSH → WAS.
const SD_TID = data.teams.find((t) => t.abbrev === 'SD').tid;
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
  console.log('  LaDainian Tomlinson on SD: born', sampleSD.born?.year);
}
