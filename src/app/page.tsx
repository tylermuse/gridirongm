import type { Metadata } from 'next';
import GameApp from '@/components/home/GameApp';
import HomeIntro from '@/components/home/HomeIntro';

export const metadata: Metadata = {
  title: 'BS Football — Free Online Football GM Game & Simulator',
  description:
    'BS Football is a free, browser-based football general manager simulator. Draft rookies, scout talent, manage the salary cap, make trades, and build a dynasty across multiple seasons — no download required.',
  alternates: { canonical: 'https://bs-football.com/' },
};

export default function Page() {
  return (
    <>
      {/* Interactive game (client). Renders first as the primary experience. */}
      <GameApp />
      {/* Server-rendered content — real, crawlable HTML describing the game. */}
      <HomeIntro />
    </>
  );
}
