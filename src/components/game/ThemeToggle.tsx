'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'bsfootball-theme';

function readInitialTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Sun/moon button that flips data-theme on <html> and persists to
 *  localStorage. Initial value is set by the inline bootstrap script in
 *  layout.tsx so there's no flash on first paint. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readInitialTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* SSR / private mode — ignore */ }
  }

  // Render a placeholder during SSR + first render so server-rendered
  // markup matches client; otherwise React hydration warns about mismatch.
  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className={`shrink-0 ${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-lg flex items-center justify-center text-[var(--text-sec)]`}
      >
        <span className="text-base">☀️</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`shrink-0 ${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-lg flex items-center justify-center text-[var(--text-sec)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors`}
    >
      <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}
