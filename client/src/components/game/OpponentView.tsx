import { ClientPlayer, ClientGameState } from '../../types';

interface OpponentViewProps {
  player: ClientPlayer;
  playerIndex: number;
  gameState: ClientGameState;
  position: 'top' | 'left' | 'right';
}

function FootStatusBadge({ player }: { player: ClientPlayer }) {
  if (!player.inFoot && player.footCount > 0) {
    // Has not yet picked up foot
    return (
      <span
        title="Has not picked up foot yet"
        className="inline-flex items-center gap-0.5 bg-orange-800/80 border border-orange-600 text-orange-200 text-xs px-1.5 py-0.5 rounded-full"
      >
        <span>🥾</span>
        <span className="font-medium">Foot waiting</span>
      </span>
    );
  }
  if (player.inFoot && player.footCount > 0) {
    return (
      <span
        title="Playing from foot"
        className="inline-flex items-center gap-0.5 bg-green-900/80 border border-green-600 text-green-200 text-xs px-1.5 py-0.5 rounded-full"
      >
        <span>👣</span>
        <span className="font-medium">In foot</span>
      </span>
    );
  }
  if (player.inFoot && player.footCount === 0) {
    return (
      <span
        title="Foot is empty — ready to go out"
        className="inline-flex items-center gap-0.5 bg-yellow-800/80 border border-yellow-500 text-yellow-200 text-xs px-1.5 py-0.5 rounded-full"
      >
        <span>⭐</span>
        <span className="font-medium">Ready!</span>
      </span>
    );
  }
  return null;
}

export function OpponentView({ player, playerIndex, gameState, position }: OpponentViewProps) {
  const isCurrentTurn = gameState.currentPlayerIndex === playerIndex;
  const teamColor = player.teamIndex === 0 ? 'border-blue-600 bg-blue-900/30' : 'border-red-700 bg-red-900/30';
  const cardCount = player.inFoot ? player.footCount : player.handCount;

  return (
    <div className={`flex ${position === 'top' ? 'flex-col items-center' : position === 'left' ? 'flex-row-reverse items-center' : 'flex-row items-center'} gap-2`}>
      {/* Player info badge */}
      <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border ${teamColor} ${isCurrentTurn ? 'ring-2 ring-gold-400' : ''}`}>
        <div className="flex items-center gap-1">
          {isCurrentTurn && <span className="text-gold-400 text-xs animate-pulse">⭐</span>}
          <span className="text-white text-sm font-semibold">{player.name}</span>
          {!player.isConnected && <span className="text-gray-500 text-xs">(away)</span>}
        </div>

        <FootStatusBadge player={player} />

        <div className="text-xs text-felt-400">
          {cardCount} card{cardCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Face-down card fan */}
      <div className={`flex ${position === 'left' || position === 'right' ? 'flex-col' : 'flex-row'}`}>
        {Array.from({ length: Math.min(cardCount, 5) }).map((_, i) => (
          <div
            key={i}
            className="w-8 h-12 rounded bg-blue-800 border border-blue-600 shadow-sm"
            style={{ marginLeft: i > 0 && position === 'top' ? -22 : 0, marginTop: i > 0 && position !== 'top' ? -30 : 0 }}
          />
        ))}
      </div>
    </div>
  );
}
