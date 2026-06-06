'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTheme, setTheme, type Theme } from '@/lib/ui/theme';
import { isSoundEnabled, setSoundEnabled, playSound } from '@/lib/ui/sound';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { isGodMode } from '@/lib/godMode/godMode';
import { type FranchiseEdit } from '@/lib/godMode/relocate';
import type { BasketballTeam } from '@bs/sport-basketball';

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
        <p className="text-sm text-[var(--text-sec)]">Appearance and sound. Saved on this device.</p>
      </header>

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

      {/* Franchise relocation / rebrand (God Mode) */}
      {league && godOn && <RelocatePanel />}
    </main>
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
