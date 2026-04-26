import express from 'express';
import request from 'supertest';
import { createDatabase, DbOps } from '../db';
import { createPublicRouter, createProtectedRouter, SendPushFn } from '../routes';
import { createAuthMiddleware } from '../auth';

// Set JWT secret for tests
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';

function createTestApp() {
  const { dbOps } = createDatabase(':memory:');
  const mockPush: SendPushFn = jest.fn().mockResolvedValue(true);

  const app = express();
  app.use(express.json());

  const publicRouter = createPublicRouter(dbOps);
  const protectedRouter = createProtectedRouter(dbOps, mockPush);
  const authMiddleware = createAuthMiddleware(dbOps);

  app.use('/api', publicRouter);
  app.use('/api', authMiddleware, protectedRouter);

  return { app, dbOps, mockPush };
}

// Helper: register a user and return tokens + user data
async function registerUser(app: express.Express, name: string, password = 'test1234') {
  const res = await request(app)
    .post('/api/register')
    .send({ name, password, device_token: 'test-device-token' });
  return res.body as {
    user_id: string;
    access_token: string;
    refresh_token: string;
  };
}

// Helper: register two users and pair them
async function registerPairedUsers(app: express.Express) {
  const alice = await registerUser(app, 'Alice');
  const bob = await registerUser(app, 'Bob');
  await request(app)
    .post('/api/pair')
    .set('Authorization', `Bearer ${alice.access_token}`)
    .send({ partner_id: bob.user_id });
  return { alice, bob };
}

describe('POST /api/register', () => {
  it('should register a user with 6-char ID and return tokens', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Alice', password: 'test1234', device_token: 'token123' });

    expect(res.status).toBe(200);
    expect(res.body.user_id).toHaveLength(6);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  it('should return 400 when name or password is missing', async () => {
    const { app } = createTestApp();
    expect((await request(app).post('/api/register').send({})).status).toBe(400);
    expect((await request(app).post('/api/register').send({ name: 'A' })).status).toBe(400);
    expect((await request(app).post('/api/register').send({ name: 'A', password: '12' })).status).toBe(400);
  });
});

describe('POST /api/login', () => {
  it('should login with correct ID and password', async () => {
    const { app } = createTestApp();
    const user = await registerUser(app, 'Alice', 'mypass123');

    const res = await request(app)
      .post('/api/login')
      .send({ user_id: user.user_id, password: 'mypass123' });

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe(user.user_id);
    expect(res.body.access_token).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const { app } = createTestApp();
    const user = await registerUser(app, 'Alice', 'mypass123');

    const res = await request(app)
      .post('/api/login')
      .send({ user_id: user.user_id, password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('should return partner_name if paired', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/login')
      .send({ user_id: alice.user_id, password: 'test1234' });

    expect(res.body.partner_name).toBe('Bob');
  });
});

describe('POST /api/auth/refresh', () => {
  it('should return new tokens with valid refresh token', async () => {
    const { app } = createTestApp();
    const user = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: user.refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    // New tokens should be different (rotation)
    expect(res.body.refresh_token).not.toBe(user.refresh_token);
  });

  it('should reject invalid refresh token', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'invalid-token' });
    expect(res.status).toBe(401);
  });

  it('should reject already-used refresh token (rotation)', async () => {
    const { app } = createTestApp();
    const user = await registerUser(app, 'Alice');

    // Use the refresh token once
    await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: user.refresh_token });

    // Try to use the same refresh token again
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: user.refresh_token });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/status', () => {
  it('should return not paired for solo user', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.paired).toBe(false);
  });

  it('should return paired with partner name', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.paired).toBe(true);
    expect(res.body.partner_name).toBe('Bob');
    expect(res.body.name).toBe('Alice');
    expect(res.body.timezone).toBeDefined();
  });
});

describe('PUT /api/profile', () => {
  it('should update name and timezone', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ name: 'Alice New', timezone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice New');
    expect(res.body.timezone).toBe('America/New_York');

    // Verify via status
    const statusRes = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(statusRes.body.name).toBe('Alice New');
    expect(statusRes.body.timezone).toBe('America/New_York');
  });

  it('should keep existing values when fields are omitted', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.timezone).toBeDefined();
  });
});

