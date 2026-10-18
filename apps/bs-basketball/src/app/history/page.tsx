'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import {
  getSeasonHistory,
  getSeasonDrillDown,
  getFranchiseRecords,
  getLeagueRecords,
  STAT_LABELS,
  type SeasonHistoryEntry,
  type SeasonDrillDown,
  type SeasonLine,
  type CareerLeaderRow,
} from '@/lib/history';
import type { AllLeagueTeam } from '@/lib/awards';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

/**
 * /history — league record book: season timeline with a per-season drill-down
 * (champion, Finals, best record, awards, leaders, All-League teams, retirees),
 * franchise records for any team, and league-wide records.
 */

type Tab = 'seasons' | 'franchise' | 'league';
type League = NonNullable<ReturnType<typeof useLeagueOrHydrate>['league']>;

const ROUND_LABEL: Record<number, string> = {
  0: 'Missed playoffs', 1: 'First Round', 2: 'Conf. Semis', 3: 'Conf. Finals', 4: 'Finals',
};

export default function HistoryPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [tab, setTab] = useState<Tab>('seasons');

  const history = useMemo<SeasonHistoryEntry[]>(() => (league ? getSeasonHistory(league) : []), [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-4 mt-2 mb-6">
        <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>League History</h1>
        <p className="text-sm text-[var(--text-sec)]">
          Season {league.currentSeason} · {history.length} season{history.length === 1 ? '' : 's'} in the books
        </p>
      </header>

      {history.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="📚" title="The record book is blank — for now" message="Run a season to its end, crown a champion, and the banners start going up here." />
        </div>
      ) : (
        <>
          <div className="mb-5 inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
            {([['seasons', 'Seasons'], ['franchise', 'Franchise Records'], ['league', 'League Records']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5" style={tab === k ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'seasons' && <SeasonsTab league={league} history={history} />}
          {tab === 'franchise' && <FranchiseTab league={league} />}
          {tab === 'league' && <LeagueTab league={league} />}
        </>
      )}
    </main>
  );
}

// ===========================================================================
// Shared bits
// ===========================================================================

function useTeams(league: League) {
  return useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <h2 className="font-bold text-sm">{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function TeamChip({ team, full = false }: { team: BasketballTeam | undefined; full?: boolean }) {
  if (!team) return <span className="text-[var(--text-sec)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
      <span className="font-semibold truncate">{full ? `${team.city} ${team.name}` : team.abbreviation}</span>
    </span>
  );
}

/** Player link that opens the shared card when the player still exists;
 *  retired players render as plain text. */
function Who({ league, id, name, className }: { league: League; id: string; name: string; className?: string }) {
  const exists = !!(league.players as Record<string, unknown>)[id];
  return <PlayerName playerId={exists ? id : null} className={`font-semibold ${className ?? ''}`}>{name}</PlayerName>;
}

const Row = ({ children }: { children: ReactNode }) => (
  <li className="flex items-center gap-2 px-3 py-1.5 text-sm border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>{children}</li>
);

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="p-3 text-xs text-[var(--text-sec)]">{children}</p>
);

// ===========================================================================
// Seasons tab — timeline + drill-down
// ===========================================================================

function SeasonsTab({ league, history }: { league: League; history: SeasonHistoryEntry[] }) {
  const teams = useTeams(league);
  const [selected, setSelected] = useState<number>(history[0].season);
  const drill = useMemo(() => getSeasonDrillDown(league, selected), [league, selected]);
  const userTeamId = league.userTeamId ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
      <div className="relative">
        <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-[var(--border)]" />
        <div className="space-y-2">
          {history.map(h => {
            const active = h.season === selected;
            const champ = h.champion ? teams.get(h.champion) : undefined;
            const userRec = userTeamId ? h.teamRecords?.find(r => r.teamId === userTeamId) : undefined;
            const userChamp = !!userTeamId && h.champion === userTeamId;
            return (
              <div key={h.season} className="flex items-start gap-3">
                <div className="relative z-10 pt-4 shrink-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-sm"
                    style={{ background: userChamp ? '#f59e0b' : active ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    {userChamp ? '🏆' : ''}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(h.season)}
                  className="flex-1 min-w-0 text-left rounded-xl border p-3 transition-colors bg-[var(--surface)]"
                  style={{ borderColor: active ? 'var(--accent)' : 'var(--border)', boxShadow: active ? 'inset 3px 0 0 var(--accent)' : undefined }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold">{h.season}</span>
                    {userRec && (
                      <span className="text-xs tabular-nums text-[var(--text-sec)]">You: {userRec.wins}-{userRec.losses}</span>
                    )}
                  </div>
                  <div className="text-xs flex items-center gap-1 text-[var(--text-sec)]">
                    <TeamChip team={champ} /> <span>won it all</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {drill ? <SeasonDetail league={league} d={drill} /> : <Empty>Season not found.</Empty>}
    </div>
  );
}

function SeasonDetail({ league, d }: { league: League; d: SeasonDrillDown }) {
  const teams = useTeams(league);
  const champ = d.champion ? teams.get(d.champion) : undefined;
  const runner = d.runnerUp ? teams.get(d.runnerUp) : undefined;

  return (
    <div className="space-y-4 min-w-0">
      {/* Champion banner */}
      <div className="rounded-xl border p-4 flex flex-wrap items-center gap-4 bg-[var(--surface)]"
        style={{ borderColor: 'var(--border)', boxShadow: champ ? `inset 4px 0 0 ${champ.primaryColor}` : undefined }}>
        {champ && <TeamLogo abbreviation={champ.abbreviation} primaryColor={champ.primaryColor} secondaryColor={champ.secondaryColor} size="lg" />}
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">{d.season} Champions</div>
          <div className="text-2xl font-extrabold truncate">{champ ? `${champ.city} ${champ.name}` : '—'}</div>
          {runner && (
            <div className="text-sm text-[var(--text-sec)]">
              Def. {runner.city} {runner.name}
              {d.finals && <span className="font-semibold tabular-nums"> {d.finals.championWins}–{d.finals.runnerUpWins}</span>} in the Finals
            </div>
          )}
        </div>
        {d.bestRecord && (
          <div className="ml-auto text-right">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">Best record</div>
            <div className="flex items-center justify-end gap-2 text-sm">
              <TeamChip team={teams.get(d.bestRecord.teamId)} />
              <span className="tabular-nums font-bold">{d.bestRecord.wins}-{d.bestRecord.losses}</span>
            </div>
            {(['Eastern', 'Western'] as const).map(c => {
              const r = d.bestByConference[c];
              return r ? (
                <div key={c} className="text-xs text-[var(--text-sec)] tabular-nums">
                  {c[0]}: {teams.get(r.teamId)?.abbreviation} {r.wins}-{r.losses}
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>

      {!d.extended && (
        <p className="text-xs text-[var(--text-sec)] px-1">
          This season was archived before the full record book existed — only the champion, MVP and Finals MVP were saved.
          Stat leaders come from players still in the league.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Section title="Awards">
          {d.awards.length === 0 ? <Empty>No awards recorded.</Empty> : (
            <ul>
              {d.awards.map(a => (
                <li key={a.key} className="px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs text-[var(--text-sec)]">{a.label}</div>
                  <div className="flex items-center gap-2">
                    {a.key === 'coy'
                      ? <span className="font-semibold">{a.winner.name}</span>
                      : <Who league={league} id={a.winner.id} name={a.winner.name} />}
                    {a.winner.teamId && <TeamChip team={teams.get(a.winner.teamId)} />}
                    <span className="ml-auto text-xs tabular-nums text-[var(--text-sec)]">{a.winner.statline}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Stat Leaders (per game)">
          {d.leaders.length === 0 ? <Empty>No stat lines archived.</Empty> : (
            <ul>
              {d.leaders.map(l => (
                <Row key={l.category}>
                  <span className="w-20 shrink-0 text-xs text-[var(--text-sec)]">{STAT_LABELS[l.category]}</span>
                  <Who league={league} id={l.playerId} name={l.name} className="truncate" />
                  {l.teamId && <TeamChip team={teams.get(l.teamId)} />}
                  <span className="ml-auto font-bold tabular-nums">{l.value.toFixed(1)}</span>
                </Row>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {(d.allLeague.length > 0 || d.allDefensive.length > 0 || d.allRookie.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...d.allLeague, ...d.allDefensive, ...d.allRookie].map(t => (
            <HonorTeam key={t.name} league={league} team={t} />
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {d.standings.length > 0 && (
          <Section title="Final Standings">
            <ol className="max-h-80 overflow-y-auto">
              {d.standings.map((r, i) => (
                <li key={r.teamId} className="flex items-center gap-2 px-3 py-1 text-sm border-t first:border-t-0"
                  style={{ borderColor: 'var(--border)', background: r.teamId === league.userTeamId ? 'var(--surface-2)' : undefined }}>
                  <span className="w-5 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                  <TeamChip team={teams.get(r.teamId)} full />
                  <span className="ml-auto tabular-nums font-semibold">{r.wins}-{r.losses}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}
        {d.extended && (
          <Section title={`Retired after ${d.season}`}>
            {d.retired.length === 0 ? <Empty>No retirements.</Empty> : (
              <ul className="max-h-80 overflow-y-auto">
                {d.retired.map(r => (
                  <Row key={r.id}>
                    <span className="w-7 shrink-0 text-xs font-mono text-[var(--text-sec)]">{r.pos}</span>
                    <span className="font-semibold truncate">{r.name}</span>
                    {r.teamId && <TeamChip team={teams.get(r.teamId)} />}
                    <span className="ml-auto text-xs tabular-nums text-[var(--text-sec)]">
                      age {r.age} · {Math.round(r.pts).toLocaleString()} career pts
                    </span>
                  </Row>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function HonorTeam({ league, team }: { league: League; team: AllLeagueTeam }) {
  const teams = useTeams(league);
  return (
    <Section title={team.name}>
      <ul>
        {team.players.map(p => (
          <Row key={p.playerId}>
            <span className="w-7 shrink-0 text-xs font-mono text-[var(--text-sec)]">{p.position}</span>
            <Who league={league} id={p.playerId} name={p.name} className="truncate" />
            {p.teamId && <TeamChip team={teams.get(p.teamId)} />}
            <span className="ml-auto text-xs tabular-nums text-[var(--text-sec)]">{p.statline}</span>
          </Row>
        ))}
      </ul>
    </Section>
  );
}

// ===========================================================================
// Franchise tab
// ===========================================================================

function FranchiseTab({ league }: { league: League }) {
  const teams = useTeams(league);
  const sortedTeams = useMemo(
    () => [...league.teams].sort((a, b) => `${a.city} ${a.name}`.localeCompare(`${b.city} ${b.name}`)),
    [league],
  );
  const [teamId, setTeamId] = useState<string>(league.userTeamId ?? sortedTeams[0]?.id ?? '');
  const f = useMemo(() => getFranchiseRecords(league, teamId as TeamId), [league, teamId]);
  const team = teams.get(teamId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />}
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm font-semibold bg-[var(--surface)]"
          style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
        >
          {sortedTeams.map(t => (
            <option key={t.id} value={t.id}>{t.city} {t.name}{t.id === league.userTeamId ? ' (you)' : ''}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Titles" value={f.titles.length} sub={f.titles.join(', ')} />
        <Stat label="Finals trips" value={f.finalsAppearances.length} sub={f.finalsAppearances.join(', ')} />
        <Stat label="Playoff seasons" value={f.playoffAppearances.length} />
        <Stat
          label="Best season"
          value={f.bestSeason ? `${f.bestSeason.wins}-${f.bestSeason.losses}` : '—'}
          sub={f.bestSeason ? `${f.bestSeason.season}${f.worstSeason ? ` · worst ${f.worstSeason.wins}-${f.worstSeason.losses} (${f.worstSeason.season})` : ''}` : undefined}
        />
      </div>

      {f.seasonsWithoutSplits.length > 0 && (
        <p className="text-xs text-[var(--text-sec)]">
          Franchise stat totals skip {f.seasonsWithoutSplits.join(', ')} — those seasons were archived before per-team stat lines were saved.
          A player&apos;s full season counts for the team he finished it with.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <LeaderList league={league} title="Franchise points" rows={f.careerLeaders.points} />
        <LeaderList league={league} title="Franchise rebounds" rows={f.careerLeaders.rebounds} />
        <LeaderList league={league} title="Franchise assists" rows={f.careerLeaders.assists} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <SeasonList league={league} title="Best scoring seasons" rows={f.bestSeasons.ppg} cat="ppg" />
        <SeasonList league={league} title="Best rebounding seasons" rows={f.bestSeasons.rpg} cat="rpg" />
        <SeasonList league={league} title="Best playmaking seasons" rows={f.bestSeasons.apg} cat="apg" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Season by season">
          {f.seasons.length === 0 ? <Empty>No archived team records yet.</Empty> : (
            <ul>
              {f.seasons.map(s => (
                <Row key={s.season}>
                  <span className="w-12 font-bold tabular-nums">{s.season}</span>
                  <span className="tabular-nums font-semibold">{s.wins}-{s.losses}</span>
                  <span className="ml-auto">
                    {s.champion
                      ? <Badge variant="amber">Champion</Badge>
                      : <Badge variant={s.playoffRound > 0 ? 'green' : 'default'}>{ROUND_LABEL[s.playoffRound] ?? '—'}</Badge>}
                  </span>
                </Row>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Award winners">
          {f.awardsWon.length === 0 ? <Empty>No major awards yet.</Empty> : (
            <ul>
              {f.awardsWon.map(a => (
                <Row key={`${a.season}-${a.key}`}>
                  <span className="w-12 font-bold tabular-nums">{a.season}</span>
                  <span className="text-xs text-[var(--text-sec)] truncate">{a.label}</span>
                  <span className="ml-auto">
                    {a.key === 'coy' ? <span className="font-semibold">{a.name}</span> : <Who league={league} id={a.id} name={a.name} />}
                  </span>
                </Row>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border p-3 bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-sec)]">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-[var(--text-sec)] truncate">{sub}</div>}
    </div>
  );
}

function LeaderList({ league, title, rows }: { league: League; title: string; rows: CareerLeaderRow[] }) {
  return (
    <Section title={title}>
      {rows.length === 0 ? <Empty>Totals accrue after each completed season.</Empty> : (
        <ol>
          {rows.map((r, i) => (
            <Row key={r.playerId}>
              <span className="w-5 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
              <Who league={league} id={r.playerId} name={r.name} className="truncate" />
              <span className="ml-auto tabular-nums font-bold">{Math.round(r.value).toLocaleString()}</span>
              <span className="w-12 text-right text-xs tabular-nums text-[var(--text-sec)]">{r.gp} G</span>
            </Row>
          ))}
        </ol>
      )}
    </Section>
  );
}

function SeasonList({ league, title, rows, cat }: { league: League; title: string; rows: SeasonLine[]; cat: 'ppg' | 'rpg' | 'apg' }) {
  return (
    <Section title={title}>
      {rows.length === 0 ? <Empty>No qualifying seasons yet.</Empty> : (
        <ol>
          {rows.map(r => (
            <Row key={`${r.season}-${r.playerId}`}>
              <span className="w-10 text-xs tabular-nums text-[var(--text-sec)]">{r.season}</span>
              <Who league={league} id={r.playerId} name={r.name} className="truncate" />
              <span className="ml-auto tabular-nums font-bold">{r[cat].toFixed(1)}</span>
            </Row>
          ))}
        </ol>
      )}
    </Section>
  );
}

// ===========================================================================
// League records tab
// ===========================================================================

function LeagueTab({ league }: { league: League }) {
  const teams = useTeams(league);
  const r = useMemo(() => getLeagueRecords(league), [league]);
  const singles: { label: string; line: SeasonLine | null; cat: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg'; unit: string }[] = [
    { label: 'Points per game', line: r.singleSeason.ppg, cat: 'ppg', unit: 'PPG' },
    { label: 'Rebounds per game', line: r.singleSeason.rpg, cat: 'rpg', unit: 'RPG' },
    { label: 'Assists per game', line: r.singleSeason.apg, cat: 'apg', unit: 'APG' },
    { label: 'Steals per game', line: r.singleSeason.spg, cat: 'spg', unit: 'SPG' },
    { label: 'Blocks per game', line: r.singleSeason.bpg, cat: 'bpg', unit: 'BPG' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Single-season records">
          <ul>
            {singles.map(s => (
              <li key={s.cat} className="px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs text-[var(--text-sec)]">{s.label}</div>
                {s.line && s.line[s.cat] != null ? (
                  <div className="flex items-center gap-2">
                    <Who league={league} id={s.line.playerId} name={s.line.name} className="truncate" />
                    {s.line.teamId && <TeamChip team={teams.get(s.line.teamId)} />}
                    <span className="text-xs text-[var(--text-sec)]">{s.line.season}</span>
                    <span className="ml-auto font-bold tabular-nums">{(s.line[s.cat] as number).toFixed(1)} {s.unit}</span>
                  </div>
                ) : <div className="text-[var(--text-sec)]">—</div>}
              </li>
            ))}
            <li className="px-3 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="text-xs text-[var(--text-sec)]">Best team record</div>
              {r.bestTeamSeason ? (
                <div className="flex items-center gap-2">
                  <TeamChip team={teams.get(r.bestTeamSeason.teamId)} full />
                  <span className="text-xs text-[var(--text-sec)]">{r.bestTeamSeason.season}</span>
                  <span className="ml-auto font-bold tabular-nums">{r.bestTeamSeason.wins}-{r.bestTeamSeason.losses}</span>
                </div>
              ) : <div className="text-[var(--text-sec)]">—</div>}
            </li>
            <li className="px-3 py-2 border-t text-sm" style={{ borderColor: 'var(--border)' }}>
              <div className="text-xs text-[var(--text-sec)]">Worst team record</div>
              {r.worstTeamSeason ? (
                <div className="flex items-center gap-2">
                  <TeamChip team={teams.get(r.worstTeamSeason.teamId)} full />
                  <span className="text-xs text-[var(--text-sec)]">{r.worstTeamSeason.season}</span>
                  <span className="ml-auto font-bold tabular-nums">{r.worstTeamSeason.wins}-{r.worstTeamSeason.losses}</span>
                </div>
              ) : <div className="text-[var(--text-sec)]">—</div>}
            </li>
          </ul>
        </Section>

        <div className="space-y-4">
          <Section title="Most titles">
            {r.mostTitles.length === 0 ? <Empty>No champions yet.</Empty> : (
              <ul>
                {r.mostTitles.map(t => (
                  <Row key={t.teamId}>
                    <TeamChip team={teams.get(t.teamId)} full />
                    <span className="text-xs text-[var(--text-sec)] truncate">{t.seasons.join(', ')}</span>
                    <span className="ml-auto font-bold tabular-nums">{t.titles}×</span>
                  </Row>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Most MVPs">
            {r.mostMvps.length === 0 ? <Empty>No MVPs yet.</Empty> : (
              <ul>
                {r.mostMvps.map(m => (
                  <Row key={m.playerId}>
                    <Who league={league} id={m.playerId} name={m.name} className="truncate" />
                    <span className="ml-auto font-bold tabular-nums">{m.count}×</span>
                  </Row>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <LeaderList league={league} title="Career points" rows={r.careerPoints} />
        <LeaderList league={league} title="Career rebounds (active)" rows={r.careerRebounds} />
        <LeaderList league={league} title="Career assists (active)" rows={r.careerAssists} />
      </div>
    </div>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
