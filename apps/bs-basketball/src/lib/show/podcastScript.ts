/**
 * Hoops Tonight podcast script — the single source of truth shared by the
 * server route (/api/spotlight-audio renders exactly these lines with
 * ElevenLabs, one clip per line, concatenated) and the client player
 * (ShowAudioPlayer builds the same lines for its synced transcript, chapters
 * and the browser-voice fallback). Keeping both on one builder means the
 * transcript can never drift from what the voices actually say.
 *
 * Pure + server-safe: no React, no DOM, no Node-only APIs. Lives under lib/**
 * so it must use relative imports only.
 */

export type PodcastSpeakerId = 'stats' | 'hottake' | 'fans' | 'player';

export interface PodcastExchange {
  speakerId: PodcastSpeakerId;
  text: string;
  playerName?: string;
}

export interface PodcastTopic {
  headline: string;
  icon: string;
  exchanges: PodcastExchange[];
}

export type PodcastSpeaker = 'mike' | 'trey';

export interface PodcastScriptLine {
  speaker: PodcastSpeaker;
  text: string;
  /** -1 = cold open, topics.length = sign-off, otherwise the source topic index. */
  topicIndex: number;
}

const TRANSITIONS: { speaker: PodcastSpeaker; text: string }[] = [
  { speaker: 'mike', text: `Alright, let's move on. Next topic.` },
  { speaker: 'mike', text: `OK, shifting gears here.` },
  { speaker: 'mike', text: `Let's keep it moving, Trey.` },
  { speaker: 'trey', text: `Next one. Let's go.` },
];

/** Build the spoken two-host script. Only the analyst ("stats") and hot-take
 *  ("hottake") exchanges are voiced — player posts and fan pulse stay visual.
 *  Topics with no voiced exchanges are skipped (but still advance the
 *  transition rotation, matching the original route behaviour). */
export function buildPodcastScript(topics: PodcastTopic[], teamName: string): PodcastScriptLine[] {
  const lines: PodcastScriptLine[] = [];
  const outroIndex = topics.length;

  lines.push({
    speaker: 'mike',
    topicIndex: -1,
    text: `Welcome back to Hoops Tonight. I'm Mike Hartwell alongside Trey "Big Shot" Daniels, and today we're breaking down the ${teamName}. Let's get into it.`,
  });
  lines.push({ speaker: 'trey', topicIndex: -1, text: `Let's GO! I've got a LOT to say about this team. Let's not waste any time.` });

  for (let i = 0; i < topics.length; i++) {
    const debate = topics[i].exchanges.filter(e => e.speakerId === 'stats' || e.speakerId === 'hottake');
    if (debate.length === 0) continue;
    if (i > 0) lines.push({ ...TRANSITIONS[i % TRANSITIONS.length], topicIndex: i });
    for (const ex of debate) {
      lines.push({ speaker: ex.speakerId === 'stats' ? 'mike' : 'trey', text: ex.text, topicIndex: i });
    }
  }

  lines.push({ speaker: 'mike', topicIndex: outroIndex, text: `And that's the show. Thanks for tuning in to Hoops Tonight. We'll see you next time.` });
  lines.push({ speaker: 'trey', topicIndex: outroIndex, text: `Stay loud, stay passionate, and keep grinding. This is Trey Daniels — we're out!` });

  return lines;
}

