'use client';

/**
 * PlayerAvatar — 3D-styled initials badge.
 *
 * Mirrors TeamLogo's depth treatment (team primary color background, gradient
 * overlay, gloss highlight, tinted drop shadow) but shows the player's
 * initials in the display font, inked in the team's secondary color.
 */

import type { CSSProperties } from 'react';

interface PlayerAvatarProps {
  firstName: string;
  lastName: string;
  primaryColor: string;
  secondaryColor: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-9 h-9 min-w-9 min-h-9 text-sm',
  md: 'w-12 h-12 min-w-12 min-h-12 text-base',
  lg: 'w-16 h-16 min-w-16 min-h-16 text-2xl',
  xl: 'w-24 h-24 min-w-24 min-h-24 text-4xl',
};

export function PlayerAvatar({
  firstName,
  lastName,
  primaryColor,
  secondaryColor,
  size = 'md',
  className = '',
}: PlayerAvatarProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const containerStyle: CSSProperties = {
    backgroundColor: primaryColor,
    boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
    border: `1px solid rgba(255,255,255,0.12)`,
    borderRadius: '22%',
    color: secondaryColor,
  };

  const gradientOverlay: CSSProperties = {
    background: 'linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%, rgba(0,0,0,0.2) 100%)',
    borderRadius: 'inherit',
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
      className={`${sizeClass} flex items-center justify-center font-black shrink-0 relative overflow-hidden ${className}`}
      style={containerStyle}
    >
      <div className="absolute inset-0 pointer-events-none" style={gradientOverlay} />
      <div className="absolute pointer-events-none" style={glossHighlight} />
      <span className="relative z-10 tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
        {initials}
      </span>
    </div>
  );
}
