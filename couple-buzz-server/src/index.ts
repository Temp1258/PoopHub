import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { initAPNs } from './push';
import { setupSocket } from './socket';
import { dbOps } from './db';
import { startScheduler } from './scheduler';
import { sendPush } from './push';
import { verifyImageSig } from './auth';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Behind a reverse proxy (nginx / Caddy) — trust the first hop so
// express-rate-limit buckets requests by real client IP instead of 127.0.0.1.
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: ['https://couple-buzz.com', 'https://api.couple-buzz.com:8443'],
}));
app.use(express.json());

// Rate limiting
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations, please try again later' },
});

const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pairing attempts' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});

app.use('/api/register', registerLimiter);
app.use('/api/pair', pairLimiter);
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Snap photos require an HMAC-signed URL (issued by /api/snaps/*) to fetch.
// userId / filename go in the path; expires + sig in the query string.
const SNAPS_DIR = path.join(__dirname, '..', 'data', 'snaps');
app.get('/uploads/:userId/:filename', (req, res) => {
  const { userId, filename } = req.params;
  const { expires, sig } = req.query;

  // Strict shape checks — also blocks path traversal via .. or slashes.
  if (!/^[A-Z0-9]{6}$/.test(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  if (!/^\d{4}-\d{2}-\d{2}\.jpg$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  if (typeof expires !== 'string' || typeof sig !== 'string') {
    return res.status(400).json({ error: 'Missing signature' });
  }

  if (!verifyImageSig(`${userId}/${filename}`, expires, sig)) {
    return res.status(403).json({ error: 'Invalid or expired signature' });
  }

  const filePath = path.join(SNAPS_DIR, userId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  res.sendFile(filePath);
});

// Routes (includes both public and protected, with auth middleware)
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize APNs, WebSocket, and Scheduler.
// dbOps is passed into APNs so stale device tokens get evicted on Unregistered/BadDeviceToken.
initAPNs(dbOps);
startScheduler(dbOps, sendPush);

const httpServer = createServer(app);
setupSocket(httpServer, dbOps, sendPush);

const HOST = process.env.HOST || '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] Couple Buzz running on ${HOST}:${PORT}`);
});
