import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DbOps } from './db';
import { QUESTIONS } from './questions';
import { CHALLENGES } from './challenges';
import { computeProgress } from './challengeVerifier';
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
} from './auth';

// Timezone helpers
function getLocalDate(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

function getLocalHour(timezone: string): number {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }));
  return h === 24 ? 0 : h; // Some ICU versions return 24 for midnight
}

function getYesterdayDate(todayStr: string): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Mailbox helpers
function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getRevealTime(weekMonday: string): Date {
  // Reveal: Sunday 14:00 UTC (= Monday + 6 days + 14 hours)
  const d = new Date(weekMonday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(14, 0, 0, 0);
  return d;
}

export type SendPushFn = (
  deviceToken: string,
  actionType: string,
  senderName: string
) => Promise<boolean>;

// Generate a random 4-digit pair code
export function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
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
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'password is required (min 4 chars)' });
    }

    let userId = generateUserId();
    while (dbOps.getUser(userId)) {
      userId = generateUserId();
    }

    const passwordHash = hashPassword(password);
    const pairCode = userId; // ID itself is the connection code

    dbOps.createUser(userId, name.trim(), passwordHash, pairCode, timezone || 'Asia/Shanghai');

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

    const newName = (name && typeof name === 'string' && name.trim()) ? name.trim() : user.name;
    const newTimezone = (timezone && typeof timezone === 'string') ? timezone : user.timezone;
    const newPartnerTz = (partner_timezone && typeof partner_timezone === 'string') ? partner_timezone : user.partner_timezone;
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

    dbOps.pairUsers(userId, partner.id);

    res.json({ success: true, partner_name: partner.name });
  });

  // POST /api/action
  router.post('/action', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { action_type, timezone } = req.body;

    if (!action_type || typeof action_type !== 'string') {
      return res.status(400).json({ error: 'action_type is required' });
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
      await pushFn(partner.device_token, action_type, user.name);
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
      await pushFn(partner.device_token, 'reaction', user.name);
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

    // Compute pinned date countdown (only pinned date shows on homepage)
    const today = new Date().toISOString().slice(0, 10);
    let pinned: { title: string; date: string; days_away: number } | null = null;

    const pinnedDate = dates.find(d => d.pinned);
    if (pinnedDate) {
      let targetDate = pinnedDate.date;
      if (pinnedDate.recurring) {
        const thisYear = new Date().getFullYear();
        const mmdd = pinnedDate.date.slice(5);
        targetDate = `${thisYear}-${mmdd}`;
        if (targetDate < today) {
          targetDate = `${thisYear + 1}-${mmdd}`;
        }
      }
      const daysAway = Math.max(0, Math.ceil((new Date(targetDate).getTime() - new Date(today).getTime()) / 86400000));
      pinned = { title: pinnedDate.title, date: targetDate, days_away: daysAway };
    }

    res.json({ dates, pinned });
  });

  // POST /api/dates
  router.post('/dates', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { title, date, recurring } = req.body;

    if (!title || typeof title !== 'string' || !date || typeof date !== 'string') {
      return res.status(400).json({ error: 'title and date are required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const created = dbOps.createImportantDate(userId, user.partner_id, title.trim(), date, !!recurring);
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

    if (!title || !date) {
      return res.status(400).json({ error: 'title and date are required' });
    }

    const updated = dbOps.updateImportantDate(id, title.trim(), date, !!recurring);
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

    const today = new Date().toISOString().slice(0, 10);

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

    res.json({
      question,
      question_index: index,
      date: today,
      my_answer: answers.mine?.answer ?? null,
      partner_answer: bothAnswered ? answers.partner!.answer : null,
      both_answered: bothAnswered,
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

    const today = new Date().toISOString().slice(0, 10);

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

  // GET /api/calendar?month=2026-04
  router.get('/calendar', (req: Request, res: Response) => {
    const userId = req.userId!;
    const month = req.query.month as string;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month parameter required (YYYY-MM)' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ days: [] });

    const days = dbOps.getCalendarData(userId, user.partner_id, month);
    res.json({ days });
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

    const weekKey = getCurrentWeekMonday();
    const revealAt = getRevealTime(weekKey);
    const now = new Date();
    const phase = now >= revealAt ? 'revealed' : 'writing';

    const messages = dbOps.getMailboxMessages(weekKey, userId, user.partner_id);

    res.json({
      week_key: weekKey,
      phase,
      my_message: messages.mine?.content ?? null,
      partner_message: phase === 'revealed' ? (messages.partner?.content ?? null) : null,
      partner_wrote: phase === 'revealed' ? !!messages.partner : undefined,
      reveal_at: revealAt.toISOString(),
      can_edit: phase === 'writing',
    });
  });

  // POST /api/mailbox
  router.post('/mailbox', (req: Request, res: Response) => {
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

    const weekKey = getCurrentWeekMonday();
    const revealAt = getRevealTime(weekKey);

    if (new Date() >= revealAt) {
      return res.status(400).json({ error: 'Writing period has ended' });
    }

    dbOps.submitMailboxMessage(userId, weekKey, content.trim());
    res.json({ success: true });
  });

  // GET /api/mailbox/archive
  router.get('/mailbox/archive', (req: Request, res: Response) => {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 10;

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ weeks: [] });

    // Only return weeks whose reveal time has passed
    const allWeeks = dbOps.getMailboxArchive(userId, user.partner_id, Math.min(limit, 50));
    const now = new Date();
    const currentWeekKey = getCurrentWeekMonday();
    const weeks = allWeeks.filter(w => {
      if (w.week_key === currentWeekKey) {
        return now >= getRevealTime(currentWeekKey);
      }
      return true; // Past weeks are always revealed
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
  router.post('/capsules', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { content, unlock_date } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (content.length > 1000) {
      return res.status(400).json({ error: 'content max 1000 characters' });
    }
    if (!unlock_date || typeof unlock_date !== 'string') {
      return res.status(400).json({ error: 'unlock_date is required' });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (unlock_date <= today) {
      return res.status(400).json({ error: 'unlock_date must be in the future' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const capsule = dbOps.createCapsule(userId, user.partner_id, content.trim(), unlock_date);
    res.json({ id: capsule.id, unlock_date: capsule.unlock_date, created_at: capsule.created_at });
  });

  // GET /api/capsules
  router.get('/capsules', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ capsules: [] });

    const today = new Date().toISOString().slice(0, 10);
    const capsules = dbOps.getCapsules(userId, user.partner_id).map(c => ({
      id: c.id,
      author: c.user_id === userId ? 'me' : 'partner',
      content: c.opened_at ? c.content : null,
      unlock_date: c.unlock_date,
      is_unlockable: c.unlock_date <= today && !c.opened_at,
      opened_at: c.opened_at,
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

    const today = new Date().toISOString().slice(0, 10);
    if (capsule.unlock_date > today) {
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

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

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

    const updated = dbOps.completeBucketItem(id, userId);
    if (!updated) return res.status(404).json({ error: 'Item not found' });

    if (user.partner_id) {
      const partner = dbOps.getUser(user.partner_id);
      if (partner?.device_token) {
        await pushFn(partner.device_token, 'bucket_complete', user.name);
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
  const snapStorage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(__dirname, '..', 'data', 'snaps', req.userId!);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, _file, cb) => {
      const user = dbOps.getUser(req.userId!);
      const tz = user?.timezone || 'UTC';
      const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
      cb(null, `${today}.jpg`);
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

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const snapDate = getLocalDate(user.timezone);
    const photoPath = `${userId}/${path.basename(req.file.path)}`;

    const saved = dbOps.saveSnap(userId, snapDate, photoPath);
    if (!saved) return res.status(400).json({ error: 'Already snapped today' });

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

    res.json({
      snap_date: today,
      my_snapped: !!mySnap,
      partner_snapped: !!partnerSnap,
      my_photo: mySnap?.photo_path ? `/uploads/${mySnap.photo_path}` : null,
      partner_photo: partnerSnap?.photo_path ? `/uploads/${partnerSnap.photo_path}` : null,
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
      my_photo: s.user_photo ? `/uploads/${s.user_photo}` : null,
      partner_photo: s.partner_photo ? `/uploads/${s.partner_photo}` : null,
      both_snapped: !!s.user_photo && !!s.partner_photo,
    }));

    res.json({ snaps });
  });

  // GET /api/weekly-challenge
  router.get('/weekly-challenge', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const weekStart = getCurrentWeekMonday();
    let challenge = dbOps.getWeeklyChallenge(userId, user.partner_id, weekStart);

    // Auto-assign if none
    if (!challenge) {
      const recent = dbOps.getRecentChallengeIndexes(userId, user.partner_id, 20);
      const recentSet = new Set(recent);
      const available = CHALLENGES.filter(c => !recentSet.has(c.id));
      const pool = available.length > 0 ? available : CHALLENGES;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      challenge = dbOps.assignWeeklyChallenge(userId, user.partner_id, picked.id, weekStart);
    }

    const def = CHALLENGES.find(c => c.id === challenge!.challenge_index);
    if (!def) return res.status(500).json({ error: 'Challenge definition not found' });

    let progress = 0;
    if (challenge.status === 'completed') {
      progress = def.target;
    } else {
      progress = computeProgress(dbOps, challenge, def);
      // Auto-complete if target reached
      if (progress >= def.target && challenge.status === 'active') {
        dbOps.completeWeeklyChallenge(challenge.id, def.reward_points, userId, user.partner_id, `challenge:${def.id}`);
        challenge = dbOps.getWeeklyChallenge(userId, user.partner_id, weekStart)!;
      }
    }

    const myResponse = dbOps.getChallengeResponse(challenge.id, userId);
    const points = dbOps.getCouplePoints(userId, user.partner_id);

    res.json({
      challenge: def,
      progress: Math.min(progress, def.target),
      target: def.target,
      status: challenge.status,
      week_start: weekStart,
      my_response: myResponse,
      couple_points: points,
    });
  });

  // POST /api/weekly-challenge/response
  router.post('/weekly-challenge/response', async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { response } = req.body;

    if (!response || typeof response !== 'string' || !response.trim()) {
      return res.status(400).json({ error: 'response is required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    const weekStart = getCurrentWeekMonday();
    const challenge = dbOps.getWeeklyChallenge(userId, user.partner_id, weekStart);
    if (!challenge) return res.status(400).json({ error: 'No active challenge' });

    const def = CHALLENGES.find(c => c.id === challenge.challenge_index);
    if (!def || def.type !== 'custom_response') {
      return res.status(400).json({ error: 'This challenge does not accept text responses' });
    }

    dbOps.submitChallengeResponse(challenge.id, userId, response.trim());

    // Check completion (custom_response target is typically 1 meaning one person)
    const progress = computeProgress(dbOps, challenge, def);
    if (progress >= def.target && challenge.status === 'active') {
      dbOps.completeWeeklyChallenge(challenge.id, def.reward_points, userId, user.partner_id, `challenge:${def.id}`);
    }

    const partner = dbOps.getUser(user.partner_id);
    if (partner?.device_token) {
      await pushFn(partner.device_token, 'challenge_response', user.name);
    }

    res.json({ success: true });
  });

  // GET /api/couple-points
  router.get('/couple-points', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ points: 0 });

    const points = dbOps.getCouplePoints(userId, user.partner_id);
    res.json({ points });
  });

  // GET /api/coincidences/stats
  router.get('/coincidences/stats', (req: Request, res: Response) => {
    const userId = req.userId!;
    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.json({ total_count: 0, total_seconds: 0 });

    const stats = dbOps.getCoincidenceStats(userId, user.partner_id);
    res.json(stats);
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
