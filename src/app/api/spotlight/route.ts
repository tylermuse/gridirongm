import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import crypto from 'crypto';

const anthropic = new Anthropic();

// ── Persistent cache via Supabase ──────────────────────────────────────────
// Falls back to in-memory Map if Supabase isn't configured.
// Table: ai_cache (key TEXT PRIMARY KEY, topics JSONB, created_at TIMESTAMPTZ DEFAULT now())
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (special moments are rare, cache aggressively)

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

// In-memory fallback
const memCache = new Map<string, { topics: unknown[]; ts: number }>();

function cacheKey(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

async function getCache(key: string): Promise<unknown[] | null> {
  // Try Supabase first
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from('ai_cache').select('topics, created_at').eq('key', key).single();
    if (data && Date.now() - new Date(data.created_at).getTime() < CACHE_TTL_MS) {
      return data.topics as unknown[];
    }
  }
  // Fallback to in-memory
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.topics;
  return null;
}

async function setCache(key: string, topics: unknown[]): Promise<void> {
  memCache.set(key, { topics, ts: Date.now() });
  const sb = supabaseAdmin();
  if (sb) {
    await sb.from('ai_cache').upsert({ key, topics, created_at: new Date().toISOString() }).select();
  }
}

type NarrativeMoment = 'preseason' | 'tradeDeadline' | 'playoffsStart' | 'seasonOver' | 'weekly';

function buildNarrativePrompt(narrative: NarrativeMoment): string {
  switch (narrative) {
    case 'preseason':
      return `This is the START OF A NEW SEASON — a preseason special episode. Focus on:
- Recap the offseason moves: draft picks, free agency signings, and trades. For each key acquisition, evaluate the move — was it smart? Overpay? Exactly what they needed?
- How do the new additions change the roster? Who fills a hole, who's redundant?
- Season expectations: contender, playoff team, rebuilding, or dark horse?
- One bold prediction for the season ahead

Reference how players were acquired naturally, e.g. "They signed [player] in free agency this offseason to shore up the defense and so far the front office looks brilliant" or "That second-round pick [player] has the ceiling to be special if he develops."

Generate 4-5 topics.`;

    case 'tradeDeadline':
      return `This is the TRADE DEADLINE episode — a critical midseason inflection point. Focus on:
- Midseason assessment: are they buyers, sellers, or standing pat? Use their record and rankings to make the case
- If they've made trades this season, evaluate them — were they worth it?
- Identify 1-2 position groups that are holding the team back (use the position group strength data)
- What kind of player should they target? Be specific about positions and role
- Cap space implications of any potential moves

Reference how existing players were acquired where relevant, e.g. "The trade for [player] earlier this season is already paying dividends" or "That free agency signing hasn't lived up to the contract."

Generate 4-5 topics.`;

    case 'playoffsStart':
      return `This is the PLAYOFFS PREVIEW episode — the regular season just ended and the bracket is set. Focus on:
- Final regular season assessment: did they meet, exceed, or fall short of expectations?
- Their seed and first-round matchup breakdown — strengths vs opponent's weaknesses and vice versa
- Key players who need to step up in the playoffs — reference their stats and how they were acquired
- X-factor: one player or unit that will determine how far they go
- Bold prediction: how far do they go and why?

If they missed the playoffs, discuss what went wrong and what needs to change.

Generate 4-5 topics.`;

    case 'seasonOver':
      return `This is the END OF SEASON episode — the season is OVER. Focus on:
- If they won the championship: celebrate it! Dynasty talk if multiple titles. MVP performance. How the roster was built — which acquisitions (drafts, trades, FA signings) were the key moves?
- If they were eliminated: what went wrong in the loss? Was it a successful season despite the ending? Grade the season overall.
- Looking ahead: key free agents who might leave (short contract years), draft needs, whether the window is open or closing
- Grade the key acquisitions — did drafted/traded/signed players live up to expectations?
- One move they MUST make this offseason

Generate 5-6 topics.`;

    default: // weekly
      return `This is a standard WEEKLY episode during the season. Focus on:
- Team record and trajectory — are they trending up or down?
- Standout player performances this season with their stats
- One concern and one reason for optimism
- Reference how key players were acquired where it adds context, e.g. "They brought in [player] via trade specifically for games like these" or "Their first-round pick [player] is proving the scouts right"

Generate 4-6 topics.`;
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { teamData, narrative = 'weekly' } = await request.json();
    if (!teamData) {
      return NextResponse.json({ error: 'teamData required' }, { status: 400 });
    }

    // Check persistent cache (Supabase → in-memory fallback)
    const key = cacheKey({ teamData, narrative });
    const cached = await getCache(key);
    if (cached) {
      return NextResponse.json({ topics: cached });
    }

    const narrativePrompt = buildNarrativePrompt(narrative as NarrativeMoment);

    // System prompt is static → use prompt caching to reduce input token costs ~90%
    const systemPrompt = `You write the dialogue for a football GM simulation game's "Team Spotlight" — a debate show segment where two commentators break down the user's team.

THE COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — The analytics guy. Think Nate Silver meets Tony Romo. Uses real stats but makes them interesting. Has dry wit. Occasionally surprises with a hot take or gut feeling. References historical parallels. Can be self-deprecating about being a nerd.
- **Tony Blaze** (speakerId: "hottake") — The passion guy. Think Stephen A. Smith meets Pat McAfee. Uses CAPS for emphasis, makes bold declarations, genuinely funny. But he's NOT stupid — occasionally drops surprisingly sharp analysis between the yelling. Uses vivid metaphors. Gets personally invested.

KEY RULES:
- They must RESPOND to each other, not deliver parallel monologues. Tony interrupts, Marcus corrects, they riff off each other's points.
- Use ALL the real stats and data provided below. Do NOT invent any numbers.
- Each player has a "howAcquired" field describing how THIS TEAM got them (e.g. "traded for in 2025", "signed in free agency in 2026", "drafted by this team in round 1 (2024)", or "original roster"). Only mention acquisition if it's a trade or recent FA signing that adds narrative value. Do NOT say "they drafted him" unless howAcquired says "drafted by this team". Keep acquisition references sparse — focus on stats and performance, not roster history.
- Vary your openings — never start two topics the same way.
- Each topic should have 3-4 exchanges.
- Keep it entertaining but grounded in the actual data.

Respond with a JSON array. Each element:
{
  "headline": "short topic title",
  "icon": "single emoji",
  "exchanges": [{ "speakerId": "stats" | "hottake", "text": "dialogue line" }]
}

Return ONLY the JSON array, no markdown fences, no other text.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `NARRATIVE CONTEXT:\n${narrativePrompt}\n\nTEAM DATA:\n${JSON.stringify(teamData)}`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 });
    }

    const raw = content.text;
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) {
      console.error('Spotlight API: no JSON array found in response:', raw.slice(0, 200));
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }
    const topics = JSON.parse(raw.slice(start, end + 1));

    // Cache the result persistently
    await setCache(key, topics);

    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Spotlight API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
