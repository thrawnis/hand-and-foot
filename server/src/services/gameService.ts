import { v4 as uuidv4 } from 'uuid';
import {
  GameState, GameRules, Player, Team, Book, Card, Rank,
  ClientGameState, ClientPlayer, LobbyGame, TurnPhase, SeatRequest,
  CreateGamePayload, DrawDiscardPayload, PlayCardsPayload,
  DiscardPayload, CloseBookPayload,
} from '../types';
import {
  buildMultiDeck, dealCards, generateGameCode, shuffle,
  isValidBookAdd, sortHand,
} from './deckService';
import { scoreRound, cumulativeScores, canTeamOpen, teamMeetsGoOutRequirements } from './scoringService';
import { saveGame, loadGameByCode } from '../db';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(state: GameState, playerName: string, action: string): void {
  state.log.push({ timestamp: Date.now(), playerName, action });
  if (state.log.length > 200) state.log.shift();
  state.lastActionAt = Date.now();
}

function findCardInHand(player: Player, cardId: string): Card | undefined {
  const source = player.inFoot ? player.foot : player.hand;
  return source.find((c) => c.id === cardId);
}

function removeCardsFromPlayer(player: Player, cardIds: string[]): Card[] {
  const removed: Card[] = [];
  const source = player.inFoot ? player.foot : player.hand;
  const remaining: Card[] = [];
  for (const card of source) {
    if (cardIds.includes(card.id)) {
      removed.push(card);
    } else {
      remaining.push(card);
    }
  }
  if (player.inFoot) {
    player.foot = remaining;
  } else {
    player.hand = remaining;
  }
  return removed;
}

function pickUpFoot(player: Player): void {
  if (!player.inFoot && player.hand.length === 0 && player.foot.length > 0) {
    player.inFoot = true;
  }
}

function updateTeamAllInFoot(state: GameState): void {
  for (const team of state.teams) {
    team.allInFoot = team.playerIndices.every((i) => state.players[i].inFoot);
  }
}

function nextPlayerIndex(state: GameState): number {
  let next = (state.currentPlayerIndex + 1) % state.players.length;
  // Skip disconnected players? No — keep turn order but allow disconnected to timeout
  return next;
}

function reshuffleDiscardIntoStock(state: GameState): void {
  const top = state.discardPile[state.discardPile.length - 1];
  const rest = state.discardPile.slice(0, -1);
  state.stockPile = shuffle(rest);
  state.discardPile = top ? [top] : [];
  log(state, 'System', 'Discard pile reshuffled into stock');
}

// Whether this player's team could end the round right now. `books` lets callers
// ask "what if these books existed" before committing a play.
export function goOutCheck(
  state: GameState,
  playerIndex: number,
  books?: Book[],
): { ok: boolean; reason?: string } {
  const player = state.players[playerIndex];
  const team = state.teams[player.teamIndex];
  if (!player.inFoot) return { ok: false, reason: 'Must be in your foot to go out' };
  if (!team.playerIndices.every((i) => state.players[i].inFoot)) {
    return { ok: false, reason: 'All team members must have picked up their foot' };
  }
  const req = teamMeetsGoOutRequirements({ ...team, books: books ?? team.books }, state.rules);
  return req.meets ? { ok: true } : { ok: false, reason: req.reason };
}

// A player in their foot must always be able to finish the turn: they either
// discard (needs a card to spare) or go out. So a play may not leave them with
// fewer than 2 cards unless the team could go out afterwards.
function footRetentionError(
  state: GameState,
  playerIndex: number,
  cardsLeft: number,
  hypotheticalBooks: Book[],
): string | null {
  const player = state.players[playerIndex];
  if (!player.inFoot || cardsLeft >= 2) return null;
  const chk = goOutCheck(state, playerIndex, hypotheticalBooks);
  if (chk.ok) return null;
  return `Your team can't go out yet (${chk.reason}), so keep at least 2 cards in your foot — one to discard and one to hold.`;
}

// ── Game creation ─────────────────────────────────────────────────────────────

