/**
 * Hardcoded 2026 NFL First Round Mock Draft
 *
 * Used when the game detects an imported NFL roster for the first draft.
 * AI teams follow these picks ~85% of the time; 15% chance of deviation (BPA).
 * The user's team always gets to choose freely.
 */

import type { Position } from '@/types';

export interface MockDraftPick {
  pick: number;
  teamAbbr: string;       // Team abbreviation (NFL-style from FBGM import)
  firstName: string;
  lastName: string;
  position: Position;      // Mapped to game's position system
  college: string;
  ovrBase: number;         // Base OVR — actual OVR will have ±3 variance
  potential: number;        // Potential rating
  blurb: string;            // One-line scouting blurb for mock draft display
}

/** Position mapping: real NFL positions → game positions */
function mapPos(nflPos: string): Position {
  const map: Record<string, Position> = {
    QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE',
    OT: 'OL', G: 'OL', C: 'OL', OL: 'OL',
    DE: 'DL', DT: 'DL', DL: 'DL',
    OLB: 'LB', ILB: 'LB', LB: 'LB', EDGE: 'DL',
    CB: 'CB', S: 'S', FS: 'S', SS: 'S',
    K: 'K', P: 'P',
  };
  return map[nflPos] ?? 'LB';
}

export const NFL_2026_FIRST_ROUND: MockDraftPick[] = [
  { pick: 1,  teamAbbr: 'LV',  firstName: 'Fernando', lastName: 'Mendoza',         position: 'QB', college: 'Indiana',       ovrBase: 80, potential: 90, blurb: 'Strong-armed gunslinger with elite pocket presence and deep ball accuracy.' },
  { pick: 2,  teamAbbr: 'NYJ', firstName: 'David',    lastName: 'Bailey',           position: mapPos('OLB'), college: 'Texas Tech',    ovrBase: 79, potential: 88, blurb: 'Explosive edge rusher with rare bend and closing speed off the edge.' },
  { pick: 3,  teamAbbr: 'ARI', firstName: 'Arvell',   lastName: 'Reese',            position: mapPos('OLB'), college: 'Ohio State',    ovrBase: 78, potential: 87, blurb: 'Versatile pass rusher who can line up anywhere on the defensive front.' },
  { pick: 4,  teamAbbr: 'TEN', firstName: 'Jeremiyah',lastName: 'Love',             position: 'RB', college: 'Notre Dame',    ovrBase: 78, potential: 86, blurb: 'Dynamic three-down back with breakaway speed and soft hands.' },
  { pick: 5,  teamAbbr: 'NYG', firstName: 'Caleb',    lastName: 'Downs',            position: 'S',  college: 'Ohio State',    ovrBase: 77, potential: 88, blurb: 'Rangy safety with ball-hawk instincts and elite football IQ.' },
  { pick: 6,  teamAbbr: 'CLE', firstName: 'Monroe',   lastName: 'Freeling',         position: 'OL', college: 'Georgia',       ovrBase: 76, potential: 85, blurb: 'Massive tackle with light feet and nasty finishing ability in the run game.' },
  { pick: 7,  teamAbbr: 'WSH', firstName: 'Sonny',    lastName: 'Styles',           position: 'LB', college: 'Ohio State',    ovrBase: 75, potential: 86, blurb: 'Positionless defender who can play safety, linebacker, or nickel with equal effectiveness.' },
  { pick: 8,  teamAbbr: 'NO',  firstName: 'Carnell',  lastName: 'Tate',             position: 'WR', college: 'Ohio State',    ovrBase: 75, potential: 85, blurb: 'Polished route runner with contested-catch ability and YAC talent.' },
  { pick: 9,  teamAbbr: 'KC',  firstName: 'Rueben',   lastName: 'Bain Jr.',         position: 'DL', college: 'Miami',         ovrBase: 74, potential: 87, blurb: 'Relentless edge defender with a motor that never stops and elite hand usage.' },
  { pick: 10, teamAbbr: 'CIN', firstName: 'Mansoor',  lastName: 'Delane',           position: 'CB', college: 'LSU',           ovrBase: 74, potential: 84, blurb: 'Physical corner who excels in man coverage with lockdown potential.' },
  { pick: 11, teamAbbr: 'MIA', firstName: 'Jordyn',   lastName: 'Tyson',            position: 'WR', college: 'Arizona State', ovrBase: 73, potential: 84, blurb: 'Explosive deep threat with elite separation ability and big-play potential.' },
  { pick: 12, teamAbbr: 'DAL', firstName: 'Jermod',   lastName: 'McCoy',            position: 'CB', college: 'Tennessee',     ovrBase: 73, potential: 83, blurb: 'Long, physical corner with press technique and ball skills to match.' },
  { pick: 13, teamAbbr: 'LAR', firstName: 'Francis',  lastName: 'Mauigoa',          position: 'OL', college: 'Miami',         ovrBase: 72, potential: 84, blurb: 'Athletic tackle prospect with guard versatility and powerful hands.' },
  { pick: 14, teamAbbr: 'BAL', firstName: 'Spencer',  lastName: 'Fano',             position: 'OL', college: 'Utah',          ovrBase: 72, potential: 83, blurb: 'Technically sound lineman who can play any position across the front.' },
  { pick: 15, teamAbbr: 'TB',  firstName: 'Kenyon',   lastName: 'Sadiq',            position: 'TE', college: 'Oregon',        ovrBase: 71, potential: 84, blurb: 'Mismatch tight end with receiver-like route running and red zone dominance.' },
  { pick: 16, teamAbbr: 'NYJ', firstName: 'Ty',       lastName: 'Simpson',          position: 'QB', college: 'Alabama',       ovrBase: 71, potential: 85, blurb: 'Dual-threat quarterback with a cannon arm and exceptional athleticism.' },
  { pick: 17, teamAbbr: 'DET', firstName: 'Kadyn',    lastName: 'Proctor',          position: 'OL', college: 'Alabama',       ovrBase: 70, potential: 82, blurb: 'Mammoth left tackle with rare combination of size, strength, and footwork.' },
  { pick: 18, teamAbbr: 'MIN', firstName: 'Dillon',   lastName: 'Thieneman',        position: 'S',  college: 'Oregon',        ovrBase: 70, potential: 83, blurb: 'Instinctive safety who reads quarterbacks and makes plays on the ball.' },
  { pick: 19, teamAbbr: 'CAR', firstName: 'Emmanuel', lastName: 'McNeil-Warren',    position: 'S',  college: 'Toledo',        ovrBase: 69, potential: 82, blurb: 'Hard-hitting safety with range and tackling ability from the deep third.' },
  { pick: 20, teamAbbr: 'DAL', firstName: 'CJ',       lastName: 'Allen',            position: 'LB', college: 'Georgia',       ovrBase: 69, potential: 82, blurb: 'Sideline-to-sideline linebacker with instincts and tackle production.' },
  { pick: 21, teamAbbr: 'PIT', firstName: 'Olaivavega', lastName: 'Ioane',          position: 'OL', college: 'Penn State',    ovrBase: 68, potential: 81, blurb: 'Powerful interior lineman with elite strength at the point of attack.' },
  { pick: 22, teamAbbr: 'LAC', firstName: 'Peter',    lastName: 'Woods',            position: 'DL', college: 'Clemson',       ovrBase: 68, potential: 83, blurb: 'Disruptive interior pass rusher with quick first step and power to collapse the pocket.' },
  { pick: 23, teamAbbr: 'PHI', firstName: 'Max',      lastName: 'Iheanachor',       position: 'OL', college: 'Arizona State', ovrBase: 68, potential: 80, blurb: 'Versatile offensive tackle with nimble feet and strong anchor in pass protection.' },
  { pick: 24, teamAbbr: 'CLE', firstName: 'Makai',    lastName: 'Lemon',            position: 'WR', college: 'USC',           ovrBase: 67, potential: 82, blurb: 'Electric playmaker with elite YAC ability and dynamic route running.' },
  { pick: 25, teamAbbr: 'CHI', firstName: 'Zion',     lastName: 'Young',            position: 'DL', college: 'Missouri',      ovrBase: 67, potential: 81, blurb: 'High-motor edge rusher with an arsenal of pass-rush moves.' },
  { pick: 26, teamAbbr: 'BUF', firstName: 'Avieon',   lastName: 'Terrell',          position: 'CB', college: 'Clemson',       ovrBase: 66, potential: 81, blurb: 'Smooth corner with elite bloodlines and natural coverage instincts.' },
  { pick: 27, teamAbbr: 'SF',  firstName: 'Blake',    lastName: 'Miller',           position: 'OL', college: 'Clemson',       ovrBase: 66, potential: 80, blurb: 'Rock-solid pass protector with experience at both tackle spots.' },
  { pick: 28, teamAbbr: 'HOU', firstName: 'Christen', lastName: 'Miller',           position: 'DL', college: 'Georgia',       ovrBase: 65, potential: 82, blurb: 'Explosive interior defender with rare athleticism for his size.' },
  { pick: 29, teamAbbr: 'KC',  firstName: 'Brandon',  lastName: 'Cisse',            position: 'CB', college: 'South Carolina',ovrBase: 65, potential: 80, blurb: 'Fluid athlete with length, speed, and ball skills to develop into a shutdown corner.' },
  { pick: 30, teamAbbr: 'MIA', firstName: 'Keldric',  lastName: 'Faulk',            position: 'DL', college: 'Auburn',        ovrBase: 65, potential: 81, blurb: 'Powerful edge setter with pass-rush upside and run-stopping ability.' },
  { pick: 31, teamAbbr: 'NE',  firstName: 'KC',       lastName: 'Concepcion',       position: 'WR', college: 'Texas A&M',     ovrBase: 64, potential: 80, blurb: 'Reliable target with strong hands, precise routes, and red zone production.' },
  { pick: 32, teamAbbr: 'SEA', firstName: 'Colton',   lastName: 'Hood',             position: 'CB', college: 'Tennessee',     ovrBase: 64, potential: 79, blurb: 'Physical press corner with recovery speed and competitive toughness.' },
];

/** Check if the current game is using the NFL 2026 imported roster (first season).
 *  Detects by looking for real NFL player names in the roster. */
export function isNfl2026Roster(teams: { abbreviation: string }[], players: { firstName: string; lastName: string; teamId: string | null }[]): boolean {
  // Check for a handful of distinctive real NFL players
  const markers = [
    { first: 'Patrick', last: 'Mahomes' },
    { first: 'Josh', last: 'Allen' },
    { first: 'Lamar', last: 'Jackson' },
  ];
  let found = 0;
  for (const m of markers) {
    if (players.some(p => p.firstName === m.first && p.lastName === m.last && p.teamId !== null)) found++;
  }
  return found >= 2;
}
