import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import routes from './routes';
import { initAPNs } from './push';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Optional API key authentication
const API_KEY = process.env.API_KEY;
if (API_KEY) {
  app.use('/api', (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
}

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize APNs and start server
initAPNs();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Couple Buzz running on port ${PORT}`);
});
