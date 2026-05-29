/**
 * NBA-style parody team templates for BS Hoops.
 *
 * 30 teams across Eastern + Western conferences, 6 divisions of 5. Names are
 * deliberately parody-flavored to avoid the actual NBA marks (matching the
 * football app's convention with its NFL-equivalents).
 *
 * Care taken to avoid duplicating names from the football app's parody set
 * (Blizzard, Riptide, Outlaws, Bandits, etc.) so a future cross-sport
 * directory doesn't show collisions.
 */

export type BasketballConference = 'Eastern' | 'Western';
export type BasketballDivision =
  | 'Atlantic' | 'Central' | 'Southeast'
  | 'Northwest' | 'Pacific' | 'Southwest';

export interface BasketballTeamTemplate {
  city: string;
  name: string;
  abbreviation: string;
  conference: BasketballConference;
  division: BasketballDivision;
  primaryColor: string;
  secondaryColor: string;
}

export const HOOPS_LEAGUE_TEAMS: BasketballTeamTemplate[] = [
  // ===== Eastern — Atlantic =====
  { city: 'Boston',       name: 'Greens',    abbreviation: 'BOS', conference: 'Eastern', division: 'Atlantic',  primaryColor: '#1A6E3A', secondaryColor: '#F5F0DC' },
  { city: 'Brooklyn',     name: 'Bridge',    abbreviation: 'BKN', conference: 'Eastern', division: 'Atlantic',  primaryColor: '#1A1A1A', secondaryColor: '#E8E8E8' },
  { city: 'New York',     name: 'Empire',    abbreviation: 'NYE', conference: 'Eastern', division: 'Atlantic',  primaryColor: '#2356A8', secondaryColor: '#E87040' },
  { city: 'Philadelphia', name: 'Bells',     abbreviation: 'PHL', conference: 'Eastern', division: 'Atlantic',  primaryColor: '#1A4D8F', secondaryColor: '#CC2200' },
  { city: 'Toronto',      name: 'Skyline',   abbreviation: 'TOR', conference: 'Eastern', division: 'Atlantic',  primaryColor: '#A0152C', secondaryColor: '#1A1A1A' },

  // ===== Eastern — Central =====
  { city: 'Chicago',      name: 'Wind',      abbreviation: 'CHW', conference: 'Eastern', division: 'Central',   primaryColor: '#1A1A2E', secondaryColor: '#E8E8E8' },
  { city: 'Cleveland',    name: 'Rust',      abbreviation: 'CLR', conference: 'Eastern', division: 'Central',   primaryColor: '#6B3520', secondaryColor: '#D4A82E' },
  { city: 'Detroit',      name: 'Motors',    abbreviation: 'DET', conference: 'Eastern', division: 'Central',   primaryColor: '#1C3A6E', secondaryColor: '#C0C0C0' },
  { city: 'Indiana',      name: 'Pace',      abbreviation: 'IND', conference: 'Eastern', division: 'Central',   primaryColor: '#D4A82E', secondaryColor: '#1A1A2E' },
  { city: 'Milwaukee',    name: 'Cream',     abbreviation: 'MIL', conference: 'Eastern', division: 'Central',   primaryColor: '#0D6E3A', secondaryColor: '#F5F0DC' },

  // ===== Eastern — Southeast =====
  { city: 'Atlanta',      name: 'Surge',     abbreviation: 'ATL', conference: 'Eastern', division: 'Southeast', primaryColor: '#CC2200', secondaryColor: '#1A1A1A' },
  { city: 'Charlotte',    name: 'Royals',    abbreviation: 'CHA', conference: 'Eastern', division: 'Southeast', primaryColor: '#5C2D91', secondaryColor: '#00B4A0' },
  { city: 'Miami',        name: 'Heatwave',  abbreviation: 'MIH', conference: 'Eastern', division: 'Southeast', primaryColor: '#D44500', secondaryColor: '#1A1A1A' },
  { city: 'Orlando',      name: 'Spell',     abbreviation: 'ORS', conference: 'Eastern', division: 'Southeast', primaryColor: '#1F3A93', secondaryColor: '#C0C0C0' },
  { city: 'Washington',   name: 'Senators',  abbreviation: 'WAS', conference: 'Eastern', division: 'Southeast', primaryColor: '#A41E32', secondaryColor: '#1C3A6E' },

  // ===== Western — Northwest =====
  { city: 'Denver',       name: 'Peaks',     abbreviation: 'DEN', conference: 'Western', division: 'Northwest', primaryColor: '#1C3A50', secondaryColor: '#E87040' },
  { city: 'Minnesota',    name: 'Pack',      abbreviation: 'MIN', conference: 'Western', division: 'Northwest', primaryColor: '#1A3A1A', secondaryColor: '#C0C0C0' },
  { city: 'Oklahoma City',name: 'Twisters',  abbreviation: 'OKC', conference: 'Western', division: 'Northwest', primaryColor: '#2A6FB0', secondaryColor: '#E87040' },
  { city: 'Portland',     name: 'Roses',     abbreviation: 'POR', conference: 'Western', division: 'Northwest', primaryColor: '#A41E32', secondaryColor: '#1A1A1A' },
  { city: 'Utah',         name: 'Salt',      abbreviation: 'UTA', conference: 'Western', division: 'Northwest', primaryColor: '#1A3A50', secondaryColor: '#D4A82E' },

  // ===== Western — Pacific =====
  { city: 'Golden State', name: 'Bay',       abbreviation: 'GSW', conference: 'Western', division: 'Pacific',   primaryColor: '#FFC72C', secondaryColor: '#1C3A6E' },
  { city: 'LA Clippers',  name: 'Sails',     abbreviation: 'LAS', conference: 'Western', division: 'Pacific',   primaryColor: '#CC2200', secondaryColor: '#2356A8' },
  { city: 'LA Lakers',    name: 'Shores',    abbreviation: 'LSH', conference: 'Western', division: 'Pacific',   primaryColor: '#6A0DAD', secondaryColor: '#FFD700' },
  { city: 'Phoenix',      name: 'Embers',    abbreviation: 'PHX', conference: 'Western', division: 'Pacific',   primaryColor: '#E66B00', secondaryColor: '#5C2D91' },
  { city: 'Sacramento',   name: 'Crown',     abbreviation: 'SAC', conference: 'Western', division: 'Pacific',   primaryColor: '#5C2D91', secondaryColor: '#C0C0C0' },

  // ===== Western — Southwest =====
  { city: 'Dallas',       name: 'Riders',    abbreviation: 'DAL', conference: 'Western', division: 'Southwest', primaryColor: '#2356A8', secondaryColor: '#C0C0C0' },
  { city: 'Houston',      name: 'Boost',     abbreviation: 'HOO', conference: 'Western', division: 'Southwest', primaryColor: '#CC2200', secondaryColor: '#1A1A1A' },
  { city: 'Memphis',      name: 'Blues',     abbreviation: 'MEM', conference: 'Western', division: 'Southwest', primaryColor: '#2356A8', secondaryColor: '#D4A82E' },
  { city: 'New Orleans',  name: 'Brass',     abbreviation: 'NOB', conference: 'Western', division: 'Southwest', primaryColor: '#1C3A50', secondaryColor: '#D4A82E' },
  { city: 'San Antonio',  name: 'Lance',     abbreviation: 'SA',  conference: 'Western', division: 'Southwest', primaryColor: '#1A1A1A', secondaryColor: '#C0C0C0' },
];

// Sanity check: 30 teams, exactly 5 per division.
if (HOOPS_LEAGUE_TEAMS.length !== 30) {
  throw new Error(`HOOPS_LEAGUE_TEAMS must have 30 teams; has ${HOOPS_LEAGUE_TEAMS.length}`);
}
