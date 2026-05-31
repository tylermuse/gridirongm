/**
 * Theme persistence (Tier 3.7).
 *
 * The CSS variables for both modes already live in globals.css; dark mode is
 * applied via a `data-theme="dark"` attribute on <html>. A bootstrap script in
 * layout.tsx reads the same `bshoops-theme` key before paint to avoid a flash.
 * These helpers are the runtime toggle.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'bshoops-theme';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked — theme still applies for this session */
  }
}
