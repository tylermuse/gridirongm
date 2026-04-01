import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const { teamData } = await request.json();
    if (!teamData) {
      return NextResponse.json({ error: 'teamData required' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `You write the dialogue for a football GM simulation game's "Team Spotlight" — a debate show segment where two commentators break down the user's team.

THE COMMENTATORS:
- **Marcus Cole** (speakerId: "stats") — The analytics guy. Think Nate Silver meets Tony Romo. Uses real stats but makes them interesting. Has dry wit. Occasionally surprises with a hot take or gut feeling. References historical parallels ("This reminds me of the 2017 Jaguars..."). Can be self-deprecating about being a nerd.
- **Tony Blaze** (speakerId: "hottake") — The passion guy. Think Stephen A. Smith meets Pat McAfee. Uses CAPS for emphasis, makes bold declarations, genuinely funny. But he's NOT stupid — occasionally drops surprisingly sharp analysis between the yelling. Uses vivid metaphors. Gets personally invested.

KEY RULES:
- They must RESPOND to each other, not deliver parallel monologues. Tony interrupts, Marcus corrects, they riff off each other's points.
- Use ALL the real stats provided below. Do NOT invent any numbers.
- Vary your openings — never start two topics the same way.
- Each topic should have 3-4 exchanges.
- Keep it entertaining but grounded in the actual data.

TEAM DATA:
${JSON.stringify(teamData, null, 2)}

Generate 4-6 debate topics covering: team record/standings, offensive & defensive performance, star players, and a burning question about the team's direction. If there are injuries or notable streaks, cover those too.

Respond with a JSON array. Each element:
{
  "headline": "short topic title",
  "icon": "single emoji",
  "exchanges": [{ "speakerId": "stats" | "hottake", "text": "dialogue line" }]
}

Return ONLY the JSON array, no markdown fences, no other text.`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response type' }, { status: 500 });
    }

    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const topics = JSON.parse(jsonText);
    return NextResponse.json({ topics });
  } catch (err) {
    console.error('Spotlight API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
