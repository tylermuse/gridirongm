import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { segments, scores, season, week, isPlayoffs } = await request.json();
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ error: 'segments array required' }, { status: 400 });
    }

    const weekContext = isPlayoffs
      ? `This is the PLAYOFFS — ${week === 101 ? 'Wild Card Round' : week === 102 ? 'Divisional Round' : week === 103 ? 'Conference Championships' : week === 104 ? 'The Championship Game' : `Playoff Round ${week - 100}`}. The stakes are EVERYTHING.`
      : `This is Week ${week} of the regular season.`;

    // Format the scoreboard
    const scoreboardText = scores && scores.length > 0
      ? `\nSCOREBOARD (all games played this week):\n${scores.map((g: { away: string; awayScore: number; home: string; homeScore: number }) => `  ${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore}`).join('\n')}`
      : '';

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `You write the dialogue for "Gridiron Tonight" — a weekly football recap show in a GM simulation game. Two commentators break down THIS WEEK'S GAMES.

THE COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — The analytics guy. Think Nate Silver meets Tony Romo. Dry wit, loves historical parallels. Occasionally surprises with a hot take.
- **Tony Blaze** (speakerId: "hottake") — The passion guy. Think Stephen A. Smith meets Pat McAfee. Uses CAPS for emphasis, bold declarations, vivid metaphors. Occasionally drops sharp analysis.

CRITICAL RULES:
- This show is about RECAPPING THE GAMES THAT WERE PLAYED THIS WEEK. Every topic must be about a specific game or player performance FROM THIS WEEK.
- Do NOT discuss teams that didn't play this week. Do NOT speculate about future games. Stay anchored to what happened on the field.
- Use the scores and storyline data provided. Reference actual scores, margins, and stats from the body text.
- They must RESPOND to each other — argue, agree reluctantly, riff off each other's points.
- Do NOT invent stats or scores. Only use what's in the data.

CONTEXT:
Season ${season}, ${weekContext}
${scoreboardText}

NOTABLE STORYLINES FROM THIS WEEK'S GAMES:
${JSON.stringify(segments, null, 2)}

Each storyline has a type (upset, comeback, blowout, shootout, defensive, performance, streak, rivalry, trade), title, body with stats/scores, and involved teams. These are the highlights — build the show around them.

Generate the show as a JSON array. Each element:
{
  "headline": "topic title referencing specific teams/game",
  "icon": "single emoji",
  "context": "the score or key stat line",
  "exchanges": [{ "speakerId": "stats" | "hottake", "text": "dialogue line" }]
}

First element = brief show intro (1-2 lines). Last element = brief outro. Middle = one topic per storyline (3-4 exchanges each).

Return ONLY the JSON array, no markdown fences, no other text.`,
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
      console.error('Recap API JSON parse failed. Raw response (first 500 chars):', raw.slice(0, 500));
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
