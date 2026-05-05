import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { Book, GameRules, Card } from '../../types';
import { CardComponent } from './CardComponent';
import { getBookBonusLabel, countWilds } from '../../utils/cardUtils';
import { Button } from '../common/Button';

interface BookDisplayProps {
  book: Book;
  rules: GameRules;
  isMyTeam: boolean;
  isMyTurn: boolean;
  onClose?: () => void;
  onAddSelected?: () => void;
  hasSelectedCards?: boolean;
  selectedCardsCount?: number;
}

export function BookDisplay({
  book,
  rules,
  isMyTeam,
  isMyTurn,
  onClose,
  onAddSelected,
  hasSelectedCards,
  selectedCardsCount = 0,
}: BookDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: `book-${book.id}`,
    data: { bookId: book.id, type: 'book' },
    disabled: !isMyTeam || !isMyTurn,
  });

  const wildCount = countWilds(book.cards);
  const naturalCount = book.cards.filter((c) => !c.isWild).length;
  const canClose = !book.isClosed && book.cards.length >= rules.minCardsPerBook;

  const bookTypeColor = book.isClosed
    ? book.isClean
      ? 'border-yellow-400 bg-yellow-900/20'
      : 'border-purple-400 bg-purple-900/20'
    : book.isClean
    ? 'border-green-500 bg-green-900/20'
    : 'border-orange-400 bg-orange-900/20';

  const bookLabel = book.isClosed
    ? book.isClean ? 'Closed Clean' : 'Closed Dirty'
    : book.isClean ? 'Open Clean' : 'Open Dirty';

  // Fan display of top cards
  const displayCards = book.cards.slice(-5);

  return (
    <motion.div
      ref={setNodeRef}
      layout
      className={`relative rounded-xl border-2 p-3 transition-all cursor-pointer ${bookTypeColor} ${
        isOver ? 'ring-2 ring-gold-400 scale-105' : ''
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-white text-lg">{book.rank}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            book.isClosed
              ? book.isClean ? 'bg-yellow-600 text-yellow-100' : 'bg-purple-700 text-purple-100'
              : book.isClean ? 'bg-green-700 text-green-100' : 'bg-orange-700 text-orange-100'
          }`}>
            {bookLabel}
          </span>
          {book.isClosed && (
            <span className="text-xs font-bold text-gold-400">
              {getBookBonusLabel(book.rank, book.isClean, rules)}
            </span>
          )}
        </div>
        <span className="text-felt-300 text-xs">{book.cards.length} cards</span>
      </div>

      {/* Fan of cards */}
      <div className="relative h-14 flex items-end">
        {displayCards.map((card, i) => (
          <div
            key={card.id}
            className="absolute"
            style={{ left: i * 14, zIndex: i }}
          >
            <CardComponent card={card} size="sm" />
          </div>
        ))}
        {book.cards.length > 5 && (
          <div className="absolute right-0 top-0 text-felt-300 text-xs">
            +{book.cards.length - 5}
          </div>
        )}
      </div>

      {/* Wild indicator */}
      {wildCount > 0 && (
        <div className="mt-1 flex items-center gap-1 text-xs text-amber-400">
          <span>⚡</span>
          <span>{wildCount}/{rules.maxWildsPerDirtyBook} wilds</span>
        </div>
      )}

      {/* Drop zone hint */}
      {isOver && (
        <div className="absolute inset-0 rounded-xl bg-gold-400/20 border-2 border-gold-400 flex items-center justify-center">
          <span className="text-gold-300 font-bold">Drop here!</span>
        </div>
      )}

      {/* Expanded view */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex flex-wrap gap-1">
                {book.cards.map((card) => (
                  <CardComponent key={card.id} card={card} size="sm" />
                ))}
              </div>
              {isMyTeam && isMyTurn && (
                <div className="mt-3 flex gap-2">
                  {hasSelectedCards && onAddSelected && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onAddSelected(); }}
                    >
                      + Add {selectedCardsCount} card{selectedCardsCount !== 1 ? 's' : ''}
                    </Button>
                  )}
                  {canClose && onClose && (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onClose(); }}
                    >
                      Close Book
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
