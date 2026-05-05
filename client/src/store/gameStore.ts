import { create } from 'zustand';
import { ClientGameState, LobbyGame, Card } from '../types';

interface GameStore {
  // Lobby
  lobbyGames: LobbyGame[];
  setLobbyGames: (games: LobbyGame[]) => void;

  // Current game
  gameState: ClientGameState | null;
  setGameState: (state: ClientGameState | null) => void;

  // My identity
  myPlayerIndex: number;
  sessionToken: string | null;
  setMyIdentity: (playerIndex: number, token: string) => void;

  // Selection state (cards selected for playing)
  selectedCardIds: string[];
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  selectCards: (cardIds: string[]) => void;

  // UI state
  showScoreBoard: boolean;
  setShowScoreBoard: (v: boolean) => void;
  showRules: boolean;
  setShowRules: (v: boolean) => void;

  // Error/notification
  lastError: string | null;
  setLastError: (e: string | null) => void;

  // Second tab prompt
  secondTabPrompt: { gameCode: string; playerName: string } | null;
  setSecondTabPrompt: (p: { gameCode: string; playerName: string } | null) => void;

  // Reset
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  lobbyGames: [],
  setLobbyGames: (games) => set({ lobbyGames: games }),

  gameState: null,
  setGameState: (state) => set({ gameState: state }),

  myPlayerIndex: -1,
  sessionToken: null,
  setMyIdentity: (playerIndex, token) => set({ myPlayerIndex: playerIndex, sessionToken: token }),

  selectedCardIds: [],
  toggleCardSelection: (cardId) => {
    const { selectedCardIds } = get();
    if (selectedCardIds.includes(cardId)) {
      set({ selectedCardIds: selectedCardIds.filter((id) => id !== cardId) });
    } else {
      set({ selectedCardIds: [...selectedCardIds, cardId] });
    }
  },
  clearSelection: () => set({ selectedCardIds: [] }),
  selectCards: (cardIds) => set({ selectedCardIds: cardIds }),

  showScoreBoard: false,
  setShowScoreBoard: (v) => set({ showScoreBoard: v }),
  showRules: false,
  setShowRules: (v) => set({ showRules: v }),

  lastError: null,
  setLastError: (e) => set({ lastError: e }),

  secondTabPrompt: null,
  setSecondTabPrompt: (p) => set({ secondTabPrompt: p }),

  reset: () => set({
    gameState: null,
    myPlayerIndex: -1,
    sessionToken: null,
    selectedCardIds: [],
    lastError: null,
    secondTabPrompt: null,
  }),
}));
