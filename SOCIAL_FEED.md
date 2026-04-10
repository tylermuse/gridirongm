# Social Media Feed — Implementation Spec

## Overview

Add a **"Social"** tab to the existing News page that shows a generated social media feed. Posts come from players on your team, fans, Tony Blaze, Marcus Cole, and other league personalities. Each post is driven by actual game state — mood, contract status, depth chart position, team performance, recent transactions — so the feed functions as a narrative window into your team's hidden dynamics.

The feed generates **5-8 posts per game week**, with spikes after big events. Posts from unhappy or underpaid players include **actionable shortcuts** ("Offer Extension", "View Contract", "Open Trade Finder") so the user can respond directly.

---

## Post Types and Authors

### Author Types

```typescript
type SocialPostAuthor =
  | { type: 'player'; playerId: string; name: string; handle: string; avatar: string; verified: boolean }
  | { type: 'fan'; handle: string; avatar: string }
  | { type: 'media'; personId: 'tony_blaze' | 'marcus_cole'; name: string; handle: string; avatar: string; verified: boolean }
  | { type: 'team'; teamId: string; name: string; handle: string; avatar: string; verified: boolean };
```

**Player handles** — generated from player name: `@${firstName[0]}${lastName}${jersey}` e.g. `@JSmith22`. Verified checkmark for OVR ≥ 75.

**Fan handles** — random from a pool: `@GridironFanatic`, `@CapSpaceKing`, `@TankNation`, `@DraftSzn`, `@FireTheCoach`, `@InBillyWeTrust`, `@RingChaser2026`, etc. Use deterministic seed + week to pick.

**Media** — Tony Blaze (`@TonyBlazeNFLC`, 🔥, verified) and Marcus Cole (`@MarcusColeNFLC`, 🤓, verified). Use their existing personalities from `debate.ts`.

**Team account** — `@{TeamAbbr}Official`, for announcements (signing, extension, trade).

### Post Structure

```typescript
interface SocialPost {
  id: string;
  author: SocialPostAuthor;
  text: string;
  timestamp: { season: number; week: number };
  likes: number;        // generated, flavor only
  reposts: number;      // generated, flavor only
  replies: number;      // generated, flavor only
  // Optional action shortcut
  action?: {
    label: string;      // "Offer Extension", "View Contract", etc.
    type: 'extend' | 'trade' | 'viewPlayer' | 'viewRoster' | 'negotiate';
    playerId?: string;
  };
  // Post category for filtering
  category: 'player' | 'fan' | 'media' | 'team';
}
```

---

## Post Generation

### When Posts Are Generated

Generate posts in `generateSocialPosts()` — a new pure function called alongside `generateWeekNews()` during weekly sim. Posts are stored in a new `socialPosts` array in LeagueState (NOT in `newsItems` — these are a separate feed with a different tone and structure).

Also generate posts during offseason transitions (re-signing, draft, free agency, extensions).

### Generation Function

```typescript
function generateSocialPosts(
  state: LeagueState,
  recentGames: GameResult[],  // this week's games
): SocialPost[]
```

The function should generate 5-8 posts per week by scanning game state and picking the highest-priority triggers. Here are all the triggers, organized by author type:

---

## Player Posts

These are the core of the feed. Driven by mood, contract, performance, and team situation.

### Happy / Winning Posts (mood ≥ 70, team winning)

```typescript
// After a win
'Another W. This team is special. 💪',
'Can\'t stop won\'t stop. On to the next one 🏈',
'Best locker room I\'ve ever been in. We got something here.',
'[X]-[Y] and we\'re just getting started 🔥',

// After a big personal game (top performer)
'God is good. Blessed to play the game I love 🙏',
'When the work pays off >>> Put in the hours, get the results.',
'Shoutout to my teammates. I don\'t do this without y\'all.',

// After signing extension
'Locked in. Let\'s go get that ring 🔒',
'Home is home. Blessed to be here long-term 🏠',
'They believe in me. I believe in them. Let\'s build something special.',
```

**Action:** None (these are positive — no action needed).

### Unhappy / Underpaid Posts (mood < 50 OR salary < 70% of market)

These are the WARNING SIGNS the user needs to see:

