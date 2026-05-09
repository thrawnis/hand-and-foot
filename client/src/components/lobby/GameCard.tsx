import { motion } from 'framer-motion';
import { LobbyGame } from '../../types';
import { formatTimeSince } from '../../utils/formatUtils';
import { Button } from '../common/Button';

interface GameCardProps {
  game: LobbyGame;
  teamColors: string[];
  onJoin: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
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

export function GameCard({ game, teamColors, onJoin, onArchive, onDelete, muted }: GameCardProps) {
  const canJoin = game.status === 'active' || game.status === 'waiting';

  // Sort players by play order (index), colour by team
  const players = game.playerNames.map((name, i) => ({
    name,
    teamIndex: game.playerTeamIndices?.[i] ?? (i % 2),
    playOrder: i,
  }));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-felt-800/80 border ${muted ? 'border-felt-700' : 'border-felt-600'} rounded-xl p-4 flex flex-col gap-3`}
    >
      {/* Top row: status + code + time */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[game.status] ?? 'bg-gray-500'}`} />
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
        </div>
        <span className="text-felt-400 text-sm shrink-0">{formatTimeSince(game.lastActionAt)}</span>
      </div>

      {/* Player badges — sorted by play order, coloured by team */}
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <span
            key={p.playOrder}
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${teamColors[p.teamIndex] ?? teamColors[0]}`}
          >
            {p.name}
          </span>
        ))}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        {canJoin && (
          <Button variant="gold" size="sm" onClick={onJoin}>
            Join / Spectate
          </Button>
        )}
        {onArchive && (
          <Button variant="ghost" size="sm" onClick={onArchive}>Archive</Button>
        )}
        {onDelete && (
          <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
        )}
      </div>
    </motion.div>
  );
}
