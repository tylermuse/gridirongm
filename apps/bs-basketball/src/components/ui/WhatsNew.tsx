'use client';

import { useState } from 'react';
import { Modal } from '@/components/modals/Modal';
import { Button } from '@/components/ui/Button';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { unseenChangelog } from '@/lib/ui/changelog';

/**
 * "What's new" modal (Tier 2.8). Pops once for a returning save whose
 * lastSeenChangelog is behind, listing everything shipped since, then persists
 * the version on dismiss so it won't show again until the next bump.
 */
export function WhatsNew() {
  const { league, markChangelogSeen } = useLeagueStore();
  const [dismissed, setDismissed] = useState(false);

  if (!league) return null;
  const entries = unseenChangelog(league);
  const open = entries.length > 0 && !dismissed;

  function close() {
    setDismissed(true);
    void markChangelogSeen();
  }

  return (
    <Modal open={open} onClose={close} title="✨ What's new in BS Hoops" maxWidthClass="max-w-lg">
      <div className="space-y-4 p-1">
        {entries.map(e => (
          <div key={e.v}>
            <div className="text-xs uppercase tracking-widest font-bold opacity-60 mb-1">{e.title}</div>
            <ul className="space-y-1.5">
              {e.items.map((it, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span style={{ color: 'var(--accent)' }} aria-hidden>•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="pt-2 flex justify-end">
          <Button variant="primary" onClick={close}>Dive in →</Button>
        </div>
      </div>
    </Modal>
  );
}
