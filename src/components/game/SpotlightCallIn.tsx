'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { buildSpotlightTeamData, type FetchOptions } from '@/lib/engine/aiSpotlight';
import { CALL_IN_CHIPS, answerChip } from '@/lib/engine/callInTemplates';
import { buildLeagueScoutPacket, fallbackFollowUps } from '@/lib/engine/leagueScout';
import { useGameStore } from '@/lib/engine/store';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

/**
 * "Call In to the Show" — the Booth. Ask Marcus Cole & Tony Blaze a question
 * and both answer side by side as a Split Take card.
 *
 * Everyone:   tap a question chip → instant template answer from real team
 *             data (no LLM, no cost, works for guests).
 * Signed-in:  Free tier gets 3 typed questions per in-game week (Flash-Lite).
 * Premium:    open mic, no visible cap (Flash).
 *
 * The Booth opens as a panel docked to the right edge (full screen on
 * phones). Each question + the hosts' replies is one card; older cards
 * collapse to a single line with both verdicts.
 *
 * History, votes + turn count reset when the in-game week key changes;
 * persisted in sessionStorage so a refresh doesn't wipe the call. Hosts are
 * grounded on the same teamData the episode generator uses, plus the
 * rendered episode.
 */

const FREE_TURNS = 3;
const VISIBLE_CHIPS = 4;

type Host = 'marcus' | 'tony';
type Role = 'user' | Host;
interface Msg { role: Role; text: string; verdict?: string; }
interface Call { question: string; marcus?: Msg; tony?: Msg; }

interface Props {
  fetchOpts: FetchOptions;
  episode: { headline: string; exchanges: { speakerId: string; text: string; playerName?: string }[] }[];
  weekKey: string;
}

function storageKey(weekKey: string) { return `gg-callin-${weekKey}`; }

const HOST_META = {
  marcus: {
    name: 'Marcus', initials: 'MC', avatar: 'bg-blue-600 text-white', rule: 'border-t-blue-600',
    label: 'text-blue-700', chip: 'bg-blue-50 text-blue-700', vote: 'border-blue-600 text-blue-700', voted: 'bg-blue-600 text-white border-blue-600',
  },
  tony: {
    name: 'Tony', initials: 'TB', avatar: 'bg-orange-600 text-orange-950', rule: 'border-t-orange-600',
    label: 'text-orange-800', chip: 'bg-orange-50 text-orange-800', vote: 'border-orange-600 text-orange-800', voted: 'bg-orange-600 text-white border-orange-600',
  },
} as const;

/** One card per caller question: the question plus whichever hosts have answered. */
function groupCalls(messages: Msg[]): Call[] {
  const calls: Call[] = [];
  for (const m of messages) {
    if (m.role === 'user') { calls.push({ question: m.text }); continue; }
    if (calls.length === 0) calls.push({ question: '' });
    calls[calls.length - 1][m.role] = m;
  }
  return calls;
}

function Avatar({ host, size = 'md' }: { host: Host; size?: 'sm' | 'md' }) {
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

function TakeColumn({ host, msg, pending }: { host: Host; msg?: Msg; pending: boolean }) {
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
          <p className={host === 'tony' ? 'text-[15px] font-semibold leading-snug' : 'text-[13px] leading-relaxed text-[var(--text)]'}>{msg.text}</p>
        </>
      ) : pending ? (
        <div className="py-2"><TypingDots /></div>
      ) : (
        <p className="text-xs text-[var(--text-sec)] italic">Passed on this one.</p>
      )}
    </div>
  );
}

