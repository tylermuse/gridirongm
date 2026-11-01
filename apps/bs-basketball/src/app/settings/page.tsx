'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getTheme, setTheme, type Theme } from '@/lib/ui/theme';
import { isSoundEnabled, setSoundEnabled, playSound } from '@/lib/ui/sound';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { isGodMode } from '@/lib/godMode/godMode';
import { type FranchiseEdit } from '@/lib/godMode/relocate';
import { GodModeCreatePlayer } from '@/components/godMode/GodModePlayerEditor';
import type { BasketballTeam } from '@bs/sport-basketball';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { CloudSavesPanel } from '@/components/settings/CloudSavesPanel';
import { LeagueRulesPanel } from '@/components/settings/LeagueRulesPanel';
import { Section } from '@/components/settings/Section';
import { Field, ColorField } from '@/components/settings/FranchiseFields';
import { SettingsChoice, settingsLinkClass } from '@/components/settings/SettingsControls';
import { expansionWindow, getExpansion } from '@/lib/expansion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { ConfirmModal } from '@/components/modals/ConfirmModal';

/**
 * /settings — appearance + sound preferences (Tier 3.1 + 3.7).
 *
 * Both settings are device-local (localStorage), not part of the save: a save
 * loaded on another machine keeps that machine's theme/sound. We read them in a
 * mount effect rather than during render so SSR and the client agree.
 */
