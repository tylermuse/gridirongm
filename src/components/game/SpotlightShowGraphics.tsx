'use client';

/**
 * Broadcast graphics for the Team Spotlight show.
 *
 * Everything here is a pure function of elapsed time (`blockMs` since the
 * graphic came on screen, `lineMs` since the current line started), so the
 * player drives it from a rAF clock and the demo renderer can draw any
 * frame deterministically.
 */
import type { ReactNode } from 'react';
import { HOSTS, type Host } from '@/lib/spotlight/showScript';
import { ordinal, rankTone, type ShowStatLine } from '@/lib/spotlight/teamStats';
import type { TileStat } from '@/lib/spotlight/playerStats';
import type { StandingsRow } from '@/lib/spotlight/showStandings';
import type { GameFlow } from '@/lib/spotlight/showGame';

export const TWO_SHOT_SRC = '/show/two_shot.jpg';
export const avatarSrc = (h: Host) => `/show/avatars/${h}.jpg`;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** Eased 0→1 progress of an animation starting at `delay` lasting `dur` ms. */
const anim = (ms: number, delay: number, dur: number) => easeOut((ms - delay) / dur);

/** Count a stat value up from 0, keeping its decimals ("16.4", "222"). */
function countUp(value: string, p: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const decimals = value.includes('.') ? value.split('.')[1].length : 0;
  return (n * p).toFixed(decimals);
}

const TONE = {
  good: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
  mid: { bar: 'bg-amber-400', text: 'text-amber-600' },
  bad: { bar: 'bg-red-500', text: 'text-red-600' },
} as const;

// Records like 5-6 must not wrap at the hyphen (non-breaking hyphen).
const noBreak = (s: string) => s.replace(/(\d)-(\d)/g, '$1‑$2');

interface GraphicProps {
  variant: 'title' | 'topic';
  teamName: string;
  headline: string;
  icon: string;
  /** Team stat line (record on the title card and panel corner). */
  stats?: ShowStatLine | null;
  /** The tiles under the quote: the team's numbers, or the pictured
   *  player's when a line is about a player. */
  tiles?: TileStat[] | null;
  /** Small label over the tiles ("League ranks", "QB ranks"…). */
  tilesLabel?: string;
  /** Since this set of tiles came on screen (they count up again when the
   *  graphic switches between team and player numbers). */
  tilesMs: number;
  /** Stats the current line talks about → highlighted tiles. */
  mentioned: string[];
  speaker: Host;
  blockMs: number;
  /** Since this topic came up. The panel and tiles stay put across topics
   *  (same team, same numbers); only the headline swaps. */
  topicMs: number;
  lineMs: number;
  /** Since this speaker took over (chip slides in on a change of speaker). */
  speakerMs: number;
  /** The line being spoken — shown as the panel's pull quote. */
  text: string;
  /** The spotlight team's logo (title card, panel corner). */
  logo: ReactNode;
  /** The team in the panel's top-right corner, when it isn't the spotlight
   *  team: a line about the opponent (or one of his players) shows theirs. */
  corner?: { name: string; record: string; logo: ReactNode } | null;
  /** Two teams side by side (a game's box score): left vs right. */
  compare?: { left: { abbreviation: string; art: ReactNode }; right: { abbreviation: string; art: ReactNode }; rows: { key: string; label: string; left: string; right: string; edge: 'left' | 'right' | null }[] } | null;
  /** Standings (playoff race / division) — shown instead of tiles. */
  board?: { title: string; cutAfter: number | null; rows: (StandingsRow & { art: ReactNode })[] } | null;
  /** A game's scores on a timeline, one called out (the key moment being
   *  discussed) — shown instead of tiles. */
  flow?: FlowView | null;
  /** Player this line is about → photo card beside the quote. */
  player?: { art: ReactNode; name: string; detail: string; key: string } | null;
  /** Since that player came on screen. */
  playerMs: number;
}

