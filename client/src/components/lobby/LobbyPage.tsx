import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { subscribeToLobby, unsubscribeFromLobby, useSocket } from '../../hooks/useSocket';
import { GameCard } from './GameCard';
import { NewGameModal } from './NewGameModal';
import { JoinGameModal } from './JoinGameModal';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { LobbyGame, GameRules, RulePreset, DEFAULT_RULES } from '../../types';
import toast from 'react-hot-toast';

const ADMIN_TOKEN_KEY = 'hf_admin_token';
type DeployState = 'idle' | 'pulling' | 'restarting' | 'done' | 'error';

// ── Team colour palette (index = team number) ────────────────────────────────
const TEAM_COLORS = [
  'bg-blue-900/60 text-blue-200 border border-blue-700',
  'bg-red-900/60 text-red-200 border border-red-700',
  'bg-emerald-900/60 text-emerald-200 border border-emerald-700',
  'bg-purple-900/60 text-purple-200 border border-purple-700',
];

// ── Preset editor (moved from AdminPage) ─────────────────────────────────────
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

// ── Main lobby ────────────────────────────────────────────────────────────────
export function LobbyPage() {
  useSocket();
  const lobbyGames = useGameStore((s) => s.lobbyGames);
  const [showNewGame, setShowNewGame] = useState(false);
  const [joiningGame, setJoiningGame] = useState<LobbyGame | null>(null);
  const [pendingRejoin, setPendingRejoin] = useState<{ gameCode: string; sessionToken: string; playerIndex: number } | null>(null);

  // ── Admin mode ──────────────────────────────────────────────────────────────
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);
  const [deployState, setDeployState] = useState<DeployState>('idle');
  const [deployOutput, setDeployOutput] = useState('');
  const [presets, setPresets] = useState<RulePreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Partial<RulePreset> | null>(null);

  const authHeaders = { 'x-admin-token': adminToken ?? '', 'Content-Type': 'application/json' };
  const isAdmin = Boolean(adminToken);

  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((d) => setServerStartedAt(d.startedAt ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    subscribeToLobby();
    return () => unsubscribeFromLobby();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('hf_pending_rejoin');
    if (stored) {
      try { setPendingRejoin(JSON.parse(stored)); }
      catch { localStorage.removeItem('hf_pending_rejoin'); }
    }
  }, []);

  // Verify admin token on mount; clear if expired
  useEffect(() => {
    if (!adminToken) return;
    fetch('/api/admin/games', { headers: { 'x-admin-token': adminToken } })
      .then((r) => { if (r.status === 401) handleAdminLogout(); })
      .catch(() => {});
  }, []);

  const loadPresets = useCallback(async () => {
    const res = await fetch('/api/admin/presets', { headers: authHeaders });
    if (res.ok) setPresets(await res.json());
  }, [adminToken]);

  useEffect(() => {
    if (isAdmin && showPresets) loadPresets();
  }, [isAdmin, showPresets]);

  const handleAdminLogout = () => {
    if (adminToken) {
      fetch('/api/admin/logout', { method: 'POST', headers: authHeaders }).catch(() => {});
    }
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken(null);
    toast.success('Exited admin mode');
  };

  const handleDeploy = async () => {
    if (deployState === 'pulling' || deployState === 'restarting') return;
    setDeployState('pulling');
    setDeployOutput('');
    try {
      const res = await fetch('/api/admin/rebuild', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      setDeployOutput(data.output ?? '');
      if (!data.ok) { setDeployState('error'); return; }
      setDeployState('restarting');
      await new Promise((r) => setTimeout(r, 2000));
      const start = Date.now();
      while (Date.now() - start < 120_000) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const h = await fetch('/api/health');
          if (h.ok) {
            const hd = await h.json();
            setServerStartedAt(hd.startedAt ?? null);
            setDeployState('done');
            return;
          }
        } catch { /* still restarting */ }
      }
      setDeployState('error');
      setDeployOutput((p) => p + '\nTimed out waiting for server to restart.');
    } catch {
      setDeployState('error');
      setDeployOutput('Network error — server may be restarting already.');
    }
  };

  const handleArchiveGame = async (id: string) => {
    await fetch(`/api/admin/games/${id}/archive`, { method: 'PATCH', headers: authHeaders });
    toast.success('Game archived');
  };

  const handleDeleteGame = async (id: string, code: string) => {
    if (!confirm(`Delete game ${code} permanently?`)) return;
    await fetch(`/api/admin/games/${id}`, { method: 'DELETE', headers: authHeaders });
    toast.success('Game deleted');
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

  const activeGames = lobbyGames.filter((g) => g.status === 'active' || g.status === 'waiting');
  const archivedGames = lobbyGames.filter((g) => g.status === 'completed' || g.status === 'archived');

  return (
    <div className="min-h-screen bg-felt-texture flex flex-col">
      {/* Header */}
      <header className="bg-felt-900/80 backdrop-blur border-b border-felt-700 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-4xl select-none shrink-0">🃏</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">Hand &amp; Foot</h1>
                {isAdmin && (
                  <span className="bg-amber-500/20 border border-amber-500 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                    Admin Mode
                  </span>
                )}
              </div>
              <p className="text-felt-300 text-sm">
                Multiplayer Card Game{' '}
                <span className="text-felt-600 text-xs font-mono">#{__GIT_HASH__}</span>
                {isAdmin && serverStartedAt && (
                  <span className="text-felt-500 text-xs ml-2">
                    · started {new Date(serverStartedAt).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPresets(true)}
                >
                  Presets
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeploy}
                  loading={deployState === 'pulling' || deployState === 'restarting'}
                  disabled={deployState === 'pulling' || deployState === 'restarting'}
                >
                  {deployState === 'pulling' ? 'Pulling…' : deployState === 'restarting' ? 'Restarting…' : '⬆ Deploy'}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAdminLogout}>
                  Exit Admin
                </Button>
              </>
            )}
            <Button variant="gold" size="lg" onClick={() => setShowNewGame(true)}>
              + New Game
            </Button>
          </div>
        </div>

        {/* Deploy status bar */}
        <AnimatePresence>
          {deployState !== 'idle' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className={`border-t px-6 py-3 flex items-start gap-4 ${
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
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">
        {/* Rejoin banner */}
        {pendingRejoin && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gold-500/20 border border-gold-500 rounded-xl p-4 flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-semibold text-gold-300">You were in a game!</p>
              <p className="text-sm text-felt-200">Game code: <span className="font-mono font-bold">{pendingRejoin.gameCode}</span></p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  const game = lobbyGames.find((g) => g.code === pendingRejoin.gameCode);
                  if (game) setJoiningGame(game);
                  localStorage.removeItem('hf_pending_rejoin');
                  setPendingRejoin(null);
                }}
              >
                Rejoin
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  localStorage.removeItem('hf_pending_rejoin');
                  localStorage.removeItem('hf_session');
                  setPendingRejoin(null);
                }}
              >
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}

        {/* Active Games */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">Active Games</h2>
            <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {activeGames.length}
            </span>
          </div>

          {activeGames.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-felt-600 rounded-2xl">
              <div className="text-6xl mb-4">🎴</div>
              <p className="text-felt-300 text-lg">No active games</p>
              <p className="text-felt-400 text-sm mt-1">Start one and invite your friends!</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {activeGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    teamColors={TEAM_COLORS}
                    onJoin={() => setJoiningGame(game)}
                    onArchive={isAdmin ? () => handleArchiveGame(game.id) : undefined}
                    onDelete={isAdmin ? () => handleDeleteGame(game.id, game.code) : undefined}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Past Games */}
        {archivedGames.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-felt-400 mb-4">Past Games</h2>
            <div className="grid gap-3 md:grid-cols-2 opacity-60">
              {archivedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  teamColors={TEAM_COLORS}
                  onJoin={() => setJoiningGame(game)}
                  onDelete={isAdmin ? () => handleDeleteGame(game.id, game.code) : undefined}
                  muted
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <NewGameModal open={showNewGame} onClose={() => setShowNewGame(false)} />
      {joiningGame && (
        <JoinGameModal game={joiningGame} onClose={() => setJoiningGame(null)} />
      )}

      {/* Admin: Presets modal */}
      <Modal open={showPresets} onClose={() => setShowPresets(false)} title="Rule Presets" size="xl">
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
                  <Button variant="ghost" size="sm" onClick={() => { setEditingPreset(preset); setShowPresets(false); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeletePreset(preset.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Admin: Preset editor modal */}
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
