import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Card, ClientGameState } from '../../types';
import { CardComponent } from './CardComponent';
import { useGameStore } from '../../store/gameStore';
import { discardCard, drawDiscard, goOut } from '../../hooks/useSocket';
import { Button } from '../common/Button';
import { CardGroup, UNGROUPED_ID } from '../../hooks/useHandGroups';
import toast from 'react-hot-toast';

const CARD_W = 40;
const CARD_H = 56;
const LIFT = 14;
const MIN_STEP = 14;
const MAX_STEP = CARD_W + 6;

// Ghost drop-target rendered as a dotted card outline after the last card
function GhostDropTarget({ groupId, left }: { groupId: string; left: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `new-group-slot-${groupId}`,
    data: { type: 'new-group-slot' },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ position: 'absolute', left, top: LIFT, width: CARD_W, height: CARD_H }}
      className={`rounded-lg border-2 border-dashed transition-colors duration-150 ${
        isOver ? 'border-gold-400 bg-gold-500/10' : 'border-felt-600/40'
      }`}
    />
  );
}

interface SortableCardProps {
  card: Card;
  index: number;
  step: number;
  totalCards: number;
  selected: boolean;
  isNew: boolean;
  onSelect: () => void;
}

function SortableCard({ card, index, step, totalCards, selected, isNew, onSelect }: SortableCardProps) {
  const { setNodeRef, transform, isDragging, attributes, listeners } = useSortable({
    id: card.id,
    data: { card, type: 'hand-card' },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isNew ? 'rounded-lg ring-2 ring-sky-300/70 shadow-[0_0_8px_3px_rgba(125,211,252,0.35)]' : undefined}
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
      <CardComponent card={card} selected={selected} onClick={onSelect} isDragging={isDragging} size="sm" />
    </div>
  );
}

interface GroupRowProps {
  group: CardGroup;
  idToCard: Map<string, Card>;
  containerWidth: number;
  selectedCardIds: string[];
  newCardIds: Set<string>;
  hasOtherSelected: boolean;
  isUngrouped: boolean;
  onSelect: (id: string) => void;
  onMoveHere: () => void;
  onRemove: () => void;
}

