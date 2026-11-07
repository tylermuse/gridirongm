'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@bs/core/analytics/track';
import { gradeColor } from '@/lib/engine/draftGrades';
import {
  classGrade,
  isAllTeams,
  type DraftSettings,
  type MadePick,
  type MockDraftData,
  type MockTeam,
  type ReplayResult,
} from '@/lib/mockDraft/engine';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TeamLogo } from '@/components/ui/TeamLogo';

/** The standard 2026 league, same file and start mode as the card on /rosters. */
const ROSTER_FILE = 'FBGM_NFL_Roster_2026_Updated.json';

function PickRow({ pick, team, via }: { pick: MadePick; team?: MockTeam; via?: string }) {
  const { prospect, slot, grade } = pick;
  return (
    <li className={`flex items-center gap-2 px-3 py-2 text-sm border-b border-[var(--border)] last:border-b-0 ${pick.isUser ? 'bg-amber-50' : ''}`}>
      <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-sec)]">{slot.pick}</span>
      {team && <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size="xs" />}
      {team && (
        <span className="w-20 shrink-0 text-xs text-[var(--text-sec)] truncate">
          {team.abbrev}
          {via && ` via ${via}`}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[var(--text)]">
        <span className="font-semibold">
          {prospect.firstName} {prospect.lastName}
        </span>{' '}
        <span className="text-[var(--text-sec)]">
          {prospect.pos}, {prospect.college}
        </span>
      </span>
      <span className={`text-sm font-bold shrink-0 ${gradeColor(grade)}`}>{grade}</span>
    </li>
  );
}

function ShareButton({ data, shareQuery, primaryTeam }: { data: MockDraftData; shareQuery: string; primaryTeam?: MockTeam }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [shareUrl, setShareUrl] = useState('');

  async function handleShare() {
    const url = `${window.location.origin}/mock-draft?${shareQuery}`;
    const title = primaryTeam
      ? `My ${data.draftYear} ${primaryTeam.name} mock draft`
      : `My ${data.draftYear} NFL mock draft`;

    // Desktop browsers can expose navigator.share too, but a copied link is what people want there.
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
        trackEvent('mock_draft_share', { method: 'native' });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Share sheet unavailable: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      trackEvent('mock_draft_share', { method: 'clipboard' });
    } catch {
      setShareUrl(url);
      setStatus('failed');
      trackEvent('mock_draft_share', { method: 'manual' });
    }
  }

  return (
    <div>
      <Button variant="secondary" size="lg" onClick={handleShare}>
        {status === 'copied' ? 'Link copied' : 'Share'}
      </Button>
      {status === 'failed' && (
        <label className="block mt-2 text-xs text-[var(--text-sec)]">
          Copy this link:
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            className="block w-full mt-1 px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
          />
        </label>
      )}
    </div>
  );
}

export function ResultsScreen({
  data,
  settings,
  replay,
  asOf,
  shareQuery,
  onRunAnother,
}: {
  data: MockDraftData;
  settings: DraftSettings;
  replay: ReplayResult;
  asOf: string;
  shareQuery: string;
  onRunAnother: () => void;
}) {
  const teams = useMemo(() => new Map(data.teams.map((t) => [t.tid, t])), [data]);
  const allTeams = isAllTeams(data, settings.userTids);

  const userClasses = useMemo(
    () =>
      settings.userTids
        .map((tid) => ({ team: teams.get(tid), picks: replay.picks.filter((p) => p.slot.tid === tid) }))
        .filter((c): c is { team: MockTeam; picks: MadePick[] } => Boolean(c.team) && c.picks.length > 0),
    [settings.userTids, teams, replay.picks],
  );

  const rounds = useMemo(() => {
    const byRound = new Map<number, MadePick[]>();
    for (const pick of replay.picks) {
      byRound.set(pick.slot.round, [...(byRound.get(pick.slot.round) ?? []), pick]);
    }
    return [...byRound.entries()];
  }, [replay.picks]);

  // All-32 and AI-only mocks have no one team to hand off to, so the CTA opens the plain picker.
  const primaryTeam = allTeams ? undefined : userClasses[0]?.team;
  const leagueHref = `/?roster=/rosters/${ROSTER_FILE}?v=${asOf}&startMode=regular${primaryTeam ? `&team=${primaryTeam.abbrev}` : ''}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="text-lg font-bold text-gray-900">
          {primaryTeam
            ? `Take over the ${primaryTeam.name} at Week ${data.currentWeek} and draft this class for real next spring`
            : `Take over any team at Week ${data.currentWeek} and draft this class for real next spring`}
        </h2>
        <p className="text-sm text-[var(--text-sec)] mt-1 mb-4">
          In BS Football, the {data.draftYear} draft comes after you finish the {data.season} season. It&apos;s free to play in your browser.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <Link
            href={leagueHref}
            onClick={() => trackEvent('mock_draft_cta_click', { team: primaryTeam?.abbrev ?? null, rounds: settings.rounds })}
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            Play this class in BS Football →
          </Link>
          <ShareButton data={data} shareQuery={shareQuery} primaryTeam={primaryTeam} />
          <Button variant="ghost" size="lg" onClick={onRunAnother}>
            Run another mock
          </Button>
        </div>
      </div>

      {userClasses.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{userClasses.length === 1 ? 'Your class' : 'Your classes'}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {userClasses.map(({ team, picks }) => {
              const grade = classGrade(picks) ?? '';
              return (
                <Card key={team.tid} className="!p-0 overflow-hidden">
                  <div className="flex items-center gap-3 p-4 border-b border-[var(--border)]">
                    <TeamLogo abbreviation={team.abbrev} primaryColor={team.colors[0]} secondaryColor={team.colors[1]} logoUrl={team.imgURL || undefined} logoOnWhite size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[var(--text)] truncate">
                        {team.region} {team.name}
                      </div>
                      <div className="text-xs text-[var(--text-sec)]">
                        {picks.length} {picks.length === 1 ? 'pick' : 'picks'}
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <div className={`text-3xl font-black leading-none ${gradeColor(grade)}`}>{grade}</div>
                      <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)] mt-1">Class</div>
                    </div>
                  </div>
                  <ul>
                    {picks.map((pick) => (
                      <PickRow key={pick.slot.pick} pick={{ ...pick, isUser: false }} />
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        {rounds.map(([round, picks]) => (
          <div key={round}>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Round {round}</h2>
            <ul className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
              {picks.map((pick) => (
                <PickRow
                  key={pick.slot.pick}
                  pick={pick}
                  team={teams.get(pick.slot.tid)}
                  via={pick.slot.tid !== pick.slot.originalTid ? teams.get(pick.slot.originalTid)?.abbrev : undefined}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
