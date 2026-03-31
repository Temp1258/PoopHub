import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { DbOps } from './db';
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
    const { name, device_token } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const userId = nanoid(12);
    let pairCode = generatePairCode();

    while (dbOps.getUserByPairCode(pairCode)) {
      pairCode = generatePairCode();
    }

    dbOps.createUser(userId, name.trim(), pairCode);

    if (device_token) {
      dbOps.setDeviceToken(userId, device_token);
    }

    const user = dbOps.getUser(userId)!;
    const tokens = issueTokens(dbOps, userId, user.token_version);

    res.json({ user_id: userId, pair_code: pairCode, ...tokens });
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
    const { action_type } = req.body;

    if (!action_type) {
      return res.status(400).json({ error: 'action_type is required' });
    }

    const validActions = ['miss', 'kiss', 'poop', 'pat'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json({ error: 'Invalid action_type' });
    }

    const user = dbOps.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.partner_id) {
      return res.status(400).json({ error: 'Not paired yet' });
    }

    dbOps.addAction(userId, action_type);

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
