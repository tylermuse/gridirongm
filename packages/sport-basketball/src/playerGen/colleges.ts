/**
 * Source-of-development pool for basketball players. Used for the
 * "college" field on draft prospects.
 *
 * Mix reflects modern NBA pipeline: heavy on US college basketball blue-bloods,
 * plus the G-League Ignite-style alternate paths, plus international clubs
 * and academies that have been NBA feeders in the past decade.
 */

export const SOURCES_OF_DEVELOPMENT: readonly string[] = [
  // US college blue-bloods (most NBA prospects)
  'Duke', 'Kentucky', 'North Carolina', 'Kansas', 'UCLA', 'Arizona', 'Michigan',
  'Michigan State', 'Indiana', 'Louisville', 'Florida', 'Georgetown', 'Syracuse',
  'Connecticut', 'Villanova', 'Gonzaga', 'Memphis', 'Houston', 'Texas', 'Baylor',
  // Power conferences
  'Ohio State', 'Wisconsin', 'Purdue', 'Illinois', 'Maryland', 'Iowa',
  'Tennessee', 'Auburn', 'Alabama', 'Arkansas', 'LSU', 'Mississippi State',
  'Oklahoma', 'Oklahoma State', 'TCU', 'Kansas State', 'West Virginia',
  'USC', 'Oregon', 'Stanford', 'California', 'Washington', 'Utah', 'Colorado',
  'Florida State', 'Miami (FL)', 'Virginia', 'Virginia Tech', 'NC State',
  'Wake Forest', 'Boston College', 'Pittsburgh', 'Notre Dame', 'Clemson',
  // Mid-major NBA feeders
  'Saint Mary\'s', 'Davidson', 'Murray State', 'Wichita State', 'Creighton',
  'Xavier', 'Butler', 'Marquette', 'Saint Joseph\'s', 'Dayton', 'VCU',
  'San Diego State', 'Nevada', 'New Mexico', 'BYU', 'Gonzaga',
  // G-League Ignite-style alternate paths
  'G League Ignite', 'Overtime Elite', 'NBA Academy', 'Real Madrid Academy',
  // International — Spain (top European pipeline)
  'Real Madrid', 'FC Barcelona', 'Valencia Basket', 'Baskonia', 'Joventut',
  // International — France
  'ASVEL', 'Pau-Orthez', 'Limoges CSP', 'Le Mans', 'Metropolitans 92', 'INSEP',
  // International — Germany
  'Alba Berlin', 'Bayern Munich', 'Brose Bamberg', 'Ratiopharm Ulm',
  // International — Italy
  'Olimpia Milano', 'Virtus Bologna', 'Reyer Venezia',
  // International — Lithuania
  'Zalgiris Kaunas', 'Lietuvos Rytas',
  // International — Serbia / Balkans
  'Crvena Zvezda', 'Partizan Belgrade', 'Mega Basket', 'Buducnost',
  // International — Greece / Turkey
  'Olympiacos', 'Panathinaikos', 'Anadolu Efes', 'Fenerbahce', 'Galatasaray',
  // International — Australia (NBL feeds)
  'NBL Next Stars', 'Sydney Kings', 'Melbourne United', 'Perth Wildcats',
  'Adelaide 36ers', 'NZ Breakers',
  // International — Canada
  'Canada Basketball', 'Athlete Institute',
  // International — Senegal / Africa
  'NBA Academy Africa', 'BAL', 'AS Douanes',
  // Direct-from-HS (rare but real — Ohama Banchero, LaMelo Ball path)
  'High School (direct)', 'Prep / Reclassified',
];

export function randomSourceOfDevelopment(): string {
  return SOURCES_OF_DEVELOPMENT[Math.floor(Math.random() * SOURCES_OF_DEVELOPMENT.length)];
}
