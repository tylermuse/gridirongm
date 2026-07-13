'use client';

import { COMMENTATORS } from '@/lib/engine/debate';
import type { DebateExchange } from '@/lib/engine/debate';
import type { Player, Team } from '@/types';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';

export function DebateBubble({
  exchange,
  onPlayerClick,
  playerIds = [],
  players = [],
}: {
  exchange: DebateExchange;
  onPlayerClick?: (id: string) => void;
  playerIds?: string[];
  players?: Player[];
  teams?: Team[];
}) {
  const isFans = exchange.speakerId === 'fans';
  const isPlayer = exchange.speakerId === 'player';
  const commentator = (isFans || isPlayer) ? null : COMMENTATORS[exchange.speakerId as 'stats' | 'hottake'];
  const isHotTake = exchange.speakerId === 'hottake';
  // AI responses occasionally return unexpected speaker ids (e.g. 'gm', 'coach',
  // 'analyst'). Fall back to Marcus so the page doesn't crash — better a
  // generic voice than a blank error screen.
  const safeCommentator = commentator ?? COMMENTATORS.stats;

  // Render text with clickable player names
  function renderText(text: string) {
    let result: (string | React.ReactElement)[] = [text];

    for (const pid of playerIds) {
      const p = players.find(pl => pl.id === pid);
      if (!p) continue;
      const fullName = `${p.firstName} ${p.lastName}`;
      const lastName = p.lastName;

      const newResult: (string | React.ReactElement)[] = [];
      for (const part of result) {
        if (typeof part !== 'string') {
          newResult.push(part);
          continue;
        }
        const nameToFind = part.includes(fullName) ? fullName : (part.includes(lastName) ? lastName : null);
        if (!nameToFind) {
          newResult.push(part);
          continue;
        }
        const splitIdx = part.indexOf(nameToFind);
        if (splitIdx >= 0) {
          if (splitIdx > 0) newResult.push(part.slice(0, splitIdx));
          newResult.push(
            <button
              key={`${pid}-${splitIdx}`}
              onClick={() => onPlayerClick?.(pid)}
              className="text-blue-600 hover:underline font-medium"
            >
              {nameToFind}
            </button>
          );
          const after = part.slice(splitIdx + nameToFind.length);
          if (after) newResult.push(after);
        } else {
          newResult.push(part);
        }
      }
      result = newResult;
    }

    return <>{result}</>;
  }

  // Player social media post — styled like a tweet
  if (isPlayer) {
    const name = exchange.playerName ?? 'Player';
    const handle = '@' + name.replace(/[^a-zA-Z]/g, '').slice(0, 15);
    // Find matching player for avatar
    const matchedPlayer = players.find(p => `${p.firstName} ${p.lastName}` === name || p.lastName === name);
    const teamColor = matchedPlayer?.teamId
      ? '#555' // default, could look up team color if teams prop available
      : '#555';
    return (
      <div className="flex justify-center my-3">
        <div className="w-full max-w-[400px] bg-[#15202b] rounded-2xl px-4 pt-3 pb-3 text-white shadow-lg">
          {/* Header: avatar + name + handle */}
          <div className="flex items-center gap-2.5 mb-2">
            {matchedPlayer ? (
              <PlayerAvatar player={matchedPlayer} size="sm" teamColor={teamColor} />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white truncate">{name}</span>
                <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/></svg>
              </div>
              <div className="text-xs text-gray-500">{handle}</div>
            </div>
          </div>
          {/* Post content */}
          <div className="text-[15px] leading-snug text-white/95 mb-2">
            {renderText(exchange.text)}
          </div>
          {/* Footer: fake engagement */}
          <div className="flex items-center gap-5 text-xs text-gray-500 pt-1.5 border-t border-gray-700/50">
            <span>💬 {Math.floor(Math.random() * 500) + 50}</span>
            <span>🔁 {Math.floor(Math.random() * 2000) + 200}</span>
            <span>❤️ {(Math.floor(Math.random() * 30) + 5)}K</span>
          </div>
        </div>
      </div>
    );
  }

  // Fan reaction: centered, different style
  if (isFans) {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[90%] text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide mb-0.5 text-emerald-600">
            Fan Pulse
          </div>
          <div className="rounded-xl px-4 py-2 text-sm leading-relaxed bg-emerald-50 border border-emerald-200 italic text-emerald-800">
            {renderText(exchange.text)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isHotTake ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="shrink-0 pt-1">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
            isHotTake ? 'bg-red-100' : 'bg-blue-100'
          }`}
        >
          {safeCommentator.avatar}
        </div>
      </div>

      {/* Bubble */}
      <div className={`flex-1 max-w-[85%] ${isHotTake ? 'ml-auto' : ''}`}>
        <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
          isHotTake ? 'text-right text-red-600' : 'text-blue-600'
        }`}>
          {safeCommentator.name}
        </div>
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isHotTake
              ? 'bg-red-50 border border-red-200 rounded-tr-sm text-red-900'
              : 'bg-blue-50 border border-blue-200 rounded-tl-sm text-blue-900'
          }`}
        >
          &ldquo;{renderText(exchange.text)}&rdquo;
        </div>
      </div>
    </div>
  );
}
