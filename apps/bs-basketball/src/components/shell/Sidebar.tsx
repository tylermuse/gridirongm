'use client';

import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { SidebarFooter, DISCORD_URL } from './SidebarFooter';
import type { useLeagueStore } from '@/lib/store/leagueStore';
import type { BasketballTeam } from '@bs/sport-basketball';
import { pendingProposalCount } from '@/lib/trade/proposals';
import { nextAction, userExpiringCount } from '@/lib/ui/nextAction';
import { getDraft } from '@/lib/draft';

/**
 * Sectioned navigation rail (Tier 1.1). Persistent on desktop, a slide-out
 * drawer on mobile. Groups every route into scannable sections instead of a
 * flat wall of links.
 */

type League = ReturnType<typeof useLeagueStore.getState>['league'];

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Extra paths that also light this item (e.g. Rankings covers three pages). */
  alsoActive?: string[];
}
interface NavSection { label: string; items: NavItem[] }

type NavContext = { userTeamId: string | null; inDraftOffseason: boolean; draftComplete: boolean };

function sectionsFor({ userTeamId, inDraftOffseason, draftComplete }: NavContext): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'League',
      items: [
        { href: '/', label: 'Dashboard', icon: '🏠' },
        { href: '/standings', label: 'Standings', icon: '📊' },
        { href: '/stats', label: 'Stats', icon: '🔢' },
        { href: '/players', label: 'Player Search', icon: '🔎' },
        // Football folds its ranking boards into one item with in-page tabs.
        { href: '/power-rankings', label: 'Rankings', icon: '📈', alsoActive: ['/gm-rankings', '/award-race'] },
        { href: '/playoffs', label: 'Playoffs', icon: '🏆' },
        { href: '/news', label: 'News', icon: '📰', alsoActive: ['/recap'] },
        { href: '/show', label: 'The Show', icon: '🎙️' },
        { href: '/buzz', label: 'Buzz', icon: '💬' },
      ],
    },
    {
      label: 'Front Office',
      items: [
        { href: '/staff', label: 'Staff', icon: '🧑‍🏫' },
        { href: '/finances', label: 'Finances', icon: '💰' },
        // In season the draft tab is the scouting big board; the live draft
        // (and its recap) take over the offseason.
        inDraftOffseason
          ? { href: '/draft', label: 'Draft', icon: '🎯' }
          : { href: '/draft-preview', label: 'Draft Board', icon: '🎯', alsoActive: ['/draft'] },
        ...(draftComplete ? [{ href: '/draft-recap', label: 'Draft Recap', icon: '📝' }] : []),
        { href: '/free-agency', label: 'Free Agency', icon: '🖊️' },
        { href: '/trade', label: 'Trade', icon: '🔄' },
        { href: '/transactions', label: 'Transactions', icon: '📋' },
        ...(inDraftOffseason ? [{ href: '/expansion', label: 'Expansion', icon: '🏗️' }] : []),
      ],
    },
    {
      label: 'History',
      items: [
        { href: '/awards', label: 'Awards', icon: '🏅' },
        { href: '/history', label: 'History', icon: '🗃️' },
        { href: '/rosters', label: 'Rosters', icon: '📥' },
      ],
    },
  ];
  if (userTeamId) {
    sections.splice(1, 0, {
      label: 'My Team',
      items: [
        { href: '/roster', label: 'Roster & Lineup', icon: '👥' },
        { href: '/re-sign', label: 'Re-sign', icon: '✍️' },
      ],
    });
  }
  return sections;
}

type Badge = { text: string; className: string; title: string };

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
  const draft = league ? getDraft(league) : null;
  const sections = sectionsFor({ userTeamId, inDraftOffseason: !!draft, draftComplete: !!draft?.complete });
  const action = league ? nextAction(league) : null;

  // Football's sidebar badges: what needs you, right on the nav item.
  const offerCount = league ? pendingProposalCount(league) : 0;
  const expiring = league && draft?.complete && userTeamId ? userExpiringCount(league, draft.season) : 0;
  const userOnClock = !!draft && !draft.complete && draft.lotteryRevealed !== false
    && draft.picks[draft.currentPick]?.teamId === userTeamId;
  const faOpen = !!action && /Free Agency/.test(action.phaseLabel);
  const badgeFor = (href: string): Badge | null => {
    if (href === '/trade' && offerCount > 0) return { text: String(offerCount), className: 'bg-red-600 text-white', title: `${offerCount} pending trade offer${offerCount === 1 ? '' : 's'}` };
    if (href === '/re-sign' && expiring > 0) return { text: String(expiring), className: 'bg-amber-500 text-black', title: `${expiring} expiring contract${expiring === 1 ? '' : 's'} to decide` };
    if (href === '/draft' && userOnClock) return { text: 'Your Pick!', className: 'bg-red-600 text-white', title: "You're on the clock" };
    if (href === '/free-agency' && faOpen) return { text: 'Open', className: 'bg-amber-500 text-black', title: 'Free agency is open' };
    return null;
  };

  const isActive = (item: Pick<NavItem, 'href' | 'alsoActive'>) => {
    const match = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
    return match(item.href) || (item.alsoActive ?? []).some(match);
  };

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors ${
      active ? '' : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
    }`;
  const activeStyle = { color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' };

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
            <div className="font-bold text-sm truncate">{userTeam.city} {userTeam.name}</div>
            <div className="text-xs text-[var(--text-sec)] tabular-nums">{userTeam.record.wins}–{userTeam.record.losses}</div>
          </div>
        </Link>
      )}

      {/* Season · phase line (football's "Season 2026 · Week 1 · Re-signing"). */}
      {league && action && (
        <div className="px-4 py-2 border-b text-xs text-[var(--text-sec)] leading-snug" style={{ borderColor: 'var(--border)' }}>
          Season {league.currentSeason} · <span className="font-semibold" style={{ color: 'var(--accent)' }}>{action.phaseLabel}</span>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-2">
        {sections.map(section => (
          <div key={section.label} className="mb-2">
            <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest opacity-50 font-bold">{section.label}</div>
            {section.items.map(item => {
              const active = isActive(item);
              const badge = badgeFor(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={itemClass(active)}
                  style={active ? activeStyle : undefined}
                >
                  <span className="text-base leading-none w-5 text-center" aria-hidden>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {badge && (
                    <span className={`ml-auto text-[10px] rounded-full px-1.5 py-0.5 min-w-[20px] text-center font-bold leading-none ${badge.className}`} title={badge.title}>
                      {badge.text}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="mt-1 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={isActive({ href: '/settings' }) ? 'page' : undefined}
            className={itemClass(isActive({ href: '/settings' }))}
            style={isActive({ href: '/settings' }) ? activeStyle : undefined}
          >
            <span className="text-base leading-none w-5 text-center" aria-hidden>⚙️</span>
            Settings
          </Link>
          {/* Football keeps the community link in the nav list (not a big
              footer card), which leaves the rail room for its sections. */}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-0.5 transition-colors hover:brightness-95"
            style={{ background: 'color-mix(in srgb, #5865F2 12%, transparent)', color: '#5865F2' }}
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="w-5 shrink-0">
              <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.028C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.1 14.1 0 001.226-1.994.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.01c.12.098.246.197.373.291a.077.077 0 01-.007.128 12.3 12.3 0 01-1.873.891.077.077 0 00-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 00.084.029 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
            </svg>
            Join the Community
          </a>
        </div>
      </div>

      <SidebarFooter onNavigate={onNavigate} />
    </nav>
  );
}
