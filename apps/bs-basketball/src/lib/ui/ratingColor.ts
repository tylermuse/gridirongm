/**
 * Shared rating colors for the draft surfaces (parity with football, which
 * inlines these in four files). These thresholds are *semantic* (good/ok/poor),
 * not brand — football's blue stays as the "good but not elite" tier.
 */

/** Tailwind text color for a 0–99 rating. */
export function ratingColor(v: number): string {
  return v >= 80 ? 'text-green-600' : v >= 65 ? 'text-blue-600' : v >= 50 ? 'text-amber-600' : 'text-red-600';
}

/** Tailwind background color for a 0–99 rating (bars/fills). */
export function ratingBgColor(v: number): string {
  return v >= 80 ? 'bg-green-500' : v >= 65 ? 'bg-blue-500' : v >= 50 ? 'bg-amber-500' : 'bg-red-500';
}

/** Hex for a 0–99 rating — same tiers, for inline `style` (e.g. grade cells). */
export function ratingHex(v: number): string {
  return v >= 80 ? '#16a34a' : v >= 65 ? '#2563eb' : v >= 50 ? '#d97706' : '#dc2626';
}

/** Letter grade for a 0–99 rating (parity with football's ratingGrade). */
export function ratingGrade(v: number): string {
  return v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'A-'
    : v >= 75 ? 'B+' : v >= 70 ? 'B' : v >= 65 ? 'B-'
    : v >= 60 ? 'C+' : v >= 55 ? 'C' : v >= 50 ? 'C-' : 'D';
}

/** Readable text color (#fff / near-black) for content sitting on a team color. */
export function getContrastText(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return '#fff';
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#0b1220' : '#fff';
}
