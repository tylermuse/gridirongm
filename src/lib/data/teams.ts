export interface TeamTemplate {
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
}

export const LEAGUE_TEAMS: TeamTemplate[] = [
  // AC East
  { city: 'Buffalo', name: 'Blizzard', abbreviation: 'BUF', conference: 'AC', division: 'East', primaryColor: '#C8A82E', secondaryColor: '#1A1A1A' },
  { city: 'Miami', name: 'Riptide', abbreviation: 'MIA', conference: 'AC', division: 'East', primaryColor: '#8B1538', secondaryColor: '#1C3050' },
  { city: 'New England', name: 'Minutemen', abbreviation: 'NE', conference: 'AC', division: 'East', primaryColor: '#0D6E3A', secondaryColor: '#D4A82E' },
  { city: 'New York', name: 'Sentinels', abbreviation: 'NYS', conference: 'AC', division: 'East', primaryColor: '#D45820', secondaryColor: '#1A1A2E' },
  // AC North
  { city: 'Baltimore', name: 'Ironclads', abbreviation: 'BAL', conference: 'AC', division: 'North', primaryColor: '#008B7A', secondaryColor: '#C0C0C0' },
  { city: 'Cincinnati', name: 'Forge', abbreviation: 'CIN', conference: 'AC', division: 'North', primaryColor: '#1C3A6E', secondaryColor: '#E8E8E8' },
  { city: 'Cleveland', name: 'Hounds', abbreviation: 'CLE', conference: 'AC', division: 'North', primaryColor: '#5C2D91', secondaryColor: '#C0C0C0' },
  { city: 'Pittsburgh', name: 'Rivermen', abbreviation: 'PIT', conference: 'AC', division: 'North', primaryColor: '#CC2200', secondaryColor: '#E8E8E8' },
  // AC South
  { city: 'Houston', name: 'Outlaws', abbreviation: 'HOU', conference: 'AC', division: 'South', primaryColor: '#1A5C3A', secondaryColor: '#D4A82E' },
  { city: 'Indianapolis', name: 'Bolts', abbreviation: 'IND', conference: 'AC', division: 'South', primaryColor: '#1A1A1A', secondaryColor: '#E87040' },
  { city: 'Jacksonville', name: 'Gators', abbreviation: 'JAX', conference: 'AC', division: 'South', primaryColor: '#6B1C23', secondaryColor: '#C0C0C0' },
  { city: 'Tennessee', name: 'Copperheads', abbreviation: 'TEN', conference: 'AC', division: 'South', primaryColor: '#D44500', secondaryColor: '#2A2A2A' },
  // AC West
  { city: 'Denver', name: 'Summit', abbreviation: 'DEN', conference: 'AC', division: 'West', primaryColor: '#5C2D91', secondaryColor: '#C0C0C0' },
  { city: 'Kansas City', name: 'Marshals', abbreviation: 'KC', conference: 'AC', division: 'West', primaryColor: '#008B7A', secondaryColor: '#E8E8E8' },
  { city: 'Las Vegas', name: 'Vipers', abbreviation: 'LV', conference: 'AC', division: 'West', primaryColor: '#2356A8', secondaryColor: '#D4A82E' },
  { city: 'Los Angeles', name: 'Aftershock', abbreviation: 'LAA', conference: 'AC', division: 'West', primaryColor: '#6A0DAD', secondaryColor: '#FFD700' },
  // NC East
  { city: 'Dallas', name: 'Wranglers', abbreviation: 'DAL', conference: 'NC', division: 'East', primaryColor: '#1A5C3A', secondaryColor: '#C8A82E' },
  { city: 'New York', name: 'Guardians', abbreviation: 'NYG', conference: 'NC', division: 'East', primaryColor: '#1A1A1A', secondaryColor: '#00B4A0' },
  { city: 'Philadelphia', name: 'Founders', abbreviation: 'PHI', conference: 'NC', division: 'East', primaryColor: '#6B1C23', secondaryColor: '#D4A82E' },
  { city: 'Washington', name: 'Generals', abbreviation: 'WAS', conference: 'NC', division: 'East', primaryColor: '#2356A8', secondaryColor: '#E8E8E8' },
  // NC North
  { city: 'Chicago', name: 'Enforcers', abbreviation: 'CHI', conference: 'NC', division: 'North', primaryColor: '#CC2200', secondaryColor: '#D4A82E' },
  { city: 'Detroit', name: 'Mustangs', abbreviation: 'DET', conference: 'NC', division: 'North', primaryColor: '#1A5C3A', secondaryColor: '#F5F0DC' },
  { city: 'Green Bay', name: 'Tundra', abbreviation: 'GB', conference: 'NC', division: 'North', primaryColor: '#1C3A50', secondaryColor: '#CC2200' },
  { city: 'Minnesota', name: 'Frost', abbreviation: 'MIN', conference: 'NC', division: 'North', primaryColor: '#E87040', secondaryColor: '#1A1A2E' },
  // NC South
  { city: 'Atlanta', name: 'Firebirds', abbreviation: 'ATL', conference: 'NC', division: 'South', primaryColor: '#1C3A6E', secondaryColor: '#C0C0C0' },
  { city: 'Carolina', name: 'Stingrays', abbreviation: 'CAR', conference: 'NC', division: 'South', primaryColor: '#D4A82E', secondaryColor: '#1A3A1A' },
  { city: 'New Orleans', name: 'Krewe', abbreviation: 'NO', conference: 'NC', division: 'South', primaryColor: '#2356A8', secondaryColor: '#CC2200' },
  { city: 'Tampa Bay', name: 'Bandits', abbreviation: 'TB', conference: 'NC', division: 'South', primaryColor: '#5C2D91', secondaryColor: '#D4A82E' },
  // NC West
  { city: 'Arizona', name: 'Scorpions', abbreviation: 'ARI', conference: 'NC', division: 'West', primaryColor: '#008B7A', secondaryColor: '#1A1A1A' },
  { city: 'Los Angeles', name: 'Condors', abbreviation: 'LAC', conference: 'NC', division: 'West', primaryColor: '#1A5C3A', secondaryColor: '#E8E8E8' },
  { city: 'San Francisco', name: 'Fog', abbreviation: 'SF', conference: 'NC', division: 'West', primaryColor: '#1C3A50', secondaryColor: '#00B4A0' },
  { city: 'Seattle', name: 'Sasquatch', abbreviation: 'SEA', conference: 'NC', division: 'West', primaryColor: '#D45820', secondaryColor: '#5C2D91' },
];
