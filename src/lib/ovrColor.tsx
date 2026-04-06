// Shared OVR color gradient system (Spec 10)
// Provides consistent color coding for player Overall ratings across all pages.
import React from 'react';

export function getOvrColor(ovr: number): string {
  if (ovr >= 85) return 'text-green-600';
  if (ovr >= 75) return 'text-emerald-600';
  if (ovr >= 65) return 'text-yellow-600';
  if (ovr >= 55) return 'text-orange-500';
  if (ovr >= 45) return 'text-orange-600';
  return 'text-red-600';
}

export function getOvrBgColor(ovr: number): string {
  if (ovr >= 85) return 'bg-green-600';
  if (ovr >= 75) return 'bg-emerald-600';
  if (ovr >= 65) return 'bg-yellow-600';
  if (ovr >= 55) return 'bg-orange-500';
  if (ovr >= 45) return 'bg-orange-600';
  return 'bg-red-600';
}

export function OvrBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'text-sm font-bold' : size === 'lg' ? 'text-2xl font-extrabold' : 'text-base font-extrabold';
  return <span className={`${getOvrColor(value)} ${sizeClass} tabular-nums`}>{value}</span>;
}
