'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { GameTicker } from './GameTicker';
import { AdBanner } from '@/components/ui/AdBanner';
// import { SpotlightPopup } from './SpotlightPopup';

export function GameShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: always visible on md+, drawer overlay on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out md:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <GameTicker />
        <TopBar onMenuToggle={() => setSidebarOpen(v => !v)} />
        <AdBanner variant="banner" />
        <main className="flex-1 p-3 md:p-6 overflow-auto">{children}</main>
      </div>

      {/* <SpotlightPopup /> */}
    </div>
  );
}
