import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useGameStore } from '../../store/gameStore';
import { joinGame, kickOldTab } from '../../hooks/useSocket';
import { useNavigate } from 'react-router-dom';

export function SecondTabModal() {
  const { secondTabPrompt, setSecondTabPrompt } = useGameStore();
  const navigate = useNavigate();

  if (!secondTabPrompt) return null;

  const handleKick = () => {
    kickOldTab(secondTabPrompt.gameCode, secondTabPrompt.playerName);
    navigate(`/game/${secondTabPrompt.gameCode}`);
    setSecondTabPrompt(null);
  };

  const handleBlock = () => {
    setSecondTabPrompt(null);
    localStorage.removeItem('hf_session');
    localStorage.removeItem('hf_pending_rejoin');
  };

  return (
    <Modal open title="Already Connected" size="sm">
      <div className="space-y-4">
        <p className="text-felt-200 text-sm">
          You're already connected to game <span className="font-mono font-bold text-gold-400">{secondTabPrompt.gameCode}</span> as <span className="font-bold">{secondTabPrompt.playerName}</span> from another tab or device.
        </p>
        <p className="text-felt-300 text-sm">What would you like to do?</p>
        <div className="space-y-2">
          <Button variant="gold" className="w-full" onClick={handleKick}>
            Disconnect old tab &amp; join here
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleBlock}>
            Stay on old tab (dismiss)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
