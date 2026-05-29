'use client';

/**
 * EmptyState — the canonical "nothing here yet" surface.
 *
 * Centered, muted, with an optional large icon, headline, body copy, and a
 * single suggested action. Used wherever data is absent so the app never
 * shows a naked "No data" string.
 */

import type { ReactNode } from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;       // emoji or SVG
  title: string;          // headline
  message?: string;       // body copy
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center p-12 ${className}`}>
      {icon != null && <div className="text-5xl mb-3 leading-none" aria-hidden>{icon}</div>}
      <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
      {message && <p className="text-sm text-[var(--text-sec)] mt-1 max-w-sm">{message}</p>}
      {action && (
        <div className="mt-4">
          <Button variant="primary" onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
