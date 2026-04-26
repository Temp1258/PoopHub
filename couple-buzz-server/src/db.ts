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
  last_read_action_id: number;
  created_at: string;
}

export interface Action {
  id: number;
  user_id: string;
  user_name: string;
  action_type: string;
  sender_timezone: string;
  reply_to: number | null;
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

export interface RefreshToken {
  id: number;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

export interface Ritual {
  id: number;
  user_id: string;
  ritual_type: 'morning' | 'evening';
  ritual_date: string;
  created_at: string;
}

export interface MailboxMessage {
  id: number;
  user_id: string;
  week_key: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TimeCapsule {
  id: number;
  user_id: string;
  partner_id: string;
  content: string;
  unlock_date: string;
  opened_at: string | null;
  visibility: 'self' | 'partner';
  created_at: string;
}

export interface BucketItem {
  id: number;
  user_id: string;
  partner_id: string;
  title: string;
  category: string | null;
  completed: number;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DailySnap {
  id: number;
  user_id: string;
  snap_date: string;
  photo_path: string;
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
  clearDeviceTokenByValue(token: string): void;
  // Badge / unread tracking — count of partner's actions newer than what this
  // user has marked as read. Used to drive the iOS app icon badge number.
  setLastReadActionId(userId: string, actionId: number): void;
  getUnreadActionCount(userId: string, partnerId: string): number;
  getLatestPartnerActionId(userId: string, partnerId: string): number;
  addAction(userId: string, actionType: string, senderTimezone: string, senderName: string): void;
  getAction(actionId: number): Action | undefined;
  addReaction(userId: string, actionType: string, senderTimezone: string, senderName: string, replyTo: number): number;
  getReaction(actionId: number, userId: string): Action | undefined;
  updateReaction(reactionId: number, actionType: string): void;
  getHistory(userId: string, limit: number): Action[];
  getHistoryReactions(userId: string): Action[];
  insertRefreshToken(userId: string, tokenHash: string, expiresAt: string): void;
  getRefreshToken(tokenHash: string): RefreshToken | undefined;
  deleteRefreshToken(tokenHash: string): void;
  deleteAllRefreshTokens(userId: string): void;
  incrementTokenVersion(userId: string): void;
  getStreak(userId: string, partnerId: string): number;
  createImportantDate(userId: string, partnerId: string, title: string, date: string, recurring: boolean): ImportantDate;
  getImportantDates(userId: string, partnerId: string): ImportantDate[];
  updateImportantDate(id: number, title: string, date: string, recurring: boolean, userId: string, partnerId: string): boolean;
  deleteImportantDate(id: number, userId: string, partnerId: string): boolean;
  pinImportantDate(id: number, userId: string, partnerId: string): void;
  submitDailyAnswer(userId: string, questionDate: string, questionIndex: number, answer: string): void;
  getDailyAnswers(questionDate: string, userId: string, partnerId: string): { mine?: DailyAnswer; partner?: DailyAnswer };
  getQuestionAssignment(questionDate: string): number | null;
  setQuestionAssignment(questionDate: string, questionIndex: number): void;
  getCompletedQuestionIndexes(userId: string, partnerId: string): Set<number>;
  getStats(userId: string, partnerId: string): StatsData;
  // Rituals
  submitRitual(userId: string, ritualType: 'morning' | 'evening', ritualDate: string): boolean;
  getRituals(ritualDate: string, userId: string, partnerId: string): Ritual[];
  getRitualsByDates(myDate: string, partnerDate: string, userId: string, partnerId: string): { myMorning: boolean; myEvening: boolean; partnerMorning: boolean; partnerEvening: boolean };
  getDailyRecap(userId: string, partnerId: string, date: string): { total_interactions: number; top_action: string | null };
  // Mailbox
  submitMailboxMessage(userId: string, weekKey: string, content: string): boolean;
  getMailboxMessages(weekKey: string, userId: string, partnerId: string): { mine?: MailboxMessage; partner?: MailboxMessage };
  getMailboxArchive(userId: string, partnerId: string, limit: number): { week_key: string; my_content: string | null; partner_content: string | null }[];
  getAllPairedUserTokens(): { device_token: string }[];
  // Weekly Report
  getWeeklyReportData(userId: string, partnerId: string, weekStart: string, weekEnd: string): {
    total: number; lastWeekTotal: number; myCount: number; partnerCount: number;
    topActions: { action_type: string; count: number }[];
    dailyQuestionDays: number; ritualMorningDays: number; ritualEveningDays: number;
  };
  // Time Capsules
  createCapsule(userId: string, partnerId: string, content: string, unlockDate: string, visibility: 'self' | 'partner'): TimeCapsule;
  getCapsules(userId: string, partnerId: string): TimeCapsule[];
  openCapsule(id: number): boolean;
  getUnlockableCapsules(today: string): TimeCapsule[];
  // Bucket List
  createBucketItem(userId: string, partnerId: string, title: string, category: string | null): BucketItem;
  getBucketItems(userId: string, partnerId: string): BucketItem[];
  completeBucketItem(id: number, userId: string): boolean;
  uncompleteBucketItem(id: number): boolean;
  deleteBucketItem(id: number, userId: string, partnerId: string): boolean;
  // Daily Snaps
  saveSnap(userId: string, snapDate: string, photoPath: string): boolean;
  getSnap(userId: string, snapDate: string): DailySnap | undefined;
  getSnaps(userId: string, partnerId: string, month: string): { snap_date: string; user_photo: string | null; partner_photo: string | null }[];
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
      last_read_action_id INTEGER NOT NULL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS rituals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      ritual_type TEXT NOT NULL CHECK(ritual_type IN ('morning', 'evening')),
      ritual_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, ritual_type, ritual_date)
    );

