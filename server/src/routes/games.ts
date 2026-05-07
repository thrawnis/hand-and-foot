import { Router, Request, Response } from 'express';
import { createGame, toLobbyGame, DEFAULT_RULES } from '../services/gameService';
import { listGames, loadGameByCode, listPresets } from '../db';
import { CreateGamePayload, GameState } from '../types';
import { scheduleNextBotTurn } from '../services/botStrategy';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

router.get('/games', (_req: Request, res: Response) => {
  const includeArchived = false;
  const rows = listGames(includeArchived);
  const games = rows.map((r) => {
    const state: GameState = JSON.parse(r.state);
    return toLobbyGame(state);
  });
  res.json(games);
});

router.get('/games/all', (_req: Request, res: Response) => {
  const rows = listGames(true);
  const games = rows.map((r) => {
    const state: GameState = JSON.parse(r.state);
    return toLobbyGame(state);
  });
  res.json(games);
});

router.get('/games/:code', (req: Request, res: Response) => {
  const state = loadGameByCode(req.params.code);
  if (!state) return res.status(404).json({ error: 'Game not found' });
  // Return minimal public info (not full state)
  res.json({
    id: state.id,
    code: state.code,
    status: state.status,
    playerNames: state.players.map((p) => p.name),
    playerCount: state.players.length,
    currentRound: state.currentRound,
    rules: state.rules,
  });
});

router.post('/games', (req: Request, res: Response) => {
  const payload: CreateGamePayload = req.body;

  if (!payload.playerNames || payload.playerNames.length < 2) {
    return res.status(400).json({ error: 'At least 2 players required' });
  }
  if (payload.playerNames.length % 2 !== 0) {
    return res.status(400).json({ error: 'Player count must be even' });
  }
  if (payload.playerNames.length > 8) {
    return res.status(400).json({ error: 'Maximum 8 players' });
  }

  // Deduplicate names
  const names = payload.playerNames.map((n: string) => n.trim()).filter(Boolean);
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    return res.status(400).json({ error: 'Player names must be unique' });
  }

  const rules = { ...DEFAULT_RULES, ...payload.rules, playerCount: names.length };
  const state = createGame({ hostName: payload.hostName, rules, playerNames: names, teamNames: payload.teamNames, botSlots: payload.botSlots });

  // Kick off bot if the first player is a bot
  scheduleNextBotTurn(state);

  res.status(201).json({
    gameId: state.id,
    code: state.code,
    playerTokens: state.players.map((p) => ({ name: p.name, sessionToken: p.sessionToken, isBot: p.isBot ?? false })),
  });
});

router.get('/defaults', (_req: Request, res: Response) => {
  res.json(DEFAULT_RULES);
});

router.get('/presets', (_req: Request, res: Response) => {
  res.json(listPresets());
});

export default router;
