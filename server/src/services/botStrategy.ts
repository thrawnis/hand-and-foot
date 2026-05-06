import { GameState, Player, Team, Book, Card, Rank, GameRules } from '../types';
import {
  drawFromStock, drawFromDiscard, playCards, discardCard, goOut,
} from './gameService';
import { teamMeetsGoOutRequirements } from './scoringService';
import { loadGameByCode } from '../db';
import { respondUndo } from './gameService';

const THINK_DRAW_MS = 1300;
const THINK_PLAY_MS = 950;
const THINK_DISCARD_MS = 1100;
const THINK_NEXT_TURN_MS = 500;

const RANK_PTS: Partial<Record<Rank, number>> = {
  JOKER: 50, A: 20, '2': 20, K: 10, Q: 10, J: 10, '10': 10,
  '9': 5, '8': 5, '7': 5, '6': 5, '5': 5, '4': 5, '3': 5,
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function activeHand(player: Player): Card[] {
  return player.inFoot ? player.foot : player.hand;
}

function groupNaturals(cards: Card[]): Map<Rank, Card[]> {
  const map = new Map<Rank, Card[]>();
  for (const c of cards) {
    if (!c.isWild) {
      if (!map.has(c.rank)) map.set(c.rank, []);
      map.get(c.rank)!.push(c);
    }
  }
  return map;
}

function bookBonus(rank: Rank, isClean: boolean, rules: GameRules): number {
  if (rank === '7' && isClean) return rules.cleanBookOf7sBonus;
  if (rank === '3') return rules.bookOf3sBonus;
  return isClean ? rules.cleanBookValue : rules.dirtyBookValue;
}

function goOutNeeds(team: Team, rules: GameRules): { needClean: number; needDirty: number } {
  const closed = team.books.filter(b => b.isClosed);
  const closedClean = closed.filter(b => {
    const nats = b.cards.filter(c => !c.isWild);
    return nats.length > 0 && nats[0].rank !== '3' && b.isClean;
  });
  const closedDirty = closed.filter(b => !b.isClean);
  return {
    needClean: Math.max(0, rules.minCleanBooksToGoOut - closedClean.length),
    needDirty: Math.max(0, rules.minDirtyBooksToGoOut - closedDirty.length),
  };
}

function scorePlay(
  cards: Card[], rank: Rank, isClean: boolean,
  currentCount: number, rules: GameRules,
  fillsNeedClean: boolean, fillsNeedDirty: boolean,
): number {
  const totalAfter = currentCount + cards.length;
  const cardValue = cards.reduce((s, c) => s + c.pointValue, 0);
  const bonus = bookBonus(rank, isClean, rules);
  const closes = totalAfter >= rules.minCardsPerBook && currentCount < rules.minCardsPerBook;

  let score = cardValue;
  if (closes) {
    score += bonus;
    if (isClean && fillsNeedClean) score += 200;
    if (!isClean && fillsNeedDirty) score += 200;
  } else if (totalAfter < rules.minCardsPerBook) {
    score += bonus * (totalAfter / rules.minCardsPerBook) * 0.35;
  }
  if (rank === '7') score += 25;
  if (rank === '3') score += 15;
  return score;
}

// ── Draw ──────────────────────────────────────────────────────────────────────

function decideDraw(state: GameState, pidx: number): 'stock' | { matchingCardIds: [string, string] } {
  const player = state.players[pidx];
  const team = state.teams[player.teamIndex];
  const hand = activeHand(player);
  const top = state.discardPile[state.discardPile.length - 1];

  if (!top || top.isWild || top.isRed3 || top.isBlack3) return 'stock';

  const matching = hand.filter(c => c.rank === top.rank && !c.isWild);
  if (matching.length < 2) return 'stock';

  const pile = state.discardPile.length;
  const hasOpenBook = team.books.some(b => b.rank === top.rank && !b.isClosed);
  const isValuable = top.rank === '7' || top.rank === 'A' || top.rank === 'K';

  if (pile >= 5 || hasOpenBook || matching.length >= 3 || isValuable) {
    return { matchingCardIds: [matching[0].id, matching[1].id] };
  }
  return 'stock';
}

// ── Play ──────────────────────────────────────────────────────────────────────

interface PlayCandidate {
  score: number;
  action: 'new-book' | 'add-to-book';
  cardIds: string[];
  bookId?: string;
  rank?: Rank;
  teamIndex: number;
}

function findBestPlay(state: GameState, pidx: number): PlayCandidate | null {
  const player = state.players[pidx];
  const team = state.teams[player.teamIndex];
  const hand = activeHand(player);
  const rules = state.rules;
  const teamIndex = player.teamIndex;
  const naturals = groupNaturals(hand);
  const wilds = hand.filter(c => c.isWild);
  const { needClean, needDirty } = goOutNeeds(team, rules);

  // Opening: team hasn't played yet — find a single-rank group that meets threshold
  if (!team.hasOpened) {
    const threshold = rules.roundThresholds[state.currentRound - 1] ?? 50;
    let best: PlayCandidate | null = null;
    let bestScore = -Infinity;
    for (const [rank, cards] of naturals) {
      if (rank === '3') continue;
      const pts = cards.reduce((s, c) => s + c.pointValue, 0);
      if (pts < threshold) continue;
      const sc = scorePlay(cards, rank, true, 0, rules, needClean > 0, false);
      if (sc > bestScore) { bestScore = sc; best = { score: sc, action: 'new-book', cardIds: cards.map(c => c.id), rank, teamIndex }; }
    }
    return best;
  }

  const candidates: PlayCandidate[] = [];

  // Add naturals to existing open books
  for (const book of team.books) {
    if (book.isClosed) continue;
    const matching = naturals.get(book.rank) ?? [];
    if (matching.length === 0) continue;
    const isClean = book.isClean;
    const sc = scorePlay(matching, book.rank, isClean, book.cards.length, rules, needClean > 0 && book.isClean, needDirty > 0 && !book.isClean);
    candidates.push({ score: sc, action: 'add-to-book', cardIds: matching.map(c => c.id), bookId: book.id, teamIndex });
  }

  // Start new books (3+ naturals of same rank, no existing book)
  for (const [rank, cards] of naturals) {
    if (cards.length < 3) continue;
    if (team.books.some(b => b.rank === rank)) continue;
    const sc = scorePlay(cards, rank, true, 0, rules, needClean > 0, false);
    candidates.push({ score: sc, action: 'new-book', cardIds: cards.map(c => c.id), rank, teamIndex });
  }

  // Add wilds to dirty books (keep ≥ 2 wilds in reserve)
  if (wilds.length >= 3) {
    for (const book of team.books) {
      if (book.isClosed || book.rank === '3') continue;
      const currentWilds = book.cards.filter(c => c.isWild).length;
      const canAdd = rules.maxWildsPerDirtyBook - currentWilds;
      if (canAdd <= 0) continue;
      const sc = scorePlay([wilds[0]], book.rank, false, book.cards.length, rules, false, needDirty > 0) - 15;
      candidates.push({ score: sc, action: 'add-to-book', cardIds: [wilds[0].id], bookId: book.id, teamIndex });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── Discard ───────────────────────────────────────────────────────────────────

function cardKeepValue(card: Card, hand: Card[], books: Book[]): number {
  if (card.isWild) return 42;

  if (card.isBlack3) {
    const others = hand.filter(c => c.isBlack3 && c.id !== card.id).length;
    return others >= 2 ? 18 : others >= 1 ? -12 : -45;
  }
  if (card.isRed3) {
    const others = hand.filter(c => c.isRed3 && c.id !== card.id).length;
    return others >= 2 ? 18 : others >= 1 ? -20 : -80;
  }

  const pts = RANK_PTS[card.rank] ?? 5;
  const sameInHand = hand.filter(c => c.rank === card.rank && !c.isWild && c.id !== card.id).length;
  const openBook = books.find(b => b.rank === card.rank && !b.isClosed);

  let v = pts;
  if (openBook) v += 25;
  if (card.rank === '7') v += 15;
  if (card.rank === 'A') v += 5;
  if (sameInHand >= 2) v += 20;
  else if (sameInHand >= 1) v += 8;
  return v;
}

function findBestDiscard(state: GameState, pidx: number): Card | null {
  const player = state.players[pidx];
  const team = state.teams[player.teamIndex];
  const hand = activeHand(player);
  if (hand.length === 0) return null;
  if (player.inFoot && hand.length === 1) return null;

  const scored = hand.map(c => ({ c, v: cardKeepValue(c, hand, team.books) }));
  scored.sort((a, b) => a.v - b.v);
  return scored[0].c;
}

// ── Broadcast singleton ────────────────────────────────────────────────────────

let _broadcast: ((state: GameState) => void) | null = null;

export function setBroadcast(fn: (state: GameState) => void): void {
  _broadcast = fn;
}

function emit(state: GameState): void {
  _broadcast?.(state);
}

// ── Turn execution ────────────────────────────────────────────────────────────

export async function executeBotTurn(gameCode: string, pidx: number): Promise<void> {
  const load = (): GameState | null => {
    const s = loadGameByCode(gameCode);
    if (!s || s.status === 'completed' || s.status === 'archived') return null;
    if (s.currentPlayerIndex !== pidx || !s.players[pidx]?.isBot) return null;
    return s;
  };

  // DRAW
  await sleep(THINK_DRAW_MS);
  {
    const state = load();
    if (!state || state.turnPhase !== 'draw') return;
    const dec = decideDraw(state, pidx);
    if (typeof dec === 'object') drawFromDiscard(state, pidx, dec);
    else drawFromStock(state, pidx);
    emit(state);
  }

  // PLAY LOOP
  for (let i = 0; i < 30; i++) {
    await sleep(THINK_PLAY_MS);
    const state = load();
    if (!state || state.turnPhase !== 'play') break;

    const player = state.players[pidx];
    const team = state.teams[player.teamIndex];

    // Check go-out
    if (
      player.inFoot && team.allInFoot &&
      activeHand(player).length === 0 &&
      teamMeetsGoOutRequirements(team, state.rules).meets
    ) {
      const r = goOut(state, pidx);
      if (r.ok) { emit(state); scheduleNextBotTurn(state); return; }
    }

    const play = findBestPlay(state, pidx);
    if (!play) break;

    const payload = play.action === 'new-book'
      ? { action: 'new-book' as const, cardIds: play.cardIds, rank: play.rank, teamIndex: play.teamIndex }
      : { action: 'add-to-book' as const, cardIds: play.cardIds, bookId: play.bookId, teamIndex: play.teamIndex };

    const r = playCards(state, pidx, payload);
    if (!r.ok) break;
    emit(state);
  }

  // DISCARD
  await sleep(THINK_DISCARD_MS);
  {
    const state = load();
    if (!state || (state.turnPhase !== 'play' && state.turnPhase !== 'discard')) return;
    const card = findBestDiscard(state, pidx);
    if (!card) return;
    const r = discardCard(state, pidx, { cardId: card.id });
    if (!r.ok) return;
    emit(state);
    scheduleNextBotTurn(state);
  }
}

export function scheduleNextBotTurn(state: GameState): void {
  if (state.status === 'completed' || state.status === 'archived') return;
  if (state.turnPhase !== 'draw') return;
  const pidx = state.currentPlayerIndex;
  if (state.players[pidx]?.isBot) {
    setTimeout(() => executeBotTurn(state.code, pidx), THINK_NEXT_TURN_MS);
  }
}

export function autoBotUndoApproval(state: GameState): void {
  if (!state.undoRequest) return;
  for (let i = 0; i < state.players.length; i++) {
    if (!state.players[i].isBot) continue;
    if (state.undoRequest.approvals.includes(i) || state.undoRequest.denials.includes(i)) continue;
    const r = respondUndo(state, i, true);
    emit(state);
    if (r.applied) return; // undo applied, stop iterating (state changed)
  }
}
