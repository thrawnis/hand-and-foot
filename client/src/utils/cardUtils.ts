import { Card, Rank, Suit } from '../types';

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    case 'spades': return '♠';
    case 'joker': return '★';
  }
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

export function rankDisplay(rank: Rank): string {
  if (rank === 'JOKER') return '🃏';
  return rank;
}

export function cardLabel(card: Card): string {
  if (card.rank === 'JOKER') return 'Joker';
  return `${card.rank}${suitSymbol(card.suit)}`;
}

export function groupCardsByRank(cards: Card[]): Map<Rank, Card[]> {
  const map = new Map<Rank, Card[]>();
  for (const card of cards) {
    const group = map.get(card.rank) ?? [];
    group.push(card);
    map.set(card.rank, group);
  }
  return map;
}

export function getBookBonusLabel(rank: Rank, isClean: boolean, rules: { cleanBookValue: number; dirtyBookValue: number; bookOf3sBonus: number; cleanBookOf7sBonus: number }): string {
  if (rank === '3') return `+${rules.bookOf3sBonus}`;
  if (rank === '7' && isClean) return `+${rules.cleanBookOf7sBonus}`;
  return isClean ? `+${rules.cleanBookValue}` : `+${rules.dirtyBookValue}`;
}

export function canCardGoInBook(card: Card, bookRank: Rank, bookIsClean: boolean, bookIsClosed: boolean, wildCount: number, maxWilds: number): boolean {
  if (card.isWild) {
    if (bookRank === '3') return false; // 3s books can't have wilds
    if (bookIsClean && bookIsClosed) return false; // closed clean stays clean
    if (wildCount >= maxWilds) return false;
    return true;
  }
  if (card.isRed3 || card.isBlack3) {
    return bookRank === '3' && !bookIsClosed;
  }
  return card.rank === bookRank;
}

export function countWilds(cards: Card[]): number {
  return cards.filter((c) => c.isWild).length;
}

export function totalPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.pointValue, 0);
}
