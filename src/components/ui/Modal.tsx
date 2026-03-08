'use client';

import { useEffect, useCallback } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function Modal({ isOpen, onClose, title, children, maxWidth = 'lg' }: ModalProps) {
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-8"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal content */}
      <div
        className={`relative ${MAX_WIDTH_MAP[maxWidth]} w-full mx-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--surface)] z-10 rounded-t-2xl">
            <h3 className="text-lg font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="text-[var(--text-sec)] hover:text-[var(--text)] transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
            >
              ✕
            </button>
          </div>
        )}

        {/* If no title, show a floating close button */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 text-[var(--text-sec)] hover:text-[var(--text)] transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
          >
            ✕
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