function StatTile({ st, i, blockMs, lineMs, hot, dim }: {
  st: TileStat; i: number; blockMs: number; lineMs: number; hot: boolean; dim: boolean;
}) {
  const ranked = st.rank > 0 && st.of > 0;
  const tone = TONE[ranked ? rankTone(st.rank, st.of) : 'mid'];
  const enter = anim(blockMs, 350 + i * 90, 450);
  const count = anim(blockMs, 450 + i * 90, 900);
  const bar = anim(blockMs, 650 + i * 90, 800);
  const rankIn = anim(blockMs, 1150 + i * 90, 300);
  const emph = anim(lineMs, 0, 350);
  const fill = ranked ? (st.of - st.rank + 1) / st.of : 0;
  return (
    <div
      className="relative rounded-[0.6em] bg-white px-[0.9em] pb-[0.8em] pt-[0.7em] text-left shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
      style={{
        opacity: enter * (dim ? 1 - 0.4 * emph : 1),
        transform: `translateY(${(1 - enter) * 1.4}em) scale(${hot ? 1 + 0.07 * emph : 1})`,
        boxShadow: hot ? `0 0 0 ${0.18 * emph}em #ea580c, 0 10px 26px rgba(234,88,12,${0.35 * emph})` : undefined,
        zIndex: hot ? 1 : 0,
      }}
    >
      <div className="text-[0.62em] font-bold uppercase tracking-[0.12em] text-slate-500">{st.label}</div>
      <div className="text-[1.9em] font-extrabold leading-[1.05] tabular-nums text-[#1e3a5f]">{countUp(st.value, count)}</div>
      {ranked ? (
        <>
          <div className="mt-[0.45em] h-[0.32em] overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${fill * bar * 100}%` }} />
          </div>
          <div className={`mt-[0.35em] text-[0.66em] font-bold ${tone.text}`} style={{ opacity: rankIn }}>
            {ordinal(st.rank)} of {st.of}
          </div>
        </>
      ) : (
        <div className="mt-[0.55em] text-[0.66em] font-bold text-slate-500" style={{ opacity: rankIn }}>{st.note}</div>
      )}
    </div>
  );
}

