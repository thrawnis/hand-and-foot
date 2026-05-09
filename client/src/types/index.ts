export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker';
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A' | 'JOKER';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  isWild: boolean;
  isRed3: boolean;
  isBlack3: boolean;
  pointValue: number;
}

export interface Book {
  id: string;
  rank: Rank;
  cards: Card[];
  isClean: boolean;
  isClosed: boolean;
}

export interface Team {
  index: number;
  name: string;
  playerIndices: number[];
  books: Book[];
  hasOpened: boolean;
  allInFoot: boolean;
}

export interface GameRules {
  playerCount: number;
  deckCount: number;
  cardsPerHand: number;
  minCardsPerBook: number;
  minCleanBooksToGoOut: number;
  minDirtyBooksToGoOut: number;
  maxWildsPerDirtyBook: number;
  cleanBookValue: number;
  dirtyBookValue: number;
  bookOf3sBonus: number;
  cleanBookOf7sBonus: number;
  goingOutBonus: number;
  roundThresholds: number[];
  numRounds: number;
  winningScore?: number;
  red3Penalty: number;
  black3Penalty: number;
}

export type TurnPhase = 'draw' | 'play' | 'discard';
export type GameStatus = 'waiting' | 'active' | 'completed' | 'archived';

export interface UndoRequest {
  requestedByIndex: number;
  approvals: number[];
  denials: number[];
}

export interface LogEntry {
  timestamp: number;
  playerName: string;
  action: string;
}

export interface RoundScore {
  teamIndex: number;
  bookPoints: number;
  cardPoints: number;
  penalties: number;
  goingOutBonus: number;
  total: number;
}

export interface ClientPlayer {
  id: string;
  name: string;
  teamIndex: number;
  handCount: number;
  footCount: number;
  inFoot: boolean;
  isConnected: boolean;
  isBot?: boolean;
  hand?: Card[];
  foot?: Card[];
}

export interface ClientGameState {
  id: string;
  code: string;
  status: GameStatus;
  rules: GameRules;
  players: ClientPlayer[];
  teams: Team[];
  currentRound: number;
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  stockCount: number;
  discardPile: Card[];
  lastActionAt: number;
  log: LogEntry[];
  roundScores: RoundScore[][];
  winnerTeamIndex?: number;
  myPlayerIndex: number;
  drawnFromDiscard: boolean;
  undoRequest: UndoRequest | null;
  hasUndoSnapshot: boolean;
}

export interface LobbyGame {
  id: string;
  code: string;
  status: GameStatus;
  playerCount: number;
  playerNames: string[];
  playerTeamIndices?: number[];
  lastActionAt: number;
  createdAt: number;
  currentRound: number;
  rules: Pick<GameRules, 'playerCount' | 'numRounds'>;
}

export interface RulePreset {
  id: string;
  name: string;
  rules: GameRules;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_RULES: GameRules = {
  playerCount: 4,
  deckCount: 5,
  cardsPerHand: 11,
  minCardsPerBook: 7,
  minCleanBooksToGoOut: 2,
  minDirtyBooksToGoOut: 1,
  maxWildsPerDirtyBook: 2,
  cleanBookValue: 500,
  dirtyBookValue: 300,
  bookOf3sBonus: 1000,
  cleanBookOf7sBonus: 1500,
  goingOutBonus: 100,
  roundThresholds: [50, 100, 150, 200, 250],
  numRounds: 5,
  red3Penalty: 100,
  black3Penalty: 50,
};