export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [theme, setThemeState] = useState<Theme>('light');
  const [sound, setSoundState] = useState(false);
  const league = useLeagueStore(s => s.league);
  const setGodMode = useLeagueStore(s => s.setGodMode);
  const godOn = isGodMode(league);

  useEffect(() => {
    // Read device-local prefs after mount (deferred so we're not setting state
    // synchronously in the effect body). Until then we render the defaults,
    // which keeps SSR and the first client paint in agreement.
    const id = window.setTimeout(() => {
      setThemeState(getTheme());
      setSoundState(isSoundEnabled());
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  function toggleSound(next: boolean) {
    setSoundEnabled(next);
    setSoundState(next);
    if (next) playSound('chime'); // immediate confirmation it's on
  }

  return (
    <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        title="Settings"
        subtitle="Appearance and sound saved on this device. League rules saved with this league. Account + billing synced to your BS account."
        className="mb-6"
      />

      {/* STRIPE-4: account + subscription card — only renders when Supabase is
          configured. Mirrors the football settings page's AccountCard but slim:
          email, tier badge, manage-subscription / upgrade button, sign-out. */}
      <SubscriptionCard />

      {/* Cloud Saves — opt-in cross-device backup (parity with BS Football). */}
      <CloudSavesPanel />

      {/* Appearance */}
      <Section title="Appearance" desc="Switch between the warm light theme and a low-glare dark mode.">
        <div className="flex gap-2">
          <SettingsChoice active={mounted && theme === 'light'} onClick={() => chooseTheme('light')} icon="☀️" label="Light" />
          <SettingsChoice active={mounted && theme === 'dark'} onClick={() => chooseTheme('dark')} icon="🌙" label="Dark" />
        </div>
      </Section>

      {/* Sound */}
      <Section
        title="Sound"
        desc="A soft pop when a sim finishes, a chime when your team wins, a buzzer when a champion is crowned. Off by default."
      >
        <div className="flex gap-2">
          <SettingsChoice active={mounted && !sound} onClick={() => toggleSound(false)} icon="🔇" label="Muted" />
          <SettingsChoice active={mounted && sound} onClick={() => toggleSound(true)} icon="🔊" label="On" />
        </div>
        {mounted && sound && (
          <button
            onClick={() => playSound('pop')}
            className="mt-3 text-xs font-semibold underline opacity-70 hover:opacity-100"
          >
            Play a test sound
          </button>
        )}
      </Section>

      {/* God Mode (save-level) */}
      {league && (
        <Section
          title="God Mode"
          desc="Commissioner powers — edit any player's ratings, age, potential, position, contract, injury, and trade request from their card, or create new players. Saved with this league."
        >
          <div className="flex gap-2">
            <SettingsChoice active={!godOn} onClick={() => void setGodMode(false)} icon="🔒" label="Off" />
            <SettingsChoice active={godOn} onClick={() => void setGodMode(true)} icon="🛠️" label="On" />
          </div>
          {godOn && (
            <p className="text-xs text-[var(--text-sec)] mt-3">Open any player and use the God Mode editor on their card; force game outcomes from the dashboard.</p>
          )}
        </Section>
      )}

      {/* Switch Team — football parity: take over any franchise (spectators
          too); the old club goes to the AI. */}
      {league && <SwitchTeamPanel />}

      {/* League Rules — cap, calendar, health/development, roster. Always
          available (like BS Football's league settings); not a God Mode power. */}
      {league && <LeagueRulesPanel />}

      {/* Create player (God Mode) */}
      {league && godOn && (
        <Section title="Create Player" desc="Generate a new player at a chosen position, age, and overall — added to a team or the free-agent pool.">
          <GodModeCreatePlayer />
        </Section>
      )}

      {/* Franchise relocation / rebrand (God Mode) */}
      {league && godOn && <RelocatePanel />}

      {/* League expansion (offseason, after the draft) — no God Mode needed */}
      {league && <ExpansionPanel />}
    </main>
  );
}

// ===========================================================================
// STRIPE-4: account + subscription
// ===========================================================================

function SubscriptionCard() {
  const { user, tier, isAdmin, isFoundingMember, loading, signOut } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  if (loading) return null;

  const isPremium = tier === 'premium';
  const complimentary = (isFoundingMember || isAdmin) && !!user;

  async function manage() {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }

  // Signed-out — invite to sign in for billing + leaderboard.
  if (!user) {
    return (
      <Section title="Account" desc="Sign in to manage billing, sync the global leaderboard, and unlock Premium.">
        <div className="flex flex-wrap gap-2">
          <Link href="/login?next=/settings" className={settingsLinkClass('primary')}>Sign in</Link>
          <Link href="/pricing" className={settingsLinkClass('secondary')}>See Premium</Link>
        </div>
      </Section>
    );
  }

  // Signed-in — show tier badge + management actions.
  const badgeBg = isPremium
    ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
    : 'var(--surface-2)';
  const badgeColor = isPremium ? 'var(--accent)' : 'var(--text-sec)';
  const badgeLabel = complimentary
    ? (isAdmin ? 'Admin · Premium' : 'Founding Member · Premium')
    : isPremium ? 'Premium' : 'Free';

  return (
    <Section title="Account" desc="Manage your BS Hoops account and Premium subscription.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{user.email}</div>
          <div className="mt-1 inline-flex items-center gap-1.5">
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {badgeLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {complimentary ? null : isPremium ? (
            <Button variant="secondary" busy={portalLoading} onClick={() => void manage()}>
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </Button>
          ) : (
            <Link href="/pricing" className={settingsLinkClass('primary')}>Upgrade to Premium</Link>
          )}
          <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </Section>
  );
}

function RelocatePanel() {
  const league = useLeagueStore(s => s.league);
  const relocate = useLeagueStore(s => s.relocateTeam);
  const teams = useMemo(
    () => [...((league?.teams ?? []) as BasketballTeam[])].sort((a, b) => a.city.localeCompare(b.city)),
    [league],
  );
  const [teamId, setTeamId] = useState('');
  const sel = teams.find(t => t.id === teamId) ?? null;
  const [form, setForm] = useState<FranchiseEdit>({});
  const [saved, setSaved] = useState(false);
  const [applying, setApplying] = useState(false);

  function choose(id: string) {
    setTeamId(id);
    const t = teams.find(x => x.id === id);
    setForm(t ? { city: t.city, name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor } : {});
    setSaved(false);
  }
  async function apply() {
    if (!teamId) return;
    setApplying(true);
    try {
      await relocate(teamId, form);
      setSaved(true);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Section title="Relocate / rebrand a franchise" desc="Rename, re-city, and recolor any team. To add teams, use League Expansion below.">
      <select value={teamId} onChange={e => choose(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface-2)] text-sm mb-3" style={{ borderColor: 'var(--border)' }}>
        <option value="">Select a team…</option>
        {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
      </select>
      {sel && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="City" value={form.city ?? ''} onChange={v => { setForm(f => ({ ...f, city: v })); setSaved(false); }} />
            <Field label="Name" value={form.name ?? ''} onChange={v => { setForm(f => ({ ...f, name: v })); setSaved(false); }} />
            <Field label="Abbrev" value={form.abbreviation ?? ''} onChange={v => { setForm(f => ({ ...f, abbreviation: v })); setSaved(false); }} />
            <div />
            <ColorField label="Primary" value={form.primaryColor ?? '#000000'} onChange={v => { setForm(f => ({ ...f, primaryColor: v })); setSaved(false); }} />
            <ColorField label="Secondary" value={form.secondaryColor ?? '#ffffff'} onChange={v => { setForm(f => ({ ...f, secondaryColor: v })); setSaved(false); }} />
          </div>
          <Button variant="primary" size="sm" className="mt-1" busy={applying} onClick={() => void apply()}>
            {saved ? 'Saved ✓' : 'Apply'}
          </Button>
        </div>
      )}
    </Section>
  );
}

/** Football's Switch Team card: a logo grid of every franchise. Picking one
 *  goes through the store's existing pickUserTeam (the same action the Team
 *  page's "Pick This Team" and the post-firing takeover use) behind a confirm. */
function SwitchTeamPanel() {
  const league = useLeagueStore(s => s.league);
  const pickUserTeam = useLeagueStore(s => s.pickUserTeam);
  const router = useRouter();
  const [target, setTarget] = useState<BasketballTeam | null>(null);
  const [switching, setSwitching] = useState(false);
  const teams = useMemo(
    () => [...((league?.teams ?? []) as BasketballTeam[])].sort((a, b) => a.city.localeCompare(b.city)),
    [league],
  );
  if (!league) return null;
  const userTeamId = league.userTeamId;

  async function confirmSwitch() {
    if (!target) return;
    setSwitching(true);
    try {
      await pickUserTeam(target.id);
    } finally {
      setSwitching(false);
    }
    setTarget(null);
    router.push('/');
  }

  return (
    <Section
      title="Switch Team"
      desc={userTeamId
        ? 'Take control of a different franchise. Your current team will be managed by AI.'
        : "You're spectating — pick a franchise to take control of it."}
    >
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {teams.map(t => {
          const isCurrent = t.id === userTeamId;
          return (
            <button
              key={t.id}
              type="button"
              disabled={isCurrent}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => setTarget(t)}
              title={`${t.city} ${t.name}`}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-colors ${
                isCurrent
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] cursor-default'
                  : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] cursor-pointer'
              }`}
            >
              <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="md" />
              <span className="truncate w-full text-center text-[10px]">{t.abbreviation}</span>
            </button>
          );
        })}
      </div>
      <ConfirmModal
        open={!!target}
        onClose={() => { if (!switching) setTarget(null); }}
        title={target ? `Take over the ${target.city} ${target.name}?` : ''}
        body={target && (
          <div className="space-y-2">
            <p>{userTeamId ? 'Your current team becomes AI-controlled.' : 'You stop spectating and run this franchise.'}</p>
            <p className="text-[var(--text-sec)]">Your GM tenure restarts with the new club. This league&apos;s season, rosters and history carry on as-is.</p>
          </div>
        )}
        confirmLabel="Take over"
        loading={switching}
        onConfirm={() => void confirmSwitch()}
      />
    </Section>
  );
}

function ExpansionPanel() {
  const league = useLeagueStore(s => s.league);
  if (!league) return null;
  const win = expansionWindow(league);
  const exp = getExpansion(league);
  const inProgress = !!exp && exp.stage !== 'done';
  return (
    <Section
      title="League Expansion"
      desc={`Grow the league from ${league.teams.length} to up to 32 teams: create franchises, realign the conferences, run a protection list and an expansion draft. Irreversible.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/expansion" className={settingsLinkClass(inProgress || win.open ? 'primary' : 'secondary')}>
          {inProgress ? 'Resume expansion →' : 'Open expansion →'}
        </Link>
        <span className="text-xs text-[var(--text-sec)]">{inProgress ? 'An expansion is in progress.' : win.reason}</span>
      </div>
    </Section>
  );
}
