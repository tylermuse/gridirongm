export interface TeamTemplate {
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AFC' | 'NFC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
}

export const NFL_TEAMS: TeamTemplate[] = [
  // AFC East
  { city: 'Buffalo', name: 'Bills', abbreviation: 'BUF', conference: 'AFC', division: 'East', primaryColor: '#00338D', secondaryColor: '#C60C30' },
  { city: 'Miami', name: 'Dolphins', abbreviation: 'MIA', conference: 'AFC', division: 'East', primaryColor: '#008E97', secondaryColor: '#FC4C02' },
  { city: 'New England', name: 'Patriots', abbreviation: 'NE', conference: 'AFC', division: 'East', primaryColor: '#002244', secondaryColor: '#C60C30' },
  { city: 'New York', name: 'Jets', abbreviation: 'NYJ', conference: 'AFC', division: 'East', primaryColor: '#125740', secondaryColor: '#FFFFFF' },
  // AFC North
  { city: 'Baltimore', name: 'Ravens', abbreviation: 'BAL', conference: 'AFC', division: 'North', primaryColor: '#241773', secondaryColor: '#9E7C0C' },
  { city: 'Cincinnati', name: 'Bengals', abbreviation: 'CIN', conference: 'AFC', division: 'North', primaryColor: '#FB4F14', secondaryColor: '#000000' },
  { city: 'Cleveland', name: 'Browns', abbreviation: 'CLE', conference: 'AFC', division: 'North', primaryColor: '#311D00', secondaryColor: '#FF3C00' },
  { city: 'Pittsburgh', name: 'Steelers', abbreviation: 'PIT', conference: 'AFC', division: 'North', primaryColor: '#FFB612', secondaryColor: '#101820' },
  // AFC South
  { city: 'Houston', name: 'Texans', abbreviation: 'HOU', conference: 'AFC', division: 'South', primaryColor: '#03202F', secondaryColor: '#A71930' },
  { city: 'Indianapolis', name: 'Colts', abbreviation: 'IND', conference: 'AFC', division: 'South', primaryColor: '#002C5F', secondaryColor: '#A2AAAD' },
  { city: 'Jacksonville', name: 'Jaguars', abbreviation: 'JAX', conference: 'AFC', division: 'South', primaryColor: '#006778', secondaryColor: '#D7A22A' },
  { city: 'Tennessee', name: 'Titans', abbreviation: 'TEN', conference: 'AFC', division: 'South', primaryColor: '#0C2340', secondaryColor: '#4B92DB' },
  // AFC West
  { city: 'Denver', name: 'Broncos', abbreviation: 'DEN', conference: 'AFC', division: 'West', primaryColor: '#FB4F14', secondaryColor: '#002244' },
  { city: 'Kansas City', name: 'Chiefs', abbreviation: 'KC', conference: 'AFC', division: 'West', primaryColor: '#E31837', secondaryColor: '#FFB81C' },
  { city: 'Las Vegas', name: 'Raiders', abbreviation: 'LV', conference: 'AFC', division: 'West', primaryColor: '#000000', secondaryColor: '#A5ACAF' },
  { city: 'Los Angeles', name: 'Chargers', abbreviation: 'LAC', conference: 'AFC', division: 'West', primaryColor: '#0080C6', secondaryColor: '#FFC20E' },
  // NFC East
  { city: 'Dallas', name: 'Cowboys', abbreviation: 'DAL', conference: 'NFC', division: 'East', primaryColor: '#003594', secondaryColor: '#869397' },
  { city: 'New York', name: 'Giants', abbreviation: 'NYG', conference: 'NFC', division: 'East', primaryColor: '#0B2265', secondaryColor: '#A71930' },
  { city: 'Philadelphia', name: 'Eagles', abbreviation: 'PHI', conference: 'NFC', division: 'East', primaryColor: '#004C54', secondaryColor: '#A5ACAF' },
  { city: 'Washington', name: 'Commanders', abbreviation: 'WAS', conference: 'NFC', division: 'East', primaryColor: '#5A1414', secondaryColor: '#FFB612' },
  // NFC North
  { city: 'Chicago', name: 'Bears', abbreviation: 'CHI', conference: 'NFC', division: 'North', primaryColor: '#0B162A', secondaryColor: '#C83803' },
  { city: 'Detroit', name: 'Lions', abbreviation: 'DET', conference: 'NFC', division: 'North', primaryColor: '#0076B6', secondaryColor: '#B0B7BC' },
  { city: 'Green Bay', name: 'Packers', abbreviation: 'GB', conference: 'NFC', division: 'North', primaryColor: '#203731', secondaryColor: '#FFB612' },
  { city: 'Minnesota', name: 'Vikings', abbreviation: 'MIN', conference: 'NFC', division: 'North', primaryColor: '#4F2683', secondaryColor: '#FFC62F' },
  // NFC South
  { city: 'Atlanta', name: 'Falcons', abbreviation: 'ATL', conference: 'NFC', division: 'South', primaryColor: '#A71930', secondaryColor: '#000000' },
  { city: 'Carolina', name: 'Panthers', abbreviation: 'CAR', conference: 'NFC', division: 'South', primaryColor: '#0085CA', secondaryColor: '#101820' },
  { city: 'New Orleans', name: 'Saints', abbreviation: 'NO', conference: 'NFC', division: 'South', primaryColor: '#D3BC8D', secondaryColor: '#101820' },
  { city: 'Tampa Bay', name: 'Buccaneers', abbreviation: 'TB', conference: 'NFC', division: 'South', primaryColor: '#D50A0A', secondaryColor: '#34302B' },
  // NFC West
  { city: 'Arizona', name: 'Cardinals', abbreviation: 'ARI', conference: 'NFC', division: 'West', primaryColor: '#97233F', secondaryColor: '#000000' },
  { city: 'Los Angeles', name: 'Rams', abbreviation: 'LAR', conference: 'NFC', division: 'West', primaryColor: '#003594', secondaryColor: '#FFA300' },
  { city: 'San Francisco', name: '49ers', abbreviation: 'SF', conference: 'NFC', division: 'West', primaryColor: '#AA0000', secondaryColor: '#B3995D' },
  { city: 'Seattle', name: 'Seahawks', abbreviation: 'SEA', conference: 'NFC', division: 'West', primaryColor: '#002244', secondaryColor: '#69BE28' },
];