function snapshotState(state: GameState): Omit<GameState, 'lastTurnSnapshot' | 'undoRequest'> {
  // Deep copy via JSON (acceptable for game state size)
  const { lastTurnSnapshot, undoRequest, seatRequest, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

export function createGame(payload: CreateGamePayload): GameState {
  const { hostName, rules, playerNames, teamNames, botSlots } = payload;
  const deckCount = rules.playerCount + 1;
  const fullRules = { ...DEFAULT_RULES, ...rules, deckCount };

  let stock = buildMultiDeck(deckCount);
  const players: Player[] = playerNames.map((rawName, i) => {
    const name = rawName.trim() || `Player ${i + 1}`;
    const { dealt: hand, remaining: r1 } = dealCards(stock, fullRules.cardsPerHand);
    stock = r1;
    const { dealt: foot, remaining: r2 } = dealCards(stock, fullRules.cardsPerHand);
    stock = r2;
    return {
      id: uuidv4(),
      name,
      teamIndex: i % 2,
      hand: sortHand(hand),
      foot: sortHand(foot),
      inFoot: false,
      isConnected: botSlots?.[i] === true,
      sessionToken: uuidv4(),
      isBot: botSlots?.[i] === true,
    };
  });

  // Build teams
  const teamCount = fullRules.playerCount === 2 ? 2 : 2;
  const teams: Team[] = [];
  for (let t = 0; t < teamCount; t++) {
    teams.push({
      index: t,
      name: teamNames?.[t]?.trim() || `Team ${t + 1}`,
      playerIndices: players.reduce<number[]>((acc, p, i) => (p.teamIndex === t ? [...acc, i] : acc), []),
      books: [],
      hasOpened: false,
      allInFoot: false,
    });
  }

  // For 2-player, teams are 1v1
  if (fullRules.playerCount === 2) {
    players[0].teamIndex = 0;
    players[1].teamIndex = 1;
    teams[0].playerIndices = [0];
    teams[1].playerIndices = [1];
  }

  const state: GameState = {
    id: uuidv4(),
    code: generateGameCode(),
    status: 'active',
    rules: fullRules,
    players,
    teams,
    currentRound: 1,
    currentPlayerIndex: 0,
    turnPhase: 'draw',
    stockPile: stock,
    discardPile: [],
    lastActionAt: Date.now(),
    createdAt: Date.now(),
    log: [],
    roundScores: [],
    drawnFromDiscard: false,
    lastTurnSnapshot: null,
    undoRequest: null,
    seatRequest: null,
  };

  log(state, 'System', `Game started. Round 1 of ${fullRules.numRounds}.`);
  saveGame(state);
  return state;
}

// ── Client view ───────────────────────────────────────────────────────────────

export function toClientState(state: GameState, playerIndex: number): ClientGameState {
  const clientPlayers: ClientPlayer[] = state.players.map((p, i) => {
    const isMe = i === playerIndex;
    return {
      id: p.id,
      name: p.name,
      teamIndex: p.teamIndex,
      handCount: p.hand.length,
      footCount: p.foot.length,
      inFoot: p.inFoot,
      isConnected: p.isConnected,
      isBot: p.isBot,
      disconnectedAt: p.isBot ? undefined : p.disconnectedAt,
      hand: isMe ? p.hand : undefined,
      foot: isMe ? (p.inFoot ? p.foot : undefined) : undefined,
    };
  });

  return {
    id: state.id,
    code: state.code,
    status: state.status,
    rules: state.rules,
    players: clientPlayers,
    teams: state.teams,
    currentRound: state.currentRound,
    currentPlayerIndex: state.currentPlayerIndex,
    turnPhase: state.turnPhase,
    stockCount: state.stockPile.length,
    discardPile: state.discardPile,
    lastActionAt: state.lastActionAt,
    log: state.log.slice(-50),
    roundScores: state.roundScores,
    winnerTeamIndex: state.winnerTeamIndex,
    myPlayerIndex: playerIndex,
    drawnFromDiscard: state.drawnFromDiscard,
    undoRequest: state.undoRequest,
    hasUndoSnapshot: state.lastTurnSnapshot !== null,
    seatRequest: state.seatRequest
      ? { ...state.seatRequest, pendingApproverIndexes: pendingApprovers(state, state.seatRequest) }
      : null,
  };
}

export function toLobbyGame(state: GameState): LobbyGame {
  return {
    id: state.id,
    code: state.code,
    status: state.status,
    playerCount: state.players.length,
    playerNames: state.players.map((p) => p.name),
    playerTeamIndices: state.players.map((p) => p.teamIndex),
    playerIsBot: state.players.map((p) => !!p.isBot),
    lastActionAt: state.lastActionAt,
    createdAt: state.createdAt,
    currentRound: state.currentRound,
    rules: { playerCount: state.rules.playerCount, numRounds: state.rules.numRounds },
  };
}

// ── Turn actions ──────────────────────────────────────────────────────────────

export function drawFromStock(state: GameState, playerIndex: number): { ok: boolean; error?: string } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase !== 'draw') return { ok: false, error: 'Already drew this turn' };

  // Save snapshot before first draw of turn (in case undo is requested)
  if (!state.lastTurnSnapshot) {
    state.lastTurnSnapshot = snapshotState(state);
  }

  if (state.stockPile.length < 2) {
    reshuffleDiscardIntoStock(state);
  }
  if (state.stockPile.length < 2) return { ok: false, error: 'Not enough cards in stock' };

  const player = state.players[playerIndex];
  const drawn = state.stockPile.splice(0, 2);
  if (player.inFoot) {
    player.foot.push(...drawn);
    player.foot = sortHand(player.foot);
  } else {
    player.hand.push(...drawn);
    player.hand = sortHand(player.hand);
  }

  state.turnPhase = 'play';
  state.drawnFromDiscard = false;
  log(state, player.name, 'Drew 2 cards from stock');
  saveGame(state);
  return { ok: true };
}

