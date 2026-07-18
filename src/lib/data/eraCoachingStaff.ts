import type { OffensiveScheme, DefensiveScheme } from '@/types';

/**
 * Era-correct head coaches for historical roster files (Brady Era 2007, etc.).
 *
 * Wired into newLeague() in store.ts: after generateCoachingStaff() rolls a
 * fresh random staff for each team, applyEraHeadCoach() overlays the real
 * HC name / age / years-with-team if the team+season matches an entry here.
 *
 * Coordinators (OC/DC) and position coaches stay auto-generated for v1 — we
 * only have HC data from camare's 4/29 20:44 #feature-requests post. v2
 * adds OC/DC; position coaches probably stay autogen forever.
 *
 * Source: its.camare 4/29 20:44 UTC, AI-assisted from public 2007 NFL data.
 * Verified against the era-correct team abbreviations from
 * scripts/build-brady-era-roster.mjs (STL/SD/OAK/WAS for the 2026→2007
 * renames). Atlanta has a mid-season replacement entry — for v1 we only
 * stamp Petrino as the Week-1 HC; Emmitt Thomas as interim happens
 * organically when AI fires Petrino in season.
 */

export interface EraHeadCoachEntry {
  name: string;
  /** Year of birth — used to compute age-at-season. Best-effort from public
   *  records; OK if approximate by ±1 year. */
  birthYear: number;
  /** Years already with this franchise as of season start. */
  yearsWithTeam?: number;
  /** Career wins/losses entering the season — used so the HC card shows a
   *  realistic record instead of the random walk generateCoach() rolls. */
  careerWins?: number;
  careerLosses?: number;
  /** Optional default scheme — useful for known scheme-defining HCs.
   *  Falls back to the auto-generated coach's scheme when absent. */
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  /** Optional rating override (40-89 scale matching generateCoach). When
   *  omitted, the auto-generated rating sticks. */
  ovr?: number;
  notes?: string;
}

/**
 * 1994 NFL head coaches (Montana Era).
 * Key era renames from build script: TEN→HOU, LV→RAI, LAC→SD, WSH→WAS.
 * 1994: first year of the salary cap. 28 teams (no JAX/CAR/BAL expansion yet).
 */
