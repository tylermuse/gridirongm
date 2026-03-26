# Roster Update Instructions: March 17–23, 2026

Update the file `public/rosters/FBGM_NFL_Roster_2026_Updated.json` with the following NFL transactions. Also update `src/app/rosters/page.tsx` metadata afterward.

## Team ID Reference

| tid | Team |
|-----|------|
| 0 | Arizona Cardinals |
| 1 | Atlanta Falcons |
| 2 | Baltimore Ravens |
| 3 | Buffalo Bills |
| 4 | Carolina Panthers |
| 5 | Chicago Bears |
| 6 | Cincinnati Bengals |
| 7 | Cleveland Browns |
| 8 | Dallas Cowboys |
| 9 | Denver Broncos |
| 10 | Detroit Lions |
| 11 | Green Bay Packers |
| 12 | Houston Texans |
| 13 | Indianapolis Colts |
| 14 | Jacksonville Jaguars |
| 15 | Kansas City Chiefs |
| 16 | Las Vegas Raiders |
| 17 | Los Angeles Chargers |
| 18 | Los Angeles Rams |
| 19 | Miami Dolphins |
| 20 | Minnesota Vikings |
| 21 | New England Patriots |
| 22 | New Orleans Saints |
| 23 | New York Giants |
| 24 | New York Jets |
| 25 | Philadelphia Eagles |
| 26 | Pittsburgh Steelers |
| 27 | San Francisco 49ers |
| 28 | Seattle Seahawks |
| 29 | Tampa Bay Buccaneers |
| 30 | Tennessee Titans |
| 31 | Washington Commanders |

Special tids: `-1` = free agent, `-2` = unsigned, `-3` = retired (set `retiredYear` to `2026`)

---

## Player Moves (Change `tid`)

For each player below, find them by `pid` in the `players` array and update their `tid` to the new value. If a contract change is noted, also update `contract.amount` (in thousands) and `contract.exp`.

### March 18, 2026

| pid | Player | From (tid) | To (tid) | Notes |
|-----|--------|-----------|----------|-------|
| 1403 | Andy Dalton | 4 (CAR) | 25 (PHI) | Traded for 2027 7th-round pick |
| 1224 | AJ Dillon | 25 (PHI) | 4 (CAR) | Signed 1-year deal. Set `contract.amount` to `1200`, `contract.exp` to `2027` |
| 6456 | Teagan Quitoriano | 1 (ATL) | 0 (ARI) | Signed |
| 109 | Darnay Holmes | -1 (FA) | 1 (ATL) | Signed 1-year deal. Set `contract.amount` to `1000`, `contract.exp` to `2027` |
| 5809 | Jack Sanborn | 30 (TEN) | 5 (CHI) | Signed |
| 215 | James Lynch | -3 (retired) | 5 (CHI) | Signed 1-year/$1.3M. Set `tid` to `5`, `contract.amount` to `1300`, `contract.exp` to `2027`, `retiredYear` to `Infinity` |
| 337 | Tylan Wallace | 2 (BAL) | 7 (CLE) | Signed |
| 1078 | AJ Epenesa | 3 (BUF) | 7 (CLE) | Signed |
| 769 | Julian Okwara | -3 (out) | 7 (CLE) | Signed 1-year/$1.2M. Set `tid` to `7`, `contract.amount` to `1200`, `contract.exp` to `2027`, `retiredYear` to `Infinity` |
| 4394 | Daniel Thomas | 10 (DET) | 7 (CLE) | Signed |
| 7162 | Greg Dortch | 0 (ARI) | 10 (DET) | Signed 1-year/$1.4M. Set `contract.amount` to `1400`, `contract.exp` to `2027` |
| 5800 | Damone Clark | 8 (DAL) | 10 (DET) | Signed 1-year/$1.4M. Set `contract.amount` to `1400`, `contract.exp` to `2027` |
| 325 | Nick Westbrook-Ikhine | -1 (FA) | 13 (IND) | Signed |
| 582 | Akeem Davis-Gaither | 0 (ARI) | 13 (IND) | Signed |
| 541 | Bradley Pinion | 1 (ATL) | 19 (MIA) | Signed |

### March 19, 2026

