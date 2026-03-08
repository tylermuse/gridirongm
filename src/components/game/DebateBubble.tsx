'use client';

import { COMMENTATORS } from '@/lib/engine/debate';
import type { DebateExchange } from '@/lib/engine/debate';
import type { Player, Team } from '@/types';

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
  const commentator = COMMENTATORS[exchange.speakerId];
  const isHotTake = exchange.speakerId === 'hottake';

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

  return (
    <div className={`flex gap-3 ${isHotTake ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="shrink-0 pt-1">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${
            isHotTake ? 'bg-red-100' : 'bg-blue-100'
          }`}
        >
          {commentator.avatar}
        </div>
      </div>

      {/* Bubble */}
      <div className={`flex-1 max-w-[85%] ${isHotTake ? 'ml-auto' : ''}`}>
        <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
          isHotTake ? 'text-right text-red-600' : 'text-blue-600'
        }`}>
          {commentator.name}
        </div>
        <div
          className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isHotTake
              ? 'bg-red-50 border border-red-200 rounded-tr-sm'
              : 'bg-blue-50 border border-blue-200 rounded-tl-sm'
          }`}
        >
          &ldquo;{renderText(exchange.text)}&rdquo;
        </div>
      </div>
    </div>
  );
}