describe('POST /api/pair', () => {
  it('should pair two users by partner ID', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_id: bob.user_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.partner_name).toBe('Bob');
  });

  it('should return 401 without auth', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/pair')
      .send({ partner_id: 'ABCDEF' });
    expect(res.status).toBe(401);
  });

  it('should return 404 for invalid partner ID', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_id: 'ZZZZZZ' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when pairing with yourself', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_id: alice.user_id });
    expect(res.status).toBe(400);
  });

  it('should return 400 when already paired', async () => {
    const { app } = createTestApp();
    const { bob } = await registerPairedUsers(app);
    const charlie = await registerUser(app, 'Charlie');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ partner_id: charlie.user_id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Already paired');
  });

  it('should return 400 when partner is already paired with someone else', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);  // alice paired with bob
    const charlie = await registerUser(app, 'Charlie');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${charlie.access_token}`)
      .send({ partner_id: alice.user_id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Partner is already paired with someone else');
  });
});

describe('Badge / mark-read', () => {
  it('badge increments per unread action and resets after mark-read', async () => {
    const { app, mockPush } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Bob is the latest registrant so he owns the test device token; Alice
    // sends actions and Bob is the receiver whose badge we measure.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/action')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ action_type: 'kiss' });
    }
    const badges = (mockPush as jest.Mock).mock.calls.map(c => c[4]);
    expect(badges).toEqual([1, 2, 3]);

    // Bob reads up to the latest action.
    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${bob.access_token}`);
    const latestId = historyRes.body.actions[0].id;
    const markRes = await request(app)
      .post('/api/mark-read')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ last_id: latestId });
    expect(markRes.status).toBe(200);
    expect(markRes.body.unread).toBe(0);

    // A new action should now ship with badge=1 again.
    (mockPush as jest.Mock).mockClear();
    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'miss' });
    expect((mockPush as jest.Mock).mock.calls[0][4]).toBe(1);
  });

  it('mark-read only advances forward', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'kiss' });

    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${bob.access_token}`);
    const latestId = historyRes.body.actions[0].id;

    await request(app)
      .post('/api/mark-read')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ last_id: latestId });

    // Out-of-order stale request must NOT roll the pointer back.
    const staleRes = await request(app)
      .post('/api/mark-read')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ last_id: 0 });
    expect(staleRes.status).toBe(200);
    expect(staleRes.body.unread).toBe(0);
  });
});

describe('POST /api/action', () => {
  it('should send an action and trigger push', async () => {
    const { app, mockPush } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'kiss' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'kiss', 'Alice', undefined, expect.any(Number));
  });

  it('should return 400 for invalid action_type', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'slap' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when not paired', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'miss' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Not paired yet');
  });
});

describe('GET /api/history', () => {
  it('should return action history for both users', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'miss' });

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'kiss' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(2);
  });

  it('should respect limit parameter', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    for (const type of ['miss', 'kiss', 'poop']) {
      await request(app)
        .post('/api/action')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ action_type: type });
    }

    const res = await request(app)
      .get('/api/history?limit=2')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(2);
  });
});

describe('PUT /api/device-token', () => {
  it('should update device token', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .put('/api/device-token')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ device_token: 'new-token-123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 without device_token', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .put('/api/device-token')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/unpair', () => {
  it('should unpair both users and return new pair code', async () => {
    const { app, mockPush } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/unpair')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.new_pair_code).toHaveLength(4);

    // Partner should receive push notification
    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'unpair', 'Alice');

    // Verify Alice is no longer paired
    const actionRes = await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'miss' });
    expect(actionRes.status).toBe(400);
    expect(actionRes.body.error).toBe('Not paired yet');
  });

  it('should return 400 when not paired', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/unpair')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/status — streak', () => {
  it('should return streak 0 when no actions', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.streak).toBe(0);
  });

  it('should return streak 1 when both users acted today', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'kiss' });
    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'miss' });

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.streak).toBe(1);
  });

  it('should return streak 0 when only one user acted', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'kiss' });

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.streak).toBe(0);
  });
});

describe('Important Dates CRUD', () => {
  it('should create and list dates', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const createRes = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '纪念日', date: '2026-05-01', recurring: true });

    expect(createRes.status).toBe(200);
    expect(createRes.body.date.title).toBe('纪念日');
    expect(createRes.body.date.recurring).toBe(1);

    // Pin the date
    const dateId = createRes.body.date.id;
    await request(app)
      .post(`/api/dates/${dateId}/pin`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    const listRes = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(listRes.body.dates).toHaveLength(1);
    expect(listRes.body.pinned).toBeDefined();
    expect(listRes.body.pinned.title).toBe('纪念日');
  });

  it('should allow partner to see dates created by the other', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '生日', date: '2026-12-25' });

    const res = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${bob.access_token}`);

    expect(res.body.dates).toHaveLength(1);
    expect(res.body.dates[0].title).toBe('生日');
  });

  it('should update a date', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const createRes = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '旧标题', date: '2026-06-01' });

    const id = createRes.body.date.id;

    const updateRes = await request(app)
      .put(`/api/dates/${id}`)
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '新标题', date: '2026-07-01', recurring: true });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
  });

  it('should delete a date', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const createRes = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '删除测试', date: '2026-08-01' });

    const id = createRes.body.date.id;

    const deleteRes = await request(app)
      .delete(`/api/dates/${id}`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(listRes.body.dates).toHaveLength(0);
  });

  it('should return 400 when not paired', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: 'test', date: '2026-01-01' });

    expect(res.status).toBe(400);
  });
});