export function SpotlightCallIn({ fetchOpts, episode, weekKey }: Props) {
  const { user, hasFeature, loading: subLoading } = useSubscription();
  const { teams, players, userTeamId, freeAgents, tradeRumors, season, week, phase, champions, draftScoutingData } = useGameStore();
  const isPremium = hasFeature('ai_commentary');
  const signedIn = !!user;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [votes, setVotes] = useState<Record<number, Host>>({});
  const [turns, setTurns] = useState(0); // typed (LLM) turns only — chips are free
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
    try {
      const raw = sessionStorage.getItem(storageKey(weekKey));
      if (raw) {
        const saved = JSON.parse(raw) as { messages: Msg[]; turns: number; votes?: Record<number, Host> };
        setMessages(saved.messages ?? []);
        setTurns(saved.turns ?? 0);
        setVotes(saved.votes ?? {});
        return;
      }
    } catch { /* ignore */ }
    setMessages([]);
    setTurns(0);
    setVotes({});
  }, [weekKey]);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey(weekKey), JSON.stringify({ messages, turns, votes })); } catch { /* ignore */ }
  }, [messages, turns, votes, weekKey]);

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
    setError(null);
    setExpanded(null);
    setFollowUps(null);
    const seed = chipSeed + 1;
    setChipSeed(seed);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const replies = answerChip(id, teamData as any, seed * 7919 + messages.length);
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
      // Premium hosts know the whole league. Built per-turn because the
      // position slice depends on what was asked.
      const leagueScout = isPremium && userTeamId
        ? buildLeagueScoutPacket({ teams, players, userTeamId, freeAgentIds: freeAgents, tradeRumors: tradeRumors ?? [], season, week, phase, message: text, champions, draftScoutingData })
        : undefined;
      const res = await fetch('/api/spotlight-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamData, leagueScout, episode, history, message: text, turn: nextTurn }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      const replies = (json.replies ?? []) as { speaker: Host; text: string; verdict?: string }[];
      setMessages(m => [...m, ...replies.map(r => ({ role: r.speaker, text: r.text, verdict: r.verdict }))]);
      const fu = Array.isArray(json.followUps) && json.followUps.length ? (json.followUps as string[]) : fallbackFollowUps(text);
      setFollowUps(fu.slice(0, 3));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function pushBack(host: Host) {
    setInput(host === 'tony' ? "Tony, I'm not buying it. " : "Marcus, I'm not buying it. ");
    inputRef.current?.focus();
  }

  if (subLoading) return null;

  const freeLeft = Math.max(0, FREE_TURNS - turns);

  return (
    <>
      {/* Launcher — sits where the old accordion was */}
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="mt-3 w-full flex items-center gap-3 px-3 py-2.5 text-left border border-[var(--border)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
      >
        <span className="flex">
          <Avatar host="marcus" size="sm" />
          <span className="-ml-1.5"><Avatar host="tony" size="sm" /></span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold">Call in to the show</span>
          <span className="block text-xs text-[var(--text-sec)] truncate">Ask Marcus &amp; Tony anything. Get both takes.</span>
        </span>
        <span className="text-xs font-semibold text-blue-700 shrink-0">Open the booth</span>
      </button>

      {open && (
        <aside
          role="dialog"
          aria-label="The Booth: call in to the show"
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)] text-[var(--text)] md:left-auto md:w-[480px] md:border-l md:border-[var(--border)] md:shadow-[-8px_0_24px_rgba(18,26,43,0.08)]"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
            <span className="flex">
              <Avatar host="marcus" />
              <span className="-ml-2.5"><Avatar host="tony" /></span>
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
              onClick={() => setOpen(false)}
              aria-label="Close the booth"
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--bg-hover)]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Calls */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[var(--surface-2)]/40">
            {calls.length === 0 && (
              <div className="text-center py-10 px-6">
                <p className="text-sm font-semibold">You&apos;re on the air.</p>
                <p className="text-xs text-[var(--text-sec)] mt-1">
                  Marcus &amp; Tony know the {teamName}: your roster, your record, your moves. Ask anything and you&apos;ll get both takes.
                </p>
              </div>
            )}

            {calls.map((call, i) => {
              const isOpen = i === latest || expanded === i;
              if (!isOpen) {
                return (
                  <button
                    key={i}
                    onClick={() => setExpanded(i)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left hover:bg-[var(--bg-hover)]"
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
              const vote = votes[i];
              return (
                <article key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
                  {call.question && (
                    <div className="px-4 pt-3.5 pb-3 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-sec)]">You asked</div>
                        <h3 className="text-lg font-extrabold leading-tight mt-0.5">{call.question}</h3>
                      </div>
                      {i !== latest && (
                        <button onClick={() => setExpanded(null)} aria-label="Collapse" className="w-9 h-9 -mr-1.5 flex items-center justify-center rounded-lg text-[var(--text-sec)] hover:bg-[var(--bg-hover)]">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-[var(--border)] sm:divide-x divide-[var(--border)]">
                    <TakeColumn host="marcus" msg={call.marcus} pending={pending} />
                    <TakeColumn host="tony" msg={call.tony} pending={pending} />
                  </div>

                  {!pending && call.marcus && call.tony && (
                    <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--surface-2)]/40 flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold flex-1">
                        {vote ? <>You sided with <span className={HOST_META[vote].label}>{HOST_META[vote].name}</span></> : "Who's right?"}
                      </span>
                      {(['marcus', 'tony'] as const).map(h => (
                        <button
                          key={h}
                          onClick={() => setVotes(v => ({ ...v, [i]: h }))}
                          aria-pressed={vote === h}
                          className={`min-h-10 px-3 rounded-lg border text-[13px] font-semibold transition-colors ${vote === h ? HOST_META[h].voted : `bg-[var(--surface)] ${HOST_META[h].vote}`}`}
                        >
                          {HOST_META[h].name}
                        </button>
                      ))}
                    </div>
                  )}

                  {!pending && i === latest && canType && call.marcus && call.tony && (
                    <div className="px-4 py-2.5 border-t border-[var(--border)] flex gap-2 flex-wrap">
                      <button onClick={() => pushBack('tony')} className="min-h-10 px-3 rounded-lg bg-[var(--text)] text-[var(--surface)] text-[13px] font-semibold">Push back on Tony</button>
                      <button onClick={() => pushBack('marcus')} className="min-h-10 px-3 rounded-lg border border-[var(--border)] text-[13px] font-medium hover:bg-[var(--bg-hover)]">Push back on Marcus</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Ask */}
          <div className="border-t border-[var(--border)] px-4 pt-3 pb-4 space-y-2.5 bg-[var(--surface)]">
            {followUps && canType ? (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-sec)] mr-0.5">Keep going</span>
                {followUps.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={busy}
                    className="min-h-9 text-xs px-3 rounded-full border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-40 transition-colors"
                  >
                    {q}
                  </button>
                ))}
                <button onClick={() => setFollowUps(null)} className="min-h-9 text-xs px-3 rounded-full text-[var(--text-sec)] hover:bg-[var(--bg-hover)]">
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
                    className="min-h-9 text-xs px-3 rounded-full border border-[var(--border)] bg-[var(--surface-2)]/50 hover:bg-blue-50 hover:border-blue-200 disabled:opacity-40 transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
                {CALL_IN_CHIPS.length > VISIBLE_CHIPS && (
                  <button onClick={() => setShowAllChips(s => !s)} className="min-h-9 text-xs px-3 rounded-full text-blue-700 font-semibold hover:bg-blue-50">
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
                  Open mic with Premium — $4.99/mo
                </Link>
              </div>
            ) : (
              <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-center gap-2">
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
      )}
    </>
  );
}

export default SpotlightCallIn;