export function drawFromDiscard(state: GameState, playerIndex: number, payload: DrawDiscardPayload): { ok: boolean; error?: string } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase !== 'draw') return { ok: false, error: 'Already drew this turn' };
  if (state.discardPile.length === 0) return { ok: false, error: 'Discard pile is empty' };

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (topCard.isWild) return { ok: false, error: 'Cannot draw wild card from discard' };
  if (topCard.isRed3 || topCard.isBlack3) return { ok: false, error: 'Cannot draw 3 from discard' };

  const player = state.players[playerIndex];
  const source = player.inFoot ? player.foot : player.hand;

  // Save snapshot before draw from discard
  if (!state.lastTurnSnapshot) {
    state.lastTurnSnapshot = snapshotState(state);
  }

  const matchingInHand = source.filter((c) => c.rank === topCard.rank && !c.isWild);
  if (matchingInHand.length < 2) return { ok: false, error: 'Need 2 matching cards in hand to take discard' };

  // Verify the two cards provided are in hand
  const provided = source.filter((c) => payload.matchingCardIds.includes(c.id));
  if (provided.length < 2) return { ok: false, error: 'Provided card IDs not found in hand' };
  if (provided.some((c) => c.rank !== topCard.rank || c.isWild)) {
    return { ok: false, error: 'Provided cards do not match discard rank' };
  }

  const taken = [...state.discardPile];
  state.discardPile = [];

  if (player.inFoot) {
    player.foot.push(...taken);
    player.foot = sortHand(player.foot);
  } else {
    player.hand.push(...taken);
    player.hand = sortHand(player.hand);
  }

  state.turnPhase = 'play';
  state.drawnFromDiscard = true;
  log(state, player.name, `Took discard pile (${taken.length} cards)`);
  saveGame(state);
  return { ok: true };
}

