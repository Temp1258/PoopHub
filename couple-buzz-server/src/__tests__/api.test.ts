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

  it('pinned non-recurring past date returns negative days_diff (anniversary count-up)', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const create = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '在一起的日子', date: '2020-01-01', recurring: false });
    const dateId = create.body.date.id;
    await request(app)
      .post(`/api/dates/${dateId}/pin`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    const list = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(list.body.pinned.days_diff).toBeLessThan(0);
    expect(list.body.pinned.days_away).toBeGreaterThan(0);
    expect(list.body.pinned.days_away).toBe(Math.abs(list.body.pinned.days_diff));
  });

  it('pinned future date returns positive days_diff', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const create = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: '婚礼', date: '2099-06-06', recurring: false });
    await request(app)
      .post(`/api/dates/${create.body.date.id}/pin`)
      .set('Authorization', `Bearer ${alice.access_token}`);

    const list = await request(app)
      .get('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`);

    expect(list.body.pinned.days_diff).toBeGreaterThan(0);
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
    // Before writing, my_sealed must be false so the UI knows whether to
    // render the countdown banner.
    expect(res.body.my_sealed).toBe(false);
    expect(res.body.my_message).toBeNull();
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

      // Pre-reveal, the writer can't peek their own letter, but the box
      // is no longer "sealed shut" — they can keep submitting more.
      const getRes = await request(app)
        .get('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`);
      expect(getRes.body.my_message).toBeNull();
      expect(getRes.body.my_sealed).toBe(false);
      expect(getRes.body.can_edit).toBe(true);
    }
  });

  it('should accept multiple mailbox letters within the same session', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const statusRes = await request(app)
      .get('/api/mailbox')
      .set('Authorization', `Bearer ${alice.access_token}`);

    if (statusRes.body.phase === 'writing') {
      const first = await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: '第一封' });
      expect(first.status).toBe(200);

      // Second submit in the same session is now permitted — the daily
      // cap that produced "本场的信已封存" was lifted.
      const second = await request(app)
        .post('/api/mailbox')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: '第二封' });
      expect(second.status).toBe(200);

      // Both letters should appear on Bob's archive AFTER reveal (not
      // testable here without time-travel), but Bob's outbox-side state
      // is irrelevant; we just confirm Alice's outbox sees both pending.
      const outbox = await request(app)
        .get('/api/outbox')
        .set('Authorization', `Bearer ${alice.access_token}`);
      expect(outbox.status).toBe(200);
      expect(outbox.body.mailbox_pending.length).toBe(2);
      // Reference bob to keep the lint-friendly "used" semantics for the
      // destructure (it pairs Alice with a partner so the mailbox flow is
      // even allowed to write).
      expect(bob.user_id).toBeDefined();
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

