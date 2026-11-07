import type { Metadata } from 'next';
import Link from 'next/link';
import { asOfLabel, classGrade, isAllTeams, parseShareQuery } from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import { MockDraftTool } from './_components/MockDraftTool';

const BASE_URL = 'https://bs-football.com';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) query.set(key, first);
  }
  return query.toString();
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const data = getMockDraftData();
  const query = toQuery(await searchParams);
  const share = parseShareQuery(data, new URLSearchParams(query));

  let title = `${data.draftYear} NFL Mock Draft Simulator: Free, No Login | BS Football`;
  let description = `Run a free ${data.draftYear} NFL mock draft. Pick your team, draft against the AI through all 7 rounds, get a grade for your class, and share the results.`;

  if (share.kind === 'ok') {
    const tid = share.settings.userTids[0];
    const team = isAllTeams(data, share.settings.userTids) ? undefined : data.teams.find((t) => t.tid === tid);
    const picks = team ? share.replay.picks.filter((p) => p.slot.tid === team.tid) : share.replay.picks;
    const names = picks.slice(0, 3).map((p) => `${p.prospect.firstName} ${p.prospect.lastName}`).join(', ');
    const grade = classGrade(picks);
    if (team && grade) {
      title = `${team.region} ${team.name} ${data.draftYear} mock draft: ${grade} class | BS Football`;
      description = `${team.abbrev} drafted ${names}. Run your own ${data.draftYear} NFL mock draft, free.`;
    } else {
      title = `${data.draftYear} NFL mock draft results | BS Football`;
      description = `This mock opens with ${names}. Run your own ${data.draftYear} NFL mock draft, free.`;
    }
  }

  const image = `${BASE_URL}/api/og/mock${share.kind === 'ok' ? `?${query}` : ''}`;
  return {
    title,
    description,
    // Every share link is a variant of this one page for search.
    alternates: { canonical: `${BASE_URL}/mock-draft` },
    openGraph: { title, description, url: `${BASE_URL}/mock-draft`, type: 'website', images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function MockDraftPage({ searchParams }: { searchParams: SearchParams }) {
  const data = getMockDraftData();
  const query = toQuery(await searchParams);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{data.draftYear} NFL Mock Draft Simulator</h1>
        <p className="text-sm text-[var(--text-sec)] mt-1">
          Draft order as of Week {data.currentWeek} ({asOfLabel(data.asOf)})
        </p>
      </header>

      <MockDraftTool asOf={data.asOf} initialQuery={query} />

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-bold text-gray-900 mb-2">How the mock draft works</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Pick one team, several, or all 32, then choose 1, 3, or 7 rounds. The AI drafts for every other team, weighing
          each prospect against what that roster needs. The draft order follows the current NFL standings and includes
          traded picks, and it updates every week of the season.
        </p>
        <p className="text-gray-700 leading-relaxed">
          When you finish, you get a grade for every pick and for the whole class, plus a link that replays your exact
          draft. It&apos;s free, with no login. Want to study the class first? Browse the{' '}
          <Link href="/mock-draft/2027" className="text-blue-600 font-medium hover:underline">
            {data.draftYear} NFL Draft big board
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
