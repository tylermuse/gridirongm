'use client';

interface PlayerAvatarProps {
  player: { firstName: string; lastName: string; photoUrl?: string; position: string };
  size?: 'sm' | 'md' | 'lg';
  teamColor?: string;
  className?: string;
}

export function PlayerAvatar({ player, size = 'md', teamColor = '#555', className = '' }: PlayerAvatarProps) {
  const sizeClasses = { sm: 'w-6 h-6 text-[8px]', md: 'w-10 h-10 text-xs', lg: 'w-16 h-16 text-lg' };

  if (player.photoUrl) {
    return (
      <img
        src={player.photoUrl}
        alt={`${player.firstName} ${player.lastName}`}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 ${className}`}
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
