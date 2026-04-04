import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import express from 'express';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { initAPNs } from './push';
import { setupSocket } from './socket';
import { dbOps } from './db';
import { startScheduler } from './scheduler';
import { sendPush } from './push';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

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

// Static files for snap uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'snaps')));

// Routes (includes both public and protected, with auth middleware)
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize APNs, WebSocket, and Scheduler
initAPNs();
startScheduler(dbOps, sendPush);

const httpServer = createServer(app);
setupSocket(httpServer, dbOps);

const HOST = process.env.HOST || '127.0.0.1';

httpServer.listen(PORT, HOST, () => {
  console.log(`[Server] Couple Buzz running on ${HOST}:${PORT}`);
});
