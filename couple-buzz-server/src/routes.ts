import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto, { randomInt } from 'crypto';
import { DbOps } from './db';
import { QUESTIONS } from './questions';
import { createWsTicket } from './socket';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiresAt,
  createAuthMiddleware,
  hashPassword,
  verifyPassword,
  generateUserId,
  signImagePath,
} from './auth';

// Length limits, also enforced at the API edge so a misbehaving client can't
// bypass the UI's maxLength. `name` shows up in every push body — letting it
// grow unbounded would blow APNs' 4KB payload cap and silently kill pushes.
const NAME_MAX = 20;
const REMARK_MAX = 30;
const DATE_TITLE_MAX = 50;

// Whitelist of action types a client is allowed to send via POST /action and
// POST /reaction. Anything else is rejected to keep the actions table clean
// and prevent a malicious client from polluting it with arbitrary strings.
const VALID_ACTIONS: ReadonlySet<string> = new Set([
  'miss', 'finger_heart', 'love', 'kiss', 'poop', 'pat',
  'shy', 'rose', 'hug', 'pick_nose',
  'eat', 'angry_silent', 'angry_talk', 'hungry', 'sleepy',
  'where_r_u', 'what_doing', 'sleep', 'play', 'clean',
  'cry', 'wuwu', 'sad', 'clown', 'haha', 'hehe', 'work',
  'slap', 'ping',
  'call_wife', 'call_husband', 'call_baby',
  'gym', 'milk_tea', 'drink',
  'show_off', 'smug', 'praise_me',
]);

// Timezone helpers
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Strict YYYY-MM-DD with calendar validation. Rejects "2024-02-31" even
// though that string matches the regex, by round-tripping through Date.
function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function safeTimezone(tz: string): string {
  return isValidTimezone(tz) ? tz : 'Asia/Shanghai';
}

function getLocalDate(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: safeTimezone(timezone) });
}

function getLocalHour(timezone: string): number {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: safeTimezone(timezone), hour: 'numeric', hour12: false }));
  return h === 24 ? 0 : h;
}

