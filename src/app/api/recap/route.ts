import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Persistent cache via Supabase ──────────────────────────────────────────
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

const memCache = new Map<string, { topics: unknown[]; ts: number }>();

function cacheKey(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

async function getCache(key: string): Promise<unknown[] | null> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from('ai_cache').select('topics, created_at').eq('key', key).single();
    if (data && Date.now() - new Date(data.created_at).getTime() < CACHE_TTL_MS) {
      return data.topics as unknown[];
    }
  }
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

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'No AI API key configured (need GEMINI_API_KEY or OPENAI_API_KEY)' }, { status: 500 });
    }

    const { games, season, week, isPlayoffs } = await request.json();
    if (!games || !Array.isArray(games) || games.length === 0) {
      return NextResponse.json({ error: 'games array required' }, { status: 400 });
    }

    // Check persistent cache (Supabase → in-memory fallback)
    const key = cacheKey({ games, season, week });
    const cached = await getCache(key);
    if (cached) {
      return NextResponse.json({ topics: cached });
    }

    const weekContext = isPlayoffs
      ? `This is the PLAYOFFS — ${week === 101 ? 'Wild Card Round' : week === 102 ? 'Divisional Round' : week === 103 ? 'Conference Championships' : week === 104 ? 'The Championship Game' : `Playoff Round ${week - 100}`}. The stakes are EVERYTHING.`
      : `This is Week ${week} of an 18-week regular season.`;

    // System prompt is static → use prompt caching to reduce input token costs ~90%
    const systemPrompt = `You write "Gridiron Tonight" — a post-game breakdown. Two commentators do a deep dive on the user's team game.

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

JSON array: [{ "headline": "...", "icon": "emoji", "context": "box score", "exchanges": [{ "speakerId": "stats"|"hottake", "text": "..." }] }]

Return ONLY the JSON array.`;

    // Try Gemini first (cheapest), then GPT-4o-mini (cheap + reliable), then give up (client uses templates)
    const userContent = `Season ${season}, ${weekContext}\n\nGAME:\n${JSON.stringify(games)}`;
    let raw = '';

    // 1) Gemini 2.5 Flash
    if (!raw && process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
          systemInstruction: systemPrompt,
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          generationConfig: { maxOutputTokens: 2000, responseMimeType: 'application/json' },
        });
        raw = result.response.text();
      } catch (geminiErr) {
        console.warn('Recap: Gemini failed, trying GPT-4o-mini:', geminiErr instanceof Error ? geminiErr.message : geminiErr);
      }
    }

    // 2) GPT-4o-mini fallback (very cheap + very reliable)
    if (!raw && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 3000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt + `\n\nIMPORTANT: Wrap your JSON array in an object like {"topics": [...]}

DETAIL & LENGTH REQUIREMENTS:
- Each exchange "text" field MUST be 2-4 sentences long, not just one sentence.
- Marcus should cite specific stats from the game data and break down what they mean.
- Tony should be dramatic, use CAPS for emphasis, and react with real emotion to big plays and performances.
- Each topic MUST have at least 3-4 exchanges showing real back-and-forth debate between Marcus and Tony — they should RESPOND to each other, agree, disagree, and build on each other's points.
- The "context" field should include a detailed box score summary with key stats.
- DO NOT be brief. The user is reading this for entertainment — make it feel like a real post-game show with personality, banter, and analysis.` },
            { role: 'user', content: userContent },
          ],
        });
        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            raw = JSON.stringify(parsed);
          } else if (parsed.topics && Array.isArray(parsed.topics)) {
            raw = JSON.stringify(parsed.topics);
          } else {
            raw = content;
          }
        }
      } catch (openaiErr) {
        console.warn('Recap: GPT-4o-mini also failed:', openaiErr instanceof Error ? openaiErr.message : openaiErr);
      }
    }

    if (!raw) {
      return NextResponse.json({ error: 'All AI providers unavailable — client will use templates' }, { status: 503 });
    }
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
    // Cache the result persistently
    await setCache(key, topics);

    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Recap API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
