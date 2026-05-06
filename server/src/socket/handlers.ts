import { Server, Socket } from 'socket.io';
import {
  JoinGamePayload, DrawDiscardPayload, PlayCardsPayload,
  DiscardPayload, CloseBookPayload, GameState,
} from '../types';
import {
  toClientState, toLobbyGame, drawFromStock, drawFromDiscard,
  playCards, closeBook, discardCard, goOut, requestUndo, respondUndo,
} from '../services/gameService';
import { setBroadcast, scheduleNextBotTurn, autoBotUndoApproval } from '../services/botStrategy';
import { loadGameByCode, saveGame, listGames } from '../db';

// Track: socketId -> { gameCode, playerIndex }
const socketGameMap = new Map<string, { gameCode: string; playerIndex: number }>();

function broadcastGame(io: Server, state: GameState): void {
  for (const [socketId, info] of socketGameMap.entries()) {
    if (info.gameCode === state.code) {
      const clientState = toClientState(state, info.playerIndex);
      io.to(socketId).emit('game:state', clientState);
    }
  }
  // Also update spectators in the game room
  io.to(`spectate:${state.code}`).emit('game:state', toClientState(state, -1));
}

function broadcastLobby(io: Server): void {
  const rows = listGames(false);
  const lobbyGames = rows.map((r) => {
    const state: GameState = JSON.parse(r.state);
    return toLobbyGame(state);
  });
  io.to('lobby').emit('lobby:games', lobbyGames);
}

export function registerSocketHandlers(io: Server): void {
  setBroadcast((state: GameState) => broadcastGame(io, state));

  io.on('connection', (socket: Socket) => {

    socket.on('lobby:subscribe', () => {
      socket.join('lobby');
      const rows = listGames(false);
      const lobbyGames = rows.map((r) => {
        const state: GameState = JSON.parse(r.state);
        return toLobbyGame(state);
      });
      socket.emit('lobby:games', lobbyGames);
    });

    socket.on('lobby:unsubscribe', () => {
      socket.leave('lobby');
    });

    socket.on('game:join', (payload: JoinGamePayload) => {
      const state = loadGameByCode(payload.gameCode);
      if (!state) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }
      if (state.status === 'completed' || state.status === 'archived') {
        socket.emit('game:error', { message: 'This game has ended' });
        return;
      }

      // Find player by name
      const playerIndex = state.players.findIndex(
        (p) => p.name.toLowerCase() === payload.playerName.toLowerCase()
      );
      if (playerIndex === -1) {
        socket.emit('game:error', { message: 'Player name not found in this game' });
        return;
      }

      const player = state.players[playerIndex];

      // Check if already connected from another socket
      if (player.isConnected && player.socketId && player.socketId !== socket.id) {
        // Prompt the new connection about the conflict
        socket.emit('game:second-tab', {
          gameCode: payload.gameCode,
          playerName: payload.playerName,
          existingSocketId: player.socketId,
        });
        return;
      }

      // Validate session token if provided
      if (payload.sessionToken && payload.sessionToken !== player.sessionToken) {
        socket.emit('game:error', { message: 'Invalid session token' });
        return;
      }

      // Register player as connected
      const prevSocketId = player.socketId;
      player.isConnected = true;
      player.socketId = socket.id;
      socketGameMap.set(socket.id, { gameCode: state.code, playerIndex });

      saveGame(state);
      socket.emit('game:joined', {
        playerIndex,
        sessionToken: player.sessionToken,
        gameCode: state.code,
      });

      broadcastGame(io, state);
      broadcastLobby(io);
    });

    socket.on('game:kick-old-tab', (payload: { gameCode: string; playerName: string }) => {
      const state = loadGameByCode(payload.gameCode);
      if (!state) return;
      const playerIndex = state.players.findIndex(
        (p) => p.name.toLowerCase() === payload.playerName.toLowerCase()
      );
      if (playerIndex === -1) return;
      const player = state.players[playerIndex];

      if (player.socketId && player.socketId !== socket.id) {
        io.to(player.socketId).emit('game:kicked', { reason: 'Replaced by new connection' });
        socketGameMap.delete(player.socketId);
      }

      player.isConnected = true;
      player.socketId = socket.id;
      socketGameMap.set(socket.id, { gameCode: state.code, playerIndex });
      saveGame(state);
      socket.emit('game:joined', { playerIndex, sessionToken: player.sessionToken, gameCode: state.code });
      broadcastGame(io, state);
    });

    socket.on('game:spectate', (payload: { gameCode: string }) => {
      const state = loadGameByCode(payload.gameCode);
      if (!state) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }
      socket.join(`spectate:${payload.gameCode}`);
      socket.emit('game:state', toClientState(state, -1));
    });

    socket.on('game:draw-stock', () => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = drawFromStock(state, info.playerIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    socket.on('game:draw-discard', (payload: DrawDiscardPayload) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = drawFromDiscard(state, info.playerIndex, payload);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    socket.on('game:play-cards', (payload: PlayCardsPayload) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = playCards(state, info.playerIndex, payload);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    socket.on('game:close-book', (payload: CloseBookPayload) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = closeBook(state, info.playerIndex, payload);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    socket.on('game:discard', (payload: DiscardPayload) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = discardCard(state, info.playerIndex, payload);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
      scheduleNextBotTurn(state);
      broadcastLobby(io);
    });

    socket.on('game:go-out', () => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = goOut(state, info.playerIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
      scheduleNextBotTurn(state);
      broadcastLobby(io);
    });

    socket.on('game:request-undo', () => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = requestUndo(state, info.playerIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
      autoBotUndoApproval(state);
      broadcastGame(io, state);
    });

    socket.on('game:respond-undo', (payload: { approve: boolean }) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = respondUndo(state, info.playerIndex, payload.approve);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    socket.on('disconnect', () => {
      const info = socketGameMap.get(socket.id);
      if (info) {
        const state = loadGameByCode(info.gameCode);
        if (state) {
          const player = state.players[info.playerIndex];
          if (player && player.socketId === socket.id) {
            player.isConnected = false;
            player.socketId = undefined;
            saveGame(state);
            broadcastGame(io, state);
            broadcastLobby(io);
          }
        }
        socketGameMap.delete(socket.id);
      }
    });
  });
}