function SpeakerChip({ speaker, speakerMs, lineMs }: { speaker: Host; speakerMs: number; lineMs: number }) {
  const inP = anim(speakerMs, 0, 320);
  // Little "on air" level meter, animated from the line clock.
  const bars = [0, 1, 2, 3].map(k => 0.35 + 0.65 * Math.abs(Math.sin(lineMs / (140 + k * 37) + k * 1.7)));
  return (
    <div
      className="flex items-center gap-[0.6em] rounded-full bg-[#1e3a5f] py-[0.3em] pl-[0.3em] pr-[1em] text-white shadow-lg"
      style={{ opacity: inP, transform: `translateX(${(1 - inP) * -1.2}em)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatarSrc(speaker)} alt="" className="h-[2.3em] w-[2.3em] rounded-full border-[0.12em] border-orange-500 object-cover" />
      <div className="leading-tight">
        <div className="text-[0.95em] font-extrabold">{HOSTS[speaker].name}</div>
        <div className="text-[0.58em] font-semibold uppercase tracking-[0.14em] text-orange-300">{HOSTS[speaker].title}</div>
      </div>
      <div className="ml-[0.2em] flex h-[1.1em] items-end gap-[0.14em]">
        {bars.map((h, k) => <span key={k} className="w-[0.2em] rounded-sm bg-orange-400" style={{ height: `${h * 100}%` }} />)}
      </div>
    </div>
  );
}

/** Full-frame graphic shown while a host's generated line plays as voiceover. */
export type FlowView = GameFlow & {
  /** The score being discussed (1-based), or null for the whole game. */
  play: number | null;
  /** A quarter being discussed (shaded). */
  quarter: number | null;
  label?: string;
  usArt: ReactNode;
  themArt: ReactNode;
  /** Who scored on the called-out play. */
  scorer: { key: string; name: string; pos: string; art: ReactNode } | null;
};

const KIND_LABEL = { td: 'Touchdown', fg: 'Field goal', safety: 'Safety', other: 'Score' } as const;
const SWING_LABEL = { 'go-ahead': 'Go-ahead', ties: 'Ties it', extends: 'Extends lead', cuts: 'Cuts the lead', opens: 'Opens scoring' } as const;

/** The game as a margin chart: above the line, the team leads; below, the
 *  opponent. Every score is a dot; the one being discussed is called out
 *  under it with the score it made. */
function FlowBoard({ f, blockMs, lineMs, text }: { f: FlowView; blockMs: number; lineMs: number; text: string }) {
  const total = f.quarters > 4 ? 70 : 60;
  const peak = Math.max(7, ...f.plays.map(x => Math.abs(x.us - x.them)));
  const span = Math.ceil(peak / 7) * 7;
  const X = (at: number) => (at / total) * 1000;
  const Y = (m: number) => 100 - (m / span) * 92;
  // Step path of the margin: flat until a score, then a jump.
  let d = `M0 ${Y(0)}`;
  for (const x of f.plays) d += ` H${X(x.at)} V${Y(x.us - x.them)}`;
  d += ` H1000`;
  const area = `${d} V${Y(0)} H0 Z`;
  const draw = anim(blockMs, 150, 1100);
  const hi = f.play != null ? f.plays[f.play - 1] : undefined;
  const qs = Array.from({ length: f.quarters }, (_, i) => i + 1);
  const qx = (q: number) => [X((q - 1) * 15), X(q <= 4 ? q * 15 : total)];
  const leadChanges = f.plays.filter(x => x.swing === 'go-ahead').length;
  const last = f.plays[f.plays.length - 1];
  const low = f.lowPoint != null ? f.plays[f.lowPoint - 1] : undefined;
  const high = f.highPoint != null ? f.plays[f.highPoint - 1] : undefined;
  const callIn = anim(lineMs, 0, 380);
  const prev = hi ? (hi.n > 1 ? f.plays[hi.n - 2] : { us: 0, them: 0 }) : undefined;
  return (
    <>
      <div className="my-auto min-h-0 py-[0.2em]">
        <div className="mb-[0.3em] flex items-center text-[0.62em] font-bold uppercase tracking-[0.22em] text-slate-500" style={{ opacity: anim(blockMs, 0, 300) }}>
          <span>{f.label ? `${f.label} · ` : ''}Game flow</span>
          <span className="ml-auto flex items-center gap-[1.2em] normal-case tracking-normal">
            <span className="flex items-center gap-[0.35em]"><span className="h-[0.8em] w-[0.8em] rounded-full" style={{ background: f.us.color }} />{f.us.abbreviation} score</span>
            <span className="flex items-center gap-[0.35em]"><span className="h-[0.8em] w-[0.8em] rounded-full" style={{ background: f.them.color }} />{f.them.abbreviation} score</span>
          </span>
        </div>
        <div className="rounded-[0.7em] bg-white px-[0.8em] pb-[0.3em] pt-[0.5em] shadow-[0_6px_18px_rgba(15,23,42,0.12)]">
          <div className="relative h-[6.6em]">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[5.4em] whitespace-nowrap text-right text-[0.55em] font-bold uppercase leading-none tracking-[0.06em]">
              <div className="absolute right-[0.6em] top-[0.2em]" style={{ color: f.us.color }}>{f.us.abbreviation} +{span}</div>
              <div className="absolute right-[0.6em] -translate-y-1/2 text-slate-400" style={{ top: `${Y(0) / 2}%` }}>Tied</div>
              <div className="absolute bottom-[0.2em] right-[0.6em]" style={{ color: f.them.color }}>{f.them.abbreviation} +{span}</div>
            </div>
            <div className="absolute inset-y-0 left-[3.2em] right-[0.4em]">
            <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <clipPath id="flow-draw"><rect x="0" y="-20" width={1000 * draw} height="240" /></clipPath>
                <clipPath id="flow-up"><rect x="0" y="-20" width="1000" height={Y(0) + 20} /></clipPath>
                <clipPath id="flow-down"><rect x="0" y={Y(0)} width="1000" height={220 - Y(0)} /></clipPath>
              </defs>
              {f.quarter != null && f.quarter <= f.quarters && (
                <rect x={qx(f.quarter)[0]} y="0" width={qx(f.quarter)[1] - qx(f.quarter)[0]} height="200" fill="#fff7ed" />
              )}
              {qs.slice(1).map(q => (
                <line key={q} x1={qx(q)[0]} x2={qx(q)[0]} y1="0" y2="200" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              ))}
              <line x1="0" x2="1000" y1={Y(0)} y2={Y(0)} stroke="#94a3b8" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <g clipPath="url(#flow-draw)">
                <path d={area} fill={f.us.color} opacity="0.16" clipPath="url(#flow-up)" />
                <path d={area} fill={f.them.color} opacity="0.16" clipPath="url(#flow-down)" />
                <path d={d} fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
              {hi && <line x1={X(hi.at)} x2={X(hi.at)} y1="0" y2="200" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={callIn} />}
            </svg>
            {f.plays.map(x => {
              const on = hi?.n === x.n;
              const shown = draw >= x.at / total;
              return (
                <div
                  key={x.n}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-white transition-[width,height,box-shadow] duration-300"
                  style={{
                    left: `${(X(x.at) / 10)}%`,
                    top: `${Y(x.us - x.them) / 2}%`,
                    width: on ? '1.15em' : '0.62em',
                    height: on ? '1.15em' : '0.62em',
                    borderWidth: on ? '0.16em' : '0.1em',
                    background: x.ours ? f.us.color : f.them.color,
                    boxShadow: on ? '0 0 0 0.28em rgba(234,88,12,0.35)' : undefined,
                    opacity: shown ? 1 : 0,
                    zIndex: on ? 2 : 1,
                  }}
                />
              );
            })}
            </div>
          </div>
          <div className="ml-[5.8em] mr-[0.7em] mt-[0.15em] flex text-[0.55em] font-bold uppercase tracking-[0.18em] text-slate-400">
            {qs.map(q => (
              <div key={q} className={`text-center ${f.quarter === q ? 'text-orange-600' : ''}`} style={{ width: `${(qx(q)[1] - qx(q)[0]) / 10}%` }}>{q === 5 ? 'OT' : `Q${q}`}</div>
            ))}
          </div>
        </div>
        {hi ? (
          <div key={hi.n} className="mt-[0.45em] flex items-center gap-[0.7em] rounded-[0.7em] bg-white px-[0.8em] py-[0.35em] shadow-[0_6px_18px_rgba(15,23,42,0.12)]" style={{ opacity: callIn, transform: `translateY(${(1 - callIn) * 0.6}em)` }}>
            {f.scorer && <div key={f.scorer.key} className="h-[2.8em] w-[2.8em] shrink-0 overflow-hidden rounded-full bg-slate-100 ring-[0.12em] ring-white shadow">{f.scorer.art}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-[0.4em] text-[0.55em] font-extrabold uppercase tracking-[0.16em]">
                <span className="rounded bg-[#1e3a5f] px-[0.5em] py-[0.1em] text-white">{hi.quarter === 5 ? 'OT' : `Q${hi.quarter}`}{hi.timeLeft ? ` · ${hi.timeLeft}` : ''}</span>
                <span className="rounded px-[0.5em] py-[0.1em] text-white" style={{ background: hi.ours ? f.us.color : f.them.color }}>{hi.ours ? f.us.abbreviation : f.them.abbreviation} {KIND_LABEL[hi.kind]}</span>
                {hi.swing !== 'extends' && <span className="rounded bg-orange-100 px-[0.5em] py-[0.1em] text-orange-700">{SWING_LABEL[hi.swing]}</span>}
              </div>
              <div className="mt-[0.1em] truncate text-[1em] font-extrabold text-[#0f1f35]">{hi.title}</div>
            </div>
            <div className="flex shrink-0 items-center gap-[0.4em] tabular-nums">
              <span className="h-[1.6em] w-[1.6em]">{f.usArt}</span>
              <span className={`text-[1.5em] font-extrabold ${hi.ours ? 'text-orange-600' : 'text-[#0f1f35]'}`}>{hi.us}</span>
              <span className="text-[1em] font-bold text-slate-300">–</span>
              <span className={`text-[1.5em] font-extrabold ${!hi.ours ? 'text-orange-600' : 'text-[#0f1f35]'}`}>{hi.them}</span>
              <span className="h-[1.6em] w-[1.6em]">{f.themArt}</span>
              {/* The score before this play. Not uppercase: "WAS 13–6" read as Washington. */}
              {prev && <span className="ml-[0.2em] text-[0.55em] font-semibold leading-tight text-slate-400">from<br />{prev.us}–{prev.them}</span>}
            </div>
          </div>
        ) : (
          <div className="mt-[0.45em] flex flex-wrap gap-[0.5em] text-[0.7em] font-bold text-[#1e3a5f]" style={{ opacity: anim(blockMs, 900, 400) }}>
            {last && <span className="rounded-full bg-white px-[0.8em] py-[0.2em] shadow">Final: {f.us.abbreviation} {last.us}, {f.them.abbreviation} {last.them}</span>}
            {low && <span className="rounded-full bg-white px-[0.8em] py-[0.2em] shadow">Trailed by {low.them - low.us} ({low.quarter === 5 ? 'OT' : `Q${low.quarter}`})</span>}
            {high && <span className="rounded-full bg-white px-[0.8em] py-[0.2em] shadow">Led by {high.us - high.them} ({high.quarter === 5 ? 'OT' : `Q${high.quarter}`})</span>}
            {leadChanges > 0 && <span className="rounded-full bg-white px-[0.8em] py-[0.2em] shadow">{leadChanges} lead change{leadChanges === 1 ? '' : 's'}</span>}
            <span className="rounded-full bg-white px-[0.8em] py-[0.2em] shadow">{f.plays.length} scores</span>
          </div>
        )}
      </div>
      {text && (
        <div key={text} className="line-clamp-1 text-[0.72em] font-semibold leading-snug text-slate-500" style={{ opacity: anim(lineMs, 120, 380) }}>
          {text}
        </div>
      )}
    </>
  );
}

export function ShowGraphic(p: GraphicProps) {
  const { variant, blockMs } = p;
  // Slow push-in on the studio two-shot for the whole block — never static.
  const push = 1.03 + 0.05 * clamp01(blockMs / 24000);
  const anyHot = p.tiles ? p.tiles.some(s => p.mentioned.includes(s.key)) : false;
  // Beside a player card there's room for one row of three: the stats the
  // line mentions first, then the rest in order.
  const shown = !p.tiles ? null : !p.player ? p.tiles
    : [...p.tiles.filter(t => p.mentioned.includes(t.key)), ...p.tiles.filter(t => !p.mentioned.includes(t.key))].slice(0, 3);

  return (
    // Sized off the stage itself (container units), so the layout is the
    // same on a phone as on a desktop — just scaled.
    <div className="absolute inset-0 overflow-hidden bg-slate-800 [container-type:size]">
     <div className="absolute inset-0 [font-size:1.85cqw]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={TWO_SHOT_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          transform: `scale(${push})`,
          filter: variant === 'topic' ? 'blur(10px) saturate(0.9)' : undefined,
        }}
      />

      {variant === 'title' ? (
        <>
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#0f1f35]/95 via-[#0f1f35]/60 to-transparent" />
          <div className="absolute inset-x-[6%] bottom-[15%] text-white">
            <div
              className="inline-block bg-orange-600 px-[0.6em] py-[0.15em] text-[0.8em] font-extrabold tracking-[0.3em]"
              style={{ clipPath: `inset(0 ${(1 - anim(blockMs, 0, 450)) * 100}% 0 0)` }}
            >
              TEAM SPOTLIGHT
            </div>
            <div
              className="mt-[0.35em] flex items-center gap-[0.45em]"
              style={{ opacity: anim(blockMs, 200, 500), transform: `translateY(${(1 - anim(blockMs, 200, 500)) * 0.6}em)` }}
            >
              <div
                className="h-[3.4em] w-[3.4em] shrink-0 [font-size:1em]"
                style={{ transform: `scale(${0.6 + 0.4 * anim(blockMs, 150, 450)})` }}
              >
                {p.logo}
              </div>
              <div className="text-[2.6em] font-extrabold leading-[1.05] [text-shadow:0_2px_12px_rgba(0,0,0,0.4)]">{p.teamName}</div>
            </div>
            {p.stats && (
              <div
                className="mt-[0.4em] inline-block rounded bg-white px-[0.6em] py-[0.1em] text-[1.05em] font-extrabold text-[#1e3a5f]"
                style={{ opacity: anim(blockMs, 650, 300), transform: `scale(${0.8 + 0.2 * anim(blockMs, 650, 300)})`, transformOrigin: 'left center' }}
              >
                {noBreak(p.stats.record)}
              </div>
            )}
            <div className="mt-[0.8em] h-[0.18em] bg-orange-600" style={{ width: `${anim(blockMs, 300, 900) * 100}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/35 to-white/60" />
          <div className="absolute inset-x-0 top-0 h-[1.2%] bg-orange-600" style={{ transformOrigin: 'left', transform: `scaleX(${anim(p.topicMs, 0, 600)})` }} />
          <div
            className="absolute inset-x-[5%] top-[9%] bottom-[19%] flex flex-col rounded-[1em] border border-white/70 bg-white/70 px-[3.5%] py-[3%] shadow-2xl backdrop-blur-md"
            style={{ opacity: anim(blockMs, 0, 350), transform: `translateY(${(1 - anim(blockMs, 0, 450)) * 2}em)` }}
          >
            <div
              className="flex items-center gap-[0.5em]"
              style={{ opacity: anim(p.topicMs, 150, 450), transform: `translateX(${(1 - anim(p.topicMs, 150, 450)) * -1.5}em)` }}
            >
              <div className="min-w-0">
                <div className="text-[0.62em] font-bold uppercase tracking-[0.28em] text-orange-600">The Breakdown</div>
                <div className="text-[1.55em] font-extrabold leading-[1.1] text-[#1e3a5f] [text-wrap:balance]">{noBreak(p.headline)}</div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-[0.5em] text-right">
                <div key={p.corner?.name ?? 'team'} style={{ animation: 'spotlight-bug 300ms ease-out' }}>
                  <div className="text-[0.62em] font-bold uppercase tracking-[0.18em] text-slate-500">{p.corner?.name ?? p.teamName}</div>
                  {(p.corner?.record ?? p.stats?.record) && <div className="text-[1.2em] font-extrabold tabular-nums text-[#1e3a5f]">{noBreak(p.corner?.record ?? p.stats!.record)}</div>}
                </div>
                <div key={`logo-${p.corner?.name ?? 'team'}`} className="h-[2em] w-[2em] shrink-0">{p.corner?.logo ?? p.logo}</div>
              </div>
            </div>
            {p.flow ? (
              <FlowBoard f={p.flow} blockMs={p.tilesMs} lineMs={p.lineMs} text={p.text} />
            ) : p.compare ? (
              <>
                <div className="my-auto min-h-0 overflow-hidden py-[0.3em]">
                  {p.tilesLabel && (
                    <div className="mb-[0.35em] text-[0.62em] font-bold uppercase tracking-[0.22em] text-slate-500" style={{ opacity: anim(p.tilesMs, 0, 300) }}>{p.tilesLabel}</div>
                  )}
                  <div className="overflow-hidden rounded-[0.7em] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.12)]">
                    <div className="grid grid-cols-[1fr_1.3fr_1fr] items-center border-b border-slate-100 px-[1em] py-[0.25em]">
                      <div className="flex items-center gap-[0.45em]"><span className="h-[1.8em] w-[1.8em]">{p.compare.left.art}</span><span className="text-[1em] font-extrabold text-[#1e3a5f]">{p.compare.left.abbreviation}</span></div>
                      <div />
                      <div className="flex items-center justify-end gap-[0.45em]"><span className="text-[1em] font-extrabold text-[#1e3a5f]">{p.compare.right.abbreviation}</span><span className="h-[1.8em] w-[1.8em]">{p.compare.right.art}</span></div>
                    </div>
                    {p.compare.rows.map((r, i) => {
                      const enter = anim(p.tilesMs, 200 + i * 80, 350);
                      const hot = p.mentioned.includes(r.key);
                      return (
                        <div
                          key={r.key}
                          className={`grid grid-cols-[1fr_1.3fr_1fr] items-center px-[1em] py-[0.08em] ${hot ? 'bg-orange-50' : i % 2 ? 'bg-slate-50' : ''}`}
                          style={{ opacity: enter, boxShadow: hot ? 'inset 0 0 0 0.12em #ea580c' : undefined }}
                        >
                          <div className={`text-[1.05em] tabular-nums ${r.edge === 'left' ? 'font-extrabold text-[#0f1f35]' : 'font-semibold text-slate-400'}`}>{countUp(r.left, anim(p.tilesMs, 300 + i * 80, 700))}</div>
                          <div className={`text-center text-[0.6em] font-bold uppercase tracking-[0.16em] ${hot ? 'text-orange-600' : 'text-slate-500'}`}>{r.label}</div>
                          <div className={`text-right text-[1.05em] tabular-nums ${r.edge === 'right' ? 'font-extrabold text-[#0f1f35]' : 'font-semibold text-slate-400'}`}>{countUp(r.right, anim(p.tilesMs, 300 + i * 80, 700))}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {p.text && (
                  <div key={p.text} className="line-clamp-2 text-[0.78em] font-semibold leading-snug text-slate-500" style={{ opacity: anim(p.lineMs, 120, 380) }}>
                    {p.text}
                  </div>
                )}
              </>
            ) : p.board ? (
              <>
                <div className="my-auto min-h-0 overflow-hidden py-[0.3em]" key={p.board.title}>
                  <div className="mb-[0.35em] text-[0.62em] font-bold uppercase tracking-[0.22em] text-slate-500" style={{ opacity: anim(p.tilesMs, 0, 300) }}>
                    {p.board.title}
                  </div>
                  <div className="overflow-hidden rounded-[0.7em] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.12)]">
                    {p.board.rows.map((r, i) => {
                      const enter = anim(p.tilesMs, 200 + i * 70, 350);
                      return (
                        <div key={r.teamId}>
                          {p.board!.cutAfter === i && (
                            <div className="flex items-center gap-[0.5em] bg-orange-50 px-[0.8em] py-0 text-[0.45em] font-bold uppercase tracking-[0.2em] text-orange-600">
                              <span className="h-px flex-1 bg-orange-400" /> Playoff line <span className="h-px flex-1 bg-orange-400" />
                            </div>
                          )}
                          <div
                            className={`flex items-center gap-[0.6em] px-[0.8em] py-[0.06em] text-[0.7em] ${r.isUser ? 'bg-orange-100 font-extrabold text-[#0f1f35]' : i % 2 ? 'bg-slate-50 text-slate-700' : 'text-slate-700'}`}
                            style={{ opacity: enter, transform: `translateX(${(1 - enter) * -1}em)` }}
                          >
                            <span className="w-[1.6em] text-center text-[0.85em] font-bold text-slate-400">{r.seed ?? '–'}</span>
                            <span className="h-[1.4em] w-[1.4em] shrink-0">{r.art}</span>
                            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                            <span className="w-[3.5em] text-right tabular-nums font-bold">{r.record}</span>
                            <span className="w-[4.2em] whitespace-nowrap text-right tabular-nums text-slate-500">{r.gb ? `${r.gb} GB` : r.seed ? 'In' : '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {p.text && (
                  <div key={p.text} className="line-clamp-2 text-[0.78em] font-semibold leading-snug text-slate-500" style={{ opacity: anim(p.lineMs, 120, 380) }}>
                    {p.text}
                  </div>
                )}
              </>
            ) : p.tiles?.length ? (
              // Stats lead: the player (or unit/team) and the numbers fill the
              // panel; what's being said is only a small caption underneath.
              <>
                <div className="my-auto flex min-h-0 items-center gap-[1.4em] overflow-hidden py-[0.4em]">
                  {p.player && (
                    <div
                      key={p.player.key}
                      className="flex w-[11em] shrink-0 flex-col items-center rounded-[0.9em] bg-white px-[0.6em] pb-[0.7em] pt-[0.8em] text-center shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                      style={{ opacity: anim(p.playerMs, 0, 350), transform: `translateX(${(1 - anim(p.playerMs, 0, 400)) * -1.2}em)` }}
                    >
                      <div className="h-[5.6em] w-[5.6em] overflow-hidden rounded-full border-[0.14em] border-orange-500 bg-slate-100">{p.player.art}</div>
                      <div className="mt-[0.45em] text-[1.05em] font-extrabold leading-tight text-[#1e3a5f]">{p.player.name}</div>
                      <div className="text-[0.6em] font-bold uppercase tracking-[0.14em] text-slate-500">{p.player.detail}</div>
                    </div>
                  )}
                  <div key={p.tilesLabel} className="min-w-0 flex-1">
                    {p.tilesLabel && (
                      <div className="mb-[0.45em] text-[0.62em] font-bold uppercase tracking-[0.22em] text-slate-500" style={{ opacity: anim(p.tilesMs, 0, 300) }}>
                        {p.tilesLabel}
                      </div>
                    )}
                    <div
                      className="grid gap-[0.8em]"
                      style={{ gridTemplateColumns: `repeat(${shown!.length}, minmax(0, 1fr))` }}
                    >
                      {shown!.map((st, i) => (
                        <StatTile
                          key={st.key}
                          st={st}
                          i={i}
                          blockMs={p.tilesMs}
                          lineMs={p.lineMs}
                          hot={p.mentioned.includes(st.key)}
                          dim={anyHot && !p.mentioned.includes(st.key)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                {p.text && (
                  <div
                    key={p.text}
                    className="line-clamp-2 text-[0.78em] font-semibold leading-snug text-slate-500"
                    style={{ opacity: anim(p.lineMs, 120, 380) }}
                  >
                    {p.text}
                  </div>
                )}
              </>
            ) : (
              <div className="my-auto flex min-h-0 items-center gap-[1.1em] py-[0.5em]">
                {p.player && (
                  <div
                    key={p.player.key}
                    className="flex shrink-0 items-center gap-[0.6em] rounded-[0.8em] bg-white py-[0.45em] pl-[0.45em] pr-[0.9em] shadow-[0_6px_18px_rgba(15,23,42,0.12)]"
                    style={{ opacity: anim(p.playerMs, 0, 350), transform: `translateX(${(1 - anim(p.playerMs, 0, 400)) * -1.2}em)` }}
                  >
                    <div className="h-[3.6em] w-[3.6em] shrink-0 overflow-hidden rounded-full border-[0.12em] border-orange-500 bg-slate-100">{p.player.art}</div>
                    <div className="leading-tight">
                      <div className="text-[1em] font-extrabold text-[#1e3a5f]">{p.player.name}</div>
                      <div className="text-[0.62em] font-bold uppercase tracking-[0.14em] text-slate-500">{p.player.detail}</div>
                    </div>
                  </div>
                )}
                <div
                  key={p.text || 'empty'}
                  className="line-clamp-4 min-w-0 font-bold leading-snug text-[#0f1f35] [text-wrap:balance]"
                  style={{
                    fontSize: p.text.length > 150 ? '1em' : p.text.length > 95 ? '1.2em' : '1.45em', opacity: anim(p.lineMs, 120, 380), transform: `translateY(${(1 - anim(p.lineMs, 120, 380)) * 0.5}em)` }}
                >
                  {p.text && <><span className="mr-[0.15em] text-orange-600">&ldquo;</span>{p.text}<span className="text-orange-600">&rdquo;</span></>}
                </div>
              </div>
            )}
          </div>
          {/* Below the panel, clear of the tiles (no captions on this shot). */}
          <div className="absolute left-[5%] bottom-[6%]">
            <SpeakerChip speaker={p.speaker} speakerMs={p.speakerMs} lineMs={p.lineMs} />
          </div>
        </>
      )}
     </div>
    </div>
  );
}

/** Caption strip shared by the player and the demo renderer. */
export function ShowCaption({ text }: { text: string }) {
  return (
    <div className="absolute inset-x-[7%] bottom-[4.5%] text-center">
      <span className="rounded bg-[#0f1f35]/85 px-2 py-0.5 text-[clamp(11px,1.8vw,17px)] font-semibold leading-snug text-white [box-decoration-break:clone]">
        {text}
      </span>
    </div>
  );
}
