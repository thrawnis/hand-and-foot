import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useSocket, joinGame, spectateGame, playCards, closeBook as closeBookAction, requestUndo, respondUndo } from '../../hooks/useSocket';
import { useHandGroups } from '../../hooks/useHandGroups';
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
  useSocket();
  const { gameState, showScoreBoard, setShowScoreBoard, clearSelection } = useGameStore();
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);
  const [joinModal, setJoinModal] = useState<LobbyGame | null>(null);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const myIndex = gameState?.myPlayerIndex ?? -1;
  const myCards = (myIndex >= 0 ? gameState?.players[myIndex]?.hand : undefined) ?? [];
  const groupStorageKey = gameState && myIndex >= 0 ? `hf_groups_${gameState.code}_${myIndex}` : null;
  const { groups, addGroup, addGroupWithCard, removeGroup, moveCardsToGroup, reorderWithinGroup, findCardGroup } =
    useHandGroups(groupStorageKey, myCards);

  useEffect(() => {
    if (!code) return;
    const stored = localStorage.getItem('hf_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.gameCode === code) {
          joinGame(code, '', session.sessionToken);
          setLoading(false);
          return;
        }
      } catch {}
    }

    fetch(`/api/games/${code}`)
      .then((r) => r.json())
      .then((game) => {
        if (game.error) { toast.error('Game not found'); navigate('/'); return; }
        setJoinModal({
          id: game.id, code: game.code, status: game.status,
          playerCount: game.playerCount, playerNames: game.playerNames,
          lastActionAt: Date.now(), createdAt: Date.now(),
          currentRound: game.currentRound, rules: game.rules,
        });
        setLoading(false);
      })
      .catch(() => { toast.error('Could not connect to game'); navigate('/'); });
  }, [code]);

  useEffect(() => { if (gameState) setLoading(false); }, [gameState]);

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as Card;
    if (card) setDraggingCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingCard(null);
    const { active, over } = event;
    if (!over || !gameState) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Sort within hand group
    if (activeType === 'hand-card' && overType === 'hand-card') {
      const activeId = String(active.id);
      const overId = String(over.id);
      const activeGroup = findCardGroup(activeId);
      if (!activeGroup) return;
      // Only reorder within same group
      if (activeGroup.cardIds.includes(overId)) {
        const oldIdx = activeGroup.cardIds.indexOf(activeId);
        const newIdx = activeGroup.cardIds.indexOf(overId);
        reorderWithinGroup(activeGroup.id, arrayMove(activeGroup.cardIds, oldIdx, newIdx));
      }
      return;
    }

    // Drop card onto the ghost target → create a new group with that card
    if (activeType === 'hand-card' && overType === 'new-group-slot') {
      addGroupWithCard(String(active.id));
      return;
    }

    // Drop card onto a book
    if (activeType === 'hand-card' && overType === 'book') {
      const card = active.data.current?.card as Card;
      if (card) {
        playCards({ action: 'add-to-book', cardIds: [card.id], bookId: over.data.current?.bookId });
        clearSelection();
      }
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
        <div className="text-center space-y-4">
          <div className="text-white text-xl">Connecting to game...</div>
          <Button variant="ghost" onClick={() => navigate('/')}>← Back to Lobby</Button>
        </div>
      </div>
    );
  }

  const isSpectator = myIndex === -1;
  const me = myIndex >= 0 ? gameState.players[myIndex] : null;
  const myTeamIndex = me?.teamIndex ?? -1;

  const otherPlayers = gameState.players
    .map((p, i) => ({ ...p, index: i }))
    .filter((_, i) => i !== myIndex);

  const positions: ('top' | 'left' | 'right')[] = [];
  const posMap: ('top' | 'left' | 'right')[] = ['left', 'top', 'top', 'right', 'left', 'right', 'top'];
  if (otherPlayers.length === 1) positions.push('top');
  else if (otherPlayers.length === 2) positions.push('left', 'right');
  else otherPlayers.forEach((_, i) => positions.push(posMap[i] ?? 'top'));

  const topOpponents = otherPlayers.filter((_, i) => positions[i] === 'top');
  const leftOpponents = otherPlayers.filter((_, i) => positions[i] === 'left');
  const rightOpponents = otherPlayers.filter((_, i) => positions[i] === 'right');

  // Undo state
  const { undoRequest, hasUndoSnapshot } = gameState;
  const myUndoApproval = undoRequest ? undoRequest.approvals.includes(myIndex) || undoRequest.denials.includes(myIndex) : false;
  const undoRequesterName = undoRequest ? gameState.players[undoRequest.requestedByIndex]?.name : '';

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-screen bg-felt-texture flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-felt-900/80 backdrop-blur border-b border-felt-700 px-4 py-2 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => navigate('/')} className="text-felt-400 hover:text-white text-sm transition-colors">← Lobby</button>
            <span className="text-felt-600">|</span>
            <span className="font-mono text-lg font-bold text-gold-400 tracking-widest">{gameState.code}</span>
            <span className="text-felt-400 text-sm">Round {gameState.currentRound}/{gameState.rules.numRounds}</span>
            {isSpectator && <span className="bg-blue-800 text-blue-200 text-xs px-2 py-0.5 rounded">Spectating</span>}
          </div>
          <div className="flex items-center gap-2">
            {!isSpectator && hasUndoSnapshot && !undoRequest && (
              <Button variant="ghost" size="sm" onClick={requestUndo} title="Request all players to undo last turn">
                ↩ Request Undo
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowScoreBoard(true)}>📊 Scores</Button>
          </div>
        </header>

        {/* Undo request banner */}
        <AnimatePresence>
          {undoRequest && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-yellow-900/80 border-b border-yellow-600 px-4 py-2 flex items-center justify-between gap-4 shrink-0"
            >
              <div className="text-sm">
                <span className="font-bold text-yellow-300">{undoRequesterName}</span>
                <span className="text-yellow-200"> requested an undo </span>
                <span className="text-yellow-400 text-xs">
                  ({undoRequest.approvals.length}/{gameState.players.length} approved)
                </span>
              </div>
              {!isSpectator && !myUndoApproval && undoRequest.requestedByIndex !== myIndex && (
                <div className="flex gap-2 shrink-0">
                  <Button variant="primary" size="sm" onClick={() => respondUndo(true)}>✓ Approve</Button>
                  <Button variant="danger" size="sm" onClick={() => respondUndo(false)}>✗ Deny</Button>
                </div>
              )}
              {!isSpectator && undoRequest.approvals.includes(myIndex) && (
                <span className="text-green-400 text-xs shrink-0">You approved</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main game area */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {topOpponents.length > 0 && (
            <div className="flex items-start justify-center gap-4 p-3 shrink-0 flex-wrap">
              {topOpponents.map((p) => (
                <OpponentView key={p.index} player={p} playerIndex={p.index} gameState={gameState} position="top" />
              ))}
            </div>
          )}

          <div className="flex-1 flex items-stretch gap-2 px-2 min-h-0">
            {leftOpponents.length > 0 && (
              <div className="flex flex-col items-end justify-center gap-3 shrink-0 w-28">
                {leftOpponents.map((p) => (
                  <OpponentView key={p.index} player={p} playerIndex={p.index} gameState={gameState} position="left" />
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 py-2">
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

              <div className="flex items-center justify-center py-2">
                <StockAndDiscard gameState={gameState} />
              </div>

              <GameLog entries={gameState.log} />
            </div>

            {rightOpponents.length > 0 && (
              <div className="flex flex-col items-start justify-center gap-3 shrink-0 w-28">
                {rightOpponents.map((p) => (
                  <OpponentView key={p.index} player={p} playerIndex={p.index} gameState={gameState} position="right" />
                ))}
              </div>
            )}
          </div>

          {!isSpectator && (
            <div className="shrink-0">
              <PlayerHand
                gameState={gameState}
                groups={groups}
                onMoveToGroup={moveCardsToGroup}
                onAddGroup={addGroup}
                onRemoveGroup={removeGroup}
              />
            </div>
          )}
        </div>

        <ScoreBoard gameState={gameState} open={showScoreBoard} onClose={() => setShowScoreBoard(false)} />
        <SecondTabModal />

        <DragOverlay>
          {draggingCard && <CardComponent card={draggingCard} size="md" className="rotate-6 opacity-90" />}
        </DragOverlay>

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
