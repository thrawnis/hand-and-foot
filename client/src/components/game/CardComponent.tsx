import { motion } from 'framer-motion';
import type { DraggableAttributes } from '@dnd-kit/core';
import { Card } from '../../types';
import { suitSymbol, isRedSuit, rankDisplay } from '../../utils/cardUtils';

interface CardProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
  isDragging?: boolean;
  dragListeners?: { [key: string]: unknown };
  dragAttributes?: DraggableAttributes;
  dragRef?: (node: HTMLElement | null) => void;
}

export const sizes = {
  sm: { card: 'w-10 h-14 text-xs', rank: 'text-sm', suit: 'text-base' },
  md: { card: 'w-14 h-20 text-sm', rank: 'text-base', suit: 'text-xl' },
  lg: { card: 'w-16 h-24 text-base', rank: 'text-lg', suit: 'text-2xl' },
};

export function CardComponent({
  card,
  selected = false,
  onClick,
  disabled = false,
  faceDown = false,
  size = 'md',
  className = '',
  style,
  isDragging = false,
  dragListeners,
  dragAttributes,
  dragRef,
}: CardProps) {
  const isRed = isRedSuit(card.suit);
  const isWild = card.isWild;
  const is3 = card.isRed3 || card.isBlack3;

  const cardClasses = `
    relative rounded-lg border-2 select-none flex flex-col
    transition-colors duration-150
    ${sizes[size].card}
    ${faceDown ? 'bg-blue-800 border-blue-600 cursor-default' : 'bg-white cursor-pointer'}
    ${selected && !faceDown
      ? 'border-yellow-400 shadow-card-selected -translate-y-3 z-10'
      : !faceDown ? 'border-gray-200 hover:border-gray-400 hover:shadow-card-hover' : ''}
    ${isDragging ? 'opacity-40' : ''}
    ${disabled ? 'cursor-not-allowed opacity-60' : ''}
    ${isWild && !faceDown ? 'bg-gradient-to-br from-yellow-50 to-amber-100 border-amber-400' : ''}
    ${is3 && !faceDown ? (card.isRed3 ? 'bg-gradient-to-br from-red-50 to-pink-100 border-pink-400' : 'bg-gradient-to-br from-gray-50 to-slate-100 border-slate-400') : ''}
    shadow-card
    ${className}
  `;

  const textColor = faceDown ? 'text-blue-200'
    : isWild ? 'text-amber-600'
    : isRed ? 'text-red-600'
    : 'text-gray-900';

  if (faceDown) {
    return (
      <div className={cardClasses} style={style}>
        <div className="absolute inset-1 rounded bg-blue-700 border border-blue-600 flex items-center justify-center">
          <span className="text-blue-400 text-lg">🂠</span>
        </div>
      </div>
    );
  }

  if (card.rank === 'JOKER') {
    return (
      <motion.div
        ref={dragRef as any}
        {...(dragAttributes as any)}
        {...(dragListeners as any)}
        className={cardClasses}
        style={style}
        onClick={!disabled ? onClick : undefined}
        whileHover={!disabled && !selected ? { y: -4 } : {}}
        whileTap={!disabled ? { scale: 0.95 } : {}}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
          <div className="text-2xl">🃏</div>
          <div className="text-xs font-bold text-amber-600">WILD</div>
          {selected && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full text-xs flex items-center justify-center text-black">✓</div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={dragRef as any}
      {...(dragAttributes as any)}
      {...(dragListeners as any)}
      className={cardClasses}
      style={style}
      onClick={!disabled ? onClick : undefined}
      whileHover={!disabled && !selected ? { y: -4 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      {/* Top-left */}
      <div className={`absolute top-1 left-1.5 flex flex-col items-center gap-1 leading-none ${textColor}`}>
        <span className={`font-bold leading-none ${sizes[size].rank}`}>{rankDisplay(card.rank)}</span>
        <span className={`leading-none ${sizes[size].suit}`}>{suitSymbol(card.suit)}</span>
      </div>

      {/* Bottom-right (inverted) */}
      <div className={`absolute bottom-1 right-1.5 flex flex-col items-center gap-1 leading-none rotate-180 ${textColor}`}>
        <span className={`font-bold leading-none ${sizes[size].rank}`}>{rankDisplay(card.rank)}</span>
        <span className={`leading-none ${sizes[size].suit}`}>{suitSymbol(card.suit)}</span>
      </div>

      {isWild && (
        <div className="absolute top-0 right-0 bg-amber-400 text-amber-900 text-xs font-bold px-1 rounded-tr-lg rounded-bl-lg">W</div>
      )}

      {selected && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full text-xs flex items-center justify-center text-black font-bold z-10">✓</div>
      )}
    </motion.div>
  );
}

export function CardBack({ count, size = 'md', label }: { count: number; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className={`relative ${sizes[size].card} rounded-lg bg-blue-800 border-2 border-blue-600 shadow-card`}>
        <div className="absolute inset-1 rounded bg-blue-700 border border-blue-600 flex items-center justify-center">
          <span className="text-blue-400">🂠</span>
        </div>
        {count > 1 && (
          <div className="absolute -bottom-1 -right-1 bg-blue-900 border border-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {count}
          </div>
        )}
      </div>
      {label && <span className="text-xs text-felt-300">{label}</span>}
    </div>
  );
}
