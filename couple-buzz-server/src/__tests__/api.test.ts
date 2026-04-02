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
async function registerUser(app: express.Express, name: string) {
  const res = await request(app)
    .post('/api/register')
    .send({ name, device_token: 'test-device-token' });
  return res.body as {
    user_id: string;
    pair_code: string;
    partner_name: string | null;
    access_token: string;
    refresh_token: string;
  };
}

describe('POST /api/register', () => {
  it('should register a user and return tokens', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Alice', device_token: 'token123' });

    expect(res.status).toBe(200);
    expect(res.body.user_id).toBeDefined();
    expect(res.body.pair_code).toHaveLength(4);
    expect(res.body.partner_name).toBeNull();
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  it('should return 400 when name is missing', async () => {
    const { app } = createTestApp();
    const res = await request(app).post('/api/register').send({});
    expect(res.status).toBe(400);
  });

  it('should work without device_token', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/register')
      .send({ name: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBeDefined();
  });

  it('should auto-pair with existing unpaired user', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');
    expect(alice.partner_name).toBeNull();

    const bob = await registerUser(app, 'Bob');
    expect(bob.partner_name).toBe('Alice');
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
    const alice = await registerUser(app, 'Alice');
    await registerUser(app, 'Bob'); // auto-pairs with Alice

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
  it('should pair two unpaired users manually', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');
    await registerUser(app, 'Bob'); // auto-pairs with Alice
    const charlie = await registerUser(app, 'Charlie'); // unpaired

    // Unpair Alice and Bob first
    await request(app)
      .post('/api/unpair')
      .set('Authorization', `Bearer ${alice.access_token}`);

    // Now manually pair Alice with Charlie
    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_pair_code: charlie.pair_code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.partner_name).toBe('Charlie');
  });

  it('should return 401 without auth', async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post('/api/pair')
      .send({ partner_pair_code: 'ABCD' });
    expect(res.status).toBe(401);
  });

  it('should return 404 for invalid pair code', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_pair_code: 'ZZZZ' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when pairing with yourself', async () => {
    const { app } = createTestApp();
    const alice = await registerUser(app, 'Alice');

    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${alice.access_token}`)
      .send({ partner_pair_code: alice.pair_code });
    expect(res.status).toBe(400);
  });

  it('should return 400 when already paired', async () => {
    const { app } = createTestApp();
    await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob'); // auto-paired with Alice
    const charlie = await registerUser(app, 'Charlie'); // unpaired

    // Bob is already paired with Alice, try to pair with Charlie
    const res = await request(app)
      .post('/api/pair')
      .set('Authorization', `Bearer ${bob.access_token}`)
      .send({ partner_pair_code: charlie.pair_code });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Already paired');
  });
});

describe('POST /api/action', () => {
  it('should send an action and trigger push', async () => {
    const { app, mockPush } = createTestApp();
    const alice = await registerUser(app, 'Alice');
    await registerUser(app, 'Bob'); // auto-paired

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
    const alice = await registerUser(app, 'Alice');
    const bob = await registerUser(app, 'Bob'); // auto-paired

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
    const alice = await registerUser(app, 'Alice');
    await registerUser(app, 'Bob'); // auto-paired

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
    const alice = await registerUser(app, 'Alice');
    await registerUser(app, 'Bob'); // auto-paired

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
