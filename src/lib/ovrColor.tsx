// Shared OVR color gradient system (Spec 10)
// Provides consistent color coding for player Overall ratings across all pages.
import React from 'react';

export function getOvrColor(ovr: number): string {
  if (ovr >= 75) return 'text-green-600';
  if (ovr >= 60) return 'text-blue-600';
  if (ovr >= 45) return 'text-amber-600';
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

export function getOvrBg(ovr: number): string {
  if (ovr >= 75) return 'bg-green-100';
  if (ovr >= 60) return 'bg-blue-100';
  if (ovr >= 45) return 'bg-amber-100';
  return 'bg-red-100';
}

export function getOvrTier(ovr: number): string {
  if (ovr >= 75) return 'Elite';
  if (ovr >= 60) return 'Solid';
  if (ovr >= 45) return 'Depth';
  return 'Poor';
}

export function OvrBadge({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-6 text-sm',
    md: 'w-10 h-7 text-base',
    lg: 'w-14 h-10 text-xl',
  };
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-extrabold tabular-nums ${getOvrBg(value)} ${getOvrColor(value)} ${sizeClasses[size]}`}>
      {value}
    </span>
  );
}
