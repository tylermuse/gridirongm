import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

const anthropic = new Anthropic();

// Server-side cache: survives across requests within the same serverless instance.
// Key = content hash of game data, Value = { topics, timestamp }.
// Entries expire after 1 hour. Max 200 entries to bound memory.
const cache = new Map<string, { topics: unknown[]; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_MAX = 200;

function cacheKey(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function pruneCache() {
  if (cache.size <= CACHE_MAX) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const toRemove = entries.slice(0, entries.length - CACHE_MAX);
  for (const [k] of toRemove) cache.delete(k);
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { games, season, week, isPlayoffs } = await request.json();
    if (!games || !Array.isArray(games) || games.length === 0) {
      return NextResponse.json({ error: 'games array required' }, { status: 400 });
    }

    // Check server-side cache
    const key = cacheKey({ games, season, week });
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ topics: cached.topics });
    }

    const weekContext = isPlayoffs
      ? `This is the PLAYOFFS — ${week === 101 ? 'Wild Card Round' : week === 102 ? 'Divisional Round' : week === 103 ? 'Conference Championships' : week === 104 ? 'The Championship Game' : `Playoff Round ${week - 100}`}. The stakes are EVERYTHING.`
      : `This is Week ${week} of an 18-week regular season.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You write "Gridiron Tonight" — a post-game breakdown. Two commentators do a deep dive on the user's team game.

COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — Analytics guy. Dry wit, historical parallels. Uses actual stats.
- **Tony Blaze** (speakerId: "hottake") — Passion guy. CAPS, bold declarations, vivid metaphors.

Generate 3-4 topics about THIS GAME:
1. **Game result** — headline = score (e.g. "Cowboys 31, Eagles 17"). Who won and why.
2. **QB duel** — compare both QBs' stats. Who outplayed whom?
3. **Key matchup** — what decided it? Run game, defense, big play?
4. **What's next** — what this means for both teams going forward.

Each topic: 3 exchanges. Context field = box score summary.
Do NOT invent stats. If a storyline type is provided (upset, comeback, blowout), lean into it.

Season ${season}, ${weekContext}

GAME:
${JSON.stringify(games, null, 2)}

JSON array: [{ "headline": "...", "icon": "emoji", "context": "box score", "exchanges": [{ "speakerId": "stats"|"hottake", "text": "..." }] }]

Return ONLY the JSON array.`,
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
      console.error('Recap API: no JSON array found in response:', raw.slice(0, 200));
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }
    let topics;
    try {
      topics = JSON.parse(raw.slice(start, end + 1));
    } catch (parseErr) {
      console.error('Recap API JSON parse failed. Raw (first 500):', raw.slice(0, 500));
      return NextResponse.json({ error: 'JSON parse error' }, { status: 500 });
    }
    // Cache the result
    cache.set(key, { topics, ts: Date.now() });
    pruneCache();

    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Recap API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
