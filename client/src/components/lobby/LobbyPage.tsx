import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { subscribeToLobby, unsubscribeFromLobby, useSocket } from '../../hooks/useSocket';
import { GameCard } from './GameCard';
import { NewGameModal } from './NewGameModal';
import { JoinGameModal } from './JoinGameModal';
import { Button } from '../common/Button';
import { LobbyGame } from '../../types';

export function LobbyPage() {
  useSocket();
  const lobbyGames = useGameStore((s) => s.lobbyGames);
  const [showNewGame, setShowNewGame] = useState(false);
  const [joiningGame, setJoiningGame] = useState<LobbyGame | null>(null);
  const [pendingRejoin, setPendingRejoin] = useState<{ gameCode: string; sessionToken: string; playerIndex: number } | null>(null);

  useEffect(() => {
    subscribeToLobby();
    return () => unsubscribeFromLobby();
  }, []);

  // Check for pending rejoin
  useEffect(() => {
    const stored = localStorage.getItem('hf_pending_rejoin');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        setPendingRejoin(session);
      } catch {
        localStorage.removeItem('hf_pending_rejoin');
      }
    }
  }, []);

  const activeGames = lobbyGames.filter((g) => g.status === 'active' || g.status === 'waiting');
  const archivedGames = lobbyGames.filter((g) => g.status === 'completed' || g.status === 'archived');

  return (
    <div className="min-h-screen bg-felt-texture flex flex-col">
      {/* Header */}
      <header className="bg-felt-900/80 backdrop-blur border-b border-felt-700 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-4xl select-none">🃏</div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Hand &amp; Foot</h1>
              <p className="text-felt-300 text-sm">Multiplayer Card Game</p>
            </div>
          </div>
          <Button variant="gold" size="lg" onClick={() => setShowNewGame(true)}>
            + New Game
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">
        {/* Rejoin banner */}
        {pendingRejoin && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gold-500/20 border border-gold-500 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-semibold text-gold-300">You were in a game!</p>
              <p className="text-sm text-felt-200">Game code: <span className="font-mono font-bold">{pendingRejoin.gameCode}</span></p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  const game = lobbyGames.find((g) => g.code === pendingRejoin.gameCode);
                  if (game) setJoiningGame(game);
                  localStorage.removeItem('hf_pending_rejoin');
                  setPendingRejoin(null);
                }}
              >
                Rejoin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('hf_pending_rejoin');
                  localStorage.removeItem('hf_session');
                  setPendingRejoin(null);
                }}
              >
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}

        {/* Active Games */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">Active Games</h2>
            <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {activeGames.length}
            </span>
          </div>

          {activeGames.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-felt-600 rounded-2xl">
              <div className="text-6xl mb-4">🎴</div>
              <p className="text-felt-300 text-lg">No active games</p>
              <p className="text-felt-400 text-sm mt-1">Start one and invite your friends!</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {activeGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onJoin={() => setJoiningGame(game)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Archived / Completed Games */}
        {archivedGames.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-felt-400 mb-4">Past Games</h2>
            <div className="grid gap-3 md:grid-cols-2 opacity-60">
              {archivedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onJoin={() => setJoiningGame(game)}
                  muted
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <NewGameModal open={showNewGame} onClose={() => setShowNewGame(false)} />
      {joiningGame && (
        <JoinGameModal
          game={joiningGame}
          onClose={() => setJoiningGame(null)}
        />
      )}
    </div>
  );
}
