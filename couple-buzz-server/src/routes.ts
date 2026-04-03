import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { DbOps } from './db';
import { QUESTIONS } from './questions';
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiresAt,
  createAuthMiddleware,
} from './auth';

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

function issueTokens(dbOps: DbOps, userId: string, tokenVersion: number) {
  const accessToken = generateAccessToken(userId, tokenVersion);
  const refreshToken = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiresAt();

  dbOps.insertRefreshToken(userId, hashToken(refreshToken), expiresAt);

  return { access_token: accessToken, refresh_token: refreshToken };
}

export function createPublicRouter(dbOps: DbOps): Router {
  const router = Router();

  // POST /api/register — public, no auth required
  router.post('/register', (req: Request, res: Response) => {
    const { name, device_token, timezone } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const userId = nanoid(12);
    let pairCode = generatePairCode();

    while (dbOps.getUserByPairCode(pairCode)) {
      pairCode = generatePairCode();
    }

    dbOps.createUser(userId, name.trim(), pairCode, timezone || 'Asia/Shanghai');

    if (device_token) {
      dbOps.setDeviceToken(userId, device_token);
    }

    // Auto-pair with existing unpaired user
    let partnerName: string | null = null;
    const existingUser = dbOps.getUnpairedUser(userId);
    if (existingUser) {
      dbOps.pairUsers(userId, existingUser.id);
      partnerName = existingUser.name;
    }

    const user = dbOps.getUser(userId)!;
    const tokens = issueTokens(dbOps, userId, user.token_version);

    res.json({ user_id: userId, pair_code: pairCode, partner_name: partnerName, ...tokens });
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

  // POST /api/pair
  router.post('/pair', (req: Request, res: Response) => {
    const userId = req.userId!;
    const { partner_pair_code } = req.body;

    if (!partner_pair_code) {
      return res.status(400).json({ error: 'partner_pair_code is required' });
    }

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.partner_id) {
      return res.status(400).json({ error: 'Already paired' });
    }

    const partner = dbOps.getUserByPairCode(partner_pair_code.toUpperCase());
    if (!partner) {
      return res.status(404).json({ error: 'Invalid pair code' });
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

  // GET /api/history
  router.get('/history', (req: Request, res: Response) => {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 50;

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const actions = dbOps.getHistory(userId, Math.min(limit, 200));
    res.json({ actions });
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
    const id = parseInt(req.params.id as string);
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
    const id = parseInt(req.params.id as string);

    const user = dbOps.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.partner_id) return res.status(400).json({ error: 'Not paired' });

    dbOps.pinImportantDate(id, userId, user.partner_id);
    res.json({ success: true });
  });

  // DELETE /api/dates/:id
  router.delete('/dates/:id', (req: Request, res: Response) => {
    const userId = req.userId!;
    const id = parseInt(req.params.id as string);

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
