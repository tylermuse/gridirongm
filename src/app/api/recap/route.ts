import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { segments, season, week, isPlayoffs } = await request.json();
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ error: 'segments array required' }, { status: 400 });
    }

    const weekContext = isPlayoffs
      ? `This is the PLAYOFFS — ${week === 101 ? 'Wild Card Round' : week === 102 ? 'Divisional Round' : week === 103 ? 'Conference Championships' : week === 104 ? 'The Championship Game' : `Playoff Round ${week - 100}`}. The stakes are EVERYTHING. Every play matters. Bring the intensity.`
      : `This is Week ${week} of the regular season.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `You write the dialogue for "Gridiron Tonight" — a weekly football debate show in a GM simulation game. Two commentators break down the week's biggest storylines.

THE COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — The analytics guy. Think Nate Silver meets Tony Romo. Uses real stats but makes them interesting. Has dry wit. Occasionally surprises with a hot take or gut feeling. References historical parallels ("This reminds me of the 2013 Seahawks defense..."). Can be self-deprecating about being a nerd.
- **Tony Blaze** (speakerId: "hottake") — The passion guy. Think Stephen A. Smith meets Pat McAfee. Uses CAPS for emphasis, makes bold declarations, genuinely funny. But he's NOT stupid — occasionally drops surprisingly sharp analysis between the yelling. Uses vivid metaphors. Gets personally invested in team storylines.

SHOW FORMAT:
- Open with a brief intro exchange (1-2 lines) setting the tone for the week. Reference something specific.
- Then cover each game storyline as its own topic with 3-4 exchanges.
- They must RESPOND to each other — argue, agree reluctantly, interrupt, build on each other's points.
- When discussing players, reference their actual stats from the data. Don't invent numbers.
- Make it feel like a REAL show — callbacks to earlier topics, running jokes, genuine disagreements.
- End with a brief outro exchange wrapping up.

CONTEXT:
Season ${season}, ${weekContext}

GAME STORYLINES THIS WEEK:
${JSON.stringify(segments, null, 2)}

Each segment has a type (upset, comeback, blowout, shootout, defensive, performance, streak, rivalry, trade, summary), title, body text with stats, and involved teams/players. Use ALL of this data.

Generate the full show as a JSON array of topics. Each element:
{
  "headline": "topic title",
  "icon": "single emoji",
  "context": "optional one-line stat/score context shown under headline",
  "exchanges": [{ "speakerId": "stats" | "hottake", "text": "dialogue line" }]
}

The first element should be the show intro, the last should be the outro. Everything in between covers the storylines.

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
    const topics = JSON.parse(raw.slice(start, end + 1));
    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Recap API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
