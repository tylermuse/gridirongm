'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Bottom bar on a team mock-draft page. Most visitors read the pick tables and
 * leave without scrolling back to a button, so this keeps the "run a mock" link
 * in reach. It shows only between the page's two CTA buttons (`data-team-cta`):
 * never while one is on screen, and never past the last, so it can't cover the
 * footer.
 */
export function TeamStickyCta({ href, teamName }: { href: string; teamName: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const anchors = Array.from(document.querySelectorAll('[data-team-cta]'));
    if (anchors.length === 0) return;
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    // Show only between the two buttons: the first scrolled off the top, the last still below the fold.
    // Two rect reads per scroll event is cheap, and React skips the update when the value is unchanged.
    const update = () => {
      setVisible(first.getBoundingClientRect().bottom < 0 && last.getBoundingClientRect().top > window.innerHeight);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Right padding keeps the button clear of the site-wide Feedback pill (fixed bottom-right). */}
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 pr-36">
        <p className="hidden sm:block text-sm text-gray-700">
          Think you can do better? Make every {teamName} pick yourself. Free, no login.
        </p>
        <Link
          href={href}
          prefetch={false}
          tabIndex={visible ? 0 : -1}
          data-track="Run a mock draft (sticky bar)"
          className="inline-flex w-full sm:w-auto shrink-0 items-center justify-center whitespace-nowrap px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm sm:text-base font-semibold transition-colors"
        >
          <span className="sm:hidden">Run your own mock →</span>
          <span className="hidden sm:inline">Draft for the {teamName} yourself →</span>
        </Link>
      </div>
    </div>
  );
}
