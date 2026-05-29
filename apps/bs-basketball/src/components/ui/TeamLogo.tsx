'use client';

/**
 * Basketball team logo.
 *
 * Ports the "fallback" rendering style from bs-football's TeamLogo:
 * a 3D-styled rounded square with the team's primary color, a gradient
 * overlay + gloss highlight for depth, drop shadow tinted to the team
 * color, inner border. The abbreviation sits centered in the team's
 * secondary color in a black weight.
 *
 * Custom per-team SVG art is a future enhancement; the fallback alone
 * matches the polish of football's imported-league team rendering.
 */

import type { CSSProperties } from 'react';

interface TeamLogoProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-5 h-5 min-w-5 min-h-5 max-w-5 max-h-5',
  sm: 'w-7 h-7 min-w-7 min-h-7 max-w-7 max-h-7',
  md: 'w-9 h-9 min-w-9 min-h-9 max-w-9 max-h-9',
  lg: 'w-12 h-12 min-w-12 min-h-12 max-w-12 max-h-12',
  xl: 'w-16 h-16 min-w-16 min-h-16 max-w-16 max-h-16',
};

const FONT_SIZES: Record<string, string> = {
  xs: 'text-[8px]',
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

export function TeamLogo({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = 'md',
  className = '',
}: TeamLogoProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const fontSize = FONT_SIZES[size] ?? FONT_SIZES.md;

  // Tinted glow shadow uses the team's primary color so each logo
  // "floats" in its own colored aura on hover.
  const containerStyle: CSSProperties = {
    backgroundColor: primaryColor,
    boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
    border: `1px solid rgba(255,255,255,0.12)`,
    borderRadius: '22%',
    color: secondaryColor,
  };

  const gradientOverlay: CSSProperties = {
    background: 'linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%, rgba(0,0,0,0.2) 100%)',
  };

  const glossHighlight: CSSProperties = {
    top: 0,
    left: '5%',
    right: '5%',
    height: '45%',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)',
    borderRadius: '22% 22% 50% 50%',
  };

  return (
    <div
      className={`${sizeClass} flex items-center justify-center font-black shrink-0 relative overflow-hidden ${fontSize} ${className}`}
      style={containerStyle}
    >
      <div className="absolute inset-0 pointer-events-none" style={gradientOverlay} />
      <div className="absolute pointer-events-none" style={glossHighlight} />
      <span
        className="relative z-10 tracking-tighter"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {abbreviation}
      </span>
    </div>
  );
}
