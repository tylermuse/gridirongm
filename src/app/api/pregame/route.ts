/**
 * Pregame Show (Premium) — an LLM writes the Marcus Cole / Tony Blaze
 * pregame breakdown from the compact PregameFacts the client builds.
 *
 * Free users get the templated show client-side and never call this route.
 * Any non-200 here makes the client fall back to that template, so failures
 * are never user-visible beyond a less specific show.
 *
 * Cached in the shared `ai_cache` table (same as /api/recap) keyed by an md5
 * of the facts, so reopening the same pregame is free.
 */

import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai';
import OpenAI from 'openai';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { readCredits, getServiceClient } from '@bs/core/podcast';
import { parseAiPregame, type PregameFacts } from '@/lib/engine/pregameShow';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

const memCache = new Map<string, { show: unknown; ts: number }>();

async function getCache(key: string): Promise<unknown | null> {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from('ai_cache').select('topics, created_at').eq('key', key).single();
    if (data && Date.now() - new Date(data.created_at).getTime() < CACHE_TTL_MS) return data.topics;
  }
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.show;
  return null;
}

async function setCache(key: string, show: unknown): Promise<void> {
  memCache.set(key, { show, ts: Date.now() });
  const sb = supabaseAdmin();
  if (sb) await sb.from('ai_cache').upsert({ key, topics: show, created_at: new Date().toISOString() }).select();
}

const SYSTEM_PROMPT = `You write the pregame show for a football GM game. Two analysts break down the upcoming game before kickoff.

ANALYSTS:
- Marcus Cole (speakerId "stats") — analytics guy. Measured, dry wit, cites the numbers he's given.
- Tony Blaze (speakerId "hottake") — passion guy. CAPS for emphasis, bold calls, vivid metaphors.

Write 12-16 exchanges that feel like a real back-and-forth: they respond to each other, agree, argue.
Cover, in order: the setup (records, stakes, streaks), the quarterback matchup, the key unit-vs-unit
matchup (use the league ranks — rank 1 is best), an X-factor player, any injuries, then each analyst's pick.
Each "text" is 1-3 sentences. Refer to teams by city or nickname, not abbreviations.

RULES:
- Use ONLY the facts provided. Never invent stats, players, injuries or history.
- Go deep on player production. Each player fact has a "statLine" (full season line), "season" (raw +
  per-game + efficiency numbers: completion %, yards per attempt, passer rating, yards per carry, catch rate,
  per-game averages, etc.) and "leagueRank" (league rank in his headline stat). Quote those numbers and say
  what they mean — efficiency, volume, turnovers, trends between the two sides.
- Mention a player's "ovr" rating ONLY when his statLine is null (no production yet). Never lead with ratings.
- Cover each team's QB, lead rusher, lead receiver and top defender by name with their numbers.
- If ranks are null (no games yet), talk about roster talent (starterOvr) instead.
- homeEdge > 0 favors the home team on paper; Tony may still pick the underdog.
- Predicted scores should be realistic NFL scores.

Return ONLY JSON:
{"headline": "short show title",
 "exchanges": [{"speakerId": "stats"|"hottake", "text": "..."}],
 "picks": {"stats": {"abbr": "<team abbr>", "score": "ABR 24, ABR 17"}, "hottake": {"abbr": "<team abbr>", "score": "..."}}}`;

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'No AI API key configured' }, { status: 503 });
    }

    const { facts } = (await request.json()) as { facts?: PregameFacts };
    if (!facts?.home?.abbr || !facts?.away?.abbr || !facts.gameId) {
      return NextResponse.json({ error: 'facts required' }, { status: 400 });
    }

    // Premium (founders + admins grandfathered by resolveTier). Enforced when
    // Supabase is configured; local dev without it stays testable.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const authClient = await createSupabaseServer();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      const { tier } = await readCredits(getServiceClient(), user.id, user.created_at);
      if (tier !== 'premium') {
        return NextResponse.json(
          { error: 'The AI pregame show is a Premium feature.', code: 'premium_required' },
          { status: 403 },
        );
      }
    }

    const key = 'pregame:' + crypto.createHash('md5').update(JSON.stringify(facts)).digest('hex');
    const cached = await getCache(key);
    if (cached) {
      const show = parseAiPregame(cached, facts);
      if (show) return NextResponse.json({ show });
    }

    const userContent = `MATCHUP FACTS:\n${JSON.stringify(facts)}`;
    let raw = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
          systemInstruction: SYSTEM_PROMPT,
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          // Thinking off: gemini-2.5-flash's thinking tokens count against
          // maxOutputTokens and can truncate the JSON.
          generationConfig: { maxOutputTokens: 6000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } as GenerationConfig,
        });
        raw = result.response.text();
      } catch (err) {
        console.warn('Pregame: Gemini failed, trying GPT-4o-mini:', err instanceof Error ? err.message : err);
      }
    }

    if (!raw && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 2500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        });
        raw = completion.choices[0]?.message?.content ?? '';
      } catch (err) {
        console.warn('Pregame: GPT-4o-mini also failed:', err instanceof Error ? err.message : err);
      }
    }

    if (!raw) {
      return NextResponse.json({ error: 'AI providers unavailable — client will use template' }, { status: 503 });
    }

    let parsed: unknown;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      console.error('Pregame: JSON parse failed. Raw (first 300):', raw.slice(0, 300));
      return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 });
    }

    const show = parseAiPregame(parsed, facts);
    if (!show) return NextResponse.json({ error: 'Invalid AI response' }, { status: 502 });

    await setCache(key, show);
    return NextResponse.json({ show });
  } catch (err) {
    console.error('Pregame API error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
