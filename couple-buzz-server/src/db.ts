import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

export interface User {
  id: string;
  name: string;
  password_hash: string;
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

export interface ImportantDate {
  id: number;
  user_id: string;
  partner_id: string;
  title: string;
  date: string;
  recurring: number;
  pinned: number;
  created_at: string;
}

export interface DailyAnswer {
  id: number;
  user_id: string;
  question_date: string;
  question_index: number;
  answer: string;
  created_at: string;
}

export interface StatsData {
  total_actions: number;
  my_actions: number;
  partner_actions: number;
  top_actions: { action_type: string; count: number }[];
  hourly: { hour: number; count: number }[];
  monthly: { month: string; count: number }[];
  first_action_date: string | null;
}

export interface CalendarDay {
  date: string;
  count: number;
  my_count: number;
  partner_count: number;
  top_action: string | null;
}

export interface RefreshToken {
  id: number;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface DbOps {
  createUser(id: string, name: string, passwordHash: string, pairCode: string, timezone: string): void;
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
  getStreak(userId: string, partnerId: string): number;
  createImportantDate(userId: string, partnerId: string, title: string, date: string, recurring: boolean): ImportantDate;
  getImportantDates(userId: string, partnerId: string): ImportantDate[];
  updateImportantDate(id: number, title: string, date: string, recurring: boolean): boolean;
  deleteImportantDate(id: number, userId: string, partnerId: string): boolean;
  pinImportantDate(id: number, userId: string, partnerId: string): void;
  submitDailyAnswer(userId: string, questionDate: string, questionIndex: number, answer: string): void;
  getDailyAnswers(questionDate: string, userId: string, partnerId: string): { mine?: DailyAnswer; partner?: DailyAnswer };
  getQuestionAssignment(questionDate: string): number | null;
  setQuestionAssignment(questionDate: string, questionIndex: number): void;
  getCompletedQuestionIndexes(userId: string, partnerId: string): Set<number>;
  getStats(userId: string, partnerId: string): StatsData;
  getCalendarData(userId: string, partnerId: string, yearMonth: string): CalendarDay[];
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
      password_hash TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS important_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS daily_question_assignments (
      question_date TEXT PRIMARY KEY,
      question_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      question_date TEXT NOT NULL,
      question_index INTEGER NOT NULL,
      answer TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, question_date)
    );

    CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  `);

  // Migrations for existing databases
  const userCols = db.pragma('table_info(users)') as { name: string }[];
  if (!userCols.some((c) => c.name === 'password_hash')) {
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
  }
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

  // Migration: add pinned column to important_dates
  const dateCols = db.pragma('table_info(important_dates)') as { name: string }[];
  if (dateCols.length > 0 && !dateCols.some((c) => c.name === 'pinned')) {
    db.exec('ALTER TABLE important_dates ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  }

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, password_hash, pair_code, timezone) VALUES (?, ?, ?, ?, ?)'
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

  const stmtGetStreak = db.prepare(`
    WITH daily_activity AS (
      SELECT DATE(created_at) AS day, user_id
      FROM actions
      WHERE user_id IN (?, ?)
      GROUP BY DATE(created_at), user_id
    ),
    both_active AS (
      SELECT day FROM daily_activity
      GROUP BY day HAVING COUNT(DISTINCT user_id) = 2
    ),
    numbered AS (
      SELECT day,
        JULIANDAY(day) - ROW_NUMBER() OVER (ORDER BY day) AS grp
      FROM both_active
    ),
    streaks AS (
      SELECT grp, MAX(day) AS end_day, COUNT(*) AS length
      FROM numbered GROUP BY grp
    )
    SELECT length FROM streaks
    WHERE end_day >= DATE('now', '-1 day')
    ORDER BY end_day DESC LIMIT 1
  `);

  const stmtInsertDate = db.prepare(
    'INSERT INTO important_dates (user_id, partner_id, title, date, recurring) VALUES (?, ?, ?, ?, ?)'
  );
  const stmtGetDateById = db.prepare('SELECT * FROM important_dates WHERE id = ?');
  const stmtGetDates = db.prepare(
    'SELECT * FROM important_dates WHERE user_id IN (?, ?) ORDER BY date ASC'
  );
  const stmtUpdateDate = db.prepare(
    'UPDATE important_dates SET title = ?, date = ?, recurring = ? WHERE id = ?'
  );
  const stmtDeleteDate = db.prepare(
    'DELETE FROM important_dates WHERE id = ? AND user_id IN (?, ?)'
  );
  const stmtUnpinAll = db.prepare(
    'UPDATE important_dates SET pinned = 0 WHERE user_id IN (?, ?)'
  );
  const stmtPinDate = db.prepare(
    'UPDATE important_dates SET pinned = 1 WHERE id = ?'
  );

  const stmtSubmitAnswer = db.prepare(
    'INSERT OR REPLACE INTO daily_answers (user_id, question_date, question_index, answer) VALUES (?, ?, ?, ?)'
  );
  const stmtGetDailyAnswers = db.prepare(
    'SELECT * FROM daily_answers WHERE question_date = ? AND user_id IN (?, ?)'
  );
  const stmtGetAssignment = db.prepare(
    'SELECT question_index FROM daily_question_assignments WHERE question_date = ?'
  );
  const stmtSetAssignment = db.prepare(
    'INSERT OR IGNORE INTO daily_question_assignments (question_date, question_index) VALUES (?, ?)'
  );
  const stmtCompletedIndexes = db.prepare(`
    SELECT DISTINCT a1.question_index FROM daily_answers a1
    JOIN daily_answers a2 ON a1.question_date = a2.question_date AND a1.user_id != a2.user_id
    WHERE a1.user_id IN (?, ?) AND a2.user_id IN (?, ?)
  `);

  const stmtStatsTotalByUser = db.prepare(
    'SELECT user_id, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) GROUP BY user_id'
  );
  const stmtStatsTopActions = db.prepare(
    'SELECT action_type, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) GROUP BY action_type ORDER BY count DESC LIMIT 10'
  );
  const stmtStatsHourly = db.prepare(
    "SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) GROUP BY hour ORDER BY hour"
  );
  const stmtStatsMonthly = db.prepare(
    "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) GROUP BY month ORDER BY month DESC LIMIT 12"
  );
  const stmtStatsFirstDate = db.prepare(
    'SELECT MIN(created_at) as first_date FROM actions WHERE user_id IN (?, ?)'
  );
  const stmtCalendarDays = db.prepare(
    "SELECT DATE(created_at) as date, COUNT(*) as count, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as my_count, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as partner_count FROM actions WHERE user_id IN (?, ?) AND created_at >= ? AND created_at < ? GROUP BY DATE(created_at)"
  );
  const stmtCalendarTopAction = db.prepare(
    "SELECT date, action_type FROM (SELECT DATE(created_at) as date, action_type, COUNT(*) as cnt, ROW_NUMBER() OVER (PARTITION BY DATE(created_at) ORDER BY COUNT(*) DESC) as rn FROM actions WHERE user_id IN (?, ?) AND created_at >= ? AND created_at < ? GROUP BY DATE(created_at), action_type) WHERE rn = 1"
  );

  const dbOps: DbOps = {
    createUser(id: string, name: string, passwordHash: string, pairCode: string, timezone: string): void {
      insertUser.run(id, name, passwordHash, pairCode, timezone);
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

    getStreak(userId: string, partnerId: string): number {
      const row = stmtGetStreak.get(userId, partnerId) as { length: number } | undefined;
      return row?.length ?? 0;
    },

    createImportantDate(userId: string, partnerId: string, title: string, date: string, recurring: boolean): ImportantDate {
      const result = stmtInsertDate.run(userId, partnerId, title, date, recurring ? 1 : 0);
      return stmtGetDateById.get(result.lastInsertRowid) as ImportantDate;
    },

    getImportantDates(userId: string, partnerId: string): ImportantDate[] {
      return stmtGetDates.all(userId, partnerId) as ImportantDate[];
    },

    updateImportantDate(id: number, title: string, date: string, recurring: boolean): boolean {
      const result = stmtUpdateDate.run(title, date, recurring ? 1 : 0, id);
      return result.changes > 0;
    },

    deleteImportantDate(id: number, userId: string, partnerId: string): boolean {
      const result = stmtDeleteDate.run(id, userId, partnerId);
      return result.changes > 0;
    },

    pinImportantDate(id: number, userId: string, partnerId: string): void {
      db.transaction(() => {
        stmtUnpinAll.run(userId, partnerId);
        stmtPinDate.run(id);
      })();
    },

    submitDailyAnswer(userId: string, questionDate: string, questionIndex: number, answer: string): void {
      stmtSubmitAnswer.run(userId, questionDate, questionIndex, answer);
    },

    getDailyAnswers(questionDate: string, userId: string, partnerId: string): { mine?: DailyAnswer; partner?: DailyAnswer } {
      const rows = stmtGetDailyAnswers.all(questionDate, userId, partnerId) as DailyAnswer[];
      let mine: DailyAnswer | undefined;
      let partner: DailyAnswer | undefined;
      for (const row of rows) {
        if (row.user_id === userId) mine = row;
        else partner = row;
      }
      return { mine, partner };
    },

    getQuestionAssignment(questionDate: string): number | null {
      const row = stmtGetAssignment.get(questionDate) as { question_index: number } | undefined;
      return row?.question_index ?? null;
    },

    setQuestionAssignment(questionDate: string, questionIndex: number): void {
      stmtSetAssignment.run(questionDate, questionIndex);
    },

    getCompletedQuestionIndexes(userId: string, partnerId: string): Set<number> {
      const rows = stmtCompletedIndexes.all(userId, partnerId, userId, partnerId) as { question_index: number }[];
      return new Set(rows.map(r => r.question_index));
    },

    getStats(userId: string, partnerId: string): StatsData {
      const byUser = stmtStatsTotalByUser.all(userId, partnerId) as { user_id: string; count: number }[];
      let myActions = 0, partnerActions = 0;
      for (const row of byUser) {
        if (row.user_id === userId) myActions = row.count;
        else partnerActions = row.count;
      }
      const topActions = stmtStatsTopActions.all(userId, partnerId) as { action_type: string; count: number }[];
      const hourly = stmtStatsHourly.all(userId, partnerId) as { hour: number; count: number }[];
      const monthly = stmtStatsMonthly.all(userId, partnerId) as { month: string; count: number }[];
      const firstRow = stmtStatsFirstDate.get(userId, partnerId) as { first_date: string | null } | undefined;

      return {
        total_actions: myActions + partnerActions,
        my_actions: myActions,
        partner_actions: partnerActions,
        top_actions: topActions,
        hourly,
        monthly,
        first_action_date: firstRow?.first_date?.slice(0, 10) ?? null,
      };
    },

    getCalendarData(userId: string, partnerId: string, yearMonth: string): CalendarDay[] {
      const startDate = `${yearMonth}-01`;
      const [y, m] = yearMonth.split('-').map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

      const days = stmtCalendarDays.all(userId, partnerId, userId, partnerId, startDate, nextMonth) as { date: string; count: number; my_count: number; partner_count: number }[];
      const topActions = stmtCalendarTopAction.all(userId, partnerId, startDate, nextMonth) as { date: string; action_type: string }[];
      const topMap = new Map(topActions.map(r => [r.date, r.action_type]));

      return days.map(d => ({
        ...d,
        top_action: topMap.get(d.date) ?? null,
      }));
    },
  };

  return { db, dbOps };
}

// Default instance for production
const defaultInstance = createDatabase();

export const dbOps = defaultInstance.dbOps;
const db: DatabaseType = defaultInstance.db;
export default db;
