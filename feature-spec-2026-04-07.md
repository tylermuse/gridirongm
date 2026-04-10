# BS Football GM - Coaching Profiles Implementation Spec

## What to build

Add rich coaching profiles with career history, a dedicated profile page, specialties, contracts, and bios. The game already has HC/OC/DC generation, scheme fit scoring, a coaching carousel, and a staff management page at `src/app/staff/page.tsx`. This extends that foundation.

Also fix the "Elite arm talent" scouting trait showing up on non-QB positions (RB, S). It should be QB-only.

---

## 1. Type changes (src/types/index.ts)

Add a new `CoachHistory` interface:

```ts
interface CoachHistory {
  teamId: string;
  teamName: string;
  role: 'HC' | 'OC' | 'DC';
  seasonStart: number;
  seasonEnd: number;
  wins: number;
  losses: number;
  playoffAppearances: number;
  championships: number;
}
```

Extend the existing `Coach` interface with these new fields:

- `bio: string` — short generated biography (1-2 sentences), generated at coach creation
- `history: CoachHistory[]` — array of past coaching stints
- `ratingHistory: { season: number; ovr: number }[]` — OVR snapshot each season, mirrors the player ratingHistory pattern
- `personality: string` — coaching personality style (e.g. 'fiery', 'cerebral', 'old-school', 'innovator'). distinct from the existing `trait` field which is more like a skillset label
- `specialties: string[]` — up to 3 coaching specialties (e.g. 'QB Development', 'Red Zone Play Design', 'Run Stopping'). influences player development in a future phase
- `contractYears: number` — years remaining on coaching contract. default 3-5 for new hires, decrements each offseason
- `salary: number` — annual salary in millions. scales with OVR: 80+ = $8-12M, 60-79 = $4-7M, under 60 = $2-4M. does not count against the player salary cap
- `mood: number` — coach satisfaction 0-100, affected by winning/roster talent/contract status. optional for this pass, nice-to-have

---

## 2. Coach generation updates (src/lib/engine/coaching.ts)

The existing `generateCoach()` function creates coaches with basic stats. Update it to also populate the new fields:

- Generate a `bio` string using a template system. examples: "[Name] is a [age]-year-old [trait] coach known for his [scheme] approach." or "[Name] spent [X] years climbing the coaching ranks before landing his first [role] job." keep it simple, no AI calls needed
- Generate 1-3 `specialties` from a pool of ~15 options. weight by role: HC gets leadership/game management specs, OC gets play design/QB development specs, DC gets coverage/pass rush specs
- Set `contractYears` to random 3-5 for new hires
- Calculate `salary` based on OVR using the ranges above
- Initialize `history` as empty array (populated as seasons progress)
- Initialize `ratingHistory` with the current season + OVR as the first entry
- Generate a `personality` from a pool (fiery, cerebral, old-school, innovator, disciplinarian, laid-back, etc.)

When generating initial coaches for new leagues (all 32 teams), backfill 1-3 fake history entries so coaches feel like they have a past. use the existing team data to pick plausible previous teams.

---

## 3. Season progression updates (src/lib/engine/coaching.ts)

At the end of each season, during coaching progression/carousel:

1. Push `{ season, ovr }` to each coach's `ratingHistory`
2. When a coach is fired or leaves a team, close out their current `history` entry (set seasonEnd, final wins/losses, playoff/championship counts). when hired by a new team, push a new history entry
3. Decrement `contractYears` by 1 each offseason. if it hits 0 the coach becomes a free agent (can be re-signed or leaves). factor into carousel logic
4. Recalculate `salary` based on current OVR after progression. coaches who improved get raises, coaches who declined get cheaper

---

## 4. Coach profile page (new: src/app/coach/[id]/page.tsx)

Create a dedicated coach profile page. this is the main user-facing deliverable.

Sections:
- **Header**: coach name, age, role badge (HC/OC/DC), team logo and name, OVR rating displayed prominently
- **Bio**: display the generated bio text
- **Current assignment**: team, role, scheme, years with team, contract status (X years remaining, $YM/year)
- **Career stats box**: career record (W-L), win percentage, years coaching, playoff appearances, championships. use careerWins/careerLosses plus aggregated history data
- **Coaching history table**: list all previous stints from history array. columns: Team, Role, Seasons, Record, Playoffs, Championships. most recent first
- **OVR progression chart**: line chart showing OVR over seasons from ratingHistory. use recharts like the rest of the app
- **Specialties and trait**: display the trait badge and specialty tags
- **Scheme fit summary**: reuse the existing scheme fit display from the staff page showing great/neutral/poor fit counts

Follow the routing pattern from `src/app/player/[id]/page.tsx`. link to this page from the staff page (make coach names clickable) and from team pages.

---

## 5. Staff page updates (src/app/staff/page.tsx)

- Make each coach name a clickable link to `/coach/[id]`
- Add a small "View Profile" button or arrow next to each coach card
- Show contract status (years remaining) on each coach card
- Show specialties as small tags/badges under each coach's scheme info

---

## 6. Store updates (src/lib/engine/store.ts)

- Add a `getCoach(coachId: string)` selector that searches all teams' coaches arrays and returns the matching coach plus its team
- Add an `updateCoach(teamId: string, coachId: string, updates: Partial<Coach>)` action
- Make sure offseason progression logic calls the new history/ratingHistory update functions

---

## 7. Save migration

Existing saves have coaches without the new fields. bump save version from 19 to 20 and add a migration that iterates all teams' coaches to backfill defaults: empty history array, ratingHistory seeded with current season/OVR, generated bio, random specialties, contractYears of 3, calculated salary.

---

## 8. Bug fix: Elite arm talent on non-QBs

Find the trait assignment logic in the scouting/draft evaluation code (likely `src/lib/engine/draftScouts.ts` or similar). Add a position filter so "Elite arm talent" only appears for QB prospects. Audit all other traits for similar position-specificity issues (e.g. "sure hands" probably shouldn't appear for OL).

---

## Implementation order

1. Fix the elite arm talent bug — quick win, ship immediately (~30 min)
2. Add new types to `src/types/index.ts` (~15 min)
3. Update coach generation in `coaching.ts` — bio templates, specialties pool, contract/salary gen, history backfill (~1-2 hrs)
4. Update season progression in `coaching.ts` — ratingHistory snapshots, history management, contract decrement, salary recalc (~1 hr)
5. Add store helpers in `store.ts` — getCoach selector, updateCoach action (~30 min)
6. Build coach profile page at `src/app/coach/[id]/page.tsx` (~2-3 hrs)
7. Update staff page with links, contract display, specialty tags (~30 min)
8. Save migration — bump version, backfill existing coaches (~30 min)
