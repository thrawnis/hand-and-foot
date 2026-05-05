import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { LobbyGame } from '../../types';
import { joinGame, spectateGame } from '../../hooks/useSocket';
import { useGameStore } from '../../store/gameStore';

interface JoinGameModalProps {
  game: LobbyGame;
  onClose: () => void;
}

export function JoinGameModal({ game, onClose }: JoinGameModalProps) {
  const navigate = useNavigate();
  const setGameState = useGameStore((s) => s.setGameState);
  const [selectedName, setSelectedName] = useState('');
  const [mode, setMode] = useState<'play' | 'spectate'>('play');

  const handleJoin = () => {
    if (mode === 'spectate') {
      spectateGame(game.code);
      navigate(`/game/${game.code}`);
      onClose();
      return;
    }
    if (!selectedName) return;
    joinGame(game.code, selectedName);
    navigate(`/game/${game.code}`);
    onClose();
  };

  return (
    <Modal open title={`Join Game ${game.code}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('play')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'play' ? 'bg-gold-500 text-felt-900' : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
            }`}
          >
            Play
          </button>
          <button
            onClick={() => setMode('spectate')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'spectate' ? 'bg-blue-600 text-white' : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
            }`}
          >
            Spectate
          </button>
        </div>

        {mode === 'play' && (
          <>
            <p className="text-sm text-felt-300">Select your name:</p>
            <div className="grid grid-cols-2 gap-2">
              {game.playerNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setSelectedName(name)}
                  className={`p-3 rounded-xl text-sm font-medium border transition-all ${
                    selectedName === name
                      ? 'bg-gold-500/20 border-gold-500 text-gold-300'
                      : 'bg-felt-700 border-felt-600 text-felt-200 hover:border-felt-400'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'spectate' && (
          <p className="text-sm text-felt-300 text-center py-2">
            You'll be able to watch the game but not interact.
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="gold"
            className="flex-1"
            onClick={handleJoin}
            disabled={mode === 'play' && !selectedName}
          >
            {mode === 'play' ? 'Join Game' : 'Watch Game'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
