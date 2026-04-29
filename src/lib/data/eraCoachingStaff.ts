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
  if (season !== 2007) return coaches;
  const entry = ERA_HEAD_COACHES_2007[teamAbbrev];
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
    bio: `${entry.name} enters the ${season} season as the head coach. ${entry.notes ? entry.notes + '. ' : ''}Real-world 2007 NFL head coach (era roster).`,
    ratingHistory: [{ season: 0, ovr: ovr ?? 60 }],
  } as T;

  return coaches;
}
