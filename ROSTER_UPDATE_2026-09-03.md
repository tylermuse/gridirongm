# NFL 2026 Roster Update — September 3, 2026

Full league-wide reconciliation of `public/rosters/FBGM_NFL_Roster_2026_Updated.json` against real active rosters (53-man + practice squad + IR) pulled from ESPN for all 32 teams, reflecting the post-training-camp cut to 53 as of the season opener.

## Totals

- **2426** players matched to real rosters (96.5% of 2,513 real players)
- **270** team changes (trades + signings)
- **551** players released to free agency (roster churn from the cut to 53)
- **41** players un-retired (real players ESPN lists as active that the game had marked retired)
- **5** duplicate stub records resolved (real high-rated record kept)
- **2** high-rated players kept despite ESPN omission (flagged below for review)

## Notable team-to-team moves

- Jason Sanders — Giants → Jets
- Tyrel Dodson — Dolphins → Panthers
- Mitch Wishnowsky — Bills → Patriots
- Mazi Smith — Jets → Dolphins
- Keenan Allen — Chargers → Colts
- Rasul Douglas — Dolphins → Commanders
- Jaylen Reed — Texans → Patriots
- Za'Darius Smith — Texans → Falcons
- Broderick Jones — Steelers → Cowboys
- Trikweze Bridges — Cowboys → Bengals
- Kyle Van Noy — Ravens → Vikings
- Xavier Woods — Titans → Bears
- Sean Murphy-Bunting — Cardinals → Buccaneers
- Sam Williams — Cowboys → Browns
- Mekhi Blackmon — Colts → Browns

## Notable free-agent signings

- Bobby Okereke — signed by Panthers
- Stefon Diggs — signed by Commanders
- Daniel Carlson — signed by Saints
- L'Jarius Sneed — signed by Chiefs
- Deebo Samuel Sr. — signed by 49ers
- Terrion Arnold — signed by Seahawks
- Jadeveon Clowney — signed by Texans
- Derek Barnett — signed by Browns
- Damarri Mathis — signed by Browns
- Trevon Diggs — signed by Seahawks
- Jonnu Smith — signed by Packers
- AJ Epenesa — signed by Eagles

## Un-retirements

- Aaron Donald → Rams
- Fabian Moreau → Commanders
- Jalen Reagor → Dolphins
- Khalid Kareem → Falcons
- Byron Cowart → Commanders
- Bryce Hall → Texans
- Brady Christensen → Panthers
- Josh Tupou → Giants
- Greg Van Roten → Patriots
- Mike Danna → Bills
- De'antre Prince → Bears
- Mario Goodrich → Titans
- D.J. James → Giants
- George Odum → Texans
- Trey Sermon → Falcons
- Cameron McGrone → Raiders
- Greg Gaines → Bills
- Tanoh Kpassagnon → Titans
- Demetrius Flannigan-Fowles → Bills
- Salvon Ahmed → Bears
- Sam Mustipher → Jaguars
- Buddy Johnson → Bears
- Jalyn Holmes → Titans
- Victor Dimukeje → 49ers
- Mario Edwards Jr. → Texans
- Jonathan Ward → Ravens
- Keir Thomas → Rams
- Zech McPhearson → Rams
- Tony Fields II → Bears
- Blake Hance → Rams
- Cam Gill → Panthers
- Gary Jennings Jr. → Chargers
- Jalen Moreno-Cropper → Saints
- Jermar Jefferson → Vikings
- Jake Curhan → Panthers
- Ryan Hayes → Panthers
- Ameer Speed → Cowboys
- Travis Bell → Browns
- Nick Vannett → Ravens
- Nick Muse → Falcons
- Trey Dean III → Packers

## Notable releases to free agency

- Jamie Gillan — released by Giants
- Brandon Graham — released by Eagles
- Jabrill Peppers — released by Steelers
- Azeez Ojulari — released by Falcons
- Brandon McManus — released by Packers
- Ben Sauls — released by Giants
- Ambry Thomas — released by Eagles
- DeShon Elliot — released by Steelers
- Channing Tindall — released by Falcons
- Jay Toia — released by Cowboys
- Kobee Minor — released by Patriots
- Malik Muhammed — released by Bears
- Spencer Buford — released by Seahawks
- Jake Moody — released by Commanders
- Darnell Savage Jr. — released by Steelers

## Kept despite ESPN omission (review)

These rated players were not on any ESPN active roster (likely an ESPN data omission, not a real release), so they were left on their current team rather than cut:

- Zach Tom (Packers)
- Jalon Walker (Falcons)

## Not carried over

- 87 players on real ESPN rosters were not matched to a game record and were not added — 30 are long snappers (not modeled) and the rest are late UDFA/camp additions.

Method: names normalized (suffixes, nicknames, punctuation), matched per team with jersey/position/rating disambiguation; players on a game team but absent from their real roster moved to free agency. Source data: `scripts/data/espn_active_rosters_2026-09-03.json`.
