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
  // Date-only field kept for legacy callers + the trash join. New unlock
  // logic uses unlock_at (full ISO with minute precision).
  unlock_date: string;
  // ISO timestamp (UTC) when the capsule becomes unlockable. The sender's
  // chosen local time + their timezone is converted to absolute UTC on the
  // client; the server just stores and compares to NOW().
  unlock_at: string;
  opened_at: string | null;
  visibility: 'self' | 'partner';
  // ISO timestamp when the unlock push was sent. NULL = not yet pushed.
  // Persisted across server restarts so a `pm2 restart` mid-window can't
  // re-send the same notification.
  notified_at: string | null;
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

export interface InboxAction {
  id: number;
  user_id: string;
  kind: 'mailbox' | 'capsule';
  ref_id: number;
  status: 'trashed' | 'purged';
  updated_at: string;
}

export interface TrashedInboxItem {
  kind: 'mailbox' | 'capsule';
  ref_id: number;
  // For mailbox: week_key (e.g. "2026-04-27-AM"). For capsule: unlock_date.
  date: string;
  content: string;
  // 'me' if recipient is also the author (only for self-capsule), 'partner'
  // for normal received letters.
  author: 'me' | 'partner';
  // Capsule-only: 'self' | 'partner' visibility. Mailbox is always 'partner'.
  visibility: 'self' | 'partner';
  trashed_at: string;
}

export interface DailyReaction {
  id: number;
  reactor_id: string;
  target_user_id: string;
  target_date: string;
  target_type: 'question' | 'snap';
  reaction: 'up' | 'down';
  created_at: string;
}

// 每日一帖 — 双方共享的便利贴墙。
// sticky_notes 是"一张贴"的元信息（创作者 / 配对快照 / 屏幕坐标 / 时间戳），
// sticky_blocks 是这张贴上所有的"笔触"（初稿 + 后续两人各自'再写点'追加的留言）。
// status='temp' 的 note/block 是用户尚未"贴上去/先写这么多"的临时态，对方完全
// 看不见；只有 status='posted' / 'committed' 才会出现在墙上的最终视图里。
// sticky_seen 是 per-sticky 的"我看到哪一条 block 为止"游标，驱动每张贴右上
// 角的"未读"小灵动岛 + 入口卡的整体小红旗。
export interface StickyNote {
  id: number;
  user_id: string;        // 提笔人 (creator)
  partner_id: string;     // 配对快照，防止 unpair-repair 后串墙
  status: 'temp' | 'posted';
  layout_x: number;       // 0..1 normalized horizontal jitter, 双端共用
  layout_rotation: number; // -8°..+8° tilt, 双端共用
  posted_at: string | null;
  created_at: string;
}

export interface StickyBlock {
  id: number;
  sticky_id: number;
  author_id: string;       // 这一段的提笔人，决定墨水颜色
  content: string;
  status: 'temp' | 'committed';
  committed_at: string | null;
  created_at: string;
  // 每条 block 自己独立成一张便利贴纸渲染时使用的倾角。生成于 commit 一刻，
  // 同一 sticky 下不同 block 各自独立，让叠在一起的几张纸看起来错落有致。
  layout_rotation: number;
}