describe('Daily Question', () => {
  it('should return question with no answers initially', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/daily-question')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.question).toBeDefined();
    expect(res.body.date).toBeDefined();
    expect(res.body.my_answer).toBeNull();
    expect(res.body.partner_answer).toBeNull();
    expect(res.body.both_answered).toBe(false);
  });

  it('should save answer and not reveal partner answer until both answered', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Alice answers
    const answerRes = await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ answer: 'Alice的回答' });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.both_answered).toBe(false);
    expect(answerRes.body.partner_answer).toBeNull();

    // Alice checks — should see her answer but not Bob's
    const checkRes = await request(app)
      .get('/api/daily-question')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(checkRes.body.my_answer).toBe('Alice的回答');
    expect(checkRes.body.partner_answer).toBeNull();
    expect(checkRes.body.both_answered).toBe(false);

    // Bob answers
    const bobRes = await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ answer: 'Bob的回答' });

    expect(bobRes.body.both_answered).toBe(true);
    expect(bobRes.body.partner_answer).toBe('Alice的回答');

    // Now Alice should see both
    const revealRes = await request(app)
      .get('/api/daily-question')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(revealRes.body.both_answered).toBe(true);
    expect(revealRes.body.my_answer).toBe('Alice的回答');
    expect(revealRes.body.partner_answer).toBe('Bob的回答');
  });

  it('should allow updating answer', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ answer: '第一次' });

    await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ answer: '修改后' });

    const res = await request(app)
      .get('/api/daily-question')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.my_answer).toBe('修改后');
  });

  it('should send push notification on answer', async () => {
    const { app, mockPush } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ answer: '测试' });

    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'daily_answer', 'Alice');
  });
});

describe('POST /api/reaction', () => {
  it('should react to partner action', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Bob sends an action
    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'miss' });

    // Get history to find the action id
    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const actionId = historyRes.body.actions[0].id;

    // Alice reacts
    const res = await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'kiss' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reaction_id).toBeDefined();
  });

  it('should include reactions in history response', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'miss' });

    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const actionId = historyRes.body.actions[0].id;

    await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'kiss' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);

    // Reactions should not appear as top-level actions
    expect(res.body.actions).toHaveLength(1);
    // Reactions should be in the reactions map
    expect(res.body.reactions).toBeDefined();
    expect(res.body.reactions[actionId]).toHaveLength(1);
    expect(res.body.reactions[actionId][0].action_type).toBe('kiss');
  });

  it('should not react to own action', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'miss' });

    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const actionId = historyRes.body.actions[0].id;

    const res = await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'kiss' });

    expect(res.status).toBe(400);
  });

  it('should update existing reaction', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'miss' });

    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const actionId = historyRes.body.actions[0].id;

    // React first time
    await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'kiss' });

    // React again (update)
    await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'love' });

    const res = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);

    // Should still be only 1 reaction (updated)
    expect(res.body.reactions[actionId]).toHaveLength(1);
    expect(res.body.reactions[actionId][0].action_type).toBe('love');
  });

  it('should send push notification on reaction', async () => {
    const { app, mockPush } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ action_type: 'miss' });

    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const actionId = historyRes.body.actions[0].id;

    await request(app)
      .post('/api/reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_id: actionId, action_type: 'kiss' });

    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'reaction', 'Alice', undefined, expect.any(Number));
  });
});

describe('Ritual API', () => {
  it('should submit morning ritual', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/ritual')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ ritual_type: 'morning' });

    // May succeed or fail depending on current hour, but should not 500
    expect([200, 400]).toContain(res.status);
  });

  it('should get ritual status', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/ritual/status')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.morning).toBeDefined();
    expect(res.body.evening).toBeDefined();
    expect(res.body.local_hour).toBeDefined();
  });

  it('should reject invalid ritual_type', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/ritual')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ ritual_type: 'noon' });

    expect(res.status).toBe(400);
  });
});

