#!/usr/bin/env node
/**
 * Fails when the instant-answer help sheet quotes an on-screen label that no
 * longer exists in the app's code.
 *
 * The feedback modal answers players' how-to questions only from the help
 * sheet (src/lib/feedback/helpSheet.ts, and the Hoops one once it exists).
 * Every "quoted" string in a sheet is meant to be a label a player can see.
 * If a PR renames or removes one, this check names the stale line so the same
 * PR can fix the sheet. It cannot catch a changed rule (a limit, a price), only
 * a changed label; the weekly help-sheet review covers the rest.
 *
 * Placeholders in a label (N, X, Y, $XM, $YM) stand for numbers the UI fills
 * in, so a label like "Sim Week N" passes when "Sim Week" is in the code.
 * Icons and arrows at either end ("⏸ Pause", "Advance to Draft →") are often
 * rendered in a separate element from the words, so only the words are checked.
 *
 *   node scripts/check-help-sheet.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const SHEETS = [
  {
    app: 'BS Football',
    sheet: 'src/lib/feedback/helpSheet.ts',
    sources: ['src', 'packages/core/src'],
  },
  {
    app: 'BS Hoops',
    sheet: 'apps/bs-basketball/src/lib/feedback/helpSheet.ts',
    sources: ['apps/bs-basketball/src', 'packages/core/src'],
  },
];

/**
 * Quoted strings in a sheet that are not on-screen labels (a URL, a word used
 * as an example). Keep this short: a label that moved belongs in the sheet,
 * not here.
 */
const NOT_LABELS = new Set([
  "what's new", // quoted in a "Not in the game" line: the point is that it does not exist
]);

const SKIP_DIRS = new Set(['node_modules', '.next', 'lib/feedback']);

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if ([...SKIP_DIRS].some(s => rel.endsWith(s))) continue;
    const st = statSync(full);
    if (st.isDirectory()) listSourceFiles(full, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** Make JSX text comparable to what a player reads. */
function normalize(text) {
  return text
    .replace(/&apos;|&#39;|&rsquo;|[‘’]/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|[“”]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\{\s*['"`]\s*['"`]\s*\}/g, ' ') // {' '}
    .replace(/\s+/g, ' ');
}

/** The text inside the sheet's template literals, so the header comment is not checked. */
function sheetBody(source) {
  const parts = [];
  const re = /`([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(source))) parts.push(m[1]);
  return parts.join('\n');
}

function quotedLabels(body) {
  const labels = [];
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    const re = /"([^"\n]+)"/g;
    let m;
    while ((m = re.exec(line))) labels.push({ label: m[1], line: line.trim(), lineNo: i + 1 });
  });
  return labels;
}

/** The fixed pieces of a label once the number placeholders are taken out. */
function fragments(label) {
  return label
    .replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})]+$/gu, '')
    .split(/\$[XY]M|\b[NXY]\b/)
    .map(f => f.trim())
    .filter(f => /[\p{L}\p{N}]/u.test(f));
}

let failures = 0;
let checked = 0;

for (const { app, sheet, sources } of SHEETS) {
  const sheetPath = join(ROOT, sheet);
  if (!existsSync(sheetPath)) {
    console.log(`- ${app}: no help sheet yet (${sheet}), skipped`);
    continue;
  }
  const corpus = normalize(
    sources
      .map(s => join(ROOT, s))
      .filter(existsSync)
      .flatMap(d => listSourceFiles(d))
      .map(f => readFileSync(f, 'utf8'))
      .join('\n'),
  );

  const missing = [];
  for (const { label, line } of quotedLabels(sheetBody(readFileSync(sheetPath, 'utf8')))) {
    if (NOT_LABELS.has(label)) continue;
    checked++;
    const lost = fragments(normalize(label)).filter(f => !corpus.includes(f));
    if (lost.length) missing.push({ label, lost, line });
  }

  if (missing.length === 0) {
    console.log(`✓ ${app}: every quoted label in ${sheet} is in the code`);
    continue;
  }
  failures += missing.length;
  console.log(`✗ ${app}: ${missing.length} label(s) in ${sheet} no longer appear in the code:`);
  for (const { label, lost, line } of missing) {
    console.log(`\n  "${label}"${lost.length < fragments(label).length ? `  (missing: ${lost.map(l => `"${l}"`).join(', ')})` : ''}`);
    console.log(`    in: ${line.length > 160 ? `${line.slice(0, 157)}...` : line}`);
  }
}

console.log(`\n${checked} label(s) checked.`);
if (failures) {
  console.log(
    '\nThe feedback modal answers players from this sheet, so a stale label means a wrong answer.\n' +
    'Update the line to the new on-screen wording, or remove it if the feature is gone.',
  );
  process.exit(1);
}
