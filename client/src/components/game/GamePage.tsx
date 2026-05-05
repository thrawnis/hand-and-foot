import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSocket, joinGame, spectateGame, playCards, closeBook as closeBookAction } from '../../hooks/useSocket';
import { ScoreBoard } from './ScoreBoard';
import { TeamBooksPanel } from './TeamBooksPanel';
import { PlayerHand } from './PlayerHand';
import { StockAndDiscard } from './StockAndDiscard';
import { OpponentView } from './OpponentView';
import { GameLog } from './GameLog';
import { CardComponent } from './CardComponent';
import { SecondTabModal } from './SecondTabModal';
import { JoinGameModal } from '../lobby/JoinGameModal';
import { Button } from '../common/Button';
import { Card, LobbyGame } from '../../types';
import toast from 'react-hot-toast';

export function GamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const socket = useSocket();
  const { gameState, setGameState, showScoreBoard, setShowScoreBoard, secondTabPrompt, clearSelection } = useGameStore();
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);
  const [joinModal, setJoinModal] = useState<LobbyGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;

    // Try to auto-rejoin from stored session
    const stored = localStorage.getItem('hf_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.gameCode === code) {
          joinGame(code, '', session.sessionToken);
          // Wait for game:joined response
          setLoading(false);
          return;
        }
      } catch {}
    }

    // Fetch game info to show join modal
    fetch(`/api/games/${code}`)
      .then((r) => r.json())
      .then((game) => {
        if (game.error) {
          toast.error('Game not found');
          navigate('/');
          return;
        }
        setJoinModal({
          id: game.id,
          code: game.code,
          status: game.status,
          playerCount: game.playerCount,
          playerNames: game.playerNames,
          lastActionAt: Date.now(),
          createdAt: Date.now(),
          currentRound: game.currentRound,
          rules: game.rules,
        });
        setLoading(false);
      })
      .catch(() => {
        toast.error('Could not connect to game');
        navigate('/');
      });
  }, [code]);

  useEffect(() => {
    if (gameState) setLoading(false);
  }, [gameState]);

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as Card;
    if (card) setDraggingCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingCard(null);
    const { active, over } = event;
    if (!over || !gameState) return;

    const card = active.data.current?.card as Card;
    if (!card) return;

    const dropData = over.data.current as { bookId?: string; type?: string };

    if (dropData?.type === 'book' && dropData.bookId) {
      playCards({ action: 'add-to-book', cardIds: [card.id], bookId: dropData.bookId });
      clearSelection();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-felt-texture flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading game...</div>
      </div>
    );
  }

  if (joinModal && !gameState) {
    return (
      <div className="min-h-screen bg-felt-texture flex items-center justify-center">
        <JoinGameModal game={joinModal} onClose={() => navigate('/')} />
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-felt-texture flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Connecting to game...</div>
          <Button variant="ghost" onClick={() => navigate('/')}>← Back to Lobby</Button>
        </div>
      </div>
    );
  }

  const myIndex = gameState.myPlayerIndex;
  const isSpectator = myIndex === -1;
  const me = myIndex >= 0 ? gameState.players[myIndex] : null;
  const myTeamIndex = me?.teamIndex ?? -1;

  // Determine opponent positions based on player count and my position
  const otherPlayers = gameState.players
    .map((p, i) => ({ ...p, index: i }))
    .filter((_, i) => i !== myIndex);

  // Assign positions for opponents
  const positions: ('top' | 'left' | 'right')[] = [];
  if (otherPlayers.length === 1) positions.push('top');
  else if (otherPlayers.length === 2) positions.push('left', 'right');
  else if (otherPlayers.length === 3) positions.push('left', 'top', 'right');
  else {
    // 4+ opponents: top-left, top, top-right, then left/right
    const pos: ('top' | 'left' | 'right')[] = ['left', 'top', 'top', 'right', 'left', 'right', 'top'];
    otherPlayers.forEach((_, i) => positions.push(pos[i] ?? 'top'));
  }

  const topOpponents = otherPlayers.filter((_, i) => positions[i] === 'top');
  const leftOpponents = otherPlayers.filter((_, i) => positions[i] === 'left');
  const rightOpponents = otherPlayers.filter((_, i) => positions[i] === 'right');

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-screen bg-felt-texture flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-felt-900/80 backdrop-blur border-b border-felt-700 px-4 py-2 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-felt-400 hover:text-white text-sm transition-colors">
              ← Lobby
            </button>
            <span className="text-felt-600">|</span>
            <span className="font-mono text-lg font-bold text-gold-400 tracking-widest">{gameState.code}</span>
            <span className="text-felt-400 text-sm">
              Round {gameState.currentRound}/{gameState.rules.numRounds}
            </span>
            {isSpectator && (
              <span className="bg-blue-800 text-blue-200 text-xs px-2 py-0.5 rounded">Spectating</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowScoreBoard(true)}>
              📊 Scores
            </Button>
          </div>
        </header>

        {/* Main game area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Top opponents */}
          {topOpponents.length > 0 && (
            <div className="flex items-start justify-center gap-4 p-3 shrink-0">
              {topOpponents.map((p, i) => (
                <OpponentView
                  key={p.index}
                  player={p}
                  playerIndex={p.index}
                  gameState={gameState}
                  position="top"
                />
              ))}
            </div>
          )}

          {/* Middle row: left opponents + center + right opponents */}
          <div className="flex-1 flex items-stretch gap-2 px-2 min-h-0">
            {/* Left opponents */}
            {leftOpponents.length > 0 && (
              <div className="flex flex-col items-end justify-center gap-3 shrink-0 w-28">
                {leftOpponents.map((p) => (
                  <OpponentView
                    key={p.index}
                    player={p}
                    playerIndex={p.index}
                    gameState={gameState}
                    position="left"
                  />
                ))}
              </div>
            )}

            {/* Center: books + stock/discard */}
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              {/* Team Books */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {gameState.teams.map((team) => (
                  <TeamBooksPanel
                    key={team.index}
                    team={team}
                    gameState={gameState}
                    isMyTeam={team.index === myTeamIndex}
                    isMyTurn={gameState.currentPlayerIndex === myIndex}
                  />
                ))}
              </div>

              {/* Stock & Discard */}
              <div className="flex items-center justify-center py-2">
                <StockAndDiscard gameState={gameState} />
              </div>

              {/* Game Log */}
              <GameLog entries={gameState.log} />
            </div>

            {/* Right opponents */}
            {rightOpponents.length > 0 && (
              <div className="flex flex-col items-start justify-center gap-3 shrink-0 w-28">
                {rightOpponents.map((p) => (
                  <OpponentView
                    key={p.index}
                    player={p}
                    playerIndex={p.index}
                    gameState={gameState}
                    position="right"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Player hand at bottom */}
          {!isSpectator && (
            <div className="shrink-0">
              <PlayerHand gameState={gameState} />
            </div>
          )}
        </div>

        {/* Score board modal */}
        <ScoreBoard
          gameState={gameState}
          open={showScoreBoard}
          onClose={() => setShowScoreBoard(false)}
        />

        {/* Second tab modal */}
        <SecondTabModal />

        {/* Drag overlay */}
        <DragOverlay>
          {draggingCard && (
            <CardComponent card={draggingCard} size="md" className="rotate-6 opacity-90" />
          )}
        </DragOverlay>

        {/* Game over banner */}
        <AnimatePresence>
          {gameState.status === 'completed' && (
            <motion.div
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-16 left-0 right-0 flex justify-center z-40 pointer-events-none"
            >
              <div className="bg-gold-500 text-felt-900 font-bold text-xl px-8 py-3 rounded-full shadow-2xl pointer-events-auto">
                🏆 Game Over! {gameState.winnerTeamIndex !== undefined && `${gameState.teams[gameState.winnerTeamIndex]?.name} Wins!`}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DndContext>
  );
}