// Distance from "now" until midnight of `targetDateStr` in `timezone`,
// formatted like "3天5小时". Falls back to "0小时" if the target is past.
function formatDayHourCountdown(targetDateStr: string, timezone: string): string {
  const tz = safeTimezone(timezone);
  const now = new Date();

  // Midnight of target date in the target timezone, expressed as a UTC instant.
  // Build via en-CA locale to compute the offset.
  const offsetMin = (() => {
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset',
      });
      const parts = fmt.formatToParts(now);
      const off = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0';
      const m = off.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return 0;
      const sign = m[1] === '+' ? 1 : -1;
      return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    } catch {
      return 0;
    }
  })();

  const [y, mo, d] = targetDateStr.split('-').map(Number);
  // 00:00 local time = 00:00 UTC minus offset
  const targetUtcMs = Date.UTC(y, mo - 1, d, 0, 0, 0) - offsetMin * 60 * 1000;
  const diffMs = targetUtcMs - now.getTime();
  if (diffMs <= 0) return '0小时';

  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours}小时`;
  return `${days}天${hours}小时`;
}

function getYesterdayDate(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Used by weekly report. Mailbox uses session keys, not week.
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// Mailbox helpers — twice-daily session cycle.
// AM session: 0:00-11:59 UTC (= 8am-7:59pm BJT) → reveals at 12:00 UTC (= 8pm BJT)
// PM session: 12:00-23:59 UTC (= 8pm BJT to 7:59am BJT next day) → reveals next 0:00 UTC (= 8am BJT)
function getCurrentSessionKey(): string {
  const now = new Date();
  const utcDate = now.toISOString().slice(0, 10);
  const utcHour = now.getUTCHours();
  return utcHour < 12 ? `${utcDate}-AM` : `${utcDate}-PM`;
}

function getRevealTime(sessionKey: string): Date {
  const date = sessionKey.slice(0, 10);
  const phase = sessionKey.slice(11);
  if (phase === 'AM') {
    return new Date(`${date}T12:00:00Z`);
  }
  // PM: reveal next day 0:00 UTC
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export type SendPushFn = (
  deviceToken: string,
  actionType: string,
  senderName: string,
  extra?: Record<string, string>,
  badge?: number
) => Promise<boolean>;

// Generate a random 4-digit pair code (CSPRNG, not Math.random)
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[randomInt(chars.length)];
  }
  return code;
}

function parseId(value: string): number | null {
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function issueTokens(dbOps: DbOps, userId: string, tokenVersion: number) {
  const accessToken = generateAccessToken(userId, tokenVersion);
  const refreshToken = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiresAt();

  dbOps.insertRefreshToken(userId, hashToken(refreshToken), expiresAt);

  return { access_token: accessToken, refresh_token: refreshToken };
}

export function createPublicRouter(dbOps: DbOps): Router {
  const router = Router();

  // POST /api/register — create account with ID + password
  router.post('/register', (req: Request, res: Response) => {
    const { name, password, device_token, timezone } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (name.trim().length === 0 || name.trim().length > NAME_MAX) {
      return res.status(400).json({ error: `name must be 1-${NAME_MAX} characters` });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'password is required (min 4 chars)' });
    }

    let userId = generateUserId();
    while (dbOps.getUser(userId)) {
      userId = generateUserId();
    }

    const passwordHash = hashPassword(password);
    const pairCode = userId; // ID itself is the connection code

    const userTz = (timezone && isValidTimezone(timezone)) ? timezone : 'Asia/Shanghai';
    dbOps.createUser(userId, name.trim(), passwordHash, pairCode, userTz);

    if (device_token) {
      dbOps.setDeviceToken(userId, device_token);
    }

    const user = dbOps.getUser(userId)!;
    const tokens = issueTokens(dbOps, userId, user.token_version);

    res.json({ user_id: userId, ...tokens });
  });

  // POST /api/login — login with ID + password
  router.post('/login', (req: Request, res: Response) => {
    const { user_id, password, device_token } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'user_id and password are required' });
    }

    const user = dbOps.getUser(user_id.toUpperCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid ID or password' });
    }

    if (device_token) {
      dbOps.setDeviceToken(user.id, device_token);
    }

    const tokens = issueTokens(dbOps, user.id, user.token_version);
    const partnerName = user.partner_id ? dbOps.getUser(user.partner_id)?.name ?? null : null;

    res.json({ user_id: user.id, partner_name: partnerName, ...tokens });
  });

  // POST /api/auth/refresh — public, uses refresh token
  router.post('/auth/refresh', (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }

    const tokenHash = hashToken(refresh_token);
    const stored = dbOps.getRefreshToken(tokenHash);

    if (!stored) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check expiry
    if (new Date(stored.expires_at) < new Date()) {
      dbOps.deleteRefreshToken(tokenHash);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const user = dbOps.getUser(stored.user_id);
    if (!user) {
      dbOps.deleteRefreshToken(tokenHash);
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate: delete old, issue new
    dbOps.deleteRefreshToken(tokenHash);
    const tokens = issueTokens(dbOps, user.id, user.token_version);

    res.json(tokens);
  });

  return router;
}

export function createProtectedRouter(dbOps: DbOps, pushFn: SendPushFn): Router {
  const router = Router();

  // GET /api/status — check if paired
  router.get('/status', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.partner_id) {
      const partner = dbOps.getUser(user.partner_id);
      const streak = dbOps.getStreak(userId, user.partner_id);
      return res.json({
        paired: true,
        partner_id: user.partner_id,
        partner_name: partner?.name ?? null,
        name: user.name,
        timezone: user.timezone,
        partner_timezone: user.partner_timezone,
        partner_remark: user.partner_remark,
        streak,
      });
    }

    res.json({ paired: false, name: user.name, timezone: user.timezone, partner_timezone: user.partner_timezone, partner_remark: user.partner_remark, streak: 0 });
  });

  // PUT /api/profile — update name and/or timezone
  router.put('/profile', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { name, timezone, partner_timezone, partner_remark } = req.body;

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string') return res.status(400).json({ error: 'name must be a string' });
      if (name.trim().length > NAME_MAX) return res.status(400).json({ error: `name max ${NAME_MAX} characters` });
    }
    if (partner_remark !== undefined) {
      if (typeof partner_remark !== 'string') return res.status(400).json({ error: 'partner_remark must be a string' });
      if (partner_remark.length > REMARK_MAX) return res.status(400).json({ error: `partner_remark max ${REMARK_MAX} characters` });
    }

    const newName = (name && typeof name === 'string' && name.trim()) ? name.trim() : user.name;
    const newTimezone = (timezone && typeof timezone === 'string' && isValidTimezone(timezone)) ? timezone : user.timezone;
    const newPartnerTz = (partner_timezone && typeof partner_timezone === 'string' && isValidTimezone(partner_timezone)) ? partner_timezone : user.partner_timezone;
    const newRemark = (typeof partner_remark === 'string') ? partner_remark : user.partner_remark;

    dbOps.updateProfile(userId, newName, newTimezone, newPartnerTz, newRemark);
    res.json({ success: true, name: newName, timezone: newTimezone, partner_timezone: newPartnerTz, partner_remark: newRemark });
  });

  // POST /api/pair — connect with partner using their user ID
  router.post('/pair', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { partner_id: partnerId } = req.body;

    if (!partnerId) {
      return res.status(400).json({ error: 'partner_id is required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.partner_id) {
      return res.status(400).json({ error: 'Already paired' });
    }

    const partner = dbOps.getUser(partnerId.toUpperCase());
    if (!partner) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (partner.id === userId) {
      return res.status(400).json({ error: 'Cannot pair with yourself' });
    }

    // Reject pairing with someone who's already paired — otherwise we'd silently
    // overwrite their existing partnership and orphan the original spouse's pointer.
    if (partner.partner_id) {
      return res.status(400).json({ error: 'Partner is already paired with someone else' });
    }

    dbOps.pairUsers(userId, partner.id);

    res.json({ success: true, partner_name: partner.name });
  });

  // POST /api/action
  router.post('/action', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { action_type, timezone } = req.body;

    if (!action_type || typeof action_type !== 'string' || !VALID_ACTIONS.has(action_type)) {
      return res.status(400).json({ error: 'Invalid action_type' });
    }

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.partner_id) {
      return res.status(400).json({ error: 'Not paired yet' });
    }

    dbOps.addAction(userId, action_type, timezone || user.timezone, user.name);

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      const unread = dbOps.getUnreadActionCount(partner.id, userId);
      await pushFn(partner.device_token, action_type, user.name, undefined, unread);
    }

    res.json({ success: true });
  });

  // POST /api/reaction
  router.post('/reaction', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { action_id, action_type } = req.body;

    if (!action_id || !action_type || typeof action_type !== 'string') {
      return res.status(400).json({ error: 'action_id and action_type are required' });
    }
    if (!VALID_ACTIONS.has(action_type)) {
      return res.status(400).json({ error: 'Invalid action_type' });
    }

    const actionId = typeof action_id === 'number' ? action_id : parseInt(action_id);
    if (isNaN(actionId)) return res.status(400).json({ error: 'action_id must be a valid number' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const targetAction = dbOps.getAction(actionId);
    if (!targetAction) return res.status(404).json({ error: 'Action not found' });
    if (targetAction.user_id !== user.partner_id) return res.status(400).json({ error: 'Cannot react to this action' });
    if (targetAction.reply_to !== null) return res.status(400).json({ error: 'Cannot react to a reaction' });

    const reactionId = dbOps.addReaction(userId, action_type, user.timezone, user.name, actionId);

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      const unread = dbOps.getUnreadActionCount(partner.id, userId);
      await pushFn(partner.device_token, 'reaction', user.name, undefined, unread);
    }

    res.json({ success: true, reaction_id: reactionId });
  });

  // GET /api/history
  router.get('/history', (req: Request, res: Response) => {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 50;

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const actions = dbOps.getHistory(userId, Math.min(limit, 200));

    // Group reactions by parent action id
    const allReactions = dbOps.getHistoryReactions(userId);
    const reactions: Record<number, typeof allReactions> = {};
    for (const r of allReactions) {
      if (r.reply_to !== null) {
        if (!reactions[r.reply_to]) reactions[r.reply_to] = [];
        reactions[r.reply_to].push(r);
      }
    }

    res.json({ actions, reactions });
  });

  // POST /api/mark-read — client tells the server it has seen up to this
  // action id. Server only accepts ids that monotonically advance, so a stale
  // request can't undo a fresh "all read" mark.
  router.post('/mark-read', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { last_id } = req.body;

    const id = typeof last_id === 'number' ? last_id : parseInt(last_id, 10);
    if (!Number.isFinite(id) || id < 0) {
      return res.status(400).json({ error: 'last_id must be a non-negative integer' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Clamp to the highest action id the partner has actually sent. Without
    // this a misbehaving client could ship Number.MAX_SAFE_INTEGER and pin
    // the read pointer above any future action — silently muting badges.
    const latest = user.partner_id ? dbOps.getLatestPartnerActionId(userId, user.partner_id) : 0;
    const clamped = Math.min(id, latest);
    dbOps.setLastReadActionId(userId, clamped);
    const unread = user.partner_id ? dbOps.getUnreadActionCount(userId, user.partner_id) : 0;
    res.json({ success: true, unread });
  });

  // PUT /api/device-token
  router.put('/device-token', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { device_token } = req.body;

    if (!device_token) {
      return res.status(400).json({ error: 'device_token is required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    dbOps.setDeviceToken(userId, device_token);
    res.json({ success: true });
  });

  // POST /api/unpair
  router.post('/unpair', async (req: Request, res: Response) => {
    const userId = req.userId!;

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.partner_id) {
      return res.status(400).json({ error: 'Not paired' });
    }

    const partner = dbOps.getUser(user.partner_id);

    dbOps.unpairUsers(userId, user.partner_id);

    // Generate new pair codes for both
    let newPairCode = generatePairCode();
    while (dbOps.getUserByPairCode(newPairCode)) {
      newPairCode = generatePairCode();
    }
    dbOps.updatePairCode(userId, newPairCode);

    let partnerPairCode = generatePairCode();
    while (dbOps.getUserByPairCode(partnerPairCode)) {
      partnerPairCode = generatePairCode();
    }
    if (partner) {
      dbOps.updatePairCode(partner.id, partnerPairCode);
    }

    // Notify partner via push
    if (partner?.device_token) {
      await pushFn(partner.device_token, 'unpair', user.name);
    }

    res.json({ success: true, new_pair_code: newPairCode });
  });

  // GET /api/dates
  router.get('/dates', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ dates: [], nearest: null });

    const dates = dbOps.getImportantDates(userId, user.partner_id);

    // Compute pinned date countdown (only pinned date shows on homepage).
    // For non-recurring dates, the date may be in the past (e.g. "在一起的
    // 日子") and we want to show "已经 N 天啦". `days_diff` carries sign
    // (- = past, 0 = today, + = upcoming); `days_away` is its absolute value
    // for backward compatibility.
    const today = new Date().toISOString().slice(0, 10);
    let pinned: { title: string; date: string; days_away: number; days_diff: number } | null = null;

    const pinnedDate = dates.find(d => d.pinned);
    if (pinnedDate) {
      let targetDate = pinnedDate.date;
      if (pinnedDate.recurring) {
        // Recurring dates always project to the next occurrence (today or future)
        const thisYear = new Date().getFullYear();
        const mmdd = pinnedDate.date.slice(5);
        targetDate = `${thisYear}-${mmdd}`;
        if (targetDate < today) {
          targetDate = `${thisYear + 1}-${mmdd}`;
        }
      }
      const daysDiff = Math.round((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000);
      pinned = {
        title: pinnedDate.title,
        date: targetDate,
        days_away: Math.abs(daysDiff),
        days_diff: daysDiff,
      };
    }

    res.json({ dates, pinned });
  });

  // POST /api/dates
  router.post('/dates', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { title, date, recurring } = req.body;

    if (!title || typeof title !== 'string' || !date || typeof date !== 'string') {
      return res.status(400).json({ error: 'title and date are required' });
    }
    if (title.length > DATE_TITLE_MAX) return res.status(400).json({ error: `title max ${DATE_TITLE_MAX} characters` });
    if (!isValidDateString(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const existing = dbOps.getImportantDates(userId, user.partner_id);
    if (existing.length >= 20) return res.status(400).json({ error: 'Maximum 20 dates' });

    const created = dbOps.createImportantDate(userId, user.partner_id, title.trim(), date, !!recurring);

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      await pushFn(partner.device_token, 'date_new', user.name);
    }

    res.json({ date: created });
  });

  // PUT /api/dates/:id
  router.put('/dates/:id', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });
    const { title, date, recurring } = req.body;

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    if (!title || typeof title !== 'string' || !date || typeof date !== 'string') {
      return res.status(400).json({ error: 'title and date are required' });
    }
    if (title.length > DATE_TITLE_MAX) return res.status(400).json({ error: `title max ${DATE_TITLE_MAX} characters` });
    if (!isValidDateString(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const updated = dbOps.updateImportantDate(id, title.trim(), date, !!recurring, userId, user.partner_id);
    if (!updated) return res.status(404).json({ error: 'Date not found' });

    res.json({ success: true });
  });

  // POST /api/dates/:id/pin
  router.post('/dates/:id/pin', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    dbOps.pinImportantDate(id, userId, user.partner_id);
    res.json({ success: true });
  });

  // DELETE /api/dates/:id
  router.delete('/dates/:id', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const deleted = dbOps.deleteImportantDate(id, userId, user.partner_id);
    if (!deleted) return res.status(404).json({ error: 'Date not found' });

    res.json({ success: true });
  });

  // GET /api/daily-question
  router.get('/daily-question', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    // Daily question rolls at Beijing-time midnight (matches the client countdown).
    const today = getLocalDate('Asia/Shanghai');

    // Get or assign today's question (avoid repeating completed ones)
    let index = dbOps.getQuestionAssignment(today);
    if (index === null) {
      const completed = dbOps.getCompletedQuestionIndexes(userId, user.partner_id);
      const available = Array.from({ length: QUESTIONS.length }, (_, i) => i).filter(i => !completed.has(i));
      if (available.length === 0) {
        // All questions answered — reset by picking from full pool
        index = Math.floor(Math.random() * QUESTIONS.length);
      } else {
        index = available[Math.floor(Math.random() * available.length)];
      }
      dbOps.setQuestionAssignment(today, index);
    }
    const question = QUESTIONS[index];

    const answers = dbOps.getDailyAnswers(today, userId, user.partner_id);
    const bothAnswered = !!answers.mine && !!answers.partner;

    // Reactions only meaningful once both answered. Send the partner's date
    // for "ta's reaction to my answer" (correct since they react to my row).
    const myReactionToPartner = bothAnswered
      ? dbOps.getDailyReaction(userId, user.partner_id, today, 'question')
      : null;
    const partnerReactionToMe = bothAnswered
      ? dbOps.getDailyReaction(user.partner_id, userId, today, 'question')
      : null;

    res.json({
      question,
      question_index: index,
      date: today,
      my_answer: answers.mine?.answer ?? null,
      partner_answer: bothAnswered ? answers.partner!.answer : null,
      partner_answered: !!answers.partner,
      both_answered: bothAnswered,
      my_reaction_to_partner: myReactionToPartner,
      partner_reaction_to_me: partnerReactionToMe,
    });
  });

  // POST /api/daily-question/answer
  router.post('/daily-question/answer', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { answer } = req.body;

    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return res.status(400).json({ error: 'answer is required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const today = getLocalDate('Asia/Shanghai');

    // Get today's assigned question index
    let index = dbOps.getQuestionAssignment(today);
    if (index === null) {
      const completed = dbOps.getCompletedQuestionIndexes(userId, user.partner_id);
      const available = Array.from({ length: QUESTIONS.length }, (_, i) => i).filter(i => !completed.has(i));
      index = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : Math.floor(Math.random() * QUESTIONS.length);
      dbOps.setQuestionAssignment(today, index);
    }

    dbOps.submitDailyAnswer(userId, today, index, answer.trim());

    const answers = dbOps.getDailyAnswers(today, userId, user.partner_id);
    const bothAnswered = !!answers.mine && !!answers.partner;

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      if (bothAnswered) {
        await pushFn(partner.device_token, 'daily_both', user.name);
      } else {
        await pushFn(partner.device_token, 'daily_answer', user.name);
      }
    }

    res.json({
      success: true,
      both_answered: bothAnswered,
      partner_answer: bothAnswered ? answers.partner!.answer : null,
    });
  });

  // GET /api/stats
  router.get('/stats', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ total_actions: 0, my_actions: 0, partner_actions: 0, top_actions: [], hourly: [], monthly: [], first_action_date: null });

    const stats = dbOps.getStats(userId, user.partner_id);
    res.json(stats);
  });

  // POST /api/ritual
  router.post('/ritual', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { ritual_type } = req.body;

    if (!ritual_type || (ritual_type !== 'morning' && ritual_type !== 'evening')) {
      return res.status(400).json({ error: 'ritual_type must be morning or evening' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const localHour = getLocalHour(user.timezone);
    const isMorningWindow = localHour >= 4 && localHour <= 12;
    const isEveningWindow = localHour >= 18 || localHour < 4;

    if (ritual_type === 'morning' && !isMorningWindow) {
      return res.status(400).json({ error: 'Morning ritual available 4:00-12:59' });
    }
    if (ritual_type === 'evening' && !isEveningWindow) {
      return res.status(400).json({ error: 'Evening ritual available 18:00-3:59' });
    }

    // For evening ritual after midnight (0-3), use yesterday's date
    let ritualDate = getLocalDate(user.timezone);
    if (ritual_type === 'evening' && localHour < 4) {
      ritualDate = getYesterdayDate(ritualDate);
    }

    const inserted = dbOps.submitRitual(userId, ritual_type, ritualDate);

    // Check partner's status using partner's OWN timezone (not user's guess)
    const partner = dbOps.getUser(user.partner_id);
    const partnerTz = partner?.timezone || 'Asia/Shanghai';
    const partnerDate = getLocalDate(partnerTz);
    let partnerRitualDate = partnerDate;
    if (ritual_type === 'evening') {
      const partnerHour = getLocalHour(partnerTz);
      if (partnerHour < 4) {
        partnerRitualDate = getYesterdayDate(partnerDate);
      }
    }

    const status = dbOps.getRitualsByDates(ritualDate, partnerRitualDate, userId, user.partner_id);
    const bothCompleted = ritual_type === 'morning'
      ? status.myMorning && status.partnerMorning
      : status.myEvening && status.partnerEvening;
    if (partner?.device_token) {
      if (bothCompleted) {
        await pushFn(partner.device_token, ritual_type === 'morning' ? 'ritual_both_morning' : 'ritual_both_evening', user.name);
      } else if (inserted) {
        await pushFn(partner.device_token, ritual_type === 'morning' ? 'ritual_morning' : 'ritual_evening', user.name);
      }
    }

    res.json({ success: true, ritual_type, ritual_date: ritualDate, both_completed: bothCompleted });
  });

  // GET /api/ritual/status
  router.get('/ritual/status', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const localHour = getLocalHour(user.timezone);
    const myDate = getLocalDate(user.timezone);

    // Use partner's OWN timezone for matching
    const partner = dbOps.getUser(user.partner_id);
    const partnerTz = partner?.timezone || 'Asia/Shanghai';
    const partnerDate = getLocalDate(partnerTz);

    // For evening: compute adjusted dates (if after midnight, look at yesterday)
    let myEveningDate = myDate;
    if (localHour < 4) {
      myEveningDate = getYesterdayDate(myDate);
    }
    const partnerHour = getLocalHour(partnerTz);
    let partnerEveningDate = partnerDate;
    if (partnerHour < 4) {
      partnerEveningDate = getYesterdayDate(partnerDate);
    }

    const morningStatus = dbOps.getRitualsByDates(myDate, partnerDate, userId, user.partner_id);
    const eveningStatus = dbOps.getRitualsByDates(myEveningDate, partnerEveningDate, userId, user.partner_id);

    const morningBoth = morningStatus.myMorning && morningStatus.partnerMorning;
    const eveningBoth = eveningStatus.myEvening && eveningStatus.partnerEvening;

    let dailyRecap = null;
    if (eveningBoth) {
      dailyRecap = dbOps.getDailyRecap(userId, user.partner_id, myEveningDate);
    }

    res.json({
      local_hour: localHour,
      morning: {
        my_completed: morningStatus.myMorning,
        partner_completed: morningStatus.partnerMorning,
        both_completed: morningBoth,
      },
      evening: {
        my_completed: eveningStatus.myEvening,
        partner_completed: eveningStatus.partnerEvening,
        both_completed: eveningBoth,
      },
      daily_recap: dailyRecap,
    });
  });

  // GET /api/mailbox
  router.get('/mailbox', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const sessionKey = getCurrentSessionKey();
    const revealAt = getRevealTime(sessionKey);
    const now = new Date();
    const phase = now >= revealAt ? 'revealed' : 'writing';

    const messages = dbOps.getMailboxMessages(sessionKey, userId, user.partner_id);

    res.json({
      week_key: sessionKey,
      phase,
      my_message: messages.mine?.content ?? null,
      partner_message: phase === 'revealed' ? (messages.partner?.content ?? null) : null,
      partner_wrote: phase === 'revealed' ? !!messages.partner : undefined,
      reveal_at: revealAt.toISOString(),
      can_edit: phase === 'writing' && !messages.mine,
    });
  });

  // POST /api/mailbox — seal-on-submit: first write wins and becomes read-only.
  router.post('/mailbox', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'content max 500 characters' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const sessionKey = getCurrentSessionKey();
    const revealAt = getRevealTime(sessionKey);

    if (new Date() >= revealAt) {
      return res.status(400).json({ error: 'Writing period has ended' });
    }

    const saved = dbOps.submitMailboxMessage(userId, sessionKey, content.trim());
    if (!saved) {
      return res.status(400).json({ error: '本场的信已封存，不能再修改' });
    }

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      await pushFn(partner.device_token, 'mailbox_written', user.name);
    }

    res.json({ success: true });
  });

  // GET /api/mailbox/archive
  router.get('/mailbox/archive', (req: Request, res: Response) => {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 10;

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ weeks: [] });

    // Only return sessions whose reveal time has passed
    const allWeeks = dbOps.getMailboxArchive(userId, user.partner_id, Math.min(limit, 50));
    const now = new Date();
    const currentSessionKey = getCurrentSessionKey();
    const weeks = allWeeks.filter(w => {
      if (w.week_key === currentSessionKey) {
        return now >= getRevealTime(currentSessionKey);
      }
      return true; // Past sessions are always revealed
    });

    res.json({ weeks });
  });

  // GET /api/weekly-report
  router.get('/weekly-report', (req: Request, res: Response) => {
    const userId = req.userId!;
    const week = req.query.week as string;

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ total: 0 });

    // Default to current week Monday
    const weekStart = week || getCurrentWeekMonday();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const data = dbOps.getWeeklyReportData(userId, user.partner_id, weekStart, weekEndStr);
    const streak = dbOps.getStreak(userId, user.partner_id);

    const changePct = data.lastWeekTotal > 0
      ? Math.round(((data.total - data.lastWeekTotal) / data.lastWeekTotal) * 100)
      : 0;

    // Temperature: interaction(40%) + question(20%) + ritual(20%) + streak(20%)
    const interactionScore = Math.min(data.total / 50, 1) * 40;
    const questionScore = (data.dailyQuestionDays / 7) * 20;
    const ritualScore = ((data.ritualMorningDays + data.ritualEveningDays) / 14) * 20;
    const streakScore = Math.min(streak / 30, 1) * 20;
    const temperature = Math.round(interactionScore + questionScore + ritualScore + streakScore);

    let temperatureLabel = '❄️ 冷淡期';
    if (temperature >= 80) temperatureLabel = '🔥🔥🔥 热恋中';
    else if (temperature >= 60) temperatureLabel = '🔥🔥 甜蜜期';
    else if (temperature >= 40) temperatureLabel = '🔥 升温中';
    else if (temperature >= 20) temperatureLabel = '☀️ 温暖期';

    res.json({
      week_key: weekStart,
      total: data.total,
      last_week_total: data.lastWeekTotal,
      change_percent: changePct,
      my_count: data.myCount,
      partner_count: data.partnerCount,
      streak,
      top_actions: data.topActions,
      daily_question_rate: `${data.dailyQuestionDays}/7`,
      ritual_morning_rate: `${data.ritualMorningDays}/7`,
      ritual_evening_rate: `${data.ritualEveningDays}/7`,
      temperature,
      temperature_label: temperatureLabel,
    });
  });

  // POST /api/capsules
  router.post('/capsules', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { content, unlock_date, visibility } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (content.length > 1000) {
      return res.status(400).json({ error: 'content max 1000 characters' });
    }
    if (!unlock_date || typeof unlock_date !== 'string') {
      return res.status(400).json({ error: 'unlock_date is required' });
    }
    const vis: 'self' | 'partner' = visibility === 'self' ? 'self' : 'partner';

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const userToday = getLocalDate(user.timezone);
    if (unlock_date <= userToday) {
      return res.status(400).json({ error: 'unlock_date must be in the future' });
    }

    const existing = dbOps.getCapsules(userId, user.partner_id);
    if (existing.filter(c => !c.opened_at).length >= 50) {
      return res.status(400).json({ error: 'Maximum 50 pending capsules' });
    }

    const capsule = dbOps.createCapsule(userId, user.partner_id, content.trim(), unlock_date, vis);

    // Notify partner only when this capsule is meant for them. Body includes a
    // day+hour countdown so the partner knows when to expect it.
    if (vis === 'partner') {
      const partner = dbOps.getUser(user.partner_id);
      if (partner?.device_token) {
        const countdown = formatDayHourCountdown(unlock_date, partner.timezone);
        await pushFn(partner.device_token, 'capsule_buried', user.name, { countdown });
      }
    }

    res.json({ id: capsule.id, unlock_date: capsule.unlock_date, created_at: capsule.created_at });
  });

  // GET /api/capsules
  router.get('/capsules', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ capsules: [] });

    const userToday = getLocalDate(user.timezone);
    // 'self' capsules are private to the author. 'partner' (default) capsules
    // are visible to both — the recipient gets the surprise + countdown push.
    const capsules = dbOps.getCapsules(userId, user.partner_id)
      .filter(c => c.visibility !== 'self' || c.user_id === userId)
      .map(c => ({
        id: c.id,
        author: c.user_id === userId ? 'me' : 'partner',
        content: c.opened_at ? c.content : null,
        unlock_date: c.unlock_date,
        is_unlockable: c.unlock_date <= userToday && !c.opened_at,
        opened_at: c.opened_at,
        visibility: c.visibility,
        created_at: c.created_at,
      }));

    res.json({ capsules });
  });

  // POST /api/capsules/:id/open
  router.post('/capsules/:id/open', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const capsules = user.partner_id ? dbOps.getCapsules(userId, user.partner_id) : [];
    const capsule = capsules.find(c => c.id === id);
    if (!capsule) return res.status(404).json({ error: 'Capsule not found' });

    // 'self' capsules are private to the author. Returning 404 (not 403)
    // keeps the existence of the capsule itself secret from the partner —
    // they can't tell whether `id` is wrong or just owned by the author.
    if (capsule.visibility === 'self' && capsule.user_id !== userId) {
      return res.status(404).json({ error: 'Capsule not found' });
    }

    const userToday = getLocalDate(user.timezone);
    if (capsule.unlock_date > userToday) {
      return res.status(400).json({ error: 'Capsule is not yet unlockable' });
    }

    if (capsule.opened_at) {
      return res.json({ success: true, content: capsule.content });
    }

    dbOps.openCapsule(id);
    res.json({ success: true, content: capsule.content });
  });

  // GET /api/bucket
  router.get('/bucket', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ items: [], total: 0, completed_count: 0 });

    const items = dbOps.getBucketItems(userId, user.partner_id).map(i => ({
      ...i,
      created_by: i.user_id === userId ? 'me' : 'partner',
    }));
    const completedCount = items.filter(i => i.completed).length;

    res.json({ items, total: items.length, completed_count: completedCount });
  });

  // POST /api/bucket
  router.post('/bucket', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { title, category } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (title.length > 100) return res.status(400).json({ error: 'title max 100 characters' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const existingItems = dbOps.getBucketItems(userId, user.partner_id);
    if (existingItems.length >= 100) return res.status(400).json({ error: 'Maximum 100 items' });

    const item = dbOps.createBucketItem(userId, user.partner_id, title.trim(), category || null);

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      await pushFn(partner.device_token, 'bucket_new', user.name);
    }

    res.json({ item });
  });

  // POST /api/bucket/:id/complete
  router.post('/bucket/:id/complete', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    // Verify item belongs to this couple
    const items = dbOps.getBucketItems(userId, user.partner_id);
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const updated = dbOps.completeBucketItem(id, userId);
    if (!updated) return res.status(404).json({ error: 'Item not found' });

    if (user.partner_id) {
      const partner = dbOps.getUser(user.partner_id);
      if (partner?.device_token) {
        await pushFn(partner.device_token, 'bucket_complete', user.name, { title: item.title });
      }
    }

    res.json({ success: true });
  });

  // POST /api/bucket/:id/uncomplete
  router.post('/bucket/:id/uncomplete', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    // Verify item belongs to this couple
    const items = dbOps.getBucketItems(userId, user.partner_id);
    if (!items.some(i => i.id === id)) return res.status(404).json({ error: 'Item not found' });

    const updated = dbOps.uncompleteBucketItem(id);
    if (!updated) return res.status(404).json({ error: 'Item not found' });

    res.json({ success: true });
  });

  // DELETE /api/bucket/:id
  router.delete('/bucket/:id', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseId(req.params.id as string);
    if (id === null) return res.status(400).json({ error: 'Invalid ID' });

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const deleted = dbOps.deleteBucketItem(id, userId, user.partner_id);
    if (!deleted) return res.status(404).json({ error: 'Item not found' });

    res.json({ success: true });
  });

  // POST /api/snaps (multipart upload)
  // Atomic: write to a tmp file, validate, then rename into place. Prevents
  // a re-upload from clobbering today's existing photo before the DB check
  // rejects it.
  const TMP_DIR = path.join(__dirname, '..', 'data', 'snaps_tmp');
  const snapStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(TMP_DIR, { recursive: true });
      cb(null, TMP_DIR);
    },
    filename: (req, _file, cb) => {
      cb(null, `${req.userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.jpg`);
    },
  });
  const snapUpload = multer({
    storage: snapStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only images allowed'));
    },
  });

  router.post('/snaps', snapUpload.single('photo'), async (req: Request, res: Response) => {
    const userId = req.userId!;
    if (!req.file) return res.status(400).json({ error: 'photo is required' });
    const tmpPath = req.file.path;
    const cleanup = () => { try { fs.unlinkSync(tmpPath); } catch {} };

    const user = dbOps.getUser(userId);
    if (!user) { cleanup(); return res.status(404).json({ error: 'User not found' }); }
    if (!user.partner_id) { cleanup(); return res.status(400).json({ error: 'Not paired' }); }

    const snapDate = getLocalDate(user.timezone);
    if (dbOps.getSnap(userId, snapDate)) {
      cleanup();
      return res.status(400).json({ error: 'Already snapped today' });
    }

    const finalDir = path.join(__dirname, '..', 'data', 'snaps', userId);
    fs.mkdirSync(finalDir, { recursive: true });
    const finalPath = path.join(finalDir, `${snapDate}.jpg`);
    try {
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
      cleanup();
      return res.status(500).json({ error: 'Failed to save photo' });
    }

    const photoPath = `${userId}/${snapDate}.jpg`;
    dbOps.saveSnap(userId, snapDate, photoPath);

    // Check if partner also snapped using partner's OWN timezone
    const partner = dbOps.getUser(user.partner_id);
    const partnerSnapDate = getLocalDate(partner?.timezone || 'Asia/Shanghai');
    const partnerSnap = dbOps.getSnap(user.partner_id, partnerSnapDate);
    const bothSnapped = !!partnerSnap;
    if (partner?.device_token) {
      await pushFn(partner.device_token, bothSnapped ? 'snap_both' : 'snap_submitted', user.name);
    }

    res.json({ success: true, both_snapped: bothSnapped, snap_date: snapDate });
  });

  // GET /api/snaps/today
  router.get('/snaps/today', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const today = getLocalDate(user.timezone);
    const mySnap = dbOps.getSnap(userId, today);
    // Use partner's OWN timezone for their snap date
    const partnerTz = user.partner_id ? (dbOps.getUser(user.partner_id)?.timezone || 'Asia/Shanghai') : 'Asia/Shanghai';
    const partnerToday = user.partner_id ? getLocalDate(partnerTz) : today;
    const partnerSnap = user.partner_id ? dbOps.getSnap(user.partner_id, partnerToday) : undefined;

    const bothSnapped = !!mySnap && !!partnerSnap;
    const myReactionToPartner = (bothSnapped && user.partner_id)
      ? dbOps.getDailyReaction(userId, user.partner_id, partnerToday, 'snap')
      : null;
    const partnerReactionToMe = (bothSnapped && user.partner_id)
      ? dbOps.getDailyReaction(user.partner_id, userId, today, 'snap')
      : null;

    res.json({
      snap_date: today,
      my_snapped: !!mySnap,
      partner_snapped: !!partnerSnap,
      my_photo: mySnap?.photo_path ? signImagePath(mySnap.photo_path) : null,
      partner_photo: partnerSnap?.photo_path ? signImagePath(partnerSnap.photo_path) : null,
      my_reaction_to_partner: myReactionToPartner,
      partner_reaction_to_me: partnerReactionToMe,
    });
  });

  // GET /api/snaps
  router.get('/snaps', (req: Request, res: Response) => {
    const userId = req.userId!;
    const month = req.query.month as string;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month parameter required (YYYY-MM)' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ snaps: [] });

    const snaps = dbOps.getSnaps(userId, user.partner_id, month).map(s => ({
      date: s.snap_date,
      my_photo: s.user_photo ? signImagePath(s.user_photo) : null,
      partner_photo: s.partner_photo ? signImagePath(s.partner_photo) : null,
      both_snapped: !!s.user_photo && !!s.partner_photo,
    }));

    res.json({ snaps });
  });

  // POST /api/urge — nudge partner to fill today's question or take today's snap.
  // Only valid when caller has filled their side AND partner hasn't.
  router.post('/urge', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { type } = req.body;

    if (type !== 'question' && type !== 'snap') {
      return res.status(400).json({ error: 'type must be "question" or "snap"' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    if (type === 'question') {
      const today = getLocalDate('Asia/Shanghai');
      const answers = dbOps.getDailyAnswers(today, userId, user.partner_id);
      if (!answers.mine) return res.status(400).json({ error: 'Answer your own first' });
      if (answers.partner) return res.status(400).json({ error: 'Partner already answered' });
    } else {
      const myToday = getLocalDate(user.timezone);
      const partnerTz = dbOps.getUser(user.partner_id)?.timezone || 'Asia/Shanghai';
      const partnerToday = getLocalDate(partnerTz);
      if (!dbOps.getSnap(userId, myToday)) return res.status(400).json({ error: 'Snap your own first' });
      if (dbOps.getSnap(user.partner_id, partnerToday)) return res.status(400).json({ error: 'Partner already snapped' });
    }

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      await pushFn(partner.device_token, type === 'question' ? 'urge_question' : 'urge_snap', user.name);
    }

    res.json({ success: true });
  });

  // POST /api/daily-reaction — 👍/👎 to partner's question answer or snap.
  // Only valid after both have filled their side.
  router.post('/daily-reaction', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { type, reaction } = req.body;

    if (type !== 'question' && type !== 'snap') {
      return res.status(400).json({ error: 'type must be "question" or "snap"' });
    }
    if (reaction !== 'up' && reaction !== 'down') {
      return res.status(400).json({ error: 'reaction must be "up" or "down"' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    let targetDate: string;
    if (type === 'question') {
      const today = getLocalDate('Asia/Shanghai');
      const answers = dbOps.getDailyAnswers(today, userId, user.partner_id);
      if (!answers.mine || !answers.partner) {
        return res.status(400).json({ error: 'Both must answer before reacting' });
      }
      targetDate = today;
    } else {
      const myToday = getLocalDate(user.timezone);
      const partnerTz = dbOps.getUser(user.partner_id)?.timezone || 'Asia/Shanghai';
      const partnerToday = getLocalDate(partnerTz);
      if (!dbOps.getSnap(userId, myToday) || !dbOps.getSnap(user.partner_id, partnerToday)) {
        return res.status(400).json({ error: 'Both must snap before reacting' });
      }
      // Reaction is keyed on the *target's* date (partner's snap date)
      targetDate = partnerToday;
    }

    dbOps.setDailyReaction(userId, user.partner_id, targetDate, type, reaction);

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      const pushType = `react_${type}_${reaction}` as 'react_question_up' | 'react_question_down' | 'react_snap_up' | 'react_snap_down';
      await pushFn(partner.device_token, pushType, user.name);
    }

    res.json({ success: true, reaction });
  });

  // GET /api/ws-ticket
  router.get('/ws-ticket', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ticket = createWsTicket(userId);
    res.json({ ticket, expires_in: 30 });
  });

  // POST /api/logout
  router.post('/logout', (req: Request, res: Response) => {
    const userId = req.userId!;

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clear device token
    dbOps.clearDeviceToken(userId);

    // Revoke all tokens
    dbOps.deleteAllRefreshTokens(userId);
    dbOps.incrementTokenVersion(userId);

    res.json({ success: true });
  });

  return router;
}

// Default export for backward compatibility
import { dbOps } from './db';
import { sendPush } from './push';

const defaultPublicRouter = createPublicRouter(dbOps);
const defaultProtectedRouter = createProtectedRouter(dbOps, sendPush);
const defaultAuthMiddleware = createAuthMiddleware(dbOps);

export {
  defaultPublicRouter,
  defaultProtectedRouter,
  defaultAuthMiddleware,
};

// Combined default router (used by index.ts)
const combined = Router();
combined.use(defaultPublicRouter);
combined.use(defaultAuthMiddleware, defaultProtectedRouter);
export default combined;
