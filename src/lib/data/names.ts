export const FIRST_NAMES = [
  'James', 'Marcus', 'Darius', 'Tyrell', 'Brandon', 'Justin', 'DeAndre', 'Malik',
  'Chris', 'Kevin', 'Jordan', 'Tyler', 'Cameron', 'Jaylen', 'Trevon', 'Lamar',
  'Patrick', 'Josh', 'Derrick', 'Jalen', 'Travis', 'Micah', 'Davante', 'Saquon',
  'Kyler', 'Joe', 'Ja\'Marr', 'Garrett', 'Myles', 'Nick', 'Aidan', 'Caleb',
  'Drake', 'Brock', 'CJ', 'Tank', 'Will', 'Amon-Ra', 'Puka', 'Sam',
  'Tua', 'Mac', 'Kenny', 'Daniel', 'Dak', 'Geno', 'Jared', 'Baker',
  'Desmond', 'Zach', 'Sauce', 'Devon', 'Roquan', 'Fred', 'Quinnen', 'Dexter',
  'Christian', 'Jahmyr', 'Bijan', 'Breece', 'Raheem', 'Jonathan', 'Derrick', 'Austin',
  'Tyreek', 'Stefon', 'AJ', 'Ceedee', 'Amari', 'Mike', 'DK', 'Terry',
  'Rashee', 'George', 'TJ', 'Chandler', 'Maxx', 'Brian', 'Demario', 'Tremaine',
  'Xavier', 'Jaire', 'Denzel', 'Patrick', 'Marlon', 'Marshon', 'Tre', 'Ahmad',
  'Jamal', 'Jessie', 'Minkah', 'Derwin', 'Kyle', 'Antoine', 'Budda', 'Harrison',
  'Eric', 'Andre', 'Devin', 'Trent', 'Penei', 'Rashawn', 'Lane', 'Tyron',
  'Zack', 'Joel', 'Creed', 'Frank', 'Jason', 'Corey', 'Alex', 'David',
  'Tristan', 'Broderick', 'Ikem', 'Evan', 'Andrew', 'Trevor', 'Matt', 'Aaron',
  'Cooper', 'Drake', 'Bryce', 'Anthony', 'Marvin', 'Rome', 'Keenan', 'Jayden',
];

export const LAST_NAMES = [
  'Williams', 'Johnson', 'Brown', 'Jackson', 'Davis', 'Jones', 'Smith', 'Wilson',
  'Thomas', 'Robinson', 'Walker', 'Harris', 'Allen', 'Young', 'King', 'Wright',
  'Hill', 'Green', 'Adams', 'Baker', 'Carter', 'Mitchell', 'Turner', 'Moore',
  'Martin', 'Anderson', 'White', 'Thompson', 'Taylor', 'Clark', 'Lewis', 'Lee',
  'Campbell', 'Evans', 'Stewart', 'Murray', 'Collins', 'Morris', 'Ward', 'Ross',
  'Cook', 'Bell', 'Reed', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Brooks',
  'Gray', 'Watson', 'James', 'Bennett', 'Sanders', 'Price', 'Jenkins', 'Perry',
  'Long', 'Butler', 'Patterson', 'Hughes', 'Washington', 'Griffin', 'Diggs', 'Chase',
  'Parsons', 'Hutchinson', 'Bosa', 'Watt', 'Garrett', 'Burns', 'Crosby', 'Sweat',
  'Hamilton', 'Simmons', 'Warner', 'Leonard', 'Wagner', 'Smith', 'Jefferson', 'Lamb',
  'Kelce', 'Andrews', 'Kittle', 'Hockenson', 'Pitts', 'Henry', 'McCaffrey', 'Chubb',
  'Ekeler', 'Mixon', 'Mahomes', 'Allen', 'Burrow', 'Herbert', 'Lawrence', 'Hurts',
  'Stroud', 'Richardson', 'Daniels', 'Williams', 'Harrison', 'Maye', 'Penix', 'Nix',
];

export function randomName(): { firstName: string; lastName: string } {
  return {
    firstName: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
    lastName: LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)],
  };
}
