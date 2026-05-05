import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Team, GameRules, ClientGameState, Rank } from '../../types';
import { BookDisplay } from './BookDisplay';
import { Button } from '../common/Button';
import { playCards, closeBook as closeBookAction } from '../../hooks/useSocket';
import { useGameStore } from '../../store/gameStore';
import toast from 'react-hot-toast';

interface TeamBooksPanelProps {
  team: Team;
  gameState: ClientGameState;
  isMyTeam: boolean;
  isMyTurn: boolean;
  collapsed?: boolean;
}

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export function TeamBooksPanel({ team, gameState, isMyTeam, isMyTurn, collapsed = false }: TeamBooksPanelProps) {
  const { selectedCardIds, clearSelection } = useGameStore();
  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookRank, setNewBookRank] = useState<Rank | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const handleNewBook = () => {
    if (!newBookRank || selectedCardIds.length === 0) return;
    playCards({ action: 'new-book', cardIds: selectedCardIds, rank: newBookRank, teamIndex: team.index });
    clearSelection();
    setShowNewBook(false);
    setNewBookRank(null);
  };

  const handleAddToBook = (bookId: string) => {
    if (selectedCardIds.length === 0) {
      toast.error('Select cards first');
      return;
    }
    playCards({ action: 'add-to-book', cardIds: selectedCardIds, bookId, teamIndex: team.index });
    clearSelection();
  };

  const handleCloseBook = (bookId: string) => {
    closeBookAction(bookId, team.index);
  };

  const teamColor = team.index === 0 ? 'border-blue-600' : 'border-red-700';
  const teamBg = team.index === 0 ? 'bg-blue-900/30' : 'bg-red-900/30';
  const teamHeaderColor = team.index === 0 ? 'text-blue-300' : 'text-red-300';

  const cumulativeScore = gameState.roundScores.reduce((sum, round) => {
    const teamScore = round.find((s) => s.teamIndex === team.index);
    return sum + (teamScore?.total ?? 0);
  }, 0);

  return (
    <div className={`rounded-xl border ${teamColor} ${teamBg} overflow-hidden`}>
      {/* Team header */}
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-bold ${teamHeaderColor}`}>{team.name}</span>
          <span className="text-xs text-felt-400">
            {team.playerIndices.map((i) => gameState.players[i]?.name).join(' & ')}
          </span>
          {team.hasOpened && (
            <span className="text-xs bg-green-800 text-green-200 px-1.5 py-0.5 rounded">Opened</span>
          )}
          {team.allInFoot && (
            <span className="text-xs bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded">All in Foot</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gold-400">
            {cumulativeScore >= 0 ? '+' : ''}{cumulativeScore.toLocaleString()}
          </span>
          <span className="text-felt-400 text-sm">{isOpen ? '▲' : '▼'}</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Books */}
              {team.books.length === 0 ? (
                <p className="text-felt-500 text-sm text-center py-2">No books yet</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {team.books.map((book) => (
                    <BookDisplay
                      key={book.id}
                      book={book}
                      rules={gameState.rules}
                      isMyTeam={isMyTeam}
                      isMyTurn={isMyTurn}
                      onClose={() => handleCloseBook(book.id)}
                      onAddSelected={() => handleAddToBook(book.id)}
                      hasSelectedCards={selectedCardIds.length > 0}
                      selectedCardsCount={selectedCardIds.length}
                    />
                  ))}
                </div>
              )}

              {/* New book action */}
              {isMyTeam && isMyTurn && selectedCardIds.length > 0 && (
                <div>
                  {!showNewBook ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowNewBook(true)}
                    >
                      + Start New Book with Selected Cards
                    </Button>
                  ) : (
                    <div className="bg-felt-800 rounded-lg p-3 space-y-2">
                      <p className="text-sm text-felt-200">Select rank for new book:</p>
                      <div className="flex flex-wrap gap-1">
                        {RANKS.map((r) => (
                          <button
                            key={r}
                            onClick={() => setNewBookRank(r)}
                            className={`w-8 h-8 rounded text-sm font-bold transition-colors ${
                              newBookRank === r
                                ? 'bg-gold-500 text-felt-900'
                                : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setShowNewBook(false); setNewBookRank(null); }}>Cancel</Button>
                        <Button variant="gold" size="sm" disabled={!newBookRank} onClick={handleNewBook}>
                          Create Book
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
