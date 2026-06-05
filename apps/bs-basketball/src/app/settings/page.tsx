'use client';

import { useEffect, useState } from 'react';
import { getTheme, setTheme, type Theme } from '@/lib/ui/theme';
import { isSoundEnabled, setSoundEnabled, playSound } from '@/lib/ui/sound';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { isGodMode } from '@/lib/godMode/godMode';

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
            <p className="text-xs text-[var(--text-sec)] mt-3">Open any player and use the God Mode editor on their card.</p>
          )}
        </Section>
      )}
    </main>
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
