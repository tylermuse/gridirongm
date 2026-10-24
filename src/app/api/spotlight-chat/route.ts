import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { getServiceClient, readCredits } from '@bs/core/podcast';

/**
 * /api/spotlight-chat — "Call In to the Show".
 *
 * The user asks Marcus Cole & Tony Blaze a question; both hosts answer in
 * character, grounded ONLY on the teamData payload the Spotlight already
 * builds (same facts the episode used) plus the last episode's dialogue so
 * they stay consistent with what they said on air.
 *
 * Response is NDJSON: one {speaker, text} line per host, then {type:'done'}.
 * Text-only; audio is a separate call to /api/spotlight-chat-audio.
 *
 * Cost: ~7K input / ~350 output tokens. Premium runs gemini-2.5-flash
 * (≈ $0.003/turn); Free runs gemini-2.5-flash-lite (≈ $0.001/turn).
 */

export const maxDuration = 60;

// Free: 3 typed turns per in-game week (client-enforced, server sanity-checked).
// Premium: effectively unlimited — text is ~$0.003/turn — with a silent
// ceiling to stop a runaway client.
const FREE_TURNS_PER_WEEK = 3;
const PREMIUM_SANITY_CAP = 60;
const MAX_HISTORY = 8; // prior messages we replay (user + hosts)

interface ChatMessage {
  role: 'user' | 'marcus' | 'tony';
  text: string;
}

interface Episode {
  headline: string;
  exchanges: { speakerId: string; text: string; playerName?: string }[];
}

const SYSTEM_PROMPT = `You are writing a live CALL-IN segment for "Team Spotlight", a football debate show inside a GM simulation game. The caller is the General Manager of the team in TEAM DATA. They just called in with a question or a hot take. BOTH hosts respond.

THE HOSTS:
- **Marcus Cole** — Analytics guy. Nate Silver meets Tony Romo. Dry wit, measured, cites specific numbers from the data, historical parallels. 2-3 sentences.
- **Tony Blaze** — Passion guy. Stephen A. Smith meets Pat McAfee. CAPS for emphasis, bold declarations, vivid metaphors, reacts emotionally. 2-3 sentences.

RULES:
- The caller IS the GM. Talk TO them, second person: "YOU need a quarterback", "your defense", "the move you made at the deadline". Never describe the GM in third person ("the GM should", "they should target") — that's the caller you're talking to.
- The team is "your [team name]" / "your guys" when addressing the caller. The hosts themselves are never "we" — they don't play for the team.
- THE HOSTS NEVER AGREE. This is a debate show. Marcus and Tony must land on DIFFERENT answers every time — a different player, a different route (draft vs. free agency vs. trade vs. stand pat), or a different read of the same facts. If one names a target, the other names a DIFFERENT target or argues against going after anyone at all. If both would honestly pick the same guy, Tony takes the bolder, riskier swing and Marcus takes the cheaper, safer one.
- Each host takes a shot at the other's answer in one line — Tony calls Marcus a spreadsheet, Marcus calls Tony's take unsupported — so the caller has to choose a side.
- Marcus's lens: value, cap, fit, probability. Tony's lens: ceiling, urgency, star power, gut.
- Give the caller a real answer with a real opinion. If they ask what to do, tell them what YOU would do and why, using the data.
- ONLY reference players, stats, records, and transactions that appear in TEAM DATA or the PRIOR EPISODE. Do NOT invent players or numbers. If the caller asks about someone or something not in the data, say you don't have that in front of you and pivot to what you DO know.
- If LEAGUE SCOUTING data is present, the hosts know the whole league AND the upcoming draft class (upcomingDraft.prospects, with the caller's projected pick). When asked about the draft or prospects, name specific prospects by name with their projected pick and scouted range, and say whether the caller can get them where they pick or would need to trade up. When the caller asks who to acquire, target, trade for, or sign: EACH host names a DIFFERENT specific player or route from that data and says WHY it is gettable (seller team, contract year, backup stuck behind a starter, on the trade block, free agent, or a draft prospect the caller can realistically reach from their projected pick), and what it would roughly cost. Marcus argues the value play; Tony argues the swing-for-the-fences play. They must not both pick the same player. Treat tradeMarket rumors as rumors. Never name a player who isn't in the data.
- If LEAGUE SCOUTING data is NOT present and the caller asks about other teams' players, say you only have the caller's team in front of you right now.
- Stay in the BS Football universe — no real-world NFL commentary.
- Off-topic questions (not about football/this team): deflect in character, one line each, and steer back to the team.
- Be consistent with what the hosts said in the PRIOR EPISODE. If the caller pushes back on something said there, defend or concede it on the merits.
- No hashtags, no emojis. Tony's emphasis is CAPS inside normal sentences.
- Marcus speaks first unless the caller's message is pure hype, in which case Tony jumps in first.
- Each reply also carries a "verdict": that host's bottom line in 2-4 words (e.g. "Stay flexible", "NEVER TANK", "Trade for a WR"). It's the label on their side of the split-screen, so the two verdicts must be clearly different — never the same recommendation reworded.

Respond with ONLY a JSON object, no markdown fences:
{"disagreement":"one short line stating exactly what the two hosts disagree about","replies":[{"speaker":"marcus","verdict":"...","text":"..."},{"speaker":"tony","verdict":"...","text":"..."}],"followUps":["...","...","..."]}
Write "disagreement" FIRST and make it a real split, then write replies that honor it.
"followUps": exactly 3 short questions (under 60 characters each) the caller would naturally ask NEXT, phrased in the caller's voice, specific to this exchange and the data — name the players, routes, or positions just discussed (e.g. "Which QBs are free agents right now?", "Can I get Logan without my first-rounder?", "What QBs can I draft at my pick?"). Never generic filler.`;

