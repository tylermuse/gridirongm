import type { CSSProperties, ReactNode } from 'react';
import MarketingLayout from '../(marketing)/layout';

/**
 * Light theme only, even for someone who turned on dark mode in the game. Dark
 * mode works by flipping these variables on <html>, so restating the light
 * values here covers every component below.
 */
const LIGHT_THEME = {
  '--bg': '#f0f4f8',
  '--surface': '#ffffff',
  '--surface-2': '#e8edf4',
  '--border': '#d1d9e6',
  '--text': '#1a2332',
  '--text-sec': '#5a6a7e',
  '--accent': '#2563eb',
  '--accent-glow': 'rgba(37, 99, 235, 0.12)',
  '--green': '#16a34a',
  '--red': '#dc2626',
  '--amber': '#d97706',
  color: 'var(--text)',
  colorScheme: 'light',
} as CSSProperties;

export default function MockDraftLayout({ children }: { children: ReactNode }) {
  return (
    <div style={LIGHT_THEME}>
      <MarketingLayout>{children}</MarketingLayout>
    </div>
  );
}
