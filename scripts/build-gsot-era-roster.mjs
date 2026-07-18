/**
 * Generates a "Greatest Show on Turf — 1999 NFL Season" FBGM-format roster file by
 * transforming the 2026 PreDraft roster.
 *
 * 1999: Kurt Warner leads the St. Louis Rams to Super Bowl XXXIV, Marshall Faulk
 * is the most dangerous weapon in football, Peyton Manning's 2nd year in Indy,
 * Edgerrin James and Randy Moss rookies, Jeff Fisher's Titans reach the SB.
 * Dan Marino's final season, Brett Favre in GB, Steve McNair and Eddie George
 * in Tennessee. 31 teams (Cleveland Browns expansion team returns).
 *
 * Run from repo root:
 *   node scripts/build-gsot-era-roster.mjs
 *
 * Outputs: public/rosters/FBGM_NFL_Roster_GSoT_1999.json
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join('public', 'rosters', 'FBGM_NFL_Roster_2026_PreDraft.json');
const OUT = path.join('public', 'rosters', 'FBGM_NFL_Roster_GSoT_1999.json');
const CSV = path.join('scripts', 'data', 'nflverse_roster_1999.csv');

const SOURCE_SEASON = 2026;
const TARGET_SEASON = 1999;
const YEAR_SHIFT = TARGET_SEASON - SOURCE_SEASON; // -27

// 1999 NFL salary cap was $57.288M; 2026 file uses $353.85M.
const CAP_1999 = 57288;        // $57.288M in $K units
const CAP_2026 = 353850;       // $353.85M in $K units
const CAP_SCALE = CAP_1999 / CAP_2026; // ≈ 0.162
const ERA_MIN_CONTRACT = 175;  // 1999 league minimum was ~$175K
const ERA_MAX_CONTRACT = 12000; // rough 1999 top-of-market

// nflverse 1999 team codes → FBGM 2026 franchise abbrevs.
const TEAM_CODE_TO_FBGM_ABBREV = {
  ARI: 'ARI', ATL: 'ATL', BAL: 'BAL', BUF: 'BUF',
  CAR: 'CAR', CHI: 'CHI', CIN: 'CIN', CLE: 'CLE',
  DAL: 'DAL', DEN: 'DEN', DET: 'DET', GB:  'GB',
  IND: 'IND', JAX: 'JAX', KC:  'KC',  MIA: 'MIA',
  MIN: 'MIN', NE:  'NE',  NO:  'NO',  NYG: 'NYG',
  NYJ: 'NYJ', OAK: 'LV',  PHI: 'PHI', PIT: 'PIT',
  SD:  'LAC', SEA: 'SEA', SF:  'SF',  STL: 'LAR',
  TB:  'TB',  TEN: 'TEN', WAS: 'WSH',
};

// 1999 era-correct team identities.
const TEAM_ERA_OVERRIDES = {
  LAR: { region: 'St. Louis',  name: 'Rams',     abbrev: 'STL' },
  LV:  { region: 'Oakland',    name: 'Raiders',  abbrev: 'OAK' },
  LAC: { region: 'San Diego',  name: 'Chargers', abbrev: 'SD'  },
  WSH: { region: 'Washington', name: 'Redskins', abbrev: 'WAS' },
};

// Promote iconic 1999 starters to correct depth slots.
// Keys use FBGM 2026 abbrevs (OAK→LV, SD→LAC, WAS→WSH, STL→LAR already correct).
const STARTER_OVERRIDES = {
  // STL Rams — Greatest Show on Turf (SB XXXIV champions); LAR = FBGM abbrev ✓
  'LAR/QB': ['Kurt Warner', 'Paul Justin'],
  'LAR/RB': ['Marshall Faulk', 'Robert Holcombe', 'Greg Hill'],
  'LAR/WR': ['Isaac Bruce', 'Torry Holt', 'Az-Zahir Hakim', 'Ricky Proehl'],
  'LAR/TE': ['Roland Williams', 'Jeff Robinson'],
  'LAR/OL': ['Orlando Pace', 'Adam Timmerman', 'Mike Gruttadauria', 'Tom Nutten', 'Fred Miller'],
  'LAR/LB': ['London Fletcher', 'Mike Jones', 'Todd Collins'],
  'LAR/DL': ['Kevin Carter', 'D\'Marco Farr', 'Grant Wistrom'],
  'LAR/CB': ['Todd Lyght', 'Dre\' Bly'],
  'LAR/S':  ['Devin Bush', 'Keith Lyle'],

  // TEN Titans — the other SB team (One Yard Short)
  'TEN/QB': ['Steve McNair', 'Neil O\'Donnell'],
  'TEN/RB': ['Eddie George', 'Rodney Thomas'],
  'TEN/WR': ['Yancey Thigpen', 'Kevin Dyson', 'Isaac Byrd'],
  'TEN/TE': ['Frank Wycheck'],
  'TEN/DL': ['Jevon Kearse', 'Jason Fisk', 'Henry Ford'],
  'TEN/LB': ['Barron Wortham', 'Joe Bowden'],
  'TEN/CB': ['Samari Rolle', 'Blaine Bishop'],
  'TEN/S':  ['Marcus Robertson', 'Perry Phenix'],

  // IND — Peyton Manning year 2, Edgerrin James rookie
  'IND/QB': ['Peyton Manning'],
  'IND/RB': ['Edgerrin James', 'Lamont Warren'],
  'IND/WR': ['Marvin Harrison', 'E.G. Green'],
  'IND/TE': ['Marcus Pollard', 'Ken Dilger'],
  'IND/LB': ['Cornelius Bennett', 'Mike Peterson'],
  'IND/DL': ['Chad Bratzke'],
  'IND/CB': ['Aaron Bailey', 'Jeff Burris'],

  // MIN — Randy Moss year 2
  'MIN/QB': ['Jeff George', 'Daunte Culpepper'],
  'MIN/RB': ['Robert Smith', 'Leroy Hoard', 'Moe Williams'],
  'MIN/WR': ['Randy Moss', 'Cris Carter', 'Jake Reed'],
  'MIN/TE': ['Andrew Jordan', 'Byron Chamberlain'],
  'MIN/LB': ['Jeff Brady', 'Dwayne Rudd'],
  'MIN/DL': ['John Randle', 'Derrick Alexander'],
  'MIN/CB': ['Dewayne Washington', 'Jimmy Hitchcock'],
  'MIN/S':  ['Orlando Thomas', 'Robert Griffith'],

  // JAX — 14-2 regular season, lost to TEN wildcard
  'JAX/QB': ['Mark Brunell', 'Jonathan Quinn'],
  'JAX/RB': ['Fred Taylor', 'James Stewart'],
  'JAX/WR': ['Jimmy Smith', 'Keenan McCardell'],
  'JAX/TE': ['Kyle Brady'],
  'JAX/LB': ['Kevin Hardy', 'Mike Barber', 'Jeff Kopp'],
  'JAX/DL': ['Tony Brackens', 'Seth Payne', 'Gary Walker'],
  'JAX/CB': ['Aaron Beasley', 'Fernando Bryant'],
  'JAX/S':  ['Donovin Darius', 'Carnell Lake'],

  // GB — Favre still elite; Ahman Green on SEA not GB in 1999
  'GB/QB':  ['Brett Favre'],
  'GB/RB':  ['Dorsey Levens'],
  'GB/WR':  ['Antonio Freeman', 'Corey Bradford', 'Bill Schroeder'],
  'GB/TE':  ['Bubba Franks'],
  'GB/OL':  ['Marco Rivera', 'Mike Wahle'],
  'GB/LB':  ['Bernardo Harris', 'Na\'il Diggs'],
  'GB/DL':  ['Vonnie Holliday', 'Santana Dotson', 'Marcellus Wiley'],
  'GB/CB':  ['Tyrone Williams', 'Mike McKenzie'],

  // DAL — Aikman and Emmitt fading but still there
  'DAL/QB': ['Troy Aikman'],
  'DAL/RB': ['Emmitt Smith', 'Chris Warren'],
  'DAL/WR': ['Michael Irvin', 'Raghib Ismail', 'Billy Davis'],
  'DAL/TE': ['David LaFleur', 'Eric Bjornson'],
  'DAL/LB': ['Randall Godfrey', 'Dexter Coakley'],
  'DAL/CB': ['Deion Sanders', 'Kevin Smith'],
  'DAL/S':  ['Darren Woodson', 'Brock Marion'],
  'DAL/DL': ['Greg Ellis', 'Chad Hennings'],

  // DEN — Shanahan defends title without Elway; Darrien Gordon on OAK not DEN
  'DEN/QB': ['Brian Griese', 'Bubby Brister'],
  'DEN/RB': ['Olandis Gary', 'Terrell Davis', 'Mike Anderson'],
  'DEN/WR': ['Ed McCaffrey', 'Rod Smith', 'Travis McGriff'],
  'DEN/TE': ['Shannon Sharpe'],
  'DEN/LB': ['Bill Romanowski', 'Glenn Cadrez', 'John Mobley'],
  'DEN/DL': ['Trevor Pryce', 'Keith Traylor', 'Neil Smith'],
  'DEN/CB': ['Ray Crockett'],
  'DEN/S':  ['Tyrone Braxton', 'Steve Atwater'],

  // MIA — Dan Marino's final season; Lamar Smith on NO; Louis Oliver not in 1999 CSV
  'MIA/QB': ['Dan Marino', 'Damon Huard'],
  'MIA/RB': ['Cecil Collins'],
  'MIA/WR': ['Oronde Gadsden', 'O.J. McDuffie', 'Yatil Green'],
  'MIA/TE': ['Troy Drayton'],
  'MIA/LB': ['Zach Thomas', 'Derrick Rodgers'],
  'MIA/DL': ['Chuck Wiley', 'Tim Bowens'],
  'MIA/CB': ['Sam Madison', 'Patrick Surtain'],
  'MIA/S':  ['Brock Marion'],

  // PIT; Carnell Lake on JAX; Ray Seals not in 1999 CSV; Gardocki is punter on CLE
  'PIT/QB': ['Kordell Stewart', 'Mike Tomczak'],
  'PIT/RB': ['Jerome Bettis', 'Richard Huntley'],
  'PIT/WR': ['Hines Ward', 'Courtney Hawkins', 'Troy Edwards'],
  'PIT/TE': ['Mark Bruener'],
  'PIT/LB': ['Jason Gildon', 'Earl Holmes', 'Mike Vrabel'],
  'PIT/DL': ['Joel Steed'],
  'PIT/CB': ['Chad Scott', 'Dewayne Washington'],
  'PIT/S':  ['Lee Flowers'],

  // BAL — Brian Billick first year
  'BAL/QB': ['Tony Banks', 'Scott Mitchell'],
  'BAL/RB': ['Priest Holmes', 'Errict Rhett'],
  'BAL/WR': ['Qadry Ismail', 'Patrick Johnson'],
  'BAL/LB': ['Ray Lewis', 'Peter Boulware', 'Jamie Sharper'],
  'BAL/DL': ['Tony Siragusa', 'Michael McCrary'],
  'BAL/CB': ['Duane Starks', 'Chris McAlister'],

  // NYJ — Parcells in transition
  'NYJ/QB': ['Ray Lucas', 'Rick Mirer'],
  'NYJ/RB': ['Curtis Martin', 'Richie Anderson'],
  'NYJ/WR': ['Keyshawn Johnson', 'Wayne Chrebet'],
  'NYJ/TE': ['Fred Baxter'],
  'NYJ/LB': ['Mo Lewis', 'James Farrior'],
  'NYJ/CB': ['Aaron Glenn', 'Ray Mickens'],

  // BUF
  'BUF/QB': ['Rob Johnson', 'Doug Flutie'],
  'BUF/RB': ['Antowain Smith', 'Jonathan Linton'],
  'BUF/WR': ['Eric Moulds', 'Andre Reed', 'Peerless Price'],
  'BUF/DL': ['Bruce Smith', 'Ted Washington'],
  'BUF/LB': ['Bryce Paup', 'Sam Rogers'],

  // TB — Dungy's defense; Warren Sapp is DL not LB
  'TB/QB':  ['Shaun King', 'Eric Zeier'],
  'TB/RB':  ['Warrick Dunn', 'Mike Alstott'],
  'TB/WR':  ['Bert Emanuel', 'Jacquez Green'],
  'TB/LB':  ['Derrick Brooks', 'Hardy Nickerson'],
  'TB/DL':  ['Warren Sapp', 'Marcus Jones'],
  'TB/CB':  ['Ronde Barber', 'Brian Kelly'],
  'TB/S':   ['John Lynch', 'Melvin Johnson'],

  // SF — Steve Young's last year; Ken Norton (not "Jr." — full_name in CSV)
  'SF/QB':  ['Steve Young', 'Jeff Garcia'],
  'SF/RB':  ['Garrison Hearst', 'Charlie Garner'],
  'SF/WR':  ['Jerry Rice', 'Terrell Owens', 'J.J. Stokes'],
  'SF/LB':  ['Lee Woodall', 'Ken Norton'],
  'SF/CB':  ['R.W. McQuarters'],
  'SF/S':   ['Tim McDonald', 'Merton Hanks'],

  // NE — Pete Carroll final year
  'NE/QB':  ['Drew Bledsoe'],
  'NE/RB':  ['Terry Allen', 'Kevin Faulk'],
  'NE/WR':  ['Terry Glenn', 'Troy Brown', 'Tony Simmons'],
  'NE/TE':  ['Ben Coates'],
  'NE/LB':  ['Andy Katzenmoyer', 'Ted Johnson'],
  'NE/DL':  ['Willie McGinest', 'Greg Spires'],

  // KC; Tony Gonzalez is TE not WR (remove from WR list)
  'KC/QB':  ['Elvis Grbac', 'Warren Moon'],
  'KC/RB':  ['Donnell Bennett', 'Rashaan Shehee'],
  'KC/WR':  ['Derrick Alexander', 'Andre Rison'],
  'KC/TE':  ['Tony Gonzalez'],
  'KC/LB':  ['Derrick Thomas', 'Mike Maslowski'],
  'KC/DL':  ['Chester McGlockton', 'Eric Hicks'],

  // LV (Oakland Raiders) — FBGM abbrev; was 'OAK' (silent failure)
  'LV/QB':  ['Rich Gannon', 'Donald Hollas'],
  'LV/RB':  ['Napoleon Kaufman', 'Tyrone Wheatley'],
  'LV/WR':  ['Tim Brown', 'James Jett', 'Rickey Dudley'],
  'LV/LB':  ['Greg Biekert', 'James Trapp'],
  'LV/CB':  ['Charles Woodson', 'Eric Allen'],

  // LAC (San Diego Chargers) — FBGM abbrev; was 'SD' (silent failure)
  'LAC/QB': ['Jim Harbaugh', 'Moses Moreno'],
  'LAC/RB': ['Terrell Fletcher', 'Natrone Means'],
  'LAC/WR': ['Freddie Jones', 'Mikhael Ricks'],
  'LAC/LB': ['Junior Seau', 'Donnie Edwards'],
  'LAC/DL': ['John Parrella'],

  // SEA; Warren Moon on KC not SEA; Ahman Green on SEA ✓
  'SEA/QB': ['Jon Kitna'],
  'SEA/RB': ['Ricky Watters', 'Ahman Green'],
  'SEA/WR': ['Joey Galloway', 'Derrick Mayes'],
  'SEA/LB': ['Levon Kirkland'],

  // ARI
  'ARI/QB': ['Jake Plummer', 'David Boaz'],
  'ARI/RB': ['Adrian Murrell', 'Mario Bates'],
  'ARI/WR': ['Rob Moore', 'Frank Sanders', 'David Boston'],
  'ARI/LB': ['Tom Knight', 'Ronald McKinnon'],

  // NO — Ditka disaster
  'NO/QB':  ['Billy Joe Hobert', 'Jake Delhomme'],
  'NO/RB':  ['Ricky Williams', 'Lamar Smith'],
  'NO/WR':  ['Joe Horn', 'Sean Dawkins'],
  'NO/LB':  ['Winfred Tubbs'],

  // ATL — after SB XXXIII loss
  'ATL/QB': ['Chris Chandler', 'Tony Graziani'],
  'ATL/RB': ['Jamal Anderson', 'Bob Christian'],
  'ATL/WR': ['Terance Mathis', 'Shawn Jefferson'],
  'ATL/LB': ['Jessie Tuggle', 'Henri Crockett'],
  'ATL/DL': ['Chuck Smith'],

  // CAR; Mike Alstott is TB RB not CAR QB
  'CAR/QB': ['Steve Beuerlein'],
  'CAR/RB': ['Tim Biakabutuka', 'Fred Lane'],
  'CAR/WR': ['Muhsin Muhammad', 'Patrick Jeffers'],
  'CAR/LB': ['Sam Mills', 'Mark Fields'],
  'CAR/DL': ['Sean Gilbert', 'Kevin Greene'],

  // PHI — Andy Reid first year; Romanowski on DEN; Willis on SEA; Warren on DAL
  'PHI/QB': ['Doug Pederson', 'Koy Detmer'],
  'PHI/RB': ['Duce Staley'],
  'PHI/WR': ['Torrance Small', 'Charles Johnson'],
  'PHI/DL': ['Hugh Douglas', 'Mike Mamula'],

  // WSH (Redskins) — FBGM abbrev; was 'WAS' (silent failure)
  'WSH/QB': ['Brad Johnson', 'Jeff George'],
  'WSH/RB': ['Stephen Davis', 'Skip Hicks'],
  'WSH/WR': ['Michael Westbrook', 'Albert Connell'],
  'WSH/LB': ['Derek Smith', 'Rich Owens'],
  'WSH/S':  ['Sam Shade'],

  // NYG
  'NYG/QB': ['Kent Graham', 'Jason Garrett'],
  'NYG/RB': ['Joe Montgomery', 'Gary Brown'],
  'NYG/WR': ['Amani Toomer', 'Ike Hilliard'],
  'NYG/LB': ['Jessie Armstead', 'Corey Miller'],
  'NYG/DL': ['Keith Hamilton', 'Mike Strahan'],

  // CHI — Jauron first year
  'CHI/QB': ['Shane Matthews', 'Cade McNown'],
  'CHI/RB': ['Raymont Harris', 'Curtis Enis'],
  'CHI/WR': ['Marcus Robinson', 'Bobby Engram'],
  'CHI/LB': ['Barry Minter', 'Bryan Cox'],

  // DET
  'DET/QB': ['Charlie Batch', 'Gus Frerotte'],
  'DET/RB': ['Barry Sanders', 'Greg Hill'],
  'DET/WR': ['Herman Moore', 'Germane Crowell', 'Johnnie Morton'],

  // CIN — 4-12 season
  'CIN/QB': ['Akili Smith', 'Jeff Blake'],
  'CIN/RB': ['Corey Dillon', 'Ki-Jana Carter'],
  'CIN/WR': ['Carl Pickens', 'Darnay Scott'],

  // CLE — expansion team
  'CLE/QB': ['Tim Couch', 'Ty Detmer'],
  'CLE/RB': ['Terry Kirby', 'Karim Abdul-Jabbar'],
  'CLE/WR': ['Kevin Johnson', 'Leslie Shepherd'],
};

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
  if (p === 'LS') return 'OL';
  return null;
}

// OVR overrides for 1999 marquee names whose FBGM slot rated them too low. Keyed
// like STARTER_OVERRIDES ('TEAM/BUCKET' -> { 'Name': ovr }). The year-shift makes
// them the TOP at their position, but a couple stayed FBGM-mediocre (Faulk 68,
// Kearse 76); these pin era-accurate values for the Greatest Show on Turf season.
const OVR_OVERRIDES = {
  'LAR/QB': { 'Kurt Warner': 94 },       // 1999 NFL MVP + Super Bowl MVP (LAR = Rams' FBGM abbrev)
  'LAR/RB': { 'Marshall Faulk': 95 },    // 1999 Offensive Player of the Year, 2,429 total yds
  'IND/QB': { 'Peyton Manning': 85 },    // 1999 breakout, 26 TD
  'IND/RB': { 'Edgerrin James': 90 },    // 1999 rushing title as a rookie
  'MIN/WR': { 'Randy Moss': 93 },        // dominant, prime
  'TEN/DL': { 'Jevon Kearse': 88 },      // 1999 Defensive ROY, 14.5 sacks
};

/** Pin a player's latest rating to a target OVR: scale every sub-rating so FBGM's
 *  computed OVR lands near the target, then set ovr/pot (and the per-pos maps). */