export interface StickySeen {
  user_id: string;
  sticky_id: number;
  last_seen_block_id: number;
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
  // Atomic delete-old + insert-new for refresh-token rotation. Without the
  // transaction, a crash between the two ops could revoke the user's old
  // token without storing the new one — locking them out of their session
  // until they re-login.
  rotateRefreshToken(oldHash: string, userId: string, newHash: string, expiresAt: string): void;
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
  getMailboxArchive(userId: string, partnerId: string, limit: number): { week_key: string; my_content: string | null; partner_content: string | null; partner_message_id: number | null; partner_created_at: string | null }[];
  getAllPairedUserTokens(): { device_token: string }[];
  // Weekly Report
  getWeeklyReportData(userId: string, partnerId: string, weekStart: string, weekEnd: string): {
    total: number; lastWeekTotal: number; myCount: number; partnerCount: number;
    topActions: { action_type: string; count: number }[];
    dailyQuestionDays: number; ritualMorningDays: number; ritualEveningDays: number;
  };
  // Time Capsules
  createCapsule(userId: string, partnerId: string, content: string, unlockDate: string, unlockAt: string, visibility: 'self' | 'partner'): TimeCapsule;
  getCapsules(userId: string, partnerId: string): TimeCapsule[];
  openCapsule(id: number): boolean;
  // `nowIso` is the cutoff: any capsule with unlock_at <= nowIso, not yet
  // opened, and not yet notified is due for a push.
  getUnlockableCapsules(nowIso: string): TimeCapsule[];
  // Mark a batch of capsules as "notification already sent" so a server
  // restart mid-window doesn't re-push. Persists the dedup state.
  markCapsulesNotified(capsuleIds: number[], nowIso: string): void;
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
  // Daily Reactions (👍/👎 on partner's daily question answer or daily snap)
  setDailyReaction(reactorId: string, targetUserId: string, targetDate: string, targetType: 'question' | 'snap', reaction: 'up' | 'down'): void;
  // Inbox actions — per-recipient soft delete state for mailbox/capsule.
  setInboxAction(userId: string, kind: 'mailbox' | 'capsule', refId: number, status: 'trashed' | 'purged'): void;
  clearInboxAction(userId: string, kind: 'mailbox' | 'capsule', refId: number): void;
  getInboxActionStatus(userId: string, kind: 'mailbox' | 'capsule', refId: number): 'trashed' | 'purged' | null;
  getTrashedInboxItems(userId: string, partnerId: string): TrashedInboxItem[];
  getMailboxMessageById(id: number): MailboxMessage | undefined;
  getCapsuleById(id: number): TimeCapsule | undefined;
  getDailyReaction(reactorId: string, targetUserId: string, targetDate: string, targetType: 'question' | 'snap'): 'up' | 'down' | null;
  // Sticky notes (每日一帖)
  getTempSticky(userId: string): StickyNote | undefined;
  createTempSticky(userId: string, partnerId: string): { sticky: StickyNote; block: StickyBlock };
  updateTempStickyContent(userId: string, content: string): boolean;
  deleteTempSticky(userId: string): boolean;
  postSticky(userId: string, content: string, layoutX: number, layoutRotation: number): { sticky: StickyNote; block: StickyBlock } | null;
  getStickyForCouple(stickyId: number, userId: string, partnerId: string): StickyNote | undefined;
  listWallStickies(userId: string, partnerId: string, limit: number): StickyNote[];
  listCommittedBlocksForStickies(stickyIds: number[]): StickyBlock[];
  listSeenForStickies(userId: string, stickyIds: number[]): Map<number, number>;
  maxCommittedBlockIdOnSticky(stickyId: number): number;
  getTempBlock(stickyId: number, authorId: string): StickyBlock | undefined;
  createTempBlock(stickyId: number, authorId: string): StickyBlock;
  updateTempBlockContent(stickyId: number, authorId: string, content: string): boolean;
  deleteTempBlock(stickyId: number, authorId: string): boolean;
  commitBlock(stickyId: number, authorId: string, content: string): StickyBlock | null;
  markStickySeen(userId: string, stickyId: number, blockId: number): void;
  // Permanently rip a posted sticky off the wall. Cascades through blocks +
  // per-recipient seen rows. Either side of the couple can tear; the route
  // checks couple membership upstream.
  deleteSticky(stickyId: number, userId: string, partnerId: string): boolean;
  // Delete a single committed comment block. Restricted to the block's own
  // author and never the sticky's first (oldest) committed block — the spec
  // forbids removing the original post via the per-block path; users have to
  // tear the whole sticky for that.
  deleteCommittedBlock(stickyId: number, blockId: number, authorId: string): { ok: boolean; reason?: 'not_found' | 'first_block' };
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
      unlock_at TEXT NOT NULL DEFAULT '',
      opened_at DATETIME DEFAULT NULL,
      visibility TEXT NOT NULL DEFAULT 'partner',
      notified_at TEXT DEFAULT NULL,
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

