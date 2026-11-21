#!/usr/bin/env node
// Announce a weekly roster refresh once it's live on bs-football.com.
//
// Reads a roster-updates/*.md note (written by the weekly refresh run) and:
//   1. waits until bs-football.com/rosters shows the note's date (i.e. the deploy is live),
//   2. posts it to Discord through a channel webhook (DISCORD_ROSTER_WEBHOOK_URL),
//   3. builds a pre-filled Reddit "submit" link (Reddit no longer hands out API keys,
//      so the last click stays manual), and
//   4. prints a markdown summary that the workflow posts as a comment on the PR.
//
// Usage: node scripts/announce-roster-update.mjs roster-updates/2026-11-17.md [--dry-run] [--no-wait]
// Env:   DISCORD_ROSTER_WEBHOOK_URL (optional; skipped if unset)
//        REDDIT_SUBREDDIT            (default Gridiron_GM_Game)
//        SITE_URL                    (default https://bs-football.com)
//        SUMMARY_FILE                (where to write the PR-comment markdown)

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const noWait = args.includes('--no-wait');
if (!file) {
  console.error('usage: announce-roster-update.mjs <roster-updates/file.md> [--dry-run] [--no-wait]');
  process.exit(2);
}

const SITE = (process.env.SITE_URL || 'https://bs-football.com').replace(/\/$/, '');
const ROSTERS_URL = `${SITE}/rosters`;
const SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'Gridiron_GM_Game';
const WEBHOOK = process.env.DISCORD_ROSTER_WEBHOOK_URL || '';

// ---------- parse the note ----------
const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
const lines = raw.split('\n');
const titleLine = lines.find((l) => /^#\s+/.test(l));
if (!titleLine) throw new Error(`${file}: no "# Title" line`);
const title = titleLine.replace(/^#\s+/, '').trim();
const dateLine = lines.find((l) => /^_.+_$/.test(l.trim()));
const dateText = dateLine ? dateLine.trim().replace(/^_|_$/g, '') : '';
const body = lines
  .filter((l) => l !== titleLine && l !== dateLine)
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// Standings come as one bullet per team (32 lines). Fold them into one compact line each
// for Discord so the post stays readable; Reddit keeps the full list.
function compactStandings(md) {
  return md.replace(/(## Standings[^\n]*\n)((?:- [^\n]+\n?)+)/, (_, head, list) => {
    const teams = list.trim().split('\n').map((l) => l.replace(/^- /, '').replace(': ', ' '));
    return `${head}${teams.join(' · ')}\n`;
  });
}

const howTo =
  `**Play it:** [bs-football.com/rosters](${ROSTERS_URL}) → "Play in BS Football". ` +
  `Football GM users can download the JSON from the same page.`;

// ---------- Discord ----------
function discordPayload() {
  // Embed descriptions support bold/italics/lists/links but not "#" headings reliably.
  let desc = compactStandings(body)
    .replace(/^###\s+(.+)$/gm, '**$1**')
    .replace(/^##\s+(.+)$/gm, '__**$1**__');
  desc = `${desc}\n\n${howTo}`;
  const LIMIT = 4000; // embed description hard cap is 4096
  if (desc.length > LIMIT) desc = `${desc.slice(0, LIMIT - 60).replace(/\n[^\n]*$/, '')}\n\n…full notes at ${ROSTERS_URL}`;
  return {
    username: 'BS Football',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: dateText ? `${title} — ${dateText}` : title,
        url: ROSTERS_URL,
        description: desc,
        color: 0x2563eb,
      },
    ],
  };
}

async function postDiscord() {
  if (!WEBHOOK) return { status: 'skipped', note: 'DISCORD_ROSTER_WEBHOOK_URL is not set' };
  const payload = discordPayload();
  if (dryRun) {
    console.log('--- Discord payload ---\n' + JSON.stringify(payload, null, 2));
    return { status: 'dry-run' };
  }
  const res = await fetch(`${WEBHOOK}?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord webhook ${res.status}: ${await res.text()}`);
  const msg = await res.json();
  const link = msg.guild_id ? `https://discord.com/channels/${msg.guild_id}/${msg.channel_id}/${msg.id}` : '';
  return { status: 'posted', link };
}

// ---------- Reddit ----------
function redditLink() {
  const redditTitle = dateText ? `${title} (${dateText})` : title;
  const redditBody =
    `${body}\n\n---\n\n` +
    `**How to use it:**\n\n` +
    `- **BS Football (easiest):** go to [bs-football.com/rosters](${ROSTERS_URL}) and click "Play in BS Football"\n` +
    `- **Football GM:** download the JSON from the same page and import it via Tools > Import/Export\n\n` +
    `Spot something off? Let me know and I'll fix it in next week's refresh.`;
  const q = new URLSearchParams({ type: 'TEXT', selftext: 'true', title: redditTitle, text: redditBody });
  return { url: `https://www.reddit.com/r/${SUBREDDIT}/submit?${q}`, title: redditTitle, body: redditBody };
}

// ---------- wait for the deploy ----------
async function waitForLive() {
  if (noWait || !dateText) return true;
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${ROSTERS_URL}?cb=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (res.ok && (await res.text()).includes(dateText)) return true;
    } catch {
      /* retry */
    }
    console.log(`Waiting for ${ROSTERS_URL} to show "${dateText}"…`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  return false;
}

// ---------- main ----------
const live = await waitForLive();
if (!live) {
  console.error(`${ROSTERS_URL} never showed "${dateText}" within 20 minutes; not announcing.`);
  process.exit(1);
}

const discord = await postDiscord();
const reddit = redditLink();
if (dryRun) console.log(`--- Reddit ---\nTitle: ${reddit.title}\n\n${reddit.body}\n\nLink length: ${reddit.url.length}`);

const summary = [
  `### 📣 Roster update announced: ${title}`,
  '',
  discord.status === 'posted'
    ? `- **Discord:** ✅ posted${discord.link ? ` — [view message](${discord.link})` : ''}`
    : `- **Discord:** ⏭️ ${discord.status}${discord.note ? ` (${discord.note})` : ''}`,
  `- **Reddit:** 👉 [**Open pre-filled post in r/${SUBREDDIT}**](${reddit.url}) — review, then hit Post.`,
].join('\n');

console.log('\n' + summary);
if (process.env.SUMMARY_FILE) writeFileSync(process.env.SUMMARY_FILE, summary + '\n');