function applyOvrOverride(player, targetOvr) {
  if (!Array.isArray(player.ratings) || player.ratings.length === 0) return;
  let li = 0;
  for (let k = 1; k < player.ratings.length; k++) {
    if ((player.ratings[k].season ?? 0) > (player.ratings[li].season ?? 0)) li = k;
  }
  const rt = player.ratings[li];
  const scale = targetOvr / (rt.ovr || 70);
  const subKeys = ['stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns'];
  for (const key of subKeys) {
    if (typeof rt[key] === 'number') rt[key] = Math.min(99, Math.max(1, Math.round(rt[key] * scale)));
  }
  rt.ovr = targetOvr;
  rt.pot = Math.max(rt.pot ?? targetOvr, targetOvr);
  const pos = rt.pos;
  if (rt.ovrs && rt.ovrs[pos] !== undefined) rt.ovrs[pos] = targetOvr;
  if (rt.pots && rt.pots[pos] !== undefined) rt.pots[pos] = Math.max(rt.pots[pos], targetOvr);
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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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

const ACTIVE_STATUSES = new Set(['ACT', 'RES', 'PUP']);
const csvByTeamPos = new Map();
let csvUsableRows = 0;
for (let r = 1; r < csvRows.length; r++) {
  const row = csvRows[r];
  if (row.length < csvHeader.length - 1) continue;
  const status = row[colIdx.status];
  if (!ACTIVE_STATUSES.has(status)) continue;
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
console.log(`  CSV usable rows after filter: ${csvUsableRows}`);

// --- 1. gameAttributes ---
const ga = data.gameAttributes ?? {};
ga.season = TARGET_SEASON;
ga.startingSeason = TARGET_SEASON;
ga.salaryCap = CAP_1999;
ga.minContract = ERA_MIN_CONTRACT;
ga.maxContract = ERA_MAX_CONTRACT;
ga.minPayroll = Math.round(0.7 * CAP_1999);
delete ga.userTid;
delete ga.userTids;
data.gameAttributes = ga;
data.meta = { name: 'NFL Roster — Greatest Show on Turf 1999 (v1, nflverse-driven)' };

// --- 2. Clear history ---
data.releasedPlayers = [];
data.awards = [];
data.events = [];
data.playerFeats = [];
data.seasonLeaders = [];
data.playoffSeries = [];
data.headToHeads = [];
data.allStars = [];
data.trade = [];

// --- 3a. Per-player shifts ---
for (const player of data.players) {
  if (player.born?.year != null) player.born.year = shiftYear(player.born.year);
  if (player.draft?.year != null) player.draft.year = shiftYear(player.draft.year);
  if (player.contract) {
    if (player.contract.exp != null) player.contract.exp = shiftYear(player.contract.exp);
    if (player.contract.amount != null) player.contract.amount = scaleContractAmount(player.contract.amount);
  }
  player.awards = [];
  player.injuries = [];
  player.transactions = [];
  player.stats = [];
  player.salaries = [];
  player.statsTids = player.tid >= 0 ? [player.tid] : [];
  if (typeof player.retiredYear === 'number') player.retiredYear = shiftYear(player.retiredYear);
  if (player.imgURL) player.imgURL = '';
  if (Array.isArray(player.ratings)) {
    for (const r of player.ratings) {
      if (typeof r.season === 'number') r.season = shiftYear(r.season);
    }
  }
}

// --- 3b. CSV-driven overlay ---
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
    fbgmList.sort((a, b) => (b.r.ovr ?? 0) - (a.r.ovr ?? 0));

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
      // 1999 CSV has no football_name column. Prefer full_name for the
      // player's displayed first name (e.g., "Kurt" not "Kurtis" for Warner).
      const fullName = csv[colIdx.full_name];
      const footballName = csv[colIdx.football_name]; // undefined for 1999
      let newFirst;
      if (footballName && footballName.trim() !== '') {
        newFirst = footballName.trim();
      } else if (fullName) {
        const parts = fullName.trim().split(' ');
        newFirst = parts.slice(0, -1).join(' ') || parts[0];
      } else {
        newFirst = (csv[colIdx.first_name] || '').trim();
      }
      const newLast = (csv[colIdx.last_name] || '').trim();
      target.firstName = newFirst || target.firstName;
      target.lastName = newLast || target.lastName;
      const college = csv[colIdx.college];
      if (college && college.trim() !== '') target.college = college;
      const birthDate = csv[colIdx.birth_date];
      if (birthDate && /^\d{4}-/.test(birthDate)) {
        const birthYear = parseInt(birthDate.slice(0, 4), 10);
        if (Number.isFinite(birthYear)) target.born = { ...(target.born ?? {}), year: birthYear };
      }
      const entryYear = parseInt(csv[colIdx.entry_year], 10);
      if (Number.isFinite(entryYear) && target.draft) target.draft.year = entryYear;
      const draftNumber = parseInt(csv[colIdx.draft_number], 10);
      if (Number.isFinite(draftNumber) && target.draft) target.draft.pick = draftNumber;

      // Era-accurate OVR for the marquee names (see OVR_OVERRIDES).
      const overlaidOvr = OVR_OVERRIDES[overrideKey]?.[`${target.firstName} ${target.lastName}`];
      if (overlaidOvr !== undefined) applyOvrOverride(target, overlaidOvr);

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

// --- 3c. Filler names ---
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

let fallbackCount = 0;
for (const player of data.players) {
  if (player.tid <= -3) continue;
  if (overlaidPids.has(player.pid)) continue;
  player.firstName = pick(FILLER_FIRST_NAMES);
  player.lastName = pick(FILLER_LAST_NAMES);
  player.college = pick(FILLER_COLLEGES);
  fallbackCount++;
}
console.log(`Randomized ${fallbackCount} unmatched names from filler pool.`);

// --- 4. Per-team: remove non-existent 1999 franchises, era overrides ---
// HOU (Texans) is an expansion team from 2002 — doesn't exist in 1999.
// In 1999 there were 31 teams (CLE expansion brought it from 30→31).
data.teams = data.teams.filter((t) => t.abbrev !== 'HOU');
const existingTids = new Set(data.teams.map((t) => t.tid));
for (const player of data.players) {
  if (player.tid >= 0 && !existingTids.has(player.tid)) {
    player.tid = -1;
  }
}

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

// --- 5. Draft picks: shift + drop pre-1999 ---
if (Array.isArray(data.draftPicks)) {
  for (const dp of data.draftPicks) {
    if (typeof dp.season === 'number') dp.season = shiftYear(dp.season);
  }
  data.draftPicks = data.draftPicks.filter((dp) => (dp.season ?? 0) >= TARGET_SEASON);
}

// --- 5b. Reframe the authentic-era roster into the engine's forced year ---
// Everything above builds a true-to-1999 roster (real ages, era ratings + era-cap
// contracts). But BS Football forces the starting year to the current calendar
// year, so a 1999-framed save has every contract expired on day 1 (players fall to
// FA, FBGM backfills fictional bodies) and every player ~27 years too old (age
// decay). Shift every year-bearing field up by (ENGINE_YEAR - TARGET_SEASON) so the
// roster lives in the engine's frame — 1999 ages/service map onto 2026 dates — while
// the era-authentic salary cap and contract *amounts* are left untouched.
const ENGINE_YEAR = 2026;
const ERA_TO_ENGINE = ENGINE_YEAR - TARGET_SEASON; // +27 for 1999
for (const p of data.players) {
  if (p.born?.year != null) p.born.year += ERA_TO_ENGINE;
  if (p.draft?.year != null) p.draft.year += ERA_TO_ENGINE;
  if (p.contract?.exp != null) p.contract.exp += ERA_TO_ENGINE;
  if (Array.isArray(p.ratings)) {
    for (const r of p.ratings) if (typeof r.season === 'number') r.season += ERA_TO_ENGINE;
  }
  // Era contract *lengths* are FBGM-generated (not authentic), and the year round
  // trip can leave a rostered player expired/expiring on opening day. Floor any
  // rostered contract that would lapse by the opening season to a fresh 1-4yr deal,
  // spread deterministically by pid so the whole roster doesn't hit FA at once.
  if (p.tid >= 0 && p.contract?.exp != null && p.contract.exp <= ENGINE_YEAR) {
    p.contract.exp = ENGINE_YEAR + 1 + (p.pid % 4);
  }
}
if (Array.isArray(data.draftPicks)) {
  for (const dp of data.draftPicks) if (typeof dp.season === 'number') dp.season += ERA_TO_ENGINE;
}
data.gameAttributes.season = ENGINE_YEAR;
data.gameAttributes.startingSeason = ENGINE_YEAR;

// --- 6. Write output ---
console.log(`Writing ${OUT}...`);
const outStart = Date.now();
fs.writeFileSync(OUT, JSON.stringify(data));
const outStat = fs.statSync(OUT);
console.log(`Wrote ${(outStat.size / (1024 * 1024)).toFixed(1)} MB in ${Date.now() - outStart}ms.`);

console.log('\n--- Sanity checks ---');
console.log('  season:', data.gameAttributes.season);
console.log('  salaryCap:', data.gameAttributes.salaryCap);
console.log('  team count:', data.teams.length);
console.log('  player count:', data.players.length);
const STL_TID = data.teams.find((t) => t.abbrev === 'STL')?.tid;
const IND_TID = data.teams.find((t) => t.abbrev === 'IND')?.tid;
const MIA_TID = data.teams.find((t) => t.abbrev === 'MIA')?.tid;
const warner = data.players.find((p) => p.firstName === 'Kurt' && p.lastName === 'Warner' && p.tid === STL_TID);
if (warner) console.log('  Kurt Warner on STL: born', warner.born?.year, '(age', TARGET_SEASON - warner.born.year, ')');
else console.log('  [WARN] Kurt Warner not found on STL');
const faulk = data.players.find((p) => p.firstName === 'Marshall' && p.lastName === 'Faulk' && p.tid === STL_TID);
if (faulk) console.log('  Marshall Faulk on STL: born', faulk.born?.year);
else console.log('  [WARN] Marshall Faulk not found on STL');
const marino = data.players.find((p) => p.firstName === 'Dan' && p.lastName === 'Marino' && p.tid === MIA_TID);
if (marino) console.log('  Dan Marino on MIA: born', marino.born?.year, '(age', TARGET_SEASON - marino.born.year, ')');
else console.log('  [WARN] Dan Marino not found on MIA');
const manning = data.players.find((p) => p.firstName === 'Peyton' && p.lastName === 'Manning' && p.tid === IND_TID);
if (manning) console.log('  Peyton Manning on IND: born', manning.born?.year, '(age', TARGET_SEASON - manning.born.year, ')');
else console.log('  [WARN] Peyton Manning not found on IND');
