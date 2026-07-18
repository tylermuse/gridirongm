/**
 * Generates a "Montana Era — 1994 NFL Season" FBGM-format roster file by
 * transforming the 2026 PreDraft roster.
 *
 * 1994: Steve Young MVP + Super Bowl XXIX, Joe Montana's farewell season in KC,
 * Jerry Rice, Emmitt Smith, Barry Sanders, Dan Marino, John Elway. The NFL's
 * first year with a salary cap ($34.6M). 28 teams (Carolina and Jacksonville
 * don't exist yet; Cleveland Browns still in CLE).
 *
 * Run from repo root:
 *   node scripts/build-montana-era-roster.mjs
 *
 * Outputs: public/rosters/FBGM_NFL_Roster_MontanaEra_1994.json
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join('public', 'rosters', 'FBGM_NFL_Roster_2026_PreDraft.json');
const OUT = path.join('public', 'rosters', 'FBGM_NFL_Roster_MontanaEra_1994.json');
const CSV = path.join('scripts', 'data', 'nflverse_roster_1994.csv');

const SOURCE_SEASON = 2026;
const TARGET_SEASON = 1994;
const YEAR_SHIFT = TARGET_SEASON - SOURCE_SEASON; // -32

// 1994 was the NFL's first year with a salary cap at $34.608M.
// 2026 file uses $353.85M.
const CAP_1994 = 34608;        // $34.608M in $K units
const CAP_2026 = 353850;       // $353.85M in $K units
const CAP_SCALE = CAP_1994 / CAP_2026; // ≈ 0.0978
const ERA_MIN_CONTRACT = 109;  // 1994 league minimum was $109K
const ERA_MAX_CONTRACT = 5500; // rough 1994 top-of-market

// nflverse 1994 team codes → FBGM 2026 franchise abbrevs.
// Key differences from modern: LA Raiders (RAI→LV franchise), LA Rams (RAM→LAR franchise),
// Houston Oilers (HOU→TEN franchise), no BAL/JAX/CAR.
const TEAM_CODE_TO_FBGM_ABBREV = {
  ARI: 'ARI', ATL: 'ATL', BUF: 'BUF', CHI: 'CHI',
  CIN: 'CIN', CLE: 'CLE', DAL: 'DAL', DEN: 'DEN',
  DET: 'DET', GB:  'GB',  HOU: 'TEN', IND: 'IND',
  KC:  'KC',  MIA: 'MIA', MIN: 'MIN', NE:  'NE',
  NO:  'NO',  NYG: 'NYG', NYJ: 'NYJ', PHI: 'PHI',
  PIT: 'PIT', RAI: 'LV',  RAM: 'LAR', SD:  'LAC',
  SEA: 'SEA', SF:  'SF',  TB:  'TB',  WAS: 'WSH',
};

// 1994 era-correct team identities. FBGM abbrevs → era display names.
// LAR stays unchanged (LA Rams were still in Los Angeles in 1994).
const TEAM_ERA_OVERRIDES = {
  TEN: { region: 'Houston',      name: 'Oilers',   abbrev: 'HOU' },
  LV:  { region: 'Los Angeles',  name: 'Raiders',  abbrev: 'RAI' },
  LAC: { region: 'San Diego',    name: 'Chargers', abbrev: 'SD'  },
  WSH: { region: 'Washington',   name: 'Redskins', abbrev: 'WAS' },
};

// Promote iconic 1994 starters to their correct depth-chart slots.
// nflverse CSV is alphabetically sorted so without overrides, starters
// with later-alphabet names can get buried behind lesser-known teammates.
const STARTER_OVERRIDES = {
  // SF 49ers — the dynasty (Steve Young MVP, SB XXIX champions)
  'SF/QB':  ['Steve Young', 'Elvis Grbac'],
  'SF/WR':  ['Jerry Rice', 'John Taylor', 'Nate Singleton'],
  'SF/RB':  ['Ricky Watters', 'William Floyd', 'Dexter Carter'],
  'SF/TE':  ['Brent Jones'],
  'SF/OL':  ['Harris Barton', 'Jesse Sapolu', 'Steve Wallace'],
  // Ken Norton (not "Jr." — full_name in CSV); Rickey Jackson played DE for SF in 1994 (DL bucket)
  'SF/LB':  ['Ken Norton', 'Gary Plummer'],
  'SF/CB':  ['Deion Sanders', 'Eric Davis'],
  'SF/S':   ['Tim McDonald', 'Merton Hanks'],
  'SF/DL':  ['Bryant Young', 'Dana Stubblefield', 'Dennis Brown'],

  // KC — Joe Montana's final season
  'KC/QB':  ['Joe Montana', 'Steve Bono'],
  'KC/RB':  ['Marcus Allen', 'Harvey Williams'],
  'KC/WR':  ['Willie Davis', 'Lake Dawson', 'J.J. Birden'],
  'KC/TE':  ['Tracy Greene'],
  'KC/LB':  ['Derrick Thomas', 'Tracy Armstrong'],
  'KC/CB':  ['Dale Carter'],

  // DAL — defending champs (went to SB XXIX, lost to SF)
  'DAL/QB': ['Troy Aikman'],
  'DAL/RB': ['Emmitt Smith', 'Tommie Agee'],
  'DAL/WR': ['Michael Irvin', 'Alvin Harper'],
  'DAL/TE': ['Jay Novacek'],
  'DAL/OL': ['Erik Williams', 'Nate Newton', 'Mark Stepnoski', 'Ray Donaldson'],
  'DAL/LB': ['Charles Haley', 'Darrin Smith', 'Robert Jones'],
  'DAL/CB': ['Larry Brown', 'Kevin Smith'],
  'DAL/S':  ['Darren Woodson', 'James Washington'],
  'DAL/DL': ['Russell Maryland', 'Tony Casillas', 'Tony Tolbert'],

  // MIA
  'MIA/QB': ['Dan Marino'],
  'MIA/WR': ['Irving Fryar', 'O.J. McDuffie', 'Mark Ingram'],
  'MIA/RB': ['Keith Byars', 'Bernie Parmalee'],
  'MIA/TE': ['Keith Jackson'],
  'MIA/LB': ['Bryan Cox', 'Robert Sowell', 'Dwight Hollier'],
  'MIA/DL': ['Marco Coleman', 'Tim Bowens'],

  // BUF — last of the 4-SB era (Jim Kelly final run)
  'BUF/QB': ['Jim Kelly'],
  'BUF/RB': ['Thurman Thomas', 'Carwell Gardner'],
  'BUF/WR': ['Andre Reed', 'Bill Brooks', 'Don Beebe'],
  'BUF/TE': ['Pete Metzelaars'],
  'BUF/DL': ['Bruce Smith', 'Phil Hansen'],
  'BUF/LB': ['Cornelius Bennett', 'Darryl Talley', 'Mark Maddox'],
  'BUF/CB': ['Nate Odomes', 'Jeff Burris'],

  // PIT
  'PIT/QB': ['Neil O\'Donnell'],
  'PIT/RB': ['Barry Foster', 'Bam Morris', 'John L. Williams'],
  'PIT/WR': ['Yancey Thigpen', 'Ernie Mills', 'Jeff Graham'],
  'PIT/TE': ['Eric Green'],
  'PIT/LB': ['Kevin Greene', 'Greg Lloyd', 'Levon Kirkland', 'Chad Brown'],
  'PIT/CB': ['Rod Woodson', 'Willie Williams'],
  'PIT/S':  ['Carnell Lake', 'Darren Perry'],
  'PIT/DL': ['Joel Steed', 'Gerald Williams', 'Ray Seals'],

  // CLE — Belichick's best team
  'CLE/QB': ['Vinny Testaverde'],
  'CLE/RB': ['Leroy Hoard', 'Eric Metcalf'],
  'CLE/WR': ['Keenan McCardell', 'Mark Carrier', 'Derrick Alexander'],
  'CLE/LB': ['Pepper Johnson', 'Carl Banks'],
  'CLE/DL': ['Michael Dean Perry', 'Rob Burnett'],
  'CLE/S':  ['Eric Turner'],

  // GB — Favre's first full season as starter
  'GB/QB':  ['Brett Favre'],
  'GB/RB':  ['Edgar Bennett', 'Dorsey Levens', 'Reggie Cobb'],
  'GB/WR':  ['Sterling Sharpe', 'Robert Brooks', 'Anthony Morgan'],
  'GB/TE':  ['Mark Chmura', 'Jackie Harris'],
  'GB/DL':  ['Reggie White', 'Sean Jones', 'Gabe Wilkins'],
  'GB/LB':  ['Wayne Simmons', 'Bryce Paup'],
  'GB/CB':  ['Terrell Buckley', 'Doug Evans'],

  // DEN — Elway still going
  'DEN/QB': ['John Elway'],
  'DEN/WR': ['Anthony Miller', 'Mike Pritchard', 'Vance Johnson'],
  'DEN/TE': ['Shannon Sharpe'],
  // Gaston Green retired; Darrien Gordon is on SD not DEN
  'DEN/RB': ['Reggie Rivers', 'Glyn Milburn'],
  'DEN/LB': ['Mike Croel', 'Allen Aldridge'],
  'DEN/CB': ['Ray Crockett'],
  'DEN/S':  ['Steve Atwater', 'Tyrone Braxton'],

  // MIN — Warren Moon's first year
  'MIN/QB': ['Warren Moon', 'Brad Johnson'],
  // Barry Word is CUT (on ARI) in 1994 CSV
  'MIN/RB': ['Robert Smith', 'Terry Allen'],
  'MIN/WR': ['Cris Carter', 'Jake Reed', 'Qadry Ismail'],
  'MIN/LB': ['Jack Del Rio', 'Carlos Jenkins'],
  'MIN/CB': ['Dewayne Washington'],

  // DET — Barry Sanders elite
  'DET/QB': ['Scott Mitchell', 'Dave Krieg'],
  'DET/RB': ['Barry Sanders', 'Derrick Moore'],
  'DET/WR': ['Herman Moore', 'Brett Perriman', 'Aubrey Matthews'],

  // IND
  'IND/QB': ['Jim Harbaugh'],
  'IND/RB': ['Marshall Faulk', 'Lamont Warren'],
  'IND/WR': ['Sean Dawkins', 'Floyd Turner'],

  // NYJ
  'NYJ/QB': ['Boomer Esiason', 'Bubby Brister'],
  'NYJ/RB': ['Johnny Johnson', 'Blair Thomas'],
  'NYJ/WR': ['Rob Moore', 'Johnny Mitchell'],

  // NYG — Dan Reeves first year; Phil Simms retired before season; LT retired after 1993
  'NYG/QB': ['Dave Brown'],
  'NYG/RB': ['Rodney Hampton', 'Dave Meggett'],
  'NYG/LB': ['Carlton Bailey'],
  'NYG/CB': ['Corey Mayfield'],

  // PHI — Rich Kotite last year; Reggie White on GB, Simmons on ARI
  'PHI/QB': ['Randall Cunningham', 'Rodney Peete'],
  'PHI/RB': ['Charlie Garner', 'Vaughn Hebron'],
  'PHI/WR': ['Fred Barnett', 'Victor Bailey', 'Calvin Williams'],
  'PHI/LB': ['William Thomas', 'Seth Joyner'],
  'PHI/DL': ['William Fuller', 'Andy Harmon'],

  // WSH (Redskins) — FBGM abbrev; was 'WAS' (silent failure)
  'WSH/QB': ['Heath Shuler', 'John Friesz'],
  'WSH/RB': ['Terry Allen'],
  'WSH/WR': ['Henry Ellard', 'Desmond Howard'],

  // NO; Pat Swilling on DET; Rickey Jackson on SF (as DL); Turnbull is OLB→LB bucket
  'NO/QB':  ['Jim Everett', 'Wade Wilson'],
  'NO/RB':  ['Mario Bates', 'Derek Brown'],
  'NO/WR':  ['Quinn Early', 'Michael Haynes', 'Torrance Small'],
  'NO/DL':  ['Wayne Martin'],
  'NO/LB':  ['Sam Mills', 'Renaldo Turnbull'],

  // ATL; Jeff George was 1994 starter; Eric Metcalf on CLE not ATL
  'ATL/QB': ['Jeff George', 'Bobby Hebert'],
  'ATL/RB': ['Craig Heyward', 'Harold Green'],
  'ATL/WR': ['Terance Mathis', 'Andre Rison'],
  'ATL/LB': ['Jessie Tuggle'],

  // LAR (LA Rams — still in LA in 1994); Henry Ellard on WAS; Everett on NO
  'LAR/QB': ['Chris Miller'],
  'LAR/RB': ['Jerome Bettis', 'Cleveland Gary'],
  'LAR/WR': ['Flipper Anderson'],
  'LAR/DL': ['Sean Gilbert', 'Michael Stewart'],

  // LAC (Chargers — went to SB XXIX) — FBGM abbrev; was 'SD' (silent failure)
  'LAC/QB': ['Stan Humphries', 'Gale Gilbert'],
  'LAC/RB': ['Natrone Means', 'Rodney Culver'],
  'LAC/WR': ['Tony Martin', 'Mark Seay', 'Shawn Jefferson'],
  'LAC/TE': ['Alfred Pupunu', 'Shannon Mitchell'],
  'LAC/LB': ['Junior Seau', 'Dennis Gibson'],
  'LAC/DL': ['John Parrella', 'Reuben Davis'],
  'LAC/CB': ['Darrien Gordon', 'Dwayne Harper'],

  // TEN (Oilers) — FBGM abbrev; was 'HOU' (silent failure); Lathon is DL/DE not LB
  'TEN/QB': ['Cody Carlson', 'Billy Joe Tolliver'],
  'TEN/RB': ['Gary Brown', 'Lorenzo White'],
  'TEN/WR': ['Haywood Jeffires', 'Webster Slaughter'],
  'TEN/LB': ['Al Smith'],
  'TEN/DL': ['Ray Childress', 'Lamar Lathon'],

  // LV (LA Raiders) — FBGM abbrev; was 'RAI' (silent failure); Raghib not 'Rocket' (full_name match)
  'LV/QB':  ['Jeff Hostetler', 'Vince Evans'],
  'LV/RB':  ['Napoleon McCallum', 'Harvey Williams'],
  'LV/WR':  ['Tim Brown', 'James Jett', 'Raghib Ismail'],
  'LV/LB':  ['Winston Moss', 'Mike Morton'],
  'LV/CB':  ['Terry McDaniel', 'Albert Lewis'],

  // ARI
  'ARI/QB': ['Steve Beuerlein', 'Jay Schroeder'],
  'ARI/RB': ['Larry Centers', 'Garrison Hearst'],
  'ARI/WR': ['Gary Clark', 'Ricky Proehl'],
  'ARI/LB': ['Wilber Marshall', 'Eric Hill'],

  // CIN; Eric Bieniemy on SD not CIN
  'CIN/QB': ['Jeff Blake', 'Dave Klingler'],
  'CIN/RB': ['Harold Green'],
  'CIN/WR': ['Carl Pickens', 'Darnay Scott'],
  'CIN/LB': ['James Francis', 'Rickey Dixon'],

  // CHI; Jim Harbaugh on IND; Bryan Cox on MIA; McMichael on GB
  'CHI/QB': ['Steve Walsh'],
  'CHI/RB': ['Raymont Harris', 'Lewis Tillman'],
  'CHI/WR': ['Jeff Graham', 'Tom Waddle', 'Curtis Conway'],
  'CHI/LB': ['Dante Jones'],
  'CHI/DL': ['Alonzo Spellman'],

  // TB
  'TB/QB':  ['Craig Erickson', 'Trent Dilfer'],
  'TB/RB':  ['Errict Rhett'],
  'TB/WR':  ['Lawrence Dawsey', 'Charles Wilson'],
  'TB/LB':  ['Broderick Thomas', 'Keith McCants'],

  // SEA; Winston Moss on RAI/LV not SEA
  'SEA/QB': ['Rick Mirer', 'John Friesz'],
  'SEA/RB': ['Chris Warren', 'John L. Williams'],
  'SEA/WR': ['Brian Blades', 'Kelvin Martin'],
  'SEA/LB': ['Terry Wooden'],

  // NE — Parcells last year; Bruce Armstrong is OT not DL
  'NE/QB':  ['Drew Bledsoe'],
  'NE/RB':  ['Marion Butts', 'Kevin Turner'],
  'NE/WR':  ['Michael Timpson', 'Vincent Brisby'],
  'NE/LB':  ['Chris Slade', 'Vincent Brown'],
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

// OVR overrides for real stars whose FBGM slot rated them too low (or a filler
// too high). Keyed like STARTER_OVERRIDES ('TEAM/BUCKET' -> { 'Name': ovr }). The
// year-shift makes the stars the TOP at their position, but their absolute OVRs
// stayed FBGM-mediocre (Rice/Young 71, Marino 59); these pin era-accurate values.
const OVR_OVERRIDES = {
  'KC/QB':  { 'Joe Montana': 92 },       // MVP-caliber farewell 1994 season
  'DAL/RB': { 'Emmitt Smith': 94 },      // rushing title, SB MVP
  'SF/WR':  { 'Jerry Rice': 98 },        // greatest receiver ever, peak
  'SF/QB':  { 'Steve Young': 96 },       // 1994 NFL MVP, 112.8 rating
  'SF/CB':  { 'Deion Sanders': 97 },     // best CB ever
  'DAL/LB': { 'Charles Haley': 90 },     // elite pass rusher
  'KC/LB':  { 'Derrick Thomas': 96 },    // all-time sack artist
  'GB/DL':  { 'Reggie White': 97 },      // Minister of Defense
  'BUF/DL': { 'Bruce Smith': 94 },       // dominant edge
  'PIT/CB': { 'Rod Woodson': 96 },       // best DB of the era
  'LAC/LB': { 'Junior Seau': 94 },       // elite LB
  'DET/RB': { 'Barry Sanders': 98 },     // greatest runner ever
  'MIA/QB': { 'Dan Marino': 96 },        // all-time passing legend
  'IND/RB': { 'Marshall Faulk': 88 },    // elite rookie
  'MIN/WR': { 'Cris Carter': 91 },       // led NFL in TD catches
  'PIT/QB': { "Neil O'Donnell": 76 },    // FBGM slot had him ~93 — too high
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

// Filter to active/reserve roster spots; drop cuts.
// 1994 uses PUP where 2007 uses DEV.
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
ga.salaryCap = CAP_1994;
ga.minContract = ERA_MIN_CONTRACT;
ga.maxContract = ERA_MAX_CONTRACT;
ga.minPayroll = Math.round(0.7 * CAP_1994);
delete ga.userTid;
delete ga.userTids;
data.gameAttributes = ga;
data.meta = { name: 'NFL Roster — Montana Era 1994 (v1, nflverse-driven)' };

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

// --- 3a. Per-player: shift years, scale contracts ---
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

// --- 3b. CSV-driven name/college/born/draft overlay ---
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

      // 1994 CSV has no football_name column (colIdx.football_name is undefined).
      // Prefer full_name to derive the preferred first name (e.g., "Joe" not "Joseph")
      // over first_name, which often stores the legal name.
      const fullName = csv[colIdx.full_name];
      const footballName = csv[colIdx.football_name]; // undefined for 1994
      let newFirst;
      if (footballName && footballName.trim() !== '') {
        newFirst = footballName.trim();
      } else if (fullName) {
        // Parse first token from full_name — the preferred/displayed name
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
      // 1994 CSV has no draft_number column — parseInt(undefined, 10) = NaN → isFinite false → skipped.
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

// --- 3c. Filler names for unmatched players ---
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

// --- 4. Per-team: era overrides + clear depth charts ---
// Remove franchises that don't exist in 1994 (28-team league):
// - JAX: expansion 1995
// - CAR: expansion 1995
// - BAL: Ravens expansion 1996 (CLE is still in Cleveland)
// - HOU: Texans expansion 2002 (the Oilers franchise maps to TEN)
const ERA_NONEXISTENT_ABBREVS_1994 = new Set(['JAX', 'CAR', 'BAL', 'HOU']);
data.teams = data.teams.filter((t) => {
  if (ERA_NONEXISTENT_ABBREVS_1994.has(t.abbrev)) return false;
  return true;
});
const existingTids = new Set(data.teams.map((t) => t.tid));
// Move players on removed teams to free agency (-1)
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

// --- 5. Draft picks: shift + drop pre-1994 ---
if (Array.isArray(data.draftPicks)) {
  for (const dp of data.draftPicks) {
    if (typeof dp.season === 'number') dp.season = shiftYear(dp.season);
  }
  data.draftPicks = data.draftPicks.filter((dp) => (dp.season ?? 0) >= TARGET_SEASON);
}

// --- 5b. Reframe the authentic-era roster into the engine's forced year ---
// Everything above builds a true-to-1994 roster (real ages, era ratings + era-cap
// contracts). But BS Football forces the starting year to the current calendar
// year, so a 1994-framed save has every contract expired on day 1 (players fall to
// FA, FBGM backfills fictional bodies) and every player ~32 years too old (age
// decay). Shift every year-bearing field up by (ENGINE_YEAR - TARGET_SEASON) so the
// roster lives in the engine's frame — 1994 ages/service map onto 2026 dates — while
// the era-authentic salary cap and contract *amounts* are left untouched.
const ENGINE_YEAR = 2026;
const ERA_TO_ENGINE = ENGINE_YEAR - TARGET_SEASON; // +32 for 1994
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
const KC_TID = data.teams.find((t) => t.abbrev === 'KC')?.tid;
const SF_TID = data.teams.find((t) => t.abbrev === 'SF')?.tid;
const DAL_TID = data.teams.find((t) => t.abbrev === 'DAL')?.tid;
const montana = data.players.find((p) => p.firstName === 'Joe' && p.lastName === 'Montana' && p.tid === KC_TID);
if (montana) console.log('  Joe Montana on KC: born', montana.born?.year, '(age', TARGET_SEASON - montana.born.year, ')');
else console.log('  [WARN] Joe Montana not found on KC');
const rice = data.players.find((p) => p.firstName === 'Jerry' && p.lastName === 'Rice' && p.tid === SF_TID);
if (rice) console.log('  Jerry Rice on SF: born', rice.born?.year);
else console.log('  [WARN] Jerry Rice not found on SF');
const emmitt = data.players.find((p) => p.firstName === 'Emmitt' && p.lastName === 'Smith' && p.tid === DAL_TID);
if (emmitt) console.log('  Emmitt Smith on DAL: born', emmitt.born?.year);
else console.log('  [WARN] Emmitt Smith not found on DAL');
