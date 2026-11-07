'use client';

import { useEffect, useState } from 'react';
import { publicConsensusBlurb } from '@/lib/engine/draftScoutEval';
import type { Position } from '@/types';
import {
  POSITION_RATINGS,
  RATING_LABELS,
  SKILL_LABELS,
  asOfLabel,
  heightLabel,
  prospectTier,
  scoutFit,
  type MockDraftData,
  type MockProspect,
  type MockTeam,
  type ScoutData,
} from '@/lib/mockDraft/engine';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/* ─── Data: fetched once, on the first Scout click ──────────── */

let scoutCache: Promise<ScoutData> | null = null;

function loadScoutData(asOf: string): Promise<ScoutData> {
  if (!scoutCache) {
    scoutCache = fetch(`/mock/scout-2027.json?v=${encodeURIComponent(asOf)}`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<ScoutData>;
    });
    // A failed load shouldn't stick: the next open tries again.
    scoutCache.catch(() => {
      scoutCache = null;
    });
  }
  return scoutCache;
}

function useScoutData(asOf: string) {
  const [state, setState] = useState<{ data: ScoutData | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    loadScoutData(asOf)
      .then((data) => !cancelled && setState({ data, failed: false }))
      .catch(() => !cancelled && setState({ data: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [asOf]);
  return state;
}

/* ─── Panel ─────────────────────────────────────────────────── */

const FIT_STYLE = {
  need: 'border-green-300 bg-green-50 text-green-900',
  depth: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]',
  luxury: 'border-amber-300 bg-amber-50 text-amber-900',
} as const;

function RatingBar({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? 'bg-green-500' : value >= 60 ? 'bg-blue-500' : value >= 45 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-[var(--text-sec)]">{label}</span>
      <span className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(4, value)}%` }} />
      </span>
      <span className="w-7 text-right tabular-nums font-semibold text-[var(--text)]">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-sec)] mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

export function ScoutPanel({
  data,
  prospect,
  team,
  counts,
  onDraft,
  onClose,
}: {
  data: MockDraftData;
  prospect: MockProspect;
  /** The team on the clock, for the fit line. */
  team: MockTeam;
  counts: Record<Position, number>;
  /** Present when the user can draft him right now. */
  onDraft?: () => void;
  onClose: () => void;
}) {
  const { data: scout, failed } = useScoutData(data.asOf);
  const entry = scout?.prospects[String(prospect.pid)];
  const profile = entry?.profile;
  const fit = scoutFit(data, team, prospect, counts);
  const tier = prospectTier(prospect.pot);
  const ratingKeys = POSITION_RATINGS[prospect.pos].filter((key) => entry?.ratings[key] !== undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Scouting report: ${prospect.firstName} ${prospect.lastName}`}
        className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[var(--text-sec)]">
              Board #{prospect.rank} · {tier}
            </div>
            <h2 className="text-xl font-bold text-[var(--text)]">
              {prospect.firstName} {prospect.lastName}
            </h2>
            <div className="text-sm text-[var(--text-sec)]">
              {prospect.pos} · {profile?.college ?? prospect.college}
              {profile?.classYear ? ` · ${profile.classYear}` : ''} · {heightLabel(prospect.hgt)}, {prospect.weight} lb · Age{' '}
              {prospect.age}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scouting report"
            className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-[var(--text-sec)] hover:bg-[var(--surface-2)]"
          >
            ×
          </button>
        </div>

        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${FIT_STYLE[fit.fit]}`}>{fit.text}</p>

        {!scout && !failed && <p className="mt-4 text-sm text-[var(--text-sec)]">Loading the scouting report…</p>}
        {failed && <p className="mt-4 text-sm text-[var(--text-sec)]">Couldn&apos;t load the scouting report. Close and try again.</p>}

        {scout && (
          <>
            {profile ? (
              <>
                <Section title="Scouting report">
                  <p className="text-sm text-[var(--text)] leading-relaxed">{profile.summary}</p>
                </Section>
                <div className="grid sm:grid-cols-2 gap-x-4">
                  <Section title="Strengths">
                    <ul className="list-disc pl-4 text-sm text-[var(--text)] space-y-0.5">
                      {profile.strengths.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </Section>
                  <Section title="Concerns">
                    <ul className="list-disc pl-4 text-sm text-[var(--text)] space-y-0.5">
                      {profile.weaknesses.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </Section>
                </div>
                {(profile.stats2025 || profile.honors || profile.nflComp) && (
                  <Section title="Résumé">
                    <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      {profile.stats2025 && (
                        <>
                          <dt className="text-[var(--text-sec)]">2025 season</dt>
                          <dd className="text-[var(--text)] tabular-nums">{profile.stats2025}</dd>
                        </>
                      )}
                      {profile.honors && (
                        <>
                          <dt className="text-[var(--text-sec)]">Honors</dt>
                          <dd className="text-[var(--text)]">{profile.honors}</dd>
                        </>
                      )}
                      {profile.nflComp && (
                        <>
                          <dt className="text-[var(--text-sec)]">Pro comp</dt>
                          <dd className="text-[var(--text)]">{profile.nflComp}</dd>
                        </>
                      )}
                    </dl>
                  </Section>
                )}
                {profile.notes && (
                  <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-sec)]">{profile.notes}</p>
                )}
              </>
            ) : (
              <Section title="Scouting report">
                <p className="text-sm text-[var(--text)] leading-relaxed">
                  {publicConsensusBlurb({ projectedRank: prospect.rank, ratings: { overall: prospect.ovr } })} We don&apos;t
                  have a written report on him yet.
                </p>
              </Section>
            )}

            {ratingKeys.length > 0 && (
              <Section title="Ratings">
                <div className="space-y-1.5">
                  {ratingKeys.map((key) => (
                    <RatingBar key={key} label={RATING_LABELS[key]} value={entry!.ratings[key]!} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-sec)]">
                  <span>
                    OVR {prospect.ovr} · POT {prospect.pot}
                  </span>
                  {entry!.skills
                    .filter((skill) => SKILL_LABELS[skill])
                    .map((skill) => (
                      <Badge key={skill} variant="blue">
                        {SKILL_LABELS[skill]}
                      </Badge>
                    ))}
                </div>
              </Section>
            )}

            <p className="mt-4 text-[11px] text-[var(--text-sec)] leading-snug">
              {profile ? (
                <>
                  Report compiled from public scouting coverage
                  {scout.researchedAt ? ` as of ${asOfLabel(scout.researchedAt)}` : ''}. Stats are from 2025 until the 2026
                  season ends.
                  {profile.sources.length > 0 && (
                    <>
                      {' '}
                      Sources:{' '}
                      {profile.sources.map((url, i) => (
                        <span key={url}>
                          {i > 0 && ', '}
                          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                            {new URL(url).hostname.replace(/^www\./, '')}
                          </a>
                        </span>
                      ))}
                    </>
                  )}
                </>
              ) : (
                'Ratings are BS Football projections.'
              )}
            </p>
          </>
        )}

        {onDraft && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onDraft}>
              Draft {prospect.lastName}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
