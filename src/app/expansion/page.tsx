'use client';

import React, { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EXPANSION_CITIES } from '@/lib/data/teams';
import { computeProtectionLimit } from '@/lib/engine/expansionDraft';
import type { ExpansionTeamConfig, Position } from '@/types';

const CONFERENCES = ['AC', 'NC'] as const;
const DIVISIONS = ['North', 'South', 'East', 'West'] as const;

export default function ExpansionPage() {
  const {
    teams, players, season, phase, userTeamId,
    expansionDraft, createExpansionTeam, protectPlayers,
    runExpansionDraftAction, cancelExpansionDraft,
  } = useGameStore();

  const [step, setStep] = useState<'create' | 'protect' | 'draft' | 'results'>(
    expansionDraft?.phase === 'complete' ? 'results' :
    expansionDraft?.phase === 'drafting' ? 'draft' :
    expansionDraft?.phase === 'protection' ? 'protect' : 'create'
  );

  // Team creation form state
  const [city, setCity] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [teamName, setTeamName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [conference, setConference] = useState<'AC' | 'NC'>('AC');
  const [division, setDivision] = useState<'North' | 'South' | 'East' | 'West'>('North');
  const [primaryColor, setPrimaryColor] = useState('#1e40af');
  const [secondaryColor, setSecondaryColor] = useState('#f59e0b');

  // Protection state
  const [protectedIds, setProtectedIds] = useState<Set<string>>(new Set());

  const isOffseason = ['resigning', 'freeAgency', 'offseason', 'draft'].includes(phase);
  if (!isOffseason && !expansionDraft) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-5xl mb-4">🏗️</div>
          <h2 className="text-2xl font-black mb-3">Expansion Draft</h2>
          <p className="text-[var(--text-sec)]">
            Expansion is only available during the offseason (re-signing, free agency, draft, or offseason phases).
          </p>
        </div>
      </GameShell>
    );
  }

  const effectiveCity = city === '__custom__' ? customCity : city;

  function handleSelectCity(c: typeof EXPANSION_CITIES[number]) {
    setCity(c.city);
    setTeamName(c.suggestedName);
    setAbbreviation(c.suggestedAbbr);
  }

  function handleCreateTeam() {
    if (!effectiveCity || !teamName || !abbreviation) return;
    const config: ExpansionTeamConfig = {
      city: effectiveCity,
      name: teamName,
      abbreviation: abbreviation.toUpperCase(),
      conference,
      division,
      primaryColor,
      secondaryColor,
    };
    createExpansionTeam(config);
    setStep('protect');
  }

  function handleConfirmProtections() {
    protectPlayers(userTeamId!, Array.from(protectedIds));
    setStep('draft');
  }

  function handleRunDraft() {
    runExpansionDraftAction();
    setStep('results');
  }

  function toggleProtection(playerId: string) {
    setProtectedIds(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  // Roster for protection step
  const userRoster = players
    .filter(p => p.teamId === userTeamId && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const protectionLimit = computeProtectionLimit(userRoster.length);

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black">Expansion Draft</h2>
            <p className="text-sm text-[var(--text-sec)]">Season {season}</p>
          </div>
          {expansionDraft && expansionDraft.phase !== 'complete' && (
            <Button variant="ghost" onClick={() => { cancelExpansionDraft(); setStep('create'); }}>
              Cancel Expansion
            </Button>
          )}
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          {(['create', 'protect', 'draft', 'results'] as const).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-[var(--text-sec)]">→</span>}
              <span className={`px-3 py-1 rounded-full font-medium ${
                step === s ? 'bg-blue-600 text-white' : 'bg-[var(--surface-2)] text-[var(--text-sec)]'
              }`}>
                {s === 'create' ? '1. Create Team' : s === 'protect' ? '2. Protect' : s === 'draft' ? '3. Draft' : '4. Results'}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Create Team */}
        {step === 'create' && (
          <Card>
            <CardHeader><CardTitle>Create Expansion Team</CardTitle></CardHeader>
            <div className="space-y-6 p-1">
              {/* City picker */}
              <div>
                <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-2">City</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {EXPANSION_CITIES.map(c => (
                    <button
                      key={c.city}
                      onClick={() => handleSelectCity(c)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        city === c.city
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)] hover:border-blue-400'
                      }`}
                    >
                      {c.city}
                    </button>
                  ))}
                  <button
                    onClick={() => { setCity('__custom__'); setTeamName(''); setAbbreviation(''); }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      city === '__custom__'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)] hover:border-blue-400'
                    }`}
                  >
                    Custom...
                  </button>
                </div>
                {city === '__custom__' && (
                  <input
                    type="text"
                    placeholder="Enter city name"
                    value={customCity}
                    onChange={e => setCustomCity(e.target.value)}
                    className="w-full max-w-xs px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
              </div>

              {/* Team name + abbreviation */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Team Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Pioneers"
                    value={teamName}
                    onChange={e => setTeamName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Abbreviation</label>
                  <input
                    type="text"
                    placeholder="e.g. POR"
                    value={abbreviation}
                    onChange={e => setAbbreviation(e.target.value.toUpperCase().slice(0, 4))}
                    maxLength={4}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Conference + Division */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Conference</label>
                  <div className="flex gap-2">
                    {CONFERENCES.map(c => (
                      <button
                        key={c}
                        onClick={() => setConference(c)}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                          conference === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Division</label>
                  <div className="flex gap-2">
                    {DIVISIONS.map(d => (
                      <button
                        key={d}
                        onClick={() => setDivision(d)}
                        className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                          division === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-[var(--surface)] text-[var(--text-sec)] border-[var(--border)] hover:text-[var(--text)]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded border border-[var(--border)] cursor-pointer"
                    />
                    <span className="text-sm font-mono text-[var(--text-sec)]">{primaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider block mb-1">Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={e => setSecondaryColor(e.target.value)}
                      className="w-10 h-10 rounded border border-[var(--border)] cursor-pointer"
                    />
                    <span className="text-sm font-mono text-[var(--text-sec)]">{secondaryColor}</span>
                  </div>
                </div>
              </div>

              {/* Preview */}
              {effectiveCity && teamName && (
                <Card>
                  <div className="flex items-center gap-4 p-4">
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-xl font-black"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
                    >
                      {abbreviation || '???'}
                    </div>
                    <div>
                      <div className="text-lg font-black">{effectiveCity} {teamName}</div>
                      <div className="text-sm text-[var(--text-sec)]">{conference} {division} · {abbreviation || '???'}</div>
                    </div>
                  </div>
                </Card>
              )}

              <Button
                onClick={handleCreateTeam}
                disabled={!effectiveCity || !teamName || !abbreviation}
              >
                Create Team
              </Button>
            </div>
          </Card>
        )}

        {/* Step 2: Protect Players */}
        {step === 'protect' && (
          <Card>
            <CardHeader>
              <CardTitle>Protect Your Players</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-sec)]">
                Select up to <span className="font-bold text-[var(--text)]">{protectionLimit}</span> players to protect from the expansion draft.
                Unprotected players can be selected by the expansion team.
              </p>
              <div className="text-sm font-medium">
                Protected: <span className={protectedIds.size >= protectionLimit ? 'text-red-600' : 'text-blue-600'}>{protectedIds.size}</span> / {protectionLimit}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                      <th className="text-left pb-2 w-10"></th>
                      <th className="text-left pb-2">Player</th>
                      <th className="text-center pb-2">Pos</th>
                      <th className="text-center pb-2">Age</th>
                      <th className="text-center pb-2">OVR</th>
                      <th className="text-right pb-2">Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRoster.map(p => {
                      const isProtected = protectedIds.has(p.id);
                      const atLimit = protectedIds.size >= protectionLimit;
                      return (
                        <tr key={p.id} className={`border-t border-[var(--border)] ${isProtected ? 'bg-green-50' : ''}`}>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={isProtected}
                              disabled={!isProtected && atLimit}
                              onChange={() => toggleProtection(p.id)}
                              className="w-4 h-4 rounded border-[var(--border)] text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-2 font-medium">{p.firstName} {p.lastName}</td>
                          <td className="py-2 text-center">{p.position}</td>
                          <td className="py-2 text-center">{p.age}</td>
                          <td className={`py-2 text-center font-bold ${
                            p.ratings.overall >= 75 ? 'text-green-600' :
                            p.ratings.overall >= 60 ? 'text-blue-600' :
                            p.ratings.overall >= 45 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {p.ratings.overall}
                          </td>
                          <td className="py-2 text-right font-mono">${p.contract.salary}M</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Button onClick={handleConfirmProtections}>
                Confirm Protections ({protectedIds.size}/{protectionLimit})
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3: Run Draft */}
        {step === 'draft' && (
          <Card>
            <CardHeader><CardTitle>Run Expansion Draft</CardTitle></CardHeader>
            <div className="text-center py-8 space-y-4">
              <div className="text-5xl">🏗️</div>
              <p className="text-[var(--text-sec)]">
                All protections are locked in. The expansion team will now draft players from unprotected rosters.
              </p>
              <Button onClick={handleRunDraft}>
                Run Expansion Draft
              </Button>
            </div>
          </Card>
        )}

        {/* Step 4: Results */}
        {step === 'results' && expansionDraft && (
          <Card>
            <CardHeader><CardTitle>Expansion Draft Results</CardTitle></CardHeader>
            <div className="space-y-4">
              {expansionDraft.expansionTeamIds.map(expTeamId => {
                const expTeam = teams.find(t => t.id === expTeamId);
                const teamPicks = expansionDraft.picks.filter(pk => pk.expansionTeamId === expTeamId);
                return (
                  <div key={expTeamId}>
                    <h3 className="text-lg font-bold mb-2">
                      {expTeam ? `${expTeam.city} ${expTeam.name}` : 'Expansion Team'}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                            <th className="text-left pb-2">Pick</th>
                            <th className="text-left pb-2">From</th>
                            <th className="text-left pb-2">Player</th>
                            <th className="text-center pb-2">Pos</th>
                            <th className="text-center pb-2">OVR</th>
                            <th className="text-right pb-2">Salary</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamPicks.map((pk, idx) => {
                            const player = players.find(p => p.id === pk.playerId);
                            const fromTeam = teams.find(t => t.id === pk.fromTeamId);
                            return (
                              <tr key={pk.playerId} className="border-t border-[var(--border)]">
                                <td className="py-2 font-mono text-[var(--text-sec)]">#{idx + 1}</td>
                                <td className="py-2 text-[var(--text-sec)]">{fromTeam?.abbreviation ?? '???'}</td>
                                <td className="py-2 font-medium">{player ? `${player.firstName} ${player.lastName}` : 'Unknown'}</td>
                                <td className="py-2 text-center">{player?.position ?? '-'}</td>
                                <td className={`py-2 text-center font-bold ${
                                  (player?.ratings.overall ?? 0) >= 80 ? 'text-green-600' :
                                  (player?.ratings.overall ?? 0) >= 65 ? 'text-blue-600' :
                                  (player?.ratings.overall ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {player?.ratings.overall ?? '-'}
                                </td>
                                <td className="py-2 text-right font-mono">${player?.contract.salary ?? 0}M</td>
                              </tr>
                            );
                          })}
                          {teamPicks.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-4 text-center text-[var(--text-sec)]">No picks made.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => { cancelExpansionDraft(); window.location.href = '/'; }}>
                  Continue to Season
                </Button>
                {expansionDraft.expansionTeamIds.map(expId => {
                  const expTeam = teams.find(t => t.id === expId);
                  return (
                    <button
                      key={expId}
                      onClick={() => {
                        useGameStore.setState({ userTeamId: expId });
                        cancelExpansionDraft();
                        window.location.href = '/';
                      }}
                      className="text-sm font-medium text-blue-600 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-50 transition-colors"
                    >
                      Play as {expTeam?.city} {expTeam?.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    </GameShell>
  );
}
