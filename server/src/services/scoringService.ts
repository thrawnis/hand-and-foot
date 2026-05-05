import { GameState, RoundScore, Team, Book, Card, GameRules } from '../types';

export function cardPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + c.pointValue, 0);
}

export function bookBonus(book: Book, rules: GameRules): number {
  if (!book.isClosed) return 0;
  const naturalCards = book.cards.filter((c) => !c.isWild);
  if (naturalCards.length === 0) return 0;
  const rank = naturalCards[0].rank;

  if (rank === '3') return rules.bookOf3sBonus;
  if (rank === '7' && book.isClean) return rules.cleanBookOf7sBonus;
  return book.isClean ? rules.cleanBookValue : rules.dirtyBookValue;
}

export function scoreRound(state: GameState, goingOutPlayerIndex: number): RoundScore[] {
  const scores: RoundScore[] = state.teams.map((team) => ({
    teamIndex: team.index,
    bookPoints: 0,
    cardPoints: 0,
    penalties: 0,
    goingOutBonus: 0,
    total: 0,
  }));

  for (const team of state.teams) {
    const score = scores[team.index];

    // Book bonuses + card values in closed books
    for (const book of team.books) {
      score.bookPoints += bookBonus(book, state.rules);
      // Card values of ALL cards in books (open and closed)
      score.cardPoints += cardPoints(book.cards);
    }

    // Penalty for unplayed cards in hands and feet
    for (const playerIdx of team.playerIndices) {
      const player = state.players[playerIdx];
      const unplayed = [...player.hand, ...player.foot];
      for (const card of unplayed) {
        if (card.isRed3) {
          score.penalties -= state.rules.red3Penalty; // already negative
        } else if (card.isBlack3) {
          score.penalties -= state.rules.black3Penalty; // already negative
        } else {
          score.penalties -= card.pointValue;
        }
      }
    }
  }

  // Going out bonus
  const goingOutPlayer = state.players[goingOutPlayerIndex];
  scores[goingOutPlayer.teamIndex].goingOutBonus = state.rules.goingOutBonus;

  // Compute totals
  for (const score of scores) {
    score.total = score.bookPoints + score.cardPoints + score.penalties + score.goingOutBonus;
  }

  return scores;
}

export function cumulativeScores(roundScores: RoundScore[][]): number[] {
  if (roundScores.length === 0) return [];
  const teamCount = roundScores[0].length;
  const totals = new Array(teamCount).fill(0);
  for (const round of roundScores) {
    for (const score of round) {
      totals[score.teamIndex] += score.total;
    }
  }
  return totals;
}

export function canTeamOpen(team: Team, cardIds: string[], state: GameState): { canOpen: boolean; points: number } {
  const threshold = state.rules.roundThresholds[state.currentRound - 1] ?? 50;

  // Find the cards being played
  const currentPlayer = state.players.find((p) => p.teamIndex === team.index);
  if (!currentPlayer) return { canOpen: false, points: 0 };

  const allPlayerCards = [...currentPlayer.hand, ...currentPlayer.foot];
  const playedCards = allPlayerCards.filter((c) => cardIds.includes(c.id));

  // Points = sum of natural card values only (wilds don't count toward threshold)
  const points = playedCards.filter((c) => !c.isWild).reduce((s, c) => s + c.pointValue, 0);

  return { canOpen: points >= threshold, points };
}

export function teamMeetsGoOutRequirements(team: Team, rules: GameRules): { meets: boolean; reason?: string } {
  const closedBooks = team.books.filter((b) => b.isClosed);
  const closedClean = closedBooks.filter((b) => {
    const naturals = b.cards.filter((c) => !c.isWild);
    if (!naturals.length) return false;
    return naturals[0].rank !== '3' && b.isClean;
  });
  const closedDirty = closedBooks.filter((b) => !b.isClean);

  if (closedClean.length < rules.minCleanBooksToGoOut) {
    return { meets: false, reason: `Need ${rules.minCleanBooksToGoOut} closed clean books (have ${closedClean.length})` };
  }
  if (closedDirty.length < rules.minDirtyBooksToGoOut) {
    return { meets: false, reason: `Need ${rules.minDirtyBooksToGoOut} closed dirty book (have ${closedDirty.length})` };
  }
  return { meets: true };
}