export const ERA_HEAD_COACHES_1994: Record<string, EraHeadCoachEntry> = {
  // AFC East
  NE:  { name: 'Bill Parcells',    birthYear: 1941, yearsWithTeam: 5,  careerWins: 111, careerLosses: 84,  ovr: 80 },
  NYJ: { name: 'Pete Carroll',     birthYear: 1951, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 62 },
  BUF: { name: 'Marv Levy',        birthYear: 1925, yearsWithTeam: 8,  careerWins: 112, careerLosses: 70,  ovr: 82, notes: '4th consecutive SB appearance team (lost all four)' },
  MIA: { name: 'Don Shula',        birthYear: 1930, yearsWithTeam: 24, careerWins: 328, careerLosses: 156, ovr: 88, notes: 'All-time NFL wins record holder at retirement' },
  // AFC North (formerly Central)
  PIT: { name: 'Bill Cowher',      birthYear: 1957, yearsWithTeam: 2,  careerWins: 22,  careerLosses: 10,  ovr: 76, defensiveScheme: 'blitz_34' },
  CLE: { name: 'Bill Belichick',   birthYear: 1952, yearsWithTeam: 4,  careerWins: 36,  careerLosses: 44,  ovr: 70 },
  CIN: { name: 'Dave Shula',       birthYear: 1959, yearsWithTeam: 3,  careerWins: 17,  careerLosses: 30,  ovr: 48, notes: "Son of Don Shula; struggled in Cincinnati" },
  // AFC South (formerly Central)
  HOU: { name: 'Jeff Fisher',      birthYear: 1958, yearsWithTeam: 0,  careerWins: 1,   careerLosses: 9,   ovr: 68, notes: 'Took over mid-season from Jack Pardee' },
  IND: { name: 'Ted Marchibroda',  birthYear: 1931, yearsWithTeam: 0,  careerWins: 33,  careerLosses: 37,  ovr: 58 },
  // AFC West
  SD:  { name: 'Bobby Ross',       birthYear: 1936, yearsWithTeam: 2,  careerWins: 16,  careerLosses: 20,  ovr: 72, notes: 'Led SD to Super Bowl XXIX, lost to SF 49-26' },
  RAI: { name: 'Art Shell',        birthYear: 1946, yearsWithTeam: 5,  careerWins: 56,  careerLosses: 34,  ovr: 66 },
  DEN: { name: 'Wade Phillips',    birthYear: 1947, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 60, defensiveScheme: 'blitz_34' },
  KC:  { name: 'Marty Schottenheimer', birthYear: 1943, yearsWithTeam: 4, careerWins: 96, careerLosses: 79, ovr: 78 },
  // NFC East
  DAL: { name: 'Barry Switzer',    birthYear: 1937, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 72, notes: 'Replaced Jimmy Johnson; won SB XXIX with inherited roster' },
  NYG: { name: 'Dan Reeves',       birthYear: 1944, yearsWithTeam: 0,  careerWins: 138, careerLosses: 125, ovr: 65 },
  WAS: { name: 'Norv Turner',      birthYear: 1952, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 52, offensiveScheme: 'west_coast' },
  PHI: { name: 'Rich Kotite',      birthYear: 1942, yearsWithTeam: 3,  careerWins: 28,  careerLosses: 20,  ovr: 55 },
  // NFC North (formerly Central)
  GB:  { name: 'Mike Holmgren',    birthYear: 1948, yearsWithTeam: 2,  careerWins: 17,  careerLosses: 14,  ovr: 72, offensiveScheme: 'west_coast' },
  MIN: { name: 'Dennis Green',     birthYear: 1949, yearsWithTeam: 2,  careerWins: 20,  careerLosses: 12,  ovr: 68 },
  CHI: { name: 'Dave Wannstedt',   birthYear: 1952, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 60 },
  DET: { name: 'Wayne Fontes',     birthYear: 1940, yearsWithTeam: 6,  careerWins: 46,  careerLosses: 50,  ovr: 56 },
  // NFC South (formerly division)
  TB:  { name: 'Sam Wyche',        birthYear: 1945, yearsWithTeam: 4,  careerWins: 23,  careerLosses: 41,  ovr: 52 },
  NO:  { name: 'Jim Mora',         birthYear: 1935, yearsWithTeam: 8,  careerWins: 85,  careerLosses: 71,  ovr: 68 },
  ATL: { name: 'June Jones',       birthYear: 1953, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 50 },
  // NFC West
  SF:  { name: 'George Seifert',   birthYear: 1940, yearsWithTeam: 5,  careerWins: 75,  careerLosses: 25,  ovr: 88, notes: 'Won SB XXIX, franchise best 13-3; Steve Young MVP' },
  LAR: { name: 'Chuck Knox',       birthYear: 1932, yearsWithTeam: 7,  careerWins: 135, careerLosses: 117, ovr: 65 },
  ARI: { name: 'Buddy Ryan',       birthYear: 1931, yearsWithTeam: 2,  careerWins: 12,  careerLosses: 20,  ovr: 60, defensiveScheme: 'blitz_34' },
  SEA: { name: 'Tom Flores',       birthYear: 1937, yearsWithTeam: 3,  careerWins: 15,  careerLosses: 33,  ovr: 50, notes: 'Last year as HC; Dennis Erickson replaced him in 1995' },
};

/**
 * 1999 NFL head coaches (Greatest Show on Turf era).
 * Key era renames from build script: LAR→STL, LV→OAK, LAC→SD, WSH→WAS.
 * 1999: 31 teams (Cleveland expansion). STL won SB XXXIV.
 */
