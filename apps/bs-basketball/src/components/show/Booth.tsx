'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { buildSpotlight } from '@/lib/show/spotlight';
import { buildSpotlightTeamData, type FetchOptions } from '@/lib/ai/aiSpotlight';
import { CALL_IN_CHIPS, answerChip, type CallInTeamData } from '@/lib/show/callInTemplates';
import {
  useBoothStore, boothEpisodeKey, boothFetchOptions, episodeTopics, spotlightWeek, MOMENT_LABEL, EMPTY_BOOTH_LOG,
  type BoothEpisodeTopic, type BoothHost, type BoothLog, type BoothMsg,
} from '@/lib/show/booth';

/**
 * The Booth — "Call in to the show" with Marcus Cole & Tony Blaze, on every
 * in-game screen (BS Football parity: GlobalBooth + SpotlightCallIn).
 *
 * A floating launcher in the bottom-right corner (it replaces the feedback
 * bubble while mounted) opens a panel docked to the right edge (full screen on
 * phones). The current Team Spotlight is pinned as the On Air card; when a new
 * episode drops at a narrative moment (preseason, deadline, play-in, playoffs,
 * season review) a callout slides out once and a dot stays on the launcher
 * until the Booth is opened.
 *
 * Everyone:   tap a question chip → instant template answer from real team
 *             data (no LLM, no cost, works for guests).
 * Signed-in:  Free tier gets 3 typed questions per in-game week.
 * Premium:    open mic (server-side sanity cap).
 *
 * Hosts are grounded on buildSpotlightTeamData — the same facts the AI
 * Spotlight uses — plus the episode, via /api/spotlight-chat.
 */

const FREE_TURNS = 3;
const VISIBLE_CHIPS = 4;

interface Call { question: string; marcus?: BoothMsg; tony?: BoothMsg }

interface OnAirInfo {
  moment: string | null;
  topics: BoothEpisodeTopic[];
  /** Expanded until the caller watches it or calls in. */
  fresh: boolean;
  onWatch: () => void;
}

const HOST_META = {
  marcus: { name: 'Marcus', initials: 'MC', avatar: 'bg-blue-600 text-white', rule: 'border-t-blue-600', label: 'text-blue-700', chip: 'bg-blue-50 text-blue-700' },
  tony: { name: 'Tony', initials: 'TB', avatar: 'bg-orange-600 text-orange-950', rule: 'border-t-orange-600', label: 'text-orange-800', chip: 'bg-orange-50 text-orange-800' },
} as const;

/** One card per caller question: the question plus whichever hosts have answered. */
function groupCalls(messages: BoothMsg[]): Call[] {
  const calls: Call[] = [];
  for (const m of messages) {
    if (m.role === 'user') { calls.push({ question: m.text }); continue; }
    if (calls.length === 0) calls.push({ question: '' });
    calls[calls.length - 1][m.role] = m;
  }
  return calls;
}

function Avatar({ host, size = 'md' }: { host: BoothHost; size?: 'sm' | 'md' }) {
  const h = HOST_META[host];
  const dims = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <span aria-hidden="true" className={`${dims} ${h.avatar} rounded-full flex items-center justify-center font-extrabold tracking-tight shrink-0 ring-2 ring-[var(--surface)]`}>
      {h.initials}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 text-[var(--text-sec)]" aria-label="Typing">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
    </span>
  );
}

function PlayIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>;
}

function TakeColumn({ host, msg, pending }: { host: BoothHost; msg?: BoothMsg; pending: boolean }) {
  const h = HOST_META[host];
  return (
    <div className={`flex flex-col gap-1.5 px-3.5 py-3 border-t-[3px] ${h.rule}`}>
      <div className="flex items-center gap-2">
        <Avatar host={host} size="sm" />
        <span className={`text-xs font-extrabold uppercase tracking-wider ${h.label}`}>{h.name}</span>
      </div>
      {msg ? (
        <>
          {msg.verdict && <span className="text-[15px] font-bold leading-tight">{msg.verdict}</span>}
          <p className={host === 'tony' ? 'text-[15px] font-semibold leading-snug' : 'text-[13px] leading-relaxed'}>{msg.text}</p>
        </>
      ) : pending ? (
        <div className="py-2"><TypingDots /></div>
      ) : (
        <p className="text-xs text-[var(--text-sec)] italic">Passed on this one.</p>
      )}
    </div>
  );
}