export function playCards(state: GameState, playerIndex: number, payload: PlayCardsPayload): { ok: boolean; error?: string } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase === 'draw') return { ok: false, error: 'Must draw first' };

  const player = state.players[playerIndex];
  const team = state.teams[player.teamIndex];
  const source = player.inFoot ? player.foot : player.hand;

  // Validate all card IDs exist in player's current hand
  const cardsToPlay = source.filter((c) => payload.cardIds.includes(c.id));
  if (cardsToPlay.length !== payload.cardIds.length) {
    return { ok: false, error: 'Some cards not found in your hand' };
  }

  if (payload.action === 'new-book') {
    if (!payload.rank) return { ok: false, error: 'Rank required for new book' };

    const naturals = cardsToPlay.filter((c) => !c.isWild);
    if (naturals.length === 0) return { ok: false, error: 'Book needs at least one natural card' };
    if (!naturals.every((c) => c.rank === payload.rank)) {
      return { ok: false, error: 'All natural cards must match the book rank' };
    }
    if (payload.rank === '3') {
      if (cardsToPlay.some((c) => c.isWild)) return { ok: false, error: 'Books of 3s cannot have wilds' };
    }
    const wilds = cardsToPlay.filter((c) => c.isWild);
    if (wilds.length > state.rules.maxWildsPerDirtyBook) {
      return { ok: false, error: `Max ${state.rules.maxWildsPerDirtyBook} wilds per book` };
    }

    // Check team opening requirements
    if (!team.hasOpened) {
      const { canOpen } = canTeamOpen(team, payload.cardIds, state);
      if (!canOpen) {
        const threshold = state.rules.roundThresholds[state.currentRound - 1];
        return { ok: false, error: `First open must be worth at least ${threshold} pts (natural cards only)` };
      }
    }

    const isClean = wilds.length === 0;
    const book: Book = {
      id: uuidv4(),
      rank: payload.rank as Rank,
      cards: cardsToPlay,
      isClean,
      isClosed: cardsToPlay.length >= state.rules.minCardsPerBook,
    };

    const keepErr = footRetentionError(state, playerIndex, source.length - cardsToPlay.length, [...team.books, book]);
    if (keepErr) return { ok: false, error: keepErr };

    team.books.push(book);
    if (!team.hasOpened) team.hasOpened = true;
    removeCardsFromPlayer(player, payload.cardIds);
    pickUpFoot(player);
    updateTeamAllInFoot(state);

    log(state, player.name, `Started ${isClean ? 'clean' : 'dirty'} book of ${payload.rank}s`);
  } else if (payload.action === 'add-to-book') {
    if (!payload.bookId) return { ok: false, error: 'bookId required' };

    // Find the book — can be any team's book if teamIndex provided, else player's team
    const targetTeamIndex = payload.teamIndex ?? player.teamIndex;
    const targetTeam = state.teams[targetTeamIndex];
    if (!targetTeam) return { ok: false, error: 'Team not found' };
    if (targetTeamIndex !== player.teamIndex) return { ok: false, error: 'Can only add to your own team\'s books' };

    const book = targetTeam.books.find((b) => b.id === payload.bookId);
    if (!book) return { ok: false, error: 'Book not found' };

    const valid = isValidBookAdd(book, cardsToPlay, state.rules);
    if (!valid.valid) return { ok: false, error: valid.reason };

    // 3s book: cannot add more once closed (7 cards)
    if (book.rank === '3' && book.isClosed) {
      return { ok: false, error: 'Cannot add to a closed book of 3s' };
    }

    // Check team opening
    if (!team.hasOpened) {
      const { canOpen } = canTeamOpen(team, payload.cardIds, state);
      if (!canOpen) {
        const threshold = state.rules.roundThresholds[state.currentRound - 1];
        return { ok: false, error: `First open must be worth at least ${threshold} pts` };
      }
    }

    const newWilds = cardsToPlay.filter((c) => c.isWild);
    const combinedCount = book.cards.length + cardsToPlay.length;
    const afterAdd: Book = {
      ...book,
      cards: [...book.cards, ...cardsToPlay],
      isClean: book.isClean && newWilds.length === 0,
      isClosed: book.isClosed || combinedCount >= state.rules.minCardsPerBook,
    };
    const keepErr = footRetentionError(
      state, playerIndex, source.length - cardsToPlay.length,
      targetTeam.books.map((b) => (b.id === book.id ? afterAdd : b)),
    );
    if (keepErr) return { ok: false, error: keepErr };

    if (newWilds.length > 0 && book.isClean) {
      book.isClean = false;
    }

    book.cards.push(...cardsToPlay);
    if (!book.isClosed && book.cards.length >= state.rules.minCardsPerBook) {
      book.isClosed = true;
    }
    if (!team.hasOpened) team.hasOpened = true;

    removeCardsFromPlayer(player, payload.cardIds);
    pickUpFoot(player);
    updateTeamAllInFoot(state);

    log(state, player.name, `Added ${cardsToPlay.length} card(s) to ${book.rank}s book`);
  }

  saveGame(state);
  return { ok: true };
}

