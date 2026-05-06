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

export interface Player {
  id: string;
  name: string;
  teamIndex: number;
  hand: Card[];
  foot: Card[];
  inFoot: boolean;
  isConnected: boolean;
  socketId?: string;
  sessionToken: string;
  isBot?: boolean;
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

export interface GameState {
  id: string;
  code: string;
  status: GameStatus;
  rules: GameRules;
  players: Player[];
  teams: Team[];
  currentRound: number;
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  stockPile: Card[];
  discardPile: Card[];
  lastActionAt: number;
  createdAt: number;
  log: LogEntry[];
  roundScores: RoundScore[][];
  winnerTeamIndex?: number;
  drawnFromDiscard: boolean;
  lastTurnSnapshot: Omit<GameState, 'lastTurnSnapshot' | 'undoRequest'> | null;
  undoRequest: UndoRequest | null;
}

// What each client sees (hands masked for non-self players)
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

// Socket event payloads
export interface JoinGamePayload {
  gameCode: string;
  playerName: string;
  sessionToken?: string;
}

export interface DrawDiscardPayload {
  matchingCardIds: [string, string];
}

export interface PlayCardsPayload {
  action: 'new-book' | 'add-to-book';
  cardIds: string[];
  bookId?: string;
  rank?: Rank;
  teamIndex?: number;
}

export interface DiscardPayload {
  cardId: string;
}

export interface CloseBookPayload {
  bookId: string;
  teamIndex: number;
}

export interface KickTabPayload {
  choice: 'kick' | 'block';
}

export interface CreateGamePayload {
  hostName: string;
  rules: GameRules;
  playerNames: string[];
  teamNames?: string[];
  botSlots?: boolean[];
}

export interface SecondTabPrompt {
  gameCode: string;
  playerName: string;
}
