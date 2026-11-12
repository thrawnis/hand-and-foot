import { Server, Socket } from 'socket.io';
import {
  JoinGamePayload, DrawDiscardPayload, PlayCardsPayload,
  DiscardPayload, CloseBookPayload, GameState, RequestTakeoverPayload,
} from '../types';
import {
  toClientState, toLobbyGame, drawFromStock, drawFromDiscard,
  playCards, closeBook, discardCard, goOut, requestUndo, respondUndo, cancelUndo,
  requestConvertToBot, requestTakeover, respondSeatRequest, cancelSeatRequest,
  evaluateSeatRequest, SeatResult,
} from '../services/gameService';
import { setBroadcast, scheduleNextBotTurn, autoBotUndoApproval, resumeBotTurns } from '../services/botStrategy';
import { loadGameByCode, saveGame, listGames } from '../db';

// Track: socketId -> { gameCode, playerIndex }
const socketGameMap = new Map<string, { gameCode: string; playerIndex: number }>();

// A human asking for a bot seat back has no seat yet, so remember which socket
// made the pending request: gameCode -> socketId.
const takeoverRequesters = new Map<string, string>();

// Connection flags are saved with the game, so after a restart they describe
// sockets that no longer exist. Clear them; clients reconnect on their own.
function resetConnectionFlags(): void {
  for (const row of listGames(false)) {
    const state: GameState = JSON.parse(row.state);
    let changed = false;
    for (const p of state.players) {
      if (p.isBot) continue;
      if (p.isConnected || p.socketId) {
        p.isConnected = false;
        p.socketId = undefined;
        p.disconnectedAt = Date.now();
        changed = true;
      }
    }
    if (changed) saveGame(state);
  }
}

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

  resetConnectionFlags();
  resumeBotTurns();

  const isSocketAlive = (socketId?: string): boolean => !!socketId && io.sockets.sockets.has(socketId);

  // A seat request just finished. Wire up whatever the new seat owner needs.
  const onSeatApplied = (state: GameState, result: SeatResult): void => {
    if (result.applied === 'convert-to-bot') {
      // A bot joining mid-vote counts as agreeing to a pending undo.
      const undone = autoBotUndoApproval(state);
      broadcastGame(io, state);
      scheduleNextBotTurn(state);
      if (undone) broadcastGame(io, state);
    } else if (result.applied === 'take-over' && result.targetIndex !== undefined) {
      const player = state.players[result.targetIndex];
      const socketId = takeoverRequesters.get(state.code);
      takeoverRequesters.delete(state.code);
      if (socketId && isSocketAlive(socketId)) {
        player.socketId = socketId;
        player.isConnected = true;
        socketGameMap.set(socketId, { gameCode: state.code, playerIndex: result.targetIndex });
        saveGame(state);
        io.to(socketId).emit('game:joined', {
          playerIndex: result.targetIndex,
          sessionToken: player.sessionToken,
          gameCode: state.code,
        });
      } else {
        // Requester vanished while approving — hand the seat straight back to the bot.
        player.isBot = true;
        player.isConnected = true;
        saveGame(state);
        scheduleNextBotTurn(state);
      }
      broadcastGame(io, state);
    }
    broadcastLobby(io);
  };

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

      // Find player by name, or by session token when reconnecting from a stored session
      let playerIndex: number;
      if (payload.playerName) {
        playerIndex = state.players.findIndex(
          (p) => p.name.toLowerCase() === payload.playerName.toLowerCase()
        );
        if (playerIndex === -1) {
          socket.emit('game:error', { message: 'Player name not found in this game' });
          return;
        }
      } else {
        playerIndex = state.players.findIndex((p) => p.sessionToken === payload.sessionToken);
        if (playerIndex === -1) {
          socket.emit('game:error', { message: 'Session expired — please re-enter your name' });
          return;
        }
      }

      const player = state.players[playerIndex];

      // A bot is playing this seat: a human has to be approved by the others to get it back.
      if (player.isBot) {
        socket.emit('game:bot-seat', { gameCode: state.code, playerName: player.name });
        return;
      }

      // Check if already connected from another socket (ignoring sockets that are gone)
      if (player.isConnected && player.socketId && player.socketId !== socket.id && isSocketAlive(player.socketId)) {
        socket.emit('game:second-tab', {
          gameCode: payload.gameCode,
          playerName: player.name,
          existingSocketId: player.socketId,
        });
        return;
      }

      // Validate session token for name-based joins (token-based joins already matched by token)
      if (payload.playerName && payload.sessionToken && payload.sessionToken !== player.sessionToken) {
        socket.emit('game:error', { message: 'Invalid session token' });
        return;
      }

      // Register player as connected
      player.isConnected = true;
      player.socketId = socket.id;
      player.disconnectedAt = undefined;
      socketGameMap.set(socket.id, { gameCode: state.code, playerIndex });

      saveGame(state);
      socket.emit('game:joined', {
        playerIndex,
        sessionToken: player.sessionToken,
        gameCode: state.code,
      });

      // Coming back drops a "replace with bot" vote about this player, and a
      // newly present player may be the last approver a seat request needed.
      const seatResult = evaluateSeatRequest(state);

      broadcastGame(io, state);
      broadcastLobby(io);
      if (seatResult.applied) onSeatApplied(state, seatResult);
    });

    socket.on('game:kick-old-tab', (payload: { gameCode: string; playerName: string }) => {
      const state = loadGameByCode(payload.gameCode);
      if (!state) return;
      const playerIndex = state.players.findIndex(
        (p) => p.name.toLowerCase() === payload.playerName.toLowerCase()
      );
      if (playerIndex === -1) return;
      const player = state.players[playerIndex];

      if (player.isBot) {
        socket.emit('game:bot-seat', { gameCode: state.code, playerName: player.name });
        return;
      }

      if (player.socketId && player.socketId !== socket.id) {
        io.to(player.socketId).emit('game:kicked', { reason: 'Replaced by new connection' });
        socketGameMap.delete(player.socketId);
      }

      player.isConnected = true;
      player.socketId = socket.id;
      player.disconnectedAt = undefined;
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
      const undone = autoBotUndoApproval(state);
      broadcastGame(io, state);
      // The undo may have handed the turn to a bot, which nothing else would wake up.
      if (undone) scheduleNextBotTurn(state);
    });

    socket.on('game:respond-undo', (payload: { approve: boolean }) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = respondUndo(state, info.playerIndex, payload.approve);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
      if (result.applied) scheduleNextBotTurn(state);
    });

    socket.on('game:cancel-undo', () => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = cancelUndo(state, info.playerIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
    });

    // ── Seat control (absent player → bot, bot → human) ──────────────────────

    socket.on('game:request-convert-bot', (payload: { targetIndex: number }) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const result = requestConvertToBot(state, info.playerIndex, payload.targetIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      broadcastGame(io, state);
      if (result.applied) onSeatApplied(state, result);
    });

    socket.on('game:request-takeover', (payload: RequestTakeoverPayload) => {
      const state = loadGameByCode(payload.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }
      const targetIndex = state.players.findIndex(
        (p) => p.name.toLowerCase() === payload.playerName.toLowerCase()
      );
      if (targetIndex === -1) { socket.emit('game:error', { message: 'Player name not found in this game' }); return; }

      const result = requestTakeover(state, targetIndex);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }
      takeoverRequesters.set(state.code, socket.id);
      socket.emit('game:takeover-pending', { gameCode: state.code, playerName: state.players[targetIndex].name });
      broadcastGame(io, state);
      if (result.applied) onSeatApplied(state, result);
    });

    socket.on('game:respond-seat-request', (payload: { approve: boolean }) => {
      const info = socketGameMap.get(socket.id);
      if (!info) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(info.gameCode);
      if (!state) { socket.emit('game:error', { message: 'Game not found' }); return; }

      const pending = state.seatRequest;
      const result = respondSeatRequest(state, info.playerIndex, payload.approve);
      if (!result.ok) { socket.emit('game:error', { message: result.error }); return; }

      if (pending?.type === 'take-over' && !state.seatRequest && !result.applied) {
        const requester = takeoverRequesters.get(state.code);
        takeoverRequesters.delete(state.code);
        if (requester) io.to(requester).emit('game:takeover-denied', { gameCode: state.code });
      }
      broadcastGame(io, state);
      if (result.applied) onSeatApplied(state, result);
    });

    socket.on('game:cancel-seat-request', () => {
      const info = socketGameMap.get(socket.id);
      // Someone not seated can only be cancelling their own take-over request.
      const gameCode = info?.gameCode
        ?? [...takeoverRequesters.entries()].find(([, sid]) => sid === socket.id)?.[0];
      if (!gameCode) { socket.emit('game:error', { message: 'Not in a game' }); return; }
      const state = loadGameByCode(gameCode);
      const req = state?.seatRequest;
      if (!state || !req) return;

      const isTakeoverRequester = req.type === 'take-over' && takeoverRequesters.get(gameCode) === socket.id;
      const isConvertRequester = req.type === 'convert-to-bot' && info?.playerIndex === req.requestedByIndex;
      if (!isTakeoverRequester && !isConvertRequester) {
        socket.emit('game:error', { message: 'Only the player who asked can cancel' });
        return;
      }
      cancelSeatRequest(state);
      if (req.type === 'take-over') takeoverRequesters.delete(gameCode);
      broadcastGame(io, state);
    });

    socket.on('disconnect', () => {
      // A pending take-over with no one left to receive the seat is pointless.
      for (const [gameCode, socketId] of takeoverRequesters.entries()) {
        if (socketId !== socket.id) continue;
        takeoverRequesters.delete(gameCode);
        const state = loadGameByCode(gameCode);
        if (state?.seatRequest?.type === 'take-over') {
          cancelSeatRequest(state);
          broadcastGame(io, state);
        }
      }

      const info = socketGameMap.get(socket.id);
      if (info) {
        const state = loadGameByCode(info.gameCode);
        if (state) {
          const player = state.players[info.playerIndex];
          if (player && player.socketId === socket.id) {
            player.isConnected = false;
            player.socketId = undefined;
            player.disconnectedAt = Date.now();
            saveGame(state);
            // One fewer approver may be exactly what a pending seat request was waiting for.
            const seatResult = evaluateSeatRequest(state);
            broadcastGame(io, state);
            broadcastLobby(io);
            if (seatResult.applied) onSeatApplied(state, seatResult);
          }
        }
        socketGameMap.delete(socket.id);
      }
    });
  });
}
