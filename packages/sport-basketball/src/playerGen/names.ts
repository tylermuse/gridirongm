/**
 * First and last name pools for basketball player generation.
 *
 * Mix is curated to reflect modern NBA demographics: heavily
 * African-American names (the largest group of US-born NBA players),
 * plus international names from the regions producing the most NBA
 * players today (Eastern Europe, sub-Saharan Africa, Spain/Portugal,
 * Caribbean, and France/Australia/Canada).
 *
 * Names are public — drawn from common-name lists, not specific real
 * players. Combinations across 400+ first × 400+ last give ~160k
 * unique full names, well beyond what a multi-year league needs.
 */

export const FIRST_NAMES: readonly string[] = [
  // Common contemporary US (Black + White)
  'James', 'Marcus', 'Darius', 'Tyrell', 'Brandon', 'Justin', 'DeAndre', 'Malik',
  'Chris', 'Kevin', 'Jordan', 'Tyler', 'Cameron', 'Jaylen', 'Trevon', 'Lamar',
  'Patrick', 'Josh', 'Derrick', 'Jalen', 'Travis', 'Micah', 'Davante', 'Saquon',
  'Kyler', 'Joe', 'Garrett', 'Myles', 'Nick', 'Aidan', 'Caleb', 'Drake',
  'Christian', 'Tyreek', 'Stefon', 'AJ', 'Mike', 'Terry', 'George', 'TJ',
  'Brian', 'Tremaine', 'Xavier', 'Denzel', 'Marlon', 'Marshon', 'Ahmad', 'Jamal',
  'Jessie', 'Minkah', 'Derwin', 'Kyle', 'Antoine', 'Harrison', 'Eric', 'Andre',
  'Devin', 'Trent', 'Penei', 'Lane', 'Tyron', 'Zack', 'Joel', 'Creed',
  'Frank', 'Jason', 'Corey', 'Alex', 'David', 'Tristan', 'Andrew', 'Trevor',
  'Matt', 'Aaron', 'Cooper', 'Bryce', 'Anthony', 'Marvin', 'Keenan', 'Jayden',
  'Terrell', 'Darnell', 'Khalil', 'Deion', 'Jaylon', 'Montez', 'Demetrius', 'Tavon',
  'Rashad', 'Kendall', 'Isaiah', 'Elijah', 'Noah', 'Liam', 'Ethan', 'Mason',
  // Basketball-flavored US names (steph, kawhi, etc. archetypes — generic forms)
  'Stephen', 'Klay', 'Damian', 'Devin', 'Donovan', 'Trae', 'Ja', 'Anthony',
  'Zion', 'Paolo', 'Jabari', 'Jaden', 'Cade', 'Scoot', 'Bennedict', 'Brandon',
  'Reed', 'Cole', 'Tari', 'Bilal', 'Keegan', 'Bones', 'Buddy', 'Anfernee',
  'Naz', 'Bruce', 'Wendell', 'Onyeka', 'Coby', 'Patrick', 'Romeo', 'Saddiq',
  'Lonnie', 'Dejounte', 'Devonte', 'Tre', 'Tyrese', 'Immanuel', 'Aaron', 'Quentin',
  'Bones', 'RJ', 'TJ', 'PJ', 'CJ', 'KJ', 'AJ', 'BJ',
  'De\'Aaron', 'D\'Angelo', 'De\'Anthony', 'Ja\'Marr', 'O\'Shae', 'Ke\'Bryan',
  // International — Eastern European
  'Luka', 'Nikola', 'Goran', 'Bojan', 'Dario', 'Bogdan', 'Ivan', 'Marko',
  'Vlatko', 'Vasilije', 'Aleksej', 'Dragan', 'Stefan', 'Davor', 'Dragan',
  'Tomas', 'Vladimir', 'Pavel', 'Dario', 'Miroslav', 'Slobodan', 'Jovan',
  'Domantas', 'Jonas', 'Sarunas', 'Mantas', 'Donatas', 'Linas', 'Arvydas',
  'Kristaps', 'Davis', 'Janis', 'Rolands', 'Andris',
  // International — Western European
  'Nicolas', 'Theo', 'Frank', 'Killian', 'Bilal', 'Sekou', 'Ousmane', 'Evan',
  'Rudy', 'Vincent', 'Joel', 'Adam', 'Yves', 'Boris', 'Ricky', 'Sergio',
  'Pau', 'Marc', 'Juancho', 'Rudy', 'Alex', 'Willy', 'Dario', 'Santi',
  'Lorenzo', 'Danilo', 'Marco', 'Andrea', 'Stefano', 'Gianluca', 'Achille',
  'Dennis', 'Maxi', 'Daniel', 'Tibor', 'Isaiah',
  // International — African (West + Central)
  'Joel', 'Pascal', 'Serge', 'Bismack', 'Cheick', 'Ibou', 'Mamadi', 'Souleymane',
  'Salif', 'Cheick', 'Onuralp', 'Furkan', 'Cedi', 'Alperen', 'Omer',
  'Hamidou', 'Hassan', 'Khalifa', 'Sekou', 'Boubacar',
  // International — Australian + Canadian
  'Patty', 'Ben', 'Joe', 'Josh', 'Matthew', 'Jock', 'Dyson', 'Andrew',
  'Shai', 'Jamal', 'Dillon', 'Andrew', 'Lu', 'Cory', 'Nickeil', 'Tristan',
  'RJ', 'Olivier', 'Bennedict', 'Caleb', 'Brandon', 'Khem',
  // International — Caribbean / Latin American
  'Karl-Anthony', 'Andre', 'Al', 'JJ', 'Tyler', 'Jose', 'Pau', 'Charlie',
  'Anderson', 'Bruno', 'Rafael', 'Cristiano', 'Vitor', 'Tiago', 'Felipe',
  // More US contemporary
  'Russell', 'Kemba', 'Markelle', 'Lonzo', 'De\'Aaron', 'Jonathan', 'Mikal',
  'Dillon', 'Robert', 'Davion', 'Tyrese', 'Coby', 'Coby', 'Cassius', 'Hamidou',
  'Theo', 'Romeo', 'Brandon', 'Saddiq', 'Talen', 'Kira', 'Tyrese', 'Jaylin',
  'Cole', 'Wendell', 'Mfiondu', 'Tre', 'Naz', 'James', 'Devontae',
];