export function closeBook(state: GameState, playerIndex: number, payload: CloseBookPayload): { ok: boolean; error?: string } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase === 'draw') return { ok: false, error: 'Must draw first' };

  const player = state.players[playerIndex];
  if (payload.teamIndex !== player.teamIndex) return { ok: false, error: 'Not your team\'s book' };

  const team = state.teams[payload.teamIndex];
  const book = team.books.find((b) => b.id === payload.bookId);
  if (!book) return { ok: false, error: 'Book not found' };
  if (book.isClosed) return { ok: false, error: 'Book already closed' };
  if (book.cards.length < state.rules.minCardsPerBook) {
    return { ok: false, error: `Need at least ${state.rules.minCardsPerBook} cards to close` };
  }

  book.isClosed = true;
  log(state, player.name, `Closed ${book.isClean ? 'clean' : 'dirty'} book of ${book.rank}s`);
  saveGame(state);
  return { ok: true };
}

export function discardCard(state: GameState, playerIndex: number, payload: DiscardPayload): { ok: boolean; error?: string; roundOver?: boolean } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase !== 'play' && state.turnPhase !== 'discard') return { ok: false, error: 'Cannot discard now' };

  const player = state.players[playerIndex];
  const source = player.inFoot ? player.foot : player.hand;
  const card = source.find((c) => c.id === payload.cardId);
  if (!card) return { ok: false, error: 'Card not found in hand' };

  // Discarding the last foot card is how you go out — only legal when the team can.
  const goingOut = player.inFoot && source.length === 1;
  if (goingOut) {
    const chk = goOutCheck(state, playerIndex);
    if (!chk.ok) return { ok: false, error: `Can't discard your last card — your team can't go out yet (${chk.reason}).` };
  }

  removeCardsFromPlayer(player, [payload.cardId]);
  state.discardPile.push(card);

  if (goingOut) {
    log(state, player.name, `Went out by discarding ${card.rank} of ${card.suit}`);
    finishRound(state, playerIndex);
    saveGame(state);
    return { ok: true, roundOver: true };
  }

  // Auto pick up foot if hand is empty
  if (!player.inFoot && player.hand.length === 0) {
    pickUpFoot(player);
    updateTeamAllInFoot(state);
    log(state, player.name, 'Picked up foot');
  }

  // Save snapshot for the incoming player's turn (enables undo)
  state.lastTurnSnapshot = snapshotState(state);
  state.undoRequest = null;

  state.turnPhase = 'draw';
  state.currentPlayerIndex = nextPlayerIndex(state);
  log(state, player.name, `Discarded ${card.rank} of ${card.suit}`);
  saveGame(state);
  return { ok: true };
}

export function requestUndo(state: GameState, playerIndex: number): { ok: boolean; error?: string } {
  if (!state.lastTurnSnapshot) return { ok: false, error: 'Nothing to undo' };
  if (state.undoRequest) return { ok: false, error: 'An undo request is already pending' };
  state.undoRequest = {
    requestedByIndex: playerIndex,
    approvals: [playerIndex],
    denials: [],
  };
  log(state, state.players[playerIndex].name, 'Requested an undo — waiting for all players to approve');
  saveGame(state);
  return { ok: true };
}

export function respondUndo(
  state: GameState,
  playerIndex: number,
  approve: boolean,
): { ok: boolean; error?: string; applied?: boolean } {
  if (!state.undoRequest) return { ok: false, error: 'No undo request pending' };
  if (state.undoRequest.approvals.includes(playerIndex) || state.undoRequest.denials.includes(playerIndex)) {
    return { ok: false, error: 'Already responded' };
  }

  const player = state.players[playerIndex];

  if (!approve) {
    log(state, player.name, 'Denied the undo request');
    state.undoRequest = null;
    saveGame(state);
    return { ok: true, applied: false };
  }

  state.undoRequest.approvals.push(playerIndex);

  if (state.undoRequest.approvals.length >= state.players.length) {
    // Everyone approved — apply undo
    const snap = state.lastTurnSnapshot!;
    // Who is a bot / connected / which socket they use is live information, not
    // part of the turn being reverted — keep it, or undo would turn converted
    // bots back into absent humans and drop everyone's connection.
    const live = state.players.map((p) => ({
      isBot: p.isBot,
      isConnected: p.isConnected,
      socketId: p.socketId,
      sessionToken: p.sessionToken,
      disconnectedAt: p.disconnectedAt,
    }));
    const seatRequest = state.seatRequest ?? null;
    Object.assign(state, snap, { lastTurnSnapshot: null, undoRequest: null, seatRequest });
    state.players.forEach((p, i) => Object.assign(p, live[i]));
    log(state, 'System', 'Undo approved by all players — last turn reverted');
    saveGame(state);
    return { ok: true, applied: true };
  }

  log(state, player.name, 'Approved the undo request');
  saveGame(state);
  return { ok: true, applied: false };
}

