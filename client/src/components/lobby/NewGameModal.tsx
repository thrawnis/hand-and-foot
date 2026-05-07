import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { GameRules, DEFAULT_RULES, RulePreset } from '../../types';
import { joinGame } from '../../hooks/useSocket';
import toast from 'react-hot-toast';

interface NewGameModalProps {
  open: boolean;
  onClose: () => void;
}

const RULE_FIELDS: Array<{
  key: keyof GameRules;
  label: string;
  type: 'number' | 'number[]';
  description?: string;
}> = [
  { key: 'cardsPerHand', label: 'Cards per Hand/Foot', type: 'number' },
  { key: 'minCardsPerBook', label: 'Min Cards per Book', type: 'number' },
  { key: 'minCleanBooksToGoOut', label: 'Clean Books to Go Out', type: 'number' },
  { key: 'minDirtyBooksToGoOut', label: 'Dirty Books to Go Out', type: 'number' },
  { key: 'maxWildsPerDirtyBook', label: 'Max Wilds per Dirty Book', type: 'number' },
  { key: 'cleanBookValue', label: 'Clean Book Value (pts)', type: 'number' },
  { key: 'dirtyBookValue', label: 'Dirty Book Value (pts)', type: 'number' },
  { key: 'bookOf3sBonus', label: 'Book of 3s Bonus (pts)', type: 'number' },
  { key: 'cleanBookOf7sBonus', label: 'Clean Book of 7s Bonus (pts)', type: 'number' },
  { key: 'goingOutBonus', label: 'Going Out Bonus (pts)', type: 'number' },
  { key: 'numRounds', label: 'Number of Rounds', type: 'number' },
  { key: 'red3Penalty', label: 'Red 3 Penalty (pts)', type: 'number', description: 'Subtracted if not in closed book' },
  { key: 'black3Penalty', label: 'Black 3 Penalty (pts)', type: 'number', description: 'Subtracted if not in closed book' },
  { key: 'roundThresholds', label: 'Round Thresholds (comma-separated)', type: 'number[]', description: 'Min pts to open per round' },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function NewGameModal({ open, onClose }: NewGameModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'players' | 'rules' | 'review'>('players');
  const [playerCount, setPlayerCount] = useState(4);
  const [playerNames, setPlayerNames] = useState(['', '', '', '']);
  const [teamNames, setTeamNames] = useState(['', '']);
  const [botSlots, setBotSlots] = useState<boolean[]>([false, false, false, false]);
  const [rules, setRules] = useState<GameRules>({ ...DEFAULT_RULES });
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('players');
      setRules({ ...DEFAULT_RULES, playerCount });
    }
  }, [open]);

  useEffect(() => {
    setPlayerNames((prev) => {
      const names = [...prev];
      while (names.length < playerCount) names.push('');
      return names.slice(0, playerCount);
    });
    setBotSlots((prev) => {
      const slots = [...prev];
      while (slots.length < playerCount) slots.push(false);
      return slots.slice(0, playerCount);
    });
    setRules((r) => ({ ...r, playerCount, deckCount: playerCount + 1 }));
  }, [playerCount]);

  // Load presets (public endpoint — no auth required)
  useEffect(() => {
    if (open) {
      fetch('/api/presets')
        .then((r) => r.ok ? r.json() : [])
        .then(setPresets)
        .catch(() => {});
    }
  }, [open]);

  const handleScramble = () => {
    setPlayerNames(shuffle(playerNames));
  };

  const resolvedNames = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);
  const resolvedTeamNames = teamNames.map((n, i) => n.trim() || `Team ${i + 1}`);
  const effectiveNames = playerNames.map((n, i) => botSlots[i] ? `Bot ${i + 1}` : (n.trim() || `Player ${i + 1}`));

  const handleSubmit = async () => {
    const names = effectiveNames;
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
      toast.error('Player names must be unique');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: names[0], playerNames: names, teamNames: resolvedTeamNames, rules, botSlots }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create game');
        return;
      }
      // Host (first human player) joins automatically
      const firstHuman = data.playerTokens.findIndex((t: { isBot: boolean }) => !t.isBot);
      if (firstHuman >= 0) {
        joinGame(data.code, data.playerTokens[firstHuman].name, data.playerTokens[firstHuman].sessionToken);
      }
      navigate(`/game/${data.code}`);
      onClose();
    } catch (e) {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: RulePreset) => {
    setRules({ ...preset.rules, playerCount, deckCount: playerCount + 1 });
    setSelectedPresetId(preset.id);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Game" size="lg">
      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {(['players', 'rules', 'review'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              step === s ? 'bg-gold-500 text-felt-900' :
              ['players', 'rules', 'review'].indexOf(step) > i ? 'bg-green-600 text-white' : 'bg-felt-700 text-felt-400'
            }`}>
              {i + 1}
            </div>
            <span className={`text-sm ${step === s ? 'text-white font-medium' : 'text-felt-400'}`}>
              {s === 'players' ? 'Players' : s === 'rules' ? 'Rules' : 'Review'}
            </span>
            {i < 2 && <div className="w-6 h-px bg-felt-600" />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'players' && (
          <motion.div
            key="players"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-felt-200 mb-2">Player Count</label>
              <div className="flex gap-2">
                {[2, 4, 6, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${
                      playerCount === n ? 'bg-gold-500 text-felt-900' : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Team names */}
            {playerCount >= 2 && (
              <div>
                <label className="block text-sm font-medium text-felt-200 mb-2">Team Names <span className="text-felt-500 font-normal">(optional)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((t) => (
                    <input
                      key={t}
                      value={teamNames[t]}
                      onChange={(e) => { const n = [...teamNames]; n[t] = e.target.value; setTeamNames(n); }}
                      placeholder={`Team ${t + 1}`}
                      className={`w-full bg-felt-700 border rounded-lg px-3 py-2 text-white placeholder-felt-400 focus:outline-none focus:border-gold-500 ${t === 0 ? 'border-blue-700' : 'border-red-800'}`}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-felt-200">
                  Player Names <span className="text-felt-500 font-normal">(optional — defaults to Player #)</span>
                </label>
                <Button variant="ghost" size="sm" onClick={handleScramble}>🔀 Scramble</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {playerNames.map((name, i) => (
                  <div key={i} className="relative flex items-center gap-1">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold px-1.5 py-0.5 rounded ${
                      i % 2 === 0 ? 'bg-blue-700 text-blue-100' : 'bg-red-800 text-red-100'
                    }`}>
                      T{(i % 2) + 1}
                    </span>
                    <input
                      value={botSlots[i] ? '' : name}
                      disabled={botSlots[i]}
                      onChange={(e) => {
                        const names = [...playerNames];
                        names[i] = e.target.value;
                        setPlayerNames(names);
                      }}
                      placeholder={botSlots[i] ? `Bot ${i + 1}` : `Player ${i + 1}`}
                      className="w-full bg-felt-700 border border-felt-600 rounded-lg pl-10 pr-10 py-2 text-white placeholder-felt-400 focus:outline-none focus:border-gold-500 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => {
                        const slots = [...botSlots];
                        slots[i] = !slots[i];
                        setBotSlots(slots);
                      }}
                      title={i === 0 ? 'Host must be human' : botSlots[i] ? 'Switch to human' : 'Switch to bot'}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none transition-opacity ${i === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}`}
                    >
                      {botSlots[i] ? '🤖' : '👤'}
                    </button>
                  </div>
                ))}
              </div>
              {playerCount > 2 && (
                <p className="text-xs text-felt-400 mt-2">
                  {resolvedTeamNames[0]}: {effectiveNames.filter((_, i) => i % 2 === 0).join(', ')} &nbsp;|&nbsp;
                  {resolvedTeamNames[1]}: {effectiveNames.filter((_, i) => i % 2 === 1).join(', ')}
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="gold" onClick={() => setStep('rules')}>
                Next: Rules →
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'rules' && (
          <motion.div
            key="rules"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-felt-200 mb-2">Preset</label>
              <div className="flex flex-wrap gap-2">
                {presets.length === 0 && (
                  <span className="text-felt-500 text-sm">No presets saved — using defaults</span>
                )}
                {presets.map((p) => {
                  const active = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        active
                          ? 'bg-gold-500/20 border-gold-500 text-gold-300'
                          : 'bg-felt-700 border-felt-600 text-felt-200 hover:border-gold-500 hover:text-gold-300'
                      }`}
                    >
                      {active && <span className="mr-1">✓</span>}{p.name}
                    </button>
                  );
                })}
                <button
                  onClick={() => { setRules({ ...DEFAULT_RULES, playerCount, deckCount: playerCount + 1 }); setSelectedPresetId(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    selectedPresetId === null
                      ? 'bg-felt-600 border-felt-500 text-felt-200'
                      : 'bg-felt-700 border-felt-600 text-felt-400 hover:border-felt-400'
                  }`}
                >
                  {selectedPresetId === null && <span className="mr-1">✓</span>}Defaults
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
              {RULE_FIELDS.map(({ key, label, type, description }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-felt-300 mb-1">
                    {label}
                    {description && <span className="text-felt-500 ml-1">({description})</span>}
                  </label>
                  {type === 'number[]' ? (
                    <input
                      type="text"
                      value={(rules[key] as number[]).join(', ')}
                      onChange={(e) => {
                        const vals = e.target.value.split(',').map((v) => parseInt(v.trim())).filter((v) => !isNaN(v));
                        setRules((r) => ({ ...r, [key]: vals }));
                        setSelectedPresetId(null);
                      }}
                      className="w-full bg-felt-700 border border-felt-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-gold-500"
                    />
                  ) : (
                    <input
                      type="number"
                      value={rules[key] as number}
                      onChange={(e) => { setRules((r) => ({ ...r, [key]: parseInt(e.target.value) || 0 })); setSelectedPresetId(null); }}
                      className="w-full bg-felt-700 border border-felt-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-gold-500"
                    />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-felt-300 mb-1">
                  Winning Score (optional)
                </label>
                <input
                  type="number"
                  value={rules.winningScore ?? ''}
                  placeholder="No limit"
                  onChange={(e) => setRules((r) => ({ ...r, winningScore: e.target.value ? parseInt(e.target.value) : undefined }))}
                  className="w-full bg-felt-700 border border-felt-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-gold-500"
                />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('players')}>← Back</Button>
              <Button variant="gold" onClick={() => setStep('review')}>Next: Review →</Button>
            </div>
          </motion.div>
        )}

        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="bg-felt-700 rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-white">Players</h3>
              <div className="grid grid-cols-2 gap-1">
                {playerNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      i % 2 === 0 ? 'bg-blue-700' : 'bg-red-800'
                    }`}>{i + 1}</span>
                    <span className="text-white">{name || '—'}</span>
                    <span className="text-felt-400 text-xs">Team {(i % 2) + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-felt-700 rounded-xl p-4">
              <h3 className="font-semibold text-white mb-2">Key Rules</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-felt-300">Rounds</span><span className="text-white">{rules.numRounds}</span>
                <span className="text-felt-300">Decks</span><span className="text-white">{rules.deckCount}</span>
                <span className="text-felt-300">Cards/hand</span><span className="text-white">{rules.cardsPerHand}</span>
                <span className="text-felt-300">Min book size</span><span className="text-white">{rules.minCardsPerBook}</span>
                <span className="text-felt-300">Go out requires</span><span className="text-white">{rules.minCleanBooksToGoOut} clean + {rules.minDirtyBooksToGoOut} dirty</span>
                <span className="text-felt-300">Thresholds</span><span className="text-white">{rules.roundThresholds.join(', ')}</span>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep('rules')}>← Back</Button>
              <Button variant="gold" size="lg" onClick={handleSubmit} loading={loading}>
                🎴 Start Game
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
