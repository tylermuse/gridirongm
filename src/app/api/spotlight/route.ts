import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import crypto from 'crypto';

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

// ── Streaming helpers ──────────────────────────────────────────────────────
type StreamEvent =
  | { type: 'topic'; data: unknown }
  | { type: 'done' }
  | { type: 'error'; message: string };

function ndjsonStreamResponse(
  producer: (emit: (event: StreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // controller already closed
        }
      };
      try {
        await producer(emit);
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Streaming JSON parser that emits each top-level object as it completes.
 * Tolerant of both bare arrays ([{...},{...}]) and wrapper objects
 * ({"topics":[{...},{...}]}). Tracks string state so braces inside string
 * values don't confuse the depth counter.
 */
class TopicStreamParser {
  private inArray = false;
  private depth = 0;
  private inString = false;
  private escape = false;
  private cur = '';

  *feed(text: string): Generator<unknown> {
    for (let i = 0; i < text.length; i++) {
      const out = this.processChar(text[i]);
      if (out !== undefined) yield out;
    }
  }

  private processChar(c: string): unknown | undefined {
    if (this.escape) {
      this.escape = false;
      if (this.depth > 0) this.cur += c;
      return undefined;
    }
    if (this.inString) {
      if (this.depth > 0) this.cur += c;
      if (c === '\\') this.escape = true;
      else if (c === '"') this.inString = false;
      return undefined;
    }
    if (!this.inArray) {
      // Skip past wrapper-object key strings until the array opens.
      if (c === '"') this.inString = true;
      else if (c === '[') this.inArray = true;
      return undefined;
    }
    if (this.depth === 0) {
      if (c === '"') this.inString = true;
      else if (c === '{') {
        this.depth = 1;
        this.cur = '{';
      }
      // Otherwise ignore (whitespace, commas, ])
      return undefined;
    }
    // Inside an object: every char is part of cur.
    this.cur += c;
    if (c === '"') {
      this.inString = true;
    } else if (c === '{') {
      this.depth++;
    } else if (c === '}') {
      this.depth--;
      if (this.depth === 0) {
        const obj = this.cur;
        this.cur = '';
        try {
          return JSON.parse(obj);
        } catch (e) {
          console.warn(
            'Spotlight stream: failed to parse topic object:',
            obj.slice(0, 200),
            e instanceof Error ? e.message : e,
          );
          return undefined;
        }
      }
    }
    return undefined;
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
      return `This is the END OF REGULAR SEASON episode. Check the "madePlayoffs" field in the data.

IF madePlayoffs is TRUE:
- This is a PLAYOFFS PREVIEW. They're in! Discuss their seed and what it means.
- Break down the first-round matchup: their strengths vs the opponent's weaknesses and vice versa
- Which players need to step up in the postseason? Reference their stats.
- X-factor: one player or unit that will determine how far they go
- Bold prediction: how deep do they go?

IF madePlayoffs is FALSE or null:
- They MISSED THE PLAYOFFS. This is a season autopsy, NOT a playoff preview.
- Do NOT mention playoff matchups, seeds, or "round one" — they're not in it.
- What went wrong? Was it the QB? The defense? Injuries? Be specific with stats.
- Was this a rebuilding year or a disappointment? Grade the season.
- What are the biggest offseason priorities? QB upgrade? Draft focus? Cap moves?
- Is the coaching staff on the hot seat?

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

// Shared between streaming and non-streaming paths so prompt content stays in lockstep.
const SPOTLIGHT_SYSTEM_PROMPT = `You write the dialogue for a football GM simulation game's "Team Spotlight" — a debate show with commentators AND fan reactions.

THE VOICES:
- **Marcus Cole** (speakerId: "stats") — Analytics guy. Nate Silver meets Tony Romo. Dry wit, historical parallels, uses real stats.
- **Tony Blaze** (speakerId: "hottake") — Passion guy. Stephen A. Smith meets Pat McAfee. CAPS, bold declarations, vivid metaphors.
- **Fan Pulse** (speakerId: "fans") — The voice of the fanbase. Raw, emotional, unfiltered. SHORT punchy quotes (1-2 sentences). Fan slang — "Fire the OC!", "SUPER BOWL BABY!", "This front office is a JOKE."
- **Player Posts** (speakerId: "player") — Social media posts from actual players on the team. These are Instagram stories, tweets, postgame quotes. Use the player's REAL NAME from the data in the "playerName" field. Match tone to their situation:
  - Star playing well: confident, hyped ("Best is yet to come. We're just getting started." — with fire emojis)
  - Underpaid/expiring contract: cryptic or frustrated ("Loyalty is a two-way street..." or "Know your worth.")
  - Recently traded for: proving doubters wrong ("New city, same me. Watch.")
  - Team losing: motivational or frustrated ("We gotta be better. Period." or "I didn't come here to lose.")
  - Young player breaking out: excited and hungry ("Dreams becoming reality. God is good.")
  Keep posts SHORT (1 sentence + maybe emojis). Use the social media style — not full sentences, more vibes.

KEY RULES:
- Marcus and Tony are NEUTRAL COMMENTATORS — they ALWAYS refer to the team as "they/them/the [team name]", NEVER as "we/us/our". Only player posts use "we" (because players ARE on the team).
- Marcus and Tony RESPOND to each other.
- Add 1 fan reaction AND 1 player post per topic (not every topic needs both — alternate or mix).
- At minimum, include 2 fan reactions and 2 player posts across all topics.
- ONLY use stats that appear in the data below. Do NOT calculate, estimate, or invent ANY numbers. If the data says the record is "3-8", say "3-8" — do not say "5.2 games below .500" or make up win percentages. Use the exact numbers from the fields: wins, losses, ppg, oppPpg, pointDiff, capSpace, rankings, and player stats exactly as provided.
- THE QB IS THE STORY. Lead with QB performance. Use the "startingQB" field — this is the actual depth chart starter (QB1), NOT necessarily the highest-OVR QB. If "backupQB" exists with a "qbCompetition" note, discuss the QB battle. If the backup has more passing stats than the starter, mention the mid-season switch.
- If "trendNarrative" exists in the data, USE IT. It describes how the team and QB have been trending (winning streaks, INT rates, scoring trends). Reference these trends — "Earlier this season the INTs were piling up, but lately..." or "This winning streak has completely changed the narrative." The trend data is the key to making commentary feel like it evolves week to week.
- Each player has a "howAcquired" field. Only mention acquisition for trades/recent FA signings.
- Vary openings. Each topic: 3-4 exchanges from Marcus/Tony + fan/player reactions.
- Keep it entertaining but grounded in actual data.

Respond with a JSON array. Each element:
{
  "headline": "short topic title",
  "icon": "single emoji",
  "exchanges": [{ "speakerId": "stats" | "hottake" | "fans" | "player", "text": "dialogue line", "playerName": "only for player posts — use the actual player name from the data" }]
}

Return ONLY the JSON array, no markdown fences, no other text.`;

// Suffix appended only when calling GPT-4o-mini, which gets a json_object response_format.
const GPT_FALLBACK_SUFFIX = `\n\nIMPORTANT: Wrap your JSON array in an object like {"topics": [...]}

DETAIL & LENGTH REQUIREMENTS:
- Each exchange "text" field MUST be 2-4 sentences long, not just one sentence.
- Marcus should cite specific stats from the data and draw comparisons or historical parallels.
- Tony should be dramatic, use CAPS for emphasis, and paint vivid word pictures.
- Fan reactions should feel raw and emotional — use slang, exclamation marks, ALL CAPS.
- Player posts should feel like real social media — emojis, hashtags, attitude.
- Each topic MUST have at least 4 exchanges showing real back-and-forth (Marcus says something → Tony reacts/disagrees → Marcus counters → fan or player chimes in).
- DO NOT be brief. The user is reading this for entertainment — make it feel like a real debate show with personality and conflict.`;

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'No AI API key configured (need GEMINI_API_KEY or OPENAI_API_KEY)' }, { status: 500 });
    }

    const url = new URL(request.url);
    const wantStream = url.searchParams.get('stream') === '1';
    const { teamData, narrative = 'weekly' } = await request.json();
    if (!teamData) {
      return NextResponse.json({ error: 'teamData required' }, { status: 400 });
    }

    // Check persistent cache (Supabase → in-memory fallback)
    const key = cacheKey({ teamData, narrative });
    const cached = await getCache(key);
    if (cached) {
      if (wantStream) {
        return ndjsonStreamResponse(async (emit) => {
          for (const topic of cached) emit({ type: 'topic', data: topic });
          emit({ type: 'done' });
        });
      }
      return NextResponse.json({ topics: cached });
    }

    const narrativePrompt = buildNarrativePrompt(narrative as NarrativeMoment);
    const systemPrompt = SPOTLIGHT_SYSTEM_PROMPT;
    const userContent = `NARRATIVE CONTEXT:\n${narrativePrompt}\n\nTEAM DATA:\n${JSON.stringify(teamData)}`;

    if (wantStream) {
      return ndjsonStreamResponse(async (emit) => {
        const collected: unknown[] = [];

        // 1) Gemini 2.5 Flash streaming
        if (process.env.GEMINI_API_KEY) {
          try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContentStream({
              systemInstruction: systemPrompt,
              contents: [{ role: 'user', parts: [{ text: userContent }] }],
              generationConfig: { maxOutputTokens: 3000, responseMimeType: 'application/json' },
            });
            const parser = new TopicStreamParser();
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (!text) continue;
              for (const topic of parser.feed(text)) {
                collected.push(topic);
                emit({ type: 'topic', data: topic });
              }
            }
          } catch (geminiErr) {
            console.warn('Spotlight stream: Gemini failed, trying GPT-4o-mini:', geminiErr instanceof Error ? geminiErr.message : geminiErr);
          }
        }

        // 2) GPT-4o-mini streaming fallback (only if Gemini emitted nothing)
        if (collected.length === 0 && process.env.OPENAI_API_KEY) {
          try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const stream = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              max_tokens: 3000,
              stream: true,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt + GPT_FALLBACK_SUFFIX },
                { role: 'user', content: userContent },
              ],
            });
            const parser = new TopicStreamParser();
            for await (const chunk of stream) {
              const text = chunk.choices[0]?.delta?.content ?? '';
              if (!text) continue;
              for (const topic of parser.feed(text)) {
                collected.push(topic);
                emit({ type: 'topic', data: topic });
              }
            }
          } catch (openaiErr) {
            console.warn('Spotlight stream: GPT-4o-mini also failed:', openaiErr instanceof Error ? openaiErr.message : openaiErr);
          }
        }

        if (collected.length === 0) {
          emit({ type: 'error', message: 'All AI providers unavailable — client will use templates' });
          return;
        }
        emit({ type: 'done' });
        // Cache the full result so subsequent (streaming or not) calls return instantly.
        try {
          await setCache(key, collected);
        } catch (cacheErr) {
          console.warn('Spotlight stream: cache write failed:', cacheErr instanceof Error ? cacheErr.message : cacheErr);
        }
      });
    }

    // ── Non-streaming path (preserved as fallback) ─────────────────────────
    let raw = '';

    // 1) Gemini 2.5 Flash
    if (!raw && process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
          systemInstruction: systemPrompt,
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          generationConfig: { maxOutputTokens: 3000, responseMimeType: 'application/json' },
        });
        raw = result.response.text();
      } catch (geminiErr) {
        console.warn('Spotlight: Gemini failed, trying GPT-4o-mini:', geminiErr instanceof Error ? geminiErr.message : geminiErr);
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
            { role: 'system', content: systemPrompt + GPT_FALLBACK_SUFFIX },
            { role: 'user', content: userContent },
          ],
        });
        const content = completion.choices[0]?.message?.content;
        if (content) {
          // GPT-4o-mini with json_object mode returns an object, extract the array
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
        console.warn('Spotlight: GPT-4o-mini also failed:', openaiErr instanceof Error ? openaiErr.message : openaiErr);
      }
    }

    if (!raw) {
      return NextResponse.json({ error: 'All AI providers unavailable — client will use templates' }, { status: 503 });
    }
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) {
      console.error('Spotlight API: no JSON array found in response:', raw.slice(0, 200));
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }
    let topics;
    try {
      topics = JSON.parse(raw.slice(start, end + 1));
    } catch {
      // JSON was malformed — try to fix common issues (unescaped newlines in strings)
      try {
        const cleaned = raw.slice(start, end + 1)
          .replace(/[\x00-\x1f]/g, (c) => c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : '');
        topics = JSON.parse(cleaned);
      } catch (parseErr2) {
        console.error('Spotlight API JSON parse failed. Raw (first 500):', raw.slice(0, 500), parseErr2 instanceof Error ? parseErr2.message : parseErr2);
        return NextResponse.json({ error: 'JSON parse error' }, { status: 500 });
      }
    }

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