function buildUserContent(
  teamData: unknown,
  leagueScout: unknown | undefined,
  episode: Episode[] | null,
  history: ChatMessage[],
  message: string,
): string {
  const parts: string[] = [];
  parts.push(`TEAM DATA (the caller's team):\n${JSON.stringify(teamData)}`);
  if (leagueScout) parts.push(`LEAGUE SCOUTING (everyone else):\n${JSON.stringify(leagueScout)}`);
  if (episode && episode.length > 0) {
    const transcript = episode
      .map(t => {
        const lines = t.exchanges
          .filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake')
          .map(e => `${e.speakerId === 'stats' ? 'Marcus' : 'Tony'}: ${e.text}`)
          .join('\n');
        return `[${t.headline}]\n${lines}`;
      })
      .join('\n\n');
    parts.push(`PRIOR EPISODE (what the hosts already said on air):\n${transcript}`);
  }
  const recent = history.slice(-MAX_HISTORY);
  if (recent.length > 0) {
    const convo = recent
      .map(m => `${m.role === 'user' ? 'CALLER' : m.role === 'marcus' ? 'Marcus' : 'Tony'}: ${m.text}`)
      .join('\n');
    parts.push(`CALL SO FAR:\n${convo}`);
  }
  parts.push(`CALLER (now): ${message}`);
  return parts.join('\n\n');
}

type Reply = { speaker: 'marcus' | 'tony'; text: string; verdict?: string };
type Generated = { replies: Reply[]; followUps: string[] };

function parseFollowUps(parsed: { followUps?: unknown }): string[] {
  const arr = Array.isArray(parsed.followUps) ? parsed.followUps : [];
  return arr
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map(f => f.trim().slice(0, 80))
    .slice(0, 3);
}

function parseReplies(raw: string): Generated {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned) as { replies?: unknown; followUps?: unknown };
  const arr = Array.isArray(parsed.replies) ? parsed.replies : [];
  const out: Reply[] = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const sp = (r as { speaker?: string }).speaker;
    const tx = (r as { text?: string }).text;
    const vd = (r as { verdict?: string }).verdict;
    if ((sp === 'marcus' || sp === 'tony') && typeof tx === 'string' && tx.trim()) {
      const verdict = typeof vd === 'string' && vd.trim() ? vd.trim().slice(0, 40) : undefined;
      out.push({ speaker: sp, text: tx.trim(), ...(verdict ? { verdict } : {}) });
    }
  }
  return { replies: out, followUps: parseFollowUps(parsed) };
}

async function generate(userContent: string, geminiModel: string): Promise<Generated> {
  const errors: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: geminiModel });
      const result = await model.generateContent({
        systemInstruction: SYSTEM_PROMPT,
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: 1200, responseMimeType: 'application/json', temperature: 0.9 },
      });
      const gen = parseReplies(result.response.text());
      if (gen.replies.length > 0) return gen;
      errors.push('gemini: empty');
    } catch (e) {
      errors.push(`gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      });
      const gen = parseReplies(completion.choices[0]?.message?.content ?? '');
      if (gen.replies.length > 0) return gen;
      errors.push('openai: empty');
    } catch (e) {
      errors.push(`openai: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'No AI provider configured');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { teamData, leagueScout, episode, history, message, turn } = body as {
      teamData?: unknown;
      leagueScout?: unknown;
      episode?: Episode[] | null;
      history?: ChatMessage[];
      message?: string;
      turn?: number;
    };

    if (!teamData || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'teamData and message required' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Keep it under 500 characters, caller.' }, { status: 400 });
    }

    // Must be signed in (abuse control). Tier decides model + cap.
    const authClient = await createSupabaseServer();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const state = await readCredits(getServiceClient(), user.id, user.created_at);
    const isPremium = state.tier === 'premium';

    // Turn caps. Client enforces per in-game week; this is the backstop.
    const cap = isPremium ? PREMIUM_SANITY_CAP : FREE_TURNS_PER_WEEK;
    if (typeof turn === 'number' && turn > cap) {
      return NextResponse.json(
        { error: isPremium ? 'Easy, GM — the hosts need a break. Call back next week.' : 'Free callers get 3 questions a week. Go Premium for the open mic.', tier: state.tier },
        { status: 429 },
      );
    }

    // League scouting is a Premium perk — drop it if a free client sent it.
    const userContent = buildUserContent(teamData, isPremium ? leagueScout : undefined, episode ?? null, history ?? [], message.trim());
    const { replies, followUps } = await generate(userContent, isPremium ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite');

    return NextResponse.json({ replies, followUps, tier: state.tier });
  } catch (err) {
    console.error('Spotlight Chat API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