    CREATE TABLE IF NOT EXISTS mailbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      week_key TEXT NOT NULL,
      content TEXT NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, week_key)
    );

    CREATE TABLE IF NOT EXISTS time_capsules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      content TEXT NOT NULL,
      unlock_date TEXT NOT NULL,
      opened_at DATETIME DEFAULT NULL,
      visibility TEXT NOT NULL DEFAULT 'partner',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bucket_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_by TEXT DEFAULT NULL,
      completed_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS daily_snaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      snap_date TEXT NOT NULL,
      photo_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, snap_date)
    );

    CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rituals_user_date ON rituals(user_id, ritual_date);
    CREATE INDEX IF NOT EXISTS idx_mailbox_week ON mailbox(week_key);
    CREATE INDEX IF NOT EXISTS idx_capsules_unlock ON time_capsules(unlock_date);
    CREATE INDEX IF NOT EXISTS idx_bucket_couple ON bucket_items(user_id, partner_id);
    CREATE INDEX IF NOT EXISTS idx_snaps_date ON daily_snaps(snap_date);

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
  if (!userCols.some((c) => c.name === 'last_read_action_id')) {
    db.exec('ALTER TABLE users ADD COLUMN last_read_action_id INTEGER NOT NULL DEFAULT 0');
  }

  const actionCols = db.pragma('table_info(actions)') as { name: string }[];
  if (!actionCols.some((c) => c.name === 'sender_timezone')) {
    db.exec("ALTER TABLE actions ADD COLUMN sender_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'");
  }
  if (!actionCols.some((c) => c.name === 'sender_name')) {
    db.exec("ALTER TABLE actions ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''");
  }
  if (!actionCols.some((c) => c.name === 'reply_to')) {
    db.exec('ALTER TABLE actions ADD COLUMN reply_to INTEGER REFERENCES actions(id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_actions_reply_to ON actions(reply_to)');
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

  // Migration: add locked column to mailbox; lock all pre-existing rows so they become read-only
  const mailboxCols = db.pragma('table_info(mailbox)') as { name: string }[];
  if (mailboxCols.length > 0 && !mailboxCols.some((c) => c.name === 'locked')) {
    db.exec('ALTER TABLE mailbox ADD COLUMN locked INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE mailbox SET locked = 1');
  }

  // Migration: add visibility column to time_capsules. Pre-existing capsules
  // default to 'partner' (the original product behavior was both-can-see).
  const capsuleCols = db.pragma('table_info(time_capsules)') as { name: string }[];
  if (capsuleCols.length > 0 && !capsuleCols.some((c) => c.name === 'visibility')) {
    db.exec("ALTER TABLE time_capsules ADD COLUMN visibility TEXT NOT NULL DEFAULT 'partner'");
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
  // Revokes a token from any user currently holding it (except the one being updated).
  // An APNs device token uniquely identifies a device — the last account to log in on
  // a device is the only one that should receive its pushes.
  const stmtRevokeTokenFromOthers = db.prepare(
    'UPDATE users SET device_token = NULL WHERE device_token = ? AND id != ?'
  );
  const stmtClearTokenByValue = db.prepare(
    'UPDATE users SET device_token = NULL WHERE device_token = ?'
  );
  // Only advance last_read_action_id forward — never let a client roll it back
  // (e.g. an out-of-order request) and accidentally re-mark old messages unread.
  const stmtSetLastReadActionId = db.prepare(
    'UPDATE users SET last_read_action_id = ? WHERE id = ? AND last_read_action_id < ?'
  );
  const stmtCountUnreadActions = db.prepare(
    'SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND id > ?'
  );
  const stmtLatestPartnerActionId = db.prepare(
    'SELECT IFNULL(MAX(id), 0) AS id FROM actions WHERE user_id = ?'
  );
  const insertAction = db.prepare(
    'INSERT INTO actions (user_id, action_type, sender_timezone, sender_name) VALUES (?, ?, ?, ?)'
  );
  const getHistoryStmt = db.prepare(`
    SELECT a.id, a.user_id, a.action_type, a.sender_timezone, a.reply_to, a.created_at,
           CASE WHEN a.sender_name != '' THEN a.sender_name ELSE u.name END AS user_name
    FROM actions a
    JOIN users u ON a.user_id = u.id
    WHERE (a.user_id = ? OR a.user_id = (SELECT partner_id FROM users WHERE id = ?))
      AND a.reply_to IS NULL
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ?
  `);
  const stmtGetAction = db.prepare(`
    SELECT a.id, a.user_id, a.action_type, a.sender_timezone, a.reply_to, a.created_at,
           CASE WHEN a.sender_name != '' THEN a.sender_name ELSE u.name END AS user_name
    FROM actions a JOIN users u ON a.user_id = u.id WHERE a.id = ?
  `);
  const insertReaction = db.prepare(
    'INSERT INTO actions (user_id, action_type, sender_timezone, sender_name, reply_to) VALUES (?, ?, ?, ?, ?)'
  );
  const stmtGetReaction = db.prepare(`
    SELECT a.id, a.user_id, a.action_type, a.sender_timezone, a.reply_to, a.created_at,
           CASE WHEN a.sender_name != '' THEN a.sender_name ELSE u.name END AS user_name
    FROM actions a JOIN users u ON a.user_id = u.id
    WHERE a.reply_to = ? AND a.user_id = ?
  `);
  const stmtUpdateReaction = db.prepare('UPDATE actions SET action_type = ? WHERE id = ?');
  const getReactionsStmt = db.prepare(`
    SELECT a.id, a.user_id, a.action_type, a.sender_timezone, a.reply_to, a.created_at,
           CASE WHEN a.sender_name != '' THEN a.sender_name ELSE u.name END AS user_name
    FROM actions a
    JOIN users u ON a.user_id = u.id
    WHERE a.reply_to IS NOT NULL
      AND (a.user_id = ? OR a.user_id = (SELECT partner_id FROM users WHERE id = ?))
    ORDER BY a.created_at DESC
    LIMIT 500
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

  const stmtGetStreak = db.prepare(`
    WITH daily_activity AS (
      SELECT DATE(created_at) AS day, user_id
      FROM actions
      WHERE user_id IN (?, ?) AND reply_to IS NULL
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
    'UPDATE important_dates SET title = ?, date = ?, recurring = ? WHERE id = ? AND user_id IN (?, ?)'
  );
  const stmtDeleteDate = db.prepare(
    'DELETE FROM important_dates WHERE id = ? AND user_id IN (?, ?)'
  );
  const stmtUnpinAll = db.prepare(
    'UPDATE important_dates SET pinned = 0 WHERE user_id IN (?, ?)'
  );
  const stmtPinDate = db.prepare(
    'UPDATE important_dates SET pinned = 1 WHERE id = ? AND user_id IN (?, ?)'
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
    'SELECT user_id, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL GROUP BY user_id'
  );
  const stmtStatsTopActions = db.prepare(
    'SELECT action_type, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL GROUP BY action_type ORDER BY count DESC LIMIT 10'
  );
  const stmtStatsHourly = db.prepare(
    "SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL GROUP BY hour ORDER BY hour"
  );
  const stmtStatsMonthly = db.prepare(
    "SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL GROUP BY month ORDER BY month DESC LIMIT 12"
  );
  const stmtStatsFirstDate = db.prepare(
    'SELECT MIN(created_at) as first_date FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL'
  );

  // Ritual statements
  const stmtSubmitRitual = db.prepare(
    'INSERT OR IGNORE INTO rituals (user_id, ritual_type, ritual_date) VALUES (?, ?, ?)'
  );
  const stmtGetRituals = db.prepare(
    'SELECT * FROM rituals WHERE ritual_date = ? AND user_id IN (?, ?)'
  );
  const stmtGetRitualsMultiDate = db.prepare(
    'SELECT * FROM rituals WHERE ((ritual_date = ? AND user_id = ?) OR (ritual_date = ? AND user_id = ?))'
  );
  const stmtDailyRecapCount = db.prepare(
    "SELECT COUNT(*) as total FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL AND DATE(created_at) = ?"
  );
  const stmtDailyRecapTop = db.prepare(
    "SELECT action_type, COUNT(*) as cnt FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL AND DATE(created_at) = ? GROUP BY action_type ORDER BY cnt DESC LIMIT 1"
  );

  // Mailbox statements
  // Seal-on-submit: row is inserted with locked=1 and never updated; re-submits are ignored.
  const stmtSubmitMailbox = db.prepare(
    'INSERT OR IGNORE INTO mailbox (user_id, week_key, content, locked) VALUES (?, ?, ?, 1)'
  );
  const stmtGetMailboxMessages = db.prepare(
    'SELECT * FROM mailbox WHERE week_key = ? AND user_id IN (?, ?)'
  );
  const stmtGetMailboxArchive = db.prepare(`
    SELECT m.week_key,
      MAX(CASE WHEN m.user_id = ? THEN m.content END) as my_content,
      MAX(CASE WHEN m.user_id = ? THEN m.content END) as partner_content
    FROM mailbox m
    WHERE m.user_id IN (?, ?)
    GROUP BY m.week_key
    ORDER BY m.week_key DESC
    LIMIT ?
  `);
  const stmtGetAllPairedTokens = db.prepare(
    'SELECT device_token FROM users WHERE partner_id IS NOT NULL AND device_token IS NOT NULL'
  );

  // Weekly report statements
  const stmtWeekActions = db.prepare(
    'SELECT user_id, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL AND created_at >= ? AND created_at < ? GROUP BY user_id'
  );
  const stmtWeekTopActions = db.prepare(
    'SELECT action_type, COUNT(*) as count FROM actions WHERE user_id IN (?, ?) AND reply_to IS NULL AND created_at >= ? AND created_at < ? GROUP BY action_type ORDER BY count DESC LIMIT 5'
  );
  const stmtWeekQuestionDays = db.prepare(`
    SELECT COUNT(DISTINCT a1.question_date) as days FROM daily_answers a1
    JOIN daily_answers a2 ON a1.question_date = a2.question_date AND a1.user_id != a2.user_id
    WHERE a1.user_id = ? AND a2.user_id = ? AND a1.question_date >= ? AND a1.question_date < ?
  `);
  const stmtWeekRitualDays = db.prepare(`
    SELECT r1.ritual_type as ritual_type, COUNT(DISTINCT r1.ritual_date) as days FROM rituals r1
    JOIN rituals r2 ON r1.ritual_date = r2.ritual_date AND r1.ritual_type = r2.ritual_type AND r1.user_id != r2.user_id
    WHERE r1.user_id IN (?, ?) AND r2.user_id IN (?, ?) AND r1.ritual_date >= ? AND r1.ritual_date < ?
    GROUP BY r1.ritual_type
  `);

  // Time capsule statements
  const stmtInsertCapsule = db.prepare(
    'INSERT INTO time_capsules (user_id, partner_id, content, unlock_date, visibility) VALUES (?, ?, ?, ?, ?)'
  );
  const stmtGetCapsuleById = db.prepare('SELECT * FROM time_capsules WHERE id = ?');
  const stmtGetCapsules = db.prepare(
    'SELECT * FROM time_capsules WHERE (user_id = ? OR user_id = ?) AND (partner_id = ? OR partner_id = ?) ORDER BY unlock_date ASC'
  );
  const stmtOpenCapsule = db.prepare(
    'UPDATE time_capsules SET opened_at = CURRENT_TIMESTAMP WHERE id = ? AND opened_at IS NULL'
  );
  const stmtUnlockableCapsules = db.prepare(
    'SELECT * FROM time_capsules WHERE unlock_date <= ? AND opened_at IS NULL'
  );

  // Bucket list statements
  const stmtInsertBucket = db.prepare(
    'INSERT INTO bucket_items (user_id, partner_id, title, category) VALUES (?, ?, ?, ?)'
  );
  const stmtGetBucketById = db.prepare('SELECT * FROM bucket_items WHERE id = ?');
  const stmtGetBucketItems = db.prepare(
    'SELECT * FROM bucket_items WHERE user_id IN (?, ?) AND partner_id IN (?, ?) ORDER BY completed ASC, created_at DESC'
  );
  const stmtCompleteBucket = db.prepare(
    'UPDATE bucket_items SET completed = 1, completed_by = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  const stmtUncompleteBucket = db.prepare(
    'UPDATE bucket_items SET completed = 0, completed_by = NULL, completed_at = NULL WHERE id = ?'
  );
  const stmtDeleteBucket = db.prepare(
    'DELETE FROM bucket_items WHERE id = ? AND (user_id = ? OR partner_id = ?)'
  );

  // Daily snap statements
  const stmtInsertSnap = db.prepare(
    'INSERT OR IGNORE INTO daily_snaps (user_id, snap_date, photo_path) VALUES (?, ?, ?)'
  );
  const stmtGetSnap = db.prepare(
    'SELECT * FROM daily_snaps WHERE user_id = ? AND snap_date = ?'
  );
  const stmtGetSnapsMonth = db.prepare(`
    SELECT s.snap_date,
      MAX(CASE WHEN s.user_id = ? THEN s.photo_path END) as user_photo,
      MAX(CASE WHEN s.user_id = ? THEN s.photo_path END) as partner_photo
    FROM daily_snaps s
    WHERE s.user_id IN (?, ?) AND s.snap_date >= ? AND s.snap_date < ?
    GROUP BY s.snap_date ORDER BY s.snap_date DESC
  `);

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
      if (!token) return;
      db.transaction(() => {
        stmtRevokeTokenFromOthers.run(token, userId);
        updateDeviceToken.run(token, userId);
      })();
    },

    clearDeviceToken(userId: string): void {
      stmtClearDeviceToken.run(userId);
    },

    clearDeviceTokenByValue(token: string): void {
      if (!token) return;
      stmtClearTokenByValue.run(token);
    },

    setLastReadActionId(userId: string, actionId: number): void {
      stmtSetLastReadActionId.run(actionId, userId, actionId);
    },

    getUnreadActionCount(userId: string, partnerId: string): number {
      const user = getUserById.get(userId) as User | undefined;
      if (!user) return 0;
      const row = stmtCountUnreadActions.get(partnerId, user.last_read_action_id) as { n: number };
      return row?.n ?? 0;
    },

    getLatestPartnerActionId(_userId: string, partnerId: string): number {
      const row = stmtLatestPartnerActionId.get(partnerId) as { id: number };
      return row?.id ?? 0;
    },

    addAction(userId: string, actionType: string, senderTimezone: string, senderName: string): void {
      insertAction.run(userId, actionType, senderTimezone, senderName);
    },

    getAction(actionId: number): Action | undefined {
      return stmtGetAction.get(actionId) as Action | undefined;
    },

    addReaction(userId: string, actionType: string, senderTimezone: string, senderName: string, replyTo: number): number {
      const existing = stmtGetReaction.get(replyTo, userId) as Action | undefined;
      if (existing) {
        stmtUpdateReaction.run(actionType, existing.id);
        return existing.id;
      }
      const result = insertReaction.run(userId, actionType, senderTimezone, senderName, replyTo);
      return Number(result.lastInsertRowid);
    },

    getReaction(actionId: number, userId: string): Action | undefined {
      return stmtGetReaction.get(actionId, userId) as Action | undefined;
    },

    updateReaction(reactionId: number, actionType: string): void {
      stmtUpdateReaction.run(actionType, reactionId);
    },

    getHistory(userId: string, limit: number): Action[] {
      return getHistoryStmt.all(userId, userId, limit) as Action[];
    },

    getHistoryReactions(userId: string): Action[] {
      return getReactionsStmt.all(userId, userId) as Action[];
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

    updateImportantDate(id: number, title: string, date: string, recurring: boolean, userId: string, partnerId: string): boolean {
      const result = stmtUpdateDate.run(title, date, recurring ? 1 : 0, id, userId, partnerId);
      return result.changes > 0;
    },

    deleteImportantDate(id: number, userId: string, partnerId: string): boolean {
      const result = stmtDeleteDate.run(id, userId, partnerId);
      return result.changes > 0;
    },

    pinImportantDate(id: number, userId: string, partnerId: string): void {
      db.transaction(() => {
        stmtUnpinAll.run(userId, partnerId);
        stmtPinDate.run(id, userId, partnerId);
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

    // Rituals
    submitRitual(userId: string, ritualType: 'morning' | 'evening', ritualDate: string): boolean {
      const result = stmtSubmitRitual.run(userId, ritualType, ritualDate);
      return result.changes > 0;
    },

    getRituals(ritualDate: string, userId: string, partnerId: string): Ritual[] {
      return stmtGetRituals.all(ritualDate, userId, partnerId) as Ritual[];
    },

    getRitualsByDates(myDate: string, partnerDate: string, userId: string, partnerId: string): { myMorning: boolean; myEvening: boolean; partnerMorning: boolean; partnerEvening: boolean } {
      const rows = stmtGetRitualsMultiDate.all(myDate, userId, partnerDate, partnerId) as Ritual[];
      let myMorning = false, myEvening = false, partnerMorning = false, partnerEvening = false;
      for (const r of rows) {
        if (r.user_id === userId && r.ritual_type === 'morning') myMorning = true;
        if (r.user_id === userId && r.ritual_type === 'evening') myEvening = true;
        if (r.user_id === partnerId && r.ritual_type === 'morning') partnerMorning = true;
        if (r.user_id === partnerId && r.ritual_type === 'evening') partnerEvening = true;
      }
      return { myMorning, myEvening, partnerMorning, partnerEvening };
    },

    getDailyRecap(userId: string, partnerId: string, date: string): { total_interactions: number; top_action: string | null } {
      const countRow = stmtDailyRecapCount.get(userId, partnerId, date) as { total: number };
      const topRow = stmtDailyRecapTop.get(userId, partnerId, date) as { action_type: string } | undefined;
      return { total_interactions: countRow.total, top_action: topRow?.action_type ?? null };
    },

    // Mailbox
    submitMailboxMessage(userId: string, weekKey: string, content: string): boolean {
      const result = stmtSubmitMailbox.run(userId, weekKey, content);
      return result.changes > 0;
    },

    getMailboxMessages(weekKey: string, userId: string, partnerId: string): { mine?: MailboxMessage; partner?: MailboxMessage } {
      const rows = stmtGetMailboxMessages.all(weekKey, userId, partnerId) as MailboxMessage[];
      let mine: MailboxMessage | undefined;
      let partner: MailboxMessage | undefined;
      for (const row of rows) {
        if (row.user_id === userId) mine = row;
        else partner = row;
      }
      return { mine, partner };
    },

    getMailboxArchive(userId: string, partnerId: string, limit: number): { week_key: string; my_content: string | null; partner_content: string | null }[] {
      return stmtGetMailboxArchive.all(userId, partnerId, userId, partnerId, limit) as any[];
    },

    getAllPairedUserTokens(): { device_token: string }[] {
      return stmtGetAllPairedTokens.all() as { device_token: string }[];
    },

    // Weekly Report
    getWeeklyReportData(userId: string, partnerId: string, weekStart: string, weekEnd: string) {
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);

      const byUser = stmtWeekActions.all(userId, partnerId, weekStart, weekEnd) as { user_id: string; count: number }[];
      let myCount = 0, partnerCount = 0;
      for (const r of byUser) {
        if (r.user_id === userId) myCount = r.count;
        else partnerCount = r.count;
      }

      const lastByUser = stmtWeekActions.all(userId, partnerId, lastWeekStartStr, weekStart) as { user_id: string; count: number }[];
      let lastWeekTotal = 0;
      for (const r of lastByUser) lastWeekTotal += r.count;

      const topActions = stmtWeekTopActions.all(userId, partnerId, weekStart, weekEnd) as { action_type: string; count: number }[];

      const qRow = stmtWeekQuestionDays.get(userId, partnerId, weekStart, weekEnd) as { days: number };
      const dailyQuestionDays = qRow?.days ?? 0;

      const ritualRows = stmtWeekRitualDays.all(userId, partnerId, userId, partnerId, weekStart, weekEnd) as { ritual_type: string; days: number }[];
      let ritualMorningDays = 0, ritualEveningDays = 0;
      for (const r of ritualRows) {
        if (r.ritual_type === 'morning') ritualMorningDays = r.days;
        if (r.ritual_type === 'evening') ritualEveningDays = r.days;
      }

      return { total: myCount + partnerCount, lastWeekTotal, myCount, partnerCount, topActions, dailyQuestionDays, ritualMorningDays, ritualEveningDays };
    },

    // Time Capsules
    createCapsule(userId: string, partnerId: string, content: string, unlockDate: string, visibility: 'self' | 'partner'): TimeCapsule {
      const result = stmtInsertCapsule.run(userId, partnerId, content, unlockDate, visibility);
      return stmtGetCapsuleById.get(result.lastInsertRowid) as TimeCapsule;
    },

    getCapsules(userId: string, partnerId: string): TimeCapsule[] {
      return stmtGetCapsules.all(userId, partnerId, userId, partnerId) as TimeCapsule[];
    },

    openCapsule(id: number): boolean {
      const result = stmtOpenCapsule.run(id);
      return result.changes > 0;
    },

    getUnlockableCapsules(today: string): TimeCapsule[] {
      return stmtUnlockableCapsules.all(today) as TimeCapsule[];
    },

    // Bucket List
    createBucketItem(userId: string, partnerId: string, title: string, category: string | null): BucketItem {
      const result = stmtInsertBucket.run(userId, partnerId, title, category);
      return stmtGetBucketById.get(result.lastInsertRowid) as BucketItem;
    },

    getBucketItems(userId: string, partnerId: string): BucketItem[] {
      return stmtGetBucketItems.all(userId, partnerId, userId, partnerId) as BucketItem[];
    },

    completeBucketItem(id: number, userId: string): boolean {
      const result = stmtCompleteBucket.run(userId, id);
      return result.changes > 0;
    },

    uncompleteBucketItem(id: number): boolean {
      const result = stmtUncompleteBucket.run(id);
      return result.changes > 0;
    },

    deleteBucketItem(id: number, userId: string, partnerId: string): boolean {
      const result = stmtDeleteBucket.run(id, userId, partnerId);
      return result.changes > 0;
    },

    // Daily Snaps
    saveSnap(userId: string, snapDate: string, photoPath: string): boolean {
      const result = stmtInsertSnap.run(userId, snapDate, photoPath);
      return result.changes > 0;
    },

    getSnap(userId: string, snapDate: string): DailySnap | undefined {
      return stmtGetSnap.get(userId, snapDate) as DailySnap | undefined;
    },

    getSnaps(userId: string, partnerId: string, month: string): { snap_date: string; user_photo: string | null; partner_photo: string | null }[] {
      const [y, m] = month.split('-').map(Number);
      const startDate = `${month}-01`;
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return stmtGetSnapsMonth.all(userId, partnerId, userId, partnerId, startDate, nextMonth) as any[];
    },
  };

  return { db, dbOps };
}

// Default instance for production
const defaultInstance = createDatabase();

export const dbOps = defaultInstance.dbOps;
const db: DatabaseType = defaultInstance.db;
export default db;
