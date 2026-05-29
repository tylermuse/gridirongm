'use client';

import type { ReactNode } from 'react';

/**
 * BS Hoops Card primitive.
 * Use as a container for grouped content. Pass onClick to make the card
 * itself a clickable target (with focus ring).
 */

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: 'div' | 'a' | 'button';
}

export function Card({ children, className = '', onClick }: CardProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      className={`
        bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5
        ${interactive ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-4 flex-wrap gap-2 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-bold text-[var(--text)]">{children}</h3>;
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--text-sec)]">{children}</p>;
}
