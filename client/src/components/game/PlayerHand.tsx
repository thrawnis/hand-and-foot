import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, ClientGameState } from '../../types';
import { CardComponent } from './CardComponent';
import { useGameStore } from '../../store/gameStore';
import { discardCard, drawStock, drawDiscard, goOut } from '../../hooks/useSocket';
import { Button } from '../common/Button';
import { totalPoints } from '../../utils/cardUtils';
import toast from 'react-hot-toast';

interface PlayerHandProps {
  gameState: ClientGameState;
}

export function PlayerHand({ gameState }: PlayerHandProps) {
  const { selectedCardIds, toggleCardSelection, clearSelection } = useGameStore();
  const [showGoOutConfirm, setShowGoOutConfirm] = useState(false);

  const myIndex = gameState.myPlayerIndex;
  const me = myIndex >= 0 ? gameState.players[myIndex] : null;
  if (!me) return null;

  const isMyTurn = gameState.currentPlayerIndex === myIndex;
  const isDrawPhase = gameState.turnPhase === 'draw';
  const isPlayPhase = gameState.turnPhase === 'play';
  const myCards = me.hand ?? [];
  const isInFoot = me.inFoot;

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];

  // Check if we can draw from discard
  const canDrawDiscard = topDiscard
    && !topDiscard.isWild
    && !topDiscard.isRed3
    && !topDiscard.isBlack3
    && myCards.filter((c) => c.rank === topDiscard.rank && !c.isWild).length >= 2;

  const handleDiscard = () => {
    if (selectedCardIds.length !== 1) {
      toast.error('Select exactly 1 card to discard');
      return;
    }
    discardCard(selectedCardIds[0]);
    clearSelection();
  };

  const handleDrawDiscard = () => {
    if (!topDiscard) return;
    const matching = myCards.filter((c) => c.rank === topDiscard.rank && !c.isWild);
    if (matching.length < 2) {
      toast.error('Need 2 matching cards to take discard pile');
      return;
    }
    drawDiscard([matching[0].id, matching[1].id]);
  };

  const handleGoOut = () => {
    setShowGoOutConfirm(false);
    goOut();
  };

  const selectedPoints = myCards
    .filter((c) => selectedCardIds.includes(c.id))
    .reduce((s, c) => s + c.pointValue, 0);

  return (
    <div className="bg-felt-900/90 border-t border-felt-700 p-3 space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isMyTurn ? 'text-gold-400' : 'text-felt-300'}`}>
            {isMyTurn ? '⭐ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
          </span>
          {isMyTurn && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isDrawPhase ? 'bg-blue-700 text-blue-200' : isPlayPhase ? 'bg-green-700 text-green-200' : 'bg-orange-700 text-orange-200'
            }`}>
              {isDrawPhase ? 'Draw' : isPlayPhase ? 'Play / Discard' : 'Discard'}
            </span>
          )}
          <span className="text-felt-400">
            {isInFoot ? '👣 Foot' : `✋ Hand`} ({myCards.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedCardIds.length > 0 && (
            <span className="text-xs text-gold-400">
              {selectedCardIds.length} selected ({selectedPoints} pts)
            </span>
          )}
          {selectedCardIds.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {isMyTurn && (
        <div className="flex gap-2 flex-wrap">
          {isDrawPhase && (
            <>
              <Button variant="primary" size="sm" onClick={drawStock}>
                🃏 Draw 2
              </Button>
              {canDrawDiscard && (
                <Button variant="secondary" size="sm" onClick={handleDrawDiscard}>
                  📥 Take Discard ({gameState.discardPile.length})
                </Button>
              )}
            </>
          )}
          {!isDrawPhase && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscard}
                disabled={selectedCardIds.length !== 1}
              >
                🗑 Discard Selected
              </Button>
              {isInFoot && myCards.length === 0 && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => setShowGoOutConfirm(true)}
                >
                  🏆 Go Out!
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-max px-1">
          {myCards.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              size="md"
              selected={selectedCardIds.includes(card.id)}
              onClick={() => toggleCardSelection(card.id)}
              draggable={isMyTurn && !isDrawPhase}
              disabled={!isMyTurn}
            />
          ))}
          {myCards.length === 0 && !isInFoot && (
            <p className="text-felt-400 text-sm py-4">No cards in hand</p>
          )}
          {myCards.length === 0 && isInFoot && (
            <p className="text-green-400 text-sm py-4 font-semibold">
              All foot cards played! {isMyTurn ? 'Go out or you already did!' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Go out confirmation */}
      <AnimatePresence>
        {showGoOutConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-gold-500/20 border border-gold-500 rounded-xl p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-bold text-gold-300">Go out and end the round?</p>
              <p className="text-xs text-felt-300">
                Make sure your team has {gameState.rules.minCleanBooksToGoOut} clean + {gameState.rules.minDirtyBooksToGoOut} dirty closed books!
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowGoOutConfirm(false)}>Cancel</Button>
              <Button variant="gold" size="sm" onClick={handleGoOut}>Go Out!</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
