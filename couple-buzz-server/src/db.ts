import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

export interface User {
  id: string;
  name: string;
  partner_id: string | null;
  device_token: string | null;
  pair_code: string;
  token_version: number;
  timezone: string;
  partner_timezone: string;
  partner_remark: string;
  created_at: string;
}

export interface Action {
  id: number;
  user_id: string;
  user_name: string;
  action_type: string;
  sender_timezone: string;
  created_at: string;
}

export interface RefreshToken {
  id: number;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface DbOps {
  createUser(id: string, name: string, pairCode: string, timezone: string): void;
  getUser(id: string): User | undefined;
  getUserByPairCode(pairCode: string): User | undefined;
  pairUsers(userId: string, partnerId: string): void;
  unpairUsers(userId: string, partnerId: string): void;
  updatePairCode(userId: string, pairCode: string): void;
  updateProfile(userId: string, name: string, timezone: string, partnerTimezone: string, partnerRemark: string): void;
  setDeviceToken(userId: string, token: string): void;
  clearDeviceToken(userId: string): void;
  addAction(userId: string, actionType: string, senderTimezone: string, senderName: string): void;
  getHistory(userId: string, limit: number): Action[];
  insertRefreshToken(userId: string, tokenHash: string, expiresAt: string): void;
  getRefreshToken(tokenHash: string): RefreshToken | undefined;
  deleteRefreshToken(tokenHash: string): void;
  deleteAllRefreshTokens(userId: string): void;
  incrementTokenVersion(userId: string): void;
  getUnpairedUser(excludeId: string): User | undefined;
}

export function createDatabase(dbPath?: string): { db: DatabaseType; dbOps: DbOps } {
  const resolvedPath = dbPath || DEFAULT_DB_PATH;

  // Ensure parent directory exists for file-based databases
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      partner_id TEXT,
      device_token TEXT,
      pair_code TEXT UNIQUE,
      token_version INTEGER NOT NULL DEFAULT 1,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      partner_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      partner_remark TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (partner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      sender_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      sender_name TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  `);

  // Migrations for existing databases
  const userCols = db.pragma('table_info(users)') as { name: string }[];
  if (!userCols.some((c) => c.name === 'token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1');
  }
  if (!userCols.some((c) => c.name === 'timezone')) {
    db.exec("ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
  }
  if (!userCols.some((c) => c.name === 'partner_timezone')) {
    db.exec("ALTER TABLE users ADD COLUMN partner_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
  }
  if (!userCols.some((c) => c.name === 'partner_remark')) {
    db.exec("ALTER TABLE users ADD COLUMN partner_remark TEXT NOT NULL DEFAULT ''");
  }

  const actionCols = db.pragma('table_info(actions)') as { name: string }[];
  if (!actionCols.some((c) => c.name === 'sender_timezone')) {
    db.exec("ALTER TABLE actions ADD COLUMN sender_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
  }
  if (!actionCols.some((c) => c.name === 'sender_name')) {
    db.exec("ALTER TABLE actions ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''");
  }

  // Migration: remove CHECK constraint on action_type (to support new types)
  const tableDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='actions'").get() as { sql: string } | undefined;
  if (tableDef?.sql.includes('CHECK(action_type IN')) {
    db.exec(`
      CREATE TABLE actions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        sender_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        sender_name TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      INSERT INTO actions_new SELECT id, user_id, action_type, sender_timezone, sender_name, created_at FROM actions;
      DROP TABLE actions;
      ALTER TABLE actions_new RENAME TO actions;
      CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
    `);
  }

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, pair_code, timezone) VALUES (?, ?, ?, ?)'
  );
  const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const stmtGetUserByPairCode = db.prepare('SELECT * FROM users WHERE pair_code = ?');
  const updatePartner = db.prepare('UPDATE users SET partner_id = ? WHERE id = ?');
  const clearPartner = db.prepare('UPDATE users SET partner_id = NULL WHERE id = ?');
  const stmtUpdatePairCode = db.prepare('UPDATE users SET pair_code = ? WHERE id = ?');
  const stmtUpdateProfile = db.prepare('UPDATE users SET name = ?, timezone = ?, partner_timezone = ?, partner_remark = ? WHERE id = ?');
  const updateDeviceToken = db.prepare('UPDATE users SET device_token = ? WHERE id = ?');
  const stmtClearDeviceToken = db.prepare('UPDATE users SET device_token = NULL WHERE id = ?');
  const insertAction = db.prepare(
    'INSERT INTO actions (user_id, action_type, sender_timezone, sender_name) VALUES (?, ?, ?, ?)'
  );
  const getHistoryStmt = db.prepare(`
    SELECT a.id, a.user_id, a.action_type, a.sender_timezone, a.created_at,
           CASE WHEN a.sender_name != '' THEN a.sender_name ELSE u.name END AS user_name
    FROM actions a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id = ? OR a.user_id = (SELECT partner_id FROM users WHERE id = ?)
    ORDER BY a.created_at DESC
    LIMIT ?
  `);
  const stmtInsertRefreshToken = db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  );
  const stmtGetRefreshToken = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?');
  const stmtDeleteRefreshToken = db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?');
  const stmtDeleteAllRefreshTokens = db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?');
  const stmtIncrementTokenVersion = db.prepare(
    'UPDATE users SET token_version = token_version + 1 WHERE id = ?'
  );
  const stmtGetUnpairedUser = db.prepare(
    'SELECT * FROM users WHERE partner_id IS NULL AND id != ? LIMIT 1'
  );

  const dbOps: DbOps = {
    createUser(id: string, name: string, pairCode: string, timezone: string): void {
      insertUser.run(id, name, pairCode, timezone);
    },

    getUser(id: string): User | undefined {
      return getUserById.get(id) as User | undefined;
    },

    getUserByPairCode(pairCode: string): User | undefined {
      return stmtGetUserByPairCode.get(pairCode) as User | undefined;
    },

    pairUsers(userId: string, partnerId: string): void {
      db.transaction(() => {
        updatePartner.run(partnerId, userId);
        updatePartner.run(userId, partnerId);
      })();
    },

    unpairUsers(userId: string, partnerId: string): void {
      db.transaction(() => {
        clearPartner.run(userId);
        clearPartner.run(partnerId);
      })();
    },

    updatePairCode(userId: string, pairCode: string): void {
      stmtUpdatePairCode.run(pairCode, userId);
    },

    updateProfile(userId: string, name: string, timezone: string, partnerTimezone: string, partnerRemark: string): void {
      stmtUpdateProfile.run(name, timezone, partnerTimezone, partnerRemark, userId);
    },

    setDeviceToken(userId: string, token: string): void {
      updateDeviceToken.run(token, userId);
    },

    clearDeviceToken(userId: string): void {
      stmtClearDeviceToken.run(userId);
    },

    addAction(userId: string, actionType: string, senderTimezone: string, senderName: string): void {
      insertAction.run(userId, actionType, senderTimezone, senderName);
    },

    getHistory(userId: string, limit: number): Action[] {
      return getHistoryStmt.all(userId, userId, limit) as Action[];
    },

    insertRefreshToken(userId: string, tokenHash: string, expiresAt: string): void {
      stmtInsertRefreshToken.run(userId, tokenHash, expiresAt);
    },

    getRefreshToken(tokenHash: string): RefreshToken | undefined {
      return stmtGetRefreshToken.get(tokenHash) as RefreshToken | undefined;
    },

    deleteRefreshToken(tokenHash: string): void {
      stmtDeleteRefreshToken.run(tokenHash);
    },

    deleteAllRefreshTokens(userId: string): void {
      stmtDeleteAllRefreshTokens.run(userId);
    },

    incrementTokenVersion(userId: string): void {
      stmtIncrementTokenVersion.run(userId);
    },

    getUnpairedUser(excludeId: string): User | undefined {
      return stmtGetUnpairedUser.get(excludeId) as User | undefined;
    },
  };

  return { db, dbOps };
}

// Default instance for production
const defaultInstance = createDatabase();

export const dbOps = defaultInstance.dbOps;
const db: DatabaseType = defaultInstance.db;
export default db;