export const ERA_HEAD_COACHES_1999: Record<string, EraHeadCoachEntry> = {
  // AFC East
  NE:  { name: 'Pete Carroll',     birthYear: 1951, yearsWithTeam: 2,  careerWins: 16,  careerLosses: 16,  ovr: 58, notes: 'Final year; fired after 8-8; Bill Belichick takes over in 2000' },
  NYJ: { name: 'Bill Parcells',    birthYear: 1941, yearsWithTeam: 2,  careerWins: 19,  careerLosses: 13,  ovr: 76 },
  BUF: { name: 'Wade Phillips',    birthYear: 1947, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 66, defensiveScheme: 'blitz_34' },
  MIA: { name: 'Jimmy Johnson',    birthYear: 1943, yearsWithTeam: 3,  careerWins: 24,  careerLosses: 24,  ovr: 75, notes: "Dan Marino's final season" },
  // AFC North
  PIT: { name: 'Bill Cowher',      birthYear: 1957, yearsWithTeam: 7,  careerWins: 72,  careerLosses: 42,  ovr: 78, defensiveScheme: 'blitz_34' },
  BAL: { name: 'Brian Billick',    birthYear: 1954, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 62, notes: 'First year; wins SB XXXV the following season' },
  CLE: { name: 'Chris Palmer',     birthYear: 1949, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 45, notes: 'Expansion team; went 2-14' },
  CIN: { name: 'Dick LeBeau',      birthYear: 1937, yearsWithTeam: 0,  careerWins: 2,   careerLosses: 6,   ovr: 58, defensiveScheme: 'blitz_34', notes: 'Interim after Coslet fired 4 games in' },
  // AFC South
  IND: { name: 'Jim Mora',         birthYear: 1935, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 68, notes: 'Peyton Manning year 2; Edgerrin James rookie 1,553 yards' },
  JAX: { name: 'Tom Coughlin',     birthYear: 1946, yearsWithTeam: 4,  careerWins: 47,  careerLosses: 17,  ovr: 76, notes: 'Went 14-2; lost to TEN on Music City Miracle lateral' },
  TEN: { name: 'Jeff Fisher',      birthYear: 1958, yearsWithTeam: 5,  careerWins: 52,  careerLosses: 30,  ovr: 78, notes: 'Went 13-3; reached SB XXXIV, lost to STL by one yard' },
  // AFC West
  OAK: { name: 'Jon Gruden',       birthYear: 1963, yearsWithTeam: 2,  careerWins: 18,  careerLosses: 14,  ovr: 72, offensiveScheme: 'west_coast' },
  SD:  { name: 'Mike Riley',       birthYear: 1953, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 52 },
  DEN: { name: 'Mike Shanahan',    birthYear: 1952, yearsWithTeam: 3,  careerWins: 35,  careerLosses: 13,  ovr: 76, offensiveScheme: 'west_coast', notes: 'Defending two-time champs without Elway; went 6-10' },
  KC:  { name: 'Gunther Cunningham', birthYear: 1946, yearsWithTeam: 0, careerWins: 0, careerLosses: 0,   ovr: 58, defensiveScheme: 'blitz_34' },
  // NFC East
  DAL: { name: 'Chan Gailey',      birthYear: 1952, yearsWithTeam: 1,  careerWins: 8,   careerLosses: 8,   ovr: 55, notes: 'Aikman and Emmitt still there; second and final year' },
  NYG: { name: 'Jim Fassel',       birthYear: 1949, yearsWithTeam: 2,  careerWins: 14,  careerLosses: 18,  ovr: 56 },
  WAS: { name: 'Norv Turner',      birthYear: 1952, yearsWithTeam: 5,  careerWins: 49,  careerLosses: 31,  ovr: 60, offensiveScheme: 'west_coast' },
  PHI: { name: 'Andy Reid',        birthYear: 1958, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 65, offensiveScheme: 'west_coast', notes: 'First year; started Donovan McNabb vs Doug Pederson' },
  // NFC North
  GB:  { name: 'Ray Rhodes',       birthYear: 1950, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 55, notes: 'Fired after 8-8; Mike Sherman takes over in 2000' },
  MIN: { name: 'Dennis Green',     birthYear: 1949, yearsWithTeam: 7,  careerWins: 97,  careerLosses: 63,  ovr: 68 },
  CHI: { name: 'Dick Jauron',      birthYear: 1950, yearsWithTeam: 0,  careerWins: 0,   careerLosses: 0,   ovr: 55 },
  DET: { name: 'Bobby Ross',       birthYear: 1936, yearsWithTeam: 2,  careerWins: 16,  careerLosses: 16,  ovr: 62 },
  // NFC South
  TB:  { name: 'Tony Dungy',       birthYear: 1955, yearsWithTeam: 3,  careerWins: 22,  careerLosses: 26,  ovr: 76, defensiveScheme: 'tampa_2', notes: 'Best defense in NFL; went 11-5, lost 2nd round to STL' },
  NO:  { name: 'Mike Ditka',       birthYear: 1939, yearsWithTeam: 2,  careerWins: 15,  careerLosses: 17,  ovr: 52, notes: 'Drafted Ricky Williams with all 5 picks; went 3-13' },
  CAR: { name: 'George Seifert',   birthYear: 1940, yearsWithTeam: 1,  careerWins: 8,   careerLosses: 8,   ovr: 68 },
  ATL: { name: 'Dan Reeves',       birthYear: 1944, yearsWithTeam: 3,  careerWins: 21,  careerLosses: 27,  ovr: 60, notes: 'Year after SB XXXIII loss to DEN; went 5-11' },
  // NFC West
  STL: { name: 'Dick Vermeil',     birthYear: 1936, yearsWithTeam: 2,  careerWins: 15,  careerLosses: 17,  ovr: 80, offensiveScheme: 'spread', notes: 'Greatest Show on Turf; Warner + Faulk; won SB XXXIV' },
  SF:  { name: 'Steve Mariucci',   birthYear: 1955, yearsWithTeam: 2,  careerWins: 24,  careerLosses: 8,   ovr: 68, notes: 'Steve Young season-ending concussion; Jeff Garcia took over' },
  ARI: { name: 'Vince Tobin',      birthYear: 1943, yearsWithTeam: 3,  careerWins: 19,  careerLosses: 29,  ovr: 50 },
  SEA: { name: 'Dennis Erickson',  birthYear: 1947, yearsWithTeam: 4,  careerWins: 31,  careerLosses: 33,  ovr: 58 },
};

