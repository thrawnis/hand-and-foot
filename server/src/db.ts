import Database from 'better-sqlite3';
import path from 'path';
import { GameState, RulePreset } from './types';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'handf.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  const database = db;
  database.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_action_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    CREATE INDEX IF NOT EXISTS idx_games_last_action ON games(last_action_at DESC);
    CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);

    CREATE TABLE IF NOT EXISTS rule_presets (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      rules TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function saveGame(state: GameState): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO games (id, code, status, state, created_at, last_action_at)
    VALUES (@id, @code, @status, @state, @created_at, @last_action_at)
    ON CONFLICT(id) DO UPDATE SET
      status = @status,
      state = @state,
      last_action_at = @last_action_at
  `).run({
    id: state.id,
    code: state.code,
    status: state.status,
    state: JSON.stringify(state),
    created_at: state.createdAt,
    last_action_at: state.lastActionAt,
  });
}

export function loadGame(id: string): GameState | null {
  const db = getDb();
  const row = db.prepare('SELECT state FROM games WHERE id = ?').get(id) as { state: string } | undefined;
  return row ? JSON.parse(row.state) : null;
}

export function loadGameByCode(code: string): GameState | null {
  const db = getDb();
  const row = db.prepare('SELECT state FROM games WHERE code = ?').get(code) as { state: string } | undefined;
  return row ? JSON.parse(row.state) : null;
}

export function listGames(includeArchived = false): Array<{
  id: string; code: string; status: string; state: string; created_at: number; last_action_at: number;
}> {
  const db = getDb();
  if (includeArchived) {
    return db.prepare(
      'SELECT id, code, status, state, created_at, last_action_at FROM games ORDER BY last_action_at DESC'
    ).all() as any[];
  }
  return db.prepare(
    "SELECT id, code, status, state, created_at, last_action_at FROM games WHERE status != 'archived' ORDER BY last_action_at DESC"
  ).all() as any[];
}

export function deleteGame(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
}

export function archiveOldGames(olderThanMs: number): void {
  const db = getDb();
  const cutoff = Date.now() - olderThanMs;
  db.prepare(
    "UPDATE games SET status = 'archived' WHERE status = 'completed' AND last_action_at < ?"
  ).run(cutoff);
}

export function savePreset(preset: RulePreset): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO rule_presets (id, name, rules, created_at, updated_at)
    VALUES (@id, @name, @rules, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET name = @name, rules = @rules, updated_at = @updated_at
  `).run({
    id: preset.id,
    name: preset.name,
    rules: JSON.stringify(preset.rules),
    created_at: preset.createdAt,
    updated_at: preset.updatedAt,
  });
}

export function listPresets(): RulePreset[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM rule_presets ORDER BY name ASC').all() as any[];
  return rows.map((r) => ({ ...r, rules: JSON.parse(r.rules), createdAt: r.created_at, updatedAt: r.updated_at }));
}

export function deletePreset(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM rule_presets WHERE id = ?').run(id);
}
