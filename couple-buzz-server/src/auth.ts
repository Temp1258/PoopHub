import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto, { randomInt } from 'crypto';
import { DbOps } from './db';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface JwtPayload {
  sub: string;
  tv: number;
  iat: number;
  exp: number;
}

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Set a strong random value in .env before starting the server.'
  );
}
const JWT_SECRET: string = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 90;

export function generateAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tv: tokenVersion }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function getRefreshTokenExpiresAt(): string {
  const date = new Date();
  date.setDate(date.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return date.toISOString();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  // Timing-safe to defeat byte-by-byte hash recovery via response-time analysis.
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateUserId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  // CSPRNG instead of Math.random — IDs double as pair codes.
  for (let i = 0; i < 6; i++) {
    id += chars[randomInt(chars.length)];
  }
  return id;
}

// Image URLs use HMAC-signed query params instead of an Authorization header,
// because <Image source={{ uri }}> in React Native doesn't carry headers by
// default. Only callers who already passed `/api/snaps/*` auth get the URL,
// and the signature expires in an hour. Path traversal is blocked at the
// route handler.
const IMAGE_URL_TTL_MS = 60 * 60 * 1000;

export function signImagePath(photoPath: string): string {
  const expires = Date.now() + IMAGE_URL_TTL_MS;
  const payload = `${photoPath}/${expires}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `/uploads/${photoPath}?expires=${expires}&sig=${sig}`;
}

export function verifyImageSig(photoPath: string, expires: string, sig: string): boolean {
  const expiresNum = Number(expires);
  if (!Number.isFinite(expiresNum) || Date.now() > expiresNum) return false;
  const payload = `${photoPath}/${expiresNum}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  const actual = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuf);
}

export function createAuthMiddleware(dbOps: DbOps) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const user = dbOps.getUser(payload.sub);

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check token version matches — allows instant revocation
      if (user.token_version !== payload.tv) {
        return res.status(401).json({ error: 'Token revoked' });
      }

      req.userId = payload.sub;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}