export function cancelUndo(state: GameState, playerIndex: number): { ok: boolean; error?: string } {
  if (!state.undoRequest) return { ok: false, error: 'No undo request pending' };
  if (state.undoRequest.requestedByIndex !== playerIndex) return { ok: false, error: 'Only the requester can cancel' };
  state.undoRequest = null;
  log(state, state.players[playerIndex].name, 'Cancelled their undo request');
  saveGame(state);
  return { ok: true };
}

// ── Seat control: absent player → bot, bot → human again ──────────────────────

function isPresentHuman(p: Player): boolean {
  return !p.isBot && p.isConnected;
}

// Everyone who still has to approve: every connected human except the target seat.
export function pendingApprovers(state: GameState, req: SeatRequest): number[] {
  const out: number[] = [];
  state.players.forEach((p, i) => {
    if (i !== req.targetIndex && isPresentHuman(p) && !req.approvals.includes(i)) out.push(i);
  });
  return out;
}

export type SeatResult = {
  ok: boolean;
  error?: string;
  applied?: 'convert-to-bot' | 'take-over';
  targetIndex?: number;
};

// Applies the pending request once nobody is left to approve. Also drops a
// request whose premise no longer holds (absent player came back, bot is gone).
export function evaluateSeatRequest(state: GameState): SeatResult {
  const req = state.seatRequest;
  if (!req) return { ok: true };
  const target = state.players[req.targetIndex];

  const stale =
    !target ||
    state.status !== 'active' ||
    (req.type === 'convert-to-bot' && (target.isBot || target.isConnected)) ||
    (req.type === 'take-over' && !target.isBot);
  if (stale) {
    state.seatRequest = null;
    if (target) log(state, 'System', `Seat request for ${target.name} is no longer needed`);
    saveGame(state);
    return { ok: true };
  }

  if (pendingApprovers(state, req).length > 0) return { ok: true };

  state.seatRequest = null;
  if (req.type === 'convert-to-bot') {
    target.isBot = true;
    target.isConnected = true;
    target.socketId = undefined;
    target.disconnectedAt = undefined;
    log(state, 'System', `${target.name} was away — their seat is now played by a bot`);
  } else {
    target.isBot = false;
    target.isConnected = true;
    target.disconnectedAt = undefined;
    target.sessionToken = uuidv4();
    log(state, 'System', `${target.name} took their seat back from the bot`);
  }
  saveGame(state);
  return { ok: true, applied: req.type, targetIndex: req.targetIndex };
}

export function requestConvertToBot(state: GameState, requesterIndex: number, targetIndex: number): SeatResult {
  if (state.status !== 'active') return { ok: false, error: 'Game is not active' };
  if (state.seatRequest) return { ok: false, error: 'Another seat request is already pending' };
  const requester = state.players[requesterIndex];
  if (!requester || !isPresentHuman(requester)) return { ok: false, error: 'Only connected players can do this' };
  const target = state.players[targetIndex];
  if (!target) return { ok: false, error: 'Player not found' };
  if (targetIndex === requesterIndex) return { ok: false, error: "You can't replace yourself with a bot" };
  if (target.isBot) return { ok: false, error: `${target.name} is already a bot` };
  if (target.isConnected) return { ok: false, error: `${target.name} is connected` };

  state.seatRequest = {
    type: 'convert-to-bot',
    targetIndex,
    requestedByIndex: requesterIndex,
    requestedByName: requester.name,
    approvals: [requesterIndex],
    requestedAt: Date.now(),
  };
  log(state, requester.name, `Asked to replace ${target.name} (away) with a bot — waiting for the other players to approve`);
  saveGame(state);
  return evaluateSeatRequest(state);
}

