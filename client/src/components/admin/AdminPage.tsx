import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { GameRules, RulePreset, DEFAULT_RULES } from '../../types';
import { formatTimeSince } from '../../utils/formatUtils';
import toast from 'react-hot-toast';

const ADMIN_TOKEN_KEY = 'hf_admin_token';

interface AdminGame {
  id: string;
  code: string;
  status: string;
  playerCount: number;
  playerNames: string[];
  currentRound: number;
  lastActionAt: number;
  createdAt: number;
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Invalid password');
        return;
      }
      onLogin(data.token);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-felt-texture flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-felt-800 border border-felt-600 rounded-2xl p-8"
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-felt-400 text-sm mt-1">Hand &amp; Foot Management</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-felt-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full bg-felt-700 border border-felt-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold-500"
              autoFocus
            />
          </div>
          <Button type="submit" variant="gold" className="w-full" size="lg" loading={loading}>
            Login
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

function PresetEditor({ preset, onSave, onCancel }: {
  preset: Partial<RulePreset>;
  onSave: (name: string, rules: GameRules) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(preset.name ?? '');
  const [rules, setRules] = useState<GameRules>(preset.rules ?? { ...DEFAULT_RULES });

  const FIELDS: Array<{ key: keyof GameRules; label: string; type: 'number' | 'number[]' }> = [
    { key: 'cardsPerHand', label: 'Cards per Hand/Foot', type: 'number' },
    { key: 'minCardsPerBook', label: 'Min Cards per Book', type: 'number' },
    { key: 'minCleanBooksToGoOut', label: 'Clean Books to Go Out', type: 'number' },
    { key: 'minDirtyBooksToGoOut', label: 'Dirty Books to Go Out', type: 'number' },
    { key: 'maxWildsPerDirtyBook', label: 'Max Wilds per Dirty Book', type: 'number' },
    { key: 'cleanBookValue', label: 'Clean Book Points', type: 'number' },
    { key: 'dirtyBookValue', label: 'Dirty Book Points', type: 'number' },
    { key: 'bookOf3sBonus', label: 'Book of 3s Bonus', type: 'number' },
    { key: 'cleanBookOf7sBonus', label: 'Clean Book of 7s Bonus', type: 'number' },
    { key: 'goingOutBonus', label: 'Going Out Bonus', type: 'number' },
    { key: 'numRounds', label: 'Number of Rounds', type: 'number' },
    { key: 'red3Penalty', label: 'Red 3 Penalty', type: 'number' },
    { key: 'black3Penalty', label: 'Black 3 Penalty', type: 'number' },
    { key: 'roundThresholds', label: 'Round Thresholds', type: 'number[]' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-felt-300 mb-1">Preset Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Quick Game, Tournament, etc."
          className="w-full bg-felt-700 border border-felt-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-gold-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
        {FIELDS.map(({ key, label, type }) => (
          <div key={key}>
            <label className="block text-xs text-felt-400 mb-1">{label}</label>
            {type === 'number[]' ? (
              <input
                type="text"
                value={(rules[key] as number[]).join(', ')}
                onChange={(e) => {
                  const vals = e.target.value.split(',').map((v) => parseInt(v.trim())).filter((v) => !isNaN(v));
                  setRules((r) => ({ ...r, [key]: vals }));
                }}
                className="w-full bg-felt-700 border border-felt-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gold-500"
              />
            ) : (
              <input
                type="number"
                value={rules[key] as number}
                onChange={(e) => setRules((r) => ({ ...r, [key]: parseInt(e.target.value) || 0 }))}
                className="w-full bg-felt-700 border border-felt-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-gold-500"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(name, rules)} disabled={!name.trim()}>
          Save Preset
        </Button>
      </div>
    </div>
  );
}

type DeployState = 'idle' | 'pulling' | 'restarting' | 'done' | 'error';

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [games, setGames] = useState<AdminGame[]>([]);
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [tab, setTab] = useState<'games' | 'presets'>('games');
  const [editingPreset, setEditingPreset] = useState<Partial<RulePreset> | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployOutput, setDeployOutput] = useState<string>('');

  const authHeaders = { 'x-admin-token': token ?? '', 'Content-Type': 'application/json' };

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [gamesRes, presetsRes] = await Promise.all([
        fetch('/api/admin/games', { headers: authHeaders }),
        fetch('/api/admin/presets', { headers: authHeaders }),
      ]);
      if (gamesRes.status === 401) { setToken(null); localStorage.removeItem(ADMIN_TOKEN_KEY); return; }
      setGames(await gamesRes.json());
      setPresets(await presetsRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      loadData();
    }
  }, [token]);

  const handleDeleteGame = async (id: string) => {
    if (!confirm('Delete this game permanently?')) return;
    await fetch(`/api/admin/games/${id}`, { method: 'DELETE', headers: authHeaders });
    setGames((g) => g.filter((x) => x.id !== id));
    toast.success('Game deleted');
  };

  const handleArchiveGame = async (id: string) => {
    await fetch(`/api/admin/games/${id}/archive`, { method: 'PATCH', headers: authHeaders });
    setGames((g) => g.map((x) => x.id === id ? { ...x, status: 'archived' } : x));
    toast.success('Game archived');
  };

  const handleSavePreset = async (name: string, rules: GameRules) => {
    if (editingPreset?.id) {
      const res = await fetch(`/api/admin/presets/${editingPreset.id}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify({ name, rules }),
      });
      const updated = await res.json();
      setPresets((p) => p.map((x) => x.id === updated.id ? updated : x));
      toast.success('Preset updated');
    } else {
      const res = await fetch('/api/admin/presets', {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ name, rules }),
      });
      const created = await res.json();
      setPresets((p) => [...p, created]);
      toast.success('Preset created');
    }
    setEditingPreset(null);
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Delete this preset?')) return;
    await fetch(`/api/admin/presets/${id}`, { method: 'DELETE', headers: authHeaders });
    setPresets((p) => p.filter((x) => x.id !== id));
    toast.success('Preset deleted');
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', headers: authHeaders });
    setToken(null);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  const handleDeploy = async () => {
    if (deployState === 'pulling' || deployState === 'restarting') return;
    setDeployState('pulling');
    setDeployOutput('');
    try {
      const res = await fetch('/api/admin/rebuild', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      setDeployOutput(data.output || '');
      if (!data.ok) {
        setDeployState('error');
        return;
      }
      // Server will restart — poll health until it comes back
      setDeployState('restarting');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const start = Date.now();
      while (Date.now() - start < 120_000) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const health = await fetch('/api/health');
          if (health.ok) { setDeployState('done'); return; }
        } catch { /* still restarting */ }
      }
      setDeployState('error');
      setDeployOutput((prev) => prev + '\nTimed out waiting for server to restart.');
    } catch {
      setDeployState('error');
      setDeployOutput('Network error — server may be restarting already.');
    }
  };

  if (!token) {
    return <AdminLogin onLogin={(t) => setToken(t)} />;
  }

  const STATUS_COLORS: Record<string, string> = {
    waiting: 'text-yellow-400', active: 'text-green-400', completed: 'text-blue-400', archived: 'text-gray-400',
  };

  return (
    <div className="min-h-screen bg-felt-texture">
      <header className="bg-felt-900/90 border-b border-felt-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={loadData} loading={loading}>↻ Refresh</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeploy}
            loading={deployState === 'pulling' || deployState === 'restarting'}
            disabled={deployState === 'pulling' || deployState === 'restarting'}
          >
            {deployState === 'pulling' ? 'Pulling…' : deployState === 'restarting' ? 'Restarting…' : '⬆ Deploy'}
          </Button>
          <Button variant="danger" size="sm" onClick={handleLogout}>Logout</Button>
        </div>
      </header>

      {/* Deploy status banner */}
      <AnimatePresence>
        {deployState !== 'idle' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`border-b px-6 py-3 flex items-start gap-4 ${
              deployState === 'error' ? 'bg-red-900/40 border-red-700' :
              deployState === 'done' ? 'bg-green-900/40 border-green-700' :
              'bg-blue-900/40 border-blue-700'
            }`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white mb-1">
                  {deployState === 'pulling' && 'Running git pull…'}
                  {deployState === 'restarting' && 'Server restarting and rebuilding — this may take ~30 s…'}
                  {deployState === 'done' && '✓ Deployed successfully'}
                  {deployState === 'error' && '✗ Deploy failed'}
                </p>
                {deployOutput && (
                  <pre className="text-xs text-felt-300 font-mono whitespace-pre-wrap break-all bg-black/30 rounded p-2 max-h-32 overflow-y-auto">
                    {deployOutput}
                  </pre>
                )}
              </div>
              <button
                onClick={() => { setDeployState('idle'); setDeployOutput(''); }}
                className="text-felt-400 hover:text-white shrink-0 mt-0.5"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('games')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'games' ? 'bg-gold-500 text-felt-900' : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
            }`}
          >
            Games ({games.length})
          </button>
          <button
            onClick={() => setTab('presets')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'presets' ? 'bg-gold-500 text-felt-900' : 'bg-felt-700 text-felt-200 hover:bg-felt-600'
            }`}
          >
            Rule Presets ({presets.length})
          </button>
        </div>

        {tab === 'games' && (
          <div className="space-y-2">
            {games.length === 0 && <p className="text-felt-400 text-center py-8">No games yet</p>}
            {games.map((game) => (
              <div key={game.id} className="bg-felt-800 border border-felt-600 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg font-bold text-gold-400">{game.code}</span>
                    <span className={`text-sm font-medium ${STATUS_COLORS[game.status] ?? 'text-gray-400'}`}>{game.status}</span>
                    <span className="text-felt-400 text-xs">Round {game.currentRound}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {game.playerNames.map((name, i) => (
                      <span key={i} className="text-xs bg-felt-700 text-felt-200 px-1.5 py-0.5 rounded">{name}</span>
                    ))}
                  </div>
                  <p className="text-felt-500 text-xs mt-1">{formatTimeSince(game.lastActionAt)}</p>
                </div>
                <div className="flex gap-2">
                  {game.status !== 'archived' && (
                    <Button variant="ghost" size="sm" onClick={() => handleArchiveGame(game.id)}>Archive</Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleDeleteGame(game.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'presets' && (
          <div>
            <div className="flex justify-end mb-4">
              <Button variant="gold" onClick={() => setEditingPreset({})}>+ New Preset</Button>
            </div>
            <div className="space-y-2">
              {presets.length === 0 && <p className="text-felt-400 text-center py-8">No presets yet</p>}
              {presets.map((preset) => (
                <div key={preset.id} className="bg-felt-800 border border-felt-600 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{preset.name}</p>
                    <p className="text-felt-400 text-xs">
                      {preset.rules.numRounds} rounds · {preset.rules.playerCount} players · threshold: {preset.rules.roundThresholds.join('/')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingPreset(preset)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeletePreset(preset.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preset editor modal */}
      <Modal
        open={editingPreset !== null}
        onClose={() => setEditingPreset(null)}
        title={editingPreset?.id ? 'Edit Preset' : 'New Preset'}
        size="xl"
      >
        {editingPreset !== null && (
          <PresetEditor
            preset={editingPreset}
            onSave={handleSavePreset}
            onCancel={() => setEditingPreset(null)}
          />
        )}
      </Modal>
    </div>
  );
}
