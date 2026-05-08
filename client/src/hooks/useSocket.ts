import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useGameStore } from '../store/gameStore';
import { ClientGameState, LobbyGame } from '../types';

const SOCKET_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:3001';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socketInstance;
}

export function useSocket() {
  const { setGameState, setLobbyGames, setMyIdentity, setLastError, setSecondTabPrompt, reset } = useGameStore();
  const socket = getSocket();

  useEffect(() => {
    const onGameState = (state: ClientGameState) => {
      setGameState(state);
    };

    const onLobbyGames = (games: LobbyGame[]) => {
      setLobbyGames(games);
    };

    const onGameJoined = (data: { playerIndex: number; sessionToken: string; gameCode: string }) => {
      setMyIdentity(data.playerIndex, data.sessionToken);
      localStorage.setItem('hf_session', JSON.stringify({
        gameCode: data.gameCode,
        sessionToken: data.sessionToken,
        playerIndex: data.playerIndex,
      }));
    };

    const onGameError = (data: { message: string }) => {
      setLastError(data.message);
      toast.error(data.message, { duration: 4000 });
    };

    const onGameKicked = (data: { reason: string }) => {
      toast.error(`Disconnected: ${data.reason}`);
      localStorage.removeItem('hf_session');
      reset();
    };

    const onSecondTab = (data: { gameCode: string; playerName: string }) => {
      setSecondTabPrompt(data);
    };

    const onConnect = () => {
      const stored = localStorage.getItem('hf_session');
      if (!stored) return;
      try {
        const session = JSON.parse(stored);
        // Always attempt to rejoin on connect/reconnect using the stored token.
        // The server will look up by token so no player name is needed.
        // Also keep hf_pending_rejoin so the lobby can show a "Rejoin" banner.
        getSocket().emit('game:join', {
          gameCode: session.gameCode,
          playerName: '',
          sessionToken: session.sessionToken,
        });
        localStorage.setItem('hf_pending_rejoin', JSON.stringify(session));
      } catch {
        localStorage.removeItem('hf_session');
      }
    };

    socket.on('game:state', onGameState);
    socket.on('lobby:games', onLobbyGames);
    socket.on('game:joined', onGameJoined);
    socket.on('game:error', onGameError);
    socket.on('game:kicked', onGameKicked);
    socket.on('game:second-tab', onSecondTab);
    socket.on('connect', onConnect);

    return () => {
      socket.off('game:state', onGameState);
      socket.off('lobby:games', onLobbyGames);
      socket.off('game:joined', onGameJoined);
      socket.off('game:error', onGameError);
      socket.off('game:kicked', onGameKicked);
      socket.off('game:second-tab', onSecondTab);
      socket.off('connect', onConnect);
    };
  }, []);

  return socket;
}

// Game actions
export function joinGame(gameCode: string, playerName: string, sessionToken?: string) {
  getSocket().emit('game:join', { gameCode, playerName, sessionToken });
}

export function spectateGame(gameCode: string) {
  getSocket().emit('game:spectate', { gameCode });
}

export function kickOldTab(gameCode: string, playerName: string) {
  getSocket().emit('game:kick-old-tab', { gameCode, playerName });
}

export function drawStock() {
  getSocket().emit('game:draw-stock');
}

export function drawDiscard(matchingCardIds: [string, string]) {
  getSocket().emit('game:draw-discard', { matchingCardIds });
}

export function playCards(payload: {
  action: 'new-book' | 'add-to-book';
  cardIds: string[];
  bookId?: string;
  rank?: string;
  teamIndex?: number;
}) {
  getSocket().emit('game:play-cards', payload);
}

export function discardCard(cardId: string) {
  getSocket().emit('game:discard', { cardId });
}

export function closeBook(bookId: string, teamIndex: number) {
  getSocket().emit('game:close-book', { bookId, teamIndex });
}

export function goOut() {
  getSocket().emit('game:go-out');
}

export function subscribeToLobby() {
  getSocket().emit('lobby:subscribe');
}

export function unsubscribeFromLobby() {
  getSocket().emit('lobby:unsubscribe');
}

export function requestUndo() {
  getSocket().emit('game:request-undo');
}

export function respondUndo(approve: boolean) {
  getSocket().emit('game:respond-undo', { approve });
}
