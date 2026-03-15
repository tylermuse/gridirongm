'use client';

import React from 'react';

interface TeamLogoProps {
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** External logo image URL (from imported league files) */
  logoUrl?: string;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-5 h-5 min-w-5 min-h-5 max-w-5 max-h-5',
  sm: 'w-6 h-6 min-w-6 min-h-6 max-w-6 max-h-6',
  md: 'w-8 h-8 min-w-8 min-h-8 max-w-8 max-h-8',
  lg: 'w-10 h-10 min-w-10 min-h-10 max-w-10 max-h-10',
  xl: 'w-16 h-16 min-w-16 min-h-16 max-w-16 max-h-16',
};

const PADDING: Record<string, number> = {
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
};

/* ─── SVG Icon Renderers ─── */
/* Each returns an SVG element. `c` = secondaryColor (icon), rendered on primaryColor bg */
/* `bg` = primaryColor, used when icons need contrast cutouts */

type IconFn = (c: string, bg: string) => React.ReactElement;

const ICONS: Record<string, IconFn> = {
  // ── AC East ──
  BUF: (c, bg) => ( // Blizzard — Charging bison head with snow swirl
    <svg viewBox="0 0 32 32" fill="none">
      {/* Bison head silhouette - front view */}
      <path d="M16 6c-5 0-9 3-9 7v3c0 2 1 4 3 5l2 2v3h2v-2h4v2h2v-3l2-2c2-1 3-3 3-5v-3c0-4-4-7-9-7z" fill={c}/>
      {/* Horns curving out */}
      <path d="M7 13c-2-1-4-3-4-5l2 0c1 1 2 3 3 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M25 13c2-1 4-3 4-5l-2 0c-1 1-2 3-3 4" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      {/* Shaggy fur on forehead */}
      <path d="M11 10c1-2 3-3 5-3s4 1 5 3" stroke={bg} strokeWidth="0.8" opacity="0.25" fill="none"/>
      <path d="M12 12c1-1 2-2 4-2s3 1 4 2" stroke={bg} strokeWidth="0.6" opacity="0.2" fill="none"/>
      {/* Eyes */}
      <circle cx="12.5" cy="14" r="1.3" fill={bg} opacity="0.45"/>
      <circle cx="19.5" cy="14" r="1.3" fill={bg} opacity="0.45"/>
      <circle cx="12.8" cy="13.8" r="0.5" fill={bg} opacity="0.7"/>
      <circle cx="19.8" cy="13.8" r="0.5" fill={bg} opacity="0.7"/>
      {/* Nostrils */}
      <ellipse cx="14" cy="19" rx="1" ry="0.7" fill={bg} opacity="0.3"/>
      <ellipse cx="18" cy="19" rx="1" ry="0.7" fill={bg} opacity="0.3"/>
      {/* Snow swirl accent */}
      <circle cx="5" cy="5" r="1" fill={c} opacity="0.4"/>
      <circle cx="27" cy="4" r="0.7" fill={c} opacity="0.3"/>
      <circle cx="3" cy="10" r="0.5" fill={c} opacity="0.25"/>
      <circle cx="29" cy="9" r="0.6" fill={c} opacity="0.2"/>
    </svg>
  ),
  MIA: (c) => ( // Riptide — Curling wave with spray
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M3 20c3-5 5-8 9-8 3 0 4 3 6 3s4-3 7-3c2 0 4 2 4 5" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M26 17c0-4-3-7-7-3-2 2-3 5-7 5-3 0-5-3-7-1" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Spray droplets */}
      <circle cx="22" cy="10" r="1" fill={c} opacity="0.7"/>
      <circle cx="25" cy="12" r="0.7" fill={c} opacity="0.5"/>
      <circle cx="19" cy="8" r="0.8" fill={c} opacity="0.6"/>
      {/* Lower wave */}
      <path d="M2 26c3-2 6-2 9 0s6 2 9 0" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
    </svg>
  ),
  NE: (c, bg) => ( // Minutemen — Tricorn hat with musket
    <svg viewBox="0 0 32 32" fill="none">
      {/* Tricorn hat */}
      <path d="M6 18c2-8 5-12 10-12s8 4 10 12" stroke={c} strokeWidth="2" fill={c} opacity="0.3"/>
      <path d="M4 18h24" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M8 18c0-6 3-10 8-10s8 4 8 10" fill={c}/>
      {/* Hat band */}
      <rect x="10" y="14" width="12" height="2" rx="1" fill={bg} opacity="0.3"/>
      {/* Crossed muskets below */}
      <line x1="9" y1="22" x2="23" y2="28" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="23" y1="22" x2="9" y2="28" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="25" r="1.5" fill={c}/>
    </svg>
  ),
  NYS: (c, bg) => ( // Sentinels — Shield with eye
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 3L5 8v8c0 6.5 4.5 11.5 11 14 6.5-2.5 11-7.5 11-14V8L16 3z" fill={c}/>
      <path d="M16 5L7 9.5v6.5c0 5.5 3.8 9.8 9 12 5.2-2.2 9-6.5 9-12V9.5L16 5z" fill={bg} opacity="0.2"/>
      {/* Vigilant eye */}
      <ellipse cx="16" cy="16" rx="5" ry="3" fill={bg} opacity="0.3"/>
      <circle cx="16" cy="16" r="2" fill={bg} opacity="0.5"/>
      <circle cx="16" cy="16" r="1" fill={c}/>
      {/* Shield border accent */}
      <path d="M16 5L7 9.5v6.5c0 5.5 3.8 9.8 9 12 5.2-2.2 9-6.5 9-12V9.5L16 5z" fill="none" stroke={c} strokeWidth="0.5" opacity="0.5"/>
    </svg>
  ),

  // ── AC North ──
  BAL: (c) => ( // Ironclads — Detailed anchor with rope
    <svg viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="6" r="3" stroke={c} strokeWidth="2"/>
      <line x1="16" y1="9" x2="16" y2="26" stroke={c} strokeWidth="2.5"/>
      <path d="M10 13h12" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {/* Anchor flukes */}
      <path d="M6 26c0-5 4.5-9 10-9s10 4 10 9" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M6 26l3-3" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M26 26l-3-3" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      {/* Rope detail */}
      <path d="M13 6c-3-1-5 0-6 2" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  CIN: (c, bg) => ( // Forge — Anvil with hammer and sparks
    <svg viewBox="0 0 32 32" fill="none">
      {/* Anvil body */}
      <path d="M6 20h20v4H6z" fill={c}/>
      <path d="M8 16h16l2 4H6l2-4z" fill={c}/>
      <path d="M10 13h12v3H10z" fill={c} opacity="0.8"/>
      {/* Anvil horn */}
      <path d="M22 16l5-2v2" fill={c}/>
      {/* Hammer */}
      <line x1="14" y1="4" x2="14" y2="13" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <rect x="10" y="3" width="8" height="4" rx="1" fill={c}/>
      {/* Sparks */}
      <circle cx="20" cy="10" r="0.8" fill={c} opacity="0.7"/>
      <circle cx="22" cy="8" r="0.6" fill={c} opacity="0.5"/>
      <circle cx="18" cy="7" r="0.7" fill={c} opacity="0.6"/>
      {/* Base */}
      <rect x="4" y="24" width="24" height="3" rx="1" fill={c} opacity="0.5"/>
    </svg>
  ),
  CLE: (c, bg) => ( // Hounds — Aggressive dog head profile
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M8 6l-3 5 2 3-1 4 3 2h4l3 3 6 1 4-3v-5l-2-4 1-4-4-3-5 1-3-1-2 1z" fill={c}/>
      {/* Ear */}
      <path d="M8 6l2 4 3-1-2-4z" fill={c} opacity="0.7"/>
      {/* Eye */}
      <circle cx="13" cy="13" r="1.8" fill={bg} opacity="0.4"/>
      <circle cx="13.3" cy="12.8" r="0.8" fill={bg} opacity="0.7"/>
      {/* Snout & jaw */}
      <path d="M19 18l5 1 2-2v-3" stroke={bg} strokeWidth="0.5" opacity="0.3" fill="none"/>
      {/* Teeth */}
      <path d="M20 17v2M22 16.5v2M24 16v1.5" stroke={bg} strokeWidth="0.8" opacity="0.3" strokeLinecap="round"/>
      {/* Collar */}
      <path d="M10 20l3 3 4 1" stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  PIT: (c) => ( // Rivermen — Ornate trident
    <svg viewBox="0 0 32 32" fill="none">
      {/* Shaft */}
      <line x1="16" y1="10" x2="16" y2="29" stroke={c} strokeWidth="2.5"/>
      {/* Three prongs */}
      <path d="M16 3v7" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M10 6v4c0 1 2.5 2 6 2s6-1 6-2V6" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M10 6l-1-3" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M22 6l1-3" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {/* Prong tips */}
      <circle cx="16" cy="3" r="1.2" fill={c}/>
      <circle cx="9" cy="3" r="1" fill={c}/>
      <circle cx="23" cy="3" r="1" fill={c}/>
      {/* Cross guard */}
      <rect x="12" y="12" width="8" height="2" rx="1" fill={c} opacity="0.5"/>
    </svg>
  ),

  // ── AC South ──
  HOU: (c, bg) => ( // Outlaws — Star on sheriff badge
    <svg viewBox="0 0 32 32" fill="none">
      {/* Badge outer circle */}
      <circle cx="16" cy="16" r="13" fill={c} opacity="0.15"/>
      {/* Five-point star */}
      <polygon points="16,3 19.1,11 28,12 21.5,18 23.5,27 16,22.5 8.5,27 10.5,18 4,12 12.9,11" fill={c}/>
      {/* Inner circle */}
      <circle cx="16" cy="15.5" r="4" fill={bg} opacity="0.25"/>
      <circle cx="16" cy="15.5" r="2.5" fill={c} opacity="0.5"/>
      {/* Badge points between star */}
      <circle cx="16" cy="3" r="0.8" fill={c} opacity="0.4"/>
    </svg>
  ),
  IND: (c, bg) => ( // Bolts — Lightning bolt with glow
    <svg viewBox="0 0 32 32" fill="none">
      {/* Glow */}
      <polygon points="15,1 7,16 14,16 11,31 25,13 17,13 21,1" fill={c} opacity="0.15"/>
      {/* Main bolt */}
      <polygon points="15,3 8,15 14,15 12,29 24,14 17,14 20,3" fill={c}/>
      {/* Highlight streak */}
      <path d="M16 6l-4 8h4l-1 10" stroke={bg} strokeWidth="0.8" opacity="0.3" fill="none"/>
    </svg>
  ),
  JAX: (c, bg) => ( // Gators — Alligator head from above, jaws open
    <svg viewBox="0 0 32 32" fill="none">
      {/* Upper jaw */}
      <path d="M8 5c-3 0-5 3-5 6l13 5 13-5c0-3-2-6-5-6H8z" fill={c}/>
      {/* Lower jaw */}
      <path d="M3 18l13-4 13 4c0 3-2 6-5 6H8c-3 0-5-3-5-6z" fill={c}/>
      {/* Teeth upper */}
      <path d="M7 11l1.5 3M10 12l1 3M13 13l0.5 2.5M19 13l-0.5 2.5M22 12l-1 3M25 11l-1.5 3" stroke={bg} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      {/* Teeth lower */}
      <path d="M8 18l1-2.5M11 17l0.5-2M14 16l0.3-1.5M18 16l-0.3-1.5M21 17l-0.5-2M24 18l-1-2.5" stroke={bg} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      {/* Eyes */}
      <circle cx="10" cy="7" r="1.5" fill={bg} opacity="0.4"/>
      <circle cx="22" cy="7" r="1.5" fill={bg} opacity="0.4"/>
      <circle cx="10" cy="7" r="0.7" fill={bg} opacity="0.7"/>
      <circle cx="22" cy="7" r="0.7" fill={bg} opacity="0.7"/>
    </svg>
  ),
  TEN: (c, bg) => ( // Copperheads — Coiled striking snake
    <svg viewBox="0 0 32 32" fill="none">
      {/* Coiled body */}
      <path d="M16 28c-5 0-8-3-8-7s3-5 6-5c4 0 6 2 6 5" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M20 21c0-4-3-7-7-4" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      {/* Head striking forward */}
      <path d="M10 14l-2-6c0-2 2-4 4-4 3 0 4 2 4 4l-2 4" fill={c}/>
      {/* Eyes */}
      <circle cx="10" cy="6" r="1" fill={bg} opacity="0.5"/>
      <circle cx="14" cy="6" r="1" fill={bg} opacity="0.5"/>
      {/* Forked tongue */}
      <path d="M12 4l-2-2M12 4l-3 0" stroke={c} strokeWidth="0.8" strokeLinecap="round"/>
      {/* Scale pattern */}
      <path d="M12 22l2-1M14 25l2-1M10 25l-2-1" stroke={bg} strokeWidth="0.5" opacity="0.2"/>
    </svg>
  ),

  // ── AC West ──
  DEN: (c, bg) => ( // Summit — Mountain range with snow cap
    <svg viewBox="0 0 32 32" fill="none">
      {/* Background mountain */}
      <polygon points="22,8 32,26 12,26" fill={c} opacity="0.4"/>
      {/* Main peak */}
      <polygon points="13,4 26,26 0,26" fill={c}/>
      {/* Snow cap */}
      <polygon points="13,4 17,12 9,12" fill={bg} opacity="0.35"/>
      <path d="M9 12c1 0 2 1 3 0s2-1 3 0l2 0" stroke={c} strokeWidth="0.8" opacity="0.6"/>
      {/* Ridgeline detail */}
      <path d="M0 26l13-22" stroke={bg} strokeWidth="0.3" opacity="0.15"/>
      <path d="M26 26l-13-22" stroke={bg} strokeWidth="0.3" opacity="0.15"/>
    </svg>
  ),
  KC: (c, bg) => ( // Marshals — Marshal's badge (6-point star)
    <svg viewBox="0 0 32 32" fill="none">
      {/* Six-point star */}
      <polygon points="16,2 19,10 28,10 21,15 24,24 16,19 8,24 11,15 4,10 13,10" fill={c}/>
      {/* Inner detail */}
      <circle cx="16" cy="14" r="4" fill={bg} opacity="0.2"/>
      <circle cx="16" cy="14" r="2" fill={bg} opacity="0.35"/>
      {/* MARSHAL text circle */}
      <circle cx="16" cy="14" r="6" stroke={bg} strokeWidth="0.5" opacity="0.2" fill="none"/>
    </svg>
  ),
  LV: (c, bg) => ( // Vipers — Detailed striking viper
    <svg viewBox="0 0 32 32" fill="none">
      {/* Head - diamond shape */}
      <path d="M16 4l-6 6 6 6 6-6z" fill={c}/>
      {/* Body */}
      <path d="M12 14c-4 3-6 7-4 10s6 3 8 1 0-6 2-8" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Fangs */}
      <path d="M13 10l-2 4" stroke={bg} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <path d="M19 10l2 4" stroke={bg} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      {/* Eyes */}
      <circle cx="13.5" cy="8" r="1.2" fill={bg} opacity="0.5"/>
      <circle cx="18.5" cy="8" r="1.2" fill={bg} opacity="0.5"/>
      <circle cx="13.5" cy="8" r="0.5" fill={bg} opacity="0.8"/>
      <circle cx="18.5" cy="8" r="0.5" fill={bg} opacity="0.8"/>
      {/* Scale pattern on head */}
      <path d="M16 5l-2 2M16 5l2 2M16 7l-1 2M16 7l1 2" stroke={bg} strokeWidth="0.4" opacity="0.2"/>
    </svg>
  ),
  LAA: (c) => ( // Aftershock — Seismograph with radiating waves
    <svg viewBox="0 0 32 32" fill="none">
      {/* Seismograph line */}
      <path d="M2 16h5l2-8 3 16 3-16 3 16 2-8h5" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {/* Radiating circles */}
      <circle cx="16" cy="16" r="4" stroke={c} strokeWidth="1" opacity="0.3" fill="none"/>
      <circle cx="16" cy="16" r="8" stroke={c} strokeWidth="0.8" opacity="0.15" fill="none"/>
      <circle cx="16" cy="16" r="12" stroke={c} strokeWidth="0.5" opacity="0.1" fill="none"/>
      {/* Center dot */}
      <circle cx="16" cy="16" r="1.5" fill={c}/>
    </svg>
  ),

  // ── NC East ──
  DAL: (c, bg) => ( // Wranglers — Horseshoe with lasso
    <svg viewBox="0 0 32 32" fill="none">
      {/* Horseshoe */}
      <path d="M8 6v10a8 8 0 0016 0V6" stroke={c} strokeWidth="3.5" strokeLinecap="round"/>
      {/* Nail holes */}
      <circle cx="8" cy="10" r="1" fill={bg} opacity="0.3"/>
      <circle cx="8" cy="15" r="1" fill={bg} opacity="0.3"/>
      <circle cx="24" cy="10" r="1" fill={bg} opacity="0.3"/>
      <circle cx="24" cy="15" r="1" fill={bg} opacity="0.3"/>
      {/* Star in center */}
      <polygon points="16,12 17.5,15 21,15.5 18.5,18 19,21.5 16,19.5 13,21.5 13.5,18 11,15.5 14.5,15" fill={c} opacity="0.4"/>
    </svg>
  ),
  NYG: (c, bg) => ( // Guardians — Castle tower with battlements
    <svg viewBox="0 0 32 32" fill="none">
      {/* Tower body */}
      <rect x="8" y="10" width="16" height="18" fill={c}/>
      {/* Battlements */}
      <rect x="6" y="4" width="4" height="8" fill={c}/>
      <rect x="14" y="4" width="4" height="8" fill={c}/>
      <rect x="22" y="4" width="4" height="8" fill={c}/>
      {/* Crenellation gaps */}
      <rect x="10" y="4" width="4" height="4" fill={bg} opacity="0.1"/>
      <rect x="18" y="4" width="4" height="4" fill={bg} opacity="0.1"/>
      {/* Gate arch */}
      <path d="M13 28v-6a3 3 0 016 0v6" fill={bg} opacity="0.25"/>
      {/* Window */}
      <rect x="14.5" y="14" width="3" height="4" rx="1.5" fill={bg} opacity="0.25"/>
      {/* Stone lines */}
      <line x1="8" y1="18" x2="24" y2="18" stroke={bg} strokeWidth="0.5" opacity="0.15"/>
      <line x1="8" y1="22" x2="24" y2="22" stroke={bg} strokeWidth="0.5" opacity="0.15"/>
    </svg>
  ),
  PHI: (c, bg) => ( // Founders — Liberty bell with crack
    <svg viewBox="0 0 32 32" fill="none">
      {/* Bell body */}
      <path d="M10 6c0-2 3-3 6-3s6 1 6 3v2c0 4-1 10-1.5 14H11.5C11 18 10 12 10 8V6z" fill={c}/>
      {/* Bell rim */}
      <path d="M9 22h14c1 0 2 1 2 2v1H7v-1c0-1 1-2 2-2z" fill={c}/>
      {/* Yoke at top */}
      <rect x="13" y="2" width="6" height="3" rx="1.5" fill={c} opacity="0.7"/>
      <line x1="16" y1="1" x2="16" y2="3" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {/* Crack */}
      <path d="M16 8l-1 3 2 2-1 3 1 3-1 3" stroke={bg} strokeWidth="1" strokeLinecap="round" opacity="0.4" fill="none"/>
      {/* Band */}
      <path d="M11 10h10" stroke={bg} strokeWidth="0.8" opacity="0.2"/>
    </svg>
  ),
  WAS: (c, bg) => ( // Generals — Crossed swords with pommel
    <svg viewBox="0 0 32 32" fill="none">
      {/* Sword 1 */}
      <line x1="5" y1="27" x2="24" y2="5" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M24 5l3-1-1 3" fill={c}/>
      <line x1="7" y1="22" x2="10" y2="25" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="5" cy="27" r="1.5" fill={c}/>
      {/* Sword 2 */}
      <line x1="27" y1="27" x2="8" y2="5" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 5L5 4l1 3" fill={c}/>
      <line x1="25" y1="22" x2="22" y2="25" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="27" cy="27" r="1.5" fill={c}/>
      {/* Center emblem */}
      <circle cx="16" cy="16" r="3" fill={c} opacity="0.4"/>
      <circle cx="16" cy="16" r="1.5" fill={c}/>
    </svg>
  ),

  // ── NC North ──
  CHI: (c, bg) => ( // Enforcers — Raised fist
    <svg viewBox="0 0 32 32" fill="none">
      {/* Fist body */}
      <path d="M10 17V11c0-1.5 1-2.5 2.5-2.5S15 9.5 15 11v-1.5c0-1.5 1-2.5 2.5-2.5S20 8 20 9.5V11c0-1.5 1-2.5 2.5-2.5S25 10 25 11.5v7c0 5-3 9-7.5 9h-1c-4 0-7-4-7-9z" fill={c}/>
      {/* Thumb */}
      <path d="M10 17c-1.5 0-3 1-3 3v2c0 1.5 1 2.5 2.5 2.5" fill={c}/>
      {/* Finger lines */}
      <line x1="15" y1="12" x2="15" y2="17" stroke={bg} strokeWidth="0.6" opacity="0.2"/>
      <line x1="20" y1="12" x2="20" y2="17" stroke={bg} strokeWidth="0.6" opacity="0.2"/>
      {/* Wrist band */}
      <rect x="10" y="26" width="15" height="2.5" rx="1" fill={c} opacity="0.6"/>
      {/* Power lines */}
      <path d="M6 6l-2-3M9 4l-1-3M26 4l1-3M28 7l2-3" stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
    </svg>
  ),
  DET: (c, bg) => ( // Mustangs — Rearing horse head
    <svg viewBox="0 0 32 32" fill="none">
      {/* Neck & head */}
      <path d="M10 28c0-6 1-10 3-14l2-5c0-2 1-3 2.5-3S20 5 20 7l1 4c2 3 3 6 3 10v7h-5v-4c0-2-1-3-2.5-3S14 23 14 25v3h-4z" fill={c}/>
      {/* Mane */}
      <path d="M12 9c-1 2-2 5-2 8" stroke={c} strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M11 11c-1.5 1-2.5 3-3 6" stroke={c} strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
      {/* Eye */}
      <circle cx="18" cy="10" r="1.2" fill={bg} opacity="0.45"/>
      {/* Nostril */}
      <circle cx="20" cy="14" r="0.8" fill={bg} opacity="0.3"/>
      {/* Ear */}
      <path d="M15 4l-2-2" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  GB: (c, bg) => ( // Tundra — Layered pine tree with snow
    <svg viewBox="0 0 32 32" fill="none">
      {/* Tree layers */}
      <polygon points="16,2 22,10 19,10 24,16 20,16 26,24 6,24 12,16 8,16 13,10 10,10" fill={c}/>
      {/* Snow accents */}
      <path d="M10 10l3 0c1-1 2-1 3 0l3 0" stroke={bg} strokeWidth="1" opacity="0.3" strokeLinecap="round"/>
      <path d="M8 16l4 0c1-1 2-1 3 0l1 0c1-1 2-1 3 0l3 0" stroke={bg} strokeWidth="1" opacity="0.25" strokeLinecap="round"/>
      {/* Trunk */}
      <rect x="14" y="24" width="4" height="5" rx="1" fill={c} opacity="0.7"/>
      {/* Snow on top */}
      <circle cx="16" cy="3" r="1.5" fill={bg} opacity="0.3"/>
    </svg>
  ),
  MIN: (c) => ( // Frost — Detailed ice crystal
    <svg viewBox="0 0 32 32" fill="none">
      <g stroke={c} strokeWidth="1.8" strokeLinecap="round">
        {/* Main axes */}
        <line x1="16" y1="2" x2="16" y2="30"/>
        <line x1="2" y1="16" x2="30" y2="16"/>
        <line x1="6" y1="6" x2="26" y2="26"/>
        <line x1="26" y1="6" x2="6" y2="26"/>
      </g>
      {/* Branch details on each axis */}
      <g stroke={c} strokeWidth="1.2" strokeLinecap="round">
        <line x1="16" y1="6" x2="13" y2="4"/>
        <line x1="16" y1="6" x2="19" y2="4"/>
        <line x1="16" y1="26" x2="13" y2="28"/>
        <line x1="16" y1="26" x2="19" y2="28"/>
        <line x1="6" y1="16" x2="4" y2="13"/>
        <line x1="6" y1="16" x2="4" y2="19"/>
        <line x1="26" y1="16" x2="28" y2="13"/>
        <line x1="26" y1="16" x2="28" y2="19"/>
        {/* Diamond branches */}
        <line x1="9" y1="9" x2="8" y2="6"/>
        <line x1="9" y1="9" x2="6" y2="8"/>
        <line x1="23" y1="9" x2="24" y2="6"/>
        <line x1="23" y1="9" x2="26" y2="8"/>
        <line x1="9" y1="23" x2="8" y2="26"/>
        <line x1="9" y1="23" x2="6" y2="24"/>
        <line x1="23" y1="23" x2="24" y2="26"/>
        <line x1="23" y1="23" x2="26" y2="24"/>
      </g>
      {/* Center crystal */}
      <circle cx="16" cy="16" r="2.5" fill={c} opacity="0.4"/>
      <circle cx="16" cy="16" r="1" fill={c}/>
    </svg>
  ),

  // ── NC South ──
  ATL: (c, bg) => ( // Firebirds — Phoenix rising with flame wings
    <svg viewBox="0 0 32 32" fill="none">
      {/* Body */}
      <path d="M16 8c-2 1-4 3-5 6l-7 6c3-1 6-1 8 0 0 4 1 7 4 10 3-3 4-6 4-10 2-1 5-1 8 0l-7-6c-1-3-3-5-5-6z" fill={c}/>
      {/* Wing flame left */}
      <path d="M4 20l-2-6c1 1 3 2 5 1l4 5" fill={c} opacity="0.5"/>
      {/* Wing flame right */}
      <path d="M28 20l2-6c-1 1-3 2-5 1l-4 5" fill={c} opacity="0.5"/>
      {/* Head */}
      <ellipse cx="16" cy="6" rx="2.5" ry="3" fill={c}/>
      {/* Eye */}
      <circle cx="16" cy="5.5" r="0.8" fill={bg} opacity="0.5"/>
      {/* Crest flame */}
      <path d="M16 3l-1-2 1.5 1L16 1l1 1 1.5-1-1 2" stroke={c} strokeWidth="0.8" fill={c} opacity="0.6"/>
      {/* Tail feathers */}
      <path d="M14 27l-2 3M16 28v3M18 27l2 3" stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  ),
  CAR: (c, bg) => ( // Stingrays — Stingray from above with patterning
    <svg viewBox="0 0 32 32" fill="none">
      {/* Body - diamond/wing shape */}
      <path d="M16 6C10 6 3 12 2 18l14-3 14 3C29 12 22 6 16 6z" fill={c}/>
      {/* Wing tips */}
      <path d="M2 18l-1 2c1 0 3-1 4-2" fill={c} opacity="0.5"/>
      <path d="M30 18l1 2c-1 0-3-1-4-2" fill={c} opacity="0.5"/>
      {/* Tail */}
      <path d="M16 15v11" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 24l2 4 1-2" stroke={c} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* Eyes */}
      <circle cx="12" cy="10" r="1.2" fill={bg} opacity="0.4"/>
      <circle cx="20" cy="10" r="1.2" fill={bg} opacity="0.4"/>
      {/* Pattern lines */}
      <path d="M16 8l-6 5M16 8l6 5" stroke={bg} strokeWidth="0.5" opacity="0.2"/>
      <path d="M16 10l-4 4M16 10l4 4" stroke={bg} strokeWidth="0.5" opacity="0.15"/>
    </svg>
  ),
  NO: (c, bg) => ( // Krewe — Ornate fleur-de-lis
    <svg viewBox="0 0 32 32" fill="none">
      {/* Center petal */}
      <path d="M16 2c-2 5-4 7-4 11 0 3 2 5 4 5s4-2 4-5c0-4-2-6-4-11z" fill={c}/>
      {/* Left petal */}
      <path d="M4 13c5 0 7 2 9 5-3 1-6 1-8 0-2-1-2-3-1-5z" fill={c}/>
      {/* Right petal */}
      <path d="M28 13c-5 0-7 2-9 5 3 1 6 1 8 0 2-1 2-3 1-5z" fill={c}/>
      {/* Base */}
      <path d="M11 18c0 3-1 5-3 8h16c-2-3-3-5-3-8" fill={c} opacity="0.6"/>
      <rect x="14" y="24" width="4" height="5" rx="1" fill={c}/>
      {/* Center accent */}
      <path d="M16 8v6" stroke={bg} strokeWidth="0.8" opacity="0.2"/>
      {/* Curl details */}
      <circle cx="8" cy="14" r="1" fill={bg} opacity="0.15"/>
      <circle cx="24" cy="14" r="1" fill={bg} opacity="0.15"/>
    </svg>
  ),
  TB: (c, bg) => ( // Bandits — Skull with bandana
    <svg viewBox="0 0 32 32" fill="none">
      {/* Bandana */}
      <path d="M6 10c0-4 4.5-7 10-7s10 3 10 7" fill={c} opacity="0.5"/>
      <path d="M6 10h20" stroke={c} strokeWidth="2.5"/>
      <path d="M5 11l-2 4" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M27 11l2 4" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {/* Skull */}
      <ellipse cx="16" cy="16" rx="8" ry="7" fill={c}/>
      {/* Eye sockets */}
      <ellipse cx="12.5" cy="14.5" rx="2.5" ry="2" fill={bg} opacity="0.35"/>
      <ellipse cx="19.5" cy="14.5" rx="2.5" ry="2" fill={bg} opacity="0.35"/>
      {/* Nose */}
      <path d="M15 18l1 1.5 1-1.5" fill={bg} opacity="0.25"/>
      {/* Teeth / jaw */}
      <path d="M12 21h8" stroke={bg} strokeWidth="0.8" opacity="0.25"/>
      <path d="M13 21v2M15 21v2.5M17 21v2.5M19 21v2" stroke={bg} strokeWidth="0.8" opacity="0.2"/>
      {/* Crossed bones behind */}
      <line x1="6" y1="24" x2="26" y2="28" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.35"/>
      <line x1="26" y1="24" x2="6" y2="28" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.35"/>
    </svg>
  ),

  // ── NC West ──
  ARI: (c, bg) => ( // Scorpions — Aggressive front-facing scorpion, menacing pose
    <svg viewBox="0 0 32 32" fill="none">
      {/* Segmented body — abdomen */}
      <ellipse cx="16" cy="22" rx="5.5" ry="3.5" fill={c}/>
      <ellipse cx="16" cy="22" rx="5.5" ry="3.5" fill={bg} opacity="0.08"/>
      {/* Body segments */}
      <path d="M10.5 21h11M10.8 22.5h10.4M11.5 23.8h9" stroke={bg} strokeWidth="0.5" opacity="0.15"/>
      {/* Cephalothorax (head plate) */}
      <ellipse cx="16" cy="18.5" rx="4" ry="2.2" fill={c}/>
      <ellipse cx="16" cy="18.5" rx="3" ry="1.5" fill={bg} opacity="0.06"/>
      {/* Arms / pedipalps — left claw */}
      <path d="M12 18.5c-2-1-4-2.5-5.5-2s-2 2-1 3l2-0.5" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Left pincer — open claw */}
      <path d="M5.5 19.5l-2.5-1.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M5.5 19.5l-2 1.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="3.5" cy="18.2" r="0.6" fill={c}/>
      <circle cx="3.8" cy="20.8" r="0.6" fill={c}/>
      {/* Arms / pedipalps — right claw */}
      <path d="M20 18.5c2-1 4-2.5 5.5-2s2 2 1 3l-2-0.5" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Right pincer — open claw */}
      <path d="M26.5 19.5l2.5-1.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M26.5 19.5l2 1.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="28.5" cy="18.2" r="0.6" fill={c}/>
      <circle cx="28.2" cy="20.8" r="0.6" fill={c}/>
      {/* Tail — thick segmented curve arching overhead */}
      <path d="M16 18.5c0-2 0.5-4 1.5-5.5s2.5-3 3-4.5c0.3-1 0-2-0.5-2.5" stroke={c} strokeWidth="2.8" fill="none" strokeLinecap="round"/>
      {/* Tail segments */}
      <path d="M16.3 16l0.8-0.3M17 14l0.8-0.5M18 12l0.7-0.6M19 10l0.6-0.7" stroke={bg} strokeWidth="0.5" opacity="0.2"/>
      {/* Stinger — venomous tip */}
      <path d="M20 6l1.5-2" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <path d="M21.2 4.3l0.8 1.7" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="21.5" cy="4" r="1" fill={bg} opacity="0.3"/>
      {/* Venom drop */}
      <ellipse cx="22" cy="5.8" rx="0.5" ry="0.7" fill={c} opacity="0.5"/>
      {/* Eyes — menacing cluster */}
      <circle cx="14.5" cy="17.8" r="1" fill={bg} opacity="0.4"/>
      <circle cx="17.5" cy="17.8" r="1" fill={bg} opacity="0.4"/>
      <circle cx="14.5" cy="17.8" r="0.45" fill={bg} opacity="0.7"/>
      <circle cx="17.5" cy="17.8" r="0.45" fill={bg} opacity="0.7"/>
      {/* Smaller middle eyes */}
      <circle cx="15.5" cy="17.3" r="0.4" fill={bg} opacity="0.25"/>
      <circle cx="16.5" cy="17.3" r="0.4" fill={bg} opacity="0.25"/>
      {/* Legs — 4 pairs, angular and segmented */}
      <path d="M11 22l-3 2.5-1.5 1.5" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M12 23.5l-2 2.5-1 2" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M20 23.5l2 2.5 1 2" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M21 22l3 2.5 1.5 1.5" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      {/* Leg joints */}
      <circle cx="8" cy="24.5" r="0.5" fill={c} opacity="0.4"/>
      <circle cx="10" cy="26" r="0.5" fill={c} opacity="0.4"/>
      <circle cx="22" cy="26" r="0.5" fill={c} opacity="0.4"/>
      <circle cx="24" cy="24.5" r="0.5" fill={c} opacity="0.4"/>
      {/* Texture — carapace ridges */}
      <path d="M14 20.5c1.3 0.5 2.7 0.5 4 0" stroke={bg} strokeWidth="0.4" opacity="0.12"/>
      <path d="M13.5 21.5c1.7 0.5 3.3 0.5 5 0" stroke={bg} strokeWidth="0.4" opacity="0.1"/>
    </svg>
  ),
  LAC: (c, bg) => ( // Condors — Dramatic condor swooping down, wings spread wide
    <svg viewBox="0 0 32 32" fill="none">
      {/* Left wing — sweeping back with feather detail */}
      <path d="M16 14L2 8c0 2 1 4 3 5l6 3-1 2-7 1c2 2 5 2 8 1l5-3" fill={c}/>
      {/* Right wing */}
      <path d="M16 14l14-6c0 2-1 4-3 5l-6 3 1 2 7 1c-2 2-5 2-8 1l-5-3" fill={c}/>
      {/* Primary feathers — left */}
      <path d="M2 8l1 2M4 9l1 2M6 10l1 2" stroke={bg} strokeWidth="0.7" opacity="0.25" strokeLinecap="round"/>
      {/* Primary feathers — right */}
      <path d="M30 8l-1 2M28 9l-1 2M26 10l-1 2" stroke={bg} strokeWidth="0.7" opacity="0.25" strokeLinecap="round"/>
      {/* Body */}
      <path d="M13 14c0 3 0 8 1 12h4c1-4 1-9 1-12" fill={c} opacity="0.9"/>
      {/* Tail feathers */}
      <path d="M13 26l-2 4M16 26v4M19 26l2 4" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
      {/* Head */}
      <ellipse cx="16" cy="10" rx="3" ry="3.5" fill={c}/>
      {/* White neck ruff */}
      <path d="M13 12.5c1 1 2 1.5 3 1.5s2-.5 3-1.5" stroke={bg} strokeWidth="1.5" opacity="0.35" fill="none"/>
      <path d="M13.5 13.5c1 .8 1.5 1 2.5 1s1.5-.2 2.5-1" stroke={bg} strokeWidth="0.8" opacity="0.2" fill="none"/>
      {/* Beak — hooked */}
      <path d="M16 7.5l-1.5 2c0 .5.5 1 1.5 1s1.5-.5 1.5-1L16 7.5z" fill={bg} opacity="0.35"/>
      <path d="M15.5 9.5l-1 1.5" stroke={bg} strokeWidth="0.6" opacity="0.4" strokeLinecap="round"/>
      {/* Eyes — intense */}
      <circle cx="14.3" cy="9.5" r="0.9" fill={bg} opacity="0.55"/>
      <circle cx="17.7" cy="9.5" r="0.9" fill={bg} opacity="0.55"/>
      <circle cx="14.5" cy="9.3" r="0.4" fill={bg} opacity="0.8"/>
      <circle cx="17.9" cy="9.3" r="0.4" fill={bg} opacity="0.8"/>
    </svg>
  ),
  SF: (c, bg) => ( // Fog — Golden Gate bridge in fog
    <svg viewBox="0 0 32 32" fill="none">
      {/* Bridge towers */}
      <rect x="9" y="8" width="3" height="16" rx="0.5" fill={c}/>
      <rect x="20" y="8" width="3" height="16" rx="0.5" fill={c}/>
      {/* Suspension cables */}
      <path d="M2 14c3-4 6-5 8.5-5" stroke={c} strokeWidth="1.5" fill="none"/>
      <path d="M10.5 9c3 4 5 5 10 0" stroke={c} strokeWidth="1.5" fill="none"/>
      <path d="M21.5 9c2.5 0 5.5 1 8.5 5" stroke={c} strokeWidth="1.5" fill="none"/>
      {/* Road */}
      <rect x="2" y="20" width="28" height="2" fill={c} opacity="0.5"/>
      {/* Fog layers */}
      <ellipse cx="16" cy="26" rx="14" ry="2" fill={c} opacity="0.15"/>
      <ellipse cx="14" cy="28" rx="12" ry="2" fill={c} opacity="0.1"/>
      {/* Vertical cables */}
      <line x1="14" y1="12" x2="14" y2="20" stroke={c} strokeWidth="0.5" opacity="0.4"/>
      <line x1="18" y1="12" x2="18" y2="20" stroke={c} strokeWidth="0.5" opacity="0.4"/>
      <line x1="6" y1="13" x2="6" y2="20" stroke={c} strokeWidth="0.5" opacity="0.3"/>
      <line x1="26" y1="13" x2="26" y2="20" stroke={c} strokeWidth="0.5" opacity="0.3"/>
    </svg>
  ),
  SEA: (c, bg) => ( // Sasquatch — Fierce bigfoot face/bust, front-facing
    <svg viewBox="0 0 32 32" fill="none">
      {/* Broad shoulders/body base */}
      <path d="M4 28c0-5 3-8 6-10l2-1c1 0 2 .5 4 .5s3-.5 4-.5l2 1c3 2 6 5 6 10" fill={c} opacity="0.7"/>
      {/* Head — large, slightly domed */}
      <path d="M8 15c0-6 3.5-11 8-11s8 5 8 11c0 3-2 6-4 7l-1 1h-6l-1-1c-2-1-4-4-4-7z" fill={c}/>
      {/* Heavy brow ridge */}
      <path d="M9 12c1-1.5 3-2.5 7-2.5s6 1 7 2.5" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <path d="M9.5 12.5c1-1 3-2 6.5-2s5.5 1 6.5 2" stroke={bg} strokeWidth="0.5" opacity="0.15" fill="none"/>
      {/* Deep-set eyes under brow */}
      <ellipse cx="13" cy="14" rx="1.8" ry="1.4" fill={bg} opacity="0.4"/>
      <ellipse cx="19" cy="14" rx="1.8" ry="1.4" fill={bg} opacity="0.4"/>
      <circle cx="13.3" cy="13.8" r="0.7" fill={bg} opacity="0.7"/>
      <circle cx="19.3" cy="13.8" r="0.7" fill={bg} opacity="0.7"/>
      {/* Broad flat nose */}
      <path d="M14.5 16l-1 2.5c0 .5.5 1 2.5 1s2.5-.5 2.5-1L17.5 16" fill={bg} opacity="0.25"/>
      {/* Nostrils */}
      <circle cx="15" cy="18.5" r="0.6" fill={bg} opacity="0.3"/>
      <circle cx="17" cy="18.5" r="0.6" fill={bg} opacity="0.3"/>
      {/* Mouth / grimace */}
      <path d="M13 21c1 1 2 1.5 3 1.5s2-.5 3-1.5" stroke={bg} strokeWidth="0.8" opacity="0.25" fill="none"/>
      {/* Fur texture around face */}
      <path d="M8 15l-1 .5M8 18l-1.5 .5M9 20l-1 1" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <path d="M24 15l1 .5M24 18l1.5 .5M23 20l1 1" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      {/* Top of head fur tufts */}
      <path d="M12 5l-1-2M16 4v-2M20 5l1-2" stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
    </svg>
  ),
};

export function TeamLogo({ abbreviation, primaryColor, secondaryColor, size = 'md', className = '', logoUrl }: TeamLogoProps) {
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  // If an external logo URL is provided, render it as an image
  if (logoUrl) {
    return (
      <div
        className={`${sizeClass} shrink-0 overflow-hidden box-border relative ${className}`}
        style={{
          backgroundColor: primaryColor,
          boxShadow: `0 3px 8px ${primaryColor}55, 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
          border: `1px solid rgba(255,255,255,0.12)`,
          borderRadius: '22%',
        }}
      >
        <img
          src={logoUrl}
          alt={abbreviation}
          className="w-full h-full object-contain relative z-10"
          style={{ padding: PADDING[size] ?? PADDING.md }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
