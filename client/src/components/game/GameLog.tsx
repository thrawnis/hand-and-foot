import { useRef, useEffect } from 'react';
import { LogEntry } from '../../types';
import { formatTimestamp } from '../../utils/formatUtils';

interface GameLogProps {
  entries: LogEntry[];
}

export function GameLog({ entries }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="bg-felt-900/60 border border-felt-700 rounded-xl overflow-hidden flex flex-col h-40">
      <div className="px-3 py-1.5 border-b border-felt-700 text-xs font-medium text-felt-400">
        Game Log
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-felt-500 shrink-0">{formatTimestamp(entry.timestamp)}</span>
            <span className="text-gold-400 shrink-0 font-medium">{entry.playerName}</span>
            <span className="text-felt-200">{entry.action}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