/**
 * 2007 NFL head coaches keyed by the era-correct team abbreviation that
 * comes out of scripts/build-brady-era-roster.mjs. Note the era-renamed
 * franchises (LAR→STL, LAC→SD, LV→OAK, WSH→WAS) — those map MUST match
 * what the era roster JSON ships, otherwise the lookup misses.
 */
export const ERA_HEAD_COACHES_2007: Record<string, EraHeadCoachEntry> = {
  // AFC East
  NE:  { name: 'Bill Belichick',  birthYear: 1952, yearsWithTeam: 7, careerWins: 117, careerLosses: 73, ovr: 88, defensiveScheme: 'blitz_34' },
  NYJ: { name: 'Eric Mangini',    birthYear: 1971, yearsWithTeam: 1, careerWins: 10,  careerLosses: 6,  ovr: 60 },
  BUF: { name: 'Dick Jauron',     birthYear: 1950, yearsWithTeam: 1, careerWins: 7,   careerLosses: 9,  ovr: 55 },
  MIA: { name: 'Cam Cameron',     birthYear: 1961, yearsWithTeam: 0, careerWins: 0,   careerLosses: 0,  ovr: 50 },
  // AFC North
  PIT: { name: 'Mike Tomlin',     birthYear: 1972, yearsWithTeam: 0, careerWins: 0,   careerLosses: 0,  ovr: 70, defensiveScheme: 'blitz_34' },
  BAL: { name: 'Brian Billick',   birthYear: 1954, yearsWithTeam: 8, careerWins: 80,  careerLosses: 64, ovr: 68 },
  CLE: { name: 'Romeo Crennel',   birthYear: 1947, yearsWithTeam: 2, careerWins: 10,  careerLosses: 22, ovr: 58 },
  CIN: { name: 'Marvin Lewis',    birthYear: 1958, yearsWithTeam: 4, careerWins: 32,  careerLosses: 31, ovr: 65 },
  // AFC South
  IND: { name: 'Tony Dungy',      birthYear: 1955, yearsWithTeam: 5, careerWins: 100, careerLosses: 60, ovr: 84, defensiveScheme: 'tampa_2' },
  JAX: { name: 'Jack Del Rio',    birthYear: 1963, yearsWithTeam: 4, careerWins: 30,  careerLosses: 34, ovr: 64 },
  TEN: { name: 'Jeff Fisher',     birthYear: 1958, yearsWithTeam: 13, careerWins: 110, careerLosses: 95, ovr: 72 },
  HOU: { name: 'Gary Kubiak',     birthYear: 1961, yearsWithTeam: 1, careerWins: 6,   careerLosses: 10, ovr: 60 },
  // AFC West
  SD:  { name: 'Norv Turner',     birthYear: 1952, yearsWithTeam: 0, careerWins: 58,  careerLosses: 82, ovr: 65 },
  DEN: { name: 'Mike Shanahan',   birthYear: 1952, yearsWithTeam: 12, careerWins: 124, careerLosses: 80, ovr: 75 },
  KC:  { name: 'Herm Edwards',    birthYear: 1954, yearsWithTeam: 1, careerWins: 39,  careerLosses: 41, ovr: 58 },
  OAK: { name: 'Lane Kiffin',     birthYear: 1975, yearsWithTeam: 0, careerWins: 0,   careerLosses: 0,  ovr: 52, notes: 'Youngest HC in modern era at hire' },
  // NFC East
  DAL: { name: 'Wade Phillips',   birthYear: 1947, yearsWithTeam: 0, careerWins: 48,  careerLosses: 37, ovr: 70, defensiveScheme: 'blitz_34' },
  NYG: { name: 'Tom Coughlin',    birthYear: 1946, yearsWithTeam: 3, careerWins: 24,  careerLosses: 24, ovr: 72 },
  WAS: { name: 'Joe Gibbs',       birthYear: 1940, yearsWithTeam: 3, careerWins: 154, careerLosses: 94, ovr: 78, notes: 'HOF; second stint with WAS' },
  PHI: { name: 'Andy Reid',       birthYear: 1958, yearsWithTeam: 8, careerWins: 86,  careerLosses: 50, ovr: 80, offensiveScheme: 'west_coast' },
  // NFC North
  GB:  { name: 'Mike McCarthy',   birthYear: 1963, yearsWithTeam: 1, careerWins: 8,   careerLosses: 8,  ovr: 65, offensiveScheme: 'west_coast' },
  MIN: { name: 'Brad Childress',  birthYear: 1956, yearsWithTeam: 1, careerWins: 6,   careerLosses: 10, ovr: 55 },
  CHI: { name: 'Lovie Smith',     birthYear: 1958, yearsWithTeam: 3, careerWins: 28,  careerLosses: 22, ovr: 68, defensiveScheme: 'tampa_2' },
  DET: { name: 'Rod Marinelli',   birthYear: 1949, yearsWithTeam: 1, careerWins: 3,   careerLosses: 13, ovr: 50 },
  // NFC South
  TB:  { name: 'Jon Gruden',      birthYear: 1963, yearsWithTeam: 5, careerWins: 47,  careerLosses: 49, ovr: 70, offensiveScheme: 'west_coast' },
  NO:  { name: 'Sean Payton',     birthYear: 1963, yearsWithTeam: 1, careerWins: 10,  careerLosses: 6,  ovr: 76, offensiveScheme: 'spread' },
  CAR: { name: 'John Fox',        birthYear: 1955, yearsWithTeam: 5, careerWins: 39,  careerLosses: 41, ovr: 65 },
  ATL: { name: 'Bobby Petrino',   birthYear: 1961, yearsWithTeam: 0, careerWins: 0,   careerLosses: 0,  ovr: 48, notes: 'Resigns mid-season; Emmitt Thomas takes over as interim — handled organically by AI firings' },
  // NFC West
  SEA: { name: 'Mike Holmgren',   birthYear: 1948, yearsWithTeam: 9, careerWins: 130, careerLosses: 86, ovr: 76, offensiveScheme: 'west_coast' },
  STL: { name: 'Scott Linehan',   birthYear: 1963, yearsWithTeam: 1, careerWins: 8,   careerLosses: 8,  ovr: 55 },
  ARI: { name: 'Ken Whisenhunt',  birthYear: 1962, yearsWithTeam: 0, careerWins: 0,   careerLosses: 0,  ovr: 62 },
  SF:  { name: 'Mike Nolan',      birthYear: 1959, yearsWithTeam: 2, careerWins: 11,  careerLosses: 21, ovr: 56 },
};

