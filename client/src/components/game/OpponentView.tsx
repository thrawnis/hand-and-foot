import { ClientPlayer, ClientGameState } from '../../types';
import { CardBack } from './CardComponent';

interface OpponentViewProps {
  player: ClientPlayer;
  playerIndex: number;
  gameState: ClientGameState;
  position: 'top' | 'left' | 'right';
}

export function OpponentView({ player, playerIndex, gameState, position }: OpponentViewProps) {
  const isCurrentTurn = gameState.currentPlayerIndex === playerIndex;
  const teamColor = player.teamIndex === 0 ? 'border-blue-600 bg-blue-900/30' : 'border-red-700 bg-red-900/30';

  return (
    <div className={`flex ${position === 'top' ? 'flex-col items-center' : position === 'left' ? 'flex-row-reverse items-center' : 'flex-row items-center'} gap-2`}>
      {/* Player info badge */}
      <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border ${teamColor} ${
        isCurrentTurn ? 'ring-2 ring-gold-400' : ''
      }`}>
        <div className="flex items-center gap-1">
          {isCurrentTurn && <span className="text-gold-400 text-xs">⭐</span>}
          <span className="text-white text-sm font-semibold">{player.name}</span>
          {!player.isConnected && <span className="text-gray-400 text-xs">(away)</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-felt-300">
          <span>{player.inFoot ? '👣 Foot' : '✋ Hand'}</span>
          <span>{player.inFoot ? player.footCount : player.handCount} cards</span>
        </div>
      </div>

      {/* Face-down cards preview */}
      <div className={`flex ${position === 'left' || position === 'right' ? 'flex-col' : 'flex-row'} gap-0.5`}>
        {Array.from({ length: Math.min(player.inFoot ? player.footCount : player.handCount, 5) }).map((_, i) => (
          <div
            key={i}
            className="w-8 h-12 rounded bg-blue-800 border border-blue-600 shadow-sm"
            style={{ marginLeft: i > 0 && position !== 'left' && position !== 'right' ? -24 : 0 }}
          />
        ))}
      </div>
    </div>
  );
}
