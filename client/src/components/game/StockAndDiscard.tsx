import { motion, AnimatePresence } from 'framer-motion';
import { ClientGameState } from '../../types';
import { CardComponent } from './CardComponent';
import { drawStock } from '../../hooks/useSocket';

interface StockAndDiscardProps {
  gameState: ClientGameState;
}

export function StockAndDiscard({ gameState }: StockAndDiscardProps) {
  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const discardCount = gameState.discardPile.length;

  const myIndex = gameState.myPlayerIndex;
  const isMyTurn = gameState.currentPlayerIndex === myIndex;
  const isDrawPhase = gameState.turnPhase === 'draw';
  const isBot = gameState.players[gameState.currentPlayerIndex]?.isBot;
  const canDrawStock = isMyTurn && isDrawPhase && !isBot;

  return (
    <div className="flex items-center justify-center gap-8">
      {/* Stock pile */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative">
          {/* Stack effect */}
          {gameState.stockCount > 1 && (
            <div className="absolute top-1 left-1 w-14 h-20 rounded-lg bg-blue-900 border-2 border-blue-700" />
          )}
          {gameState.stockCount > 2 && (
            <div className="absolute top-0.5 left-0.5 w-14 h-20 rounded-lg bg-blue-800 border-2 border-blue-600" />
          )}
          <div
            onClick={canDrawStock ? drawStock : undefined}
            className={`relative w-14 h-20 rounded-lg bg-blue-800 border-2 shadow-card flex items-center justify-center transition-colors ${
              canDrawStock
                ? 'border-gold-400 cursor-pointer hover:bg-blue-700 hover:border-gold-300'
                : 'border-blue-600 cursor-default'
            }`}
          >
            <span className="text-blue-300 text-xl">🂠</span>
          </div>
        </div>
        <span className="text-felt-300 text-xs font-medium">{gameState.stockCount} left</span>
        <span className="text-felt-400 text-xs">{canDrawStock ? 'Click to draw' : 'Stock'}</span>
      </div>

      {/* Discard pile */}
      <div className="flex flex-col items-center gap-1">
        <div className="relative w-14 h-20">
          {discardCount === 0 ? (
            <div className="w-14 h-20 rounded-lg border-2 border-dashed border-felt-600 flex items-center justify-center">
              <span className="text-felt-500 text-xs">Empty</span>
            </div>
          ) : (
            <AnimatePresence>
              <motion.div
                key={topDiscard?.id}
                initial={{ scale: 0.8, opacity: 0, rotate: -5 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                className="absolute inset-0"
              >
                {topDiscard && (
                  <CardComponent card={topDiscard} size="md" />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        <span className="text-felt-300 text-xs font-medium">{discardCount} cards</span>
        <span className="text-felt-400 text-xs">Discard</span>
      </div>
    </div>
  );
}
