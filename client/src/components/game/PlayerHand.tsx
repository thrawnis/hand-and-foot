import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Card, ClientGameState } from '../../types';
import { CardComponent } from './CardComponent';
import { useGameStore } from '../../store/gameStore';
import { discardCard, drawStock, drawDiscard, goOut } from '../../hooks/useSocket';
import { Button } from '../common/Button';
import toast from 'react-hot-toast';

// Card pixel dimensions for the 'sm' size used in the fan
const CARD_W = 40;
const CARD_H = 56;
const LIFT = 14;   // how far a selected card lifts above the baseline
const MIN_STEP = 14; // minimum px between card left-edges when heavily overlapped
const MAX_STEP = CARD_W + 6; // full spacing, no overlap

interface SortableCardProps {
  card: Card;
  index: number;
  step: number;
  totalCards: number;
  selected: boolean;
  onSelect: () => void;
}

function SortableCard({ card, index, step, totalCards, selected, onSelect }: SortableCardProps) {
  const { setNodeRef, transform, isDragging, attributes, listeners } = useSortable({
    id: card.id,
    data: { card, type: 'hand-card' },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: 'absolute',
        left: index * step,
        top: selected ? 0 : LIFT,
        zIndex: isDragging ? 1000 : selected ? totalCards + 5 : index + 1,
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : 'top 120ms ease',
        touchAction: 'none',
      }}
    >
      <CardComponent
        card={card}
        selected={selected}
        onClick={onSelect}
        isDragging={isDragging}
        size="sm"
      />
    </div>
  );
}

interface PlayerHandProps {
  gameState: ClientGameState;
  handOrder: string[];
  setHandOrder: (order: string[]) => void;
}

export function PlayerHand({ gameState, handOrder, setHandOrder }: PlayerHandProps) {
  const { selectedCardIds, toggleCardSelection, clearSelection } = useGameStore();
  const [showGoOutConfirm, setShowGoOutConfirm] = useState(false);
  const [containerWidth, setContainerWidth] = useState(360);
  const containerRef = useRef<HTMLDivElement>(null);

  const myIndex = gameState.myPlayerIndex;
  const me = myIndex >= 0 ? gameState.players[myIndex] : null;
  if (!me) return null;

  const isMyTurn = gameState.currentPlayerIndex === myIndex;
  const isDrawPhase = gameState.turnPhase === 'draw';
  const myCards = me.hand ?? [];
  const isInFoot = me.inFoot;

  // Track container width for fan step calculation
  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.offsetWidth);
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep handOrder in sync with actual cards
  useEffect(() => {
    const currentIds = myCards.map((c) => c.id);
    const valid = handOrder.filter((id) => currentIds.includes(id));
    const newCards = currentIds.filter((id) => !handOrder.includes(id));
    if (valid.length !== handOrder.length || newCards.length > 0) {
      setHandOrder([...valid, ...newCards]);
    }
  }, [myCards.map((c) => c.id).join(',')]);

  // Render cards in user's preferred order
  const idToCard = new Map(myCards.map((c) => [c.id, c]));
  const sortedCards = handOrder.map((id) => idToCard.get(id)).filter(Boolean) as Card[];

  // Fan layout: spread cards across the full container width with overlap when needed
  const n = sortedCards.length;
  const step = n <= 1 ? 0 : Math.max(MIN_STEP, Math.min(MAX_STEP, (containerWidth - CARD_W) / (n - 1)));
  const fanWidth = n <= 1 ? CARD_W : step * (n - 1) + CARD_W;
  const fanHeight = CARD_H + LIFT + 4;

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const canDrawDiscard =
    topDiscard &&
    !topDiscard.isWild &&
    !topDiscard.isRed3 &&
    !topDiscard.isBlack3 &&
    myCards.filter((c) => c.rank === topDiscard.rank && !c.isWild).length >= 2;

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
    drawDiscard([matching[0].id, matching[1].id]);
  };

  const selectedPoints = myCards
    .filter((c) => selectedCardIds.includes(c.id))
    .reduce((s, c) => s + c.pointValue, 0);

  return (
    <div className="bg-felt-900/90 border-t border-felt-700 p-3 space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between text-sm flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {gameState.players[gameState.currentPlayerIndex]?.isBot && !isMyTurn ? (
            <span className="font-semibold text-felt-300 animate-pulse">
              🤖 Bot is thinking...
            </span>
          ) : (
            <span className={`font-semibold ${isMyTurn ? 'text-gold-400' : 'text-felt-300'}`}>
              {isMyTurn ? '⭐ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
            </span>
          )}
          {isMyTurn && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isDrawPhase ? 'bg-blue-700 text-blue-200' : 'bg-green-700 text-green-200'
            }`}>
              {isDrawPhase ? 'Draw a card' : 'Play or Discard'}
            </span>
          )}
          <span className="text-felt-400">
            {isInFoot ? '👣 Foot' : '✋ Hand'} ({myCards.length})
          </span>
          {!isInFoot && me.footCount > 0 && (
            <span className="text-orange-400 text-xs">🥾 Foot waiting ({me.footCount})</span>
          )}
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
      {isMyTurn && !gameState.players[gameState.currentPlayerIndex]?.isBot && (
        <div className="flex gap-2 flex-wrap">
          {isDrawPhase ? (
            <>
              <Button variant="primary" size="sm" onClick={drawStock}>🃏 Draw 2</Button>
              {canDrawDiscard && (
                <Button variant="secondary" size="sm" onClick={handleDrawDiscard}>
                  📥 Take Discard ({gameState.discardPile.length})
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={selectedCardIds.length !== 1}>
                🗑 Discard Selected
              </Button>
              {isInFoot && myCards.length === 0 && (
                <Button variant="gold" size="sm" onClick={() => setShowGoOutConfirm(true)}>
                  🏆 Go Out!
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Fan hand layout — all cards visible without scrolling */}
      <div ref={containerRef} className="w-full">
        {myCards.length === 0 ? (
          <div className="py-4 text-center">
            {isInFoot
              ? <p className="text-green-400 text-sm font-semibold">All foot cards played!</p>
              : <p className="text-felt-400 text-sm">No cards in hand</p>
            }
          </div>
        ) : (
          <SortableContext items={handOrder} strategy={rectSortingStrategy}>
            {/* outer div scrolls only as a last resort for very large hands */}
            <div className="overflow-x-auto">
              <div className="relative" style={{ width: Math.max(fanWidth, containerWidth), height: fanHeight }}>
                {sortedCards.map((card, i) => (
                  <SortableCard
                    key={card.id}
                    card={card}
                    index={i}
                    step={step}
                    totalCards={n}
                    selected={selectedCardIds.includes(card.id)}
                    onSelect={() => toggleCardSelection(card.id)}
                  />
                ))}
              </div>
            </div>
          </SortableContext>
        )}
      </div>

      {/* Go out confirmation */}
      <AnimatePresence>
        {showGoOutConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-gold-500/20 border border-gold-500 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div>
              <p className="font-bold text-gold-300">Go out and end the round?</p>
              <p className="text-xs text-felt-300">
                Team needs {gameState.rules.minCleanBooksToGoOut} clean + {gameState.rules.minDirtyBooksToGoOut} dirty closed books, all members in foot.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setShowGoOutConfirm(false)}>Cancel</Button>
              <Button variant="gold" size="sm" onClick={() => { setShowGoOutConfirm(false); goOut(); }}>Go Out!</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