```typescript
// Cryptic contract posts (underpaid, salary < 70% market)
'Bet on yourself. Always. 💯',
'Know your worth. Then add tax.',
'Some things gotta change... but God\'s timing is perfect 🙏',
'Grinding every day for this team. Hope they see the value.',
'Watching guys with half my production get paid... interesting.',

// Unhappy mood posts (mood < 40)
'Can\'t control what I can\'t control. Just gotta keep working.',
'Sometimes you gotta put yourself first.',
'Loyalty is a two-way street. Just saying.',
'Not gonna lie... been a tough year mentally. But we keep pushing.',

// Losing team + unhappy
'We gotta be better. ALL of us. This isn\'t good enough.',
'Hard to stay positive when the results aren\'t there. Something needs to change.',
'I didn\'t come here to lose. Period.',

// Benched / depth chart (not starting, OVR > starter OVR - 5)
'Ready whenever my number is called. Stay patient, stay ready.',
'God didn\'t bring me this far to sit on the bench.',
'Trust the process... I guess.',
```

**Action shortcuts:**
- Underpaid → `{ label: 'Offer Extension', type: 'extend', playerId }`
- Unhappy + underpaid → `{ label: 'Offer Extension', type: 'extend', playerId }`
- Unhappy + adequate pay → `{ label: 'View Player', type: 'viewPlayer', playerId }`
- Benched → `{ label: 'View Depth Chart', type: 'viewRoster' }`

### Holdout Posts

```typescript
// Active holdout
'I\'ve given everything to this organization. Time for them to show they value me. ✊',
'Not about the money. It\'s about RESPECT.',
'Holding firm. I know what I\'m worth and I won\'t settle for less.',
'To the fans — I love y\'all. This is between me and the front office.',
```

**Action:** `{ label: 'Resolve Holdout', type: 'extend', playerId }`

### Post-Trade Posts

```typescript
// Player traded away
'New chapter. Excited for what\'s ahead. Thank you [City] for everything ❤️',
'Wasn\'t my choice but I\'m gonna make the best of it. Watch me.',

// Player traded TO your team
'Excited to be in [City]! Let\'s get to work 💪',
'New city, new team, same grind. Ready to prove myself.',
```

### Retirement Posts

```typescript
'What a ride. Thank you to everyone who believed in me. Hanging up the cleats. 🙏',
'[X] seasons. Wouldn\'t trade it for anything. Time to start the next chapter.',
```

---

## Fan Posts

Reactive, emotional, and sometimes irrational. Driven by team record and recent moves.

### Winning Team (win% ≥ .600)

```typescript
'This team is DIFFERENT this year 🔥🔥🔥',
'Haven\'t been this excited since the [recent championship year] run. LFG',
'[Team] are FRAUDS if they don\'t make the playoffs this year. No excuses.',
'Best roster in the league. Don\'t @ me.',
```

### Losing Team (win% < .350)

```typescript
'Fire the coach. Trade everyone. Blow it up. Start over.',
'Another week, another L. Why do I do this to myself 😭',
'Tanking is a strategy right? RIGHT?? 🥲',
'At least we\'ll have a good draft pick... pain.',
'Front office has NO idea what they\'re doing.',
```

### After Big Signing / Extension

```typescript
// Good signing (OVR ≥ 75)
'LEAGUE ON NOTICE 🚨 Welcome to [City], [Player]!',
'LET\'S GOOOOO. Finally a front office that gets it.',
'This changes EVERYTHING. Playoff team.',

// Overpay (salary > 120% market)
'We paid HOW MUCH for [Player]?? 😬',
'That\'s... a lot of money. Hope it works out.',
'Cap space is a myth I guess 💸',

// Letting a fan favorite go
'Can\'t believe we let [Player] walk. Unforgivable.',
'[Player] gave us everything and we just let him leave. Disgusting.',
```

### After Draft Pick

```typescript
'In [Player] we trust! Welcome to [City] 🎯',
'Never heard of this guy but I trust the process... I think.',
'STEAL of the draft. Other teams are punching air rn.',
```

---

## Tony Blaze Posts

Hot takes, ALL CAPS energy, provocative. Use his personality from `debate.ts`.

### Team Performance

```typescript
// After big win
'I\'ve been saying it ALL SEASON — [Team] are the REAL DEAL. Marcus can crunch his numbers all he wants, this team has HEART.',
'STATEMENT GAME. If you\'re not taking [Team] seriously after that, you\'re not watching football.',

// After bad loss
'I\'m sorry but that was EMBARRASSING. [Team] looked completely lost out there. Something is WRONG in that locker room.',
'Somebody check on [Team] fans because that was PAINFUL to watch 💀',

// Playoff hot take
'I\'m going on the record RIGHT NOW: [Team] is winning it all. Book it. BOOK IT. 🏆',
```

### Player/Contract Takes

