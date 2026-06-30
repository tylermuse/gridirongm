import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Persistent cache via Supabase ──────────────────────────────────────────
// Falls back to in-memory Map if Supabase isn't configured.
// Table: ai_cache (key TEXT PRIMARY KEY, topics JSONB, created_at TIMESTAMPTZ DEFAULT now())
// NOTE: BS Hoops shares the ai_cache table with BS Football. To prevent
// md5(JSON payload) collisions across sports — same hash, very different
// topic shape — every cache key is prefixed with `bball:` before hashing.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (special moments are rare, cache aggressively)
const CACHE_KEY_PREFIX = 'bball:';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

// In-memory fallback
const memCache = new Map<string, { topics: unknown[]; ts: number }>();

function cacheKey(data: unknown): string {
  return CACHE_KEY_PREFIX + crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
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
  | { type: 'error'; message: string; details?: { gemini?: string; openai?: string; fallback?: string } };

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

type NarrativeMoment =
  | 'preseason'
  | 'tradeDeadline'
  | 'playInStart'
  | 'playoffsStart'
  | 'allStarBreak'
  | 'seasonOver'
  | 'weekly';

function buildNarrativePrompt(narrative: NarrativeMoment): string {
  switch (narrative) {
    case 'preseason':
      return `This is OPENING NIGHT — a preseason / season-tip-off special episode. Focus on:
- Recap the offseason: lottery pick(s), free agency signings, and trades. For each major acquisition, evaluate the move — smart pickup, overpay, or exactly what they needed?
- How does the lottery hangover affect the vibe? Did they cash in the pick, or whiff?
- Roster fit: who fills a hole, who's redundant, who's coming off the bench because of new arrivals?
- Season expectations: title contender, play-in hopeful, lottery team, dark horse?
- One bold prediction for the 82 ahead

Reference how players were acquired naturally — e.g. "They drafted [player] with the No. 4 pick this summer and the upside is real" or "That sign-and-trade for [player] in July looks like a steal already."

Generate 4-5 topics.`;

    case 'tradeDeadline':
      return `This is the TRADE DEADLINE episode — the league's biggest in-season inflection point, with the buyout market right behind it. Focus on:
- Midseason assessment: buyers, sellers, or standing pat? Use record, conference seed, and rankings to make the case
- If they've already made trades this season, evaluate them — worth the assets they gave up?
- Identify 1-2 position groups holding the team back (use the position group strength data — guards, wings, or bigs)
- What kind of player should they target? Be specific — a perimeter shot-creator, a stretch big, a rim protector, a switchable wing
- Cap implications: are they above or below the apron? Tax bill risk?
- Mention the post-deadline buyout market as a way to add a vet on the cheap

Reference existing players' acquisition where relevant — e.g. "The midseason trade for [player] is already paying dividends" or "That four-year max from last summer is starting to look heavy."

Generate 4-5 topics.`;

    case 'playInStart':
      return `This is the PLAY-IN TOURNAMENT episode — the 7-10 seeds are fighting to get into the actual bracket. Focus on:
- Use the "playInOpponent" field (if present) to discuss the upcoming play-in matchup. If the team is locked as a 7-8 seed (winner gets in directly), say so; if they're 9-10 (must win two to advance), say so.
- Break down strengths vs the opponent's weaknesses — guard play, half-court defense, three-point variance.
- Which player has to be the closer? Star-level scoring + late-game shot diet.
- What's the season postmortem if they lose? Will the front office stick with this group, or blow it up?
- Bold prediction on whether they punch the ticket to the bracket.

If the team did NOT make the play-in (missed the top 10), pivot to a season postmortem instead — what went wrong, draft outlook, coaching staff status.

Generate 4-5 topics.`;

    case 'allStarBreak':
      return `This is the ALL-STAR BREAK episode — roughly halfway through the 82, the league pauses, takes stock, and the storylines crystallize. Focus on:
- Where they sit in the standings: record, conference seed, pace vs preseason expectations
- MVP race watch — if their star is in the conversation, lead with it. Per-game stats, efficiency, team success angle
- Which players got snubbed for All-Star teams? Which got named and earned it?
- Second-half outlook: do they buy at the deadline coming up, sell, or run it back?
- One position group that needs a midseason fix
- Reference how key players were acquired where it adds context

Generate 4-5 topics.`;

    case 'playoffsStart':
      return `Check the "playoffStage" and "nextPlayoffOpponent" fields FIRST — they tell you exactly where in the playoffs the team is.

IF playoffStage.winsSoFar >= 1 (the team JUST WON A PLAYOFF SERIES):
- This is a POST-SERIES, NEXT-ROUND PREVIEW. Lead with celebrating the series they just took (playoffStage.roundJustWon).
- Pivot to the next matchup: use nextPlayoffOpponent.name, .record, .star. Their strengths vs the opponent's weaknesses.
- Do NOT pretend it's still the first-round preview. They've moved on.
- Which players from this team rose to the moment? Who needs to keep producing?
- Bold prediction: do they win the next series?

IF playoffStage.winsSoFar === 0 AND madePlayoffs is TRUE:
- This is a PLAYOFFS PREVIEW. They're in the bracket. Discuss their seed.
- Break down firstRoundOpponent: their strengths vs the opponent's weaknesses, regular-season series, key matchups.
- Which player has to be the closer? X-factor off the bench. Bold prediction on how deep they go.

IF madePlayoffs is FALSE or null:
- They MISSED THE PLAYOFFS. Season autopsy, NOT a playoff preview.
- Do NOT mention playoff matchups, seeds, or "round one" — they're not in it.
- What went wrong? Specific with stats. Rebuilding year or disappointment? Lottery outlook? Coaching staff hot seat?

Generate 4-5 topics.`;

    case 'seasonOver':
      return `This is the END OF SEASON episode — the season is OVER. Focus on:
- If they won the Finals: celebrate it! Dynasty talk if multiple titles. Finals MVP performance. How the roster was built — which acquisitions (lottery picks, trades, FA signings) were the key moves?
- If they were eliminated: what went wrong in the loss? Was it a successful season despite the ending? Grade the season overall.
- Looking ahead: key free agents who might leave (expiring deals), lottery odds / draft needs, whether the window is open or closing
- Grade the key acquisitions — did drafted/traded/signed players live up to expectations?
- Award watch — was anyone a real MVP / DPOY / 6MOY / MIP / Finals MVP candidate? Did they make All-League or All-Defensive teams?
- One move they MUST make this offseason

Generate 5-6 topics.`;

    default: // weekly
      return `This is a standard WEEKLY episode during the season. Focus on:
- Team record and trajectory — winning streak / cold stretch / trending up or down
- Standout player performances — who's been hot? Who's heating up the MVP race?
- One concern and one reason for optimism
- Reference how key players were acquired where it adds context, e.g. "They traded for [player] specifically for nights like these" or "That lottery pick [player] is proving the scouts right."

Generate 4-6 topics.`;
  }
}

// Shared between streaming and non-streaming paths so prompt content stays in lockstep.
const SPOTLIGHT_SYSTEM_PROMPT = `You write the dialogue for a basketball GM simulation game's "Team Spotlight" — a debate-show segment of "Hoops Tonight", with commentators, the coaching staff, and fan reactions.

THE VOICES:
- **Mike Hartwell** (speakerId: "stats") — Analytics guy. Zach Lowe meets Steve Kerr. Dry wit, historical parallels, real numbers. Cites pace, efficiency, true shooting, lineup data when relevant.
- **Trey "Big Shot" Daniels** (speakerId: "hottake") — Hot-take guy. Stephen A. meets Kendrick Perkins. CAPS, bold declarations, vivid metaphors, declares MVPs and busts mid-sentence.
- **The Fan** (speakerId: "fans") — Voice of the fanbase. Raw, emotional, unfiltered. SHORT punchy quotes (1-2 sentences). Fan slang — "FIRE THE COACH!", "RING SEASON BABY!", "This front office can't read a scouting report."
- **Coach Vinny** + **Player Posts** (speakerId: "player") — Sideline / locker-room / social-media voice. These are Instagram stories, tweets, postgame quotes from actual players on the team OR the head coach. Use the player's REAL NAME from the data in the "playerName" field (for the head coach use "Coach Vinny" plus the actual coach's last name from data if provided, otherwise just the coach's name). Match tone to their situation:
  - Star playing well: confident, hyped ("Best is yet to come. We just getting started." — with fire emojis)
  - Underpaid / expiring contract: cryptic or frustrated ("Loyalty is a two-way street..." or "Know your worth.")
  - Recently traded for: proving doubters wrong ("New city, same me. Watch.")
  - Team losing: motivational or frustrated ("We gotta lock in. Period." or "I didn't come here to lose.")
  - Young player breaking out: excited and hungry ("Dreams becoming reality. God is good.")
  - Coach quote: measured, even-keeled, classic NBA-coach speak ("We've got a lot to clean up. We'll be in the gym tomorrow.")
  Keep posts SHORT (1 sentence + maybe emojis). Use the social media style — not full sentences, more vibes.

KEY RULES:
- **PLAYER POSTS NEVER END WITH AN EM-DASH SIGN-OFF.** The username and avatar already attribute the post in the UI header — do NOT append "— PlayerName" or "— FirstName LastName" or any em-dash + name sign-off to player exchanges. Sign-offs are reserved for retirement quotes, not first-person social posts. A line like (Locked in for the second half! — Anthony Edwards) is WRONG; the same body without the sign-off is correct.
- Mike and Trey are NEUTRAL COMMENTATORS — they ALWAYS refer to the team as "they/them/the [team name]", NEVER as "we/us/our". Only player posts use "we" (because players ARE on the team).
- Mike and Trey NEVER use hashtags (#HoopGang, #BringIt) or player-style hype emojis (💯, 🔥, 💪, 🏀 etc). Those are PLAYER signals — if a line ends in a hashtag or hype emoji it MUST be speakerId "player", not "stats" or "hottake". Trey's emphasis is CAPS in regular sentences, not hashtags.
- Mike and Trey RESPOND to each other.
- Add 1 fan reaction AND 1 player/coach post per topic (not every topic needs both — alternate or mix).
- At minimum, include 2 fan reactions and 2 player/coach posts across all topics.
- ONLY use stats that appear in the data below. Do NOT calculate, estimate, or invent ANY numbers. If the data says the record is "31-22", say "31-22" — do not invent win percentages or pace numbers. Use the exact fields: wins, losses, ppg, oppPpg, pointDiff, capSpace, rankings, and player stats (PPG / RPG / APG / TS%) exactly as provided.
- THE STAR IS THE STORY. Lead with the team's franchise player — use the "topPlayers" field, paying special attention to the player whose starTier is "superstar" or "star". If they're in the MVP / All-League conversation, say so. If they're underperforming, say that too.
- If "trendNarrative" exists in the data, USE IT. It describes how the team and star have been trending (win streaks, hot shooting stretches, scoring runs, defensive slumps). Reference these trends — "Earlier this season the threes weren't falling, but lately..." or "This 8-game win streak has flipped the narrative." The trend data is the key to making commentary feel like it evolves through the season.
- Each player has a "howAcquired" field. Only mention acquisition for recent trades, FA signings, or lottery picks where relevant.
- Vary openings. Each topic: 3-4 exchanges from Mike/Trey + fan/player reactions.
- Keep it entertaining but grounded in actual data.
- **TOPIC #1 IS A FAST OPENER** — exactly 2 short exchanges (1 from Mike, 1 from Trey), each 1 sentence. The headline should be a punchy hook. This topic ships quickly so the user sees content immediately; later topics carry the depth and the back-and-forth.

Respond with a JSON array. Each element:
{
  "headline": "short topic title",
  "icon": "single emoji",
  "exchanges": [{ "speakerId": "stats" | "hottake" | "fans" | "player", "text": "dialogue line", "playerName": "only for player/coach posts — use the actual player or coach name from the data" }]
}

Return ONLY the JSON array, no markdown fences, no other text.`;

// Suffix appended only when calling GPT-4o-mini, which gets a json_object response_format.
const GPT_FALLBACK_SUFFIX = `\n\nIMPORTANT: Wrap your JSON array in an object like {"topics": [...]}

DETAIL & LENGTH REQUIREMENTS:
- TOPIC #1 IS THE FAST OPENER — exactly 2 short exchanges (Mike 1 sentence, Trey 1 sentence). Skip the depth requirement here so it streams quickly.
- Topics #2 onward: each exchange "text" field MUST be 2-4 sentences long, not just one sentence.
- Mike should cite specific stats from the data and draw comparisons or historical parallels.
- Trey should be dramatic, use CAPS for emphasis, and paint vivid word pictures.
- Fan reactions should feel raw and emotional — use slang, exclamation marks, ALL CAPS.
- Player posts should feel like real social media — emojis, hashtags, attitude. Coach quotes should sound measured.
- Topics #2 onward MUST have at least 4 exchanges showing real back-and-forth (Mike says something → Trey reacts/disagrees → Mike counters → fan or player chimes in).
- For topics #2 onward DO NOT be brief — make it feel like a real debate show with personality and conflict.`;

/**
 * Defensive cleanup pass — even with the prompt rule, LLMs occasionally still
 * append "— PlayerName" sign-offs to player posts. This scrubber walks each
 * topic's exchanges and strips any trailing em-dash + name pattern from
 * speakerId === 'player' lines.
 */
function stripPlayerSignoff(text: string): string {
  if (!text) return text;
  const trailingEmojis = '(?:[\\s\\p{Extended_Pictographic}\\p{Emoji_Presentation}]*)';
  const re = new RegExp(`\\s*[—-]{1,2}\\s+[A-Z][A-Za-z'.\\-]+(?:\\s+[A-Z][A-Za-z'.\\-]+){0,2}${trailingEmojis}\\s*$`, 'u');
  return text.replace(re, '').trim();
}

interface SpotlightExchange {
  speakerId?: string;
  text?: string;
  playerName?: string;
}

interface SpotlightTopic {
  exchanges?: SpotlightExchange[];
}

function scrubTopicSignoffs(topic: unknown): unknown {
  if (!topic || typeof topic !== 'object') return topic;
  const t = topic as SpotlightTopic;
  if (!Array.isArray(t.exchanges)) return topic;
  for (const ex of t.exchanges) {
    if (ex && ex.speakerId === 'player' && typeof ex.text === 'string') {
      ex.text = stripPlayerSignoff(ex.text);
    }
  }
  return topic;
}

interface NonStreamingResult {
  topics: unknown[] | null;
  errors: { gemini?: string; openai?: string };
}

/**
 * Non-streaming topic generation. Used directly by the legacy code path AND
 * as a fallback inside the streaming path when streaming returns nothing —
 * because some hosting environments / SDK versions don't deliver streamed
 * chunks reliably even when the same providers work fine for buffered calls.
 */
async function generateTopicsNonStreaming(
  systemPrompt: string,
  userContent: string,
): Promise<NonStreamingResult> {
  const errors: NonStreamingResult['errors'] = {};
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
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      errors.gemini = msg;
      console.warn('Spotlight: Gemini failed, trying GPT-4o-mini:', msg);
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
      const msg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
      errors.openai = msg;
      console.warn('Spotlight: GPT-4o-mini also failed:', msg);
    }
  }

  if (!raw) return { topics: null, errors };

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) {
    console.error('Spotlight: no JSON array found in response:', raw.slice(0, 200));
    return { topics: null, errors };
  }
  try {
    return { topics: JSON.parse(raw.slice(start, end + 1)) as unknown[], errors };
  } catch {
    // JSON was malformed — try to fix common issues (unescaped newlines in strings)
    try {
      const cleaned = raw.slice(start, end + 1)
        .replace(/[\x00-\x1f]/g, (c) => c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : '');
      return { topics: JSON.parse(cleaned) as unknown[], errors };
    } catch (parseErr2) {
      console.error('Spotlight JSON parse failed. Raw (first 500):', raw.slice(0, 500), parseErr2 instanceof Error ? parseErr2.message : parseErr2);
      return { topics: null, errors };
    }
  }
}

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
        const streamErrors: { gemini?: string; openai?: string } = {};

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
                const scrubbed = scrubTopicSignoffs(topic);
                collected.push(scrubbed);
                emit({ type: 'topic', data: scrubbed });
              }
            }
          } catch (geminiErr) {
            const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
            streamErrors.gemini = msg;
            console.warn('Spotlight stream: Gemini failed, trying GPT-4o-mini:', msg);
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
                const scrubbed = scrubTopicSignoffs(topic);
                collected.push(scrubbed);
                emit({ type: 'topic', data: scrubbed });
              }
            }
          } catch (openaiErr) {
            const msg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
            streamErrors.openai = msg;
            console.warn('Spotlight stream: GPT-4o-mini also failed:', msg);
          }
        }

        // 3) Non-streaming fallback. Some environments (Vercel/Turbopack edge
        // cases, SDK quirks) refuse to deliver streamed chunks even when the
        // same providers work fine for buffered calls. If we got zero topics
        // from streaming, run the non-streaming path and emit the whole batch
        // at once. The user loses the progressive-render UX but gets working
        // AI commentary instead of falling back to templates.
        let usedFallback = false;
        let fallbackErr: string | undefined;
        if (collected.length === 0) {
          console.warn('Spotlight stream: zero topics from streaming, falling back to non-streaming');
          const fb = await generateTopicsNonStreaming(systemPrompt, userContent);
          if (fb.topics && fb.topics.length > 0) {
            usedFallback = true;
            for (const topic of fb.topics) {
              const scrubbed = scrubTopicSignoffs(topic);
              collected.push(scrubbed);
              emit({ type: 'topic', data: scrubbed });
            }
          } else {
            fallbackErr = `non-streaming also empty (gemini: ${fb.errors.gemini ?? 'ok'}, openai: ${fb.errors.openai ?? 'ok'})`;
          }
        }

        if (collected.length === 0) {
          emit({
            type: 'error',
            message: 'All AI providers unavailable — client will use templates',
            details: { gemini: streamErrors.gemini, openai: streamErrors.openai, fallback: fallbackErr },
          });
          return;
        }
        emit({ type: 'done' });
        // Cache the full result so subsequent (streaming or not) calls return instantly.
        try {
          await setCache(key, collected);
        } catch (cacheErr) {
          console.warn('Spotlight stream: cache write failed:', cacheErr instanceof Error ? cacheErr.message : cacheErr);
        }
        if (usedFallback) {
          console.warn('Spotlight stream: served from non-streaming fallback', { streamErrors });
        }
      });
    }

    // ── Non-streaming path (preserved as fallback for callers that don't request stream) ──
    const { topics, errors } = await generateTopicsNonStreaming(systemPrompt, userContent);
    if (!topics || topics.length === 0) {
      return NextResponse.json(
        { error: 'All AI providers unavailable — client will use templates', details: errors },
        { status: 503 },
      );
    }

    // Cache the result persistently
    const scrubbedTopics = topics.map(scrubTopicSignoffs);
    await setCache(key, scrubbedTopics);

    return NextResponse.json({ topics: scrubbedTopics });
  } catch (err) {
    console.error('Spotlight API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