    CREATE TABLE IF NOT EXISTS daily_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reactor_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_date TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('question', 'snap')),
      reaction TEXT NOT NULL CHECK(reaction IN ('up', 'down')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reactor_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id),
      UNIQUE(reactor_id, target_user_id, target_date, target_type)
    );

    -- inbox_actions: per-recipient soft delete state for mailbox/capsule
    -- letters. status='trashed' (in trash, can restore) or 'purged' (forever
    -- hidden from recipient — source row may still exist for the sender).
    CREATE TABLE IF NOT EXISTS inbox_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('mailbox', 'capsule')),
      ref_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('trashed', 'purged')),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, kind, ref_id)
    );

    -- 每日一帖 — see StickyNote/StickyBlock/StickySeen interfaces above for the
    -- temp/posted lifecycle. layout_x/layout_rotation are computed on post and
    -- shared across both clients so the wall renders identically on both sides.
    CREATE TABLE IF NOT EXISTS sticky_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('temp', 'posted')),
      layout_x REAL NOT NULL DEFAULT 0,
      layout_rotation REAL NOT NULL DEFAULT 0,
      posted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sticky_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sticky_id INTEGER NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('temp', 'committed')),
      committed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sticky_id) REFERENCES sticky_notes(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sticky_seen (
      user_id TEXT NOT NULL,
      sticky_id INTEGER NOT NULL,
      last_seen_block_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, sticky_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (sticky_id) REFERENCES sticky_notes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_actions_time ON actions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rituals_user_date ON rituals(user_id, ritual_date);
    CREATE INDEX IF NOT EXISTS idx_mailbox_week ON mailbox(week_key);
    CREATE INDEX IF NOT EXISTS idx_capsules_unlock ON time_capsules(unlock_date);
    -- Scheduler scans unlock_at + opened_at + notified_at every 5 min;
    -- without this index that turns into a full table scan.
    CREATE INDEX IF NOT EXISTS idx_capsules_unlock_at ON time_capsules(unlock_at);
    CREATE INDEX IF NOT EXISTS idx_bucket_couple ON bucket_items(user_id, partner_id);
    CREATE INDEX IF NOT EXISTS idx_snaps_date ON daily_snaps(snap_date);
    CREATE INDEX IF NOT EXISTS idx_daily_reactions_lookup ON daily_reactions(reactor_id, target_user_id, target_date, target_type);
    CREATE INDEX IF NOT EXISTS idx_inbox_actions_user ON inbox_actions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_inbox_actions_ref ON inbox_actions(kind, ref_id);
    CREATE INDEX IF NOT EXISTS idx_sticky_couple_status ON sticky_notes(user_id, partner_id, status);
    CREATE INDEX IF NOT EXISTS idx_sticky_blocks_sticky ON sticky_blocks(sticky_id);
    CREATE INDEX IF NOT EXISTS idx_sticky_blocks_author_status ON sticky_blocks(sticky_id, author_id, status);

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

  // Migration: add unlock_at column for minute-precision capsule unlocks.
  // Pre-existing rows had only unlock_date (YYYY-MM-DD); backfill those to
  // midnight UTC of the date so existing capsules unlock at the same instant
  // they always have. New rows fill unlock_at directly from the client's
  // tz-aware picker (full ISO timestamp).
  if (capsuleCols.length > 0 && !capsuleCols.some((c) => c.name === 'unlock_at')) {
    db.exec("ALTER TABLE time_capsules ADD COLUMN unlock_at TEXT NOT NULL DEFAULT ''");
    // Backfill: empty unlock_at gets unlock_date + 'T00:00:00.000Z'.
    db.exec("UPDATE time_capsules SET unlock_at = unlock_date || 'T00:00:00.000Z' WHERE unlock_at = ''");
  }

  // Migration: add notified_at to dedupe capsule_unlock pushes across
  // server restarts. The previous in-memory `lastTriggered` Map cleared on
  // every restart, so a pm2 restart mid 5-min window would re-push the same
  // capsule. Backfill any already-due capsule as "already notified" — those
  // recipients have presumably seen their notification by now (or it never
  // came through because of the original bug; either way we don't want to
  // re-spam them on next deploy).
  if (capsuleCols.length > 0 && !capsuleCols.some((c) => c.name === 'notified_at')) {
    db.exec('ALTER TABLE time_capsules ADD COLUMN notified_at TEXT DEFAULT NULL');
    const nowIso = new Date().toISOString();
    db.prepare(
      'UPDATE time_capsules SET notified_at = unlock_at WHERE unlock_at <= ? AND notified_at IS NULL'
    ).run(nowIso);
  }

  // Migration: add layout_rotation column to sticky_blocks. Each committed
  // block now renders as its own paper with an independent tilt; this column
  // stores that tilt so both clients see the same arrangement. Pre-existing
  // committed blocks default to 0 and will be repaired by the relayout pass
  // below.
  const stickyBlocksTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sticky_blocks'"
  ).get();
  if (stickyBlocksTableExists) {
    const stickyBlockCols = db.pragma('table_info(sticky_blocks)') as { name: string }[];
    if (!stickyBlockCols.some((c) => c.name === 'layout_rotation')) {
      db.exec('ALTER TABLE sticky_blocks ADD COLUMN layout_rotation REAL NOT NULL DEFAULT 0');
    }
  }

  // Migration: relayout existing sticky_notes to the current standard
  // (creator-side left half [0.05..0.45] + tilt magnitude [1°..5°]). Old
  // rows posted under earlier rules — wider x range or taller tilts — would
  // otherwise sit on the wall mismatched against new posts. Idempotent: any
  // row already inside the standard is left alone, and re-randomization
  // only fires if at least one row falls outside.
  const stickyTableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sticky_notes'"
  ).get();
  if (stickyTableExists) {
    const violator = db.prepare(`
      SELECT 1 FROM sticky_notes
      WHERE status = 'posted'
        AND (layout_x < 0.05 OR layout_x > 0.45
          OR ABS(layout_rotation) < 1 OR ABS(layout_rotation) > 5)
      LIMIT 1
    `).get();
    if (violator) {
      const ids = db.prepare(
        "SELECT id FROM sticky_notes WHERE status = 'posted'"
      ).all() as { id: number }[];
      const updateLayout = db.prepare(
        "UPDATE sticky_notes SET layout_x = ?, layout_rotation = ? WHERE id = ?"
      );
      const relayout = db.transaction((rows: { id: number }[]) => {
        for (const r of rows) {
          const x = 0.05 + Math.random() * 0.4;
          const sign = Math.random() > 0.5 ? 1 : -1;
          const rot = sign * (1 + Math.random() * 4);
          updateLayout.run(x, rot, r.id);
        }
      });
      relayout(ids);
      console.log(`[Migration] Relayout ${ids.length} sticky notes to current standard`);
    }
  }

  // Migration: same idempotent re-randomization for sticky_blocks tilts.
  // Catches pre-column rows (rotation=0) and anything outside [1°,5°].
  if (stickyBlocksTableExists) {
    const violatorBlock = db.prepare(`
      SELECT 1 FROM sticky_blocks
      WHERE status = 'committed'
        AND (ABS(layout_rotation) < 1 OR ABS(layout_rotation) > 5)
      LIMIT 1
    `).get();
    if (violatorBlock) {
      const ids = db.prepare(
        "SELECT id FROM sticky_blocks WHERE status = 'committed'"
      ).all() as { id: number }[];
      const updateBlockRot = db.prepare(
        "UPDATE sticky_blocks SET layout_rotation = ? WHERE id = ?"
      );
      const relayout = db.transaction((rows: { id: number }[]) => {
        for (const r of rows) {
          const sign = Math.random() > 0.5 ? 1 : -1;
          const rot = sign * (1 + Math.random() * 4);
          updateBlockRot.run(rot, r.id);
        }
      });
      relayout(ids);
      console.log(`[Migration] Relayout ${ids.length} sticky blocks to per-block tilt`);
    }
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
  // Badge / unread tracking only counts top-level actions (reply_to IS NULL).
  // History feeds also filter reply_to IS NULL — so a reaction whose id sits
  // above the latest top-level would otherwise sit "unread" forever, since
  // the client's mark-read passes the latest *visible* id (top-level only).
  // Reactions render inline beneath their parent bubble; the parent's read
  // state covers them.
  const stmtCountUnreadActions = db.prepare(
    'SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND reply_to IS NULL AND id > ?'
  );
  const stmtLatestPartnerActionId = db.prepare(
    'SELECT IFNULL(MAX(id), 0) AS id FROM actions WHERE user_id = ? AND reply_to IS NULL'
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
  // LEFT JOIN inbox_actions on partner side so trashed/purged messages are
  // hidden (content + id NULL) for the current user only — sender's archive
  // view of their own outgoing content is unaffected. partner_created_at is
  // surfaced so the inbox can show the actual time the partner submitted.
  const stmtGetMailboxArchive = db.prepare(`
    SELECT m.week_key,
      MAX(CASE WHEN m.user_id = ? THEN m.content END) as my_content,
      MAX(CASE WHEN m.user_id = ? AND ia.id IS NULL THEN m.content END) as partner_content,
      MAX(CASE WHEN m.user_id = ? AND ia.id IS NULL THEN m.id END) as partner_message_id,
      MAX(CASE WHEN m.user_id = ? AND ia.id IS NULL THEN m.created_at END) as partner_created_at
    FROM mailbox m
    LEFT JOIN inbox_actions ia
      ON ia.user_id = ? AND ia.kind = 'mailbox' AND ia.ref_id = m.id
        AND ia.status IN ('trashed', 'purged')
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
    'INSERT INTO time_capsules (user_id, partner_id, content, unlock_date, unlock_at, visibility) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const stmtGetCapsuleById = db.prepare('SELECT * FROM time_capsules WHERE id = ?');
  const stmtGetCapsules = db.prepare(
    'SELECT * FROM time_capsules WHERE (user_id = ? OR user_id = ?) AND (partner_id = ? OR partner_id = ?) ORDER BY unlock_date ASC'
  );
  const stmtOpenCapsule = db.prepare(
    'UPDATE time_capsules SET opened_at = CURRENT_TIMESTAMP WHERE id = ? AND opened_at IS NULL'
  );
  const stmtUnlockableCapsules = db.prepare(
    'SELECT * FROM time_capsules WHERE unlock_at <= ? AND opened_at IS NULL AND notified_at IS NULL'
  );
  const stmtMarkCapsuleNotified = db.prepare(
    'UPDATE time_capsules SET notified_at = ? WHERE id = ?'
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

  // Daily reaction statements (👍/👎 on partner's daily content)
  // DO NOTHING so a concurrent second insert can't bypass the route-level
  // "one-shot" check (which currently runs same-tick under better-sqlite3
  // sync API; this is defense in depth for any future multi-instance setup).
  const stmtSetDailyReaction = db.prepare(`
    INSERT INTO daily_reactions (reactor_id, target_user_id, target_date, target_type, reaction)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(reactor_id, target_user_id, target_date, target_type)
    DO NOTHING
  `);
  const stmtGetDailyReaction = db.prepare(
    'SELECT reaction FROM daily_reactions WHERE reactor_id = ? AND target_user_id = ? AND target_date = ? AND target_type = ?'
  );

  const stmtGetMailboxMessageById = db.prepare('SELECT * FROM mailbox WHERE id = ?');

  // Inbox action statements (soft delete / restore / purge per recipient)
  const stmtSetInboxAction = db.prepare(`
    INSERT INTO inbox_actions (user_id, kind, ref_id, status, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, kind, ref_id)
    DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
  `);
  const stmtClearInboxAction = db.prepare(
    'DELETE FROM inbox_actions WHERE user_id = ? AND kind = ? AND ref_id = ?'
  );
  const stmtGetInboxActionStatus = db.prepare(
    'SELECT status FROM inbox_actions WHERE user_id = ? AND kind = ? AND ref_id = ?'
  );
  // Trashed mailbox messages: only partner-authored ones (the recipient's
  // inbox) joined with the author's name from users table.
  const stmtGetTrashedMailbox = db.prepare(`
    SELECT m.id as ref_id, m.week_key as date, m.content, ia.updated_at as trashed_at
    FROM inbox_actions ia
    JOIN mailbox m ON m.id = ia.ref_id
    WHERE ia.user_id = ? AND ia.kind = 'mailbox' AND ia.status = 'trashed'
      AND m.user_id = ?
    ORDER BY ia.updated_at DESC
  `);
  const stmtGetTrashedCapsules = db.prepare(`
    SELECT c.id as ref_id, c.unlock_date as date, c.content, c.user_id, c.visibility,
           ia.updated_at as trashed_at
    FROM inbox_actions ia
    JOIN time_capsules c ON c.id = ia.ref_id
    WHERE ia.user_id = ? AND ia.kind = 'capsule' AND ia.status = 'trashed'
      AND c.opened_at IS NOT NULL
    ORDER BY ia.updated_at DESC
  `);

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

  // Sticky note (每日一帖) statements
  const stmtGetTempSticky = db.prepare(
    "SELECT * FROM sticky_notes WHERE user_id = ? AND status = 'temp' LIMIT 1"
  );
  const stmtInsertTempSticky = db.prepare(
    "INSERT INTO sticky_notes (user_id, partner_id, status) VALUES (?, ?, 'temp')"
  );
  const stmtGetStickyById = db.prepare('SELECT * FROM sticky_notes WHERE id = ?');
  const stmtUpdateTempStickyContent = db.prepare(`
    UPDATE sticky_blocks SET content = ?
    WHERE sticky_id = (SELECT id FROM sticky_notes WHERE user_id = ? AND status = 'temp' LIMIT 1)
      AND author_id = ? AND status = 'temp'
  `);
  // Postable iff a temp sticky exists for this user AND its initial temp block
  // exists. The transaction wrapper in postSticky() does the row-level work;
  // these statements are the building blocks.
  const stmtPostStickyHeader = db.prepare(`
    UPDATE sticky_notes
    SET status = 'posted', posted_at = CURRENT_TIMESTAMP, layout_x = ?, layout_rotation = ?
    WHERE id = ? AND status = 'temp'
  `);
  const stmtCommitStickyInitialBlock = db.prepare(`
    UPDATE sticky_blocks
    SET status = 'committed', committed_at = CURRENT_TIMESTAMP,
        content = ?, layout_rotation = ?
    WHERE sticky_id = ? AND author_id = ? AND status = 'temp'
  `);
  const stmtDeleteTempStickyBlocks = db.prepare(
    "DELETE FROM sticky_blocks WHERE sticky_id = ? AND status = 'temp'"
  );
  const stmtDeleteTempStickyHeader = db.prepare(
    "DELETE FROM sticky_notes WHERE user_id = ? AND status = 'temp'"
  );

  // Wall query: posted stickies between this couple, newest first. partner_id
  // is matched to the snapshot stored on each row, so stickies from a previous
  // pairing don't leak into the current couple's wall after re-pairing.
  const stmtListWallStickies = db.prepare(`
    SELECT * FROM sticky_notes
    WHERE status = 'posted'
      AND ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
    ORDER BY posted_at DESC, id DESC
    LIMIT ?
  `);
  const stmtGetStickyForCouple = db.prepare(`
    SELECT * FROM sticky_notes
    WHERE id = ?
      AND ((user_id = ? AND partner_id = ?) OR (user_id = ? AND partner_id = ?))
    LIMIT 1
  `);
  const stmtMaxCommittedBlockIdOnSticky = db.prepare(`
    SELECT IFNULL(MAX(id), 0) AS m FROM sticky_blocks
    WHERE sticky_id = ? AND status = 'committed'
  `);

  // Block lifecycle for "再写点" / "先写这么多".
  const stmtGetTempBlock = db.prepare(
    "SELECT * FROM sticky_blocks WHERE sticky_id = ? AND author_id = ? AND status = 'temp' LIMIT 1"
  );
  const stmtInsertTempBlock = db.prepare(
    "INSERT INTO sticky_blocks (sticky_id, author_id, content, status) VALUES (?, ?, '', 'temp')"
  );
  const stmtGetBlockById = db.prepare('SELECT * FROM sticky_blocks WHERE id = ?');
  const stmtUpdateTempBlockContent = db.prepare(
    "UPDATE sticky_blocks SET content = ? WHERE sticky_id = ? AND author_id = ? AND status = 'temp'"
  );
  const stmtDeleteTempBlock = db.prepare(
    "DELETE FROM sticky_blocks WHERE sticky_id = ? AND author_id = ? AND status = 'temp'"
  );
  const stmtCommitBlock = db.prepare(`
    UPDATE sticky_blocks
    SET status = 'committed', committed_at = CURRENT_TIMESTAMP,
        content = ?, layout_rotation = ?
    WHERE sticky_id = ? AND author_id = ? AND status = 'temp'
  `);

  // Pick a random tilt for a freshly-committed block, in the same magnitude
  // range as posts ([1°, 5°]). Independent per block so a thread of stapled
  // papers reads as visually scattered, not perfectly aligned.
  function pickBlockRotation(): number {
    const sign = Math.random() > 0.5 ? 1 : -1;
    return sign * (1 + Math.random() * 4);
  }

  // Per-recipient seen cursor.
  const stmtUpsertStickySeen = db.prepare(`
    INSERT INTO sticky_seen (user_id, sticky_id, last_seen_block_id)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, sticky_id)
    DO UPDATE SET last_seen_block_id = MAX(sticky_seen.last_seen_block_id, excluded.last_seen_block_id)
  `);

  // Tear-off: remove a sticky and everything that hangs off it. SQLite isn't
  // configured with foreign_keys=ON, so we cascade in JS inside one tx.
  const stmtDeleteStickyBlocks = db.prepare('DELETE FROM sticky_blocks WHERE sticky_id = ?');
  const stmtDeleteStickySeenRows = db.prepare('DELETE FROM sticky_seen WHERE sticky_id = ?');
  const stmtDeleteStickyNote = db.prepare('DELETE FROM sticky_notes WHERE id = ?');

  // Per-block delete: oldest committed block on a sticky is the "原帖" and
  // can't go via this path (deleteCommittedBlock returns first_block).
  const stmtFirstCommittedBlockId = db.prepare(
    "SELECT id FROM sticky_blocks WHERE sticky_id = ? AND status = 'committed' ORDER BY committed_at ASC, id ASC LIMIT 1"
  );
  const stmtDeleteCommittedBlockById = db.prepare(
    "DELETE FROM sticky_blocks WHERE id = ? AND sticky_id = ? AND author_id = ? AND status = 'committed'"
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

    rotateRefreshToken(oldHash, userId, newHash, expiresAt): void {
      db.transaction(() => {
        stmtDeleteRefreshToken.run(oldHash);
        stmtInsertRefreshToken.run(userId, newHash, expiresAt);
      })();
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

    getMailboxArchive(userId: string, partnerId: string, limit: number): { week_key: string; my_content: string | null; partner_content: string | null; partner_message_id: number | null; partner_created_at: string | null }[] {
      // Args ordered to match query: my_content user_id, partner_content user_id,
      // partner_message_id user_id, partner_created_at user_id, ia.user_id (viewer),
      // then mailbox.user_id IN (?, ?), limit.
      return stmtGetMailboxArchive.all(
        userId,         // my_content branch
        partnerId,      // partner_content branch
        partnerId,      // partner_message_id branch
        partnerId,      // partner_created_at branch
        userId,         // ia.user_id (current viewer for trash filter)
        userId,         // m.user_id IN (?,
        partnerId,      //              ?)
        limit
      ) as any[];
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
    createCapsule(userId: string, partnerId: string, content: string, unlockDate: string, unlockAt: string, visibility: 'self' | 'partner'): TimeCapsule {
      const result = stmtInsertCapsule.run(userId, partnerId, content, unlockDate, unlockAt, visibility);
      return stmtGetCapsuleById.get(result.lastInsertRowid) as TimeCapsule;
    },

    getCapsules(userId: string, partnerId: string): TimeCapsule[] {
      return stmtGetCapsules.all(userId, partnerId, userId, partnerId) as TimeCapsule[];
    },

    openCapsule(id: number): boolean {
      const result = stmtOpenCapsule.run(id);
      return result.changes > 0;
    },

    getUnlockableCapsules(nowIso: string): TimeCapsule[] {
      return stmtUnlockableCapsules.all(nowIso) as TimeCapsule[];
    },

    markCapsulesNotified(capsuleIds: number[], nowIso: string): void {
      if (capsuleIds.length === 0) return;
      const tx = db.transaction((ids: number[]) => {
        for (const id of ids) stmtMarkCapsuleNotified.run(nowIso, id);
      });
      tx(capsuleIds);
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

    setDailyReaction(reactorId, targetUserId, targetDate, targetType, reaction): void {
      stmtSetDailyReaction.run(reactorId, targetUserId, targetDate, targetType, reaction);
    },

    getDailyReaction(reactorId, targetUserId, targetDate, targetType): 'up' | 'down' | null {
      const row = stmtGetDailyReaction.get(reactorId, targetUserId, targetDate, targetType) as { reaction: 'up' | 'down' } | undefined;
      return row?.reaction ?? null;
    },

    setInboxAction(userId, kind, refId, status): void {
      stmtSetInboxAction.run(userId, kind, refId, status);
    },

    clearInboxAction(userId, kind, refId): void {
      stmtClearInboxAction.run(userId, kind, refId);
    },

    getInboxActionStatus(userId, kind, refId): 'trashed' | 'purged' | null {
      const row = stmtGetInboxActionStatus.get(userId, kind, refId) as { status: 'trashed' | 'purged' } | undefined;
      return row?.status ?? null;
    },

    getTrashedInboxItems(userId, partnerId): TrashedInboxItem[] {
      const mailboxRows = stmtGetTrashedMailbox.all(userId, partnerId) as {
        ref_id: number; date: string; content: string; trashed_at: string;
      }[];
      const capsuleRows = stmtGetTrashedCapsules.all(userId) as {
        ref_id: number; date: string; content: string; user_id: string;
        visibility: 'self' | 'partner'; trashed_at: string;
      }[];

      const out: TrashedInboxItem[] = [];
      for (const r of mailboxRows) {
        out.push({
          kind: 'mailbox',
          ref_id: r.ref_id,
          date: r.date,
          content: r.content,
          author: 'partner',
          visibility: 'partner',
          trashed_at: r.trashed_at,
        });
      }
      for (const r of capsuleRows) {
        out.push({
          kind: 'capsule',
          ref_id: r.ref_id,
          date: r.date,
          content: r.content,
          author: r.user_id === userId ? 'me' : 'partner',
          visibility: r.visibility,
          trashed_at: r.trashed_at,
        });
      }
      out.sort((a, b) => (a.trashed_at < b.trashed_at ? 1 : a.trashed_at > b.trashed_at ? -1 : 0));
      return out;
    },

    getMailboxMessageById(id): MailboxMessage | undefined {
      return stmtGetMailboxMessageById.get(id) as MailboxMessage | undefined;
    },

    getCapsuleById(id): TimeCapsule | undefined {
      return stmtGetCapsuleById.get(id) as TimeCapsule | undefined;
    },

    // -- Sticky notes (每日一帖) -------------------------------------------

    getTempSticky(userId): StickyNote | undefined {
      return stmtGetTempSticky.get(userId) as StickyNote | undefined;
    },

    createTempSticky(userId, partnerId): { sticky: StickyNote; block: StickyBlock } {
      // Atomic: a temp sticky always carries an initial empty temp block. The
      // route layer guarantees there's no existing temp first, so we don't
      // bother with INSERT OR IGNORE here.
      return db.transaction(() => {
        const result = stmtInsertTempSticky.run(userId, partnerId);
        const stickyId = Number(result.lastInsertRowid);
        const blockResult = stmtInsertTempBlock.run(stickyId, userId);
        const sticky = stmtGetStickyById.get(stickyId) as StickyNote;
        const block = stmtGetBlockById.get(Number(blockResult.lastInsertRowid)) as StickyBlock;
        return { sticky, block };
      })();
    },

    updateTempStickyContent(userId, content): boolean {
      const result = stmtUpdateTempStickyContent.run(content, userId, userId);
      return result.changes > 0;
    },

    deleteTempSticky(userId): boolean {
      // Cascade through the temp blocks first; SQLite has no ON DELETE
      // CASCADE without PRAGMA foreign_keys=ON which we don't enable here.
      return db.transaction(() => {
        const temp = stmtGetTempSticky.get(userId) as StickyNote | undefined;
        if (!temp) return false;
        stmtDeleteTempStickyBlocks.run(temp.id);
        const result = stmtDeleteTempStickyHeader.run(userId);
        return result.changes > 0;
      })();
    },

    postSticky(userId, content, layoutX, layoutRotation): { sticky: StickyNote; block: StickyBlock } | null {
      return db.transaction(() => {
        const temp = stmtGetTempSticky.get(userId) as StickyNote | undefined;
        if (!temp) return null;
        const headerResult = stmtPostStickyHeader.run(layoutX, layoutRotation, temp.id);
        if (headerResult.changes === 0) return null;
        // Each block carries its own random tilt independent of the sticky's
        // overall rotation — drives the multi-paper "stapled stack" look.
        const blockRotation = pickBlockRotation();
        const blockResult = stmtCommitStickyInitialBlock.run(content, blockRotation, temp.id, userId);
        if (blockResult.changes === 0) return null;
        const sticky = stmtGetStickyById.get(temp.id) as StickyNote;
        // After commit the original temp row is now 'committed' — fetch by
        // (sticky, author, committed) to get the canonical initial block.
        const block = db.prepare(
          "SELECT * FROM sticky_blocks WHERE sticky_id = ? AND author_id = ? AND status = 'committed' ORDER BY id ASC LIMIT 1"
        ).get(temp.id, userId) as StickyBlock;
        return { sticky, block };
      })();
    },

    getStickyForCouple(stickyId, userId, partnerId): StickyNote | undefined {
      return stmtGetStickyForCouple.get(stickyId, userId, partnerId, partnerId, userId) as StickyNote | undefined;
    },

    listWallStickies(userId, partnerId, limit): StickyNote[] {
      return stmtListWallStickies.all(userId, partnerId, partnerId, userId, limit) as StickyNote[];
    },

    listCommittedBlocksForStickies(stickyIds): StickyBlock[] {
      if (stickyIds.length === 0) return [];
      // Build placeholders for IN(...) — stickyIds count is bounded by the
      // wall query's LIMIT (route caps at 200), so we don't worry about
      // SQLITE_MAX_VARIABLE_NUMBER. Each placeholder is a real bind, no string
      // interpolation of user data.
      const placeholders = stickyIds.map(() => '?').join(',');
      const stmt = db.prepare(
        `SELECT * FROM sticky_blocks WHERE status = 'committed' AND sticky_id IN (${placeholders}) ORDER BY committed_at ASC, id ASC`
      );
      return stmt.all(...stickyIds) as StickyBlock[];
    },

    listSeenForStickies(userId, stickyIds): Map<number, number> {
      const out = new Map<number, number>();
      if (stickyIds.length === 0) return out;
      const placeholders = stickyIds.map(() => '?').join(',');
      const stmt = db.prepare(
        `SELECT sticky_id, last_seen_block_id FROM sticky_seen WHERE user_id = ? AND sticky_id IN (${placeholders})`
      );
      const rows = stmt.all(userId, ...stickyIds) as { sticky_id: number; last_seen_block_id: number }[];
      for (const r of rows) out.set(r.sticky_id, r.last_seen_block_id);
      return out;
    },

    maxCommittedBlockIdOnSticky(stickyId): number {
      const row = stmtMaxCommittedBlockIdOnSticky.get(stickyId) as { m: number };
      return row?.m ?? 0;
    },

    getTempBlock(stickyId, authorId): StickyBlock | undefined {
      return stmtGetTempBlock.get(stickyId, authorId) as StickyBlock | undefined;
    },

    createTempBlock(stickyId, authorId): StickyBlock {
      const result = stmtInsertTempBlock.run(stickyId, authorId);
      return stmtGetBlockById.get(Number(result.lastInsertRowid)) as StickyBlock;
    },

    updateTempBlockContent(stickyId, authorId, content): boolean {
      const result = stmtUpdateTempBlockContent.run(content, stickyId, authorId);
      return result.changes > 0;
    },

    deleteTempBlock(stickyId, authorId): boolean {
      const result = stmtDeleteTempBlock.run(stickyId, authorId);
      return result.changes > 0;
    },

    commitBlock(stickyId, authorId, content): StickyBlock | null {
      const blockRotation = pickBlockRotation();
      const result = stmtCommitBlock.run(content, blockRotation, stickyId, authorId);
      if (result.changes === 0) return null;
      // After commit the row is no longer 'temp', so re-fetch by (sticky,
      // author) for the most-recent committed block authored here.
      const block = db.prepare(
        "SELECT * FROM sticky_blocks WHERE sticky_id = ? AND author_id = ? AND status = 'committed' ORDER BY id DESC LIMIT 1"
      ).get(stickyId, authorId) as StickyBlock | undefined;
      return block ?? null;
    },

    markStickySeen(userId, stickyId, blockId): void {
      stmtUpsertStickySeen.run(userId, stickyId, blockId);
    },

    deleteSticky(stickyId, userId, partnerId): boolean {
      return db.transaction(() => {
        const sticky = stmtGetStickyForCouple.get(
          stickyId, userId, partnerId, partnerId, userId
        ) as StickyNote | undefined;
        if (!sticky || sticky.status !== 'posted') return false;
        stmtDeleteStickyBlocks.run(stickyId);
        stmtDeleteStickySeenRows.run(stickyId);
        stmtDeleteStickyNote.run(stickyId);
        return true;
      })();
    },

    deleteCommittedBlock(stickyId, blockId, authorId): { ok: boolean; reason?: 'not_found' | 'first_block' } {
      return db.transaction(() => {
        const block = stmtGetBlockById.get(blockId) as StickyBlock | undefined;
        if (
          !block ||
          block.sticky_id !== stickyId ||
          block.author_id !== authorId ||
          block.status !== 'committed'
        ) {
          return { ok: false, reason: 'not_found' as const };
        }
        const first = stmtFirstCommittedBlockId.get(stickyId) as { id: number } | undefined;
        if (first?.id === blockId) {
          return { ok: false, reason: 'first_block' as const };
        }
        const result = stmtDeleteCommittedBlockById.run(blockId, stickyId, authorId);
        if (result.changes === 0) return { ok: false, reason: 'not_found' as const };
        return { ok: true };
      })();
    },
  };

  return { db, dbOps };
}

// Default instance for production
const defaultInstance = createDatabase();

export const dbOps = defaultInstance.dbOps;
const db: DatabaseType = defaultInstance.db;
export default db;