```typescript
// Underpaid star
'[Player] is playing on a JOKE of a contract. If that front office doesn\'t pay this man, they don\'t deserve him. PERIOD.',
'Sources tell me [Player] is NOT happy about his contract situation. And honestly? I don\'t blame him.',

// Big extension
'[Player] just got PAID and you know what? He\'s WORTH EVERY PENNY. This man is a BALLER.',

// Holdout
'[Player] is holding out and the fans are blaming HIM?? Are you KIDDING me? PAY THE MAN.',
```

### Controversy/Drama

```typescript
// Multiple unhappy players
'I\'m hearing things out of [City] and they are NOT good. Multiple players frustrated. Locker room is TENSE.',
'When you\'ve got [X] guys unhappy with their contracts, that\'s not a player problem — that\'s a FRONT OFFICE problem.',
```

---

## Marcus Cole Posts

Data-driven, measured, analytical. Counterbalances Tony's heat.

### Team Performance

```typescript
// After win
'[Team] now 3rd in the league in point differential (+67). The underlying numbers support what we\'re seeing on the field.',
'Interesting trend: [Team] has won [X] straight and their average margin of victory is [Y]. Sustainable? Let\'s see.',

// After loss
'One bad week doesn\'t erase the body of work. [Team] still ranks top-10 in scoring efficiency. Don\'t overreact.',

// Struggling team
'The numbers are concerning for [Team]. Bottom-5 in scoring, top-5 in turnovers. Those are rebuilding team metrics.',
```

### Player/Contract Takes

```typescript
// Underpaid star
'By the numbers: [Player] is producing at a $[X]M/yr level while earning $[Y]M. That\'s a [Z]% underpay — historically, that leads to holdouts.',
'Market data suggests [Player] should be earning roughly $[X]M/yr. The current deal is significantly below market.',

// Extension analysis
'[Player]\'s extension: $[X]M/yr for [Y] years. Market value was $[Z]M. A [premium]% premium, but you\'re paying for certainty and avoiding free agency risk. Smart business.',

// Trade value
'Fun stat: [Player] ranks [Xth] at his position in [stat]. At $[Y]M/yr, he might be the best value contract on the roster.',
```

---

## Post Generation Priority System

Each potential post gets a **priority score**. Generate all candidates, sort by priority, take top 5-8. This ensures the most important/dramatic posts surface.

```typescript
// Priority scoring:
// Holdout active:           100
// Player traded (your team): 95
// Extension signed:          90
// Player with mood < 25:     85
// Big win (playoff):         85
// Tony Blaze locker room report (2+ unhappy): 82
// Underpaid star (ratio > 2x): 80
// After big personal performance: 75
// Signing major FA:          75
// Fan reaction to loss:      70
// Fan reaction to win:       65
// Marcus stat analysis:      60
// Happy player vibes:        50
// General fan banter:        40
// Team account announcement: 35
```

### Deduplication Rules

- Max 2 player posts per week (pick the most dramatic)
- Max 2 fan posts per week
- Max 1 Tony Blaze post per week
- Max 1 Marcus Cole post per week
- Max 1 team account post per week
- Always include at least 1 player post and 1 fan post

---

## Engagement Numbers (Flavor)

Generate deterministically based on post author + priority:

```typescript
function generateEngagement(author: SocialPostAuthor, priority: number, seed: number) {
  const base = author.type === 'media' ? 5000
    : author.type === 'player' && author.verified ? 2000
    : author.type === 'player' ? 500
    : author.type === 'team' ? 3000
    : 100; // fan

  const multiplier = priority / 50; // higher priority = more engagement
  const variance = 0.5 + (seed % 100) / 100; // 0.5x to 1.5x

  return {
    likes: Math.round(base * multiplier * variance),
    reposts: Math.round(base * multiplier * variance * 0.15),
    replies: Math.round(base * multiplier * variance * 0.25),
  };
}
```

---

## Data Model

### New fields in `LeagueState` (`src/types/index.ts`):

```typescript
/** Social media feed posts */
socialPosts: SocialPost[];
```

### SocialPost interface (add to types):

```typescript
interface SocialPost {
  id: string;
  author: {
    type: 'player' | 'fan' | 'media' | 'team';
    playerId?: string;
    personId?: 'tony_blaze' | 'marcus_cole';
    teamId?: string;
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  text: string;
  timestamp: { season: number; week: number };
  likes: number;
  reposts: number;
  replies: number;
  action?: {
    label: string;
    type: 'extend' | 'trade' | 'viewPlayer' | 'viewRoster' | 'negotiate';
    playerId?: string;
  };
  category: 'player' | 'fan' | 'media' | 'team';
}
```