/**
 * If the team+season matches an era entry, overlay the IRL HC name + bio
 * fields onto the auto-generated HC slot. Mutates the passed coaches array
 * in place (replacing whichever element has role === 'HC') and returns it.
 *
 * Coordinators and position coaches are unaffected. v2 will add OC/DC
 * once the data is sourced.
 */
const ERA_COACHES_BY_SEASON: Record<number, Record<string, EraHeadCoachEntry>> = {
  1994: ERA_HEAD_COACHES_1994,
  1999: ERA_HEAD_COACHES_1999,
  2007: ERA_HEAD_COACHES_2007,
};

export function applyEraHeadCoach<T extends {
  role: string;
  firstName: string;
  lastName: string;
  age: number;
  yearsWithTeam: number;
  careerWins: number;
  careerLosses: number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  ovr: number;
  bio?: string;
  ratingHistory?: { season: number; ovr: number }[];
}>(
  coaches: T[],
  teamAbbrev: string,
  season: number,
): T[] {
  const seasonMap = ERA_COACHES_BY_SEASON[season];
  if (!seasonMap) return coaches;
  const entry = seasonMap[teamAbbrev];
  if (!entry) return coaches;
  const hcIdx = coaches.findIndex(c => c.role === 'HC');
  if (hcIdx === -1) return coaches;

  const parts = entry.name.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  const age = season - entry.birthYear;
  const ovr = entry.ovr ?? coaches[hcIdx].ovr;
  const careerWins = entry.careerWins ?? coaches[hcIdx].careerWins;
  const careerLosses = entry.careerLosses ?? coaches[hcIdx].careerLosses;

  coaches[hcIdx] = {
    ...coaches[hcIdx],
    firstName,
    lastName,
    age,
    yearsWithTeam: entry.yearsWithTeam ?? coaches[hcIdx].yearsWithTeam,
    careerWins,
    careerLosses,
    offensiveScheme: entry.offensiveScheme ?? coaches[hcIdx].offensiveScheme,
    defensiveScheme: entry.defensiveScheme ?? coaches[hcIdx].defensiveScheme,
    ovr,
    // Era-tagged bio so the player can see this is a real coach, not autogen.
    bio: `${entry.name} enters the ${season} season as the head coach. ${entry.notes ? entry.notes + '. ' : ''}Real-world ${season} NFL head coach (era roster).`,
    ratingHistory: [{ season: 0, ovr: ovr ?? 60 }],
  } as T;

  return coaches;
}
