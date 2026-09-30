'use client';

/**
 * Broadcast graphics for the Team Spotlight show.
 *
 * Everything here is a pure function of elapsed time (`blockMs` since the
 * graphic came on screen, `lineMs` since the current line started), so the
 * player drives it from a rAF clock and the demo renderer can draw any
 * frame deterministically.
 */
import { HOSTS, type Host } from '@/lib/spotlight/showScript';
import { ordinal, rankTone, type ShowStat, type ShowStatKey, type ShowStatLine } from '@/lib/spotlight/teamStats';

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
  stats?: ShowStatLine | null;
  /** Stats the current line talks about → highlighted tiles. */
  mentioned: ShowStatKey[];
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
}

function StatTile({ st, i, blockMs, lineMs, hot, dim }: {
  st: ShowStat; i: number; blockMs: number; lineMs: number; hot: boolean; dim: boolean;
}) {
  const tone = TONE[rankTone(st.rank, st.of)];
  const enter = anim(blockMs, 350 + i * 90, 450);
  const count = anim(blockMs, 450 + i * 90, 900);
  const bar = anim(blockMs, 650 + i * 90, 800);
  const rankIn = anim(blockMs, 1150 + i * 90, 300);
  const emph = anim(lineMs, 0, 350);
  const fill = (st.of - st.rank + 1) / st.of;
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
      <div className="mt-[0.45em] h-[0.32em] overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${fill * bar * 100}%` }} />
      </div>
      <div className={`mt-[0.35em] text-[0.66em] font-bold ${tone.text}`} style={{ opacity: rankIn }}>
        {ordinal(st.rank)} of {st.of}
      </div>
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
export function ShowGraphic(p: GraphicProps) {
  const { variant, blockMs } = p;
  // Slow push-in on the studio two-shot for the whole block — never static.
  const push = 1.03 + 0.05 * clamp01(blockMs / 24000);
  const anyHot = p.stats ? p.stats.stats.some(s => p.mentioned.includes(s.key)) : false;

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
              className="mt-[0.2em] text-[2.6em] font-extrabold leading-[1.05] [text-shadow:0_2px_12px_rgba(0,0,0,0.4)]"
              style={{ opacity: anim(blockMs, 200, 500), transform: `translateY(${(1 - anim(blockMs, 200, 500)) * 0.6}em)` }}
            >
              {p.teamName}
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
              <span className="text-[2em] leading-none">{p.icon}</span>
              <div className="min-w-0">
                <div className="text-[0.62em] font-bold uppercase tracking-[0.28em] text-orange-600">The Breakdown</div>
                <div className="text-[1.55em] font-extrabold leading-[1.1] text-[#1e3a5f] [text-wrap:balance]">{noBreak(p.headline)}</div>
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="text-[0.62em] font-bold uppercase tracking-[0.18em] text-slate-500">{p.teamName}</div>
                {p.stats && <div className="text-[1.2em] font-extrabold tabular-nums text-[#1e3a5f]">{noBreak(p.stats.record)}</div>}
              </div>
            </div>
            <div
              key={p.text || 'empty'}
              className="my-auto py-[0.6em] text-[1.45em] font-bold leading-snug text-[#0f1f35] [text-wrap:balance]"
              style={{ opacity: anim(p.lineMs, 120, 380), transform: `translateY(${(1 - anim(p.lineMs, 120, 380)) * 0.5}em)` }}
            >
              {p.text && <><span className="mr-[0.15em] text-orange-600">&ldquo;</span>{p.text}<span className="text-orange-600">&rdquo;</span></>}
            </div>
            {p.stats ? (
              <div className="grid grid-cols-5 gap-[0.8em]">
                {p.stats.stats.map((st, i) => (
                  <StatTile
                    key={st.key}
                    st={st}
                    i={i}
                    blockMs={blockMs}
                    lineMs={p.lineMs}
                    hot={p.mentioned.includes(st.key)}
                    dim={anyHot && !p.mentioned.includes(st.key)}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <div className="absolute left-[5%] bottom-[18.5%] translate-y-1/2">
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
