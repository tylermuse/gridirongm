import { cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react';
import { ImageResponse } from 'next/og';
import {
  classGrade,
  findTeamBySlug,
  houseMock,
  isAllTeams,
  parseShareQuery,
  type MadePick,
  type MockDraftData,
  type MockTeam,
} from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import { ICONS } from '@/components/ui/teamLogoIcons';

/**
 * Social preview for /mock-draft. This is a route rather than opengraph-image.tsx
 * because that convention can't see the query string a share link keeps its state
 * in, and it would also override the per-link image set in generateMetadata.
 * With no usable share state it draws the static fallback card, or, with
 * `?team=bears`, that team's picks from the house mock (for /mock-draft/2027/[team]).
 */

const SIZE = { width: 1200, height: 630 };
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400';

const TEXT = '#1a2332';
const TEXT_SEC = '#5a6a7e';
const BORDER = '#d1d9e6';
const BLUE = '#2563eb';

function gradeHex(grade: string): string {
  if (grade.startsWith('A')) return '#16a34a';
  if (grade === 'B+' || grade === 'B') return '#2563eb';
  if (grade === 'B-' || grade === 'C+') return '#d97706';
  return '#dc2626';
}

function Logo({ team, size }: { team: MockTeam; size: number }) {
  const icon = ICONS[team.abbrev];
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size * 0.22,
        backgroundColor: team.colors[0],
        color: '#ffffff',
        fontSize: size * 0.32,
        fontWeight: 700,
      }}
    >
      {/* The icons size to their parent in CSS. Satori needs explicit dimensions on the svg. */}
      {icon ? cloneElement(icon(team.colors[1], team.colors[0]) as ReactElement<SVGProps<SVGSVGElement>>, { width: size * 0.8, height: size * 0.8 }) : team.abbrev}
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        ...SIZE,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 56,
        backgroundColor: '#f0f4f8',
        color: TEXT,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 28 }}>
        <div style={{ display: 'flex', fontWeight: 700 }}>
          <span style={{ color: BLUE, marginRight: 8 }}>BS</span>
          <span>Football</span>
        </div>
        <div style={{ display: 'flex', color: TEXT_SEC }}>bs-football.com/mock-draft</div>
      </div>
    </div>
  );
}

function PickLine({ pick }: { pick: MadePick }) {
  const { prospect, slot, grade } = pick;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '18px 24px',
        marginBottom: 14,
        backgroundColor: '#ffffff',
        border: `2px solid ${BORDER}`,
        borderRadius: 16,
      }}
    >
      <div style={{ display: 'flex', width: 84, fontSize: 28, color: TEXT_SEC }}>#{slot.pick}</div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, width: 400 }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700 }}>
          {prospect.firstName} {prospect.lastName}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: TEXT_SEC }}>
          {prospect.pos}, {prospect.college}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: gradeHex(grade) }}>{grade}</div>
    </div>
  );
}

function FallbackCard({ data }: { data: MockDraftData }) {
  return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{data.draftYear} NFL Mock Draft Simulator</div>
        <div style={{ display: 'flex', fontSize: 38, color: TEXT_SEC, marginTop: 28 }}>
          Draft for your team. Get a grade. Free, no login.
        </div>
      </div>
    </Frame>
  );
}

function ShareCard({ data, team, picks }: { data: MockDraftData; team?: MockTeam; picks: MadePick[] }) {
  const grade = team ? classGrade(picks) : null;
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: 400, marginRight: 40 }}>
          {team && <Logo team={team} size={170} />}
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, lineHeight: 1.1, marginTop: team ? 24 : 0 }}>
            {team ? `${team.region} ${team.name}` : `${data.draftYear} NFL mock draft`}
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: TEXT_SEC, marginTop: 8 }}>
            {team ? `${data.draftYear} mock draft` : 'The top of the board'}
          </div>
          {grade && (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 16 }}>
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, lineHeight: 1, color: gradeHex(grade) }}>{grade}</div>
              <div style={{ display: 'flex', fontSize: 28, color: TEXT_SEC, marginLeft: 16 }}>class grade</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, width: 640 }}>
          {picks.slice(0, 3).map((pick) => (
            <PickLine key={pick.slot.pick} pick={pick} />
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function GET(request: Request) {
  const data = getMockDraftData();
  const params = new URL(request.url).searchParams;
  const share = parseShareQuery(data, params);
  const pageTeam = share.kind === 'none' ? findTeamBySlug(data, params.get('team') ?? '') : undefined;

  let card = <FallbackCard data={data} />;
  if (pageTeam) {
    card = <ShareCard data={data} team={pageTeam} picks={houseMock(data).picks.filter((p) => p.slot.tid === pageTeam.tid)} />;
  } else if (share.kind === 'ok') {
    const allTeams = isAllTeams(data, share.settings.userTids);
    const team = allTeams ? undefined : data.teams.find((t) => t.tid === share.settings.userTids[0]);
    card = <ShareCard data={data} team={team} picks={team ? share.replay.picks.filter((p) => p.slot.tid === team.tid) : share.replay.picks} />;
  }

  return new ImageResponse(card, { ...SIZE, headers: { 'Cache-Control': CACHE_CONTROL } });
}
