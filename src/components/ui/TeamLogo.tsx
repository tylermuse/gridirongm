'use client';

import { useState } from 'react';
import { ICONS } from './teamLogoIcons';

interface TeamLogoProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  /** 'fill': fills its parent (e.g. broadcast graphics sized in em). */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';
  className?: string;
  /** External logo image URL (from imported league files) */
  logoUrl?: string;
  /**
   * Put a logoUrl image on a white tile instead of the team color. Real logos
   * are often drawn in the team color (the Jets' green wordmark vanishes on a
   * green tile). No effect on the bundled icons.
   */
  logoOnWhite?: boolean;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-5 h-5 min-w-5 min-h-5 max-w-5 max-h-5',
  sm: 'w-6 h-6 min-w-6 min-h-6 max-w-6 max-h-6',
  md: 'w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8',
  lg: 'w-10 h-10 min-w-10 min-h-10 max-w-10 max-h-10',
  xl: 'w-16 h-16 min-w-16 min-h-16 max-w-16 max-h-16',
  fill: 'w-full h-full',
};

const PADDING: Record<string, number | string> = {
  fill: '12%',
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
};

const FONT_SIZES: Record<string, string> = {
  xs: 'text-[7px]',
  sm: 'text-[8px]',
  md: 'text-[10px]',
  lg: 'text-xs',
  xl: 'text-base',
  fill: 'text-[1em]',
};


export function TeamLogo({ abbreviation, primaryColor, secondaryColor, size = 'md', className = '', logoUrl, logoOnWhite = false }: TeamLogoProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;
  const [imgFailed, setImgFailed] = useState(false);

  // If an external logo URL is provided AND it loads cleanly, render the image.
  // External hosts (Imgur etc.) 404 sometimes — when they do, fall through to
  // the bundled icon / text fallback so the user doesn't see an empty colored
  // box. Tyler 5/8: NYJ's source imgURL pFWZVFL.png went dead and the box
  // rendered with no abbreviation visible.
  if (logoUrl && !imgFailed) {
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden box-border relative ${className}`}
        style={
          logoOnWhite
            ? {
                backgroundColor: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '22%',
              }
            : {
                backgroundColor: primaryColor,
                boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
                border: `1px solid rgba(255,255,255,0.12)`,
                borderRadius: '22%',
              }
        }
      >
        <img
          src={logoUrl}
          alt={abbreviation}
          className="w-full h-full object-contain relative z-10"
          style={{ padding: PADDING[size] ?? PADDING.md }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  const iconFn = ICONS[abbreviation];

  if (iconFn) {
    const pad = PADDING[size] ?? PADDING.md;
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden box-border relative ${className}`}
        style={{
          backgroundColor: primaryColor,
          padding: pad,
          boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
          border: `1px solid rgba(255,255,255,0.12)`,
          borderRadius: '22%',
        }}
      >
        {/* Gradient overlay for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%, rgba(0,0,0,0.2) 100%)`,
            borderRadius: 'inherit',
          }}
        />
        {/* Gloss highlight */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: 0,
            left: '5%',
            right: '5%',
            height: '45%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)',
            borderRadius: '22% 22% 50% 50%',
          }}
        />
        <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}>
          {iconFn(secondaryColor, primaryColor)}
        </div>
      </div>
    );
  }

  // Fallback: text abbreviation badge (for custom/imported teams)
  const fontSize = FONT_SIZES[size] ?? FONT_SIZES.md;
  return (
    <div
      className={`${sizeClass} flex items-center justify-center font-black text-white shrink-0 relative overflow-hidden ${fontSize} ${className}`}
      style={{
        backgroundColor: primaryColor,
        boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
        border: `1px solid rgba(255,255,255,0.12)`,
        borderRadius: '22%',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.05) 40%, transparent 60%, rgba(0,0,0,0.2) 100%)`,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0,
          left: '5%',
          right: '5%',
          height: '45%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)',
          borderRadius: '22% 22% 50% 50%',
        }}
      />
      <span className="relative z-10">{abbreviation}</span>
    </div>
  );
}