/** A host's first line in the episode, for the "says" row. */
function firstLine(topics: BoothEpisodeTopic[], speakerId: 'stats' | 'hottake'): string | null {
  for (const t of topics) {
    const e = t.exchanges.find(x => x.speakerId === speakerId);
    if (e) return e.text;
  }
  return null;
}

function OnAirCard({ info, onCallIn }: { info: OnAirInfo; onCallIn: () => void }) {
  const lead = info.topics[0];
  if (!lead) return null;

  if (!info.fresh) {
    return (
      <button
        onClick={info.onWatch}
        className="w-full flex items-center gap-2.5 px-3 min-h-12 rounded-lg bg-[#121A2B] text-white text-left hover:bg-[#1c2740] transition-colors"
      >
        <span className="text-[10px] font-extrabold tracking-widest text-slate-300 border border-slate-500 px-1.5 py-0.5 rounded shrink-0">ON AIR</span>
        <span className="text-[13px] font-bold flex-1 min-w-0 truncate">{lead.headline}</span>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-blue-200 shrink-0"><PlayIcon />Watch</span>
      </button>
    );
  }

  const marcus = firstLine(info.topics, 'stats');
  const tony = firstLine(info.topics, 'hottake');
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <div className="bg-[#121A2B] text-white px-4 py-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-extrabold tracking-widest px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />ON AIR
          </span>
          <span className="text-xs text-slate-300">New episode{info.moment ? ` · ${info.moment}` : ''}</span>
        </div>
        <h3 className="text-lg font-extrabold leading-tight">{lead.headline}</h3>
      </div>

      {marcus && tony && (
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-[var(--border)] border-b border-[var(--border)]">
          {([['marcus', marcus], ['tony', tony]] as const).map(([h, line]) => (
            <div key={h} className={`flex gap-2 px-3.5 py-3 border-t-[3px] ${HOST_META[h].rule}`}>
              <Avatar host={h} size="sm" />
              <div className="min-w-0">
                <div className={`text-[11px] font-extrabold uppercase tracking-wider ${HOST_META[h].label}`}>{HOST_META[h].name} says</div>
                <p className={`text-[13px] leading-snug line-clamp-3 ${h === 'tony' ? 'font-semibold' : ''}`}>{line}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {info.topics.length > 1 && (
        <div className="px-4 py-3 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)]">In this episode</div>
          <ol className="space-y-1">
            {info.topics.slice(0, 4).map((t, i) => (
              <li key={i} className="flex gap-2.5 text-[13px]">
                <span className="w-3 font-bold text-[var(--text-sec)] shrink-0">{i + 1}</span>
                <span className="min-w-0">{t.headline}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]">
        <button onClick={info.onWatch} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors">
          <PlayIcon />Watch episode
        </button>
        <button onClick={onCallIn} className="min-h-11 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold hover:bg-[var(--surface-2)] transition-colors">
          Call in about this
        </button>
      </div>
    </article>
  );
}

function BoothPanel({ fetchOpts, episode, weekKey, open, onClose, onAir, onAsk }: {
  fetchOpts: FetchOptions;
  episode: BoothEpisodeTopic[];
  weekKey: string;
  open: boolean;
  onClose: () => void;
  onAir: OnAirInfo | null;
  onAsk: () => void;
}) {
  const { user, hasFeature, loading: subLoading } = useSubscription();
  const isPremium = hasFeature('ai_commentary');
  const signedIn = !!user;

  const { messages, turns } = useBoothStore(s => s.logs[weekKey]) ?? EMPTY_BOOTH_LOG;
  const updateLog = useBoothStore(s => s.updateLog);
  // Functional updates go through the store, so replies that land after the
  // Booth closes (or after a page change) still reach the saved log.
  const patch = (fn: (log: BoothLog) => Partial<BoothLog>) => updateLog(weekKey, l => ({ ...l, ...fn(l) }));
  const setMessages = (fn: (m: BoothMsg[]) => BoothMsg[]) => patch(l => ({ messages: fn(l.messages) }));
  const setTurns = (n: number) => patch(() => ({ turns: n }));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chipSeed, setChipSeed] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAllChips, setShowAllChips] = useState(false);
  // Suggested next questions from the last typed exchange; null = show topic chips.
  const [followUps, setFollowUps] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const teamData = useMemo(() => buildSpotlightTeamData(fetchOpts), [fetchOpts]);
  const teamName = `${fetchOpts.team.city} ${fetchOpts.team.name}`;
  const typedCapped = !isPremium && turns >= FREE_TURNS;
  const canType = signedIn && !typedCapped;
  const calls = useMemo(() => groupCalls(messages), [messages]);
  const latest = calls.length - 1;
  const chips = showAllChips ? CALL_IN_CHIPS : CALL_IN_CHIPS.slice(0, VISIBLE_CHIPS);

  function tapChip(id: string, label: string) {
    if (busy) return;
    onAsk();
    setError(null);
    setExpanded(null);
    setFollowUps(null);
    const seed = chipSeed + 1;
    setChipSeed(seed);
    const replies = answerChip(id, teamData as unknown as CallInTeamData, seed * 7919 + messages.length);
    setMessages(m => [...m, { role: 'user', text: label }]);
    // Template answers are instant, which reads as canned. Pace them like a
    // live reply: typing indicator, first host after ~2s, second ~1.2s later.
    setBusy(true);
    const [first, second] = replies;
    setTimeout(() => {
      setMessages(m => [...m, { role: first.speaker, text: first.text }]);
      if (!second) { setBusy(false); return; }
      setTimeout(() => {
        setMessages(m => [...m, { role: second.speaker, text: second.text }]);
        setBusy(false);
      }, 1200);
    }, 2000);
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (!text || busy || !canType) return;
    onAsk();
    setError(null);
    setExpanded(null);
    setBusy(true);
    setInput('');
    setFollowUps(null);
    const history = messages;
    const nextTurn = turns + 1;
    setMessages(m => [...m, { role: 'user', text }]);
    setTurns(nextTurn);
    try {
      const res = await fetch('/api/spotlight-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamData, episode, history, message: text, turn: nextTurn }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      const replies = (json.replies ?? []) as { speaker: BoothHost; text: string; verdict?: string }[];
      setMessages(m => [...m, ...replies.map(r => ({ role: r.speaker, text: r.text, verdict: r.verdict }))]);
      if (Array.isArray(json.followUps) && json.followUps.length) setFollowUps((json.followUps as string[]).slice(0, 3));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function pushBack(host: BoothHost) {
    void send(host === 'tony' ? "Tony, I'm not buying it. Convince me." : "Marcus, I'm not buying it. Convince me.");
  }

  if (subLoading) return null;

  const freeLeft = Math.max(0, FREE_TURNS - turns);

  return (
    // Stays mounted while closed so an in-flight answer isn't lost.
    <aside
      role="dialog"
      aria-label="The Booth: call in to the show"
      hidden={!open}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--surface)] text-[var(--text)] md:left-auto md:w-[480px] md:border-l md:border-[var(--border)] md:shadow-[-8px_0_24px_rgba(18,26,43,0.08)]"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <span className="flex">
          <Avatar host="marcus" />
          <span className="-ml-1"><Avatar host="tony" /></span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-base font-extrabold uppercase tracking-wide leading-tight">The Booth</div>
          <div className="text-xs text-[var(--text-sec)] truncate">Marcus Cole &amp; Tony Blaze on the {teamName}</div>
        </div>
        {isPremium
          ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">Open mic</span>
          : signedIn && <span className="text-[11px] text-[var(--text-sec)]">{freeLeft} question{freeLeft === 1 ? '' : 's'} left</span>}
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close the booth"
          className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--surface-2)]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[var(--bg)]">
        {onAir && <OnAirCard info={onAir} onCallIn={() => inputRef.current?.focus()} />}

        {calls.length === 0 && (
          onAir?.fresh ? (
            <div className="text-center py-4 px-6">
              <p className="text-sm font-semibold">Think one of them got it wrong?</p>
              <p className="text-xs text-[var(--text-sec)] mt-1">Call in and you&apos;ll get both takes, side by side.</p>
            </div>
          ) : (
            <div className="text-center py-10 px-6">
              <p className="text-sm font-semibold">You&apos;re on the air.</p>
              <p className="text-xs text-[var(--text-sec)] mt-1">
                Marcus &amp; Tony know the {teamName}: your roster, your record, your moves. Ask anything and you&apos;ll get both takes.
              </p>
            </div>
          )
        )}

        {calls.map((call, i) => {
          const isOpen = i === latest || expanded === i;
          if (!isOpen) {
            return (
              <button
                key={i}
                onClick={() => setExpanded(i)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:bg-[var(--surface-2)]"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-sec)] shrink-0">Earlier</span>
                <span className="text-[13px] font-semibold flex-1 min-w-0 truncate">{call.question}</span>
                {(['marcus', 'tony'] as const).map(h => call[h]?.verdict && (
                  <span key={h} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 max-w-[110px] truncate ${HOST_META[h].chip}`}>{call[h]!.verdict}</span>
                ))}
              </button>
            );
          }
          const pending = busy && i === latest;
          return (
            <article key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
              {call.question && (
                <div className="px-4 pt-3.5 pb-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-sec)]">You asked</div>
                    <h3 className="text-lg font-extrabold leading-tight mt-0.5">{call.question}</h3>
                  </div>
                  {i !== latest && (
                    <button onClick={() => setExpanded(null)} aria-label="Collapse" className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--surface-2)]">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-[var(--border)] sm:divide-x divide-[var(--border)]">
                <TakeColumn host="marcus" msg={call.marcus} pending={pending} />
                <TakeColumn host="tony" msg={call.tony} pending={pending} />
              </div>

              {!pending && i === latest && canType && call.marcus && call.tony && (
                <div className="px-4 py-2.5 border-t border-[var(--border)] flex gap-2 flex-wrap">
                  <button onClick={() => pushBack('tony')} className="min-h-10 px-3 rounded-lg bg-[var(--text)] text-[var(--surface)] text-[13px] font-semibold">Push back on Tony</button>
                  <button onClick={() => pushBack('marcus')} className="min-h-10 px-3 rounded-lg border border-[var(--border)] text-[13px] font-medium hover:bg-[var(--surface-2)]">Push back on Marcus</button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="border-t border-[var(--border)] px-4 pt-3 pb-4 space-y-2.5 bg-[var(--surface)]">
        {followUps && canType ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-sec)] mr-0.5">Keep going</span>
            {followUps.map(q => (
              <button
                key={q}
                onClick={() => void send(q)}
                disabled={busy}
                className="min-h-9 text-xs px-3 rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-40 transition-colors"
              >
                {q}
              </button>
            ))}
            <button onClick={() => setFollowUps(null)} className="min-h-9 text-xs px-3 rounded-full text-[var(--text-sec)] hover:bg-[var(--surface-2)]">
              Topics
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {chips.map(c => (
              <button
                key={c.id}
                onClick={() => tapChip(c.id, c.label)}
                disabled={busy}
                className="min-h-9 text-xs px-3 rounded-full border border-[var(--border)] bg-[var(--surface-2)] hover:border-blue-300 disabled:opacity-40 transition-colors"
              >
                {c.label}
              </button>
            ))}
            {CALL_IN_CHIPS.length > VISIBLE_CHIPS && (
              <button onClick={() => setShowAllChips(s => !s)} className="min-h-9 text-xs px-3 rounded-full text-blue-700 font-semibold hover:bg-[var(--surface-2)]">
                {showAllChips ? 'Fewer' : `${CALL_IN_CHIPS.length - VISIBLE_CHIPS} more`}
              </button>
            )}
          </div>
        )}

        {error && <div className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg">{error}</div>}

        {!signedIn ? (
          <p className="text-xs text-[var(--text-sec)] text-center py-1">
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link> to ask the hosts your own question: 3 a week free.
          </p>
        ) : typedCapped ? (
          <div className="text-center py-1">
            <p className="text-xs text-[var(--text-sec)]">That&apos;s your 3 free questions this week. Quick questions above are still open.</p>
            <Link href="/pricing" className="inline-block mt-2 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">
              Open mic with Premium
            </Link>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void send(); }} className="flex items-center gap-2">
            <label htmlFor="booth-question" className="sr-only">Your question</label>
            <input
              id="booth-question"
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={500}
              disabled={busy}
              placeholder={isPremium ? `Ask Marcus & Tony anything about the ${fetchOpts.team.name}…` : `Ask your own question (${freeLeft} left this week)…`}
              className="flex-1 min-w-0 h-11 text-sm px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button type="submit" disabled={busy || !input.trim()} className="h-11 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              Ask
            </button>
          </form>
        )}
      </div>
    </aside>
  );
}

/** Narrative moments that announce a new episode with the corner callout. */
const ANNOUNCED = new Set(['preseason', 'tradeDeadline', 'playInStart', 'playoffsStart', 'allStarBreak', 'seasonOver']);

export function Booth() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const league = useLeagueStore(s => s.league);
  const open = useBoothStore(s => s.open);
  const setOpen = useBoothStore(s => s.setOpen);
  const setMounted = useBoothStore(s => s.setMounted);
  const seen = useBoothStore(s => s.seen);
  const markSeen = useBoothStore(s => s.markSeen);
  const { hasFeature, loading: subLoading } = useSubscription();
  const isPremium = subLoading || hasFeature('ai_commentary');

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  const episodeKey = league ? boothEpisodeKey(league) : '';
  // Rebuilt when the sim moves (a day, a game, a new episode), not on every
  // league write such as a lineup edit. Keying on the episode alone froze the
  // stories captured at league creation, before the first feed items existed.
  const simStamp = `${episodeKey}|${league?.userTeamId}|${league?.currentTick}|${league?.games.length}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchOpts = useMemo(() => (league ? boothFetchOptions(league) : null), [simStamp]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const episode = useMemo(() => episodeTopics(league ? buildSpotlight(league) : null), [simStamp]);
  const narrative = fetchOpts?.narrative ?? 'weekly';
  const momentKey = ANNOUNCED.has(narrative) ? episodeKey : null;

  // Opening the Booth clears the launcher dot for this episode.
  useEffect(() => {
    if (open && momentKey) markSeen('opened', momentKey);
  }, [open, momentKey, markSeen]);

  const fresh = !!momentKey && seen.engaged !== momentKey;
  const showDot = fresh && seen.opened !== momentKey;
  const onLiveGame = pathname.startsWith('/game/');
  const calloutDue = showDot && seen.dismissed !== momentKey && !open && !onLiveGame && episode.length > 0;

  // The callout announces each episode once: a beat after it's due it slides
  // in and the episode is marked dismissed right away, so later pages and
  // refreshes never replay it (the launcher dot still flags the episode).
  const [callout, setCallout] = useState<{ key: string; stage: 'enter' | 'in' | 'leave' } | null>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const hideCallout = useCallback(() => setCallout(c => c && { ...c, stage: 'leave' }), []);
  useEffect(() => {
    if (!calloutDue || !momentKey) return;
    const t = setTimeout(() => {
      markSeen('dismissed', momentKey);
      setCallout({ key: momentKey, stage: 'enter' });
    }, 800);
    return () => clearTimeout(t);
  }, [calloutDue, momentKey, markSeen]);

  // Changing page or opening the Booth ends it on the spot.
  useEffect(() => setCallout(null), [pathname, open]);

  // Once in, it leaves after 5s, or on the first click or keypress outside it.
  useEffect(() => {
    if (!callout) return;
    if (callout.stage !== 'in') {
      const t = callout.stage === 'enter'
        ? setTimeout(() => setCallout(c => c && { ...c, stage: 'in' }), 20)
        : setTimeout(() => setCallout(null), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(hideCallout, 5000);
    const onAction = (e: Event) => {
      if (!calloutRef.current?.contains(e.target as Node)) hideCallout();
    };
    document.addEventListener('pointerdown', onAction, true);
    document.addEventListener('keydown', onAction, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onAction, true);
      document.removeEventListener('keydown', onAction, true);
    };
  }, [callout, hideCallout]);

  const showCallout = callout?.key === momentKey && showDot && !open && !onLiveGame;
  const calloutIn = callout?.stage === 'in';

  if (!league || !fetchOpts) return null;
  const team = fetchOpts.team;
  const weekKey = `${team.id}-s${league.currentSeason}-w${spotlightWeek(league)}-${league.currentPhase}`;

  function watch() {
    if (momentKey) markSeen('engaged', momentKey);
    setOpen(false);
    router.push('/show');
  }

  const onAir: OnAirInfo | null = episode.length > 0
    ? { moment: MOMENT_LABEL[narrative], topics: episode, fresh, onWatch: watch }
    : null;

  return (
    <>
      {!open && !onLiveGame && (
        <div className="fixed right-4 bottom-4 sm:bottom-5 sm:right-5 z-30 flex flex-col items-end gap-2">
          {showCallout && (
            <div
              ref={calloutRef}
              role="status"
              className={`relative w-60 sm:w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden transition-all duration-500 ${calloutIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
            >
              <div className="bg-[#121A2B] text-white px-3 py-2 pr-9 sm:px-3.5 sm:py-2.5 sm:pr-10">
                <span className="inline-flex items-center gap-1.5 bg-red-600 text-[9px] sm:text-[10px] font-extrabold tracking-widest px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />NEW EPISODE
                </span>
                <p className="text-[13px] sm:text-sm font-bold leading-snug mt-1 sm:mt-1.5 truncate sm:whitespace-normal">
                  <span className="sm:hidden">Marcus &amp; Tony on the {team.name}</span>
                  <span className="hidden sm:inline">Marcus &amp; Tony break down the {team.name}</span>
                </p>
                {MOMENT_LABEL[narrative] && <p className="hidden sm:block text-xs text-slate-300 mt-0.5">{MOMENT_LABEL[narrative]}</p>}
              </div>
              <button
                onClick={hideCallout}
                aria-label="Dismiss"
                className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <div className="flex gap-1.5 sm:gap-2 p-2 sm:p-2.5">
                <button onClick={watch} className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-8 sm:min-h-10 rounded-lg bg-blue-600 text-white text-xs sm:text-[13px] font-bold hover:bg-blue-700">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>Watch
                </button>
                <button onClick={() => setOpen(true)} className="flex-1 min-h-8 sm:min-h-10 rounded-lg border border-[var(--border)] text-xs sm:text-[13px] font-semibold hover:bg-[var(--surface-2)]">
                  Call in
                </button>
              </div>
              {!isPremium && (
                <p className="hidden sm:block px-3 pb-2.5 -mt-1 text-[11px] text-purple-700">Premium opens the mic: ask the hosts anything.</p>
              )}
            </div>
          )}
          <button
            onClick={() => setOpen(true)}
            aria-label={showDot ? 'Open the Booth: new episode from Marcus & Tony' : 'Open the Booth: ask Marcus & Tony'}
            className={`relative ${showCallout ? 'hidden sm:flex' : 'flex'} items-center gap-2 pl-1.5 pr-1.5 sm:pr-4 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all`}
          >
            <span className="flex">
              <Avatar host="marcus" />
              <span className="-ml-1"><Avatar host="tony" /></span>
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-extrabold uppercase tracking-wide">The Booth</span>
              <span className="text-[11px] text-[var(--text-sec)]">{showDot ? 'New episode' : 'Ask Marcus & Tony'}</span>
            </span>
            {showDot && (
              <span aria-hidden="true" className="absolute -top-0.5 left-0.5 w-3 h-3 rounded-full bg-red-600 ring-2 ring-[var(--surface)]" />
            )}
          </button>
        </div>
      )}
      <BoothPanel
        fetchOpts={fetchOpts}
        episode={episode}
        weekKey={weekKey}
        open={open}
        onClose={() => setOpen(false)}
        onAir={onAir}
        onAsk={() => { if (momentKey) markSeen('engaged', momentKey); }}
      />
    </>
  );
}