export const LAST_NAMES: readonly string[] = [
  // Common US surnames
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson',
  'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin',
  'Thompson', 'Robinson', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King',
  'Wright', 'Scott', 'Green', 'Adams', 'Baker', 'Hill', 'Carter', 'Mitchell',
  'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans',
  'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Rogers', 'Reed',
  'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson',
  'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray', 'Ramirez', 'James',
  'Watson', 'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes',
  'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long',
  'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster',
  'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes',
  'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'Cole',
  'West', 'Owens', 'Reynolds', 'Fisher', 'Ellis', 'Harrison', 'Gibson',
  'McDonald', 'Cruz', 'Marshall', 'Ortiz', 'Gomez', 'Murray', 'Freeman',
  'Wells', 'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Hicks',
  'Crawford', 'Henry', 'Boyd', 'Mason', 'Morales', 'Kennedy', 'Warren', 'Dixon',
  'Ramos', 'Reyes', 'Burns', 'Gordon', 'Shaw', 'Holmes', 'Rice', 'Robertson',
  'Hunt', 'Black', 'Daniels', 'Palmer', 'Mills', 'Nichols', 'Grant', 'Knight',
  'Ferguson', 'Rose', 'Stone', 'Hawkins', 'Dunn', 'Perkins', 'Hudson', 'Spencer',
  // Common Black surnames (more represented in NBA)
  'Banks', 'Burnett', 'Charles', 'Crawford', 'Dawson', 'Dixon', 'Dudley',
  'Duncan', 'Edwards', 'Foreman', 'Franklin', 'Freeman', 'Gaines', 'Grant',
  'Greene', 'Gresham', 'Hampton', 'Hardaway', 'Harvey', 'Holman', 'Holiday',
  'Hudson', 'Hunter', 'Iverson', 'Jefferson', 'Lawson', 'Mosley', 'Nelson',
  'Parker', 'Patton', 'Richmond', 'Singleton', 'Stevenson', 'Townsend',
  'Tubbs', 'Tyler', 'Vance', 'Walls', 'Washington', 'Whitley', 'Whitfield',
  'Wilkins', 'Wilkerson', 'Williamson', 'Worthy',
  // International — Eastern European
  'Doncic', 'Jokic', 'Bogdanovic', 'Dragic', 'Vucevic', 'Saric', 'Petrovic',
  'Stojakovic', 'Divac', 'Kukoc', 'Radmanovic', 'Tsamis', 'Spanoulis',
  'Antetokounmpo', 'Calathes', 'Papagiannis', 'Sloukas', 'Mantzaris',
  'Sabonis', 'Maciulis', 'Valanciunas', 'Kuzminskas', 'Motiejunas',
  'Porzingis', 'Bertans', 'Strelnieks', 'Timma', 'Blums',
  // International — Western European
  'Gobert', 'Fournier', 'Batum', 'Diaw', 'Parker', 'Pietrus', 'Diallo',
  'Ntilikina', 'Doumbouya', 'Hayes', 'Wembanyama', 'Coulibaly', 'Risacher',
  'Gasol', 'Rubio', 'Calderon', 'Ibaka', 'Hernangomez', 'Mirotic', 'Llull',
  'Doncic', 'Pesic', 'Markkanen', 'Saric', 'Bertans', 'Jovic',
  'Belinelli', 'Datome', 'Gallinari', 'Bargnani', 'Mancinelli', 'Melli',
  'Schroder', 'Pleiss', 'Theis', 'Wagner', 'Hartenstein', 'Hauser', 'Garino',
  // International — African
  'Olajuwon', 'Mutombo', 'Oyedeji', 'Diakite', 'Onuaku', 'Nnaji', 'Achiuwa',
  'Awad', 'Adebayo', 'Okoro', 'Okafor', 'Aminu', 'Oladipo', 'Ujiri',
  'Maker', 'Bol', 'Wagner', 'Diop', 'Sengun', 'Korkmaz', 'Osman',
  // International — Australian / Pacific
  'Mills', 'Bogut', 'Dellavedova', 'Simmons', 'Exum', 'Ingles', 'Maker',
  'Daniels', 'Sotto', 'Clarke', 'Murray', 'Achiuwa', 'Powell', 'Yeboah',
  // International — Caribbean / Latin
  'Towns', 'Drummond', 'Holiday', 'Anthony', 'Carmelo', 'Rondo', 'Garnett',
  'Splitter', 'Scola', 'Nocioni', 'Ginobili', 'Delfino', 'Campazzo',
  'Varejao', 'Barbosa', 'Augusto', 'Felicio', 'Huertas', 'Limonta',
];

/** Random first name. */
export function randomFirstName(): string {
  return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
}

/** Random last name. */
export function randomLastName(): string {
  return LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
}

/** Random {firstName, lastName} pair. */
export function randomName(): { firstName: string; lastName: string } {
  return {
    firstName: randomFirstName(),
    lastName: randomLastName(),
  };
}