export function requestTakeover(state: GameState, targetIndex: number): SeatResult {
  if (state.status !== 'active') return { ok: false, error: 'Game is not active' };
  if (state.seatRequest) return { ok: false, error: 'Another seat request is already pending' };
  const target = state.players[targetIndex];
  if (!target) return { ok: false, error: 'Player not found' };
  if (!target.isBot) return { ok: false, error: `${target.name} is not a bot` };

  state.seatRequest = {
    type: 'take-over',
    targetIndex,
    requestedByIndex: -1,
    requestedByName: target.name,
    approvals: [],
    requestedAt: Date.now(),
  };
  log(state, target.name, 'Asked to take their seat back from the bot — waiting for approval');
  saveGame(state);
  return evaluateSeatRequest(state);
}

export function respondSeatRequest(state: GameState, playerIndex: number, approve: boolean): SeatResult {
  const req = state.seatRequest;
  if (!req) return { ok: false, error: 'No seat request pending' };
  if (!pendingApprovers(state, req).includes(playerIndex)) {
    return { ok: false, error: 'You are not able to respond to this request' };
  }
  const player = state.players[playerIndex];
  if (!approve) {
    state.seatRequest = null;
    log(state, player.name, 'Denied the seat request');
    saveGame(state);
    return { ok: true };
  }
  req.approvals.push(playerIndex);
  log(state, player.name, 'Approved the seat request');
  saveGame(state);
  return evaluateSeatRequest(state);
}

export function cancelSeatRequest(state: GameState): void {
  if (!state.seatRequest) return;
  const target = state.players[state.seatRequest.targetIndex];
  state.seatRequest = null;
  log(state, 'System', `Seat request for ${target?.name ?? 'a player'} was cancelled`);
  saveGame(state);
}

export function goOut(state: GameState, playerIndex: number): { ok: boolean; error?: string } {
  if (state.currentPlayerIndex !== playerIndex) return { ok: false, error: 'Not your turn' };
  if (state.turnPhase === 'draw') return { ok: false, error: 'Must draw first' };

  const player = state.players[playerIndex];
  const chk = goOutCheck(state, playerIndex);
  if (!chk.ok) return { ok: false, error: chk.reason };

  if (player.foot.length > 0) return { ok: false, error: 'Must play all cards from foot before going out' };
  if (player.hand.length > 0) return { ok: false, error: 'Must play all cards before going out' };

  finishRound(state, playerIndex);
  saveGame(state);
  return { ok: true };
}

// Scores the round for a player who has just gone out, then either ends the game or deals the next round.
function finishRound(state: GameState, playerIndex: number): void {
  const player = state.players[playerIndex];
  const roundScores = scoreRound(state, playerIndex);
  state.roundScores.push(roundScores);

  log(state, player.name, `Went out! Round ${state.currentRound} complete.`);

  const totals = cumulativeScores(state.roundScores);
  const maxScore = Math.max(...totals);

  const winByScore = state.rules.winningScore !== undefined && maxScore >= state.rules.winningScore;
  const winByRounds = state.currentRound >= state.rules.numRounds;

  if (winByScore || winByRounds) {
    state.winnerTeamIndex = totals.indexOf(maxScore);
    state.status = 'completed';
    const reason = winByScore
      ? `reached ${maxScore} points (target: ${state.rules.winningScore})`
      : `${maxScore} points after ${state.rules.numRounds} rounds`;
    log(state, 'System', `Game over! Team ${state.winnerTeamIndex + 1} wins — ${reason}.`);
  } else {
    startNextRound(state);
  }
}

function startNextRound(state: GameState): void {
  state.currentRound++;
  const deckCount = state.rules.deckCount;
  let stock = buildMultiDeck(deckCount);

  for (const player of state.players) {
    const { dealt: hand, remaining: r1 } = dealCards(stock, state.rules.cardsPerHand);
    stock = r1;
    const { dealt: foot, remaining: r2 } = dealCards(stock, state.rules.cardsPerHand);
    stock = r2;
    player.hand = sortHand(hand);
    player.foot = sortHand(foot);
    player.inFoot = false;
  }

  for (const team of state.teams) {
    team.books = [];
    team.hasOpened = false;
    team.allInFoot = false;
  }

  state.stockPile = stock;
  state.discardPile = [];
  state.turnPhase = 'draw';
  state.currentPlayerIndex = (state.currentRound - 1) % state.players.length;
  state.drawnFromDiscard = false;

  log(state, 'System', `Round ${state.currentRound} started`);
}
