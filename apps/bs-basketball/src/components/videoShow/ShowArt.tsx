'use client';

import { useState } from 'react';
import type { ShowPlayer, ShowTeam } from '@/lib/videoShow/types';

/**
 * Logo and headshot that fill whatever box the show's graphics give them
 * (BS Football's TeamLogo / PlayerAvatar `size="fill"`; Hoops' shared
 * components only come in fixed sizes).
 */

export function ShowTeamLogo({ team }: { team: ShowTeam }) {
  const [broken, setBroken] = useState(false);
  if (team.logoUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={team.logoUrl} alt="" className="w-full h-full object-contain" onError={() => setBroken(true)} />;
  }
  return (
    <span
      className="w-full h-full rounded-full grid place-items-center font-black text-white"
      style={{ background: team.primaryColor ?? '#334155', boxShadow: `inset 0 0 0 3px ${team.secondaryColor ?? 'transparent'}`, fontSize: 'min(1.6em, 40cqmin)', containerType: 'size' }}
    >
      <span style={{ fontSize: '32cqmin' }}>{team.abbreviation}</span>
    </span>
  );
}

export function ShowPlayerAvatar({ player, teamColor }: { player: ShowPlayer; teamColor?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
  return (
    <span className="relative w-full h-full rounded-full overflow-hidden grid place-items-center text-white font-black" style={{ background: teamColor ?? '#334155', containerType: 'size' }}>
      <span style={{ fontSize: '36cqmin' }}>{initials}</span>
      {player.imageUrl && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover object-top" onError={() => setBroken(true)} />
      )}
    </span>
  );
}