| pid | Player | From (tid) | To (tid) | Notes |
|-----|--------|-----------|----------|-------|
| 5874 | Tycen Anderson | 6 (CIN) | 9 (DEN) | Signed |
| 1175 | Kindle Vildor | -3 (out) | 21 (NE) | Signed. Set `tid` to `21`, `contract.amount` to `1000`, `contract.exp` to `2027`, `retiredYear` to `Infinity` |
| 882 | Chris Rumph II | -1 (FA) | 22 (NO) | Re-signed |
| 5580 | Dameon Pierce | -1 (FA) | 25 (PHI) | Signed 1-year/$1.3M. Set `contract.amount` to `1300`, `contract.exp` to `2027` |

### March 20, 2026

| pid | Player | From (tid) | To (tid) | Notes |
|-----|--------|-----------|----------|-------|
| 8053 | Sydney Brown | 25 (PHI) | 1 (ATL) | Traded (pick swap) |
| 394 | Marcus Epps | -1 (FA) | 25 (PHI) | Signed 1-year deal. Set `contract.amount` to `1500`, `contract.exp` to `2027` |
| 4459 | J.T. Gray | 22 (NO) | 25 (PHI) | Signed 1-year deal |
| 10587 | Jake Bobo | 28 (SEA) | 14 (JAX) | Signed 2-year/$5.5M offer sheet. Set `contract.amount` to `2750`, `contract.exp` to `2028` |
| 5707 | Luke Tenuta | -3 (out) | 13 (IND) | Signed. Set `tid` to `13`, `contract.amount` to `1000`, `contract.exp` to `2027`, `retiredYear` to `Infinity` |

### March 22, 2026

| pid | Player | From (tid) | To (tid) | Notes |
|-----|--------|-----------|----------|-------|
| 1058 | Olisaemeka Udoh | -3 (out) | 0 (ARI) | Signed. Set `tid` to `0`, `contract.amount` to `1000`, `contract.exp` to `2027`, `retiredYear` to `Infinity` |
| 7696 | Nick Hampton | 18 (LAR) | 4 (CAR) | Signed |
| 1376 | Feleipe Franks | 1 (ATL) | 4 (CAR) | Signed |
| 250 | Payton Turner | 8 (DAL) | 10 (DET) | Signed |
| 7537 | Mohamoud Diabate | 7 (CLE) | 30 (TEN) | Signed |

### March 23, 2026

| pid | Player | From (tid) | To (tid) | Notes |
|-----|--------|-----------|----------|-------|
| 458 | Josh Dobbs | 21 (NE) | -1 (FA) | Released by Patriots |

---

## Retirements (Set `tid` to `-3` and `retiredYear` to `2026`)

| pid | Player | Notes |
|-----|--------|-------|
| 1587 | Logan Wilson | Retired March 18. Currently tid=8, change to tid=-3, set retiredYear=2026 |
| 953 | DJ Chark Jr. | Retired March 20. Currently tid=-1, change to tid=-3, set retiredYear=2026 |

---

## Contract Extensions (Update `contract` only, no tid change)

| pid | Player | Team | New Contract |
|-----|--------|------|-------------|
| 7434 | Jaxon Smith-Njigba | 28 (SEA) | 4-year/$168.6M extension. Set `contract.amount` to `42150`, `contract.exp` to `2031` |
| 8780 | Tommy DeVito | 21 (NE) | 2-year/$4.4M. Set `contract.amount` to `2200`, `contract.exp` to `2028` |

---

## Update `src/app/rosters/page.tsx`

In the `ROSTERS` array, update the entry:

1. Change `title` to: `'NFL 2026 Roster — Updated March 23, 2026'`
2. Change `lastUpdated` to: `'March 23, 2026'`
3. Change `description` to: `'Complete NFL roster with 90+ free agency moves through March 23, 2026. Includes all Week 2 free agency signings, the Jaylen Waddle trade to Broncos, Justin Fields trade to Chiefs, Andy Dalton trade to Eagles, Sydney Brown trade to Falcons, Jaxon Smith-Njigba record extension, and more.'`

---

## Implementation Notes

- The JSON file is at `public/rosters/FBGM_NFL_Roster_2026_Updated.json` (35MB)
- Players are in the `players` array, identified by `pid`
- `tid` values 0–31 correspond to teams; negative values are special statuses
- `contract.amount` is in thousands (e.g., `1400` = $1.4M per year)
- `contract.exp` is the expiration year
- For players coming out of retirement (tid=-3), set `retiredYear` to `Infinity` to un-retire them
- For players retiring, set `retiredYear` to `2026`
- After making changes, verify the file is still valid JSON
