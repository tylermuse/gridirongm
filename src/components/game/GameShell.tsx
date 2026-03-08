'use client';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { GameTicker } from './GameTicker';
import { AdBanner } from '@/components/ui/AdBanner';

export function GameShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <GameTicker />
        <TopBar />
        <AdBanner variant="banner" />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
