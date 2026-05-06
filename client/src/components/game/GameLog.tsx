import { useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogEntry } from '../../types';
import { formatTimestamp } from '../../utils/formatUtils';

interface GameLogProps {
  entries: LogEntry[];
}

export function GameLog({ entries }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // Default collapsed on mobile (< 768px), expanded on desktop
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, collapsed]);

  const lastEntry = entries[entries.length - 1];

  return (
    <>
      {/* Desktop: inline collapsible log */}
      <div className="hidden md:block bg-felt-900/60 border border-felt-700 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-felt-700/30 transition-colors"
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-felt-400">Game Log</span>
            <span className="text-xs text-felt-600">({entries.length})</span>
            {collapsed && lastEntry && (
              <span className="text-xs text-felt-400 italic truncate max-w-xs">
                — {lastEntry.playerName}: {lastEntry.action}
              </span>
            )}
          </div>
          <span className="text-felt-500 text-xs">{collapsed ? '▼' : '▲'}</span>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 120 }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="overflow-y-auto h-[120px] px-3 py-2 space-y-1">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-felt-500 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                    <span className="text-gold-400 shrink-0 font-medium">{entry.playerName}</span>
                    <span className="text-felt-200">{entry.action}</span>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: floating button + slide-up sheet */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-felt-800/80 border border-felt-600 rounded-full text-xs text-felt-300 hover:text-white transition-colors"
        >
          <span>📋</span>
          <span>Log ({entries.length})</span>
          {lastEntry && <span className="text-felt-500 truncate max-w-[120px]">· {lastEntry.action}</span>}
        </button>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-40"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-felt-800 border-t border-felt-600 rounded-t-2xl max-h-[60vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-felt-700">
                  <span className="font-semibold text-white">Game Log</span>
                  <button onClick={() => setMobileOpen(false)} className="text-felt-400 text-2xl leading-none">×</button>
                </div>
                <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
                  {entries.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-felt-500 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                      <span className="text-gold-400 shrink-0 font-medium">{entry.playerName}</span>
                      <span className="text-felt-200">{entry.action}</span>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
