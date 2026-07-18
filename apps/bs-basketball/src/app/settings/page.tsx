'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getTheme, setTheme, type Theme } from '@/lib/ui/theme';
import { isSoundEnabled, setSoundEnabled, playSound } from '@/lib/ui/sound';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { isGodMode } from '@/lib/godMode/godMode';
import { type FranchiseEdit } from '@/lib/godMode/relocate';
import type { BasketballTeam } from '@bs/sport-basketball';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

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
    <main className="max-w-2xl mx-auto p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Settings
        </h1>
        <p className="text-sm text-[var(--text-sec)]">Appearance and sound saved on this device. Account + billing synced to your BS account.</p>
      </header>

      {/* STRIPE-4: account + subscription card — only renders when Supabase is
          configured. Mirrors the football settings page's AccountCard but slim:
          email, tier badge, manage-subscription / upgrade button, sign-out. */}
      <SubscriptionCard />

      {/* Appearance */}
      <Section title="Appearance" desc="Switch between the warm light theme and a low-glare dark mode.">
        <div className="flex gap-2">
          <Choice active={mounted && theme === 'light'} onClick={() => chooseTheme('light')} icon="☀️" label="Light" />
          <Choice active={mounted && theme === 'dark'} onClick={() => chooseTheme('dark')} icon="🌙" label="Dark" />
        </div>
      </Section>

      {/* Sound */}
      <Section
        title="Sound"
        desc="A soft pop when a sim finishes, a chime when your team wins, a buzzer when a champion is crowned. Off by default."
      >
        <div className="flex gap-2">
          <Choice active={mounted && !sound} onClick={() => toggleSound(false)} icon="🔇" label="Muted" />
          <Choice active={mounted && sound} onClick={() => toggleSound(true)} icon="🔊" label="On" />
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
          desc="Commissioner powers — edit any player's overall, age, and potential from their card. Saved with this league."
        >
          <div className="flex gap-2">
            <Choice active={!godOn} onClick={() => void setGodMode(false)} icon="🔒" label="Off" />
            <Choice active={godOn} onClick={() => void setGodMode(true)} icon="🛠️" label="On" />
          </div>
          {godOn && (
            <p className="text-xs text-[var(--text-sec)] mt-3">Open any player and use the God Mode editor on their card; force game outcomes from the dashboard.</p>
          )}
        </Section>
      )}

      {/* Commissioner salary-cap override (God Mode) */}
      {league && godOn && <SalaryCapPanel />}

      {/* Franchise relocation / rebrand (God Mode) */}
      {league && godOn && <RelocatePanel />}
    </main>
  );
}

// ===========================================================================
// Commissioner: custom salary cap (§1.5 — feature parity with football)
// ===========================================================================

function SalaryCapPanel() {
  const league = useLeagueStore(s => s.league);
  const setCap = useLeagueStore(s => s.setCommissionerSalaryCap);
  const current = (league?.sportData as { commissionerSettings?: { salaryCap?: number } } | undefined)
    ?.commissionerSettings?.salaryCap;
  const [value, setValue] = useState(current ? String(Math.round(current / 1_000_000)) : '');

  function apply() {
    const m = parseFloat(value);
    if (Number.isFinite(m) && m > 0) void setCap(Math.round(m * 1_000_000));
  }
  function clear() {
    void setCap(null);
    setValue('');
  }

  return (
    <Section
      title="Salary Cap"
      desc="Commissioner override — set a flat league salary cap in $M (the tax line and aprons scale from it). Clear to use the standard inflation-based cap."
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Cap ($M)" value={value} onChange={setValue} />
        </div>
        <button onClick={apply} className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
          Set
        </button>
        <button onClick={clear} className="px-3 py-2 rounded border border-[var(--border)] text-sm font-semibold hover:bg-[var(--surface-2)]">
          Clear
        </button>
      </div>
      <p className="text-xs text-[var(--text-sec)] mt-2">
        {current ? `Active override: $${Math.round(current / 1_000_000)}M` : 'Using the standard inflation-based cap.'}
      </p>
    </Section>
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
          <Link
            href="/login?next=/settings"
            className="text-sm font-bold rounded-lg px-4 py-2 text-white"
            style={{ background: 'var(--accent)' }}
          >
            Sign in
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-bold rounded-lg px-4 py-2 border"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            See Premium
          </Link>
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
            <button
              onClick={() => void manage()}
              disabled={portalLoading}
              className="text-sm font-bold rounded-lg px-4 py-2 border disabled:opacity-50"
              style={{ borderColor: 'var(--border)' }}
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : (
            <Link
              href="/pricing"
              className="text-sm font-bold rounded-lg px-4 py-2 text-white"
              style={{ background: 'var(--accent)' }}
            >
              Upgrade to Premium
            </Link>
          )}
          <button
            onClick={signOut}
            className="text-sm font-semibold rounded-lg px-4 py-2 border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}
          >
            Sign out
          </button>
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

  function choose(id: string) {
    setTeamId(id);
    const t = teams.find(x => x.id === id);
    setForm(t ? { city: t.city, name: t.name, abbreviation: t.abbreviation, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor } : {});
    setSaved(false);
  }
  async function apply() {
    if (!teamId) return;
    await relocate(teamId, form);
    setSaved(true);
  }

  return (
    <Section title="Relocate / rebrand a franchise" desc="Rename, re-city, and recolor any team. (Full league expansion to 31–32 teams is deferred — it requires a schedule-generator rewrite.)">
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
          <button onClick={() => void apply()} className="mt-1 rounded-lg px-3 py-1.5 text-sm font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
            {saved ? 'Saved ✓' : 'Apply'}
          </button>
        </div>
      )}
    </Section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border bg-[var(--surface-2)] text-sm" style={{ borderColor: 'var(--border)' }} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-10 rounded border" style={{ borderColor: 'var(--border)' }} />
      <span className="text-[10px] uppercase tracking-wide opacity-60">{label}</span>
    </label>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-xl border bg-[var(--surface)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-[var(--text-sec)] mt-0.5 mb-3">{desc}</p>
      {children}
    </section>
  );
}

function Choice({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition active:scale-95"
      style={
        active
          ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }
          : { borderColor: 'var(--border)', color: 'var(--text-sec)' }
      }
    >
      <span aria-hidden className="text-base">{icon}</span>
      {label}
    </button>
  );
}
