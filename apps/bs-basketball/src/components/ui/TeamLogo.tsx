'use client';

/**
 * Basketball team logo.
 *
 * Ports the "fallback" rendering style from bs-football's TeamLogo:
 * a 3D-styled rounded square with the team's primary color, a gradient
 * overlay + gloss highlight for depth, drop shadow tinted to the team
 * color, inner border.
 *
 * Each of the 30 league teams has a custom SVG icon (the ICONS map below)
 * themed to its parody name — drawn distinct from any football team's mark.
 * The icon renders inside the same 3D container. When no icon exists for an
 * abbreviation (e.g. an imported/custom league), we fall through to the
 * abbreviation text badge.
 */

import type { CSSProperties, ReactElement } from 'react';
import { getTeamLogo } from '@/lib/ui/teamLogos';

interface TeamLogoProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** Real logo image URL. Falls back to the active league's registry entry for
   *  this abbreviation, then the parody SVG icon / text badge. */
  logoUrl?: string;
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

const PADDING: Record<string, number> = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
};

/* ─── SVG Icon Renderers ─────────────────────────────────────────────────
 * Each returns an SVG element on a 0–32 viewBox.
 *   c  = secondaryColor — the icon "ink".
 *   bg = primaryColor   — the background, used for contrast cutouts/details.
 * Drawn to be visually distinct from any bs-football team mark. */

type IconFn = (c: string, bg: string) => ReactElement;

