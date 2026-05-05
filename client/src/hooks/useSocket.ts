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
      // Attempt reconnection from stored session
      const stored = localStorage.getItem('hf_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          // Re-fetch game info to check if still active
          fetch(`/api/games/${session.gameCode}`)
            .then((r) => r.json())
            .then((game) => {
              if (game.status === 'active' || game.status === 'waiting') {
                // Rejoin; user will need to pick their name via the UI
                // Store game code for the lobby to show "rejoin" prompt
                localStorage.setItem('hf_pending_rejoin', JSON.stringify(session));
              } else {
                localStorage.removeItem('hf_session');
              }
            })
            .catch(() => localStorage.removeItem('hf_session'));
        } catch {
          localStorage.removeItem('hf_session');
        }
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
