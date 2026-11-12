import { ClientGameState } from '../types';

// Mirrors the server's go-out rule so the UI can say what will happen.
// Returns null when the team may go out, otherwise the reason it can't yet.
export function goOutBlocker(gameState: ClientGameState, teamIndex: number): string | null {
  const team = gameState.teams[teamIndex];
  if (!team) return 'Unknown team';
  if (!team.playerIndices.every((i) => gameState.players[i]?.inFoot)) {
    return 'All team members must pick up their foot first';
  }
  const closed = team.books.filter((b) => b.isClosed);
  const closedClean = closed.filter((b) => {
    const naturals = b.cards.filter((c) => !c.isWild);
    return naturals.length > 0 && naturals[0].rank !== '3' && b.isClean;
  }).length;
  const closedDirty = closed.filter((b) => !b.isClean).length;
  const { minCleanBooksToGoOut, minDirtyBooksToGoOut } = gameState.rules;
  if (closedClean < minCleanBooksToGoOut) {
    return `Need ${minCleanBooksToGoOut} closed clean books (have ${closedClean})`;
  }
  if (closedDirty < minDirtyBooksToGoOut) {
    return `Need ${minDirtyBooksToGoOut} closed dirty book (have ${closedDirty})`;
  }
  return null;
}