// ── Text Normalization for TTS ────────────────────────────────────────
// TTS engines read text literally — expand abbreviations and symbols so
// the voices say "rebounds" instead of "R E B", "$55 million" instead of
// "$55M", etc. Also used by the browser-voice fallback.
export function normalizeTtsText(text: string): string {
  let t = text;

  // Money: "$55M" → "55 million dollars", "$4.2M" → "4.2 million dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Mm]/g, '$1 million dollars');
  // Money: "$500K" → "500 thousand dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Kk]/g, '$1 thousand dollars');
  // Money: standalone "$55" — catch remaining dollar signs
  t = t.replace(/\$(\d)/g, '$1 dollar');

  // Basketball box-score stats — word boundaries to avoid partial replacements
  t = t.replace(/\bPPG\b/gi, 'points per game');
  t = t.replace(/\bRPG\b/gi, 'rebounds per game');
  t = t.replace(/\bAPG\b/gi, 'assists per game');
  t = t.replace(/\bSPG\b/gi, 'steals per game');
  t = t.replace(/\bBPG\b/gi, 'blocks per game');
  t = t.replace(/\bMPG\b/gi, 'minutes per game');

  // Shot type abbreviations
  t = t.replace(/\b3PT\b/gi, 'three-point');
  t = t.replace(/\b3-PT\b/gi, 'three-point');
  t = t.replace(/\b3P%(?!\w)/gi, 'three-point percentage');
  t = t.replace(/\b3PA\b/gi, 'three-point attempts');
  t = t.replace(/\b3PM\b/gi, 'three-pointers made');
  t = t.replace(/\bFG%(?!\w)/gi, 'field goal percentage');
  t = t.replace(/\bFGA\b/gi, 'field goal attempts');
  t = t.replace(/\bFGM\b/gi, 'field goals made');
  t = t.replace(/\bFT%(?!\w)/gi, 'free throw percentage');
  t = t.replace(/\bFTA\b/gi, 'free throw attempts');
  t = t.replace(/\bFTM\b/gi, 'free throws made');
  t = t.replace(/\bTS%(?!\w)/gi, 'true shooting percentage');
  t = t.replace(/\beFG%(?!\w)/gi, 'effective field goal percentage');

  // Rebounds split-out (plural and singular)
  t = t.replace(/\bOREB\b/gi, 'offensive rebounds');
  t = t.replace(/\bDREB\b/gi, 'defensive rebounds');
  t = t.replace(/\bREB\b/gi, 'rebounds');
  t = t.replace(/\bAST\b/gi, 'assists');
  t = t.replace(/\bSTL\b/gi, 'steals');
  t = t.replace(/\bBLK\b/gi, 'blocks');
  t = t.replace(/\bTOV\b/gi, 'turnovers');
  t = t.replace(/\bPF\b/g, 'personal fouls');

  // Basketball position abbreviations
  t = t.replace(/\bPG\b/g, 'point guard');
  t = t.replace(/\bPGs\b/g, 'point guards');
  t = t.replace(/\bSG\b/g, 'shooting guard');
  t = t.replace(/\bSGs\b/g, 'shooting guards');
  t = t.replace(/\bSF\b/g, 'small forward');
  t = t.replace(/\bSFs\b/g, 'small forwards');
  // PF can collide with "personal foul" above — handled there first.
  t = t.replace(/\bC\b(?=\s|$)/g, 'center');

  // Awards / acronyms read as letters
  t = t.replace(/\bMVP\b/g, 'M V P');
  t = t.replace(/\bDPOY\b/g, 'D P O Y');
  t = t.replace(/\bROY\b/g, 'R O Y');
  t = t.replace(/\bMIP\b/g, 'M I P');
  t = t.replace(/\bCOY\b/g, 'C O Y');
  t = t.replace(/\b6MOY\b/g, 'sixth man of the year');
  t = t.replace(/\bAll-League\b/gi, 'All League');
  t = t.replace(/\bAll-NBA\b/gi, 'All N B A');
  t = t.replace(/\bAll-Star\b/gi, 'All Star');

  // Org-level abbreviations
  t = t.replace(/\bFA\b/g, 'free agency');
  t = t.replace(/\bFAs\b/g, 'free agents');
  t = t.replace(/\bGM\b/g, 'general manager');
  t = t.replace(/\bGMs\b/g, 'general managers');
  t = t.replace(/\bOVR\b/gi, 'overall');

  // Negative point differential: "-13" at start or after space
  t = t.replace(/(?<=\s|^)-(\d+)/g, 'negative $1');

  // Ensure "vs" reads as "versus"
  t = t.replace(/\bvs\b\.?/gi, 'versus');

  return t;
}
