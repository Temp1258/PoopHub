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
    expect(mockPush).toHaveBeenCalledWith('test-device-token', 'kiss', 'Alice');
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