---

## UI — Social Tab on News Page

### Add "Social" filter tab

In `src/app/news/page.tsx`, add a new tab to the existing filter row:

```typescript
const tabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'myteam', label: 'My Team' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'injuries', label: 'Injuries' },
  { key: 'social', label: 'Social' },  // NEW
];
```

When "Social" is selected, render the social feed instead of the news items.

### Social Post Card Design

Each post should look like a social media post (think Twitter/X):

```
┌──────────────────────────────────────────────────────┐
│  🏈 Jaylen Carter @JCarter22 ✓         Week 8, S1   │
│                                                      │
│  Bet on yourself. Always. 💯                         │
│                                                      │
│  ♡ 2.4K    🔁 312    💬 187                          │
│                                                      │
│  [Offer Extension]  ← subtle action link             │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  🔥 Tony Blaze @TonyBlazeNFLC ✓        Week 8, S1   │
│                                                      │
│  I'm hearing things out of Chicago and they are NOT  │
│  good. Multiple players frustrated. Locker room is   │
│  TENSE. Somebody in that front office needs to start │
│  writing checks. 💰                                  │
│                                                      │
│  ♡ 8.1K    🔁 1.2K    💬 943                         │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  😤 @FireTheCoach                       Week 8, S1   │
│                                                      │
│  Another week, another L. Why do I do this to        │
│  myself 😭 At least we'll have a good draft pick.    │
│                                                      │
│  ♡ 89    🔁 12    💬 34                               │
└──────────────────────────────────────────────────────┘
```

### Visual Differentiation by Author Type

- **Player posts**: White/default background. Player name is a clickable link (opens PlayerModal). Verified checkmark (✓) for OVR ≥ 75.
- **Fan posts**: Slightly different avatar style (emoji-only, no checkmark). Gray/muted text color for the handle.
- **Tony Blaze**: Red-tinted left border (like his debate bubble color). 🔥 avatar.
- **Marcus Cole**: Blue-tinted left border. 🤓 avatar.
- **Team account**: Team primary color left border. Team logo/emoji avatar.

### Action Shortcuts

When a post has an `action`, show it as a subtle text link below the engagement numbers:

```tsx
{post.action && (
  <button
    onClick={() => handleAction(post.action)}
    className="text-xs text-blue-600 hover:underline mt-1"
  >
    {post.action.label} →
  </button>
)}
```

The action handler:
- `'extend'` → navigate to roster page with the player's contract section open (or open extension negotiation modal)
- `'trade'` → navigate to trade page
- `'viewPlayer'` → open PlayerModal
- `'viewRoster'` → navigate to roster page
- `'negotiate'` → navigate to free agency page (for FA period posts)

---

## Post Generation Integration

### During Weekly Sim

In `store.ts`, after `generateWeekNews()` is called in the sim loop, also call:

```typescript
const newSocialPosts = generateSocialPosts(state, weekGames);
set({
  socialPosts: [...state.socialPosts, ...newSocialPosts],
});
```

### During Offseason Events

Generate social posts after:
- **Extension signed** → player post + fan post + possible Tony/Marcus take
- **Trade executed** → player posts (both sides) + fan reaction
- **FA signing** → team account + fan reaction
- **Draft pick** → fan reaction + possible media take
- **Holdout begins** → player post + Tony Blaze take
- **Re-signing** → player post + team account

### Pruning

To prevent the `socialPosts` array from growing unbounded, prune posts older than 2 seasons during `startNewSeason`:

```typescript
socialPosts: state.socialPosts.filter(p => state.season - p.timestamp.season <= 2),
```

---

## New File

### `src/lib/engine/social.ts`

This is where `generateSocialPosts()` and all the post template logic lives. Keep it as a pure function file (no store dependency), same pattern as `recap.ts` and `debate.ts`.

---

## Summary of Files to Change

1. **`src/types/index.ts`** — Add `SocialPost` interface, add `socialPosts: SocialPost[]` to LeagueState
2. **`src/lib/engine/social.ts`** — NEW FILE: `generateSocialPosts()` with all templates and priority logic
3. **`src/lib/engine/store.ts`** — Call `generateSocialPosts()` during weekly sim and offseason events, add to state, prune on season start
4. **`src/app/news/page.tsx`** — Add "Social" tab, render social feed with post cards, action shortcuts, author styling
5. **`src/lib/engine/debate.ts`** — No changes (Tony/Marcus personalities already defined, social.ts can import the commentator data)
