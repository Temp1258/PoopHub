import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    partner_id TEXT,
    device_token TEXT,
    pair_code TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('miss', 'kiss', 'poop', 'pat')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
`);

// Prepared statements
const insertUser = db.prepare(
  'INSERT INTO users (id, name, pair_code) VALUES (?, ?, ?)'
);

const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');

const getUserByPairCode = db.prepare('SELECT * FROM users WHERE pair_code = ?');

const updatePartner = db.prepare('UPDATE users SET partner_id = ? WHERE id = ?');

const updateDeviceToken = db.prepare('UPDATE users SET device_token = ? WHERE id = ?');

const insertAction = db.prepare(
  'INSERT INTO actions (user_id, action_type) VALUES (?, ?)'
);

const getHistory = db.prepare(`
  SELECT a.id, a.action_type, a.created_at, u.name AS user_name
  FROM actions a
  JOIN users u ON a.user_id = u.id
  WHERE a.user_id = ? OR a.user_id = (SELECT partner_id FROM users WHERE id = ?)
  ORDER BY a.created_at DESC
  LIMIT ?
`);

export interface User {
  id: string;
  name: string;
  partner_id: string | null;
  device_token: string | null;
  pair_code: string;
  created_at: string;
}

export interface Action {
  id: number;
  user_name: string;
  action_type: string;
  created_at: string;
}

export const dbOps = {
  createUser(id: string, name: string, pairCode: string): void {
    insertUser.run(id, name, pairCode);
  },

  getUser(id: string): User | undefined {
    return getUserById.get(id) as User | undefined;
  },

  getUserByPairCode(pairCode: string): User | undefined {
    return getUserByPairCode.get(pairCode) as User | undefined;
  },

  pairUsers(userId: string, partnerId: string): void {
    const pairTransaction = db.transaction(() => {
      updatePartner.run(partnerId, userId);
      updatePartner.run(userId, partnerId);
    });
    pairTransaction();
  },

  setDeviceToken(userId: string, token: string): void {
    updateDeviceToken.run(token, userId);
  },

  addAction(userId: string, actionType: string): void {
    insertAction.run(userId, actionType);
  },

  getHistory(userId: string, limit: number): Action[] {
    return getHistory.all(userId, userId, limit) as Action[];
  },
};

export default db;