const ICONS: Record<string, IconFn> = {
  // ===================== Eastern — Atlantic =====================
  BOS: (c, bg) => ( // Greens — three-leaf shamrock + stem
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 14c-1-4 1-7 4-7 2 0 3 2 2 4-1 2-4 3-6 3z" fill={c}/>
      <path d="M16 14c1-4-1-7-4-7-2 0-3 2-2 4 1 2 4 3 6 3z" fill={c}/>
      <path d="M16 14c-3-2-6-1-7 1-1 2 0 4 2 4 3 0 5-3 5-5z" fill={c}/>
      <path d="M16 14c3-2 6-1 7 1 1 2 0 4-2 4-3 0-5-3-5-5z" fill={c}/>
      <path d="M16 14c-1 4-1 9 0 13" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="13.5" r="1.4" fill={bg} opacity="0.35"/>
    </svg>
  ),
  BKN: (c, bg) => ( // Bridge — twin suspension towers + cables
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M2 24h28" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M9 24V6M23 24V6" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      {/* pointed-arch tower openings */}
      <path d="M9 13c-1.6 0-2.6 1.4-2.6 3V18h5.2v-2c0-1.6-1-3-2.6-3z" fill={bg} opacity="0.45"/>
      <path d="M23 13c-1.6 0-2.6 1.4-2.6 3V18h5.2v-2c0-1.6-1-3-2.6-3z" fill={bg} opacity="0.45"/>
      {/* draped main cable + suspenders */}
      <path d="M2 14c4 5 5 5 7 5s4-7 7-7 5 7 7 7 3 0 7-5" stroke={c} strokeWidth="1.6" fill="none"/>
      <path d="M4 18v6M13 19v5M19 19v5M28 18v6" stroke={c} strokeWidth="0.9" opacity="0.7"/>
    </svg>
  ),
  NYE: (c, bg) => ( // Empire — Empire State Building tiered tower + spire
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M14 28V12h4v16z" fill={c}/>
      <path d="M12 16h8M11 20h10M10 24h12" stroke={bg} strokeWidth="0.8" opacity="0.4"/>
      <path d="M15 12V8h2v4z" fill={c}/>
      <path d="M15.4 8V5h1.2v3z" fill={c}/>
      <path d="M16 5V2" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11 28h10" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <rect x="13" y="22" width="1.6" height="6" fill={bg} opacity="0.35"/>
      <rect x="17.4" y="22" width="1.6" height="6" fill={bg} opacity="0.35"/>
    </svg>
  ),
  PHL: (c, bg) => ( // Bells — Liberty Bell with jagged crack
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 5c-1 0-1.6.7-1.6 1.6 0 .5.2.9.5 1.2C9.4 9 7 13 7 19v3h18v-3c0-6-2.4-10-7.9-11.2.3-.3.5-.7.5-1.2C17.6 5.7 17 5 16 5z" fill={c}/>
      <rect x="6" y="22" width="20" height="2.4" rx="1" fill={c}/>
      <rect x="14.6" y="24.4" width="2.8" height="3" fill={c}/>
      {/* crack */}
      <path d="M18 9l-2 4 2 3-2 3" stroke={bg} strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <path d="M9 19h14" stroke={bg} strokeWidth="0.8" opacity="0.35"/>
    </svg>
  ),
  TOR: (c, bg) => ( // Skyline — CN Tower + low skyline
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M15.2 27V13h1.6v14z" fill={c}/>
      <path d="M14 13l2-3 2 3z" fill={c}/>
      <ellipse cx="16" cy="13" rx="3.4" ry="1.4" fill={c}/>
      <path d="M16 10V4" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="16" cy="13" r="0.9" fill={bg} opacity="0.5"/>
      {/* skyline blocks */}
      <rect x="4" y="20" width="3" height="7" fill={c}/>
      <rect x="8" y="22" width="3" height="5" fill={c}/>
      <rect x="21" y="21" width="3" height="6" fill={c}/>
      <rect x="25" y="23" width="3" height="4" fill={c}/>
      <path d="M3 27h26" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),

  // ===================== Eastern — Central =====================
  CHW: (c, bg) => ( // Gusts — curling wind with a leading swirl
    <svg viewBox="0 0 32 32" fill="none">
      {/* leading swirl */}
      <path d="M18 8.5c2.4-1.9 5.7-1.5 6.9 1 .9 1.9.1 4-1.9 4.6-1.4.5-2.8-.5-2.8-1.7 0-.9.7-1.5 1.6-1.3" stroke={c} strokeWidth="2.3" strokeLinecap="round" fill="none"/>
      {/* three driving gust lines, the middle one curling back */}
      <path d="M4 12h12.5" stroke={c} strokeWidth="2.3" strokeLinecap="round"/>
      <path d="M4 17h16.5c2.6 0 4.7 1.6 4.7 3.9s-2.4 4-4.3 2.8c-1.2-.8-1-2.2.3-2.6" stroke={c} strokeWidth="2.3" strokeLinecap="round" fill="none"/>
      <path d="M6 22h8" stroke={c} strokeWidth="2.1" strokeLinecap="round" opacity="0.75"/>
      {/* trailing wisps + gloss on the swirl */}
      <path d="M3.4 12.4q1.1-.6 0-1.3M3.4 17.4q1.1-.6 0-1.3" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <circle cx="23" cy="11" r="0.9" fill={bg} opacity="0.45"/>
    </svg>
  ),
  CLR: (c, bg) => ( // Rust — pitted gear with bolt center
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 4l2 2.6 3.2-.8.8 3.2 3.2.8-.8 3.2 2.6 2-2.6 2 .8 3.2-3.2.8-.8 3.2-3.2-.8-2 2.6-2-2.6-3.2.8-.8-3.2-3.2-.8.8-3.2L4.2 16l2.6-2-.8-3.2 3.2-.8.8-3.2 3.2.8z" fill={c}/>
      <circle cx="16" cy="16" r="4.6" fill={bg}/>
      <circle cx="16" cy="16" r="2" fill={c}/>
      {/* rust pits */}
      <circle cx="12" cy="11" r="0.8" fill={bg} opacity="0.5"/>
      <circle cx="21" cy="13" r="0.7" fill={bg} opacity="0.5"/>
      <circle cx="13" cy="21" r="0.7" fill={bg} opacity="0.5"/>
      <circle cx="20" cy="20" r="0.6" fill={bg} opacity="0.5"/>
    </svg>
  ),
  DET: (c, bg) => ( // Motors — piston in cylinder
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="10" y="4" width="12" height="11" rx="1.5" fill={c}/>
      <rect x="11.5" y="6" width="9" height="2" rx="1" fill={bg} opacity="0.4"/>
      <rect x="11.5" y="9.5" width="9" height="2" rx="1" fill={bg} opacity="0.4"/>
      {/* connecting rod */}
      <path d="M14.6 15h2.8v6h-2.8z" fill={c}/>
      <circle cx="16" cy="25" r="3.4" fill={c}/>
      <circle cx="16" cy="25" r="1.3" fill={bg}/>
    </svg>
  ),
  IND: (c, bg) => ( // Pace — speedometer dial + needle
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M5 22a11 11 0 0 1 22 0" stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      {/* tick marks */}
      <path d="M6.5 16l1.8.9M11 11l1 1.7M16 9.5v2M21 11l-1 1.7M25.5 16l-1.8.9" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      {/* needle to redline */}
      <path d="M16 22l6-6" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="16" cy="22" r="2.2" fill={c}/>
      <circle cx="16" cy="22" r="0.9" fill={bg}/>
    </svg>
  ),
  MIL: (c, bg) => ( // Cream — frothy beer mug
    <svg viewBox="0 0 32 32" fill="none">
      <rect x="8" y="11" width="12" height="16" rx="1.6" fill={c}/>
      {/* foam head */}
      <path d="M8 11c0-3 2.5-4 4-3 1-2 5-2 6 0 2-.5 3 1 2.5 3z" fill={bg} opacity="0.85" stroke={c} strokeWidth="1.2"/>
      {/* handle */}
      <path d="M20 14h3.5c1.6 0 2.5 1.2 2.5 3.4s-1 3.6-2.6 3.6H20" stroke={c} strokeWidth="2.2" fill="none"/>
      <path d="M11 15v9M14 15v9M17 15v9" stroke={bg} strokeWidth="0.8" opacity="0.35"/>
    </svg>
  ),

  // ===================== Eastern — Southeast =====================
  ATL: (c, bg) => ( // Surge — lightning bolt inside concentric rings
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="12" stroke={c} strokeWidth="1.4" opacity="0.5" fill="none"/>
      <circle cx="16" cy="16" r="8.5" stroke={c} strokeWidth="1.1" opacity="0.35" fill="none"/>
      <path d="M18 5l-9 13h6l-2 9 9-13h-6z" fill={c}/>
      <path d="M16 13l-3 4h3" fill={bg} opacity="0.3"/>
    </svg>
  ),
  CHA: (c, bg) => ( // Royals — clean three-point crown
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M5 11l4 6 7-10 7 10 4-6v13H5z" fill={c}/>
      <path d="M5 24h22" stroke={bg} strokeWidth="1.2" opacity="0.4"/>
      <circle cx="5" cy="10" r="1.6" fill={c}/>
      <circle cx="16" cy="6" r="1.8" fill={c}/>
      <circle cx="27" cy="10" r="1.6" fill={c}/>
      <circle cx="11" cy="19" r="1" fill={bg} opacity="0.5"/>
      <circle cx="21" cy="19" r="1" fill={bg} opacity="0.5"/>
    </svg>
  ),
  MIH: (c, bg) => ( // Heatwave — sun with rippling heat lines
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="13" r="6" fill={c}/>
      <path d="M16 3v3M16 20v3M6 13h3M23 13h3M9 6l2 2M23 6l-2 2" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="16" cy="13" r="2.5" fill={bg} opacity="0.3"/>
      {/* shimmering heat waves */}
      <path d="M7 26c2-2 4 2 6 0s4 2 6 0 4 2 6 0" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85"/>
      <path d="M8 29c1.5-1.6 3 1.6 4.5 0s3 1.6 4.5 0 3 1.6 4.5 0" stroke={c} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.55"/>
    </svg>
  ),
  ORS: (c, bg) => ( // Spell — mystic burst star + sparkles
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 5l2.4 7.2L26 14l-6 4 2 8-6-5-6 5 2-8-6-4 7.6-1.8z" fill={c}/>
      <circle cx="16" cy="15.5" r="2" fill={bg} opacity="0.4"/>
      <path d="M7 7l.7 1.6L9 9l-1.3.4L7 11l-.7-1.6L5 9l1.3-.4z" fill={c}/>
      <path d="M25 6l.6 1.4L27 8l-1.4.4L25 10l-.6-1.6L23 8l1.4-.4z" fill={c}/>
      <circle cx="25" cy="22" r="0.9" fill={c}/>
    </svg>
  ),
  WAS: (c, bg) => ( // Senators — Capitol dome + flag
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 4v3" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M16 5h3v1.4h-3z" fill={c}/>
      <circle cx="16" cy="8" r="1.4" fill={c}/>
      {/* dome */}
      <path d="M9 18c0-4 3-7 7-7s7 3 7 7z" fill={c}/>
      <path d="M11 18c0-3 2-5 5-5s5 2 5 5" fill={bg} opacity="0.25"/>
      {/* colonnade base */}
      <rect x="7" y="18" width="18" height="2" fill={c}/>
      <path d="M9 20v6M13 20v6M16 20v6M19 20v6M23 20v6" stroke={c} strokeWidth="1.4"/>
      <rect x="6" y="26" width="20" height="2.2" rx="0.8" fill={c}/>
    </svg>
  ),

  // ===================== Western — Northwest =====================
  DEN: (c, bg) => ( // Peaks — three snow-capped mountains
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M3 25l7-13 5 8 4-7 8 12z" fill={c}/>
      {/* snow caps */}
      <path d="M10 12l2.6 4.2-2.6 1-2.6-1z" fill={bg} opacity="0.55"/>
      <path d="M23 13l2.4 3.6-2.4.9-2.2-.9z" fill={bg} opacity="0.55"/>
      <path d="M3 25h26" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  MIN: (c, bg) => ( // Pack — howling wolf head
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M9 9l3 3 4-1 4 1 3-3 1 6c1 1 1 3 0 4l-3 5-3 2h-4l-3-2-3-5c-1-1-1-3 0-4z" fill={c}/>
      {/* ears inner */}
      <path d="M10 11l1.5 1.5" stroke={bg} strokeWidth="1" opacity="0.4"/>
      <path d="M22 11l-1.5 1.5" stroke={bg} strokeWidth="1" opacity="0.4"/>
      {/* eyes */}
      <path d="M12.5 16l2 .6M19.5 16l-2 .6" stroke={bg} strokeWidth="1.4" strokeLinecap="round"/>
      {/* snout + nose */}
      <path d="M14 22h4l-2 3z" fill={bg} opacity="0.5"/>
      <circle cx="16" cy="21" r="1" fill={bg}/>
    </svg>
  ),
  OKC: (c, bg) => ( // Twisters — tornado funnel + debris
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M6 7h20M8 11h16M11 15h11M13 19h7M15 23h4l-1.5 4h-1z" fill={c}/>
      <path d="M6 7h20" stroke={c} strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M9 9c5 1 9 1 14 0M12 13c3 1 5 1 8 0" stroke={bg} strokeWidth="0.9" opacity="0.4"/>
      {/* flung debris */}
      <circle cx="28" cy="9" r="0.9" fill={c}/>
      <circle cx="4" cy="13" r="0.8" fill={c}/>
    </svg>
  ),
  POR: (c, bg) => ( // Roses — blooming rose
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="13" r="8" fill={c}/>
      {/* spiraled petals */}
      <path d="M16 13c0-3 2-5 4-4M16 13c3 0 5 2 4 4M16 13c0 3-2 5-4 4M16 13c-3 0-5-2-4-4" stroke={bg} strokeWidth="1.3" fill="none" opacity="0.5"/>
      <circle cx="16" cy="13" r="2.2" fill={bg} opacity="0.4"/>
      {/* stem + leaf */}
      <path d="M16 21v6" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 24c2-1 4-1 5 0-1 2-3 2-5 1z" fill={c}/>
    </svg>
  ),
  UTA: (c, bg) => ( // Salt — crystalline salt formation
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 4l5 8-5 4-5-4z" fill={c}/>
      <path d="M16 4l5 8-5 4z" fill={bg} opacity="0.2"/>
      <path d="M11 12l-5 4 5 4 5-4z" fill={c}/>
      <path d="M21 12l5 4-5 4-5-4z" fill={c}/>
      <path d="M11 20l5 4 5-4-5-4z" fill={c}/>
      <path d="M16 16v8" stroke={bg} strokeWidth="0.9" opacity="0.4"/>
      <path d="M11 12l10 0" stroke={bg} strokeWidth="0.9" opacity="0.3"/>
    </svg>
  ),

  // ===================== Western — Pacific =====================
  GSW: (c, bg) => ( // Bay — Golden Gate-style span over water
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M3 22h26" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M10 22V5M22 22V5" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M10 8h-4M10 12h-4M22 8h4M22 12h4" stroke={c} strokeWidth="1.3"/>
      {/* sweeping main cables */}
      <path d="M3 13c4 4 5 5 7 5s5-9 6-9 4 9 6 9 3-1 7-5" stroke={c} strokeWidth="1.5" fill="none"/>
      {/* water */}
      <path d="M4 26c2-1.4 4 1.4 6 0s4 1.4 6 0 4 1.4 6 0 3 .6 4 0" stroke={c} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.6"/>
      <path d="M4 26h24" stroke={bg} strokeWidth="0.6" opacity="0.2"/>
    </svg>
  ),
  LAS: (c, bg) => ( // Sails — sloop with billowing sails
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 4v18" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
      {/* mainsail */}
      <path d="M15 5c5 3 7 8 7 15h-7z" fill={c}/>
      {/* jib */}
      <path d="M15 7c-4 2-6 6-6 13h6z" fill={c} opacity="0.8"/>
      {/* hull */}
      <path d="M6 23h20l-3 4H9z" fill={c}/>
      {/* wave */}
      <path d="M5 28c2-1 4 1 6 0s4 1 6 0 4 1 6 0" stroke={c} strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.5"/>
      <path d="M16 12c2 1 3 3 3 6" stroke={bg} strokeWidth="0.8" opacity="0.3" fill="none"/>
    </svg>
  ),
  LSH: (c) => ( // Shores — breaking wave under a low sun
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="10" r="4.5" fill={c}/>
      <path d="M9 10h-3M26 10h-3M16 3v-1" stroke={c} strokeWidth="1.3" strokeLinecap="round" opacity="0.7"/>
      {/* curling shore wave */}
      <path d="M4 24c4-7 8-9 12-7 3 1.4 3 4.5 1 5.5-1.6.8-3-.4-2.4-1.8" stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M4 24c4-1 8-1 12 0M16 24c4-1 8-1 12 0" stroke={c} strokeWidth="1.6" strokeLinecap="round" opacity="0.5"/>
      <circle cx="9" cy="20" r="0.8" fill={c} opacity="0.7"/>
      <circle cx="13" cy="18" r="0.7" fill={c} opacity="0.6"/>
    </svg>
  ),
  PHX: (c, bg) => ( // Embers — rising phoenix flame
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 3c3 4 1 7-1 9 3-1 5-3 5-6 2 3 3 7 3 10 0 6-3 11-7 11s-7-5-7-11c0-2 .6-4 1.6-5.6C13 13 14 9 16 3z" fill={c}/>
      {/* inner flame */}
      <path d="M16 12c1.6 2 2.4 4.4 2.4 6.6 0 3.4-1 6.4-2.4 6.4s-2.4-3-2.4-6.4c0-1.4.4-2.8 1-4z" fill={bg} opacity="0.4"/>
      {/* ember sparks */}
      <circle cx="22" cy="8" r="0.9" fill={c}/>
      <circle cx="10" cy="11" r="0.8" fill={c}/>
    </svg>
  ),
  SAC: (c, bg) => ( // Crown — ornate jeweled crown
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M4 12l3.5 8 4-6 4.5 7 4.5-7 4 6 3.5-8-5 4-1.5-5-2.5 4-2-5-2 5-2.5-4-1.5 5z" fill={c}/>
      <rect x="6" y="20" width="20" height="4" rx="1" fill={c}/>
      {/* jewels on band */}
      <circle cx="10" cy="22" r="1.1" fill={bg} opacity="0.55"/>
      <circle cx="16" cy="22" r="1.3" fill={bg} opacity="0.6"/>
      <circle cx="22" cy="22" r="1.1" fill={bg} opacity="0.55"/>
      {/* crown-point jewels */}
      <circle cx="4" cy="12" r="1.3" fill={c}/>
      <circle cx="16" cy="9" r="1.5" fill={c}/>
      <circle cx="28" cy="12" r="1.3" fill={c}/>
    </svg>
  ),

  // ===================== Western — Southwest =====================
  DAL: (c, bg) => ( // Riders — cowboy hat over a horseshoe
    <svg viewBox="0 0 32 32" fill="none">
      {/* hat crown + brim */}
      <path d="M10 13c0-4 1.5-6 6-6s6 2 6 6c2 .4 4 1.4 5 3-5 2-17 2-22 0 1-1.6 3-2.6 5-3z" fill={c}/>
      <path d="M11 13c4 1.2 6 1.2 10 0" stroke={bg} strokeWidth="1" opacity="0.4"/>
      {/* horseshoe */}
      <path d="M10 20c0-3 2.7-5 6-5s6 2 6 5v4" stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <circle cx="10" cy="24" r="0.9" fill={c}/>
      <circle cx="22" cy="24" r="0.9" fill={c}/>
      <circle cx="12" cy="20" r="0.6" fill={bg} opacity="0.5"/>
      <circle cx="20" cy="20" r="0.6" fill={bg} opacity="0.5"/>
    </svg>
  ),
  HOO: (c, bg) => ( // Boost — rocket with boost flame
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 3c3 2 5 6 5 11v6h-10v-6c0-5 2-9 5-11z" fill={c}/>
      <circle cx="16" cy="11" r="2" fill={bg} opacity="0.5"/>
      {/* fins */}
      <path d="M11 16l-3 4v-2l3-4zM21 16l3 4v-2l-3-4z" fill={c}/>
      {/* boost flame */}
      <path d="M13 20h6l-1 3-2 3-2-3z" fill={c} opacity="0.85"/>
      <path d="M14.5 20h3l-1.5 4z" fill={bg} opacity="0.5"/>
    </svg>
  ),
  MEM: (c, bg) => ( // Blues — saxophone
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M18 4v9c0 4-2 7-6 7-3 0-5-2-5-5 0-2 1.4-3.4 3-3.4 1.4 0 2.4 1 2.4 2.2 0 1-.7 1.7-1.6 1.7" stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      {/* bell */}
      <path d="M18 4c3 0 6 1.6 7 4l-3 2c-1-1.6-2.4-2.4-4-2.4z" fill={c}/>
      {/* keys */}
      <circle cx="16.5" cy="9" r="0.8" fill={bg} opacity="0.6"/>
      <circle cx="15.5" cy="12" r="0.8" fill={bg} opacity="0.6"/>
      <circle cx="13.5" cy="15" r="0.8" fill={bg} opacity="0.6"/>
    </svg>
  ),
  NOB: (c, bg) => ( // Brass — trumpet with three valves
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M6 16c0-2 1.6-3.4 3.6-3.4H18" stroke={c} strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      {/* flared bell */}
      <path d="M6 12c-2 0-3.4 1.8-3.4 4s1.4 4 3.4 4l1-4z" fill={c}/>
      {/* leadpipe to mouthpiece */}
      <path d="M18 12.6L26 9" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="27" cy="8.5" r="1.6" fill={c}/>
      {/* valves */}
      <path d="M12 13v-4M15 13v-4M18 13v-4" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="8" r="1" fill={c}/>
      <circle cx="15" cy="8" r="1" fill={c}/>
      <circle cx="18" cy="8" r="1" fill={c}/>
      <path d="M9 16h7" stroke={bg} strokeWidth="0.7" opacity="0.3"/>
    </svg>
  ),
  SA: (c, bg) => ( // Lance — crossed lances with pennants
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M6 27L25 6M26 27L7 6" stroke={c} strokeWidth="2.2" strokeLinecap="round"/>
      {/* spear tips */}
      <path d="M25 6l1.5-2-3 .6z" fill={c}/>
      <path d="M7 6L5.5 4l3 .6z" fill={c}/>
      {/* pennant flags */}
      <path d="M24 9l3 1-2 2-1-1z" fill={c} opacity="0.85"/>
      <path d="M8 9l-3 1 2 2 1-1z" fill={c} opacity="0.85"/>
      <circle cx="16" cy="16.5" r="1.4" fill={c}/>
      <circle cx="16" cy="16.5" r="0.6" fill={bg}/>
    </svg>
  ),
};

export function TeamLogo({
  abbreviation,
  primaryColor,
  secondaryColor,
  size = 'md',
  className = '',
  logoUrl,
}: TeamLogoProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

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

  // Real logo image (from the roster file's per-team logoUrl) takes priority.
  const imgSrc = logoUrl ?? getTeamLogo(abbreviation);
  if (imgSrc) {
    const pad = PADDING[size] ?? PADDING.md;
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden relative ${className}`}
        style={{ ...containerStyle, padding: pad }}
      >
        <div className="absolute inset-0 pointer-events-none" style={gradientOverlay} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt={abbreviation} className="relative z-[1] w-full h-full object-contain" loading="lazy" />
      </div>
    );
  }

  const iconFn = ICONS[abbreviation];

  // Custom SVG icon path — render the art inside the 3D container.
  if (iconFn) {
    const pad = PADDING[size] ?? PADDING.md;
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden relative ${className}`}
        style={{ ...containerStyle, padding: pad }}
      >
        <div className="absolute inset-0 pointer-events-none" style={gradientOverlay} />
        <div className="absolute pointer-events-none" style={glossHighlight} />
        <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }}>
          {iconFn(secondaryColor, primaryColor)}
        </div>
      </div>
    );
  }

  // Fallback: text abbreviation badge (for imported/custom leagues).
  const fontSize = FONT_SIZES[size] ?? FONT_SIZES.md;
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
