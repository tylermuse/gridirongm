/**
 * Refresh the committed /predictions fallback snapshot.
 *
 * The live page computes odds at build time (src/lib/predictions/nflOdds.ts),
 * so this is only needed to update the snapshot used when ESPN is unreachable
 * during a build, or for a dry run of the model:
 *     npx tsx scripts/predictions.ts            # 10,000 seasons
 *     SIMS=2000 npx tsx scripts/predictions.ts  # quicker dry run
 */
import { writeFileSync } from 'node:fs';
import { computeNflOdds, DEFAULT_SIMS } from '@/lib/predictions/nflOdds';

async function main() {
  const sims = Number(process.env.SIMS ?? DEFAULT_SIMS);
  const out = await computeNflOdds(sims);
  writeFileSync('src/lib/data/predictions/nfl-latest.json', JSON.stringify(out, null, 2) + '\n');

  const top = [...out.teams].sort((a, b) => b.champion - a.champion).slice(0, 8);
  console.log(`Week ${out.week}: ${out.completedGames} games played, ${out.remainingGames} left, ${sims} sims`);
  for (const t of top) {
    console.log(`  ${t.abbrev.padEnd(4)} ${t.record.padEnd(6)} proj ${t.projectedWins.toFixed(1).padStart(4)}W  playoffs ${t.playoffs.toFixed(1).padStart(5)}%  SB ${t.champion.toFixed(1).padStart(5)}%  Δpo ${t.playoffsChange ?? '—'}`);
  }
  const sumSB = out.teams.reduce((s, t) => s + t.champion, 0);
  const sumPO = out.teams.reduce((s, t) => s + t.playoffs, 0);
  console.log(`  check: SB odds sum ${sumSB.toFixed(1)}% (≈100), playoff spots ${(sumPO / 100).toFixed(2)} (≈14)`);
}

main().catch(err => { console.error(err); process.exit(1); });
