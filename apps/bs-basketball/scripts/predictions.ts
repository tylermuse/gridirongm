/**
 * Refresh the committed /predictions fallback snapshot.
 *
 *   cd apps/bs-basketball && npx tsx scripts/predictions.ts
 *
 * Runs the live model (ESPN results + engine ratings) and writes
 * src/lib/data/predictions/nba-latest.json, which the page serves only when the
 * live run fails at build time.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { computeNbaOdds } from '../src/lib/predictions/nbaOdds';

async function main() {
  const t0 = Date.now();
  const odds = await computeNbaOdds();
  const out = path.join(process.cwd(), 'src/lib/data/predictions/nba-latest.json');
  writeFileSync(out, `${JSON.stringify(odds, null, 2)}\n`);
  console.log(`wrote ${out}: ${odds.completedGames} games played, ${odds.sims} sims, ${Date.now() - t0}ms`);
  const top = [...odds.teams].sort((a, b) => b.champion - a.champion).slice(0, 8);
  for (const t of top) console.log(`${t.abbrev.padEnd(4)} ${t.record.padEnd(6)} W ${t.projectedWins.toFixed(1).padStart(5)}  PO ${t.playoffs.toFixed(1).padStart(5)}  title ${t.champion.toFixed(1)}`);
}

void main();
