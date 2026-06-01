'use client';

import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { SidebarFooter } from './SidebarFooter';
import type { useLeagueStore } from '@/lib/store/leagueStore';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * Sectioned navigation rail (Tier 1.1). Persistent on desktop, a slide-out
 * drawer on mobile. Groups every route into scannable sections instead of a
 * flat wall of links.
 */

type League = ReturnType<typeof useLeagueStore.getState>['league'];

interface NavItem { href: string; label: string; icon: string }
interface NavSection { label: string; items: NavItem[] }

function sectionsFor(userTeamId: string | null): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'League',
      items: [
        { href: '/', label: 'Home', icon: '🏠' },
        { href: '/league', label: 'League', icon: '🏟️' },
        { href: '/standings', label: 'Standings', icon: '📊' },
        { href: '/stats', label: 'Stats', icon: '🔢' },
        { href: '/players', label: 'Players', icon: '🔎' },
        { href: '/power-rankings', label: 'Power Rankings', icon: '📈' },
        { href: '/compare', label: 'Compare', icon: '⚖️' },
        { href: '/playoffs', label: 'Playoffs', icon: '🏆' },
        { href: '/news', label: 'News', icon: '📰' },
        { href: '/buzz', label: 'Buzz', icon: '💬' },
      ],
    },
    {
      label: 'Front Office',
      items: [
        { href: '/staff', label: 'Staff', icon: '🧑‍🏫' },
        { href: '/finances', label: 'Finances', icon: '💰' },
        { href: '/draft', label: 'Draft', icon: '🎯' },
        { href: '/free-agency', label: 'Free Agency', icon: '🖊️' },
        { href: '/trade', label: 'Trade', icon: '🔄' },
        { href: '/transactions', label: 'Transactions', icon: '📋' },
      ],
    },
    {
      label: 'Postseason',
      items: [
        { href: '/awards', label: 'Awards', icon: '🏅' },
        { href: '/recap', label: 'Recap', icon: '🎬' },
        { href: '/history', label: 'History', icon: '🗃️' },
      ],
    },
  ];
  if (userTeamId) {
    sections.splice(1, 0, {
      label: 'My Team',
      items: [
        { href: '/roster', label: 'Roster & Lineup', icon: '👥' },
      ],
    });
  }
  return sections;
}

export function Sidebar({
  league, pathname, onNavigate,
}: {
  league: League;
  pathname: string;
  onNavigate?: () => void;
}) {
  const userTeamId = league?.userTeamId ?? null;
  const userTeam = userTeamId
    ? (league?.teams.find(t => t.id === userTeamId) as BasketballTeam | undefined) ?? null
    : null;
  const sections = sectionsFor(userTeamId);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href.startsWith('/team/') && href.endsWith('/lineup')) return pathname === href;
    if (href.startsWith('/team/')) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <nav className="flex flex-col h-full w-60 shrink-0 bg-[var(--surface)] border-r" style={{ borderColor: 'var(--border)' }}>
      {/* Brand */}
      <Link href="/" onClick={onNavigate} className="flex items-baseline gap-2 px-4 h-14 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xl font-black tracking-tight leading-[3.5rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>BS HOOPS</span>
        <span className="text-[9px] uppercase tracking-widest opacity-50">GM</span>
      </Link>

      {/* User team card */}
      {userTeam && (
        <Link href={`/team/${userTeam.id}`} onClick={onNavigate} className="flex items-center gap-2.5 px-4 py-3 border-b hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
          <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="md" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest opacity-50">You manage</div>
            <div className="font-bold text-sm truncate">{userTeam.city} {userTeam.name}</div>
            <div className="text-xs text-[var(--text-sec)] tabular-nums">{userTeam.record.wins}–{userTeam.record.losses}</div>
          </div>
        </Link>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {sections.map(section => (
          <div key={section.label} className="mb-1">
            <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest opacity-40 font-bold">{section.label}</div>
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors ${
                    active ? 'font-bold' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                  style={active ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
                >
                  <span className="text-base leading-none w-5 text-center" aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <Link
        href="/settings"
        onClick={onNavigate}
        className={`flex items-center gap-2.5 px-4 py-2 text-sm border-t transition-colors ${
          isActive('/settings') ? 'font-bold' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
        }`}
        style={{
          borderColor: 'var(--border)',
          ...(isActive('/settings')
            ? { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', boxShadow: 'inset 3px 0 0 var(--accent)' }
            : {}),
        }}
      >
        <span className="text-base leading-none w-5 text-center" aria-hidden>⚙️</span>
        Settings
      </Link>

      <SidebarFooter onNavigate={onNavigate} />

      <div className="px-4 py-3 border-t text-[10px] text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
        <span className="font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>BS HOOPS</span> · parody, not the NBA
      </div>
    </nav>
  );
}