describe('Mailbox API', () => {
  it('should get mailbox status', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.week_key).toBeDefined();
    expect(res.body.phase).toBeDefined();
    expect(res.body.reveal_at).toBeDefined();
  });

  it('should submit mailbox message', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const statusRes = await request(app)
      .get('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`);

    // Only test submission if in writing phase
    if (statusRes.body.phase === 'writing') {
      const res = await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: '我想对你说...' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify it's stored
      const getRes = await request(app)
        .get('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`);
      expect(getRes.body.my_message).toBe('我想对你说...');
    }
  });

  it('should seal mailbox message on first submit and reject re-writes', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const statusRes = await request(app)
      .get('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`);

    if (statusRes.body.phase === 'writing') {
      const first = await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: '第一版' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: '修改版' });
      expect(second.status).toBe(400);

      const getRes = await request(app)
        .get('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`);
      expect(getRes.body.my_message).toBe('第一版');
      expect(getRes.body.can_edit).toBe(false);
    }
  });

  it('should not reveal partner message before reveal time', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const statusRes = await request(app)
      .get('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`);

    if (statusRes.body.phase === 'writing') {
      await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${bob.access_token}`)
        .send({ content: 'Bob的秘密' });

      const getRes = await request(app)
        .get('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`);
      expect(getRes.body.partner_message).toBeNull();
    }
  });

  it('should reject content over 500 chars', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ content: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('should get mailbox archive', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/mailbox/archive')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.weeks).toBeDefined();
  });
});

describe('Weekly Report', () => {
  it('should return weekly report data', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app).post('/api/action').set('Authorization', `Bearer ${alice.access_token}`).send({ action_type: 'kiss' });
    await request(app).post('/api/action').set('Authorization', `Bearer ${bob.access_token}`).send({ action_type: 'miss' });

    const res = await request(app)
      .get('/api/weekly-report')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.temperature).toBeDefined();
    expect(res.body.top_actions).toBeDefined();
  });
});

describe('Time Capsules', () => {
  it('should create a capsule', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ content: '来自过去的信', unlock_date: '2099-12-31' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
  });

  it('should list capsules with hidden content', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ content: '秘密', unlock_date: '2099-12-31' });

    const res = await request(app)
      .get('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.capsules).toHaveLength(1);
    expect(res.body.capsules[0].content).toBeNull(); // Not opened yet
    expect(res.body.capsules[0].is_unlockable).toBe(false);
  });

  it('should reject past unlock_date', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .post('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ content: 'test', unlock_date: '2020-01-01' });

    expect(res.status).toBe(400);
  });
});

describe('Bucket List', () => {
  it('should create and list bucket items', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '一起去日本', category: 'travel' });

    const res = await request(app)
      .get('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('一起去日本');
    expect(res.body.total).toBe(1);
    expect(res.body.completed_count).toBe(0);
  });

  it('should complete and uncomplete items', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const createRes = await request(app)
      .post('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '看电影' });

    const itemId = createRes.body.item.id;

    await request(app)
      .post(`/api/bucket/${itemId}/complete`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    let listRes = await request(app).get('/api/bucket').set('Authorization', `Bearer ${alice.access_token}`);
    expect(listRes.body.completed_count).toBe(1);

    await request(app)
      .post(`/api/bucket/${itemId}/uncomplete`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    listRes = await request(app).get('/api/bucket').set('Authorization', `Bearer ${alice.access_token}`);
    expect(listRes.body.completed_count).toBe(0);
  });

  it('should delete bucket items', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const createRes = await request(app)
      .post('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '删除测试' });

    const res = await request(app)
      .delete(`/api/bucket/${createRes.body.item.id}`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);

    const listRes = await request(app).get('/api/bucket').set('Authorization', `Bearer ${alice.access_token}`);
    expect(listRes.body.items).toHaveLength(0);
  });

  it('should send push on bucket create', async () => {
    const { app, mockPush } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    await request(app)
      .post('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '新心愿' });

    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'bucket_new', 'Alice');
  });

  it('should include item title in bucket_complete push', async () => {
    const { app, mockPush } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const create = await request(app)
      .post('/api/bucket')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '一起去日本' });

    (mockPush as jest.Mock).mockClear();

    await request(app)
      .post(`/api/bucket/${create.body.item.id}/complete`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(mockPush).toHaveBeenCalledWith(
      'test-device-token',
      'bucket_complete',
      'Alice',
      { title: '一起去日本' },
    );
  });
});

describe('Daily Snaps', () => {
  it('should get today snap status', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/snaps/today')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.my_snapped).toBe(false);
    expect(res.body.snap_date).toBeDefined();
  });

  it('should get snaps by month', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const res = await request(app)
      .get('/api/snaps?month=2026-04')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.snaps).toBeDefined();
  });
});

describe('POST /api/logout', () => {
  it('should clear device token and revoke tokens', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/logout')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Old access token should no longer work (token_version incremented)
    const historyRes = await request(app)
      .get('/api/history')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(historyRes.status).toBe(401);

    // Old refresh token should no longer work
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: alice.refresh_token });
    expect(refreshRes.status).toBe(401);
  });
});
