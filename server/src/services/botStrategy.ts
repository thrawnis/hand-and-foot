import { GameState, Player, Team, Book, Card, Rank, GameRules } from '../types';
import {
  drawFromStock, drawFromDiscard, playCards, discardCard, goOut, goOutCheck, respondUndo,
} from './gameService';
import { loadGameByCode, listGames } from '../db';

// Bots are deterministic: every choice below is scored from the visible game
// state (own cards, both teams' books, discard pile) — nothing is random.

const THINK_DRAW_MS = 1300;
const THINK_PLAY_MS = 950;
const THINK_DISCARD_MS = 1100;
const THINK_NEXT_TURN_MS = 500;
const MAX_PLAYS_PER_TURN = 40;

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

function sumPoints(cards: Card[]): number {
  return cards.reduce((s, c) => s + c.pointValue, 0);
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

// True once the team has the books it needs to go out — from then on the goal is
// to unload every card (the foot must be empty, and a turn only discards one).
function isUnloading(team: Team, rules: GameRules): boolean {
  const { needClean, needDirty } = goOutNeeds(team, rules);
  return team.hasOpened && needClean === 0 && needDirty === 0;
}

// The opening rule counts only natural cards of a single rank.
function canOpenWith(cards: Card[], threshold: number): boolean {
  for (const [rank, group] of groupNaturals(cards)) {
    if (rank !== '3' && sumPoints(group) >= threshold) return true;
  }
  return false;
}

function scorePlay(
  cards: Card[], rank: Rank, isClean: boolean,
  currentCount: number, rules: GameRules,
  fillsNeedClean: boolean, fillsNeedDirty: boolean,
): number {
  const totalAfter = currentCount + cards.length;
  const cardValue = sumPoints(cards);
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

  // Cards that can't be played yet only cost points: before the team has opened,
  // the pile has to make an opening play possible.
  if (!team.hasOpened) {
    const threshold = state.rules.roundThresholds[state.currentRound - 1] ?? 50;
    if (!canOpenWith([...hand, ...state.discardPile], threshold)) return 'stock';
  }

  const hasOwnBook = team.books.some(b => b.rank === top.rank && !(b.rank === '3' && b.isClosed));
  const isValuable = top.rank === '7' || top.rank === 'A' || top.rank === 'K';
  // A pile that would bury the hand in cards we can't use is not worth it.
  if (hand.length + pile > 45 && !hasOwnBook && matching.length < 3) return 'stock';

  if (pile >= 5 || hasOwnBook || matching.length >= 3 || isValuable) {
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

function candidateKey(c: PlayCandidate): string {
  return `${c.action}|${c.bookId ?? c.rank}|${[...c.cardIds].sort().join(',')}`;
}

// Every sensible play, best first. The server has the final say (e.g. it
// refuses plays that would strand a foot player), so the caller walks down the
// list until one is accepted.
function findPlays(state: GameState, pidx: number): PlayCandidate[] {
  const player = state.players[pidx];
  const team = state.teams[player.teamIndex];
  const hand = activeHand(player);
  const rules = state.rules;
  const teamIndex = player.teamIndex;
  const naturals = groupNaturals(hand);
  const wilds = hand.filter(c => c.isWild);
  const { needClean, needDirty } = goOutNeeds(team, rules);
  const unloading = isUnloading(team, rules);
  const wildReserve = unloading ? 0 : 2;
  const out: PlayCandidate[] = [];

  // Opening: the team has not played yet — a single-rank group must meet the threshold.
  if (!team.hasOpened) {
    const threshold = rules.roundThresholds[state.currentRound - 1] ?? 50;
    for (const [rank, cards] of naturals) {
      if (rank === '3') continue;
      if (sumPoints(cards) < threshold) continue;
      const sc = scorePlay(cards, rank, true, 0, rules, needClean > 0, false);
      out.push({ score: sc, action: 'new-book', cardIds: cards.map(c => c.id), rank, teamIndex });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // Naturals onto books we already have.
  for (const book of team.books) {
    const matching = naturals.get(book.rank) ?? [];
    if (matching.length === 0) continue;
    if (book.isClosed) {
      // Closed 3s books accept nothing. Extra naturals on any other closed book
      // earn their face value instead of costing it as a leftover penalty.
      if (book.rank === '3') continue;
      out.push({
        score: sumPoints(matching) * 0.6, action: 'add-to-book',
        cardIds: matching.map(c => c.id), bookId: book.id, teamIndex,
      });
      continue;
    }
    const sc = scorePlay(
      matching, book.rank, book.isClean, book.cards.length, rules,
      needClean > 0 && book.isClean, needDirty > 0 && !book.isClean,
    );
    out.push({ score: sc, action: 'add-to-book', cardIds: matching.map(c => c.id), bookId: book.id, teamIndex });
  }

  // New books from 3+ naturals of a rank we have no book for.
  for (const [rank, cards] of naturals) {
    if (cards.length < 3) continue;
    if (team.books.some(b => b.rank === rank)) continue;
    const sc = scorePlay(cards, rank, true, 0, rules, needClean > 0, false);
    out.push({ score: sc, action: 'new-book', cardIds: cards.map(c => c.id), rank, teamIndex });
  }

  // Going out needs an empty foot, so once the team may go out every natural
  // gets played: ranks with no book yet become (small) books of their own.
  if (unloading) {
    for (const [rank, cards] of naturals) {
      if (team.books.some(b => b.rank === rank)) continue;
      out.push({
        score: sumPoints(cards) * 0.5, action: 'new-book',
        cardIds: cards.map(c => c.id), rank, teamIndex,
      });
    }
  }

  // The team still needs a dirty book to ever go out and has none under way:
  // start one from a pair plus a wild.
  const haveOpenDirty = team.books.some(b => !b.isClean && !b.isClosed);
  if (needDirty > 0 && !haveOpenDirty && wilds.length >= 1) {
    for (const [rank, cards] of naturals) {
      if (rank === '3' || cards.length < 2) continue;
      if (team.books.some(b => b.rank === rank)) continue;
      const play = [...cards, wilds[0]];
      const sc = scorePlay(play, rank, false, 0, rules, false, true) + 40;
      out.push({ score: sc, action: 'new-book', cardIds: play.map(c => c.id), rank, teamIndex });
    }
  }

  // Wilds onto open books.
  if (wilds.length > 0) {
    for (const book of team.books) {
      if (book.isClosed || book.rank === '3') continue;
      const room = rules.maxWildsPerDirtyBook - book.cards.filter(c => c.isWild).length;
      if (room <= 0) continue;
      // Wilds spoil a clean book; only do it when clean books are already covered
      // and we still need a dirty one.
      if (book.isClean && !unloading && !(needClean === 0 && needDirty > 0)) continue;

      const gap = rules.minCardsPerBook - book.cards.length;
      if (gap > 0 && gap <= Math.min(room, wilds.length)) {
        // Wilds alone can close this book right now.
        const use = wilds.slice(0, gap);
        const sc = scorePlay(use, book.rank, false, book.cards.length, rules, false, needDirty > 0);
        out.push({ score: sc, action: 'add-to-book', cardIds: use.map(c => c.id), bookId: book.id, teamIndex });
      } else if (wilds.length > wildReserve) {
        // Keep two wilds in reserve (none once unloading); dump surplus ones rather than eat the penalty.
        const sc = scorePlay([wilds[0]], book.rank, false, book.cards.length, rules, false, needDirty > 0) - 15;
        out.push({ score: sc, action: 'add-to-book', cardIds: [wilds[0].id], bookId: book.id, teamIndex });
      }
    }
  }

  return out.sort((a, b) => b.score - a.score || candidateKey(a).localeCompare(candidateKey(b)));
}

// ── Discard ───────────────────────────────────────────────────────────────────

function cardKeepValue(card: Card, hand: Card[], books: Book[], unloading: boolean): number {
  // Whatever wild is still in hand after the play phase has nowhere to go; when
  // unloading it only stands between us and an empty foot.
  if (card.isWild) return unloading ? 3 : 42;

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
  // Naturals can still be added to any of our books except a closed book of 3s.
  const ownBook = books.find(b => b.rank === card.rank && !(b.rank === '3' && b.isClosed));

  let v = pts;
  if (ownBook) v += 25;
  if (card.rank === '7') v += 15;
  if (card.rank === 'A') v += 5;
  if (sameInHand >= 2) v += 20;
  else if (sameInHand >= 1) v += 8;
  return v;
}

// How much a discard helps the other team. Taking the pile needs two natural
// matches in hand, so ranks the opponents are building books of are the ones
// they most likely hold — and the bigger the pile, the more they gain.
function discardDanger(card: Card, state: GameState, myTeam: Team): number {
  if (card.isWild) return 0;
  // A 3 on top freezes the pile: nobody can take it.
  if (card.isRed3 || card.isBlack3) return -10;

  let danger = 0;
  for (const t of state.teams) {
    if (t.index === myTeam.index) continue;
    if (t.books.some(b => b.rank === card.rank && !b.isClosed)) danger += 25;
    else if (t.books.some(b => b.rank === card.rank)) danger += 8;
  }
  return danger * (1 + Math.min(state.discardPile.length, 12) / 6);
}

// Cards in the order we would rather discard them (best discard first).
function rankDiscards(state: GameState, pidx: number): Card[] {
  const player = state.players[pidx];
  const team = state.teams[player.teamIndex];
  const hand = activeHand(player);
  const unloading = isUnloading(team, state.rules);
  return hand
    .map(c => ({ c, v: cardKeepValue(c, hand, team.books, unloading) + discardDanger(c, state, team) }))
    .sort((a, b) => a.v - b.v || a.c.pointValue - b.c.pointValue || a.c.id.localeCompare(b.c.id))
    .map(x => x.c);
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

// One bot turn per game at a time, so a restart-resume, an undo and the normal
// hand-off can never make two runs play the same turn.
const runningTurns = new Set<string>();

export async function executeBotTurn(gameCode: string, pidx: number, attempt = 0): Promise<void> {
  if (runningTurns.has(gameCode)) {
    // Another run is finishing up; try again shortly (it may be for a different seat).
    if (attempt < 30) setTimeout(() => executeBotTurn(gameCode, pidx, attempt + 1), 700);
    return;
  }
  runningTurns.add(gameCode);
  try {
    await runBotTurn(gameCode, pidx);
  } catch (err) {
    console.error(`Bot turn failed in game ${gameCode}:`, err);
  } finally {
    runningTurns.delete(gameCode);
  }
}

async function runBotTurn(gameCode: string, pidx: number): Promise<void> {
  const load = (): GameState | null => {
    const s = loadGameByCode(gameCode);
    if (!s || s.status === 'completed' || s.status === 'archived') return null;
    if (s.currentPlayerIndex !== pidx || !s.players[pidx]?.isBot) return null;
    return s;
  };

  // A turn can be picked up in any phase (after a server restart, an undo, or
  // a human seat being handed to a bot mid-turn).
  let state = load();
  if (!state) return;

  // DRAW
  if (state.turnPhase === 'draw') {
    await sleep(THINK_DRAW_MS);
    state = load();
    if (!state || state.turnPhase !== 'draw') return;
    const dec = decideDraw(state, pidx);
    let drew = false;
    if (typeof dec === 'object') drew = drawFromDiscard(state, pidx, dec).ok;
    if (!drew) {
      const r = drawFromStock(state, pidx);
      if (!r.ok) return;
    }
    emit(state);
  }

  // PLAY — keep playing the best accepted play until nothing is left to play.
  const rejected = new Set<string>();
  for (let i = 0; i < MAX_PLAYS_PER_TURN; i++) {
    await sleep(THINK_PLAY_MS);
    state = load();
    if (!state || state.turnPhase !== 'play') break;

    const player = state.players[pidx];

    // Foot completely played and the team is allowed to finish: go out.
    if (activeHand(player).length === 0) {
      if (goOut(state, pidx).ok) { emit(state); scheduleNextBotTurn(state); return; }
      break;
    }

    let played = false;
    for (const play of findPlays(state, pidx)) {
      const key = candidateKey(play);
      if (rejected.has(key)) continue;
      const payload = play.action === 'new-book'
        ? { action: 'new-book' as const, cardIds: play.cardIds, rank: play.rank, teamIndex: play.teamIndex }
        : { action: 'add-to-book' as const, cardIds: play.cardIds, bookId: play.bookId, teamIndex: play.teamIndex };
      if (playCards(state, pidx, payload).ok) { emit(state); played = true; break; }
      rejected.add(key);
    }
    if (!played) break;
  }

  // DISCARD — or go out, when this is the last foot card and the team may finish.
  await sleep(THINK_DISCARD_MS);
  state = load();
  if (!state || (state.turnPhase !== 'play' && state.turnPhase !== 'discard')) return;

  if (activeHand(state.players[pidx]).length === 0) {
    if (goOut(state, pidx).ok) { emit(state); scheduleNextBotTurn(state); }
    return;
  }

  for (const card of rankDiscards(state, pidx)) {
    const r = discardCard(state, pidx, { cardId: card.id });
    if (r.ok) {
      emit(state);
      scheduleNextBotTurn(state);
      return;
    }
  }
}

// Starts the bot's turn if the player to move is a bot, whatever phase the turn is in.
export function scheduleNextBotTurn(state: GameState): void {
  if (state.status === 'completed' || state.status === 'archived') return;
  const pidx = state.currentPlayerIndex;
  if (state.players[pidx]?.isBot) {
    setTimeout(() => executeBotTurn(state.code, pidx), THINK_NEXT_TURN_MS);
  }
}

// After a server restart nothing is scheduled any more — pick every game with a
// bot to move back up.
export function resumeBotTurns(): void {
  for (const row of listGames(false)) {
    if (row.status !== 'active') continue;
    scheduleNextBotTurn(JSON.parse(row.state) as GameState);
  }
}

// Bots always agree to an undo. Returns true if the undo was applied.
export function autoBotUndoApproval(state: GameState): boolean {
  if (!state.undoRequest) return false;
  for (let i = 0; i < state.players.length; i++) {
    if (!state.players[i].isBot) continue;
    if (!state.undoRequest) return false;
    if (state.undoRequest.approvals.includes(i) || state.undoRequest.denials.includes(i)) continue;
    const r = respondUndo(state, i, true);
    emit(state);
    if (r.applied) return true;
  }
  return false;
}
