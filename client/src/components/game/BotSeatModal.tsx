import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useGameStore } from '../../store/gameStore';
import { requestTakeover, cancelSeatRequest } from '../../hooks/useSocket';

// Shown when someone tries to join a seat that a bot is currently playing.
// They have to ask, and every other connected player must approve.
export function BotSeatModal() {
  const { botSeatPrompt, setBotSeatPrompt, gameState } = useGameStore();
  const navigate = useNavigate();

  // Approved: the server seats us and starts sending that game's state.
  useEffect(() => {
    if (
      botSeatPrompt && gameState &&
      gameState.code === botSeatPrompt.gameCode && gameState.myPlayerIndex >= 0
    ) {
      setBotSeatPrompt(null);
      navigate(`/game/${botSeatPrompt.gameCode}`);
    }
  }, [botSeatPrompt, gameState, navigate, setBotSeatPrompt]);

  if (!botSeatPrompt) return null;
  const { gameCode, playerName, status } = botSeatPrompt;

  const dismiss = () => {
    // The stored session points at the seat the bot has, so it would reopen this prompt on every reconnect.
    localStorage.removeItem('hf_session');
    localStorage.removeItem('hf_pending_rejoin');
    setBotSeatPrompt(null);
  };

  return (
    <Modal open title="A bot is playing this seat" size="sm">
      <div className="space-y-4">
        <p className="text-felt-200 text-sm">
          The <span className="font-bold">{playerName}</span> seat in game{' '}
          <span className="font-mono font-bold text-gold-400">{gameCode}</span> is being played by a bot right now.
        </p>

        {status === 'ask' && (
          <>
            <p className="text-felt-300 text-sm">
              You can ask to take the seat back. Every other player in the game has to approve.
            </p>
            <div className="space-y-2">
              <Button variant="gold" className="w-full" onClick={() => requestTakeover(gameCode, playerName)}>
                Ask to take my seat back
              </Button>
              <Button variant="ghost" className="w-full" onClick={dismiss}>Never mind</Button>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <p className="text-felt-300 text-sm animate-pulse">Waiting for the other players to approve…</p>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => { cancelSeatRequest(); setBotSeatPrompt({ gameCode, playerName, status: 'ask' }); }}
            >
              Cancel request
            </Button>
          </>
        )}

        {status === 'denied' && (
          <>
            <p className="text-red-300 text-sm">The other players didn't approve. The bot keeps the seat for now.</p>
            <div className="space-y-2">
              <Button variant="gold" className="w-full" onClick={() => setBotSeatPrompt({ gameCode, playerName, status: 'ask' })}>
                Ask again
              </Button>
              <Button variant="ghost" className="w-full" onClick={dismiss}>Close</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
