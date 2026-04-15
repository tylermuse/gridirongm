'use client';

import type { Player } from '@/types';

function RatingBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 65 ? 'bg-blue-500' : value >= 50 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = value >= 80 ? 'text-green-600' : value >= 65 ? 'text-blue-600' : value >= 50 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--text-sec)] w-24 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-bold w-7 text-right ${textColor}`}>{value}</span>
    </div>
  );
}

function PersonalityBadge({ type }: { type: string }) {
  const color = type === 'high_character' ? 'bg-green-100 text-green-700' : type === 'red_flag' ? 'bg-red-100 text-red-600' : type === 'confident' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{type.replace('_', ' ')}</span>;
}

function BustBoomBadge({ result, player }: { result: string; player: Player }) {
  if (result === 'normal') return null;
  // Suppress badges that contradict the visible potential — the scout's
  // bust/boom opinion can be wrong, but the potential number is accurate.
  const potentialDelta = player.potential - player.ratings.overall;
  if (result === 'boom' && potentialDelta < 5) return null;
  if (result === 'bust' && potentialDelta > 5) return null;
  const isBust = result === 'bust';
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isBust ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>{isBust ? '⚠ Bust Risk' : '✦ Boom Potential'}</span>;
}

const RATING_KEY_LABELS: Record<string, string> = {
  throwing: 'Arm Talent', carrying: 'Ball Carrying', catching: 'Hands', coverage: 'Coverage',
  passRush: 'Pass Rush', blocking: 'Blocking', tackling: 'Tackling', kicking: 'Kicking',
  speed: 'Speed', strength: 'Strength', agility: 'Agility', awareness: 'Awareness',
};

function ObservationCard({ icon, title, text, variant }: { icon: string; title: string; text: string; variant?: 'warning' | 'neutral' }) {
  return (
    <div className={`rounded-md p-2.5 ${variant === 'warning' ? 'bg-red-50 border border-red-200' : 'bg-white/60 border border-[var(--border)]'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${variant === 'warning' ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text)]">{text}</p>
    </div>
  );
}

export function InPersonEvalContent({ evalData, filmData, player }: {
  evalData: {
    ovrRange: { low: number; high: number };
    personality: string;
    characterNotes: string;
    revealedBustBoom: boolean;
    bustBoomResult?: string;
    revealedRatingKeys: string[];
    bodyType: string;
    footballIQ: string;
    competitiveness: string;
    medicalFlag: string | null;
    motivation: string;
  };
  filmData: { ovrRange: { low: number; high: number } };
  player: Player;
}) {
  return (
    <div className="space-y-3">
      {/* In-Person Observations */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-sec)]">In-Person Observations</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ObservationCard icon="🏋️" title="Body & Movement" text={evalData.bodyType} />
        <ObservationCard icon="🧠" title="Football IQ" text={evalData.footballIQ} />
        <ObservationCard icon="🔥" title="Competitiveness" text={evalData.competitiveness} />
        <ObservationCard icon="🏠" title="Motivation & Background" text={evalData.motivation} />
      </div>

      {/* Medical Flag — only if present */}
      {evalData.medicalFlag && (
        <ObservationCard icon="🏥" title="Medical Flag" text={evalData.medicalFlag} variant="warning" />
      )}

      {/* Character summary */}
      <div className="flex items-start gap-2 bg-white/50 rounded-md p-2.5 border border-[var(--border)]">
        <PersonalityBadge type={evalData.personality} />
        <p className="text-xs text-[var(--text)] leading-relaxed">{evalData.characterNotes}</p>
      </div>
    </div>
  );
}
