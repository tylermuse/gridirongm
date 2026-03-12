'use client';

import { useState } from 'react';

// Short hair only + boosted mustache probability → masculine-presenting avatars
const DICEBEAR_PARAMS = [
  'backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
  'hair=short01,short02,short03,short04,short05,short06,short07,short08,short09,short10,short11,short12,short13,short14,short15,short16,short17,short18,short19',
  'earringsProbability=0',
  'featuresProbability=30',
].join('&');

function getDiceBearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&${DICEBEAR_PARAMS}`;
}

interface PlayerAvatarProps {
  player: { id?: string; firstName: string; lastName: string; photoUrl?: string; position: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  teamColor?: string;
  className?: string;
}

const sizeClasses: Record<string, string> = {
  xs: 'w-4 h-4 text-[6px]',
  sm: 'w-6 h-6 text-[8px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-16 h-16 text-lg',
};

const sizePx: Record<string, number> = { xs: 16, sm: 24, md: 40, lg: 64 };

export function PlayerAvatar({ player, size = 'md', teamColor = '#555', className = '' }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const imgSrc = player.photoUrl || (player.id ? getDiceBearUrl(player.id) : null);

  if (imgSrc && !imgError) {
    return (
      <img
        key={player.id ?? imgSrc}
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
