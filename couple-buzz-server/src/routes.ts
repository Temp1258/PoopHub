import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { dbOps } from './db';
import { sendPush } from './push';

const router = Router();

// Generate a random 4-digit pair code
function generatePairCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /api/register
router.post('/register', (req: Request, res: Response) => {
  const { name, device_token } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  const userId = nanoid(12);
  let pairCode = generatePairCode();

  // Ensure pair code is unique
  while (dbOps.getUserByPairCode(pairCode)) {
    pairCode = generatePairCode();
  }

  dbOps.createUser(userId, name.trim(), pairCode);

  if (device_token) {
    dbOps.setDeviceToken(userId, device_token);
  }

  res.json({ user_id: userId, pair_code: pairCode });
});

// POST /api/pair
router.post('/pair', (req: Request, res: Response) => {
  const { user_id, partner_pair_code } = req.body;

  if (!user_id || !partner_pair_code) {
    return res.status(400).json({ error: 'user_id and partner_pair_code are required' });
  }

  const user = dbOps.getUser(user_id);
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

  if (partner.id === user_id) {
    return res.status(400).json({ error: 'Cannot pair with yourself' });
  }

  dbOps.pairUsers(user_id, partner.id);

  res.json({ success: true, partner_name: partner.name });
});

// POST /api/action
router.post('/action', async (req: Request, res: Response) => {
  const { user_id, action_type } = req.body;

  if (!user_id || !action_type) {
    return res.status(400).json({ error: 'user_id and action_type are required' });
  }

  const validActions = ['miss', 'kiss', 'poop', 'pat'];
  if (!validActions.includes(action_type)) {
    return res.status(400).json({ error: 'Invalid action_type' });
  }

  const user = dbOps.getUser(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.partner_id) {
    return res.status(400).json({ error: 'Not paired yet' });
  }

  // Save action to database
  dbOps.addAction(user_id, action_type);

  // Send push notification to partner
  const partner = dbOps.getUser(user.partner_id);
  if (partner?.device_token) {
    await sendPush(partner.device_token, action_type, user.name);
  }

  res.json({ success: true });
});

// GET /api/history
router.get('/history', (req: Request, res: Response) => {
  const userId = req.query.user_id as string;
  const limit = parseInt(req.query.limit as string) || 50;

  if (!userId) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const user = dbOps.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const actions = dbOps.getHistory(userId, Math.min(limit, 200));
  res.json({ actions });
});

// PUT /api/device-token
router.put('/device-token', (req: Request, res: Response) => {
  const { user_id, device_token } = req.body;

  if (!user_id || !device_token) {
    return res.status(400).json({ error: 'user_id and device_token are required' });
  }

  const user = dbOps.getUser(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  dbOps.setDeviceToken(user_id, device_token);
  res.json({ success: true });
});

export default router;
