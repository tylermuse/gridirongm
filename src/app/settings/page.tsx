'use client';

import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LEAGUE_SETTINGS, type LeagueSettings } from '@/types';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SettingRowProps {
  label: string;
  description: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  formatValue?: (val: number) => string;
}

function ToggleRow({
  label, description, value, onChange, disabled, activeColor = 'bg-blue-500',
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  activeColor?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-[var(--text-sec)] mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          value ? activeColor : 'bg-gray-300'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function SettingRow({ label, description, value, onChange, min, max, step, unit, formatValue }: SettingRowProps) {
  const display = formatValue ? formatValue(value) : `${value}${unit ?? ''}`;
  return (
    <div className="flex items-center gap-4 py-3 border-t border-[var(--border)] first:border-t-0">
      <div className="flex-1">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-[var(--text-sec)]">{description}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-32 accent-blue-500"
        />
        <span className="text-sm font-mono w-20 text-right">{display}</span>
      </div>
    </div>
  );
}

function AccountCard() {
  const { user, signOut } = useSubscription();
  const initialName = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const [displayName, setDisplayName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName((user?.user_metadata?.display_name as string | undefined) ?? '');
  }, [user]);

  const trimmed = displayName.trim();
  const isValid = trimmed.length >= 3 && trimmed.length <= 30;
  const currentSaved = (user?.user_metadata?.display_name as string | undefined) ?? '';
  const isDirty = trimmed !== currentSaved;

  async function handleSaveName() {
    if (!isValid || savingName) return;
    setSavingName(true);
    setNameStatus('idle');
    setNameError(null);
    try {
      const supabase = createClient();
      if (!supabase) throw new Error('Supabase not available');
      const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (error) throw error;
      // Best-effort backfill of the leaderboard row so the change is visible immediately.
      // If the user has no synced seasons yet, the endpoint just no-ops.
      try {
        await fetch('/api/gm/display-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: trimmed }),
        });
      } catch { /* ignore — auth metadata still updated, next sync will pick it up */ }
      setNameStatus('saved');
      setTimeout(() => setNameStatus('idle'), 2000);
    } catch (err) {
      setNameStatus('error');
      setNameError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingName(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle>Account</CardTitle></CardHeader>
      {user ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                {(trimmed || user.email || '?')[0]?.toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium">{user.email}</div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={signOut}>Sign Out</Button>
          </div>
          <div className="border-t border-[var(--border)] pt-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] mb-1">
              Display Name
            </label>
            <p className="text-[11px] text-[var(--text-sec)] mb-2">
              Shown on the GM Rankings leaderboard. 3-30 characters.
            </p>
            <div className="flex gap-2 items-start">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={30}
                placeholder={user.email?.split('@')[0] ?? 'GM'}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] outline-none focus:border-blue-500"
              />
              <Button size="sm" onClick={handleSaveName} disabled={!isValid || !isDirty || savingName}>
                {savingName ? 'Saving…' : nameStatus === 'saved' ? '✓ Saved' : 'Save'}
              </Button>
            </div>
            {trimmed.length > 0 && !isValid && (
              <p className="text-[11px] text-red-600 mt-1">Must be 3-30 characters.</p>
            )}
            {nameStatus === 'error' && nameError && (
              <p className="text-[11px] text-red-600 mt-1">{nameError}</p>
            )}
            {nameStatus === 'saved' && (
              <p className="text-[11px] text-[var(--text-sec)] mt-1">
                Updated. Your leaderboard entry will refresh after the next stat sync (end of game / end of season).
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--text-sec)]">
            Sign in to save your progress across devices.
          </div>
          <Link href="/login"><Button size="sm">Sign In</Button></Link>
        </div>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { leagueSettings, updateLeagueSettings, teams, userTeamId, switchTeam } = useGameStore();
  const router = useRouter();
  const settings = leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;

  const [draft, setDraft] = useState<LeagueSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  // Sync when store changes externally
  useEffect(() => {
    setDraft({ ...settings });
  }, [settings]);

  // Auto-save whenever draft changes (debounced)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const timer = setTimeout(() => {
      if (JSON.stringify(draft) !== JSON.stringify(settings)) {
        updateLeagueSettings(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function handleSave() {
    updateLeagueSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setDraft({ ...DEFAULT_LEAGUE_SETTINGS });
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const userTeam = teams.find(t => t.id === userTeamId);

  return (
    <GameShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black">League Settings</h2>
            <p className="text-sm text-[var(--text-sec)]">
              Customize game mechanics. Changes take effect immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleReset} disabled={!isDirty && JSON.stringify(draft) === JSON.stringify(DEFAULT_LEAGUE_SETTINGS)}>
              Reset Defaults
            </Button>
            <Button onClick={handleSave} disabled={!isDirty}>
              {saved ? '✓ Saved' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Account */}
        <AccountCard />

        {/* Finance Settings */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Finances</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Salary Cap"
              description="Starting salary cap for all teams"
              value={draft.salaryCap}
              onChange={v => setDraft(d => ({ ...d, salaryCap: v }))}
              min={150}
              max={500}
              step={5}
              formatValue={v => `$${v}M`}
            />
            <SettingRow
              label="Cap Growth Rate"
              description="Annual % increase to the salary cap each new season"
              value={draft.capGrowthRate}
              onChange={v => setDraft(d => ({ ...d, capGrowthRate: v }))}
              min={0}
              max={15}
              step={0.5}
              unit="%"
            />
            <SettingRow
              label="Luxury Tax Rate"
              description="Penalty multiplier for each $1M over the cap"
              value={draft.luxuryTaxRate}
              onChange={v => setDraft(d => ({ ...d, luxuryTaxRate: v }))}
              min={0}
              max={5}
              step={0.25}
              formatValue={v => `${v}x`}
            />
            <SettingRow
              label="League Minimum Salary"
              description="Minimum player salary — can sign at this even when over the cap"
              value={draft.leagueMinSalary}
              onChange={v => setDraft(d => ({ ...d, leagueMinSalary: v }))}
              min={0.25}
              max={3}
              step={0.25}
              formatValue={v => `$${v}M`}
            />
          </div>
        </Card>

        {/* Trade Settings */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Trades</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Trade Deadline"
              description="Week number after which no trades can be made"
              value={draft.tradeDeadlineWeek}
              onChange={v => setDraft(d => ({ ...d, tradeDeadlineWeek: v }))}
              min={6}
              max={17}
              step={1}
              formatValue={v => `Week ${v}`}
            />
          </div>
        </Card>

        {/* Player Development */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Player Development</CardTitle></CardHeader>
          <div>
            <SettingRow
              label="Progression Rate"
              description="How quickly young players develop. 100 = normal"
              value={draft.progressionRate}
              onChange={v => setDraft(d => ({ ...d, progressionRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Regression Rate"
              description="How quickly aging players decline. 100 = normal"
              value={draft.regressionRate}
              onChange={v => setDraft(d => ({ ...d, regressionRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Injury Frequency"
              description="How often injuries occur. 100 = normal, 0 = no injuries"
              value={draft.injuryRate}
              onChange={v => setDraft(d => ({ ...d, injuryRate: v }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Suspension Frequency"
              description="How often discipline suspensions occur. 100 = normal, 0 = off"
              value={Math.round((draft.suspensionFrequency ?? 1.0) * 100)}
              onChange={v => setDraft(d => ({ ...d, suspensionFrequency: v / 100 }))}
              min={0}
              max={200}
              step={10}
              formatValue={v => `${v}%`}
            />
            <SettingRow
              label="Preseason Games"
              description="Number of preseason exhibition games before the regular season. 0 = skip."
              value={draft.preseasonGames ?? 3}
              onChange={v => setDraft(d => ({ ...d, preseasonGames: v }))}
              min={0}
              max={4}
              step={1}
              formatValue={v => v === 0 ? 'Off' : `${v} games`}
            />
            <SettingRow
              label="Retirement Age"
              description="Minimum age before players consider retiring"
              value={draft.retirementAge}
              onChange={v => setDraft(d => ({ ...d, retirementAge: v }))}
              min={28}
              max={42}
              step={1}
              formatValue={v => `${v} yrs`}
            />
          </div>
        </Card>

        {/* Roster Management */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Roster Management</CardTitle></CardHeader>
          <div className="space-y-4">
            <ToggleRow
              label="53-man roster limit"
              description="Forces each team to carry exactly 53 active players. Cuts and signings are validated against this cap."
              value={draft.rosterLimitEnabled !== false}
              onChange={v => setDraft(d => ({ ...d, rosterLimitEnabled: v }))}
              activeColor="bg-blue-500"
            />
            <ToggleRow
              label="Practice squad"
              description="Adds a 16-player practice squad. PS players are developed during the week and can be called up. [Coming soon]"
              value={false}
              onChange={() => {}}
              disabled
            />
            <ToggleRow
              label="Injured reserve"
              description="Adds IR slots with designated-for-return rules. Injured players can be placed on IR to open a roster spot. [Coming soon]"
              value={false}
              onChange={() => {}}
              disabled
            />
          </div>
        </Card>

        {/* God Mode */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>God Mode</CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 border border-yellow-300">
                Commissioner
              </span>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-sec)]">
              Full control over your league. Edit players, force trades, and modify any team. Enabling God Mode permanently marks this league as modified.
            </p>
            <button
              onClick={() => {
                if (!draft.godMode && !draft.godModeUsed) {
                  if (!window.confirm('Enabling God Mode will permanently mark this league as modified. Continue?')) return;
                }
                setDraft(d => ({ ...d, godMode: !d.godMode, godModeUsed: true }));
              }}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${draft.godMode ? 'bg-yellow-500' : 'bg-gray-300'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${draft.godMode ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <span className={`ml-2 text-sm font-semibold ${draft.godMode ? 'text-yellow-600' : 'text-[var(--text-sec)]'}`}>
              {draft.godMode ? 'ON' : 'OFF'}
            </span>
          </div>
        </Card>

        {/* BS Mode */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>BS Mode</CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">
                Experimental
              </span>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-sec)]">
              Activates the Draft Lottery, QB Tier Pyramid, Ewing Theory, and Irrational Confidence Guys. Adds drama and variance to your league.
            </p>
            <button
              onClick={() => setDraft(d => ({ ...d, bsMode: !d.bsMode }))}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${draft.bsMode ? 'bg-amber-500' : 'bg-gray-300'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${draft.bsMode ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <span className={`ml-2 text-sm font-semibold ${draft.bsMode ? 'text-amber-600' : 'text-[var(--text-sec)]'}`}>
              {draft.bsMode ? 'ON' : 'OFF'}
            </span>
          </div>
        </Card>

        {/* McAfee Mode */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>McAfee Mode</CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300">
                Special Teams
              </span>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-sec)]">
              Special teams actually matter. Punter ratings affect distance, kicker ratings affect PATs, kick/punt returns can break for TDs, fake punts and onside kicks happen. For the brand.
            </p>
            <button
              onClick={() => setDraft(d => ({ ...d, mcafeeMode: !d.mcafeeMode }))}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${draft.mcafeeMode ? 'bg-blue-500' : 'bg-gray-300'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${draft.mcafeeMode ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <span className={`ml-2 text-sm font-semibold ${draft.mcafeeMode ? 'text-blue-600' : 'text-[var(--text-sec)]'}`}>
              {draft.mcafeeMode ? 'ON' : 'OFF'}
            </span>
          </div>
        </Card>

        {/* Chaos Draft Mode */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Chaos Draft</CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">
                Fun Mode
              </span>
            </div>
          </CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-sec)] max-w-md">
              The JaMarcus Russell / Brock Purdy League. Every top prospect busts and every late-round pick booms. Scouting becomes essential — high picks are traps and the real stars are hiding at the bottom of the board. Applies to future draft classes only.
            </p>
            <button
              onClick={() => setDraft(d => ({ ...d, chaosDraft: !d.chaosDraft }))}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${draft.chaosDraft ? 'bg-red-500' : 'bg-gray-300'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${draft.chaosDraft ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <span className={`ml-2 text-sm font-semibold ${draft.chaosDraft ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>
              {draft.chaosDraft ? 'ON' : 'OFF'}
            </span>
          </div>
        </Card>

        {/* AI Commentary */}
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>AI Commentary</CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-300">
                Claude AI
              </span>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-sec)]">
              Generate unique, dynamic Team Spotlight and Recap commentary using AI instead of template-based dialogue.
            </p>
            <button
              onClick={() => setDraft(d => ({ ...d, aiCommentary: !d.aiCommentary }))}
              className={`
                relative inline-flex h-7 w-12 items-center rounded-full transition-colors
                ${draft.aiCommentary ? 'bg-purple-500' : 'bg-gray-300'}
              `}
            >
              <span
                className={`
                  inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
                  ${draft.aiCommentary ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <span className={`ml-2 text-sm font-semibold ${draft.aiCommentary ? 'text-purple-600' : 'text-[var(--text-sec)]'}`}>
              {draft.aiCommentary ? 'ON' : 'OFF'}
            </span>
          </div>
        </Card>

        {/* Switch Team */}
        <Card className="mb-4">
          <CardHeader><CardTitle>Switch Team</CardTitle></CardHeader>
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-sec)]">
              Take control of a different franchise. Your current team will be managed by AI.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {[...teams]
                .sort((a, b) => a.city.localeCompare(b.city))
                .map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    if (t.id === userTeamId) return;
                    switchTeam(t.id);
                    router.push('/');
                  }}
                  disabled={t.id === userTeamId}
                  className={`
                    flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-all
                    ${t.id === userTeamId
                      ? 'border-blue-500 bg-blue-50 text-blue-700 cursor-default'
                      : 'border-[var(--border)] hover:border-blue-400 hover:bg-blue-50 cursor-pointer'}
                  `}
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-black text-white"
                    style={{ backgroundColor: t.primaryColor }}
                  >
                    {t.abbreviation}
                  </div>
                  <span className="truncate w-full text-center text-[10px]">{t.abbreviation}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Current league info */}
        <Card>
          <CardHeader><CardTitle>Current League Status</CardTitle></CardHeader>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-sec)]">Current Cap:</span>{' '}
              <span className="font-mono font-bold">${userTeam?.salaryCap}M</span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Your Payroll:</span>{' '}
              <span className="font-mono font-bold">${userTeam?.totalPayroll.toFixed(1)}M</span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Cap Space:</span>{' '}
              <span className={`font-mono font-bold ${(userTeam?.salaryCap ?? 0) - (userTeam?.totalPayroll ?? 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${((userTeam?.salaryCap ?? 0) - (userTeam?.totalPayroll ?? 0)).toFixed(1)}M
              </span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Next Season Cap:</span>{' '}
              <span className="font-mono font-bold">
                ~${((userTeam?.salaryCap ?? draft.salaryCap) * (1 + draft.capGrowthRate / 100)).toFixed(0)}M
              </span>
            </div>
          </div>
        </Card>
        {/* Import League File */}
        <Card>
          <CardHeader><CardTitle>Import League File</CardTitle></CardHeader>
          <ImportLeagueCard />
        </Card>
      </div>
    </GameShell>
  );
}

function ImportLeagueCard() {
  const { newLeague, userTeamId, teams } = useGameStore();
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      await newLeague(userTeam?.abbreviation ?? 'BUF', importUrl.trim());
      setResult('League imported successfully! Page will refresh.');
    } catch {
      setError('Failed to import league file. Check the URL and try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-sec)]">
        Import a league file from a URL to replace your current league with custom teams, players, and draft prospects.
        This will reset your current league progress.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://example.com/league-file.json"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
        />
        <Button size="sm" onClick={handleImport} disabled={importing || !importUrl.trim()}>
          {importing ? 'Importing...' : 'Import & Reset'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {result && <p className="text-xs text-green-600">{result}</p>}
      <p className="text-[10px] text-[var(--text-sec)]">
        ⚠️ This will replace your entire league. Save your current game first if you want to keep it.
      </p>
    </div>
  );
}
