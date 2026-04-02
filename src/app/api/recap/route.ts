import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { games, season, week, isPlayoffs } = await request.json();
    if (!games || !Array.isArray(games) || games.length === 0) {
      return NextResponse.json({ error: 'games array required' }, { status: 400 });
    }

    const weekContext = isPlayoffs
      ? `This is the PLAYOFFS — ${week === 101 ? 'Wild Card Round' : week === 102 ? 'Divisional Round' : week === 103 ? 'Conference Championships' : week === 104 ? 'The Championship Game' : `Playoff Round ${week - 100}`}. The stakes are EVERYTHING.`
      : `This is Week ${week} of an 18-week regular season.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `You write "Gridiron Tonight" — a weekly football recap show. Two commentators break down each game.

THE COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — Analytics guy. Dry wit, loves historical parallels. Uses the actual stats provided.
- **Tony Blaze** (speakerId: "hottake") — Passion guy. Uses CAPS, bold declarations, vivid metaphors. Occasionally sharp.

FORMAT:
- Each topic = ONE GAME. The headline should be the matchup (e.g. "Bengals 34, Patriots 17").
- The "context" field = the box score summary line (e.g. "CIN 34 @ NE 17 | Bo Nix: 457 yds, 4 TD, 0 INT").
- For each game, discuss: who won and WHY, which players dominated or struggled, what this means for both teams.
- Reference actual player stats from the data (passing yards, TDs, rushing yards, etc). Do NOT invent stats.
- When a storyline type is provided (upset, comeback, blowout, etc.), lean into that narrative.
- 3-4 exchanges per game. They should respond to each other, not monologue.

RULES:
- First topic = brief show intro (1-2 lines). Last topic = brief outro.
- Cover the top 4-6 most interesting games. Skip boring/close games without notable stats.
- Winning QB gets credit. Losing QB gets scrutiny. Mention the running game. Mention the defense if relevant.
- Example tone: "The Bengals are rolling with Bo Nix who just outplayed Drake Maye. He was ON FIRE — 457 yards, 4 TDs, zero picks. Meanwhile the Patriots' run game was nonexistent — 27 yards from Henderson. You can't win football games like that."

Season ${season}, ${weekContext}

GAMES THIS WEEK:
${JSON.stringify(games, null, 2)}

Each game has: away/home team (name, record, score), margin, key player stats per team (QB, top rusher, top receiver), and an optional storyline type.

Generate as JSON array:
[
  { "headline": "matchup or intro title", "icon": "emoji", "context": "box score line", "exchanges": [{ "speakerId": "stats"|"hottake", "text": "..." }] }
]

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
    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Recap API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
