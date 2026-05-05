import { v4 as uuidv4 } from 'uuid';
import { Card, Rank, Suit } from '../types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function cardPointValue(rank: Rank, suit: Suit): number {
  if (rank === 'JOKER') return 50;
  if (rank === 'A' || rank === '2') return 20;
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
  // 3-9: 5pts
  return 5;
}

export function makeCard(suit: Suit, rank: Rank): Card {
  const isWild = rank === '2' || rank === 'JOKER';
  const isRed3 = rank === '3' && (suit === 'hearts' || suit === 'diamonds');
  const isBlack3 = rank === '3' && (suit === 'clubs' || suit === 'spades');
  return {
    id: uuidv4(),
    suit,
    rank,
    isWild,
    isRed3,
    isBlack3,
    pointValue: cardPointValue(rank, suit),
  };
}

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(makeCard(suit, rank));
    }
  }
  // 2 jokers per standard deck
  cards.push(makeCard('joker', 'JOKER'));
  cards.push(makeCard('joker', 'JOKER'));
  return cards;
}

export function buildMultiDeck(count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    cards.push(...buildDeck());
  }
  return shuffle(cards);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealCards(deck: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
}

export function generateGameCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getBookRank(cards: Card[]): Rank | null {
  const naturals = cards.filter((c) => !c.isWild && !c.isRed3 && !c.isBlack3);
  if (naturals.length === 0) return null;
  const rank = naturals[0].rank;
  if (naturals.every((c) => c.rank === rank)) return rank;
  return null;
}

export function isValidBookAdd(book: { cards: Card[]; isClean: boolean; isClosed: boolean }, newCards: Card[], rules: { maxWildsPerDirtyBook: number }): { valid: boolean; reason?: string } {
  if (newCards.length === 0) return { valid: false, reason: 'No cards provided' };

  const allCards = [...book.cards, ...newCards];
  const wilds = allCards.filter((c) => c.isWild);
  const naturals = allCards.filter((c) => !c.isWild);

  if (naturals.length === 0) return { valid: false, reason: 'Book must have at least one natural card' };

  const rank = naturals[0].rank;
  if (!naturals.every((c) => c.rank === rank)) return { valid: false, reason: 'All natural cards must be the same rank' };

  // 3s books: no wilds allowed
  if (rank === '3' && wilds.length > 0) return { valid: false, reason: 'Books of 3s cannot contain wilds' };

  if (wilds.length > 0 && book.isClean && book.isClosed) {
    return { valid: false, reason: 'Cannot make a closed clean book dirty' };
  }

  if (wilds.length > rules.maxWildsPerDirtyBook) {
    return { valid: false, reason: `Dirty books can only have ${rules.maxWildsPerDirtyBook} wilds` };
  }

  return { valid: true };
}

export function sortHand(cards: Card[]): Card[] {
  const rankOrder: Record<string, number> = {
    JOKER: 0, '2': 1, A: 2, K: 3, Q: 4, J: 5,
    '10': 6, '9': 7, '8': 8, '7': 9, '6': 10, '5': 11, '4': 12, '3': 13,
  };
  const suitOrder: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3, joker: 4 };

  return [...cards].sort((a, b) => {
    const rankDiff = (rankOrder[a.rank] ?? 99) - (rankOrder[b.rank] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return (suitOrder[a.suit] ?? 99) - (suitOrder[b.suit] ?? 99);
  });
}