function GroupRow({
  group, idToCard, containerWidth, selectedCardIds, newCardIds,
  hasOtherSelected, isUngrouped, onSelect, onMoveHere, onRemove,
}: GroupRowProps) {
  const cards = group.cardIds.map(id => idToCard.get(id)).filter(Boolean) as Card[];
  const n = cards.length;
  const effectiveStep = n <= 1 ? MAX_STEP : Math.max(MIN_STEP, Math.min(MAX_STEP, (containerWidth - CARD_W) / (n - 1)));
  const ghostLeft = n === 0 ? 0 : n * effectiveStep;
  const fanWidth = ghostLeft + CARD_W + 4; // include ghost card
  const fanHeight = CARD_H + LIFT + 4;

  return (
    <div>
      {/* Separator + controls for named groups */}
      {!isUngrouped && (
        <div className="flex items-center gap-2 px-1 mb-1">
          <div className="flex-1 h-px bg-felt-700" />
          {hasOtherSelected && (
            <button
              onClick={onMoveHere}
              className="text-xs px-1.5 py-0.5 rounded border border-felt-600 text-felt-400 hover:border-gold-500 hover:text-gold-400 transition-colors"
            >
              ← here
            </button>
          )}
          <button
            onClick={onRemove}
            title="Remove group (cards return to ungrouped)"
            className="text-felt-600 hover:text-red-400 transition-colors text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Move-here for ungrouped when some selected cards are in other groups */}
      {isUngrouped && hasOtherSelected && (
        <div className="flex justify-end px-1 mb-1">
          <button
            onClick={onMoveHere}
            className="text-xs px-1.5 py-0.5 rounded border border-felt-600 text-felt-400 hover:border-gold-500 hover:text-gold-400 transition-colors"
          >
            ← ungrouped
          </button>
        </div>
      )}

      <SortableContext items={group.cardIds} strategy={rectSortingStrategy}>
        <div className="overflow-x-auto">
          <div className="relative" style={{ width: Math.max(fanWidth, containerWidth), height: fanHeight }}>
            {cards.map((card, i) => (
              <SortableCard
                key={card.id}
                card={card}
                index={i}
                step={effectiveStep}
                totalCards={n}
                selected={selectedCardIds.includes(card.id)}
                isNew={newCardIds.has(card.id)}
                onSelect={() => onSelect(card.id)}
              />
            ))}
            <GhostDropTarget groupId={group.id} left={ghostLeft} />
          </div>
        </div>
      </SortableContext>
    </div>
  );
}

interface PlayerHandProps {
  gameState: ClientGameState;
  groups: CardGroup[];
  onMoveToGroup: (cardIds: string[], groupId: string) => void;
  onAddGroup: () => void;
  onRemoveGroup: (groupId: string) => void;
}

export function PlayerHand({ gameState, groups, onMoveToGroup, onAddGroup, onRemoveGroup }: PlayerHandProps) {
  const { selectedCardIds, toggleCardSelection, clearSelection } = useGameStore();
  const [showGoOutConfirm, setShowGoOutConfirm] = useState(false);
  const [containerWidth, setContainerWidth] = useState(360);
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef({ phase: gameState.turnPhase, myTurn: false, cardIds: new Set<string>() });

  const myIndex = gameState.myPlayerIndex;
  const me = myIndex >= 0 ? gameState.players[myIndex] : null;
  if (!me) return null;

  const isMyTurn = gameState.currentPlayerIndex === myIndex;
  const isDrawPhase = gameState.turnPhase === 'draw';
  const myCards = me.hand ?? [];
  const isInFoot = me.inFoot;
  const idToCard = new Map(myCards.map(c => [c.id, c]));

  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.offsetWidth);
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const prev = prevRef.current;
    const cardIds = new Set(myCards.map(c => c.id));
    if (isMyTurn) {
      if (prev.phase === 'draw' && gameState.turnPhase === 'play') {
        const added = [...cardIds].filter(id => !prev.cardIds.has(id));
        setNewCardIds(new Set(added));
      } else if (gameState.turnPhase === 'play' && cardIds.size < prev.cardIds.size) {
        setNewCardIds(new Set());
      }
    } else if (prev.myTurn) {
      setNewCardIds(new Set());
    }
    prevRef.current = { phase: gameState.turnPhase, myTurn: isMyTurn, cardIds };
  }, [gameState.turnPhase, gameState.currentPlayerIndex, myCards.length]);

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const canDrawDiscard =
    topDiscard && !topDiscard.isWild && !topDiscard.isRed3 && !topDiscard.isBlack3 &&
    myCards.filter(c => c.rank === topDiscard.rank && !c.isWild).length >= 2;

  const handleDiscard = () => {
    if (selectedCardIds.length !== 1) { toast.error('Select exactly 1 card to discard'); return; }
    discardCard(selectedCardIds[0]);
    clearSelection();
  };

  const handleDrawDiscard = () => {
    if (!topDiscard) return;
    const matching = myCards.filter(c => c.rank === topDiscard.rank && !c.isWild);
    drawDiscard([matching[0].id, matching[1].id]);
  };

  const handleMoveToGroup = (groupId: string) => {
    onMoveToGroup(selectedCardIds, groupId);
    clearSelection();
  };

  const selectedPoints = myCards.filter(c => selectedCardIds.includes(c.id)).reduce((s, c) => s + c.pointValue, 0);

  const hasSelectedOutside = (groupId: string) =>
    selectedCardIds.length > 0 &&
    !selectedCardIds.every(id => groups.find(g => g.id === groupId)?.cardIds.includes(id));

  return (
    <div className="bg-felt-900/90 border-t border-felt-700 p-3 space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between text-sm flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {gameState.players[gameState.currentPlayerIndex]?.isBot && !isMyTurn ? (
            <span className="font-semibold text-felt-300 animate-pulse">🤖 Bot is thinking...</span>
          ) : (
            <span className={`font-semibold ${isMyTurn ? 'text-gold-400' : 'text-felt-300'}`}>
              {isMyTurn ? '⭐ Your Turn' : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
            </span>
          )}
          {isMyTurn && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDrawPhase ? 'bg-blue-700 text-blue-200' : 'bg-green-700 text-green-200'}`}>
              {isDrawPhase ? 'Draw a card' : 'Play or Discard'}
            </span>
          )}
          <span className="text-felt-400">{isInFoot ? '👣 Foot' : '✋ Hand'} ({myCards.length})</span>
          {!isInFoot && me.footCount > 0 && <span className="text-felt-500 text-xs">Foot: {me.footCount}</span>}
        </div>
        <div className="flex items-center gap-2">
          {selectedCardIds.length > 0 && <span className="text-xs text-gold-400">{selectedCardIds.length} selected ({selectedPoints} pts)</span>}
          {selectedCardIds.length > 0 && <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>}
        </div>
      </div>

      {/* Action buttons */}
      {isMyTurn && !gameState.players[gameState.currentPlayerIndex]?.isBot && (
        <div className="flex gap-2 flex-wrap">
          {isDrawPhase ? (
            canDrawDiscard && (
              <Button variant="secondary" size="sm" onClick={handleDrawDiscard}>
                📥 Take Discard ({gameState.discardPile.length})
              </Button>
            )
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={selectedCardIds.length !== 1}>
                🗑 Discard Selected
              </Button>
              {isInFoot && myCards.length === 0 && (
                <Button variant="gold" size="sm" onClick={() => setShowGoOutConfirm(true)}>🏆 Go Out!</Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Groups */}
      <div ref={containerRef} className="w-full space-y-2 max-h-72 overflow-y-auto pr-1">
        {myCards.length === 0 ? (
          <div className="py-4 text-center">
            {isInFoot
              ? <p className="text-green-400 text-sm font-semibold">All foot cards played!</p>
              : <p className="text-felt-400 text-sm">No cards in hand</p>}
          </div>
        ) : (
          <>
            {groups.map(group => (
              <GroupRow
                key={group.id}
                group={group}
                idToCard={idToCard}
                containerWidth={containerWidth}
                selectedCardIds={selectedCardIds}
                newCardIds={newCardIds}
                hasOtherSelected={hasSelectedOutside(group.id)}
                isUngrouped={group.id === UNGROUPED_ID}
                onSelect={toggleCardSelection}
                onMoveHere={() => handleMoveToGroup(group.id)}
                onRemove={() => onRemoveGroup(group.id)}
              />
            ))}
            <button
              onClick={onAddGroup}
              className="text-xs text-felt-600 hover:text-felt-400 transition-colors flex items-center gap-1 px-1 pt-1"
            >
              + New Group
            </button>
          </>
        )}
      </div>

      {/* Go out confirmation */}
      <AnimatePresence>
        {showGoOutConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
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
