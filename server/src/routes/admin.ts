import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { listGames, deleteGame, savePreset, listPresets, deletePreset, loadGame } from '../db';
import { GameState, RulePreset } from '../types';

const router = Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
// Store hashed password at startup
let passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Simple session store (in-memory; fine for single admin)
const activeSessions = new Set<string>();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-admin-token'] as string;
  if (!token || !activeSessions.has(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || !bcrypt.compareSync(password, passwordHash)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = uuidv4();
  activeSessions.add(token);
  // Auto-expire after 8 hours
  setTimeout(() => activeSessions.delete(token), 8 * 60 * 60 * 1000);
  res.json({ token });
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  const token = req.headers['x-admin-token'] as string;
  activeSessions.delete(token);
  res.json({ ok: true });
});

router.get('/games', requireAuth, (_req: Request, res: Response) => {
  const rows = listGames(true);
  const games = rows.map((r) => {
    const state: GameState = JSON.parse(r.state);
    return {
      id: state.id,
      code: state.code,
      status: state.status,
      playerCount: state.players.length,
      playerNames: state.players.map((p) => p.name),
      currentRound: state.currentRound,
      lastActionAt: state.lastActionAt,
      createdAt: state.createdAt,
    };
  });
  res.json(games);
});

router.delete('/games/:id', requireAuth, (req: Request, res: Response) => {
  deleteGame(req.params.id);
  res.json({ ok: true });
});

router.patch('/games/:id/archive', requireAuth, (req: Request, res: Response) => {
  const state = loadGame(req.params.id);
  if (!state) return res.status(404).json({ error: 'Not found' });
  state.status = 'archived';
  const { saveGame } = require('../db');
  saveGame(state);
  res.json({ ok: true });
});

router.get('/presets', requireAuth, (_req: Request, res: Response) => {
  res.json(listPresets());
});

router.post('/presets', requireAuth, (req: Request, res: Response) => {
  const { name, rules } = req.body;
  if (!name || !rules) return res.status(400).json({ error: 'name and rules required' });
  const preset: RulePreset = {
    id: uuidv4(),
    name,
    rules,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  savePreset(preset);
  res.status(201).json(preset);
});

router.put('/presets/:id', requireAuth, (req: Request, res: Response) => {
  const { name, rules } = req.body;
  const existing = listPresets().find((p) => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Preset not found' });
  const updated: RulePreset = { ...existing, name: name ?? existing.name, rules: rules ?? existing.rules, updatedAt: Date.now() };
  savePreset(updated);
  res.json(updated);
});

router.delete('/presets/:id', requireAuth, (req: Request, res: Response) => {
  deletePreset(req.params.id);
  res.json({ ok: true });
});

router.post('/rebuild', requireAuth, (_req: Request, res: Response) => {
  const opts = { cwd: '/app' };
  exec('git pull --ff-only', opts, (err, stdout, stderr) => {
    let output = (stdout + stderr).trim();
    if (!err) {
      res.json({ ok: true, output });
      setTimeout(() => process.exit(0), 300);
      return;
    }
    // Pull failed — force-reset to remote
    output += '\n[pull failed, force-resetting to remote…]';
    exec('git fetch origin && git reset --hard origin/$(git rev-parse --abbrev-ref HEAD)', opts, (err2, stdout2, stderr2) => {
      output += '\n' + (stdout2 + stderr2).trim();
      if (err2) {
        res.json({ ok: false, output });
        return;
      }
      res.json({ ok: true, output });
      setTimeout(() => process.exit(0), 300);
    });
  });
});

router.post('/change-password', requireAuth, (req: Request, res: Response) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
  passwordHash = bcrypt.hashSync(newPassword, 10);
  activeSessions.clear();
  res.json({ ok: true });
});

export default router;
