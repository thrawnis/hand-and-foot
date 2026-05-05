import { motion } from 'framer-motion';
import { LobbyGame } from '../../types';
import { formatTimeSince } from '../../utils/formatUtils';
import { Button } from '../common/Button';

interface GameCardProps {
  game: LobbyGame;
  onJoin: () => void;
  muted?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-yellow-500',
  active: 'bg-green-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting',
  active: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

export function GameCard({ game, onJoin, muted }: GameCardProps) {
  const canJoin = game.status === 'active' || game.status === 'waiting';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-felt-800/80 border ${muted ? 'border-felt-700' : 'border-felt-600'} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4`}
    >
      {/* Left: game info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[game.status] ?? 'bg-gray-500'}`} />
          <span className="text-xs font-semibold text-felt-300 uppercase tracking-wider">
            {STATUS_LABELS[game.status]}
          </span>
          <span className="text-xs text-felt-400">· Round {game.currentRound}/{game.rules.numRounds}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-2xl font-bold text-white tracking-widest">{game.code}</span>
          <span className="text-felt-400 text-sm">
            {game.playerCount} player{game.playerCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Player names in play order */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {game.playerNames.map((name, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                i % 2 === 0
                  ? 'bg-blue-900/60 text-blue-200 border border-blue-700'
                  : 'bg-red-900/60 text-red-200 border border-red-700'
              }`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Right: time + action */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-felt-400 text-sm">{formatTimeSince(game.lastActionAt)}</span>
        {canJoin && (
          <Button variant="gold" size="sm" onClick={onJoin}>
            Join / Spectate
          </Button>
        )}
      </div>
    </motion.div>
  );
}
