'use client';

import { useState } from 'react';

// Switched from DiceBear's "adventurer" style to "avataaars". The adventurer
// style has intentionally oversized heads + small features that read as
// "baby-faced" on adult NFL players (new-user gillespie3 called it out 4/23;
// BmoreOriole: "that guy looks like a baby lol"). avataaars has adult-
// proportioned heads and masculine-leaning hair / facial-hair options.
const DICEBEAR_PARAMS = [
  'backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
  'top=shortHairShortFlat,shortHairShortCurly,shortHairShortRound,shortHairShortWaved,shortHairSides,shortHairTheCaesar,shortHairFrizzle,shortHairDreads01,shortHairDreads02',
  'facialHairProbability=40',
  'accessoriesProbability=0',
].join('&');

function getDiceBearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&${DICEBEAR_PARAMS}`;
}

interface PlayerAvatarProps {
  player: { id?: string; firstName: string; lastName: string; photoUrl?: string; portraitSeedOverride?: string; position: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  teamColor?: string;
  className?: string;
}

const sizeClasses: Record<string, string> = {
  xs: 'w-4 h-4 text-[6px]',
  sm: 'w-6 h-6 text-[8px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

const sizePx: Record<string, number> = { xs: 16, sm: 24, md: 40, lg: 64, xl: 96 };

export function PlayerAvatar({ player, size = 'md', teamColor = '#555', className = '' }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const seed = player.portraitSeedOverride ?? player.id;
  const imgSrc = player.photoUrl || (seed ? getDiceBearUrl(seed) : null);

  if (imgSrc && !imgError) {
    return (
      <img
        key={seed ?? imgSrc}
        src={imgSrc}
        alt={`${player.firstName} ${player.lastName}`}
        width={sizePx[size]}
        height={sizePx[size]}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 ${className}`}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: initials badge
  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-black text-white shrink-0 ${className}`}
      style={{ backgroundColor: teamColor }}
    >
      {player.firstName[0]}{player.lastName[0]}
    </div>
  );
}
