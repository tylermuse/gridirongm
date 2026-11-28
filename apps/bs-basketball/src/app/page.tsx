import type { Metadata } from 'next';
import HomeApp from '@/components/home/HomeApp';
import HomeIntro from '@/components/home/HomeIntro';
import { JsonLd } from '@/components/content/ContentBits';
import { getLeague2026, ROSTER_FILE } from '@/lib/content/rosters2026';
import type { RealPickerTeam } from '@/components/home/HomeApp';

const SITE = 'https://www.bs-basketball.com';
const DESCRIPTION =
  'BS Hoops is a free browser basketball GM game. Draft prospects, trade with pick protections, sign free agents under a real soft cap with aprons and Bird rights, set your rotation, and sim seasons possession by possession.';

// Re-render daily so the "Strategy guides" list picks up newly published posts.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: 'BS Hoops — Free Basketball GM Game in Your Browser' },
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}/` },
};

/**
 * Server entry for "/". The interactive game (splash + in-league dashboard) is
 * the client HomeApp; the crawlable HomeIntro is server-rendered and handed in
 * as a slot that HomeApp shows only in the pre-league splash state.
 */
/** Real 2026-27 NBA teams for the start screen's default "Real" league choice. */
function realPickerTeams(): RealPickerTeam[] {
  try {
    return getLeague2026().teams.map(t => ({
      abbreviation: t.abbrev,
      city: t.city,
      name: t.name,
      primaryColor: t.color,
      secondaryColor: t.secondaryColor,
      logoUrl: t.logoUrl,
      record: t.record ? `${t.record.won}–${t.record.lost}` : null,
    }));
  } catch (err) {
    console.error('[bs-hoops] real teams for the picker failed:', err);
    return [];
  }
}

export default function Page() {
  const realTeams = realPickerTeams();
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': ['VideoGame', 'WebApplication'],
          name: 'BS Hoops',
          url: SITE,
          description: DESCRIPTION,
          applicationCategory: 'GameApplication',
          genre: ['Sports', 'Simulation', 'Management'],
          gamePlatform: 'Web browser',
          operatingSystem: 'Any',
          inLanguage: 'en',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          publisher: { '@type': 'Organization', name: 'BS Sports GM LLC' },
        }}
      />
      <HomeApp intro={<HomeIntro />} realTeams={realTeams} realFile={`/rosters/${ROSTER_FILE}`} />
    </>
  );
}