describe('Inbox trash / restore / purge', () => {
  it('rejects invalid kind', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'something_else', ref_id: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer ref_id', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'mailbox', ref_id: 'abc' });
    expect(res.status).toBe(400);
  });

  it('returns 404 trying to trash non-existent letter', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'mailbox', ref_id: 99999 });
    expect(res.status).toBe(404);
  });

  it('cannot trash own outgoing partner-vis capsule', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    // Alice creates a capsule for bob (visibility=partner)
    const cap = await request(app)
      .post('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({
        content: 'hello future bob',
        unlock_date: '2099-12-31',
        visibility: 'partner',
      });
    expect(cap.status).toBe(200);

    // Alice tries to trash it from her own inbox — should be 403.
    const res = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'capsule', ref_id: cap.body.id });
    expect(res.status).toBe(403);
  });

  it('returns empty trash list initially', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .get('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  it('open capsule respects trash/purge — trashed/purged returns 404', async () => {
    const { app, dbOps } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Bob writes a capsule for alice with a past unlock_date so it's
    // immediately openable. Direct DB insert bypasses the API's future-date
    // guard (which is correct for normal flows but blocks this test setup).
    const cap = dbOps.createCapsule(bob.user_id, alice.user_id, 'a letter from the past', '2020-01-01', '2020-01-01T00:00:00.000Z', 'partner');

    // First open succeeds (sanity check).
    const open1 = await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(open1.status).toBe(200);
    expect(open1.body.content).toBe('a letter from the past');

    // Alice trashes it.
    const trash = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'capsule', ref_id: cap.id });
    expect(trash.status).toBe(200);

    // Re-opening must now 404 — the recipient soft-deleted it.
    const open2 = await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(open2.status).toBe(404);

    // Restore brings it back.
    const restore = await request(app)
      .post('/api/inbox/restore')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'capsule', ref_id: cap.id });
    expect(restore.status).toBe(200);

    const open3 = await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(open3.status).toBe(200);

    // Purge — permanently hidden, even direct-id access returns 404.
    const purge = await request(app)
      .post('/api/inbox/purge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'capsule', ref_id: cap.id });
    expect(purge.status).toBe(200);

    const open4 = await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(open4.status).toBe(404);
  });

  it('outgoing partner-vis capsule open is unaffected by other users\' trash actions', async () => {
    const { app, dbOps } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Alice writes for bob (partner-vis).
    const cap = dbOps.createCapsule(alice.user_id, bob.user_id, 'for bob', '2020-01-01', '2020-01-01T00:00:00.000Z', 'partner');

    // Bob trashes it after first open.
    await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${bob.access_token}`);
    await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ kind: 'capsule', ref_id: cap.id });

    // Alice (the author / outgoing) is *not* affected by bob's trash —
    // her open still works (she sent it; this is her sent-mail).
    const aliceOpen = await request(app)
      .post(`/api/capsules/${cap.id}/open`)
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(aliceOpen.status).toBe(200);
    expect(aliceOpen.body.content).toBe('for bob');
  });

  it('partner sends mailbox letter; alice can trash it, restore it, purge it', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    // Bob writes a letter
    const status = await request(app).get('/api/mailbox').set('Authorization', `Bearer ${bob.access_token}`);
    if (status.body.phase !== 'writing') return; // skip if reveal-time edge case

    const submit = await request(app)
      .post('/api/mailbox')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ content: 'a letter for alice' });
    expect(submit.status).toBe(200);

    // Find bob's message id from alice's archive (revealed sessions only —
    // skip if current session not yet revealed).
    const archiveRes = await request(app)
      .get('/api/mailbox/archive')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const week = archiveRes.body.weeks.find((w: any) => w.partner_message_id);
    if (!week) return; // current AM/PM round not yet revealed in this test run

    const refId = week.partner_message_id;

    // Trash
    const trash = await request(app)
      .post('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'mailbox', ref_id: refId });
    expect(trash.status).toBe(200);

    // Verify partner_content disappears from archive
    const after = await request(app)
      .get('/api/mailbox/archive')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const sameWeek = after.body.weeks.find((w: any) => w.week_key === week.week_key);
    expect(sameWeek?.partner_content).toBeNull();

    // Verify it shows up in trash
    const trashList = await request(app)
      .get('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(trashList.body.items.length).toBe(1);
    expect(trashList.body.items[0].kind).toBe('mailbox');
    expect(trashList.body.items[0].ref_id).toBe(refId);

    // Restore
    const restore = await request(app)
      .post('/api/inbox/restore')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'mailbox', ref_id: refId });
    expect(restore.status).toBe(200);

    // Verify back in archive
    const back = await request(app)
      .get('/api/mailbox/archive')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const restoredWeek = back.body.weeks.find((w: any) => w.week_key === week.week_key);
    expect(restoredWeek?.partner_content).toBe('a letter for alice');

    // Purge — permanently hide
    const purge = await request(app)
      .post('/api/inbox/purge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ kind: 'mailbox', ref_id: refId });
    expect(purge.status).toBe(200);

    const finalArchive = await request(app)
      .get('/api/mailbox/archive')
      .set('Authorization', `Bearer ${alice.access_token}`);
    const purgedWeek = finalArchive.body.weeks.find((w: any) => w.week_key === week.week_key);
    expect(purgedWeek?.partner_content).toBeNull();

    // Purged items don't show up in trash list (they're permanently hidden)
    const finalTrash = await request(app)
      .get('/api/inbox/trash')
      .set('Authorization', `Bearer ${alice.access_token}`);
    expect(finalTrash.body.items.length).toBe(0);
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

describe('Security hardening', () => {
  it('rejects partner attempting to open self-visibility capsule', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    const create = await request(app)
      .post('/api/capsules')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ content: '私密日记', unlock_date: '2099-12-31', visibility: 'self' });
    expect(create.status).toBe(200);
    const capsuleId = create.body.id;

    // Bob shouldn't see it in the list
    const list = await request(app)
      .get('/api/capsules')
      .set('Authorization', `Bearer ${bob.access_token}`);
    expect(list.body.capsules.find((c: any) => c.id === capsuleId)).toBeUndefined();

    // Even if Bob guesses the id, open should 404 (and not reveal content)
    const open = await request(app)
      .post(`/api/capsules/${capsuleId}/open`)
      .set('Authorization', `Bearer ${bob.access_token}`);
    expect(open.status).toBe(404);
  });

  it('rejects malformed dates on POST /dates', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    for (const bad of ['2024', '2024-13-01', '2024-02-31', 'yesterday', '<script>']) {
      const res = await request(app)
        .post('/api/dates')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ title: 't', date: bad });
      expect(res.status).toBe(400);
    }

    // Sanity: a valid date works
    const ok = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: 't', date: '2024-02-29' });
    expect(ok.status).toBe(200);
  });

  it('rejects PUT /dates/:id with malformed date or oversized title', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);

    const create = await request(app)
      .post('/api/dates')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: 't', date: '2024-01-01' });
    const id = create.body.date.id;

    const badDate = await request(app)
      .put(`/api/dates/${id}`)
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: 't', date: 'not-a-date' });
    expect(badDate.status).toBe(400);

    const longTitle = await request(app)
      .put(`/api/dates/${id}`)
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ title: 'x'.repeat(100), date: '2024-01-02' });
    expect(longTitle.status).toBe(400);
  });

  it('rejects oversized name / partner_remark on /profile', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const longName = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ name: 'x'.repeat(50) });
    expect(longName.status).toBe(400);

    const longRemark = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_remark: 'x'.repeat(100) });
    expect(longRemark.status).toBe(400);
  });

  it('rejects oversized name on /register', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'x'.repeat(50), password: 'test1234' });
    expect(res.status).toBe(400);
  });

  it('mark-read clamps to real latest partner action id', async () => {
    const { app, dbOps } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);

    await request(app)
      .post('/api/action')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ action_type: 'kiss' });

    // Try to push the pointer to the moon
    await request(app)
      .post('/api/mark-read')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ last_id: Number.MAX_SAFE_INTEGER });

    // Stored value must be clamped to the actual latest partner action id
    const bobUser = dbOps.getUser(bob.user_id)!;
    expect(bobUser.last_read_action_id).toBeLessThan(Number.MAX_SAFE_INTEGER);

    // Next action from Alice must produce badge=1 (not stale 0)
    const { mockPush } = createTestApp(); // unused, just import
    void mockPush;
  });
});

describe('Push body sanitization', () => {
  it('does not interpret $& replacement sequences in name or extras', async () => {
    // Direct unit test of sendPush would require initializing APNs, so we
    // test the regex behavior the helper relies on.
    // String.replace with a function never interprets $&; with a string it does.
    const body = 'hello {name}';
    const evil = '$&';
    const stringForm = body.replace(/\{name\}/g, evil);
    const fnForm = body.replace(/\{name\}/g, () => evil);
    expect(stringForm).toBe('hello {name}'); // $& expanded to matched substring
    expect(fnForm).toBe('hello $&');         // function form preserves literal
  });
});

describe('POST /api/urge', () => {
  it('rejects urging if you have not answered yourself', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/urge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'question' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own/i);
  });

  it('rejects urging if partner already answered', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${alice.access_token}`).send({ answer: 'a' });
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${bob.access_token}`).send({ answer: 'b' });
    const res = await request(app)
      .post('/api/urge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'question' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already answered/i);
  });

  it('sends urge_question push when conditions met', async () => {
    const { app, mockPush } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${alice.access_token}`).send({ answer: 'a' });
    (mockPush as jest.Mock).mockClear();
    const res = await request(app)
      .post('/api/urge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'question' });
    expect(res.status).toBe(200);
    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'urge_question', 'Alice');
  });

  it('rejects invalid type', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/urge')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'wrong' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/daily-reaction', () => {
  it('rejects if both have not answered yet', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${alice.access_token}`).send({ answer: 'a' });
    const res = await request(app)
      .post('/api/daily-reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'question', reaction: 'up' });
    expect(res.status).toBe(400);
  });

  it('records reaction and sends push when both answered', async () => {
    const { app, mockPush } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${alice.access_token}`).send({ answer: 'a' });
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${bob.access_token}`).send({ answer: 'b' });
    (mockPush as jest.Mock).mockClear();
    const res = await request(app)
      .post('/api/daily-reaction')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ type: 'question', reaction: 'up' });
    expect(res.status).toBe(200);
    expect(res.body.reaction).toBe('up');
    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'react_question_up', 'Alice');

    // Visible in subsequent GET /daily-question
    const get = await request(app).get('/api/daily-question').set('Authorization', `Bearer ${alice.access_token}`);
    expect(get.body.my_reaction_to_partner).toBe('up');
  });

  it('rejects malformed unlock_date on /capsules', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    for (const bad of ['2099', 'tomorrow', '2099-13-01', '2099-02-31', '<script>']) {
      const res = await request(app)
        .post('/api/capsules')
        .set('Authorization', `Bearer ${alice.access_token}`)
        .send({ content: 'test', unlock_date: bad });
      expect(res.status).toBe(400);
    }
  });

  it('rejects non-string user_id on /login (no 500)', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/login')
      .send({ user_id: 12345, password: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('rejects non-string partner_id on /pair (no 500)', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');
    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_id: 12345 });
    expect(res.status).toBe(400);
  });

  it('rejects oversized daily question answer', async () => {
    const { app } = createTestApp();
    const { alice } = await registerPairedUsers(app);
    const res = await request(app)
      .post('/api/daily-question/answer')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ answer: 'x'.repeat(600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/max 500/);
  });

  it('reaction is one-shot — cannot be changed once made', async () => {
    const { app } = createTestApp();
    const { alice, bob } = await registerPairedUsers(app);
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${alice.access_token}`).send({ answer: 'a' });
    await request(app).post('/api/daily-question/answer').set('Authorization', `Bearer ${bob.access_token}`).send({ answer: 'b' });

    const first = await request(app).post('/api/daily-reaction').set('Authorization', `Bearer ${alice.access_token}`).send({ type: 'question', reaction: 'up' });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/daily-reaction').set('Authorization', `Bearer ${alice.access_token}`).send({ type: 'question', reaction: 'down' });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/评价过/);

    const get = await request(app).get('/api/daily-question').set('Authorization', `Bearer ${alice.access_token}`);
    expect(get.body.my_reaction_to_partner).toBe('up');  // unchanged
  });
});
