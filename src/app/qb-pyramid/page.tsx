'use client';

import { useState, useMemo } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { PlayerModal } from '@/components/game/PlayerModal';
import { computeLeagueQBTiers } from '@/lib/engine/qbTierPyramid';
import type { QBTier } from '@/types';

// ---------------------------------------------------------------------------
// Tier styling
// ---------------------------------------------------------------------------

const TIER_ORDER: QBTier[] = ['Elite', 'Franchise', 'Bridge', 'Game Manager', 'Backup', 'Camp Arm'];

const TIER_STYLES: Record<QBTier, { bg: string; border: string; text: string; label: string }> = {
  'Elite':        { bg: 'bg-purple-50',  border: 'border-purple-300', text: 'text-purple-700', label: 'bg-purple-600' },
  'Franchise':    { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-700',   label: 'bg-blue-600' },
  'Bridge':       { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-700',  label: 'bg-amber-500' },
  'Game Manager': { bg: 'bg-gray-50',    border: 'border-gray-300',   text: 'text-gray-600',   label: 'bg-gray-500' },
  'Backup':       { bg: 'bg-orange-50',  border: 'border-orange-300', text: 'text-orange-700', label: 'bg-orange-500' },
  'Camp Arm':     { bg: 'bg-red-50',     border: 'border-red-300',    text: 'text-red-700',    label: 'bg-red-600' },
};

const TIER_DESCRIPTIONS: Record<QBTier, string> = {
  'Elite':        'OVR 88+ / Age 33 or younger',
  'Franchise':    'OVR 80+ / Age 35 or younger',
  'Bridge':       'OVR 72+ or veteran with 68+',
  'Game Manager': 'OVR 62+',
  'Backup':       'OVR 50+',
  'Camp Arm':     'Below 50 OVR',
};

// Pyramid widths — each tier gets progressively wider
const TIER_WIDTH: Record<QBTier, string> = {
  'Elite':        'max-w-md',
  'Franchise':    'max-w-lg',
  'Bridge':       'max-w-xl',
  'Game Manager': 'max-w-2xl',
  'Backup':       'max-w-3xl',
  'Camp Arm':     'max-w-4xl',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function QBPyramidPage() {
  const { teams, players, leagueSettings, qbTiers: storedTiers } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const bsMode = leagueSettings?.bsMode ?? false;

  // Compute tiers on-the-fly if not stored (first season)
  const tiers = useMemo(() => {
    if (storedTiers && Object.keys(storedTiers).length > 0) return storedTiers;
    return computeLeagueQBTiers(teams, players);
  }, [storedTiers, teams, players]);

  // Group QBs by tier
  const tierGroups = useMemo(() => {
    const groups: Record<QBTier, Array<{
      teamId: string;
      teamAbbr: string;
      teamColor: string;
      playerName: string;
      playerId: string;
      ovr: number;
      age: number;
    }>> = {
      'Elite': [],
      'Franchise': [],
      'Bridge': [],
      'Game Manager': [],
      'Backup': [],
      'Camp Arm': [],
    };

    for (const [teamId, entry] of Object.entries(tiers)) {
      const team = teams.find(t => t.id === teamId);
      const player = players.find(p => p.id === entry.playerId);
      if (!team || !player) continue;

      groups[entry.tier].push({
        teamId,
        teamAbbr: team.abbreviation,
        teamColor: team.primaryColor,
        playerName: `${player.firstName} ${player.lastName}`,
        playerId: player.id,
        ovr: player.ratings.overall,
        age: player.age,
      });
    }

    // Sort each tier by OVR descending
    for (const tier of TIER_ORDER) {
      groups[tier].sort((a, b) => b.ovr - a.ovr);
    }

    return groups;
  }, [tiers, teams, players]);

  if (!bsMode) {
    return (
      <GameShell>
        <div className="max-w-2xl mx-auto mt-16 text-center space-y-4">
          <h2 className="text-2xl font-black">QB Tier Pyramid</h2>
          <p className="text-[var(--text-sec)]">
            Enable <span className="font-bold">BS Mode</span> in Settings to see the QB Tier Pyramid.
          </p>
          <p className="text-sm text-[var(--text-sec)]">
            BS Mode adds drama and variance to the league, including QB tier classifications
            that affect gameplay performance.
          </p>
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-2">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-[var(--text)]">QB Tier Pyramid</h1>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            Every team's starting QB, ranked by tier. Elite QBs get a performance boost; Camp Arms get a penalty.
          </p>
        </div>

        {/* Pyramid tiers */}
        <div className="space-y-2 flex flex-col items-center">
          {TIER_ORDER.map(tier => {
            const qbs = tierGroups[tier];
            const style = TIER_STYLES[tier];

            return (
              <div key={tier} className={`w-full ${TIER_WIDTH[tier]} mx-auto`}>
                <div className={`${style.bg} border ${style.border} rounded-xl overflow-hidden`}>
                  {/* Tier header */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`${style.label} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded`}>
                        {tier}
                      </span>
                      <span className="text-[10px] text-[var(--text-sec)]">
                        {TIER_DESCRIPTIONS[tier]}
                      </span>
                    </div>
                    <span className={`text-xs font-bold ${style.text}`}>
                      {qbs.length} QB{qbs.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* QB entries */}
                  {qbs.length > 0 ? (
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {qbs.map(qb => (
                          <button
                            key={qb.playerId}
                            onClick={() => setSelectedPlayerId(qb.playerId)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${style.border} bg-white/60 hover:bg-white transition-colors text-left`}
                          >
                            <span
                              className="w-6 h-6 rounded-sm flex items-center justify-center text-white text-[8px] font-black shrink-0"
                              style={{ backgroundColor: qb.teamColor }}
                            >
                              {qb.teamAbbr}
                            </span>
                            <div className="min-w-0">
                              <div className={`text-xs font-semibold ${style.text} truncate`}>
                                {qb.playerName}
                              </div>
                              <div className="text-[10px] text-[var(--text-sec)]">
                                {qb.ovr} OVR · Age {qb.age}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 pb-3">
                      <span className="text-xs text-[var(--text-sec)] italic">No QBs in this tier</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="text-center pt-4 pb-2">
          <p className="text-[10px] text-[var(--text-sec)]">
            Tier modifiers: Elite +2, Franchise +1, Bridge/GM +0, Backup -1, Camp Arm -2. Applied to passing outcomes in simulation.
          </p>
        </div>
      </div>

      <PlayerModal
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </GameShell>
  );
}
